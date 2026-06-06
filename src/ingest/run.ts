import { getDb } from "../db";
import { ingest, DEFAULT_STATES } from "./ingest";

/**
 * CLI: `npm run ingest`
 * Optional env: INGEST_STATES="TX,OH,PA" to override the pilot states.
 */
async function main() {
  const db = getDb();
  const statesEnv = process.env.INGEST_STATES;
  const states = statesEnv
    ? statesEnv.split(",").map((s) => s.trim().toUpperCase())
    : DEFAULT_STATES;

  const result = await ingest(db, {
    states,
    log: (m) => console.log(`[ingest] ${m}`),
  });

  console.log(
    `[ingest] done — source=${result.source} states=${result.states.join(",")} ` +
      `examined=${result.examined} fetched=${result.fetched} skipped=${result.skipped}`,
  );
}

main().catch((err) => {
  console.error("[ingest] failed:", err);
  process.exit(1);
});
