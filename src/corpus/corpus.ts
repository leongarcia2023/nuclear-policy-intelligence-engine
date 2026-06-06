import type { DB } from "../db";
import type { Classification } from "../classify/schema";
import type { MaterialityScore } from "../score/schema";
import { CorpusRecord, recordId } from "./schema";
import { Label, modelLabel } from "./label";

type Row = {
  record_id: string;
  bill_id: string;
  ontology_version: string;
  prompt_version: string;
  provider: string;
  model_label: string;
  active_label: string;
  override_label: string | null;
  override_by: string | null;
  override_at: string | null;
  score: string | null;
  memo: string | null;
  history: string;
  created_at: string;
  updated_at: string;
};

function rowToRecord(r: Row): CorpusRecord {
  return CorpusRecord.parse({
    record_id: r.record_id,
    bill_id: r.bill_id,
    ontology_version: r.ontology_version,
    prompt_version: r.prompt_version,
    provider: r.provider,
    model_label: JSON.parse(r.model_label),
    active_label: JSON.parse(r.active_label),
    override:
      r.override_label && r.override_by && r.override_at
        ? {
            label: JSON.parse(r.override_label),
            by: r.override_by,
            at: r.override_at,
          }
        : null,
    score: r.score ? JSON.parse(r.score) : null,
    memo: r.memo ? JSON.parse(r.memo) : null,
    history: JSON.parse(r.history),
    created_at: r.created_at,
    updated_at: r.updated_at,
  });
}

export function getRecord(db: DB, recId: string): CorpusRecord | null {
  const row = db.prepare(`SELECT * FROM corpus WHERE record_id = ?`).get(recId) as
    | Row
    | undefined;
  return row ? rowToRecord(row) : null;
}

export function getRecordByBill(
  db: DB,
  billId: string,
  ontologyVersion: string,
  promptVersion: string,
): CorpusRecord | null {
  return getRecord(db, recordId(billId, ontologyVersion, promptVersion));
}

export function allRecords(db: DB): CorpusRecord[] {
  const rows = db
    .prepare(`SELECT * FROM corpus ORDER BY record_id`)
    .all() as Row[];
  return rows.map(rowToRecord);
}

function writeRecord(db: DB, rec: CorpusRecord): void {
  db.prepare(
    `INSERT OR REPLACE INTO corpus
       (record_id, bill_id, ontology_version, prompt_version, provider,
        model_label, active_label, override_label, override_by, override_at,
        score, memo, history, created_at, updated_at)
     VALUES
       (@record_id, @bill_id, @ontology_version, @prompt_version, @provider,
        @model_label, @active_label, @override_label, @override_by, @override_at,
        @score, @memo, @history, @created_at, @updated_at)`,
  ).run({
    record_id: rec.record_id,
    bill_id: rec.bill_id,
    ontology_version: rec.ontology_version,
    prompt_version: rec.prompt_version,
    provider: rec.provider,
    model_label: JSON.stringify(rec.model_label),
    active_label: JSON.stringify(rec.active_label),
    override_label: rec.override ? JSON.stringify(rec.override.label) : null,
    override_by: rec.override?.by ?? null,
    override_at: rec.override?.at ?? null,
    score: rec.score ? JSON.stringify(rec.score) : null,
    memo: rec.memo !== null && rec.memo !== undefined ? JSON.stringify(rec.memo) : null,
    history: JSON.stringify(rec.history),
    created_at: rec.created_at,
    updated_at: rec.updated_at,
  });
}

/**
 * Upsert a record from the latest classification + score (+ optional memo).
 * CRITICAL: a re-run refreshes model_label/score/memo but PRESERVES any human
 * override as the active label — the pipeline never erases human judgment.
 */
export function upsertFromPipeline(
  db: DB,
  args: {
    billId: string;
    classification: Classification;
    score: MaterialityScore | null;
    memo?: unknown;
  },
): CorpusRecord {
  const { billId, classification, score } = args;
  const recId = recordId(
    billId,
    classification.ontology_version,
    classification.prompt_version,
  );
  const existing = getRecord(db, recId);
  const now = new Date().toISOString();
  const ml = modelLabel(classification, score);

  const rec: CorpusRecord = {
    record_id: recId,
    bill_id: billId,
    ontology_version: classification.ontology_version,
    prompt_version: classification.prompt_version,
    provider: classification.provider,
    model_label: ml,
    // Preserve a human override as active; otherwise track the model.
    active_label: existing?.override ? existing.override.label : ml,
    override: existing?.override ?? null,
    score,
    memo: args.memo ?? existing?.memo ?? null,
    history: existing?.history ?? [
      { label: ml, source: "model", at: now },
    ],
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
  writeRecord(db, rec);
  return rec;
}

/**
 * Apply a human override. The prior active label is pushed to history (never
 * deleted); the override becomes the active label and supersedes the model.
 */
export function applyOverride(
  db: DB,
  args: {
    recordId: string;
    correction: Partial<Label> & Pick<Label, "relevant">;
    by: string;
    note?: string;
  },
): CorpusRecord {
  const existing = getRecord(db, args.recordId);
  if (!existing) throw new Error(`No corpus record: ${args.recordId}`);
  const now = new Date().toISOString();

  // Merge the correction onto the current active label.
  const merged = Label.parse({ ...existing.active_label, ...args.correction });

  const history = [
    ...existing.history,
    {
      label: existing.active_label,
      source: existing.override ? "override" : "model",
      at: existing.updated_at,
      by: existing.override?.by,
    },
  ];

  const rec: CorpusRecord = {
    ...existing,
    active_label: merged,
    override: { label: merged, by: args.by, at: now, note: args.note },
    history,
    updated_at: now,
  };
  writeRecord(db, rec);
  return rec;
}
