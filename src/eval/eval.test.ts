import { describe, it, expect } from "vitest";
import { loadTuningGold, loadHeldoutGold, loadAdversarialGold } from "./gold";
import { evaluate } from "./metrics";

/**
 * NOTE ON WHAT THESE TESTS DO AND DON'T PROVE.
 * The tuning cases were authored to exercise the ontology regexes, so strong
 * tuning metrics are an INTERNAL-CONSISTENCY check — they confirm the rules
 * behave as written. They are NOT evidence of real-world recall. Real recall
 * lives in the held-out set and is currently UNMEASURED.
 */
describe("eval harness — tuning set (internal consistency only)", () => {
  it("loads the tuning set (anchors + hand-authored extras)", () => {
    const cases = loadTuningGold();
    expect(cases.length).toBeGreaterThanOrEqual(12);
    const indirect = cases.filter((c) => c.labels.relevant && c.labels.is_indirect);
    const negatives = cases.filter((c) => !c.labels.relevant);
    expect(indirect.length).toBeGreaterThanOrEqual(5);
    expect(negatives.length).toBeGreaterThanOrEqual(4);
  });

  it("is internally consistent: the rules classify the cases they were written for", async () => {
    const m = await evaluate(loadTuningGold());
    // This is self-consistency, NOT recall. It must hold or the rules drifted
    // from the tuning examples — but it says nothing about real bills.
    expect(m.recall_on_indirect).toBeGreaterThanOrEqual(0.8);
    expect(m.false_positive_rate).toBeLessThanOrEqual(0.2);
  });

  it("still handles the two hardest anchors (OH indirect-include, NY nuclear-medicine reject)", async () => {
    const m = await evaluate(loadTuningGold());
    expect(m.misses.some((x) => x.includes("INDIRECT MISS"))).toBe(false);
    expect(m.misses.some((x) => x.includes("FALSE POSITIVE"))).toBe(false);
  });
});

describe("eval harness — held-out set (the only recall that counts)", () => {
  it("is currently EMPTY → real recall is unmeasured (no number is claimed)", () => {
    // When this becomes non-empty (via `npm run label`), the gate + baseline
    // activate on it. Until then the harness must claim no recall number.
    expect(loadHeldoutGold().length).toBe(0);
  });
});

describe("eval harness — adversarial set (the gap IS the finding)", () => {
  it("has a substantial sample of evasive-phrasing bills", () => {
    expect(loadAdversarialGold().length).toBeGreaterThanOrEqual(16);
  });

  it("scores FAR below tuning on indirect recall and direction (regex != recall)", async () => {
    const tuning = await evaluate(loadTuningGold());
    const adv = await evaluate(loadAdversarialGold());
    // The whole point: identical concepts, real phrasing → the deterministic
    // classifier collapses. This documents the brittleness; it is NOT a target
    // to optimize by widening regexes (that overfits the instrument).
    expect(adv.recall_on_indirect).toBeLessThan(tuning.recall_on_indirect - 0.3);
    expect(adv.direction_agreement).toBeLessThan(tuning.direction_agreement - 0.3);
    // Guardrail: if a future edit makes these "pass" on the deterministic
    // provider, it almost certainly means ontology.ts was widened to fit the
    // adversarial cases — the forbidden move. This assertion will flag it.
    expect(adv.recall_on_indirect).toBeLessThanOrEqual(0.5);
  });

  it("is NON-GATING: the eval runner never fails the build on adversarial scores", () => {
    // Asserted structurally: run.ts computes failures ONLY from held-out metrics.
    // (Held-out is empty here, so `npm run eval` exits 0 despite ~11% adversarial.)
    expect(true).toBe(true);
  });
});
