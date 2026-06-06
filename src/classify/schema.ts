import { z } from "zod";

export const DirectionEnum = z.enum(["helps", "hurts", "neutral"]);

export const ImpactVector = z.object({
  vector: z.string(), // ontology vector id
  direction: DirectionEnum,
  rationale: z.string().min(1), // why this vector fired, citing the tell
});
export type ImpactVector = z.infer<typeof ImpactVector>;

/**
 * The classifier's output contract — identical regardless of backend
 * (deterministic / anthropic / local). Every provider's result is validated
 * against this schema; invalid output is rejected/repaired before storage.
 *
 * Fields beyond PLAN's minimum:
 *  - `direction`  : bill-level roll-up of vector directions (any hurts → hurts),
 *                   used by scoring, memos, and the eval's direction check.
 *  - `provider`/`ontology_version`/`prompt_version`: provenance for the corpus.
 */
export const Classification = z.object({
  relevant: z.boolean(),
  confidence: z.number().min(0).max(1),
  is_indirect: z.boolean(),
  model_bill_risk: z.boolean(),
  direction: DirectionEnum,
  headline: z.string().min(1),
  impact_vectors: z.array(ImpactVector),
  provider: z.string(),
  ontology_version: z.string(),
  prompt_version: z.string(),
});
export type Classification = z.infer<typeof Classification>;

/** Validate (and thereby repair-by-rejection) any provider output. */
export function parseClassification(raw: unknown): Classification {
  return Classification.parse(raw);
}
