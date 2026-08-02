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

import { createGame, LEVEL_ORDER, mapCols, mapRows } from "@game/core";
import type { Difficulty } from "@game/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  clearSavedRun,
  loadSavedRun,
  SAVE_VERSION,
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
    const keys = Array.from({ length: localStorage.length }, (_, i) =>
      localStorage.key(i),
    );
    const key = keys.find((k) => k?.includes("current-run")) as string;
    const blob = JSON.parse(localStorage.getItem(key) as string) as {
      v: number;
    };
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
      "asteroidTimerMs",
      "asteroids",
      "autopilot",
      "bagFullHintCooldownMs",
      "baits",
      "bossCorpse",
      "bossDeath",
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
      "lairs",
      "landmarks",
      "lastMenaceAttack",
      "level",
      "levelUpFxMs",
      "mapMarkers",
      "menace",
      "menaceExemptDamage",
      "menaceExemptKills",
      "menaceFloor",
      "merchant",
      "minionEquipmentDrops",
      "minionKillRate",
      "minionSpawnRate",
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
