import type { Bill } from "../../ingest/schema";
import { billId } from "../../ingest/schema";
import type { ClassifierProvider } from "../provider";
import { Classification, parseClassification } from "../schema";
import { ONTOLOGY_VERSION, ALL_VECTORS } from "../ontology";
import { getDb } from "../../db";
import { readCache, writeCache, textSha } from "../cache";

/** Model used for the LLM backend. Opus 4.8 is the most capable default. */
export const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

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

/**
 * Parse a model's text response into a validated Classification. Strips code
 * fences, extracts the JSON object, stamps authoritative provenance, and runs
 * it through the SAME parseClassification() contract as every other provider.
 * Exported so it can be unit-tested without an API call.
 */
export function parseAnthropicResponse(text: string): Classification {
  const stripped = text
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`AnthropicProvider: no JSON object in response: ${text.slice(0, 160)}`);
  }
  const parsed = JSON.parse(stripped.slice(start, end + 1)) as Record<string, unknown>;
  return parseClassification({
    ...parsed,
    // Provenance is ours to set, not the model's.
    provider: "anthropic",
    ontology_version: ONTOLOGY_VERSION,
    prompt_version: PROMPT_VERSION,
  });
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

  /**
   * Live classification via the Anthropic SDK. Output is parsed through the
   * SAME parseClassification() Zod contract as every other provider — no
   * special-casing. Provenance fields (provider / ontology / prompt version)
   * are injected server-side so they're authoritative regardless of the model.
   *
   * Cached by (sha256(text), provider, ONTOLOGY_VERSION, PROMPT_VERSION) using
   * the shared cache.ts helpers, so re-runs cost nothing.
   */
  async classify(
    bill: Pick<Bill, "title" | "full_text" | "state" | "bill_number">,
  ): Promise<Classification> {
    const db = getDb();
    const sha = textSha(`${bill.title}\n${bill.full_text}`);
    const key = {
      billId: billId(bill.state, bill.bill_number),
      provider: this.name,
      ontologyVersion: ONTOLOGY_VERSION,
      promptVersion: this.promptVersion,
      textSha: sha,
    };
    const cached = readCache(db, key);
    if (cached) return cached;

    const { system, user } = buildPrompt(bill);
    const text = await this.callModel(system, user);
    const result = parseAnthropicResponse(text);

    writeCache(db, { ...key, payload: result });
    return result;
  }

  /** One Messages API call with prompt caching on the (frozen) system prompt. */
  private async callModel(system: string, user: string): Promise<string> {
    // Lazy import keeps the SDK an OPTIONAL dependency — the deterministic
    // build never loads it.
    let Anthropic: typeof import("@anthropic-ai/sdk").default;
    try {
      Anthropic = (await import("@anthropic-ai/sdk")).default;
    } catch {
      throw new Error(
        "@anthropic-ai/sdk is not installed. `npm install @anthropic-ai/sdk` to use LLM_PROVIDER=anthropic.",
      );
    }
    const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

    const msg = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 1024,
      // The ontology system prompt is identical across every bill → cache it.
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: user }],
    });
    const block = msg.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") {
      throw new Error("AnthropicProvider: no text block in response");
    }
    return block.text;
  }
}
