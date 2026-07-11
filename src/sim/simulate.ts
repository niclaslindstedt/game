// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The HEADLESS CAMPAIGN SIMULATOR (see the `simulate-run` skill): drives the
// REAL engine — createGame, step, the autopilot bot, auto-equip, loadout
// carry-over — through whole levels and whole campaigns (easy → JESUS across
// every level) at full speed, no renderer, and reports what actually
// happened: how hard the hero hit (per blow, overall and per mob type), how
// hard each mob hit back, mob hp and levels, every drop, XP earned and XP
// forfeited to the per-map caps, the weapons the auto-equip stepped through,
// and periodic hero snapshots.
//
// The simulated hero is IMMORTAL: this is a calibration instrument, so a
// death never ends a run — the hero stands back up at the spawn with full
// bars, the death is booked as a pressure gauge, and the measurement marches
// on. Lethality is a number the report carries, never a run-ender.
//
// This is the balance team's wind tunnel. Nothing here is a model or an
// approximation of the rules — it IS the rules, run fast. The leveling-curve
// calculator (scripts/leveling-curve.mjs) stays the quick analytic view; this
// module answers the questions only a real run can (does the bot actually
// survive JESUS? what does the drop rain actually equip? where does leveling
// actually stall?). The CLI front-end is scripts/simulate-run.mjs.
//
// Deliberately NOT exported from src/index.ts: the app never simulates —
// scripts and tests import this module directly, so the public engine API
// stays what the renderer needs.

import { extractLoadout } from "../game/arrival.ts";
import {
  botAct,
  botAllocate,
  createBot,
  type BotStrategy,
} from "../game/bot.ts";
import { resolveChoice } from "../game/companions.ts";
import { createGame } from "../game/create.ts";
import { DIFFICULTY_ORDER } from "../game/defs/difficulties.ts";
import { enemyDef } from "../game/defs/enemies/index.ts";
import { LEVEL_ORDER, levelDef } from "../game/defs/levels/index.ts";
import {
  advanceOutro,
  allocateStat,
  armorReduction,
  dismissIntro,
  effectiveStat,
  equipmentName,
  skipCutscene,
  totalArmor,
  weaponDps,
} from "../game/items.ts";
import { xpCapMultiplier, xpLevelCap } from "../game/leveling.ts";
import { currentMobLevel, menaceStage } from "../game/menace.ts";
import { advanceDialogue } from "../game/story.ts";
import { step } from "../game/step.ts";
import { BALANCE } from "../game/tuning.ts";
import type {
  Difficulty,
  GameState,
  Item,
  Loadout,
  StatName,
  Tier,
} from "../game/types.ts";

// ---- Options -------------------------------------------------------------------

export type SimulateLevelOptions = {
  levelId: string;
  difficulty: Difficulty;
  /** Deterministic seed — the same options replay the same run exactly. */
  seed?: number;
  /** The hero walking in (see extractLoadout); omitted = a fresh start. */
  loadout?: Loadout | null;
  /** Autopilot strategy (default "survivor" — the competent horde player). */
  strategy?: BotStrategy;
  /** Cap on SIMULATED minutes of play before the run is called a timeout. */
  maxMinutes?: number;
  /** Fixed step size in ms (16 ≈ the app's frame cadence). */
  dtMs?: number;
  /** Interval between hero snapshots, in simulated ms. */
  snapshotEveryMs?: number;
  /**
   * Stall-breaker (default on): the autopilot has no pathfinding, so it can
   * wedge against a wall en route to the boss. When neither a kill nor a
   * point of damage lands for a stretch of simulated time, the hero is
   * nudged straight toward the nearest foe (or the objective) — cheating
   * the geometry so a stuck corner never eats the rest of the measurement.
   * Nudges are counted in the report.
   */
  unstick?: boolean;
};

export type SimulateCampaignOptions = {
  /** Rungs to sweep, in order (default: the whole ladder, easy → JESUS). */
  difficulties?: Difficulty[];
  /** Story levels per rung (default: the whole catalog in story order). */
  levels?: string[];
  seed?: number;
  strategy?: BotStrategy;
  maxMinutes?: number;
  dtMs?: number;
  snapshotEveryMs?: number;
  /** Carry the hero across rungs (the real campaign) — default true. */
  carryLoadout?: boolean;
};

// ---- Report shapes ---------------------------------------------------------------

export type HeroSnapshot = {
  atMs: number;
  level: number;
  hp: number;
  maxHp: number;
  /** Equipped weapon's expected DPS in the hero's hands right now. */
  dps: number;
  /** Physical damage reduction vs the CURRENT horde level. */
  armorReduction: number;
  armor: number;
  kills: number;
  menaceStage: number;
};

export type WeaponSwap = {
  atMs: number;
  from: string;
  to: string;
  fromDps: number;
  toDps: number;
  tier: Tier;
};

export type MobReport = {
  defId: string;
  name: string;
  role: string;
  /** Spawned into the run (placed + waves), whether or not it died. */
  spawned: number;
  killed: number;
  /** Average max hp the instances actually spawned with (post-scaling). */
  avgMaxHp: number;
  /** Average monster level stamped at spawn. */
  avgMlvl: number;
  /** Catalog contact damage — how hard one hit lands before armor/dodge. */
  contactDamage: number;
  /** Player blows this mob type absorbed (hits + killing blows). */
  hitsFromHero: number;
  /** Average damage ONE player blow dealt this mob type — the calibration read. */
  avgHitFromHero: number;
  /** Blows-to-kill: avgMaxHp / avgHitFromHero (0 when never hit). */
  hitsToKill: number;
  /** Total XP its deaths paid (pre-cap figures, as the kill events book). */
  xpPaid: number;
};

export type LevelReport = {
  levelId: string;
  levelName: string;
  difficulty: Difficulty;
  seed: number;
  strategy: BotStrategy;
  outcome: "victory" | "timeout";
  /** Times the hero WOULD have died — booked, revived at spawn, marched on. */
  deaths: number;
  /** Simulated play time of the run, ms. */
  timeMs: number;
  hero: {
    levelStart: number;
    levelEnd: number;
    xpGained: number;
    maxHp: number;
    armor: number;
    armorReduction: number;
    weapon: { name: string; tier: Tier; dps: number };
    stats: Record<StatName, number>;
    coins: number;
  };
  combat: {
    kills: number;
    totalEnemies: number;
    damageDealt: number;
    damageTaken: number;
    shotsFired: number;
    /** Player blows that landed on combatants (hits + killing blows). */
    hitsLanded: number;
    /** Average damage ONE landed player blow dealt — the calibration read. */
    damagePerHit: number;
    /** Fraction of landed player blows that crit, in [0, 1]. */
    critRate: number;
    /** Enemy blows that landed on the hero (post-dodge). */
    hitsTaken: number;
    /** Average damage ONE enemy blow carried, before armor reduction. */
    damagePerHitTaken: number;
    /** Damage dealt per simulated second — the run's realized DPS. */
    dpsOut: number;
    /** Kills per simulated minute — feeds the leveling calculator. */
    killsPerMinute: number;
    /** Stall-breaker teleports the runner had to apply (see `unstick`). */
    unstuckNudges: number;
  };
  drops: {
    /** Items that appeared on the ground, by kind. */
    spawnedByKind: Record<string, number>;
    /** Items actually collected, by kind. */
    collectedByKind: Record<string, number>;
    /** Collected equipment by tier. */
    equipmentByTier: Partial<Record<Tier, number>>;
    /** Collected pieces that auto-equipped as upgrades on the spot. */
    autoEquipped: number;
    /** Named unique/legendary finds, in pickup order. */
    named: string[];
  };
  weaponTimeline: WeaponSwap[];
  levelUps: { atMs: number; level: number }[];
  snapshots: HeroSnapshot[];
  mobs: MobReport[];
  xpCap: {
    /** This (map × difficulty) pair's hero-level ceiling. */
    cap: number;
    /** Simulated ms at which the hero hit the ceiling (null = never). */
    reachedAtMs: number | null;
    /** XP the cap's taper withheld across the run. */
    forfeited: number;
  };
};

export type CampaignReport = {
  seed: number;
  strategy: BotStrategy;
  runs: LevelReport[];
  /** The hero walking out of the last run. */
  finalLevel: number;
  finalMaxHp: number;
  finalWeapon: string;
  totalDeaths: number;
  totalKills: number;
  /** Total simulated play time across every run, ms. */
  totalTimeMs: number;
};

// ---- The per-level runner ---------------------------------------------------------

type MobAccumulator = {
  spawned: number;
  killed: number;
  hpSum: number;
  mlvlSum: number;
  hitsFromHero: number;
  damageFromHero: number;
  xpPaid: number;
};

/** Phase-advance guard: a wedged phase throws instead of spinning forever. */
const MAX_PHASE_ADVANCES = 10_000;

/** No kill and no damage for this long (simulated ms) = wedged on geometry. */
const STALL_TIMEOUT_MS = 15_000;
/** Net displacement over the stall window that still counts as "moving". */
const STALL_MOVE_RADIUS = 48;
/** How far one stall-breaker nudge drags the hero (world px). */
const NUDGE_DISTANCE = 60;

/**
 * Play ONE level headlessly with the autopilot at the controls and report
 * everything that happened. Deterministic per options (the bot draws nothing
 * from the RNG). The hero cannot die: a defeat revives at the spawn (booked
 * in `deaths`) and the run continues to victory or timeout.
 */
export function simulateLevel(options: SimulateLevelOptions): LevelReport {
  return runLevel(options).report;
}

/**
 * The level runner behind `simulateLevel`, also handing back the loadout the
 * hero walked OUT with — the campaign's carry-over channel (the app's
 * `extractLoadout`-on-victory, replayed here).
 */
export function runLevel(options: SimulateLevelOptions): {
  report: LevelReport;
  loadout: Loadout;
} {
  const {
    levelId,
    difficulty,
    seed = 1,
    loadout = null,
    strategy = "survivor",
    maxMinutes = 15,
    dtMs = 16,
    snapshotEveryMs = 60_000,
    unstick = true,
  } = options;

  const { report, state } = playRun({
    levelId,
    difficulty,
    seed,
    loadout,
    strategy,
    maxMinutes,
    dtMs,
    snapshotEveryMs,
    unstick,
  });
  return { report, loadout: extractLoadout(state) };
}

function playRun(args: {
  levelId: string;
  difficulty: Difficulty;
  seed: number;
  loadout: Loadout | null;
  strategy: BotStrategy;
  maxMinutes: number;
  dtMs: number;
  snapshotEveryMs: number;
  unstick: boolean;
}): { report: LevelReport; state: GameState } {
  const state = createGame(
    args.seed,
    args.levelId,
    args.difficulty,
    args.loadout ?? undefined,
  );
  const bot = createBot(args.strategy);
  const def = levelDef(args.levelId);
  const cap = xpLevelCap(args.levelId, args.difficulty);

  const levelStart = state.player.level;
  const mobs = new Map<string, MobAccumulator>();
  const seenEnemies = new Set<number>();
  const seenItems = new Set<number>();
  const spawnedByKind: Record<string, number> = {};
  const collectedByKind: Record<string, number> = {};
  const equipmentByTier: Partial<Record<Tier, number>> = {};
  const named: string[] = [];
  const weaponTimeline: WeaponSwap[] = [];
  const levelUps: { atMs: number; level: number }[] = [];
  const snapshots: HeroSnapshot[] = [];
  let autoEquipped = 0;
  let forfeited = 0;
  let reachedAtMs: number | null = null;
  let reviveDeaths = 0;
  let hitsLanded = 0;
  let critsLanded = 0;
  let damagePerHitSum = 0;
  let hitsTaken = 0;
  let unstuckNudges = 0;
  let lastProgressMs = 0;
  let lastKills = 0;
  let lastDamage = 0;
  let progressPos = { x: state.player.pos.x, y: state.player.pos.y };

  const trackSpawns = () => {
    for (const enemy of state.enemies) {
      if (seenEnemies.has(enemy.id)) continue;
      seenEnemies.add(enemy.id);
      const d = enemyDef(enemy.defId);
      if (d.apparition) continue; // scenery, not a combatant
      const acc = mobs.get(enemy.defId) ?? {
        spawned: 0,
        killed: 0,
        hpSum: 0,
        mlvlSum: 0,
        hitsFromHero: 0,
        damageFromHero: 0,
        xpPaid: 0,
      };
      acc.spawned++;
      acc.hpSum += enemy.maxHp;
      acc.mlvlSum += enemy.mlvl;
      mobs.set(enemy.defId, acc);
    }
    for (const item of state.items) {
      if (seenItems.has(item.id)) continue;
      seenItems.add(item.id);
      const kind = itemKindLabel(item);
      spawnedByKind[kind] = (spawnedByKind[kind] ?? 0) + 1;
    }
  };

  const takeSnapshot = () => {
    const weapon = state.player.equipment.weapon;
    snapshots.push({
      atMs: state.stats.timeMs,
      level: state.player.level,
      hp: Math.round(state.player.hp),
      maxHp: state.player.maxHp,
      dps: round1(weaponDps(state, weapon)),
      armorReduction: round3(armorReduction(state, currentMobLevel(state))),
      armor: totalArmor(state),
      kills: state.stats.kills,
      menaceStage: menaceStage(state),
    });
  };

  trackSpawns();
  takeSnapshot();
  let nextSnapshotMs = args.snapshotEveryMs;

  const maxTimeMs = args.maxMinutes * 60_000;
  let outcome: LevelReport["outcome"] = "timeout";
  let phaseAdvances = 0;
  let prevWeaponId = state.player.equipment.weapon.id;

  simulation: while (state.stats.timeMs < maxTimeMs) {
    // Un-wedge every paused phase the way a player's taps would.
    switch (state.phase) {
      case "cutscene":
        skipCutscene(state);
        guardPhase(++phaseAdvances);
        continue;
      case "intro":
      case "title":
        dismissIntro(state);
        guardPhase(++phaseAdvances);
        continue;
      case "dialogue":
        advanceDialogue(state);
        guardPhase(++phaseAdvances);
        continue;
      case "choice":
        // The autopilot never spares — companions would blur the balance read.
        resolveChoice(state, false);
        guardPhase(++phaseAdvances);
        continue;
      case "levelup": {
        allocateStat(state, botAllocate(bot, state));
        guardPhase(++phaseAdvances);
        continue;
      }
      case "outro":
        advanceOutro(state);
        guardPhase(++phaseAdvances);
        continue;
      case "victory":
        outcome = "victory";
        break simulation;
      case "defeat":
        // The calibration hero never stays down: stand back up at the
        // spawn, full bars, everything kept — the death is booked as a
        // pressure gauge and the measurement marches on.
        reviveDeaths++;
        state.player.hp = state.player.maxHp;
        state.player.stamina = state.player.maxStamina;
        state.player.pos = { ...state.playerSpawn };
        state.phase = "playing";
        guardPhase(++phaseAdvances);
        continue;
      default:
        break;
    }

    const beforeXpGained = state.stats.xpGained;
    step(state, botAct(bot, state), args.dtMs);
    phaseAdvances = 0;
    // Register same-step spawns BEFORE reading the events, so a mob hit the
    // tick it appeared still attributes its blows to the right accumulator.
    trackSpawns();

    // ---- Per-step bookkeeping off the event stream --------------------------------
    for (const event of state.events) {
      switch (event.type) {
        case "enemyHit": {
          const acc = mobs.get(event.defId);
          if (acc) {
            acc.hitsFromHero++;
            acc.damageFromHero += event.damage;
            hitsLanded++;
            damagePerHitSum += event.damage;
            if (event.crit) critsLanded++;
          }
          break;
        }
        case "enemyKilled": {
          const acc = mobs.get(event.defId);
          if (acc) {
            acc.killed++;
            acc.xpPaid += event.xp;
            // The killing blow is a landed hit too.
            acc.hitsFromHero++;
            acc.damageFromHero += event.damage;
            hitsLanded++;
            damagePerHitSum += event.damage;
            if (event.crit) critsLanded++;
          }
          break;
        }
        case "playerHurt":
          hitsTaken++;
          break;
        case "itemCollected": {
          const kind = event.tier ? `equipment` : event.kind;
          collectedByKind[kind] = (collectedByKind[kind] ?? 0) + 1;
          if (event.tier) {
            equipmentByTier[event.tier] =
              (equipmentByTier[event.tier] ?? 0) + 1;
            if (event.equipped) autoEquipped++;
            if (
              (event.tier === "unique" || event.tier === "legendary") &&
              event.name
            ) {
              named.push(event.name);
            }
          }
          break;
        }
        case "levelUp":
          levelUps.push({ atMs: state.stats.timeMs, level: event.level });
          break;
        default:
          break;
      }
    }

    // XP the per-map cap withheld this step: what the pre-cap grants would
    // have paid minus what actually landed.
    const capMult = xpCapMultiplier(state.player.level, cap);
    if (capMult < 1) {
      const landed = state.stats.xpGained - beforeXpGained;
      if (capMult > 0) {
        forfeited += Math.round(landed / capMult) - landed;
      } else {
        // At the ceiling nothing lands — book the kills' worth directly.
        for (const event of state.events) {
          if (event.type === "enemyKilled") {
            forfeited += Math.round(event.xp * BALANCE.xpGain);
          }
        }
      }
    }
    if (reachedAtMs === null && state.player.level >= cap) {
      reachedAtMs = state.stats.timeMs;
    }

    // Auto-equip swaps: the weapon in hand changed without the bot asking.
    const weapon = state.player.equipment.weapon;
    if (weapon.id !== prevWeaponId) {
      const last = weaponTimeline[weaponTimeline.length - 1];
      weaponTimeline.push({
        atMs: state.stats.timeMs,
        from: last?.to ?? "(start)",
        to: equipmentName(weapon),
        fromDps: last?.toDps ?? 0,
        toDps: round1(weaponDps(state, weapon)),
        tier: weapon.tier,
      });
      prevWeaponId = weapon.id;
    }

    if (state.stats.timeMs >= nextSnapshotMs) {
      takeSnapshot();
      nextSnapshotMs += args.snapshotEveryMs;
    }

    // Stall-breaker: the pathless autopilot wedged against geometry — no
    // kill, no damage dealt AND barely any net movement for a stretch — so
    // drag the hero straight toward the nearest foe (or the objective's
    // furthest landmark) and march on. The movement gate matters: a kiting
    // bot also deals no damage for stretches, and nudging a kiter into the
    // pack would just feed it to the horde.
    const moved = Math.hypot(
      state.player.pos.x - progressPos.x,
      state.player.pos.y - progressPos.y,
    );
    if (
      state.stats.kills > lastKills ||
      state.stats.damageDealt > lastDamage ||
      moved > STALL_MOVE_RADIUS
    ) {
      lastKills = state.stats.kills;
      lastDamage = state.stats.damageDealt;
      lastProgressMs = state.stats.timeMs;
      progressPos = { x: state.player.pos.x, y: state.player.pos.y };
    } else if (
      args.unstick &&
      state.stats.timeMs - lastProgressMs > STALL_TIMEOUT_MS
    ) {
      const target = nudgeTarget(state);
      if (target) {
        const dx = target.x - state.player.pos.x;
        const dy = target.y - state.player.pos.y;
        const d = Math.hypot(dx, dy) || 1;
        const hop = Math.min(NUDGE_DISTANCE, Math.max(0, d - 24));
        state.player.pos.x += (dx / d) * hop;
        state.player.pos.y += (dy / d) * hop;
        unstuckNudges++;
      }
      lastProgressMs = state.stats.timeMs;
      progressPos = { x: state.player.pos.x, y: state.player.pos.y };
    }
  }

  takeSnapshot();

  const weapon = state.player.equipment.weapon;
  const timeSec = Math.max(1, state.stats.timeMs / 1000);
  const stats = {} as Record<StatName, number>;
  for (const stat of [
    "stamina",
    "strength",
    "dexterity",
    "intelligence",
    "speed",
    "luck",
  ] as StatName[]) {
    stats[stat] = effectiveStat(state, stat);
  }

  const report: LevelReport = {
    levelId: args.levelId,
    levelName: def.name,
    difficulty: args.difficulty,
    seed: args.seed,
    strategy: args.strategy,
    outcome,
    deaths: reviveDeaths,
    timeMs: state.stats.timeMs,
    hero: {
      levelStart,
      levelEnd: state.player.level,
      xpGained: state.stats.xpGained,
      maxHp: state.player.maxHp,
      armor: totalArmor(state),
      armorReduction: round3(armorReduction(state, currentMobLevel(state))),
      weapon: {
        name: equipmentName(weapon),
        tier: weapon.tier,
        dps: round1(weaponDps(state, weapon)),
      },
      stats,
      coins: state.player.coins,
    },
    combat: {
      kills: state.stats.kills,
      totalEnemies: state.stats.totalEnemies,
      damageDealt: Math.round(state.stats.damageDealt),
      damageTaken: Math.round(state.stats.damageTaken),
      shotsFired: state.stats.shotsFired,
      hitsLanded,
      damagePerHit: hitsLanded ? round1(damagePerHitSum / hitsLanded) : 0,
      critRate: hitsLanded ? round3(critsLanded / hitsLanded) : 0,
      hitsTaken,
      damagePerHitTaken: hitsTaken
        ? round1(state.stats.damageTaken / hitsTaken)
        : 0,
      dpsOut: round1(state.stats.damageDealt / timeSec),
      killsPerMinute: round1(state.stats.kills / (timeSec / 60)),
      unstuckNudges,
    },
    drops: {
      spawnedByKind,
      collectedByKind,
      equipmentByTier,
      autoEquipped,
      named,
    },
    weaponTimeline,
    levelUps,
    snapshots,
    mobs: [...mobs.entries()]
      .map(([defId, acc]) => {
        const d = enemyDef(defId);
        const avgMaxHp = acc.spawned ? acc.hpSum / acc.spawned : 0;
        const avgHit = acc.hitsFromHero
          ? acc.damageFromHero / acc.hitsFromHero
          : 0;
        return {
          defId,
          name: d.name,
          role: d.role,
          spawned: acc.spawned,
          killed: acc.killed,
          avgMaxHp: round1(avgMaxHp),
          avgMlvl: acc.spawned ? round1(acc.mlvlSum / acc.spawned) : 0,
          contactDamage: d.contactDamage,
          hitsFromHero: acc.hitsFromHero,
          avgHitFromHero: round1(avgHit),
          hitsToKill: avgHit > 0 ? round1(avgMaxHp / avgHit) : 0,
          xpPaid: acc.xpPaid,
        };
      })
      .sort((a, b) => b.spawned - a.spawned),
    xpCap: { cap, reachedAtMs, forfeited },
  };
  return { report, state };
}

// ---- The campaign runner ----------------------------------------------------------

/**
 * Sweep the whole ladder — every requested difficulty in order, every story
 * level within it — carrying the hero's loadout from clear to clear exactly
 * as the app does (`extractLoadout` on victory). A level that never falls
 * (timeout) is reported as it ended and the campaign marches on with the
 * progress that run actually banked, so one wall doesn't hide the rest of
 * the ladder from the report.
 */
export function simulateCampaign(
  options: SimulateCampaignOptions = {},
): CampaignReport {
  const {
    difficulties = [...DIFFICULTY_ORDER],
    levels = [...LEVEL_ORDER],
    seed = 1,
    strategy = "survivor",
    maxMinutes = 15,
    dtMs = 16,
    snapshotEveryMs = 60_000,
    carryLoadout = true,
  } = options;

  const runs: LevelReport[] = [];
  let loadout: Loadout | null = null;
  let runIndex = 0;
  for (const difficulty of difficulties) {
    for (const levelId of levels) {
      const { report, loadout: banked } = runLevel({
        levelId,
        difficulty,
        seed: (seed + runIndex * 104_729) >>> 0,
        loadout,
        strategy,
        maxMinutes,
        dtMs,
        snapshotEveryMs,
      });
      runs.push(report);
      runIndex++;
      // The hero marches on with whatever the run banked — the app's
      // extractLoadout-on-victory, and on a wall (timeout) the progress the
      // run still earned, so one stuck level doesn't hide the rest of the
      // ladder from the report.
      if (carryLoadout) loadout = banked;
    }
  }

  const last = runs[runs.length - 1];
  return {
    seed,
    strategy,
    runs,
    finalLevel: last?.hero.levelEnd ?? 1,
    finalMaxHp: last?.hero.maxHp ?? 0,
    finalWeapon: last?.hero.weapon.name ?? "",
    totalDeaths: runs.reduce((sum, r) => sum + r.deaths, 0),
    totalKills: runs.reduce((sum, r) => sum + r.combat.kills, 0),
    totalTimeMs: runs.reduce((sum, r) => sum + r.timeMs, 0),
  };
}

// ---- Small helpers ----------------------------------------------------------------

/** Where a stall-breaker nudge drags the hero: the nearest live foe, else
 * the landmark furthest from the spawn (the objective's marker, matching the
 * bot's own boss-push heuristic). */
function nudgeTarget(state: GameState): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (const enemy of state.enemies) {
    if (enemyDef(enemy.defId).apparition) continue;
    const d = Math.hypot(
      enemy.pos.x - state.player.pos.x,
      enemy.pos.y - state.player.pos.y,
    );
    if (d < bestD) {
      best = enemy.pos;
      bestD = d;
    }
  }
  if (best) return best;
  let far: { x: number; y: number } | null = null;
  let farD = -1;
  for (const landmark of state.landmarks) {
    const d = Math.hypot(
      landmark.pos.x - state.playerSpawn.x,
      landmark.pos.y - state.playerSpawn.y,
    );
    if (d > farD) {
      far = landmark.pos;
      farD = d;
    }
  }
  return far;
}

function guardPhase(advances: number): void {
  if (advances > MAX_PHASE_ADVANCES) {
    throw new Error(
      "simulate: phase advance loop wedged — a paused phase never resumed",
    );
  }
}

function itemKindLabel(item: Item): string {
  if (item.kind === "equipment") return "equipment";
  if (item.kind === "ability") return `ability`;
  return item.kind;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
