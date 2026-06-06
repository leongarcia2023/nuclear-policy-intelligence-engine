import { describe, it, expect } from "vitest";
import { loadEvalGold } from "./gold";
import { evaluate } from "./metrics";

describe("eval harness — correctness (not formatting)", () => {
  it("loads the gold set (anchors + hand-authored extras) with indirect & negative samples", () => {
    const cases = loadEvalGold();
    expect(cases.length).toBeGreaterThanOrEqual(12);
    const indirect = cases.filter((c) => c.labels.relevant && c.labels.is_indirect);
    const negatives = cases.filter((c) => !c.labels.relevant);
    expect(indirect.length).toBeGreaterThanOrEqual(5);
    expect(negatives.length).toBeGreaterThanOrEqual(4);
  });

  it("clears the recall-on-indirect floor (>= 0.80) — the product's reason to exist", async () => {
    const m = await evaluate(loadEvalGold());
    expect(m.recall_on_indirect).toBeGreaterThanOrEqual(0.8);
  });

  it("keeps the false-positive rate on negative controls low", async () => {
    const m = await evaluate(loadEvalGold());
    expect(m.false_positive_rate).toBeLessThanOrEqual(0.2);
  });

  it("catches the two hardest anchors: OH indirect-include and NY nuclear-medicine reject", async () => {
    const cases = loadEvalGold();
    const m = await evaluate(cases);
    // No indirect misses means OH HB 1180 was caught; no false positive means
    // NY SB 88 (nuclear medicine) was rejected.
    expect(m.misses.some((x) => x.includes("INDIRECT MISS"))).toBe(false);
    expect(m.misses.some((x) => x.includes("FALSE POSITIVE"))).toBe(false);
  });

  it("relevance precision/recall are strong on the gold set", async () => {
    const m = await evaluate(loadEvalGold());
    expect(m.relevance.recall).toBeGreaterThanOrEqual(0.8);
    expect(m.relevance.precision).toBeGreaterThanOrEqual(0.8);
  });
});
