// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Ambient types for the score-engraving tooling's `.mjs` modules
// (`scripts/asset-tools/notation.mjs`, and the music loader it is driven from).
// They are plain JavaScript because they run under bare `node` — the sheet is a
// one-shot command, like every other preview generator — and the same reason
// the sound and mod toolchains are (see sound-tooling.d.ts, mod-tooling.d.ts).
// This shim gives the notation test real typing without the modules having to
// import anything they should not.

declare module "*/scripts/asset-tools/notation.mjs" {
  /** A note token, read as a staff reads it: a DIATONIC step plus whatever
   * accidental is in front of it. */
  export type ParsedNote = {
    letter: string;
    sharp: boolean;
    octave: number;
    /** `octave * 7 + letter index` — what a staff position measures. */
    diatonic: number;
    midi: number;
  };

  /** One onset in a voice: where it starts, and how many steps it sounds for
   * once its ties are counted. */
  export type VoiceNote = { at: number; steps: number; token: string };

  export function parseNote(token: string): ParsedNote | null;
  export function voiceNotes(tokens: readonly string[]): VoiceNote[];

  export function engraveTrack(
    track: unknown,
    opts?: {
      title?: string;
      subtitle?: string;
      barsPerSystem?: number;
      names?: boolean;
      only?: readonly string[];
    },
  ): Promise<{ svg: string; width: number; height: number }>;
}

declare module "*/scripts/asset-tools/song-format.mjs" {
  /** A parsed `.song` — the same shape a cooked track has, plus the authored
   * chord plan the emitter writes into the YAML as a comment. */
  export type SongDoc = {
    id?: string;
    name?: string;
    description?: string;
    bpm?: number;
    stepsPerBeat: number;
    instruments: Record<string, Record<string, unknown>>;
    patterns: Record<string, Record<string, string[]>>;
    order: string[];
    sections: Record<string, unknown>;
  };

  export const STEPS_PER_BAR: number;
  export function parseSong(source: string): SongDoc;
  export function toSong(track: unknown): string;
}

declare module "*/scripts/music-data/load-yaml.mjs" {
  /** A cooked track — the shape the chiptune player takes, with every pattern
   * voice already split into step tokens. */
  export type CookedTrack = {
    bpm: number;
    stepsPerBeat: number;
    instruments: Record<string, { wave: string; volume: number }>;
    patterns: Record<string, Record<string, string[]>>;
    order: string[];
  };

  export function cookTrack(doc: unknown): CookedTrack;
  export function loadMusic(musicDir?: string): {
    entries: { id: string; doc: unknown }[];
    errors: string[];
  };
}
