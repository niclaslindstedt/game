// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Sound design: maps engine events to synthesized effects (lib/synth.ts).
// Every sound is described by oscillator/noise parameters — tweak numbers
// here, no audio files involved.

import type { GameEvent } from "@game/core";

import type { Synth } from "@ui/lib/synth.ts";

export function playEventSounds(
  synth: Synth,
  events: readonly GameEvent[],
): void {
  for (const event of events) {
    switch (event.type) {
      case "shot":
        if (event.weaponClass === "magic") {
          synth.tone({
            type: "sine",
            from: 620,
            to: 980,
            durationMs: 90,
            volume: 0.04,
          });
        } else {
          synth.tone({
            type: "square",
            from: 880,
            to: 320,
            durationMs: 70,
            volume: 0.03,
          });
        }
        break;
      case "swing":
        synth.noise({ durationMs: 60, volume: 0.05 });
        synth.tone({
          type: "triangle",
          from: 240,
          to: 130,
          durationMs: 80,
          volume: 0.04,
        });
        break;
      case "jump":
        synth.tone({
          type: "sine",
          from: 260,
          to: 540,
          durationMs: 160,
          volume: 0.04,
        });
        break;
      case "land":
        synth.noise({ durationMs: 50, volume: 0.03 });
        break;
      case "enemyHit":
        synth.tone({
          type: "square",
          from: event.crit ? 340 : 220,
          to: event.crit ? 200 : 160,
          durationMs: event.crit ? 90 : 60,
          volume: event.crit ? 0.08 : 0.05,
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
          from: event.crit ? 180 : 140,
          to: 90,
          durationMs: event.crit ? 260 : 180,
          volume: event.crit ? 0.12 : 0.09,
        });
        break;
      case "itemCollected":
        if (event.kind === "equipment") {
          // A little "treasure" flourish — brighter for magic finds.
          [520, 780, event.tier === "magic" ? 1180 : 1040].forEach((freq, i) =>
            synth.tone({
              type: "triangle",
              from: freq,
              durationMs: 90,
              volume: 0.06,
              delayMs: i * 70,
            }),
          );
        } else if (event.kind === "upgrade") {
          // A metallic sharpening rasp rising into a ring.
          synth.noise({ durationMs: 70, volume: 0.04 });
          synth.tone({
            type: "square",
            from: 440,
            to: 880,
            durationMs: 110,
            volume: 0.05,
            delayMs: 40,
          });
          synth.tone({
            type: "triangle",
            from: 1320,
            durationMs: 140,
            volume: 0.05,
            delayMs: 130,
          });
        } else if (event.kind === "ability") {
          // A power surging on: a fast rising sweep into a shimmer.
          synth.tone({
            type: "sawtooth",
            from: 220,
            to: 880,
            durationMs: 180,
            volume: 0.06,
          });
          synth.tone({
            type: "triangle",
            from: 1320,
            durationMs: 200,
            volume: 0.05,
            delayMs: 160,
          });
        } else {
          synth.tone({ type: "sine", from: 660, durationMs: 90, volume: 0.06 });
          synth.tone({
            type: "sine",
            from: 990,
            durationMs: 120,
            volume: 0.06,
            delayMs: 90,
          });
        }
        break;
      case "itemDropped":
        synth.tone({ type: "sine", from: 440, durationMs: 60, volume: 0.03 });
        break;
      case "lightning":
        // The storm ability's strike: a snap of noise over a falling zap.
        synth.noise({ durationMs: 90, volume: 0.05 });
        synth.tone({
          type: "sawtooth",
          from: 1400,
          to: 180,
          durationMs: 120,
          volume: 0.05,
        });
        break;
      case "abilityEnded":
        // The power winding down: a soft falling sigh.
        synth.tone({
          type: "sine",
          from: 700,
          to: 320,
          durationMs: 200,
          volume: 0.04,
        });
        break;
      case "levelUp":
        [392, 523, 659, 784, 1047].forEach((freq, i) =>
          synth.tone({
            type: "triangle",
            from: freq,
            durationMs: 110,
            volume: 0.07,
            delayMs: i * 90,
          }),
        );
        break;
      case "bossDefeated":
        synth.noise({ durationMs: 500, volume: 0.08 });
        [220, 165, 110, 82].forEach((freq, i) =>
          synth.tone({
            type: "sawtooth",
            from: freq,
            durationMs: 300,
            volume: 0.08,
            delayMs: i * 200,
          }),
        );
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
