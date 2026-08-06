// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CACHE — the garage chest (src/game/cache.ts). The rules under test are
// the four the module is built on: it stands only where a map reserved a spot,
// only for a hero who has earned it, its contents ride the loadout, and neither
// direction of a move can ever lose a piece.

import { describe, expect, it } from "vitest";

import {
  applyLoadout,
  CACHE,
  cacheStanding,
  closeCache,
  createGame,
  emptyCache,
  extractLoadout,
  grantCache,
  normalizeCache,
  openCache,
  stashItem,
  takeFromCache,
  type Equipment,
  type GameState,
} from "@game/core";

import { DT, idle, run } from "../helpers.ts";
import { startGame } from "./helpers.ts";

/** A plain fixture piece to move around. */
function piece(id: number): Equipment {
  return {
    id,
    defId: "test_bag",
    slot: "bag",
    tier: "regular",
    ilvl: 1,
    affixes: [],
  };
}

/** A hub run with the chest already earned and finished arriving — the state
 * every "using the chest" test below wants. */
function atTheChest(): GameState {
  const state = startGame(42, "test_hub_level");
  grantCache(state);
  // Past the arrival: the tap is deliberately held while the thing is still
  // becoming a thing, and every test here is about the chest that already is.
  state.cacheArriveMs = 0;
  state.players[0].pos = { ...state.cachePos! };
  return state;
}

describe("the cache — where it stands", () => {
  it("stands only on a map that reserved a spot for it", () => {
    // The hub's blueprint carries a `cache` landmark; an ordinary venue does
    // not, so the chest has nowhere to be even for a hero who owns one.
    const hub = createGame(
      42,
      "test_hub_level",
      "medium",
      undefined,
      false,
      [],
      false,
      true,
    );
    expect(hub.cachePos).not.toBeNull();
    expect(cacheStanding(hub)).toBe(true);

    const field = createGame(
      42,
      "test_level",
      "medium",
      undefined,
      false,
      [],
      false,
      true,
    );
    expect(field.cachePos).toBeNull();
    expect(cacheStanding(field)).toBe(false);
    // …and the verb refuses rather than opening a screen onto nothing.
    expect(openCache(field, field.players[0])).toBe(false);
  });

  it("the spot is reserved whether or not the hero owns the chest", () => {
    // The map's job is to know WHERE the furniture goes; owning it is the
    // run's business. Without that split the chest could not be handed over
    // mid-run without re-carving the level.
    const state = startGame(42, "test_hub_level");
    expect(state.cachePos).not.toBeNull();
    expect(state.cacheOwned).toBe(false);
    expect(cacheStanding(state)).toBe(false);
  });

  it("granting it stands it at the reserved spot and runs an arrival", () => {
    const state = startGame(42, "test_hub_level");
    const spot = { ...state.cachePos! };
    state.events.length = 0;

    const at = grantCache(state);
    expect(at).toEqual(spot);
    expect(state.cacheOwned).toBe(true);
    expect(state.cacheArriveMs).toBe(CACHE.arriveMs);
    expect(state.events.filter((e) => e.type === "cacheGiven")).toHaveLength(1);

    // The tap is HELD until it has finished becoming a chest.
    state.players[0].pos = { ...spot };
    expect(openCache(state, state.players[0])).toBe(false);

    // …and the step counts the arrival off, after which it opens.
    run(state, idle, Math.ceil(CACHE.arriveMs / DT) + 2);
    expect(state.cacheArriveMs).toBe(0);
    expect(openCache(state, state.players[0])).toBe(true);
  });

  it("granting twice does not re-run the arrival", () => {
    // A second errand paying the chest must not restart a fixture the hero has
    // been using — the tap would be dead for a beat with nothing to explain it.
    const state = atTheChest();
    state.events.length = 0;
    expect(grantCache(state)).toEqual(state.cachePos);
    expect(state.cacheArriveMs).toBe(0);
    expect(state.events.filter((e) => e.type === "cacheGiven")).toHaveLength(0);
  });

  it("refuses a hero standing away from it", () => {
    const state = atTheChest();
    const hero = state.players[0];
    hero.pos = { x: hero.pos.x + CACHE.tapRadius + 20, y: hero.pos.y };
    expect(openCache(state, hero)).toBe(false);
    hero.pos = { ...state.cachePos! };
    expect(openCache(state, hero)).toBe(true);
  });
});

describe("the cache — moving pieces", () => {
  it("keeps a bag piece and takes it back", () => {
    const state = atTheChest();
    const hero = state.players[0];
    hero.inventory[0] = piece(1);
    expect(openCache(state, hero)).toBe(true);

    // Into the first free chest cell, out of the bag cell it came from.
    expect(stashItem(state, hero, 0)).toBe(0);
    expect(hero.cache[0]?.id).toBe(1);
    expect(hero.inventory[0]).toBeNull();

    // …and back into the first free bag cell.
    expect(takeFromCache(state, hero, 0)).toBe(0);
    expect(hero.inventory[0]?.id).toBe(1);
    expect(hero.cache[0]).toBeNull();
  });

  it("does nothing at all with the chest closed", () => {
    const state = atTheChest();
    const hero = state.players[0];
    hero.inventory[0] = piece(1);
    expect(stashItem(state, hero, 0)).toBeNull();
    expect(hero.inventory[0]?.id).toBe(1);
  });

  it("a full chest refuses the move and leaves the piece in the bag", () => {
    // NEVER onto the floor, and never quietly eaten — a refused move has to
    // leave the piece exactly where the player last saw it.
    const state = atTheChest();
    const hero = state.players[0];
    for (let i = 0; i < CACHE.slots; i++) hero.cache[i] = piece(100 + i);
    hero.inventory[0] = piece(1);
    openCache(state, hero);

    expect(stashItem(state, hero, 0)).toBeNull();
    expect(hero.inventory[0]?.id).toBe(1);
    expect(hero.cache.filter(Boolean)).toHaveLength(CACHE.slots);
  });

  it("a full bag refuses the take and leaves the piece in the chest", () => {
    const state = atTheChest();
    const hero = state.players[0];
    for (let i = 0; i < hero.inventory.length; i++)
      hero.inventory[i] = piece(50 + i);
    hero.cache[0] = piece(1);
    openCache(state, hero);

    expect(takeFromCache(state, hero, 0)).toBeNull();
    expect(hero.cache[0]?.id).toBe(1);
  });

  it("an empty cell is a no-op in both directions", () => {
    const state = atTheChest();
    const hero = state.players[0];
    openCache(state, hero);
    expect(stashItem(state, hero, 3)).toBeNull();
    expect(takeFromCache(state, hero, 3)).toBeNull();
  });

  it("closing lowers only the cache screen", () => {
    const state = atTheChest();
    const hero = state.players[0];
    openCache(state, hero);
    expect(hero.screen).toBe("cache");
    closeCache(hero);
    expect(hero.screen).toBeUndefined();
  });
});

describe("the cache — what carries", () => {
  it("the contents ride the loadout to the next level", () => {
    const state = atTheChest();
    const hero = state.players[0];
    hero.cache[2] = piece(7);

    const loadout = extractLoadout(state, hero);
    expect(loadout.cache?.[2]?.defId).toBe("test_bag");

    // …and land on the hero the next run builds, in the same cell.
    const next = createGame(42, "test_level", "medium", loadout);
    expect(next.players[0].cache[2]?.defId).toBe("test_bag");
    expect(next.players[0].cache).toHaveLength(CACHE.slots);
  });

  it("a loadout banked before the chest shipped loads an empty one", () => {
    const state = atTheChest();
    const loadout = extractLoadout(state, state.players[0]);
    delete loadout.cache;
    const next = createGame(42, "test_level", "medium");
    applyLoadout(next, next.players[0], loadout);
    expect(next.players[0].cache).toHaveLength(CACHE.slots);
    expect(next.players[0].cache.filter(Boolean)).toHaveLength(0);
  });

  it("normalizes a chest of the wrong size without a hole in the grid", () => {
    expect(emptyCache()).toHaveLength(CACHE.slots);
    expect(normalizeCache([])).toHaveLength(CACHE.slots);
    expect(normalizeCache(undefined)).toHaveLength(CACHE.slots);
    const long = new Array<Equipment | null>(CACHE.slots + 5).fill(null);
    long[0] = piece(1);
    expect(normalizeCache(long)).toHaveLength(CACHE.slots);
    expect(normalizeCache(long)[0]?.id).toBe(1);
  });
});
