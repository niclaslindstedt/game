// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The CAMPAIGN POWERS — the two powerups each map introduces past SPACEZ HQ's
// classics (content/powerups.yaml, ticked by src/game/step/powerups.ts and read
// at the damage/weapon sites). One describe per KIND, each asserting the rule
// the kind exists for rather than a shipped balance figure: the fixtures
// (`test_trail`, `test_barrier`, …) carry round synthetic numbers so a
// rebalance of the shipped catalog can never break these.

import { describe, expect, it } from "vitest";

import {
  abilityDef,
  absorbPlayerDamage,
  grantAbility,
  step,
  weaponDamage,
  type GameState,
} from "@game/core";

import {
  clearStage,
  DT,
  idle,
  makeEnemy,
  run,
  startGame,
  steerTo,
  stopWaves,
} from "./helpers.ts";

/** Route `damage` through the hero's defensive stack the way every
 * player-damage site does, and report what gets through — the one choke point
 * the barrier, the ward, and the shroud all hang off. */
function absorb(state: GameState, damage: number): number {
  return absorbPlayerDamage(state, damage);
}

/** A run with an empty field: no waves, no horde, nothing but what a test
 * places by hand. */
function emptyRun(): GameState {
  const state = startGame();
  stopWaves(state);
  clearStage(state);
  return state;
}

/**
 * Step `steps` frames and collect EVERY event raised along the way. `step()`
 * clears `state.events` each tick, so a power that fires on an interval (a
 * rock every 500 ms, a wave every 800) is invisible to a plain read of
 * `state.events` after the run.
 */
function collect(
  state: GameState,
  input: Parameters<typeof step>[1],
  steps: number,
): GameState["events"] {
  const seen: GameState["events"] = [];
  for (let i = 0; i < steps; i++) {
    step(state, input, DT);
    seen.push(...state.events);
  }
  return seen;
}

/** Place one stationary mob `dx` px to the hero's right. */
function mobAt(state: GameState, dx: number, dy = 0, hp = 45_000) {
  const enemy = makeEnemy({
    pos: { x: state.player.pos.x + dx, y: state.player.pos.y + dy },
    hp,
    maxHp: hp,
  });
  state.enemies.push(enemy);
  return enemy;
}

describe("ION WAKE (trail)", () => {
  it("lays burning patches behind a hero who moves, and only where he moved", () => {
    const state = emptyRun();
    grantAbility(state, "test_trail");
    const ability = state.player.abilities[0]!;
    // Standing still keeps ONE fire under his boots, however long he waits.
    run(state, idle, 60);
    expect(ability.patches?.length).toBe(1);
    // Walking lays a line of them.
    run(state, steerTo(state.player.pos.x + 400, state.player.pos.y), 90);
    expect(ability.patches?.length ?? 0).toBeGreaterThan(3);
  });

  it("scorches whatever stands in a patch", () => {
    const state = emptyRun();
    const victim = mobAt(state, 0, 0);
    grantAbility(state, "test_trail");
    run(state, idle, 40);
    expect(victim.hp).toBeLessThan(victim.maxHp);
  });

  it("goes out with the wake that laid it", () => {
    const state = emptyRun();
    grantAbility(state, "test_trail");
    const def = abilityDef("test_trail");
    run(state, idle, Math.ceil(def.durationMs / DT) + 10);
    expect(state.player.abilities).toHaveLength(0);
  });
});

describe("BLAST SHIELD (barrier)", () => {
  it("banks a pool sized off the hero's healthbar", () => {
    const state = emptyRun();
    grantAbility(state, "test_barrier");
    expect(state.player.abilities[0]?.pool).toBeCloseTo(
      0.5 * state.player.maxHp,
    );
  });

  it("eats damage instead of the hero, and shatters when the pool runs out", () => {
    const state = emptyRun();
    grantAbility(state, "test_barrier");
    const ability = state.player.abilities[0]!;
    const before = state.player.hp;
    // A blow well inside the pool: the shell takes all of it.
    state.player.hp -= absorb(state, 10);
    expect(state.player.hp).toBe(before);
    expect(ability.pool).toBeCloseTo(0.5 * state.player.maxHp - 10);
    expect(state.events).toContainEqual(
      expect.objectContaining({ type: "barrierAbsorbed" }),
    );
    // A blow past what is left: the remainder gets through and the shell goes.
    const left = ability.pool ?? 0;
    state.player.hp -= absorb(state, left + 7);
    expect(state.player.hp).toBe(before - 7);
    expect(state.events).toContainEqual(
      expect.objectContaining({ type: "barrierBroke" }),
    );
    // A shattered shell is retired on the next tick like any lapsed power.
    step(state, idle, DT);
    expect(state.player.abilities).toHaveLength(0);
  });
});

describe("MOONFALL (rain)", () => {
  it("drops rocks on the fight and craters what they land on", () => {
    const state = emptyRun();
    const victim = mobAt(state, 40);
    grantAbility(state, "test_rain");
    const events = collect(state, idle, 60);
    expect(events).toContainEqual(
      expect.objectContaining({ type: "meteorFall" }),
    );
    expect(victim.hp).toBeLessThan(victim.maxHp);
  });

  it("still falls with the field empty (it scatters around the hero)", () => {
    const state = emptyRun();
    grantAbility(state, "test_rain");
    expect(collect(state, idle, 60)).toContainEqual(
      expect.objectContaining({ type: "meteorFall" }),
    );
  });
});

describe("PALE SHROUD (phase)", () => {
  it("turns contact blows aside entirely", () => {
    const state = emptyRun();
    // A mob pressed right against him, ready to swing.
    mobAt(state, 6);
    grantAbility(state, "test_phase");
    const before = state.player.hp;
    const events = collect(state, idle, 60);
    expect(state.player.hp).toBe(before);
    expect(events).toContainEqual(
      expect.objectContaining({ type: "playerPhased" }),
    );
  });

  it("lets the horde hurt him again the moment it lapses", () => {
    const state = emptyRun();
    mobAt(state, 6);
    grantAbility(state, "test_phase");
    const def = abilityDef("test_phase");
    run(state, idle, Math.ceil(def.durationMs / DT) + 2);
    expect(state.player.abilities).toHaveLength(0);
    const before = state.player.hp;
    run(state, idle, 60);
    expect(state.player.hp).toBeLessThan(before);
  });
});

describe("EVENT HORIZON / DUST DEVIL (well)", () => {
  it("opens where it was spent and hauls the horde into it", () => {
    const state = emptyRun();
    const victim = mobAt(state, 70);
    grantAbility(state, "test_well");
    const core = state.player.abilities[0]?.pos;
    expect(core).toEqual({ ...state.player.pos });
    const before = Math.abs(victim.pos.x - state.player.pos.x);
    run(state, idle, 20);
    expect(Math.abs(victim.pos.x - state.player.pos.x)).toBeLessThan(before);
    expect(victim.hp).toBeLessThan(victim.maxHp);
  });

  it("holds its ground while the hero walks off (chase 0)", () => {
    const state = emptyRun();
    grantAbility(state, "test_well");
    const core = { ...(state.player.abilities[0]!.pos ?? { x: 0, y: 0 }) };
    run(state, steerTo(state.player.pos.x + 400, state.player.pos.y), 60);
    expect(state.player.abilities[0]?.pos).toEqual(core);
  });

  it("a ROAMING core walks itself to the nearest body", () => {
    const state = emptyRun();
    const prey = mobAt(state, 160);
    grantAbility(state, "test_cyclone");
    const start = state.player.abilities[0]!.pos!.x;
    run(state, idle, 30);
    const now = state.player.abilities[0]!.pos!.x;
    expect(now).toBeGreaterThan(start);
    expect(now).toBeLessThanOrEqual(prey.pos.x);
  });
});

describe("REACTOR SURGE (surge)", () => {
  it("pumps the hero's own weapon while it burns, and only while it burns", () => {
    const state = emptyRun();
    const plain = weaponDamage(state);
    grantAbility(state, "test_surge");
    expect(weaponDamage(state)).toBeCloseTo(plain * 2);
    const def = abilityDef("test_surge");
    run(state, idle, Math.ceil(def.durationMs / DT) + 2);
    expect(weaponDamage(state)).toBeCloseTo(plain);
  });
});

describe("THE UNMAKING (pulse)", () => {
  it("washes a ring out of the hero that bills and shoves what it catches", () => {
    const state = emptyRun();
    const victim = mobAt(state, 60);
    grantAbility(state, "test_pulse");
    const events = collect(state, idle, 60);
    expect(events).toContainEqual(
      expect.objectContaining({ type: "voidWave" }),
    );
    expect(victim.hp).toBeLessThan(victim.maxHp);
    // Shoved OUTWARD — away from the hero it washed off.
    expect(victim.pos.x - state.player.pos.x).toBeGreaterThan(60);
  });

  it("leaves foes outside its reach alone", () => {
    const state = emptyRun();
    const far = mobAt(state, 400);
    grantAbility(state, "test_pulse");
    run(state, idle, 60);
    expect(far.hp).toBe(far.maxHp);
  });
});

describe("DEAD MAN'S HAND / IRON STAMPEDE (volley)", () => {
  it("looses its own shots at the nearest body", () => {
    const state = emptyRun();
    mobAt(state, 120);
    grantAbility(state, "test_volley");
    run(state, idle, 40);
    expect(state.projectiles.length).toBeGreaterThan(0);
  });

  it("holds its fire — and its clock — with nothing in reach", () => {
    const state = emptyRun();
    mobAt(state, 600); // well past the fixture's 240px range
    grantAbility(state, "test_volley");
    run(state, idle, 60);
    expect(state.projectiles).toHaveLength(0);
  });
});

describe("SENTRY GRID (turret)", () => {
  it("plants its guns on a ring around the spend point", () => {
    const state = emptyRun();
    grantAbility(state, "test_turret");
    const nodes = state.player.abilities[0]?.nodes ?? [];
    expect(nodes).toHaveLength(4);
    for (const node of nodes) {
      const dx = node.pos.x - state.player.pos.x;
      const dy = node.pos.y - state.player.pos.y;
      expect(Math.hypot(dx, dy)).toBeGreaterThan(0);
    }
  });

  it("keeps firing from where it stands after the hero walks away", () => {
    const state = emptyRun();
    grantAbility(state, "test_turret");
    const planted = state.player.abilities[0]!.nodes!.map((n) => ({
      ...n.pos,
    }));
    mobAt(state, 60);
    run(state, steerTo(state.player.pos.x - 300, state.player.pos.y), 60);
    expect(
      state.player.abilities[0]?.nodes?.map((n) => ({ ...n.pos })),
    ).toEqual(planted);
    expect(state.projectiles.length).toBeGreaterThan(0);
  });
});

describe("CONTINUITY PROTOCOL (ward)", () => {
  it("refuses the killing blow, leaving the hero standing on the floor hp", () => {
    const state = emptyRun();
    grantAbility(state, "test_ward");
    state.player.hp = 30;
    const through = absorb(state, 500);
    expect(through).toBe(29); // clipped to leave `ward.floor` = 1
    expect(state.events).toContainEqual(
      expect.objectContaining({ type: "wardHeld", floor: 1 }),
    );
  });

  it("does not soften a blow that wasn't going to kill", () => {
    const state = emptyRun();
    grantAbility(state, "test_ward");
    state.player.hp = 30;
    expect(absorb(state, 10)).toBe(10);
  });

  it("buys a window, not a life — the next blow after it lapses kills", () => {
    const state = emptyRun();
    grantAbility(state, "test_ward");
    const def = abilityDef("test_ward");
    run(state, idle, Math.ceil(def.durationMs / DT) + 2);
    state.player.hp = 30;
    expect(absorb(state, 500)).toBe(500);
  });
});
