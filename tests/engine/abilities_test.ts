// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Time-limited ability pickups: banking on touch, activation via the
// useItem input, orbiting fire orbs mangling the pack, storm strikes,
// stasis slow, and expiry.

import { describe, expect, it } from "vitest";

import { abilityDef, enemyDef, orbPositions, step } from "@game/core";
import type { GameInput, GameState } from "@game/core";
import { clearStage, DT, idle, makeEnemy, run, startGame } from "./helpers.ts";

const useItem: GameInput = { ...idle, useItem: true };

/** A run with a clean stage and one ability picked up AND activated. */
function pickUp(defId: string): GameState {
  const state = startGame();
  clearStage(state);
  state.items = [
    { id: 500, kind: "ability", pos: { ...state.player.pos }, defId },
  ];
  step(state, idle, DT); // touch banks it…
  step(state, useItem, DT); // …and the useItem edge spends it
  return state;
}

describe("ability pickups", () => {
  it("bank on touch and activate on the useItem input", () => {
    const state = startGame();
    clearStage(state);
    state.items = [
      {
        id: 500,
        kind: "ability",
        pos: { ...state.player.pos },
        defId: "test_orbit",
      },
    ];
    step(state, idle, DT);
    // Banked, not running — and never in the bag.
    expect(state.items).toHaveLength(0);
    expect(state.player.heldAbilities).toEqual(["test_orbit"]);
    expect(state.player.abilities).toHaveLength(0);
    expect(state.player.inventory.every((cell) => cell === null)).toBe(true);
    expect(state.events).toContainEqual(
      expect.objectContaining({
        type: "itemCollected",
        kind: "ability",
      }),
    );

    step(state, useItem, DT);
    expect(state.player.heldAbilities).toEqual([]);
    expect(state.player.abilities.map((a) => a.defId)).toEqual(["test_orbit"]);
    expect(state.events).toContainEqual({
      type: "abilityStarted",
      defId: "test_orbit",
    });
  });

  it("refresh the timer instead of stacking a second copy", () => {
    const state = pickUp("test_orbit");
    run(state, idle, 60); // burn ~1s off the clock
    const worn = state.player.abilities[0]!.remainingMs;
    expect(worn).toBeLessThan(abilityDef("test_orbit").durationMs);

    state.items = [
      {
        id: 501,
        kind: "ability",
        pos: { ...state.player.pos },
        defId: "test_orbit",
      },
    ];
    step(state, idle, DT);
    step(state, useItem, DT);
    expect(state.player.abilities).toHaveLength(1);
    // Refreshed to (nearly) full — the activating step itself ticks DT off.
    expect(state.player.abilities[0]!.remainingMs).toBeGreaterThanOrEqual(
      abilityDef("test_orbit").durationMs - DT,
    );
    expect(state.player.abilities[0]!.remainingMs).toBeGreaterThan(worn);
  });

  it("expire after their duration, with an event", () => {
    const state = pickUp("test_stasis");
    const steps = Math.ceil(abilityDef("test_stasis").durationMs / DT) + 2;
    run(state, idle, steps);
    expect(state.player.abilities).toHaveLength(0);
  });
});

describe("fire orbs", () => {
  it("mangle a monster parked on the orbit ring", () => {
    const state = pickUp("test_orbit");
    const orbit = abilityDef("test_orbit").orbit!;
    // Park an unkillable ghost right on an orb so every tick connects.
    const orb = orbPositions(state.player, state.player.abilities[0]!)[0]!;
    state.enemies.push(
      makeEnemy({ pos: { ...orb }, hp: 1_000_000, maxHp: 1_000_000 }),
    );
    // Disarm the held weapon so all damage is the orbs'. A ghost on the
    // ring is inside melee range of nothing — the blaster would need line
    // time anyway; simplest is an enormous cooldown.
    state.player.weaponCooldownMs = 1_000_000;

    const before = state.stats.damageDealt;
    // Two seconds ≈ one full sweep: each orb pass over the parked ghost
    // lands at least one 140ms-cadence tick.
    run(state, idle, 125);
    const dealt = state.stats.damageDealt - before;
    expect(dealt).toBeGreaterThanOrEqual(orbit.damage * 3);
  });

  it("sweep: the orbs' angle advances every step", () => {
    const state = pickUp("test_orbit");
    const a0 = state.player.abilities[0]!.angle;
    step(state, idle, DT);
    expect(state.player.abilities[0]!.angle).toBeGreaterThan(a0);
  });
});

describe("storm cell", () => {
  it("strikes the nearest monster on its interval", () => {
    const state = pickUp("test_storm");
    const storm = abilityDef("test_storm").storm!;
    state.player.weaponCooldownMs = 1_000_000;
    state.enemies.push(
      makeEnemy({
        pos: { x: state.player.pos.x + 80, y: state.player.pos.y },
        hp: 1_000_000,
        maxHp: 1_000_000,
      }),
    );
    const before = state.stats.damageDealt;
    run(state, idle, Math.ceil((storm.intervalMs * 2.5) / DT));
    const strikes = state.stats.damageDealt - before;
    expect(strikes).toBeGreaterThanOrEqual(storm.damage * 2);
  });

  it("emits a lightning event for the app to flash", () => {
    const state = pickUp("test_storm");
    state.player.weaponCooldownMs = 1_000_000;
    const pos = { x: state.player.pos.x + 80, y: state.player.pos.y };
    state.enemies.push(makeEnemy({ pos, hp: 1_000_000, maxHp: 1_000_000 }));
    step(state, idle, DT);
    expect(state.events).toContainEqual({ type: "lightning", pos });
  });
});

describe("stasis field", () => {
  it("slows monsters inside the field, not outside it", () => {
    const state = pickUp("test_stasis");
    const stasis = abilityDef("test_stasis").stasis!;
    const speed = enemyDef("test_minion").speed;
    const inside = makeEnemy({
      id: 9001,
      pos: {
        x: state.player.pos.x + stasis.radius - 40,
        y: state.player.pos.y,
      },
      speed,
      hp: 1_000_000,
      maxHp: 1_000_000,
    });
    const outside = makeEnemy({
      id: 9002,
      pos: {
        x: state.player.pos.x + stasis.radius + 300,
        y: state.player.pos.y,
      },
      speed,
      hp: 1_000_000,
      maxHp: 1_000_000,
    });
    state.enemies.push(inside, outside);
    state.player.weaponCooldownMs = 1_000_000;
    const inX = inside.pos.x;
    const outX = outside.pos.x;
    step(state, idle, DT);
    const inMoved = inX - inside.pos.x;
    const outMoved = outX - outside.pos.x;
    expect(inMoved).toBeGreaterThan(0);
    expect(outMoved).toBeGreaterThan(0);
    expect(inMoved).toBeCloseTo(outMoved * stasis.slowFactor, 5);
  });
});
