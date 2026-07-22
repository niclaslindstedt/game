// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Parking and thawing an in-progress run (pwa `saved-run.ts`). The load
// path must rebuild the fog grid as a real `Uint8Array`: `JSON.stringify` turns
// the typed array into a plain object, and a thawed run whose `explored` stays
// a plain object has no `.length`, which freezes the fog renderers so the map
// never clears after a resume (the bug this guards).

import { createGame, LEVEL_ORDER, mapCols, mapRows } from "@game/core";
import type { Difficulty } from "@game/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  clearSavedRun,
  loadSavedRun,
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
