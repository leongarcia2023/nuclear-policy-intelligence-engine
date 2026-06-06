import type { DB } from "../db";
import { MaterialityScore } from "./schema";

export function saveScore(db: DB, score: MaterialityScore): void {
  db.prepare(
    `INSERT OR REPLACE INTO scores (bill_id, payload, weights_version, created_at)
     VALUES (?, ?, ?, ?)`,
  ).run(
    score.bill_id,
    JSON.stringify(score),
    score.weights_version,
    new Date().toISOString(),
  );
}

export function loadScore(db: DB, billId: string): MaterialityScore | null {
  const row = db
    .prepare(`SELECT payload FROM scores WHERE bill_id = ?`)
    .get(billId) as { payload: string } | undefined;
  return row ? MaterialityScore.parse(JSON.parse(row.payload)) : null;
}

export function allScores(db: DB): MaterialityScore[] {
  const rows = db.prepare(`SELECT payload FROM scores`).all() as {
    payload: string;
  }[];
  return rows.map((r) => MaterialityScore.parse(JSON.parse(r.payload)));
}
