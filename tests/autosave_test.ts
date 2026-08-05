// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The checkpoint autosave (pwa `game-screen/autosave.ts`): the cadence that
// parks a live run to storage while it is being played.
//
// What is actually being guarded here is a phone's kill -9. An iOS home-screen
// PWA swiped out of the app switcher runs NO unload handler, so the only saves
// that exist are the ones already written — which is why the run must be parked
// from its first live tick, re-parked as progress is made, and written
// unconditionally the moment the app is backgrounded (the last code the page is
// guaranteed to run). The counter-rule matters just as much: a resolved run
// must NOT stay parked, or CONTINUE drops the player back into a death scene
// they already paid for.

import { createGame, LEVEL_ORDER } from "@game/core";
import type { Difficulty, GameEvent, GameState } from "@game/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAutosave } from "../pwa/src/game/game-screen/autosave.ts";
import type { Character } from "../pwa/src/game/characters.ts";
import { clearSavedRun, loadSavedRun } from "../pwa/src/game/saved-run.ts";

const LEVEL_ID = LEVEL_ORDER[0] as string;
const DIFFICULTY: Difficulty = "medium";
/** Matches PROGRESS_SAVE_MS / BEAT_SAVE_MS in autosave.ts. */
const PROGRESS_SAVE_MS = 5_000;
const BEAT_SAVE_MS = 1_000;

class MemoryStorage {
  private store = new Map<string, string>();
  writes = 0;
  get length(): number {
    return this.store.size;
  }
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.writes++;
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

let storage: MemoryStorage;
let now = 0;
/** The window/document listeners the autosave registered, by event name. */
let listeners: Map<string, Set<() => void>>;

function fire(event: string): void {
  for (const listener of listeners.get(event) ?? []) listener();
}

beforeEach(() => {
  storage = new MemoryStorage();
  listeners = new Map();
  now = 0;
  const target = {
    addEventListener(type: string, listener: () => void) {
      const set = listeners.get(type) ?? new Set();
      set.add(listener);
      listeners.set(type, set);
    },
    removeEventListener(type: string, listener: () => void) {
      listeners.get(type)?.delete(listener);
    },
  };
  const globals = globalThis as Record<string, unknown>;
  globals.localStorage = storage;
  globals.window = target;
  globals.document = { ...target, visibilityState: "visible" };
  vi.spyOn(performance, "now").mockImplementation(() => now);
});

afterEach(() => {
  vi.restoreAllMocks();
  const globals = globalThis as Record<string, unknown>;
  delete globals.localStorage;
  delete globals.window;
  delete globals.document;
});

/** A run in the player's hands, and the hero ref the autosave saves under. */
function liveRun(): {
  state: GameState;
  characterRef: { current: Character };
} {
  const state = createGame(1, LEVEL_ID, DIFFICULTY);
  state.phase = "playing";
  return {
    state,
    characterRef: { current: { id: "char-1" } as Character },
  };
}

function armed() {
  const run = liveRun();
  const autosave = createAutosave({ ...run, enabled: true });
  return { ...run, autosave };
}

describe("checkpoint autosave — parking a run that is still being played", () => {
  it("parks the run on its first live tick, before any progress is made", () => {
    const { state, autosave } = armed();
    autosave.tick(state);

    const parked = loadSavedRun();
    expect(parked).not.toBeNull();
    expect(parked?.characterId).toBe("char-1");
    expect(parked?.levelId).toBe(LEVEL_ID);
  });

  it("writes nothing while the run stands still, however long it stands", () => {
    const { state, autosave } = armed();
    autosave.tick(state);
    const after = storage.writes;

    for (let i = 0; i < 600; i++) {
      now += 100; // ten minutes of ticks, no kills, no loot, no XP
      autosave.tick(state);
    }
    expect(storage.writes).toBe(after);
  });

  it("re-parks after progress — but coalesced, not once per kill", () => {
    const { state, autosave } = armed();
    autosave.tick(state);
    const after = storage.writes;

    // A busy fight: a kill every 100 ms for four seconds. All of it has to
    // land in ONE write — the whole point of the coalescing.
    for (let i = 0; i < 40; i++) {
      now += 100;
      state.stats.kills++;
      autosave.tick(state);
    }
    expect(storage.writes).toBe(after);

    now += PROGRESS_SAVE_MS;
    autosave.tick(state);
    expect(storage.writes).toBe(after + 1);
    expect(loadSavedRun()?.state.stats.kills).toBe(40);
  });

  it("holds a BEAT to its own short floor rather than the long one", () => {
    const { state, autosave } = armed();
    autosave.tick(state);
    const after = storage.writes;

    // A ding is worth a save of its own — but not instantly, or a nuke that
    // dings twice and drops ten items would write a dozen times in a second.
    state.players[0].level++;
    autosave.onEvent({ type: "levelUp", level: 2 } as GameEvent);
    now += BEAT_SAVE_MS / 2;
    autosave.tick(state);
    expect(storage.writes).toBe(after);

    now += BEAT_SAVE_MS;
    autosave.tick(state);
    expect(storage.writes).toBe(after + 1);
    expect(loadSavedRun()?.state.players[0].level).toBe(2);
  });
});

describe("checkpoint autosave — the backgrounding save", () => {
  it("parks the run the instant the app is hidden, whatever the clocks say", () => {
    const { state, autosave } = armed();
    autosave.tick(state);
    const after = storage.writes;

    state.stats.kills += 3;
    now += 200; // nowhere near the ordinary cadence
    (
      globalThis as unknown as { document: { visibilityState: string } }
    ).document.visibilityState = "hidden";
    fire("visibilitychange");

    expect(storage.writes).toBe(after + 1);
    expect(loadSavedRun()?.state.stats.kills).toBe(3);
  });

  it("ignores a visibilitychange that reports the page VISIBLE", () => {
    const { state, autosave } = armed();
    autosave.tick(state);
    const after = storage.writes;

    state.stats.kills += 3;
    fire("visibilitychange"); // still "visible" — a tab coming back
    expect(storage.writes).toBe(after);
  });

  it("parks on `pagehide` too — a tab navigated away or discarded", () => {
    const { state, autosave } = armed();
    autosave.tick(state);
    const after = storage.writes;

    state.stats.kills += 3;
    fire("pagehide");
    expect(storage.writes).toBe(after + 1);
  });

  it("stops listening once the run is disposed", () => {
    const { state, autosave } = armed();
    autosave.tick(state);
    autosave.dispose();
    const after = storage.writes;

    state.stats.kills += 3;
    fire("pagehide");
    expect(storage.writes).toBe(after);
  });
});

describe("checkpoint autosave — a resolved run is not parked", () => {
  it("drops the parked run when the hero falls, not a beat later", () => {
    const { state, autosave } = armed();
    autosave.tick(state);
    expect(loadSavedRun()).not.toBeNull();

    autosave.onEvent({ type: "playerDeath", pos: { x: 0, y: 0 } } as GameEvent);
    expect(loadSavedRun()).toBeNull();

    // …and the death scene that follows must not put it back.
    state.phase = "dying";
    now += PROGRESS_SAVE_MS * 4;
    autosave.tick(state);
    state.phase = "defeat";
    autosave.tick(state);
    expect(loadSavedRun()).toBeNull();
  });

  it("drops the parked run on a victory, and re-parks if the player STAYS", () => {
    const { state, autosave } = armed();
    autosave.tick(state);

    autosave.onEvent({ type: "victory" } as GameEvent);
    expect(loadSavedRun()).toBeNull();

    state.phase = "victory";
    now += PROGRESS_SAVE_MS * 2;
    autosave.tick(state);
    expect(loadSavedRun()).toBeNull();

    // STAY: the splash closes, the field is live again, and the farming that
    // follows is worth keeping like any other progress.
    state.phase = "playing";
    state.stats.kills += 5;
    now += PROGRESS_SAVE_MS;
    autosave.tick(state);
    expect(loadSavedRun()?.state.stats.kills).toBe(5);
  });

  it("parks nothing before the run is in the player's hands", () => {
    const { state, autosave } = armed();
    state.phase = "cutscene";
    autosave.tick(state);
    now += PROGRESS_SAVE_MS * 2;
    autosave.tick(state);
    expect(loadSavedRun()).toBeNull();
  });
});

describe("checkpoint autosave — runs that are not the player's own", () => {
  it("writes nothing at all when disabled (the demo, BOT VIEW, a joined run)", () => {
    const run = liveRun();
    const autosave = createAutosave({ ...run, enabled: false });

    autosave.tick(run.state);
    run.state.stats.kills += 10;
    now += PROGRESS_SAVE_MS * 3;
    autosave.tick(run.state);
    autosave.flush(run.state);
    fire("pagehide");

    expect(storage.writes).toBe(0);
    expect(loadSavedRun()).toBeNull();
    autosave.dispose();
  });
});

afterEach(() => clearSavedRun());
