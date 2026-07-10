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
import { distance } from "@game/lib/vec.ts";
import {
  ACCURACY,
  ARMOR,
  DODGE,
  LOOT,
  MELEE,
  MERCY,
  PLAYER,
  QUALITY,
  STAMINA,
  STATS,
  WEAPON,
} from "./config.ts";
import { companionDef } from "./defs/companions.ts";
import { cutsceneDef } from "./defs/cutscenes.ts";
import {
  affixNaming,
  AFFIX_POOLS,
  equipmentLevelReq,
  gearDef,
  isGearDef,
  isWeaponDef,
  QUALITY_ORDER,
  QUALITY_PREFIX,
  registerFrozenDef,
  STAT_NAMES,
  TIER_ROLL_ORDER,
  TIERS,
  weaponAssumedTargets,
  weaponCritMult,
  weaponDamageVariance,
  weaponDef,
  type AffixDef,
  equipmentBaseName,
} from "./defs/equipment.ts";
import { gradeVariantIds } from "./defs/grades.ts";
import { difficultyDef } from "./defs/difficulties.ts";
import { levelDef } from "./defs/levels/index.ts";
import { storyItemDef } from "./defs/story.ts";
import { baseStatBonus } from "./leveling.ts";
import { currentMobLevel } from "./menace.ts";
import type {
  Affix,
  ArmorSlot,
  EquipSlot,
  Equipment,
  GameState,
  Item,
  Quality,
  StatName,
  Tier,
  WeaponClass,
} from "./types.ts";

/** The four body slots armor is worn in, in paperdoll order. */
export const ARMOR_SLOTS: readonly ArmorSlot[] = [
  "head",
  "chest",
  "legs",
  "feet",
];

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
  // The make quality leads the whole name (BROKEN JAGGED PIPE OF THE FOX) —
  // the craftsmanship is the first thing a scavenger sees.
  const quality = QUALITY_PREFIX[qualityOf(equipment)].trim();
  return [quality, prefix, base, suffix].filter(Boolean).join(" ");
}

// ---- Make quality --------------------------------------------------------------

/** An instance's make quality; pieces from before quality shipped (and
 * hand-minted ones — starting gear, the fallback sidearm) read as normal. */
export function qualityOf(equipment: Equipment): Quality {
  return equipment.quality ?? "normal";
}

/** The stat scale an instance's make quality applies to its base's numbers
 * (damage, armor, durability, merchant value) — config `QUALITY.mults`. */
export function qualityMult(equipment: Equipment): number {
  return QUALITY.mults[qualityOf(equipment)];
}

/**
 * The FULL wear budget of an equipment instance: the def's authored
 * durability scaled by the instance's make quality — the same number the
 * mint stamped (see `rollEquipment`). The one figure repair kits refill to
 * and every durability readout calls "max", so a CRUDE piece never repairs
 * past what it was built with. Zero when the def carries no durability
 * (charms, bags).
 */
export function equipmentMaxDurability(piece: Equipment): number {
  const base = isWeaponDef(piece.defId)
    ? weaponDef(piece.defId).durability
    : (gearDef(piece.defId).durability ?? 0);
  if (!base || base <= 0) return 0;
  return Math.max(1, Math.round(base * qualityMult(piece)));
}

/**
 * Roll a drop's MAKE QUALITY off a level-`mlvl` killer: one weighted pick
 * whose odds slide with the monster level — `QUALITY.weightsLow` at mlvl 1,
 * `QUALITY.weightsHigh` from `QUALITY.highMlvl` up, lerped between. The
 * level-1 rank and file hand out mostly BROKEN and CRUDE work; the deep
 * campaign's monsters carry SUPERIOR and PERFECT pieces.
 */
export function rollQuality(rng: Rng, mlvl: number): Quality {
  const t = Math.min(1, Math.max(0, (mlvl - 1) / (QUALITY.highMlvl - 1)));
  const pool = QUALITY_ORDER.map((quality) => ({
    quality,
    weight:
      QUALITY.weightsLow[quality] +
      (QUALITY.weightsHigh[quality] - QUALITY.weightsLow[quality]) * t,
  }));
  return pickWeighted(rng, pool).quality;
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

/**
 * Roll one affix: its magnitude is `ilvl × randomRange(perIlvl)` — the
 * Diablo rule that a deeper drop rolls bigger. Stat and hp affixes round to
 * whole points and never fall below 1, so even an ilvl-1 magic find pays
 * something.
 */
function rollAffix(rng: Rng, def: AffixDef, ilvl: number): Affix {
  const [min, max] = def.perIlvl;
  const value = ilvl * randomRange(rng, min, max);
  switch (def.kind) {
    case "damagePct":
      return { kind: "damagePct", value };
    case "crit":
      return { kind: "crit", value };
    case "maxHp":
      return { kind: "maxHp", value: Math.max(1, Math.round(value)) };
    case "armor":
      return { kind: "armor", value: Math.max(1, Math.round(value)) };
    case "stat":
      return {
        kind: "stat",
        value: Math.max(1, Math.round(value)),
        stat: STAT_NAMES[Math.floor(rng() * STAT_NAMES.length)] as StatName,
      };
  }
}

/**
 * The party's MAGIC FIND: the summed `aura.magicFind` of every companion on
 * its feet (a downed companion's aura is silent until it stands back up).
 * Multiplies every loot-tier roll's chance in `rollTier` — LUCKY's +50% aura
 * makes each magic/rare/unique gate half again as likely to open.
 */
export function magicFindBonus(state: GameState): number {
  let bonus = 0;
  for (const companion of state.companions) {
    if (companion.downedMs !== undefined) continue;
    bonus += companionDef(companion.defId).aura?.magicFind ?? 0;
  }
  return bonus;
}

/**
 * Roll the tier for a drop off a level-`mlvl` monster: best tier first, each
 * gated by the monster-level unlock (`LOOT.tierUnlockMlvl` — below the gate a
 * tier simply cannot drop, whatever the chances say), then rolled at the
 * global base chance plus the difficulty's bonus, sweetened by LUCK and any
 * per-enemy/menace bonus — the whole chance scaled by the party's MAGIC FIND
 * aura (see `magicFindBonus`).
 */
function rollTier(state: GameState, mlvl: number, tierBonus: number): Tier {
  const difficultyChances = difficultyDef(state.difficulty).tierChanceBonus;
  const luckBonus =
    effectiveStat(state, "luck") * STATS.tierChancePerLuck + tierBonus;
  const magicFind = 1 + magicFindBonus(state);
  // TIER_ROLL_ORDER never contains "regular" (the fall-through), so the
  // rolled-tier config maps index safely.
  for (const tier of TIER_ROLL_ORDER as Exclude<Tier, "regular">[]) {
    if (mlvl < LOOT.tierUnlockMlvl[tier]) continue;
    const base = LOOT.tierChances[tier] + (difficultyChances[tier] ?? 0);
    if (base <= 0) continue;
    if (state.rng() < (base + luckBonus) * magicFind) return tier;
  }
  return "regular";
}

/**
 * Roll a dropped item's own LEVEL off a level-`mlvl` killer: the mob's level
 * minus a small weighted deficit (config `LOOT.ilvlDeltaWeights` — full-level
 * drops are the rare end of the band). Rare-and-better finds use the tighter
 * `ilvlDeltaWeightsRare` band (0–1 below), so a yellow is generally a
 * high-level item. The difficulty's `lootIlvlBonus` is added on top — the
 * harder rungs' drops roll a few levels deep, sizing both their affixes and
 * an armor piece's rolled armor. Floored at 1.
 */
function rollItemLevel(state: GameState, mlvl: number, tier: Tier): number {
  const weights: readonly number[] =
    tier === "rare" || tier === "unique" || tier === "legendary"
      ? LOOT.ilvlDeltaWeightsRare
      : LOOT.ilvlDeltaWeights;
  const delta = pickWeighted(
    state.rng,
    weights.map((weight, i) => ({ weight, delta: i })),
  ).delta;
  const bonus = difficultyDef(state.difficulty).lootIlvlBonus;
  return Math.max(1, mlvl + bonus - delta);
}

/**
 * Roll a fresh equipment instance from the level's loot pools — or, with
 * `defId`, mint a specific piece (signature drops, placed items). `mlvl` is
 * the killer's MONSTER LEVEL (defaulting to the live horde level) and drives
 * the whole Diablo shape of the drop: bases with a `levelReq` above it never
 * roll, tiers it hasn't unlocked never roll, and the item's own level (which
 * sizes its affixes) hangs off it. Tier affix counts come from the ladder
 * (regular 0, magic 1, rare 2, unique 3, legendary 4); affix kinds never
 * repeat on one item.
 */
export function rollEquipment(
  state: GameState,
  opts: {
    slot?: "weapon" | "gear";
    tierBonus?: number;
    defId?: string;
    /** Force a specific tier instead of rolling one (story-guaranteed
     * pieces like the space suit; a boss's `tierDrops` payouts). */
    tier?: Tier;
    /** Force a specific MAKE QUALITY instead of rolling one — scripted
     * story drops (a level's `earlyDrops`) arrive exactly as tuned. */
    quality?: Quality;
    /** The killer's monster level; omitted = the live horde level. */
    mlvl?: number;
  } = {},
): Equipment {
  const rng = state.rng;
  const mlvl = opts.mlvl ?? currentMobLevel(state);
  const loot = levelDef(state.level.id).loot;
  const family = opts.defId
    ? isWeaponDef(opts.defId)
      ? ("weapon" as const)
      : ("gear" as const)
    : (opts.slot ?? (rng() < 0.6 ? ("weapon" as const) : ("gear" as const)));
  // Levels author their pools in NORMAL bases only; each entry implies its
  // exceptional/elite versions (defs/grades.ts), folded in here so the base
  // ladder keeps unfolding to level 100. The levelReq gate below decides
  // which grades this killer can actually pay. Filtered against the active
  // catalog so a swapped-in fixture catalog (tests) sees no phantom ids.
  const authoredPool = family === "weapon" ? loot.weaponPool : loot.gearPool;
  const fullPool = authoredPool.flatMap((id) => [
    id,
    ...gradeVariantIds(id).filter((variantId) =>
      family === "weapon" ? isWeaponDef(variantId) : isGearDef(variantId),
    ),
  ]);
  // The levelReq drop gate: a base whose requirement the killer's level
  // hasn't reached stays out of the draw. If the whole pool is still out of
  // reach (a fresh run on a late-game pool), the lowest-requirement bases
  // stand in so a drop is never a dead roll.
  let pool = fullPool.filter((id) => equipmentLevelReq(id) <= mlvl);
  if (pool.length === 0 && fullPool.length > 0) {
    const minReq = Math.min(...fullPool.map((id) => equipmentLevelReq(id)));
    pool = fullPool.filter((id) => equipmentLevelReq(id) === minReq);
  }
  let defId = opts.defId ?? (pool[Math.floor(rng() * pool.length)] as string);
  // Harder difficulties find fewer ARMOR pieces: when a random gear pick
  // lands on armor, the difficulty's `armorDropMult` is its chance to stand —
  // a failed roll re-picks among the pool's non-armor pieces (if any). Minted
  // pieces (opts.defId — boss trophies, placed items) are never dampened, and
  // a mult at/above 1 draws nothing, so the baseline stream is untouched.
  if (family === "gear" && !opts.defId) {
    const diff = difficultyDef(state.difficulty);
    const picked = gearDef(defId).armor;
    // A hurting hero on the gentle rungs pulls armor pieces IN — armor is
    // life-saving gear, so it rains harder the closer he is to death (the
    // mirror image of the dampening below, and only ever a mercy on
    // easy/medium: `mercy.armorBonus` is zero from hard up). No draw is
    // spent at full health (desperation 0), so the baseline stream is intact.
    // One rope at a time: while an armor piece already waits un-collected in
    // view, the pull holds fire (see mercyRescueWaiting).
    const armorPull = mercyRescueWaiting(state, "armor")
      ? 0
      : lowHealthDesperation(state) * diff.mercy.armorBonus;
    if (picked !== undefined) {
      // Harder rungs find fewer armor pieces: a landed-on-armor pick re-rolls
      // to a non-armor piece at `1 - armorDropMult`.
      if (diff.armorDropMult < 1 && rng() >= diff.armorDropMult) {
        const bare = pool.filter((id) => gearDef(id).armor === undefined);
        if (bare.length > 0) {
          defId = bare[Math.floor(rng() * bare.length)] as string;
        }
      }
    } else if (armorPull > 0 && rng() < armorPull) {
      const armored = pool.filter((id) => gearDef(id).armor !== undefined);
      if (armored.length > 0) {
        defId = armored[Math.floor(rng() * armored.length)] as string;
      }
    }
  }
  const slot: EquipSlot = family === "weapon" ? "weapon" : gearDef(defId).slot;

  const tier = opts.tier ?? rollTier(state, mlvl, opts.tierBonus ?? 0);
  const ilvl = rollItemLevel(state, mlvl, tier);
  // The MAKE QUALITY roll: PLAIN (regular-tier) weapons and armor only —
  // the D2 rule that craftsmanship and magic are exclusive. A magic-or-
  // better find is already well made, so every tier above white mints at
  // normal make (no draw is spent), the same way unique/legendary already
  // mint unbreakable. Charms and bags carry no number for craftsmanship to
  // scale, so they never roll one either. Odds slide with the monster level
  // (see rollQuality).
  const gradeable = family === "weapon" || gearDef(defId).armor !== undefined;
  const quality: Quality =
    opts.quality ??
    (gradeable && tier === "regular" ? rollQuality(rng, mlvl) : "normal");
  const qMult = QUALITY.mults[quality];
  const affixes: Affix[] = [];
  const available = [...AFFIX_POOLS[family]];
  for (let i = 0; i < TIERS[tier].affixCount && available.length > 0; i++) {
    const affixDef = pickWeighted(rng, available);
    available.splice(available.indexOf(affixDef), 1);
    affixes.push(rollAffix(rng, affixDef, ilvl));
  }

  const rolled: Equipment = {
    id: state.nextId++,
    defId,
    slot,
    tier,
    ilvl,
    quality,
    affixes,
    // Freeze the birth-version def onto the instance so a later catalog edit
    // (rebalance or deletion) can never reach back and change THIS item — the
    // player keeps what they picked up. See `Equipment.def` / `adoptEquipment`.
    def: structuredClone(
      family === "weapon" ? weaponDef(defId) : gearDef(defId),
    ),
  };
  // Dropped weapons arrive fresh but finite — they wear out per attack, and
  // the make quality sizes the wear budget (a CRUDE blade also breaks
  // sooner). Unique and legendary finds are the exception: very well built,
  // they never break (no durability also exempts them from the looted-weapon
  // damage damper, the way the built-in sidearm is exempt).
  if (family === "weapon" && tier !== "unique" && tier !== "legendary") {
    rolled.durability = Math.max(
      1,
      Math.round(weaponDef(defId).durability * qMult),
    );
  }
  if (family === "gear") {
    const def = gearDef(defId);
    if (def.armor !== undefined) {
      // The WoW growth rule: the authored armor is the base's value AT ITS
      // OWN levelReq; every item level above it grows the roll, so the same
      // vest found deep is genuinely better. The make quality then scales
      // the whole roll (a PERFECT vest turns more than the catalog says).
      // Stamped once, frozen for life.
      const growth = Math.max(0, ilvl - (def.levelReq ?? 1));
      rolled.armor = Math.round(
        def.armor * (1 + ARMOR.armorPerIlvl * growth) * qMult,
      );
      // Armor wears per hit taken and merely goes INACTIVE at zero (never
      // trashed); unique/legendary pieces mint unbreakable, like weapons.
      if (tier !== "unique" && tier !== "legendary" && def.durability) {
        rolled.durability = Math.max(1, Math.round(def.durability * qMult));
      }
    }
  }
  return rolled;
}

/**
 * Bring a persisted item into the live catalog so a rebalanced or DELETED base
 * can neither nerf it nor crash the load — the guarantee that a kept drop stays
 * exactly as it dropped. Every item minted since snapshots shipped carries a
 * frozen copy of its def (`Equipment.def`); here we park that snapshot under a
 * stable synthetic id (`registerFrozenDef`) and re-home the instance onto it,
 * so from now on every stat read (`weaponDef`/`gearDef` and everything routing
 * through them) resolves the item AS DROPPED, independent of the shipped
 * catalog. Newly rolled items still reference the live def, so catalog edits
 * land on new drops alone.
 *
 * Idempotent — an already-adopted piece re-registers to the same id. Returns
 * `null` only for a LEGACY piece (minted before snapshots) whose base is also
 * gone from the catalog: with neither a snapshot nor a live def there is
 * nothing left to resolve, the same unrecoverable case the loader dropped
 * before. A legacy piece whose base still exists is frozen at the current def,
 * protecting it from here on.
 */
export function adoptEquipment(piece: Equipment): Equipment | null {
  const family: "weapon" | "gear" = piece.slot === "weapon" ? "weapon" : "gear";
  let def = piece.def;
  if (!def) {
    const present =
      family === "weapon" ? isWeaponDef(piece.defId) : isGearDef(piece.defId);
    if (!present) return null;
    def = structuredClone(
      family === "weapon" ? weaponDef(piece.defId) : gearDef(piece.defId),
    );
  }
  const defId = registerFrozenDef(def, family);
  return { ...piece, defId, def };
}

// ---- Derived stats -----------------------------------------------------------

function equippedPieces(state: GameState): Equipment[] {
  const { weapon, head, chest, legs, feet, charm, bag } =
    state.player.equipment;
  return [weapon, head, chest, legs, feet, charm, bag].filter(
    (e): e is Equipment => e !== null,
  );
}

/**
 * True when this worn piece is a BROKEN armor piece: its durability has hit
 * zero, so it stays on the body but counts for NOTHING — no armor, no flat
 * bonuses, no affixes — until a repair kit restores it. Only armor breaks
 * this way; a weapon at zero is trashed instead (see `wearEquippedWeapon`),
 * and charms/bags never wear.
 */
export function isArmorBroken(piece: Equipment): boolean {
  return (
    piece.slot !== "weapon" &&
    piece.slot !== "charm" &&
    piece.slot !== "bag" &&
    piece.durability === 0
  );
}

/** The worn pieces whose bonuses/affixes actually apply right now — everything
 * equipped minus broken armor. Every derived-stat read routes through this so
 * a worn-out piece goes silent the moment it breaks. */
function activePieces(state: GameState): Equipment[] {
  return equippedPieces(state).filter((piece) => !isArmorBroken(piece));
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
  const equipment = { ...player.equipment, [candidate.slot]: candidate };
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
 * Stat points from level-ups — the AUTOMATIC base growth leveling itself
 * grants (`baseStatBonus`, WoW-style) plus the points the player chose —
 * any equipped `+N <stat>` affixes, and the flat bonus of every passive
 * trinket carried (bag or worn).
 */
export function effectiveStat(state: GameState, stat: StatName): number {
  let value =
    state.player.stats[stat] + baseStatBonus(state.player.level, stat);
  for (const piece of activePieces(state)) {
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
  for (const piece of activePieces(state)) {
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
 * The armor points ONE piece contributes while worn: the instance's rolled
 * value (stamped at mint — the def's base grown by item level), falling back
 * to the def's base for pieces minted before the stamp existed, plus any
 * rolled `+armor` affixes. Zero for weapons and for BROKEN armor — a piece
 * at durability 0 hangs silent until repaired.
 */
export function armorValueOf(piece: Equipment): number {
  if (isWeaponDef(piece.defId) || isArmorBroken(piece)) return 0;
  let value = piece.armor ?? gearDef(piece.defId).armor ?? 0;
  for (const affix of piece.affixes) {
    if (affix.kind === "armor") value += affix.value;
  }
  return Math.round(value);
}

/**
 * The player's TOTAL armor points: every worn piece's contribution summed
 * (see `armorValueOf` — broken pieces count zero). The single number the
 * damage reduction, the stat panel, and gear comparisons read.
 */
export function totalArmor(state: GameState): number {
  let total = 0;
  for (const piece of equippedPieces(state)) total += armorValueOf(piece);
  return total;
}

/**
 * The fraction of a physical hit the worn armor turns, AGAINST an attacker of
 * `attackerLevel` — the D2/WoW diminishing-returns curve (config `ARMOR`):
 *
 *   armor / (armor + kBase + kPerLevel × attackerLevel)
 *
 * capped at `maxReduction`. Leveling the horde grows the denominator, so a
 * set that turned a third of every blow decays to a shrug unless the armor
 * keeps pace — the reason armor drops matter all campaign.
 */
export function armorReduction(
  state: GameState,
  attackerLevel: number,
): number {
  const armor = totalArmor(state);
  if (armor <= 0) return 0;
  const k = ARMOR.kBase + ARMOR.kPerLevel * Math.max(1, attackerLevel);
  return Math.min(ARMOR.maxReduction, armor / (armor + k));
}

/**
 * Spend one hit's worth of every worn armor piece's durability — called when
 * an enemy's blow or a hazard actually LANDS (a dodged hit costs nothing).
 * A piece reaching zero goes INACTIVE (still worn, contributing nothing —
 * see `isArmorBroken`) and announces itself with an `armorBroke` event; the
 * derived stats are re-derived since its bonuses just went silent.
 */
export function wearWornArmor(state: GameState): void {
  let broke = false;
  for (const slot of ARMOR_SLOTS) {
    const piece = state.player.equipment[slot];
    if (!piece || piece.durability === undefined || piece.durability <= 0) {
      continue;
    }
    piece.durability--;
    if (piece.durability === 0) {
      broke = true;
      state.events.push({ type: "armorBroke", defId: piece.defId });
    }
  }
  if (broke) {
    recomputeMaxHp(state);
    recomputeMaxStamina(state);
  }
}

/**
 * Restore every worn armor piece to full durability — the repair kit mends
 * the wardrobe alongside the weapon's edge, waking any broken piece back up.
 * False when there is nothing to mend (no worn piece is short) so the kit
 * isn't spent on an intact set.
 */
export function repairWornArmor(state: GameState): boolean {
  let mended = false;
  let revived = false;
  for (const slot of ARMOR_SLOTS) {
    const piece = state.player.equipment[slot];
    if (!piece || piece.durability === undefined) continue;
    const max = equipmentMaxDurability(piece);
    if (piece.durability >= max) continue;
    if (piece.durability === 0) revived = true;
    piece.durability = max;
    mended = true;
  }
  // A revived piece's bonuses just came back online.
  if (revived) {
    recomputeMaxHp(state);
    recomputeMaxStamina(state);
  }
  return mended;
}

/**
 * Refill the sprint pool to full — the energy-drink pickup. False when there
 * is nothing to top up (already at max) so, like the repair kit on a pristine
 * weapon, the drink stays on the ground for a hero who has actually run himself
 * winded rather than being spent on a rested one.
 */
export function restoreStamina(state: GameState): boolean {
  const player = state.player;
  if (player.stamina >= player.maxStamina) return false;
  player.stamina = player.maxStamina;
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
  for (const piece of activePieces(state)) {
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
 * Whether the hero is drawn as the astronaut. The EVA suit is STORY gear,
 * not equipment — it is worn OVER his clothes and armor, carries no slot and
 * no stats, and latches the moment its story item is picked up (a
 * `StoryItemDef.suitsHero` entry — SpaceZ HQ's recovered space suit). On
 * every level but SpaceZ HQ he starts suited (the story picks up
 * mid-mission). The renderer reads this to choose the plain-clothes or
 * astronaut sprite set.
 */
export function playerSuited(state: GameState): boolean {
  for (const defId of state.storyItems) {
    if (storyItemDef(defId).suitsHero) return true;
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

/**
 * The shared shape of every MERCY DROP: a 0→1 "desperation" that a signal
 * (health, weapon durability, crowd size) turns into as it worsens. Zero at or
 * above `start`, one at or below `full`, linear between — so the drop rolls
 * that read it only need to multiply by a strength knob. One function so all
 * three ramps behave identically and stay easy to reason about.
 */
export function desperationRamp(
  fraction: number,
  start: number,
  full: number,
): number {
  if (fraction >= start) return 0;
  if (fraction <= full) return 1;
  return (start - fraction) / (start - full);
}

/** How close to death the hero is, as a 0→1 mercy-drop desperation (see
 * `desperationRamp`): 0 above `MERCY.lowHealthStart` of max hp, 1 at/under
 * `MERCY.lowHealthFull`. Drives the low-health medkit and armor boosts. */
export function lowHealthDesperation(state: GameState): number {
  const { hp, maxHp } = state.player;
  if (maxHp <= 0) return 0;
  return desperationRamp(hp / maxHp, MERCY.lowHealthStart, MERCY.lowHealthFull);
}

/** How close the hero's kit is to giving out, as a 0→1 mercy-drop
 * desperation: the WORST of the equipped weapon's and every worn armor
 * piece's durability fraction, ramped between `MERCY.lowDurabilityStart`
 * and `MERCY.lowDurabilityFull`. Unbreakable pieces (no durability) never
 * trigger it. Drives the low-durability repair boost — a repair kit mends
 * weapon and wardrobe alike, so either running dry may call one in. */
export function lowDurabilityDesperation(state: GameState): number {
  let worst = 0;
  const weapon = state.player.equipment.weapon;
  if (weapon.durability !== undefined) {
    const max = equipmentMaxDurability(weapon);
    if (max > 0) {
      worst = desperationRamp(
        weapon.durability / max,
        MERCY.lowDurabilityStart,
        MERCY.lowDurabilityFull,
      );
    }
  }
  for (const slot of ARMOR_SLOTS) {
    const piece = state.player.equipment[slot];
    if (!piece || piece.durability === undefined) continue;
    const max = equipmentMaxDurability(piece);
    if (max <= 0) continue;
    worst = Math.max(
      worst,
      desperationRamp(
        piece.durability / max,
        MERCY.lowDurabilityStart,
        MERCY.lowDurabilityFull,
      ),
    );
  }
  return worst;
}

/** The rescue pickups a mercy signal can answer with: the low-health medkit,
 * the low-durability repair kit, the empty-sprint energy drink, the
 * packed-field screen-nuke, and the low-health plated-armor pull. */
export type MercyRescue = "medkit" | "repair" | "drink" | "bomb" | "armor";

/** Whether a ground item answers the given mercy signal. */
function answersMercy(item: Item, rescue: MercyRescue): boolean {
  switch (rescue) {
    case "bomb":
      return item.kind === "ability" && item.defId === "screen_nuke";
    case "armor":
      return (
        item.kind === "equipment" &&
        item.equipment.slot !== "weapon" &&
        gearDef(item.equipment.defId).armor !== undefined
      );
    default:
      return item.kind === rescue;
  }
}

/**
 * ONE ROPE AT A TIME: true while an un-collected pickup answering the given
 * mercy signal already lies within `MERCY.rescueRadius` of the hero. Every
 * mercy path checks this before throwing another rescue, so a distress signal
 * keeps at most ONE rope on the ground — a hero who ignores the medkit at his
 * feet is not buried under more, while one who left it behind out of view is
 * still thrown another. Ordinary-rain pickups count too: a rescue is a
 * rescue, however it fell.
 */
export function mercyRescueWaiting(
  state: GameState,
  rescue: MercyRescue,
): boolean {
  return state.items.some(
    (item) =>
      answersMercy(item, rescue) &&
      distance(item.pos, state.player.pos) <= MERCY.rescueRadius,
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
  // The instance's MAKE QUALITY scales the blow: a BROKEN pipe swings soft,
  // a PERFECT one over its catalog weight (config QUALITY.mults). Routed
  // here — the one source of stat-scaled damage — so combat, auto-equip
  // scoring, and every DPS readout agree on what craftsmanship is worth.
  return def.damage * multiplier * lootMult * qualityMult(weapon);
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
  return { damage: weaponDamageFor(state, weapon) * factor, roll };
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
 * light blows are worth their crowd) × the cadence-weighted crit lift. The
 * same math the balance budget is authored in, so "better" here matches the
 * design's intent.
 */
export function weaponScore(state: GameState, weapon: Equipment): number {
  const def = weaponDef(weapon.defId);
  const critLift =
    1 + playerCritChance(state, def.class) * (weaponCritMult(def) - 1);
  // Melee AoE is only worth what THIS build's INTELLIGENCE can realize: a
  // cone budgeted at 4 counts for 2 in untrained hands (maxMeleeTargets),
  // so auto-equip won't trade a solid single-target hit for potential the
  // hero can't cash yet. Ranged multipliers (pellets, pierce, chain) are
  // the weapon's own physics and count in full.
  const assumed = weaponAssumedTargets(def);
  const targets = def.projectile
    ? assumed
    : Math.min(assumed, maxMeleeTargets(state));
  return (
    ((weaponDamageFor(state, weapon) * 1000) /
      weaponCooldownFor(state, weapon)) *
    targets *
    critLift
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
 * true sustained output rather than a ranking heuristic. Per TARGET — an
 * AoE weapon reads low here and earns it back across the crowd (see
 * `weaponAssumedTargets`).
 */
export function weaponDps(state: GameState, weapon: Equipment): number {
  const def = weaponDef(weapon.defId);
  const perHit = weaponDamageFor(state, weapon);
  const attacksPerSec = 1000 / weaponCooldownFor(state, weapon);
  const critLift =
    1 + playerCritChance(state, def.class) * (weaponCritMult(def) - 1);
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
  let score =
    (def.bonuses.maxHp ?? 0) +
    (def.bonuses.critChance ?? 0) * 300 +
    (gear.armor ?? def.armor ?? 0) * 2 +
    (def.bagSlots ?? 0) * 10;
  for (const affix of gear.affixes) {
    if (affix.kind === "maxHp") score += affix.value;
    else if (affix.kind === "crit") score += affix.value * 300;
    else if (affix.kind === "stat") score += affix.value * 15;
    else if (affix.kind === "armor") score += affix.value * 2;
    else score += affix.value * 100;
  }
  return score;
}

/** Remaining attacks left on a weapon; the unbreakable sidearm never wears
 * out, so it counts as effectively infinite durability. */
function remainingDurability(weapon: Equipment): number {
  return weapon.durability ?? Infinity;
}

/** The original catalog id a piece was minted from — the frozen snapshot's own
 * id when the instance has been re-homed onto a synthetic frozen id, else the
 * live `defId`. Lets "is this the same base?" checks see through re-homing so a
 * kept item and a fresh drop of the same base still read as one base. */
export function baseDefId(piece: Equipment): string {
  return piece.def?.id ?? piece.defId;
}

/**
 * Can the hero WEAR this piece yet? The Diablo level gate: an item whose
 * base `levelReq` outruns the player's level is a find to bank, not a weapon
 * to swing — auto-equip skips it, the bag refuses to equip it, and the UI
 * paints the requirement red until the hero grows into it.
 */
export function meetsLevelReq(state: GameState, equipment: Equipment): boolean {
  return state.player.level >= equipmentLevelReq(equipment.defId);
}

/** Is `candidate` strictly better than the piece occupying its slot? */
export function isBetterEquipment(
  state: GameState,
  candidate: Equipment,
): boolean {
  // An under-leveled find is never worn, however strong — it banks instead.
  if (!meetsLevelReq(state, candidate)) return false;
  if (candidate.slot === "weapon") {
    const current = state.player.equipment.weapon;
    // No starter special case anymore: weaponScore speaks the damage-budget
    // model (AoE targets + crit weight folded in), so the wall weapon holds
    // its slot until a find genuinely out-scores it — a budget-normalized
    // cone cleaver is a DOWNGRADE in a sparse field, and force-equipping it
    // (the old "pickup floor" rule) collapsed early runs. The starter still
    // leaves the story soon enough: it wears out.
    const candidateScore = weaponScore(state, candidate);
    const currentScore = weaponScore(state, current);
    if (candidateScore !== currentScore) return candidateScore > currentScore;
    // Equal firepower: picking up the same weapon you already wield is worth
    // swapping to when the fresh copy has more durability left — it refreshes
    // the durability bar. The worn copy heads to the bag, or drops to the
    // ground when the bag is full (like dropping it to grab the new one).
    if (baseDefId(candidate) === baseDefId(current)) {
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

/**
 * Would wearing `candidate` improve its slot over what's equipped right now?
 * A purely informational cousin of `isBetterEquipment` for the pickup card's
 * "UPGRADE" marker: it drops the auto-equip rule's exclusions (passive charms,
 * the equal-firepower durability tiebreak) so a stronger passive still reads as
 * an upgrade, but keeps the level gate — a piece the hero can't wear yet is
 * not an upgrade he can act on. Never mutates state.
 */
export function wouldUpgradeSlot(
  state: GameState,
  candidate: Equipment,
): boolean {
  if (!meetsLevelReq(state, candidate)) return false;
  if (candidate.slot === "weapon") {
    return (
      weaponScore(state, candidate) >
      weaponScore(state, state.player.equipment.weapon)
    );
  }
  const current = state.player.equipment[candidate.slot];
  return current === null || gearScore(candidate) > gearScore(current);
}

// ---- Inventory capacity (STRENGTH-scaled) --------------------------------------

/**
 * Extra cells granted by the BAG worn in the bag slot (its `GearDef.bagSlots`),
 * or 0 when no bag is worn. A bag only pays out from the slot — one sitting in
 * a cell is just loot until it's equipped.
 */
export function equippedBagSlots(state: GameState): number {
  const bag = state.player.equipment.bag;
  if (!bag || isWeaponDef(bag.defId)) return 0;
  return gearDef(bag.defId).bagSlots ?? 0;
}

/**
 * How many bag cells the player should have right now: the small
 * `baseInventorySize` floor plus `bagSlotsPerStr` per point of STRENGTH
 * (affixes folded in, via `effectiveStat`) plus whatever a worn BAG adds. A STR
 * build and a roomy bag are both ways to earn the room to hoard loot.
 */
export function inventoryCapacity(state: GameState): number {
  return (
    LOOT.baseInventorySize +
    Math.floor(effectiveStat(state, "strength") * STATS.bagSlotsPerStr) +
    equippedBagSlots(state)
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
  // The level gate holds in the bag too: an under-leveled find stays banked.
  if (!meetsLevelReq(state, item)) return false;
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
 * always fights with something), so only worn gear — armor, a charm, a bag —
 * is trashed this way. Returns the discarded piece, or null when the slot is
 * the weapon or already bare.
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
  return item;
}

// ---- Bulk scrap (the "clear out junk" sweep) -----------------------------------

/**
 * A "special" bag piece the bulk-scrap sweep always spares, whatever the raw
 * numbers say: a passive trinket (it pays its bonus just by riding in the bag,
 * so a plain stat comparison misses its worth) or a top-tier find (unique or
 * legendary — the rarest drops, kept as trophies and for their fat affix
 * rolls). Everything else is ordinary loot the sweep may cull.
 */
export function isSpecialItem(item: Equipment): boolean {
  if (item.tier === "unique" || item.tier === "legendary") return true;
  if (isWeaponDef(item.defId)) return false;
  const def = gearDef(item.defId);
  return def.passive !== undefined;
}

/**
 * Is this bag piece at least as good as whatever is worn in its slot? Weapons
 * rank by `weaponScore` (the auto-equip model — damage-budget AoE and crit
 * folded in), gear by `gearScore`; an empty gear slot has nothing to beat, so
 * any piece bound for it counts as worth keeping. Equal worth is kept too — a
 * side-grade or a spare of the same weapon (a durability refresh) is not "worse
 * than equipped".
 */
function isAtLeastAsGoodAsEquipped(state: GameState, item: Equipment): boolean {
  if (item.slot === "weapon") {
    return (
      weaponScore(state, item) >=
      weaponScore(state, state.player.equipment.weapon)
    );
  }
  const current = state.player.equipment[item.slot];
  if (!current) return true;
  return gearScore(item) >= gearScore(current);
}

/**
 * True when the bulk-scrap sweep would destroy this bag piece: it is neither
 * special (see `isSpecialItem`) nor as good as what's already worn in its slot
 * (see `isAtLeastAsGoodAsEquipped`) — the loot the hero has outgrown. The UI
 * reads this to count the cull and enable the SCRAP button.
 */
export function isScrappableLoot(state: GameState, item: Equipment): boolean {
  return !isSpecialItem(item) && !isAtLeastAsGoodAsEquipped(state, item);
}

/**
 * The SCRAP-JUNK sweep: permanently destroy every bag piece the hero has
 * outgrown — loot that is neither special nor at least as good as what's worn
 * in its slot (see `isScrappableLoot`). Keepers stay: upgrades, side-grades,
 * trinkets, trophies, and anything bound for an empty slot. Returns the culled
 * pieces (empty when nothing was junk) so the UI can announce the count; there
 * is no undo, exactly like a single `discardFromInventory`.
 */
export function scrapInferiorLoot(state: GameState): Equipment[] {
  const inv = state.player.inventory;
  const scrapped: Equipment[] = [];
  for (let i = 0; i < inv.length; i++) {
    const item = inv[i];
    if (!item || !isScrappableLoot(state, item)) continue;
    inv[i] = null;
    scrapped.push(item);
  }
  return scrapped;
}

// ---- Auto-equip everything (the "optimize my gear" sweep) ----------------------

/** The wearable slots the auto-equip sweep fills, in paperdoll order after the
 * weapon: the four armor slots plus the charm and bag. */
const GEAR_SLOTS: readonly Exclude<EquipSlot, "weapon">[] = [
  ...ARMOR_SLOTS,
  "charm",
  "bag",
];

/**
 * Plan the auto-equip sweep without mutating: the bag cell indices to equip so
 * every slot ends up holding its best wearable piece. The weapon is decided
 * first, on the build the hero plays right now (allocated STATS drive the melee
 * vs magic choice through `weaponScore` — a STRENGTH hero lands a heavier melee
 * blow, an INTELLIGENCE hero a stronger spell), then each gear slot takes the
 * highest `gearScore` find that beats what's worn. Under-leveled banked finds,
 * broken weapons, and passive trinkets (they pay out from the bag, so the charm
 * slot is left free) are skipped — the same rule the pickup auto-equip follows.
 * Every returned index points at a distinct piece in a distinct slot, so the
 * cells stay valid as they are equipped one after another.
 */
function planAutoEquip(state: GameState): number[] {
  const player = state.player;
  const inv = player.inventory;
  const plan: number[] = [];

  // Weapon: the bag weapon that most out-scores what's held for this build.
  let bestWeapon = -1;
  let bestWeaponScore = weaponScore(state, player.equipment.weapon);
  for (let i = 0; i < inv.length; i++) {
    const item = inv[i];
    if (!item || item.slot !== "weapon") continue;
    if (item.durability !== undefined && item.durability <= 0) continue;
    if (!meetsLevelReq(state, item)) continue;
    const score = weaponScore(state, item);
    if (score > bestWeaponScore) {
      bestWeaponScore = score;
      bestWeapon = i;
    }
  }
  if (bestWeapon >= 0) plan.push(bestWeapon);

  // Gear: the highest-worth wearable find for each body/charm/bag slot,
  // provided it beats what that slot wears now (an empty slot takes anything).
  for (const slot of GEAR_SLOTS) {
    const current = player.equipment[slot];
    let bestGear = -1;
    let bestGearScore = current ? gearScore(current) : -Infinity;
    for (let i = 0; i < inv.length; i++) {
      const item = inv[i];
      if (!item || item.slot !== slot) continue;
      if (!meetsLevelReq(state, item)) continue;
      // A passive trinket earns its bonus just by riding in the bag, so it is
      // never worn — the charm slot stays open for an active piece.
      if (isPassiveItem(item.defId)) continue;
      const score = gearScore(item);
      if (score > bestGearScore) {
        bestGearScore = score;
        bestGear = i;
      }
    }
    if (bestGear >= 0) plan.push(bestGear);
  }

  return plan;
}

/**
 * The AUTO-EQUIP sweep: wear the best piece the bag can offer in every slot at
 * once. Weapons rank by the build-aware `weaponScore` (so the hero's stats pick
 * melee, ranged, or magic for them), gear by `gearScore` (armor, HP, crit, and
 * stat affixes — the health/armor the sweep maximizes). Each displaced piece
 * swaps back into the bag via `equipFromInventory`, so nothing is destroyed.
 * Returns how many slots actually changed, so the UI can stay quiet when the
 * loadout was already optimal.
 */
export function autoEquipBest(state: GameState): number {
  let changed = 0;
  for (const index of planAutoEquip(state)) {
    if (equipFromInventory(state, index)) changed++;
  }
  return changed;
}

/**
 * How many slots the auto-equip sweep would improve right now, without touching
 * a thing — the count the inventory reads to label the button and disable it on
 * an already-optimal loadout. Mirrors `autoEquipBest` exactly (it plans the same
 * swaps), so the badge never promises a change the sweep won't make.
 */
export function autoEquipUpgradeCount(state: GameState): number {
  return planAutoEquip(state).length;
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
    // A banked find the hero hasn't grown into can't be drawn yet.
    if (!meetsLevelReq(state, item)) continue;
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
      ilvl: 1,
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
  const max = equipmentMaxDurability(weapon);
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
  // A level-up resumes the moment its last point lands; a respec never
  // auto-closes — the chooser stays open (points can be moved back and forth)
  // until the player confirms the build (`confirmRespec`).
  if (player.pendingStatPoints === 0 && state.phase === "levelup") {
    state.phase = "playing";
  }
  return true;
}

// ---- Respec (LEVEL TOKEN reallocation) ----------------------------------------

/**
 * Open the from-scratch respec the way a spent LEVEL TOKEN owes it (see
 * progress.ts): refund every banked stat point back into a single pool and
 * zero the six stats, then freeze the run in the `respec` phase so the player
 * re-places the whole build. Idempotent guard aside, this is the one-shot the
 * pending flag arms — clear it so a later `dismissIntro` can't re-open the
 * chooser. The refunded total is the hero's carried-in level (plus any
 * difficulty head-start already folded into his stats).
 */
export function beginRespec(state: GameState): void {
  const player = state.player;
  state.respecPending = false;
  let pool = player.pendingStatPoints;
  for (const stat of STAT_NAMES) {
    pool += player.stats[stat];
    player.stats[stat] = 0;
  }
  player.pendingStatPoints = pool;
  recomputeMaxHp(state);
  recomputeMaxStamina(state);
  syncInventoryCapacity(state);
  // Refunding STRENGTH shrinks the bag; keep current hp/stamina inside the
  // freshly-zeroed pools so the readouts never show an over-full bar.
  player.hp = Math.min(player.hp, player.maxHp);
  player.stamina = Math.min(player.stamina, player.maxStamina);
  state.phase = "respec";
}

/**
 * Put one point back into the pool during a respec: the inverse of
 * `allocateStat`, floored at zero and live only while the `respec` chooser is
 * open. Returns false when the stat is already at zero (nothing to refund) or
 * the run is not respeccing.
 */
export function deallocateStat(state: GameState, stat: StatName): boolean {
  if (state.phase !== "respec") return false;
  const player = state.player;
  if (player.stats[stat] <= 0) return false;
  player.stats[stat]--;
  player.pendingStatPoints++;
  recomputeMaxHp(state);
  recomputeMaxStamina(state);
  if (stat === "strength") syncInventoryCapacity(state);
  player.hp = Math.min(player.hp, player.maxHp);
  player.stamina = Math.min(player.stamina, player.maxStamina);
  return true;
}

/**
 * Commit the respec and drop into play — only once every refunded point has
 * been re-spent, so the build is never left with points on the table. The run
 * arrives rested, exactly like a fresh drop: full health and a full sprint
 * pool over the newly-chosen stats. False (nothing happens) while points
 * remain or the run is not respeccing.
 */
export function confirmRespec(state: GameState): boolean {
  const player = state.player;
  if (state.phase !== "respec" || player.pendingStatPoints > 0) return false;
  player.hp = player.maxHp;
  player.stamina = player.maxStamina;
  state.phase = "playing";
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
    // A LEVEL TOKEN jump owes a respec before the first step: open the
    // reallocation chooser in place of dropping straight into play.
    if (state.respecPending) {
      beginRespec(state);
    } else {
      state.phase = "playing";
    }
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

/**
 * Replay shortcut: bail the whole opening at once — the prelude cutscene AND
 * the hero's intro monologue — and drop straight into play with his weapon
 * drawn. The app calls this when the player has already witnessed this level's
 * opening on this difficulty (see the per-character story ledger in
 * characters.ts): a die-and-retry loop shouldn't sit through the cutscene, the
 * briefing, or the scripted "draw your weapon" strike every single time.
 * Arming here is what lets a level that opens holstered (SpaceZ HQ's
 * `openingStrike`) skip that beat cleanly — its thought is marked seen, so
 * `stepOpeningStrike` never fires to arm him, and he would stand defenceless
 * otherwise. A harmless no-op on a run already in play (a resumed or
 * checkpointed state).
 */
export function skipStoryOpening(state: GameState): void {
  if (state.phase === "cutscene") skipCutscene(state);
  dismissIntro(state);
  state.player.disarmed = false;
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
