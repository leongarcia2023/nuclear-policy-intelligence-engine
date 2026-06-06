import type { Bill } from "../../ingest/schema";
import type { ClassifierProvider } from "../provider";
import { Classification, type ImpactVector } from "../schema";
import {
  ALL_VECTORS,
  DIRECT_VECTORS,
  NUCLEAR_KEYWORDS,
  ONTOLOGY_VERSION,
  OUT_OF_SCOPE,
  type Direction,
  type OntologyVector,
} from "../ontology";

/** Bump when the rules change so the cache invalidates cleanly. */
export const RULES_VERSION = "rules-v1";

type VectorHit = { vector: OntologyVector; evidence: string };

/** Return the first tell that matches, with the matched snippet for the rationale. */
function firstMatch(tells: RegExp[], text: string): string | null {
  for (const re of tells) {
    const m = text.match(re);
    if (m) return m[0];
  }
  return null;
}

/** Grab the enumerated clause of the first "... resource means ..." definition. */
function definitionClause(text: string): string | null {
  const m = text.match(/resource['"]?\s+means\b([^.]*)\./i);
  return m ? m[1].trim() : null;
}

type DefnAnalysis = {
  clause: string | null;
  inclusion: boolean; // carbon/firm/dispatchable framing → nuclear qualifies
  exclusion: boolean; // renewable-only list or thermal bar → nuclear excluded
  thermalBar: boolean; // bars cost recovery for thermal/non-renewable generation
  evidence: string[];
};

/**
 * The single highest-leverage analysis in the system: does an eligibility /
 * definitions section silently INCLUDE nuclear (carbon/firm/dispatchable
 * framing) or EXCLUDE it (a closed "renewable" list, or a bar on thermal
 * cost recovery)? Nuclear is steam-cycle thermal, so a thermal bar hits it.
 */
function analyzeDefinitions(text: string): DefnAnalysis {
  const clause = definitionClause(text);
  const evidence: string[] = [];

  const inclusionRe =
    /zero[- ]?carbon|zero direct carbon|carbon[- ]?free|non-?emitting|firm,?\s*(and\s*)?dispatchable|dispatchable output|baseload/i;
  const qualifyingRe =
    /nuclear|firm|dispatchable|zero-?carbon|baseload|non-?emitting/i;

  const inclusion = clause ? inclusionRe.test(clause) : false;
  if (inclusion && clause) {
    const m = clause.match(inclusionRe);
    evidence.push(`eligibility framed as "${m?.[0]}" — nuclear qualifies`);
  }

  // Closed "renewable" enumeration that omits nuclear-qualifying terms.
  const renewableList =
    !!clause &&
    /\bwind\b/i.test(clause) &&
    /\bsolar\b/i.test(clause) &&
    !qualifyingRe.test(clause);
  if (renewableList) {
    evidence.push(
      `"renewable" defined as a closed list (${clause!.slice(0, 60)}…) that omits nuclear`,
    );
  }

  // Bar on cost recovery for thermal / non-renewable generation.
  const thermalBar =
    /shall not approve[^.]*?(thermal|non-renewable)/i.test(text) ||
    /non-renewable thermal|steam-cycle thermal/i.test(text);
  if (thermalBar) {
    const m = text.match(
      /(shall not approve[^.]*?(thermal|non-renewable)[^.]*|non-renewable thermal[^.]*|steam-cycle thermal[^.]*)/i,
    );
    evidence.push(`bars cost recovery for thermal generation: "${m?.[0]?.slice(0, 80)}…"`);
  }

  return {
    clause,
    inclusion,
    exclusion: renewableList || thermalBar,
    thermalBar,
    evidence,
  };
}

/** Vectors that are enabling for commercial nuclear by their nature. */
const HELPS_BY_DEFAULT = new Set([
  "new_build_siting_licensing",
  "advance_cost_recovery",
  "property_tax_pilot",
  "fleet_preservation",
]);

function directionFor(
  vector: OntologyVector,
  text: string,
  defn: DefnAnalysis,
): { direction: Direction; note: string } {
  switch (vector.id) {
    case "clean_standard_eligibility":
    case "definitions_trap": {
      if (defn.exclusion)
        return { direction: "hurts", note: defn.evidence.join("; ") };
      if (defn.inclusion)
        return { direction: "helps", note: defn.evidence.join("; ") };
      return { direction: "neutral", note: "eligibility scope unclear" };
    }
    case "rate_recovery_securitization": {
      if (defn.thermalBar)
        return {
          direction: "hurts",
          note: "cost recovery barred for thermal generation (nuclear is steam-cycle thermal)",
        };
      return { direction: "neutral", note: "cost-recovery rules reshape what utilities may build" };
    }
    case "large_load_colocation": {
      if (/grid-service charge|shall not approve|shifts? costs?|cost shift/i.test(text))
        return {
          direction: "hurts",
          note: "co-location penalized via grid-service charge / cost-shift bar — raises the cost of behind-the-meter nuclear deals",
        };
      if (/bring-your-own-generation|may co-?locate|permit(s|ted)? co-?location/i.test(text))
        return { direction: "helps", note: "enables behind-the-meter co-location" };
      return { direction: "neutral", note: "governs large-load / co-location terms" };
    }
    case "moratorium_or_ban": {
      if (/repeal of (the )?(prohibition|moratorium|ban)/i.test(text))
        return { direction: "helps", note: "repeals an existing prohibition" };
      return { direction: "hurts", note: "imposes a ban / moratorium / approval hurdle" };
    }
    case "carbon_procurement": {
      if (defn.inclusion || /firm-?clean-?power|firm,?\s*dispatchable/i.test(text))
        return { direction: "helps", note: "firm-clean procurement mandate that nuclear can satisfy" };
      return { direction: "neutral", note: "procurement mandate; nuclear eligibility depends on definitions" };
    }
    default: {
      if (HELPS_BY_DEFAULT.has(vector.id))
        return { direction: "helps", note: "enabling action for commercial nuclear" };
      return { direction: "neutral", note: "affects nuclear economics; net sign context-dependent" };
    }
  }
}

function rollUp(vectors: ImpactVector[]): Direction {
  if (vectors.some((v) => v.direction === "hurts")) return "hurts";
  if (vectors.some((v) => v.direction === "helps")) return "helps";
  return "neutral";
}

function buildHeadline(
  relevant: boolean,
  isIndirect: boolean,
  direction: Direction,
  vectors: ImpactVector[],
): string {
  if (!relevant) return "Not relevant to commercial nuclear (out of scope)";
  const top = vectors
    .slice(0, 2)
    .map((v) => ALL_VECTORS.find((x) => x.id === v.vector)?.title ?? v.vector)
    .join(" + ");
  const lead = isIndirect ? "INDIRECT" : "Direct";
  const dir =
    direction === "hurts"
      ? "hurts nuclear"
      : direction === "helps"
        ? "helps nuclear"
        : "nuclear-adjacent";
  const miss = isIndirect ? " — keyword search would miss this" : "";
  return `${lead}: ${top} (${dir})${miss}`;
}

export class DeterministicProvider implements ClassifierProvider {
  readonly name = "deterministic";
  readonly promptVersion = RULES_VERSION;

  async classify(
    bill: Pick<Bill, "title" | "full_text" | "state" | "bill_number">,
  ): Promise<Classification> {
    const text = `${bill.title}\n${bill.full_text}`;

    // 1. Match every ontology vector.
    const hits: VectorHit[] = [];
    for (const v of ALL_VECTORS) {
      const ev = firstMatch(v.tells, text);
      if (ev) hits.push({ vector: v, evidence: ev });
    }

    // 2. Scope gate. Out-of-scope markers with NO in-scope vector → not relevant.
    const outMarkers = OUT_OF_SCOPE.filter((s) =>
      s.tells.some((re) => re.test(text)),
    );
    const inScope = hits.length > 0;
    const outOfScope = outMarkers.length > 0 && !inScope;

    const defn = analyzeDefinitions(text);

    // 3. Build impact vectors with direction + rationale.
    const impactVectors: ImpactVector[] = hits.map(({ vector, evidence }) => {
      const { direction, note } = directionFor(vector, text, defn);
      return {
        vector: vector.id,
        direction,
        rationale: `${vector.title}: matched "${evidence}". ${note}.`,
      };
    });

    const relevant = inScope && !outOfScope;
    const hasNuclearKeyword = NUCLEAR_KEYWORDS.test(text);
    // Indirect = relevant but a naive "nuclear" keyword search would miss it.
    const isIndirect = relevant && !hasNuclearKeyword;

    // model_bill_risk: portable, definition/threshold-driven statutory language.
    const templateTell =
      /resource['"]?\s+means|["'][^"']{0,40}["']\s+means|\d+\s*%|\d{2,}\s*(mw|megawatts)|siting office|advance recovery/i.test(
        text,
      );
    const modelBillRisk = relevant && templateTell;

    const direction = relevant ? rollUp(impactVectors) : "neutral";

    // Confidence — deliberately humble; rules, not a model.
    let confidence: number;
    if (!relevant) {
      confidence = outOfScope ? 0.9 : 0.85;
    } else {
      confidence = 0.55 + 0.1 * Math.min(impactVectors.length, 3);
      if (hasNuclearKeyword) confidence += 0.1;
      if (defn.inclusion || defn.exclusion) confidence += 0.08;
      confidence = Math.min(confidence, 0.9);
    }

    // Direct vectors first, then indirect — stable, readable ordering.
    const directIds = new Set(DIRECT_VECTORS.map((v) => v.id));
    impactVectors.sort((a, b) => {
      const ad = directIds.has(a.vector) ? 0 : 1;
      const bd = directIds.has(b.vector) ? 0 : 1;
      return ad - bd;
    });

    const result: Classification = {
      relevant,
      confidence: Number(confidence.toFixed(2)),
      is_indirect: isIndirect,
      model_bill_risk: modelBillRisk,
      direction,
      headline: buildHeadline(relevant, isIndirect, direction, impactVectors),
      impact_vectors: impactVectors,
      provider: this.name,
      ontology_version: ONTOLOGY_VERSION,
      prompt_version: this.promptVersion,
    };

    // Always validate our own output against the shared contract.
    return Classification.parse(result);
  }
}
