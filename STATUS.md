# STATUS — Nuclear Policy Intelligence Engine

_Living status log. Updated after every phase._

## Current state
- **Status:** ALL NINE PHASES COMPLETE. `npm test` (46) + `npm run eval` green on `deterministic` with no API key; `next build` clean; cold-start pipeline verified.
- **Provider:** `deterministic` (DEFAULT, zero paid APIs). `anthropic` adapter present but inert.
- **LegiScan key present:** No → pipeline runs on `gold_seed.jsonl` fixtures.

## Phase checklist
- [x] Phase 0 — Scaffold (dev boots HTTP 200, tests green, .env gitignored)
- [x] Phase 1 — LegiScan ingestion (deterministic, delta logic; 2nd run fetched 0/6)
- [x] Phase 2 — Ontology + pluggable classifier; all 6 gold cases correct incl. OH indirect-catch & NY nuclear-medicine reject; 2nd run 0 provider calls
- [x] Phase 3 — Materiality scoring; 4 relevant gold bills → high, 2 negatives → none; reproducible; weights in one config (seed defaults)
- [x] Phase 4 — Campaign detection (TF-IDF cosine + MinHash, deterministic/free); clusters a 3-state near-dup fixture, excludes distractor, feeds breadth
- [x] Phase 5 — Judgment corpus; versioned records, overrides retained in history & preserved across re-runs, `npm run export:corpus` → JSONL
- [x] Phase 6 — Memo generation (templated, deterministic, cached); position+why+citations; weekly digest; stable output; Ribbit Power Letter voice
- [x] Phase 7 — Eval harness. TUNING set (16 cases authored to exercise the regexes) is an internal-consistency smoke check only — never the gate. Real recall is measured ONLY on the SACRED held-out set (`gold.heldout.jsonl`, real bills labeled blind via `npm run label`); it is currently EMPTY → held-out recall UNMEASURED. The 0.80 floor + regression baseline key off held-out only.
- [x] Phase 8 — Signal Desk UI; queue sorted by materiality w/ INDIRECT flag, bill detail (memo + per-component score reasoning + working override→corpus), campaign view; `next build` clean
- [x] Phase 9 — Docs & handoff; README (setup → pipeline → eval → UI), ARCHITECTURE + STATUS finalized; cold-start verified end to end

## Assumptions (decisions made without asking, per autonomy rule)
1. **Zero paid APIs (CLAUDE.md is authoritative over PLAN.md).** The default classification/memo provider is `deterministic`, a rules engine built from `ontology.seed.md`. The `anthropic` adapter exists behind the same interface but is inert unless `LLM_PROVIDER=anthropic` and a key are set. Nothing blocks on a key.
2. **No LegiScan key in env.** The pipeline uses the six `gold_seed.jsonl` cases as both the eval gold set and the ingestion fixtures, so the full ingest→classify→score→campaign→memo→eval→UI path runs offline.
3. **Campaign similarity is lexical (TF-IDF cosine + MinHash)**, not API embeddings — correct for near-verbatim template bills and free.
4. **Eval gate is regression-based, not absolute.** `npm run eval` records a baseline on first green run and fails only if recall-on-indirect (or FP rate) regresses against it, so the free build passes and a future LLM's lift is measurable. (PLAN.md's absolute 0.80 threshold is also enforced as a floor since the deterministic baseline clears it.)
5. **DB engine: `better-sqlite3`** (synchronous, simplest for a local store + tests).
6. **The opened IDE file `~/council-nuclear-policy/lens_kill.md` is outside this repo and out of scope; ignored.**
7. **Cache-invalidation discipline.** The classification cache is keyed by `(text sha, ONTOLOGY_VERSION, PROMPT_VERSION/RULES_VERSION)`. Any post-baseline change to ontology tells or rules MUST bump the relevant version constant. `is_indirect` is derived deterministically as `relevant && !matches(/nuclear|reactor|SMR|.../)` — this exactly reproduces the gold labels and operationalizes "a keyword search would miss this."
8. **Bill-level `direction`** (added to the classifier schema beyond PLAN's minimum fields) rolls up vector directions with an adversarial bias: any `hurts` vector makes the bill `hurts`, even under a green title (per the seed's adversarial-framing instruction).
9. **Eval honesty — TUNING vs HELD-OUT (this is the load-bearing caveat).** The 16 cases (6 `gold_seed.jsonl` anchors + 10 `src/eval/gold.extra.jsonl` extras) were **hand-authored to exercise the ontology regexes in `src/classify/ontology.ts`.** Any score on them is therefore **circular** — it confirms the rules do what we wrote them to do and says **nothing** about real-world recall. They are the **TUNING set**: an internal-consistency smoke check that **never gates the build**. (Their 100% is self-consistency, not accuracy.)
   Real recall is measured **only** on `src/eval/gold.heldout.jsonl` — real LegiScan bills, hand-labeled via `npm run label` **without seeing the classifier's prediction** (no anchoring). That file is **SACRED**: nothing in `src/classify/**` may ever be edited to make a held-out case pass; a held-out miss is a real finding to record, not a regex to tune. It is **currently EMPTY**, so **held-out recall is UNMEASURED** — `npm run eval` prints `HELD-OUT RECALL: UNMEASURED` and claims no recall number.
10. **The gate keys off HELD-OUT only.** The 0.80 indirect floor and the regression baseline (`src/eval/baseline.json`, scope `held-out`) are computed solely from `gold.heldout.jsonl`. With held-out empty there is no gate and no baseline. `npm run eval` reports the buckets separately — tuning (smoke), adversarial (non-gating finding), held-out (the only real number), combined (reference) — and exits 0 while held-out is empty. Once real bills are labeled, the floor + regression baseline activate on them; `EVAL_UPDATE_BASELINE=1` records/refreshes the held-out baseline.
11. **Adversarial set quantifies the brittleness (`src/eval/gold.adversarial.jsonl`, non-gating).** 19 bills express the same indirect concepts the README headlines, phrased to evade the current regex tells. On the deterministic provider: recall-on-indirect **11.1%** vs tuning **100%** (−88.9 pts), direction-agreement **0%** vs 100%. 17 of 19 are marked not-relevant outright; even the 2 caught get direction wrong; calibration is inverted (more confident when wrong). This is the deliverable gap — the argument for the LLM provider. **`src/classify/**` is frozen ground truth; it must NOT be widened to make these pass** (an `eval.test` guardrail asserts the gap stays large to flag any such overfitting).

## Open items / TODO carried forward
- (none yet)

## Eval baseline
- Not yet recorded.
