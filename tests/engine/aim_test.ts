// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Desktop mouse aim (src/game/step.ts `stepWeapon` / `nearestEnemy`): the
// character fights autonomously — it locks the nearest visible foe — but a
// desktop pointer (`GameInput.aim`, a world point) adds a second steering
// dimension. When foes stand in several directions, the one the cursor points
// at outranks a merely-closer one elsewhere; with no aim, or the cursor over
// empty space, targeting stays the plain nearest foe so the hero always fires.

import { describe, expect, it } from "vitest";

import { step } from "@game/core";

import {
  clearStage,
  DT,
  equipBlaster,
  idle,
  makeEnemy,
  run,
  startGame,
} from "./helpers.ts";

/** A fresh blaster-armed run with only two hand-placed foes: a near one to the
 * right of the hero and a farther one to the left. Both are well inside the
 * blaster's reach, so the pick is about direction, not range. */
function twoFoes() {
  const state = equipBlaster(startGame());
  clearStage(state);
  const { x, y } = state.player.pos;
  state.enemies.push(makeEnemy({ id: 1, pos: { x: x + 40, y } })); // right, near
  state.enemies.push(makeEnemy({ id: 2, pos: { x: x - 120, y } })); // left, far
  return { state, x, y };
}

describe("mouse aim", () => {
  it("targets the nearest foe when no pointer aim is given", () => {
    const { state } = twoFoes();
    step(state, idle, DT);
    expect(state.projectiles).toHaveLength(1);
    // The bolt heads right, toward the closer foe.
    expect(state.projectiles[0]!.dir.x).toBeGreaterThan(0);
  });

  it("aims at the foe in the pointer's direction over a closer one elsewhere", () => {
    const { state, x, y } = twoFoes();
    // Pointer thrown well to the LEFT — toward the farther foe.
    step(state, { ...idle, aim: { x: x - 1000, y } }, DT);
    expect(state.projectiles).toHaveLength(1);
    expect(state.projectiles[0]!.dir.x).toBeLessThan(0);
  });

  it("still favors the near foe when the pointer aims its way", () => {
    const { state, x, y } = twoFoes();
    // Pointer to the RIGHT — same side as the closer foe.
    step(state, { ...idle, aim: { x: x + 1000, y } }, DT);
    expect(state.projectiles).toHaveLength(1);
    expect(state.projectiles[0]!.dir.x).toBeGreaterThan(0);
  });

  it("fires at the only foe even when the pointer aims at empty space", () => {
    const state = equipBlaster(startGame());
    clearStage(state);
    const { x, y } = state.player.pos;
    // A single foe to the LEFT; the cursor points at nothing on the RIGHT.
    state.enemies.push(makeEnemy({ id: 1, pos: { x: x - 100, y } }));
    step(state, { ...idle, aim: { x: x + 1000, y } }, DT);
    // The bias never leaves the hero unable to fire — it still shoots the foe.
    expect(state.projectiles).toHaveLength(1);
    expect(state.projectiles[0]!.dir.x).toBeLessThan(0);
  });

  it("holds fire while the manual trigger is up (fire === false)", () => {
    const { state } = twoFoes();
    // AIM & SHOOT with AUTO-FIRE off and the button up: no shot leaves even
    // with a foe squarely in range.
    run(state, { ...idle, fire: false }, 10);
    expect(state.projectiles).toHaveLength(0);
  });

  it("fires the instant the manual trigger is pressed", () => {
    const { state } = twoFoes();
    // The cooldown recovers while the trigger is up…
    run(state, { ...idle, fire: false }, 10);
    expect(state.projectiles).toHaveLength(0);
    // …so the press fires on its very first tick.
    step(state, { ...idle, fire: true }, DT);
    expect(state.projectiles).toHaveLength(1);
  });

  it("fires autonomously when the gate is absent", () => {
    const { state } = twoFoes();
    // Touch, bots, and every auto-fire scheme leave `fire` undefined.
    step(state, idle, DT);
    expect(state.projectiles).toHaveLength(1);
  });

  it("keeps a point-blank foe as the target regardless of pointer direction", () => {
    const state = equipBlaster(startGame());
    clearStage(state);
    const { x, y } = state.player.pos;
    // A foe right on the hero (no bearing — the dist-0 alignment guard) plus a
    // clean shot out to the right. Aiming right must NOT pull the pick off the
    // point-blank threat: distance 0 always scores lowest.
    state.enemies.push(makeEnemy({ id: 1, pos: { x, y } }));
    state.enemies.push(makeEnemy({ id: 2, pos: { x: x + 120, y } }));
    run(state, { ...idle, aim: { x: x + 1000, y } }, 4);
    // The point-blank foe took the fire; the far-right one is untouched.
    expect(state.enemies.find((e) => e.id === 1)!.hp).toBeLessThan(45);
    expect(state.enemies.find((e) => e.id === 2)!.hp).toBe(45);
  });
});
