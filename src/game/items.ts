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
import { clamp, distance } from "@game/lib/vec.ts";
import {
  ACCURACY,
  ARMOR,
  CONSUMABLES,
  DODGE,
  GATES,
  LOOT,
  MEDKIT,
  MELEE,
  MERCY,
  PLAYER,
  QUALITY,
  STAMINA,
  STATS,
  UNIQUE,
  WEAPON,
} from "./config.ts";
import { companionDef } from "./defs/companions.ts";
import { cutsceneDef } from "./defs/cutscenes.ts";
import {
  affixNaming,
  AFFIX_POOLS,
  equipmentDropWeight,
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
  weaponMeleeRealizedTargets,
  type AffixBracket,
  type AffixDef,
  equipmentBaseName,
} from "./defs/equipment.ts";
import { gradeVariantIds } from "./defs/grades.ts";
import { difficultyDef, meetsMinDifficulty } from "./defs/difficulties.ts";
import type { EnemyRole } from "./defs/enemies/index.ts";
import { gateKeyIds, levelDef } from "./defs/levels/index.ts";
import { storyItemDef } from "./defs/story.ts";
import { activeUniqueDefs, uniqueDef, type UniqueDef } from "./defs/uniques.ts";
import { bonusBudget } from "./item-budget.ts";
import { baseStatBonus, diminishStat } from "./leveling.ts";
import { currentMobLevel } from "./menace.ts";
import { advanceCutsceneChain } from "./story.ts";
import { BALANCE } from "./tuning.ts";
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
  // A hand-authored unique carries its own fixed name — no base/affix compose.
  if (equipment.name) return equipment.name;
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
 * Roll one affix from its ilvl-gated BRACKET ladder (see `AffixBracket` in
 * defs/equipment.ts): the roll usually lands in the highest generation the
 * item level has unlocked and sometimes one below it (3:1), so a deeper drop
 * rolls bigger — but inside authored bands, never the old unbounded
 * `ilvl × perIlvl` line. Stat and hp affixes round to whole points and never
 * fall below 1, so even an ilvl-1 magic find pays something.
 */
function rollAffix(rng: Rng, def: AffixDef, ilvl: number): Affix {
  const unlocked = def.brackets.filter((b) => b.minIlvl <= Math.max(1, ilvl));
  // The first bracket unlocks at 1, so `unlocked` is never empty; the top
  // generation rolls three times as often as the one under it.
  const top = unlocked[unlocked.length - 1] as AffixBracket;
  const under = unlocked[unlocked.length - 2];
  const bracket = under && rng() < 0.25 ? under : top;
  const value = randomRange(rng, bracket.min, bracket.max);
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
/**
 * MAGIC FIND (D2's MF) — reuses LUCK and the companion `magicFind` aura rather
 * than a dedicated stat: LUCK pays `STATS.tierChancePerLuck` per effective
 * point, the aura adds its flat share. Fed through the per-tier SATURATION
 * curve in `rollTier`, so the top tiers see diminishing returns as it stacks.
 */
export function magicFind(state: GameState): number {
  return (
    effectiveStat(state, "luck") * STATS.tierChancePerLuck +
    magicFindBonus(state)
  );
}

/**
 * The MF multiplier on a tier's chance: MAGIC is LINEAR (uncapped in MF); rare
 * and up SATURATE toward `LOOT.mfSaturation[tier]` via `1 + cap·mf/(cap+mf)`,
 * so stacking LUCK/aura is strong early and gives diminishing returns on the
 * best drops — the D2 rule that MF can't make legendaries common.
 */
function magicFindFactor(
  tier: Exclude<Tier, "regular" | "trash">,
  mf: number,
): number {
  if (mf <= 0) return 1;
  const cap = (LOOT.mfSaturation as Partial<Record<Tier, number>>)[tier];
  if (cap === undefined) return 1 + mf; // magic: linear
  return 1 + (cap * mf) / (cap + mf); // rare/unique/legendary: saturating
}

/**
 * STAGE 2 — the D2 RARITY ROLL. Best tier first, each gated by its
 * `tierUnlockMlvl` (its qlvl). A tier's chance is `rarityBase` at the gate plus
 * `raritySlope` per level of DEPTH over it (a higher-`lootLevel` kill rolls
 * rarer tiers more often — D2's `ilvl−qlvl` term), plus the difficulty's
 * `tierChanceBonus`, the per-kill `tierBonus`, and the elite/boss set-piece
 * bonus on the rarest tiers — the whole thing scaled by MAGIC FIND (per-tier
 * diminishing returns) and the developer gear-quality knob. Clamped so magic
 * still leaves whites for the make-quality roll.
 */
function rollTier(
  state: GameState,
  lootLevel: number,
  tierBonus: number,
  role: EnemyRole = "minion",
): Tier {
  const difficultyChances = difficultyDef(state.difficulty).tierChanceBonus;
  const mf = magicFind(state);
  // The EXPLICIT set-piece boost on named tiers for elite/boss kills.
  const roleBonus: Partial<Record<Tier, number>> | undefined =
    role === "boss"
      ? LOOT.bossRarityBonus
      : role === "elite"
        ? LOOT.eliteRarityBonus
        : undefined;
  // The NAMED tiers (unique/legendary/artifact) are the hand-authored CHASE —
  // their odds are their own rarityBase + slope + the elite/boss set-piece
  // bonus ALONE. The generic per-kill `tierBonus` (the mob-level sweetener,
  // the all-clear trophy, a mob's dropProfile) lifts the ROLLED tiers
  // (magic/rare) — but it must NOT rain named items (it once made a JESUS
  // farm drop ~9 uniques and ~4 legendaries a run; see scripts/drop-rate.mjs).
  // The item's own level requirement gates WHERE each drops (a req-99 artifact
  // only off a level-99 mob = JESUS). LEGENDARY/ARTIFACT additionally drop
  // from HARD up only — the top chase is a hard-earned reward.
  const hardPlus = meetsMinDifficulty(state.difficulty, "hard");
  // The ARTIFACT tier stays INERT while no artifact is authored — no phantom
  // roll consumes rng, so seeded drop streams don't shift until the roster
  // ships. (`pickUniqueForDrop` would downgrade an empty artifact roll to a
  // rare anyway; this just skips the wasted draw.)
  const hasArtifacts =
    lootLevel >= LOOT.tierUnlockMlvl.artifact &&
    activeUniqueDefs().some((u) => u.tier === "artifact");
  // The FARM-VENUE sweetener (the bunker's 2×): a level that farms named items
  // richer, applied to the CHASE tiers' chance here and to the world-drop
  // channel in `maybeDropWorldUnique`, so both scale together.
  const namedMult = levelDef(state.level.id).loot.namedDropMult ?? 1;
  // TIER_ROLL_ORDER never contains "regular" (the fall-through) or "trash"
  // (scripted mints only), so the rarity config maps index safely.
  for (const tier of TIER_ROLL_ORDER) {
    const qlvl = LOOT.tierUnlockMlvl[tier];
    if (lootLevel < qlvl) continue; // hard gate, unchanged
    if (tier === "artifact" && !hasArtifacts) continue;
    const named =
      tier === "unique" || tier === "legendary" || tier === "artifact";
    const topChase = tier === "legendary" || tier === "artifact";
    if (topChase && !hardPlus) continue; // legendary/artifact: HARD and up
    const base =
      (LOOT.rarityBase[tier] +
        LOOT.raritySlope[tier] * (lootLevel - qlvl) +
        (difficultyChances[tier] ?? 0) +
        (roleBonus?.[tier] ?? 0)) *
        (named ? namedMult : 1) +
      (named ? 0 : tierBonus);
    if (base <= 0) continue;
    const chance = Math.min(
      LOOT.rarityChanceMax,
      base * magicFindFactor(tier, mf) * BALANCE.gearQuality,
    );
    if (state.rng() < chance) return tier;
  }
  return "regular";
}

/**
 * The D2 unique/set SELECTION step: once a rarity roll lands unique/legendary,
 * choose WHICH named item — among those whose slot matches the dropped base and
 * whose base is reachable (`levelReq ≤ lootLevel`) — weighted by each item's
 * `rarity` (default `UNIQUE.defaultRarity`). Returns the id, or null when
 * nothing is eligible (the caller downgrades to a rare so the drop is never
 * dead). Reads the ACTIVE catalog, so a fixture-swapped test sees only its own.
 */
function pickUniqueForDrop(
  state: GameState,
  slot: EquipSlot,
  tier: "unique" | "legendary" | "artifact",
  lootLevel: number,
): string | null {
  // The named-drop level FLOOR (D2 area-level flooring): as the hero levels,
  // the eligible band slides up, so a cap-level farm stops dropping the
  // campaign's low-ilvl relics ("level-60 crap" at level 99) and pays out
  // only near-level gear. The equip CEILING (base levelReq ≤ lootLevel) still
  // holds on top; a slot with nothing in the band downgrades to a rare.
  const ilvlFloor = lootLevel - LOOT.namedIlvlWindow;
  const eligible = activeUniqueDefs()
    .filter(
      (u) =>
        (u.tier ?? "unique") === tier &&
        u.slot === slot &&
        u.ilvl >= ilvlFloor &&
        // Skip a unique whose base isn't in the ACTIVE catalog — a fixture
        // swap can leave the shipped unique catalog pointing at bases that no
        // longer resolve; `equipmentLevelReq` would throw on them.
        (isWeaponDef(u.base) || isGearDef(u.base)) &&
        equipmentLevelReq(u.base) <= lootLevel,
    )
    .map((u) => ({ id: u.id, weight: uniqueDropWeight(u, tier) }));
  if (eligible.length === 0) return null;
  return pickWeighted(state.rng, eligible).id;
}

/**
 * A named item's selection weight once the rarity roll lands its tier+slot.
 * UNIQUES keep the flat authored/default weight. LEGENDARIES obey "stats
 * determine rarity" as a POWER LAW: past the reference budget the weight is
 * scaled by `(rarityBudgetRef / bonusBudget)^rarityBudgetExp` (the budget is
 * the priced ilvl worth of the fixed bonuses — see item-budget.ts). The
 * roster is authored across a VAST power range, so this is what makes the
 * god-rolls astronomically rare — twice the reference budget is ~16× rarer,
 * five times ~600× — while a modest legendary drops at its authored weight.
 * An explicit `rarity` still multiplies on top.
 */
export function uniqueDropWeight(
  u: UniqueDef,
  tier: "unique" | "legendary" | "artifact",
): number {
  const base = u.rarity ?? UNIQUE.defaultRarity;
  // The power law spreads WITHIN a chase tier (legendary or artifact): the
  // stronger the piece, the rarer. Plain uniques keep their flat weight.
  if (tier !== "legendary" && tier !== "artifact") return base;
  const budget = bonusBudget(u.bonuses);
  if (budget <= UNIQUE.rarityBudgetRef) return base;
  return (
    base * Math.pow(UNIQUE.rarityBudgetRef / budget, UNIQUE.rarityBudgetExp)
  );
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
    tier === "rare" ||
    tier === "unique" ||
    tier === "legendary" ||
    tier === "artifact"
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
    /** The killer's ROLE — elites/bosses get the set-piece rarity bonus on
     * unique/legendary (see `rollTier`) and are eligible to fold a named
     * unique into the drop. Omitted = minion (no bonus). */
    role?: EnemyRole;
  } = {},
): Equipment {
  const rng = state.rng;
  const mlvl = opts.mlvl ?? currentMobLevel(state);
  // LOOT LEVEL — what the loot GATES key off: the eligible base pool
  // (`levelReq`), the tier unlocks, the dropped item's own level, and the
  // make-quality roll. It strips the difficulty's MOB-LEVEL OFFSET back out of
  // the monster level, so the gates track the hero's EARNED level rather than
  // how far a rung shoves its horde up or down. The upshot the design wants:
  // EASY (offset -3) drops loot sized to the hero, so its finds run RICHER
  // relative to its weakened mobs than a hard rung's do (whose tougher mobs no
  // longer buy earlier tiers). Combat scaling (mob hp/xp) still rides the real
  // mlvl; only these loot gates strip the offset. A def's own `levelBonus`
  // (elites/bosses run hot) survives — only the per-difficulty offset is
  // removed. The explicit per-rung rewards (`tierChanceBonus`, `lootIlvlBonus`)
  // still pay the harder rungs more in ABSOLUTE terms; this removes only the
  // implicit mlvl edge, not those.
  const lootLevel = Math.max(
    1,
    mlvl - difficultyDef(state.difficulty).mobLevelOffset,
  );
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
  let pool = fullPool.filter((id) => equipmentLevelReq(id) <= lootLevel);
  if (pool.length === 0 && fullPool.length > 0) {
    const minReq = Math.min(...fullPool.map((id) => equipmentLevelReq(id)));
    pool = fullPool.filter((id) => equipmentLevelReq(id) === minReq);
  }
  // The BASE-LEVEL FLOOR (config `LOOT.dropLevelWindow`): retire bases far under
  // the mob so a high kill drops a high-tier base, not a weak one with affixes.
  // Only applied when the band has entries — otherwise the whole eligible pool
  // stands (early game, or a pool whose bases all sit below the window).
  const floored = pool.filter(
    (id) => equipmentLevelReq(id) >= lootLevel - LOOT.dropLevelWindow,
  );
  if (floored.length > 0) pool = floored;
  // STAGE 1 — the TREASURECLASS pick: weight the eligible pool by each base's
  // `dropWeight` (D2's `Prob`) instead of a flat uniform draw. Default weights
  // are all 1, so an un-authored pool behaves exactly like the old uniform
  // pick; only a base that sets `dropWeight` shifts the odds. Consumes one rng
  // draw either way. (Stage-1 NoDrop — whether anything drops at all — is the
  // `LOOT.dropChance` gate upstream in `dropMinionLoot`.)
  let defId =
    opts.defId ??
    pickWeighted(
      rng,
      pool.map((id) => ({ id, weight: equipmentDropWeight(id) })),
    ).id;
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

  let tier =
    opts.tier ?? rollTier(state, lootLevel, opts.tierBonus ?? 0, opts.role);
  // STAGE 3 — the D2 FOLD: a NATURALLY-rolled unique/legendary becomes a NAMED
  // item, chosen among those eligible for this slot by its per-item `rarity`
  // weight (`pickUniqueForDrop`). Only when the tier was ROLLED (not a
  // scripted/forced tier) and no specific base was requested — scripted mints
  // keep their exact shape. Falls back to a rolled RARE when nothing is
  // eligible, so the drop is never dead.
  if (
    opts.tier === undefined &&
    opts.defId === undefined &&
    (tier === "unique" || tier === "legendary" || tier === "artifact")
  ) {
    const namedId = pickUniqueForDrop(state, slot, tier, lootLevel);
    if (namedId) return mintUnique(state, namedId);
    tier = "rare";
  }
  const ilvl = rollItemLevel(state, lootLevel, tier);
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
    (gradeable && tier === "regular" ? rollQuality(rng, lootLevel) : "normal");
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
  if (
    family === "weapon" &&
    tier !== "unique" &&
    tier !== "legendary" &&
    tier !== "artifact"
  ) {
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
      if (
        tier !== "unique" &&
        tier !== "legendary" &&
        tier !== "artifact" &&
        def.durability
      ) {
        rolled.durability = Math.max(1, Math.round(def.durability * qMult));
      }
    }
  }
  return rolled;
}

/**
 * Mint a hand-authored UNIQUE (`defs/uniques.ts`) as a live item instance: its
 * base type, static ilvl, fixed name and bonuses, plus a per-drop ±band roll on
 * the base damage (weapons) / armor (config `UNIQUE.baseRollBand`) so two copies
 * differ — the fixed bonuses stay identical, so a better-rolled copy is worth
 * chasing. Minted unbreakable (no durability), like every unique/legendary find,
 * so it also keeps its FULL catalog damage (the looted-weapon damper is skipped,
 * as for the sidearm). The frozen `def` snapshot version-proofs it, exactly like
 * a rolled drop.
 */
export function mintUnique(state: GameState, uniqueId: string): Equipment {
  const u = uniqueDef(uniqueId);
  const weapon = isWeaponDef(u.base);
  const baseDef = weapon ? weaponDef(u.base) : gearDef(u.base);
  // ±band around the base value; the fixed bonuses are untouched — except
  // that SCALING percentages (`statPct`/`maxHpPct`) clamp to the engine's
  // hard ceiling (UNIQUE.scalingPctCap): they multiply the hero's own grown
  // total, so no catalog entry may pay more than the cap, whatever it says.
  // `damagePct` (a weapon's flat +X% damage) and armor are exempt by design.
  const roll = 1 + (state.rng() * 2 - 1) * UNIQUE.baseRollBand;
  const item: Equipment = {
    id: state.nextId++,
    defId: u.base,
    slot: u.slot,
    tier: u.tier ?? "unique",
    ilvl: u.ilvl,
    affixes: u.bonuses.map((bonus) =>
      bonus.kind === "statPct" || bonus.kind === "maxHpPct"
        ? { ...bonus, value: Math.min(bonus.value, UNIQUE.scalingPctCap) }
        : { ...bonus },
    ),
    name: u.name,
    // The catalog id behind the display name — the stable identity anything
    // booking "which unique is this" keys on (see Equipment.uniqueId).
    uniqueId: u.id,
    // The roll rides the instance for weapons (read in `weaponDamageFor`);
    // for armor it is baked straight into the stamped `armor` below.
    baseRoll: weapon ? roll : undefined,
    def: structuredClone(baseDef),
  };
  if (!weapon) {
    const gear = gearDef(u.base);
    // A unique's armor is its base value rolled ±band — its POWER lives in the
    // fixed bonuses, not in ilvl-scaled base stats (uniques don't grow with
    // ilvl the way rolled pieces do). Normal make, so no quality multiplier.
    if (gear.armor !== undefined) item.armor = Math.round(gear.armor * roll);
    // A bag unique overrides its base's capacity — the extra room is the point.
    // Stamped onto the frozen def, which `equippedBagSlots` reads first.
    if (u.bagSlots !== undefined && item.def) {
      (item.def as { bagSlots?: number }).bagSlots = u.bagSlots;
    }
  }
  return item;
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
 * Every affix currently APPLYING from the worn loadout, flattened — the read
 * the granted-spell/proc/sure-strike systems (spells.ts, `playerMissChance`)
 * share, so a broken armor piece silences its forever spell exactly as it
 * silences its stats.
 */
export function activeEquippedAffixes(state: GameState): Affix[] {
  const affixes: Affix[] = [];
  for (const piece of activePieces(state)) affixes.push(...piece.affixes);
  return affixes;
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
 * trinket carried (bag or worn). The flat total then runs through the
 * DIMINISHING-RETURNS curve (`diminishStat`): linear to the soft cap,
 * flattening past it, so a grown hero's stat pile saturates instead of
 * compounding forever (the horde's compensation rides the same curve — see
 * `autoPowerScale`).
 */
export function effectiveStat(state: GameState, stat: StatName): number {
  let value =
    state.player.stats[stat] + baseStatBonus(state.player.level, stat);
  // Scaling `statPct` bonuses (uniques) multiply the whole total, so they grow
  // with the hero — a +2% STRENGTH is worth more the stronger you are.
  let pct = 0;
  for (const piece of activePieces(state)) {
    for (const affix of piece.affixes) {
      if (affix.kind === "stat" && affix.stat === stat) value += affix.value;
      else if (affix.kind === "statPct" && affix.stat === stat)
        pct += affix.value;
    }
  }
  value += passiveStatBonus(state, stat);
  return Math.round(diminishStat(value) * (1 + pct));
}

/** Max hp from the base pool + the STAMINA stat + gear bonuses and affixes.
 * STAMINA now feeds BOTH the sprint pool (see `computeMaxStamina`) and the
 * health bar — a hardy sprinter is a sturdier hero. */
export function computeMaxHp(state: GameState): number {
  let max = PLAYER.maxHp + effectiveStat(state, "stamina") * STAMINA.hpPerPoint;
  let pct = 0;
  for (const piece of activePieces(state)) {
    if (!isWeaponDef(piece.defId)) {
      max += gearDef(piece.defId).bonuses.maxHp ?? 0;
    }
    for (const affix of piece.affixes) {
      if (affix.kind === "maxHp") max += affix.value;
      // Scaling `maxHpPct` (uniques) grows with the hero's whole health pool.
      else if (affix.kind === "maxHpPct") pct += affix.value;
    }
  }
  return Math.round(max * (1 + pct));
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

/** Clamp a medkit item's `tier` field into a valid `MEDKIT.tiers` index —
 * untiered kits (minted before tiers shipped) read as the lightest. */
export function medkitTierIndex(tier: number | undefined): number {
  return Math.max(0, Math.min(tier ?? 0, MEDKIT.tiers.length - 1));
}

/**
 * Bank a medkit of the given tier into the consumable dock. Returns false —
 * so the caller leaves it on the ground — when that quality's stack is
 * already full (`CONSUMABLES.stackCap`). Medkits stack only within their own
 * quality, so a full LIGHT stack never blocks banking a SUPERIOR kit.
 */
export function bankMedkit(
  state: GameState,
  tier: number | undefined,
): boolean {
  const index = medkitTierIndex(tier);
  const medkits = state.player.medkits;
  if ((medkits[index] ?? 0) >= CONSUMABLES.stackCap) return false;
  medkits[index] = (medkits[index] ?? 0) + 1;
  return true;
}

/**
 * Bank a stamina potion into the consumable dock. False (leave it grounded)
 * when the stack is already full.
 */
export function bankStaminaPotion(state: GameState): boolean {
  if (state.player.staminaPotions >= CONSUMABLES.stackCap) return false;
  state.player.staminaPotions += 1;
  return true;
}

/** The highest medkit quality the player is holding (index into
 * `MEDKIT.tiers`), or -1 when the medkit stacks are all empty. This is the
 * kit `consumeMedkit` spends and the one the HUD's medkit slot shows. */
export function bestMedkitTier(state: GameState): number {
  const medkits = state.player.medkits;
  for (let i = medkits.length - 1; i >= 0; i--) {
    if ((medkits[i] ?? 0) > 0) return i;
  }
  return -1;
}

/**
 * Spend one stacked medkit, biggest heal first, to top up the hero's hp.
 * A no-op — returns false, nothing consumed — when no medkit is held or the
 * hero is already at full hp (so a mistap never wastes a kit). Emits
 * `medkitUsed` with the quality name and the hp actually restored.
 */
export function consumeMedkit(state: GameState): boolean {
  const player = state.player;
  if (player.hp >= player.maxHp) return false;
  const tierIndex = bestMedkitTier(state);
  if (tierIndex < 0) return false;
  const tier = MEDKIT.tiers[tierIndex] ?? MEDKIT.tiers[0];
  const before = player.hp;
  // Percentage-of-max heal (config MEDKIT.tiers) — floored at 1 so a kit is
  // never a no-op, then capped at full below.
  const heal = Math.max(1, Math.round(player.maxHp * tier.healPct));
  player.hp = Math.min(player.maxHp, player.hp + heal);
  player.medkits[tierIndex] = (player.medkits[tierIndex] ?? 0) - 1;
  state.events.push({
    type: "medkitUsed",
    tier: tierIndex,
    name: tier.name,
    heal: player.hp - before,
  });
  return true;
}

/**
 * Spend one stacked stamina potion to refill the sprint pool. A no-op —
 * returns false, nothing consumed — with none held or the pool already full
 * (`restoreStamina`), so a mistap keeps the potion. Emits `staminaPotionUsed`.
 */
export function consumeStaminaPotion(state: GameState): boolean {
  if (state.player.staminaPotions <= 0) return false;
  if (!restoreStamina(state)) return false;
  state.player.staminaPotions -= 1;
  state.events.push({ type: "staminaPotionUsed" });
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
  // SURE STRIKE (a legendary affix): the weapon simply never whiffs on its
  // own — the innate miss reads zero, floor and difficulty notwithstanding.
  // The foe's DODGE is still its own move (see `enemyDodgeChance`).
  if (activeEquippedAffixes(state).some((a) => a.kind === "sureStrike")) {
    return 0;
  }
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
  // The developer drop-rate knob scales the whole per-kill chance — base,
  // difficulty bonus, and LUCK alike — so the rain thickens uniformly.
  return (
    (LOOT.dropChance +
      difficultyDef(state.difficulty).dropChanceBonus +
      effectiveStat(state, "luck") * STATS.dropChancePerLuck) *
    BALANCE.dropRate
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
  // a PERFECT one over its catalog weight (config QUALITY.mults). Routed
  // here — the one source of stat-scaled damage — so combat, auto-equip
  // scoring, and every DPS readout agree on what craftsmanship is worth.
  // A UNIQUE weapon's per-drop ±band on the base damage (see `Equipment.baseRoll`).
  // The developer damage knob scales the final figure, so combat, auto-equip
  // scoring, and every DPS readout move together (rankings are unchanged —
  // it's one factor on all of them).
  return (
    def.damage *
    multiplier *
    ilvlMult *
    lootMult *
    qualityMult(weapon) *
    (weapon.baseRoll ?? 1) *
    BALANCE.playerDamage
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
  // AoE is only worth what's realistically REALIZED, never its theoretical
  // ceiling — otherwise a spread weapon whose per-target damage is a quarter of
  // a single-target's (budget ÷ 4, by design) reads as an even trade and
  // auto-equip swaps away a reliable weapon for one that's horrible against any
  // lone tough foe. Two kinds of AoE, both realized BELOW the budget count:
  //   • Melee: a sweep reliably strikes everything in its arc in the close
  //     press of the horde, but crediting the full budget assumption (cone 4,
  //     full 5) let a light cone cleaver out-rank a heavier single-target
  //     weapon it loses to against a lone foe — so it counts at the damped
  //     `WEAPON.meleeAoeRealized` (cone 2.5, full 3.5), still capped by the
  //     number INTELLIGENCE can cleave (maxMeleeTargets).
  //   • Ranged: pellets/pierce/chain are CONDITIONAL — a shotgun's spread fans
  //     wide and, in the common sparse field, overlaps on one foe rather than
  //     splitting across four. Credit only a fraction of that potential beyond
  //     the first sure hit (WEAPON.aoeRealization), so a spread weapon must
  //     genuinely out-budget the held one to win its slot, not merely tie it.
  const assumed = weaponAssumedTargets(def);
  const targets = def.projectile
    ? 1 + (assumed - 1) * WEAPON.aoeRealization
    : Math.min(weaponMeleeRealizedTargets(def), maxMeleeTargets(state));
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
    else if (affix.kind === "damagePct") score += affix.value * 100;
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
 * Can the hero WEAR this piece yet? The Diablo level gate keys on the BASE
 * item's `levelReq` for EVERY tier — strip an item's rolled/authored bonuses
 * and what's left is the base, so a magic, rare, unique, or legendary piece
 * equips at the same level a plain one on that base would. A unique's high
 * ilvl scales its power, not its requirement, so it is often wearable many
 * levels before its ilvl — a find to grab early. Auto-equip skips a piece the
 * hero can't wear, the bag refuses to equip it, and the UI paints the
 * requirement red until the hero grows into it.
 */
export function meetsLevelReq(state: GameState, equipment: Equipment): boolean {
  return state.player.level >= equipmentLevelReq(equipment.defId);
}

// Player setting (website settings `autoEquip`, applied via the
// `setAutoEquipEnabled` setter): whether a picked-up piece that out-scores the
// worn one is EQUIPPED ON THE SPOT (on) or banked to the bag for the player to
// equip by hand (off). It gates the pickup path in step.ts only — the manual
// AUTO-EQUIP sweep (autoEquipBest), the on-break weapon swap (a broken weapon
// still needs a replacement), and the pure ranking predicates below are all
// unaffected, so a player who turns auto-equip off keeps every manual escape
// hatch. The engine default is on (the standalone/test baseline when no app
// configures it); the shipped app applies the persisted choice on load. Tests
// that toggle it must restore it.
let autoEquipOnPickup = true;

/** Toggle whether picked-up upgrades are worn on the spot (a player setting).
 * Off banks them to the bag instead; the manual AUTO-EQUIP button and the
 * on-break weapon swap still work. */
export function setAutoEquipEnabled(enabled: boolean): void {
  autoEquipOnPickup = enabled;
}

/** Whether the on-pickup auto-equip is active (see `setAutoEquipEnabled`). The
 * pickup path in step.ts reads this to decide equip-on-spot vs bag-it. */
export function isAutoEquipEnabled(): boolean {
  return autoEquipOnPickup;
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
  // Prefer the FROZEN def so a unique bag's overridden capacity (mintUnique)
  // stands; fall back to the live catalog for rolled/legacy bags.
  const frozen = bag.def;
  const slots =
    frozen && "bagSlots" in frozen
      ? frozen.bagSlots
      : gearDef(bag.defId).bagSlots;
  return slots ?? 0;
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
 * Would an equipment drop find a home the instant it reached the hero — worn
 * on the spot as a genuine upgrade, or slotted into a free bag cell? A
 * side-effect-free mirror of the equipment branch of `stepItems`' pickup, so
 * the item magnet can leave gear it couldn't keep where it lies instead of
 * dragging it uselessly to the hero's feet on a full bag.
 */
export function canCollectEquipment(
  state: GameState,
  item: Equipment,
): boolean {
  if (isAutoEquipEnabled() && isBetterEquipment(state, item)) return true;
  return state.player.inventory.indexOf(null) !== -1;
}

/**
 * The travel gate this bag piece would tear open HERE — the USE-affordance
 * probe the inventory card asks per item. Non-null only when the running
 * level ships a latent gate (`LevelDef.gates`) whose `opensWith` names this
 * piece's def and that gate isn't already standing. Everywhere else the
 * piece is inert — which is the whole cow-level joke.
 */
export function gateKeyTarget(
  state: GameState,
  item: Equipment,
): { id: string; to: string } | null {
  const gate = (levelDef(state.level.id).gates ?? []).find(
    (g) => g.opensWith === item.defId,
  );
  if (!gate || state.gates.some((g) => g.id === gate.id)) return null;
  return { id: gate.id, to: gate.to };
}

/**
 * USE a gate-key trinket from bag cell `index` (the cow-level ritual):
 * consumes the piece and tears its gate open a step ahead of the hero — a
 * GateState for the crossing logic, a landmark so the renderer draws it with
 * zero edits, and a `gateOpened` event for the app's rupture cue. Returns
 * false (and consumes nothing) when the cell holds no key for this level or
 * the gate already stands.
 */
export function spendGateKey(state: GameState, index: number): boolean {
  const item = state.player.inventory[index] ?? null;
  if (!item) return false;
  const gate = gateKeyTarget(state, item);
  if (!gate) return false;
  const def = levelDef(state.level.id);
  const gateDef = (def.gates ?? []).find((g) => g.id === gate.id);
  if (!gateDef) return false;
  state.player.inventory[index] = null;
  const pos = {
    x: clamp(state.player.pos.x + GATES.summonDistance, 24, def.width - 24),
    y: clamp(state.player.pos.y, 24, def.height - 24),
  };
  state.gates.push({ id: gate.id, to: gate.to, pos, entered: false });
  state.landmarks.push({
    kind: gateDef.id,
    sprite: gateDef.sprite ?? gateDef.id,
    anchor: "base",
    pos: { ...pos },
  });
  state.events.push({ type: "gateOpened", pos: { ...pos }, to: gate.to });
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
 * so a plain stat comparison misses its worth), a top-tier find (unique or
 * legendary — the rarest drops, kept as trophies and for their fat affix
 * rolls), or a travel-gate key (a zero-stat trinket whose worth is the door
 * it opens — see LevelDef.gates). Everything else is ordinary loot the sweep
 * may cull.
 */
export function isSpecialItem(item: Equipment): boolean {
  if (item.tier === "unique" || item.tier === "legendary") return true;
  if (gateKeyIds().includes(item.defId)) return true;
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
  // Tally the player's own pick so the chooser can show it apart from the
  // head-start/auto-growth/gear baked into the effective stat.
  player.spentStats[stat]++;
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
    // The whole refunded pool (head-start included) is re-placed from
    // scratch, so the player's spent tally restarts at zero and grows back as
    // they re-allocate — the chooser tracks this respec's own picks.
    player.spentStats[stat] = 0;
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
  player.spentStats[stat] = Math.max(0, player.spentStats[stat] - 1);
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
 * The player's tap through a level's post-victory EPILOGUE (`LevelDef.outro`
 * — the intro's black-screen mirror, entered when the victory countdown runs
 * out): turn the page. Past the last page the story is told — on to the
 * victory splash.
 */
export function advanceOutro(state: GameState): void {
  if (state.phase !== "outro") return;
  const pages = levelDef(state.level.id).outro ?? [];
  state.outroPage++;
  if (state.outroPage >= pages.length) {
    state.outroPage = pages.length;
    state.phase = "victory";
  }
}

/** The outro's SKIP button: cut the epilogue short, straight to the splash. */
export function skipOutro(state: GameState): void {
  if (state.phase === "outro") state.phase = "victory";
}

/**
 * The player's tap during the prelude: cut the running beat short (snap a
 * walk to its mark, dismiss a line early). One tap, one beat. Tapping the
 * last beat rolls the chain forward — the next queued scene, or the intro.
 */
export function tapCutscene(state: GameState): void {
  if (state.phase !== "cutscene" || !state.cutscene) return;
  advanceCutsceneBeat(state.cutscene, cutsceneDef(state.cutscene.defId));
  if (state.cutscene.done) advanceCutsceneChain(state);
}

/**
 * The prelude's SKIP button: end the opening outright — the running scene
 * AND every scene still queued behind it. Skipping the prelude also skips
 * the hero's level-intro monologue that would follow — one press bails the
 * whole opening, landing on the level-name `title` card just before the
 * drop.
 */
export function skipCutscene(state: GameState): void {
  if (state.phase !== "cutscene") return;
  if (state.cutscene) {
    finishCutscene(state.cutscene, cutsceneDef(state.cutscene.defId));
  }
  state.cutscene = null;
  state.cutsceneQueue = [];
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

/**
 * Can the bag open right now? Mid-run always — and during an elite/boss
 * ARRIVAL scene (a `dialogue` with an `enemy` source): the stare-down is
 * exactly when the player wants to size up the speaker and equip a fitting
 * weapon, so the scene lends the bag the stage and takes it back on close.
 * Every other scene (last words, inner thoughts, lore, greetings, joins)
 * stays read-only.
 */
export function canOpenInventory(state: GameState): boolean {
  return (
    state.phase === "playing" ||
    (state.phase === "dialogue" && state.dialogue?.source.kind === "enemy")
  );
}

/** Pause into the bag — mid-run, or from an elite/boss arrival scene. */
export function openInventory(state: GameState): void {
  if (canOpenInventory(state)) state.phase = "inventory";
}

/** Close the bag and resume: the arrival scene it interrupted takes the
 * stage back if one is still up, else play (pending level-ups take
 * priority — a scene's own pending level-up lands when IT ends). */
export function closeInventory(state: GameState): void {
  if (state.phase !== "inventory") return;
  if (state.dialogue !== null) {
    state.phase = "dialogue";
    return;
  }
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
