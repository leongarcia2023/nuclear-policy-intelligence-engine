import type { DB } from "../db";
import { sha256 } from "../util/hash";
import { Classification, parseClassification } from "./schema";

/**
 * Classification cache, keyed by (sha256(bill_text), ontology_version,
 * prompt_version, provider). A re-run with unchanged text and unchanged
 * ontology/prompt costs nothing — critical for the (future) paid backend and
 * for fast, deterministic re-runs now.
 */
export function textSha(billText: string): string {
  return sha256(billText);
}

export function readCache(
  db: DB,
  params: {
    billId: string;
    provider: string;
    ontologyVersion: string;
    promptVersion: string;
    textSha: string;
  },
): Classification | null {
  const row = db
    .prepare(
      `SELECT payload FROM classifications
       WHERE bill_id = ? AND provider = ? AND ontology_version = ?
         AND prompt_version = ? AND text_sha = ?`,
    )
    .get(
      params.billId,
      params.provider,
      params.ontologyVersion,
      params.promptVersion,
      params.textSha,
    ) as { payload: string } | undefined;
  if (!row) return null;
  return parseClassification(JSON.parse(row.payload));
}

export function writeCache(
  db: DB,
  params: {
    billId: string;
    provider: string;
    ontologyVersion: string;
    promptVersion: string;
    textSha: string;
    payload: Classification;
  },
): void {
  db.prepare(
    `INSERT OR REPLACE INTO classifications
       (bill_id, provider, ontology_version, prompt_version, text_sha, payload, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    params.billId,
    params.provider,
    params.ontologyVersion,
    params.promptVersion,
    params.textSha,
    JSON.stringify(params.payload),
    new Date().toISOString(),
  );
}
