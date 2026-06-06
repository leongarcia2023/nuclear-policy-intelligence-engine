import { z } from "zod";
import { Label } from "./label";
import { MaterialityScore } from "../score/schema";

export const HistoryItem = z.object({
  label: Label,
  source: z.enum(["model", "override"]),
  at: z.string(),
  by: z.string().optional(),
});
export type HistoryItem = z.infer<typeof HistoryItem>;

export const Override = z.object({
  label: Label,
  by: z.string(),
  at: z.string(),
  note: z.string().optional(),
});
export type Override = z.infer<typeof Override>;

/**
 * The durable judgment record. One per (bill, ontology_version, prompt_version).
 * `model_label` is what the active provider produced; `active_label` is what
 * the desk treats as truth (equals model_label until a human overrides).
 * History is append-only — overrides never delete prior judgments.
 */
export const CorpusRecord = z.object({
  record_id: z.string(),
  bill_id: z.string(),
  ontology_version: z.string(),
  prompt_version: z.string(),
  provider: z.string(),
  model_label: Label,
  active_label: Label,
  override: Override.nullable(),
  score: MaterialityScore.nullable(),
  memo: z.unknown().nullable(), // Phase 6 snapshot
  history: z.array(HistoryItem),
  created_at: z.string(),
  updated_at: z.string(),
});
export type CorpusRecord = z.infer<typeof CorpusRecord>;

export function recordId(
  billId: string,
  ontologyVersion: string,
  promptVersion: string,
): string {
  return `${billId}@${ontologyVersion}/${promptVersion}`;
}
