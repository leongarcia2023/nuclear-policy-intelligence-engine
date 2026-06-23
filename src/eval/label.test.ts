import { describe, it, expect, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TSX = resolve(process.cwd(), "node_modules/.bin/tsx");
const SCRIPT = resolve(process.cwd(), "src/eval/label.ts");
// Isolated output — the labeler writes here via LABEL_OUT_PATH, never the
// committed (sacred) held-out file. Keeps this test off the shared file so it
// can't race the eval tests that read it.
const OUT = join(tmpdir(), `label-test-${process.pid}.jsonl`);

afterEach(() => {
  if (existsSync(OUT)) rmSync(OUT);
});

function dataLineCount(path: string): number {
  if (!existsSync(path)) return 0;
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.trim() && !l.trimStart().startsWith("#")).length;
}

/** Run the labeler with piped stdin against the isolated output path. */
function runLabel(lines: string[]): number {
  try {
    execFileSync(TSX, [SCRIPT], {
      input: lines.join("\n") + "\n",
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, LEGISCAN_API_KEY: "", LABEL_OUT_PATH: OUT },
    });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}

describe("held-out labeler — required fields hard-fail on blank (Fix A)", () => {
  it("aborts and writes NOTHING when a required field is left blank", () => {
    // paste flow, then BLANK for the required `relevant` field.
    const code = runLabel([
      "paste",
      "CO",
      "HB 1",
      "Title",
      "Some bill text without keywords.",
      ".",
      "", // blank relevant → must abort
      "y",
      "y",
      "helps",
      "",
      "support",
      "high",
      "note",
    ]);
    expect(code).not.toBe(0); // fatal
    expect(dataLineCount(OUT)).toBe(0); // nothing written
  });

  it("writes exactly one row when every required field is deliberately answered", () => {
    const code = runLabel([
      "paste",
      "CO",
      "HB 2",
      "Title",
      "An act on firm dispatchable clean resources.",
      ".",
      "y", // relevant
      "y", // is_indirect
      "n", // model_bill_risk
      "helps", // direction
      "clean_standard_eligibility", // primary_vectors
      "support", // expected_position
      "high", // materiality_band
      "coherent row",
    ]);
    expect(code).toBe(0);
    expect(dataLineCount(OUT)).toBe(1);
  });
});
