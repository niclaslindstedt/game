// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// NOTHING IN THE FOG IS A TARGET (engine/game/map.ts `clearOfFog`, read by
// step/weapon.ts `nearestEnemy` and by `nearestCrate`). The main view does not
// draw a mob standing on ground the hero has not uncovered — nor one inside the
// frontier band the fog stipples over — so the autonomous weapon must not fire
// at one either: a shot into the blackness is the character acting on knowledge
// the player does not have. Reach is untouched; a long gun still outranges a
// pistol, it just cannot reach past what has been explored. Exploration never
// rolls back, so a mob that has once stood in the light stays fair game.

import { describe, expect, it } from "vitest";

import { clearOfFog, isExplored, MAP, step } from "@game/core";
import type { GameState } from "@game/core";
// Engine-internal: the crate pick the auto-attack falls back to.
import { nearestCrate } from "../../engine/game/crates.ts";

import {
  clearStage,
  DT,
  equipRangedSidearm,
  idle,
  makeEnemy,
  refog,
  revealAll,
  startGame,
} from "./helpers.ts";

/**
 * A quiet field with the FOG LEFT ON: `clearStage` lifts it wholesale (a staged
 * scene is normally meant to be visible), and the fog is exactly what these
 * tests are here to measure — so it goes straight back on.
 */
function foggyStage(state: GameState): GameState {
  clearStage(state);
  refog(state);
  return state;
}

/** A spot `dist` px due east of the hero — clear ground on the fixture level,
 * and the direction the reveal disc has to be walked to uncover. */
function east(state: GameState, dist: number): { x: number; y: number } {
  const { x, y } = state.players[0].pos;
  return { x: x + dist, y };
}

describe("the fog of war hides a mob from the auto-attack", () => {
  it("holds fire on a mob in reach but standing in the fog", () => {
    const state = foggyStage(equipRangedSidearm(startGame()));
    // 200px out: well inside the blaster's 260 reach, and well past the
    // MAP.revealRadius (160) disc the hero's own walk has uncovered.
    const spot = east(state, 200);
    state.enemies.push(makeEnemy({ pos: spot }));
    expect(clearOfFog(state, spot)).toBe(false);

    step(state, idle, DT);

    expect(state.projectiles).toHaveLength(0);
    expect(state.stats.shotsFired).toBe(0);
  });

  it("shoots that same mob the moment the ground under it clears", () => {
    const state = foggyStage(equipRangedSidearm(startGame()));
    const spot = east(state, 200);
    state.enemies.push(makeEnemy({ pos: spot }));
    step(state, idle, DT);
    expect(state.projectiles).toHaveLength(0);

    // The hero has now walked this floor — nothing else about the arrangement
    // changed, and the shot goes off.
    revealAll(state);
    step(state, idle, DT);

    expect(state.projectiles).toHaveLength(1);
    expect(state.projectiles[0]!.dir.x).toBeGreaterThan(0);
  });

  it("refuses a mob standing in the frontier BAND, not merely in the dark", () => {
    // The band is the graded stipple between clear ground and the never-seen
    // dark, and the renderer hides a body standing anywhere in it. So being on
    // an explored cell is not enough: the answer has to be the same one the
    // picture gives, or the hero shoots a silhouette nobody can see.
    const state = foggyStage(startGame());
    const inBand = east(state, MAP.revealRadius - MAP.fogBand / 2);
    expect(isExplored(state, inBand)).toBe(true); // the raw grid says "seen"
    expect(clearOfFog(state, inBand)).toBe(false); // …the band says "not yet"

    const wellInside = east(state, MAP.revealRadius - MAP.fogBand * 2);
    expect(clearOfFog(state, wellInside)).toBe(true);
  });

  it("never fogs a body against the level's edge — off-map is not undiscovered", () => {
    // The renderer seeds off-map cells as frontier so a level's rim stipples;
    // the targeting read deliberately does not, because a mob pinned against
    // the boundary (bodies clamp to their own radius) would otherwise be
    // untargetable for the rest of the run, melee included.
    const state = startGame();
    revealAll(state);
    expect(clearOfFog(state, { x: 2, y: 2 })).toBe(true);
    expect(
      clearOfFog(state, {
        x: state.level.width - 2,
        y: state.level.height - 2,
      }),
    ).toBe(true);
  });

  it("leaves a crate in the fog alone until the hero has seen it", () => {
    const state = foggyStage(startGame());
    const spot = east(state, 200);
    // REPLACED rather than pushed into: the obstacle spatial index caches on
    // the array's identity (obstacles.ts), so a pushed crate registers in no
    // cell of the grid a run has already built.
    state.obstacles = [
      {
        id: state.nextId++,
        kind: "test_block",
        sprite: "test_block",
        pos: spot,
        radius: 13,
        jumpable: true, // a crate is jumpable cover — and never blocks its own sight line
        breakable: true,
        hp: 50,
        maxHp: 50,
      },
    ];

    expect(
      nearestCrate(state, state.players[0].pos, 260, state.players[0]),
    ).toBeUndefined();
    revealAll(state);
    expect(
      nearestCrate(state, state.players[0].pos, 260, state.players[0])?.pos,
    ).toEqual(spot);
  });
});
