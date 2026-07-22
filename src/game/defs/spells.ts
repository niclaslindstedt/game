// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The CAST-SPELL catalog: 75 player-cast powers across THREE CLASSES, one per
// 10 points of the class's governing stat (10, 20, … 250 — the stat hard cap).
// A hero's CLASS is simply their dominant offensive stat (see
// `dominantSpellStat`): STRENGTH → melee ARTS, DEXTERITY → ranged TECHNIQUES,
// INTELLIGENCE → magic SPELLS. You only ever see your own class's list, so a
// build's identity picks its powers. Every cast costs MANA (INT sizes the pool)
// and sits on a per-spell cooldown; the hero slots a few onto the HUD spell bar
// and taps them off. Each is one of three schools — a single-target ATTACK, an
// AOE burst, or a DEFENSE (heal / ward / crowd-slow / self-buff). Damage/heal
// numbers are authored AT LEVEL 1 and ride the shared `abilityPowerScale` at
// cast, so a power keeps meaning the same fraction of a level-appropriate
// healthbar all campaign while a deeper stat hits far harder. Content is data:
// adding a power is a new entry in one of the ladder files, not an engine
// change.
//
// The three ladders live in sibling files (spell-ladders/{melee,ranged,magic})
// and are merged here; this file owns the shared TYPES, the class helpers, and
// the registry accessors.
//
// NOTE the name split: `SpellKind` (types.ts) is the granted-item spell enum
// (orbit/storm/stasis); THIS is the separate cast-spell catalog. The cast logic
// lives in game/sorcery.ts; the state-aware class helpers (which need
// `effectiveStat`) live in game/items/spellcasting.ts.

import type { StatName } from "../types.ts";
import { MELEE_SPELLS } from "./spell-ladders/melee.ts";
import { RANGED_SPELLS } from "./spell-ladders/ranged.ts";
import { MAGIC_SPELLS } from "./spell-ladders/magic.ts";

/** How many slots the HUD spell bar holds — the hero picks which unlocked
 * spells ride them (long-press a slot to reassign). Kept small so the bar
 * stays thumb-reachable in the phone-landscape corner. */
export const SPELL_SLOTS = 4;

/**
 * The GLOBAL COOLDOWN every cast shares: after ANY spell is cast, no other
 * spell can fire (nor can the queue dequeue the next one) until this lapses.
 * Distinct from each spell's own `cooldownMs` — it paces the whole bar so a
 * queued chain fires one spell at a time rather than all at once, and stops a
 * single mana-rich cast from spamming. Ticked down in `stepRegen`.
 */
export const SPELL_GLOBAL_COOLDOWN_MS = 500;

/** A class's governing stat unlocks one power per this many points (10, 20, …). */
export const SPELL_UNLOCK_STEP = 10;

/**
 * The three offensive stats, each the gate of one spell CLASS. A hero's
 * DOMINANT one (see `dominantSpellStat`) is their class — the only school whose
 * powers surface to them. Order is the tiebreak priority (STR > DEX > INT) so a
 * balanced build's class never flickers.
 */
export const SPELL_STATS: readonly StatName[] = [
  "strength",
  "dexterity",
  "intelligence",
];

/**
 * A hero spell CLASS — the school gated behind each of the three offensive
 * stats: melee ARTS ride STRENGTH, ranged TECHNIQUES ride DEXTERITY, magic
 * SPELLS ride INTELLIGENCE. (Same three strings as `WeaponClass`, deliberately
 * — a build's spell class and its favored weapon class line up.)
 */
export type SpellClass = "melee" | "ranged" | "magic";

/** The stat that governs each class. */
export const SPELL_CLASS_STAT: Record<SpellClass, StatName> = {
  melee: "strength",
  ranged: "dexterity",
  magic: "intelligence",
};

/** The class each governing stat unlocks (the inverse of `SPELL_CLASS_STAT`). */
export const SPELL_STAT_CLASS: Partial<Record<StatName, SpellClass>> = {
  strength: "melee",
  dexterity: "ranged",
  intelligence: "magic",
};

/** A spell's school — the three flavors shared across every class. */
export type SpellCategory = "attack" | "aoe" | "defense";

/**
 * A spell's elemental THEME — purely presentational (drives the icon palette
 * and the cast-FX tint the app applies over the shared bolt/nova cues); the
 * engine never branches on it. Magic leans arcane/storm/fire/frost/holy/void/
 * blood; the martial classes add physical themes — `steel` (blades), `earth`
 * (quakes/slams), `wind` (arrows/gusts), `venom` (poison).
 */
export type SpellElement =
  | "storm"
  | "fire"
  | "frost"
  | "holy"
  | "void"
  | "arcane"
  | "blood"
  | "steel"
  | "earth"
  | "wind"
  | "venom";

/**
 * What a cast DOES. A small primitive set the cast step (sorcery.ts) knows how
 * to resolve, reused across all three classes with scaled numbers:
 * - `bolt`   — single-target: strike the best foe in `range` for `damage`,
 *              then leap to `chain` more nearby foes at a falloff. The ATTACK
 *              school (a magic bolt, a melee lunge, a ranged shot).
 * - `nova`   — AOE around the HERO: burst hitting every foe within `radius`.
 *              The AOE school for magic & melee (a blast, a cleave/slam).
 * - `rain`   — AOE at RANGE: the ranged class's AOE — land a `radius` burst on
 *              the best foe cluster within `castRange` (a volley/barrage).
 * - `heal`   — restore `healPct` of max hp to the hero. A DEFENSE school power.
 * - `shield` — raise a ward absorbing `absorbPct` of max hp for `durationMs`.
 * - `slow`   — chill every foe within `radius` to `factor` of its speed for
 *              `durationMs` (reuses the frost-chill fields). DEFENSE control.
 * - `buff`   — the martial classes' signature: a timed self-buff raising the
 *              hero's own weapon `damageMult` / attack-`hasteMult` / move
 *              `speedMult` for `durationMs` (a war cry, a rapid-fire focus).
 */
export type SpellEffect =
  | { kind: "bolt"; damage: number; range: number; chain?: number }
  | { kind: "nova"; damage: number; radius: number }
  | { kind: "rain"; damage: number; radius: number; castRange: number }
  | { kind: "heal"; healPct: number }
  | { kind: "shield"; absorbPct: number; durationMs: number }
  | { kind: "slow"; radius: number; factor: number; durationMs: number }
  | {
      kind: "buff";
      damageMult?: number;
      hasteMult?: number;
      speedMult?: number;
      durationMs: number;
    };

export type SpellDef = {
  id: string;
  /** Display name (spell bar, picker, unlock modal). */
  name: string;
  /**
   * The governing stat / class this power belongs to
   * (`strength`|`dexterity`|`intelligence`). Surfaced ONLY to a hero whose
   * dominant offensive stat is this one — your class picks your list.
   */
  stat: StatName;
  category: SpellCategory;
  element: SpellElement;
  /** Effective `stat` that unlocks it (a multiple of SPELL_UNLOCK_STEP). */
  minStat: number;
  /** Mana spent per cast. Sized against the pool INT affords
   * (`MANA.base + INT × MANA.perInt`); a physical build fuels its arts off the
   * base pool + SPIRIT regen, or invests some INT for a deeper reservoir. */
  manaCost: number;
  /** Cooldown after a cast (ms) — attack powers recharge fast, big defensive
   * and capstone powers slowly. */
  cooldownMs: number;
  effect: SpellEffect;
  /** HUD/ground/modal icon sprite (authored under content/sprites). */
  icon: string;
  /** One-line flavor for the unlock modal + picker tooltip. */
  blurb: string;
};

/** Build an id→def map from a ladder list, throwing on a duplicate id. */
function byId(list: SpellDef[]): Record<string, SpellDef> {
  const out: Record<string, SpellDef> = {};
  for (const def of list) {
    if (out[def.id]) throw new Error(`duplicate spell id "${def.id}"`);
    out[def.id] = def;
  }
  return out;
}

/**
 * The full catalog — 25 melee ARTS + 25 ranged TECHNIQUES + 25 magic SPELLS,
 * merged. Each ladder ascends by unlock stat with the schools interleaved so
 * every ×10 milestone feels different, and each escalates across the run to a
 * screen-shaping capstone at 250.
 */
export const SPELL_DEFS: Record<string, SpellDef> = {
  ...byId(MELEE_SPELLS),
  ...byId(RANGED_SPELLS),
  ...byId(MAGIC_SPELLS),
};

// Active registry the accessor reads (defaults to the shipped catalog;
// tests may swap in fixtures). Mirrors the ability-def registry pattern.
let activeSpellDefs: Record<string, SpellDef> = SPELL_DEFS;

/** Test/authoring hook: replace the active spell catalog. */
export function setSpellDefs(defs: Record<string, SpellDef>): void {
  activeSpellDefs = defs;
}

/** The active spell catalog (defaults to `SPELL_DEFS`). */
export function spellDefs(): Record<string, SpellDef> {
  return activeSpellDefs;
}

/** Look up a spell def; throws on a broken id so bugs surface loudly. */
export function spellDef(id: string): SpellDef {
  const def = activeSpellDefs[id];
  if (!def) throw new Error(`unknown spell def "${id}"`);
  return def;
}

/** The class a spell belongs to, from its governing stat. */
export function spellClassOf(def: SpellDef): SpellClass {
  return SPELL_STAT_CLASS[def.stat] ?? "magic";
}

/** True when `statValue` (the hero's effective governing stat) reaches `def`'s
 * unlock threshold. Class membership is checked separately (see
 * `isSpellAvailable` in items/spellcasting.ts) — this is the pure numeric gate. */
export function isSpellUnlocked(def: SpellDef, statValue: number): boolean {
  return statValue >= def.minStat;
}

/**
 * The hero's spell CLASS stat — the dominant of STRENGTH / DEXTERITY /
 * INTELLIGENCE, or null when none reaches the first unlock step (a balanced or
 * un-invested build has no class, hence no spell bar). Ties resolve to the
 * `SPELL_STATS` priority order (STR > DEX > INT) so a build's class never
 * flickers between two equal stats.
 */
export function dominantSpellStat(
  strength: number,
  dexterity: number,
  intelligence: number,
): StatName | null {
  const ranked: [StatName, number][] = [
    ["strength", strength],
    ["dexterity", dexterity],
    ["intelligence", intelligence],
  ];
  let best: StatName | null = null;
  let bestVal = -1;
  // Strict `>` keeps the first-seen on a tie, so the SPELL_STATS order is the
  // tiebreak priority.
  for (const [stat, value] of ranked) {
    if (value > bestVal) {
      best = stat;
      bestVal = value;
    }
  }
  return bestVal >= SPELL_UNLOCK_STEP ? best : null;
}

/** Every spell governed by `stat`, ascending by `minStat`. */
export function spellsForStat(stat: StatName): SpellDef[] {
  return Object.values(activeSpellDefs)
    .filter((def) => def.stat === stat)
    .sort((a, b) => a.minStat - b.minStat);
}

/**
 * Every spell of `stat`'s class that `value` (the hero's effective governing
 * stat) unlocks, ascending — the pool the spell-bar picker offers a hero of
 * that class.
 */
export function unlockedSpellIdsForStat(
  stat: StatName,
  value: number,
): string[] {
  return spellsForStat(stat)
    .filter((def) => value >= def.minStat)
    .map((def) => def.id);
}

/**
 * The ids of `stat`'s class newly unlocked by that stat rising from `before` to
 * `after` (i.e. whose `minStat` falls in `(before, after]`), ascending — what
 * `allocateStat` enqueues for the unlock modal when a class point crosses a ×10
 * milestone.
 */
export function spellsUnlockedBetweenForStat(
  stat: StatName,
  before: number,
  after: number,
): string[] {
  return spellsForStat(stat)
    .filter((def) => def.minStat > before && def.minStat <= after)
    .map((def) => def.id);
}
