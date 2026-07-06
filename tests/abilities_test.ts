// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Time-limited ability pickups: activation on touch, orbiting fire orbs
// mangling the pack, storm strikes, stasis slow, and expiry.

import { describe, expect, it } from "vitest";

import {
  ABILITY_DEFS,
  abilityDef,
  ENEMY_DEFS,
  orbPositions,
  step,
} from "@game/core";
import type { GameState } from "@game/core";
import { clearStage, DT, idle, makeEnemy, run, startGame } from "./helpers.ts";

/** A run with a clean stage and one ability item under the player's feet. */
function pickUp(defId: string): GameState {
  const state = startGame();
  clearStage(state);
  state.items = [
    { id: 500, kind: "ability", pos: { ...state.player.pos }, defId },
  ];
  step(state, idle, DT);
  return state;
}

describe("ability pickups", () => {
  it("activate on touch and never enter the bag", () => {
    const state = pickUp("fire_orbs");
    expect(state.items).toHaveLength(0);
    expect(state.player.inventory.every((cell) => cell === null)).toBe(true);
    expect(state.player.abilities.map((a) => a.defId)).toEqual(["fire_orbs"]);
    expect(state.events).toContainEqual({
      type: "abilityStarted",
      defId: "fire_orbs",
    });
    expect(state.events).toContainEqual({
      type: "itemCollected",
      kind: "ability",
    });
  });

  it("refresh the timer instead of stacking a second copy", () => {
    const state = pickUp("fire_orbs");
    run(state, idle, 60); // burn ~1s off the clock
    const worn = state.player.abilities[0]!.remainingMs;
    expect(worn).toBeLessThan(abilityDef("fire_orbs").durationMs);

    state.items = [
      {
        id: 501,
        kind: "ability",
        pos: { ...state.player.pos },
        defId: "fire_orbs",
      },
    ];
    step(state, idle, DT);
    expect(state.player.abilities).toHaveLength(1);
    expect(state.player.abilities[0]!.remainingMs).toBe(
      abilityDef("fire_orbs").durationMs,
    );
  });

  it("expire after their duration, with an event", () => {
    const state = pickUp("stasis_field");
    const steps = Math.ceil(abilityDef("stasis_field").durationMs / DT) + 2;
    run(state, idle, steps);
    expect(state.player.abilities).toHaveLength(0);
  });
});

describe("fire orbs", () => {
  it("mangle a monster parked on the orbit ring", () => {
    const state = pickUp("fire_orbs");
    const orbit = ABILITY_DEFS.fire_orbs!.orbit!;
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
    const state = pickUp("fire_orbs");
    const a0 = state.player.abilities[0]!.angle;
    step(state, idle, DT);
    expect(state.player.abilities[0]!.angle).toBeGreaterThan(a0);
  });
});

describe("storm cell", () => {
  it("strikes the nearest monster on its interval", () => {
    const state = pickUp("storm_cell");
    const storm = ABILITY_DEFS.storm_cell!.storm!;
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
    const state = pickUp("storm_cell");
    state.player.weaponCooldownMs = 1_000_000;
    const pos = { x: state.player.pos.x + 80, y: state.player.pos.y };
    state.enemies.push(makeEnemy({ pos, hp: 1_000_000, maxHp: 1_000_000 }));
    step(state, idle, DT);
    expect(state.events).toContainEqual({ type: "lightning", pos });
  });
});

describe("stasis field", () => {
  it("slows monsters inside the field, not outside it", () => {
    const state = pickUp("stasis_field");
    const stasis = ABILITY_DEFS.stasis_field!.stasis!;
    const speed = ENEMY_DEFS.ghost!.speed;
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
