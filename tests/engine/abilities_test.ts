// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Time-limited ability pickups: banking on touch, activation via the
// useItem input, orbiting fire orbs mangling the pack, storm strikes,
// stasis slow, and expiry.

import { afterEach, describe, expect, it } from "vitest";

import {
  abilityDef,
  enemyDef,
  orbPositions,
  setAutoEquipEnabled,
  step,
  weaponDef,
} from "@game/core";
import type { Equipment, GameInput, GameState } from "@game/core";
import { clearStage, DT, idle, makeEnemy, run, startGame } from "./helpers.ts";

const useItem: GameInput = { ...idle, useItem: true };

/** A minimal fixture weapon, filled to full durability. */
function fixtureWeapon(id: number, defId: string): Equipment {
  return {
    id,
    defId,
    slot: "weapon",
    tier: "regular",
    ilvl: 5,
    affixes: [],
    durability: weaponDef(defId).durability,
  };
}

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
    // The spent power keeps its dock slot (running, linked back to slot 0) and
    // counts down there rather than vacating it.
    expect(state.player.heldAbilities).toEqual(["test_orbit"]);
    expect(state.player.abilities.map((a) => a.defId)).toEqual(["test_orbit"]);
    expect(state.player.abilities[0]!.slot).toBe(0);
    expect(state.events).toContainEqual({
      type: "abilityStarted",
      defId: "test_orbit",
    });
  });

  it("stack a second copy when the power is stackable", () => {
    const state = pickUp("test_storm"); // stackable in the fixtures
    run(state, idle, 60); // burn ~1s off the first copy's clock
    const worn = state.player.abilities[0]!.remainingMs;

    // Bank and spend a second STORM CELL: it adds a fresh copy rather than
    // refreshing (or being blocked), so both run side by side — each holding
    // its own dock slot while it counts down.
    state.items = [
      {
        id: 501,
        kind: "ability",
        pos: { ...state.player.pos },
        defId: "test_storm",
      },
    ];
    step(state, idle, DT);
    step(state, useItem, DT);
    expect(state.player.abilities.map((a) => a.defId)).toEqual([
      "test_storm",
      "test_storm",
    ]);
    // Both copies run, so both slots stay full and linked (slots 0 and 1).
    expect(state.player.heldAbilities).toEqual(["test_storm", "test_storm"]);
    expect(state.player.abilities.map((a) => a.slot)).toEqual([0, 1]);
    // The first copy keeps its worn clock; the second starts (nearly) full.
    expect(state.player.abilities[0]!.remainingMs).toBeLessThanOrEqual(worn);
    expect(state.player.abilities[1]!.remainingMs).toBeGreaterThan(worn);
  });

  it("refuse to re-enable a non-stackable power already running", () => {
    const state = pickUp("test_magnet"); // non-stackable in the fixtures
    expect(state.player.abilities).toHaveLength(1);
    // The running copy holds slot 0.
    expect(state.player.heldAbilities).toEqual(["test_magnet"]);

    // Bank a second MAGNET (slot 1) and try to spend it while the first runs.
    state.items = [
      {
        id: 501,
        kind: "ability",
        pos: { ...state.player.pos },
        defId: "test_magnet",
      },
    ];
    step(state, idle, DT);
    expect(state.player.heldAbilities).toEqual(["test_magnet", "test_magnet"]);

    step(state, useItem, DT);
    // Refused: no second copy, and the banked pickup stays put (slot 1) rather
    // than being wasted — only the first copy is running.
    expect(state.player.abilities).toHaveLength(1);
    expect(state.player.abilities[0]!.slot).toBe(0);
    expect(state.player.heldAbilities).toEqual(["test_magnet", "test_magnet"]);
  });

  it("expire after their duration, freeing the slot at last", () => {
    const state = pickUp("test_stasis");
    expect(state.player.heldAbilities).toEqual(["test_stasis"]);
    const steps = Math.ceil(abilityDef("test_stasis").durationMs / DT) + 2;
    run(state, idle, steps);
    expect(state.player.abilities).toHaveLength(0);
    // Only now — once the power lapses — does the slot free.
    expect(state.player.heldAbilities).toEqual([]);
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

  it("two stacked copies strike twice as often", () => {
    // Bank + spend a second STORM CELL: two copies run at once, each with its
    // own strike cooldown, so a single step fires both bolts.
    const state = pickUp("test_storm");
    state.items = [
      {
        id: 502,
        kind: "ability",
        pos: { ...state.player.pos },
        defId: "test_storm",
      },
    ];
    step(state, idle, DT);
    step(state, useItem, DT);
    expect(state.player.abilities).toHaveLength(2);

    state.player.weaponCooldownMs = 1_000_000;
    state.enemies.push(
      makeEnemy({
        pos: { x: state.player.pos.x + 80, y: state.player.pos.y },
        hp: 1_000_000,
        maxHp: 1_000_000,
      }),
    );
    step(state, idle, DT);
    const bolts = state.events.filter((e) => e.type === "lightning");
    expect(bolts).toHaveLength(2);
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

describe("item magnet", () => {
  // A running MAGNET field reels drops toward the hero — but only gear he can
  // actually keep, so a full bag no longer piles uncollectable loot at his feet.
  afterEach(() => setAutoEquipEnabled(true));

  /** A running magnet with one equipment drop just inside the pull radius but
   * clear of pickup reach, so a step can move it without collecting it. */
  function withDrop(drop: Equipment): { state: GameState; startX: number } {
    const state = pickUp("test_magnet");
    const startX = state.player.pos.x + 40;
    state.items = [
      {
        id: 700,
        kind: "equipment",
        pos: { x: startX, y: state.player.pos.y },
        equipment: drop,
      },
    ];
    return { state, startX };
  }

  it("reels in gear the hero can hold (a free bag cell)", () => {
    const { state, startX } = withDrop(fixtureWeapon(60, "crude_sword"));
    step(state, idle, DT);
    const drop = state.items.find((i) => i.id === 700);
    // Pulled toward the hero (or already collected on arrival) — never left put.
    if (drop) expect(drop.pos.x).toBeLessThan(startX);
  });

  it("leaves gear it can't keep where it lies (full bag, not an upgrade)", () => {
    setAutoEquipEnabled(false); // even an upgrade banks, so nothing auto-equips
    const { state, startX } = withDrop(fixtureWeapon(60, "crude_sword"));
    // Fill every bag cell so the drop has no home.
    state.player.inventory = state.player.inventory.map((_, i) =>
      fixtureWeapon(100 + i, "crude_sword"),
    );
    step(state, idle, DT);
    const drop = state.items.find((i) => i.id === 700);
    // Still grounded, and not budged an inch.
    expect(drop?.pos.x).toBe(startX);
  });
});
