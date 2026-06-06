import { describe, it, expect } from "vitest";
import { loadGoldSeed } from "../ingest/fixtures";
import { DeterministicProvider } from "../classify/providers/deterministic";
import { scoreBill } from "./score";
import { WEIGHTS, WEIGHTS_VERSION } from "./weights";

const provider = new DeterministicProvider();

async function scoreGold(id: string, campaignMatchCount = 0) {
  const c = loadGoldSeed().find((g) => g.bill.id === id)!;
  const classification = await provider.classify(c.bill);
  return scoreBill({ bill: c.bill, classification, campaignMatchCount });
}

describe("materiality scoring", () => {
  it("weights match the seed defaults and live in one config", () => {
    expect(WEIGHTS).toEqual({
      passage_likelihood: 0.3,
      economic_magnitude: 0.3,
      breadth: 0.2,
      urgency: 0.2,
    });
    const sum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 6);
  });

  it("every component returns a non-empty rationale", async () => {
    const s = await scoreGold("TX:SB 412");
    for (const k of Object.keys(s.components) as (keyof typeof s.components)[]) {
      expect(s.components[k].rationale.length).toBeGreaterThan(0);
      expect(s.components[k].score).toBeGreaterThanOrEqual(0);
      expect(s.components[k].score).toBeLessThanOrEqual(100);
    }
    expect(s.weights_version).toBe(WEIGHTS_VERSION);
  });

  it("is reproducible given fixed inputs", async () => {
    const a = await scoreGold("OH:HB 1180");
    const b = await scoreGold("OH:HB 1180");
    expect(a).toEqual(b);
  });

  it("the four relevant gold bills land in the 'high' band", async () => {
    for (const id of ["TX:SB 412", "OH:HB 1180", "CA:AB 905", "PA:SB 77"]) {
      const s = await scoreGold(id);
      expect(s.band, `${id} → ${s.aggregate}`).toBe("high");
    }
  });

  it("the two negative-control bills land in 'none' (no nuclear materiality)", async () => {
    for (const id of ["FL:HB 220", "NY:SB 88"]) {
      const s = await scoreGold(id);
      expect(s.band).toBe("none");
    }
  });

  it("cross-state matches raise breadth (Phase 4 feedback)", async () => {
    const solo = await scoreGold("OH:HB 1180", 0);
    const campaign = await scoreGold("OH:HB 1180", 3);
    expect(campaign.components.breadth.score).toBeGreaterThan(
      solo.components.breadth.score,
    );
    expect(campaign.aggregate).toBeGreaterThanOrEqual(solo.aggregate);
  });

  it("the aggregate equals the documented weighted sum", async () => {
    const s = await scoreGold("CA:AB 905");
    const c = s.components;
    const expected =
      c.passage_likelihood.score * WEIGHTS.passage_likelihood +
      c.economic_magnitude.score * WEIGHTS.economic_magnitude +
      c.breadth.score * WEIGHTS.breadth +
      c.urgency.score * WEIGHTS.urgency;
    expect(s.aggregate).toBeCloseTo(Number(expected.toFixed(1)), 5);
  });
});
