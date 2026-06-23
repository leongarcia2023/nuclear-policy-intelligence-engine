import { describe, it, expect } from "vitest";
import type { GoldCase } from "../ingest/fixtures";
import type { ClassifierProvider } from "../classify/provider";
import { Classification } from "../classify/schema";
import { evaluate } from "./metrics";

/** Build a minimal GoldCase with controllable text + gold labels. */
function goldCase(text: string, isIndirectGold: boolean): GoldCase {
  return {
    gold_id: "t",
    bill: {
      id: "XX:1",
      legiscan_id: null,
      state: "XX",
      bill_number: "1",
      title: "Test Act",
      sponsors: [],
      committee: null,
      stage: "introduced",
      last_action: null,
      history: [],
      full_text: text,
      change_hash: "h",
      source: "fixture",
      fetched_at: "2026-01-01T00:00:00.000Z",
    },
    labels: {
      relevant: true,
      is_indirect: isIndirectGold,
      model_bill_risk: false,
      primary_vectors: [],
      direction: "helps",
      expected_position: "support",
      materiality_band: "high",
    },
  };
}

/** A provider that self-reports whatever it's told — to probe the normalization. */
function stubProvider(selfReport: {
  relevant: boolean;
  is_indirect: boolean;
}): ClassifierProvider {
  return {
    name: "stub",
    promptVersion: "stub-v1",
    classify: async () =>
      Classification.parse({
        relevant: selfReport.relevant,
        confidence: 0.9,
        is_indirect: selfReport.is_indirect,
        model_bill_risk: false,
        direction: "helps",
        headline: "stub",
        impact_vectors: [],
        provider: "stub",
        ontology_version: "x",
        prompt_version: "stub-v1",
      }),
  };
}

describe("comparison normalization — is_indirect is recomputed identically (Fix B)", () => {
  it("credits an indirect catch from the relevance call alone, ignoring a FALSE self-report", async () => {
    // Gold-indirect bill, no 'nuclear' keyword. Provider marks it relevant but
    // (dishonestly) says is_indirect=false. With a providerOverride, the metric
    // recomputes is_indirect = relevant && !keyword = true → still caught.
    const cases = [goldCase("An act on firm dispatchable clean resources.", true)];
    const m = await evaluate(cases, stubProvider({ relevant: true, is_indirect: false }));
    expect(m.recall_on_indirect).toBe(1);
  });

  it("gives NO indirect credit on a bill containing a nuclear keyword, despite a TRUE self-report", async () => {
    // Bill mentions 'nuclear reactor' → mechanically NOT indirect. Even though
    // the provider self-flags is_indirect=true, normalization overrides it to
    // false, so the provider earns no self-assigned credit.
    const cases = [goldCase("An act on nuclear reactor siting.", true)];
    const m = await evaluate(cases, stubProvider({ relevant: true, is_indirect: true }));
    expect(m.recall_on_indirect).toBe(0);
  });

  it("an indirect bill marked NOT relevant is a miss (credit requires the relevance call)", async () => {
    const cases = [goldCase("An act on firm dispatchable clean resources.", true)];
    const m = await evaluate(cases, stubProvider({ relevant: false, is_indirect: true }));
    expect(m.recall_on_indirect).toBe(0);
  });
});
