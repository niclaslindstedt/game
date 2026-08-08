// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The PASSIVE TALENT catalog — the WoW-style trees the hero grows alongside the
// cast-spell system. Every 10 CHOSEN points a hero pours into STRENGTH /
// DEXTERITY / INTELLIGENCE earns one talent point in THAT stat's tree, spent
// through the level-up picker on a new talent or a rank-up of an owned one (up
// to `TALENTS.maxRank`). Talents are ALWAYS ON — no mana, no cooldown, no
// tapping.
//
// THE TALENTS ARE CONTENT: `content/talents.yaml` is the source of truth,
// compiled to `engine/generated/talents.ts` by `scripts/generate-talents.mjs`
// (`make levels`). This module owns the TYPES, the tree/stat wiring and the
// registry; it never owns a number. A MOD ships its own `talents.yaml` through
// the same loader and the same schema, and its trees arrive through
// `registerDefs` (pwa/src/game/mods.ts) — which is why the catalog had to leave
// TypeScript: while it was three hand-written arrays, a mod could re-skin the
// whole game and still hand the player this game's eight melee talents.
//
// A TALENT IS A COMPOSITION, NOT A KIND — the same rule `AbilityDef` follows.
// `kind` is a LABEL the picker groups and tints by; nothing dispatches on it.
// What a talent DOES is whatever it CARRIES, and there are two carriers:
//
//   `effect`      the bag of per-rank additive SLOPES, each summed as
//                 `rank × slope` at the ONE combat read site that owns its rule
//                 — plus `conjure`, which feeds an always-on granted spell
//                 through the exact machinery a legendary's `spell` affix
//                 drives (`syncItemSpells`).
//   a PROC BLOCK  named for the effect it fires (`parry`, `volley`,
//                 `frostNova`, …), read at the engine hook that owns it. The
//                 hook finds its block by LOOKING FOR IT (`procTalent` in
//                 `talent-effects.ts`) rather than by talent id, which is what
//                 lets a mod author a talent that parries — or retune the one
//                 that ships — with no engine change. One carrier per proc: the
//                 build refuses two talents claiming the same block, since
//                 which one applied would otherwise be decided by catalog
//                 order.
//
// Read `procBlock(def, name)`/`talentBlocks(def)`, never a talent's ID, anywhere
// a talent's BEHAVIOUR is being judged.
//
// The registry mirrors `defs/spells.ts`: a merged id→def map with an active
// pointer the accessors read, swappable via `setTalentDefs` for authoring.

import type { SpellKind, StatName } from "../../types/index.ts";
import { TALENTS } from "../../config/talents.ts";
import { GENERATED_TALENTS } from "../../../generated/talents.ts";

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
 * slope or its proc block below).
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
 * What a talent adds to an EXISTING read site, as a bag of per-rank additive
 * slopes — the alternative to a discriminated union (a single talent can touch
 * two read sites, e.g. Executioner boosts both crit chance AND crit damage).
 * Each present field is summed as `rank × slope` at the ONE combat read site
 * that owns its rule (see `engine/game/talent-effects.ts`), or — for a CONJURE
 * talent — feeds the always-on granted-spell machinery. Anything structured
 * enough to need several numbers is a PROC BLOCK instead.
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
  /** ARCANE RETRIBUTION: fraction of an enemy blow's damage reflected back at
   * the attacker per rank — read in the struck path (`applyRetribution`), which
   * queues the reflected hit for after the enemy pass. */
  reflectPerRank?: number;
  /** +max-hp fraction per rank. */
  maxHpPerRank?: number;
  /** Enrage: +weapon-damage fraction per rank at ZERO hp, scaling linearly to 0
   * at full hp (so rank×slope is the boost when nearly dead). */
  berserkPerRank?: number;
  /** CONJURATION: this talent's rank feeds the named granted spell — the
   * always-on power the loadout's `spell` affixes already drive
   * (`syncItemSpells`/`stepItemSpells`). Talent rank maps 1:1 to spell rank and
   * STACKS with any worn source of the same spell, so a magic hero's Orbiting
   * Flames / Storm Call run through the exact machinery a legendary's granted
   * spell does — weapon-independent, INT-deepened, always on. No `…PerRank`
   * slope: the per-rank power lives in the spell's own config (`SPELL`). */
  conjure?: SpellKind;
};

// ---------------------------------------------------------------------------
// THE PROC BLOCKS. Each is read by exactly one accessor in `talent-effects.ts`,
// which finds the block on whichever TRAINED talent carries it. Adding one is a
// member here, an entry in the schema's `PROC_BLOCKS`, and one reader — never a
// branch on an id.
// ---------------------------------------------------------------------------

/** CLEAVING ECHO: a per-SWING roll for the sweep to strike EXTRA targets past
 * the weapon's own `maxMeleeTargets` cap. Ranks below `bonusFromRank` add
 * `extraTargets`, ranks at or above it add `bonusTargets` instead. */
export type CleavingEchoBlock = {
  chancePerRank: number;
  chanceCap: number;
  extraTargets: number;
  bonusTargets: number;
  bonusFromRank: number;
};

/** TWIN STRIKE: a per-HIT roll for a melee blow to land a second time, at
 * `echoDamageFrac` of the blow until `fullEchoRank`, where it hits for full. */
export type TwinStrikeBlock = {
  chancePerRank: number;
  chanceCap: number;
  echoDamageFrac: number;
  fullEchoRank: number;
};

/** PARRY: a struck roll to FULLY negate an enemy MELEE blow, on no cooldown but
 * chance-capped. From `riposteRank` it RIPOSTES `riposteFrac` of the negated
 * blow back at the attacker. */
export type ParryBlock = {
  chancePerRank: number;
  chanceCap: number;
  riposteFrac: number;
  riposteRank: number;
};

/** SEISMIC LANDING: a jump landing slams the ground for AoE damage and a flat
 * `knockback` shove (world px, role-scaled like the knockback affix). The
 * damage is a level-1 figure riding `abilityPowerScale` at the read site. */
export type SeismicBlock = {
  radius: number;
  radiusPerRank: number;
  damage: number;
  damagePerRank: number;
  knockback: number;
};

/** PIERCING SHOT: the hero's shots punch through `piercePerRank` extra bodies
 * per rank, keeping `retainBase` of their damage per body at rank 1 and lifting
 * that by `retainPerRank` toward `retainCap`. */
export type PiercingBlock = {
  piercePerRank: number;
  retainBase: number;
  retainPerRank: number;
  retainCap: number;
};

/** CONCUSSIVE ROUNDS: a roll for a shot to SHOVE the struck foe straight back. */
export type ConcussiveBlock = {
  chancePerRank: number;
  chanceCap: number;
  distance: number;
  distancePerRank: number;
};

/** CRIPPLING SHOT: a roll for a shot to SLOW the struck foe (the engine's chill
 * fields, at `slowFactor` — a hobble, milder than a frost freeze). */
export type CripplingBlock = {
  chancePerRank: number;
  chanceCap: number;
  slowFactor: number;
  slowMs: number;
  slowMsPerRank: number;
};

/** VOLLEY: a per-PULL roll to loose extra projectiles in a `spreadDeg` fan —
 * `extra` below `bonusFromRank`, `bonusExtra` at or above it. */
export type VolleyBlock = {
  chancePerRank: number;
  chanceCap: number;
  extra: number;
  bonusExtra: number;
  bonusFromRank: number;
  spreadDeg: number;
};

/** SPRING HEELS: higher, longer jumps — `velocityPerRank` lifts the takeoff
 * speed, and from `costReductionRank` a hop costs `jumpCostReduction` less
 * stamina. */
export type SpringHeelsBlock = {
  velocityPerRank: number;
  jumpCostReduction: number;
  costReductionRank: number;
};

/** EVASION's mastery kicker: from `rank`, a successful dodge leaves an
 * afterimage and a `speedMult` burst lasting `ms`. */
export type EvasionBurstBlock = {
  speedMult: number;
  ms: number;
  rank: number;
};

/** FROST NOVA: the blow that lands on the hero freezes the foes around him
 * solid, then the proc goes on an internal cooldown so a dogpile can't
 * chain-freeze the screen every frame. Rank widens the ring, lengthens the
 * freeze and shortens the reset, never below `cooldownFloorMs`. */
export type FrostNovaBlock = {
  radius: number;
  radiusPerRank: number;
  freezeMs: number;
  freezeMsPerRank: number;
  slowFactor: number;
  cooldownMs: number;
  cooldownPerRank: number;
  cooldownFloorMs: number;
};

/** Every proc block a talent may carry, by name. `TalentBlockName` is derived
 * from it, so adding a member here is the one place a new proc is declared on
 * the def. */
export type TalentBlocks = {
  cleavingEcho?: CleavingEchoBlock;
  twinStrike?: TwinStrikeBlock;
  parry?: ParryBlock;
  seismic?: SeismicBlock;
  piercing?: PiercingBlock;
  concussive?: ConcussiveBlock;
  crippling?: CripplingBlock;
  volley?: VolleyBlock;
  springHeels?: SpringHeelsBlock;
  evasionBurst?: EvasionBurstBlock;
  frostNova?: FrostNovaBlock;
};

/** The name of a proc block — the key a hook asks for. */
export type TalentBlockName = keyof TalentBlocks;

/** Every proc block name, for the surfaces that enumerate them (the gallery,
 * the tests, an authoring tool). Kept beside the type so the two can only drift
 * with a compile error. */
export const TALENT_BLOCKS: readonly TalentBlockName[] = [
  "cleavingEcho",
  "twinStrike",
  "parry",
  "seismic",
  "piercing",
  "concussive",
  "crippling",
  "volley",
  "springHeels",
  "evasionBurst",
  "frostNova",
];

export type TalentDef = TalentBlocks & {
  id: string;
  /** Display name (the picker card + tree header). */
  name: string;
  /** Which stat's tree this talent lives in. */
  tree: TalentClass;
  kind: TalentKind;
  /** Rank ceiling — never above `TALENTS.maxRank` (the build refuses it). */
  maxRank: number;
  /** The per-rank slopes this talent folds into existing read sites. Absent on
   * a pure proc talent. */
  effect?: TalentEffect;
  /** One-line flavor for the picker tooltip. */
  blurb: string;
  /** The picker's glyph, defaulting to `icon_talent_<id>` (`talentIcon`). */
  icon?: string;
};

/** The picker glyph for a talent — its own `icon` or the `icon_talent_<id>`
 * convention. One helper so the picker, the effects gallery and the coverage
 * test can never disagree about which sprite a talent draws. */
export function talentIcon(def: TalentDef): string {
  return def.icon ?? `icon_talent_${def.id}`;
}

/** The proc blocks a talent carries, in `TALENT_BLOCKS` order — for the
 * surfaces that describe a talent rather than fire it. */
export function talentBlocks(def: TalentDef): TalentBlockName[] {
  return TALENT_BLOCKS.filter((name) => def[name] !== undefined);
}

/**
 * The full catalog — every talent in `content/talents.yaml`, compiled. Ordered
 * as authored (each tree offense → defense), which is the order the picker
 * shows a tree in.
 */
export const TALENT_DEFS: Record<string, TalentDef> = GENERATED_TALENTS;

// Active registry the accessors read (defaults to the shipped catalog; a mod or
// a test may swap it). Mirrors the spell/ability registry pattern.
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
