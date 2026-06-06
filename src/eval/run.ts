import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEvalGold } from "./gold";
import { evaluate, type Metrics } from "./metrics";

const BASELINE_PATH = resolve(process.cwd(), "src", "eval", "baseline.json");

/** Absolute floor from PLAN.md — recall on indirect bills must not drop below this. */
const INDIRECT_FLOOR = 0.8;
/** Tolerance for regression checks against the recorded baseline. */
const TOL = 0.001;

function pct(n: number): string {
  return (n * 100).toFixed(1) + "%";
}

function printTable(m: Metrics): void {
  const rows: [string, string][] = [
    ["cases / relevant / indirect / negative", `${m.n} / ${m.n_relevant} / ${m.n_indirect} / ${m.n_negative}`],
    ["relevance precision", pct(m.relevance.precision)],
    ["relevance recall", pct(m.relevance.recall)],
    ["relevance F1", pct(m.relevance.f1)],
    ["recall on INDIRECT (gate)", pct(m.recall_on_indirect)],
    ["false-positive rate (neg controls)", pct(m.false_positive_rate)],
    ["vector accuracy (gold-vector recall)", pct(m.vector_accuracy)],
    ["materiality-band agreement", pct(m.band_agreement)],
    ["direction agreement", pct(m.direction_agreement)],
    ["confidence calibration (correct/wrong/gap)", `${m.calibration.mean_conf_correct} / ${m.calibration.mean_conf_wrong} / ${m.calibration.gap}`],
  ];
  const w = Math.max(...rows.map((r) => r[0].length));
  console.log("\n  Nuclear Policy Intel — Eval (correctness)\n");
  for (const [k, v] of rows) console.log(`  ${k.padEnd(w)}  ${v}`);
  if (m.misses.length) {
    console.log("\n  Disagreements:");
    for (const miss of m.misses) console.log(`   · ${miss}`);
  }
  console.log("");
}

type Baseline = Pick<
  Metrics,
  "recall_on_indirect" | "false_positive_rate" | "vector_accuracy" | "band_agreement"
> & { relevance_f1: number; provider: string };

function toBaseline(m: Metrics, provider: string): Baseline {
  return {
    recall_on_indirect: m.recall_on_indirect,
    false_positive_rate: m.false_positive_rate,
    vector_accuracy: m.vector_accuracy,
    band_agreement: m.band_agreement,
    relevance_f1: m.relevance.f1,
    provider,
  };
}

async function main() {
  const provider = process.env.LLM_PROVIDER || "deterministic";
  const cases = loadEvalGold();
  const m = await evaluate(cases);
  printTable(m);

  const failures: string[] = [];

  // 1) Absolute floor (PLAN.md): recall-on-indirect >= 0.80.
  if (m.recall_on_indirect < INDIRECT_FLOOR) {
    failures.push(
      `recall-on-indirect ${pct(m.recall_on_indirect)} < floor ${pct(INDIRECT_FLOOR)}`,
    );
  }

  // 2) Regression gate (CLAUDE.md): compare to the recorded baseline so the free
  //    build passes and a future LLM's lift is measurable.
  const updating = process.env.EVAL_UPDATE_BASELINE === "1";
  if (existsSync(BASELINE_PATH) && !updating) {
    const base = JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Baseline;
    if (m.recall_on_indirect < base.recall_on_indirect - TOL)
      failures.push(
        `recall-on-indirect regressed: ${m.recall_on_indirect} < baseline ${base.recall_on_indirect}`,
      );
    if (m.false_positive_rate > base.false_positive_rate + TOL)
      failures.push(
        `false-positive rate regressed: ${m.false_positive_rate} > baseline ${base.false_positive_rate}`,
      );
    if (m.relevance.f1 < base.relevance_f1 - TOL)
      failures.push(
        `relevance F1 regressed: ${m.relevance.f1} < baseline ${base.relevance_f1}`,
      );
    if (m.vector_accuracy < base.vector_accuracy - TOL)
      failures.push(
        `vector accuracy regressed: ${m.vector_accuracy} < baseline ${base.vector_accuracy}`,
      );
    console.log(`  Baseline: ${BASELINE_PATH} (provider=${base.provider})`);
  } else {
    writeFileSync(BASELINE_PATH, JSON.stringify(toBaseline(m, provider), null, 2) + "\n");
    console.log(`  ${updating ? "Updated" : "Recorded"} baseline → ${BASELINE_PATH}`);
  }

  if (failures.length) {
    console.error("\n  ✗ EVAL FAILED (regression / floor):");
    for (const f of failures) console.error(`    - ${f}`);
    process.exit(1);
  }
  console.log("  ✓ Eval passed.\n");
}

main().catch((err) => {
  console.error("[eval] failed:", err);
  process.exit(1);
});
