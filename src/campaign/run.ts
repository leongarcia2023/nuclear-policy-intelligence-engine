import { getDb } from "../db";
import { allBills } from "../ingest/repo";
import { detectCampaigns } from "./campaign";
import { saveCampaigns } from "./store";

/** CLI: `npm run campaign` — detect cross-state model-bill campaigns and persist. */
async function main() {
  const db = getDb();
  const bills = allBills(db);
  const campaigns = detectCampaigns(bills);
  saveCampaigns(db, campaigns);

  if (campaigns.length === 0) {
    console.log(
      `[campaign] no cross-state model-bill campaigns among ${bills.length} bills ` +
        `(the 6-case gold fixture has no near-duplicates by design).`,
    );
  }
  for (const c of campaigns) {
    console.log(
      `[campaign] ${c.id} sim=${c.similarity} states=${c.states.join(",")} ` +
        `members=${c.members.join(", ")} — ${c.headline}`,
    );
  }
}

main().catch((err) => {
  console.error("[campaign] failed:", err);
  process.exit(1);
});
