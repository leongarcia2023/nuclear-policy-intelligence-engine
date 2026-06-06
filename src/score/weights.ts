/**
 * Materiality configuration — the single source of truth for weights and band
 * thresholds. Tunable. Bump WEIGHTS_VERSION when any value here changes so
 * stored scores remain attributable.
 *
 * Default weights are taken verbatim from ontology.seed.md:
 *   passage 0.30, magnitude 0.30, breadth 0.20, urgency 0.20.
 */
export const WEIGHTS_VERSION = "weights-v1";

export const WEIGHTS = {
  passage_likelihood: 0.3,
  economic_magnitude: 0.3,
  breadth: 0.2,
  urgency: 0.2,
} as const;

export type ComponentKey = keyof typeof WEIGHTS;

/**
 * Aggregate → band thresholds. Calibrated to the weight structure: because
 * every just-introduced bill carries low urgency (20/100), a sweeping but
 * newly-filed standard still lands "high" on magnitude+breadth+passage.
 * Not-relevant bills are forced to "none" regardless of aggregate (an
 * off-topic bill has no nuclear materiality).
 */
export const BAND_THRESHOLDS = {
  high: 45,
  medium: 28,
  low: 12,
} as const;

export type MaterialityBand = "none" | "low" | "medium" | "high";

export function bandFor(aggregate: number, relevant: boolean): MaterialityBand {
  if (!relevant) return "none";
  if (aggregate >= BAND_THRESHOLDS.high) return "high";
  if (aggregate >= BAND_THRESHOLDS.medium) return "medium";
  if (aggregate >= BAND_THRESHOLDS.low) return "low";
  return "none";
}
