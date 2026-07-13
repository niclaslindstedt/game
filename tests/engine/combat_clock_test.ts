// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The farm-proof survival clock (stats.combatMs): survival time only accrues
// while a fight is LIVE — a foe on the field, or within RUN.combatGraceMs of
// the last kill. A cleared field can't be loitered on to pad survival time,
// which is what the hardcore high-score board banks. The wall clock
// (stats.timeMs) keeps ticking every frame regardless — it drives the timed
// sub-systems and must never freeze.

import { describe, expect, it } from "vitest";

import { killEnemy, RUN, step } from "@game/core";

import { DT, idle, makeEnemy, startGame, stopWaves } from "./helpers.ts";

describe("combat survival clock", () => {
  it("freezes on an empty field while the wall clock keeps ticking", () => {
    const state = startGame();
    stopWaves(state);
    state.enemies = [];
    state.combatGraceMs = 0;

    const combatBefore = state.stats.combatMs;
    const wallBefore = state.stats.timeMs;
    step(state, idle, DT);

    // No foe, no grace → the survival clock stands still...
    expect(state.stats.combatMs).toBe(combatBefore);
    // ...but the wall clock (the sub-systems' clock) advanced this frame.
    expect(state.stats.timeMs).toBe(wallBefore + DT);
  });

  it("ticks while a foe stands on the field", () => {
    const state = startGame();
    stopWaves(state);
    state.enemies = [makeEnemy({ pos: { x: 4000, y: 4000 } })]; // far, inert
    state.combatGraceMs = 0;

    const before = state.stats.combatMs;
    step(state, idle, DT);
    expect(state.stats.combatMs).toBe(before + DT);
  });

  it("a kill refreshes the post-kill grace tail", () => {
    const state = startGame();
    stopWaves(state);
    const foe = makeEnemy({ pos: { x: 4000, y: 4000 }, hp: 1 });
    state.enemies = [foe];
    state.combatGraceMs = 0;

    killEnemy(state, foe, 10, false);
    expect(state.enemies).toHaveLength(0);
    expect(state.combatGraceMs).toBe(RUN.combatGraceMs);
  });

  it("keeps ticking through the grace tail, then freezes once it lapses", () => {
    const state = startGame();
    stopWaves(state);
    state.enemies = [];
    // A cleared field, but a kill just landed: the grace tail is armed.
    state.combatGraceMs = RUN.combatGraceMs;

    // Step out the grace window: the clock accrues (essentially) the whole
    // tail — within one frame, since the grace decrements before the accrual
    // check, so the final partial frame doesn't count.
    const graceFrames = Math.ceil(RUN.combatGraceMs / DT);
    const before = state.stats.combatMs;
    for (let i = 0; i < graceFrames; i++) step(state, idle, DT);
    expect(state.stats.combatMs - before).toBeGreaterThanOrEqual(
      RUN.combatGraceMs - DT,
    );
    expect(state.combatGraceMs).toBe(0);

    // Grace lapsed and the field is still empty → the clock now stands still.
    const afterGrace = state.stats.combatMs;
    for (let i = 0; i < 10; i++) step(state, idle, DT);
    expect(state.stats.combatMs).toBe(afterGrace);
  });
});
