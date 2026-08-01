// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE PARTY — the shared reads the plan's §3.1 table answers, each pinned by a
// test that would pass trivially in single player and fails the moment the
// answer reverts to "seat 0".
//
// These run on the synthetic fixtures like every other engine suite, and every
// one of them stages a SECOND hero explicitly: a run with one hero cannot tell
// "the nearest player" from "the player", which is exactly why the old code was
// correct for years and would have been silently wrong the day a second seat
// arrived.

import { describe, expect, it } from "vitest";

import { createSession } from "../../server/session.ts";
import { FRAME } from "../../server/wire/protocol.ts";

import {
  anyHeroWithin,
  engineVersion,
  distanceToParty,
  heroesWithin,
  nearestHero,
  partyCentroid,
  partyLevel,
  partyWiped,
  quarryFor,
  seatHero,
  step,
  type GameInput,
  type GameState,
  type Player,
} from "@game/core";

import {
  DT,
  idle,
  makeEnemy,
  run,
  startGame,
  steerTo,
  stopWaves,
} from "./helpers.ts";

/** A run with a second hero seated, both parked where the test puts them. */
function party(seed = 7): { state: GameState; a: Player; b: Player } {
  const state = startGame(seed);
  stopWaves(state);
  state.enemies = [];
  const b = seatHero(state, null);
  return { state, a: state.players[0], b };
}

describe("the party", () => {
  it("seats a second hero as a whole Player, not a copy of the first", () => {
    const { state, a, b } = party();
    expect(state.players).toHaveLength(2);
    expect(b).not.toBe(a);
    // Their own bag, purse and build — the private tier, per hero.
    expect(b.inventory).not.toBe(a.inventory);
    expect(b.stats).not.toBe(a.stats);
    expect(b.equipment).not.toBe(a.equipment);
    expect(b.equipment.weapon.id).not.toBe(a.equipment.weapon.id);
    b.coins = 500;
    expect(a.coins).toBe(0);
  });

  it("sets an arrival down beside the party, not at the level's spawn", () => {
    const state = startGame();
    stopWaves(state);
    state.players[0].pos = { x: 900, y: 700 };
    const b = seatHero(state, null);
    // Near the party he joined…
    expect(distanceToParty(state, b.pos)).toBeLessThan(200);
    // …and not on top of anybody.
    expect(b.pos).not.toEqual(state.players[0].pos);
  });

  it("reads the party's level as the highest living hero's", () => {
    const { state, a, b } = party();
    a.level = 12;
    b.level = 31;
    expect(partyLevel(state)).toBe(31);
    // A fallen hero stops setting the horde's level.
    b.hp = 0;
    expect(partyLevel(state)).toBe(12);
  });

  it("answers the geometry questions about the party, not about seat 0", () => {
    const { state, a, b } = party();
    a.pos = { x: 100, y: 100 };
    b.pos = { x: 300, y: 100 };
    expect(partyCentroid(state)).toEqual({ x: 200, y: 100 });
    expect(nearestHero(state, { x: 290, y: 100 })).toBe(b);
    expect(anyHeroWithin(state, { x: 305, y: 100 }, 20)).toBe(true);
    expect(anyHeroWithin(state, { x: 500, y: 100 }, 20)).toBe(false);
    expect(heroesWithin(state, { x: 200, y: 100 }, 150)).toHaveLength(2);
    // A hero who is down is not standing anywhere.
    b.hp = 0;
    expect(nearestHero(state, { x: 290, y: 100 })).toBe(a);
    expect(partyCentroid(state)).toEqual({ x: 100, y: 100 });
  });
});

describe("aggro", () => {
  const sees = () => true;

  it("chases the nearest visible hero", () => {
    const { state, a, b } = party();
    a.pos = { x: 100, y: 100 };
    b.pos = { x: 400, y: 100 };
    const mob = makeEnemy({ pos: { x: 380, y: 100 } });
    expect(quarryFor(state, mob, sees)).toBe(b);
    // Walk the other hero plainly closer and the mob turns.
    a.pos = { x: 378, y: 100 };
    expect(quarryFor(state, mob, sees)).toBe(a);
  });

  it("does not flip between two heroes standing together", () => {
    const { state, a, b } = party();
    const mob = makeEnemy({ pos: { x: 0, y: 0 } });
    a.pos = { x: 300, y: 0 };
    b.pos = { x: 301, y: 0 };
    // First look: the nearer of the two.
    expect(quarryFor(state, mob, sees)).toBe(a);
    // Now the OTHER one is marginally nearer — well inside the hysteresis
    // margin, so the mob keeps the quarry it has. Without the margin this is
    // the tick-by-tick judder the whole rule exists to stop.
    a.pos = { x: 302, y: 0 };
    b.pos = { x: 299, y: 0 };
    expect(quarryFor(state, mob, sees)).toBe(a);
    // Plainly closer, though, and it turns.
    b.pos = { x: 100, y: 0 };
    expect(quarryFor(state, mob, sees)).toBe(b);
  });

  it("gives up a quarry it can no longer see for one it can", () => {
    const { state, a, b } = party();
    a.pos = { x: 100, y: 0 };
    b.pos = { x: 400, y: 0 };
    const mob = makeEnemy({ pos: { x: 0, y: 0 } });
    expect(quarryFor(state, mob, sees)).toBe(a);
    // A wall goes up between the mob and its quarry: it takes the one it can
    // still see, however much further off.
    expect(quarryFor(state, mob, (hero) => hero !== a)).toBe(b);
  });

  it("drops a quarry that has fallen", () => {
    const { state, a, b } = party();
    a.pos = { x: 100, y: 0 };
    b.pos = { x: 400, y: 0 };
    const mob = makeEnemy({ pos: { x: 0, y: 0 } });
    expect(quarryFor(state, mob, sees)).toBe(a);
    a.hp = 0;
    expect(quarryFor(state, mob, sees)).toBe(b);
  });

  it("still answers with the party wiped", () => {
    const { state, a, b } = party();
    a.hp = 0;
    b.hp = 0;
    const mob = makeEnemy({ pos: { x: 0, y: 0 } });
    expect(quarryFor(state, mob, sees)).toBe(a);
  });
});

describe("a party's tick", () => {
  it("steers each hero by their own seat's input", () => {
    const { state, a, b } = party();
    a.pos = { x: 400, y: 400 };
    b.pos = { x: 400, y: 500 };
    const inputs: GameInput[] = [steerTo(700, 400), steerTo(100, 500)];
    run(state, inputs, 30);
    // Seat 0 walked east, seat 1 walked west — one array, two destinations.
    expect(a.pos.x).toBeGreaterThan(420);
    expect(b.pos.x).toBeLessThan(380);
  });

  it("leaves a seat with no frame standing still", () => {
    const { state, a, b } = party();
    a.pos = { x: 400, y: 400 };
    b.pos = { x: 400, y: 500 };
    const before = { ...b.pos };
    // One input for two seats: seat 1 has nothing to act on and contributes
    // IDLE rather than repeating seat 0's steering.
    run(state, [steerTo(700, 400)], 30);
    expect(a.pos.x).toBeGreaterThan(420);
    expect(b.pos).toEqual(before);
  });

  it("keeps the run alive while one hero is down, and ends it when both are", () => {
    const { state, a, b } = party();
    b.hp = 0;
    step(state, idle, DT);
    expect(state.phase).toBe("playing");
    expect(partyWiped(state)).toBe(false);
    a.hp = 0;
    step(state, idle, DT);
    expect(partyWiped(state)).toBe(true);
    // The death scene owns the run from here (or the defeat splash, when the
    // scene is switched off) — either way it is no longer `playing`.
    expect(state.phase).not.toBe("playing");
  });

  it("does not tick a downed hero's clocks", () => {
    const { state, b } = party();
    // The FALL is processed once (§4.2's down sweep strips the kit and hands
    // the body the sidearm, resetting its swing clock) — so let it land first,
    // then pin the rule this test is about: nothing of a downed body TICKS.
    b.hp = 0;
    step(state, idle, DT);
    b.weaponCooldownMs = 500;
    run(state, idle, 20);
    expect(b.weaponCooldownMs).toBe(500);
  });

  it("lifts the shared fog for whoever walks", () => {
    const { state, a, b } = party();
    // Park seat 0 and walk seat 1 across the map: the fog is one grid on the
    // run, so seat 1's legwork uncovers it for seat 0 too.
    a.pos = { x: 200, y: 200 };
    b.pos = { x: 200, y: 200 };
    const explored = state.explored;
    run(state, [idle, steerTo(1200, 200)], 240);
    expect(b.pos.x).toBeGreaterThan(400);
    expect(state.explored).toBe(explored);
    // Something along seat 1's path is now uncovered, and it is the SAME grid
    // seat 0 reads — there is no second one.
    expect([...explored].some((cell) => cell > 0)).toBe(true);
  });
});

describe("the world answers to any hero", () => {
  it("wakes a placed pack for whichever player walks up to it", () => {
    const state = startGame();
    stopWaves(state);
    const pack = state.packs[0];
    if (!pack) return; // the fixture level authors none — nothing to prove here
    const b = seatHero(state, null);
    // Seat 0 stays well away; seat 1 walks onto the pack.
    state.players[0].pos = { x: 20, y: 20 };
    b.pos = { ...pack.at };
    run(state, idle, 3);
    expect(pack.status).not.toBe("dormant");
  });

  it("burns every hero standing in the same fire", () => {
    const { state, a, b } = party();
    a.pos = { x: 500, y: 500 };
    b.pos = { x: 510, y: 500 };
    a.disarmed = false;
    b.disarmed = false;
    const hpA = a.hp;
    const hpB = b.hp;
    state.scorches = [
      {
        pos: { x: 505, y: 500 },
        radius: 60,
        damage: 20,
        remainingMs: 5000,
        durationMs: 5000,
        intervalMs: 500,
        tickMs: 0,
        seed: 1,
        defId: "test_scorch",
      },
    ];
    step(state, idle, DT);
    // A pulse of burning floor bites BOTH — not just whichever seat the pass
    // happened to read first.
    expect(a.hp).toBeLessThan(hpA);
    expect(b.hp).toBeLessThan(hpB);
  });
});

describe("a seat outlives the player in it", () => {
  /** A live session on the fixture level, host plus one joiner seated. */
  function hosted() {
    const live = createSession({
      params: {
        seed: 1,
        levelId: "test_level",
        difficulty: "medium",
        loadout: null,
        respec: false,
        clearedLevels: [],
        merchantDiscovered: false,
        generatedMapSize: "medium",
      },
      build: engineVersion,
    });
    live.addClient(1, () => {}, true, "HOST");
    live.addClient(2, () => {}, { play: true, loadout: null }, "ZOE");
    live.state.phase = "playing";
    return live;
  }

  it("stops a departing player's hero, and does not renumber the party", () => {
    const live = hosted();
    const hero = live.state.players[1]!;
    hero.pos = { x: 300, y: 300 };
    hero.disarmed = false;
    // They walk off east, then quit mid-stride.
    live.receive(2, FRAME.input, 1, {
      input: { steering: true, target: { x: 900, y: 300 } },
    });
    live.advance(200);
    const walked = hero.pos.x;
    expect(walked).toBeGreaterThan(300);

    live.removeClient(2);
    live.advance(1000);
    // The body stays standing where it was left. Without clearing the seat's
    // input the last frame they sent lives on, and the abandoned hero walks
    // toward wherever they were last steering for the rest of the run.
    expect(hero.pos.x).toBeCloseTo(walked, 5);
    // And the seat is still theirs: splicing it out would renumber every seat
    // above it, and every command and input frame in flight names one by index.
    expect(live.state.players).toHaveLength(2);
    expect(live.state.players[1]).toBe(hero);
  });
});
