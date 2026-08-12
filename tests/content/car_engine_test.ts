// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CAR IN THE BAY, AND THE ONE ON THE ROAD, ARE THE SAME ENGINE.
//
// The run's car and the driving minigame's wagon are one vehicle in the story
// and were two entirely unrelated noises in the mix — the road's a four-layer
// bed voiced off a real drivetrain, the bay's a triangle and a hiss with
// hand-picked frequencies. They share `sfx/engine-bed.ts` now, and this suite is
// what keeps them sharing it.
//
// HALF OF IT IS A DRIFT TEST, and that half is load-bearing. No module in the
// sound bank may import a value out of `@game/core` (`sfx/listener.ts`'s header
// has the reason), so three numbers that are really the ENGINE's are copied into
// the bank — the crank's idle, where the box lets go of it, and the cadence the
// simulation fires cues on. A copy nobody checks is a copy that goes stale
// silently: the note would simply be voiced against a band the car no longer
// has, with every other test still green.

import { describe, expect, it } from "vitest";

import { CAR, DRIVETRAIN } from "../../engine/index.ts";
import {
  CAR_GRAIN_MS,
  CAR_TOP_RPM,
  playCarEngine,
  resetCarEngine,
} from "../../pwa/src/game/sfx/car-engine.ts";
import {
  ENGINE_GRAIN_MS,
  IDLE_RPM,
  SHIFT_UP_RPM,
  noteHz,
} from "../../pwa/src/game/sfx/engine-bed.ts";
import { engineNote } from "../../pwa/src/game/drive-screen/engine-note.ts";
import type {
  NoiseOptions,
  Synth,
  ToneOptions,
} from "../../pwa/src/lib/synth.ts";

type Call =
  ({ call: "tone" } & ToneOptions) | ({ call: "noise" } & NoiseOptions);

/** A synth that plays nothing and remembers everything — the same stub the
 * sound catalog's own equivalence check uses. */
function recorder(): { synth: Synth; calls: Call[] } {
  const calls: Call[] = [];
  const synth = {
    tone: (o: ToneOptions) => void calls.push({ call: "tone", ...o }),
    noise: (o: NoiseOptions) => void calls.push({ call: "noise", ...o }),
  } as unknown as Synth;
  return { synth, calls };
}

/** One grain, from a clean bed. */
function grainAt(intensity: number): Call[] {
  resetCarEngine();
  const { synth, calls } = recorder();
  playCarEngine(synth, intensity);
  return calls;
}

const tones = (calls: Call[]) =>
  calls.filter((c): c is { call: "tone" } & ToneOptions => c.call === "tone");
const noises = (calls: Call[]) =>
  calls.filter(
    (c): c is { call: "noise" } & NoiseOptions => c.call === "noise",
  );
/** The HUM — the loudest, longest triangle, and the layer the note is read off. */
const hum = (calls: Call[]) =>
  tones(calls).find((t) => t.type === "triangle") as {
    call: "tone";
  } & ToneOptions;

describe("the engine bed's copies of the wagon's own numbers", () => {
  it("measures revs against the crank the drivetrain actually has", () => {
    // Both ends of the usable band. Drift here is silent and total: every
    // timbre decision in the bed — the octave's fade, the clatter's level, the
    // exhaust's edge — is a fraction of this span, so a band that no longer
    // matches the engine mis-voices the whole car at every speed.
    expect(IDLE_RPM).toBe(DRIVETRAIN.idleRpm);
    expect(SHIFT_UP_RPM).toBe(DRIVETRAIN.shiftUpRpm);
  });

  it("fires the bay's bed on the cadence the simulation actually cues", () => {
    // The bed scales every part of a grain to the cadence it is fired on, so a
    // copy that drifted from the cue would give the bay grains that either gap
    // (a putter) or pile up (a drone twice as loud as the mix expects).
    expect(CAR_GRAIN_MS).toBe(CAR.engineCueMs);
  });
});

describe("the run's car is the road's car", () => {
  it("plays the same four layers the road's bed does", () => {
    // Not "a sound" — the sound: a hum, its octave, a bass under them, the air
    // over the lot, and the clatter of the parts. The old bay had two of those.
    const calls = grainAt(1);
    expect(tones(calls).map((t) => t.type)).toEqual([
      "triangle",
      "triangle",
      "sine",
    ]);
    // The wind, plus at least one tick of the clatter.
    expect(noises(calls).length).toBeGreaterThanOrEqual(2);
    expect(
      noises(calls).filter((n) => n.filter?.type === "bandpass").length,
    ).toBeGreaterThan(0);
  });

  it("sits a good octave under the road, at every throttle", () => {
    // The whole of what the bay changes. The road's wagon runs its note from
    // idle to the shift point; a car being manoeuvred is in first and never
    // gets a third of the way up, so the same engine is heard loafing.
    const roadTop = engineNote(0).hz;
    for (const i of [0, 0.25, 0.5, 0.75, 1]) {
      const note = hum(grainAt(i)).from;
      expect(note).toBeGreaterThanOrEqual(noteHz(IDLE_RPM) - 1e-9);
      expect(note).toBeLessThanOrEqual(noteHz(CAR_TOP_RPM) + 1e-9);
    }
    // Idle is idle in both — it is the same engine standing still.
    expect(hum(grainAt(0)).from).toBeCloseTo(roadTop, 6);
    // …and flat out in the bay is still nowhere near where the box would shift.
    expect(hum(grainAt(1)).from).toBeLessThan(noteHz(SHIFT_UP_RPM) / 2);
  });

  it("never reaches the exhaust's edge — a parked car does not bark", () => {
    // The sawtooth is the strained top of a gear. The bay's ceiling is below
    // where the bed turns it on, so a car crossing a yard has no bark in it.
    expect(tones(grainAt(1)).some((t) => t.type === "sawtooth")).toBe(false);
  });

  it("carries almost none of the road's wind", () => {
    // The air layer says SPEED, and the bay has none to speak of. It must still
    // be there (it is the floor of the noise bed) and must stay well under what
    // the same layer does on the motorway.
    const wind = noises(grainAt(1)).find((n) => n.filter?.type === "lowpass");
    expect(wind).toBeDefined();
    expect(wind?.volume ?? 0).toBeGreaterThan(0);
    expect(wind?.volume ?? 1).toBeLessThan(0.006);
  });
});

describe("the bay's bed is continuous", () => {
  // The bed is made of one-shots and has to arrive as ONE noise. That is a
  // property of the grain against its own cadence, and the bay's cadence is
  // twice the road's — so it is checked here as well as on the road, because
  // the scaling is exactly what could go wrong.
  it("holds each grain's peak past the next grain's arrival", () => {
    for (const layer of tones(grainAt(0.4))) {
      expect(layer.holdMs ?? 0).toBeGreaterThan(CAR_GRAIN_MS);
      expect(layer.durationMs).toBeGreaterThan(CAR_GRAIN_MS * 2);
      expect(layer.attackMs ?? 0).toBeGreaterThan(0);
    }
  });

  it("stacks the wind deeper than the pitched layers", () => {
    // Uncorrelated noise sums in POWER rather than in level, so a broadband bed
    // needs more grains up at once before it stops fluttering.
    const wind = noises(grainAt(0.4)).find((n) => n.filter?.type === "lowpass");
    expect(wind?.durationMs ?? 0).toBeGreaterThan(CAR_GRAIN_MS * 4);
  });

  it("scales the grain with the cadence rather than picking new numbers", () => {
    // The bay is cued half as often as the road, so its grains are twice as
    // long — which is what makes the two beds the SAME bed at the same summed
    // level rather than one of them being quieter with holes in it.
    const road = 320; // the road's grain life, at ENGINE_GRAIN_MS
    expect(hum(grainAt(0.5)).durationMs).toBeCloseTo(
      (road * CAR_GRAIN_MS) / ENGINE_GRAIN_MS,
      6,
    );
  });

  it("runs the clatter at the CRANK's rate, across grains", () => {
    // The ticks are the layer an ear can count, and they must lope at the
    // engine's revolutions rather than at the rate the bed happens to be topped
    // up — which means the phase survives from one grain into the next.
    resetCarEngine();
    const { synth, calls } = recorder();
    const at: number[] = [];
    for (let grain = 0; grain < 6; grain++) {
      const before = calls.length;
      playCarEngine(synth, 0);
      for (const call of calls.slice(before)) {
        if (call.call === "noise" && call.filter?.type === "bandpass") {
          at.push(grain * CAR_GRAIN_MS + (call.delayMs ?? 0));
        }
      }
    }
    // Idle is 800 rpm, so a tick every 75 ms — evenly, with no seam where one
    // grain hands over to the next.
    expect(at.length).toBeGreaterThan(10);
    for (let i = 1; i < at.length; i++) {
      expect(at[i]! - at[i - 1]!).toBeCloseTo(60000 / IDLE_RPM, 6);
    }
  });
});
