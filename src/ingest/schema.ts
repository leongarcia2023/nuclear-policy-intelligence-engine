import { z } from "zod";

/** A single legislative action in a bill's history. */
export const HistoryEntry = z.object({
  date: z.string(),
  action: z.string(),
  chamber: z.string().optional(),
});
export type HistoryEntry = z.infer<typeof HistoryEntry>;

/**
 * Canonical bill stage, normalized across LegiScan progress codes and fixtures.
 * Ordering matters: it drives the deterministic `urgency` score in Phase 3.
 */
export const Stage = z.enum([
  "introduced",
  "in_committee",
  "passed_one_chamber",
  "enrolled",
  "enacted",
  "failed",
]);
export type Stage = z.infer<typeof Stage>;

export const STAGE_ORDER: Record<Stage, number> = {
  introduced: 0,
  in_committee: 1,
  passed_one_chamber: 2,
  enrolled: 3,
  enacted: 4,
  failed: 0, // dead bills carry no urgency
};

export const Bill = z.object({
  id: z.string(), // "<STATE>:<bill_number>"
  legiscan_id: z.number().int().nullable(),
  state: z.string().length(2),
  bill_number: z.string(),
  title: z.string(),
  sponsors: z.array(z.string()).default([]),
  committee: z.string().nullable().default(null),
  stage: Stage.default("introduced"),
  last_action: z.string().nullable().default(null),
  history: z.array(HistoryEntry).default([]),
  full_text: z.string().default(""),
  change_hash: z.string(),
  source: z.enum(["legiscan", "fixture"]).default("legiscan"),
  fetched_at: z.string(),
});
export type Bill = z.infer<typeof Bill>;

/** Build the stable cross-run id from state + bill number. */
export function billId(state: string, billNumber: string): string {
  return `${state.toUpperCase()}:${billNumber.trim()}`;
}
