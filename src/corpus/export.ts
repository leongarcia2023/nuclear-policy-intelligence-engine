import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { DB } from "../db";
import { getDb } from "../db";
import { allRecords } from "./corpus";
import { buildCorpus } from "./build";

export const DEFAULT_EXPORT_PATH = resolve(process.cwd(), "corpus.export.jsonl");

/** Serialize the corpus to JSONL. Returns the number of records written. */
export function exportCorpus(db: DB, path: string = DEFAULT_EXPORT_PATH): number {
  const records = allRecords(db);
  const jsonl = records.map((r) => JSON.stringify(r)).join("\n");
  writeFileSync(path, jsonl + (jsonl ? "\n" : ""), "utf8");
  return records.length;
}

/** CLI: `npm run export:corpus` — (re)build the corpus then write JSONL. */
async function main() {
  const db = getDb();
  await buildCorpus(db, { log: (m) => console.log(`[corpus] ${m}`) });
  const n = exportCorpus(db);
  console.log(`[corpus] exported ${n} records → ${DEFAULT_EXPORT_PATH}`);
}

// Only run as a CLI (not when imported by tests).
if (process.argv[1] && process.argv[1].endsWith("export.ts")) {
  main().catch((err) => {
    console.error("[corpus] export failed:", err);
    process.exit(1);
  });
}
