import { z } from "zod";
import type { Bill } from "../ingest/schema";
import { sha256 } from "../util/hash";
import {
  cosine,
  minhashJaccard,
  minhashSignature,
  tfidfVectors,
} from "./similarity";

/**
 * Near-duplicate thresholds. Model/template bills are near-verbatim across
 * states, so they clear both a high TF-IDF cosine AND a high MinHash Jaccard.
 * Requiring BOTH suppresses false positives from two unrelated bills that
 * merely share energy-policy vocabulary.
 */
export const COSINE_THRESHOLD = 0.6;
export const JACCARD_THRESHOLD = 0.4;

export const Campaign = z.object({
  id: z.string(),
  headline: z.string(),
  members: z.array(z.string()), // bill ids
  states: z.array(z.string()),
  first_seen: z.string().nullable(),
  similarity: z.number(), // average pairwise cosine within the cluster
});
export type Campaign = z.infer<typeof Campaign>;

type Edge = { i: number; j: number; cos: number };

/** Union-find for clustering near-duplicate bills into campaigns. */
class UnionFind {
  private parent: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(x: number): number {
    while (this.parent[x] !== x) {
      this.parent[x] = this.parent[this.parent[x]];
      x = this.parent[x];
    }
    return x;
  }
  union(a: number, b: number): void {
    this.parent[this.find(a)] = this.find(b);
  }
}

function billText(b: Pick<Bill, "title" | "full_text">): string {
  return `${b.title}\n${b.full_text}`;
}

function firstSeen(b: Pick<Bill, "history" | "fetched_at">): string {
  const dates = b.history.map((h) => h.date).filter(Boolean);
  return dates.length ? dates.sort()[0] : b.fetched_at;
}

/**
 * Detect cross-state model-bill campaigns. Clusters bills whose pairwise
 * similarity exceeds the near-duplicate thresholds; a cluster is a Campaign
 * only if it spans ≥2 states (a single-state cluster is not a campaign).
 */
export function detectCampaigns(
  bills: Pick<Bill, "id" | "state" | "title" | "full_text" | "history" | "fetched_at">[],
): Campaign[] {
  const n = bills.length;
  if (n < 2) return [];

  const vectors = tfidfVectors(bills.map(billText));
  const sigs = bills.map((b) => minhashSignature(billText(b)));

  const uf = new UnionFind(n);
  const edges: Edge[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const cos = cosine(vectors[i], vectors[j]);
      const jac = minhashJaccard(sigs[i], sigs[j]);
      if (cos >= COSINE_THRESHOLD && jac >= JACCARD_THRESHOLD) {
        uf.union(i, j);
        edges.push({ i, j, cos });
      }
    }
  }

  // Group member indices by cluster root.
  const clusters = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = uf.find(i);
    (clusters.get(root) ?? clusters.set(root, []).get(root)!).push(i);
  }

  const campaigns: Campaign[] = [];
  for (const idxs of clusters.values()) {
    if (idxs.length < 2) continue;
    const states = [...new Set(idxs.map((k) => bills[k].state))].sort();
    if (states.length < 2) continue; // cross-state requirement

    const memberIds = idxs.map((k) => bills[k].id).sort();
    const inCluster = new Set(idxs);
    const clusterEdges = edges.filter(
      (e) => inCluster.has(e.i) && inCluster.has(e.j),
    );
    const avgCos =
      clusterEdges.reduce((s, e) => s + e.cos, 0) /
      Math.max(clusterEdges.length, 1);

    const repr = idxs
      .map((k) => bills[k])
      .sort((a, b) => a.title.length - b.title.length)[0];
    const fs = idxs
      .map((k) => firstSeen(bills[k]))
      .sort()[0];

    campaigns.push(
      Campaign.parse({
        id: `campaign:${sha256(memberIds.join("|")).slice(0, 12)}`,
        headline: `Model bill: ${repr.title}`,
        members: memberIds,
        states,
        first_seen: fs ?? null,
        similarity: Number(avgCos.toFixed(3)),
      }),
    );
  }

  // Stable ordering: largest campaigns first, then by id.
  campaigns.sort(
    (a, b) => b.members.length - a.members.length || a.id.localeCompare(b.id),
  );
  return campaigns;
}

/**
 * For each bill, the number of OTHER states carrying a near-duplicate. Feeds
 * Phase 3 `breadth`. Bills not in any campaign map to 0.
 */
export function matchCountsByBill(
  bills: Pick<Bill, "id" | "state" | "title" | "full_text" | "history" | "fetched_at">[],
): Map<string, number> {
  const out = new Map<string, number>(bills.map((b) => [b.id, 0]));
  const campaigns = detectCampaigns(bills);
  const byId = new Map(bills.map((b) => [b.id, b]));
  for (const c of campaigns) {
    for (const memberId of c.members) {
      const bill = byId.get(memberId);
      if (!bill) continue;
      const others = c.states.filter((s) => s !== bill.state).length;
      out.set(memberId, others);
    }
  }
  return out;
}
