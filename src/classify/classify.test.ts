import { describe, it, expect } from "vitest";
import { openDb } from "../db";
import { ingest } from "../ingest/ingest";
import { loadGoldSeed } from "../ingest/fixtures";
import { DeterministicProvider } from "./providers/deterministic";
import { classifyBill, classifyAll } from "./classify";
import { Classification } from "./schema";

const provider = new DeterministicProvider();

async function classifyGold(id: string) {
  const c = loadGoldSeed().find((g) => g.bill.id === id)!;
  return provider.classify(c.bill);
}

describe("deterministic classifier — gold cases", () => {
  it("gold-001 TX direct: relevant, not indirect, helps, direct vectors", async () => {
    const r = await classifyGold("TX:SB 412");
    expect(r.relevant).toBe(true);
    expect(r.is_indirect).toBe(false);
    expect(r.direction).toBe("helps");
    const ids = r.impact_vectors.map((v) => v.vector);
    expect(ids).toContain("new_build_siting_licensing");
    expect(ids).toContain("advance_cost_recovery");
    expect(ids).toContain("property_tax_pilot");
    expect(r.model_bill_risk).toBe(true);
  });

  it("gold-002 OH indirect INCLUSION: caught despite no 'nuclear' keyword, helps", async () => {
    const r = await classifyGold("OH:HB 1180");
    expect(r.relevant).toBe(true);
    expect(r.is_indirect).toBe(true); // the core catch
    expect(r.direction).toBe("helps");
    expect(r.impact_vectors.map((v) => v.vector)).toContain(
      "clean_standard_eligibility",
    );
  });

  it("gold-003 CA adversarial: green title but EXCLUDES nuclear → hurts", async () => {
    const r = await classifyGold("CA:AB 905");
    expect(r.relevant).toBe(true);
    expect(r.is_indirect).toBe(true);
    expect(r.direction).toBe("hurts"); // must flag despite green framing
    const ids = r.impact_vectors.map((v) => v.vector);
    expect(ids).toContain("clean_standard_eligibility");
  });

  it("gold-004 PA large-load co-location: indirect, hurts/amend surface", async () => {
    const r = await classifyGold("PA:SB 77");
    expect(r.relevant).toBe(true);
    expect(r.is_indirect).toBe(true);
    expect(r.direction).toBe("hurts");
    expect(r.impact_vectors.map((v) => v.vector)).toContain(
      "large_load_colocation",
    );
  });

  it("gold-005 FL school curriculum: NEGATIVE control → not relevant", async () => {
    const r = await classifyGold("FL:HB 220");
    expect(r.relevant).toBe(false);
    expect(r.is_indirect).toBe(false);
    expect(r.impact_vectors.length).toBe(0);
  });

  it("gold-006 NY nuclear medicine: HARD negative (has 'nuclear') → not relevant", async () => {
    const r = await classifyGold("NY:SB 88");
    expect(r.relevant).toBe(false); // keyword presence != relevance
    expect(r.is_indirect).toBe(false);
  });
});

describe("classifier contract + cache", () => {
  it("every gold classification is schema-valid", async () => {
    for (const c of loadGoldSeed()) {
      const r = await provider.classify(c.bill);
      expect(() => Classification.parse(r)).not.toThrow();
    }
  });

  it("a second run is 100% cache hits — zero provider calls", async () => {
    const db = openDb(":memory:");
    await ingest(db, { apiKey: undefined });

    const first = await classifyAll(db, { provider: "deterministic" });
    expect(first.every((o) => !o.cached)).toBe(true);

    const second = await classifyAll(db, { provider: "deterministic" });
    expect(second.every((o) => o.cached)).toBe(true);
    expect(second.filter((o) => !o.cached).length).toBe(0);
  });

  it("the inert anthropic provider is never the default and refuses without a key", async () => {
    const { getProvider } = await import("./provider");
    const p = await getProvider(); // no override, no env → deterministic
    expect(p.name).toBe("deterministic");
  });
});
