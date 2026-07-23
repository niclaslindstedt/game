// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The autopilot's MACRO TRAVEL PLAN: where the bot goes when it's free to move.
// `macroTarget` is the whole automatic-engagement order in one place — the
// urgent shop run, the pinned GPS nudge, the anti-loiter hunt, the spawner
// farm, the content sweep, the guidance arrow, the fog sweep, the boss — and
// `macroSteer` walks it down the A* route with the matching BOT VIEW thought.
// The module also owns the ANTI-LOITER engagement clock (`trackEngagement` /
// `seekTarget`) and the last-resort ANTI-WEDGE escape (`unstuckInput`). Pure
// w.r.t. the GameState — only the bot's own seek/nav memory is mutated, so
// determinism holds.

import { clamp, distance } from "@game/lib/vec.ts";
import type { Vec2 } from "@game/lib/vec.ts";
import { wantsMerchantVisit, weaponStarved } from "./economy.ts";
import {
  exploredFraction,
  exploreStalled,
  exploreTarget,
  nearestContent,
  roughPos,
} from "./content.ts";
import { routeSteer, steer } from "./nav.ts";
import {
  activeSpawnerNear,
  bossPos,
  CONTACT_DODGE_RADIUS,
  hasReachableFoe,
  furthestLandmark,
  nearestEnemy,
  readyForBoss,
  THREAT_RADIUS,
  threatsWithin,
} from "./perception.ts";
import { think } from "./state.ts";
import type { Bot } from "./state.ts";
import type { BotTuning } from "./tuning.ts";
import { PLAYER } from "../config/index.ts";
import { playerSpeed } from "../items/index.ts";
import { nextPathWaypoint, onPathLevel } from "../path.ts";
import { blockedByObstacle, insideObstacle } from "../obstacles.ts";
import type { GameInput, GameState } from "../types/index.ts";

/** The GPS HEADING: a unit vector from the hero toward the next A* ROUTE
 * WAYPOINT of the current macro goal (the waypoint/elite/boss the sweep is
 * bound for) — the persistent pull that keeps every combat move TENDING toward
 * the destination. Route-aware, not a beeline: the old straight-at-the-goal
 * bias pointed THROUGH walls, so a retreat "toward the objective" could grind
 * into a jig wall for minutes; steering at the next turning point instead
 * drifts the fight down the corridor the way a human keeps working toward the
 * marker on their minimap. Reads/updates the bot's cached route; pure w.r.t.
 * state + bot memory. */
export function travelHeading(
  bot: Bot,
  state: GameState,
  tune: BotTuning,
): Vec2 | null {
  const goal = macroTarget(bot, state, tune);
  const dx = goal.x - state.player.pos.x;
  const dy = goal.y - state.player.pos.y;
  const d = Math.hypot(dx, dy);
  if (d < 1) return null;
  return { x: dx / d, y: dy / d };
}

/** How long (sim ms) a latched anti-loiter hunt may go WITHOUT CLOSING on its
 * foe before it is ABANDONED — the safety that keeps a foe the hero can't
 * actually get to (walled off, or endlessly shoved away from) from pinning the
 * whole run to one march. Progress-gauged, not a flat clock: a long jog that
 * IS closing the gap keeps its hunt. On abandon the fight clock resets, so the
 * next hunt latches a fresh lull later. */
const SEEK_STALL_MS = 12_000;
/** The hunted gap must shrink by this many px to count as headway, so jitter
 * around a wall doesn't reset the abandon timer. */
const SEEK_PROGRESS_EPS = 40;

/**
 * Once per tick, run the ANTI-LOITER bookkeeping on `bot.seek`: refresh the
 * "last in a fight" clock while the hero is engaged (a live foe inside the
 * local threat ring, a hit just taken, or the scripted disarmed opening — near
 * a fight is not loitering), and once the fightless gap exceeds
 * {@link BotTuning.seekFightAfterMs} LATCH a hunt on the nearest enemy. The
 * latch holds until that foe is DOWN, a REAL fight finds the hero (a hit taken
 * — something else owns the tick now), or the hunt drags past the abandon
 * window. Merely brushing the threat ring — or landing the first blow — must
 * NOT end it: a stationary foe doesn't chase, so an early release would let
 * the macro plan pull the hero away mid-kill and re-open the very loiter the
 * hunt exists to close. Called from {@link decideAct}; mutates only bot
 * memory, so determinism holds.
 */
export function trackEngagement(
  bot: Bot,
  state: GameState,
  tune: BotTuning,
): void {
  const now = state.stats.timeMs;
  if (!bot.seek || bot.seek.levelId !== state.level.id) {
    bot.seek = {
      levelId: state.level.id,
      lastEngagedMs: now,
      targetId: null,
      bestD: Infinity,
      bestMs: 0,
    };
    return;
  }
  const seek = bot.seek;
  const engaged =
    state.player.disarmed ||
    state.player.hurtFlashMs > 0 ||
    threatsWithin(state, THREAT_RADIUS).length > 0;
  if (engaged) seek.lastEngagedMs = now;
  if (seek.targetId !== null) {
    const foe = state.enemies.find((e) => e.id === seek.targetId);
    // Headway gauge: the hunt is healthy while the gap keeps shrinking.
    if (foe) {
      const d = distance(state.player.pos, foe.pos);
      if (d < seek.bestD - SEEK_PROGRESS_EPS) {
        seek.bestD = d;
        seek.bestMs = now;
      }
    }
    if (
      !foe ||
      state.player.hurtFlashMs > 0 ||
      now - seek.bestMs > SEEK_STALL_MS
    ) {
      seek.targetId = null;
      seek.lastEngagedMs = now; // a fresh lull gates the next hunt
    }
    return;
  }
  if (
    tune.seekFightAfterMs > 0 &&
    now - seek.lastEngagedMs > tune.seekFightAfterMs &&
    macroPreemptible(bot, state, tune)
  ) {
    const foe = nearestEnemy(state);
    if (foe) {
      seek.targetId = foe.id;
      seek.bestD = distance(state.player.pos, foe.pos);
      seek.bestMs = now;
    }
  }
}

/** May the anti-loiter hunt PREEMPT the current macro plan? Only when the plan
 * is aimless wandering — a fog sweep, a spawner hold, the no-goal fallback. A
 * committed DESTINATION is never preempted: the elite hunt and the boss push
 * already march on a foe, and the shop run / a chest cache finish something
 * the sweep needs finished — preempting those measurably turned a wave map
 * (whose mobs never run out) into an endless straggler farm: each lull's hunt
 * re-pointed the route off the errand, the errand's abandon clock never ran,
 * content never exhausted, and the boss was never committed. Pure w.r.t. state
 * + the bot's own caches. */
function macroPreemptible(
  bot: Bot,
  state: GameState,
  tune: BotTuning,
): boolean {
  const goal = macroTarget(bot, state, tune);
  const stall = state.merchant.pos;
  if (wantsMerchantVisit(state) && stall.x === goal.x && stall.y === goal.y)
    return false;
  const mark = bot.waypoint;
  if (mark && mark.x === goal.x && mark.y === goal.y) return false;
  const c = bot.content;
  if (c?.target && c.target.x === goal.x && c.target.y === goal.y) return false;
  // A boss-ready arrow march is the boss push walked down the authored path —
  // as uninterruptible as the boss beeline it replaces. An under-levelled
  // arrow march is the leveling walk (the fog sweep's stand-in), so a lull's
  // hunt may still preempt it toward a fight.
  if (readyForBoss(state, tune)) {
    const arrowWp = nextPathWaypoint(state);
    if (arrowWp && arrowWp.x === goal.x && arrowWp.y === goal.y) return false;
  }
  const boss = bossPos(state);
  if (boss && boss.x === goal.x && boss.y === goal.y) return false;
  return true;
}

/** Is the macro plan MARCHING ON A NAMED OBJECTIVE — the committed elite hunt,
 * a committed CHEST errand, or the boss push? The read that flips the balanced
 * posture into its rush-the-objective aggro row and arms the gauntlet run (see
 * {@link survive}). A chest errand counts: its doorway is usually a flooded
 * chokepoint, and without the rush the edge-fight parks the hero at the door
 * trading blows until the errand is abandoned (measured: 45s at the break-room
 * gap, chest hp untouched). Pure w.r.t. state + the bot's own caches. */
export function marchingOnFoe(
  bot: Bot,
  state: GameState,
  tune: BotTuning,
): boolean {
  const goal = macroTarget(bot, state, tune);
  const c = bot.content;
  if (
    c?.target &&
    (c.kind === "elite" || c.kind === "chest") &&
    c.target.x === goal.x &&
    c.target.y === goal.y
  )
    return true;
  // A BOSS-READY hero walking the guidance arrow IS the boss push: on a path
  // level the march to the boss goes waypoint by waypoint down the authored
  // path, so the arrow's waypoint stands in for the boss as the goal — the
  // gauntlet run must arm the same way it did for the old boss beeline, or
  // the late-wave flood parks him at every scuffle on the approach.
  if (readyForBoss(state, tune)) {
    const arrowWp = nextPathWaypoint(state);
    if (arrowWp && arrowWp.x === goal.x && arrowWp.y === goal.y) return true;
  }
  const boss = bossPos(state);
  return boss !== undefined && boss.x === goal.x && boss.y === goal.y;
}

/** The ROUGH position of the latched anti-loiter hunt's foe, or null with no
 * hunt on. Fed into {@link macroTarget} ahead of the normal errands, so every
 * travel read — the sweep, the ADVANCE blend, the unstuck heading — marches on
 * the enemy while the hunt is live. Tracks the foe's {@link roughPos} cell, so
 * the bot heads in its direction without pixel-chasing it. */
function seekTarget(bot: Bot, state: GameState): Vec2 | null {
  const seek = bot.seek;
  if (!seek || seek.levelId !== state.level.id || seek.targetId === null)
    return null;
  const foe = state.enemies.find((e) => e.id === seek.targetId);
  if (!foe) return null; // slain — trackEngagement clears the latch next tick
  return roughPos(foe.pos);
}

/**
 * The macro destination the bot travels toward when it's free to move: the
 * latched ANTI-LOITER hunt first (idled past `seekFightAfterMs` without a
 * fight → march on the nearest enemy), else FARM the active spawner in this
 * patch (level up before advancing) while still under the boss-ready level,
 * else sweep to the nearest reachable un-engaged CONTENT — the map's huntable
 * ELITES first, then the chest caches — else DISCOVER NEW GROUND from the
 * hero's own side outward (directional fog coverage), else — with nothing left
 * to discover — the BOSS. This is the whole automatic-engagement order in one
 * place; the callers just route to whatever it returns.
 *
 * Exploration is EAGER but PARTIAL and DIRECTIONAL: while still UNDER the
 * boss-ready level the bot discovers new ground from its own side outward (spawn
 * side → middle, via {@link exploreTarget}) — but only up to
 * {@link BotTuning.exploreTargetFrac} of the map, then it stops fanning out. So
 * the leveling window is spent uncovering the hero's half rather than beelining
 * the path, the boss's side stays dark until the approach, and the sweep always
 * terminates at the boss: the moment he's boss-ready (or the coverage target is
 * hit) discovery ends and he commits — a combat-bogged run can't get stuck
 * chasing fog it will never fully clear.
 */
export function macroTarget(bot: Bot, state: GameState, tune: BotTuning): Vec2 {
  // THE MERCHANT ERRAND: when a stall visit would actually resolve something —
  // bank the bag's outgrown junk, buy an upgrade the purse covers, mend a
  // spent kit (see `wantsMerchantVisit`) — the counter joins the travel plan:
  // URGENTLY when the hero is weapon-starved (farming with the sidearm is
  // slower than re-arming), otherwise as the errand between caches. The
  // harness runs the actual trade once he's at the counter (`tradeAtMerchant`),
  // which clears the want, so the errand can't loop.
  const errand = wantsMerchantVisit(state);
  if (errand && weaponStarved(state)) return state.merchant.pos;
  // A pinned GPS NUDGE outranks everything but the urgent shop run — the
  // caller pointed the bot at a coordinate, so he works his way there.
  if (bot.waypoint) return bot.waypoint;
  // The ANTI-LOITER hunt: gone too long without a fight, the bot marches on
  // the latched foe before any other errand — moving toward the enemy IS the
  // point (only the weapon-starved shop run above still outranks it).
  const hunt = seekTarget(bot, state);
  if (hunt) return hunt;
  const underLevel = !readyForBoss(state, tune);
  if (underLevel) {
    const spawner = activeSpawnerNear(state);
    if (spawner) return spawner;
  }
  const content = nearestContent(bot, state, tune);
  if (content) return content;
  if (errand) return state.merchant.pos;
  // THE GUIDANCE ARROW IS AN INSTRUCTION. On a path level the blinking amber
  // "go this way" arrow the player sees points at the next unwalked waypoint
  // of the authored intended path (path.ts; drawn by the app's
  // drawGuidanceArrow) — the designer's own corridor route to the objective.
  // The bot heeds it exactly like a player: with no fight, errand or cache in
  // hand, the arrow's waypoint IS the travel plan, so the hero marches where
  // his own arrow points instead of wandering the fog against it. It reads
  // the same shared progress (`state.pathIndex`) the arrow draws from, so the
  // two can never disagree; once the whole path is walked — which by
  // construction lands at the objective — the fog sweep / boss commit below
  // take over (and open maps, which author no path, never see this branch).
  const arrowWp = nextPathWaypoint(state);
  if (arrowWp) return arrowWp;
  if (
    underLevel &&
    !exploreStalled(bot) &&
    exploredFraction(state) < tune.exploreTargetFrac
  ) {
    const fog = exploreTarget(state, tune);
    if (fog) return fog;
  }
  return bossPos(state) ?? furthestLandmark(state) ?? state.player.pos;
}

/** The short label for the macro goal `macroTarget` returned, for the BOT VIEW
 * thought bubble — so the overlay reads "SEEK CHEST" / "CLEAR SPAWNER" / "TO
 * BOSS" as the sweep works through the map. */
function macroThought(
  bot: Bot,
  state: GameState,
  tune: BotTuning,
  goal: Vec2,
): string {
  const stall = state.merchant.pos;
  if (wantsMerchantVisit(state) && stall.x === goal.x && stall.y === goal.y)
    return "TO SHOP";
  const mark = bot.waypoint;
  if (mark && mark.x === goal.x && mark.y === goal.y) return "TO MARK";
  const hunt = seekTarget(bot, state);
  if (hunt && hunt.x === goal.x && hunt.y === goal.y) return "SEEK FIGHT";
  if (!readyForBoss(state, tune) && activeSpawnerNear(state))
    return "CLEAR SPAWNER";
  const content = bot.content?.target;
  if (content && content.x === goal.x && content.y === goal.y)
    return bot.content?.kind === "elite" ? "HUNT ELITE" : "SEEK CHEST";
  const arrowWp = nextPathWaypoint(state);
  if (arrowWp && arrowWp.x === goal.x && arrowWp.y === goal.y)
    return "FOLLOW ARROW";
  const boss = bossPos(state);
  if (boss && boss.x === goal.x && boss.y === goal.y) return "TO BOSS";
  return "EXPLORE FOG";
}

/** Steer toward the current macro goal along its A* route, tagging the thought.
 * The unified macro-travel move — replaces the old authored-path march. */
export function macroSteer(
  bot: Bot,
  state: GameState,
  tune: BotTuning,
): GameInput {
  const goal = macroTarget(bot, state, tune);
  think(bot, macroThought(bot, state, tune, goal));
  return routeSteer(bot, state, goal);
}

// === ANTI-WEDGE UNSTUCK ===
// A deterministic escape hatch for the LAST-RESORT wedge the smart nav can't
// think its way out of: the hero pinned in a concave wall pocket, or locked in
// perpetual flee at low HP with no medkit and nothing he can reach to fight, or
// oscillating on the spot. When he has made no PROGRESS for a while AND has no
// foe he could actually hit, the strategy has clearly failed — so we override it
// with a blind, deterministic sweep: drive a fixed heading for a burst, and if
// still stuck rotate the heading (goalward first, then fanning ± around it, out
// to a full circle). One of those headings is always open (short of being walled
// in on all sides), so this dislodges him from anything and hands control back
// to the normal nav the instant he's moving again.

/** Re-measure movement on this cadence (ms) — coarser than a tick so per-frame
 * jitter doesn't read as movement. */
const UNSTUCK_CHECK_MS = 400;
/** Physically moving less than this (world px) over a check window counts as
 * FROZEN — the CEILING of the speed-aware read below, matching the quickest
 * builds. A genuine pin (wall pocket, flee-lock at low HP with nothing
 * reachable) only ever jitters a few px per window. */
const UNSTUCK_MIN_DISP = 34;
/** The fraction of the hero's OWN top speed a check window must cover to count
 * as moving. The old flat bar (34px/400ms ≈ 85px/s) sat far above a fresh
 * rookie's ~56px/s walk, so every quiet low-level march on a path level read
 * as a wedge and the escape sweep kept overriding the travel plan. Low enough
 * that even the deliberate half-pace recovery walk still reads as progress. */
const UNSTUCK_SPEED_FRAC = 0.3;
/** Frozen this long (with nothing to fight) → last-resort escape sweep. Kept
 * long so the escape is RARE — the smart nav owns ordinary threading; this only
 * breaks a true wedge the strategy can't think its way out of. */
const UNSTUCK_TRIGGER_MS = 2400;
/** Hold each swept heading this long before rotating to the next. */
const UNSTUCK_BURST_MS = 600;
/** How far ahead the escape steer aims along the swept heading. */
const UNSTUCK_REACH = 240;

/** How far the contour trace's body-width probe looks along a candidate escape
 * heading — short enough that a narrow pocket still finds its open mouth, long
 * enough that "open" means real walking room, not a pixel of slack. */
const UNSTUCK_PROBE = 90;
/** Once escaping, keep committing until the hero has physically moved THIS far
 * from where the wedge began — the hysteresis that lets a full sweep round a
 * wall instead of aborting the instant he twitches and the flee drags him back. */
const UNSTUCK_EXIT_DIST = 160;

/**
 * The deterministic anti-wedge override (see the block comment above), or null
 * when the hero is making progress or legitimately fighting. Also OWNS the
 * progress bookkeeping on `bot.nav`, so it must run every tick. Deterministic:
 * the swept heading is a pure function of how long he's been stuck and where the
 * objective lies — no RNG, no wall clock.
 */
export function unstuckInput(
  bot: Bot,
  state: GameState,
  tune: BotTuning,
): GameInput | null {
  // Same as the wall avoidance: the deterministic escape is a MAZE last-resort
  // (path levels). Open maps never wedged the old bot, so leave them untouched.
  if (!onPathLevel(state)) return null;
  const p = state.player.pos;
  const now = state.stats.timeMs;
  if (!bot.nav) {
    bot.nav = {
      lastPos: { x: p.x, y: p.y },
      lastTimeMs: now,
      stuckMs: 0,
      escaping: false,
      escapeStartMs: 0,
      escapeStartPos: { x: p.x, y: p.y },
      escapeHeading: null,
    };
    return null;
  }
  const nav = bot.nav;
  const elapsed = now - nav.lastTimeMs;
  if (elapsed >= UNSTUCK_CHECK_MS) {
    // FROZEN = barely moved this window AND nothing he could reach to fight (a
    // patch brawl legitimately holds him in place, so it never reads as wedged).
    // "Barely" is judged against the hero's OWN pace (capped at the flat bar
    // for the quickest builds) — a slow rookie cruising at full walk speed is
    // making progress, not wedged.
    const minDisp = Math.min(
      UNSTUCK_MIN_DISP,
      playerSpeed(state) * (elapsed / 1000) * UNSTUCK_SPEED_FRAC,
    );
    const moved = distance(p, nav.lastPos);
    if (moved >= minDisp || hasReachableFoe(state)) nav.stuckMs = 0;
    else nav.stuckMs += elapsed;
    nav.lastPos = { x: p.x, y: p.y };
    nav.lastTimeMs = now;
  }

  // Enter the escape only once genuinely frozen; stay committed (hysteresis)
  // until he's physically clear of the wedge, so a full sweep can round a wall
  // instead of aborting the moment he twitches and the flee drags him back in.
  if (!nav.escaping) {
    if (nav.stuckMs < UNSTUCK_TRIGGER_MS) return null;
    nav.escaping = true;
    nav.escapeStartMs = now;
    nav.escapeStartPos = { x: p.x, y: p.y };
    nav.escapeHeading = null;
  } else if (
    hasReachableFoe(state) ||
    distance(p, nav.escapeStartPos) >= UNSTUCK_EXIT_DIST
  ) {
    // Moved clear of the wedge, or reached something to fight → hand back.
    nav.escaping = false;
    nav.stuckMs = 0;
    nav.escapeHeading = null;
    return null;
  }

  // The macro goal orients the escape (goalward heading preferred first).
  const goal = macroTarget(bot, state, tune);
  const heading = goal ?? { ...state.playerSpawn };
  const base = Math.atan2(heading.y - p.y, heading.x - p.x);

  // THE CONTOUR TRACE — what a human does at an obstacle: pick a direction
  // that is actually OPEN and COMMIT to it, tracing the wall until either the
  // exit condition frees him or the wall turns the heading. Probe a body-width
  // sweep along the committed heading each tick; while it stays open, hold it.
  // When it blocks (the contour turned), re-probe a fan of candidates —
  // ordered by closeness to the PREVIOUS committed heading, so the trace BENDS
  // around the corner instead of flipping back into the pocket; with no prior
  // commitment the fan orders goalward-first. The old timed rotation survives
  // only as the fallback when every probe is blocked (walled in on all sides —
  // press and let the wall-slide work). Deterministic throughout: a pure
  // function of state + the bot's nav memory.
  const r = PLAYER.radius;
  const openAlong = (a: number): boolean => {
    const t = {
      x: clamp(p.x + Math.cos(a) * UNSTUCK_PROBE, 20, state.level.width - 20),
      y: clamp(p.y + Math.sin(a) * UNSTUCK_PROBE, 20, state.level.height - 20),
    };
    return !blockedByObstacle(state, p, t, r) && !insideObstacle(state, t, r);
  };
  let angle: number | null = null;
  if (nav.escapeHeading !== null && openAlong(nav.escapeHeading)) {
    angle = nav.escapeHeading; // the committed trace is still open — hold it
  } else {
    const prev = nav.escapeHeading;
    const candidates = [
      base,
      base + Math.PI / 4,
      base - Math.PI / 4,
      base + Math.PI / 2,
      base - Math.PI / 2,
      base + (3 * Math.PI) / 4,
      base - (3 * Math.PI) / 4,
      base + Math.PI,
    ];
    if (prev !== null) {
      // Bend, don't flip: continue nearest the direction already being traced.
      const diff = (a: number): number => {
        const d = Math.abs(a - prev) % (Math.PI * 2);
        return d > Math.PI ? Math.PI * 2 - d : d;
      };
      candidates.sort((a, b) => diff(a) - diff(b));
    }
    for (const c of candidates) {
      if (openAlong(c)) {
        angle = c;
        break;
      }
    }
    nav.escapeHeading = angle;
  }
  const allBlocked = angle === null;
  if (angle === null) {
    // Every probe blocked — the old deterministic timed sweep as a last resort.
    const phase = Math.floor((now - nav.escapeStartMs) / UNSTUCK_BURST_MS) % 8;
    const step = Math.ceil(phase / 2) * (Math.PI / 4);
    angle = base + (phase % 2 === 0 ? step : -step);
  }
  const target = {
    x: p.x + Math.cos(angle) * UNSTUCK_REACH,
    y: p.y + Math.sin(angle) * UNSTUCK_REACH,
  };
  // Hop ONLY when the takeoff can actually buy something: a BODY at contact
  // range is the pin (the untouchable airborne frames slip it), or every probe
  // is blocked (walled in — only a hop over a jumpable neighbor exits). A
  // plain geometry wedge gains nothing from a jump — the walls and scatter
  // rocks that wedge the escape aren't jumpable — and each takeoff spends
  // `STAMINA.jumpCost` of a pool the escape may badly need; the old every-tick
  // hop bounce-hopped the hero across the moon's low-g field and wound him out.
  const pinned =
    threatsWithin(state, CONTACT_DODGE_RADIUS).length > 0 || allBlocked;
  return steer(state, target, pinned && state.player.z === 0);
}
