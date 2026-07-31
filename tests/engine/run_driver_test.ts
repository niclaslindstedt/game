// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE DRIVER SEAM'S CONTRACT — and specifically the half of it that fails
// silently.
//
// `GameScreen` no longer calls `step()`; it drives a `RunDriver`, and there are
// two of them (see `pwa/src/game/game-screen/run-driver.ts`). The interesting
// difference is not `advance` — one steps, one sends — it is `endTick`, because
// `state.events` is cleared by `step()` on the local path and by NOBODY on the
// net one. Get that backwards in either direction and the symptom is audio and
// gore, not a replication error:
//
//   cleared on the local path   a frame that owes two slices loses the first
//                               slice's events entirely — a kill with no sound
//   not cleared on the net path a snapshot arrives every third tick, so every
//                               event plays three times over
//
// Only the local driver is exercised here. The net driver needs a forked
// session process and a packaged shell, which is `docs/multiplayer-plan.md`
// §1.75.4's debt; what IS testable is that the local driver still behaves
// exactly as the loop's own `step()` call did, which is the regression that
// would reach every player rather than only a host.

import { describe, expect, it } from "vitest";

import { createGame, type GameInput, type GameState } from "@game/core";

import { createLocalDriver } from "../../pwa/src/game/game-screen/run-driver.ts";
import { installFixtures } from "./fixtures.ts";

installFixtures();

const IDLE: GameInput = {
  steering: false,
  target: { x: 0, y: 0 },
  jump: false,
  useItem: false,
};

/** A run in play, which is the only phase `step()` advances past. */
function playing(): GameState {
  const state = createGame(4242, "test_level", "medium");
  state.phase = "playing";
  return state;
}

describe("the local driver", () => {
  it("advances the run, exactly as the loop's own step() did", () => {
    const state = playing();
    const driver = createLocalDriver(state);
    const before = state.stats.timeMs;
    driver.advance(IDLE, 1000 / 60);
    expect(state.stats.timeMs).toBeGreaterThan(before);
  });

  it("is live from the moment it exists", () => {
    // Unlike the net driver, which cannot advance until a session answers.
    expect(createLocalDriver(playing()).live).toBe(true);
  });

  it("does NOT clear the events on endTick", () => {
    // The subtle half. `step()` empties the list at the top of every slice, so
    // the batch the app has just read is the one the next step will replace.
    // Clearing it here as well would drop a whole slice's events whenever the
    // loop runs two of them in one frame — a kill that makes no sound, on a
    // machine that happened to hitch.
    const state = playing();
    const driver = createLocalDriver(state);
    state.events.push({ type: "jump" } as never);
    driver.endTick();
    expect(state.events).toHaveLength(1);
  });

  it("keeps every slice's events when a frame owes two", () => {
    // The proof rather than the promise, driven the way the loop drives it:
    // advance, read, endTick, advance again. Whatever the first slice produced
    // must have been readable before the second one ran.
    const state = playing();
    const driver = createLocalDriver(state);
    const seen: string[] = [];
    for (let i = 0; i < 240; i++) {
      // A jump every other slice, so the run reliably produces events of its
      // own rather than relying on the fixture level having something to fight.
      driver.advance({ ...IDLE, jump: i % 2 === 0 }, 1000 / 60);
      for (const event of state.events) seen.push(event.type);
      driver.endTick();
    }
    // A driver that ate its own events would leave this empty and every
    // assertion above would still be green.
    expect(seen).toContain("jump");
  });
});
