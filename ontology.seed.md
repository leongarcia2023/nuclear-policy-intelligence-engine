# Nuclear Policy Impact Ontology — seed v1

**Build Phase 2's `ontology.ts` from this file. Do not invent your own taxonomy.** Treat this as authoritative; you may add vectors only if a gold-set bill clearly needs one, and if you do, log it in STATUS.md.

## Scope
Commercial fission only: the operating fleet, new build, advanced/SMR developers, and the fuel cycle (conversion, enrichment, fabrication, used fuel). **Out of scope** (must classify as not-relevant): nuclear medicine / radiopharmaceuticals, naval/defense nuclear, weapons, and fusion. A bill containing the word "nuclear" is **not** automatically relevant — see the hard-negative case in the gold set.

## Field definitions
- `direction`: `helps` | `hurts` | `neutral` — effect on commercial nuclear economics/deployment.
- `is_indirect`: `true` if a keyword search for "nuclear" would miss this bill. These are the highest-value catches.
- `model_bill_risk`: `true` if the text pattern-matches template legislation likely to recur across states.

---

## DIRECT vectors (text references nuclear/reactors explicitly)

- **new_build_siting_licensing** — State siting offices, SMR-specific siting, COL/NRC coordination, state pre-emption of local bans. *Tell:* "advanced reactor," "small modular reactor," siting authority, NRC coordination.
- **advance_cost_recovery** — CWIP / construction-work-in-progress, pre-completion cost recovery for new nuclear. *Tell:* "construction work in progress," "advance recovery," rate base before commercial operation.
- **decommissioning_trust** — NDT funding adequacy, tax treatment, fund raids, accelerated-shutdown mandates. *Tell:* decommissioning trust, NDT, shutdown timeline.
- **spent_fuel_storage** — ISFSI, consent-based interim storage, waste-linked moratoria conditioning new plants on a federal repository. *Tell:* spent/used fuel, dry cask, interim storage, "until a permanent repository."
- **fleet_preservation** — ZEC / zero-emission credits, subsidies to keep existing plants open, relicensing support. *Tell:* zero-emission credit, nuclear subsidy, premature retirement.
- **moratorium_or_ban** — Bans, supermajority/voter approval requirements, and **repeals** of existing bans. *Tell:* moratorium, prohibition, repeal of prohibition.

## INDIRECT vectors (bill may NEVER say "nuclear" — high miss-rate, high value)

- **clean_standard_eligibility** — RPS/CES/CES definitions of "eligible / clean / zero-carbon / firm" resources. **Inclusion or exclusion of nuclear is the single highest-leverage lever in the system.** *Tell:* "eligible resource means…", "zero-carbon," "firm dispatchable," lists of qualifying technologies.
- **interconnection_transmission** — Queue reform, transmission planning, large-generator interconnection rules — reshapes SMR and large-load timelines. *Tell:* interconnection queue, cluster study, transmission planning.
- **large_load_colocation** — Data-center tariffs, behind-the-meter / bring-your-own-generation, co-location of load with generation. The hyperscaler–nuclear deal surface. *Tell:* "large load," ">100 MW," co-location, behind the meter, grid-service charge.
- **property_tax_pilot** — Ad valorem treatment of generation, PILOT agreements, abatements. *Tell:* ad valorem, payment in lieu of taxes, abatement for generation facilities.
- **rate_recovery_securitization** — Utility cost recovery, securitization, IRP statutes shaping what utilities may build. *Tell:* integrated resource plan, cost recovery, securitization, prudency.
- **water_thermal** — Water rights, thermal-discharge / cooling permitting. *Tell:* once-through cooling, thermal discharge, water withdrawal permit.
- **workforce** — Apprenticeship, prevailing wage, STEM pipeline tied to energy/generation. *Tell:* apprenticeship, prevailing wage, energy workforce.
- **generation_tax** — Severance / gross-receipts / utility tax on generation. *Tell:* generation tax, gross receipts on electricity.
- **carbon_procurement** — Carbon pricing, firm-clean-power procurement mandates. *Tell:* carbon price, clean-energy procurement, must-procure.
- **definitions_trap** — "Advanced energy" / "firm clean" definitions buried in economic-development or incentive packages that silently include or exclude nuclear. *Tell:* a definitions section in a non-energy bill that scopes which generation qualifies.

## Adversarial framing
The dangerous bills are not the ones that say "ban nuclear." They are the ones that look pro-clean-energy while **excluding** nuclear via a "renewable" definition, or that bar cost recovery for "thermal" generation, or that quietly redefine "firm clean" to exclude it. Flag these as `hurts` even when the bill's title is green.

## Materiality (each component 0–100, each emits a one-sentence rationale)
- **passage_likelihood** — sponsor seniority / committee chair vs backbencher, chamber control, fiscal note, prior-session history.
- **economic_magnitude** — CapEx / OpEx / rate swing implied.
- **breadth** — single asset vs statewide vs a model bill spreading across states (pull cross-state match count from Phase 4).
- **urgency** — stage: introduced < in committee < passed one chamber < enrolled.

Aggregate with documented, configurable weights. Default weights: passage 0.30, magnitude 0.30, breadth 0.20, urgency 0.20 — record these in one config file and treat as tunable.
