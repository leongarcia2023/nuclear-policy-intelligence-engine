import { z } from "zod";
import type { Classification } from "../classify/schema";
import type { MaterialityScore } from "../score/schema";

/**
 * A Label is the compact, human-meaningful judgment about a bill — the thing a
 * human reviewer would correct. It is derived from the classification + score,
 * and is what an override supersedes.
 */
export const Position = z.enum(["support", "oppose", "amend", "monitor"]);
export type Position = z.infer<typeof Position>;

export const Label = z.object({
  relevant: z.boolean(),
  is_indirect: z.boolean(),
  model_bill_risk: z.boolean(),
  direction: z.enum(["helps", "hurts", "neutral"]),
  primary_vectors: z.array(z.string()),
  materiality_band: z.enum(["none", "low", "medium", "high"]),
  suggested_position: Position,
  note: z.string().optional(),
});
export type Label = z.infer<typeof Label>;

/**
 * Suggested position from direction + vectors. Shared by the corpus and the
 * memo generator so the two never disagree.
 *  - helps  → support
 *  - hurts  → amend if the lever is negotiable (large-load / interconnection),
 *             else oppose
 *  - neutral / not-relevant → monitor
 */
export function derivePosition(
  c: Pick<Classification, "relevant" | "direction" | "impact_vectors">,
): Position {
  if (!c.relevant) return "monitor";
  if (c.direction === "helps") return "support";
  if (c.direction === "hurts") {
    const ids = c.impact_vectors.map((v) => v.vector);
    const negotiable = ids.some((id) =>
      ["large_load_colocation", "interconnection_transmission"].includes(id),
    );
    return negotiable ? "amend" : "oppose";
  }
  return "monitor";
}

/** Build the model's Label from a classification + score. */
export function modelLabel(
  c: Classification,
  score: MaterialityScore | null,
): Label {
  return Label.parse({
    relevant: c.relevant,
    is_indirect: c.is_indirect,
    model_bill_risk: c.model_bill_risk,
    direction: c.direction,
    primary_vectors: c.impact_vectors.map((v) => v.vector),
    materiality_band: score?.band ?? "none",
    suggested_position: derivePosition(c),
  });
}
