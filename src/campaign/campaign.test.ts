import { describe, it, expect } from "vitest";
import type { Bill } from "../ingest/schema";
import { detectCampaigns, matchCountsByBill, COSINE_THRESHOLD } from "./campaign";
import { cosine, tfidfVectors, minhashJaccard, minhashSignature } from "./similarity";

/** A model bill replicated near-verbatim across states (only state/number/year vary). */
function modelBill(state: string, number: string): Bill {
  return {
    id: `${state}:${number}`,
    legiscan_id: null,
    state,
    bill_number: number,
    title: "Reliable Clean Energy Standard Act",
    sponsors: [],
    committee: null,
    stage: "introduced",
    last_action: "Introduced",
    history: [{ date: "2026-02-01", action: "Introduced" }],
    full_text:
      "An Act to establish a reliable clean energy standard. 'Eligible clean resource' " +
      "means any generation resource that produces electricity with zero direct carbon " +
      "dioxide emissions and is capable of firm, dispatchable output, including resources " +
      "providing baseload reliability service. Beginning in 2028 each electric distribution " +
      "utility shall procure no less than fifty percent of retail load from eligible clean " +
      "resources under a multi-year firm clean power procurement mechanism.",
    change_hash: `${state}-hash`,
    source: "fixture",
    fetched_at: "2026-02-01T00:00:00.000Z",
  } as unknown as Bill;
}

/** An unrelated distractor bill that shares some energy vocabulary. */
const distractor: Bill = {
  id: "WA:HB 9",
  legiscan_id: null,
  state: "WA",
  bill_number: "HB 9",
  title: "Once-Through Cooling Water Permit Act",
  sponsors: [],
  committee: null,
  stage: "introduced",
  last_action: "Introduced",
  history: [{ date: "2026-03-01", action: "Introduced" }],
  full_text:
    "An Act relating to thermal discharge permits. The department shall require a water " +
    "withdrawal permit and limit once-through cooling for industrial facilities near " +
    "sensitive watersheds, establishing seasonal temperature caps.",
  change_hash: "wa-hash",
  source: "fixture",
  fetched_at: "2026-03-01T00:00:00.000Z",
} as unknown as Bill;

describe("similarity primitives", () => {
  it("cosine: identical text ~1, disjoint text ~0", () => {
    const [a, b, c] = tfidfVectors([
      "firm dispatchable zero carbon clean resource",
      "firm dispatchable zero carbon clean resource",
      "school curriculum mathematics language arts standards",
    ]);
    expect(cosine(a, b)).toBeCloseTo(1, 5);
    expect(cosine(a, c)).toBeLessThan(0.1);
  });

  it("minhash Jaccard: near-identical high, different low", () => {
    const s1 = minhashSignature("the quick brown fox jumps over the lazy dog today");
    const s2 = minhashSignature("the quick brown fox jumps over the lazy dog today now");
    const s3 = minhashSignature("completely unrelated sentence about nuclear reactors siting");
    expect(minhashJaccard(s1, s2)).toBeGreaterThan(0.4);
    expect(minhashJaccard(s1, s3)).toBeLessThan(0.2);
  });
});

describe("cross-state campaign detection", () => {
  const bills = [
    modelBill("TX", "SB 100"),
    modelBill("OH", "HB 200"),
    modelBill("PA", "SB 300"),
    distractor,
  ];

  it("clusters near-duplicate bills across ≥3 states into one campaign", () => {
    const campaigns = detectCampaigns(bills);
    expect(campaigns.length).toBe(1);
    const c = campaigns[0];
    expect(c.members.sort()).toEqual(["OH:HB 200", "PA:SB 300", "TX:SB 100"]);
    expect(c.states).toEqual(["OH", "PA", "TX"]);
    expect(c.similarity).toBeGreaterThanOrEqual(COSINE_THRESHOLD);
    expect(c.first_seen).toBe("2026-02-01");
  });

  it("excludes the unrelated distractor bill from the campaign", () => {
    const campaigns = detectCampaigns(bills);
    expect(campaigns[0].members).not.toContain("WA:HB 9");
  });

  it("does not flag a single bill as a campaign", () => {
    expect(detectCampaigns([modelBill("TX", "SB 100"), distractor])).toEqual(
      detectCampaigns([modelBill("TX", "SB 100"), distractor]).filter(
        (c) => c.members.length >= 2,
      ),
    );
    // with only one model bill + one distractor, no cross-state cluster forms
    expect(detectCampaigns([modelBill("TX", "SB 100"), distractor]).length).toBe(0);
  });

  it("feeds cross-state match counts back for breadth (other-state count)", () => {
    const counts = matchCountsByBill(bills);
    expect(counts.get("TX:SB 100")).toBe(2); // OH + PA
    expect(counts.get("OH:HB 200")).toBe(2);
    expect(counts.get("WA:HB 9")).toBe(0);
  });
});
