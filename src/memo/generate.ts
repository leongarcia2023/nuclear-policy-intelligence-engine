import type { Bill } from "../ingest/schema";
import type { Classification } from "../classify/schema";
import type { MaterialityScore } from "../score/schema";
import { derivePosition, type Position } from "../corpus/label";
import { ALL_VECTORS } from "../classify/ontology";
import { Memo } from "./schema";

export const MEMO_GENERATOR = "deterministic-template-v1";

const titleOf = (id: string) =>
  ALL_VECTORS.find((v) => v.id === id)?.title ?? id;

/** Split bill text into sentences for citation extraction. */
function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.;])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** The key levers whose sentences are worth quoting in a memo. */
const CITATION_LEVERS: RegExp[] = [
  /resource['"]?\s+means|eligible[^.]*resource/i,
  /construction work in progress|\bCWIP\b|advance recovery/i,
  /shall not approve[^.]*(thermal|non-renewable|cost recovery)/i,
  /\d+\s*%|\d{2,}\s*(mw|megawatts)/i,
  /grid-service charge|behind[- ]the[- ]meter|co-?locat/i,
  /ad valorem|abatement|payment in lieu/i,
  /procure|procurement/i,
];

/** Pull up to 3 sentences that contain the bill's operative levers. */
function extractCitations(text: string): string[] {
  const out: string[] = [];
  for (const s of sentences(text)) {
    if (CITATION_LEVERS.some((re) => re.test(s))) {
      out.push(`"${s}"`);
      if (out.length === 3) break;
    }
  }
  return out;
}

function whatItDoes(bill: Pick<Bill, "title">, c: Classification): string {
  if (!c.relevant) {
    return `${bill.title}: no commercial-nuclear nexus (out of scope).`;
  }
  const vectors = c.impact_vectors.map((v) => titleOf(v.vector));
  const uniq = [...new Set(vectors)];
  return `${bill.title}. Touches: ${uniq.join(", ")}.`;
}

/**
 * Board-readable "why it matters" in the Ribbit Power Letter register: terse,
 * financially literate, slightly contrarian — watch the mechanism, not the
 * title. Keyed on direction + dominant vector; deterministic.
 */
function whyItMatters(c: Classification): string {
  if (!c.relevant) {
    return "No nuclear exposure. Monitor only — nothing to underwrite here.";
  }
  const ids = new Set(c.impact_vectors.map((v) => v.vector));
  const isDefn =
    ids.has("clean_standard_eligibility") || ids.has("definitions_trap");

  if (c.direction === "hurts") {
    if (isDefn)
      return (
        "Reads green, underwrites against nuclear: the eligibility definition fences out " +
        "firm zero-carbon generation, stranding the cheapest dispatchable clean megawatts in the state. " +
        "The title is climate policy; the balance-sheet effect is a write-down. Watch the definition, not the headline."
      );
    if (ids.has("large_load_colocation"))
      return (
        "Taxes the behind-the-meter co-location structure the hyperscaler–reactor deals are built on, " +
        "lifting the hurdle rate on data-center-anchored nuclear. Negotiable, not fatal — but it moves the IRR."
      );
    return (
      "Cuts against nuclear economics through a cost-recovery or permitting lever. " +
      "Small print, real dollars — model the rate impact before it moves."
    );
  }

  if (c.direction === "helps") {
    if (isDefn)
      return (
        "A 'firm, dispatchable, zero-carbon' standard is nuclear's best friend: it pays for exactly what reactors sell — " +
        "reliable clean baseload. Upside to fleet value and to anyone underwriting new build."
      );
    return (
      "Pulls new-build risk forward (CWIP) and trims the tax drag, materially de-risking an SMR balance sheet. " +
      "This is the kind of dull statutory plumbing that quietly compounds into bankable projects."
    );
  }

  return "Nuclear-adjacent and directionally ambiguous. Track the definitions and the fiscal note before taking a view.";
}

function recommendedAction(position: Position): string {
  switch (position) {
    case "support":
      return "Engage the sponsor, submit supportive testimony, and track the committee calendar.";
    case "oppose":
      return "Open a counter-position: flag the exclusionary definition to allies and prepare striking-amendment language.";
    case "amend":
      return "Seek an amendment carving out firm clean resources / behind-the-meter co-location; negotiate the cost-shift test rather than killing the bill.";
    case "monitor":
      return "No action. Auto-watch for substitute language that changes scope.";
  }
}

/**
 * Generate a position-ready memo from a bill + classification + score.
 * Pure and deterministic — same inputs → identical memo (no timestamps inside).
 */
export function generateMemo(
  bill: Pick<Bill, "id" | "title" | "full_text">,
  c: Classification,
  score: MaterialityScore | null,
): Memo {
  const position = derivePosition(c);
  return Memo.parse({
    bill_id: bill.id,
    headline: c.headline,
    what_it_does: whatItDoes(bill, c),
    why_it_matters: whyItMatters(c),
    position,
    recommended_action: recommendedAction(position),
    citations: extractCitations(bill.full_text),
    materiality_band: score?.band ?? "none",
    aggregate: score?.aggregate ?? 0,
    generator: MEMO_GENERATOR,
  });
}
