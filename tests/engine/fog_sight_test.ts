// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE FOG STOPS AT THE WALLS (src/game/fog.ts `revealAround`). The sweep that
// lifts the fog is a disc of everything the hero can SEE, not a disc: ground
// behind a wall stays dark until he stands somewhere it is in view, so rounding
// a corner is a discovery and a doorway shows a cone of the room rather than
// the room. What the disc alone used to do was let him see THROUGH the level —
// standing outside a compound uncovered its interior, mobs and all, because a
// body is drawn exactly where the fog has lifted.
//
// The second half of the rule is the one that is easy to get wrong in the other
// direction: the sweep reaches `MAP.fogWallDepth` PAST whatever blocks it, so
// the wall's own ground comes up seen. Without that, every wall in the level
// carries a fog frontier along its inside face — and the frontier is what the
// band stipples over and what `clearOfFog` refuses to target inside of, which
// would leave a mob pressed against a wall undrawn and unshootable in the room
// the hero is standing in.

import { describe, expect, it } from "vitest";

import { clearOfFog, isExplored, MAP } from "@game/core";
import type { GameState, Obstacle, Vec2 } from "@game/core";
// Engine-internal: the sweep itself, run here without a whole step.
import { revealAround } from "../../src/game/fog.ts";

import { startGame } from "./helpers.ts";

/** Where the hero stands for every case below — open floor on the fixture
 * level, far enough from its rim that the disc never clips it. */
const HERO: Vec2 = { x: 600, y: 800 };
/** The wall's centre line: 60 px east of the hero, well inside the disc, and a
 * short run so there is an END to walk around. */
const WALL_X = 660;
const WALL_FROM_Y = 600;
const WALL_TO_Y = 880;
/** A spot in the wall's shadow: 152 px out, so inside `MAP.revealRadius` (160)
 * and past the `MAP.fogWallDepth` the sweep reaches beyond the stone. */
const BEHIND: Vec2 = { x: 752, y: 800 };
/** …and one on the hero's own side of it. */
const INFRONT: Vec2 = { x: 624, y: 800 };

/**
 * A run with the level's own scatter swapped for one hand-built wall — a chain
 * of solid circles, exactly how `buildWalls` expands an authored segment. The
 * array is REPLACED rather than mutated: the obstacle grid caches on its
 * identity (see obstacles.ts).
 */
function walledStage(jumpable = false): GameState {
  const state = startGame();
  const wall: Obstacle[] = [];
  for (let y = WALL_FROM_Y; y <= WALL_TO_Y; y += 12) {
    wall.push({
      id: state.nextId++,
      kind: "test_wall",
      sprite: "test_wall",
      pos: { x: WALL_X, y },
      radius: 10,
      jumpable,
    });
  }
  state.obstacles = wall;
  state.players[0].pos = { ...HERO };
  return state;
}

/** Put the whole level back in the dark and sweep once from `from`. */
function lookFrom(state: GameState, from: Vec2, refog = true): void {
  if (refog) state.explored.fill(0);
  revealAround(state, from);
}

describe("the fog of war stops at a wall", () => {
  it("leaves the ground behind a wall dark while lifting the ground in front", () => {
    const state = walledStage();
    lookFrom(state, HERO);

    expect(isExplored(state, INFRONT)).toBe(true);
    expect(isExplored(state, BEHIND)).toBe(false);
  });

  it("uncovers that same ground once the hero walks around the wall's end", () => {
    const state = walledStage();
    lookFrom(state, HERO);
    expect(isExplored(state, BEHIND)).toBe(false);

    // South past the wall's end and a step east of it: nothing stands between
    // him and the spot now, and it is still inside his disc.
    const past: Vec2 = { x: 740, y: 940 };
    expect(Math.hypot(BEHIND.x - past.x, BEHIND.y - past.y)).toBeLessThan(
      MAP.revealRadius,
    );
    lookFrom(state, past, false);

    expect(isExplored(state, BEHIND)).toBe(true);
  });

  it("uncovers the whole disc when nothing stands in the way", () => {
    // The other direction: occlusion must not eat ground the hero can plainly
    // see, or the fog would close in around him on an open field.
    const state = walledStage();
    state.obstacles = [];
    lookFrom(state, HERO);

    expect(isExplored(state, BEHIND)).toBe(true);
  });

  it("sees over the low props a shot flies over", () => {
    // `lineOfSight` is the query, so the rule is the shot's: a desk, a crate, a
    // hop-rock is cover you look across, not a wall.
    const state = walledStage(true);
    lookFrom(state, HERO);

    expect(isExplored(state, BEHIND)).toBe(true);
  });
});

describe("a wall's shadow does not blind the room the hero is in", () => {
  it("keeps a mob pressed against the near face of the wall a target", () => {
    const state = walledStage();
    lookFrom(state, HERO);

    // Hard against the stone on the hero's side — the spot the naive "stop the
    // sight line ON the wall" version put inside the frontier band.
    expect(clearOfFog(state, { x: WALL_X - 24, y: 800 })).toBe(true);
  });

  it("still refuses a mob standing just past it", () => {
    const state = walledStage();
    lookFrom(state, HERO);

    expect(clearOfFog(state, { x: WALL_X + 60, y: 800 })).toBe(false);
  });
});
