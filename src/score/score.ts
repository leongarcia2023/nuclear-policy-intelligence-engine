import type { Bill } from "../ingest/schema";
import { STAGE_ORDER } from "../ingest/schema";
import type { Classification } from "../classify/schema";
import { MaterialityScore, type Component } from "./schema";
import { WEIGHTS, WEIGHTS_VERSION, bandFor } from "./weights";

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export type ScoreInputs = {
  bill: Pick<Bill, "id" | "title" | "full_text" | "sponsors" | "committee" | "stage">;
  classification: Classification;
  /** Number of OTHER states with a near-duplicate (from Phase 4). */
  campaignMatchCount?: number;
};

/**
 * passage_likelihood — sponsor seniority, committee assignment, and stage.
 * Deterministic heuristics (the seed's "bounded estimate" stays deterministic
 * in the zero-API build).
 */
function passageLikelihood(i: ScoreInputs): Component {
  const reasons: string[] = [];
  let s = 30;
  const sponsorText = i.bill.sponsors.join("; ");
  if (/chair(man|woman|person)?\b/i.test(sponsorText)) {
    s += 30;
    reasons.push("committee-chair sponsorship");
  } else if (i.bill.sponsors.length > 0) {
    s += 5;
    reasons.push(`${i.bill.sponsors.length} sponsor(s)`);
  } else {
    reasons.push("no named sponsor");
  }
  if (i.bill.committee) {
    s += 10;
    reasons.push("assigned to committee");
  }
  const stageBump: Record<string, number> = {
    introduced: 0,
    in_committee: 10,
    passed_one_chamber: 25,
    enrolled: 35,
    enacted: 40,
    failed: -30,
  };
  s += stageBump[i.bill.stage] ?? 0;
  reasons.push(`stage=${i.bill.stage}`);
  return {
    score: clamp(s),
    rationale: `Passage: ${reasons.join(", ")}.`,
  };
}

/**
 * economic_magnitude — CapEx/OpEx/rate swing implied by the matched vectors
 * and structural tells (CWIP, % mandates, MW thresholds, abatements, thermal
 * cost-recovery bars).
 */
function economicMagnitude(i: ScoreInputs): Component {
  if (!i.classification.relevant) {
    return { score: 0, rationale: "Magnitude: not relevant — no nuclear economic exposure." };
  }
  const text = `${i.bill.title}\n${i.bill.full_text}`;
  const reasons: string[] = [];
  let s = 30;
  const add = (cond: boolean, pts: number, why: string) => {
    if (cond) {
      s += pts;
      reasons.push(why);
    }
  };
  add(/construction work in progress|\bCWIP\b|advance recovery/i.test(text), 20, "advance cost recovery / CWIP");
  add(/\d+\s*%/.test(text), 25, "percentage procurement mandate");
  add(/\d{2,}\s*(mw|megawatts)/i.test(text), 10, "MW-scale threshold");
  add(/ad valorem|abatement|payment in lieu/i.test(text), 15, "tax abatement / PILOT");
  add(/shall not approve[^.]*(thermal|non-renewable|cost recovery)/i.test(text), 20, "cost-recovery bar");
  add(/grid-service charge|behind[- ]the[- ]meter|co-?locat/i.test(text), 15, "behind-the-meter / co-location cost surface");
  add(i.classification.direction !== "neutral", 10, `directional impact (${i.classification.direction})`);
  return {
    score: clamp(s),
    rationale: `Magnitude: ${reasons.join(", ") || "baseline relevant exposure"}.`,
  };
}

/**
 * breadth — single asset vs statewide vs a model bill spreading across states.
 * Cross-state match count is fed back from Phase 4.
 */
function breadth(i: ScoreInputs): Component {
  if (!i.classification.relevant) {
    return { score: 0, rationale: "Breadth: not relevant." };
  }
  const text = `${i.bill.title}\n${i.bill.full_text}`;
  const reasons: string[] = [];
  let s = 25;
  if (i.classification.model_bill_risk) {
    s += 35;
    reasons.push("template/model-bill pattern");
  }
  if (
    /commission shall|load-serving entit|retail (load|sales)|electric distribution utilit|statewide|each (utility|customer)/i.test(
      text,
    )
  ) {
    s += 20;
    reasons.push("statewide applicability");
  }
  const matches = i.campaignMatchCount ?? 0;
  if (matches > 0) {
    const bump = Math.min(matches * 12, 36);
    s += bump;
    reasons.push(`near-duplicate in ${matches} other state(s)`);
  }
  return {
    score: clamp(s),
    rationale: `Breadth: ${reasons.join(", ") || "single-asset / narrow"}.`,
  };
}

/** urgency — deterministic from legislative stage. */
function urgency(i: ScoreInputs): Component {
  const map: Record<string, number> = {
    introduced: 20,
    in_committee: 40,
    passed_one_chamber: 65,
    enrolled: 85,
    enacted: 100,
    failed: 0,
  };
  const s = map[i.bill.stage] ?? 20;
  return {
    score: s,
    rationale: `Urgency: stage=${i.bill.stage} (order ${STAGE_ORDER[i.bill.stage]}).`,
  };
}

/**
 * Weighted aggregate. Pure function of its inputs — reproducible given fixed
 * (bill, classification, campaignMatchCount).
 */
export function scoreBill(i: ScoreInputs): MaterialityScore {
  const components = {
    passage_likelihood: passageLikelihood(i),
    economic_magnitude: economicMagnitude(i),
    breadth: breadth(i),
    urgency: urgency(i),
  };
  const aggregate =
    components.passage_likelihood.score * WEIGHTS.passage_likelihood +
    components.economic_magnitude.score * WEIGHTS.economic_magnitude +
    components.breadth.score * WEIGHTS.breadth +
    components.urgency.score * WEIGHTS.urgency;
  const agg = Number(aggregate.toFixed(1));
  return MaterialityScore.parse({
    bill_id: i.bill.id,
    components,
    aggregate: agg,
    band: bandFor(agg, i.classification.relevant),
    weights_version: WEIGHTS_VERSION,
  });
}
