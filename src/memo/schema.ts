import { z } from "zod";
import { Position } from "../corpus/label";

/**
 * A position-ready memo. Content is DETERMINISTIC given a fixed classification
 * + score (no timestamps inside the payload), so it is stable and cacheable.
 * The `generator` field records how the prose was produced; an LLM backend
 * would set this to e.g. "anthropic-v1" without changing the shape.
 */
export const Memo = z.object({
  bill_id: z.string(),
  headline: z.string().min(1),
  what_it_does: z.string().min(1),
  why_it_matters: z.string().min(1), // board-readable, 1–2 sentences
  position: Position,
  recommended_action: z.string().min(1),
  citations: z.array(z.string()), // quoted bill sections
  materiality_band: z.enum(["none", "low", "medium", "high"]),
  aggregate: z.number(),
  generator: z.string(),
});
export type Memo = z.infer<typeof Memo>;
