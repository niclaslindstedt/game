// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Menu and interface sounds (app-owned moments, not engine events). The
// 16-bit read on classic cursor blips: every sound keeps its chip-style
// square core but gains a sine gloss layer, a touch of detune, or a breath
// of echo so the menus feel like a console front-end, not a calculator.

import type { Synth } from "@ui/lib/synth.ts";

export type UiSound = "move" | "confirm" | "back" | "start" | "equip";

export function playUiSound(synth: Synth, sound: UiSound): void {
  switch (sound) {
    case "move":
      // A dry cursor blip with a glassy octave on top.
      synth.tone({ type: "square", from: 880, durationMs: 40, volume: 0.035 });
      synth.tone({ type: "sine", from: 1760, durationMs: 30, volume: 0.018 });
      break;
    case "confirm":
      // Two rising detuned steps: "accepted", with a little room on it.
      synth.tone({
        type: "square",
        from: 660,
        durationMs: 60,
        volume: 0.045,
        detuneCents: 5,
        echo: 0.15,
      });
      synth.tone({
        type: "square",
        from: 990,
        durationMs: 100,
        volume: 0.045,
        delayMs: 60,
        detuneCents: 5,
        echo: 0.2,
      });
      break;
    case "back":
      // The confirm inverted: two falling steps, drier.
      synth.tone({
        type: "square",
        from: 660,
        durationMs: 60,
        volume: 0.035,
        detuneCents: 5,
      });
      synth.tone({
        type: "square",
        from: 440,
        durationMs: 90,
        volume: 0.035,
        delayMs: 60,
        detuneCents: 5,
      });
      break;
    case "start":
      // The run-start fanfare: a brassy rising arpeggio over a root, capped
      // with a snare — a two-second console "here we go".
      synth.tone({
        type: "triangle",
        from: 131,
        durationMs: 340,
        volume: 0.05,
      });
      [523, 659, 784, 1047].forEach((freq, i) =>
        synth.tone({
          type: "square",
          from: freq,
          durationMs: 80,
          volume: 0.045,
          delayMs: i * 70,
          detuneCents: 6,
          echo: 0.25,
        }),
      );
      synth.noise({
        durationMs: 90,
        volume: 0.04,
        delayMs: 280,
        filter: { type: "highpass", frequency: 1600 },
      });
      break;
    case "equip":
      // Gear clacking into its slot: a filtered snap, then a bright ring.
      synth.noise({
        durationMs: 35,
        volume: 0.045,
        filter: { type: "bandpass", frequency: 2200, q: 1.2 },
      });
      synth.tone({
        type: "square",
        from: 784,
        durationMs: 90,
        volume: 0.045,
        delayMs: 30,
        detuneCents: 6,
      });
      break;
  }
}
