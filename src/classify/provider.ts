import type { Bill } from "../ingest/schema";
import type { Classification } from "./schema";

/**
 * The single seam the optional LLM plugs into. The deterministic rules engine
 * is the DEFAULT and needs no key; the anthropic adapter is implemented but
 * inert unless explicitly selected. Every backend returns the same
 * Zod-validated Classification.
 */
export interface ClassifierProvider {
  readonly name: string;
  /** Version tag for the prompt/ruleset; part of the cache key. */
  readonly promptVersion: string;
  classify(bill: Pick<Bill, "title" | "full_text" | "state" | "bill_number">): Promise<Classification>;
}

export type ProviderName = "deterministic" | "anthropic" | "local";

/**
 * Resolve the active provider from env. NEVER defaults to a paid backend.
 * `LLM_PROVIDER=anthropic` + `ANTHROPIC_API_KEY` is required to leave the
 * deterministic baseline.
 */
export async function getProvider(
  override?: ProviderName,
): Promise<ClassifierProvider> {
  const name = (override ??
    (process.env.LLM_PROVIDER as ProviderName) ??
    "deterministic") as ProviderName;

  switch (name) {
    case "anthropic": {
      const { AnthropicProvider } = await import("./providers/anthropic");
      return new AnthropicProvider();
    }
    case "local": {
      const { LocalProvider } = await import("./providers/local");
      return new LocalProvider();
    }
    case "deterministic":
    default: {
      const { DeterministicProvider } = await import(
        "./providers/deterministic"
      );
      return new DeterministicProvider();
    }
  }
}
