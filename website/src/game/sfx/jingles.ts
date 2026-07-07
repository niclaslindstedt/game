// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Jingles: the multi-note fanfares for the game's big beats — level-ups,
// story finds, boss kills, victory, defeat. Rare by definition, so these
// get the full 16-bit treatment: harmonized layers (melody + sine octave,
// or a triangle root under brass squares) and a generous echo send.

import type { GameEvent } from "@game/core";

import type { Synth } from "@ui/lib/synth.ts";

/** Play the jingle for a milestone event; false when it isn't one. */
export function playJingle(synth: Synth, event: GameEvent): boolean {
  switch (event.type) {
    case "levelUp":
      // Five steps up the major scale, each with a glass octave on top.
      [392, 523, 659, 784, 1047].forEach((freq, i) => {
        synth.tone({
          type: "triangle",
          from: freq,
          durationMs: 110,
          volume: 0.065,
          delayMs: i * 90,
          echo: 0.25,
        });
        synth.tone({
          type: "sine",
          from: freq * 2,
          durationMs: 90,
          volume: 0.02,
          delayMs: i * 90,
          echo: 0.3,
        });
      });
      return true;

    case "storyItemCollected":
      // A plot piece: a slow, reverent rise left hanging in the echo.
      [392, 523, 784].forEach((freq, i) =>
        synth.tone({
          type: "triangle",
          from: freq,
          durationMs: 150,
          volume: 0.055,
          delayMs: i * 110,
          detuneCents: 5,
          echo: 0.4,
        }),
      );
      synth.tone({
        type: "sine",
        from: 1568,
        durationMs: 240,
        volume: 0.025,
        delayMs: 330,
        echo: 0.5,
      });
      return true;

    case "menaceRose":
      // The horde evolves: a dark, rising swell — three detuned sawtooth
      // steps climbing a minor triad under a low growl, so a rampage feels
      // answered rather than rewarded.
      synth.noise({
        durationMs: 320,
        volume: 0.05,
        filter: { type: "lowpass", frequency: 420 },
        echo: 0.2,
      });
      [147, 175, 233].forEach((freq, i) =>
        synth.tone({
          type: "sawtooth",
          from: freq,
          durationMs: 200,
          volume: 0.055,
          delayMs: i * 100,
          detuneCents: 12,
          echo: 0.3,
        }),
      );
      return true;

    case "bossDefeated":
      // The giant coming down: a long rumble under descending detuned
      // saws, ending in a floor-shaking thud.
      synth.noise({
        durationMs: 550,
        volume: 0.08,
        filter: { type: "lowpass", frequency: 600 },
        echo: 0.3,
      });
      [220, 165, 110, 82].forEach((freq, i) =>
        synth.tone({
          type: "sawtooth",
          from: freq,
          durationMs: 300,
          volume: 0.06,
          delayMs: i * 200,
          detuneCents: 10,
          echo: 0.25,
        }),
      );
      synth.noise({
        durationMs: 220,
        volume: 0.06,
        delayMs: 780,
        filter: { type: "lowpass", frequency: 300 },
      });
      return true;

    case "victory":
      // The triumph fanfare: brass squares over a held triangle root,
      // capped with a snare — the full parade.
      synth.tone({
        type: "triangle",
        from: 131,
        durationMs: 620,
        volume: 0.05,
      });
      [523, 659, 784, 1047].forEach((freq, i) =>
        synth.tone({
          type: "square",
          from: freq,
          durationMs: 140,
          volume: 0.06,
          delayMs: i * 120,
          detuneCents: 7,
          echo: 0.3,
        }),
      );
      synth.noise({
        durationMs: 120,
        volume: 0.04,
        delayMs: 480,
        filter: { type: "highpass", frequency: 1600 },
        echo: 0.3,
      });
      return true;

    case "defeat":
      // The falling minor line with a saw shadow underneath, closed by a
      // dull thud in the dust.
      [392, 311, 262, 196].forEach((freq, i) => {
        synth.tone({
          type: "triangle",
          from: freq,
          durationMs: 220,
          volume: 0.065,
          delayMs: i * 160,
          echo: 0.25,
        });
        synth.tone({
          type: "sawtooth",
          from: freq / 2,
          durationMs: 220,
          volume: 0.022,
          delayMs: i * 160,
        });
      });
      synth.noise({
        durationMs: 200,
        volume: 0.05,
        delayMs: 480,
        filter: { type: "lowpass", frequency: 500 },
      });
      return true;

    default:
      return false;
  }
}
