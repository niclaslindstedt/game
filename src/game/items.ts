// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Equipment instances, loot rolls, the inventory, and derived player stats.
// Items are rolled from the catalogs in defs/equipment.ts against the
// running level's loot table. The inventory mutators (`equipFromInventory`,
// `unequipToInventory`, `moveInventoryItem`, `allocateStat`) are the engine
// surface the app's drag-and-drop UI and level-up chooser call into — they
// are safe to invoke from outside `step()` because they only touch the
// player.

import { advanceCutsceneBeat, finishCutscene } from "@game/lib/cutscene.ts";
import type { Rng } from "@game/lib/rng.ts";
import { randomRange } from "@game/lib/rng.ts";
import {
  ACCURACY,
  ARMOR,
  DODGE,
  LOOT,
  MELEE,
  PLAYER,
  STAMINA,
  STATS,
  WEAPON,
} from "./config.ts";
import { cutsceneDef } from "./defs/cutscenes.ts";
import {
  affixNaming,
  AFFIX_POOLS,
  gearDef,
  isWeaponDef,
  STAT_NAMES,
  TIER_ROLL_ORDER,
  TIERS,
  weaponDef,
  type AffixDef,
  equipmentBaseName,
} from "./defs/equipment.ts";
import { difficultyDef } from "./defs/difficulties.ts";
import { levelDef } from "./defs/levels/index.ts";
import type {
  Affix,
  ArmorGrade,
  EquipSlot,
  Equipment,
  GameState,
  StatName,
  Tier,
  WeaponClass,
} from "./types.ts";

/**
 * The stat that scales each weapon class's DAMAGE: STRENGTH powers physical
 * weapons (melee and ranged), INTELLIGENCE powers magic ones.
 */
export const DAMAGE_STAT: Record<WeaponClass, StatName> = {
  melee: "strength",
  ranged: "strength",
  magic: "intelligence",
};

/**
 * The stat that scales each weapon class's ATTACK SPEED: DEXTERITY quickens
 * physical weapons (melee and ranged), INTELLIGENCE quickens magic ones.
 */
export const SPEED_STAT: Record<WeaponClass, StatName> = {
  melee: "dexterity",
  ranged: "dexterity",
  magic: "intelligence",
};

/**
 * The stat that sharpens each weapon class's CRIT chance: DEXTERITY for
 * physical weapons (melee and ranged), INTELLIGENCE for magic ones. LUCK adds
 * a marginal crit on top of whichever of these governs the swing (see
 * `playerCritChance`).
 */
export const CRIT_STAT: Record<WeaponClass, StatName> = {
  melee: "dexterity",
  ranged: "dexterity",
  magic: "intelligence",
};

/**
 * Display name of an equipment instance, Diablo-style: a plain base type when
 * it rolled no affixes (regular tier), otherwise decorated with a prefix
 * and/or "of the X" suffix drawn from its affixes — CRUEL BEAKER OF THE FOX.
 * The name is derived from the stored affixes, so it is stable for the life of
 * the item; the tier still shows through the color the app paints it. Only the
 * first prefix-lending and first suffix-lending affix feed the name (extra
 * affixes on epic/legendary pieces still list their bonuses in full below it).
 */
export function equipmentName(equipment: Equipment): string {
  const base = equipmentBaseName(equipment.defId);
  let prefix = "";
  let suffix = "";
  for (const affix of equipment.affixes) {
    const naming = affixNaming(affix);
    if (naming.prefix && !prefix) prefix = naming.prefix;
    if (naming.suffix && !suffix) suffix = naming.suffix;
  }
  return [prefix, base, suffix].filter(Boolean).join(" ");
}

// ---- Loot rolls --------------------------------------------------------------

function pickWeighted<T extends { weight: number }>(rng: Rng, pool: T[]): T {
  const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = rng() * total;
  for (const entry of pool) {
    roll -= entry.weight;
    if (roll <= 0) return entry;
  }
  return pool[pool.length - 1] as T;
}

function rollAffix(rng: Rng, def: AffixDef): Affix {
  const [min, max] = def.range;
  switch (def.kind) {
    case "damagePct":
      return { kind: "damagePct", value: randomRange(rng, min, max) };
    case "crit":
      return { kind: "crit", value: randomRange(rng, min, max) };
    case "maxHp":
      return { kind: "maxHp", value: Math.round(randomRange(rng, min, max)) };
    case "stat":
      return {
        kind: "stat",
        value: Math.round(randomRange(rng, min, max)),
        stat: STAT_NAMES[Math.floor(rng() * STAT_NAMES.length)] as StatName,
      };
  }
}

/**
 * Roll the tier for a drop: best tier first, each gated by the level's loot
 * table plus the difficulty's bonus (absent from both = cannot drop here —
 * harder difficulties unlock tiers the level alone doesn't), sweetened by
 * LUCK and any per-enemy bonus.
 */
function rollTier(state: GameState, tierBonus: number): Tier {
  const chances = levelDef(state.level.id).loot.tierChances;
  const difficultyChances = difficultyDef(state.difficulty).tierChanceBonus;
  const luckBonus =
    effectiveStat(state, "luck") * STATS.tierChancePerLuck + tierBonus;
  for (const tier of TIER_ROLL_ORDER) {
    const base = (chances[tier] ?? 0) + (difficultyChances[tier] ?? 0);
    if (base <= 0) continue;
    if (state.rng() < base + luckBonus) return tier;
  }
  return "regular";
}

/**
 * Roll a fresh equipment instance from the level's loot pools — or, with
 * `defId`, mint a specific piece (uniques like boss trophies). Tier affix
 * counts come from the tier ladder (regular 0, magic 1, epic 2, legendary
 * 3); affix kinds never repeat on one item.
 */
export function rollEquipment(
  state: GameState,
  opts: {
    slot?: "weapon" | "gear";
    tierBonus?: number;
    defId?: string;
    /** Force a specific tier instead of rolling one (story-guaranteed
     * uniques like the epic space suit the moon level can't otherwise roll). */
    tier?: Tier;
  } = {},
): Equipment {
  const rng = state.rng;
  const loot = levelDef(state.level.id).loot;
  const family = opts.defId
    ? isWeaponDef(opts.defId)
      ? ("weapon" as const)
      : ("gear" as const)
    : (opts.slot ?? (rng() < 0.6 ? ("weapon" as const) : ("gear" as const)));
  const pool = family === "weapon" ? loot.weaponPool : loot.gearPool;
  let defId = opts.defId ?? (pool[Math.floor(rng() * pool.length)] as string);
  // Harder difficulties find fewer PLATED suits: when a random gear pick
  // lands on armor, the difficulty's `armorDropMult` is its chance to stand —
  // a failed roll re-picks among the pool's unplated pieces (if any). Minted
  // pieces (opts.defId — boss trophies, placed items) are never dampened, and
  // a mult at/above 1 draws nothing, so the baseline stream is untouched.
  if (family === "gear" && !opts.defId) {
    const armorMult = difficultyDef(state.difficulty).armorDropMult;
    if (armorMult < 1 && gearDef(defId).armor && rng() >= armorMult) {
      const unplated = pool.filter((id) => !gearDef(id).armor);
      if (unplated.length > 0) {
        defId = unplated[Math.floor(rng() * unplated.length)] as string;
      }
    }
  }
  const slot: EquipSlot = family === "weapon" ? "weapon" : gearDef(defId).slot;

  const tier = opts.tier ?? rollTier(state, opts.tierBonus ?? 0);
  const affixes: Affix[] = [];
  const available = [...AFFIX_POOLS[family]];
  for (let i = 0; i < TIERS[tier].affixCount && available.length > 0; i++) {
    const affixDef = pickWeighted(rng, available);
    available.splice(available.indexOf(affixDef), 1);
    affixes.push(rollAffix(rng, affixDef));
  }

  const rolled: Equipment = { id: state.nextId++, defId, slot, tier, affixes };
  // Dropped weapons arrive fresh but finite — they wear out per attack.
  if (family === "weapon") rolled.durability = weaponDef(defId).durability;
  return rolled;
}

// ---- Derived stats -----------------------------------------------------------

function equippedPieces(state: GameState): Equipment[] {
  const { weapon, suit, charm } = state.player.equipment;
  return [weapon, suit, charm].filter((e): e is Equipment => e !== null);
}

/**
 * A shallow view of `state` with `candidate` slotted into its equip slot —
 * for previewing what a bag item would do to the derived stats (the "+3
 * DAMAGE" upgrade hints in the inventory) without disturbing the real
 * loadout. Only `player.equipment` is replaced; everything else is shared, so
 * the stat getters below read straight through it.
 */
export function previewEquipped(
  state: GameState,
  candidate: Equipment,
): GameState {
  const player = state.player;
  const equipment = { ...player.equipment };
  if (candidate.slot === "weapon") equipment.weapon = candidate;
  else if (candidate.slot === "suit") equipment.suit = candidate;
  else equipment.charm = candidate;
  return { ...state, player: { ...player, equipment } };
}

/**
 * Everything the player is currently holding: the worn pieces plus every
 * occupied bag cell. The reach a passive trinket's bonus is summed over —
 * worn or stowed, it counts once, since the two sets are disjoint (an item is
 * either equipped or in the bag, never both).
 */
function carriedPieces(state: GameState): Equipment[] {
  return [
    ...equippedPieces(state),
    ...state.player.inventory.filter((e): e is Equipment => e !== null),
  ];
}

/**
 * Flat passive stat bonus from carried trinkets — the PASSAGE CHIP pays out
 * its `+INT` just by riding in the bag (or a slot; either way, once). Weapons
 * carry no passive; gear opts in via `GearDef.passive`.
 */
function passiveStatBonus(state: GameState, stat: StatName): number {
  let total = 0;
  for (const piece of carriedPieces(state)) {
    if (isWeaponDef(piece.defId)) continue;
    total += gearDef(piece.defId).passive?.[stat] ?? 0;
  }
  return total;
}

/**
 * True when the def id names a passive trinket — gear that pays its bonus
 * while merely carried (a PASSAGE CHIP). Such an item is banked in the bag
 * like ordinary loot rather than auto-equipped into a slot, since the effect
 * needs no slot to land (and grabbing the charm slot would block a real
 * charm).
 */
export function isPassiveItem(defId: string): boolean {
  return !isWeaponDef(defId) && gearDef(defId).passive !== undefined;
}

/**
 * Stat points from level-ups, any equipped `+N <stat>` affixes, and the flat
 * bonus of every passive trinket carried (bag or worn).
 */
export function effectiveStat(state: GameState, stat: StatName): number {
  let value = state.player.stats[stat];
  for (const piece of equippedPieces(state)) {
    for (const affix of piece.affixes) {
      if (affix.kind === "stat" && affix.stat === stat) value += affix.value;
    }
  }
  return value + passiveStatBonus(state, stat);
}

/** Max hp from the base pool + the STAMINA stat + gear bonuses and affixes.
 * STAMINA now feeds BOTH the sprint pool (see `computeMaxStamina`) and the
 * health bar — a hardy sprinter is a sturdier hero. */
export function computeMaxHp(state: GameState): number {
  let max = PLAYER.maxHp + effectiveStat(state, "stamina") * STAMINA.hpPerPoint;
  for (const piece of equippedPieces(state)) {
    if (!isWeaponDef(piece.defId)) {
      max += gearDef(piece.defId).bonuses.maxHp ?? 0;
    }
    for (const affix of piece.affixes) {
      if (affix.kind === "maxHp") max += affix.value;
    }
  }
  return max;
}

/**
 * Re-derive max hp after stats or equipment changed. Gaining max hp raises
 * current hp by the same amount (a level-up or a fresh suit feels good);
 * losing it only clamps.
 */
export function recomputeMaxHp(state: GameState): void {
  const player = state.player;
  const next = computeMaxHp(state);
  const delta = next - player.maxHp;
  player.maxHp = next;
  player.hp = delta > 0 ? player.hp + delta : Math.min(player.hp, next);
}

/**
 * The equipped suit's armor grade, soak fraction, and full pool — or null when
 * no armored suit is worn (a bare hero, or a suit with no `armor` grade). The
 * single source of truth the damage split, the armor-refill on equip, and the
 * HUD/stat readouts all route through.
 */
export function armorInfo(
  state: GameState,
): { grade: ArmorGrade; max: number; reduction: number } | null {
  const suit = state.player.equipment.suit;
  if (!suit || isWeaponDef(suit.defId)) return null;
  const grade = gearDef(suit.defId).armor;
  if (!grade) return null;
  const { amount, reduction } = ARMOR[grade];
  return { grade, max: amount, reduction };
}

/**
 * Re-arm the player to the equipped suit's full armor pool (0 when no armored
 * suit is worn). Called whenever the suit changes — donning fresh plating
 * fills the bar, shedding it empties it.
 */
export function refreshArmor(state: GameState): void {
  state.player.armor = armorInfo(state)?.max ?? 0;
}

/**
 * Top the equipped suit's plating back up to its full pool — the repair kit
 * mends worn armor alongside the weapon's edge. False when there is nothing
 * to restore (no armored suit worn, or the plating is already full) so the
 * kit isn't spent on intact armor.
 */
export function restoreArmor(state: GameState): boolean {
  const info = armorInfo(state);
  if (!info || state.player.armor >= info.max) return false;
  state.player.armor = info.max;
  return true;
}

/** Max stamina from the base pool + the STAMINA stat (affixes folded in). */
export function computeMaxStamina(state: GameState): number {
  return STAMINA.base + effectiveStat(state, "stamina") * STAMINA.maxPerPoint;
}

/**
 * Re-derive max stamina after the STAMINA stat changed. A deeper pool lifts
 * the current reserve by the same amount (a level-up feels good); a shallower
 * one only clamps.
 */
export function recomputeMaxStamina(state: GameState): void {
  const player = state.player;
  const next = computeMaxStamina(state);
  const delta = next - player.maxStamina;
  player.maxStamina = next;
  player.stamina =
    delta > 0 ? player.stamina + delta : Math.min(player.stamina, next);
}

/**
 * The player's crit chance for a swing of the given weapon class: the base
 * chance plus the class's CRIT stat (DEX for melee & ranged, INT for magic —
 * see `CRIT_STAT`), a MARGINAL LUCK nudge, and every gear/affix crit bonus.
 * `weaponClass` defaults to the equipped weapon's class, so the HUD readout
 * reflects what's in hand; combat passes the class of the blow that landed.
 */
export function playerCritChance(
  state: GameState,
  weaponClass: WeaponClass = weaponDef(state.player.equipment.weapon.defId)
    .class,
): number {
  let chance =
    STATS.baseCritChance +
    effectiveStat(state, CRIT_STAT[weaponClass]) * STATS.critChancePerStat +
    effectiveStat(state, "luck") * STATS.critChancePerLuck;
  for (const piece of equippedPieces(state)) {
    if (!isWeaponDef(piece.defId)) {
      chance += gearDef(piece.defId).bonuses.critChance ?? 0;
    }
    for (const affix of piece.affixes) {
      if (affix.kind === "crit") chance += affix.value;
    }
  }
  return chance;
}

/**
 * The player's chance to sidestep an incoming blow entirely: the innate `base`
 * plus DEXTERITY's reflexes and a marginal LUCK nudge, scaled by the
 * difficulty's `playerDodgeMult` (the gentle rungs slip more hits, the hard
 * rungs fewer) and capped at `DODGE.max` so no build becomes untouchable.
 * Rolled in the contact-damage path (step.ts) and surfaced on the stat panel.
 */
export function playerDodgeChance(state: GameState): number {
  return Math.min(
    DODGE.max,
    (DODGE.base +
      effectiveStat(state, "dexterity") * DODGE.perDex +
      effectiveStat(state, "luck") * DODGE.perLuck) *
      difficultyDef(state.difficulty).playerDodgeMult,
  );
}

/**
 * The player's MISS chance for a weapon blow: an innate `ACCURACY.baseMiss`
 * whiff trimmed by DEXTERITY's aim (`perDex`), scaled by the difficulty's
 * `playerMissMult` (the hard rungs whiff more), floored at `minMiss`. This is
 * the hero's own accuracy — independent of the target — and is surfaced on the
 * stat panel (as HIT rate) and rolled in `hitEnemy` for weapon attacks.
 */
export function playerMissChance(state: GameState): number {
  return Math.max(
    ACCURACY.minMiss,
    (ACCURACY.baseMiss - effectiveStat(state, "dexterity") * ACCURACY.perDex) *
      difficultyDef(state.difficulty).playerMissMult,
  );
}

/**
 * An enemy's chance to DODGE the player's weapon blow: its `base` evasion (the
 * def's `dodgeChance`, or the `ACCURACY.enemyDodge` default) trimmed by the
 * player's DEXTERITY hit rate (`perDex`), scaled by the difficulty's
 * `enemyDodgeMult` (slipperier monsters up the ladder), floored at 0. Rolled
 * in `hitEnemy` after the miss check, so a build that pumps DEX both whiffs
 * and gets dodged less. Mirror of `enemyCritChance`'s LUCK-avoidance shape.
 */
export function enemyDodgeChance(state: GameState, base: number): number {
  return Math.max(
    0,
    (base - effectiveStat(state, "dexterity") * ACCURACY.perDex) *
      difficultyDef(state.difficulty).enemyDodgeMult,
  );
}

/**
 * Whether the hero is drawn as the astronaut. He wears the EVA suit once he
 * has looted and donned the SpaceZ space suit; on every level but SpaceZ HQ
 * he starts suited (the story picks up mid-mission). The renderer reads this
 * to choose the plain-clothes or astronaut sprite set.
 */
export function playerSuited(state: GameState): boolean {
  const suit = state.player.equipment.suit;
  if (suit && !isWeaponDef(suit.defId) && gearDef(suit.defId).spacesuit) {
    return true;
  }
  return levelDef(state.level.id).heroSuited ?? true;
}

/**
 * The sprite family the player wears right now — the renderer draws
 * `<appearance>_0` / `_1` / `_jump` from it, so a costume change is data:
 * a sequel returns different family keys here (and ships their sprites) with
 * no renderer edit. This game toggles between plain clothes and the EVA suit.
 */
export function playerAppearance(state: GameState): string {
  return playerSuited(state) ? "player" : "hero";
}

/**
 * The player's walk speed in world px/s: the base quickened by SPEED points and
 * dragged back by STRENGTH — a heavily-muscled hero hauls that bulk around, so
 * STR shaves a little off the walk (`strengthSlowPerPoint`, floored at
 * `strengthSlowFloor`). The two stats pull against each other, so a glass-cannon
 * bruiser gives up some mobility for its firepower rather than getting both.
 */
export function playerSpeed(state: GameState): number {
  const quickness = 1 + effectiveStat(state, "speed") * STATS.speedPerPoint;
  const burden = Math.max(
    STATS.strengthSlowFloor,
    1 - effectiveStat(state, "strength") * STATS.strengthSlowPerPoint,
  );
  return PLAYER.speed * quickness * burden;
}

/** Enemy crit chance against the player, after LUCK's avoidance. */
export function enemyCritChance(state: GameState, base: number): number {
  return Math.max(
    0,
    base - effectiveStat(state, "luck") * STATS.critAvoidPerLuck,
  );
}

/** Chance a regular monster drops loot, after LUCK and difficulty. */
export function dropChance(state: GameState): number {
  return (
    LOOT.dropChance +
    difficultyDef(state.difficulty).dropChanceBonus +
    effectiveStat(state, "luck") * STATS.dropChancePerLuck
  );
}

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
  // The global damage lever cuts every LOOTED weapon, so a scavenged weapon is
  // a measured edge, not a free power spike that lets a basic loadout melt the
  // horde. The built-in sidearm — minted unbreakable (no durability), the
  // baseline the difficulty ladder is calibrated on — is exempt and keeps its
  // full catalog damage, so the opening fight stays exactly as tuned.
  const lootMult = weapon.durability === undefined ? 1 : WEAPON.damageMult;
  return def.damage * multiplier * lootMult;
}

/**
 * A weapon's effective reach for this player. INTELLIGENCE lengthens every
 * weapon's reach — melee, ranged, and magic alike (a high-INT build reaches
 * out and holds the crowd further back). This is the single source of truth
 * for reach — targeting and the UI both route through it.
 */
export function weaponRangeFor(state: GameState, weapon: Equipment): number {
  const def = weaponDef(weapon.defId);
  return (
    def.range * (1 + effectiveStat(state, "intelligence") * STATS.rangePerInt)
  );
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
  return (
    (def.cooldownMs * WEAPON.baseCooldownMult) /
    (1 + stat * STATS.attackSpeedPerStat)
  );
}

/**
 * A melee weapon's swing cone as a half-angle in radians — the sector on each
 * side of the aim that the sweep strikes. Wide for a slashing blade, narrow
 * for a thrusting spear (which leans on its long `range` instead).
 * INTELLIGENCE widens the cone (the weapon's AoE) proportionally, so shapes
 * are preserved and a very high-INT wide weapon saturates to a full circle.
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
  // A half-angle of π already sweeps the full circle — clamp so extreme INT
  // saturates instead of wrapping past 360°.
  return Math.min(Math.PI, widened);
}

/**
 * How many monsters a single melee swing of the EQUIPPED weapon may strike:
 * the weapon's own base cap (`WeaponDef.baseAoeTargets`, defaulting to the
 * global `MELEE.baseAoeTargets` floor) plus `aoeTargetsPerInt` per
 * INTELLIGENCE point, floored to a whole count (always ≥ 1 so a swing never
 * whiffs its aim). The cone (weaponSweepHalfAngle) decides which foes are
 * eligible; this caps how many of them the blow actually lands on, so cleaving
 * the horde is an INT investment — and a crude single-target blade only ever
 * bites one foe until that investment lands.
 */
export function maxMeleeTargets(state: GameState): number {
  const def = weaponDef(state.player.equipment.weapon.defId);
  const base = def.baseAoeTargets ?? MELEE.baseAoeTargets;
  return Math.max(
    1,
    Math.floor(
      base + effectiveStat(state, "intelligence") * STATS.aoeTargetsPerInt,
    ),
  );
}

// ---- Auto-equip scoring --------------------------------------------------------

/**
 * A weapon's expected damage per second in this player's hands — the number
 * auto-equip ranks weapons by. Both halves fold in the governing stat: STR,
 * DEX and INT each raise their class's damage AND cadence, so an INT build
 * genuinely prefers wands and a STR build feels its melee weapons swing faster.
 */
export function weaponScore(state: GameState, weapon: Equipment): number {
  return (
    (weaponDamageFor(state, weapon) * 1000) / weaponCooldownFor(state, weapon)
  );
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
 * true sustained output rather than a ranking heuristic.
 */
export function weaponDps(state: GameState, weapon: Equipment): number {
  const def = weaponDef(weapon.defId);
  const perHit = weaponDamageFor(state, weapon);
  const attacksPerSec = 1000 / weaponCooldownFor(state, weapon);
  const critLift =
    1 + playerCritChance(state, def.class) * (STATS.critMultiplier - 1);
  return perHit * attacksPerSec * critLift;
}

/**
 * A rough single number for a gear piece's worth, so pickups can be
 * compared to what is worn. Crit is worth ~3 hp per 1%, a stat point ~15.
 */
export function gearScore(gear: Equipment): number {
  const def = gearDef(gear.defId);
  let score = (def.bonuses.maxHp ?? 0) + (def.bonuses.critChance ?? 0) * 300;
  for (const affix of gear.affixes) {
    if (affix.kind === "maxHp") score += affix.value;
    else if (affix.kind === "crit") score += affix.value * 300;
    else if (affix.kind === "stat") score += affix.value * 15;
    else score += affix.value * 100;
  }
  return score;
}

/** Remaining attacks left on a weapon; the unbreakable sidearm never wears
 * out, so it counts as effectively infinite durability. */
function remainingDurability(weapon: Equipment): number {
  return weapon.durability ?? Infinity;
}

/** Is `candidate` strictly better than the piece occupying its slot? */
export function isBetterEquipment(
  state: GameState,
  candidate: Equipment,
): boolean {
  if (candidate.slot === "weapon") {
    const current = state.player.equipment.weapon;
    // The difficulty's STARTING WEAPON is the pickup floor: any real weapon
    // the world yields is an upgrade over the piece off the wall, so a fresh
    // pickup always supplants it — even a slow sidearm whose raw DPS score
    // would otherwise rank below it. Once a proper weapon is in hand the
    // usual score comparison rules.
    const starter = difficultyDef(state.difficulty).startingWeapon;
    if (current.defId === starter && candidate.defId !== starter) {
      return true;
    }
    const candidateScore = weaponScore(state, candidate);
    const currentScore = weaponScore(state, current);
    if (candidateScore !== currentScore) return candidateScore > currentScore;
    // Equal firepower: picking up the same weapon you already wield is worth
    // swapping to when the fresh copy has more durability left — it refreshes
    // the durability bar. The worn copy heads to the bag, or drops to the
    // ground when the bag is full (like dropping it to grab the new one).
    if (candidate.defId === current.defId) {
      return remainingDurability(candidate) > remainingDurability(current);
    }
    return false;
  }
  // A passive trinket pays out from the bag, so it is never auto-equipped —
  // it heads for a bag cell like ordinary loot, leaving the charm slot free
  // for a piece that actually wants wearing.
  if (isPassiveItem(candidate.defId)) return false;
  const current = state.player.equipment[candidate.slot];
  return current === null || gearScore(candidate) > gearScore(current);
}

// ---- Inventory capacity (STRENGTH-scaled) --------------------------------------

/**
 * How many bag cells the player should have right now: the small
 * `baseInventorySize` floor plus `bagSlotsPerStr` per point of STRENGTH
 * (affixes folded in, via `effectiveStat`). A STR build is what earns the
 * room to hoard loot between fights.
 */
export function inventoryCapacity(state: GameState): number {
  return (
    LOOT.baseInventorySize +
    Math.floor(effectiveStat(state, "strength") * STATS.bagSlotsPerStr)
  );
}

/**
 * Grow the physical bag array to match `inventoryCapacity` — called whenever
 * STRENGTH could have changed (a level-up allocation, an equip). Grow-only:
 * the bag never shrinks below what it already holds, so dropping a
 * STRENGTH-boosting charm can never strand or discard a carried item.
 */
export function syncInventoryCapacity(state: GameState): void {
  const inv = state.player.inventory;
  const want = inventoryCapacity(state);
  while (inv.length < want) inv.push(null);
}

// ---- Inventory mutations (called by the app's UI) ------------------------------

/**
 * Equip the item in inventory cell `index`, swapping whatever occupied its
 * slot back into that cell. Returns false on an empty cell.
 */
export function equipFromInventory(state: GameState, index: number): boolean {
  const player = state.player;
  const item = player.inventory[index];
  if (!item) return false;
  const slot = item.slot;
  const previous =
    slot === "weapon" ? player.equipment.weapon : player.equipment[slot];
  player.inventory[index] = previous ?? null;
  if (slot === "weapon") {
    player.equipment.weapon = item;
    player.weaponCooldownMs = 0;
  } else {
    player.equipment[slot] = item;
  }
  recomputeMaxHp(state);
  recomputeMaxStamina(state);
  // A fresh suit re-arms the plating pool to its grade's full size.
  if (slot === "suit") refreshArmor(state);
  // A +STRENGTH piece can widen the bag; grow it so the swap has somewhere
  // to land (grow-only — see syncInventoryCapacity).
  syncInventoryCapacity(state);
  return true;
}

/**
 * Move an equipped piece back into the first free inventory cell. The weapon
 * slot can never be emptied — the character always fights with something —
 * so weapons only leave via an `equipFromInventory` swap.
 */
export function unequipToInventory(state: GameState, slot: EquipSlot): boolean {
  if (slot === "weapon") return false;
  const player = state.player;
  const item = player.equipment[slot];
  if (!item) return false;
  const free = player.inventory.indexOf(null);
  if (free === -1) return false;
  player.inventory[free] = item;
  player.equipment[slot] = null;
  recomputeMaxHp(state);
  recomputeMaxStamina(state);
  // Shedding the suit strips the plating.
  if (slot === "suit") refreshArmor(state);
  return true;
}

/** Swap two inventory cells (drag-to-rearrange). */
export function moveInventoryItem(
  state: GameState,
  from: number,
  to: number,
): void {
  const inv = state.player.inventory;
  if (from === to || !(from in inv) || !(to in inv)) return;
  const a = inv[from] ?? null;
  inv[from] = inv[to] ?? null;
  inv[to] = a;
}

/** Add loot to the first free cell; false (and no mutation) when full. */
export function addToInventory(state: GameState, item: Equipment): boolean {
  const free = state.player.inventory.indexOf(null);
  if (free === -1) return false;
  state.player.inventory[free] = item;
  return true;
}

/**
 * Permanently destroy the item in bag cell `index` — the "drag it out and
 * drop it on the ground" gesture. Returns the discarded item (so the UI can
 * announce what was trashed), or null on an empty cell. There is no undo and
 * nothing is left on the ground: the piece is gone for good.
 */
export function discardFromInventory(
  state: GameState,
  index: number,
): Equipment | null {
  const inv = state.player.inventory;
  const item = inv[index] ?? null;
  if (!item) return null;
  inv[index] = null;
  return item;
}

/**
 * Permanently destroy the piece worn in `slot` — the drag-it-off-the-body,
 * drop-it-on-the-ground gesture. The weapon slot is never emptied (the hero
 * always fights with something), so only a suit or charm is trashed this way.
 * Returns the discarded piece, or null when the slot is the weapon or already
 * bare. Shedding the suit strips the plating, just like unequipping.
 */
export function discardEquipped(
  state: GameState,
  slot: EquipSlot,
): Equipment | null {
  if (slot === "weapon") return null;
  const player = state.player;
  const item = player.equipment[slot];
  if (!item) return null;
  player.equipment[slot] = null;
  recomputeMaxHp(state);
  recomputeMaxStamina(state);
  if (slot === "suit") refreshArmor(state);
  return item;
}

// ---- Durability -------------------------------------------------------------------

/**
 * Spend one attack's worth of the equipped weapon's durability. At zero the
 * weapon is trashed (never returned to the bag) and the best surviving
 * weapon left in the bag — highest DPS with durability remaining — takes
 * its place. With an empty bag the player draws a fresh sidearm, so the
 * weapon slot honors its never-empty contract.
 */
export function wearEquippedWeapon(state: GameState): void {
  const player = state.player;
  const weapon = player.equipment.weapon;
  if (weapon.durability === undefined) return; // the unbreakable sidearm
  weapon.durability--;
  if (weapon.durability > 0) return;

  state.events.push({ type: "weaponBroke", defId: weapon.defId });

  // Bag weapons only wear while equipped, so any weapon found here still
  // has durability — but guard anyway so a broken one is trashed, not worn.
  let bestIndex = -1;
  let bestScore = -Infinity;
  for (let i = 0; i < player.inventory.length; i++) {
    const item = player.inventory[i];
    if (!item || item.slot !== "weapon") continue;
    if (item.durability !== undefined && item.durability <= 0) {
      player.inventory[i] = null;
      continue;
    }
    const score = weaponScore(state, item);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  if (bestIndex >= 0) {
    const next = player.inventory[bestIndex] as Equipment;
    player.inventory[bestIndex] = null;
    player.equipment.weapon = next;
  } else {
    // The holster is never empty: draw a plain, unbreakable sidearm.
    player.equipment.weapon = {
      id: state.nextId++,
      defId: "blaster",
      slot: "weapon",
      tier: "regular",
      affixes: [],
    };
  }
  player.weaponCooldownMs = 0;
  state.events.push({
    type: "autoEquipped",
    defId: player.equipment.weapon.defId,
  });
}

/**
 * Restore the equipped weapon to full durability (the repair-kit pickup).
 * False when there is nothing to repair — unbreakable or already pristine —
 * so the kit can stay on the ground for later.
 */
export function repairEquippedWeapon(state: GameState): boolean {
  const weapon = state.player.equipment.weapon;
  if (weapon.durability === undefined) return false;
  const max = weaponDef(weapon.defId).durability;
  if (weapon.durability >= max) return false;
  weapon.durability = max;
  return true;
}

// ---- Level-ups -------------------------------------------------------------------

/**
 * Spend one pending stat point. When the last point is spent the `levelup`
 * pause lifts and play resumes.
 */
export function allocateStat(state: GameState, stat: StatName): boolean {
  const player = state.player;
  if (player.pendingStatPoints <= 0) return false;
  player.stats[stat]++;
  player.pendingStatPoints--;
  recomputeMaxHp(state);
  recomputeMaxStamina(state);
  // STRENGTH also widens the carry bag — grow it as the point lands.
  if (stat === "strength") syncInventoryCapacity(state);
  if (player.pendingStatPoints === 0 && state.phase === "levelup") {
    state.phase = "playing";
  }
  return true;
}

// ---- Phase toggles (called by the app's UI) -----------------------------------

/**
 * The player's tap through the level-intro monologue: turn the page. Past the
 * last page the briefing is over — flash the level-name `title` card before
 * the drop.
 */
export function advanceIntro(state: GameState): void {
  if (state.phase !== "intro") return;
  const pages = levelDef(state.level.id).intro;
  state.introPage++;
  if (state.introPage >= pages.length) {
    state.introPage = pages.length;
    state.phase = "title";
  }
}

/** The intro's SKIP button: cut the monologue short, straight to the title. */
export function skipIntro(state: GameState): void {
  if (state.phase === "intro") state.phase = "title";
}

/**
 * Leave the intro flow and start the run. From the `title` card it is the
 * drop into play; from `intro` it skips the remaining monologue and the card
 * both (the "start now" shortcut the keyboard and headless bot use).
 */
export function dismissIntro(state: GameState): void {
  if (state.phase === "intro" || state.phase === "title") {
    state.phase = "playing";
  }
}

/**
 * The player's tap during the prelude: cut the running beat short (snap a
 * walk to its mark, dismiss a line early). One tap, one beat.
 */
export function tapCutscene(state: GameState): void {
  if (state.phase !== "cutscene" || !state.cutscene) return;
  advanceCutsceneBeat(state.cutscene, cutsceneDef(state.cutscene.defId));
  if (state.cutscene.done) {
    state.cutscene = null;
    state.phase = "intro";
  }
}

/**
 * The prelude's SKIP button: end the opening scene outright. Skipping the
 * prelude also skips the hero's level-intro monologue that would follow —
 * one press bails the whole opening, landing on the level-name `title` card
 * just before the drop.
 */
export function skipCutscene(state: GameState): void {
  if (state.phase !== "cutscene") return;
  if (state.cutscene) {
    finishCutscene(state.cutscene, cutsceneDef(state.cutscene.defId));
  }
  state.cutscene = null;
  state.phase = "title";
}

/** Pause into the bag. Only possible mid-run. */
export function openInventory(state: GameState): void {
  if (state.phase === "playing") state.phase = "inventory";
}

/** Close the bag and resume (pending level-ups take priority). */
export function closeInventory(state: GameState): void {
  if (state.phase !== "inventory") return;
  state.phase = state.player.pendingStatPoints > 0 ? "levelup" : "playing";
}

/** Freeze the run into the pause screen. Only possible mid-run — end-of-run
 * splashes and other overlays are already their own frozen phases. */
export function pauseGame(state: GameState): void {
  if (state.phase === "playing") state.phase = "paused";
}

/** Leave the pause screen and resume the run. */
export function resumeGame(state: GameState): void {
  if (state.phase === "paused") state.phase = "playing";
}
