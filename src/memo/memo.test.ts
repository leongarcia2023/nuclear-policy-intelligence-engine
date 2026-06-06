import { describe, it, expect } from "vitest";
import { openDb } from "../db";
import { ingest } from "../ingest/ingest";
import { loadGoldSeed } from "../ingest/fixtures";
import { DeterministicProvider } from "../classify/providers/deterministic";
import { scoreBill } from "../score/score";
import { generateMemo } from "./generate";
import { getOrCreateMemo } from "./store";
import { weeklyDigest } from "./digest";
import { Memo } from "./schema";

const provider = new DeterministicProvider();

async function memoFor(id: string) {
  const c = loadGoldSeed().find((g) => g.bill.id === id)!;
  const classification = await provider.classify(c.bill);
  const score = scoreBill({ bill: c.bill, classification });
  return generateMemo(c.bill, classification, score);
}

describe("memo generation", () => {
  it("produces a complete, position-ready memo with citations", async () => {
    const m = await memoFor("TX:SB 412");
    expect(() => Memo.parse(m)).not.toThrow();
    expect(m.position).toBe("support");
    expect(m.why_it_matters.length).toBeGreaterThan(0);
    expect(m.recommended_action.length).toBeGreaterThan(0);
    expect(m.citations.length).toBeGreaterThan(0); // cites bill sections
  });

  it("the adversarial CA bill gets an oppose memo that names the trap", async () => {
    const m = await memoFor("CA:AB 905");
    expect(m.position).toBe("oppose");
    expect(m.why_it_matters.toLowerCase()).toContain("definition");
    expect(m.citations.length).toBeGreaterThan(0);
  });

  it("the PA co-location bill gets an amend memo", async () => {
    const m = await memoFor("PA:SB 77");
    expect(m.position).toBe("amend");
  });

  it("out-of-scope bills get a monitor memo with no overclaim", async () => {
    const m = await memoFor("NY:SB 88");
    expect(m.position).toBe("monitor");
    expect(m.materiality_band).toBe("none");
  });

  it("memo output is stable given a fixed classification", async () => {
    const a = await memoFor("OH:HB 1180");
    const b = await memoFor("OH:HB 1180");
    expect(a).toEqual(b);
  });

  it("caches: a second getOrCreateMemo is a cache hit", async () => {
    const db = openDb(":memory:");
    await ingest(db, { apiKey: undefined });
    const c = loadGoldSeed().find((g) => g.bill.id === "OH:HB 1180")!;
    const classification = await provider.classify(c.bill);
    const score = scoreBill({ bill: c.bill, classification });

    const first = getOrCreateMemo(db, c.bill, classification, score);
    expect(first.cached).toBe(false);
    const second = getOrCreateMemo(db, c.bill, classification, score);
    expect(second.cached).toBe(true);
    expect(second.memo).toEqual(first.memo);
  });

  it("weekly digest returns top-N by materiality, each with a position + why", async () => {
    const db = openDb(":memory:");
    await ingest(db, { apiKey: undefined });
    const digest = await weeklyDigest(db, 3);
    expect(digest.length).toBe(3);
    // sorted descending by aggregate
    expect(digest[0].aggregate).toBeGreaterThanOrEqual(digest[1].aggregate);
    expect(digest[1].aggregate).toBeGreaterThanOrEqual(digest[2].aggregate);
    for (const e of digest) {
      expect(e.memo.position).toBeTruthy();
      expect(e.memo.why_it_matters.length).toBeGreaterThan(0);
    }
    // TX is the highest-materiality bill in the gold set.
    expect(digest[0].memo.bill_id).toBe("TX:SB 412");
  });
});
