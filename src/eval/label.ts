import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { LegiScanClient } from "../ingest/legiscan";
import { GoldLabels } from "../ingest/fixtures";
import { HELDOUT_PATH } from "./gold";

/**
 * `npm run label` — interactive labeler for the SACRED held-out set.
 *
 * Pull a real bill via LegiScan (state + query) or paste bill text, read the
 * FULL text, then hand-label it. It NEVER imports the classifier and NEVER
 * shows a prediction — labels must be formed from the bill alone (no anchoring).
 * Appends one GoldCase line to src/eval/gold.heldout.jsonl.
 *
 * Prompts run in a fixed order so a here-doc can drive it non-interactively.
 */

// Vector id reference, mirrored from ontology.seed.md. Kept as a literal so this
// file stays fully decoupled from src/classify (the sacred wall).
const VECTOR_IDS = [
  "new_build_siting_licensing",
  "advance_cost_recovery",
  "decommissioning_trust",
  "spent_fuel_storage",
  "fleet_preservation",
  "moratorium_or_ban",
  "clean_standard_eligibility",
  "interconnection_transmission",
  "large_load_colocation",
  "property_tax_pilot",
  "rate_recovery_securitization",
  "water_thermal",
  "workforce",
  "generation_tax",
  "carbon_procurement",
  "definitions_trap",
];

function nextHeldoutId(): string {
  let n = 0;
  if (existsSync(HELDOUT_PATH)) {
    const raw = readFileSync(HELDOUT_PATH, "utf8");
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      n++;
    }
  }
  return `heldout-${String(n + 1).padStart(3, "0")}`;
}

function readAllStdin(): Promise<string> {
  return new Promise((res) => {
    let d = "";
    stdin.setEncoding("utf8");
    stdin.on("data", (c) => (d += c));
    stdin.on("end", () => res(d));
  });
}

async function main() {
  // Interactive (TTY) uses readline; piped input (a here-doc) is pre-buffered
  // line-by-line so nothing is lost to readline's flowing-stream race.
  const isTTY = Boolean(stdin.isTTY);
  const rl = isTTY ? createInterface({ input: stdin, output: stdout }) : null;
  const queue: string[] = isTTY ? [] : (await readAllStdin()).split(/\r?\n/);
  const ask = async (q: string): Promise<string> => {
    if (rl) return rl.question(q);
    stdout.write(q);
    if (queue.length === 0) return "";
    const line = queue.shift() ?? "";
    stdout.write(line + "\n"); // echo for a readable transcript
    return line;
  };
  const askEnum = async (q: string, allowed: string[]): Promise<string> => {
    for (;;) {
      const a = (await ask(`${q} [${allowed.join("/")}]: `)).trim().toLowerCase();
      if (allowed.includes(a)) return a;
      if (a === "") return allowed[0]; // EOF / blank → first option, keeps piped runs moving
      stdout.write(`  not one of ${allowed.join(", ")} — try again\n`);
    }
  };
  const askBool = async (q: string): Promise<boolean> => {
    const a = (await ask(`${q} [y/n]: `)).trim().toLowerCase();
    return a === "y" || a === "yes" || a === "true" || a === "t";
  };

  stdout.write("\n=== Held-out labeler (no prediction shown — label the bill, not the model) ===\n\n");

  const key = process.env.LEGISCAN_API_KEY;
  const sources = key ? ["legiscan", "paste"] : ["paste", "legiscan"];
  const source = await askEnum(
    `Source${key ? "" : " (no LEGISCAN_API_KEY → paste)"}`,
    sources,
  );

  let state = "";
  let billNumber = "";
  let title = "";
  let text = "";

  if (source === "legiscan") {
    if (!key) {
      stdout.write("No LEGISCAN_API_KEY set — cannot pull from LegiScan. Re-run and choose paste.\n");
      rl?.close();
      process.exit(1);
    }
    const client = new LegiScanClient(key);
    state = (await ask("State (2-letter): ")).trim().toUpperCase();
    const query = (await ask("Search query: ")).trim();
    const results = (await client.getSearchRaw(state, query)).slice(0, 15);
    if (results.length === 0) {
      stdout.write("No results.\n");
      rl?.close();
      process.exit(1);
    }
    results.forEach((r, i) =>
      stdout.write(`  [${i}] ${r.state} ${r.bill_number} — ${r.title}\n`),
    );
    const pick = Number((await ask("Pick index: ")).trim()) || 0;
    const chosen = results[Math.max(0, Math.min(pick, results.length - 1))];
    const meta = await client.getBill(chosen.bill_id);
    text = await client.getLatestText(meta);
    state = meta.state || state;
    billNumber = meta.bill_number || chosen.bill_number;
    title = meta.title || chosen.title;
  } else {
    state = (await ask("State (2-letter): ")).trim().toUpperCase();
    billNumber = (await ask("Bill number (e.g. SB 123): ")).trim();
    title = (await ask("Title: ")).trim();
    stdout.write("Paste bill text. End with a single line containing only a period (.)\n");
    const buf: string[] = [];
    for (;;) {
      const line = await ask("");
      if (line === null || line === undefined) break; // EOF
      if (line.trim() === ".") break;
      buf.push(line);
    }
    text = buf.join("\n").trim();
  }

  // Show the FULL text before any labeling.
  stdout.write("\n--------------------------- FULL BILL TEXT ---------------------------\n");
  stdout.write(`${state} ${billNumber} — ${title}\n\n${text}\n`);
  stdout.write("----------------------------------------------------------------------\n\n");
  stdout.write(`Valid vector ids:\n  ${VECTOR_IDS.join(", ")}\n\n`);

  // Label from the bill alone — no prediction is ever shown.
  const relevant = await askBool("relevant? (does it affect COMMERCIAL nuclear fission economics)");
  const is_indirect = await askBool("is_indirect? (would a keyword search for 'nuclear' MISS this)");
  const model_bill_risk = await askBool("model_bill_risk? (template likely to recur across states)");
  const direction = (await askEnum("direction", ["helps", "hurts", "neutral"])) as
    | "helps"
    | "hurts"
    | "neutral";
  const vectorsRaw = (await ask("primary_vectors (comma-separated ids, blank if none): ")).trim();
  const primary_vectors = vectorsRaw
    ? vectorsRaw.split(",").map((v) => v.trim()).filter(Boolean)
    : [];
  const expected_position = (await askEnum("expected_position", [
    "support",
    "oppose",
    "amend",
    "monitor",
  ])) as "support" | "oppose" | "amend" | "monitor";
  const materiality_band = (await askEnum("materiality_band", [
    "none",
    "low",
    "medium",
    "high",
  ])) as "none" | "low" | "medium" | "high";
  const note = (await ask("note (optional): ")).trim();

  rl?.close();

  const labels = GoldLabels.parse({
    relevant,
    is_indirect,
    model_bill_risk,
    primary_vectors,
    direction,
    expected_position,
    materiality_band,
  });

  const row = {
    id: nextHeldoutId(),
    state,
    bill_number: billNumber,
    title,
    text,
    labels,
    ...(note ? { note } : {}),
  };

  appendFileSync(HELDOUT_PATH, JSON.stringify(row) + "\n", "utf8");
  stdout.write(`\n✓ Wrote ${row.id} to ${HELDOUT_PATH}\n`);
  stdout.write("Reminder: src/classify/** must NOT be edited to make this case pass.\n");
}

main().catch((err) => {
  console.error("[label] failed:", err);
  process.exit(1);
});
