// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Stat-scaled weapon and gear math: per-hit damage (and its variance rolls),
// reach, cadence, the melee cone, and the weaponScore/gearScore/weaponDps
// figures combat, auto-equip, and every readout share.

import { randomRange } from "@game/lib/rng.ts";
import { MELEE, STATS, WEAPON } from "../config/index.ts";
import {
  gearDef,
  meleeRealizedTargets,
  rangedRankTargets,
  weaponDamageVariance,
  weaponDef,
} from "../defs/equipment.ts";
import { talentBerserkMult } from "../talent-effects.ts";
import { BALANCE } from "../tuning.ts";
import type { Equipment, GameState } from "../types/index.ts";
import { committedLane, DAMAGE_STAT, SPEED_STAT } from "./class-stats.ts";
import { playerCritChance, weaponCritMult } from "./combat-stats.ts";
import { effectiveStat } from "./derived.ts";
import { qualityMult } from "./quality.ts";
import { heroBuffMult } from "./spellcasting.ts";

/** The equipped weapon's per-hit damage before the crit roll. */
export function weaponDamage(state: GameState): number {
  return weaponDamageFor(state, state.player.equipment.weapon);
}

/**
 * Per-hit damage a specific weapon instance would deal for this player,
 * folding in the governing stat (STR/DEX/INT by class) and `damagePct`
 * affixes. This is the single source of truth for stat-scaled weapon damage —
 * combat, auto-equip scoring, and the UI's damage readouts all route through
 * it, so a stronger build raises every surface consistently.
 */
export function weaponDamageFor(state: GameState, weapon: Equipment): number {
  const def = weaponDef(weapon.defId);
  const damageStat = DAMAGE_STAT[def.class];
  const stat = effectiveStat(state, damageStat);
  // STRENGTH scales physical weapons harder than INTELLIGENCE scales magic ones
  // (see STATS.damageBonusPerPoint) — a bruiser's damage is their one payoff,
  // while a mage's INT is already buying reach, cleave, cadence, and crit.
  const perPoint =
    STATS.damageBonusPerPoint[damageStat as "strength" | "intelligence"];
  let multiplier = 1 + stat * perPoint;
  for (const affix of weapon.affixes) {
    if (affix.kind === "damagePct") multiplier += affix.value;
  }
  // ITEM LEVEL grows the base blow — the weapon half of the armor rule
  // (ARMOR.armorPerIlvl): a base's catalog damage is its value AT ITS OWN
  // levelReq, and a deeper find of the same base swings harder by
  // `damagePerIlvl` per item level above it. Zero at the base's own levelReq,
  // so catalog defs (and the damage-budget model they're authored on) are
  // untouched — only the rolled instance grows. This is what makes a deep
  // drop of an old favorite a real find instead of a stat-stick.
  const ilvlMult =
    1 + WEAPON.damagePerIlvl * Math.max(0, weapon.ilvl - def.levelReq);
  // The global damage lever cuts every LOOTED weapon, so a scavenged weapon is
  // a measured edge, not a free power spike that lets a basic loadout melt the
  // horde. The built-in sidearm — minted unbreakable (no durability), the
  // baseline the difficulty ladder is calibrated on — is exempt and keeps its
  // full catalog damage, so the opening fight stays exactly as tuned.
  const lootMult = weapon.durability === undefined ? 1 : WEAPON.damageMult;
  // The instance's MAKE QUALITY scales the blow: a BROKEN pipe swings soft,
  // a PERFECT one over its catalog weight — the specific figure this copy
  // rolled within its quality band (`qualityMult` → `Equipment.qualityRoll`,
  // config QUALITY.ranges). Routed here — the one source of stat-scaled damage
  // — so combat, auto-equip scoring, and every DPS readout agree on what this
  // exact piece's craftsmanship is worth.
  // A UNIQUE weapon's per-drop ±band on the base damage (see `Equipment.baseRoll`).
  // The developer damage knob scales the final figure, so combat, auto-equip
  // scoring, and every DPS readout move together (rankings are unchanged —
  // it's one factor on all of them).
  // A running martial self-buff (WAR CRY / BERSERK) pumps the hero's own blows;
  // 1 when no buff is up. Applied here — the one source of stat-scaled damage —
  // so combat and every readout move together while it lasts (auto-equip
  // rankings are unchanged: it's one factor on every candidate alike).
  return (
    def.damage *
    multiplier *
    ilvlMult *
    lootMult *
    qualityMult(weapon) *
    (weapon.baseRoll ?? 1) *
    BALANCE.playerDamage *
    heroBuffMult(state, "damage")
  );
}

/**
 * The damage a specific weapon instance would deal on THIS blow: its average
 * output (`weaponDamageFor`) scaled by a random factor inside the weapon's
 * variance band, so a swing written at 10 lands anywhere in ~8–12 (and a crit
 * off it, higher still). Rolled off the run's `fxRng` flavor stream — never
 * `rng` — so damage spread can't perturb the loot/crit sequence. This is the
 * value combat feeds into `hitEnemy`; every readout (item card, DPS, scoring)
 * keeps using the deterministic average so a weapon still reads as one number.
 */
export function rollWeaponDamage(state: GameState, weapon: Equipment): number {
  return rollWeaponHit(state, weapon).damage;
}

/**
 * As `rollWeaponDamage`, but also reports where the blow landed inside the
 * weapon's variance band as a normalized `roll` in [0, 1] (0 = the softest
 * end, 1 = the hardest). Combat carries this out on the hit event so the app
 * can size a crit's popup by how strong the blow was — a top-of-band crit
 * slams a bigger figure than a glancing one. A weapon with no variance has no
 * "how good" to report, so it lands at a neutral 0.5. Drawn off `fxRng` exactly
 * as before, so the loot/crit sequence is untouched.
 */
export function rollWeaponHit(
  state: GameState,
  weapon: Equipment,
): { damage: number; roll: number } {
  const v = weaponDamageVariance(weaponDef(weapon.defId));
  const factor = v <= 0 ? 1 : randomRange(state.fxRng, 1 - v, 1 + v);
  const roll = v <= 0 ? 0.5 : (factor - (1 - v)) / (2 * v);
  // BERSERKER RAGE (melee tree) enrages the hero's LIVE blows as his health
  // falls — applied here, not in `weaponDamageFor`, so the static item-card and
  // auto-equip readouts keep showing the neutral full-health damage instead of
  // an hp-dependent figure that would jitter every hit.
  return {
    damage: weaponDamageFor(state, weapon) * factor * talentBerserkMult(state),
    roll,
  };
}

/**
 * The min/max a weapon's blow can roll for this player (its average ± its
 * variance band), rounded for display. The item card leads with this range —
 * "DMG 8–12" — so the spread the player feels in combat is legible up front.
 */
export function weaponDamageRange(
  state: GameState,
  weapon: Equipment,
): { min: number; max: number } {
  const avg = weaponDamageFor(state, weapon);
  const v = weaponDamageVariance(weaponDef(weapon.defId));
  return { min: Math.round(avg * (1 - v)), max: Math.round(avg * (1 + v)) };
}

/**
 * A weapon's effective reach for this player — the single source of truth for
 * reach (targeting and the UI both route through it). The stat that lengthens
 * it is CLASS-aware: a MELEE blade's DEPTH rides STRENGTH (`rangePerStr`, the
 * bruiser drives it further), while RANGED and MAGIC reach ride INTELLIGENCE
 * (`rangePerInt`, the gunner/caster holds the crowd back). INT still owns the
 * melee cone's BREADTH and target COUNT (see `weaponSweepHalfAngle` /
 * `maxMeleeTargets`), so depth and cleave are distinct stat investments.
 */
export function weaponRangeFor(state: GameState, weapon: Equipment): number {
  const def = weaponDef(weapon.defId);
  const reachBonus =
    def.class === "melee"
      ? effectiveStat(state, "strength") * STATS.rangePerStr
      : effectiveStat(state, "intelligence") * STATS.rangePerInt;
  return def.range * (1 + reachBonus);
}

/**
 * The ms between this weapon's attacks for this player — the base cadence
 * (the catalog cooldown scaled by the global WEAPON.baseCooldownMult, so an
 * un-invested build attacks deliberately slowly) quickened by the weapon's
 * SPEED stat (DEX for melee & ranged, INT for magic; see `SPEED_STAT`). This
 * is the single source of truth for stat-scaled fire rate: combat cooldown and
 * the DPS/score math both route through it, so a build's faster attacks raise
 * every surface consistently.
 */
export function weaponCooldownFor(state: GameState, weapon: Equipment): number {
  const def = weaponDef(weapon.defId);
  const stat = effectiveStat(state, SPEED_STAT[def.class]);
  // Magic's speed stat is the same INT that scales its damage/crit, so it uses a
  // discounted per-point rate (see STATS.magicAttackSpeedPerStat) to stop the
  // damage×speed compounding from running a deep-INT mage away from the field.
  const perStat =
    def.class === "magic"
      ? STATS.magicAttackSpeedPerStat
      : STATS.attackSpeedPerStat;
  // A running RAPID FIRE / BERSERK haste buff shortens the cadence (1 when idle).
  return (
    (def.cooldownMs * WEAPON.baseCooldownMult) /
    (1 + stat * perStat) /
    heroBuffMult(state, "haste")
  );
}

/**
 * A melee weapon's swing cone as a half-angle in radians — the sector on each
 * side of the aim that the sweep strikes. Wide for a slashing blade, narrow
 * for a thrusting spear (which leans on its long `range` instead).
 * INTELLIGENCE widens the cone (the weapon's AoE) proportionally, so shapes
 * are preserved and a very high-INT wide weapon saturates at a HALF circle.
 * This is the single source of truth for the cone: the sweep's hit test and
 * the arc the app draws both route through it.
 */
export function weaponSweepHalfAngle(
  state: GameState,
  weapon: Equipment,
): number {
  const def = weaponDef(weapon.defId);
  const deg = def.sweepDeg ?? MELEE.defaultSweepDeg;
  const base = (deg * Math.PI) / 360;
  const widened =
    base * (1 + effectiveStat(state, "intelligence") * STATS.aoePerInt);
  // Saturate at a HALF circle (STATS.aoeMaxHalfAngle = π/2): even extreme INT
  // sweeps at most a 180° arc, never wraps toward a full 360° disc.
  return Math.min(STATS.aoeMaxHalfAngle, widened);
}

/**
 * How many monsters a single melee swing may strike — INTELLIGENCE's call,
 * not the weapon's: the global `MELEE.baseAoeTargets` floor plus
 * `aoeTargetsPerInt` per INT point, floored to a whole count (always ≥ 1 so
 * a swing never whiffs its aim). The weapon only contributes its SHAPE: the
 * cone (weaponSweepHalfAngle) decides which foes are eligible, and a narrow
 * thrust geometrically holds few however sharp the mind. Cleaving the horde
 * is an INT investment — which is also why AoE weapons carry budget-divided
 * per-hit damage (see weaponAssumedTargets): they start deliberately weak
 * and grow into their assumption.
 */
export function maxMeleeTargets(state: GameState): number {
  return Math.max(
    1,
    Math.floor(
      MELEE.baseAoeTargets +
        effectiveStat(state, "intelligence") * STATS.aoeTargetsPerInt,
    ),
  );
}

// ---- Auto-equip scoring --------------------------------------------------------

/**
 * A weapon's expected EFFECTIVE output in this player's hands — the number
 * auto-equip ranks weapons by. Per-target DPS (stats folded in: STR/DEX/INT
 * raise their class's damage AND cadence) × the weapon's assumed target
 * count (the damage-budget model's AoE normalization — a cone cleaver's
 * light blows are worth their crowd) × the stat-scaled crit lift. The
 * same math the balance budget is authored in, so "better" here matches the
 * design's intent.
 */
export function weaponScore(state: GameState, weapon: Equipment): number {
  const def = weaponDef(weapon.defId);
  const critLift =
    1 +
    playerCritChance(state, def.class) * (weaponCritMult(state, weapon) - 1);
  // AoE is credited at its CALIBRATED realized count (measured, not the old
  // over-optimistic ceiling — `WEAPON.meleeAoe` / `rangedAoe`), so auto-equip
  // ranks a weapon by the crowd it really lands on and never swaps a reliable
  // weapon for one that paper-out-budgets it but is horrible against a lone foe:
  //   • Melee: the reach-aware `meleeRealizedTargets` at the hero's ACTUAL cone
  //     and reach (`weaponSweepHalfAngle`/`weaponRangeFor` — so a deep-STR build
  //     credits the crowd its long swing really threads), still capped by the
  //     number INTELLIGENCE can cleave (maxMeleeTargets).
  //   • Ranged: `weaponAssumedTargets` already returns the realistic distinct-foe
  //     count (a 6-pellet spread reads ~1.8, not 6; pierce/chain their measured
  //     reach), so it is used directly — no extra damping needed.
  const targets = def.projectile
    ? rangedRankTargets(def)
    : Math.min(
        meleeRealizedTargets(
          weaponSweepHalfAngle(state, weapon),
          weaponRangeFor(state, weapon),
        ),
        maxMeleeTargets(state),
      );
  // ON-LANE PREFERENCE: a weapon of the hero's committed lane (`committedLane`)
  // is worth more to HIM than its raw budget — it rides his deepened attribute
  // and keeps his build coherent — so it out-ranks a marginally stronger
  // off-lane find rather than yanking him off his spec. See `WEAPON.laneAffinity`.
  const laneBonus =
    def.class === committedLane(state) ? WEAPON.laneAffinity : 1;
  return (
    ((weaponDamageFor(state, weapon) * 1000) /
      weaponCooldownFor(state, weapon)) *
    targets *
    critLift *
    laneBonus *
    // Armor piercing on the weapon reads as effective damage against the armored
    // late game — fold it into the ranking so auto-equip prefers a piercing
    // weapon (a fraction of the pen, since it only pays against armored foes).
    (1 + weaponArmorPen(weapon) * 0.5)
  );
}

/** The `armorPen` a WEAPON instance carries in its own affixes (for scoring). */
function weaponArmorPen(weapon: Equipment): number {
  let pen = 0;
  for (const affix of weapon.affixes) {
    if (affix.kind === "armorPen") pen += affix.value;
  }
  return pen;
}

/**
 * A weapon's expected DAMAGE PER SECOND in this player's hands — the single
 * figure that folds a weapon's three combat stats into one: per-hit damage
 * (stats + `damagePct` affixes), attacks per second (the stat-scaled cadence),
 * and the average lift from its crit chance (`critChance × (critMultiplier−1)`
 * for its class). It is the honest "how hard does this hit over time" number
 * the item card leads with, so two weapons — a slow heavy hitter and a quick
 * light one — can be compared at a glance. Unlike `weaponScore` (the raw
 * damage/cadence ratio auto-equip ranks by) this includes crit, so it reads as
 * true sustained output rather than a ranking heuristic. Per TARGET — an
 * AoE weapon reads low here and earns it back across the crowd (see
 * `weaponAssumedTargets`).
 */
export function weaponDps(state: GameState, weapon: Equipment): number {
  const def = weaponDef(weapon.defId);
  const perHit = weaponDamageFor(state, weapon);
  const attacksPerSec = 1000 / weaponCooldownFor(state, weapon);
  const critLift =
    1 +
    playerCritChance(state, def.class) * (weaponCritMult(state, weapon) - 1);
  return perHit * attacksPerSec * critLift;
}

/**
 * A rough single number for a gear piece's worth, so pickups can be
 * compared to what is worn. An armor point is worth ~2 hp, crit ~3 hp per
 * 1%, a stat point ~15. Armor counts the INSTANCE roll (the ilvl-grown
 * stamp), so a deep find of the same base genuinely out-scores an early one;
 * a broken piece still scores its full worth — it is one repair kit from it.
 */
export function gearScore(gear: Equipment): number {
  const def = gearDef(gear.defId);
  // A bag's worth is the room it buys — score its cells so auto-equip fills an
  // empty bag slot and a roomier bag supplants a smaller one (each cell ≈ 10).
  const bagSlots =
    gear.def && "bagSlots" in gear.def ? gear.def.bagSlots : def.bagSlots;
  let score =
    (def.bonuses.maxHp ?? 0) +
    (def.bonuses.critChance ?? 0) * 300 +
    (gear.armor ?? def.armor ?? 0) * 2 +
    (bagSlots ?? 0) * 10;
  for (const affix of gear.affixes) {
    if (affix.kind === "maxHp") score += affix.value;
    else if (affix.kind === "crit") score += affix.value * 300;
    else if (affix.kind === "stat") score += affix.value * 15;
    else if (affix.kind === "armor") score += affix.value * 2;
    // Scaling bonuses are a fraction of a big number — worth a lot on a grown
    // hero, so weight them well above the raw fraction.
    else if (affix.kind === "statPct") score += affix.value * 600;
    else if (affix.kind === "maxHpPct") score += affix.value * 400;
    // A granted forever spell is worth several stat points a rank; a proc's
    // worth scales with how often it actually fires. Sure strike reads as
    // the few % damage the innate whiff was costing.
    else if (affix.kind === "spell") score += affix.rank * 45;
    else if (affix.kind === "proc") score += affix.chance * affix.rank * 250;
    else if (affix.kind === "sureStrike") score += 40;
    // Knockback is a kiting/crowd-control edge, not damage — worth a modest
    // nudge so a piece that carries the rare signature reads as an upgrade.
    else if (affix.kind === "knockback") score += 30;
    else if (affix.kind === "damagePct") score += affix.value * 100;
    // Armor piercing is worth roughly a conditional damage% — value it a touch
    // above so the endgame chase piece reads as the upgrade it is.
    else if (affix.kind === "armorPen") score += affix.value * 150;
  }
  return score;
}

/** Remaining attacks left on a weapon; the unbreakable sidearm never wears
 * out, so it counts as effectively infinite durability. */
export function remainingDurability(weapon: Equipment): number {
  return weapon.durability ?? Infinity;
}
