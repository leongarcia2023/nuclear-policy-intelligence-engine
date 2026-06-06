import { getDb } from "../db";
import { ingest, DEFAULT_STATES } from "../ingest/ingest";
import { allBills } from "../ingest/repo";
import { getProvider } from "../classify/provider";
import { classifyBill } from "../classify/classify";
import { detectCampaigns, matchCountsByBill } from "../campaign/campaign";
import { saveCampaigns } from "../campaign/store";
import { scoreBill } from "../score/score";
import { saveScore } from "../score/store";
import { getOrCreateMemo } from "../memo/store";
import { upsertFromPipeline } from "../corpus/corpus";

/**
 * CLI: `npm run pipeline` — run the whole chain end to end so the Signal Desk
 * has data: ingest → classify → campaign → score → memo → corpus.
 * Zero paid APIs (deterministic provider, fixtures if no LegiScan key).
 */
async function main() {
  const db = getDb();
  const log = (m: string) => console.log(`[pipeline] ${m}`);

  const ing = await ingest(db, { states: DEFAULT_STATES, log });
  const provider = await getProvider();
  log(`provider=${provider.name}`);

  const bills = allBills(db);

  // Campaigns first (breadth feeds scoring).
  const campaigns = detectCampaigns(bills);
  saveCampaigns(db, campaigns);
  const matchCounts = matchCountsByBill(bills);
  log(`campaigns: ${campaigns.length}`);

  for (const bill of bills) {
    const { classification } = await classifyBill(db, bill, provider);
    const score = scoreBill({
      bill,
      classification,
      campaignMatchCount: matchCounts.get(bill.id) ?? 0,
    });
    saveScore(db, score);
    getOrCreateMemo(db, bill, classification, score);
    upsertFromPipeline(db, { billId: bill.id, classification, score });
  }

  log(
    `done — ${bills.length} bills (source=${ing.source}). Run \`npm run dev\` and open /desk.`,
  );
}

main().catch((err) => {
  console.error("[pipeline] failed:", err);
  process.exit(1);
});
