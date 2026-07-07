// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// 16-bit-style music sequencer on top of the SFX synth (synth.ts).
// Generic React/UI game code — lives in website/src/lib/ so it can be
// extracted into oss-framework once mature.
//
// A song is pure data, structured like a tracker module / MIDI file:
//   - `instruments`: named patches (wave, envelope, vibrato, pan, echo…)
//   - `patterns`:    named sections; each maps a voice (instrument name) to
//                    note tokens on a fixed 16th-note-style grid
//   - `order`:       the arrangement — pattern names in play order
// The whole arrangement loops, so a two-minute song with verse/chorus/
// breakdown sections is just `order: ["intro", "A", "B", "A", …]` over a
// handful of composed patterns. Playback uses a lookahead scheduler (the
// classic "two clocks" pattern: a coarse JS interval books notes a beat
// ahead on the sample-accurate AudioContext clock). Zero audio files,
// matching the SFX approach.

import type {
  FilterOptions,
  Synth,
  VibratoOptions,
  WaveType,
} from "./synth.ts";

/** A named patch: how one voice sounds, independent of what it plays. */
export type ChiptuneInstrument = {
  /** Oscillator for note voices; "noise" makes every hit a noise burst
   * (shape it with `filter` — highpass ≈ hats, bandpass ≈ snares). */
  wave: WaveType | "noise";
  volume: number;
  /** Note decay tail as a fraction of the note's step-length (0–1 sustains
   * the full length; smaller = pluckier). Default 0.9. */
  gate?: number;
  /** Volume ramp-up in ms — pads and strings swell, chips snap. */
  attackMs?: number;
  /** Detuned dual-oscillator chorus width in cents. */
  detuneCents?: number;
  vibrato?: VibratoOptions;
  /** Stereo position, -1 (left) to 1 (right). */
  pan?: number;
  /** 0–1 send into the synth's shared echo bus. */
  echo?: number;
  filter?: FilterOptions;
  /** End-pitch multiplier — every note glides to `pitch × slide`. 0.25 on
   * a triangle makes a kick drum; slight values make toms and drops. */
  slide?: number;
};

/**
 * One pattern (a section of the song): voice name → step tokens. A token is
 * a note name ("A4", "C#3"), "." for a rest, "=" to tie (sustain the
 * previous note through this step), or any other word (e.g. "x") to trigger
 * a noise voice. Voices with fewer steps than the pattern's longest voice
 * cycle within the pattern (a 1-bar drum line loops under an 8-bar lead),
 * so their length must divide the pattern length. Voices a pattern omits
 * stay silent through it.
 */
export type ChiptunePattern = Record<string, string[]>;

export type ChiptuneTrack = {
  bpm: number;
  /** Grid resolution: steps per beat (4 = sixteenth notes). */
  stepsPerBeat: number;
  instruments: Record<string, ChiptuneInstrument>;
  patterns: Record<string, ChiptunePattern>;
  /** Arrangement: pattern names in play order; the whole list loops. */
  order: string[];
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

/** A track compiled for playback: every voice expanded to one flat token
 * stream covering the full arrangement. Exported for tests. */
export type FlatTrack = {
  totalSteps: number;
  voices: { instrument: ChiptuneInstrument; tokens: string[] }[];
};

/** Expand patterns through `order` into per-voice flat token streams.
 * Throws on unknown pattern/instrument names and non-dividing voice
 * lengths, so arrangement typos fail CI instead of playing garbage. */
export function flattenTrack(track: ChiptuneTrack): FlatTrack {
  const names = Object.keys(track.instruments);
  const streams = new Map<string, string[]>(names.map((n) => [n, []]));

  for (const patternName of track.order) {
    const pattern = track.patterns[patternName];
    if (!pattern) throw new Error(`unknown pattern "${patternName}" in order`);
    const lengths = Object.values(pattern).map((tokens) => tokens.length);
    const patternSteps = Math.max(...lengths, 0);
    if (patternSteps === 0)
      throw new Error(`pattern "${patternName}" is empty`);

    for (const voice of Object.keys(pattern)) {
      if (!track.instruments[voice]) {
        throw new Error(
          `pattern "${patternName}" uses unknown instrument "${voice}"`,
        );
      }
    }
    for (const name of names) {
      const stream = streams.get(name) as string[];
      const line = pattern[name];
      if (!line) {
        for (let i = 0; i < patternSteps; i++) stream.push(".");
        continue;
      }
      if (patternSteps % line.length !== 0) {
        throw new Error(
          `pattern "${patternName}" voice "${name}": ${line.length} steps ` +
            `does not divide the pattern length ${patternSteps}`,
        );
      }
      for (let i = 0; i < patternSteps; i++) {
        stream.push(line[i % line.length] as string);
      }
    }
  }

  const totalSteps = streams.size
    ? (streams.values().next().value as string[]).length
    : 0;
  return {
    totalSteps,
    voices: names.map((name) => ({
      instrument: track.instruments[name] as ChiptuneInstrument,
      tokens: streams.get(name) as string[],
    })),
  };
}

const LOOKAHEAD_S = 0.28; // how far ahead notes are booked
const TICK_MS = 90; // how often the JS clock checks in

export function createChiptunePlayer(synth: Synth): ChiptunePlayer {
  let interval: ReturnType<typeof setInterval> | null = null;
  let flat: FlatTrack | null = null;
  let bpm = 0;
  let stepsPerBeat = 0;
  let stepIndex = 0;
  let nextStepTime = 0;

  /** Book every voice's note that starts on step `index` at time `at`. */
  const scheduleStep = (t: FlatTrack, index: number, at: number) => {
    const stepS = 60 / bpm / stepsPerBeat;
    for (const { instrument, tokens } of t.voices) {
      const token = tokens[index % tokens.length];
      if (!token || token === "." || token === "=") continue;

      // The note sustains through following "=" ties.
      let steps = 1;
      while (
        tokens[(index + steps) % tokens.length] === "=" &&
        steps < tokens.length
      ) {
        steps++;
      }
      const durationMs = steps * stepS * 1000 * (instrument.gate ?? 0.9);

      if (instrument.wave === "noise") {
        synth.noise({
          durationMs,
          volume: instrument.volume,
          at,
          filter: instrument.filter,
          pan: instrument.pan,
          echo: instrument.echo,
        });
      } else {
        const pitch = noteFrequency(token);
        synth.tone({
          type: instrument.wave,
          from: pitch,
          to: pitch * (instrument.slide ?? 1),
          durationMs,
          volume: instrument.volume,
          at,
          attackMs: instrument.attackMs,
          detuneCents: instrument.detuneCents,
          vibrato: instrument.vibrato,
          pan: instrument.pan,
          echo: instrument.echo,
          filter: instrument.filter,
        });
      }
    }
  };

  const tick = () => {
    if (!flat) return;
    const now = synth.now();
    if (now === null) return; // still locked — try again next tick
    if (nextStepTime === 0 || nextStepTime < now - 0.5) {
      nextStepTime = now + 0.05; // (re)anchor after unlock or a long stall
    }
    const stepS = 60 / bpm / stepsPerBeat;
    while (nextStepTime < now + LOOKAHEAD_S) {
      scheduleStep(flat, stepIndex, nextStepTime);
      stepIndex = (stepIndex + 1) % flat.totalSteps;
      nextStepTime += stepS;
    }
  };

  return {
    play(next) {
      flat = flattenTrack(next);
      bpm = next.bpm;
      stepsPerBeat = next.stepsPerBeat;
      stepIndex = 0;
      nextStepTime = 0;
      interval ??= setInterval(tick, TICK_MS);
      tick();
    },

    stop() {
      flat = null;
      stepIndex = 0;
      nextStepTime = 0;
      if (interval !== null) {
        clearInterval(interval);
        interval = null;
      }
    },

    playing() {
      return flat !== null;
    },
  };
}
