// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CACHE — the garage chest (src/game/cache.ts). The rules under test are
// the four the module is built on: it stands only where a map reserved a spot,
// only for a hero who has earned it, its contents ride the loadout, and neither
// direction of a move can ever lose a piece.

import { describe, expect, it } from "vitest";

import {
  applyLoadout,
  CACHE,
  CACHE_TOKEN,
  cacheNameFor,
  cacheSlotsFor,
  cacheStanding,
  DIFFICULTY_ORDER,
  difficultyDef,
  resolveCacheLine,
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
      16,
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
      16,
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
    expect(state.cacheSlots).toBe(0);
    expect(cacheStanding(state)).toBe(false);
  });

  it("granting it stands it at the reserved spot and runs an arrival", () => {
    const state = startGame(42, "test_hub_level");
    const spot = { ...state.cachePos! };
    state.events.length = 0;

    const at = grantCache(state);
    expect(at).toEqual(spot);
    expect(state.cacheSlots).toBe(16);
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

  it("granting the SAME rung twice does not re-run the arrival", () => {
    // A second errand paying a chest the hero already has must not restart a
    // fixture they have been using — the tap would be dead for a beat with
    // nothing to explain it.
    const state = atTheChest();
    state.events.length = 0;
    expect(grantCache(state)).toBeNull();
    expect(state.cacheArriveMs).toBe(0);
    expect(state.events.filter((e) => e.type === "cacheGiven")).toHaveLength(0);
  });

  it("a DEEPER rung replaces the chest, and a gentler one never shrinks it", () => {
    // THE LADDER. Ruth's errand runs once per difficulty and each rung pays a
    // bigger piece of furniture; what the hero owns is the deepest they have
    // been paid, so an EASY run after a HARD one still opens the hard chest.
    const easy = startGame(42, "test_hub_level");
    easy.difficulty = "easy";
    expect(grantCache(easy)).not.toBeNull();
    expect(easy.cacheSlots).toBe(cacheSlotsFor("easy"));

    // Deeper: a new chest, a new name, and the arrival plays again — a bigger
    // piece of furniture turning up is exactly what happened.
    easy.difficulty = "hard";
    easy.cacheArriveMs = 0;
    easy.events.length = 0;
    expect(grantCache(easy)).not.toBeNull();
    expect(easy.cacheSlots).toBe(cacheSlotsFor("hard"));
    expect(easy.cacheArriveMs).toBe(CACHE.arriveMs);
    const given = easy.events.find((e) => e.type === "cacheGiven");
    expect(given).toMatchObject({
      slots: cacheSlotsFor("hard"),
      name: cacheNameFor("hard"),
    });

    // …and back down: the errand still runs, the chest does not move.
    easy.difficulty = "easy";
    easy.cacheArriveMs = 0;
    expect(grantCache(easy)).toBeNull();
    expect(easy.cacheSlots).toBe(cacheSlotsFor("hard"));
  });

  it("the ladder climbs and tops out at the ceiling the grid is laid out at", () => {
    // Every rung is a whole number of D2-width rows, each deeper than the last,
    // and the deepest is exactly the array every hero carries.
    const rungs = DIFFICULTY_ORDER.map(cacheSlotsFor).filter((n) => n > 0);
    expect(rungs.length).toBeGreaterThan(1);
    for (const slots of rungs) expect(slots % CACHE.cols).toBe(0);
    expect([...rungs].sort((a, b) => a - b)).toEqual(rungs);
    expect(Math.max(...rungs)).toBeLessThanOrEqual(CACHE.maxSlots);
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
    for (let i = 0; i < CACHE.maxSlots; i++) hero.cache[i] = piece(100 + i);
    hero.inventory[0] = piece(1);
    openCache(state, hero);

    expect(stashItem(state, hero, 0)).toBeNull();
    expect(hero.inventory[0]?.id).toBe(1);
    expect(hero.cache.filter(Boolean)).toHaveLength(CACHE.maxSlots);
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

  it("the cells past what the hero earned take nothing", () => {
    // The list is always the CEILING long and the rows past this hero's chest
    // are LOCKED — a piece put in one would be invisible until they beat a
    // difficulty. So a full earned chest refuses even with the array half empty.
    const state = atTheChest();
    const hero = state.players[0];
    expect(hero.cache.length).toBe(CACHE.maxSlots);
    expect(state.cacheSlots).toBeLessThan(CACHE.maxSlots);
    for (let i = 0; i < state.cacheSlots; i++) hero.cache[i] = piece(100 + i);
    hero.inventory[0] = piece(1);
    openCache(state, hero);

    expect(stashItem(state, hero, 0)).toBeNull();
    expect(hero.inventory[0]?.id).toBe(1);
    expect(hero.cache[state.cacheSlots]).toBeNull();
  });

  it("a piece stranded past the earned rows can still be taken back", () => {
    // Nothing should ever put one there — but if a save from a deeper rung
    // somehow does, the way out has to be open. Locking it would be the one bug
    // in the feature the player could not work around.
    const state = atTheChest();
    const hero = state.players[0];
    hero.cache[CACHE.maxSlots - 1] = piece(9);
    openCache(state, hero);
    expect(takeFromCache(state, hero, CACHE.maxSlots - 1)).toBe(0);
    expect(hero.inventory[0]?.id).toBe(9);
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

describe("the cache — what Ruth says she brought", () => {
  it("resolves the rung's own line into the errand's page", () => {
    // The errand is one file and the ladder is five: the rung owns the
    // sentence, the page says where it lands (`{CACHE}`).
    const page = resolveCacheLine([CACHE_TOKEN], "medium");
    expect(page).toEqual([difficultyDef("medium").cache!.line]);
    expect(page![0]).not.toContain("{");
  });

  it("a deeper rung says something different", () => {
    // The whole point of the token — a flea-market box and a thing off a king
    // cannot share a sentence.
    expect(resolveCacheLine([CACHE_TOKEN], "easy")).not.toEqual(
      resolveCacheLine([CACHE_TOKEN], "hard"),
    );
  });

  it("a rung that pays no chest drops the page rather than blanking it", () => {
    // The fixture ladder deliberately stops after three rungs, which is the
    // shape a mod's cut-down ladder has. An empty box the player has to tap
    // through is worse than a beat that is not there.
    expect(difficultyDef("jesus").cache).toBeUndefined();
    expect(resolveCacheLine([CACHE_TOKEN], "jesus")).toBeNull();
  });

  it("leaves every other page in the game untouched, by identity", () => {
    // Every page of every other errand takes this path, so it has to be free —
    // and the SAME array, or the offer box re-renders on a fresh object.
    const page = ["JUST A LINE."];
    expect(resolveCacheLine(page, "medium")).toBe(page);
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
    expect(next.players[0].cache).toHaveLength(CACHE.maxSlots);
  });

  it("the contents survive a change of difficulty", () => {
    // The chest is what a hero carries between RUNS, and a new difficulty is
    // just the next run — the loadout is the one road anything a hero owns
    // takes, and it does not care which rung it lands on.
    const state = atTheChest();
    state.players[0].cache[0] = piece(11);
    const loadout = extractLoadout(state, state.players[0]);

    const harder = createGame(
      42,
      "test_hub_level",
      "hard",
      loadout,
      false,
      [],
      false,
      cacheSlotsFor("hard"),
    );
    expect(harder.players[0].cache[0]?.id).toBeDefined();
    expect(harder.cacheSlots).toBe(cacheSlotsFor("hard"));

    // …and a fresh run on the GENTLEST rung still opens the chest they earned,
    // because the depth is the character's high-water mark rather than this
    // rung's. A stash that shrank would have to pick what to throw away.
    const back = createGame(
      42,
      "test_hub_level",
      "easy",
      loadout,
      false,
      [],
      false,
      cacheSlotsFor("hard"),
    );
    expect(back.cacheSlots).toBe(cacheSlotsFor("hard"));
    expect(back.players[0].cache[0]?.id).toBeDefined();
  });

  it("a loadout banked before the chest shipped loads an empty one", () => {
    const state = atTheChest();
    const loadout = extractLoadout(state, state.players[0]);
    delete loadout.cache;
    const next = createGame(42, "test_level", "medium");
    applyLoadout(next, next.players[0], loadout);
    expect(next.players[0].cache).toHaveLength(CACHE.maxSlots);
    expect(next.players[0].cache.filter(Boolean)).toHaveLength(0);
  });

  it("normalizes a chest of the wrong size without a hole in the grid", () => {
    expect(emptyCache()).toHaveLength(CACHE.maxSlots);
    expect(normalizeCache([])).toHaveLength(CACHE.maxSlots);
    expect(normalizeCache(undefined)).toHaveLength(CACHE.maxSlots);
    const long = new Array<Equipment | null>(CACHE.maxSlots + 5).fill(null);
    long[0] = piece(1);
    expect(normalizeCache(long)).toHaveLength(CACHE.maxSlots);
    expect(normalizeCache(long)[0]?.id).toBe(1);
  });
});
