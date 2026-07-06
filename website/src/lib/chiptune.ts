// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Tiny NES-style music sequencer on top of the SFX synth (synth.ts).
// Generic React/UI game code — lives in website/src/lib/ so it can be
// extracted into oss-framework once mature. A track is pure data: channels
// of note tokens on a fixed 16th-note-style grid, looped by a lookahead
// scheduler (the classic "two clocks" pattern: a coarse JS interval books
// notes a beat ahead on the sample-accurate AudioContext clock). Zero audio
// files, matching the SFX approach.

import type { Synth, WaveType } from "./synth.ts";

/**
 * One channel's step tokens: a note name ("A4", "C#3"), "." for a rest, or
 * "=" to tie (sustain the previous note through this step). Channels shorter
 * than the track's total step count simply loop earlier.
 */
export type ChiptuneChannel = {
  /** Oscillator for note channels; "noise" makes every hit a noise burst. */
  wave: WaveType | "noise";
  volume: number;
  /** Note decay tail as a fraction of the note's step-length (0–1 sustains
   * the full length; smaller = pluckier). Default 0.9. */
  gate?: number;
  notes: string[];
};

export type ChiptuneTrack = {
  bpm: number;
  /** Grid resolution: steps per beat (4 = sixteenth notes). */
  stepsPerBeat: number;
  channels: ChiptuneChannel[];
};

export type ChiptunePlayer = {
  /** Start looping `track`, replacing whatever was playing. */
  play: (track: ChiptuneTrack) => void;
  stop: () => void;
  playing: () => boolean;
};

const NOTE_INDEX: Record<string, number> = {
  C: 0,
  "C#": 1,
  D: 2,
  "D#": 3,
  E: 4,
  F: 5,
  "F#": 6,
  G: 7,
  "G#": 8,
  A: 9,
  "A#": 10,
  B: 11,
};

/** "A4" → 440; equal temperament from A4. Throws on junk so a typo in a
 * track surfaces the first time it plays, not as a silent rest. */
export function noteFrequency(name: string): number {
  const match = /^([A-G]#?)(-?\d)$/.exec(name);
  if (!match) throw new Error(`unparseable note "${name}"`);
  const semitone = NOTE_INDEX[match[1] as string] as number;
  const octave = Number(match[2]);
  const midi = (octave + 1) * 12 + semitone;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Split a bar string ("A2 . = G2") into step tokens; bars concatenate. */
export function bars(...lines: string[]): string[] {
  return lines.flatMap((line) => line.trim().split(/\s+/));
}

const LOOKAHEAD_S = 0.28; // how far ahead notes are booked
const TICK_MS = 90; // how often the JS clock checks in

export function createChiptunePlayer(synth: Synth): ChiptunePlayer {
  let interval: ReturnType<typeof setInterval> | null = null;
  let track: ChiptuneTrack | null = null;
  let stepIndex = 0;
  let nextStepTime = 0;

  const totalSteps = (t: ChiptuneTrack) =>
    Math.max(...t.channels.map((c) => c.notes.length));

  /** Book every channel's note that starts on step `index` at time `at`. */
  const scheduleStep = (t: ChiptuneTrack, index: number, at: number) => {
    const stepS = 60 / t.bpm / t.stepsPerBeat;
    for (const channel of t.channels) {
      const token = channel.notes[index % channel.notes.length];
      if (!token || token === "." || token === "=") continue;

      // The note sustains through following "=" ties.
      let steps = 1;
      while (
        channel.notes[(index + steps) % channel.notes.length] === "=" &&
        steps < channel.notes.length
      ) {
        steps++;
      }
      const durationMs = steps * stepS * 1000 * (channel.gate ?? 0.9);

      if (channel.wave === "noise") {
        synth.noise({ durationMs, volume: channel.volume, at });
      } else {
        synth.tone({
          type: channel.wave,
          from: noteFrequency(token),
          durationMs,
          volume: channel.volume,
          at,
        });
      }
    }
  };

  const tick = () => {
    if (!track) return;
    const now = synth.now();
    if (now === null) return; // still locked — try again next tick
    if (nextStepTime === 0 || nextStepTime < now - 0.5) {
      nextStepTime = now + 0.05; // (re)anchor after unlock or a long stall
    }
    const stepS = 60 / track.bpm / track.stepsPerBeat;
    while (nextStepTime < now + LOOKAHEAD_S) {
      scheduleStep(track, stepIndex, nextStepTime);
      stepIndex = (stepIndex + 1) % totalSteps(track);
      nextStepTime += stepS;
    }
  };

  return {
    play(next) {
      track = next;
      stepIndex = 0;
      nextStepTime = 0;
      interval ??= setInterval(tick, TICK_MS);
      tick();
    },

    stop() {
      track = null;
      stepIndex = 0;
      nextStepTime = 0;
      if (interval !== null) {
        clearInterval(interval);
        interval = null;
      }
    },

    playing() {
      return track !== null;
    },
  };
}
