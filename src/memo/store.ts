import type { DB } from "../db";
import type { Bill } from "../ingest/schema";
import type { Classification } from "../classify/schema";
import type { MaterialityScore } from "../score/schema";
import { sha256 } from "../util/hash";
import { Memo } from "./schema";
import { generateMemo, MEMO_GENERATOR } from "./generate";

function cacheKey(bill: Pick<Bill, "title" | "full_text">, c: Classification): string {
  return sha256(
    `${bill.title}\n${bill.full_text}|${c.ontology_version}|${c.prompt_version}|${MEMO_GENERATOR}`,
  );
}

/**
 * Get a memo for a bill, generating + caching on a miss. On a cache hit the
 * generator is not re-run (and a future LLM backend would make zero calls).
 */
export function getOrCreateMemo(
  db: DB,
  bill: Pick<Bill, "id" | "title" | "full_text">,
  c: Classification,
  score: MaterialityScore | null,
): { memo: Memo; cached: boolean } {
  const key = cacheKey(bill, c);
  const row = db
    .prepare(`SELECT payload, cache_key FROM memos WHERE bill_id = ?`)
    .get(bill.id) as { payload: string; cache_key: string } | undefined;
  if (row && row.cache_key === key) {
    return { memo: Memo.parse(JSON.parse(row.payload)), cached: true };
  }
  const memo = generateMemo(bill, c, score);
  db.prepare(
    `INSERT OR REPLACE INTO memos (bill_id, payload, cache_key, created_at)
     VALUES (?, ?, ?, ?)`,
  ).run(bill.id, JSON.stringify(memo), key, new Date().toISOString());
  return { memo, cached: false };
}

export function loadMemo(db: DB, billId: string): Memo | null {
  const row = db
    .prepare(`SELECT payload FROM memos WHERE bill_id = ?`)
    .get(billId) as { payload: string } | undefined;
  return row ? Memo.parse(JSON.parse(row.payload)) : null;
}
