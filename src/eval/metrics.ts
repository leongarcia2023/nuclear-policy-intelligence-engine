import type { GoldCase } from "../ingest/fixtures";
import { DeterministicProvider } from "../classify/providers/deterministic";
import { getProvider, type ClassifierProvider } from "../classify/provider";
import { scoreBill } from "../score/score";
import { matchCountsByBill } from "../campaign/campaign";

/** A wrong directional call made with high stated confidence — the worst kind. */
const CONFIDENT_THRESHOLD = 0.7;

export type Metrics = {
  n: number;
  n_relevant: number;
  n_indirect: number;
  n_negative: number;
  relevance: { precision: number; recall: number; f1: number; accuracy: number };
  /** THE metric: of truly-indirect bills, fraction caught (relevant AND flagged indirect). */
  recall_on_indirect: number;
  /** Of not-relevant bills, fraction wrongly marked relevant. */
  false_positive_rate: number;
  /** Mean recall of gold primary vectors among relevant bills. */
  vector_accuracy: number;
  /** Fraction of cases whose predicted materiality band equals the gold band. */
  band_agreement: number;
  /** Fraction whose predicted direction equals the gold direction. */
  direction_agreement: number;
  /** Confidence calibration: mean confidence when the relevance call is right vs wrong. */
  calibration: { mean_conf_correct: number; mean_conf_wrong: number; gap: number };
  /** Count of cases predicted with a WRONG direction at high confidence (≥0.7). */
  confident_wrong_direction: number;
  misses: string[]; // human-readable list of disagreements
};

const round = (n: number, d = 3) => Number(n.toFixed(d));

/**
 * Run the ACTIVE provider over the gold set and compute correctness metrics.
 * This tests correctness (catching indirect bills, rejecting false friends),
 * never output shape.
 */
export async function evaluate(
  cases: GoldCase[],
  providerOverride?: ClassifierProvider,
): Promise<Metrics> {
  // Explicit override wins (used by eval:compare). Otherwise default to
  // deterministic, honoring LLM_PROVIDER only when it's set to a non-default.
  const provider =
    providerOverride ??
    (process.env.LLM_PROVIDER && process.env.LLM_PROVIDER !== "deterministic"
      ? await getProvider()
      : new DeterministicProvider());

  const bills = cases.map((c) => c.bill);
  const matchCounts = matchCountsByBill(bills);

  let tp = 0,
    fp = 0,
    fn = 0,
    tn = 0;
  let indirectCaught = 0,
    indirectTotal = 0;
  let negTotal = 0,
    negWrong = 0;
  let vectorRecallSum = 0,
    relevantCount = 0;
  let bandAgree = 0,
    dirAgree = 0,
    confidentWrongDir = 0;
  const confCorrect: number[] = [];
  const confWrong: number[] = [];
  const misses: string[] = [];

  for (const c of cases) {
    const pred = await provider.classify(c.bill);
    const score = scoreBill({
      bill: c.bill,
      classification: pred,
      campaignMatchCount: matchCounts.get(c.bill.id) ?? 0,
    });
    const g = c.labels;

    // Relevance confusion matrix.
    const relevanceCorrect = pred.relevant === g.relevant;
    if (pred.relevant && g.relevant) tp++;
    else if (pred.relevant && !g.relevant) fp++;
    else if (!pred.relevant && g.relevant) fn++;
    else tn++;

    (relevanceCorrect ? confCorrect : confWrong).push(pred.confidence);
    if (!relevanceCorrect)
      misses.push(
        `${c.gold_id} relevance: predicted ${pred.relevant}, gold ${g.relevant}`,
      );

    // Recall on indirect (the catch that justifies the product).
    if (g.relevant && g.is_indirect) {
      indirectTotal++;
      if (pred.relevant && pred.is_indirect) indirectCaught++;
      else
        misses.push(
          `${c.gold_id} INDIRECT MISS: relevant=${pred.relevant} is_indirect=${pred.is_indirect}`,
        );
    }

    // False positives from the negative controls.
    if (!g.relevant) {
      negTotal++;
      if (pred.relevant) {
        negWrong++;
        misses.push(`${c.gold_id} FALSE POSITIVE: marked relevant`);
      }
    }

    // Vector accuracy (recall of gold primary vectors) over relevant bills.
    if (g.relevant) {
      relevantCount++;
      const predicted = new Set(pred.impact_vectors.map((v) => v.vector));
      const goldVecs = g.primary_vectors;
      const hit = goldVecs.filter((v) => predicted.has(v)).length;
      const recall = goldVecs.length ? hit / goldVecs.length : 1;
      vectorRecallSum += recall;
      if (recall < 1)
        misses.push(
          `${c.gold_id} vectors: gold [${goldVecs.join(",")}] vs pred [${[...predicted].join(",")}]`,
        );
    }

    // Band + direction agreement.
    if (score.band === g.materiality_band) bandAgree++;
    else misses.push(`${c.gold_id} band: pred ${score.band} vs gold ${g.materiality_band}`);
    if (pred.direction === g.direction) dirAgree++;
    else {
      misses.push(`${c.gold_id} direction: pred ${pred.direction} vs gold ${g.direction}`);
      if (pred.confidence >= CONFIDENT_THRESHOLD) confidentWrongDir++;
    }
  }

  const precision = tp + fp ? tp / (tp + fp) : 1;
  const recall = tp + fn ? tp / (tp + fn) : 1;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

  return {
    n: cases.length,
    n_relevant: relevantCount,
    n_indirect: indirectTotal,
    n_negative: negTotal,
    relevance: {
      precision: round(precision),
      recall: round(recall),
      f1: round(f1),
      accuracy: round((tp + tn) / cases.length),
    },
    recall_on_indirect: round(indirectTotal ? indirectCaught / indirectTotal : 1),
    false_positive_rate: round(negTotal ? negWrong / negTotal : 0),
    vector_accuracy: round(relevantCount ? vectorRecallSum / relevantCount : 1),
    band_agreement: round(bandAgree / cases.length),
    direction_agreement: round(dirAgree / cases.length),
    calibration: {
      mean_conf_correct: round(mean(confCorrect)),
      mean_conf_wrong: round(mean(confWrong)),
      gap: round(mean(confCorrect) - mean(confWrong)),
    },
    confident_wrong_direction: confidentWrongDir,
    misses,
  };
}
