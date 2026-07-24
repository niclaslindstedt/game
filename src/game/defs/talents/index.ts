// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The PASSIVE TALENT catalog — the WoW-style trees the hero grows alongside the
// cast-spell system. Every 10 CHOSEN points a hero pours into STRENGTH /
// DEXTERITY / INTELLIGENCE earns one talent point in THAT stat's tree, spent
// through the level-up picker on a new talent or a rank-up of an owned one (up
// to `TALENTS.maxRank`). Talents are ALWAYS ON — no mana, no cooldown, no
// tapping.
//
// Each talent here is a STAT-MODIFIER: it folds one additive term into an
// existing combat read site (crit, dodge, move speed, max hp, damage reduction,
// an enrage curve). The trees have room for more kinds of talent — on-hit procs
// and always-on conjurations — which slot in the same registry as the catalog
// grows; the magic tree is the thinnest for now.
//
// Talents stay TS defs (not content YAML) like `defs/abilities.ts`: the catalog
// is small and every effect is bound to an engine hook, so there is nothing a
// data file would buy. Per-rank numbers are authored as a linear `…PerRank`
// slope on the def; a rank is simply `rank × slope`.
//
// The registry mirrors `defs/spells.ts`: a merged id→def map with an active
// pointer the accessors read, swappable via `setTalentDefs` for authoring.

import type { StatName } from "../../types/index.ts";
import { TALENTS } from "../../config/talents.ts";
import { MELEE_TALENTS } from "./melee.ts";
import { RANGED_TALENTS } from "./ranged.ts";
import { MAGIC_TALENTS } from "./magic.ts";

/**
 * A talent TREE — the school gated behind each of the three offensive stats,
 * the same three strings as `WeaponClass` (deliberately: a melee-tree talent's
 * crit boost rides the hero's melee weapon, a ranged-tree talent's the ranged).
 */
export type TalentClass = "melee" | "ranged" | "magic";

/** The stat that governs each tree. */
export const TALENT_CLASS_STAT: Record<TalentClass, StatName> = {
  melee: "strength",
  ranged: "dexterity",
  magic: "intelligence",
};

/** The tree each governing stat earns points in (inverse of the above). */
export const TALENT_STAT_CLASS: Partial<Record<StatName, TalentClass>> = {
  strength: "melee",
  dexterity: "ranged",
  intelligence: "magic",
};

/** The three tree stats, in tiebreak/display priority order (STR > DEX > INT). */
export const TALENT_STATS: readonly StatName[] = [
  "strength",
  "dexterity",
  "intelligence",
];

/** A tree stat earns one talent point per this many CHOSEN points in it. */
export const TALENT_UNLOCK_STEP = 10;

/** The rank ceiling every talent shares (re-exported for callers that only
 * need the cap, not the whole config block). */
export const TALENT_MAX_RANK = TALENTS.maxRank;

/**
 * A talent's ROLE — a purely presentational label the picker groups/tints by.
 * The engine never branches on it (each effect is keyed by its `…PerRank`
 * fields below).
 */
export type TalentKind =
  | "damage"
  | "tank"
  | "control"
  | "mobility"
  | "survival"
  | "offense"
  | "defense";

/**
 * What a talent DOES, as a bag of per-rank additive slopes — the alternative to
 * a discriminated union (a single talent can touch two read sites, e.g.
 * Executioner boosts both crit chance AND crit damage). Each present field is
 * summed as `rank × slope` at the ONE combat read site that owns its rule (see
 * `src/game/talents.ts`). Only stat-modifier fields exist today; the bag grows
 * `proc` / `conjure` shapes as those talent kinds are added.
 */
export type TalentEffect = {
  /** +crit chance (fraction) per rank — applied only to the tree's own weapon
   * class (a melee-tree talent boosts melee crits, ranged-tree ranged). */
  critChancePerRank?: number;
  /** +crit-damage multiplier per rank, same weapon-class gating as above. */
  critDamagePerRank?: number;
  /** +move-speed fraction per rank (the SPEED stat's successor). */
  moveSpeedPerRank?: number;
  /** +dodge chance (fraction) per rank. */
  dodgePerRank?: number;
  /** Flat incoming-damage reduction fraction per rank (a martial toughness). */
  damageReductionPerRank?: number;
  /** Flat incoming-damage reduction fraction per rank from a MAGIC ward — a
   * separate field so the magic tree's mitigation reads independently, even
   * though both fold into one flat cut today. */
  magicReductionPerRank?: number;
  /** +max-hp fraction per rank. */
  maxHpPerRank?: number;
  /** Enrage: +weapon-damage fraction per rank at ZERO hp, scaling linearly to 0
   * at full hp (so rank×slope is the boost when nearly dead). */
  berserkPerRank?: number;
};

export type TalentDef = {
  id: string;
  /** Display name (the picker card + tree header). */
  name: string;
  /** Which stat's tree this talent lives in. */
  tree: TalentClass;
  kind: TalentKind;
  /** Rank ceiling — always `TALENTS.maxRank` for now. */
  maxRank: number;
  effect: TalentEffect;
  /** One-line flavor for the picker tooltip. */
  blurb: string;
};

/** Build an id→def map from a tree list, throwing on a duplicate id. */
function byId(list: TalentDef[]): Record<string, TalentDef> {
  const out: Record<string, TalentDef> = {};
  for (const def of list) {
    if (out[def.id]) throw new Error(`duplicate talent id "${def.id}"`);
    if (def.maxRank > TALENTS.maxRank) {
      throw new Error(
        `talent "${def.id}" maxRank ${def.maxRank} exceeds cap ${TALENTS.maxRank}`,
      );
    }
    out[def.id] = def;
  }
  return out;
}

/**
 * The full catalog — the three trees merged. Each tree ascends loosely from
 * offense to defense; the picker shows a hero one tree at a time (the tree of
 * the milestone that minted the point).
 */
export const TALENT_DEFS: Record<string, TalentDef> = {
  ...byId(MELEE_TALENTS),
  ...byId(RANGED_TALENTS),
  ...byId(MAGIC_TALENTS),
};

// Active registry the accessors read (defaults to the shipped catalog; an
// author/test may swap it). Mirrors the spell/ability registry pattern.
let activeTalentDefs: Record<string, TalentDef> = TALENT_DEFS;

/** Test/authoring hook: replace the active talent catalog. */
export function setTalentDefs(defs: Record<string, TalentDef>): void {
  activeTalentDefs = defs;
}

/** The active talent catalog (defaults to `TALENT_DEFS`). */
export function talentDefs(): Record<string, TalentDef> {
  return activeTalentDefs;
}

/** Look up a talent def; throws on a broken id so bugs surface loudly. */
export function talentDef(id: string): TalentDef {
  const def = activeTalentDefs[id];
  if (!def) throw new Error(`unknown talent def "${id}"`);
  return def;
}

/** Every talent in `tree`, in catalog order — the pool the picker shows. */
export function talentsForTree(tree: TalentClass): TalentDef[] {
  return Object.values(activeTalentDefs).filter((def) => def.tree === tree);
}

/** The most ranks a `tree` can hold (Σ maxRank over its talents) — the ceiling
 * on how many points that tree can ever absorb. */
export function treeCapacity(tree: TalentClass): number {
  return talentsForTree(tree).reduce((sum, def) => sum + def.maxRank, 0);
}
