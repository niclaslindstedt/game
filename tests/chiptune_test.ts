// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The chiptune sequencer (@ui/lib/chiptune.ts — DOM-free, so it tests here)
// and the game's composed tracks: note parsing, tie/loop behavior, the
// lookahead scheduler's timing, and a smoke pass proving every token in the
// shipped themes is playable (a typo'd note must fail CI, not throw from a
// setInterval callback mid-game).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  bars,
  createChiptunePlayer,
  noteFrequency,
  type ChiptuneTrack,
} from "@ui/lib/chiptune.ts";
import type { NoiseOptions, Synth, ToneOptions } from "@ui/lib/synth.ts";

import { LEVEL_THEME, TITLE_THEME } from "../website/src/game/music.ts";

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

describe("sequencer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // 120 bpm at 4 steps/beat = one step per 125 ms.
  const track = (notes: string[]): ChiptuneTrack => ({
    bpm: 120,
    stepsPerBeat: 4,
    channels: [{ wave: "square", volume: 0.05, notes }],
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

  it("loops the pattern and keeps scheduling as the clock advances", () => {
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

describe("the shipped themes", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const loopSeconds = (t: ChiptuneTrack) =>
    (Math.max(...t.channels.map((c) => c.notes.length)) /
      (t.stepsPerBeat * t.bpm)) *
    60;

  it.each([
    ["title", TITLE_THEME],
    ["level", LEVEL_THEME],
  ])(
    "plays the %s theme through a full loop without a bad note",
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
      expect(tones.length).toBeGreaterThan(50);
      for (const tone of tones) {
        expect(tone.from).toBeGreaterThan(20);
        expect(tone.from).toBeLessThan(8000);
      }
    },
  );

  it("keeps every channel aligned to whole bars", () => {
    for (const theme of [TITLE_THEME, LEVEL_THEME]) {
      const barLength = theme.stepsPerBeat * 4; // four beats to the bar
      for (const channel of theme.channels) {
        expect(channel.notes.length % barLength).toBe(0);
      }
    }
  });
});
