// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CO-OP RULES — the arithmetic a run does differently once there is more
// than one hero in it (the abandoned hero, and the party's XP,
// loot and menace).
//
// Every rule here has the same shape and the same trap: it is an exact no-op in
// a single-player run, so a single-hero test proves nothing about it and a
// regression that reverted it to "seat 0" would leave the whole shipped
// campaign green. So every test below stages at least two heroes, and the ones
// that CLAIM single player is untouched say so by comparing a party against a
// solo run rather than by asserting a number nobody can trace.

import { describe, expect, it } from "vitest";

import {
  ammoKindFor,
  creditAutopilotPurse,
  departHero,
  dropItem,
  grantXp,
  livingHeroes,
  nearestHero,
  nextFreeSeat,
  partyLevel,
  partyWiped,
  partyXpBonus,
  promptPendingPoints,
  seatHero,
  shareXp,
  startAutopilot,
  splitXp,
  step,
  tickMenace,
  type GameState,
  type Player,
} from "@game/core";

import { damageCrate } from "../../engine/game/crates.ts";
import { DT, idle, makeEnemy, startGame, stopWaves } from "./helpers.ts";

/** A run with `n` heroes seated, the field cleared and the waves stopped. */
function party(n = 2, seed = 7): { state: GameState; heroes: Player[] } {
  const state = startGame(seed);
  stopWaves(state);
  state.enemies = [];
  for (let i = 1; i < n; i++) seatHero(state, null);
  return { state, heroes: [...state.players] };
}

/** Park every hero on one spot, so "near the kill" is not the thing under
 * test in a test about something else. */
function huddle(state: GameState, at = { x: 400, y: 400 }): void {
  for (const hero of state.players) hero.pos = { ...at };
}

describe("an abandoned hero", () => {
  it("stops being alive, so the party that stayed can lose the run", () => {
    const { state, heroes } = party(2);
    const [a, b] = heroes as [Player, Player];
    a.hp = 0;
    // The body is untouched and at full health — this is somebody who QUIT, not
    // somebody who died, and that is the whole bug: before `departed`, a party
    // whose second player left could be wiped over and over without the run
    // ever ending.
    expect(b.hp).toBeGreaterThan(0);
    expect(partyWiped(state)).toBe(false);
    departHero(state, 1);
    expect(b.hp).toBeGreaterThan(0);
    expect(partyWiped(state)).toBe(true);
  });

  it("stops holding the horde's level up over the people still playing", () => {
    const { state, heroes } = party(2);
    const [a, b] = heroes as [Player, Player];
    a.level = 20;
    b.level = 90;
    expect(partyLevel(state)).toBe(90);
    departHero(state, 1);
    expect(partyLevel(state)).toBe(20);
  });

  it("stops drawing the horde's attention", () => {
    const { state, heroes } = party(2);
    const [a, b] = heroes as [Player, Player];
    a.pos = { x: 900, y: 900 };
    b.pos = { x: 100, y: 100 };
    expect(nearestHero(state, { x: 120, y: 120 })).toBe(b);
    departHero(state, 1);
    expect(nearestHero(state, { x: 120, y: 120 })).toBe(a);
  });

  it("holds no screen shut — the world runs on past an abandoned chooser", () => {
    // FOUND BY THE BOT-CLIENT SOAK (`scripts/bot-client.mjs`) back when the
    // chooser was a GLOBAL phase: a player who left owing points would never
    // place them, and eight clients went on steering at a run whose clock had
    // stopped. The screens are per-player now and `partyBlocked` only counts
    // heroes IN PLAY, so a departed hero's open chooser holds nothing shut —
    // structurally, with no bolt-on release.
    const { state, heroes } = party(2);
    const [, b] = heroes as [Player, Player];
    b.pendingStatPoints = 2;
    expect(promptPendingPoints(state, b)).toBe(true);
    expect(b.screen).toBe("levelup");
    departHero(state, 1);
    const before = state.stats.timeMs;
    step(state, [idle, idle], DT);
    expect(state.stats.timeMs).toBeGreaterThan(before);
    // The points are NOT forfeited: the seat may be held for the grace window,
    // and somebody coming back should find their level-up where they left it.
    // What was dropped is the WORLD's obligation to sit and wait.
    expect(b.pendingStatPoints).toBe(2);
  });

  it("does not freeze the run when the chooser's owner goes DOWN owing it", () => {
    // The second half of the same bug: a hero at 0 hp with the party not yet
    // wiped never reaches the `dying` scene, so nobody quits and nobody can
    // spend. `partyBlocked` counts only heroes in play, so the downed hero's
    // open chooser is as inert as the departed one's.
    const { state, heroes } = party(2);
    const [a, b] = heroes as [Player, Player];
    b.pendingStatPoints = 2;
    expect(promptPendingPoints(state, b)).toBe(true);
    b.hp = 0;
    expect(partyWiped(state)).toBe(false); // a still up — no death scene
    const before = state.stats.timeMs;
    step(state, [idle, idle], DT);
    expect(state.stats.timeMs).toBeGreaterThan(before);
    expect(b.pendingStatPoints).toBe(2);
    expect(a.hp).toBeGreaterThan(0);
  });

  it("leaves a level-up somebody still playing owes exactly where it is", () => {
    // The other direction, and the one that would be a worse bug: yanking the
    // chooser out from under a live player mid-decision because somebody else
    // quit — and, solo, the open chooser still freezes the world exactly as
    // the old global phase did.
    const { state, heroes } = party(3);
    const [a] = heroes as [Player, Player, Player];
    a.pendingStatPoints = 1;
    expect(promptPendingPoints(state, a)).toBe(true);
    departHero(state, 2);
    expect(a.screen).toBe("levelup");

    // SOLO: one hero with a screen up is the whole party — the world halts.
    const solo = party(1).state;
    solo.players[0].pendingStatPoints = 1;
    expect(promptPendingPoints(solo, solo.players[0])).toBe(true);
    const frozen = solo.stats.timeMs;
    step(solo, idle, DT);
    expect(solo.stats.timeMs).toBe(frozen);
  });

  it("hands its seat to the next arrival instead of blocking it", () => {
    const { state } = party(3);
    expect(nextFreeSeat(state)).toBe(3);
    departHero(state, 1);
    expect(nextFreeSeat(state)).toBe(1);
    const fresh = seatHero(state, null);
    // Seated INTO the emptied slot — the party did not grow, and no index
    // anybody is still holding was renumbered.
    expect(state.players).toHaveLength(3);
    expect(state.players[1]).toBe(fresh);
    expect(fresh.departed).toBeFalsy();
  });

  it("refuses to depart seat 0, because the host leaving ends the session", () => {
    const { state } = party(2);
    expect(departHero(state, 0)).toBe(false);
    expect(state.players[0].departed).toBeFalsy();
  });

  it("is not counted among the living", () => {
    const { state } = party(3);
    expect(livingHeroes(state)).toHaveLength(3);
    departHero(state, 2);
    expect(livingHeroes(state)).toHaveLength(2);
  });
});

describe("party XP", () => {
  it("pays a lone hero the whole kill, exactly as it always has", () => {
    const { state } = party(1);
    const cuts = splitXp(state, 1000, state.players[0].pos);
    expect(cuts).toHaveLength(1);
    expect(cuts[0]?.amount).toBe(1000);
  });

  it("splits a shared kill in proportion to level", () => {
    const { state, heroes } = party(2);
    const [a, b] = heroes as [Player, Player];
    huddle(state);
    a.level = 20;
    b.level = 60;
    const cuts = splitXp(state, 800, a.pos);
    const pot = 800 * partyXpBonus(2);
    expect(cuts).toHaveLength(2);
    // 20:60 — the veteran keeps three quarters, which is the rule that makes
    // grouping with somebody below you not a tax.
    expect(cuts[0]?.amount).toBe(Math.round((pot * 20) / 80));
    expect(cuts[1]?.amount).toBe(Math.round((pot * 60) / 80));
  });

  it("cuts out a hero who was not in the fight", () => {
    const { state, heroes } = party(2);
    const [a, b] = heroes as [Player, Player];
    a.pos = { x: 200, y: 200 };
    // Far enough away to be somewhere else entirely — this is what stops a
    // party's best play being to scatter and farm four fights at once.
    b.pos = { x: 4000, y: 4000 };
    const cuts = splitXp(state, 500, a.pos);
    expect(cuts).toHaveLength(1);
    expect(cuts[0]?.hero).toBe(a);
    expect(cuts[0]?.amount).toBe(500);
  });

  it("gives a kill nobody was near to the nearest hero rather than nobody", () => {
    const { state, heroes } = party(2);
    const [a, b] = heroes as [Player, Player];
    a.pos = { x: 100, y: 100 };
    b.pos = { x: 4000, y: 4000 };
    const cuts = splitXp(state, 300, { x: 3900, y: 3900 });
    expect(cuts).toHaveLength(1);
    expect(cuts[0]?.hero).toBe(b);
    expect(cuts[0]?.amount).toBe(300);
  });

  it("pays a departed body nothing", () => {
    const { state } = party(2);
    huddle(state);
    departHero(state, 1);
    const cuts = splitXp(state, 400, state.players[0].pos);
    expect(cuts).toHaveLength(1);
    expect(cuts[0]?.hero).toBe(state.players[0]);
  });

  it("makes a group's pot bigger than a soloist's, so grouping pays", () => {
    expect(partyXpBonus(1)).toBe(1);
    expect(partyXpBonus(4)).toBeGreaterThan(partyXpBonus(2));
    expect(partyXpBonus(2)).toBeGreaterThan(1);
  });

  it("banks a share on each hero's OWN bar", () => {
    const { state, heroes } = party(2);
    const [a, b] = heroes as [Player, Player];
    huddle(state);
    a.level = 10;
    b.level = 10;
    const beforeA = a.xp;
    const beforeB = b.xp;
    shareXp(state, 400, a.pos);
    expect(a.xp).toBeGreaterThan(beforeA);
    expect(b.xp).toBeGreaterThan(beforeB);
  });

  it("does not level the host when a joiner is handed a direct grant", () => {
    const { state, heroes } = party(2);
    const [a, b] = heroes as [Player, Player];
    const before = a.xp;
    grantXp(state, b, 250);
    expect(b.xp).toBeGreaterThan(0);
    expect(a.xp).toBe(before);
  });

  it("reads the per-map cap against the RECIPIENT, not the party", () => {
    // A level-90 in the party must not throttle the level-10 beside them down
    // to the outgrown-map trickle on a map that is still right for the 10.
    const { state, heroes } = party(2);
    const [a, b] = heroes as [Player, Player];
    huddle(state);
    a.level = 10;
    b.level = 90;
    const before = a.xp;
    grantXp(state, a, 1000);
    const withVeteran = a.xp - before;

    const solo = party(1).state;
    solo.players[0].level = 10;
    const soloBefore = solo.players[0].xp;
    grantXp(solo, solo.players[0], 1000);
    expect(withVeteran).toBe(solo.players[0].xp - soloBefore);
  });
});

describe("allocated loot", () => {
  it("stamps no owner in a free-for-all session", () => {
    const { state } = party(2);
    huddle(state);
    dropTestItem(state, { x: 400, y: 400 });
    expect(state.items.at(-1)?.owner).toBeUndefined();
  });

  it("stamps an owner from the heroes who were in the fight", () => {
    const { state } = party(2);
    state.lootMode = "allocated";
    huddle(state);
    dropTestItem(state, { x: 400, y: 400 });
    const owner = state.items.at(-1)?.owner;
    expect(owner === 0 || owner === 1).toBe(true);
  });

  it("never allocates to somebody who was not there", () => {
    const { state, heroes } = party(2);
    const [a, b] = heroes as [Player, Player];
    state.lootMode = "allocated";
    a.pos = { x: 400, y: 400 };
    b.pos = { x: 5000, y: 5000 };
    for (let i = 0; i < 20; i++) dropTestItem(state, { x: 400, y: 400 });
    for (const item of state.items) expect(item.owner).not.toBe(1);
  });

  it("leaves a drop nobody was near unowned rather than assigning it away", () => {
    const { state } = party(2);
    state.lootMode = "allocated";
    huddle(state, { x: 200, y: 200 });
    dropTestItem(state, { x: 5000, y: 5000 });
    expect(state.items.at(-1)?.owner).toBeUndefined();
  });

  it("does not disturb the run's rng, so the same seed rolls the same loot", () => {
    // The allocation rolls off the item's own hash rather than `state.rng`;
    // consuming a draw here would make an allocated session roll DIFFERENT
    // items from the same seed than a free-for-all one.
    const free = party(2, 11).state;
    huddle(free);
    const allocated = party(2, 11).state;
    allocated.lootMode = "allocated";
    huddle(allocated);
    for (let i = 0; i < 10; i++) {
      dropTestItem(free, { x: 400, y: 400 });
      dropTestItem(allocated, { x: 400, y: 400 });
    }
    expect(allocated.rng()).toBe(free.rng());
  });
});

/** Throw a plain medkit down through `dropItem` — the ONE funnel every drop in
 * the game goes through, so the allocation under test is the shipped one. */
function dropTestItem(state: GameState, at: { x: number; y: number }): void {
  dropItem(
    state,
    { id: state.nextId++, kind: "medkit", pos: { ...at } },
    { ...at },
  );
}

describe("the menace meter with a party", () => {
  /**
   * Fight for two seconds and report both what the meter READ (the two rolling
   * channels the per-capita rule touches) and what it BANKED.
   *
   * `damage`/`kills` are the RUN's totals, as `step()` hands them over — summed
   * over everybody, which is the whole difficulty. The minion kills are booked
   * alongside because the rolling heat only fires through the CLEARANCE GATE:
   * without them the gate reads a party fighting nothing, returns 0, and every
   * comparison below would be 0 === 0 — a test that passes whatever the code
   * does.
   */
  function fight(
    n: number,
    damage: number,
    kills: number,
    depart = 0,
  ): { dps: number; killRate: number; menace: number } {
    const { state } = party(n);
    huddle(state);
    // Level the party out of the early-game warmup damping, or every read is a
    // fraction of a fraction and the comparison is noise.
    for (const hero of state.players) hero.level = 30;
    for (
      let seat = state.players.length - depart;
      seat < state.players.length;
      seat++
    ) {
      departHero(state, seat);
    }
    for (let i = 0; i < 20; i++) {
      state.pendingMinionKills = kills * 0.1;
      tickMenace(state, 100, damage * 0.1, kills * 0.1);
    }
    return {
      dps: state.combatDps,
      killRate: state.combatKillRate,
      menace: state.menace,
    };
  }

  it("reads a party's summed output PER CAPITA, not per party", () => {
    // Eight heroes each fighting at an ordinary pace put out eight times the
    // damage of one — and it is still an ordinary fight for each of them. Fed
    // the raw sum the meter would saturate inside a minute and, because the
    // evolution ratchet is a permanent floor within a run, never come back
    // down: co-op would not be hard, it would be hard FOR EVER.
    const solo = fight(1, 4000, 8);
    const eight = fight(8, 32_000, 64);
    expect(eight.dps).toBeCloseTo(solo.dps, 5);
    expect(eight.killRate).toBeCloseTo(solo.killRate, 5);
    expect(eight.menace).toBeCloseTo(solo.menace, 5);
  });

  it("is not measuring zero — a rampage still reads hotter than a fair fight", () => {
    // The guard on the test above: both readings agreeing at 0 would prove
    // nothing at all, and the clearance gate makes 0 the easy accident.
    const fair = fight(4, 4000, 8);
    const rampage = fight(4, 80_000, 160);
    expect(fair.dps).toBeGreaterThan(0);
    expect(rampage.dps).toBeGreaterThan(fair.dps);
    expect(rampage.menace).toBeGreaterThan(fair.menace);
  });

  it("stops counting a departed seat as a share of the output", () => {
    // Three players carrying on after a fourth quits must be judged as three,
    // or the meter reads their fight as a quarter easier than it is.
    const afterQuit = fight(4, 3600, 6, 1);
    const three = fight(3, 3600, 6);
    expect(afterQuit.dps).toBeCloseTo(three.dps, 5);
    expect(afterQuit.menace).toBeCloseTo(three.menace, 5);
  });
});

describe("picking things up with a party", () => {
  /** Advance only the item pass, the way `step()` does inside `playing`. */
  function tickItems(state: GameState, ms = DT): void {
    step(state, idle, ms);
  }

  it("counts a drop's arc down ONCE, however many heroes are on the map", () => {
    // The trap this pins: the toss countdown used to live inside the same loop
    // as the pickup test, so a party of eight would have counted every arc
    // down eight times as fast and every drop in the game would have landed in
    // an eighth of its flight the day a second player joined.
    const solo = party(1).state;
    const eight = party(8).state;
    for (const state of [solo, eight]) {
      huddle(state, { x: 4000, y: 4000 });
      dropTestItem(state, { x: 400, y: 400 });
    }
    tickItems(solo);
    tickItems(eight);
    // The ELAPSED share of the flight, not the remaining ms: the hop's own
    // length is hash-derived off the item id and the two runs minted different
    // ids, so the two arcs are legitimately different LENGTHS. What must match
    // is how much of each was spent — one tick's worth.
    expect(flown(eight)).toBeCloseTo(flown(solo), 9);
    expect(flown(solo)).toBeCloseTo(DT, 9);
  });

  it("lets a second hero pick up what he is standing on", () => {
    const { state, heroes } = party(2);
    const [a, b] = heroes as [Player, Player];
    a.pos = { x: 4000, y: 4000 };
    b.pos = { x: 400, y: 400 };
    b.medkits = [0, 0, 0];
    dropTestItem(state, { x: 400, y: 400 });
    landEverything(state);
    tickItems(state);
    expect(state.items).toHaveLength(0);
    // Into HIS dock, not the host's — the pickup is per hero, all the way down.
    expect(b.medkits.reduce((n, v) => n + v, 0)).toBe(1);
  });

  it("refuses a hero somebody else's allocated drop, and keeps it on the floor", () => {
    const { state, heroes } = party(2);
    const [a, b] = heroes as [Player, Player];
    state.lootMode = "allocated";
    huddle(state, { x: 400, y: 400 });
    a.medkits = [0, 0, 0];
    b.medkits = [0, 0, 0];
    dropTestItem(state, { x: 400, y: 400 });
    landEverything(state);
    const item = state.items[0];
    if (!item) throw new Error("no drop");
    // Give it to whichever seat did NOT get it, so the test does not depend on
    // how the hash rolled.
    item.owner = 1;
    tickItems(state);
    expect(state.items).toHaveLength(0);
    expect(a.medkits.reduce((n, v) => n + v, 0)).toBe(0);
    expect(b.medkits.reduce((n, v) => n + v, 0)).toBe(1);
  });
});

/** How much of the first drop's arc has been flown, in ms. */
function flown(state: GameState): number {
  const toss = state.items[0]?.toss;
  return toss ? toss.totalMs - toss.ms : 0;
}

/** Put every airborne drop on the ground, so a pickup test is about the pickup
 * rather than about the length of a toss. */
function landEverything(state: GameState): void {
  for (const item of state.items) {
    item.toss = undefined;
    item.deliverMs = undefined;
  }
}

// ─── THE WORLD ADDRESSES THE HERO IT IS ACTUALLY DEALING WITH ───────────────
//
// The party's other half: not the arithmetic a run does differently, but WHOM
// each pass is about. Every rule below used to read `state.players[0]` — which
// is correct in single player and, the day a second seat arrives, means "the
// host" in a pass that was never about the host. So each of these stages the
// two heroes APART and puts the event next to the one that is NOT seat 0: a
// regression to the old read fails on the geometry, not on a number.

describe("a hostile shot hits the body it reaches", () => {
  it("wounds the hero it flew into, not seat 0 across the map", () => {
    const { state, heroes } = party(2);
    const [a, b] = heroes as [Player, Player];
    a.pos = { x: 300, y: 300 };
    b.pos = { x: 1600, y: 1200 };
    a.hp = a.maxHp;
    b.hp = b.maxHp;
    // A round already on top of seat 1, aimed nowhere near seat 0.
    state.projectiles.push({
      id: state.nextId++,
      pos: { ...b.pos },
      dir: { x: 1, y: 0 },
      speed: 0,
      radius: 4,
      damage: 40,
      lifetimeMs: 2000,
      weaponClass: "ranged",
      sprite: "bolt",
      hostile: true,
      sourceMlvl: 1,
      z: 0,
    });
    step(state, idle, DT);
    expect(b.hp).toBeLessThan(b.maxHp);
    expect(a.hp).toBe(a.maxHp);
  });

  it("lets a shooter fire on the hero it is chasing", () => {
    const { state, heroes } = party(2);
    const [a, b] = heroes as [Player, Player];
    state.obstacles = [];
    // Seat 0 is far EAST and out of range; seat 1 stands right beside the
    // shooter, to its west. A seat-0 read fires nothing at all (nobody in
    // range), and if it fired it would aim the other way.
    a.pos = { x: 2300, y: 300 };
    b.pos = { x: 1600, y: 1200 };
    const gunner = makeEnemy({ pos: { x: 1720, y: 1200 } }, "test_gunner");
    gunner.awake = true;
    state.enemies.push(gunner);
    step(state, idle, DT);
    const shot = state.projectiles.find((p) => p.hostile);
    if (!shot) throw new Error("the shooter never fired");
    expect(shot.dir.x).toBeLessThan(0);
  });
});

describe("a level-up's shockwave", () => {
  it("detonates on the hero who dinged", () => {
    const { state, heroes } = party(2);
    const [a, b] = heroes as [Player, Player];
    a.pos = { x: 300, y: 300 };
    b.pos = { x: 1600, y: 1200 };
    const nearA = makeEnemy({ pos: { x: 330, y: 300 } });
    const nearB = makeEnemy({ pos: { x: 1630, y: 1200 } });
    state.enemies.push(nearA, nearB);
    // Seat 1 earns the level, alone and across the map.
    grantXp(state, b, b.xpToNext * 3);
    expect(b.level).toBeGreaterThan(1);
    expect(nearB.knockMs).toBeGreaterThan(0);
    expect(nearA.knockMs).toBeFalsy();
  });
});

describe("a smashed crate", () => {
  it("spills for the hero who cracked it open, not for seat 0", () => {
    const { state, heroes } = party(2);
    const [a, b] = heroes as [Player, Player];
    a.pos = { x: 300, y: 300 };
    b.pos = { x: 1600, y: 1200 };
    // Seat 0 carries a weapon that eats BULLETS; seat 1 carries none and is
    // already stocked with bullets, so his own leanest kind is ARROWS.
    a.equipment.weapon = {
      id: state.nextId++,
      defId: "test_carbine",
      slot: "weapon",
      tier: "regular",
      ilvl: 1,
      affixes: [],
    };
    b.ammo.bullets = 5;
    expect(ammoKindFor(state, a)).toBe("bullets");
    expect(ammoKindFor(state, b)).toBe("arrows");
    // A crate at seat 1's feet, themed to pay ammunition and nothing else.
    const crate = {
      id: state.nextId++,
      kind: "crate",
      sprite: "crate",
      pos: { x: b.pos.x + 6, y: b.pos.y },
      radius: 7,
      jumpable: true,
      breakable: true,
      hp: 1,
      maxHp: 1,
      lootDrop: { ammo: 1 },
    } as GameState["obstacles"][number];
    state.obstacles = [...state.obstacles, crate];
    damageCrate(state, crate, 10);
    const ammo = state.items.find((i) => i.kind === "ammo");
    if (!ammo || ammo.kind !== "ammo")
      throw new Error("the crate paid no ammo");
    expect(ammo.ammo).toBe("arrows");
  });
});

describe("the lift", () => {
  it("carries whoever is standing on the plate", () => {
    const { state, heroes } = party(2);
    const [a, b] = heroes as [Player, Player];
    a.pos = { x: 300, y: 300 };
    state.elevators = [
      {
        id: "lift_down",
        pos: { x: 1600, y: 1200 },
        to: { x: 2100, y: 400 },
        sprite: "elevator_pad",
        radius: 30,
        used: false,
      },
    ];
    b.pos = { x: 1600, y: 1200 };
    b.z = 0;
    step(state, idle, DT);
    // Seat 1 rode it; seat 0, who never touched the pad, has not moved.
    expect(b.pos.x).toBeCloseTo(2100, 0);
    expect(b.pos.y).toBeCloseTo(400, 0);
    expect(a.pos).toEqual({ x: 300, y: 300 });
  });
});

describe("the AUTO PILOT meter", () => {
  it("bills the purse of the hero who bought the ride", () => {
    const { state, heroes } = party(2);
    const [a, b] = heroes as [Player, Player];
    a.coins = 10_000;
    b.coins = 10_000;
    expect(startAutopilot(state, b, 1)).toBe(true);
    for (let i = 0; i < 125; i++) step(state, idle, DT); // 2s of game time
    expect(b.coins).toBeLessThan(10_000);
    expect(a.coins).toBe(10_000);
    // …and a top-up lands in the buyer's purse too.
    expect(creditAutopilotPurse(state, b, 250)).toBe(250);
    expect(a.coins).toBe(10_000);
  });
});
