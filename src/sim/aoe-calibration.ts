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
} from "../game/items.ts";
import { advanceDialogue } from "../game/story.ts";
import { step } from "../game/step.ts";
import { reviveHero } from "./arrival.ts";
import type { Difficulty, Equipment } from "../game/types.ts";

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

/** Run one (level × difficulty × seed) with the probe pinned, feeding each of
 * the hero's OWN swings to `onSwing(effArcDeg, targets, crowdInRange)`. */
function runOne(
  levelId: string,
  difficulty: Difficulty,
  seed: number,
  probe: Equipment,
  o: typeof DEFAULTS,
  onSwing: (arcDeg: number, targets: number, crowd: number) => void,
): void {
  const state = createGame(seed, levelId, difficulty);
  const bot = createBot(o.strategy, o.profile);
  autofillSpellSlots(state);
  // Pin the probe as the hero's weapon (auto-equip is off, so it stays).
  state.player.equipment.weapon = { ...probe };

  let phaseAdvances = 0;
  const rangeSq = o.probeRange * o.probeRange;

  while (state.stats.timeMs < maxTimeMsOf(o)) {
    switch (state.phase) {
      case "cutscene":
        skipCutscene(state);
        if (++phaseAdvances > 10_000) return;
        continue;
      case "intro":
      case "title":
        dismissIntro(state);
        if (++phaseAdvances > 10_000) return;
        continue;
      case "dialogue":
        advanceDialogue(state);
        if (++phaseAdvances > 10_000) return;
        continue;
      case "choice":
        resolveChoice(state, false);
        if (++phaseAdvances > 10_000) return;
        continue;
      case "levelup": {
        // Spend the point (prefer the bot's pick; else any stat with room) so
        // the ding resolves. Melee profile keeps INT low → arc stays near raw.
        if (!allocateStat(state, botAllocate(bot, state))) {
          for (const s of STAT_NAMES) if (allocateStat(state, s)) break;
        }
        state.pendingSpellUnlocks.length = 0;
        autofillSpellSlots(state);
        if (++phaseAdvances > 10_000) return;
        continue;
      }
      case "outro":
        advanceOutro(state);
        if (++phaseAdvances > 10_000) return;
        continue;
      case "victory":
        return;
      case "defeat":
        reviveHero(state);
        if (++phaseAdvances > 10_000) return;
        continue;
      default:
        break;
    }
    phaseAdvances = 0;

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

function maxTimeMsOf(o: typeof DEFAULTS): number {
  return o.maxMinutes * 60_000;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
