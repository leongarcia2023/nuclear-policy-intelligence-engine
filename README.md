# Nuclear Policy Intelligence Engine

Turns raw US state legislation into materiality-scored, position-ready memos for the nuclear sector — **including the bills that never say "nuclear."** This is not a tracker/dashboard: the data (LegiScan) is a commodity; the value is the classification, the materiality scoring, the cross-state campaign graph, and the accumulating judgment corpus.

The signature capability is catching **indirect** bills — a clean-energy standard whose "firm, dispatchable, zero-carbon" definition silently *includes* nuclear, or a green-titled "renewable" bill whose closed definition *excludes* it — and rejecting false friends like a nuclear-*medicine* licensing bill.

## Zero paid APIs

This build runs end to end with **no API key and $0 of usage.** The LLM is a pluggable provider; the default is a deterministic rules engine built from `ontology.seed.md`:

- **`deterministic`** (DEFAULT) — rules engine, no key, the working baseline.
- **`anthropic`** — implemented but **inert** unless `LLM_PROVIDER=anthropic` and `ANTHROPIC_API_KEY` are set. A clean seam for an LLM backend; never the default.
- **`local`** — optional Ollama seam, off by default.

LegiScan needs only a **free** key. Without one, the whole pipeline runs on the six labeled bills in `gold_seed.jsonl` as fixtures, so everything is testable offline.

## Setup

Requirements: Node 20+ (tested on Node 22).

```bash
npm install
cp .env.example .env      # all keys may stay blank — the default build needs none
```

`.env` is gitignored. Environment variables (all optional):

| Var | Default | Effect |
|-----|---------|--------|
| `LLM_PROVIDER` | `deterministic` | `deterministic` \| `anthropic` \| `local`. Only `deterministic` runs with no key. |
| `ANTHROPIC_API_KEY` | — | Read only when `LLM_PROVIDER=anthropic`. The adapter throws if selected without it. |
| `LEGISCAN_API_KEY` | — | Free key. If absent, the pipeline uses `gold_seed.jsonl` fixtures. |
| `INGEST_STATES` | `TX,OH,PA,CA,IL` | Comma-separated pilot states for `npm run ingest`. |

## Run the pipeline

The fastest path — populate the local SQLite store, then open the UI:

```bash
npm run pipeline      # ingest → classify → campaign → score → memo → corpus
npm run dev           # http://localhost:3000/desk
```

Or run the stages individually:

```bash
npm run ingest            # LegiScan delta-fetch (or gold fixtures) → SQLite
npm run classify          # nuclear-impact classification (cached)
npm run campaign          # cross-state model-bill detection (TF-IDF + MinHash)
npm run score             # deterministic materiality scoring
npm run memo              # weekly digest: top-N memos by materiality
npm run export:corpus     # write the judgment corpus to corpus.export.jsonl
```

Quality gates:

```bash
npm test                  # full Vitest suite (deterministic, offline)
npm run eval              # correctness eval; fails on regression / indirect-recall floor
```

`npm run eval` prints a metric table and **exits nonzero** if recall-on-indirect drops below 0.80 (absolute floor) or regresses against the committed baseline (`src/eval/baseline.json`). It tests correctness — catching indirect bills, rejecting false friends — never output shape. To intentionally rebaseline after an improvement: `EVAL_UPDATE_BASELINE=1 npm run eval`.

## Using the Signal Desk

- **/desk** — operator queue, sorted by materiality, with an unmistakable `INDIRECT — keyword search would miss this` flag.
- **/bill/[id]** — the memo (what it does / why it matters / position / cited sections), the per-component materiality breakdown with each component's reasoning, the impact vectors, campaign membership, and a **working override** that writes a correction to the judgment corpus (retained in history, and preserved across pipeline re-runs).
- **/campaigns** — bills grouped by detected cross-state model-bill campaign.

## How it works (data flow)

```
LegiScan (or gold_seed fixtures)
  → ingest      change_hash delta: only re-fetch bills that changed       → SQLite(bills)
  → classify    ontology rules engine → Zod-validated JSON, cached         → SQLite(classifications)
  → campaign    TF-IDF cosine + MinHash near-dup clustering across states  → SQLite(campaigns)
  → score       passage/magnitude/breadth/urgency, weighted, each w/ why   → SQLite(scores)
  → memo        templated, position-ready, cited, stable                   → SQLite(memos)
  → corpus      versioned judgment records + human overrides (history)     → SQLite(corpus)
  → eval        correctness metrics; recall-on-indirect regression gate
  → UI          Signal Desk (queue, bill detail, campaigns)
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for the module map and the zero-API provider seam, and [STATUS.md](STATUS.md) for phase status and the Assumptions log.

## Adding the LLM backend later

The deterministic provider and the Anthropic adapter implement the same `ClassifierProvider` interface and emit the same Zod-validated `Classification`. To enable the LLM backend, implement the single `classify()` call in `src/classify/providers/anthropic.ts` (the prompt and parser are already defined), set `LLM_PROVIDER=anthropic` + `ANTHROPIC_API_KEY`, and re-run. The eval's regression baseline makes the LLM's lift over the deterministic baseline directly measurable.

## Layout

```
src/ingest    LegiScan client, change_hash delta, fixtures, Bill schema
src/classify  ontology (versioned), provider seam + backends, cache, schema
src/score     component scorers + weighted aggregate (weights in one config)
src/campaign  TF-IDF / MinHash similarity + clustering
src/corpus    versioned judgment records, overrides, JSONL export
src/memo      templated memo generation + weekly digest
src/eval      gold set, correctness metrics, regression gate
src/db        SQLite connection + migrations
src/ui        server-side data layer + override Server Action
app/          Next.js Signal Desk (queue, bill detail, campaigns)
```
