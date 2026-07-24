// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// STAT BUILDS — the single source of truth for HOW A HERO DISTRIBUTES STAT
// POINTS AS THEY LEVEL. A build is not a character class; it is an allocation
// strategy. Three of the four builds bias the spread toward a weapon CLASS
// (`melee`/`ranged`/`magic`) so the stat-aware auto-equip then prefers that
// class of weapon; the fourth, `balanced`, commits to no lane at all and simply
// spreads points reasonably across every stat. Everything downstream — which
// weapon the auto-equip wears, the armor/charms that out-score what's on — falls
// out of the stats, so a build fully determines "stat allocation AND item
// selection AND equipment" without any code choosing gear by hand.
//
// Two consumers share this ONE definition so a build means the same thing
// everywhere:
//   - the AUTOPILOT (src/game/bot/index.ts `botAllocate`) spends the live hero's
//     points against the build rotation, tick by tick, in the real-loop
//     simulator (src/sim/simulate.ts) and the app's `?bot=` autoplay;
//   - the ANALYTIC paper sim (src/sim/analytic.ts) spends them via
//     `buildStatWeights`, the same rotation expressed as a weight ratio, so the
//     progression graphs read the same distribution.
//
// Adding/retuning a build here moves every balance instrument together — which
// is the point: we always compare builds on the same footing to find whether
// one is overpowered, and to aim each at being the strongest during its own
// stretch of the game.

import { LEVELING } from "./config/index.ts";
import { STAT_NAMES } from "./defs/equipment.ts";
import type { StatName, WeaponClass } from "./types/index.ts";

/** The four stat-distribution strategies the analysis tooling sweeps.
 * `melee`/`ranged`/`magic` bias the spread toward that weapon class; `balanced`
 * spreads across every stat (no pinned lane — the gear is whatever scores
 * best). Not a character class — a way of spending level-up points. */
export type StatBuild = "melee" | "ranged" | "magic" | "balanced";

/** Every build, for CLIs/UIs that validate a requested name. */
export const STAT_BUILDS: StatBuild[] = [
  "melee",
  "ranged",
  "magic",
  "balanced",
];

/** Is `s` a valid stat-build name? */
export function isStatBuild(s: string): s is StatBuild {
  return (STAT_BUILDS as string[]).includes(s);
}

/**
 * The allocation cycle each build spends its points on. A lane-biased build
 * (`melee`/`ranged`/`magic`) commits to ONE weapon class — so the hero deepens
 * one attribute instead of thrashing every time auto-equip swaps its weapon —
 * yet spreads the rest across every stat that grows the lane's DAMAGE, not just
 * its gate. Half of every lane cycle goes to the lane's REQUIRED attribute so
 * the equip gates stay cleared as they scale (~50% comfortably clears the ~40%
 * asked). The other half buys real output:
 *
 * - **INTELLIGENCE rides EVERY physical build** — it widens the swing/blast AoE
 *   cone (`aoePerInt`), raises how many a swing strikes (`aoeTargetsPerInt`),
 *   lengthens RANGED/MAGIC reach (`rangePerInt`), and lifts crit damage
 *   (`critDamagePerInt`), so a melee cleave sweeps WIDER and hits MORE bodies and
 *   a gun reaches across the screen. (A melee blade's REACH, though, is
 *   STRENGTH's — see below.)
 * - **DEXTERITY** is the SPEED attribute for melee & ranged (`SPEED_STAT`), so
 *   both physical lanes buy swing/fire cadence with it; it also gates ranged.
 * - **STRENGTH** is the DAMAGE attribute for BOTH physical lanes (guns scale off
 *   STR, not DEX), so ranged banks it too; it also buys a MELEE weapon's REACH
 *   (`rangePerStr`) — the depth of the thrust — so a bruiser out-reaches the
 *   horde on his own stat while INT decides how wide he cleaves.
 * - **SPIRIT** feeds the out-of-combat health regen; **STAMINA** the legs
 *   every lane needs to reposition.
 *
 * Keyed off total points already spent (not the level), so each individual point
 * rotates through the cycle rather than a whole level-up dumping into one stat.
 */
export const BUILD_ROTATION: Record<StatBuild, StatName[]> = {
  // STR gates AND scales the blow (REQ==DAMAGE) AND buys the blade's REACH → it
  // dominates; DEX buys swing cadence, INT the cleave WIDTH + target count + crit
  // that turns a deep swing into a wide AoE.
  melee: [
    "strength",
    "strength",
    "intelligence",
    "strength",
    "dexterity",
    "strength",
    "intelligence",
    "stamina",
  ],
  // DEX gates AND speeds the shots; STR is the ranged DAMAGE stat; INT buys
  // reach/AoE/crit so the shots carry and cleave.
  ranged: [
    "dexterity",
    "strength",
    "dexterity",
    "intelligence",
    "dexterity",
    "strength",
    "dexterity",
    "intelligence",
  ],
  // INT gates, scales, speeds, AND buys reach/AoE/crit all at once → it
  // dominates; SPIRIT feeds health regen, STAMINA the legs.
  magic: [
    "intelligence",
    "intelligence",
    "spirit",
    "intelligence",
    "intelligence",
    "spirit",
    "intelligence",
    "stamina",
  ],
  // The even spread: a REASONABLE distribution across EVERY stat, not a naive
  // even sixth each. Knowing the mechanics, it leans DOUBLE into the three
  // attack stats (STR/DEX/INT) — those both gate and scale whatever weapon the
  // auto-equip ends up wearing, so a generalist still needs them deep to stay
  // wieldable and hit — then banks one beat each into the three support/utility
  // stats: STAMINA (hp + legs), SPIRIT (health regen), and LUCK (crit + loot).
  // No pinned lane — the auto-equip wears
  // whatever the spread scores best, which is exactly the generalist read we
  // compare the focused builds against.
  balanced: [
    "strength",
    "dexterity",
    "intelligence",
    "stamina",
    "strength",
    "dexterity",
    "intelligence",
    "spirit",
    "luck",
  ],
};

/**
 * The order a build ranks up TALENTS, highest priority first — the autopilot's
 * counterpart to `BUILD_ROTATION` for the passive trees. When the hero earns a
 * talent point (one per 10 chosen points in a tree stat), `botPickTalent` walks
 * this list and takes the first talent IN THE EARNING TREE that isn't maxed, so
 * a build deepens its signature talents before its fallbacks. Each build leads
 * with its own tree's damage, then rounds out with survivability and the off-tree
 * points its stat spread inevitably earns. Every id must exist in the talent
 * catalog (a test pins this), and each tree must be fully covered so a point is
 * never left unspendable.
 */
export const BUILD_TALENTS: Record<StatBuild, string[]> = {
  melee: [
    // The Warlord leads with its damage cleaves, then its enrage and slam, then
    // the tank half.
    "executioner",
    "twin_strike",
    "cleaving_echo",
    "berserker_rage",
    "seismic_landing",
    "bulwark",
    "parry",
    "ironhide",
    // Off-tree ranged for the stray DEX points a bruiser earns.
    "deadeye",
    "piercing_shot",
    "volley",
    "concussive_rounds",
    "crippling_shot",
    "wind_runner",
    "spring_heels",
    "evasion",
    // Off-tree magic: a melee hero's stray INT dips into the ward first, then
    // rounds out with the offensive conjurations.
    "mage_armor",
    "orbiting_flames",
    "storm_call",
    "seeker_orbs",
    "immolation_aura",
    "arcane_singularity",
    "frost_nova",
    "arcane_retribution",
  ],
  ranged: [
    // The Windrunner leads with its shot damage, then its distance control, then
    // its mobility/survival.
    "deadeye",
    "piercing_shot",
    "volley",
    "concussive_rounds",
    "crippling_shot",
    "evasion",
    "wind_runner",
    "spring_heels",
    // Off-tree melee.
    "executioner",
    "twin_strike",
    "cleaving_echo",
    "berserker_rage",
    "bulwark",
    "parry",
    "ironhide",
    "seismic_landing",
    // Off-tree magic.
    "mage_armor",
    "orbiting_flames",
    "storm_call",
    "seeker_orbs",
    "immolation_aura",
    "arcane_singularity",
    "frost_nova",
    "arcane_retribution",
  ],
  magic: [
    // The Archon leads with its always-on conjurations, closes on its defences.
    "orbiting_flames",
    "storm_call",
    "seeker_orbs",
    "immolation_aura",
    "arcane_singularity",
    "frost_nova",
    "arcane_retribution",
    "mage_armor",
    // Off-tree fallbacks for the stray STR/DEX points a caster still earns.
    "executioner",
    "twin_strike",
    "cleaving_echo",
    "berserker_rage",
    "bulwark",
    "parry",
    "ironhide",
    "seismic_landing",
    "deadeye",
    "piercing_shot",
    "volley",
    "concussive_rounds",
    "crippling_shot",
    "evasion",
    "wind_runner",
    "spring_heels",
  ],
  balanced: [
    "executioner",
    "deadeye",
    "twin_strike",
    "piercing_shot",
    "bulwark",
    "volley",
    "seismic_landing",
    "cleaving_echo",
    "concussive_rounds",
    "crippling_shot",
    "orbiting_flames",
    "storm_call",
    "seeker_orbs",
    "immolation_aura",
    "arcane_singularity",
    "mage_armor",
    "frost_nova",
    "arcane_retribution",
    "berserker_rage",
    "parry",
    "ironhide",
    "evasion",
    "wind_runner",
    "spring_heels",
  ],
};

/** The weapon lane a build biases toward, or `null` for `balanced` (no pinned
 * lane — the auto-equip picks emergently off the spread stats). */
export function buildWeaponLane(build: StatBuild): WeaponClass | null {
  return build === "balanced" ? null : build;
}

// ---- The META (level-band) lane ---------------------------------------------
// The DEFAULT autopilot's take on "which weapon lane is strongest WHEN". It is
// NOT a balanced generalist — it commits to the lane that wins each stretch of
// the game and walks between them as the hero levels:
//
//   • EARLY (melee) — up to ~level 40 (easy/medium/hard, into early nightmare)
//     the starter is a heavy blade and STR gates are cheap, so a swing
//     out-damages everything.
//   • MID–HIGH (magic) — from ~level 40 the mobs' ARMOR starts climbing (the
//     nightmare-and-up armored horde), which blunts a physical swing far more
//     than a magic bolt; with INT now deep, a magic weapon (INT gates, scales,
//     speeds, AND buys reach/AoE/crit all at once) out-scales the blade, so the
//     hero pivots to a wand.
//   • ENDGAME (melee) — at the LEVEL CAP the ARTIFACTS start dropping (they gate
//     on level 99 to both drop and wear — see items/rolling.ts `rollTier` / items/requirements.ts `itemLevelReq`),
//     and the top melee chase is pure DAMAGE + ARMOR PIERCE against the armored
//     cap. The INT banked through the magic phase also SUPERCHARGES the swing's
//     AoE/reach/crit, so a melee hero who came up through magic cleaves a full
//     arc. So the lane returns to melee for the final grind.
//
// The bands are keyed off the level the hero is CONSTRUCTED at (see `bot/index.ts`
// `botAllocate`, which freezes the lane on the bot at its starting level and
// commits to it for the whole run) — NOT re-evaluated per tick. A hero can't
// reallocate spent points, so thrashing lanes mid-run would just waste
// investment; instead the level a bot is spun up at decides its lane once. So an
// easy/medium/hard run (fresh) commits MELEE, a nightmare run (spun up past ~40)
// commits MAGIC, and a level-cap run commits MELEE for the artifact endgame.

/** Hero level at/above which the META lane prefers magic over early-game melee —
 * where the nightmare-and-up horde's ARMOR starts blunting a physical swing. */
export const META_MAGIC_MIN_LEVEL = 40;
/** Hero level at/above which the META lane returns from magic to endgame melee —
 * the LEVEL CAP, where artifacts (pure damage + armor pierce) start dropping. */
export const META_MELEE_ENDGAME_LEVEL = LEVELING.maxLevel;

/**
 * The weapon lane the META (level-band) build commits to at hero `level`:
 * MELEE below {@link META_MAGIC_MIN_LEVEL}, MAGIC up to
 * {@link META_MELEE_ENDGAME_LEVEL}, then MELEE again for the endgame. This is
 * the DEFAULT autopilot strategy (see `bot/index.ts` `botAllocate`); a fixed profile
 * (`melee`/`ranged`/`magic`/`balanced`) overrides it, and `auto` keeps the
 * emergent whichever-lane-is-deepest behaviour.
 */
export function metaLane(level: number): WeaponClass {
  if (level < META_MAGIC_MIN_LEVEL) return "melee";
  if (level < META_MELEE_ENDGAME_LEVEL) return "magic";
  return "melee";
}

/**
 * The build rotation expressed as a WEIGHT RATIO — the shape the analytic
 * progression sim (`StatWeights`) spends points by (highest-averages). Derived
 * by counting each stat's beats in {@link BUILD_ROTATION}, so the paper sim and
 * the autopilot spend points the same way from one definition. e.g. melee →
 * `{ strength: 4, intelligence: 2, dexterity: 1, stamina: 1 }`.
 */
export function buildStatWeights(
  build: StatBuild,
): Partial<Record<StatName, number>> {
  const weights: Partial<Record<StatName, number>> = {};
  for (const stat of BUILD_ROTATION[build]) {
    weights[stat] = (weights[stat] ?? 0) + 1;
  }
  return weights;
}

/** All stats a build ever spends into, in a stable order (for labels/legends). */
export function buildStats(build: StatBuild): StatName[] {
  const weights = buildStatWeights(build);
  return STAT_NAMES.filter((s) => (weights[s] ?? 0) > 0);
}
