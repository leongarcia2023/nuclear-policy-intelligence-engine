import type { DB } from "../db";
import { Campaign } from "./campaign";

export function saveCampaigns(db: DB, campaigns: Campaign[]): void {
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM campaign_members`).run();
    db.prepare(`DELETE FROM campaigns`).run();
    for (const c of campaigns) {
      db.prepare(
        `INSERT INTO campaigns (id, headline, states, first_seen, similarity, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(c.id, c.headline, JSON.stringify(c.states), c.first_seen, c.similarity, now);
      for (const billId of c.members) {
        db.prepare(
          `INSERT OR REPLACE INTO campaign_members (campaign_id, bill_id) VALUES (?, ?)`,
        ).run(c.id, billId);
      }
    }
  });
  tx();
}

export function loadCampaigns(db: DB): Campaign[] {
  const rows = db
    .prepare(`SELECT * FROM campaigns ORDER BY similarity DESC`)
    .all() as {
    id: string;
    headline: string;
    states: string;
    first_seen: string | null;
    similarity: number;
  }[];
  return rows.map((r) => {
    const members = (
      db
        .prepare(`SELECT bill_id FROM campaign_members WHERE campaign_id = ?`)
        .all(r.id) as { bill_id: string }[]
    ).map((m) => m.bill_id);
    return Campaign.parse({
      id: r.id,
      headline: r.headline,
      members,
      states: JSON.parse(r.states),
      first_seen: r.first_seen,
      similarity: r.similarity,
    });
  });
}

/** Look up the campaign a given bill belongs to, if any. */
export function campaignForBill(db: DB, billId: string): Campaign | null {
  const row = db
    .prepare(`SELECT campaign_id FROM campaign_members WHERE bill_id = ?`)
    .get(billId) as { campaign_id: string } | undefined;
  if (!row) return null;
  return loadCampaigns(db).find((c) => c.id === row.campaign_id) ?? null;
}
