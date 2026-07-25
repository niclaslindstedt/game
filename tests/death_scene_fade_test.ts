// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The DEATH SCENE's presentation rules (pwa/src/game/render/death.ts).
//
// The combat-noise rules first: the fight's floating damage/crit/XP numbers,
// the shots frozen in flight, and the horde's health bars must be OFF the
// screen a few frames after the hero falls, so the tableau plays clean. What
// matters here: the fade is neutral in play, starts full at the instant of the
// fall, reaches 0 within the documented window and stays there through the
// defeat splash — and the effect layer's own clock keeps running on the scene
// timer after the sim clock stops, so a number caught mid-pop expires instead
// of being held for the whole eight seconds.
//
// Then the camera PUSH-IN: it must be exactly neutral in ordinary play (the
// render loop skips the transform entirely at 1), creep in one direction only
// across the scene, and hold at full behind the YOU DIED modal.

import { describe, expect, it } from "vitest";

import type { GameState } from "@game/core";

import {
  COMBAT_NOISE_FADE_MS,
  combatNoiseFade,
  deathZoom,
  effectsClockMs,
} from "../pwa/src/game/render/death.ts";

/** A run in the `dying` phase `sceneMs` into the tableau. Only the phase, the
 * scene clock, and the (frozen) sim clock matter to these rules. */
function dying(sceneMs: number, timeMs = 60_000): GameState {
  return {
    phase: "dying",
    stats: { timeMs },
    deathScene: {
      ms: sceneMs,
      center: { x: 0, y: 0 },
      xpLost: 0,
      spawnCooldownMs: 0,
      skip: false,
    },
  } as unknown as GameState;
}

function playing(timeMs = 60_000): GameState {
  return {
    phase: "playing",
    stats: { timeMs },
    deathScene: null,
  } as unknown as GameState;
}

describe("combatNoiseFade", () => {
  it("leaves the fight's feedback at full strength while playing", () => {
    expect(combatNoiseFade(playing())).toBe(1);
  });

  it("starts full at the instant of the fall", () => {
    // The frame the hero drops still shows the killing blow's own number — it
    // is the fade FROM there that clears the screen.
    expect(combatNoiseFade(dying(0))).toBe(1);
  });

  it("clears the screen within its window and never comes back", () => {
    expect(combatNoiseFade(dying(COMBAT_NOISE_FADE_MS / 2))).toBeCloseTo(
      0.5,
      6,
    );
    expect(combatNoiseFade(dying(COMBAT_NOISE_FADE_MS))).toBe(0);
    // Held out for the rest of the tableau (a scene runs seconds longer)…
    expect(combatNoiseFade(dying(8000))).toBe(0);
    // …and on through the defeat splash behind the modal, where the scene is
    // gone (`deathScene` nulled) and the phase is the only tell.
    expect(
      combatNoiseFade({
        phase: "defeat",
        stats: { timeMs: 60_000 },
        deathScene: null,
      } as unknown as GameState),
    ).toBe(0);
  });

  it("eases out monotonically — nothing flickers back into view", () => {
    let last = combatNoiseFade(dying(0));
    for (let ms = 0; ms <= COMBAT_NOISE_FADE_MS + 200; ms += 16) {
      const fade = combatNoiseFade(dying(ms));
      expect(fade).toBeLessThanOrEqual(last + 1e-9);
      expect(fade).toBeGreaterThanOrEqual(0);
      last = fade;
    }
    expect(last).toBe(0);
  });

  it("is gone well inside a fraction of a second", () => {
    // The whole point is that the numbers get out of the way "directly" — a
    // window measured in a handful of frames, not a beat of the scene.
    expect(COMBAT_NOISE_FADE_MS).toBeLessThanOrEqual(500);
  });
});

describe("effectsClockMs", () => {
  it("is the plain sim clock in ordinary play", () => {
    expect(effectsClockMs(playing(1234))).toBe(1234);
  });

  it("carries on over the death scene while the sim clock is frozen", () => {
    // The sim clock stops the moment the run leaves `playing`, so without the
    // scene's own clock every live effect would hang at the frame of the fall.
    expect(effectsClockMs(dying(0, 60_000))).toBe(60_000);
    expect(effectsClockMs(dying(500, 60_000))).toBe(60_500);
    expect(effectsClockMs(dying(8000, 60_000))).toBe(68_000);
  });

  it("outruns a damage number's lifetime, so it expires instead of freezing", () => {
    // A crit thrown on the killing blow (a ~650ms float) has lapsed a beat into
    // the scene — `expireEffects` filters on this clock, so the layer drains.
    const spawnedAt = 60_000;
    const untilMs = spawnedAt + 650;
    expect(effectsClockMs(dying(0, spawnedAt))).toBeLessThan(untilMs);
    expect(effectsClockMs(dying(1000, spawnedAt))).toBeGreaterThan(untilMs);
  });
});

describe("deathZoom", () => {
  it("is exactly neutral in ordinary play", () => {
    // Not "about 1": the render loop compares against 1 to decide whether to
    // touch the canvas transform at all, so a hair over would scale every
    // ordinary frame of the game.
    expect(deathZoom(playing())).toBe(1);
  });

  it("starts from a dead stop on the frame the hero falls", () => {
    // The collapse itself must read at the zoom the fight was played at — the
    // camera leans in AFTER the body lands, not through the landing.
    expect(deathZoom(dying(0))).toBe(1);
  });

  it("creeps in one direction only, all the way to the modal", () => {
    let last = deathZoom(dying(0));
    for (let ms = 0; ms <= 8000; ms += 16) {
      const zoom = deathZoom(dying(ms));
      expect(zoom).toBeGreaterThanOrEqual(last - 1e-9);
      last = zoom;
    }
    // Closed in by a real, readable amount — but never so far that the ring of
    // mourners is pushed off the screen edges.
    expect(last).toBeGreaterThan(1.2);
    expect(last).toBeLessThanOrEqual(1.6);
  });

  it("holds at full behind the defeat splash", () => {
    // The scene is gone (`deathScene` nulled) once the modal is up; the camera
    // must stay where it crawled to rather than snapping back out.
    const held = deathZoom({
      phase: "defeat",
      stats: { timeMs: 60_000 },
      deathScene: null,
    } as unknown as GameState);
    expect(held).toBeCloseTo(deathZoom(dying(8000)), 6);
  });
});
