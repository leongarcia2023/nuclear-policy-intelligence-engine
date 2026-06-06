# PLAN.md — Nuclear Policy Intelligence Engine

## Mission
Build the intelligence layer that turns raw US state legislation into materiality-scored, position-ready memos for the nuclear sector — and catches the bills that never say "nuclear." This is **not** a tracker/dashboard. The data is a commodity (LegiScan); the value is the classification, scoring, the cross-state campaign graph, and the accumulating judgment corpus.

## Execution rules (see CLAUDE.md for the full set)
- Work the phases **in order**. Check off each task here as you complete it. Keep `STATUS.md` current.
- Each phase has **acceptance criteria** — do not advance until they pass.
- Commit after each completed phase. Never push, never force, never leave the repo.
- **Do not stop to ask permission or for clarification.** When blocked or ambiguous, make the most reasonable assumption, record it in `STATUS.md` under "Assumptions," and continue.
- Keep the LLM surface small and testable. Everything that can be deterministic is deterministic code with unit tests.
- Every score and claim carries its reasoning. The tool must never overclaim — visually or rhetorically. A tool for detecting overclaims cannot overclaim.

## Stack
Next.js + TypeScript + Tailwind. Local SQLite for the store. Vitest for tests. Zod for schema validation. Anthropic API for the classification/memo layer (key in `.env`, never committed). Fresh dedicated repo — do **not** modify any other directory.

---

## Phase 0 — Scaffold
- [x] Init Next.js + TypeScript + Tailwind app in this directory.
- [x] Add Vitest, ESLint, Prettier, Zod, better-sqlite3 (or sql.js).
- [x] Create `.env.example` with `ANTHROPIC_API_KEY=` and `LEGISCAN_API_KEY=`. Add `.env` to `.gitignore`.
- [x] Folder structure: `src/ingest`, `src/classify`, `src/score`, `src/campaign`, `src/corpus`, `src/memo`, `src/eval`, `src/db`, `app/`.
- [x] Create `STATUS.md` and `ARCHITECTURE.md` (keep both updated as you build).
**Acceptance:** `npm run dev` boots; `npm test` runs (empty suite OK); `.env` is gitignored. Commit.

## Phase 1 — LegiScan ingestion (deterministic)
- [x] Client wrapping `getMasterListRaw` (returns per-bill `change_hash`), `getBill`, `getBillText`. Rate-limit aware.
- [x] **Delta logic:** persist `change_hash` per bill; on re-run, only fetch bills whose hash changed. Unit-test with fixtures.
- [x] `Bill` schema (zod) + SQLite table: id, state, number, title, sponsors, committee, stage, last_action, history, full_text, change_hash, fetched_at.
- [x] Configurable state list + session; default to a 5-state pilot (TX, OH, PA, CA, IL).
**Acceptance:** ingests current-session bills for the pilot states into SQLite; second run fetches only changed bills (assert via test/log); delta logic unit-tested. Commit.

## Phase 2 — Nuclear impact ontology + classifier (small LLM surface)
- [x] Encode the ontology as a **versioned** module (`ontology.ts`, export `ONTOLOGY_VERSION`): direct, indirect, and adversarial vectors (siting, cost recovery/CWIP, decommissioning, ZEC/fleet preservation, moratoria; clean-standard eligibility, interconnection/transmission, large-load/co-location, property-tax/PILOT, rate recovery, water/thermal, workforce, generation tax, "definitions trap").
- [x] Classifier: bill text → strict JSON `{ relevant, confidence, is_indirect, model_bill_risk, headline, impact_vectors[{vector,direction,rationale}] }`. Zod-validate; reject/repair invalid JSON.
- [x] **Cache** keyed by `(sha256(bill_text), ONTOLOGY_VERSION, PROMPT_VERSION)` so re-runs cost nothing.
**Acceptance:** classifies the gold set (Phase 7 seed); 100% schema-valid; second run makes zero API calls (cache hit, assert in test). Commit.

## Phase 3 — Materiality scoring (deterministic aggregate)
- [x] Component scorers (each 0–100, each emits its reasoning): `passage_likelihood` (sponsor seniority/committee role/chamber control/stage heuristics + bounded LLM estimate), `economic_magnitude` (bounded LLM estimate), `breadth` (incl. cross-state match count from Phase 4), `urgency` (deterministic from stage).
- [x] Weighted aggregate with **documented, configurable weights**. Reproducible given fixed inputs.
**Acceptance:** scores reproducible from fixed inputs (unit-tested); weights live in one config; every component returns a rationale string. Commit.

## Phase 4 — Cross-state campaign detection (the moat)
- [x] Embed bill texts (prefer a local/open embedding model to avoid cost; fall back to an API embedding if needed). Cosine-similarity clustering across states.
- [x] Flag template/model-bill campaigns; emit `Campaign` objects (member bills, states, first-seen, similarity).
- [x] Feed campaign breadth back into Phase 3 `breadth`.
**Acceptance:** on a fixture with known near-duplicate bills across ≥3 states, clusters them correctly; produces Campaign objects. Commit.

## Phase 5 — Judgment corpus (the durable asset)
- [ ] Persist every classification + score + memo as a labeled record, versioned by ontology/prompt version.
- [ ] Support human **override** (correction) that is retained and supersedes the model label without deleting history.
- [ ] Exportable (JSONL).
**Acceptance:** records persist; an override updates the active label and keeps the prior; `npm run export:corpus` writes JSONL. Commit.

## Phase 6 — Memo generation
- [ ] For a scored bill, generate a position-ready memo: headline, what it does, why it matters (board-readable, 1–2 sentences), suggested position (support/oppose/amend/monitor), recommended action. Cite bill sections.
- [ ] Voice: terse, financially literate, slightly contrarian — "Ribbit Power Letter" register. Low temperature; cache.
- [ ] Weekly digest: top-N bills by materiality across the store.
**Acceptance:** memo generated for top-N; each includes position + why-it-matters + citations; output stable given fixed classification. Commit.

## Phase 7 — Eval harness (CORRECTNESS, not formatting)
> This is the explicit fix for the known prior weakness: the old harness validated formatting, not correctness. This one validates correctness.
- [ ] Build a gold set of ~25–40 hand-labeled bills. Seed with the 4 canonical cases (TX direct, OH indirect-include, CA adversarial-exclude, PA data-center) and **expand by pulling real bills via LegiScan**, hand-labeling: `relevant?`, `is_indirect?`, primary vectors, expected position, materiality band.
- [ ] Metrics: relevance precision/recall — and **recall on `is_indirect` bills specifically** (the catch that justifies the product), vector accuracy, materiality-band agreement, confidence calibration.
- [ ] `npm run eval` prints metrics and **exits nonzero if recall-on-indirect < 0.80** (regression gate).
**Acceptance:** `npm run eval` runs against the gold set, prints the metric table, and fails the build on regression. It must test correctness, not output shape. Commit.

## Phase 8 — UI ("Signal Desk", restrained)
- [ ] Operator queue: bills sorted by materiality, with an unmistakable **"INDIRECT — keyword search would miss this"** flag.
- [ ] Bill detail: memo + score breakdown (each component's reasoning visible) + override control (writes to the corpus).
- [ ] Campaign view: bills grouped by detected campaign across states.
- [ ] Cool, operator-precision palette. No decorative overclaiming; restraint is the brief.
**Acceptance:** `npm run dev` renders the queue from SQLite; clicking a bill shows memo, per-component scores, and a working override. Commit.

## Phase 9 — Docs & handoff
- [ ] `README.md`: setup, env vars, how to run ingest → classify → score → eval → UI.
- [ ] Finalize `ARCHITECTURE.md` and `STATUS.md` (with the Assumptions log).
**Acceptance:** a new developer can run the whole pipeline from the README alone. Commit.

## If you finish early
Harden tests, expand the gold set, improve calibration. Do **not** add features beyond this plan.
