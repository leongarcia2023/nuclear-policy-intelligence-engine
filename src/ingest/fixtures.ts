import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { Bill, billId } from "./schema";
import { syntheticChangeHash } from "../util/hash";

/**
 * gold_seed.jsonl is the labeled anchor set (Phase 7 eval) AND — when no
 * LegiScan key is present — the pipeline's ingestion fixtures. This module
 * loads it for both purposes. The `labels` are kept separate from the `Bill`
 * so ingestion never sees the answer key.
 */

export const GoldLabels = z.object({
  relevant: z.boolean(),
  is_indirect: z.boolean(),
  model_bill_risk: z.boolean(),
  primary_vectors: z.array(z.string()),
  direction: z.enum(["helps", "hurts", "neutral"]),
  expected_position: z.enum(["support", "oppose", "amend", "monitor"]),
  materiality_band: z.enum(["none", "low", "medium", "high"]),
});
export type GoldLabels = z.infer<typeof GoldLabels>;

const GoldRow = z.object({
  id: z.string(),
  state: z.string(),
  bill_number: z.string(),
  title: z.string(),
  text: z.string(),
  labels: GoldLabels,
  note: z.string().optional(),
});

export type GoldCase = {
  gold_id: string;
  bill: Bill;
  labels: GoldLabels;
  note?: string;
};

const DEFAULT_PATH = resolve(process.cwd(), "gold_seed.jsonl");

/** Parse gold_seed.jsonl into typed cases (bill + held-out labels). */
export function loadGoldSeed(path: string = DEFAULT_PATH): GoldCase[] {
  const raw = readFileSync(path, "utf8");
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  // Deterministic, fixed timestamp so fixture ingestion is reproducible.
  const fetchedAt = "2026-01-01T00:00:00.000Z";
  return lines.map((line) => {
    const row = GoldRow.parse(JSON.parse(line));
    const id = billId(row.state, row.bill_number);
    const bill = Bill.parse({
      id,
      legiscan_id: null,
      state: row.state,
      bill_number: row.bill_number,
      title: row.title,
      sponsors: extractSponsors(row.text),
      committee: extractCommittee(row.text),
      stage: "introduced",
      last_action: "Introduced",
      history: [{ date: fetchedAt.slice(0, 10), action: "Introduced" }],
      full_text: row.text,
      change_hash: syntheticChangeHash({
        title: row.title,
        full_text: row.text,
        stage: "introduced",
        last_action: "Introduced",
      }),
      source: "fixture",
      fetched_at: fetchedAt,
    });
    return { gold_id: row.id, bill, labels: row.labels, note: row.note };
  });
}

/** Pull a sponsor mention out of fixture prose (e.g. "Sponsored by the Chair…"). */
function extractSponsors(text: string): string[] {
  const m = text.match(/Sponsored by ([^.]+)\./i);
  return m ? [m[1].trim()] : [];
}

function extractCommittee(text: string): string | null {
  const m = text.match(/Committee on ([^.,]+)/i);
  return m ? `Committee on ${m[1].trim()}` : null;
}
