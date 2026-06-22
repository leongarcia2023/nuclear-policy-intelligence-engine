import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadTuningGold, loadHeldoutGold } from "./gold";
import { evaluate, type Metrics } from "./metrics";

const BASELINE_PATH = resolve(process.cwd(), "src", "eval", "baseline.json");

/** Absolute floor from PLAN.md — keyed off HELD-OUT recall only. */
const INDIRECT_FLOOR = 0.8;
/** Tolerance for regression checks against the recorded baseline. */
const TOL = 0.001;

const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";
const DIM = "\x1b[2m";

function pct(n: number): string {
  return (n * 100).toFixed(1) + "%";
}

function printTable(title: string, subtitle: string, m: Metrics): void {
  const rows: [string, string][] = [
    ["cases / relevant / indirect / negative", `${m.n} / ${m.n_relevant} / ${m.n_indirect} / ${m.n_negative}`],
    ["relevance precision", pct(m.relevance.precision)],
    ["relevance recall", pct(m.relevance.recall)],
    ["relevance F1", pct(m.relevance.f1)],
    ["recall on INDIRECT", pct(m.recall_on_indirect)],
    ["false-positive rate (neg controls)", pct(m.false_positive_rate)],
    ["vector accuracy (gold-vector recall)", pct(m.vector_accuracy)],
    ["materiality-band agreement", pct(m.band_agreement)],
    ["direction agreement", pct(m.direction_agreement)],
    ["confidence calibration (correct/wrong/gap)", `${m.calibration.mean_conf_correct} / ${m.calibration.mean_conf_wrong} / ${m.calibration.gap}`],
  ];
  const w = Math.max(...rows.map((r) => r[0].length));
  console.log(`\n  ${BOLD}${title}${RESET}`);
  console.log(`  ${DIM}${subtitle}${RESET}\n`);
  for (const [k, v] of rows) console.log(`  ${k.padEnd(w)}  ${v}`);
  if (m.misses.length) {
    console.log(`\n  ${DIM}disagreements:${RESET}`);
    for (const miss of m.misses) console.log(`   · ${miss}`);
  }
}

type Baseline = Pick<
  Metrics,
  "recall_on_indirect" | "false_positive_rate" | "vector_accuracy" | "band_agreement"
> & { relevance_f1: number; n: number; provider: string; scope: "held-out" };

function toBaseline(m: Metrics, provider: string): Baseline {
  return {
    recall_on_indirect: m.recall_on_indirect,
    false_positive_rate: m.false_positive_rate,
    vector_accuracy: m.vector_accuracy,
    band_agreement: m.band_agreement,
    relevance_f1: m.relevance.f1,
    n: m.n,
    provider,
    scope: "held-out",
  };
}

async function main() {
  const provider = process.env.LLM_PROVIDER || "deterministic";
  const tuning = loadTuningGold();
  const heldout = loadHeldoutGold();

  console.log(`\n${BOLD}Nuclear Policy Intel — Eval${RESET}  (provider=${provider})`);

  // 1) TUNING — internal-consistency smoke check. NEVER the gate.
  const tuningMetrics = await evaluate(tuning);
  printTable(
    "TUNING SET — internal-consistency smoke check",
    "Cases written to exercise the ontology regexes. NOT a measure of real recall. Never gates the build.",
    tuningMetrics,
  );

  // 2) HELD-OUT — the only recall that counts.
  if (heldout.length === 0) {
    console.log(`\n  ${BOLD}HELD-OUT RECALL: UNMEASURED${RESET}`);
    console.log(
      `  ${DIM}src/eval/gold.heldout.jsonl is empty. Real recall on real bills is unmeasured —` +
        `\n  no recall number is being claimed. Add cases with \`npm run label\`.${RESET}\n`,
    );
    console.log(`  ${BOLD}✓ Eval ran (no held-out gate to evaluate).${RESET}\n`);
    process.exit(0);
  }

  const heldoutMetrics = await evaluate(heldout);
  printTable(
    "HELD-OUT SET — real LegiScan bills (the only recall that counts)",
    "Hand-labeled blind. src/classify/** must never be tuned to these. This drives the gate + baseline.",
    heldoutMetrics,
  );

  // 3) COMBINED — for reference only.
  const combinedMetrics = await evaluate([...tuning, ...heldout]);
  printTable("COMBINED (reference only)", "Tuning + held-out together. Informational; does not gate.", combinedMetrics);

  // --- GATE: keyed off HELD-OUT only ---
  const failures: string[] = [];

  if (heldoutMetrics.recall_on_indirect < INDIRECT_FLOOR) {
    failures.push(
      `held-out recall-on-indirect ${pct(heldoutMetrics.recall_on_indirect)} < floor ${pct(INDIRECT_FLOOR)}`,
    );
  }

  const updating = process.env.EVAL_UPDATE_BASELINE === "1";
  if (existsSync(BASELINE_PATH) && !updating) {
    const base = JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Baseline;
    if (base.scope !== "held-out") {
      failures.push(
        `baseline ${BASELINE_PATH} is stale (scope=${base.scope}); rebaseline held-out with EVAL_UPDATE_BASELINE=1`,
      );
    } else {
      if (heldoutMetrics.recall_on_indirect < base.recall_on_indirect - TOL)
        failures.push(`held-out recall-on-indirect regressed: ${heldoutMetrics.recall_on_indirect} < baseline ${base.recall_on_indirect}`);
      if (heldoutMetrics.false_positive_rate > base.false_positive_rate + TOL)
        failures.push(`held-out false-positive rate regressed: ${heldoutMetrics.false_positive_rate} > baseline ${base.false_positive_rate}`);
      if (heldoutMetrics.relevance.f1 < base.relevance_f1 - TOL)
        failures.push(`held-out relevance F1 regressed: ${heldoutMetrics.relevance.f1} < baseline ${base.relevance_f1}`);
      if (heldoutMetrics.vector_accuracy < base.vector_accuracy - TOL)
        failures.push(`held-out vector accuracy regressed: ${heldoutMetrics.vector_accuracy} < baseline ${base.vector_accuracy}`);
      console.log(`\n  ${DIM}held-out baseline: ${BASELINE_PATH} (n=${base.n}, provider=${base.provider})${RESET}`);
    }
  } else {
    writeFileSync(BASELINE_PATH, JSON.stringify(toBaseline(heldoutMetrics, provider), null, 2) + "\n");
    console.log(`\n  ${updating ? "Updated" : "Recorded"} held-out baseline → ${BASELINE_PATH}`);
  }

  if (failures.length) {
    console.error(`\n  ${BOLD}✗ EVAL FAILED (held-out floor / regression):${RESET}`);
    for (const f of failures) console.error(`    - ${f}`);
    process.exit(1);
  }
  console.log(`\n  ${BOLD}✓ Eval passed (held-out gate).${RESET}\n`);
}

main().catch((err) => {
  console.error("[eval] failed:", err);
  process.exit(1);
});
