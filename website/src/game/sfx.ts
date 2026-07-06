// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Sound design: maps engine events to synthesized effects (lib/synth.ts).
// Every sound is described by oscillator/noise parameters — tweak numbers
// here, no audio files involved.

import type { GameEvent } from "@game/core";

import type { Synth } from "../lib/synth.ts";

export function playEventSounds(
  synth: Synth,
  events: readonly GameEvent[],
): void {
  for (const event of events) {
    switch (event.type) {
      case "shot":
        synth.tone({
          type: "square",
          from: 880,
          to: 320,
          durationMs: 70,
          volume: 0.03,
        });
        break;
      case "enemyHit":
        synth.tone({
          type: "square",
          from: 220,
          to: 160,
          durationMs: 60,
          volume: 0.05,
        });
        break;
      case "enemyKilled":
        synth.tone({
          type: "sawtooth",
          from: 320,
          to: 60,
          durationMs: 250,
          volume: 0.07,
        });
        synth.noise({ durationMs: 150, volume: 0.05 });
        break;
      case "playerHurt":
        synth.tone({
          type: "sawtooth",
          from: 140,
          to: 90,
          durationMs: 180,
          volume: 0.09,
        });
        break;
      case "itemCollected":
        synth.tone({ type: "sine", from: 660, durationMs: 90, volume: 0.06 });
        synth.tone({
          type: "sine",
          from: 990,
          durationMs: 120,
          volume: 0.06,
          delayMs: 90,
        });
        break;
      case "victory":
        [523, 659, 784, 1047].forEach((freq, i) =>
          synth.tone({
            type: "triangle",
            from: freq,
            durationMs: 130,
            volume: 0.07,
            delayMs: i * 120,
          }),
        );
        break;
      case "defeat":
        [392, 311, 262, 196].forEach((freq, i) =>
          synth.tone({
            type: "sawtooth",
            from: freq,
            durationMs: 220,
            volume: 0.06,
            delayMs: i * 160,
          }),
        );
        break;
    }
  }
}
