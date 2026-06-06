import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { loadGoldSeed, type GoldCase } from "../ingest/fixtures";

/**
 * The eval gold set = the six authoritative anchors in gold_seed.jsonl PLUS
 * the hand-authored supplementary cases in src/eval/gold.extra.jsonl. The
 * anchors include the two hardest cases (OH indirect-include, NY nuclear-
 * medicine reject); the extras add more indirect includes/excludes and
 * negative controls so recall-on-indirect and the false-positive rate are
 * measured over a meaningful sample.
 *
 * (PLAN.md calls for expanding to 25–40 via real LegiScan pulls. With no
 * LegiScan key the set is hand-labeled fixtures — see STATUS.md Assumptions.)
 */
const ANCHORS = resolve(process.cwd(), "gold_seed.jsonl");
const EXTRA = resolve(process.cwd(), "src", "eval", "gold.extra.jsonl");

export function loadEvalGold(): GoldCase[] {
  const cases = loadGoldSeed(ANCHORS);
  if (existsSync(EXTRA)) cases.push(...loadGoldSeed(EXTRA));
  return cases;
}
