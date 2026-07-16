// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The SPELL catalog: 25 player-CAST spells, unlocked one per 10 points of
// effective INTELLIGENCE (10, 20, … 250 — the stat hard cap). Unlike the free
// ability pickups (defs/abilities.ts) and the forever granted spells
// (game/spells.ts), a cast spell costs MANA and sits on a per-spell cooldown;
// the hero slots a few onto the HUD spell bar and taps them off. Each spell is
// one of three schools — a single-target ATTACK, an AOE burst, or a DEFENSE
// (heal / ward / crowd-slow). Damage/heal numbers are authored AT LEVEL 1 and
// ride the shared `abilityPowerScale` (level ramp × INT deepening) at cast, so
// a spell keeps meaning the same fraction of a level-appropriate healthbar all
// campaign while a high-INT mage's casts hit far harder. Content is data:
// adding a spell is a new entry here (+ its icon), not an engine change.
//
// NOTE the name split: `SpellKind` (types.ts) is the granted-item spell enum
// (orbit/storm/stasis); THIS is the separate cast-spell catalog. The cast logic
// lives in game/sorcery.ts.

import type { StatName } from "../types.ts";

/** How many slots the HUD spell bar holds — the hero picks which unlocked
 * spells ride them (long-press a slot to reassign). Kept small so the bar
 * stays thumb-reachable in the phone-landscape corner. */
export const SPELL_SLOTS = 4;

/** Effective INTELLIGENCE unlocks one spell per this many points (10, 20, …). */
export const SPELL_UNLOCK_STEP = 10;

/** The stat that both sizes the mana pool and unlocks spells. Named once so
 * the unlock check and the HUD read the same attribute. */
export const SPELL_STAT: StatName = "intelligence";

/** A spell's school — the three flavors the request asks for. */
export type SpellCategory = "attack" | "aoe" | "defense";

/**
 * A spell's elemental THEME — purely presentational (drives the icon palette
 * and the cast-FX tint the app applies over the shared bolt/nova cues); the
 * engine never branches on it.
 */
export type SpellElement =
  | "storm"
  | "fire"
  | "frost"
  | "holy"
  | "void"
  | "arcane"
  | "blood";

/**
 * What a cast DOES. A small primitive set the cast step (sorcery.ts) knows how
 * to resolve, reused across the catalog with scaled numbers:
 * - `bolt`   — single-target: strike the best foe in `range` for `damage`,
 *              then leap to `chain` more nearby foes at a falloff (arcane
 *              lightning). The ATTACK school.
 * - `nova`   — AOE: burst around the hero, hitting every foe within `radius`
 *              for `damage`. The AOE school.
 * - `heal`   — restore `healPct` of max hp to the hero. A DEFENSE school spell.
 * - `shield` — raise a magical ward absorbing `absorbPct` of max hp in damage
 *              for `durationMs`. DEFENSE.
 * - `slow`   — chill every foe within `radius` to `factor` of its speed for
 *              `durationMs` (reuses the frost-chill fields). DEFENSE crowd
 *              control.
 */
export type SpellEffect =
  | { kind: "bolt"; damage: number; range: number; chain?: number }
  | { kind: "nova"; damage: number; radius: number }
  | { kind: "heal"; healPct: number }
  | { kind: "shield"; absorbPct: number; durationMs: number }
  | { kind: "slow"; radius: number; factor: number; durationMs: number };

export type SpellDef = {
  id: string;
  /** Display name (spell bar, picker, unlock modal). */
  name: string;
  category: SpellCategory;
  element: SpellElement;
  /** Effective INTELLIGENCE that unlocks it (a multiple of SPELL_UNLOCK_STEP). */
  minInt: number;
  /** Mana spent per cast. Sized against the pool the unlock INT affords
   * (`MANA.base + minInt × MANA.perInt`), so every spell is castable a few
   * times over the moment it unlocks. */
  manaCost: number;
  /** Cooldown after a cast (ms) — attack spells recharge fast, big defensive
   * and capstone spells slowly. */
  cooldownMs: number;
  effect: SpellEffect;
  /** HUD/ground/modal icon sprite (authored under website/scripts/sprites). */
  icon: string;
  /** One-line flavor for the unlock modal + picker tooltip. */
  blurb: string;
};

/**
 * The 25 shipped spells, ascending by unlock INT. Categories are interleaved so
 * each ×10 milestone feels different from the last, and each school escalates
 * across the ladder (a bigger bolt, a wider nova, a longer ward). The capstone
 * (INT 250) is ARMAGEDDON — the mage's screen-shaping payoff.
 */
export const SPELL_DEFS: Record<string, SpellDef> = {
  arc_bolt: {
    id: "arc_bolt",
    name: "ARC BOLT",
    category: "attack",
    element: "storm",
    minInt: 10,
    manaCost: 8,
    cooldownMs: 1600,
    effect: { kind: "bolt", damage: 26, range: 200 },
    icon: "spell_arc_bolt",
    blurb: "A crackling dart of static leaps to the nearest foe.",
  },
  ember_burst: {
    id: "ember_burst",
    name: "EMBER BURST",
    category: "aoe",
    element: "fire",
    minInt: 20,
    manaCost: 11,
    cooldownMs: 3000,
    effect: { kind: "nova", damage: 18, radius: 66 },
    icon: "spell_ember_burst",
    blurb: "A ring of cinders erupts outward around you.",
  },
  mana_ward: {
    id: "mana_ward",
    name: "MANA WARD",
    category: "defense",
    element: "holy",
    minInt: 30,
    manaCost: 14,
    cooldownMs: 8000,
    effect: { kind: "shield", absorbPct: 0.18, durationMs: 7000 },
    icon: "spell_mana_ward",
    blurb: "A shimmering ward drinks the blows meant for you.",
  },
  frost_lance: {
    id: "frost_lance",
    name: "FROST LANCE",
    category: "attack",
    element: "frost",
    minInt: 40,
    manaCost: 13,
    cooldownMs: 1800,
    effect: { kind: "bolt", damage: 40, range: 214 },
    icon: "spell_frost_lance",
    blurb: "A spear of ice punches clean through a single foe.",
  },
  gravitic_pulse: {
    id: "gravitic_pulse",
    name: "GRAVITIC PULSE",
    category: "aoe",
    element: "void",
    minInt: 50,
    manaCost: 17,
    cooldownMs: 3600,
    effect: { kind: "nova", damage: 27, radius: 80 },
    icon: "spell_gravitic_pulse",
    blurb: "Space buckles outward, throwing the crowd off its feet.",
  },
  mending_light: {
    id: "mending_light",
    name: "MENDING LIGHT",
    category: "defense",
    element: "holy",
    minInt: 60,
    manaCost: 18,
    cooldownMs: 9000,
    effect: { kind: "heal", healPct: 0.3 },
    icon: "spell_mending_light",
    blurb: "Warm light knits your wounds back together.",
  },
  chain_spark: {
    id: "chain_spark",
    name: "CHAIN SPARK",
    category: "attack",
    element: "storm",
    minInt: 70,
    manaCost: 16,
    cooldownMs: 2200,
    effect: { kind: "bolt", damage: 34, range: 204, chain: 2 },
    icon: "spell_chain_spark",
    blurb: "Lightning arcs from one foe to the next.",
  },
  inferno: {
    id: "inferno",
    name: "INFERNO",
    category: "aoe",
    element: "fire",
    minInt: 80,
    manaCost: 22,
    cooldownMs: 4200,
    effect: { kind: "nova", damage: 37, radius: 88 },
    icon: "spell_inferno",
    blurb: "A blossom of flame engulfs everything near you.",
  },
  frost_nova: {
    id: "frost_nova",
    name: "FROST NOVA",
    category: "defense",
    element: "frost",
    minInt: 90,
    manaCost: 20,
    cooldownMs: 7000,
    effect: { kind: "slow", radius: 98, factor: 0.35, durationMs: 3500 },
    icon: "spell_frost_nova",
    blurb: "A freezing ring locks the horde in a slow crawl.",
  },
  void_lance: {
    id: "void_lance",
    name: "VOID LANCE",
    category: "attack",
    element: "void",
    minInt: 100,
    manaCost: 24,
    cooldownMs: 2400,
    effect: { kind: "bolt", damage: 58, range: 230 },
    icon: "spell_void_lance",
    blurb: "A lance of pure nothing unmakes a single target.",
  },
  tempest: {
    id: "tempest",
    name: "TEMPEST",
    category: "aoe",
    element: "storm",
    minInt: 110,
    manaCost: 26,
    cooldownMs: 4200,
    effect: { kind: "nova", damage: 44, radius: 94 },
    icon: "spell_tempest",
    blurb: "A whirl of storm shreds the ranks around you.",
  },
  arcane_aegis: {
    id: "arcane_aegis",
    name: "ARCANE AEGIS",
    category: "defense",
    element: "arcane",
    minInt: 120,
    manaCost: 28,
    cooldownMs: 10000,
    effect: { kind: "shield", absorbPct: 0.3, durationMs: 8000 },
    icon: "spell_arcane_aegis",
    blurb: "A stronger ward, longer lived, wraps you whole.",
  },
  disintegrate: {
    id: "disintegrate",
    name: "DISINTEGRATE",
    category: "attack",
    element: "blood",
    minInt: 130,
    manaCost: 30,
    cooldownMs: 2600,
    effect: { kind: "bolt", damage: 74, range: 230 },
    icon: "spell_disintegrate",
    blurb: "A searing beam boils a foe away where it stands.",
  },
  meteor: {
    id: "meteor",
    name: "METEOR",
    category: "aoe",
    element: "fire",
    minInt: 140,
    manaCost: 34,
    cooldownMs: 5200,
    effect: { kind: "nova", damage: 58, radius: 106 },
    icon: "spell_meteor",
    blurb: "A falling star cracks the ground wide open.",
  },
  renewal: {
    id: "renewal",
    name: "RENEWAL",
    category: "defense",
    element: "holy",
    minInt: 150,
    manaCost: 34,
    cooldownMs: 9000,
    effect: { kind: "heal", healPct: 0.45 },
    icon: "spell_renewal",
    blurb: "A surge of vitality floods back into your body.",
  },
  thunderspear: {
    id: "thunderspear",
    name: "THUNDERSPEAR",
    category: "attack",
    element: "storm",
    minInt: 160,
    manaCost: 34,
    cooldownMs: 2600,
    effect: { kind: "bolt", damage: 66, range: 234, chain: 3 },
    icon: "spell_thunderspear",
    blurb: "A hurled bolt forks through a whole file of foes.",
  },
  supernova: {
    id: "supernova",
    name: "SUPERNOVA",
    category: "aoe",
    element: "void",
    minInt: 170,
    manaCost: 40,
    cooldownMs: 5600,
    effect: { kind: "nova", damage: 70, radius: 112 },
    icon: "spell_supernova",
    blurb: "A dying star's shockwave flattens the field.",
  },
  time_dilation: {
    id: "time_dilation",
    name: "TIME DILATION",
    category: "defense",
    element: "arcane",
    minInt: 180,
    manaCost: 38,
    cooldownMs: 8000,
    effect: { kind: "slow", radius: 122, factor: 0.3, durationMs: 4500 },
    icon: "spell_time_dilation",
    blurb: "Time itself crawls for everything hunting you.",
  },
  annihilate: {
    id: "annihilate",
    name: "ANNIHILATE",
    category: "attack",
    element: "blood",
    minInt: 190,
    manaCost: 42,
    cooldownMs: 2800,
    effect: { kind: "bolt", damage: 96, range: 240 },
    icon: "spell_annihilate",
    blurb: "Raw force erases a target from existence.",
  },
  cataclysm: {
    id: "cataclysm",
    name: "CATACLYSM",
    category: "aoe",
    element: "fire",
    minInt: 200,
    manaCost: 46,
    cooldownMs: 6000,
    effect: { kind: "nova", damage: 84, radius: 122 },
    icon: "spell_cataclysm",
    blurb: "A firestorm consumes everything in a wide ring.",
  },
  sanctuary: {
    id: "sanctuary",
    name: "SANCTUARY",
    category: "defense",
    element: "holy",
    minInt: 210,
    manaCost: 46,
    cooldownMs: 11000,
    effect: { kind: "shield", absorbPct: 0.42, durationMs: 9000 },
    icon: "spell_sanctuary",
    blurb: "Hallowed light stands between you and every blow.",
  },
  chain_lightning: {
    id: "chain_lightning",
    name: "CHAIN LIGHTNING",
    category: "attack",
    element: "storm",
    minInt: 220,
    manaCost: 46,
    cooldownMs: 2800,
    effect: { kind: "bolt", damage: 88, range: 240, chain: 4 },
    icon: "spell_chain_lightning",
    blurb: "A living arc that jumps from body to body to body.",
  },
  annulment: {
    id: "annulment",
    name: "ANNULMENT",
    category: "aoe",
    element: "void",
    minInt: 230,
    manaCost: 50,
    cooldownMs: 6400,
    effect: { kind: "nova", damage: 100, radius: 128 },
    icon: "spell_annulment",
    blurb: "A collapsing void erases the crowd around you.",
  },
  divine_mending: {
    id: "divine_mending",
    name: "DIVINE MENDING",
    category: "defense",
    element: "holy",
    minInt: 240,
    manaCost: 52,
    cooldownMs: 10000,
    effect: { kind: "heal", healPct: 0.6 },
    icon: "spell_divine_mending",
    blurb: "A miracle pours you back to fighting shape.",
  },
  armageddon: {
    id: "armageddon",
    name: "ARMAGEDDON",
    category: "aoe",
    element: "fire",
    minInt: 250,
    manaCost: 58,
    cooldownMs: 8000,
    effect: { kind: "nova", damage: 140, radius: 152 },
    icon: "spell_armageddon",
    blurb: "The sky falls. Nothing near you is left standing.",
  },
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

/** True when the hero's effective INTELLIGENCE (`effInt`) unlocks `def`. */
export function isSpellUnlocked(def: SpellDef, effInt: number): boolean {
  return effInt >= def.minInt;
}

/**
 * Every spell the hero's effective INTELLIGENCE unlocks, ascending by `minInt`
 * — the pool the spell-bar picker offers. Reads the active catalog so fixtures
 * work.
 */
export function unlockedSpellIds(effInt: number): string[] {
  return Object.values(activeSpellDefs)
    .filter((def) => isSpellUnlocked(def, effInt))
    .sort((a, b) => a.minInt - b.minInt)
    .map((def) => def.id);
}

/**
 * The spell ids newly unlocked by INT rising from `before` to `after` (i.e.
 * whose `minInt` falls in `(before, after]`), ascending — what `allocateStat`
 * enqueues for the "SPELL UNLOCKED" modal when an INT point crosses a ×10
 * milestone.
 */
export function spellsUnlockedBetween(before: number, after: number): string[] {
  return Object.values(activeSpellDefs)
    .filter((def) => def.minInt > before && def.minInt <= after)
    .sort((a, b) => a.minInt - b.minInt)
    .map((def) => def.id);
}
