import type { DB } from "../db";
import { Bill } from "./schema";
import {
  billsNeedingFetch,
  storedHashes,
  upsertBill,
} from "./repo";
import { LegiScanClient, type MasterListEntry } from "./legiscan";
import { loadGoldSeed } from "./fixtures";

export const DEFAULT_STATES = ["TX", "OH", "PA", "CA", "IL"] as const;

export type IngestResult = {
  source: "legiscan" | "fixture";
  states: string[];
  examined: number; // bills seen in the master list(s)
  fetched: number; // bills actually (re)fetched this run — the delta
  skipped: number; // unchanged bills skipped by delta logic
};

/**
 * Ingest current-session bills into SQLite.
 *
 * With a LegiScan key: pull each state's master list (cheap change_hash list),
 * compute the delta against stored hashes, and full-fetch only changed bills.
 * Without a key: load the gold_seed fixtures so the whole pipeline is testable
 * offline. Delta logic applies to fixtures too (second run skips unchanged).
 */
export async function ingest(
  db: DB,
  opts: {
    states?: readonly string[];
    apiKey?: string | undefined;
    log?: (msg: string) => void;
  } = {},
): Promise<IngestResult> {
  const log = opts.log ?? (() => {});
  const apiKey = opts.apiKey ?? process.env.LEGISCAN_API_KEY;

  if (!apiKey) {
    log("No LEGISCAN_API_KEY — ingesting gold_seed.jsonl fixtures.");
    return ingestFixtures(db, log);
  }
  return ingestLegiScan(db, opts.states ?? DEFAULT_STATES, apiKey, log);
}

function ingestFixtures(
  db: DB,
  log: (msg: string) => void,
): IngestResult {
  const cases = loadGoldSeed();
  const stored = storedHashes(db);
  const master = cases.map((c) => ({
    id: c.bill.id,
    change_hash: c.bill.change_hash,
  }));
  const toFetch = new Set(billsNeedingFetch(master, stored));

  let fetched = 0;
  const tx = db.transaction(() => {
    for (const c of cases) {
      if (!toFetch.has(c.bill.id)) continue;
      upsertBill(db, c.bill);
      fetched++;
    }
  });
  tx();

  const states = [...new Set(cases.map((c) => c.bill.state))].sort();
  log(
    `Fixtures: examined ${cases.length}, fetched ${fetched}, skipped ${cases.length - fetched}.`,
  );
  return {
    source: "fixture",
    states,
    examined: cases.length,
    fetched,
    skipped: cases.length - fetched,
  };
}

async function ingestLegiScan(
  db: DB,
  states: readonly string[],
  apiKey: string,
  log: (msg: string) => void,
): Promise<IngestResult> {
  const client = new LegiScanClient(apiKey);
  const stored = storedHashes(db);

  // 1. Cheap pass: gather change_hash for every bill across the pilot states.
  const master: (MasterListEntry & { state: string })[] = [];
  for (const state of states) {
    log(`getMasterListRaw ${state}…`);
    const list = await client.getMasterListRaw(state);
    for (const e of list) master.push({ ...e, state });
  }

  // 2. Delta: only bills whose change_hash moved need a full fetch.
  const toFetch = new Set(
    billsNeedingFetch(
      master.map((m) => ({ id: m.id, change_hash: m.change_hash })),
      stored,
    ),
  );
  log(`Delta: ${toFetch.size} of ${master.length} bills changed — fetching.`);

  // 3. Full fetch (rate-limited inside the client) only for the delta set.
  let fetched = 0;
  for (const m of master) {
    if (!toFetch.has(m.id)) continue;
    const meta = await client.getBill(m.legiscan_id);
    const text = await client.getLatestText(meta);
    const bill = Bill.parse({
      id: m.id,
      legiscan_id: m.legiscan_id,
      state: meta.state,
      bill_number: meta.bill_number,
      title: meta.title,
      sponsors: meta.sponsors,
      committee: meta.committee,
      stage: meta.stage,
      last_action: meta.last_action,
      history: meta.history,
      full_text: text,
      change_hash: m.change_hash,
      source: "legiscan",
      fetched_at: new Date().toISOString(),
    });
    upsertBill(db, bill);
    fetched++;
  }

  log(
    `LegiScan: examined ${master.length}, fetched ${fetched}, skipped ${master.length - fetched}.`,
  );
  return {
    source: "legiscan",
    states: [...states],
    examined: master.length,
    fetched,
    skipped: master.length - fetched,
  };
}
