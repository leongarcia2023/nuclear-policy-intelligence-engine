import { z } from "zod";

export const Component = z.object({
  score: z.number().min(0).max(100),
  rationale: z.string().min(1),
});
export type Component = z.infer<typeof Component>;

export const MaterialityScore = z.object({
  bill_id: z.string(),
  components: z.object({
    passage_likelihood: Component,
    economic_magnitude: Component,
    breadth: Component,
    urgency: Component,
  }),
  aggregate: z.number().min(0).max(100),
  band: z.enum(["none", "low", "medium", "high"]),
  weights_version: z.string(),
});
export type MaterialityScore = z.infer<typeof MaterialityScore>;
