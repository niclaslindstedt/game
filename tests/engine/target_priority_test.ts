// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE BEST TARGET, not merely the nearest one (engine/game/step/weapon.ts
// `nearestEnemy`, `TARGET_PRIORITY`): with nobody pointing — touch, a gamepad,
// FOLLOW CURSOR steering, a bot — the auto-weapon weights each reachable foe's
// distance by its ROLE, so a set piece outranks the chaff standing in front of
// it. It is a preference and never a lock: a minion close enough still wins,
// and an explicit pointer bearing (`GameInput.aim`) outranks the weighting.

import { describe, expect, it } from "vitest";

import { step } from "@game/core";

import {
  clearStage,
  DT,
  equipRangedSidearm,
  idle,
  makeEnemy,
  startGame,
} from "./helpers.ts";

/**
 * A blaster-armed run with a MINION to the right and a set piece to the left,
 * both well inside the blaster's reach so the pick is about role, not range.
 * `eliteDist` places the set piece; the minion always stands 60px out.
 */
function minionAndSetPiece(defId: string, eliteDist: number) {
  const state = equipRangedSidearm(startGame());
  clearStage(state);
  const { x, y } = state.players[0].pos;
  state.enemies.push(makeEnemy({ id: 1, pos: { x: x + 60, y } }));
  // The def is what carries the role the weighting reads.
  state.enemies.push(
    makeEnemy({ id: 2, pos: { x: x - eliteDist, y }, hp: 400, maxHp: 400 }),
  );
  const elite = state.enemies.find((e) => e.id === 2)!;
  elite.defId = defId;
  return { state, x, y };
}

describe("target priority", () => {
  it("picks the elite over a nearer minion", () => {
    // The elite stands 100px out against the minion's 60 — beyond plain
    // nearest, inside the elite's 2× allowance.
    const { state } = minionAndSetPiece("test_elite", 100);
    step(state, idle, DT);
    expect(state.projectiles).toHaveLength(1);
    // The bolt heads LEFT, toward the elite.
    expect(state.projectiles[0]!.dir.x).toBeLessThan(0);
  });

  it("picks the boss over a minion nearly four times closer", () => {
    const { state } = minionAndSetPiece("test_boss", 220);
    step(state, idle, DT);
    expect(state.projectiles).toHaveLength(1);
    expect(state.projectiles[0]!.dir.x).toBeLessThan(0);
  });

  it("still takes the minion when it is close enough", () => {
    // Past the allowance the horde wins again — the weighting is a bias, not a
    // lock, so a minion in the hero's face is never ignored for a distant boss.
    const { state } = minionAndSetPiece("test_boss", 400);
    state.enemies[0]!.pos.x = state.players[0].pos.x + 20;
    step(state, idle, DT);
    expect(state.projectiles).toHaveLength(1);
    expect(state.projectiles[0]!.dir.x).toBeGreaterThan(0);
  });

  it("lets an explicit pointer bearing outrank the role weighting", () => {
    // AIM & SHOOT: the cursor is thrown at the minion on the right while an
    // elite stands off to the left. A player who points at something gets it.
    const { state, x, y } = minionAndSetPiece("test_elite", 100);
    step(state, { ...idle, aim: { x: x + 1000, y } }, DT);
    expect(state.projectiles).toHaveLength(1);
    expect(state.projectiles[0]!.dir.x).toBeGreaterThan(0);
  });

  it("never leaves the hero unable to fire at a lone minion", () => {
    const state = equipRangedSidearm(startGame());
    clearStage(state);
    const { x, y } = state.players[0].pos;
    state.enemies.push(makeEnemy({ id: 1, pos: { x: x + 100, y } }));
    step(state, idle, DT);
    expect(state.projectiles).toHaveLength(1);
  });
});
