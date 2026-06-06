import { getDb } from "../db";
import { allBills, getBill as getBillRow } from "../ingest/repo";
import { loadScore } from "../score/store";
import { loadMemo } from "../memo/store";
import {
  getRecordByBill,
  allRecords,
} from "../corpus/corpus";
import { loadCampaigns, campaignForBill } from "../campaign/store";
import { storedClassification } from "../classify/classify";
import { DeterministicProvider } from "../classify/providers/deterministic";
import { ONTOLOGY_VERSION } from "../classify/ontology";
import type { Bill } from "../ingest/schema";
import type { MaterialityScore } from "../score/schema";
import type { Memo } from "../memo/schema";
import type { CorpusRecord } from "../corpus/schema";
import type { Classification } from "../classify/schema";
import type { Campaign } from "../campaign/campaign";

// The UI runs on the deterministic (zero-API) provider.
const provider = new DeterministicProvider();
const PROMPT_VERSION = provider.promptVersion;

export type QueueRow = {
  id: string;
  state: string;
  title: string;
  aggregate: number;
  band: string;
  relevant: boolean;
  is_indirect: boolean;
  direction: string;
  position: string;
  headline: string;
  overridden: boolean;
};

/** Operator queue: every bill, sorted by materiality (desc), with the indirect flag. */
export function getQueue(): QueueRow[] {
  const db = getDb();
  const rows = allBills(db).map((bill) => {
    const score = loadScore(db, bill.id);
    const rec = getRecordByBill(db, bill.id, ONTOLOGY_VERSION, PROMPT_VERSION);
    const memo = loadMemo(db, bill.id);
    const label = rec?.active_label;
    return {
      id: bill.id,
      state: bill.state,
      title: bill.title,
      aggregate: score?.aggregate ?? 0,
      band: label?.materiality_band ?? score?.band ?? "none",
      relevant: label?.relevant ?? false,
      is_indirect: label?.is_indirect ?? false,
      direction: label?.direction ?? "neutral",
      position: label?.suggested_position ?? "monitor",
      headline: memo?.headline ?? "(not yet classified — run `npm run pipeline`)",
      overridden: !!rec?.override,
    };
  });
  rows.sort((a, b) => b.aggregate - a.aggregate || a.id.localeCompare(b.id));
  return rows;
}

export type BillView = {
  bill: Bill;
  classification: Classification | null;
  score: MaterialityScore | null;
  memo: Memo | null;
  record: CorpusRecord | null;
  campaign: Campaign | null;
};

export function getBillView(id: string): BillView | null {
  const db = getDb();
  const bill = getBillRow(db, id);
  if (!bill) return null;
  return {
    bill,
    classification: storedClassification(db, id, provider),
    score: loadScore(db, id),
    memo: loadMemo(db, id),
    record: getRecordByBill(db, id, ONTOLOGY_VERSION, PROMPT_VERSION),
    campaign: campaignForBill(db, id),
  };
}

export type CampaignView = {
  campaign: Campaign;
  members: { id: string; title: string; state: string; band: string }[];
};

export function getCampaignViews(): CampaignView[] {
  const db = getDb();
  return loadCampaigns(db).map((campaign) => {
    const members = campaign.members.map((mid) => {
      const b = getBillRow(db, mid);
      const score = loadScore(db, mid);
      return {
        id: mid,
        title: b?.title ?? mid,
        state: b?.state ?? mid.split(":")[0],
        band: score?.band ?? "none",
      };
    });
    return { campaign, members };
  });
}

/** Has the pipeline been run yet? Drives the empty-state. */
export function hasData(): boolean {
  return allRecords(getDb()).length > 0;
}
