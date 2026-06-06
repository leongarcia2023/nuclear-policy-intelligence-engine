import { getDb } from "../db";
import { weeklyDigest } from "./digest";

/** CLI: `npm run memo` — print the top-N weekly digest of memos. */
async function main() {
  const db = getDb();
  const topN = process.env.DIGEST_TOP_N ? Number(process.env.DIGEST_TOP_N) : 5;
  const digest = await weeklyDigest(db, topN);

  console.log(`\n=== Signal Desk — Weekly Digest (top ${digest.length}) ===\n`);
  for (const e of digest) {
    const flag = e.is_indirect ? "  ⚑ INDIRECT — keyword search would miss this" : "";
    console.log(`▌ ${e.memo.bill_id} — ${e.memo.materiality_band.toUpperCase()} (${e.aggregate})${flag}`);
    console.log(`  ${e.memo.headline}`);
    console.log(`  WHAT:  ${e.memo.what_it_does}`);
    console.log(`  WHY:   ${e.memo.why_it_matters}`);
    console.log(`  POS:   ${e.memo.position.toUpperCase()} — ${e.memo.recommended_action}`);
    if (e.memo.citations.length) console.log(`  CITE:  ${e.memo.citations[0]}`);
    console.log("");
  }
}

main().catch((err) => {
  console.error("[memo] failed:", err);
  process.exit(1);
});
