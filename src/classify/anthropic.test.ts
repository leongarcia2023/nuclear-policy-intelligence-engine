import { describe, it, expect } from "vitest";
import { parseAnthropicResponse, PROMPT_VERSION } from "./providers/anthropic";
import { ONTOLOGY_VERSION } from "./ontology";
import { Classification } from "./schema";

const MODEL_JSON = JSON.stringify({
  relevant: true,
  confidence: 0.82,
  is_indirect: true,
  model_bill_risk: true,
  direction: "hurts",
  headline: "Green-titled CES that excludes nuclear",
  impact_vectors: [
    {
      vector: "clean_standard_eligibility",
      direction: "hurts",
      rationale: "Closed renewable list omits nuclear.",
    },
  ],
});

describe("AnthropicProvider response parsing (no API call)", () => {
  it("parses a clean JSON response into a valid Classification", () => {
    const c = parseAnthropicResponse(MODEL_JSON);
    expect(() => Classification.parse(c)).not.toThrow();
    expect(c.relevant).toBe(true);
    expect(c.direction).toBe("hurts");
    expect(c.impact_vectors[0].vector).toBe("clean_standard_eligibility");
  });

  it("stamps authoritative provenance (not the model's)", () => {
    // Even if the model emits bogus provenance, we override it.
    const withBogus = JSON.stringify({
      ...JSON.parse(MODEL_JSON),
      provider: "totally-made-up",
      ontology_version: "v999",
      prompt_version: "hacked",
    });
    const c = parseAnthropicResponse(withBogus);
    expect(c.provider).toBe("anthropic");
    expect(c.ontology_version).toBe(ONTOLOGY_VERSION);
    expect(c.prompt_version).toBe(PROMPT_VERSION);
  });

  it("tolerates code fences and surrounding prose", () => {
    const fenced = "Here is the classification:\n```json\n" + MODEL_JSON + "\n```\nDone.";
    const c = parseAnthropicResponse(fenced);
    expect(c.relevant).toBe(true);
  });

  it("rejects malformed model output via the shared Zod contract", () => {
    const badShape = JSON.stringify({ relevant: "yes", confidence: 5 });
    expect(() => parseAnthropicResponse(badShape)).toThrow();
  });

  it("throws when there is no JSON object at all", () => {
    expect(() => parseAnthropicResponse("I cannot help with that.")).toThrow();
  });
});

describe("AnthropicProvider stays inert without a key", () => {
  it("the constructor refuses without ANTHROPIC_API_KEY", async () => {
    const { AnthropicProvider } = await import("./providers/anthropic");
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      expect(() => new AnthropicProvider()).toThrow(/ANTHROPIC_API_KEY/);
    } finally {
      if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
    }
  });

  it("getProvider() with no override/env is deterministic", async () => {
    const { getProvider } = await import("./provider");
    const saved = process.env.LLM_PROVIDER;
    delete process.env.LLM_PROVIDER;
    try {
      const p = await getProvider();
      expect(p.name).toBe("deterministic");
    } finally {
      if (saved !== undefined) process.env.LLM_PROVIDER = saved;
    }
  });
});
