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
// The simulated hero is IMMORTAL by default: this is a calibration
// instrument, so a death never ends a run — the hero stands back up at the
// spawn with full bars, the death is booked as a pressure gauge, and the
// measurement marches on. Lethality is a number the report carries, never a
// run-ender. Every death is also booked in a DEATH LEDGER (`report.deathLog`)
// with its CAUSE (the enemy defId or hazard that landed the fatal blow) and
// WORLD COORDINATES, clustered into areas the map renderer can draw — so
// "where and why does the bot die?" is a picture, not a guess. The `mortal`
// option flips the instrument into a survival read: a death STARTS THE LEVEL
// OVER (fresh map, the walk-in loadout, a new attempt seed), and `maxDeaths`
// aborts the run (outcome `"dead"`) once a limit is reached — the "this spot
// is too hard, stop measuring and go fix it" signal.
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
import { reviveHero } from "./arrival.ts";
import {
  botAct,
  botAllocate,
  createBot,
  type BotProfile,
  type BotStrategy,
} from "../game/bot/index.ts";
import {
  botAssignSpellBar,
  cullWorstLoot,
  sortBotInventory,
  stepBotWeaponSwap,
  tradeAtMerchant,
  wantsMerchantVisit,
  weaponStarved as heroWeaponStarved,
} from "../game/bot/economy.ts";
import { resolveChoice } from "../game/companions.ts";
import { createGame } from "../game/create.ts";
import { DIFFICULTY_ORDER } from "../game/defs/difficulties.ts";
import { enemyDef } from "../game/defs/enemies/index.ts";
import { STAT_NAMES } from "../game/defs/equipment.ts";
import { LEVEL_ORDER, levelDef } from "../game/defs/levels/index.ts";
import {
  advanceOutro,
  allocateStat,
  armorReduction,
  autoEquipBest,
  canEquip,
  dismissIntro,
  effectiveStat,
  equipmentName,
  itemLevelReq,
  skipCutscene,
  totalArmor,
  weaponDps,
} from "../game/items/index.ts";
import { xpCapMultiplier, xpLevelCap } from "../game/leveling.ts";
import {
  currentMobLevel,
  menaceFloorStage,
  menaceStage,
} from "../game/menace.ts";
import { advanceDialogue } from "../game/story.ts";
import { step } from "../game/step.ts";
import {
  BALANCE,
  type BalanceTuning,
  getBalanceTuning,
  setBalanceTuning,
} from "../game/tuning.ts";
import type {
  Difficulty,
  Equipment,
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
  /** Combat profile — the weapon lane the build commits to (default "meta", the
   * level-band melee → magic → melee strategy). */
  profile?: BotProfile;
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
  /**
   * Runtime balance multipliers to apply for this run — the SAME ten knobs the
   * DEVELOPER → BALANCE subpage exposes (`BalanceTuning`: xpGain, playerDamage,
   * mobHp, …). Applied via `setBalanceTuning` before the game is built and
   * restored to the prior tuning after, so a run can measure a candidate
   * balance without editing config or touching global state. Omit for the
   * shipped 1× tuning.
   */
  balance?: Partial<BalanceTuning>;
  /**
   * REALISTIC PACING. Without it the immortal bot farms a map for the whole
   * `maxMinutes`, over-levelling far past where a real player — who clears a map
   * and moves on — would be, which poisons every level-relative read
   * (loot-vs-level, boss-level, difficulty). When true, the run instead ENDS
   * (outcome `"cleared"`) once the hero reaches the map's INTENDED EXIT LEVEL —
   * `LevelDef.loot.arrowCapByDifficulty[difficulty]`, the level a normal single
   * clear leaves him at, the same yardstick the boss-level read uses — so he
   * carries a REPRESENTATIVE level into the next map. A map with no cap for this
   * rung is unbounded (falls through to victory/timeout). Omit/false = the
   * farm-to-the-cap read (endgame / L99 / artifact chase).
   */
  realisticPacing?: boolean;
  /**
   * Use the MERCHANT the way a real player would. The bot itself never shops,
   * so a weapon that breaks with an empty bag strands the hero on the
   * unbreakable sidearm (`blaster`) — a death spiral the bot can't escape,
   * which overstates high-difficulty pressure. With this on, whenever the hero
   * is weapon-starved (on the sidearm, or his weapon is nearly worn out) and a
   * merchant has been met, the sim walks him to the counter and runs the
   * recovery a player would: sell the bag for coins, repair the kit, buy the
   * best affordable weapon he can wield, and equip it. Lets a run measure
   * whether a high-difficulty stall is real balance or just the bot not
   * shopping. Counted in the report (`combat.shopVisits`).
   */
  autoShop?: boolean;
  /**
   * MORTAL MODE: instead of the immortal in-place revive, a death makes the
   * bot START THE LEVEL OVER — a fresh map built from a new attempt seed (a
   * player's retry rolls differently; replaying the same seed would die the
   * identical death forever), with the loadout he originally walked in with.
   * The run's clock, kills, and damage totals span every attempt, and each
   * death still lands in `report.deathLog` with its cause and coordinates.
   * Off (default) = the immortal calibration revive.
   */
  mortal?: boolean;
  /**
   * DEATH-LIMIT CANCELLATION: abort the run (outcome `"dead"`) once this many
   * deaths have been booked. If the bot keeps dying at the same place to the
   * same cause, more attempts just repeat the lesson — the level is too hard
   * there, and `report.deathLog.areas` carries the clustered coordinates to
   * visualize on the map (`map-layout.mjs --deaths` / `--highlight-file`) and
   * fix. Works in both mortal and immortal runs. 0/omitted = never abort.
   */
  maxDeaths?: number;
  /**
   * TELEMETRY hook: fired on every minion/elite/boss death with the hero's
   * level and difficulty at that moment (and whether the victim was a set
   * piece). Used by `scripts/stats-track.mjs` to bucket a run into a
   * kills-vs-level time series — the engine itself never sets it.
   */
  onKill?: (sample: {
    heroLevel: number;
    difficulty: Difficulty;
    levelId: string;
    isBoss: boolean;
  }) => void;
  /**
   * SPATIAL TRACE: sample the hero's position over the run and every kill's
   * location into `report.spatial` — the data the map renderer's `--heatmap`
   * overlay draws (dwell time = where the map was actually USED, plus where the
   * fights happened) and a coverage % of the map the hero entered. Off by
   * default so an ordinary run keeps the report lean.
   */
  trace?: boolean;
  /**
   * STUCK-PENALTY CANCELLATION: every time the runner catches the bot failing
   * to make progress — a WEDGE (the stall-breaker firing: no kill, no damage,
   * no net movement) or a LOITER loop (circling the same small patch without
   * landing a point of damage) — a penalty is booked at the hero's world
   * position, weighted heavier when it lands in an area that already failed
   * (the nudge didn't fix it). When the accumulated penalty reaches this
   * limit the run is CANCELLED (outcome `"stuck"`) instead of grinding out
   * the clock, and `report.stuck.areas` carries the clustered coordinates
   * where progress died — the structured feed for the map renderer's
   * `--highlight` overlay, so a navigation failure can be SEEN on the map and
   * iterated on. 0/omitted = never cancel (penalties are still recorded).
   */
  stuckLimit?: number;
  /**
   * The CAMERA the simulated player watches through — a world-px view size
   * stamped into `GameInput.view` every tick as a player-centred rect clamped
   * to the level, exactly the rect the app reports from its canvas
   * (render.ts `computeCamera`). It feeds every view-aware rule: enemy
   * targeting (only on-screen monsters are shot), spawner summon-in
   * placement, and the autopilot's wall-end sense (`state.view` — the bot
   * sees exactly what a player watching this screen would). Defaults to
   * {@link SIM_VIEW_DEFAULT}, the HORIZONTAL-PHONE baseline. Pass null to
   * run with no camera at all (the legacy blind-headless read).
   */
  view?: { width: number; height: number } | null;
};

/** The horizontal-phone baseline camera (world px): ~844×390 CSS at the
 * app's 2× view scale — the reference device (§ mobile-first, landscape)
 * every simulated run watches through unless overridden. */
export const SIM_VIEW_DEFAULT = { width: 422, height: 195 };

export type SimulateCampaignOptions = {
  /** Rungs to sweep, in order (default: the whole ladder, easy → JESUS). */
  difficulties?: Difficulty[];
  /** Story levels per rung (default: the whole catalog in story order). */
  levels?: string[];
  seed?: number;
  strategy?: BotStrategy;
  profile?: BotProfile;
  maxMinutes?: number;
  dtMs?: number;
  snapshotEveryMs?: number;
  /** Carry the hero across rungs (the real campaign) — default true. */
  carryLoadout?: boolean;
  /** Runtime balance multipliers applied to every run (see
   * SimulateLevelOptions.balance) — the DEVELOPER → BALANCE knobs. */
  balance?: Partial<BalanceTuning>;
  /** Realistic pacing: end each run at the map's intended exit level so the hero
   * carries a representative level forward (see SimulateLevelOptions). */
  realisticPacing?: boolean;
  /** Use the merchant to recover from a broken weapon (see
   * SimulateLevelOptions.autoShop) — real-player behaviour the bot lacks. */
  autoShop?: boolean;
  /**
   * The hero walking into the FIRST run of the sweep — a carried-over loadout to
   * start from instead of a fresh level-1 rookie. This is how a rung is measured
   * as it's actually played: `synthesizeArrival` mints a leveled, geared hero
   * (the campaign's intended entry state for the rung), and the sweep drops him
   * straight in. With `carryLoadout` on he then carries forward run to run.
   */
  startLoadout?: Loadout | null;
  /** Mortal mode forwarded to every run: a death starts the level over
   * instead of the immortal in-place revive (see SimulateLevelOptions). */
  mortal?: boolean;
  /** Abort a run (outcome `"dead"`) once it books this many deaths (see
   * SimulateLevelOptions.maxDeaths) — the sweep marches on to the next level
   * with whatever the aborted run banked. */
  maxDeaths?: number;
  /** Telemetry hook forwarded to every run (see SimulateLevelOptions.onKill). */
  onKill?: SimulateLevelOptions["onKill"];
  /** Cancel a run once its stuck penalty crosses this limit (see
   * SimulateLevelOptions.stuckLimit) — forwarded to every run; the sweep
   * marches on to the next level with whatever the cancelled run banked. */
  stuckLimit?: number;
  /** The camera every run watches through (see SimulateLevelOptions.view) —
   * default the horizontal-phone baseline; null = no camera. */
  view?: { width: number; height: number } | null;
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
  /** Current mana / max — the spell pool climbing with INTELLIGENCE. */
  mana: number;
  maxMana: number;
  /** Effective SPIRIT (the mana/health regen driver). */
  spirit: number;
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

/**
 * One elite/boss encounter, surfaced as a first-class event so the report
 * answers "at what point, and at what level, does the hero meet each boss, and
 * what does it drop?" — the campaign's pacing gates. Met = the boss/elite first
 * appears on the field; killed/drop are filled when it falls.
 */
export type BossEncounter = {
  defId: string;
  name: string;
  role: "boss" | "elite";
  /**
   * Whether the hero actually reached and traded blows with this boss. Elites
   * and bosses are usually PLACED at map load, so their spawn tells us nothing
   * about pacing — engagement (the first blow dealt or taken) is the moment the
   * fight starts, and the level/time/gear below are read THEN. A boss that
   * spawned but was never reached stays `engaged: false` with zeroed meet
   * fields (a time-boxed run that never got there — not a balance fault).
   */
  engaged: boolean;
  /** Simulated ms the fight started (first blow traded). 0 until engaged. */
  metAtMs: number;
  /** Hero level when the fight started. 0 until engaged. */
  heroLevel: number;
  /** Hero hp fraction in [0, 1] when the fight started. */
  heroHpFrac: number;
  /** Hero's equipped weapon name when the fight started. */
  heroWeapon: string;
  /** That weapon's expected DPS in the hero's hands then. */
  heroDps: number;
  /**
   * The level a normal single run of this map/difficulty is meant to leave the
   * hero at (the map's `loot.arrowCapByDifficulty`) — the yardstick for
   * `heroLevel`. null when the map declares no cap for this rung.
   */
  intendedHeroLevel: number | null;
  /** Boss monster level stamped at spawn. */
  bossLevel: number;
  bossMaxHp: number;
  bossContactDamage: number;
  /** Blows one clean kill takes at the hero's average blow (0 if never hit). */
  hitsToKill: number;
  killed: boolean;
  killedAtMs: number | null;
  /** Named unique/legendary dropped, attributed by kill order (null = none). */
  drop: string | null;
};

/** One booked no-progress moment: where the bot was when the detector fired. */
export type StuckEvent = {
  x: number;
  y: number;
  atMs: number;
  /** wedge = the stall-breaker fired (no kill/damage/net movement); loiter =
   * the bot kept moving but orbited the same small patch without landing a
   * point of damage — the "AI logic not working here" read. */
  kind: "wedge" | "loiter";
  /** Penalty this event carried (repeat offenses in a known area weigh more). */
  penalty: number;
};

/** Stuck events clustered by proximity — THE coordinates to highlight on the
 * map (`map-layout.mjs --highlight`): each area is a running centroid of the
 * events that landed within {@link STUCK_CLUSTER_RADIUS} of it. */
export type StuckArea = {
  x: number;
  y: number;
  count: number;
  penalty: number;
  /** How many of this area's events were wedges vs loiters. */
  wedges: number;
  loiters: number;
};

/** One menace-stage rise: when it happened (simulated ms), where on the map
 * (the overkilled victim / the hero at that moment — the coordinates to feed
 * `map-layout.mjs --highlight`), the stage entered, and which channel tipped
 * it: `overkill` (a one-shot's jolt), `ratchet` (the permanent evolution
 * floor lifting), or `heat` (the rolling DPS/kill-rate output). */
export type MenaceRise = {
  atMs: number;
  stage: number;
  x: number;
  y: number;
  cause: "overkill" | "ratchet" | "heat";
};

/** The run's escalation ledger: every stage rise timestamped and located,
 * plus where the meter ended up — the feed for "malice is off the scale on
 * nightmare, WHERE and WHEN did it blow up?". */
export type MenaceReport = {
  rises: MenaceRise[];
  /** The live stage / the permanent ratchet floor when the run ended. */
  finalStage: number;
  floorStage: number;
  /** The highest stage the run ever entered (0 = the meter never rose). */
  peakStage: number;
  /** Sim-ms of the FIRST stage rise (null = the meter never rose). */
  firstRiseAtMs: number | null;
};

/** One booked death: where the hero fell, when, at what level — and WHAT
 * killed him (`cause`: the enemy defId that landed the fatal blow, a
 * `hazard:<kind>` tag, or `"unknown"` when nothing attributed recently). */
export type DeathEvent = {
  x: number;
  y: number;
  atMs: number;
  heroLevel: number;
  cause: string;
};

/** Deaths clustered by proximity (running centroids, like {@link StuckArea})
 * — THE coordinates to draw on the map (`map-layout.mjs --deaths` /
 * `--highlight-file`). `causes` counts each killer's share of the area's
 * deaths, so "the same cause at the same place" reads directly off one row. */
export type DeathArea = {
  x: number;
  y: number;
  count: number;
  causes: Record<string, number>;
};

/** The death ledger (see `mortal` / `maxDeaths`): every death's cause and
 * coordinates, clustered into the areas to visualize on the map. Always
 * present — a deathless run reports empty lists. */
export type DeathReport = {
  /** Whether the run played in mortal (start-over) mode. */
  mortal: boolean;
  /** The death limit in force (0 = never abort). */
  limit: number;
  /** True when the run was ABORTED because deaths reached the limit. */
  aborted: boolean;
  events: DeathEvent[];
  areas: DeathArea[];
};

export type StuckReport = {
  /** Total penalty the run accumulated. */
  penalty: number;
  /** The cancellation threshold in force (0 = cancellation off). */
  limit: number;
  /** True when the run was CANCELLED because penalty reached the limit. */
  cancelled: boolean;
  events: StuckEvent[];
  areas: StuckArea[];
};

export type LevelReport = {
  levelId: string;
  levelName: string;
  difficulty: Difficulty;
  seed: number;
  strategy: BotStrategy;
  profile: BotProfile;
  outcome: "victory" | "timeout" | "cleared" | "stuck" | "dead";
  /** Deaths booked this run (immortal: revived and marched on; mortal: the
   * level restarted). The per-death detail lives in `deathLog`. */
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
    /** Total mana spent casting this run, and spells cast — the spell-economy
     * read (0 for a non-caster build). */
    manaSpent: number;
    spellsCast: number;
    /** Spells cast per simulated minute — how hard the caster leans on spells. */
    spellsPerMinute: number;
    /** JUMP takeoffs the hero spent this run (each costs `STAMINA.jumpCost`
     * of the pool) — the stamina-discipline read: jumps are for breaking a
     * genuine surround or clearing a stampede, so a run that racks these up is
     * bunny-hopping itself winded. Reported per run (and per minute in the
     * CLI) beside kills/damage. */
    jumps: number;
    /** Jumps per simulated minute — the at-a-glance hop cadence. */
    jumpsPerMinute: number;
    /** Stall-breaker teleports the runner had to apply (see `unstick`). */
    unstuckNudges: number;
    /** Merchant recovery visits the sim made (see `autoShop`) — how often the
     * hero had to run to the counter to re-arm after a weapon broke. */
    shopVisits: number;
    /** Special CHESTS the level placed (`LevelDef.chests`), and how many the
     * runner actually reached and cracked open — the reachability check for the
     * off-path caches. A level whose chest goes forever unlooted is telling the
     * designer a cache is walled off from the natural sweep. */
    chestsTotal: number;
    chestsLooted: number;
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
    /**
     * Per-drop level-appropriateness — do the equipment drops FIT the hero's
     * level, or is the map raining gear he's too low to wear (gated) or trash
     * beneath him? The read for "drops that make sense from a leveling
     * perspective." Each figure is over the equipment pieces actually resolved
     * at pickup.
     */
    equipment: {
      /** Equipment pieces collected and resolved. */
      total: number;
      /** Wearable on the spot — both the level and attribute gates pass. */
      equippableNow: number;
      /** Dropped ABOVE the hero's level gate: banked, can't wear yet. */
      levelGated: number;
      /** ilvl bands vs the hero's level at pickup (`APPROP_BAND` slack). */
      belowLevel: number;
      onLevel: number;
      aboveLevel: number;
      /**
       * Mean (drop ilvl − hero level). ~0 means the rain tracks the hero;
       * strongly negative = trash beneath him; strongly positive = aspirational
       * drops he can't use yet.
       */
      avgIlvlDelta: number;
    };
  };
  weaponTimeline: WeaponSwap[];
  levelUps: { atMs: number; level: number }[];
  snapshots: HeroSnapshot[];
  mobs: MobReport[];
  /** Every elite/boss met this run, in the order they appeared. */
  bosses: BossEncounter[];
  xpCap: {
    /** This (map × difficulty) pair's hero-level ceiling. */
    cap: number;
    /** Simulated ms at which the hero hit the ceiling (null = never). */
    reachedAtMs: number | null;
    /** XP the cap's taper withheld across the run. */
    forfeited: number;
  };
  /** The no-progress ledger (see `stuckLimit`): every wedge/loiter penalty the
   * run booked, clustered into the areas to highlight on the map. Always
   * present — a clean run reports zero penalty and empty lists. */
  stuck: StuckReport;
  /** The escalation ledger: every menace stage rise with its timestamp, map
   * coordinates, and cause, plus the final/floor/peak stages — the read for
   * "when and where did the horde evolve, and what tipped it?". */
  menace: MenaceReport;
  /** The death ledger (see `mortal` / `maxDeaths`): every death's cause and
   * world coordinates, clustered into the areas to draw on the map. */
  deathLog: DeathReport;
  /**
   * SPATIAL TRACE (only when `trace` was set): the hero's sampled path (dwell —
   * where the map was actually used), every kill's location, and the % of the
   * map grid the hero entered. Feeds the map renderer's `--heatmap` overlay.
   */
  spatial?: {
    /** Hero dwell samples (where the map was used). */
    path: { x: number; y: number }[];
    /** Every kill location. */
    kills: { x: number; y: number }[];
    /** Where each mob first appeared — the horde's entry map. */
    spawns: { x: number; y: number }[];
    /** Coarse mob-presence grid (where the horde formed/moved), row-major. */
    mobDensity: { cols: number; rows: number; cell: number; grid: number[] };
    /** % of the map grid the hero entered. */
    coveragePct: number;
  };
};

export type CampaignReport = {
  seed: number;
  strategy: BotStrategy;
  profile: BotProfile;
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

/** Slack (in levels) around the hero's level a drop's ilvl may sit and still
 * count "on level" — outside it a drop reads as trash (below) or gated (above). */
const APPROP_BAND = 3;

/** No kill and no damage for this long (simulated ms) = wedged on geometry. */
const STALL_TIMEOUT_MS = 15_000;
/** Net displacement over the stall window that still counts as "moving". */
const STALL_MOVE_RADIUS = 48;
/** How far one stall-breaker nudge drags the hero (world px). */
const NUDGE_DISTANCE = 60;

// ---- Stuck-penalty detection (see SimulateLevelOptions.stuckLimit) ---------
/** Events within this world distance of an area's centroid join that area —
 * the clustering that turns a stream of penalties into map coordinates. */
const STUCK_CLUSTER_RADIUS = 120;
/** Penalty for a FRESH failure area / for a REPEAT in a known one. A repeat
 * weighs double: the nudge already tried to fix that spot and the bot came
 * straight back — the strongest "this geometry/logic defeats the bot" signal. */
const STUCK_FRESH_PENALTY = 1;
const STUCK_REPEAT_PENALTY = 2;
/** Loiter detector: sampled positions over a sliding window. The bot LOITERS
 * when the window is full, it landed no damage and killed nothing since the
 * window opened, and every sample sits within LOITER_RADIUS of the centroid —
 * movement without progress (circling a wall pocket, shooting scenery). A
 * kiting bot deals damage and a travelling bot covers ground, so neither trips
 * it. */
const LOITER_SAMPLE_MS = 2_000;
const LOITER_WINDOW_MS = 30_000;
const LOITER_RADIUS = 140;
// ---- Death ledger (see SimulateLevelOptions.mortal / maxDeaths) ------------
/** Deaths within this world distance of an area's centroid join that area —
 * the same clustering the stuck ledger uses, so "he keeps dying HERE" is one
 * coordinate with a count, not a point cloud. */
const DEATH_CLUSTER_RADIUS = 120;
/** How recent the last attributed blow must be (simulated ms) to count as the
 * death's cause — anything older books as "unknown". The fatal blow lands the
 * same tick the phase drops to defeat, so this is pure slack. */
const DEATH_CAUSE_WINDOW_MS = 2_000;
/** Seed stride between mortal-mode attempts: each restart rebuilds the level
 * from `seed + attempt × stride` (a prime, like the campaign's run stride) so
 * a retry rolls differently — the same seed would die the identical death
 * forever — while the whole run stays deterministic per options. */
const MORTAL_ATTEMPT_SEED_STRIDE = 7_919;

/** Minimum simulated ms between merchant recovery visits (autoShop) — so a hero
 * who can't afford or can't wield an upgrade fights on instead of spinning at
 * the counter every tick. */
const SHOP_COOLDOWN_MS = 20_000;

/**
 * Play ONE level headlessly with the autopilot at the controls and report
 * everything that happened. Deterministic per options (the bot draws nothing
 * from the RNG). By default the hero cannot die: a defeat revives at the
 * spawn (booked in `deaths` and `deathLog`) and the run continues to victory
 * or timeout. With `mortal` a death restarts the level instead, and
 * `maxDeaths` aborts the run once the limit is reached.
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
    profile = "meta",
    maxMinutes = 15,
    dtMs = 16,
    snapshotEveryMs = 60_000,
    unstick = true,
    balance,
    realisticPacing,
    autoShop,
    mortal,
    maxDeaths = 0,
    onKill,
    trace,
    stuckLimit = 0,
    view = SIM_VIEW_DEFAULT,
  } = options;

  // Apply the requested balance knobs for the duration of the run, then put the
  // global tuning back exactly as we found it — the sim measures a candidate
  // tuning without leaking it into a later run or a test.
  const priorBalance = getBalanceTuning();
  if (balance) setBalanceTuning(balance);
  try {
    const { report, state } = playRun({
      levelId,
      difficulty,
      seed,
      loadout,
      strategy,
      profile,
      maxMinutes,
      dtMs,
      snapshotEveryMs,
      unstick,
      realisticPacing,
      autoShop,
      mortal,
      maxDeaths,
      onKill,
      trace,
      stuckLimit,
      view,
    });
    return { report, loadout: extractLoadout(state) };
  } finally {
    if (balance) setBalanceTuning(priorBalance);
  }
}

/** The world rect a `view`-sized camera shows: player-centred, clamped to the
 * level (a level smaller than the view parks centred inside it) — the sim-side
 * mirror of the app's render.ts `computeCamera`, which the engine must not
 * import from the app layer. */
function simCamera(
  state: GameState,
  view: { width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  const clampAxis = (center: number, span: number, level: number) =>
    span >= level
      ? Math.round((level - span) / 2)
      : Math.round(Math.min(Math.max(center - span / 2, 0), level - span));
  return {
    x: clampAxis(state.player.pos.x, view.width, state.level.width),
    y: clampAxis(state.player.pos.y, view.height, state.level.height),
    width: view.width,
    height: view.height,
  };
}

function playRun(args: {
  levelId: string;
  difficulty: Difficulty;
  seed: number;
  loadout: Loadout | null;
  strategy: BotStrategy;
  profile: BotProfile;
  maxMinutes: number;
  dtMs: number;
  snapshotEveryMs: number;
  unstick: boolean;
  realisticPacing?: boolean;
  autoShop?: boolean;
  mortal?: boolean;
  maxDeaths: number;
  onKill?: SimulateLevelOptions["onKill"];
  trace?: boolean;
  stuckLimit: number;
  view: { width: number; height: number } | null;
}): { report: LevelReport; state: GameState } {
  // `let`, not `const`: a mortal-mode death rebuilds the whole game (see
  // restartLevel below) — every closure in this runner reads the binding, so
  // they all follow the live attempt.
  let state = createGame(
    args.seed,
    args.levelId,
    args.difficulty,
    args.loadout ?? undefined,
  );
  // The run clock spans every mortal attempt: `now()` is the simulated time
  // since the RUN began, not since the current attempt's map was built. All
  // timestamps and the time budget read it, so a restart never rewinds them.
  let timeBaseMs = 0;
  const now = () => timeBaseMs + state.stats.timeMs;
  // Stats banked from attempts a mortal death ended — the report sums these
  // with the final state's own ledger so a restart never erases what a dead
  // attempt measured.
  const banked = {
    kills: 0,
    totalEnemies: 0,
    damageDealt: 0,
    damageTaken: 0,
    shotsFired: 0,
    xpGained: 0,
    manaSpent: 0,
    spellsCast: 0,
    jumps: 0,
  };
  const bot = createBot(args.strategy, args.profile);
  // A carried caster may arrive with unlocked spells but a blank (or stale)
  // bar — settle it onto the strongest unlocked powers so the bot casts from
  // the first tick (the app's autoplay runs the same bar step).
  botAssignSpellBar(state);
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
  // Named finds with their collection time — the channel that attributes a
  // unique/legendary drop to the boss whose death (just before) minted it.
  const namedCollected: { name: string; atMs: number }[] = [];
  // One record per elite/boss def, minted the tick it first appears. `killedAtMs`
  // and `drop` are filled in later; `intendedHeroLevel` is the map's yardstick.
  const bosses = new Map<string, BossEncounter>();
  const intendedHeroLevel =
    def.loot?.arrowCapByDifficulty?.[args.difficulty] ?? null;
  // The fight has started — book the hero's level/hp/gear the moment the first
  // blow lands on this boss (idempotent: only the first call takes).
  const engageBoss = (defId: string) => {
    const boss = bosses.get(defId);
    if (!boss || boss.engaged) return;
    const weapon = state.player.equipment.weapon;
    boss.engaged = true;
    boss.metAtMs = now();
    boss.heroLevel = state.player.level;
    boss.heroHpFrac = round3(state.player.hp / state.player.maxHp);
    boss.heroWeapon = equipmentName(weapon);
    boss.heroDps = round1(weaponDps(state, weapon));
  };
  const weaponTimeline: WeaponSwap[] = [];
  const levelUps: { atMs: number; level: number }[] = [];
  const snapshots: HeroSnapshot[] = [];
  // The escalation ledger: every menaceRose the engine emits, timestamped and
  // located — the "when/where did malice blow up" feed for the map renderer.
  const menaceRises: MenaceRise[] = [];
  let autoEquipped = 0;
  // Loot-vs-level accumulators (see drops.equipment) — filled as pieces resolve.
  let equipTotal = 0;
  let equippableNow = 0;
  let levelGated = 0;
  let ilvlBelow = 0;
  let ilvlOn = 0;
  let ilvlAbove = 0;
  let ilvlDeltaSum = 0;
  // Find a just-collected piece by its stable id (worn slot or bag cell) so its
  // ilvl / level requirement can be judged against the hero at pickup.
  const findEquipment = (id: number): Equipment | null => {
    const worn = state.player.equipment;
    for (const piece of [
      worn.weapon,
      worn.head,
      worn.chest,
      worn.legs,
      worn.feet,
      worn.charm,
      worn.bag,
    ]) {
      if (piece && piece.id === id) return piece;
    }
    for (const cell of state.player.inventory) {
      if (cell && cell.id === id) return cell;
    }
    return null;
  };
  let forfeited = 0;
  let reachedAtMs: number | null = null;
  // The special chests the level placed — counted up front so the report can say
  // how many the runner actually reached (a looted chest is gone from
  // `state.obstacles`), the reachability check for the off-path caches.
  const chestsTotal = state.obstacles.filter((o) => o.chest).length;
  let hitsLanded = 0;
  let critsLanded = 0;
  let damagePerHitSum = 0;
  let hitsTaken = 0;
  let unstuckNudges = 0;
  let shopVisits = 0;
  let lastShopMs = -Infinity;
  let lastProgressMs = 0;
  let lastKills = 0;
  let lastDamage = 0;
  let progressPos = { x: state.player.pos.x, y: state.player.pos.y };

  // ---- The stuck-penalty ledger (see `stuckLimit`) -------------------------
  // Every no-progress moment books a penalty at the hero's position; events
  // cluster into areas (running centroids) so the report hands the map
  // renderer a short list of "the bot fails HERE" coordinates instead of a
  // point cloud. A repeat in a known area weighs double — the strongest sign
  // that spot genuinely defeats the bot's navigation.
  const stuckEvents: StuckEvent[] = [];
  const stuckAreas: StuckArea[] = [];
  let stuckPenalty = 0;
  const bookStuck = (kind: StuckEvent["kind"], x: number, y: number): void => {
    let area: StuckArea | null = null;
    for (const a of stuckAreas) {
      if (Math.hypot(a.x - x, a.y - y) <= STUCK_CLUSTER_RADIUS) {
        area = a;
        break;
      }
    }
    const penalty = area ? STUCK_REPEAT_PENALTY : STUCK_FRESH_PENALTY;
    if (area) {
      // Running centroid, so the area tracks where its events actually land.
      area.x = Math.round((area.x * area.count + x) / (area.count + 1));
      area.y = Math.round((area.y * area.count + y) / (area.count + 1));
      area.count++;
      area.penalty += penalty;
      if (kind === "wedge") area.wedges++;
      else area.loiters++;
    } else {
      stuckAreas.push({
        x: Math.round(x),
        y: Math.round(y),
        count: 1,
        penalty,
        wedges: kind === "wedge" ? 1 : 0,
        loiters: kind === "loiter" ? 1 : 0,
      });
    }
    stuckPenalty += penalty;
    stuckEvents.push({
      x: Math.round(x),
      y: Math.round(y),
      atMs: now(),
      kind,
      penalty,
    });
  };
  // ---- The death ledger (see `mortal` / `maxDeaths`) -----------------------
  // Every death books WHERE the hero fell and WHAT felled him — the most
  // recent attributed blow (`playerHurt.cause`; a black-hole devour maps from
  // its `wellDeath` event). Deaths cluster into areas exactly like the stuck
  // ledger, so a spot that keeps killing reads as ONE coordinate with a count
  // and a per-cause breakdown — the map renderer's death overlay.
  const deathEvents: DeathEvent[] = [];
  const deathAreas: DeathArea[] = [];
  let lastHurtCause: { cause: string; atMs: number } | null = null;
  const bookDeath = (): void => {
    const x = Math.round(state.player.pos.x);
    const y = Math.round(state.player.pos.y);
    const cause =
      lastHurtCause && now() - lastHurtCause.atMs <= DEATH_CAUSE_WINDOW_MS
        ? lastHurtCause.cause
        : "unknown";
    deathEvents.push({
      x,
      y,
      atMs: now(),
      heroLevel: state.player.level,
      cause,
    });
    let area: DeathArea | null = null;
    for (const a of deathAreas) {
      if (Math.hypot(a.x - x, a.y - y) <= DEATH_CLUSTER_RADIUS) {
        area = a;
        break;
      }
    }
    if (area) {
      // Running centroid, so the area tracks where its deaths actually land.
      area.x = Math.round((area.x * area.count + x) / (area.count + 1));
      area.y = Math.round((area.y * area.count + y) / (area.count + 1));
      area.count++;
      area.causes[cause] = (area.causes[cause] ?? 0) + 1;
    } else {
      deathAreas.push({ x, y, count: 1, causes: { [cause]: 1 } });
    }
  };

  // Loiter detector state: a sliding window of sampled positions plus the
  // kill/damage anchors from when the window opened.
  let loiterSamples: { x: number; y: number }[] = [];
  let loiterAccumMs = 0;
  let loiterKills = state.stats.kills;
  let loiterDamage = state.stats.damageDealt;
  const resetLoiter = (): void => {
    loiterSamples = [];
    loiterAccumMs = 0;
    loiterKills = state.stats.kills;
    loiterDamage = state.stats.damageDealt;
  };

  // Spatial trace (opt-in, `args.trace`): the hero's sampled dwell path, kill
  // positions, and a coarse coverage grid (which map cells he entered).
  const tracePath: { x: number; y: number }[] = [];
  const traceKills: { x: number; y: number }[] = [];
  const traceSpawns: { x: number; y: number }[] = [];
  const coverageCells = new Set<number>();
  const TRACE_SAMPLE_MS = 500;
  const COVER_CELL = 96;
  const coverCols = Math.max(1, Math.ceil(state.level.width / COVER_CELL));
  const coverRows = Math.max(1, Math.ceil(state.level.height / COVER_CELL));
  // Mob density: accumulated enemy presence per coarse cell over the run —
  // where the horde actually FORMS and MOVES (vs the hero's dwell), so a map's
  // packs/waves/geometry can be checked against where the pressure lands.
  const mobDensity = new Float64Array(coverCols * coverRows);
  const SPAWN_CAP = 4000; // bound the spawn-marker list on long runs
  let traceAccumMs = 0;
  const coverIdx = (x: number, y: number) =>
    Math.min(coverRows - 1, Math.max(0, Math.floor(y / COVER_CELL))) *
      coverCols +
    Math.min(coverCols - 1, Math.max(0, Math.floor(x / COVER_CELL)));

  // The hero can't fight his way out with the unbreakable fallback sidearm, or
  // with a weapon about to snap — the cue to run to the merchant (autoShop).
  const weaponStarved = (): boolean => heroWeaponStarved(state);
  // The recovery a player would run at the counter — the shared bot COUNTER
  // ROUTINE (bot/economy.ts): bank the bag's outgrown junk for coins, buy the
  // best weapon he can wield and afford, mend the kit, stock powerups, equip
  // up. Only fires when actually at the stall (openShop is proximity-gated).
  // Returns whether the shop actually opened — the caller cools down on a real
  // visit so a hero who can't afford/wield an upgrade fights on instead of
  // spinning at the counter (else a level-gated stall spams tens of thousands
  // of visits).
  const recoverAtMerchant = (): boolean => {
    autoEquipBest(state); // a decent bag weapon may end the starve for free
    if (!weaponStarved() && !wantsMerchantVisit(state)) return false;
    if (!tradeAtMerchant(state)) return false;
    shopVisits++;
    return true;
  };

  const trackSpawns = () => {
    for (const enemy of state.enemies) {
      if (seenEnemies.has(enemy.id)) continue;
      seenEnemies.add(enemy.id);
      const d = enemyDef(enemy.defId);
      if (d.apparition) continue; // scenery, not a combatant
      // Spatial trace: where each mob first appeared (wave ring, pack anchor,
      // placed spawn) — the horde's ENTRY map.
      if (args.trace && traceSpawns.length < SPAWN_CAP)
        traceSpawns.push({
          x: Math.round(enemy.pos.x),
          y: Math.round(enemy.pos.y),
        });
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

      // Register the boss's fixed stats at spawn (level, hp, contact damage);
      // the pacing fields — hero level/time/gear — are filled in on ENGAGEMENT
      // (see the event loop), since a placed boss's spawn is just map load.
      if (
        (d.role === "boss" || d.role === "elite") &&
        !bosses.has(enemy.defId)
      ) {
        bosses.set(enemy.defId, {
          defId: enemy.defId,
          name: d.name,
          role: d.role,
          engaged: false,
          metAtMs: 0,
          heroLevel: 0,
          heroHpFrac: 0,
          heroWeapon: "",
          heroDps: 0,
          intendedHeroLevel,
          bossLevel: enemy.mlvl,
          bossMaxHp: enemy.maxHp,
          bossContactDamage: d.contactDamage,
          hitsToKill: 0,
          killed: false,
          killedAtMs: null,
          drop: null,
        });
      }
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
      atMs: now(),
      level: state.player.level,
      hp: Math.round(state.player.hp),
      maxHp: state.player.maxHp,
      dps: round1(weaponDps(state, weapon)),
      armorReduction: round3(armorReduction(state, currentMobLevel(state))),
      armor: totalArmor(state),
      kills: state.stats.kills,
      menaceStage: menaceStage(state),
      mana: Math.round(state.player.mana),
      maxMana: state.player.maxMana,
      spirit: Math.round(effectiveStat(state, "spirit")),
    });
  };

  trackSpawns();
  takeSnapshot();
  let nextSnapshotMs = args.snapshotEveryMs;

  // Realistic-pacing target: the level a normal single clear leaves the hero at
  // (`intendedHeroLevel` = the map's arrowCapByDifficulty, computed above). In
  // realistic mode the run ends `"cleared"` the moment the hero reaches it, so
  // he carries a real-player level forward instead of farming to the cap. A map
  // with no cap for this rung stays unbounded.
  const pacingLevel =
    args.realisticPacing && intendedHeroLevel !== null
      ? intendedHeroLevel
      : Infinity;

  const maxTimeMs = args.maxMinutes * 60_000;
  let outcome: LevelReport["outcome"] = "timeout";
  let phaseAdvances = 0;
  let prevWeaponId = state.player.equipment.weapon.id;

  // MORTAL restart: a death starts the level OVER — a fresh map from a new
  // attempt seed (a retry that rolls differently; the same seed would replay
  // the identical death forever), the loadout the hero originally walked in
  // with, and every per-attempt tracker re-anchored. The run's clock and the
  // banked totals march on across attempts (see `timeBaseMs` / `banked`).
  let attempt = 0;
  const restartLevel = (): void => {
    // Bank the dead attempt's ledger before the new game erases it.
    timeBaseMs += state.stats.timeMs;
    banked.kills += state.stats.kills;
    banked.totalEnemies += state.stats.totalEnemies;
    banked.damageDealt += state.stats.damageDealt;
    banked.damageTaken += state.stats.damageTaken;
    banked.shotsFired += state.stats.shotsFired;
    banked.xpGained += state.stats.xpGained;
    banked.manaSpent += state.stats.manaSpent;
    banked.spellsCast += state.stats.spellsCast;
    banked.jumps += state.stats.jumps;
    attempt++;
    state = createGame(
      (args.seed + attempt * MORTAL_ATTEMPT_SEED_STRIDE) >>> 0,
      args.levelId,
      args.difficulty,
      args.loadout ?? undefined,
    );
    botAssignSpellBar(state);
    // A fresh field: the re-placed mobs and drops are NEW spawns (the old ids
    // would collide with the new game's counter and hide them from the books).
    seenEnemies.clear();
    seenItems.clear();
    prevWeaponId = state.player.equipment.weapon.id;
    // Re-anchor every no-progress detector to the new attempt's zeroed stats,
    // so the stall-breaker doesn't read the reset as fifteen silent seconds.
    lastKills = 0;
    lastDamage = 0;
    lastProgressMs = now();
    progressPos = { x: state.player.pos.x, y: state.player.pos.y };
    resetLoiter();
    lastShopMs = -Infinity;
    lastHurtCause = null;
    trackSpawns();
  };

  simulation: while (now() < maxTimeMs) {
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
        // If the bot's pick is at the level-scaled cap it won't take; dump the
        // point into any stat that still has room so the ding always resolves.
        if (!allocateStat(state, botAllocate(bot, state))) {
          for (const s of STAT_NAMES) if (allocateStat(state, s)) break;
        }
        // A ding may have unlocked a spell (INT crossed a ×10 mark): clear the
        // modal queue and re-settle the bar onto the strongest unlocked powers
        // so the bot casts them (the app's autoplay runs the same bar step).
        state.pendingSpellUnlocks.length = 0;
        botAssignSpellBar(state);
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
        // Book the death — where the hero fell and what felled him — before
        // anything resets the scene.
        bookDeath();
        if (args.maxDeaths > 0 && deathEvents.length >= args.maxDeaths) {
          // The death limit: the map (or the balance) defeats the bot here,
          // and more attempts would just repeat the lesson — abort so the
          // ledger's clustered coordinates can be looked at and fixed.
          outcome = "dead";
          break simulation;
        }
        if (args.mortal) {
          // MORTAL: start the level over (fresh map, walk-in loadout, a new
          // attempt seed) — the survival read, not the calibration one.
          restartLevel();
        } else {
          // The calibration hero never stays down: stand back up, full bars,
          // everything kept — the death is booked as a pressure gauge and the
          // measurement marches on. He revives at the open point FURTHEST
          // from the swarm (reviveHero), not on top of it, so a spawn-camp
          // loop can't book hundreds of phantom deaths that read as
          // lethality.
          reviveHero(state);
        }
        guardPhase(++phaseAdvances);
        continue;
      default:
        break;
    }

    const beforeXpGained = state.stats.xpGained;
    // POCKET ARSENAL: keep the hand on whatever maximizes damage this moment
    // — the blade with a body in blade reach, the banked ranged/magic shot
    // out of reach and through every airborne frame (see bot/economy.ts
    // stepBotWeaponSwap).
    stepBotWeaponSwap(bot, state);
    const input = botAct(bot, state);
    // The camera the simulated player watches through: player-centred and
    // clamped to the level, the same rect the app stamps from its canvas
    // (render.ts computeCamera) — so targeting, summon-in and the bot's
    // wall-end sense all run as they do on a real screen.
    if (args.view) input.view = simCamera(state, args.view);
    step(state, input, args.dtMs);
    phaseAdvances = 0;
    // BAG DISCIPLINE: keep a cell open by dropping the cheapest outgrown junk
    // (keepers, the pocket arsenal, and the good sell-fodder stay — see
    // bot/economy.ts), so the next drop always has a home. Cheap when a slot
    // is already free. Then keep the bag SORTED (pockets up front, loot by
    // preciousness) the way the powerup dock sorts its slots.
    cullWorstLoot(state);
    sortBotInventory(state);

    // Spatial trace: mark the cell the hero is in, and sample his path + the
    // horde's positions on a fixed cadence (dwell time = how long he lingered
    // where; mob density = where the horde formed and moved).
    if (args.trace) {
      coverageCells.add(coverIdx(state.player.pos.x, state.player.pos.y));
      traceAccumMs += args.dtMs;
      if (traceAccumMs >= TRACE_SAMPLE_MS) {
        traceAccumMs -= TRACE_SAMPLE_MS;
        tracePath.push({
          x: Math.round(state.player.pos.x),
          y: Math.round(state.player.pos.y),
        });
        for (const enemy of state.enemies) {
          if (enemyDef(enemy.defId).apparition) continue;
          const idx = coverIdx(enemy.pos.x, enemy.pos.y);
          mobDensity[idx] = (mobDensity[idx] ?? 0) + 1;
        }
      }
    }
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
          engageBoss(event.defId);
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
          engageBoss(event.defId);
          const boss = bosses.get(event.defId);
          if (boss && boss.killedAtMs === null) {
            boss.killed = true;
            boss.killedAtMs = now();
          }
          if (args.trace)
            traceKills.push({
              x: Math.round(event.pos.x),
              y: Math.round(event.pos.y),
            });
          args.onKill?.({
            heroLevel: state.player.level,
            difficulty: args.difficulty,
            levelId: args.levelId,
            isBoss: enemyDef(event.defId).role !== "minion",
          });
          break;
        }
        case "playerHurt":
          hitsTaken++;
          // Remember the last ATTRIBUTED blow — the death ledger's cause. The
          // scripted opening flash carries no cause (and no damage), so it
          // never masks a real killer.
          if (event.cause) lastHurtCause = { cause: event.cause, atMs: now() };
          break;
        case "wellDeath":
          // The black hole devour zeroes hp directly — no playerHurt fires —
          // so its own event feeds the cause channel.
          lastHurtCause = { cause: "hazard:black_hole", atMs: now() };
          break;
        case "itemCollected": {
          const kind = event.tier ? `equipment` : event.kind;
          collectedByKind[kind] = (collectedByKind[kind] ?? 0) + 1;
          if (event.tier) {
            equipmentByTier[event.tier] =
              (equipmentByTier[event.tier] ?? 0) + 1;
            if (event.equipped) autoEquipped++;
            // Judge the piece against the hero: is it wearable now, and does its
            // ilvl track his level or fall outside the appropriateness band?
            const piece =
              event.itemId != null ? findEquipment(event.itemId) : null;
            if (piece) {
              equipTotal++;
              const delta = piece.ilvl - state.player.level;
              ilvlDeltaSum += delta;
              if (delta <= -APPROP_BAND) ilvlBelow++;
              else if (delta >= APPROP_BAND) ilvlAbove++;
              else ilvlOn++;
              if (canEquip(state, piece)) equippableNow++;
              if (state.player.level < itemLevelReq(piece)) {
                levelGated++;
              }
            }
            if (
              (event.tier === "unique" || event.tier === "legendary") &&
              event.name
            ) {
              named.push(event.name);
              namedCollected.push({
                name: event.name,
                atMs: now(),
              });
            }
          }
          break;
        }
        case "levelUp":
          levelUps.push({ atMs: now(), level: event.level });
          break;
        case "menaceRose":
          menaceRises.push({
            atMs: state.stats.timeMs,
            stage: event.stage,
            x: Math.round(event.pos.x),
            y: Math.round(event.pos.y),
            cause: event.cause,
          });
          break;
        default:
          break;
      }
    }

    // Realistic pacing: reached the level a normal clear leaves us at — a real
    // player moves on, so end the run here (the hero carries this level forward)
    // instead of farming the rest to the cap.
    if (state.player.level >= pacingLevel) {
      outcome = "cleared";
      takeSnapshot();
      break simulation;
    }

    // XP the per-map cap withheld this step: what the pre-cap grants would
    // have paid minus what actually landed. The multiplier bottoms out at
    // `XP_CAP.floor` (never zero — the ~1/100 trickle past the cap), so a grant
    // always lands and the ratio recovers the pre-cap total; the zero-mult
    // branch is kept only as a guard for a hypothetical floor of 0.
    const capMult = xpCapMultiplier(state.player.level, cap);
    if (capMult < 1) {
      const landed = state.stats.xpGained - beforeXpGained;
      if (capMult > 0) {
        forfeited += Math.round(landed / capMult) - landed;
      } else {
        // Only reachable if the floor is ever set to 0 — book the kills'
        // worth directly since nothing lands to scale back up.
        for (const event of state.events) {
          if (event.type === "enemyKilled") {
            forfeited += Math.round(event.xp * BALANCE.xpGain);
          }
        }
      }
    }
    if (reachedAtMs === null && state.player.level >= cap) {
      reachedAtMs = now();
    }

    // Auto-equip swaps: the weapon in hand changed without the bot asking.
    const weapon = state.player.equipment.weapon;
    if (weapon.id !== prevWeaponId) {
      const last = weaponTimeline[weaponTimeline.length - 1];
      weaponTimeline.push({
        atMs: now(),
        from: last?.to ?? "(start)",
        to: equipmentName(weapon),
        fromDps: last?.toDps ?? 0,
        toDps: round1(weaponDps(state, weapon)),
        tier: weapon.tier,
      });
      prevWeaponId = weapon.id;
    }

    if (now() >= nextSnapshotMs) {
      takeSnapshot();
      nextSnapshotMs += args.snapshotEveryMs;
    }

    // Merchant recovery (autoShop): a weapon that broke with an empty bag
    // strands the hero on the sidearm — real-player play the bot lacks. Run him
    // to the counter and re-arm (sell → buy → repair → equip), so a
    // high-difficulty stall reads as BALANCE rather than the bot never shopping.
    // The big hop trips the stall-breaker's movement gate below, so the two
    // never fight over where to drag him.
    if (
      args.autoShop &&
      state.phase === "playing" &&
      (weaponStarved() || wantsMerchantVisit(state)) &&
      now() - lastShopMs >= SHOP_COOLDOWN_MS
    ) {
      // At the counter, recoverAtMerchant opens the shop and re-arms; a real
      // visit starts the cooldown so a hero who can't afford/wield an upgrade
      // fights on with what he has instead of spamming the counter every tick.
      if (recoverAtMerchant()) {
        lastShopMs = now();
      } else if (weaponStarved()) {
        // STARVED but not at the counter yet → drag him toward it (even before
        // it's DISCOVERED: the bot only seeks a merchant it has met, so a
        // stranded hero would never find one; walking him over discovers it via
        // stepMerchant, then a later tick opens the shop). Stop ~40px short,
        // inside the trade radius. An ordinary sell-run gets no drag — the bot
        // walks the errand itself (`wantsMerchantVisit` in macroTarget).
        const m = state.merchant.pos;
        const dx = m.x - state.player.pos.x;
        const dy = m.y - state.player.pos.y;
        const d = Math.hypot(dx, dy) || 1;
        const hop = Math.min(NUDGE_DISTANCE, Math.max(0, d - 40));
        state.player.pos.x += (dx / d) * hop;
        state.player.pos.y += (dy / d) * hop;
      }
    }

    // Loiter detector: the bot keeps MOVING (so the wedge gate below never
    // fires) but orbits the same small patch without landing a point of
    // damage — a navigation loop or a fight read that isn't working (shooting
    // scenery, circling a wall pocket). Sample the position on a cadence; any
    // kill or damage progress resets the window, so a kiting bot (dealing
    // damage) and a travelling bot (covering ground) never trip it.
    loiterAccumMs += args.dtMs;
    if (loiterAccumMs >= LOITER_SAMPLE_MS) {
      loiterAccumMs -= LOITER_SAMPLE_MS;
      if (
        state.stats.kills > loiterKills ||
        state.stats.damageDealt > loiterDamage
      ) {
        resetLoiter();
      } else {
        loiterSamples.push({ x: state.player.pos.x, y: state.player.pos.y });
        const windowFull =
          loiterSamples.length >= LOITER_WINDOW_MS / LOITER_SAMPLE_MS;
        if (windowFull) {
          let cx = 0;
          let cy = 0;
          for (const s of loiterSamples) {
            cx += s.x;
            cy += s.y;
          }
          cx /= loiterSamples.length;
          cy /= loiterSamples.length;
          const spread = Math.max(
            ...loiterSamples.map((s) => Math.hypot(s.x - cx, s.y - cy)),
          );
          if (spread <= LOITER_RADIUS) {
            bookStuck("loiter", cx, cy);
            resetLoiter();
          } else {
            loiterSamples.shift(); // slide the window forward
          }
        }
      }
    }
    if (args.stuckLimit > 0 && stuckPenalty >= args.stuckLimit) {
      outcome = "stuck";
      break simulation;
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
      lastProgressMs = now();
      progressPos = { x: state.player.pos.x, y: state.player.pos.y };
    } else if (args.unstick && now() - lastProgressMs > STALL_TIMEOUT_MS) {
      // A wedge: book the penalty where the bot froze, then nudge as before.
      // The nudge teleport would poison the loiter window, and the wedge
      // already covers this moment — reset it so one failure books once.
      bookStuck("wedge", state.player.pos.x, state.player.pos.y);
      resetLoiter();
      if (args.stuckLimit > 0 && stuckPenalty >= args.stuckLimit) {
        outcome = "stuck";
        break simulation;
      }
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
      lastProgressMs = now();
      progressPos = { x: state.player.pos.x, y: state.player.pos.y };
    }
  }

  takeSnapshot();

  const weapon = state.player.equipment.weapon;
  const timeSec = Math.max(1, now() / 1000);
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

  // Finalize boss encounters: read blows-to-kill off the mob accumulator, then
  // attribute each named find to the boss that died most recently before it was
  // picked up (the loot ladder mints a boss's signature the tick it falls). One
  // named item to one boss, in kill order — a heuristic, but a tight one.
  const bossList = [...bosses.values()];
  for (const boss of bossList) {
    const acc = mobs.get(boss.defId);
    if (acc && acc.hitsFromHero > 0) {
      const avgHit = acc.damageFromHero / acc.hitsFromHero;
      const avgHp = acc.spawned ? acc.hpSum / acc.spawned : 0;
      boss.hitsToKill = avgHit > 0 ? round1(avgHp / avgHit) : 0;
    }
  }
  const claimed = new Set<number>();
  const killedBosses = bossList
    .filter((b) => b.killedAtMs !== null)
    .sort((a, b) => (a.killedAtMs ?? 0) - (b.killedAtMs ?? 0));
  for (const boss of killedBosses) {
    // The last named find picked up at/after this boss fell and not already
    // claimed by an earlier-dying boss.
    for (let i = 0; i < namedCollected.length; i++) {
      const find = namedCollected[i];
      if (claimed.has(i) || !find) continue;
      if (find.atMs >= (boss.killedAtMs ?? 0)) {
        boss.drop = find.name;
        claimed.add(i);
        break;
      }
    }
  }

  // Run totals span every mortal attempt: the banked ledgers of dead attempts
  // plus the final state's own (a plain immortal run banks nothing, so these
  // are just the state's figures).
  const totals = {
    kills: banked.kills + state.stats.kills,
    totalEnemies: banked.totalEnemies + state.stats.totalEnemies,
    damageDealt: banked.damageDealt + state.stats.damageDealt,
    damageTaken: banked.damageTaken + state.stats.damageTaken,
    shotsFired: banked.shotsFired + state.stats.shotsFired,
    xpGained: banked.xpGained + state.stats.xpGained,
    manaSpent: banked.manaSpent + state.stats.manaSpent,
    spellsCast: banked.spellsCast + state.stats.spellsCast,
    jumps: banked.jumps + state.stats.jumps,
  };

  const report: LevelReport = {
    levelId: args.levelId,
    levelName: def.name,
    difficulty: args.difficulty,
    seed: args.seed,
    strategy: args.strategy,
    profile: args.profile,
    outcome,
    deaths: deathEvents.length,
    timeMs: now(),
    hero: {
      levelStart,
      levelEnd: state.player.level,
      xpGained: totals.xpGained,
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
      kills: totals.kills,
      totalEnemies: totals.totalEnemies,
      damageDealt: Math.round(totals.damageDealt),
      damageTaken: Math.round(totals.damageTaken),
      shotsFired: totals.shotsFired,
      hitsLanded,
      damagePerHit: hitsLanded ? round1(damagePerHitSum / hitsLanded) : 0,
      critRate: hitsLanded ? round3(critsLanded / hitsLanded) : 0,
      hitsTaken,
      damagePerHitTaken: hitsTaken ? round1(totals.damageTaken / hitsTaken) : 0,
      dpsOut: round1(totals.damageDealt / timeSec),
      killsPerMinute: round1(totals.kills / (timeSec / 60)),
      manaSpent: Math.round(totals.manaSpent),
      spellsCast: totals.spellsCast,
      spellsPerMinute: round1(totals.spellsCast / (timeSec / 60)),
      jumps: totals.jumps,
      jumpsPerMinute: round1(totals.jumps / (timeSec / 60)),
      unstuckNudges,
      shopVisits,
      chestsTotal,
      chestsLooted: chestsTotal - state.obstacles.filter((o) => o.chest).length,
    },
    drops: {
      spawnedByKind,
      collectedByKind,
      equipmentByTier,
      autoEquipped,
      named,
      equipment: {
        total: equipTotal,
        equippableNow,
        levelGated,
        belowLevel: ilvlBelow,
        onLevel: ilvlOn,
        aboveLevel: ilvlAbove,
        avgIlvlDelta: equipTotal ? round1(ilvlDeltaSum / equipTotal) : 0,
      },
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
    bosses: bossList.sort((a, b) => a.metAtMs - b.metAtMs),
    xpCap: { cap, reachedAtMs, forfeited },
    stuck: {
      penalty: stuckPenalty,
      limit: args.stuckLimit,
      cancelled: outcome === "stuck",
      events: stuckEvents,
      areas: stuckAreas,
    },
    menace: {
      rises: menaceRises,
      finalStage: menaceStage(state),
      floorStage: menaceFloorStage(state),
      peakStage: menaceRises.reduce((peak, r) => Math.max(peak, r.stage), 0),
      firstRiseAtMs: menaceRises[0]?.atMs ?? null,
    },
    deathLog: {
      mortal: args.mortal === true,
      limit: args.maxDeaths,
      aborted: outcome === "dead",
      events: deathEvents,
      areas: deathAreas,
    },
    ...(args.trace
      ? {
          spatial: {
            path: tracePath,
            kills: traceKills,
            spawns: traceSpawns,
            mobDensity: {
              cols: coverCols,
              rows: coverRows,
              cell: COVER_CELL,
              grid: Array.from(mobDensity),
            },
            coveragePct: Math.round(
              (coverageCells.size / (coverCols * coverRows)) * 100,
            ),
          },
        }
      : {}),
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
    profile = "meta",
    maxMinutes = 15,
    dtMs = 16,
    snapshotEveryMs = 60_000,
    carryLoadout = true,
    balance,
    realisticPacing,
    autoShop,
    mortal,
    maxDeaths,
    startLoadout = null,
    onKill,
    stuckLimit,
    view,
  } = options;

  const runs: LevelReport[] = [];
  let loadout: Loadout | null = startLoadout;
  let runIndex = 0;
  for (const difficulty of difficulties) {
    for (const levelId of levels) {
      const { report, loadout: banked } = runLevel({
        levelId,
        difficulty,
        seed: (seed + runIndex * 104_729) >>> 0,
        loadout,
        strategy,
        profile,
        maxMinutes,
        dtMs,
        snapshotEveryMs,
        balance,
        realisticPacing,
        autoShop,
        mortal,
        maxDeaths,
        onKill,
        stuckLimit,
        view,
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
    profile,
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
