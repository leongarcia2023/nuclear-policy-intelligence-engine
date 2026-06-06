import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../db";
import { ingest } from "../ingest/ingest";
import { buildCorpus } from "./build";
import {
  allRecords,
  applyOverride,
  getRecordByBill,
} from "./corpus";
import { exportCorpus } from "./export";
import { ONTOLOGY_VERSION } from "../classify/ontology";
import { RULES_VERSION } from "../classify/providers/deterministic";
import { CorpusRecord } from "./schema";

async function seededDb() {
  const db = openDb(":memory:");
  await ingest(db, { apiKey: undefined });
  await buildCorpus(db);
  return db;
}

describe("judgment corpus", () => {
  it("persists one versioned record per bill", async () => {
    const db = await seededDb();
    const recs = allRecords(db);
    expect(recs.length).toBe(6);
    for (const r of recs) {
      expect(r.ontology_version).toBe(ONTOLOGY_VERSION);
      expect(r.prompt_version).toBe(RULES_VERSION);
      expect(() => CorpusRecord.parse(r)).not.toThrow();
      // active == model before any override
      expect(r.active_label).toEqual(r.model_label);
      expect(r.override).toBeNull();
    }
  });

  it("derives the gold suggested positions", async () => {
    const db = await seededDb();
    const pos = (id: string) =>
      getRecordByBill(db, id, ONTOLOGY_VERSION, RULES_VERSION)!.active_label
        .suggested_position;
    expect(pos("TX:SB 412")).toBe("support");
    expect(pos("OH:HB 1180")).toBe("support");
    expect(pos("CA:AB 905")).toBe("oppose");
    expect(pos("PA:SB 77")).toBe("amend"); // negotiable lever
    expect(pos("FL:HB 220")).toBe("monitor");
  });

  it("an override updates the active label and retains the prior (history)", async () => {
    const db = await seededDb();
    const rec = getRecordByBill(db, "OH:HB 1180", ONTOLOGY_VERSION, RULES_VERSION)!;
    expect(rec.active_label.suggested_position).toBe("support");

    const updated = applyOverride(db, {
      recordId: rec.record_id,
      correction: { relevant: true, suggested_position: "amend", note: "PUC nuance" },
      by: "analyst@desk",
    });

    // Active label reflects the correction…
    expect(updated.active_label.suggested_position).toBe("amend");
    expect(updated.override?.by).toBe("analyst@desk");
    // …the model label is untouched…
    expect(updated.model_label.suggested_position).toBe("support");
    // …and the prior judgment is retained in history, not deleted.
    expect(updated.history.length).toBeGreaterThanOrEqual(1);
    expect(updated.history.some((h) => h.label.suggested_position === "support")).toBe(true);
  });

  it("re-running the pipeline preserves a human override", async () => {
    const db = await seededDb();
    const rec = getRecordByBill(db, "CA:AB 905", ONTOLOGY_VERSION, RULES_VERSION)!;
    applyOverride(db, {
      recordId: rec.record_id,
      correction: { relevant: true, materiality_band: "medium" },
      by: "analyst@desk",
    });

    // Rebuild from the pipeline — must NOT clobber the override.
    await buildCorpus(db);
    const after = getRecordByBill(db, "CA:AB 905", ONTOLOGY_VERSION, RULES_VERSION)!;
    expect(after.override).not.toBeNull();
    expect(after.active_label.materiality_band).toBe("medium");
    // model label still reflects the model's own (high) band.
    expect(after.model_label.materiality_band).toBe("high");
  });

  it("exports JSONL with one parseable record per line", async () => {
    const db = await seededDb();
    const path = join(tmpdir(), `corpus-${process.pid}.jsonl`);
    const n = exportCorpus(db, path);
    const lines = readFileSync(path, "utf8").trim().split("\n");
    expect(lines.length).toBe(n);
    for (const line of lines) {
      expect(() => CorpusRecord.parse(JSON.parse(line))).not.toThrow();
    }
  });
});
