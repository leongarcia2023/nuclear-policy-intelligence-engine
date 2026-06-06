import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * Single local SQLite store. The DB file is gitignored (see .gitignore).
 * Synchronous (better-sqlite3) — simplest for a local store + tests.
 *
 * Pass `:memory:` for an isolated in-memory DB (used by unit tests).
 */
export type DB = Database.Database;

const DEFAULT_PATH = resolve(process.cwd(), "data", "nuclear.db");

let singleton: DB | null = null;

export function openDb(path: string = DEFAULT_PATH): DB {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

/** Process-wide shared connection for the CLI runners and the Next.js app. */
export function getDb(): DB {
  if (!singleton) singleton = openDb();
  return singleton;
}

/**
 * Idempotent schema migration. Tables for every phase live here so a fresh
 * checkout boots a complete store; each phase only writes the tables it owns.
 */
export function migrate(db: DB): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS bills (
      id            TEXT PRIMARY KEY,          -- "<STATE>:<bill_number>", stable across runs
      legiscan_id   INTEGER,                   -- LegiScan bill_id (null for fixtures)
      state         TEXT NOT NULL,
      bill_number   TEXT NOT NULL,
      title         TEXT NOT NULL,
      sponsors      TEXT NOT NULL DEFAULT '[]', -- JSON array
      committee     TEXT,
      stage         TEXT NOT NULL DEFAULT 'introduced',
      last_action   TEXT,
      history       TEXT NOT NULL DEFAULT '[]', -- JSON array of {date, action, chamber}
      full_text     TEXT NOT NULL DEFAULT '',
      change_hash   TEXT NOT NULL,             -- LegiScan change_hash; drives delta logic
      source        TEXT NOT NULL DEFAULT 'legiscan', -- 'legiscan' | 'fixture'
      fetched_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS classifications (
      bill_id          TEXT NOT NULL,
      provider         TEXT NOT NULL,
      ontology_version TEXT NOT NULL,
      prompt_version   TEXT NOT NULL,
      text_sha         TEXT NOT NULL,
      payload          TEXT NOT NULL,          -- JSON (Classification schema)
      created_at       TEXT NOT NULL,
      PRIMARY KEY (bill_id, provider, ontology_version, prompt_version, text_sha)
    );

    CREATE TABLE IF NOT EXISTS scores (
      bill_id         TEXT PRIMARY KEY,
      payload         TEXT NOT NULL,           -- JSON (MaterialityScore schema)
      weights_version TEXT NOT NULL,
      created_at      TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id          TEXT PRIMARY KEY,
      headline    TEXT NOT NULL,
      states      TEXT NOT NULL,               -- JSON array
      first_seen  TEXT,
      similarity  REAL NOT NULL,
      created_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS campaign_members (
      campaign_id TEXT NOT NULL,
      bill_id     TEXT NOT NULL,
      PRIMARY KEY (campaign_id, bill_id)
    );

    CREATE TABLE IF NOT EXISTS corpus (
      record_id        TEXT PRIMARY KEY,       -- "<bill_id>@<ontology_version>/<prompt_version>"
      bill_id          TEXT NOT NULL,
      ontology_version TEXT NOT NULL,
      prompt_version   TEXT NOT NULL,
      model_label      TEXT NOT NULL,          -- JSON of the model's classification label
      active_label     TEXT NOT NULL,          -- JSON; equals model_label until overridden
      override_label   TEXT,                   -- JSON; set when a human corrects
      override_by      TEXT,
      override_at      TEXT,
      score            TEXT,                   -- JSON snapshot
      memo             TEXT,                   -- JSON snapshot
      history          TEXT NOT NULL DEFAULT '[]', -- JSON array of prior labels
      created_at       TEXT NOT NULL,
      updated_at       TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}
