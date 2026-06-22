import { loadHeldoutGold, loadAdversarialGold } from "./gold";
import { evaluate, type Metrics } from "./metrics";
import { DeterministicProvider } from "../classify/providers/deterministic";
import { AnthropicProvider } from "../classify/providers/anthropic";
import type { ClassifierProvider } from "../classify/provider";

/**
 * `npm run eval:compare` — run BOTH the deterministic floor and the Anthropic
 * LLM over the held-out AND adversarial buckets, side by side, so the LLM's
 * lift over the deterministic baseline is a single visible delta.
 *
 * Spends real API budget on first run for the Anthropic column (cached after).
 * If ANTHROPIC_API_KEY is absent, the Anthropic column is skipped and only the
 * deterministic floor is shown — the deterministic provider stays the default.
 */

const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";
const DIM = "\x1b[2m";

const pct = (n: number) => (n * 100).toFixed(1) + "%";

type Row = {
  label: string;
  det: string;
  llm: string;
  delta: string;
};

function buildRows(det: Metrics, llm: Metrics | null): Row[] {
  const arrow = (improvement: number) =>
    llm === null
      ? "—"
      : improvement > 0.0005
        ? `▲ +${pct(improvement)}`
        : improvement < -0.0005
          ? `▼ ${pct(improvement)}`
          : "·";
  const intArrow = (better: number) =>
    llm === null ? "—" : better > 0 ? `▲ -${better}` : better < 0 ? `▼ +${-better}` : "·";

  return [
    {
      label: "recall-on-indirect",
      det: pct(det.recall_on_indirect),
      llm: llm ? pct(llm.recall_on_indirect) : "—",
      delta: arrow(llm ? llm.recall_on_indirect - det.recall_on_indirect : 0),
    },
    {
      label: "direction-agreement",
      det: pct(det.direction_agreement),
      llm: llm ? pct(llm.direction_agreement) : "—",
      delta: arrow(llm ? llm.direction_agreement - det.direction_agreement : 0),
    },
    {
      label: "false-positive-rate",
      det: pct(det.false_positive_rate),
      llm: llm ? pct(llm.false_positive_rate) : "—",
      // lower is better → improvement is det - llm
      delta: arrow(llm ? det.false_positive_rate - llm.false_positive_rate : 0),
    },
    {
      label: "confident-wrong-direction",
      det: String(det.confident_wrong_direction),
      llm: llm ? String(llm.confident_wrong_direction) : "—",
      // lower is better → reduction is det - llm
      delta: intArrow(llm ? det.confident_wrong_direction - llm.confident_wrong_direction : 0),
    },
  ];
}

function printBucket(name: string, n: number, det: Metrics, llm: Metrics | null): void {
  console.log(`\n${BOLD}${name}${RESET}  ${DIM}(n=${n})${RESET}\n`);
  const rows = buildRows(det, llm);
  const w = Math.max(...rows.map((r) => r.label.length));
  console.log(`  ${"metric".padEnd(w)}   ${"deterministic".padEnd(13)}  ${"anthropic".padEnd(13)}  lift`);
  console.log(`  ${"-".repeat(w)}   ${"-".repeat(13)}  ${"-".repeat(13)}  ${"-".repeat(10)}`);
  for (const r of rows) {
    console.log(`  ${r.label.padEnd(w)}   ${r.det.padEnd(13)}  ${r.llm.padEnd(13)}  ${r.delta}`);
  }
}

async function runBucket(
  name: string,
  cases: ReturnType<typeof loadAdversarialGold>,
  det: ClassifierProvider,
  llm: ClassifierProvider | null,
): Promise<void> {
  if (cases.length === 0) {
    console.log(`\n${BOLD}${name}${RESET}  ${DIM}(empty — UNMEASURED; add real bills via \`npm run label\`)${RESET}`);
    return;
  }
  const detMetrics = await evaluate(cases, det);
  const llmMetrics = llm ? await evaluate(cases, llm) : null;
  printBucket(name, cases.length, detMetrics, llmMetrics);
}

async function main() {
  const det = new DeterministicProvider();
  const hasKey = !!process.env.ANTHROPIC_API_KEY;
  const llm: ClassifierProvider | null = hasKey ? new AnthropicProvider() : null;

  console.log(`\n${BOLD}Nuclear Policy Intel — Provider Comparison${RESET}`);
  console.log(
    `${DIM}deterministic floor vs. anthropic LLM lift, on the bills that matter.${RESET}`,
  );
  if (!llm) {
    console.log(
      `\n  ${BOLD}Anthropic column skipped${RESET} — set ANTHROPIC_API_KEY (and accept real API spend) to measure the lift.`,
    );
  } else {
    console.log(`${DIM}Anthropic spends real budget on first run (cached after).${RESET}`);
  }

  await runBucket("HELD-OUT (real bills — the only recall that counts)", loadHeldoutGold(), det, llm);
  await runBucket("ADVERSARIAL (evasive phrasing — the regex stress test)", loadAdversarialGold(), det, llm);

  console.log(
    `\n${DIM}Deterministic stays the default provider. The lift column is the case for the LLM backend on real, hard bills.${RESET}\n`,
  );
}

main().catch((err) => {
  console.error("[eval:compare] failed:", err);
  process.exit(1);
});
