import { describe, it, expect } from "vitest";

// Phase 0 smoke test: proves the test runner is wired up.
// Real suites live alongside each module (src/<area>/*.test.ts).
describe("scaffold", () => {
  it("runs the test runner", () => {
    expect(1 + 1).toBe(2);
  });
});
