import type { DB } from "../db";
import { allBills } from "../ingest/repo";
import { getProvider } from "../classify/provider";
import { classifyBill } from "../classify/classify";
import { matchCountsByBill } from "../campaign/campaign";
import { scoreBill } from "../score/score";
import { saveScore } from "../score/store";
import { upsertFromPipeline } from "./corpus";
import type { CorpusRecord } from "./schema";

/**
 * Build/refresh the judgment corpus from the current store: classify + score
 * every bill and persist a versioned record. Human overrides are preserved.
 */
export async function buildCorpus(
  db: DB,
  opts: { log?: (m: string) => void } = {},
): Promise<CorpusRecord[]> {
  const log = opts.log ?? (() => {});
  const provider = await getProvider();
  const bills = allBills(db);
  const matchCounts = matchCountsByBill(bills);

  const records: CorpusRecord[] = [];
  for (const bill of bills) {
    const { classification } = await classifyBill(db, bill, provider);
    const score = scoreBill({
      bill,
      classification,
      campaignMatchCount: matchCounts.get(bill.id) ?? 0,
    });
    saveScore(db, score);
    records.push(
      upsertFromPipeline(db, { billId: bill.id, classification, score }),
    );
  }
  log(`corpus: ${records.length} records (provider=${provider.name}).`);
  return records;
}
