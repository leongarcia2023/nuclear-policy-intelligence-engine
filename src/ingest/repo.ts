import type { DB } from "../db";
import { Bill } from "./schema";

/** Row shape as stored (JSON columns are strings). */
type BillRow = {
  id: string;
  legiscan_id: number | null;
  state: string;
  bill_number: string;
  title: string;
  sponsors: string;
  committee: string | null;
  stage: string;
  last_action: string | null;
  history: string;
  full_text: string;
  change_hash: string;
  source: string;
  fetched_at: string;
};

function rowToBill(r: BillRow): Bill {
  return Bill.parse({
    id: r.id,
    legiscan_id: r.legiscan_id,
    state: r.state,
    bill_number: r.bill_number,
    title: r.title,
    sponsors: JSON.parse(r.sponsors),
    committee: r.committee,
    stage: r.stage,
    last_action: r.last_action,
    history: JSON.parse(r.history),
    full_text: r.full_text,
    change_hash: r.change_hash,
    source: r.source,
    fetched_at: r.fetched_at,
  });
}

export function upsertBill(db: DB, bill: Bill): void {
  db.prepare(
    `INSERT INTO bills
       (id, legiscan_id, state, bill_number, title, sponsors, committee,
        stage, last_action, history, full_text, change_hash, source, fetched_at)
     VALUES
       (@id, @legiscan_id, @state, @bill_number, @title, @sponsors, @committee,
        @stage, @last_action, @history, @full_text, @change_hash, @source, @fetched_at)
     ON CONFLICT(id) DO UPDATE SET
        legiscan_id = excluded.legiscan_id,
        title       = excluded.title,
        sponsors    = excluded.sponsors,
        committee   = excluded.committee,
        stage       = excluded.stage,
        last_action = excluded.last_action,
        history     = excluded.history,
        full_text   = excluded.full_text,
        change_hash = excluded.change_hash,
        source      = excluded.source,
        fetched_at  = excluded.fetched_at`,
  ).run({
    ...bill,
    sponsors: JSON.stringify(bill.sponsors),
    history: JSON.stringify(bill.history),
  });
}

export function getBill(db: DB, id: string): Bill | null {
  const row = db.prepare(`SELECT * FROM bills WHERE id = ?`).get(id) as
    | BillRow
    | undefined;
  return row ? rowToBill(row) : null;
}

export function allBills(db: DB): Bill[] {
  const rows = db
    .prepare(`SELECT * FROM bills ORDER BY id`)
    .all() as BillRow[];
  return rows.map(rowToBill);
}

/** Map of bill id -> stored change_hash, for delta comparison. */
export function storedHashes(db: DB): Map<string, string> {
  const rows = db.prepare(`SELECT id, change_hash FROM bills`).all() as {
    id: string;
    change_hash: string;
  }[];
  return new Map(rows.map((r) => [r.id, r.change_hash]));
}

/**
 * Core delta logic, pure and unit-testable.
 * Given the master list (id + current change_hash) and the hashes already
 * stored, return only the ids whose hash is new or changed — i.e. the bills
 * that actually need a (rate-limited) full fetch.
 */
export function billsNeedingFetch(
  master: { id: string; change_hash: string }[],
  stored: Map<string, string>,
): string[] {
  const out: string[] = [];
  for (const m of master) {
    const prev = stored.get(m.id);
    if (prev === undefined || prev !== m.change_hash) out.push(m.id);
  }
  return out;
}
