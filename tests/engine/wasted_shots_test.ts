// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A TRIGGER PULL THAT CANNOT CONNECT IS NEVER TAKEN (step/weapon.ts).
//
// The auto-attack fires on its own, so every pull it takes at something it
// cannot actually hit is a round out of the pouch and a hero shooting at thin
// air on screen. Two questions decide it, and a gun answers both differently
// from a blade:
//
//   HOW FAR IT GETS — `weaponFiringRange`, the paper reach cut down to the
//   distance the round survives long enough to fly. INTELLIGENCE widens a
//   ranged weapon's reach without any ceiling (`STATS.rangePerInt`) while the
//   round expires on a fixed timer, so past a certain INT the paper figure is a
//   promise the ammunition cannot keep — and a SHOTGUN's paper reach already
//   outruns its pellets at INT zero.
//
//   WHAT IS IN THE WAY — `blockedByObstacle`, not `lineOfSight`. They are two
//   questions (obstacles.ts): the eye is deliberately allowed past a LONE piece
//   narrow enough to leave the mob in plain view, and that same lone piece eats
//   every round fired past it. A blade keeps the eye's answer; only the shot is
//   physical.
//
// The screen-and-fog half of "is this a target at all" is the other pair of
// suites (screen_targeting_test.ts, fog_targeting_test.ts).

import { describe, expect, it } from "vitest";

import {
  AMMO,
  ammoCount,
  bankAmmo,
  lineOfSight,
  step,
  weaponAmmoType,
  weaponDef,
  weaponFiringRange,
  weaponRangeFor,
} from "@game/core";
import type { Enemy, Equipment, GameState, Obstacle } from "@game/core";
// Engine-internal: the PHYSICAL query a projectile itself runs, which the
// public surface has no reason to carry.
import { blockedByObstacle } from "../../src/game/obstacles.ts";

import { clearStage, DT, idle, makeEnemy, run, startGame } from "./helpers.ts";

/** A quiet, fully explored, obstacle-free field: whatever these tests refuse is
 * refused by reach or by cover, never by the fog or by a stray prop. */
function bareStage(seed = 7): GameState {
  const state = startGame(seed);
  clearStage(state);
  state.obstacles = [];
  return state;
}

/** Arm the hero with a fixture weapon, cooldown ready and pouch full — a dry
 * gun is put away by `swapOffDryWeapon` before any of this is asked. */
function arm(state: GameState, defId: string): Equipment {
  const def = weaponDef(defId);
  const piece: Equipment = {
    id: state.nextId++,
    defId,
    slot: "weapon",
    tier: "regular",
    ilvl: 5,
    affixes: [],
    ...(def.durability === undefined ? {} : { durability: def.durability }),
  };
  const hero = state.players[0]!;
  hero.equipment.weapon = piece;
  hero.weaponCooldownMs = 0;
  const kind = weaponAmmoType(piece);
  if (kind) bankAmmo(hero, kind, AMMO.stackCap);
  return piece;
}

/** How far this weapon's round actually travels before its timer runs out. */
function flightOf(defId: string): number {
  const spec = weaponDef(defId).projectile;
  if (!spec) throw new Error(`${defId} throws nothing`);
  return (spec.speed * spec.lifetimeMs) / 1000;
}

/** A monster that soaks whatever arrives without dying or clawing back — a
 * reason for the trigger to pull, and nothing else. Handed back rather than
 * read off `state.enemies[0]`, which is the level's own boss (`clearStage`
 * spares those). */
function target(state: GameState, at: { x: number; y: number }): Enemy {
  const mob = makeEnemy({
    pos: { ...at },
    hp: 1_000_000,
    maxHp: 1_000_000,
    contactCooldownMs: 1e9,
  });
  state.enemies.push(mob);
  return mob;
}

/** A solitary tall piece: NARROW enough that the sight rule looks straight past
 * it (a 24 px span against `OBSTACLES.loneSightSpan`'s 32) and standing alone,
 * so nothing pairs it into a wall — and yet solid, so a round dies on it. */
function boulder(state: GameState, at: { x: number; y: number }): Obstacle {
  const rock: Obstacle = {
    id: state.nextId++,
    kind: "test_rock",
    sprite: "test_rock",
    pos: { ...at },
    radius: 12,
    jumpable: false,
  };
  state.obstacles = [...state.obstacles, rock];
  return rock;
}

/** Run the auto-attack for `ms`, and report what it fired and what that cost
 * the pouch. */
function fireFor(
  state: GameState,
  ms: number,
): { shots: number; spent: number } {
  const hero = state.players[0]!;
  const kind = weaponAmmoType(hero.equipment.weapon);
  const before = kind ? ammoCount(hero, kind) : 0;
  const shotsBefore = state.stats.shotsFired;
  run(state, idle, Math.ceil(ms / DT));
  return {
    shots: state.stats.shotsFired - shotsBefore,
    spent: kind ? before - ammoCount(hero, kind) : 0,
  };
}

describe("a shot is never fired past where the round dies", () => {
  it("caps the paper reach at the round's own flight", () => {
    const state = bareStage();
    const hero = state.players[0]!;
    const piece = arm(state, "blaster");
    const flight = flightOf("blaster");

    // A plain hero is well inside the bolt's flight: paper reach IS the reach.
    hero.stats.intelligence = 1;
    expect(weaponRangeFor(state, hero, piece)).toBeLessThan(flight);
    expect(weaponFiringRange(state, hero, piece)).toBeCloseTo(
      weaponRangeFor(state, hero, piece),
    );

    // INTELLIGENCE keeps widening the paper reach (+3% a point) long after the
    // round has stopped being able to get there. The firing reach does not.
    hero.stats.intelligence = 60;
    expect(weaponRangeFor(state, hero, piece)).toBeGreaterThan(flight);
    expect(weaponFiringRange(state, hero, piece)).toBeCloseTo(flight);
  });

  it("a SHOTGUN outruns its pellets with no help from INT at all", () => {
    const state = bareStage();
    const hero = state.players[0]!;
    const piece = arm(state, "test_scattergun");
    hero.stats.intelligence = 0;
    expect(weaponFiringRange(state, hero, piece)).toBeLessThan(
      weaponRangeFor(state, hero, piece),
    );
  });

  it("a blade's reach is untouched — there is no flight to outlive", () => {
    const state = bareStage();
    const hero = state.players[0]!;
    const piece = arm(state, "test_spear");
    hero.stats.strength = 60;
    expect(weaponFiringRange(state, hero, piece)).toBeCloseTo(
      weaponRangeFor(state, hero, piece),
    );
  });

  it("holds fire at a mob inside the paper reach but past the flight", () => {
    const state = bareStage();
    const hero = state.players[0]!;
    const piece = arm(state, "test_carbine");
    hero.stats.intelligence = 60;
    const flight = flightOf("test_carbine");
    // Deliberately in the gap: the paper reach said yes to this mob.
    expect(weaponRangeFor(state, hero, piece)).toBeGreaterThan(flight + 40);

    const mob = target(state, { x: hero.pos.x + flight + 30, y: hero.pos.y });
    const dry = fireFor(state, 2000);
    expect(dry.shots).toBe(0);
    expect(dry.spent).toBe(0);

    // Step the same mob inside the flight and the trigger pulls at once — one
    // round per pull, and every pull a shot that can land.
    mob.pos.x = hero.pos.x + flight - 40;
    const live = fireFor(state, 2000);
    expect(live.shots).toBeGreaterThan(0);
    expect(live.spent).toBe(live.shots);
  });
});

describe("a shot is never fired into cover that will eat it", () => {
  it("the lone boulder is seen past but still stops a round", () => {
    // The premise the rest of this suite rests on: the two queries disagree.
    const state = bareStage();
    const from = { x: 500, y: 500 };
    const to = { x: 700, y: 500 };
    boulder(state, { x: 600, y: 500 });
    expect(lineOfSight(state, from, to)).toBe(true);
    expect(blockedByObstacle(state, from, to, 3)).toBe(true);
  });

  it("holds fire at a mob behind a lone boulder, and spends nothing", () => {
    const state = bareStage();
    const hero = state.players[0]!;
    arm(state, "test_carbine");
    boulder(state, { x: hero.pos.x + 60, y: hero.pos.y });
    const mob = target(state, { x: hero.pos.x + 130, y: hero.pos.y });

    const blocked = fireFor(state, 2000);
    expect(blocked.shots).toBe(0);
    expect(blocked.spent).toBe(0);

    // Off the line, the same mob at the same distance is shot at once — the
    // refusal is about the cover, not about the range.
    mob.pos = { x: hero.pos.x, y: hero.pos.y + 130 };
    expect(fireFor(state, 2000).shots).toBeGreaterThan(0);
  });

  it("a blade still swings past the lone piece — the eye's answer is the blade's", () => {
    const state = bareStage();
    const hero = state.players[0]!;
    arm(state, "test_spear");
    // Inside the thrust, with the narrow piece between: a cone is not a body in
    // flight, so this must keep landing exactly as it did before.
    boulder(state, { x: hero.pos.x + 40, y: hero.pos.y });
    const mob = target(state, { x: hero.pos.x + 80, y: hero.pos.y });
    const hp = mob.hp;

    run(state, idle, Math.ceil(2000 / DT));

    expect(mob.hp).toBeLessThan(hp);
  });

  it("still shoots a mob backed flat against a wall", () => {
    // The regression the surface-stopped probe exists for: measuring clearance
    // to the mob's CENTRE finds the wall it is standing against and calls the
    // shot blocked, so a horde pressed along a building becomes unshootable.
    const state = bareStage();
    const hero = state.players[0]!;
    arm(state, "test_carbine");
    const at = { x: hero.pos.x + 140, y: hero.pos.y };
    state.obstacles = [
      {
        id: state.nextId++,
        kind: "test_wall",
        sprite: "test_wall",
        // A tall slab immediately behind the mob, a body's width off it.
        pos: { x: at.x + 24, y: at.y },
        radius: 8,
        half: { x: 8, y: 60 },
        jumpable: false,
      },
    ];
    target(state, at);

    expect(fireFor(state, 2000).shots).toBeGreaterThan(0);
  });
});

describe("the crate the auto-attack falls back on obeys the same rule", () => {
  /** A crate — hoppable cover that breaks (create.ts). */
  function crate(state: GameState, at: { x: number; y: number }): Obstacle {
    const box: Obstacle = {
      id: state.nextId++,
      kind: "crate",
      sprite: "crate",
      pos: { ...at },
      radius: 7,
      jumpable: true,
      breakable: true,
      hp: 10_000,
      maxHp: 10_000,
    };
    state.obstacles = [...state.obstacles, box];
    return box;
  }

  it("does not empty the magazine into a boulder standing in front of a box", () => {
    // A crate never moves, so a shooter that mis-reads its cover feeds it the
    // whole pouch and never lands a round — the worst version of this bug.
    const state = bareStage();
    const hero = state.players[0]!;
    arm(state, "test_carbine");
    crate(state, { x: hero.pos.x + 130, y: hero.pos.y });
    boulder(state, { x: hero.pos.x + 60, y: hero.pos.y });

    expect(fireFor(state, 3000).shots).toBe(0);
  });

  it("still smashes a box standing in the open", () => {
    const state = bareStage();
    const hero = state.players[0]!;
    arm(state, "test_carbine");
    const box = crate(state, { x: hero.pos.x + 130, y: hero.pos.y });

    const fired = fireFor(state, 3000);
    expect(fired.shots).toBeGreaterThan(0);
    expect(box.hp!).toBeLessThan(box.maxHp!);
  });

  it("shoots a SOLID breakable open, rather than plinking off it forever", () => {
    // A wine rack or a vending machine is breakable AND non-jumpable, and that
    // pairing used to be a wall to a shot: the round died on `blockedByObstacle`
    // before stepProjectiles ever reached the crate test, so the box took
    // nothing while the auto-attack kept picking it. Now the round it stopped is
    // credited to it.
    const state = bareStage();
    const hero = state.players[0]!;
    arm(state, "test_carbine");
    const machine = solidBreakable(state, {
      x: hero.pos.x + 130,
      y: hero.pos.y,
    });

    const fired = fireFor(state, 3000);
    expect(fired.shots).toBeGreaterThan(0);
    expect(machine.hp!).toBeLessThan(machine.maxHp!);
  });

  it("still holds fire when a boulder stands in front of the solid box", () => {
    const state = bareStage();
    const hero = state.players[0]!;
    arm(state, "test_carbine");
    solidBreakable(state, { x: hero.pos.x + 130, y: hero.pos.y });
    boulder(state, { x: hero.pos.x + 60, y: hero.pos.y });

    expect(fireFor(state, 3000).shots).toBe(0);
  });

  /** A solid breakable: the vending-machine class of prop (mapgen/place.ts —
   * "a solid, non-jumpable OBSTACLE that happens to break"). */
  function solidBreakable(
    state: GameState,
    at: { x: number; y: number },
  ): Obstacle {
    const machine: Obstacle = {
      id: state.nextId++,
      kind: "test_machine",
      sprite: "test_machine",
      pos: { ...at },
      radius: 12,
      jumpable: false,
      breakable: true,
      hp: 10_000,
      maxHp: 10_000,
    };
    state.obstacles = [...state.obstacles, machine];
    return machine;
  }
});

describe("a refused pull is held, not spent", () => {
  it("leaves the cooldown ready for the moment the shot opens up", () => {
    const state = bareStage();
    const hero = state.players[0]!;
    arm(state, "test_carbine");
    boulder(state, { x: hero.pos.x + 60, y: hero.pos.y });
    target(state, { x: hero.pos.x + 130, y: hero.pos.y });

    run(state, idle, 20);
    expect(hero.weaponCooldownMs).toBe(0);

    // Clear the cover and the very next tick fires — the pull was never spent.
    state.obstacles = [];
    step(state, idle, DT);
    expect(state.stats.shotsFired).toBe(1);
  });
});
