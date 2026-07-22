// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE BONUS-BUDGET MODEL — what a unique/legendary's fixed bonuses are WORTH,
// priced in ilvl points (1 stat point = 1 ilvl, the anchor). This is the one
// source of truth for the pricing: `scripts/weapon-ilvl.mjs` (the authoring
// checker) imports the table from here, and the engine itself reads it at
// runtime to derive a LEGENDARY's drop rarity from its power (see
// `pickUniqueForDrop` in items.ts — "stats determine rarity").
//
// Every rate that CAN be derived from the live combat/item constants IS —
// buff STR's damage or move the armor curve and every valuation moves with
// it. The handful of design premiums that have no combat-constant analogue
// (scaling keepers, granted spells, procs, sure strike) are authored here,
// loudly, in one place.

import { ACCURACY, ARMOR, PLAYER, STAMINA, STATS } from "./config/index.ts";
import type { Affix, ProcSpell, SpellKind } from "./types.ts";

// ---- Design knobs (NOT combat constants — the few genuine authoring choices) --

/** Flat maxHp/armor is worth this fraction of the HP a STAMINA point grants
 * (a stamina point also buys sprint pool + regen, so raw HP is worth less).
 * Sets how many flat HP = 1 ilvl: `STAMINA.hpPerPoint / FLAT_HP_FRACTION`. */
export const FLAT_HP_FRACTION = 0.4;

/** ilvl per +1% of a SCALING bonus (statPct/maxHpPct): a fraction of the
 * hero's own value that compounds forever, so it's a heavy premium with no
 * combat-constant analogue (maxHpPct additionally HP-discounted). */
export const SCALING_PREMIUM = 10;

/** The reference fight the armor curve is valued at (armor's worth is
 * attacker-level and HP-pool dependent, so a reference point is unavoidable).
 * REF_HP is a mid-game pool; REF_LEVEL the attacker level. */
const REF_LEVEL = 25;
const REF_HP = PLAYER.maxHp + 30 * STAMINA.hpPerPoint;

/** ilvl points one RANK of a granted forever spell is worth. A spell's
 * output rides `abilityPowerScale` (level ramp × INT), so like the scaling
 * keepers it never fades — priced as a design premium near the keepers'
 * weight rather than derived from any single reference fight. */
export const SPELL_RANK_ILVL: Record<SpellKind, number> = {
  orbit: 8,
  storm: 8,
  stasis: 6,
};

/** ilvl points a PROC is worth per rank AT 100% chance — the authored price
 * scales linearly with the proc's actual `chance`, so a 15% on-hit bolt
 * costs 0.15 × rank × this. */
export const PROC_RANK_ILVL: Record<ProcSpell, number> = {
  bolt: 12,
  nova: 14,
};

/** ilvl points SURE STRIKE is worth: mechanically ~the innate baseMiss in
 * recovered dps (cheap), plus a guarantee premium — never whiffing is worth
 * more than its average, and it multiplies every on-hit proc. */
export const SURE_STRIKE_ILVL =
  ACCURACY.baseMiss / STATS.damageBonusPerPoint.strength + 5;

/** ilvl points KNOCKBACK is worth: a marker signature (a flat `KNOCKBACK.distance`
 * shove on every landing melee/ranged blow), so it prices as one fixed premium
 * like sure strike. It buys no damage — a kiting/crowd-control edge with no
 * combat-constant analogue — but a strong one, kept RARE by design, so it costs
 * a handful of stat points. */
export const KNOCKBACK_ILVL = 5;

// ---- The conversion table, DERIVED from the live constants -------------------

const hpPerIlvl = STAMINA.hpPerPoint / FLAT_HP_FRACTION;
// Effective-HP a single armor point buys at the reference fight: from
// EHP = HP·(1 + armor/K), d(EHP)/d(armor) = HP/K, K = kBase + kPerLevel·level.
const armorHpPerPoint = REF_HP / (ARMOR.kBase + ARMOR.kPerLevel * REF_LEVEL);

/** PER_ILVL[kind] = the bonus VALUE that equals exactly one ilvl. */
export const PER_ILVL = {
  stat: 1, // anchor: +1 stat point = 1 ilvl
  damagePct: STATS.damageBonusPerPoint.strength, // +damage per STR point
  crit: STATS.critChancePerStat, // +crit per crit-stat point
  maxHp: hpPerIlvl,
  armor: hpPerIlvl / armorHpPerPoint, // flat-HP rate ÷ EHP-per-armor
  statPct: 0.01 / SCALING_PREMIUM, // +1% scaling stat = SCALING_PREMIUM ilvl
  maxHpPct: 0.01 / SCALING_PREMIUM / FLAT_HP_FRACTION, // HP-discounted
  // ARMOR PIERCING: ignoring a point of the mob's armor restores roughly that
  // fraction of a physical blow against the armored late game — a conditional
  // damage bonus, so priced near `damagePct` but a touch dearer for being the
  // endgame-defining chase stat. +10 pen ≈ 2 ilvl.
  armorPen: 0.05,
} as const;

/** One bonus → its ilvl worth (signed — a downside subtracts). */
export function bonusIlvlPoints(affix: Affix): number {
  switch (affix.kind) {
    case "stat":
      return affix.value / PER_ILVL.stat;
    case "damagePct":
      return affix.value / PER_ILVL.damagePct;
    case "crit":
      return affix.value / PER_ILVL.crit;
    case "maxHp":
      return affix.value / PER_ILVL.maxHp;
    case "armor":
      return affix.value / PER_ILVL.armor;
    case "statPct":
      return affix.value / PER_ILVL.statPct;
    case "maxHpPct":
      return affix.value / PER_ILVL.maxHpPct;
    case "armorPen":
      return affix.value / PER_ILVL.armorPen;
    case "spell":
      return affix.rank * SPELL_RANK_ILVL[affix.spell];
    case "proc":
      return affix.chance * affix.rank * PROC_RANK_ILVL[affix.spell];
    case "sureStrike":
      return SURE_STRIKE_ILVL;
    case "knockback":
      return KNOCKBACK_ILVL;
  }
}

/** A whole bonus block's ilvl worth — the unique/legendary POWER BUDGET the
 * authoring checker caps and the legendary rarity derivation reads. */
export function bonusBudget(bonuses: Affix[]): number {
  return bonuses.reduce((sum, bonus) => sum + bonusIlvlPoints(bonus), 0);
}
