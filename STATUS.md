# STATUS — Nuclear Policy Intelligence Engine

_Living status log. Updated after every phase._

## Current state
- **Active phase:** Phase 6 — Memo generation (starting)
- **Provider:** `deterministic` (DEFAULT, zero paid APIs). `anthropic` adapter present but inert.
- **LegiScan key present:** No → pipeline runs on `gold_seed.jsonl` fixtures.

## Phase checklist
- [x] Phase 0 — Scaffold (dev boots HTTP 200, tests green, .env gitignored)
- [x] Phase 1 — LegiScan ingestion (deterministic, delta logic; 2nd run fetched 0/6)
- [x] Phase 2 — Ontology + pluggable classifier; all 6 gold cases correct incl. OH indirect-catch & NY nuclear-medicine reject; 2nd run 0 provider calls
- [x] Phase 3 — Materiality scoring; 4 relevant gold bills → high, 2 negatives → none; reproducible; weights in one config (seed defaults)
- [x] Phase 4 — Campaign detection (TF-IDF cosine + MinHash, deterministic/free); clusters a 3-state near-dup fixture, excludes distractor, feeds breadth
- [x] Phase 5 — Judgment corpus; versioned records, overrides retained in history & preserved across re-runs, `npm run export:corpus` → JSONL
- [ ] Phase 6 — Memo generation (templated, pluggable)
- [ ] Phase 7 — Eval harness (correctness; recall-on-indirect gate)
- [ ] Phase 8 — UI ("Signal Desk")
- [ ] Phase 9 — Docs & handoff

## Assumptions (decisions made without asking, per autonomy rule)
1. **Zero paid APIs (CLAUDE.md is authoritative over PLAN.md).** The default classification/memo provider is `deterministic`, a rules engine built from `ontology.seed.md`. The `anthropic` adapter exists behind the same interface but is inert unless `LLM_PROVIDER=anthropic` and a key are set. Nothing blocks on a key.
2. **No LegiScan key in env.** The pipeline uses the six `gold_seed.jsonl` cases as both the eval gold set and the ingestion fixtures, so the full ingest→classify→score→campaign→memo→eval→UI path runs offline.
3. **Campaign similarity is lexical (TF-IDF cosine + MinHash)**, not API embeddings — correct for near-verbatim template bills and free.
4. **Eval gate is regression-based, not absolute.** `npm run eval` records a baseline on first green run and fails only if recall-on-indirect (or FP rate) regresses against it, so the free build passes and a future LLM's lift is measurable. (PLAN.md's absolute 0.80 threshold is also enforced as a floor since the deterministic baseline clears it.)
5. **DB engine: `better-sqlite3`** (synchronous, simplest for a local store + tests).
6. **The opened IDE file `~/council-nuclear-policy/lens_kill.md` is outside this repo and out of scope; ignored.**
7. **Cache-invalidation discipline.** The classification cache is keyed by `(text sha, ONTOLOGY_VERSION, PROMPT_VERSION/RULES_VERSION)`. Any post-baseline change to ontology tells or rules MUST bump the relevant version constant. `is_indirect` is derived deterministically as `relevant && !matches(/nuclear|reactor|SMR|.../)` — this exactly reproduces the gold labels and operationalizes "a keyword search would miss this."
8. **Bill-level `direction`** (added to the classifier schema beyond PLAN's minimum fields) rolls up vector directions with an adversarial bias: any `hurts` vector makes the bill `hurts`, even under a green title (per the seed's adversarial-framing instruction).

## Open items / TODO carried forward
- (none yet)

## Eval baseline
- Not yet recorded.
