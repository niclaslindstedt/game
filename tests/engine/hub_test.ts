// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The HUB rules — the home base a run can idle in forever. The `hub`
// objective never clears (no victory, no outro, no bank), the merchant is
// PARKED at his authored counter and revealed from the first tick with no
// scene, and a standing travel door is a landmark the app can find. The
// engine's half of the garage; the shipped venue's own checks live in
// tests/content/garage_test.ts.

import { describe, expect, it } from "vitest";

import { createGame, runLevelDef, type GameState } from "@game/core";
import { idle, run, startGame } from "./helpers.ts";

const startHub = (seed = 42): GameState => startGame(seed, "test_hub_level");

describe("the hub objective", () => {
  it("never clears — an empty field raises no victory and no countdown", () => {
    const state = startHub();
    // Nothing hostile stands in a hub, which is exactly the state that would
    // read as "cleared" to killBoss (no boss on the board) — the trap the
    // explicit hub branch exists for.
    expect(state.enemies.filter((e) => e.hp > 0)).toHaveLength(0);
    run(state, idle, 600); // ten seconds of standing around
    expect(state.phase).toBe("playing");
    expect(state.victoryCountdownMs).toBeNull();
    expect(state.events.some((e) => e.type === "victory")).toBe(false);
  });

  it("declares its doors: travelDoors name real destinations and a landmark to stand at", () => {
    const state = startHub();
    const level = runLevelDef(state);
    const doors = level.travelDoors ?? [];
    expect(doors.length).toBeGreaterThan(0);
    for (const door of doors) {
      expect(door.to.length).toBeGreaterThan(0);
      // The door STANDS somewhere: a landmark carries its id, which is what
      // the app hit-tests (the merchant-stall pattern).
      const landmark = state.landmarks.find((l) => l.kind === door.id);
      expect(landmark).toBeDefined();
    }
  });
});

describe("the parked merchant", () => {
  it("is revealed at his counter from the first tick, scene-free", () => {
    const state = startHub();
    expect(state.merchant.discovered).toBe(true);
    expect(state.merchant.stock.length).toBeGreaterThan(0);
    // At the AUTHORED counter — not dragged to the hero's spawn the way a
    // met-before wanderer is.
    const counter = runLevelDef(state).merchantSpawns?.[0];
    expect(state.merchant.pos).toEqual(counter);
    // No meeting scene, and the map pin is already planted.
    expect(state.phase).toBe("playing");
    expect(state.mapMarkers.some((m) => m.kind === "merchant")).toBe(true);
  });

  it("never wanders, and greets nobody on approach", () => {
    const state = startHub();
    const post = { ...state.merchant.pos };
    // Walk the hero right up to the counter and let time pass.
    state.players[0].pos = { x: post.x + 20, y: post.y };
    run(state, idle, 300);
    expect(state.merchant.pos).toEqual(post);
    expect(state.merchant.moving).toBe(false);
    // No "welcome back" toll booth — the hub is re-entered constantly.
    expect(state.phase).toBe("playing");
  });

  it("keeps his counter post on a met-before restart", () => {
    // merchantDiscovered = the persisted met-here-before flag: a wanderer is
    // set up AT THE DOOR on such a run, but a parked trader's post IS the
    // counter, wherever the hero spawns.
    const state = createGame(
      42,
      "test_hub_level",
      "medium",
      undefined,
      false,
      [],
      true,
    );
    const counter = runLevelDef(state).merchantSpawns?.[0];
    expect(state.merchant.pos).toEqual(counter);
    expect(state.merchant.discovered).toBe(true);
  });
});
