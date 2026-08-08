// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The autopilot's per-tick THREAT SCAN (engine/game/bot/perception.ts): the one
// sorted nearest-first sweep of the horde every "who's near me" read serves a
// prefix of.
//
// Its buffers are POOLED across ticks (rebuilding them per tick allocated a
// pairing object per live monster plus three arrays, every tick of every
// simulated run), which means the arrays outlive the horde that filled them
// and keep a tail of last tick's monsters past the live prefix. These pin the
// two things that tail could break: a shrinking horde must never surface a
// dead monster, and the count-only query must agree with the list it replaced.

import { describe, expect, it } from "vitest";

import type { Enemy } from "@game/core";
import {
  nearestEnemy,
  threatCountWithin,
  threatsWithin,
} from "../../engine/game/bot/perception.ts";
import { makeEnemy, startGame } from "./helpers.ts";

/** Park `count` monsters in a line marching away from the hero, nearest first. */
function lineUp(state: ReturnType<typeof startGame>, count: number): Enemy[] {
  const { x, y } = state.players[0].pos;
  const enemies: Enemy[] = [];
  for (let i = 0; i < count; i++) {
    enemies.push(makeEnemy({ id: 100 + i, pos: { x: x + 20 * (i + 1), y } }));
  }
  state.enemies.length = 0;
  state.enemies.push(...enemies);
  return enemies;
}

/** Advance the scan's cache key — it memoizes on the sim clock. */
function tick(state: ReturnType<typeof startGame>): void {
  state.stats.timeMs += 16;
}

describe("the autopilot threat scan", () => {
  it("counts and lists the same ring", () => {
    const state = startGame();
    lineUp(state, 12);
    for (const radius of [0, 25, 45, 90, 200, 10_000]) {
      expect(threatCountWithin(state, state.players[0], radius)).toBe(
        threatsWithin(state, state.players[0], radius).length,
      );
    }
  });

  it("sorts nearest first", () => {
    const state = startGame();
    const { x, y } = state.players[0].pos;
    state.enemies.length = 0;
    state.enemies.push(
      makeEnemy({ id: 1, pos: { x: x + 300, y } }),
      makeEnemy({ id: 2, pos: { x: x + 40, y } }),
      makeEnemy({ id: 3, pos: { x: x + 120, y } }),
    );
    expect(
      threatsWithin(state, state.players[0], 10_000).map((e) => e.id),
    ).toEqual([2, 3, 1]);
    expect(nearestEnemy(state, state.players[0])?.id).toBe(2);
  });

  it("never surfaces a monster the horde has shed", () => {
    const state = startGame();
    lineUp(state, 30);
    // Fill the pooled buffers at the horde's high-water mark…
    expect(threatCountWithin(state, state.players[0], 10_000)).toBe(30);

    // …then wipe the field. The buffers still hold all 30 past the live
    // prefix, so a walk bounded by `.length` rather than the live count would
    // hand the bot thirty ghosts to fight.
    state.enemies.length = 0;
    tick(state);
    expect(threatCountWithin(state, state.players[0], 10_000)).toBe(0);
    expect(threatsWithin(state, state.players[0], 10_000)).toEqual([]);
    expect(nearestEnemy(state, state.players[0])).toBeUndefined();

    // A smaller horde reads as exactly itself, not as itself plus the tail.
    const survivors = lineUp(state, 3);
    tick(state);
    expect(
      threatsWithin(state, state.players[0], 10_000).map((e) => e.id),
    ).toEqual(survivors.map((e) => e.id));
  });

  it("re-reads the field when the hero moves within one tick", () => {
    const state = startGame();
    const { x, y } = state.players[0].pos;
    state.enemies.length = 0;
    state.enemies.push(makeEnemy({ id: 7, pos: { x: x + 200, y } }));
    expect(threatCountWithin(state, state.players[0], 100)).toBe(0);
    // The scan keys on the hero's position as well as the clock, so a step
    // toward the foe is seen at once rather than on the next tick.
    state.players[0].pos.x += 150;
    expect(threatCountWithin(state, state.players[0], 100)).toBe(1);
  });
});
