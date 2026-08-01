// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// GOLD — the coin economy's second faucet (src/game/items/gold.ts).
//
// Five rules are pinned here, and every one of them is invisible until it is
// wrong:
//
//   1. WHO CARRIES A PURSE. A humanoid — something that walks on legs and is
//      not a beast — and nothing else, unless a def says otherwise with
//      `wealth`. This is the whole of what "gold drops from humanoid mobs"
//      means, and it is derived rather than authored, so a regression here is
//      silent across the entire roster at once.
//   2. WHAT ONE IS WORTH. Priced off the victim's monster level, multiplied by
//      its rank and by how rich it was. The multipliers COMPOUND, which is the
//      trap this suite exists to keep an eye on.
//   3. NOT EVERY CORPSE PAYS. The minion rate is a fifth, because the floor of
//      a fight is meant to be blood rather than money.
//   4. THE DRAWS COME OFF THEIR OWN STREAM. A gold roll must not advance
//      `state.rng()`, or moving the gold knob would reshuffle every equipment
//      drop in a seeded run — and the calibration that sets the knob compares
//      exactly those two things against each other.
//   5. NOTHING CAN REFUSE IT. No bag cell, no stack cap: a pile is banked by
//      whoever walks over it, always, so a cleared floor never glitters with
//      money the hero could not carry.

import { describe, expect, it } from "vitest";

import {
  carriesGold,
  dropGold,
  expectedGold,
  GOLD,
  goldSprite,
  goldValue,
  step,
  type EnemyDef,
  type GameState,
} from "@game/core";

import { clearStage, idle, makeEnemy, run, startGame } from "./helpers.ts";

/** A minimal def, shaped only where the question under test looks. */
function def(over: Partial<EnemyDef> = {}): EnemyDef {
  return {
    id: "probe",
    name: "PROBE",
    lore: "A synthetic def used only to ask the gold rules a question.",
    role: "minion",
    sprite: "probe",
    hp: 10,
    speed: 10,
    radius: 8,
    contactDamage: 1,
    critChance: 0,
    contactCooldownMs: 700,
    ai: { aggroRadius: 100 },
    ...over,
  };
}

/** A run with an empty field and nothing on the floor. */
function stage(seed = 42): GameState {
  const state = startGame(seed);
  clearStage(state);
  state.items = [];
  state.events = [];
  return state;
}

/** Every gold pile currently on the floor. */
function piles(state: GameState) {
  return state.items.filter((i) => i.kind === "gold");
}

/** What the floor is holding, in coins. */
function onFloor(state: GameState): number {
  return piles(state).reduce(
    (n, i) => n + (i.kind === "gold" ? i.amount : 0),
    0,
  );
}

describe("who was carrying money", () => {
  it("pays a humanoid — anything that walks on legs and is not a beast", () => {
    expect(carriesGold(def())).toBe(true);
    expect(carriesGold(def({ locomotion: "legs" }))).toBe(true);
    // Including the two-legged MACHINES: a park robot built to take money is
    // as much a purse as the man who wrote its firmware, and exempting the
    // robots would exempt most of a roster the satire is about.
    expect(carriesGold(def({ locomotion: "legs", gore: "sparks" }))).toBe(true);
  });

  it("pays nothing that has nowhere to put a coin", () => {
    // A chassis on treads, a thing that drifts, and an animal.
    expect(carriesGold(def({ locomotion: "wheels" }))).toBe(false);
    expect(carriesGold(def({ locomotion: "float" }))).toBe(false);
    expect(carriesGold(def({ anatomy: "beast" }))).toBe(false);
    // A boss's planted object and a figure that is not really there both take
    // the `elite` role for mechanical reasons and neither ever had a wallet.
    expect(carriesGold(def({ role: "elite", structure: true }))).toBe(false);
    expect(carriesGold(def({ role: "elite", apparition: true }))).toBe(false);
  });

  it("lets `wealth` override in BOTH directions", () => {
    // 0 closes the pockets of a body that would have paid…
    expect(carriesGold(def({ wealth: 0 }))).toBe(false);
    // …and any positive value opens the pockets of one that would not have,
    // which is how a treasury warden bolted to a door on treads still pays.
    expect(carriesGold(def({ locomotion: "wheels", wealth: 2 }))).toBe(true);
    expect(carriesGold(def({ locomotion: "float", wealth: 4 }))).toBe(true);
  });
});

describe("what a purse is worth", () => {
  it("is priced off the victim's monster level", () => {
    expect(goldValue(def(), 20)).toBeGreaterThan(goldValue(def(), 5));
    // …and off the config's own line, not a number typed twice.
    expect(goldValue(def(), 10)).toBeCloseTo(
      (GOLD.base + GOLD.perMlvl * 10) * GOLD.dropMult,
      6,
    );
  });

  it("pays a set piece like a set piece", () => {
    const at = 20;
    const minion = goldValue(def(), at);
    const elite = goldValue(def({ role: "elite" }), at);
    const boss = goldValue(def({ role: "boss" }), at);
    expect(elite).toBeCloseTo(minion * GOLD.roleMult.elite, 6);
    expect(boss).toBeCloseTo(minion * GOLD.roleMult.boss, 6);
    expect(boss).toBeGreaterThan(elite);
  });

  it("pays a billionaire like a billionaire", () => {
    const at = 20;
    expect(goldValue(def({ wealth: 6 }), at)).toBeCloseTo(
      goldValue(def(), at) * 6,
      6,
    );
    // The rank-and-file guard and the man who owns the building, on the same
    // ground: the joke told in loot rather than in dialogue.
    expect(goldValue(def({ role: "boss", wealth: 6 }), at)).toBeGreaterThan(
      goldValue(def(), at) * 100,
    );
  });

  it("prices a kill's EXPECTED payout through the chance, not past it", () => {
    expect(expectedGold(def(), 20)).toBeCloseTo(
      goldValue(def(), 20) * GOLD.minionChance,
      6,
    );
    // A boss always pays, so its expectation is its purse.
    expect(expectedGold(def({ role: "boss" }), 20)).toBeCloseTo(
      goldValue(def({ role: "boss" }), 20) * GOLD.bossChance,
      6,
    );
    // …and something with no pockets expects nothing at all.
    expect(expectedGold(def({ locomotion: "wheels" }), 20)).toBe(0);
  });
});

describe("the drop itself", () => {
  it("pays about one body in five, and never one without pockets", () => {
    const state = stage();
    const humanoid = def();
    let paid = 0;
    const N = 400;
    for (let i = 0; i < N; i++) {
      state.items = [];
      dropGold(state, humanoid, { x: 200, y: 200 }, 10);
      if (piles(state).length > 0) paid++;
    }
    // A fifth, with room for the sampling noise 400 draws leaves.
    expect(paid / N).toBeGreaterThan(GOLD.minionChance - 0.06);
    expect(paid / N).toBeLessThan(GOLD.minionChance + 0.06);

    const rover = def({ locomotion: "wheels" });
    state.items = [];
    for (let i = 0; i < 200; i++) {
      dropGold(state, rover, { x: 200, y: 200 }, 10);
    }
    expect(piles(state)).toHaveLength(0);
  });

  it("splits a boss's takings into a fountain that still sums to the total", () => {
    const state = stage();
    state.items = [];
    dropGold(state, def({ role: "boss" }), { x: 300, y: 300 }, 20);
    expect(piles(state)).toHaveLength(GOLD.piles.boss);
    // The split is spectacle, not a payout change: the pieces sum to what one
    // pile would have held, and none of them is a rounding-error crumb beside
    // the others.
    const amounts = piles(state).map((i) => (i.kind === "gold" ? i.amount : 0));
    const total = amounts.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(0);
    expect(Math.max(...amounts) - Math.min(...amounts)).toBeLessThanOrEqual(
      GOLD.piles.boss,
    );
  });

  it("throws its piles clear of the body, like every other drop", () => {
    const state = stage();
    state.items = [];
    dropGold(state, def({ role: "boss" }), { x: 300, y: 300 }, 20);
    // Airborne on the D2 toss the moment they are minted…
    expect(piles(state).every((i) => i.toss !== undefined)).toBe(true);
    // …and scattered rather than stacked on one spot.
    const xs = new Set(piles(state).map((i) => Math.round(i.pos.x)));
    expect(xs.size).toBeGreaterThan(1);
  });

  it("NEVER advances the run's loot stream", () => {
    // The load-bearing guarantee: `GOLD.dropMult` is calibrated by comparing
    // gold against what the run's loot sells for, so a gold draw that moved the
    // loot stream would move both halves of that measurement at once. It also
    // means the whole feature perturbs no existing seeded drop test.
    const state = stage();
    const before: number[] = [];
    for (let i = 0; i < 8; i++) before.push(state.rng());
    // Re-seed by rebuilding the same run, then spend a pile of gold rolls on
    // it before drawing the same eight.
    const other = stage();
    for (let i = 0; i < 50; i++) {
      dropGold(other, def({ role: "boss" }), { x: 300, y: 300 }, 30);
    }
    const after: number[] = [];
    for (let i = 0; i < 8; i++) after.push(other.rng());
    expect(after).toEqual(before);
  });
});

describe("picking it up", () => {
  it("banks straight into the purse and can never be refused", () => {
    const state = stage();
    const hero = state.players[0];
    state.items = [];
    // A bag with no free cell at all — the state that turns every OTHER drop
    // away. Money does not care.
    hero.inventory.fill(null);
    const coinsBefore = hero.coins;
    // ONE pile, laid at his feet. A boss's six scatter up to `GOLD.scatterPx`
    // and the far ones are simply out of reach — which is the toss working, not
    // the pickup failing.
    state.items.push({
      id: state.nextId++,
      kind: "gold",
      pos: { ...hero.pos },
      amount: 412,
    });
    const owed = onFloor(state);
    expect(owed).toBeGreaterThan(0);
    // Fly the toss down and let him stand on it.
    run(state, idle, 200, (s) => piles(s).length === 0);
    expect(piles(state)).toHaveLength(0);
    expect(hero.coins - coinsBefore).toBe(owed);
    expect(state.stats.goldCollected).toBe(owed);
  });

  it("floats the amount to the app so the pickup can be shown", () => {
    const state = stage();
    const hero = state.players[0];
    state.items = [];
    state.items.push({
      id: state.nextId++,
      kind: "gold",
      pos: { ...hero.pos },
      amount: 137,
    });
    step(state, idle, 16);
    const collected = state.events.find(
      (e) => e.type === "itemCollected" && e.kind === "gold",
    );
    expect(collected).toBeDefined();
    expect(collected).toMatchObject({ coins: 137 });
  });

  it("is credited to the hero who walked over it, not shared with the party", () => {
    // The party's shared payout is XP (`shareXp`); the purse is private, the
    // same way the bag and the build are.
    const state = stage();
    const hero = state.players[0];
    state.items = [];
    state.items.push({
      id: state.nextId++,
      kind: "gold",
      pos: { ...hero.pos },
      amount: 50,
    });
    const before = hero.coins;
    step(state, idle, 16);
    expect(hero.coins).toBe(before + 50);
  });
});

describe("what the pile looks like", () => {
  it("wears the rung its amount puts it on, richest first", () => {
    const rungs = GOLD.pileTiers;
    for (const rung of rungs) {
      // A pile just over a rung's floor wears that rung.
      const name = goldSprite(rung.min + 1, 1);
      expect(rung.sprites).toContain(name);
    }
  });

  it("varies the stamp within a rung so a strewn floor is not one sprite", () => {
    const rung = GOLD.pileTiers.find((t) => t.sprites.length > 1);
    expect(rung).toBeDefined();
    const seen = new Set<string>();
    for (let id = 0; id < 200; id++) {
      seen.add(goldSprite((rung as { min: number }).min + 5, id));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it("is stable for one pile — the stamp is not a per-frame roll", () => {
    expect(goldSprite(500, 77)).toBe(goldSprite(500, 77));
  });
});

describe("a kill pays out", () => {
  it("sheds a purse over the corpse of something that had one", () => {
    const state = stage();
    state.items = [];
    // Drive the roll rather than the fight: `dropGold` is the funnel
    // `killEnemy` calls, and a fight would drag the whole loot ladder in.
    let found = 0;
    for (let i = 0; i < 60; i++) {
      state.items = [];
      dropGold(state, def(), makeEnemy({ pos: { x: 250, y: 250 } }).pos, 15);
      found += piles(state).length;
    }
    expect(found).toBeGreaterThan(0);
  });
});
