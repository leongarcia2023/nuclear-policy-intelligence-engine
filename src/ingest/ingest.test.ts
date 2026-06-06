import { describe, it, expect } from "vitest";
import { openDb } from "../db";
import { billsNeedingFetch, storedHashes, allBills } from "./repo";
import { ingest } from "./ingest";

describe("delta logic (billsNeedingFetch)", () => {
  const master = [
    { id: "TX:SB 1", change_hash: "aaa" },
    { id: "OH:HB 2", change_hash: "bbb" },
    { id: "PA:SB 3", change_hash: "ccc" },
  ];

  it("fetches everything on a cold store", () => {
    const stored = new Map<string, string>();
    expect(billsNeedingFetch(master, stored)).toEqual([
      "TX:SB 1",
      "OH:HB 2",
      "PA:SB 3",
    ]);
  });

  it("skips bills whose change_hash is unchanged", () => {
    const stored = new Map([
      ["TX:SB 1", "aaa"],
      ["OH:HB 2", "bbb"],
      ["PA:SB 3", "ccc"],
    ]);
    expect(billsNeedingFetch(master, stored)).toEqual([]);
  });

  it("fetches only the bill whose hash moved", () => {
    const stored = new Map([
      ["TX:SB 1", "aaa"],
      ["OH:HB 2", "OLD"], // changed
      ["PA:SB 3", "ccc"],
    ]);
    expect(billsNeedingFetch(master, stored)).toEqual(["OH:HB 2"]);
  });

  it("fetches a brand-new bill not previously stored", () => {
    const stored = new Map([["TX:SB 1", "aaa"]]);
    expect(billsNeedingFetch(master, stored)).toEqual(["OH:HB 2", "PA:SB 3"]);
  });
});

describe("fixture ingestion + second-run delta", () => {
  it("ingests all gold bills on first run, zero on an unchanged second run", async () => {
    const db = openDb(":memory:");

    const first = await ingest(db, { apiKey: undefined });
    expect(first.source).toBe("fixture");
    expect(first.fetched).toBe(first.examined);
    expect(first.examined).toBeGreaterThanOrEqual(6); // the six gold cases
    expect(allBills(db).length).toBe(first.examined);

    // Second run: nothing changed → delta logic fetches nothing.
    const second = await ingest(db, { apiKey: undefined });
    expect(second.fetched).toBe(0);
    expect(second.skipped).toBe(second.examined);

    // The indirect OH bill must be present and carry no "nuclear" keyword.
    const hashes = storedHashes(db);
    expect(hashes.has("OH:HB 1180")).toBe(true);
    const oh = allBills(db).find((b) => b.id === "OH:HB 1180")!;
    expect(oh.full_text.toLowerCase()).not.toContain("nuclear");
  });

  it("re-fetches a bill after its stored hash is invalidated", async () => {
    const db = openDb(":memory:");
    await ingest(db, { apiKey: undefined });
    // Simulate an upstream change by corrupting one stored hash.
    db.prepare(`UPDATE bills SET change_hash = 'STALE' WHERE id = ?`).run(
      "TX:SB 412",
    );
    const rerun = await ingest(db, { apiKey: undefined });
    expect(rerun.fetched).toBe(1);
  });
});
