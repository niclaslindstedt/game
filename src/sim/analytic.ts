// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The ANALYTIC PROGRESSION SIMULATOR (see the `simulate-run` skill's sibling
// CLI, scripts/progression-sim.mjs): a paper playthrough of the WHOLE game
// that uses the REAL engine rules for every kill — no renderer, no autopilot,
// no geometry. Where src/sim/simulate.ts drives the real game LOOP (the bot
// steering a body through a level, subject to its survival and pathing), this
// module answers a cleaner balance question: if the hero cleanly farms every
// mob a level can field — the whole horde, its elites, its rolled rare/unique
// visitors, and its boss — how do XP, loot, and the hero's stat block move,
// rung by rung, all the way to the level cap?
//
// It is "almost true": each kill runs the actual kill funnel
// (`killEnemy` → `grantXp` with the per-map cap → the real drop ladder), each
// dropped upgrade auto-equips through the real `isBetterEquipment` rule, and
// every reported stat is read straight off the real getters (`weaponDamageFor`,
// `weaponDps`, `playerCritChance`, `totalArmor`, `armorReduction`,
// `effectiveStat`). The two liberties it takes — kills land at overkill
// efficiency 1 (a clean lethal blow, the loot/XP ceiling) and mobs are killed
// in a fixed roster order rather than as a physical fight — are exactly what
// makes it a stable balance instrument instead of a chaotic run.
//
// Deliberately NOT exported from src/index.ts: the app never simulates —
// scripts and tests import this module directly.

import { extractLoadout } from "../game/arrival.ts";
import { buildStatWeights } from "../game/builds.ts";
import type { StatBuild } from "../game/builds.ts";
import { LEVELING, MENACE, RARE_MOBS } from "../game/config/index.ts";
import { createGame, spawnEnemy } from "../game/create.ts";
import { BALANCE } from "../game/tuning.ts";
import {
  difficultyDef,
  DIFFICULTY_ORDER,
  meetsMinDifficulty,
  resolvePackCount,
  scaledMobCount,
} from "../game/defs/difficulties.ts";
import { enemyDef } from "../game/defs/enemies/index.ts";
import { LEVEL_ORDER, levelDef } from "../game/defs/levels/index.ts";
import {
  allocateStat,
  armorReduction,
  effectiveStat,
  equipmentName,
  heroArmorPen,
  isBetterEquipment,
  playerCritChance,
  recomputeMaxHp,
  recomputeMaxStamina,
  syncInventoryCapacity,
  totalArmor,
  weaponCritMult,
  weaponDamageFor,
  weaponDps,
} from "../game/items.ts";
import { killEnemy, mobArmorMult } from "../game/loot.ts";
import { statCap, xpLevelCap } from "../game/leveling.ts";
import {
  currentMobLevel,
  heroDamageLevel,
  heroGearLevel,
  heroPowerLevel,
  maybePowerScale,
  menaceStage,
  mobLevelScale,
  resolveMobScaling,
} from "../game/menace.ts";
import { createRng } from "../lib/rng.ts";
import {
  STAT_NAMES,
  weaponAssumedTargets,
  weaponDef,
} from "../game/defs/equipment.ts";
import type {
  Difficulty,
  Enemy,
  Equipment,
  GameState,
  Loadout,
  StatName,
  Tier,
} from "../game/types.ts";

// ---- Options ---------------------------------------------------------------------

/** How level-up points are spent: a weight per stat. A point goes to the stat
 * whose weight is least-served so far (highest-averages / D'Hondt), so
 * `{ strength: 2, stamina: 1 }` spends ~2 STR for every 1 STA across the run.
 * Zero/absent weight = never chosen. */
export type StatWeights = Partial<Record<StatName, number>>;

export type ProgressionOptions = {
  /** Rungs to sweep, in order (default: the whole ladder, easy → JESUS). */
  difficulties?: Difficulty[];
  /** Story levels per rung (default: the whole catalog in story order). */
  levels?: string[];
  /** Deterministic seed — the same options replay the same run exactly. */
  seed?: number;
  /** The stat-distribution BUILD to spend level-up points by (melee/ranged/
   * magic/balanced — see src/game/builds.ts). A shorthand that sets
   * `statWeights` from the shared build catalog, so the paper sim spends points
   * exactly as the autopilot does. An explicit `statWeights` overrides it. */
  build?: StatBuild;
  /** How level-up points are spent (see StatWeights). Overrides `build` when
   * both are given. Default when neither is set: a balanced bruiser,
   * `{ strength: 2, stamina: 1, dexterity: 1 }`. */
  statWeights?: StatWeights;
  /** Kills between hero-stat snapshots (default 25 — the batch the request
   * is framed around). Boss/elite/rare kills and level boundaries always
   * snapshot too. */
  batchSize?: number;
  /** Carry the hero's loadout from clear to clear (the real campaign) —
   * default true. */
  carryLoadout?: boolean;
  /** Seed the FIRST clear with this loadout instead of a fresh level-1 hero —
   * how a tier that is ENTERED mid-campaign (nightmare at ~40, jesus at ~58) is
   * measured from its real entry level. Mint it with `synthesizeArrival`.
   * Omitted = the authored fresh start. */
  startLoadout?: Loadout;
  /** Fraction of each map's MINION roster actually killed per clear (0..1,
   * default 1 = a full clear). Set-pieces (rares/elites/boss) are always killed.
   * Models a partial clear — a hero who rushes the boss instead of mopping up. */
  clearShare?: number;
  /** Keep re-farming the final rung's levels until the hero reaches this
   * level (default 99, the cap). The last rung (JESUS) is the one whose XP
   * caps actually reach 99. */
  targetLevel?: number;
  /** Roll each level's rare/unique visitors per the real encounter chances
   * (rare 0.8, unique 0.2). Default true. */
  includeRares?: boolean;
  /** Loot TIERS the hero refuses to pick up — left on the ground, never
   * auto-equipped (see `collectDrops`). Default none. The balance calibrator
   * passes `["unique","legendary","set","artifact"]` to measure the hero on
   * NORMAL gear (magic/rare) only, so the mob-hp curve is tuned against
   * everyday loot rather than a lucky named-drop streak. Rare/unique VISITORS
   * still SPAWN (see `includeRares`); this only governs what the hero equips. */
  excludeTiers?: Tier[];
};

// ---- Report shapes ---------------------------------------------------------------

/** The full hero stat block at one checkpoint — every number the request
 * asks for ("difficulty, map level name, current level, health, damage,
 * armor, crit % etc — every stat"). */
export type Checkpoint = {
  difficulty: Difficulty;
  levelId: string;
  levelName: string;
  /** Kills into THIS level at the checkpoint. */
  killsInLevel: number;
  /** Kills across the WHOLE sweep so far — the graph's x-axis. */
  totalKills: number;
  heroLevel: number;
  hp: number;
  maxHp: number;
  /** Expected damage of one landed blow (real `weaponDamageFor`). */
  perHit: number;
  /** Expected DPS in the hero's hands (real `weaponDps`) — SINGLE-TARGET. */
  dps: number;
  /** HORDE-effective DPS — the single-target `dps` scaled by the weapon's AoE
   * assumption (`weaponAssumedTargets`) and the mob-armor multiplier the class
   * actually faces (`mobArmorMult`, folding class + gear armor piercing). The
   * closest fast proxy for "how fast does this build clear the armored horde",
   * so a class comparison sees crit AND AoE AND armor together. */
  hordeDps: number;
  /** Crit chance in [0, 1] (real `playerCritChance`). */
  critChance: number;
  /** Crit-damage multiplier of the equipped weapon. */
  critMult: number;
  armor: number;
  /** Physical damage reduction vs the current horde level, [0, maxReduction]. */
  armorReduction: number;
  // ---- The MOB side (the horde this hero faces) + the MENACE read. Populated
  // from the last rank-and-file MINION the pass actually spawned, so the TTK
  // and menace numbers are measured against a real bar, not a synthetic one. --
  /** The horde's effective LEVEL and its three inputs (`heroPowerLevel` =
   * max of character, gear, damage) — surfaced so an inflated mobHp can be
   * traced to whichever read is driving it. */
  powerLevel: number;
  gearLevel: number;
  damageLevel: number;
  /** A rank-and-file minion's max hp at this hero's power (real spawn). */
  mobHp: number;
  /** That minion's contact damage per blow, pre-armor (real spawn). */
  mobDamage: number;
  /** Seconds for the hero's sustained DPS to fell one such minion. */
  ttkSec: number;
  /** Expected landed blows to fell it (mobHp / perHit, crit folded in). */
  blowsToKill: number;
  /** Blows the hero survives from that minion, after armor (maxHp ÷ the
   * reduced incoming hit) — the incoming-damage half of the balance read. */
  hitsToDie: number;
  /** How many full minion healthbars one expected killing blow deletes
   * (heroBlow ÷ mobHp) — the OVERKILL that fuels the menace ratchet. >1 means
   * one-shots; the higher it climbs the faster the horde evolves. */
  overkillRatio: number;
  /** The sustained MENACE (RAMPAGE) stage this build settles at: the evolution
   * stage whose toughened minion (`evolutionHpMult`) finally survives the
   * hero's blow — `(overkillRatio − 1) / (hpPerStage × menaceEffectMult)`,
   * floored at 0. The endgame's real score: better gear/spec → higher stage,
   * uncapped. An ESTIMATE (steady-state, ignores warmup/relief), but monotone
   * in build power, which is what a balance read needs. */
  menaceStageEq: number;
  /** Effective value of every stat (base + auto-growth + gear, diminished). */
  stats: Record<StatName, number>;
  coins: number;
  weapon: string;
  weaponTier: Tier;
  weaponDps: number;
  xp: number;
  xpToNext: number;
  /** The map's hero-level ceiling for this (level × difficulty). */
  xpCap: number;
  /** XP banked since the previous checkpoint (post-cap, as it actually landed). */
  batchXp: number;
  /** Equipment dropped since the previous checkpoint, by tier. */
  batchDropsByTier: Partial<Record<Tier, number>>;
  /** Named unique/legendary finds since the previous checkpoint. */
  batchNamed: string[];
};

export type LevelResult = {
  difficulty: Difficulty;
  levelId: string;
  levelName: string;
  /** How many times this level appears in the sweep (1, or more when the
   * target-level farm re-runs the final rung). */
  visit: number;
  /** Guaranteed mobs enumerated for this pass (the roster killed). */
  mobsPlanned: number;
  mobsKilled: number;
  elitesKilled: number;
  raresKilled: number;
  bossKilled: boolean;
  heroLevelStart: number;
  heroLevelEnd: number;
  xpGained: number;
  /** Total equipment dropped this pass, by tier. */
  dropsByTier: Partial<Record<Tier, number>>;
  /** Named unique/legendary finds this pass, in kill order. */
  named: string[];
  checkpoints: Checkpoint[];
};

export type ProgressionReport = {
  seed: number;
  /** The stat-distribution build this run spent points by, if one was named
   * (melee/ranged/magic/balanced) — for labeling graphs and comparisons. */
  build?: StatBuild;
  statWeights: StatWeights;
  batchSize: number;
  levels: LevelResult[];
  /** Every checkpoint across the whole sweep, flat — the series the graph
   * plots. */
  checkpoints: Checkpoint[];
  heroLevelEnd: number;
  totalKills: number;
  reachedTarget: boolean;
  targetLevel: number;
};

// ---- The roster ------------------------------------------------------------------

type RosterEntry = { defId: string; role: "minion" | "elite" | "boss" };

/**
 * The full guaranteed mob set a level fields for a run, in the order the sim
 * kills them: the horde first (placed skirmishers, woken packs, the whole wave
 * budget), then the rolled rare/unique visitors, then the pinned elites, and
 * the boss LAST (its bar-share XP settles against the hero's final level, and
 * killing it is what would end the real level). Every count runs through the
 * same `scaledMobCount`/`resolvePackCount` the engine uses, so a rung fields
 * exactly the population the real spawner would draw from its budget.
 */
function enumerateRoster(
  levelId: string,
  difficulty: Difficulty,
  rareRng: () => number,
  includeRares: boolean,
  clearShare = 1,
): RosterEntry[] {
  const level = levelDef(levelId);
  const minions: RosterEntry[] = [];
  const elites: RosterEntry[] = [];
  const rares: RosterEntry[] = [];
  let boss: RosterEntry | null = null;

  const push = (defId: string) => {
    const role = enemyDef(defId).role;
    const entry: RosterEntry = { defId, role };
    if (role === "boss") boss = entry;
    else if (role === "elite") elites.push(entry);
    else minions.push(entry);
  };

  // Placed spawns: banded lines (a scattered count) and pinned singles (an
  // elite or the boss guarding a spot). Difficulty-gated lines respect their
  // minDifficulty gate exactly as the spawner does.
  for (const spec of level.spawns) {
    if (!meetsMinDifficulty(difficulty, spec.minDifficulty)) continue;
    if ("at" in spec) {
      push(spec.enemy);
    } else {
      const n = scaledMobCount(spec.count, difficulty);
      for (let i = 0; i < n; i++) push(spec.enemy);
    }
  }

  // The scripted vanguard rusher, if any.
  if (level.openingStrike) push(level.openingStrike.enemy);

  // Woken packs — every member, at its per-difficulty count.
  for (const pack of level.packs ?? []) {
    for (const member of pack.members) {
      const n = resolvePackCount(member.count, difficulty);
      for (let i = 0; i < n; i++) push(member.enemy);
    }
  }

  // The survivors-style wave budget — the bulk of the horde on wave maps.
  if (level.waves) {
    for (const budget of level.waves.budget) {
      if (!meetsMinDifficulty(difficulty, budget.minDifficulty)) continue;
      const n = scaledMobCount(budget.count, difficulty);
      for (let i = 0; i < n; i++) push(budget.enemy);
    }
  }

  // SPAWN POINTS — the finite horde on spawner maps (every queued member across
  // every point, including its lingering pre-placement, all killed on a full
  // clear). The alternative to `waves`; a map uses one or the other.
  for (const spawner of level.spawners ?? []) {
    if (!meetsMinDifficulty(difficulty, spawner.minDifficulty)) continue;
    for (const member of spawner.members) {
      const n = scaledMobCount(member.count, difficulty);
      for (let i = 0; i < n; i++) push(member.enemy);
    }
  }

  // Rare/unique visitors: each tier rolls its existence once (rare 0.8,
  // unique 0.2), then one candidate id is picked — the engine's
  // placeRareEncounters rule, on an independent stream so it never perturbs
  // the loot draws.
  if (includeRares && level.rareSpawns) {
    for (const kind of ["rare", "unique"] as const) {
      const pool = level.rareSpawns[kind];
      if (!pool || pool.length === 0) continue;
      if (rareRng() >= RARE_MOBS.encounterChance[kind]) continue;
      const pick = pool[Math.floor(rareRng() * pool.length)];
      if (!pick) continue;
      rares.push({ defId: pick, role: enemyDef(pick).role });
    }
  }

  // A PARTIAL clear kills only a fraction of the mopping-up minions; the set
  // pieces (rares/elites/boss) are always killed (you can't skip the boss).
  const keptMinions =
    clearShare >= 1
      ? minions
      : minions.slice(0, Math.round(minions.length * Math.max(0, clearShare)));
  const roster = [...keptMinions, ...rares, ...elites];
  if (boss) roster.push(boss);
  return roster;
}

// ---- Stat allocation -------------------------------------------------------------

/** Spend every pending level-up point per the weights, via highest-averages
 * so the realized split tracks the requested ratio. `spent` carries across
 * the whole sweep so the ratio holds over the campaign, not just one ding. */
function allocatePoints(
  state: GameState,
  weights: StatWeights,
  spent: Record<StatName, number>,
): void {
  const active = STAT_NAMES.filter((s) => (weights[s] ?? 0) > 0);
  const lane = active.length > 0 ? active : (["stamina"] as StatName[]);
  while (state.player.pendingStatPoints > 0) {
    // Only stats below the level-scaled cap can still take a chosen point; once
    // the lane is capped (a deep spec past ~L66), spill into any stat with room
    // so the pool always drains — never spin on an un-placeable point.
    const cap = statCap(state.player.level);
    const laneRoom = lane.filter((s) => state.player.stats[s] < cap);
    const pool =
      laneRoom.length > 0
        ? laneRoom
        : STAT_NAMES.filter((s) => state.player.stats[s] < cap);
    if (pool.length === 0) break; // every stat capped (unreachable in practice)
    let best: StatName = pool[0] ?? "stamina";
    let bestScore = -Infinity;
    for (const stat of pool) {
      const score = (weights[stat] ?? 1) / (spent[stat] + 1);
      if (score > bestScore) {
        bestScore = score;
        best = stat;
      }
    }
    if (!allocateStat(state, best)) break;
    spent[best]++;
  }
}

// ---- The kill --------------------------------------------------------------------

/** A rank-and-file minion's real toughness/touch at the hero's current power,
 * for the mob-side balance read — the same numbers combat resolves against. */
export type MobRef = { maxHp: number; contact: number; mlvl: number };

/** Mint one real mob at the hero's current power (the same scaling every live
 * spawn path funnels through) and land a clean lethal blow — overkill
 * efficiency 1, so XP and loot pay their ceiling. Returns the equipment it
 * dropped (already collected off the ground) and the minted enemy (so the
 * caller can read the real bar it faced). */
function killOne(
  state: GameState,
  defId: string,
): { dropped: Equipment[]; enemy: Enemy } {
  // Mint at the level the level spec hard-codes for this rung (the level
  // default — killOne has no spawner context), matching every live spawn path;
  // JESUS still runs player-relative. This is what keeps the analytic XP/loot
  // model in step with actual play now that mob level is authored, not floated.
  const sc = resolveMobScaling(
    levelDef(state.level.id).mobLevels,
    state.difficulty,
    state.player.level,
    state.rng,
    mobLevelScale(state),
    currentMobLevel(state),
  );
  const enemy: Enemy = spawnEnemy(
    defId,
    { x: 0, y: 0 },
    state.rng,
    state.nextId++,
    sc.hpMult,
    menaceStage(state),
    1,
    sc.mlvl,
    sc.banded,
  );
  // Set pieces (elites/bosses) and rare/unique visitors meet the hero's power
  // the instant their fight opens — the real engage-time re-stamp of hp and
  // monster level, so their drops match the hero who beat them. A no-op for
  // the rank and file.
  maybePowerScale(state, enemy);

  state.enemies = [enemy];
  state.items = [];
  state.choice = null;
  // A clean kill: exactly lethal, no crit — overkill efficiency 1 (the XP and
  // drop ceiling). killEnemy runs the whole death funnel: the capped XP grant
  // (and any level-up), the menace bank, and the full drop ladder.
  killEnemy(state, enemy, enemy.maxHp, false);

  const dropped: Equipment[] = [];
  for (const item of state.items) {
    if (item.kind === "equipment") dropped.push(item.equipment);
  }
  state.items = [];
  return { dropped, enemy };
}

/** The contact damage a spawned minion actually lands (pre-armor): its def's
 * base touch, the horde's per-level ramp already folded into `contactMult`,
 * times the global mob-damage lever. Mirrors the `hitEnemy` contact path
 * (step.ts), minus the moment-to-moment crit/last-stand/mechanic bumps. */
function mobContactDamage(enemy: Enemy): number {
  return (
    enemyDef(enemy.defId).contactDamage *
    (enemy.contactMult ?? 1) *
    BALANCE.mobDamage
  );
}

/** Equip every dropped piece that out-scores what's worn, through the real
 * auto-equip rule — the on-pickup upgrade the engine applies in step(). Tiers
 * in `excludeTiers` are LEFT ON THE GROUND (never equipped): the balance calibrator
 * uses this to measure the hero on NORMAL gear only (magic/rare), so the mob-hp
 * curve is tuned against everyday loot rather than a lucky legendary streak. */
function collectDrops(
  state: GameState,
  dropped: Equipment[],
  excludeTiers?: Set<Tier>,
): void {
  for (const eq of dropped) {
    if (excludeTiers?.has(eq.tier)) continue;
    if (!isBetterEquipment(state, eq)) continue;
    if (eq.slot === "weapon") {
      state.player.equipment.weapon = eq;
      state.player.weaponCooldownMs = 0;
    } else {
      state.player.equipment[eq.slot] = eq;
    }
    recomputeMaxHp(state);
    recomputeMaxStamina(state);
    syncInventoryCapacity(state);
  }
}

// ---- Snapshots -------------------------------------------------------------------

type BatchAccumulator = {
  xp: number;
  byTier: Partial<Record<Tier, number>>;
  named: string[];
};

const NAMED_TIERS = new Set<Tier>(["unique", "legendary", "artifact"]);

function freshBatch(): BatchAccumulator {
  return { xp: 0, byTier: {}, named: [] };
}

function bankDrops(batch: BatchAccumulator, dropped: Equipment[]): void {
  for (const eq of dropped) {
    batch.byTier[eq.tier] = (batch.byTier[eq.tier] ?? 0) + 1;
    if (NAMED_TIERS.has(eq.tier) && eq.uniqueId)
      batch.named.push(equipmentName(eq));
  }
}

function snapshot(
  state: GameState,
  difficulty: Difficulty,
  levelId: string,
  levelName: string,
  killsInLevel: number,
  totalKills: number,
  batch: BatchAccumulator,
  ref: MobRef | null,
): Checkpoint {
  const player = state.player;
  const weapon = player.equipment.weapon;
  const stats = {} as Record<StatName, number>;
  for (const stat of STAT_NAMES) stats[stat] = effectiveStat(state, stat);

  // ---- The mob-side + menace read, measured against the last real minion bar.
  const dps = weaponDps(state, weapon);
  // HORDE-effective DPS: single-target dps × the weapon's AoE assumption × the
  // mob-armor multiplier this class actually faces (class + gear pierce folded
  // in). Folds crit (already in dps), reach, and armor into one comparable read.
  const wdef = weaponDef(weapon.defId);
  const hordeDps =
    dps *
    weaponAssumedTargets(wdef) *
    mobArmorMult(
      currentMobLevel(state),
      difficulty,
      wdef.class,
      heroArmorPen(state),
    );
  const perHit = weaponDamageFor(state, weapon);
  // The expected KILLING BLOW: one landed hit, crit folded in as its average
  // lift — what the menace ratchet weighs its overkill against.
  const critLift =
    1 +
    playerCritChance(state, undefined) * (weaponCritMult(state, weapon) - 1);
  const heroBlow = perHit * critLift;
  const mobHp = ref?.maxHp ?? 0;
  const mobDamage = ref?.contact ?? 0;
  const reduction = ref ? armorReduction(state, ref.mlvl) : 0;
  const incoming = Math.max(1, mobDamage * (1 - reduction));
  const overkillRatio = mobHp > 0 ? heroBlow / mobHp : 0;
  // Evolution hp is LINEAR in stage (evolutionHpMult), so the stage where a
  // toughened minion finally survives the hero's blow solves in closed form.
  const eff = difficultyDef(difficulty).menaceEffectMult;
  const menaceStageEq =
    overkillRatio > 1
      ? (overkillRatio - 1) / (MENACE.hpPerStage * Math.max(1e-6, eff))
      : 0;

  return {
    difficulty,
    levelId,
    levelName,
    killsInLevel,
    totalKills,
    heroLevel: player.level,
    hp: Math.round(player.hp),
    maxHp: player.maxHp,
    perHit: round1(weaponDamageFor(state, weapon)),
    dps: round1(weaponDps(state, weapon)),
    hordeDps: round1(hordeDps),
    critChance: round3(playerCritChance(state, undefined)),
    critMult: round2(weaponCritMult(state, weapon)),
    armor: totalArmor(state),
    armorReduction: round3(armorReduction(state, currentMobLevel(state))),
    powerLevel: round1(heroPowerLevel(state)),
    gearLevel: round1(heroGearLevel(state)),
    damageLevel: round1(heroDamageLevel(state)),
    mobHp: Math.round(mobHp),
    mobDamage: round1(mobDamage),
    ttkSec: dps > 0 ? round2(mobHp / dps) : 0,
    blowsToKill: perHit > 0 ? round1(mobHp / perHit) : 0,
    hitsToDie: round1(player.maxHp / incoming),
    overkillRatio: round2(overkillRatio),
    menaceStageEq: Math.round(menaceStageEq),
    stats,
    coins: player.coins,
    weapon: equipmentName(weapon),
    weaponTier: weapon.tier,
    weaponDps: round1(weaponDps(state, weapon)),
    xp: player.xp,
    xpToNext: player.xpToNext,
    xpCap: xpLevelCap(levelId, difficulty),
    batchXp: batch.xp,
    batchDropsByTier: batch.byTier,
    batchNamed: batch.named,
  };
}

// ---- One level pass --------------------------------------------------------------

function runLevelPass(
  state: GameState,
  difficulty: Difficulty,
  levelId: string,
  visit: number,
  roster: RosterEntry[],
  batchSize: number,
  weights: StatWeights,
  spent: Record<StatName, number>,
  totalKillsBefore: number,
  excludeTiers: Set<Tier>,
): LevelResult {
  const level = levelDef(levelId);
  const heroLevelStart = state.player.level;
  const xpStart = state.stats.xpGained;
  const checkpoints: Checkpoint[] = [];
  const levelDrops: Partial<Record<Tier, number>> = {};
  const levelNamed: string[] = [];
  let batch = freshBatch();
  let batchXpStart = state.stats.xpGained;
  let elitesKilled = 0;
  let raresKilled = 0;
  let bossKilled = false;
  let totalKills = totalKillsBefore;
  // The most recent rank-and-file minion's real bar — the mob-side/menace read
  // measures against it. Rares/elites/bosses are set pieces, not the horde the
  // TTK is framed around, so they don't overwrite it.
  let ref: MobRef | null = null;

  const take = (killsInLevel: number) => {
    batch.xp = state.stats.xpGained - batchXpStart;
    checkpoints.push(
      snapshot(
        state,
        difficulty,
        levelId,
        level.name,
        killsInLevel,
        totalKills,
        batch,
        ref,
      ),
    );
    batch = freshBatch();
    batchXpStart = state.stats.xpGained;
  };

  // Opening snapshot: the hero as they walk in.
  take(0);

  for (let i = 0; i < roster.length; i++) {
    const entry = roster[i];
    if (!entry) continue;
    const def = enemyDef(entry.defId);
    const { dropped, enemy } = killOne(state, entry.defId);
    // Record the rank-and-file bar (not rares/elites/bosses) for the mob read.
    if (entry.role === "minion" && !def.rarity) {
      ref = {
        maxHp: enemy.maxHp,
        contact: mobContactDamage(enemy),
        mlvl: enemy.mlvl,
      };
    }
    collectDrops(state, dropped, excludeTiers);
    bankDrops(batch, dropped);
    for (const eq of dropped) {
      levelDrops[eq.tier] = (levelDrops[eq.tier] ?? 0) + 1;
      if (NAMED_TIERS.has(eq.tier) && eq.uniqueId)
        levelNamed.push(equipmentName(eq));
    }
    allocatePoints(state, weights, spent);

    if (entry.role === "elite") elitesKilled++;
    else if (entry.role === "boss") bossKilled = true;
    if (def.rarity) raresKilled++;

    totalKills++;
    const killsInLevel = i + 1;
    const isSpecial = entry.role !== "minion" || def.rarity;
    if (
      killsInLevel % batchSize === 0 ||
      isSpecial ||
      i === roster.length - 1
    ) {
      take(killsInLevel);
    }
  }

  return {
    difficulty,
    levelId,
    levelName: level.name,
    visit,
    mobsPlanned: roster.length,
    mobsKilled: roster.length,
    elitesKilled,
    raresKilled,
    bossKilled,
    heroLevelStart,
    heroLevelEnd: state.player.level,
    xpGained: state.stats.xpGained - xpStart,
    dropsByTier: levelDrops,
    named: levelNamed,
    checkpoints,
  };
}

// ---- The sweep -------------------------------------------------------------------

/**
 * Play the whole game on paper: every rung, every level, the hero carrying
 * their kit from clear to clear, then — once the ladder is walked — re-farm
 * the last rung until the hero reaches the target level (99 by default, the
 * only place the XP caps let them). Deterministic per options.
 */
export function simulateProgression(
  options: ProgressionOptions = {},
): ProgressionReport {
  const {
    difficulties = [...DIFFICULTY_ORDER],
    levels = [...LEVEL_ORDER],
    seed = 1,
    build,
    statWeights = build
      ? buildStatWeights(build)
      : { strength: 2, stamina: 1, dexterity: 1 },
    batchSize = 25,
    carryLoadout = true,
    targetLevel = LEVELING.maxLevel,
    includeRares = true,
    excludeTiers = [],
    startLoadout,
    clearShare = 1,
  } = options;
  const excludeTierSet = new Set<Tier>(excludeTiers);

  const spent = {} as Record<StatName, number>;
  for (const stat of STAT_NAMES) spent[stat] = 0;

  const levelResults: LevelResult[] = [];
  const allCheckpoints: Checkpoint[] = [];
  let loadout: Loadout | null = startLoadout ?? null;
  let totalKills = 0;
  let runIndex = 0;
  const visits = new Map<string, number>();

  const playOne = (difficulty: Difficulty, levelId: string): void => {
    const state = createGame(
      (seed + runIndex * 104_729) >>> 0,
      levelId,
      difficulty,
      loadout ?? undefined,
    );
    // We drive the roster by hand — clear the field the level placed.
    state.enemies = [];
    state.items = [];
    const rareRng = createRng((seed ^ (runIndex * 2_654_435_761)) >>> 0);
    const roster = enumerateRoster(
      levelId,
      difficulty,
      rareRng,
      includeRares,
      clearShare,
    );
    const visit = (visits.get(`${difficulty}/${levelId}`) ?? 0) + 1;
    visits.set(`${difficulty}/${levelId}`, visit);

    const result = runLevelPass(
      state,
      difficulty,
      levelId,
      visit,
      roster,
      batchSize,
      statWeights,
      spent,
      totalKills,
      excludeTierSet,
    );
    totalKills += result.mobsKilled;
    levelResults.push(result);
    allCheckpoints.push(...result.checkpoints);
    if (carryLoadout) loadout = extractLoadout(state);
    runIndex++;
  };

  for (const difficulty of difficulties) {
    for (const levelId of levels) playOne(difficulty, levelId);
  }

  // Keep farming the final rung's levels until the hero hits the target — the
  // "keep going on JESUS until level 99" tail. Bail if a full lap adds no
  // level (the cap is truly spent), so this never spins forever.
  const lastDifficulty = difficulties[difficulties.length - 1];
  let laps = 0;
  const MAX_TARGET_LAPS = 40;
  while (
    carryLoadout &&
    lastDifficulty &&
    heroLevelOf(loadout) < targetLevel &&
    laps < MAX_TARGET_LAPS
  ) {
    const before = heroLevelOf(loadout);
    for (const levelId of levels) {
      playOne(lastDifficulty, levelId);
      if (heroLevelOf(loadout) >= targetLevel) break;
    }
    if (heroLevelOf(loadout) <= before) break;
    laps++;
  }

  const heroLevelEnd = heroLevelOf(loadout);
  return {
    seed,
    build,
    statWeights,
    batchSize,
    levels: levelResults,
    checkpoints: allCheckpoints,
    heroLevelEnd,
    totalKills,
    reachedTarget: heroLevelEnd >= targetLevel,
    targetLevel,
  };
}

function heroLevelOf(loadout: Loadout | null): number {
  return loadout?.level ?? 1;
}

// ---- Small helpers ----------------------------------------------------------------

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
