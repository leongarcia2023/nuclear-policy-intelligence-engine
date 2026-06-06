# CLAUDE.md — Standing rules for this project

You are building the Nuclear Policy Intelligence Engine described in `PLAN.md`. Execute that plan autonomously, phase by phase.

## Autonomy (most important)
- **Never stop to ask the user for permission or clarification.** When blocked or ambiguous, choose the most reasonable option, log it under "Assumptions" in `STATUS.md`, and keep going.
- Work `PLAN.md` top to bottom. Check off tasks as you complete them. Do not advance past a phase until its acceptance criteria pass.
- Keep `STATUS.md` updated after every phase.

## Build with zero paid APIs (AUTHORITATIVE — overrides any API references in PLAN.md)
- This build MUST run end to end with NO paid API key and $0 of usage. Do not call the Anthropic API or any paid service, and never block waiting on a key.
- Make the LLM a **pluggable provider** behind one interface, with these backends:
  - `deterministic` (DEFAULT) — a rules engine built from `ontology.seed.md`: match each vector's trigger language and structural tells, detect inclusion/exclusion patterns in eligibility definitions, and emit the SAME JSON schema an LLM would. This is the working baseline; it needs no key.
  - `anthropic` — an adapter that is implemented but inert unless `LLM_PROVIDER=anthropic` and a key are set. Never the default.
  - `local` (optional) — an Ollama adapter, also off by default.
- Classification and memo generation default to `deterministic`. Use templated memos now; the LLM provider upgrades the prose later.
- For cross-state campaign / model-bill detection use TF-IDF or MinHash near-duplicate similarity (deterministic, free) — NOT API embeddings. Template bills are near-verbatim copies, so lexical similarity is the correct tool regardless.
- LegiScan needs only a FREE key. If `LEGISCAN_API_KEY` is absent, run the whole pipeline on the `gold_seed.jsonl` bills as fixtures so everything is testable offline.
- The eval runs against the active provider (deterministic now). It prints metrics every run and fails ONLY on regression against a recorded baseline — never on an absolute threshold — so the free build passes and a future LLM's lift is measurable.

## Safety / scope
- Operate only inside this repository directory. Never read, write, or delete anything outside it. Never touch `nuclear-deployment-copilot`.
- Never run `rm -rf`, never `git push`, never force-push, never `sudo`.
- Never commit secrets. Any keys live in `.env` (gitignored), read via `process.env`.
- Commit after each completed phase with a clear message.

## Engineering principles
- Keep the optional LLM surface small. Everything deterministic is real code with Vitest unit tests.
- Validate every classifier output against a Zod schema regardless of backend.
- Every score and memo carries its reasoning. The product must not overclaim — in numbers, copy, or visuals.
- The eval tests correctness (especially recall on indirect bills and the false-positive rate from the negative controls), never formatting.

## Definition of done
All nine phases complete, `npm run eval` green on the `deterministic` provider with NO API key, `npm run dev` renders the Signal Desk queue from the seed/fixture bills (and from LegiScan if a free key is present), and a new developer can run everything from the README.
