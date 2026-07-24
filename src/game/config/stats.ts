// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The six attributes' effects (what a point of STR/DEX/INT/LUCK/SPIRIT/
// STAMINA buys) and the weapon stat-requirement gate.

import type { WeaponClass } from "../types/index.ts";

/**
 * Stat effects. STRENGTH scales physical (melee + ranged) weapon DAMAGE and
 * widens the carry bag; DEXTERITY quickens physical (melee + ranged) ATTACK
 * SPEED, lifts the HIT RATE (fewer weapon MISSES and enemy DODGES — see
 * ACCURACY), lands physical CRITS, and sharpens DODGE; INTELLIGENCE powers magic
 * weapons (their damage AND speed), lands magic CRITS, and for every weapon
 * lengthens RANGE and widens the melee AoE cone (plus the magnet pull, in
 * abilities.ts); LUCK finds better items, nudges crits and dodge up MARGINALLY
 * (a quarter of DEX/INT's effect), and shrugs off enemies' critical hits;
 * STAMINA deepens the sprint pool, quickens its recovery (see STAMINA below),
 * AND raises max hp. (Move speed is no longer a stat — it comes from the base
 * walk, gear/buffs, and DEXTERITY in the talent era.) The class→stat maps live
 * in items/class-stats.ts (`DAMAGE_STAT`, `SPEED_STAT`, `CRIT_STAT`).
 */
export const STATS = {
  /**
   * LEVEL-SCALED STAT CAP (see `statCap`/`diminishStat` in leveling.ts). Every
   * effective-stat read runs through it. The ceiling for a stat is exactly what
   * you'd reach by pouring ALL your chosen points into that one stat
   * (`statCeilingBase + chosenStatPointsThrough(level)`), so a full SPEC realizes
   * its raw value with no diminishing — one stat can truly dominate — and the
   * ceiling RISES as you level, hard-capped at `statHardCap` (250, reached ~L66).
   * CHOSEN points wall at the cap (the chooser blocks placing past it); GEAR (and
   * the auto gains / head-start) push effective PAST the cap through a gentle
   * diminishing tail (`over/(1 + statTaper·over)`), so an ilvl-200 artifact is
   * felt hard and nothing is wasted, but items never get the undiminished linear
   * value a spec'd stat does. `autoPowerScale` rides the same curve so the horde's
   * hp compensation still cancels. The point: specs and endgame gear stay
   * relevant to the cap instead of flattening at a fixed ~90.
   */
  statHardCap: 250,
  statCeilingBase: 10,
  statTaper: 0.01,
  /**
   * Damage multiplier per point of the weapon's DAMAGE stat, keyed by that stat
   * (STRENGTH for melee & ranged, INTELLIGENCE for magic — see `DAMAGE_STAT`).
   * STRENGTH scales harder than INTELLIGENCE on purpose: STR's payoffs are raw
   * damage plus a melee blade's REACH (`rangePerStr`, a gentle secondary),
   * whereas INT buys MORE across the board — the melee cleave's WIDTH and target
   * COUNT (`aoePerInt`/`aoeTargetsPerInt`), ranged/magic reach (`rangePerInt`),
   * magic attack speed and magic crit — so a gentler damage slope keeps a mage's
   * total package from dwarfing a bruiser. A high STR build is the honest
   * glass-cannon: it hits the hardest per point, and pays for it with the
   * walk penalty below.
   */
  damageBonusPerPoint: { strength: 0.2, intelligence: 0.12 } as Record<
    "strength" | "intelligence",
    number
  >,
  /**
   * STRENGTH's downside: every point of muscle to haul slows the walk by this
   * fraction (−1% each), floored at `strengthSlowFloor` so even a pure bruiser
   * still moves. It is a gentle tax — a few points are unnoticeable, but a build
   * that dumps everything into STR trades genuine mobility for its firepower,
   * so raw muscle and footwork pull against each other instead of stacking for
   * free.
   */
  strengthSlowPerPoint: 0.01,
  /** The slowest STRENGTH can drag the walk (a 50% floor on the penalty above),
   * so no amount of muscle roots the hero in place. */
  strengthSlowFloor: 0.5,
  /**
   * STRENGTH also widens the carry bag: each point adds this many inventory
   * slots on top of the small `LOOT.baseInventorySize` floor, so a bruiser
   * hauls more loot between the fights (see `inventoryCapacity`). Whole slots
   * only — the capacity floors the product.
   */
  bagSlotsPerStr: 1,
  /**
   * INTELLIGENCE lengthens a RANGED or MAGIC weapon's reach by this fraction of
   * its base range per point (+3% each) — a high-INT gunner/caster reaches out
   * and holds the crowd further back. MELEE reach is STRENGTH's, not INT's (see
   * `rangePerStr`): the split puts a blade's DEPTH on the melee build's own stat
   * and leaves INT the cone's BREADTH (`aoePerInt`) and target COUNT
   * (`aoeTargetsPerInt`).
   */
  rangePerInt: 0.03,
  /**
   * STRENGTH lengthens a MELEE weapon's reach by this fraction of its base range
   * per point — the DEPTH of the thrust, how hard/far the bruiser drives the
   * blade. Kept a notch UNDER INT's `rangePerInt` (STRENGTH already buys melee
   * DAMAGE, so its reach payoff is gentler to stop the one stat compounding into
   * a must-dump). A melee build (STR-heavy) now out-reaches its old INT-less
   * self, while INT still owns how WIDE the cone sweeps and how MANY it strikes —
   * so reaching deep (STR) and cleaving wide (INT) are distinct investments.
   * Reach feeds the cone's AREA, so more STR also lifts the realized target
   * count (see `weaponAssumedTargets` / the AoE calibration) — priced in.
   */
  rangePerStr: 0.02,
  /**
   * INTELLIGENCE also widens a melee weapon's AoE cone by this fraction of its
   * base half-angle per point (+0.8% each): a sword's slash sweeps a broader
   * arc and a spear's thrust a slightly wider lane. Scaling the angle keeps
   * each weapon's shape (a narrow spear stays narrow). It grows GENTLY and
   * saturates at a HALF circle (`aoeMaxHalfAngle`), not a full one — a wide
   * cleaver reaches that half-circle cap only at deep-endgame INT (~100
   * effective), while an ordinary AoE build sweeps roughly a third of the
   * circle. Melee-only — ranged/magic have no cone.
   */
  aoePerInt: 0.008,
  /**
   * The hard ceiling on the INT-widened melee cone: a HALF circle (π/2
   * half-angle → a 180° total sweep). Even extreme INT on the widest weapon
   * saturates here rather than wrapping toward a full 360° disc, so a swing
   * always leaves a back arc uncovered and positioning still matters.
   */
  aoeMaxHalfAngle: Math.PI / 2,
  /**
   * INTELLIGENCE also raises the CAP on how many monsters one melee swing can
   * hit (see MELEE.baseAoeTargets): each point adds one extra foe to the
   * cleave. Widening the cone (aoePerInt) only lets a swing SEE more of the
   * crowd; this is what lets it actually strike them, so horde-clearing melee
   * is an INTELLIGENCE build, not a free STRENGTH perk.
   */
  aoeTargetsPerInt: 1,
  /**
   * Attack-speed gained per point of the weapon's SPEED stat (DEX for melee &
   * ranged, INT for magic — see `SPEED_STAT`): the effective cooldown is
   * divided by `1 + stat * this`, so +2% cadence per point. Base weapons fire
   * deliberately slowly — a build grows the fire rate back by investing in its
   * speed stat, so standing still stops clearing the horde for free. Kept
   * gentle so the speed stat sweetens cadence rather than dominating a build:
   * pumping DEX/INT ramps fire rate roughly half as fast as damage climbs.
   *
   * PHYSICAL lanes only (DEX quickens melee & ranged). Magic uses the lower
   * `magicAttackSpeedPerStat` below, because a caster's SPEED stat is the SAME
   * INTELLIGENCE that already scales its damage AND crit — so a point of INT
   * would otherwise compound cadence ON TOP of damage on the same investment,
   * and a deep-INT mage's DPS ran away from the physical lanes (which must split
   * points between a damage stat and DEX) by ~5× in the late game. The reduced
   * magic value keeps INT sweetening cast cadence without the multiplicative
   * runaway; magic still leads mid/late, just no longer by a blowout.
   */
  attackSpeedPerStat: 0.02,
  /**
   * Attack-speed per point of INTELLIGENCE for MAGIC weapons only (INT is
   * magic's speed stat — see `SPEED_STAT`). Lower than the physical
   * `attackSpeedPerStat` because INT already buys a caster's damage and crit, so
   * its cadence contribution is discounted to stop the DPS compounding (damage ×
   * speed on one stat) from letting a high-INT mage out-scale every other build.
   */
  magicAttackSpeedPerStat: 0.012,
  /** Player base crit chance before stats and equipment. */
  baseCritChance: 0.05,
  /**
   * Crit chance SATURATES toward this ceiling (`saturateToward` in items/combat-stats.ts) —
   * it never reaches 100%. The linear crit budget (base + crit-stat + luck +
   * affixes) reads ~as-is while small, then bends toward `critCap` so the last
   * few percent cost a lot of stat: with the raised stat cap a DEX/INT spec
   * would otherwise blow past 100% (it was un-clamped). Below 1.0 by design.
   */
  critCap: 0.8,
  /**
   * Crit chance gained per point of the weapon's CRIT stat — DEXTERITY for
   * melee & ranged, INTELLIGENCE for magic (see `CRIT_STAT`). This is the main
   * driver of a build's crit rate: a nimble knife-fighter crits with DEX, a
   * mage crits with INT.
   */
  critChancePerStat: 0.04,
  /**
   * LUCK also nudges crit up, but only MARGINALLY — a quarter of a primary
   * point (critChancePerStat), so LUCK sweetens any build's crits without
   * replacing the class stat that actually earns them.
   */
  critChancePerLuck: 0.01,
  /** Reduction of enemy crit chance per LUCK point (floored at 0). */
  critAvoidPerLuck: 0.02,
  /** Extra drop chance per LUCK point. */
  dropChancePerLuck: 0.01,
  /** Extra chance per LUCK point that a drop upgrades its tier roll. */
  tierChancePerLuck: 0.04,
  /**
   * The fallback crit-damage multiplier for conjured blows that carry no weapon
   * (nova, storm, bolt, the nuke) and the projectile default. Weapon crits use
   * the per-class `critMultByClass` below instead.
   */
  critMultiplier: 2,
  /**
   * CRIT DAMAGE — how many times the blow a crit deals. It is a CLASS FLOOR
   * (ranged > melee > magic) deepened by DEXTERITY, the precision stat, and NOT
   * a per-item number (the item card shows no crit-damage line). The order is
   * the classes' identity:
   *   - RANGED crits HARDEST — the ranged build maxes DEX (its gate/speed/crit-
   *     chance stat), so DEX-scaled crit weight makes the marksman crit both
   *     OFTEN and HARD: precision is its whole payoff.
   *   - MELEE next — a moderate DEX build lifts its solid physical crit a little.
   *   - MAGIC softest — a caster builds ZERO DEX, so it sits at its floor; its
   *     edge is AoE + spell utility + ignoring armor, not crit weight.
   * DEX (not STR, which the bruiser stacks most, nor INT, which would re-inflate
   * the mage) is what makes RANGED the crit king. The budget model prices crit
   * off the stat-independent floor.
   */
  critMultByClass: {
    melee: 1.9,
    ranged: 2.05,
    magic: 1.6,
  } as Record<WeaponClass, number>,
  /** Crit DAMAGE deepens by this per point of DEXTERITY (all weapon classes) —
   * the precision slope that makes a DEX-max ranged build crit hardest while a
   * DEX-less caster stays at its floor. Deliberately GENTLE: ranged's crit is a
   * clear FLAVOUR edge, not a power gap so wide that the armored endgame (where
   * MELEE's armor piercing is meant to decide it) can never catch up. */
  critDamagePerDex: 0.0015,
  /**
   * MAGIC crit HARD CAP — a magic weapon's crit multiplier can never exceed this,
   * pinned to melee's floor (`critMultByClass.melee`) so a caster that stacks
   * gear DEX still never out-crits a bruiser. The guarantee that crit is a
   * physical-class identity, magic the softest.
   */
  magicCritCap: 1.9,
  /** Crit DAMAGE of a conjured SPELL/ability blow (nova, storm, bolt, the nuke)
   * — a flat static value, low like a magic weapon: a caster's spells hit wide,
   * not crit-hard. Weaponless mob crits still use `critMultiplier`. */
  spellCritMult: 1.5,
  /**
   * ARMOR PIERCING — the fraction of a mob's armor reduction a class's weapon
   * IGNORES (subtracted from `mobArmorReduction` in `mobArmorMult`, floored at
   * 0). Mob armor rises to 50% by the JESUS cap and cuts PHYSICAL blows, which
   * is why the armored mid/late game tilted toward MAGIC (it ignores armor
   * outright). Giving the physical lanes their own penetration is the honest
   * counter, and it is MELEE'S endgame identity: a bruiser sunders armor with
   * raw force, so MELEE pierces most at baseline AND carries the strongest
   * `armorPen` relics — the two together let a decked-out melee hero fully
   * negate the 50%-armored JESUS endgame and reclaim the top. RANGED pierces
   * some (its edge is crit, not sundering, so it still eats a sliver of armor
   * late unless it finds pierce), MAGIC none (it bypasses armor already). So the
   * class order through the armored endgame EMERGES from armor-vs-penetration.
   */
  armorPenByClass: {
    melee: 0.3,
    ranged: 0.25,
    magic: 0,
  } as Record<WeaponClass, number>,
} as const;

/**
 * WEAPON STAT REQUIREMENTS — the Diablo attribute gate that forces a build to
 * pick a lane. On top of a weapon's LEVEL requirement, each class demands a
 * minimum in ITS attribute before the hero can wield it: melee wants STRENGTH,
 * ranged wants DEXTERITY, magic wants INTELLIGENCE (see `REQ_STAT` in items/class-stats.ts).
 * The number is DERIVED from the weapon's `levelReq`, never authored per item,
 * so the whole arsenal is calibrated by one knob and never needs re-tuning when
 * a base's numbers move — see `statRequirement` / `meetsStatReq` in items/requirements.ts.
 *
 * The requirement is `autoFloor + round(investFraction × chosenPoints)`, where
 * `chosenPoints` is the trainable points a hero has banked by that levelReq
 * (`chosenStatPointsThrough`) and `autoFloor` is the automatic per-level growth
 * that stat has accrued by then (`baseStatBonus`, zero for INTELLIGENCE and
 * zero for EVERY stat while the AUTO LEVEL STATS dev flag is off). Adding the
 * auto floor is what makes the gate track the "level auto stats" setting: with
 * auto growth ON the hero is handed those points for free, so the requirement
 * rises by exactly that much and the CHOSEN investment it truly demands —
 * `investFraction` of the hero's trainable points — stays identical whether the
 * flag is on or off. That invariance is the whole point: a developer can toggle
 * WoW-style auto-attributes without recalibrating a single item.
 */
export const STAT_REQ = {
  /**
   * The share of a hero's TRAINABLE (chosen) stat points a focused build is
   * assumed to commit to its class attribute — hence the chosen-point portion
   * of every weapon's requirement. At the shipped 0.4 a melee hero must sink
   * ~40% of their points into STRENGTH to swing the era's heavy weapons, which
   * still leaves the majority for STAMINA (survival), the class's speed/crit
   * stat, and the rest — a realistic focused build, not an all-in dump. Raise
   * it to force a harder commitment, lower it to loosen the lanes. Requirements
   * are checked against the hero's RAW (pre-diminish) attribute so the gate
   * measures points invested, not their diminished combat value.
   */
  investFraction: 0.4,
} as const;
