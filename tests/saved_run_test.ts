// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Parking and thawing an in-progress run (pwa `saved-run.ts`). The load
// path must rebuild the fog grid as a real `Uint8Array`: `JSON.stringify` turns
// the typed array into a plain object, and a thawed run whose `explored` stays
// a plain object has no `.length`, which freezes the fog renderers so the map
// never clears after a resume (the bug this guards).
//
// It must also REFUSE a snapshot from another save format outright, and the
// shape-drift guard at the bottom is what keeps that refusal honest: a field
// added to the state without a SAVE_VERSION bump ships a build that resumes
// old snapshots into a shape the engine can't read — which presents as the
// post-update freeze (a still image of the map and hero, no UI), not as the
// missing bump it is.

import {
  createGame,
  DEPARTURE,
  LEVEL_ORDER,
  mapCols,
  mapRows,
  step,
} from "@game/core";
import type { Difficulty } from "@game/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DT, idle, startGame } from "./helpers.ts";

import {
  clearRiftRun,
  clearSavedRun,
  loadRiftRun,
  loadSavedRun,
  SAVE_VERSION,
  saveRiftRun,
  saveRun,
} from "../pwa/src/game/saved-run.ts";

// A minimal in-memory localStorage so the pwa module (which persists to
// `localStorage`) runs under vitest's node environment.
class MemoryStorage {
  private store = new Map<string, string>();
  get length(): number {
    return this.store.size;
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
  key(i: number): string | null {
    return Array.from(this.store.keys())[i] ?? null;
  }
}

const LEVEL_ID = LEVEL_ORDER[0] as string;
const DIFFICULTY: Difficulty = "medium";

/** The storage key the parked run lives under (built from the game identity,
 * so it is looked up rather than spelled out). */
function runKey(): string {
  const keys = Array.from({ length: localStorage.length }, (_, i) =>
    localStorage.key(i),
  );
  return keys.find((k) => k?.includes("current-run")) as string;
}

/** The parked run's raw JSON, for the tests that inspect the blob itself. */
function storedRun(): string {
  return localStorage.getItem(runKey()) as string;
}

beforeEach(() => {
  (globalThis as { localStorage?: Storage }).localStorage =
    new MemoryStorage() as unknown as Storage;
});

afterEach(() => {
  delete (globalThis as { localStorage?: Storage }).localStorage;
});

describe("saved run — fog grid survives the freeze/thaw", () => {
  it("thaws `explored` back into a real Uint8Array of the level's grid size", () => {
    const state = createGame(1, LEVEL_ID, DIFFICULTY);
    saveRun({
      characterId: "char-1",
      difficulty: DIFFICULTY,
      levelId: LEVEL_ID,
      state,
    });

    const loaded = loadSavedRun();
    expect(loaded).not.toBeNull();
    const explored = loaded!.state.explored;
    expect(explored).toBeInstanceOf(Uint8Array);
    expect(explored.length).toBe(mapCols(state.level) * mapRows(state.level));
  });

  it("preserves every revealed cell across the round-trip", () => {
    const state = createGame(1, LEVEL_ID, DIFFICULTY);
    // createGame reveals the spawn surroundings; some cells must be lit.
    const litBefore = state.explored.reduce((n, cell) => n + cell, 0);
    expect(litBefore).toBeGreaterThan(0);

    saveRun({
      characterId: "char-1",
      difficulty: DIFFICULTY,
      levelId: LEVEL_ID,
      state,
    });
    const explored = loadSavedRun()!.state.explored;

    // The reveal count the fog renderers compute off `.length` must match —
    // it read 0 on the un-revived plain object, freezing the fog.
    let litAfter = 0;
    for (let i = 0; i < explored.length; i++) litAfter += explored[i] ?? 0;
    expect(litAfter).toBe(litBefore);
    for (let i = 0; i < explored.length; i++) {
      expect(explored[i]).toBe(state.explored[i]);
    }
  });

  it("keeps lifting fog after a resume (cells set on the thawed grid stick)", () => {
    const state = createGame(1, LEVEL_ID, DIFFICULTY);
    saveRun({
      characterId: "char-1",
      difficulty: DIFFICULTY,
      levelId: LEVEL_ID,
      state,
    });
    const explored = loadSavedRun()!.state.explored;

    // Find a still-fogged cell and reveal it, as a resumed step would.
    const dark = explored.indexOf(0);
    expect(dark).toBeGreaterThanOrEqual(0);
    explored[dark] = 1;
    expect(explored[dark]).toBe(1);
    expect(explored).toBeInstanceOf(Uint8Array);
  });

  it("carries the grid PACKED, not one JSON number per tile", () => {
    // The fog grid used to be a quarter of the whole blob (`{"0":0,"1":1,…}`),
    // which was tolerable when a run was parked once a session and is not now
    // that the autosave writes it every few seconds of play on a phone. One
    // bit per tile instead: the packed field must be a small fraction of the
    // tiles it describes, and must not be the spelled-out object at all.
    const state = createGame(1, LEVEL_ID, DIFFICULTY);
    saveRun({
      characterId: "char-1",
      difficulty: DIFFICULTY,
      levelId: LEVEL_ID,
      state,
    });
    const blob = JSON.parse(storedRun()) as { fog?: string; state: object };
    const tiles = mapCols(state.level) * mapRows(state.level);
    expect(typeof blob.fog).toBe("string");
    // Base64 of a bitfield: ~1 char per 6 tiles, well under a fifth either way.
    expect((blob.fog as string).length).toBeLessThan(tiles / 4);
    expect(Object.keys(blob.state)).not.toContain("explored");
  });

  it("still thaws a blob parked BEFORE the packing, grid and all", () => {
    // Same SAVE_VERSION, older shape: the grid spelled out inside `state` and
    // no `fog` beside it. Rewriting the blob that way is exactly what sits in
    // a player's storage when this build reaches them, and binning it would
    // cost them the run for a change that costs them nothing.
    const state = createGame(1, LEVEL_ID, DIFFICULTY);
    saveRun({
      characterId: "char-1",
      difficulty: DIFFICULTY,
      levelId: LEVEL_ID,
      state,
    });
    const blob = JSON.parse(storedRun()) as {
      fog?: string;
      state: { explored?: unknown };
    };
    delete blob.fog;
    blob.state.explored = { ...state.explored };
    localStorage.setItem(runKey(), JSON.stringify(blob));

    const explored = loadSavedRun()?.state.explored;
    expect(explored).toBeInstanceOf(Uint8Array);
    expect(explored?.length).toBe(mapCols(state.level) * mapRows(state.level));
    for (let i = 0; i < (explored?.length ?? 0); i++) {
      expect(explored?.[i]).toBe(state.explored[i]);
    }
  });

  afterEach(() => clearSavedRun());
});

describe("saved run — incompatible snapshots are dropped, not resumed", () => {
  it("refuses a snapshot from an older save format and clears it", () => {
    const state = createGame(1, LEVEL_ID, DIFFICULTY);
    saveRun({
      characterId: "char-1",
      difficulty: DIFFICULTY,
      levelId: LEVEL_ID,
      state,
    });
    // Rewrite the parked blob as the PREVIOUS format would have stamped it —
    // the situation an app update creates when the state grew a field the old
    // build never wrote (v24: the ammunition pouch, the gold ledger).
    const key = runKey();
    const blob = JSON.parse(storedRun()) as { v: number };
    blob.v = SAVE_VERSION - 1;
    localStorage.setItem(key, JSON.stringify(blob));

    // The thaw must refuse it (CONTINUE simply doesn't appear) and clear the
    // blob so it can't wedge a later load.
    expect(loadSavedRun()).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();
  });

  afterEach(() => clearSavedRun());
});

// THE SHAPE-DRIFT GUARD. These lists are the state shape SAVE_VERSION promises
// it can thaw. When this test fails, a field joined (or left) the serialized
// state and the save format has NOT been told:
//
//   1. Decide whether a snapshot from the current SAVE_VERSION can still be
//      read into the new shape. A new REQUIRED field the engine reads
//      unguarded (`player.ammo[...]`) cannot — that thaw crashes the resume's
//      first frame, before any UI mounts, and the player sees a frozen map. A
//      new OPTIONAL field, or one every reader defaults, can.
//   2. If it can't: bump SAVE_VERSION in pwa/src/game/saved-run.ts (with a
//      comment line saying what joined, like every bump before it).
//   3. Update the lists below to the new shape — in the SAME commit.
//
// Only fresh-state keys are pinned: a field that appears mid-run is optional
// by construction (an old snapshot thaws without it either way), so this
// guards exactly the dangerous class — required fields initialized at
// creation, which a thawed older snapshot alone would lack.
describe(`saved run — save format v${SAVE_VERSION} shape guard`, () => {
  const state = createGame(1, LEVEL_ID, DIFFICULTY);

  it("knows every field of a fresh GameState", () => {
    expect(Object.keys(state).sort()).toEqual([
      // THE STAFF LOT: the cars that have rolled in, the clock for the next
      // one, and the lot's own geometry (engine/game/arrivals.ts). All three
      // default cleanly on a thaw — a run parked before the beat shipped has an
      // entrance that was already open — so none of them cost a version bump.
      "arrivalPlan",
      "arrivalTimerMs",
      "arrivals",
      "asteroidTimerMs",
      "asteroids",
      "autopilot",
      "bagFullHintCooldownMs",
      "baits",
      // THE WALK TO THE WAGON (engine/game/boarding.ts) — `departure`'s rule
      // one beat earlier: additive, null on every tick but the beat's own, and
      // every reader tests it for truth, so an older snapshot thawing without
      // it behaves exactly as one that has it null. No version bump.
      "boarding",
      "bossCorpse",
      "bossDeath",
      // v28: THE CACHE — where the garage chest stands on this map, and how
      // deep a one this hero has earned (engine/game/cache.ts).
      "cachePos",
      "cacheSlots",
      "campAnchor",
      "campMs",
      "canopy",
      "capThoughtIdx",
      "capThoughtMs",
      "carvedLevel",
      "choice",
      "clearedLevels",
      "combatDps",
      "combatGraceMs",
      "combatKillRate",
      "companions",
      // Fallen party members' bodies. Additive — a solo run never mints
      // one — so `loadSavedRun` defaults it instead of a version bump.
      "corpses",
      "craters",
      "critters",
      "cutscene",
      "cutsceneQueue",
      // WHAT THE RUN KNOWS THAT ITS SCENES DO NOT — the tags a prelude's
      // conditional dressing is matched against (`CutsceneProp.needs`).
      // Required and read on every scene the chain raises, so a blob without
      // it would hand the launch's house swap an undefined list.
      "cutsceneTags",
      // …and WHERE a running chain lets go: a prelude lands on the opening
      // monologue, a level's farewell on the epilogue and the splash. Required
      // because both look identical once the queue is empty.
      "cutsceneThen",
      "deathScene",
      "decor",
      // THE DRIVE-OUT scene (the hub's departure). Additive and null on every
      // tick but the beat's own — every reader tests it for truth, so a v25
      // snapshot thawing without it behaves exactly as one that has it null:
      // no version bump.
      "departure",
      "dialogue",
      "dialogueMuted",
      "difficulty",
      "doors",
      "earlyDropCursor",
      "earlyDropKills",
      "elevatorLockMs",
      "elevators",
      "enemies",
      "escorts",
      "events",
      "evoProof",
      "evoRatchetMs",
      "explored",
      "freeze",
      "fxRng",
      "gates",
      "goldRng",
      "hayBallTimerMs",
      "hayBalls",
      "introPage",
      "items",
      "keepsakes",
      "lairs",
      "landmarks",
      "lastMenaceAttack",
      "level",
      "levelUpFxMs",
      "mapMarkers",
      "martyrTimerMs",
      "martyrsArmed",
      "menace",
      "menaceExemptDamage",
      "menaceExemptKills",
      "menaceFloor",
      "merchant",
      "minionEquipmentDrops",
      "minionKillRate",
      "minionSpawnRate",
      "mobSpawns",
      "moveSpawnCredit",
      "nextId",
      "nukeCalmMs",
      "nukeRecoverMs",
      "obstacles",
      "obstaclesVersion",
      "outroPage",
      "packs",
      "pathIndex",
      "pendingCritBlobs",
      "pendingMinionKills",
      "pendingMinionSpawns",
      "pendingProcs",
      "pendingReflects",
      "phase",
      "playerSpawn",
      "players",
      "projectiles",
      "quakeMs",
      "questFlags",
      "questGivers",
      "questOffer",
      "questRewards",
      "quests",
      "respecPending",
      "rng",
      "sandstormTimerMs",
      "sandstorms",
      // THE SCENE-END RELAY (`sceneEnded` events queued across a command's
      // tick boundary — story.ts). Defaults cleanly on a thaw (every reader
      // guards with `?.`/`??=`, and a parked run is never mid-prelude anyway),
      // so no version bump.
      "scenesEnded",
      "scorches",
      "spawners",
      "staminaEmptyMs",
      "staminaRegenLockMs",
      "stampedeRumbleMs",
      "stampedeTimerMs",
      "stampedeWarn",
      "stampedes",
      "stats",
      "staying",
      "storyItems",
      "talk",
      "thoughtsSeen",
      "trickleMs",
      "vehicles",
      "victoryCountdownMs",
      "waveSpawned",
      "wells",
      "wheelDebris",
    ]);
  });

  it("knows every field of a fresh hero", () => {
    expect(Object.keys(state.players[0] as object).sort()).toEqual([
      "abilities",
      // v24: the ammunition pouch — the field whose missing bump shipped the
      // frozen-resume bug this guard exists to prevent.
      "ammo",
      // v28: the CACHE's cells — the chest's contents, private like the bag
      // and riding the loadout with it.
      "cache",
      "cleanSlates",
      "coins",
      "disarmed",
      "equipment",
      "faceLeft",
      "facing",
      "heldAbilities",
      "hp",
      "hurtFlashMs",
      "inventory",
      "itemSpells",
      // The hero's OWN frag count, for the party scoreboard — arithmetic on
      // every kill, so `loadSavedRun` defaults it to 0 rather than paying a
      // SAVE_VERSION bump that would bin every parked run over a number that
      // starts at zero anyway (the `steer` precedent).
      "kills",
      "knockMs",
      "knockVel",
      "knockoutMs",
      "level",
      "maxHp",
      "maxStamina",
      "medkits",
      "moving",
      "pendingStatPoints",
      // v26: the per-player screens split — the talent queue moved
      // onto the hero (`screen`/`companionFocus` are optional and absent here).
      "pendingTalentPoints",
      "pos",
      "repairKits",
      "spentStats",
      "stamina",
      "staminaPotions",
      "stats",
      "talents",
      "vault",
      "vel",
      "vz",
      "weaponCooldownMs",
      "xp",
      "xpToNext",
      "z",
    ]);
  });

  it("knows every field of the stats record", () => {
    expect(Object.keys(state.stats).sort()).toEqual([
      "coinsSold",
      "combatMs",
      "damageDealt",
      "damageTaken",
      "goldCollected",
      "itemsCollected",
      "jumps",
      "kills",
      "peakMenace",
      "shotsFired",
      "timeMs",
      "totalEnemies",
      "xpGained",
      "xpLost",
    ]);
  });
});

describe("a run parked while the DRIVE was up", () => {
  /**
   * A garage run at the instant the road took over: the car has left the
   * property, the dim has run out and `carDeparted` has already fired, so the
   * app has raised the drive over the still-frozen run. Killing the app from
   * the switcher (which is the ordinary way out of an iOS home-screen PWA) is
   * what parks exactly this.
   *
   * The two fields are set rather than driven to. What a REAL drive-out leaves
   * on the state is `tests/engine/drive_out_test.ts`'s subject — it pins that
   * touching the tarmac latches `car.departed`, opens the dim, and books the
   * trip once at `DEPARTURE.durationMs` — so re-driving it here would test that
   * suite's rules again instead of this one's.
   */
  const departedRun = () => {
    const state = startGame(3, "garage");
    const car = state.vehicles.find((v) => v.kind === "car");
    if (!car || car.kind !== "car") throw new Error("no car in the bay");
    car.departed = true;
    state.departure = {
      ms: DEPARTURE.durationMs,
      to: "goodco_hq",
      booked: true,
    };
    return {
      characterId: "hero-1",
      difficulty: "medium" as Difficulty,
      levelId: "garage",
      state,
    };
  };

  it("thaws with the trip UN-BOOKED, and the dim's clock left where it was", () => {
    // The latch is the whole bug: `booked` is what stops `stepDeparture` from
    // ever pushing `carDeparted` a second time, and the road that caught the
    // first one lived only in React memory. Thawed as parked, the run is a hub
    // the car has already driven out of, under a curtain the app paints at full
    // black off `departure.ms` — no HUD, no pause menu, and CONTINUE leading
    // there every launch.
    saveRun(departedRun());

    const thawed = loadSavedRun();
    expect(thawed?.state.departure?.booked).toBe(false);
    expect(thawed?.state.departure?.to).toBe("goodco_hq");
    // `ms` is deliberately NOT rewound. It is what the app dims against, so a
    // resume that reset it would fade UP from the garage the hero left before
    // fading back out of it; left past the end, the resumed run opens already
    // black and the road is the first thing the player sees.
    expect(thawed?.state.departure?.ms).toBe(DEPARTURE.durationMs);
  });

  it("books the trip again on its first step, so the road opens on its title card", () => {
    // The other half of the repair, and the half that makes the resume worth
    // anything: the app answers `carDeparted` exactly as it did a minute ago
    // (`beginDrive` → `DriveScreen`, which always opens on `DriveIntro`), so
    // the leg is replayed from the top rather than lost.
    saveRun(departedRun());
    const state = loadSavedRun()!.state;

    step(state, idle, DT);
    const departures = state.events.filter((e) => e.type === "carDeparted");
    expect(departures).toHaveLength(1);
    expect(departures[0]).toMatchObject({ to: "goodco_hq" });
    expect(state.departure?.booked).toBe(true);
  });

  it("leaves an ordinary parked run's departure alone", () => {
    // Nothing to heal on the runs that are the overwhelming majority: a hero
    // parked mid-level has never been near the car, and a departure caught
    // mid-dim is parked UNBOOKED and simply finishes its own clock.
    const state = createGame(1, LEVEL_ID, DIFFICULTY);
    saveRun({
      characterId: "hero-1",
      difficulty: DIFFICULTY,
      levelId: LEVEL_ID,
      state,
    });
    expect(loadSavedRun()?.state.departure).toBeNull();
  });
});

describe("the town portal's parked field — a second slot, not the same one", () => {
  const field = (levelId: string) => ({
    characterId: "hero-1",
    difficulty: "medium" as Difficulty,
    levelId,
    state: createGame(7, levelId, "medium"),
  });

  it("does not collide with the run parked by the menu", () => {
    // The two exist AT ONCE and that is the whole point: stepping home through
    // a tear leaves a field standing, and the hub run that follows immediately
    // claims `current-run` for itself. One key each, or the trip home eats the
    // very thing it was supposed to preserve.
    saveRiftRun(field("mars"));
    saveRun(field("garage"));

    expect(loadRiftRun()?.levelId).toBe("mars");
    expect(loadSavedRun()?.levelId).toBe("garage");
  });

  it("keeps the field when the hub run is dropped", () => {
    // Quitting the garage to the menu must not throw away the planet waiting
    // on the other side of the seam.
    saveRiftRun(field("mars"));
    saveRun(field("garage"));
    clearSavedRun();

    expect(loadSavedRun()).toBeNull();
    expect(loadRiftRun()?.levelId).toBe("mars");
  });

  it("is spent by the return", () => {
    saveRiftRun(field("the_rift"));
    expect(loadRiftRun()).not.toBeNull();
    clearRiftRun();
    expect(loadRiftRun()).toBeNull();
  });

  it("thaws the field it froze, fog and all", () => {
    // The same freezer, so the same guarantee the menu's resume relies on:
    // `explored` comes back a real typed array rather than the plain object
    // `JSON.stringify` makes of it.
    const parked = field("the_rift");
    parked.state.explored[3] = 1;
    saveRiftRun(parked);

    const thawed = loadRiftRun();
    expect(thawed?.levelId).toBe("the_rift");
    expect(thawed?.state.explored).toBeInstanceOf(Uint8Array);
    expect(thawed?.state.explored[3]).toBe(1);
  });

  it("names the hero and the rung it belongs to, so another campaign can refuse it", () => {
    // GameScreen checks both before offering the row: a field parked by one
    // hero on medium is not a road the next hero may step onto.
    saveRiftRun(field("mars"));
    const thawed = loadRiftRun();
    expect(thawed?.characterId).toBe("hero-1");
    expect(thawed?.difficulty).toBe("medium");
  });
});
