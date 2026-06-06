import type { Bill } from "../../ingest/schema";
import type { ClassifierProvider } from "../provider";
import type { Classification } from "../schema";
import { PROMPT_VERSION } from "./anthropic";

/**
 * Optional local (Ollama) adapter — off by default, inert in this build.
 * Same seam as the Anthropic provider: a localized change wires the HTTP call
 * to a local model and validates with parseClassification(). Kept as a stub so
 * the provider factory has a third backend without adding any dependency.
 */
export class LocalProvider implements ClassifierProvider {
  readonly name = "local";
  readonly promptVersion = PROMPT_VERSION;

  async classify(
    _bill: Pick<Bill, "title" | "full_text" | "state" | "bill_number">,
  ): Promise<Classification> {
    throw new Error(
      "LocalProvider is an inert seam. Set LLM_PROVIDER=deterministic (the default) " +
        "for the zero-cost baseline, or implement the Ollama call here.",
    );
  }
}
