# ARCHITECTURE — Nuclear Policy Intelligence Engine

## What this is
An intelligence layer over US state legislation for the nuclear sector. It classifies bills against a nuclear-impact ontology, scores their materiality, detects cross-state model-bill campaigns, accumulates a versioned judgment corpus, and emits position-ready memos. The differentiating capability is catching **indirect** bills — those that never say "nuclear" but move nuclear economics through clean-standard definitions, large-load co-location, cost-recovery rules, etc.

This is **not** a dashboard. The data (LegiScan) is a commodity; the value is classification, scoring, the campaign graph, and the accumulating judgment corpus.

## Zero-paid-API posture (authoritative)
Everything runs end to end with **no API key and $0 usage**. The LLM is a pluggable provider:

```
src/classify/provider.ts          // ClassifierProvider interface + factory
src/classify/providers/deterministic.ts   // DEFAULT — rules engine from ontology
src/classify/providers/anthropic.ts       // implemented, INERT unless LLM_PROVIDER=anthropic + key
src/classify/providers/local.ts           // optional Ollama adapter, off by default
```

The deterministic provider matches each ontology vector's trigger language and structural tells, detects inclusion/exclusion patterns in eligibility definitions, and emits the **same Zod-validated JSON schema** an LLM would. The Anthropic adapter is a clean seam — it is never the default and never called unless explicitly enabled.

## Data flow
```
LegiScan (or gold_seed fixtures)
        │  src/ingest
        ▼
   SQLite (bills)  ──change_hash delta: only re-fetch changed bills
        │
        ▼
  Classifier (provider)  ── src/classify ── Zod schema, cache by (sha256(text), ONTOLOGY_VERSION, PROMPT_VERSION)
        │
        ▼
  Materiality scorer ── src/score ── passage/magnitude/breadth/urgency, weighted, each with rationale
        │            ▲
        │            │ breadth feedback
        ▼            │
  Campaign detection ── src/campaign ── TF-IDF cosine + MinHash near-dup clustering across states
        │
        ▼
  Judgment corpus ── src/corpus ── versioned records + human overrides (history retained) + JSONL export
        │
        ▼
  Memo generation ── src/memo ── templated, position-ready, cited; LLM upgrades prose later
        │
        ▼
  Eval harness ── src/eval ── correctness metrics; recall-on-indirect regression gate
        │
        ▼
  UI "Signal Desk" ── app/ ── operator queue, indirect flag, score breakdown, override control, campaign view
```

## Storage
`better-sqlite3`, single local file `data/nuclear.db` (gitignored). Tables:
- `bills` — id, state, number, title, sponsors, committee, stage, last_action, history, full_text, change_hash, fetched_at
- `classifications` — bill_id, provider, ontology_version, prompt_version, json payload, text_sha, created_at
- `scores` — bill_id, component scores + rationales + aggregate + weights_version
- `campaigns` / `campaign_members` — detected model-bill clusters
- `corpus` — versioned judgment records with override lineage

## Determinism & testing
Everything that can be deterministic is real code with Vitest unit tests. The classifier output is always Zod-validated regardless of backend. Scores are reproducible from fixed inputs. The eval tests **correctness** (recall on indirect bills, false-positive rate from negative controls), never formatting.

## Versioning
`ONTOLOGY_VERSION` and `PROMPT_VERSION` are exported constants; the classification cache and corpus records are keyed by them so a taxonomy bump invalidates cleanly and judgment history stays attributable.

## Module map
| Dir | Responsibility |
|-----|----------------|
| `src/ingest` | LegiScan client, delta logic, fixture loader |
| `src/classify` | Ontology, provider interface + backends, cache, Zod schema |
| `src/score` | Component scorers + weighted aggregate |
| `src/campaign` | TF-IDF / MinHash similarity + clustering |
| `src/corpus` | Versioned records, overrides, JSONL export |
| `src/memo` | Templated memo generation |
| `src/eval` | Gold-set runner, metrics, regression gate |
| `src/db` | SQLite connection + migrations |
| `app/` | Next.js Signal Desk UI |
