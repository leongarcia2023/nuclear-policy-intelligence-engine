import type { Bill } from "../../ingest/schema";
import type { ClassifierProvider } from "../provider";
import { Classification, parseClassification } from "../schema";
import { ONTOLOGY_VERSION, ALL_VECTORS } from "../ontology";

/**
 * Anthropic adapter — IMPLEMENTED BUT INERT.
 *
 * This is the clean seam for an LLM backend. It is NEVER the default and is
 * only constructed when `LLM_PROVIDER=anthropic`. If no `ANTHROPIC_API_KEY`
 * is set it throws immediately rather than silently degrading — the
 * deterministic provider remains the zero-cost baseline.
 *
 * The build ships with ZERO paid-API usage. Wiring the live call is a small,
 * isolated change behind this single method; the prompt + schema are already
 * defined so the future upgrade is purely mechanical. We do not import the SDK
 * here to keep the dependency optional.
 */
export const PROMPT_VERSION = "anthropic-v1";

export function buildPrompt(
  bill: Pick<Bill, "title" | "full_text">,
): { system: string; user: string } {
  const vectorList = ALL_VECTORS.map((v) => `- ${v.id} (${v.kind}): ${v.title}`).join(
    "\n",
  );
  const system = [
    "You classify US state legislation for its impact on COMMERCIAL nuclear fission",
    "(operating fleet, new build, SMRs, fuel cycle). Out of scope: nuclear medicine,",
    "naval/defense, weapons, fusion. A bill containing 'nuclear' is NOT automatically",
    "relevant. The highest-value catches are INDIRECT bills that never say 'nuclear'",
    "but move nuclear economics via clean-standard definitions, large-load co-location,",
    "or cost-recovery rules. Flag green-looking bills that exclude nuclear as hurts.",
    "",
    `Ontology version ${ONTOLOGY_VERSION}. Impact vectors:`,
    vectorList,
    "",
    "Respond ONLY with JSON matching the Classification schema: relevant, confidence",
    "(0-1), is_indirect, model_bill_risk, direction (helps|hurts|neutral), headline,",
    "impact_vectors [{vector, direction, rationale}], provider, ontology_version,",
    "prompt_version.",
  ].join("\n");
  const user = `TITLE: ${bill.title}\n\nTEXT:\n${bill.full_text}`;
  return { system, user };
}

export class AnthropicProvider implements ClassifierProvider {
  readonly name = "anthropic";
  readonly promptVersion = PROMPT_VERSION;

  constructor() {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error(
        "AnthropicProvider selected but ANTHROPIC_API_KEY is not set. " +
          "This build defaults to the deterministic provider (LLM_PROVIDER=deterministic) " +
          "and runs with zero paid APIs.",
      );
    }
  }

  async classify(
    bill: Pick<Bill, "title" | "full_text" | "state" | "bill_number">,
  ): Promise<Classification> {
    // Seam only. Wiring the live call (Anthropic SDK + prompt caching) is a
    // localized change; the prompt and parser below are ready.
    const { system, user } = buildPrompt(bill);
    void system;
    void user;
    throw new Error(
      "AnthropicProvider.classify is an inert seam in the zero-API build. " +
        "Implement the SDK call here to enable the LLM backend; output must pass " +
        "parseClassification().",
    );
  }

  /** Exposed so a future implementation validates exactly like the others. */
  protected parse(raw: unknown): Classification {
    return parseClassification(raw);
  }
}
