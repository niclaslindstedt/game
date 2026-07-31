// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE TRAIL HE LEAVES (pwa/src/game/render/blood-tracks.ts) — bloody boot prints
// tracked out of a pool and across clean ground.
//
// The draw is a canvas pass and is not tested here; what is pinned is the RULE
// the trail rests on. A print belongs to a footfall, so it is spent by GROUND
// COVERED rather than by a clock; the boot carries a finite amount, so the trail
// always runs out and always ends; and the record is bounded by the MAP rather
// than by how long the player walks, because a print stays for the rest of the
// level exactly as the floor's blood does.

import { beforeEach, describe, expect, it } from "vitest";

import {
  resetHeroSoak,
  heroSoak,
} from "../pwa/src/game/game-screen/hero-soak.ts";
import {
  bloodAt,
  resetBloodGround,
  spillBlood,
} from "../pwa/src/game/render/blood-ground.ts";
import {
  bloodPrintCount,
  resetBloodTracks,
  stepBloodTracks,
} from "../pwa/src/game/render/blood-tracks.ts";
import { updateSettings } from "../pwa/src/game/settings.ts";
import { startGame } from "./helpers.ts";
import { ALL_GORE_ON } from "./gore-settings.ts";

/** How far apart two frames put him, in world px. Under the tracker's teleport
 * threshold, so every one of these is a stride rather than a warp. */
const STRIDE = 8;

/** A run with a pool of blood soaked into the floor at his feet. */
function fresh() {
  resetBloodGround();
  resetBloodTracks();
  resetHeroSoak();
  updateSettings({ ...ALL_GORE_ON, blood: 1 });
  const state = startGame();
  state.players[0].pos = { x: 400, y: 400 };
  // One frame to adopt the run — the tracker measures every step from the last
  // call, so its first is always a standstill.
  stepBloodTracks(state);
  return state;
}

/** Soak the floor through, in a wide patch centred on him. */
function pool(state: ReturnType<typeof fresh>) {
  for (let i = 0; i < 6; i++) {
    spillBlood(state, [
      {
        x: state.players[0].pos.x,
        y: state.players[0].pos.y,
        radius: 40,
        amount: 1,
      },
    ]);
  }
}

/** Walk him `steps` strides east, stepping the tracker each frame. */
function walk(state: ReturnType<typeof fresh>, steps: number) {
  for (let i = 0; i < steps; i++) {
    state.players[0].pos = {
      x: state.players[0].pos.x + STRIDE,
      y: state.players[0].pos.y,
    };
    state.stats.timeMs += 100;
    stepBloodTracks(state);
  }
}

beforeEach(() => {
  updateSettings({ ...ALL_GORE_ON, blood: 1 });
});

describe("stepBloodTracks", () => {
  it("lays nothing on ground nothing has died on", () => {
    walk(fresh(), 30);
    expect(bloodPrintCount()).toBe(0);
  });

  it("tracks a pool out onto clean ground", () => {
    const state = fresh();
    pool(state);
    expect(
      bloodAt(state.players[0].pos.x, state.players[0].pos.y),
    ).toBeGreaterThan(0);
    walk(state, 30);
    expect(bloodPrintCount()).toBeGreaterThan(0);
  });

  it("runs out — the boot carries a finite amount", () => {
    // The whole reason the carry is a quantity rather than a timer: the trail
    // has to END, a few tiles out, wherever he happens to be.
    const state = fresh();
    pool(state);
    walk(state, 20);
    const short = bloodPrintCount();
    walk(state, 200);
    expect(bloodPrintCount()).toBe(short);
  });

  it("tops the carry back up when he crosses blood again", () => {
    const state = fresh();
    pool(state);
    walk(state, 200);
    const first = bloodPrintCount();
    pool(state);
    walk(state, 40);
    expect(bloodPrintCount()).toBeGreaterThan(first);
  });

  it("spends prints on GROUND COVERED, not on the clock", () => {
    // A hero shoved up against a wall stops printing on the spot, for free.
    const state = fresh();
    pool(state);
    for (let i = 0; i < 300; i++) {
      state.stats.timeMs += 100;
      stepBloodTracks(state);
    }
    expect(bloodPrintCount()).toBe(0);
  });

  it("bounds the record by the MAP, not by how far he walks", () => {
    // A print is permanent, so it cannot be a list that grows with the walking:
    // pacing one corridor for ever must not grow the record for ever.
    const state = fresh();
    let last = 0;
    for (let lap = 0; lap < 12; lap++) {
      pool(state);
      state.players[0].pos = { x: 400, y: 400 };
      state.stats.timeMs += 100;
      stepBloodTracks(state);
      walk(state, 24);
      last = bloodPrintCount();
    }
    // Twelve passes over the same few tiles, and the store is still the size of
    // those tiles rather than of the twelve passes.
    expect(last).toBeLessThan(60);
  });

  it("lays nothing at all with BOOTPRINTS off", () => {
    const state = fresh();
    pool(state);
    updateSettings({ goreTracks: "off" });
    walk(state, 40);
    expect(bloodPrintCount()).toBe(0);
  });

  it("lays nothing at all with HUMAN GORE off either", () => {
    // The trail is blood art in blood's colours, so HUMAN GORE off takes it with
    // it whatever its own row says — which is why that row is shown LOCKED on the
    // GORE page rather than as a switch that has stopped doing anything.
    const state = fresh();
    pool(state);
    updateSettings({ goreBlood: "off", goreTracks: "on" });
    walk(state, 40);
    expect(bloodPrintCount()).toBe(0);
  });

  it("wets his boots off the floor as he walks", () => {
    // The trail's twin: the same reading of the floor under his feet that fills
    // the carry also soaks upward into him (game-screen/hero-soak.ts).
    const state = fresh();
    pool(state);
    walk(state, 30);
    const soak = heroSoak(state);
    expect(soak.feet).toBeGreaterThan(0);
    expect(soak.chest).toBe(0);
  });

  it("comes up clean on a new run", () => {
    const first = fresh();
    pool(first);
    walk(first, 30);
    expect(bloodPrintCount()).toBeGreaterThan(0);
    const second = startGame();
    second.players[0].pos = { x: 400, y: 400 };
    stepBloodTracks(second);
    expect(bloodPrintCount()).toBe(0);
  });
});
