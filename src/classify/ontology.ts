/**
 * Nuclear Policy Impact Ontology — encoded from `ontology.seed.md` (seed v1).
 * This is the AUTHORITATIVE taxonomy for the deterministic classifier.
 * Do not invent vectors here; mirror the seed file. New vectors require a
 * gold-set justification logged in STATUS.md (per the seed's instruction).
 *
 * Bump ONTOLOGY_VERSION whenever tells/vectors change — the classification
 * cache and corpus records are keyed by it.
 */
export const ONTOLOGY_VERSION = "seed-v1";

export type VectorKind = "direct" | "indirect";
export type Direction = "helps" | "hurts" | "neutral";

export interface OntologyVector {
  id: string;
  kind: VectorKind;
  title: string;
  /** Trigger language / structural tells from the seed's "Tell:" lines. */
  tells: RegExp[];
}

/** Scope: commercial fission only. These markers put a bill OUT of scope. */
export const OUT_OF_SCOPE: { id: string; tells: RegExp[] }[] = [
  {
    id: "nuclear_medicine",
    tells: [
      /nuclear medicine/i,
      /radiopharmaceutical/i,
      /radioisotope/i,
      /nuclear imaging/i,
      /medical (radio)?isotope/i,
      /diagnostic .{0,20}imaging/i,
      /nuclear medicine technologist/i,
    ],
  },
  {
    id: "defense_weapons_naval",
    tells: [
      /nuclear weapon/i,
      /warhead/i,
      /naval (reactor|nuclear|propulsion)/i,
      /submarine reactor/i,
      /defense nuclear/i,
      /weapons-grade/i,
    ],
  },
  { id: "fusion", tells: [/\bfusion\b/i] },
];

/** Keywords a naive "nuclear" search would catch. Drives `is_indirect`. */
export const NUCLEAR_KEYWORDS =
  /\bnuclear\b|\breactors?\b|\bSMR\b|small modular|\bfission\b|atomic energy/i;

export const DIRECT_VECTORS: OntologyVector[] = [
  {
    id: "new_build_siting_licensing",
    kind: "direct",
    title: "New build siting & licensing",
    tells: [
      /advanced reactor/i,
      /small modular reactor|\bSMR\b/i,
      /reactor siting|siting (office|authority)/i,
      /nuclear regulatory commission|\bNRC\b/i,
      /combined (construction and operating )?license|\bCOL\b/i,
      /state pre-?emption of local/i,
    ],
  },
  {
    id: "advance_cost_recovery",
    kind: "direct",
    title: "Advance cost recovery (CWIP)",
    tells: [
      /construction work in progress|\bCWIP\b/i,
      /advance(d)? recovery|advance recovery of .{0,40}costs/i,
      /(cost recovery|recover).{0,60}prior to commercial operation/i,
      /rate base before commercial operation/i,
    ],
  },
  {
    id: "decommissioning_trust",
    kind: "direct",
    title: "Decommissioning trust",
    tells: [
      /decommissioning trust|\bNDT\b/i,
      /decommissioning fund/i,
      /accelerated shutdown|shutdown timeline/i,
    ],
  },
  {
    id: "spent_fuel_storage",
    kind: "direct",
    title: "Spent fuel storage",
    tells: [
      /spent fuel|used fuel/i,
      /dry cask|\bISFSI\b/i,
      /interim storage/i,
      /until a permanent repository|permanent repository/i,
    ],
  },
  {
    id: "fleet_preservation",
    kind: "direct",
    title: "Fleet preservation (ZEC)",
    tells: [
      /zero-emission credit|\bZEC\b/i,
      /nuclear subsidy/i,
      /premature retirement/i,
      /relicensing/i,
    ],
  },
  {
    id: "moratorium_or_ban",
    kind: "direct",
    title: "Moratorium / ban (or repeal)",
    tells: [
      /moratorium/i,
      /prohibition on .{0,30}(nuclear|reactor)/i,
      /supermajority|voter approval requirement/i,
      /repeal of (the )?(prohibition|moratorium|ban)/i,
    ],
  },
];

export const INDIRECT_VECTORS: OntologyVector[] = [
  {
    id: "clean_standard_eligibility",
    kind: "indirect",
    title: "Clean-standard eligibility",
    tells: [
      /(eligible|qualifying|renewable|clean|carbon-?free|zero-?carbon|firm)[\w ]{0,24}(resource|source)['"]?\s+means/i,
      /eligible (clean|renewable|zero-?carbon|firm) resource/i,
      /(renewable|clean energy|alternative energy|renewable energy) portfolio standard|portfolio standard|clean energy standard|renewable energy standard|\bRPS\b|\bCES\b/i,
      /zero-?carbon|zero direct carbon/i,
      /firm,?\s*(and\s*)?dispatchable|dispatchable output/i,
      /qualifying (technologies|resources|capacity)|eligible resource means/i,
    ],
  },
  {
    id: "interconnection_transmission",
    kind: "indirect",
    title: "Interconnection & transmission",
    tells: [
      /interconnection queue|queue reform/i,
      /cluster study/i,
      /transmission planning/i,
      /large-generator interconnection/i,
      /\binterconnection\b/i,
    ],
  },
  {
    id: "large_load_colocation",
    kind: "indirect",
    title: "Large-load co-location",
    tells: [
      /large load/i,
      /behind[- ]the[- ]meter/i,
      /co-?locat/i,
      /grid-service charge/i,
      /exceeding \d+ ?megawatts|>?\s*100 ?MW|\d{3,} ?megawatts/i,
      /bring-your-own-generation/i,
    ],
  },
  {
    id: "property_tax_pilot",
    kind: "indirect",
    title: "Property tax / PILOT",
    tells: [
      /ad valorem/i,
      /payment in lieu of taxes|\bPILOT\b/i,
      /(tax )?abatement/i,
    ],
  },
  {
    id: "rate_recovery_securitization",
    kind: "indirect",
    title: "Rate recovery / securitization",
    tells: [
      /integrated resource plan|\bIRP\b/i,
      /cost recovery/i,
      /securitization/i,
      /prudenc(e|y|ently)/i,
      /cost shift|shifts? costs?|shift costs to/i,
    ],
  },
  {
    id: "water_thermal",
    kind: "indirect",
    title: "Water / thermal permitting",
    tells: [
      /once-through cooling/i,
      /thermal discharge/i,
      /water withdrawal permit/i,
      /cooling (water )?permit/i,
    ],
  },
  {
    id: "workforce",
    kind: "indirect",
    title: "Workforce",
    tells: [/apprenticeship/i, /prevailing wage/i, /energy workforce/i],
  },
  {
    id: "generation_tax",
    kind: "indirect",
    title: "Generation tax",
    tells: [
      /generation tax/i,
      /gross receipts on electricity|gross receipts tax/i,
      /severance tax/i,
    ],
  },
  {
    id: "carbon_procurement",
    kind: "indirect",
    title: "Carbon pricing / firm-clean procurement",
    tells: [
      /carbon pric(e|ing)/i,
      /clean-?energy procurement/i,
      /firm-?clean-?power procurement/i,
      /must-procure/i,
      /procurement mechanism|procurement mandate/i,
    ],
  },
  {
    id: "definitions_trap",
    kind: "indirect",
    title: "Definitions trap",
    // A definitions section that scopes WHICH GENERATION qualifies (silently
    // including or excluding nuclear). Must concern generation/resource
    // eligibility — not just any quoted defined term (e.g. "large load means").
    tells: [
      /eligible[^.]{0,30}resource\s+means/i,
      /["'][^"']*(resource|generation|clean|firm|zero-?carbon|energy|technolog)[^"']*["']\s+means/i,
    ],
  },
];

export const ALL_VECTORS: OntologyVector[] = [
  ...DIRECT_VECTORS,
  ...INDIRECT_VECTORS,
];

export function vectorById(id: string): OntologyVector | undefined {
  return ALL_VECTORS.find((v) => v.id === id);
}
