// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The chiptune sequencer (@ui/lib/chiptune.ts — DOM-free, so it tests here)
// and the game's composed tracks: note parsing, pattern/order flattening,
// tie/loop behavior, the lookahead scheduler's timing, and a smoke pass
// proving every token in the shipped scores is playable and that each song
// loops at around two minutes (a typo'd note or a mis-sized pattern must
// fail CI, not throw from a setInterval callback mid-game).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  bars,
  createChiptunePlayer,
  flattenTrack,
  noteFrequency,
  type ChiptuneTrack,
} from "@ui/lib/chiptune.ts";
import type { NoiseOptions, Synth, ToneOptions } from "@ui/lib/synth.ts";

import { LEVEL_THEME } from "../website/src/game/music/level.ts";
import { HQ_THEME } from "../website/src/game/music/spacez.ts";
import { TITLE_THEME } from "../website/src/game/music/title.ts";

/** A fake synth with a hand-cranked clock that records every scheduling. */
function makeFakeSynth(): {
  synth: Synth;
  tones: ToneOptions[];
  noises: NoiseOptions[];
  clock: { t: number | null };
} {
  const tones: ToneOptions[] = [];
  const noises: NoiseOptions[] = [];
  const clock: { t: number | null } = { t: 0 };
  return {
    synth: {
      unlock() {},
      now: () => clock.t,
      tone: (o) => tones.push(o),
      noise: (o) => noises.push(o),
    },
    tones,
    noises,
    clock,
  };
}

/** A one-pattern track with a single square voice, for scheduler tests.
 * 120 bpm at 4 steps/beat = one step per 125 ms. */
const track = (notes: string[]): ChiptuneTrack => ({
  bpm: 120,
  stepsPerBeat: 4,
  instruments: { lead: { wave: "square", volume: 0.05 } },
  patterns: { main: { lead: notes } },
  order: ["main"],
});

describe("note parsing", () => {
  it("tunes A4 to 440 and follows equal temperament", () => {
    expect(noteFrequency("A4")).toBeCloseTo(440, 6);
    expect(noteFrequency("A5")).toBeCloseTo(880, 6);
    expect(noteFrequency("C4")).toBeCloseTo(261.63, 1);
    expect(noteFrequency("G#3")).toBeCloseTo(207.65, 1);
  });

  it("throws loudly on junk so track typos surface in CI", () => {
    expect(() => noteFrequency("H4")).toThrow(/unparseable/);
    expect(() => noteFrequency("A")).toThrow(/unparseable/);
  });

  it("splits bars into flat step tokens", () => {
    expect(bars("A2 .  = G2", "C3 .")).toEqual([
      "A2",
      ".",
      "=",
      "G2",
      "C3",
      ".",
    ]);
  });
});

describe("flattening patterns through the order", () => {
  const instruments = {
    lead: { wave: "square" as const, volume: 0.05 },
    drum: { wave: "noise" as const, volume: 0.03 },
  };

  it("concatenates patterns and cycles short voices to pattern length", () => {
    const flat = flattenTrack({
      bpm: 120,
      stepsPerBeat: 4,
      instruments,
      patterns: {
        a: { lead: ["A4", ".", "B4", "."], drum: ["x", "."] },
        b: { lead: ["C5", ".", ".", "."] },
      },
      order: ["a", "b", "a"],
    });
    expect(flat.totalSteps).toBe(12);
    const lead = flat.voices.find((v) => v.tokens[0] === "A4");
    const drum = flat.voices.find((v) => v.tokens[0] === "x");
    expect(lead?.tokens).toEqual([
      ...["A4", ".", "B4", "."],
      ...["C5", ".", ".", "."],
      ...["A4", ".", "B4", "."],
    ]);
    // The 2-step drum loop cycles through pattern a and rests through b.
    expect(drum?.tokens).toEqual([
      ...["x", ".", "x", "."],
      ...[".", ".", ".", "."],
      ...["x", ".", "x", "."],
    ]);
  });

  it("throws on arrangement typos", () => {
    const base = {
      bpm: 120,
      stepsPerBeat: 4,
      instruments,
    };
    expect(() =>
      flattenTrack({
        ...base,
        patterns: { a: { lead: ["A4"] } },
        order: ["nope"],
      }),
    ).toThrow(/unknown pattern/);
    expect(() =>
      flattenTrack({
        ...base,
        patterns: { a: { ghost: ["A4"] } },
        order: ["a"],
      }),
    ).toThrow(/unknown instrument/);
    expect(() =>
      flattenTrack({
        ...base,
        patterns: { a: { lead: ["A4", ".", ".", "."], drum: ["x", ".", "."] } },
        order: ["a"],
      }),
    ).toThrow(/does not divide/);
  });
});

describe("sequencer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("books notes ahead on the audio clock and sustains ties", () => {
    const { synth, tones, clock } = makeFakeSynth();
    const player = createChiptunePlayer(synth);
    player.play(track(["A4", "=", ".", "C5"]));
    expect(tones.length).toBe(1); // only A4 fits the first lookahead window

    // Crank the clock through the rest of the pattern.
    for (let t = 0; t < 0.5; t += 0.08) {
      clock.t = t;
      vi.advanceTimersByTime(100);
    }
    const [first, second] = tones as [ToneOptions, ToneOptions];
    // A4 sustains through its tie: two steps × 125 ms × 0.9 gate.
    expect(first.from).toBeCloseTo(440, 3);
    expect(first.durationMs).toBeCloseTo(225, 3);
    expect(second.from).toBeCloseTo(noteFrequency("C5"), 3);
    // The C5 lands three steps after the A4 on the context clock.
    expect((second.at ?? 0) - (first.at ?? 0)).toBeCloseTo(0.375, 6);
    player.stop();
  });

  it("passes the instrument's patch through to every note", () => {
    const { synth, tones, noises, clock } = makeFakeSynth();
    const player = createChiptunePlayer(synth);
    player.play({
      bpm: 120,
      stepsPerBeat: 4,
      instruments: {
        kick: { wave: "triangle", volume: 0.06, slide: 0.25, gate: 1 },
        hat: {
          wave: "noise",
          volume: 0.01,
          filter: { type: "highpass", frequency: 6500 },
        },
      },
      patterns: { main: { kick: ["A2", ".", ".", "."], hat: [".", "x"] } },
      order: ["main"],
    });
    for (let t = 0; t < 0.6; t += 0.08) {
      clock.t = t;
      vi.advanceTimersByTime(100);
    }
    player.stop();

    const kick = tones[0] as ToneOptions;
    expect(kick.type).toBe("triangle");
    expect(kick.from).toBeCloseTo(110, 1);
    expect(kick.to).toBeCloseTo(110 * 0.25, 3); // the slide dive
    const hat = noises[0] as NoiseOptions;
    expect(hat.filter?.frequency).toBe(6500);
  });

  it("loops the arrangement and keeps scheduling as the clock advances", () => {
    const { synth, tones, clock } = makeFakeSynth();
    const player = createChiptunePlayer(synth);
    player.play(track(["A4", ".", ".", "."]));
    const initial = tones.length;

    // Two seconds ≈ four loops of the half-second pattern.
    for (let t = 0; t < 2; t += 0.08) {
      clock.t = t;
      vi.advanceTimersByTime(100);
    }
    expect(tones.length).toBeGreaterThan(initial + 2);
    player.stop();

    const afterStop = tones.length;
    for (let t = 2; t < 3; t += 0.08) {
      clock.t = t;
      vi.advanceTimersByTime(100);
    }
    expect(tones.length).toBe(afterStop); // stopped players stay silent
  });

  it("waits quietly while the audio context is still locked", () => {
    const { synth, tones, clock } = makeFakeSynth();
    clock.t = null; // locked
    const player = createChiptunePlayer(synth);
    player.play(track(["A4", ".", ".", "."]));
    expect(tones.length).toBe(0);

    clock.t = 1; // unlocked now
    vi.advanceTimersByTime(200);
    expect(tones.length).toBeGreaterThan(0);
    player.stop();
  });
});

describe("the shipped scores", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const loopSeconds = (t: ChiptuneTrack) =>
    (flattenTrack(t).totalSteps / (t.stepsPerBeat * t.bpm)) * 60;

  it.each([
    ["title", TITLE_THEME],
    ["level", LEVEL_THEME],
    ["hq", HQ_THEME],
  ])("arranges the %s score to loop at around two minutes", (_, theme) => {
    const total = loopSeconds(theme);
    expect(total).toBeGreaterThan(100);
    expect(total).toBeLessThan(145);
  });

  it.each([
    ["title", TITLE_THEME],
    ["level", LEVEL_THEME],
    ["hq", HQ_THEME],
  ])(
    "plays the %s score through a full loop without a bad note",
    (_, theme) => {
      const { synth, tones, clock } = makeFakeSynth();
      const player = createChiptunePlayer(synth);
      player.play(theme); // a junk token would throw right here or below

      const total = loopSeconds(theme);
      for (let t = 0; t < total + 1; t += 0.08) {
        clock.t = t;
        vi.advanceTimersByTime(100);
      }
      player.stop();

      // Every scheduled frequency is a real audible pitch.
      expect(tones.length).toBeGreaterThan(200);
      for (const tone of tones) {
        expect(tone.from).toBeGreaterThan(20);
        expect(tone.from).toBeLessThan(8000);
      }
    },
  );

  it("keeps every pattern voice aligned to whole bars", () => {
    for (const theme of [TITLE_THEME, LEVEL_THEME, HQ_THEME]) {
      const barLength = theme.stepsPerBeat * 4; // four beats to the bar
      for (const pattern of Object.values(theme.patterns)) {
        for (const tokens of Object.values(pattern)) {
          expect(tokens.length % barLength).toBe(0);
        }
      }
    }
  });

  it("varies across the loop: several distinct sections per score", () => {
    for (const theme of [TITLE_THEME, LEVEL_THEME, HQ_THEME]) {
      expect(Object.keys(theme.patterns).length).toBeGreaterThanOrEqual(4);
      expect(theme.order.length).toBeGreaterThan(
        Object.keys(theme.patterns).length,
      );
    }
  });
});
