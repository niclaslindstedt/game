// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Navigation senses (src/game/bot/index.ts + obstacles.ts): the WALL-END sense —
// "can I see where this obstacle ends?" — that lets a blocked walker trace a
// wall toward its visible end instead of oscillating against it, and the
// GUIDANCE-ARROW macro objective — the bot heeds the same "go this way"
// arrow the player sees, marching the authored intended path waypoint by
// waypoint. Runs on `test_path_level`, the only fixture that authors a path
// (the maze-only nav rules are gated to path levels).

import { describe, expect, it } from "vitest";

import { botAct, createBot, step, type Bot, type GameState } from "@game/core";
import { visibleObstacleEnd } from "../../src/game/obstacles.ts";
import { clearStage, DT, idle, startGame } from "./helpers.ts";

import { distance as dist } from "@game/lib/vec.ts";

/** Step the sim with the bot at the controls (no level-ups occur here). */
function drive(
  state: GameState,
  bot: Bot,
  maxSteps: number,
  done?: (s: GameState) => boolean,
): number {
  for (let i = 0; i < maxSteps; i++) {
    if (done?.(state)) return i;
    step(state, botAct(bot, state), DT);
  }
  return maxSteps;
}

/** A solid (un-jumpable) wall rectangle, replacing the scattered fixtures so
 * the geometry under test is exactly what the test placed. */
function wall(
  cx: number,
  cy: number,
  halfX: number,
  halfY: number,
): GameState["obstacles"][number] {
  return {
    id: 9400,
    kind: "test_wall",
    sprite: "wall",
    pos: { x: cx, y: cy },
    radius: Math.hypot(halfX, halfY),
    half: { x: halfX, y: halfY },
    jumpable: false,
  };
}

describe("the wall-end sense (visibleObstacleEnd)", () => {
  // Hero-side geometry: the fixture hero spawns at (340, 1320); a vertical
  // wall to his east spans y 1240..1540 — its NORTH end 80px above his line,
  // its SOUTH end 220px below. The nearer (north) end is well inside the
  // 200px sight radius; a walker looking along the wall sees it.
  function stage(): GameState {
    const state = startGame(42, "test_path_level");
    clearStage(state);
    state.obstacles = [wall(440, 1390, 10, 150)];
    return state;
  }
  const from = { x: 340, y: 1320 };
  const goal = { x: 640, y: 1320 };

  const sight = () => 200;

  it("returns null when the straight sweep is already clear", () => {
    const state = stage();
    expect(
      visibleObstacleEnd(state, from, { x: 340, y: 1100 }, 10, sight),
    ).toBe(null);
  });

  it("finds the blocking wall's nearer visible end", () => {
    const state = stage();
    const end = visibleObstacleEnd(state, from, goal, 10, sight);
    expect(end).not.toBe(null);
    // The wall's NORTH end turns fewer degrees off the goal line — the sense
    // points up and around it, not down the long way.
    expect(end!.side).toBe(-1);
    expect(end!.point.y).toBeLessThan(from.y);
    // The detour point still makes eastward progress toward the goal.
    expect(end!.point.x).toBeGreaterThan(from.x);
  });

  it("holds a latched side while that side still shows an end", () => {
    const state = stage();
    // A tracer already committed to the (longer) south side keeps it — the
    // hysteresis that stops a long wall being oscillated against.
    const end = visibleObstacleEnd(state, from, goal, 10, sight, 1);
    expect(end).not.toBe(null);
    expect(end!.side).toBe(1);
    expect(end!.point.y).toBeGreaterThan(from.y);
  });

  it("does not know an end it cannot see", () => {
    // The same wall on a screen too small to show either end: every bearing's
    // sight falls short of clearing it, so the sense honestly returns null —
    // the bot knows only what a player watching the screen knows.
    const state = stage();
    expect(visibleObstacleEnd(state, from, goal, 10, () => 60)).toBe(null);
  });
});

describe("the reported screen rect (state.view)", () => {
  it("step() remembers the camera rect the app reports", () => {
    const state = startGame(42, "test_path_level");
    clearStage(state);
    expect(state.view).toBeUndefined(); // headless until the app reports one
    const rect = { x: 120, y: 80, width: 422, height: 780 };
    step(state, { ...idle, view: rect }, DT);
    expect(state.view).toEqual(rect);
    expect(state.view).not.toBe(rect); // copied, never aliased
    // A tick without a rect (a headless consumer) keeps the last-known one.
    step(state, idle, DT);
    expect(state.view).toEqual(rect);
  });
});

describe("bot guidance-arrow march", () => {
  it("follows the guidance arrow toward the next path waypoint", () => {
    const state = startGame(42, "test_path_level");
    clearStage(state);
    // Under-levelled vs the parked boss (as on the real maps) with untouched
    // fog: without the arrow this staging reads EXPLORE FOG — the arrow must
    // outrank the fog sweep and pull him up the authored path instead.
    for (const e of state.enemies) e.mlvl = 20;
    state.obstacles = state.obstacles.filter((o) => !o.chest);
    const wp = { x: 800, y: 1100 }; // the path's first waypoint
    const before = dist(state.player.pos, wp);
    const bot = createBot("survivor");
    // Stay inside the anti-loiter window (seekFightAfterMs, 5s) so the lull
    // never latches a hunt on the parked boss.
    drive(state, bot, 250);
    expect(bot.lastThought).toBe("FOLLOW ARROW");
    expect(dist(state.player.pos, wp)).toBeLessThan(before - 80);
  });

  it("falls back to the normal plan once the whole path is walked", () => {
    const state = startGame(42, "test_path_level");
    clearStage(state);
    for (const e of state.enemies) e.mlvl = 20;
    state.obstacles = state.obstacles.filter((o) => !o.chest);
    state.pathIndex = 4; // every waypoint retired — the arrow is gone
    const bot = createBot("survivor");
    botAct(bot, state);
    expect(bot.lastThought).not.toBe("FOLLOW ARROW");
  });
});

describe("bot wall tracing", () => {
  it("rounds a long wall via its visible end instead of wedging on it", () => {
    // The reported failure staged exactly: the objective sits east, a long
    // wall stands in the way, its SOUTH end runs into the level edge (no way
    // around below) while its NORTH end is visibly on screen. The bot must
    // trace the wall NORTH — toward where it ends — and reach the mark, not
    // bounce up and down against the stone.
    const state = startGame(42, "test_path_level");
    clearStage(state);
    // One wall from y=1200 down to the level's bottom edge (height 1600).
    state.obstacles = [wall(600, 1400, 12, 200)];
    const bot = createBot("survivor");
    const mark = { x: 900, y: 1320 };
    bot.waypoint = mark; // the pinned GPS nudge — outranks every other errand
    // "Arrived" matches the nudge's own consume radius (WAYPOINT_REACH, 120):
    // closing past it clears the pin and the normal plan resumes.
    const steps = drive(
      state,
      bot,
      2000,
      (s) => dist(s.player.pos, mark) <= 120,
    );
    expect(steps).toBeLessThan(2000);
    expect(state.player.pos.x).toBeGreaterThan(612);
  });
});
