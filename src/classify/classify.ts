import type { DB } from "../db";
import type { Bill } from "../ingest/schema";
import { allBills, getBill } from "../ingest/repo";
import { getProvider, type ClassifierProvider, type ProviderName } from "./provider";
import { Classification } from "./schema";
import { readCache, writeCache, textSha } from "./cache";
import { ONTOLOGY_VERSION } from "./ontology";

export type ClassifyOutcome = {
  billId: string;
  classification: Classification;
  cached: boolean; // true => provider was NOT called (zero cost)
};

/**
 * Classify one bill through the active provider, with caching keyed by
 * (text sha, ontology version, prompt version, provider). On a cache hit the
 * provider is never invoked — so a re-run makes zero API calls.
 */
export async function classifyBill(
  db: DB,
  bill: Pick<Bill, "id" | "title" | "full_text" | "state" | "bill_number">,
  provider: ClassifierProvider,
): Promise<ClassifyOutcome> {
  const sha = textSha(`${bill.title}\n${bill.full_text}`);
  const key = {
    billId: bill.id,
    provider: provider.name,
    ontologyVersion: ONTOLOGY_VERSION,
    promptVersion: provider.promptVersion,
    textSha: sha,
  };

  const hit = readCache(db, key);
  if (hit) return { billId: bill.id, classification: hit, cached: true };

  const classification = await provider.classify(bill);
  writeCache(db, { ...key, payload: classification });
  return { billId: bill.id, classification, cached: false };
}

/** Classify every stored bill. Returns outcomes (with cache-hit flags). */
export async function classifyAll(
  db: DB,
  opts: { provider?: ProviderName; log?: (m: string) => void } = {},
): Promise<ClassifyOutcome[]> {
  const log = opts.log ?? (() => {});
  const provider = await getProvider(opts.provider);
  const bills = allBills(db);
  const out: ClassifyOutcome[] = [];
  for (const b of bills) {
    const o = await classifyBill(db, b, provider);
    out.push(o);
  }
  const calls = out.filter((o) => !o.cached).length;
  log(
    `classify[${provider.name}]: ${out.length} bills, ${calls} provider calls, ${out.length - calls} cache hits.`,
  );
  return out;
}

/** Load a single bill's stored classification (active provider), if present. */
export function storedClassification(
  db: DB,
  billId: string,
  provider: ClassifierProvider,
): Classification | null {
  const bill = getBill(db, billId);
  if (!bill) return null;
  const sha = textSha(`${bill.title}\n${bill.full_text}`);
  return readCache(db, {
    billId,
    provider: provider.name,
    ontologyVersion: ONTOLOGY_VERSION,
    promptVersion: provider.promptVersion,
    textSha: sha,
  });
}
