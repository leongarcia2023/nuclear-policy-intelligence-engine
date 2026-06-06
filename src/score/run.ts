import { getDb } from "../db";
import { allBills } from "../ingest/repo";
import { getProvider } from "../classify/provider";
import { classifyBill } from "../classify/classify";
import { matchCountsByBill } from "../campaign/campaign";
import { scoreBill } from "./score";
import { saveScore } from "./store";

/** CLI: `npm run score` — score every stored bill and persist. */
async function main() {
  const db = getDb();
  const provider = await getProvider();
  const bills = allBills(db);

  // Cross-state match counts (Phase 4) feed breadth: a bill with near-duplicates
  // in other states scores broader. 0 for single-asset / unique bills.
  const matchCounts = matchCountsByBill(bills);

  for (const bill of bills) {
    const { classification } = await classifyBill(db, bill, provider);
    const score = scoreBill({
      bill,
      classification,
      campaignMatchCount: matchCounts.get(bill.id) ?? 0,
    });
    saveScore(db, score);
    console.log(
      `[score] ${bill.id}: ${score.aggregate} (${score.band}) ` +
        `P=${score.components.passage_likelihood.score} ` +
        `M=${score.components.economic_magnitude.score} ` +
        `B=${score.components.breadth.score} ` +
        `U=${score.components.urgency.score}`,
    );
  }
}

main().catch((err) => {
  console.error("[score] failed:", err);
  process.exit(1);
});
