import type { DB } from "../db";
import { allBills } from "../ingest/repo";
import { getProvider } from "../classify/provider";
import { classifyBill } from "../classify/classify";
import { matchCountsByBill } from "../campaign/campaign";
import { scoreBill } from "../score/score";
import { getOrCreateMemo } from "./store";
import type { Memo } from "./schema";

export type DigestEntry = { memo: Memo; aggregate: number; is_indirect: boolean };

/**
 * Weekly digest: the top-N bills by materiality across the store, each with a
 * position-ready memo. Deterministic ordering (aggregate desc, then bill id).
 */
export async function weeklyDigest(db: DB, topN = 5): Promise<DigestEntry[]> {
  const provider = await getProvider();
  const bills = allBills(db);
  const matchCounts = matchCountsByBill(bills);

  const entries: DigestEntry[] = [];
  for (const bill of bills) {
    const { classification } = await classifyBill(db, bill, provider);
    const score = scoreBill({
      bill,
      classification,
      campaignMatchCount: matchCounts.get(bill.id) ?? 0,
    });
    const { memo } = getOrCreateMemo(db, bill, classification, score);
    entries.push({
      memo,
      aggregate: score.aggregate,
      is_indirect: classification.is_indirect,
    });
  }

  entries.sort(
    (a, b) =>
      b.aggregate - a.aggregate || a.memo.bill_id.localeCompare(b.memo.bill_id),
  );
  return entries.slice(0, topN);
}
