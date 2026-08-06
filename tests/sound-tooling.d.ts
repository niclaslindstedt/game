// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Ambient types for the sound-lift tooling's `.mjs` modules. They are plain
// JavaScript because they run under bare `node` (the emitter is a one-shot
// script, the recorder is imported by both it and the test); these shims give
// the equivalence test enough typing to import them without `any`.

declare module "*/sound-data/record.mjs" {
  /** A synth that plays nothing and remembers every call. */
  export function recordingSynth(): {
    calls: Record<string, unknown>[];
    tone: (options: Record<string, unknown>) => void;
    noise: (options: Record<string, unknown>) => void;
  };
  /** Event type → the discriminant combinations that make distinct sounds. */
  export const VARIANTS: Record<string, Record<string, unknown>[]>;
  /** Event types whose sound rides a continuous parameter, so it stays code. */
  export const PARAMETERIZED: Set<string>;
  export function soundId(
    type: string,
    variant?: Record<string, unknown>,
  ): string;
}

declare module "*/sound-data/capture.mjs" {
  type Captured = {
    id: string;
    type: string;
    variant: Record<string, unknown>;
    calls: Record<string, unknown>[];
  };
  export function captureEventSounds(): Promise<Captured[]>;
  export function captureUiSounds(): Promise<
    { id: string; ui: string; calls: Record<string, unknown>[] }[]
  >;
  export function captureAchievementJingle(): Promise<{
    id: string;
    calls: Record<string, unknown>[];
  }>;
  export function captureLegendJingle(): Promise<{
    id: string;
    calls: Record<string, unknown>[];
  }>;
}
