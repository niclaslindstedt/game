// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// AoE TARGET CALIBRATION — the wind tunnel for the damage-budget model's AoE
// assumption (`weaponAssumedTargets` / config `WEAPON.assumedTargets`).
//
// It arms the REAL autopilot with PROBE melee weapons of varying cone angle,
// runs the engine across representative levels, and records — per swing — how
// many foes actually fell inside the cone. That count is the UNCAPPED eligible
// number the engine now exposes on the `swing` event (see step.ts `meleeSweep`):
// everything within range + arc + line of sight, BEFORE the `maxMeleeTargets`
// cap trims it to the nearest few. Bucketed by the swing's EFFECTIVE arc, it
// answers the question the budget model guesses at today:
//
//   "Given a cone of X degrees (INT widening folded in), and enough INT that
//    the target CAP isn't the limiter, how many targets does one swing reach
//    in a real fight?"
//
// The realized hits in play are then `min(targets, maxMeleeTargets(INT))`, so
// this measures the GEOMETRY × crowd-density half; INT supplies the cap.
//
// Kept OUT of the public engine API (like simulate.ts / analytic.ts) — the CLI
// (`scripts/aoe-calibration.mjs`) and tests import it directly.

import { botAct, botAllocate, createBot } from "../game/bot.ts";
import type { BotProfile, BotStrategy } from "../game/bot.ts";
import { resolveChoice } from "../game/companions.ts";
import { createGame } from "../game/create.ts";
import { registerDefs } from "../game/defs/registry.ts";
import {
  STAT_NAMES,
  WEAPON_DEFS,
  type WeaponDef,
} from "../game/defs/equipment.ts";
import { GEAR_DEFS } from "../game/defs/gear.ts";
import {
  advanceOutro,
  allocateStat,
  autofillSpellSlots,
  dismissIntro,
  setAutoEquipEnabled,
  skipCutscene,
} from "../game/items/index.ts";
import { advanceDialogue } from "../game/story.ts";
import { step } from "../game/step.ts";
import { reviveHero } from "./arrival.ts";
import type { Difficulty, Equipment, GameState } from "../game/types.ts";

const PROBE_PREFIX = "aoe_probe_";

export type AoeCalibrationOptions = {
  /** Cone angles (full degrees) to probe. */
  probeDegs?: number[];
  /** Deterministic seeds to average over. */
  seeds?: number[];
  /** Levels to run (default: the campaign opener, dense and representative). */
  levels?: string[];
  /** Difficulties to run (density scales a little with the rung). */
  difficulties?: Difficulty[];
  /** Per-hit damage the probe deals — moderate so the bot clears at a normal
   * rate (crowd density tracks real play, not an instant-wipe or a stall). */
  probeDamage?: number;
  /** The probe's reach (world px). Fixed across probes so ARC is the only lever;
   * a representative melee range (the shipped blades sit 24–54). */
  probeRange?: number;
  /** Simulated minutes per run. */
  maxMinutes?: number;
  /** Fixed step size in ms. */
  dtMs?: number;
  /** Arc-bucket width for the aggregate table (degrees). */
  bucketDeg?: number;
  /** Autopilot strategy / profile. Melee profile keeps INT low, so the
   * effective arc stays near the probe's raw degrees — a clean degrees→targets
   * read (the cap is never the limiter since `targets` is uncapped). */
  strategy?: BotStrategy;
  profile?: BotProfile;
};

/** One probe angle's aggregate across every run. */
export type ProbeResult = {
  /** The probe's authored cone (full degrees). */
  deg: number;
  /** Swings recorded. */
  swings: number;
  /** Mean EFFECTIVE arc actually swung (raw × INT widening, capped 180°). */
  meanEffArcDeg: number;
  /** Mean UNCAPPED targets in the cone — the headline. */
  meanTargets: number;
  /** Median targets (robust to the odd huge press). */
  medianTargets: number;
  /** Mean foes within reach at the swing REGARDLESS of arc — the crowd the
   * cone drew from (so `meanTargets / meanCrowd` is the fraction it caught). */
  meanCrowd: number;
};

/** One effective-arc bucket across every probe/run. */
export type ArcBucket = {
  arcLoDeg: number;
  arcHiDeg: number;
  swings: number;
  meanTargets: number;
  meanCrowd: number;
};

export type AoeCalibrationReport = {
  options: Required<
    Pick<
      AoeCalibrationOptions,
      "probeDamage" | "probeRange" | "maxMinutes" | "dtMs" | "bucketDeg"
    >
  > & { seeds: number[]; levels: string[]; difficulties: Difficulty[] };
  totalSwings: number;
  probes: ProbeResult[];
  buckets: ArcBucket[];
};

const DEFAULTS = {
  probeDegs: [20, 40, 60, 90, 120, 180, 300],
  seeds: [1, 2],
  levels: ["spacez_hq", "moon", "mars"],
  difficulties: ["medium"] as Difficulty[],
  probeDamage: 14,
  probeRange: 40,
  maxMinutes: 5,
  dtMs: 16,
  bucketDeg: 20,
  strategy: "survivor" as BotStrategy,
  profile: "melee" as BotProfile,
};

/** A probe weapon def — a plain melee blade whose ONLY distinctive trait is its
 * cone angle. Unbreakable-in-practice (durability huge) so it never snaps
 * mid-measurement. */
function probeDef(deg: number, damage: number, range: number): WeaponDef {
  return {
    id: `${PROBE_PREFIX}${deg}`,
    name: `AOE PROBE ${deg}`,
    class: "melee",
    levelReq: 1,
    damage,
    cooldownMs: 500,
    range,
    sweepDeg: deg,
    durability: 9_999_999,
    icon: "icon_calibration_probe",
  };
}

/** A minted probe instance — unbreakable (no durability field). */
function probeEquipment(deg: number): Equipment {
  return {
    id: -1_000_000 - deg,
    defId: `${PROBE_PREFIX}${deg}`,
    slot: "weapon",
    tier: "regular",
    ilvl: 1,
    affixes: [],
  };
}

/** Per-swing samples for one arc, accumulated online. */
type Accum = {
  swings: number;
  targetsSum: number;
  crowdSum: number;
  effArcSum: number;
  targets: number[];
};
const emptyAccum = (): Accum => ({
  swings: 0,
  targetsSum: 0,
  crowdSum: 0,
  effArcSum: 0,
  targets: [],
});

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2
    ? (s[mid] as number)
    : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

/**
 * Run the calibration sweep. Deterministic per options; mutates the global def
 * registry and the auto-equip flag for the duration and RESTORES both after.
 */
export function calibrateAoe(
  opts: AoeCalibrationOptions = {},
): AoeCalibrationReport {
  const o = { ...DEFAULTS, ...opts };

  // Register the probe defs ALONGSIDE the shipped catalog (levels' loot pools
  // still reference shipped weapon/gear ids), and turn OFF auto-equip so a
  // looted weapon never displaces the probe under test.
  const probeDefs: Record<string, WeaponDef> = {};
  for (const deg of o.probeDegs)
    probeDefs[`${PROBE_PREFIX}${deg}`] = probeDef(
      deg,
      o.probeDamage,
      o.probeRange,
    );
  registerDefs({ weapons: { ...WEAPON_DEFS, ...probeDefs }, gear: GEAR_DEFS });
  setAutoEquipEnabled(false);

  // Per-probe and per-arc-bucket accumulators.
  const perProbe = new Map<number, Accum>();
  for (const deg of o.probeDegs) perProbe.set(deg, emptyAccum());
  const perBucket = new Map<number, Accum>();
  let totalSwings = 0;

  try {
    for (const deg of o.probeDegs) {
      const probe = probeEquipment(deg);
      const probeAcc = perProbe.get(deg) as Accum;
      for (const level of o.levels) {
        for (const difficulty of o.difficulties) {
          for (const seed of o.seeds) {
            runOne(
              level,
              difficulty,
              seed,
              probe,
              o,
              (arcDeg, targets, crowd) => {
                totalSwings++;
                probeAcc.swings++;
                probeAcc.targetsSum += targets;
                probeAcc.crowdSum += crowd;
                probeAcc.targets.push(targets);
                probeAcc.effArcSum += arcDeg;
                const key = Math.floor(arcDeg / o.bucketDeg);
                let b = perBucket.get(key);
                if (!b) perBucket.set(key, (b = emptyAccum()));
                b.swings++;
                b.targetsSum += targets;
                b.crowdSum += crowd;
              },
            );
          }
        }
      }
    }
  } finally {
    // Restore the shipped catalog + auto-equip.
    registerDefs({ weapons: WEAPON_DEFS, gear: GEAR_DEFS });
    setAutoEquipEnabled(true);
  }

  const probes: ProbeResult[] = o.probeDegs.map((deg) => {
    const a = perProbe.get(deg) as Accum;
    return {
      deg,
      swings: a.swings,
      meanEffArcDeg: a.swings ? round1(a.effArcSum / a.swings) : 0,
      meanTargets: a.swings ? round2(a.targetsSum / a.swings) : 0,
      medianTargets: median(a.targets),
      meanCrowd: a.swings ? round2(a.crowdSum / a.swings) : 0,
    };
  });

  const buckets: ArcBucket[] = [...perBucket.keys()]
    .sort((x, y) => x - y)
    .map((key) => {
      const a = perBucket.get(key) as Accum;
      return {
        arcLoDeg: key * o.bucketDeg,
        arcHiDeg: (key + 1) * o.bucketDeg,
        swings: a.swings,
        meanTargets: a.swings ? round2(a.targetsSum / a.swings) : 0,
        meanCrowd: a.swings ? round2(a.crowdSum / a.swings) : 0,
      };
    });

  return {
    options: {
      probeDamage: o.probeDamage,
      probeRange: o.probeRange,
      maxMinutes: o.maxMinutes,
      dtMs: o.dtMs,
      bucketDeg: o.bucketDeg,
      seeds: o.seeds,
      levels: o.levels,
      difficulties: o.difficulties,
    },
    totalSwings,
    probes,
    buckets,
  };
}

// ============================================================================
// REACH sweep — the SECOND melee axis. `calibrateAoe` above sweeps the cone
// ANGLE at a fixed reach; this sweeps the cone's DEPTH (reach px) across a grid
// of angles, because the depth calibration (STRENGTH → `rangePerStr`) revealed
// reach is the DOMINANT melee-AoE lever: the swept sector's area grows with the
// SQUARE of reach, so a deep swing threads far more of the horde than a wide-but-
// shallow one. The grid feeds the build-aware budget model (`weaponAssumedTargets`
// prices a melee weapon at its realistic reach/arc for the hero level that wields
// it), fitted to `1 + gain·(1 − e^(−sweptArea/scaleArea))`.
// ============================================================================

/** One (arc × reach) grid cell's aggregate. */
export type ReachCell = {
  /** Probe cone (full degrees). */
  deg: number;
  /** Probe reach (world px). */
  range: number;
  /** Swept sector area ½·arc(rad)·reach² — the model's single independent var. */
  sweptArea: number;
  swings: number;
  /** Mean UNCAPPED targets in the cone — the headline. */
  meanTargets: number;
  medianTargets: number;
  /** Mean foes within reach regardless of arc (the crowd the cone drew from). */
  meanCrowd: number;
};

export type ReachCalibrationReport = {
  options: {
    probeDamage: number;
    maxMinutes: number;
    dtMs: number;
    seeds: number[];
    levels: string[];
    difficulties: Difficulty[];
    degs: number[];
    ranges: number[];
  };
  totalSwings: number;
  cells: ReachCell[];
};

const REACH_DEFAULTS = {
  degs: [40, 90, 180],
  ranges: [30, 45, 60, 90, 130, 180, 240],
  seeds: [1, 2, 3],
  levels: ["spacez_hq", "moon", "mars"],
  difficulties: ["medium"] as Difficulty[],
  probeDamage: 14,
  maxMinutes: 4,
  dtMs: 16,
  strategy: "survivor" as BotStrategy,
  profile: "melee" as BotProfile,
};

/** A grid probe def/instance keyed by BOTH angle and reach (so a cell's probe is
 * distinct in the registry). */
function reachProbeId(deg: number, range: number): string {
  return `${PROBE_PREFIX}g_${deg}_${range}`;
}
function reachProbeDef(deg: number, range: number, damage: number): WeaponDef {
  return {
    id: reachProbeId(deg, range),
    name: `AOE PROBE ${deg}deg ${range}px`,
    class: "melee",
    levelReq: 1,
    damage,
    cooldownMs: 500,
    range,
    sweepDeg: deg,
    durability: 9_999_999,
    icon: "icon_calibration_probe",
  };
}
function reachProbeEquipment(deg: number, range: number): Equipment {
  return {
    id: -3_000_000 - deg * 1000 - range,
    defId: reachProbeId(deg, range),
    slot: "weapon",
    tier: "regular",
    ilvl: 1,
    affixes: [],
  };
}

/**
 * Sweep melee targets across an (arc × reach) grid — the wind tunnel for the
 * REACH axis of the build-aware budget. Deterministic per options; mutates the
 * global def registry and auto-equip flag for the duration and restores both.
 */
export function calibrateMeleeReach(
  opts: Partial<typeof REACH_DEFAULTS> = {},
): ReachCalibrationReport {
  const o = { ...REACH_DEFAULTS, ...opts };

  const probeDefs: Record<string, WeaponDef> = {};
  for (const deg of o.degs)
    for (const range of o.ranges)
      probeDefs[reachProbeId(deg, range)] = reachProbeDef(
        deg,
        range,
        o.probeDamage,
      );
  registerDefs({ weapons: { ...WEAPON_DEFS, ...probeDefs }, gear: GEAR_DEFS });
  setAutoEquipEnabled(false);

  const perCell = new Map<string, Accum>();
  let totalSwings = 0;

  try {
    for (const deg of o.degs) {
      for (const range of o.ranges) {
        const key = reachProbeId(deg, range);
        const acc = emptyAccum();
        perCell.set(key, acc);
        const probe = reachProbeEquipment(deg, range);
        for (const level of o.levels) {
          for (const difficulty of o.difficulties) {
            for (const seed of o.seeds) {
              runOne(
                level,
                difficulty,
                seed,
                probe,
                { ...o, probeRange: range },
                (_arcDeg, targets, crowd) => {
                  totalSwings++;
                  acc.swings++;
                  acc.targetsSum += targets;
                  acc.crowdSum += crowd;
                  acc.targets.push(targets);
                },
              );
            }
          }
        }
      }
    }
  } finally {
    registerDefs({ weapons: WEAPON_DEFS, gear: GEAR_DEFS });
    setAutoEquipEnabled(true);
  }

  const cells: ReachCell[] = [];
  for (const deg of o.degs) {
    for (const range of o.ranges) {
      const a = perCell.get(reachProbeId(deg, range)) as Accum;
      const arcRad = (deg * Math.PI) / 180;
      cells.push({
        deg,
        range,
        sweptArea: round1(0.5 * arcRad * range * range),
        swings: a.swings,
        meanTargets: a.swings ? round2(a.targetsSum / a.swings) : 0,
        medianTargets: median(a.targets),
        meanCrowd: a.swings ? round2(a.crowdSum / a.swings) : 0,
      });
    }
  }

  return {
    options: {
      probeDamage: o.probeDamage,
      maxMinutes: o.maxMinutes,
      dtMs: o.dtMs,
      seeds: o.seeds,
      levels: o.levels,
      difficulties: o.difficulties,
      degs: o.degs,
      ranges: o.ranges,
    },
    totalSwings,
    cells,
  };
}

/** Drive every PAUSED phase the way a player's taps would, until the game sits
 * at a steppable phase (returns true → run a real tick) or ends (false → stop
 * the run). The 10k guard breaks a wedged phase loop. Shared by the melee and
 * ranged calibration runs. */
function advanceUntilStep(
  state: GameState,
  bot: ReturnType<typeof createBot>,
): boolean {
  let guard = 0;
  for (;;) {
    switch (state.phase) {
      case "cutscene":
        skipCutscene(state);
        break;
      case "intro":
      case "title":
        dismissIntro(state);
        break;
      case "dialogue":
        advanceDialogue(state);
        break;
      case "choice":
        resolveChoice(state, false);
        break;
      case "levelup": {
        // Spend the point (prefer the bot's pick; else any stat with room) so
        // the ding resolves.
        if (!allocateStat(state, botAllocate(bot, state))) {
          for (const s of STAT_NAMES) if (allocateStat(state, s)) break;
        }
        state.pendingSpellUnlocks.length = 0;
        autofillSpellSlots(state);
        break;
      }
      case "outro":
        advanceOutro(state);
        break;
      case "victory":
        return false;
      case "defeat":
        reviveHero(state);
        break;
      default:
        return true; // a live, unpaused phase → run a real tick
    }
    if (++guard > 10_000) return false;
  }
}

/** Run one (level × difficulty × seed) with the probe pinned, feeding each of
 * the hero's OWN swings to `onSwing(effArcDeg, targets, crowdInRange)`. */
function runOne(
  levelId: string,
  difficulty: Difficulty,
  seed: number,
  probe: Equipment,
  o: {
    probeRange: number;
    dtMs: number;
    maxMinutes: number;
    strategy: BotStrategy;
    profile: BotProfile;
  },
  onSwing: (arcDeg: number, targets: number, crowd: number) => void,
): void {
  const state = createGame(seed, levelId, difficulty);
  const bot = createBot(o.strategy, o.profile);
  autofillSpellSlots(state);
  // Pin the probe as the hero's weapon (auto-equip is off, so it stays).
  state.player.equipment.weapon = { ...probe };

  const rangeSq = o.probeRange * o.probeRange;

  while (state.stats.timeMs < maxTimeMsOf(o)) {
    if (!advanceUntilStep(state, bot)) return;

    // Re-pin the probe in case anything swapped the slot (defensive; auto-equip
    // is off). Cheap and keeps the measured weapon honest.
    if (state.player.equipment.weapon.defId !== probe.defId) {
      state.player.equipment.weapon = { ...probe };
    }

    // Crowd within reach BEFORE the step — the pool the cone drew from, counted
    // before the swing fells any of it (a post-step count undercounts, since a
    // struck foe is already gone). The player barely moves in one 16ms tick, so
    // this position is the swing's to within a pixel.
    let crowdBefore = 0;
    for (const enemy of state.enemies) {
      const ex = enemy.pos.x - state.player.pos.x;
      const ey = enemy.pos.y - state.player.pos.y;
      if (ex * ex + ey * ey <= rangeSq) crowdBefore++;
    }

    step(state, botAct(bot, state), o.dtMs);

    // Read the hero's OWN swings off the event stream (companions emit swings
    // too, but from their own position; gate on proximity to the player).
    for (const event of state.events) {
      if (event.type !== "swing") continue;
      const dx = event.pos.x - state.player.pos.x;
      const dy = event.pos.y - state.player.pos.y;
      if (dx * dx + dy * dy > 4) continue; // not the hero's own swing
      onSwing((event.arc * 180) / Math.PI, event.targets, crowdBefore);
    }
  }
}

function maxTimeMsOf(o: { maxMinutes: number }): number {
  return o.maxMinutes * 60_000;
}

// ============================================================================
// RANGED AoE calibration — how many DISTINCT foes one trigger pull actually
// reaches, by spread (`count`), pierce, or chain. Where a melee swing resolves
// in one call, a volley's projectiles fly and land over many ticks, so the hit
// count is read off the engine's per-hit `enemyHit.fromVolley` telemetry: each
// hit tags the trigger pull it belongs to, and we union the distinct foes per
// volley. Answers whether the budget's raw `count`/`1+pierce`/`1+chain` credit
// is real, or whether a spread's pellets overlap on one body in the open field.
// ============================================================================

/** One ranged probe shape — a single projectile spec knob under test. */
export type RangedProbe = {
  /** Display label, e.g. "spread4" / "pierce3" / "single". */
  label: string;
  /** Pellets per trigger pull (a spread volley); omit for a single shot. */
  count?: number;
  /** Fan angle for a multi-pellet volley (deg). */
  spreadDeg?: number;
  /** Foes the shot punches THROUGH beyond the first. */
  pierce?: number;
  /** Chain-lightning leaps on the first hit. */
  chain?: number;
};

export type RangedProbeResult = {
  label: string;
  /** The budget's assumed target credit for this shape (`count` / `1+pierce` /
   * `1+chain*frac` — the number the calibration checks against). */
  assumed: number;
  /** Trigger pulls that CONNECTED (landed ≥1 hit). */
  volleys: number;
  /** Mean DISTINCT foes a connecting volley reached — the headline. */
  meanFoes: number;
  /** Median distinct foes (robust to the odd packed line). */
  medianFoes: number;
};

export type RangedCalibrationReport = {
  options: {
    probeDamage: number;
    probeRange: number;
    spreadDeg: number;
    maxMinutes: number;
    dtMs: number;
    seeds: number[];
    levels: string[];
    difficulties: Difficulty[];
  };
  totalVolleys: number;
  probes: RangedProbeResult[];
};

const RANGED_DEFAULTS = {
  seeds: [1, 2],
  levels: ["spacez_hq", "moon", "mars"],
  difficulties: ["medium"] as Difficulty[],
  // LOW per-hit so a pellet rarely fells a foe mid-volley (we want the GEOMETRIC
  // reach — how many the volley could touch — not a kill-thinned count).
  probeDamage: 4,
  probeRange: 250,
  spreadDeg: 24,
  maxMinutes: 5,
  dtMs: 16,
  strategy: "survivor" as BotStrategy,
  // Ranged profile: DEX/STR lane, INT low — a realistic ranged build's reach.
  profile: "ranged" as BotProfile,
};

const RANGED_PROBES: RangedProbe[] = [
  { label: "single" },
  { label: "spread3", count: 3 },
  { label: "spread4", count: 4 },
  { label: "spread6", count: 6 },
  { label: "pierce1", pierce: 1 },
  { label: "pierce2", pierce: 2 },
  { label: "pierce3", pierce: 3 },
  { label: "chain1", chain: 1 },
  { label: "chain2", chain: 2 },
  { label: "chain3", chain: 3 },
];

function rangedProbeDef(
  probe: RangedProbe,
  damage: number,
  range: number,
  spreadDeg: number,
): WeaponDef {
  const id = `${PROBE_PREFIX}r_${probe.label}`;
  const projectile: NonNullable<WeaponDef["projectile"]> = {
    speed: 420,
    radius: 4,
    lifetimeMs: Math.round((range / 420) * 1000),
    sprite: "bolt",
  };
  if (probe.count && probe.count > 1) {
    projectile.count = probe.count;
    projectile.spreadDeg = spreadDeg;
  }
  if (probe.pierce) projectile.pierce = probe.pierce;
  if (probe.chain) projectile.chain = probe.chain;
  return {
    id,
    name: `AOE PROBE ${probe.label}`,
    class: "ranged",
    levelReq: 1,
    damage,
    cooldownMs: 500,
    range,
    durability: 9_999_999,
    projectile,
    icon: "icon_calibration_probe",
  };
}

export function calibrateRangedAoe(
  opts: Partial<typeof RANGED_DEFAULTS> & { probes?: RangedProbe[] } = {},
): RangedCalibrationReport {
  const o = { ...RANGED_DEFAULTS, ...opts };
  const probeList = opts.probes ?? RANGED_PROBES;

  const probeDefs: Record<string, WeaponDef> = {};
  for (const p of probeList)
    probeDefs[`${PROBE_PREFIX}r_${p.label}`] = rangedProbeDef(
      p,
      o.probeDamage,
      o.probeRange,
      o.spreadDeg,
    );
  registerDefs({ weapons: { ...WEAPON_DEFS, ...probeDefs }, gear: GEAR_DEFS });
  setAutoEquipEnabled(false);

  const results: RangedProbeResult[] = [];
  let totalVolleys = 0;
  try {
    for (const p of probeList) {
      const volleyFoes: number[] = [];
      for (const level of o.levels) {
        for (const difficulty of o.difficulties) {
          for (const seed of o.seeds) {
            runRangedOne(level, difficulty, seed, p, o, volleyFoes);
          }
        }
      }
      totalVolleys += volleyFoes.length;
      const sum = volleyFoes.reduce((s, n) => s + n, 0);
      results.push({
        label: p.label,
        assumed:
          p.count ?? (p.pierce ? 1 + p.pierce : p.chain ? 1 + p.chain : 1),
        volleys: volleyFoes.length,
        meanFoes: volleyFoes.length ? round2(sum / volleyFoes.length) : 0,
        medianFoes: median(volleyFoes),
      });
    }
  } finally {
    registerDefs({ weapons: WEAPON_DEFS, gear: GEAR_DEFS });
    setAutoEquipEnabled(true);
  }

  return {
    options: {
      probeDamage: o.probeDamage,
      probeRange: o.probeRange,
      spreadDeg: o.spreadDeg,
      maxMinutes: o.maxMinutes,
      dtMs: o.dtMs,
      seeds: o.seeds,
      levels: o.levels,
      difficulties: o.difficulties,
    },
    totalVolleys,
    probes: results,
  };
}

/** Run one ranged (level × difficulty × seed) with the probe pinned, pushing
 * each CONNECTING volley's distinct-foe count into `volleyFoes`. */
function runRangedOne(
  levelId: string,
  difficulty: Difficulty,
  seed: number,
  probe: RangedProbe,
  o: typeof RANGED_DEFAULTS,
  volleyFoes: number[],
): void {
  const defId = `${PROBE_PREFIX}r_${probe.label}`;
  const state = createGame(seed, levelId, difficulty);
  const bot = createBot(o.strategy, o.profile);
  autofillSpellSlots(state);
  const weapon: Equipment = {
    id: -2_000_000,
    defId,
    slot: "weapon",
    tier: "regular",
    ilvl: 1,
    affixes: [],
  };
  state.player.equipment.weapon = { ...weapon };

  // A volley's hits land over several ticks; accumulate distinct foes per volley
  // id and flush a volley to the sample list once it stops taking new hits.
  const openVolleys = new Map<number, { foes: Set<number>; lastMs: number }>();
  const FLUSH_AFTER_MS = 1500; // a shot's flight is well under this
  const flush = (nowMs: number, force: boolean) => {
    for (const [id, v] of openVolleys) {
      if (force || nowMs - v.lastMs > FLUSH_AFTER_MS) {
        volleyFoes.push(v.foes.size);
        openVolleys.delete(id);
      }
    }
  };

  while (state.stats.timeMs < maxTimeMsOf(o)) {
    if (!advanceUntilStep(state, bot)) break;
    if (state.player.equipment.weapon.defId !== defId) {
      state.player.equipment.weapon = { ...weapon };
    }
    step(state, botAct(bot, state), o.dtMs);

    const nowMs = state.stats.timeMs;
    for (const event of state.events) {
      if (event.type !== "enemyHit" && event.type !== "enemyKilled") continue;
      if (event.fromVolley === undefined || event.enemyId === undefined)
        continue;
      let v = openVolleys.get(event.fromVolley);
      if (!v)
        openVolleys.set(
          event.fromVolley,
          (v = { foes: new Set(), lastMs: nowMs }),
        );
      v.foes.add(event.enemyId);
      v.lastMs = nowMs;
    }
    flush(nowMs, false);
  }
  flush(state.stats.timeMs, true);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
