import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { loadGoldSeed, type GoldCase } from "../ingest/fixtures";

/**
 * Two gold sets with sharply different epistemic status.
 *
 * TUNING (gold_seed.jsonl + gold.extra.jsonl): the 16 cases were hand-authored
 * to exercise the ontology regexes in src/classify/ontology.ts. Their metrics
 * are an INTERNAL-CONSISTENCY smoke check — they confirm the rules do what we
 * wrote them to do. They say NOTHING about real-world recall, and they never
 * gate the build. Treating a tuning score as "accuracy" is circular.
 *
 * HELD-OUT (gold.heldout.jsonl): real LegiScan bills, hand-labeled via
 * `npm run label` WITHOUT seeing the classifier's prediction. This file is
 * SACRED — nothing in src/classify/** may ever be edited to make a held-out
 * case pass. This is the only set whose recall means anything. It is empty
 * until bills are labeled, in which case real recall is UNMEASURED.
 */
const ANCHORS = resolve(process.cwd(), "gold_seed.jsonl");
const TUNING_EXTRA = resolve(process.cwd(), "src", "eval", "gold.extra.jsonl");
export const HELDOUT_PATH = resolve(process.cwd(), "src", "eval", "gold.heldout.jsonl");
export const ADVERSARIAL_PATH = resolve(process.cwd(), "src", "eval", "gold.adversarial.jsonl");

/** The 6 anchors + 10 hand-authored extras. Smoke check only — never the gate. */
export function loadTuningGold(): GoldCase[] {
  const cases = loadGoldSeed(ANCHORS);
  if (existsSync(TUNING_EXTRA)) cases.push(...loadGoldSeed(TUNING_EXTRA));
  return cases;
}

/** Real, hand-labeled LegiScan bills. The only recall that counts. Empty => []. */
export function loadHeldoutGold(): GoldCase[] {
  if (!existsSync(HELDOUT_PATH)) return [];
  return loadGoldSeed(HELDOUT_PATH);
}

/**
 * ADVERSARIAL set: the same indirect concepts the README headlines, phrased to
 * evade the current regex tells on purpose. NON-GATING and expected to score
 * LOW — the low number, set against the tuning set's 100%, is the deliverable.
 * Authored, not pulled, but labeled as a real analyst would. Never tune
 * src/classify/** to make these pass.
 */
export function loadAdversarialGold(): GoldCase[] {
  if (!existsSync(ADVERSARIAL_PATH)) return [];
  return loadGoldSeed(ADVERSARIAL_PATH);
}
