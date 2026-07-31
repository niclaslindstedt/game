// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Loot rolling and minting: the whole Diablo drop pipeline (treasure-class
// base pick, rarity roll, magic find, affix rolls, item level), the named
// unique/legendary fold, hand-minted uniques, and the adoption of persisted
// instances onto frozen defs.

import type { Rng } from "@game/lib/rng.ts";
import { randomRange } from "@game/lib/rng.ts";
import {
  ARMOR,
  ARMOR_TYPES,
  LEVELING,
  LOOT,
  STATS,
  UNIQUE,
} from "../config/index.ts";
import { companionAuraMagicFind } from "../companion-stats.ts";
import { companionDef } from "../defs/companions.ts";
import {
  AFFIX_POOLS,
  equipmentDropWeight,
  equipmentLevelReq,
  gearDef,
  isGearDef,
  isWeaponDef,
  STAT_NAMES,
  TIER_ROLL_ORDER,
  TIERS,
  weaponDef,
  type AffixBracket,
  type AffixDef,
} from "../defs/equipment.ts";
import { difficultyDef, meetsMinDifficulty } from "../defs/difficulties.ts";
import type { EnemyRole } from "../defs/enemies/index.ts";
import { gradeVariantIds } from "../defs/grades.ts";
import { runLevelDef } from "../defs/levels/index.ts";
import {
  activeUniqueDefs,
  uniqueDef,
  type UniqueDef,
} from "../defs/uniques.ts";
import { bonusBudget } from "../item-budget.ts";
import { currentMobLevel } from "../menace.ts";
import { BALANCE } from "../tuning.ts";
import type {
  Affix,
  Equipment,
  GameState,
  ItemSlot,
  Quality,
  StatName,
  Tier,
} from "../types/index.ts";
import { effectiveStat } from "./derived.ts";
import { armorTypeOf } from "./durability.ts";
import { lowHealthDesperation, mercyRescueWaiting } from "./mercy.ts";
import { pickWeighted, rollQuality, rollQualityMult } from "./quality.ts";

/**
 * Roll one affix from its ilvl-gated BRACKET ladder (see `AffixBracket` in
 * defs/equipment.ts): the roll usually lands in the highest generation the
 * item level has unlocked and sometimes one below it (3:1), so a deeper drop
 * rolls bigger — but inside authored bands, never the old unbounded
 * `ilvl × perIlvl` line. Stat and hp affixes round to whole points and never
 * fall below 1, so even an ilvl-1 magic find pays something.
 */
function rollAffix(
  rng: Rng,
  def: AffixDef,
  ilvl: number,
  statWeights?: Record<StatName, number>,
): Affix {
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
        // Which stat the bonus grants: an even draw across all six by default,
        // but a piece of armor BIASES the pick toward its material's lane (a
        // cloth robe leans INTELLIGENCE, leather DEXTERITY, mail/plate
        // STRENGTH — config `ARMOR_TYPES[…].statWeights`). One rng draw either
        // way, so the seeded loot sequence is unshifted; only which stat lands.
        stat: pickStat(rng, statWeights),
      };
  }
}

/** Pick the stat a `+stat` affix grants: an even draw across all six
 * (`STAT_NAMES`) when no weights are given, else a weighted pick that leans the
 * roll toward the armor material's lane (config `ARMOR_TYPES[…].statWeights`).
 * Consumes exactly ONE rng draw in both cases, so biasing a stat never shifts
 * the seeded loot stream — it only changes which stat comes up. */
function pickStat(rng: Rng, weights?: Record<StatName, number>): StatName {
  if (!weights) {
    return STAT_NAMES[Math.floor(rng() * STAT_NAMES.length)] as StatName;
  }
  const total = STAT_NAMES.reduce((sum, stat) => sum + weights[stat], 0);
  if (total <= 0) {
    return STAT_NAMES[Math.floor(rng() * STAT_NAMES.length)] as StatName;
  }
  let roll = rng() * total;
  for (const stat of STAT_NAMES) {
    roll -= weights[stat];
    if (roll <= 0) return stat;
  }
  return STAT_NAMES[STAT_NAMES.length - 1] as StatName;
}

/**
 * The party's MAGIC FIND: the summed effective aura of every companion on its
 * feet (a downed companion's aura is silent until it stands back up). A LUCKY
 * companion's aura SWELLS as he ranks up (`companionAuraMagicFind` folds in
 * `power.magicFindPerRank`). Multiplies every loot-tier roll's chance in
 * `rollTier` — LUCKY's +50% base makes each magic/rare/unique gate half again
 * as likely to open, and more once he's leveled.
 */
export function magicFindBonus(state: GameState): number {
  let bonus = 0;
  for (const companion of state.companions) {
    if (companion.downed) continue;
    bonus += companionAuraMagicFind(
      companionDef(companion.defId),
      companion.level,
    );
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
  mobRarity?: "rare" | "unique",
): Tier {
  const difficultyChances = difficultyDef(state.difficulty).tierChanceBonus;
  const mf = magicFind(state);
  // The EXPLICIT set-piece boost on named tiers: bosses get the boss bonus;
  // elites AND rare/unique MOBS share the elite bonus, so a special find is a
  // real named-item source, not trash odds.
  const roleBonus: Partial<Record<Tier, number>> | undefined =
    role === "boss"
      ? LOOT.bossRarityBonus
      : role === "elite" || mobRarity
        ? LOOT.eliteRarityBonus
        : undefined;
  // A PLAIN minion (rank and file, no rarity) suffers the named-tier PENALTY:
  // its unique/legendary/artifact odds are cut to a sliver (`minionNamedMult`),
  // so trash can still surprise but the special fights own the chase gear.
  const plainMinion = role === "minion" && !mobRarity;
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
  // ARTIFACTS are the CAP chase: they drop ONLY once the hero has reached the
  // level cap (`LEVELING.maxLevel`, 99 — reachable only on JESUS's endgame
  // grind). Every shipped artifact requires level 99 to wear (`itemLevelReq`),
  // so this pins the drop to exactly where it becomes wearable — no relic ever
  // falls into a hand too low to use it. Gates the whole artifact tier below.
  const atCap = state.player.level >= LEVELING.maxLevel;
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
  const namedMult = runLevelDef(state).loot.namedDropMult ?? 1;
  // TIER_ROLL_ORDER never contains "regular" (the fall-through) or "trash"
  // (scripted mints only), so the rarity config maps index safely.
  for (const tier of TIER_ROLL_ORDER) {
    const qlvl = LOOT.tierUnlockMlvl[tier];
    if (lootLevel < qlvl) continue; // hard gate, unchanged
    if (tier === "artifact" && (!hasArtifacts || !atCap)) continue;
    const named =
      tier === "unique" || tier === "legendary" || tier === "artifact";
    const topChase = tier === "legendary" || tier === "artifact";
    if (topChase && !hardPlus) continue; // legendary/artifact: HARD and up
    const base =
      (LOOT.rarityBase[tier] +
        LOOT.raritySlope[tier] * (lootLevel - qlvl) +
        (difficultyChances[tier] ?? 0) +
        (roleBonus?.[tier] ?? 0)) *
        (named ? namedMult : 1) *
        (named && plainMinion ? LOOT.minionNamedMult : 1) +
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
  slot: ItemSlot,
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
 * Roll a dropped item's own LEVEL off a level-`mlvl` killer. The D2 rarity
 * ladder decides how it sits relative to the loot level: WHITE/regular items
 * roll AT or a hair under (a weighted deficit, `LOOT.ilvlDeltaWeights`), while
 * MAGIC and RARE roll a weighted margin ABOVE it (`ilvlMarginMagic` +0..2,
 * `ilvlMarginRare` +3..5) — the rarer the find, the more its power punches over
 * the mob that dropped it. The named tiers (unique/legendary/artifact) fold
 * into a hand-authored item whose own ilvl overrides this roll, so their raw
 * value is moot. The difficulty's `lootIlvlBonus` is added on top. Floored at 1.
 */
function rollItemLevel(state: GameState, mlvl: number, tier: Tier): number {
  const bonus = difficultyDef(state.difficulty).lootIlvlBonus;
  const margin =
    tier === "magic"
      ? LOOT.ilvlMarginMagic
      : tier === "rare"
        ? LOOT.ilvlMarginRare
        : null;
  if (margin) {
    const offset =
      margin.base +
      pickWeighted(
        state.rng,
        margin.weights.map((weight, i) => ({ weight, i })),
      ).i;
    return Math.max(1, mlvl + bonus + offset);
  }
  // regular/trash (and the moot named-tier raw roll): the small downward deficit.
  const weights: readonly number[] =
    tier === "unique" || tier === "legendary" || tier === "artifact"
      ? LOOT.ilvlDeltaWeightsRare
      : LOOT.ilvlDeltaWeights;
  const delta = pickWeighted(
    state.rng,
    weights.map((weight, i) => ({ weight, delta: i })),
  ).delta;
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
/**
 * Roll a WEAPON instance's ENHANCED DAMAGE — D2's `+X% Enhanced Damage`, drawn
 * uniformly inside its tier's band (`LOOT.enhancedDamage`, authored in
 * content/item_rarity.yaml) and returned as a FRACTION (1.37 = +137%).
 *
 * Returns undefined for anything that carries none — every tier below magic,
 * and all gear — so the instance simply has no field rather than a meaningless
 * zero. Drawn off the `fxRng` FLAVOR stream, never `rng`: like the make-quality
 * range roll it is a draw on an item the loot sequence has ALREADY decided on,
 * so adding it cannot shift which items drop.
 *
 * This is the whole of what makes a rarer weapon hit harder than a white one of
 * the same base — there is no hidden damper and no item-level growth on weapon
 * damage (see config `WEAPON`) — and the rolled figure is printed on the item
 * card, so the number the player farms for is the number the engine uses.
 */
export function rollEnhancedDamage(
  fxRng: Rng,
  tier: Tier,
  family: "weapon" | "gear",
): number | undefined {
  if (family !== "weapon") return undefined;
  const band = LOOT.enhancedDamage[tier];
  if (!band) return undefined;
  return randomRange(fxRng, band.min, band.max);
}

/**
 * THE BASES A DROP AT `lootLevel` MAY LAND ON — the level's authored pool with
 * its grade variants folded in, minus everything this rung and this hero cannot
 * yet be paid. Pure: it spends no rng draw, which is what lets a second caller
 * ask the question without shifting the seeded loot stream.
 *
 * Exported because a QUEST REWARD has to pick SIBLING bases — a mail, a leather
 * and a cloth piece, or a melee, a ranged and a magic weapon — off exactly the
 * ladder a drop would have used (see quests/reward-choices.ts). Re-deriving
 * that eligibility beside it would be a second copy of the level gates, the
 * material gates and the base-level floor, free to disagree with this one the
 * first time any of them changed.
 */
export function eligibleBases(
  state: GameState,
  family: "weapon" | "gear",
  lootLevel: number,
): string[] {
  const loot = runLevelDef(state).loot;
  // Levels author their pools in NORMAL bases only; each entry implies its
  // exceptional/elite versions (defs/grades.ts), folded in here so the base
  // ladder keeps unfolding to level 100. The levelReq gate below decides
  // which grades this killer can actually pay. Filtered against the active
  // catalog so a swapped-in fixture catalog (tests) sees no phantom ids.
  const authoredPool = family === "weapon" ? loot.weaponPool : loot.gearPool;
  let fullPool = authoredPool.flatMap((id) => [
    id,
    ...gradeVariantIds(id).filter((variantId) =>
      family === "weapon" ? isWeaponDef(variantId) : isGearDef(variantId),
    ),
  ]);
  // The MATERIAL drop-gate: PLATE (and any future material with a
  // `minDifficulty`) is filtered out of the random pool below the rung it is
  // gated to, so the heaviest armor is a NIGHTMARE-and-up chase — it never
  // drops on easy/medium/hard. Gear only; scripted mints (opts.defId — a boss
  // trophy) bypass the pool and are unaffected, so a story-placed plate piece
  // still lands where it's authored.
  if (family === "gear") {
    fullPool = fullPool.filter((id) => {
      // The BASE's own gate first — how a whole item KIND is held back for the
      // deep ladder (RINGS from nightmare, AMULETS from JESUS), then the
      // MATERIAL's (plate).
      const baseMin = gearDef(id).minDifficulty;
      if (
        baseMin !== undefined &&
        !meetsMinDifficulty(state.difficulty, baseMin)
      )
        return false;
      const min = ARMOR_TYPES[armorTypeOf(id)].minDifficulty;
      return min === undefined || meetsMinDifficulty(state.difficulty, min);
    });
  }
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
  return floored.length > 0 ? floored : pool;
}

/**
 * The LOOT LEVEL a drop at `mlvl` gates off — the monster level with the
 * difficulty's mob-level offset stripped back out (see the note inside
 * `rollEquipment`). Exported alongside `eligibleBases`, because a caller
 * asking which bases are eligible needs the same number the roll uses.
 */
export function lootLevelFor(state: GameState, mlvl: number): number {
  return Math.max(1, mlvl - difficultyDef(state.difficulty).mobLevelOffset);
}

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
    /** The killer's RARITY tier (a RARE/UNIQUE mob, config RARE_MOBS): shares
     * the elite named-tier bonus and skips the plain-minion named penalty, so
     * a special find drops chase gear like a set piece does. Omitted = a plain
     * minion (the penalty applies). */
    mobRarity?: "rare" | "unique";
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
  const lootLevel = lootLevelFor(state, mlvl);
  const family = opts.defId
    ? isWeaponDef(opts.defId)
      ? ("weapon" as const)
      : ("gear" as const)
    : (opts.slot ?? (rng() < 0.6 ? ("weapon" as const) : ("gear" as const)));
  const pool = eligibleBases(state, family, lootLevel);
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
  const slot: ItemSlot = family === "weapon" ? "weapon" : gearDef(defId).slot;

  let tier =
    opts.tier ??
    rollTier(state, lootLevel, opts.tierBonus ?? 0, opts.role, opts.mobRarity);
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
  // A gradeable piece that actually TOOK a make quality (a rolled white, or a
  // scripted forced quality) rolls a specific base-value multiplier inside that
  // quality's band — the D2 rule that two SUPERIOR copies swing differently.
  // Drawn off `fxRng` so the base-value spread never perturbs the seeded loot
  // sequence (like the per-hit variance). Magic+ finds, charms, and bags carry
  // no roll and read the flat NORMAL midpoint (1×), exactly as before.
  const graded =
    gradeable && (tier === "regular" || opts.quality !== undefined);
  const qualityRoll = graded
    ? rollQualityMult(state.fxRng, quality)
    : undefined;
  const qMult = qualityRoll ?? 1;
  // ENHANCED DAMAGE: a magic-or-better WEAPON's +X% on its base's catalog
  // damage, rolled inside its tier's band and frozen for life. The one thing
  // that makes a blue hit harder than the white version of the same base.
  const enhancedDamage = rollEnhancedDamage(state.fxRng, tier, family);
  const affixes: Affix[] = [];
  const available = [...AFFIX_POOLS[family]];
  // A piece of ARMOR biases its rolled `+stat` affixes toward its material's
  // lane (cloth → INT, leather → DEX, mail/plate → STR); weapons and non-armor
  // gear (charms/bags) roll an even spread. Computed once for the whole item.
  const statWeights =
    family === "gear" && gearDef(defId).armor !== undefined
      ? ARMOR_TYPES[armorTypeOf(defId)].statWeights
      : undefined;
  for (let i = 0; i < TIERS[tier].affixCount && available.length > 0; i++) {
    const affixDef = pickWeighted(rng, available);
    available.splice(available.indexOf(affixDef), 1);
    affixes.push(rollAffix(rng, affixDef, ilvl, statWeights));
  }

  const rolled: Equipment = {
    id: state.nextId++,
    defId,
    slot,
    tier,
    ilvl,
    quality,
    // The specific base-value multiplier this piece rolled within its quality
    // band, frozen for life (undefined on flat-normal pieces — see above).
    ...(qualityRoll !== undefined ? { qualityRoll } : {}),
    ...(enhancedDamage !== undefined ? { enhancedDamage } : {}),
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
    if (def.bagSlots !== undefined) {
      // A BAG's growth axis is ROOM, and it follows the very same WoW rule the
      // armor stamp above does: the authored count is the base's value at its
      // own levelReq, and every item level past it buys a fraction of a cell.
      // Make quality is deliberately NOT applied — bags never roll one (there
      // is nothing to scale on a satchel), so `qMult` is 1 here anyway and
      // reading it would only imply otherwise.
      const growth = Math.max(0, ilvl - (def.levelReq ?? 1));
      rolled.bagSlots = Math.round(
        def.bagSlots * (1 + LOOT.bagSlotsPerIlvl * growth),
      );
    }
  }
  return rolled;
}

/**
 * Mint a hand-authored UNIQUE (`defs/uniques.ts`) as a live item instance: its
 * base type, static ilvl, fixed name and bonuses, plus a per-drop roll so two
 * copies differ — the fixed bonuses stay identical, so a better-rolled copy is
 * worth chasing. A WEAPON's roll is its ENHANCED DAMAGE (the tier's wide band,
 * printed on the card); named ARMOR keeps the ±band on its armor value (config
 * `UNIQUE.baseRollBand`). Minted unbreakable (no durability), like every
 * unique/legendary find. The frozen `def` snapshot version-proofs it, exactly
 * like a rolled drop.
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
    // A named WEAPON's per-drop variance is its ENHANCED DAMAGE roll — the
    // wide, visible band that replaced the ±few-% `baseRoll` (and, with it,
    // the hidden damper + ilvl growth those weapons used to ride). An ARTIFACT
    // rolling near its ceiling is the endgame chase; `baseRoll` stays for named
    // ARMOR, where it is baked straight into the stamped `armor` below.
    baseRoll: weapon ? undefined : roll,
    ...(weapon
      ? {
          enhancedDamage: rollEnhancedDamage(
            state.fxRng,
            u.tier ?? "unique",
            "weapon",
          ),
        }
      : {}),
    def: structuredClone(baseDef),
  };
  if (!weapon) {
    const gear = gearDef(u.base);
    // A unique's armor is its base value rolled ±band — its POWER lives in the
    // fixed bonuses, not in ilvl-scaled base stats (uniques don't grow with
    // ilvl the way rolled pieces do). Normal make, so no quality multiplier.
    if (gear.armor !== undefined) item.armor = Math.round(gear.armor * roll);
    // A bag unique overrides its base's capacity — the extra room is the point,
    // and it is AUTHORED rather than grown: a unique's ilvl is fixed, so there
    // is nothing for `LOOT.bagSlotsPerIlvl` to grow it by. Stamped on the
    // instance (what `equippedBagSlots` reads first) AND on the frozen def, so
    // a piece re-homed from an old save still answers with its own room.
    if (u.bagSlots !== undefined) {
      item.bagSlots = u.bagSlots;
      if (item.def) (item.def as { bagSlots?: number }).bagSlots = u.bagSlots;
    }
  }
  return item;
}

// The load-side twin of the minting above — re-homing a PERSISTED piece onto
// its frozen def. It lives in its own leaf module (adopt.ts) so a save-loading
// path can reach it without importing the loot economy; re-exported here
// because every existing caller reads it off this module.
export { adoptEquipment } from "./adopt.ts";

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
