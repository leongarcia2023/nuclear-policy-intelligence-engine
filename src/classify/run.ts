import { getDb } from "../db";
import { classifyAll } from "./classify";

/** CLI: `npm run classify` — classify all stored bills with the active provider. */
async function main() {
  const db = getDb();
  const outcomes = await classifyAll(db, {
    log: (m) => console.log(`[classify] ${m}`),
  });
  for (const o of outcomes) {
    const c = o.classification;
    const flag = c.is_indirect ? " [INDIRECT]" : "";
    console.log(
      `[classify] ${o.billId}: relevant=${c.relevant} dir=${c.direction} ` +
        `conf=${c.confidence}${flag} ${o.cached ? "(cache)" : ""} — ${c.headline}`,
    );
  }
}

main().catch((err) => {
  console.error("[classify] failed:", err);
  process.exit(1);
});
