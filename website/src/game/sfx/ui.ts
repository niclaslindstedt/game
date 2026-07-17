// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Menu and interface sounds (app-owned moments, not engine events). The
// 16-bit read on classic cursor blips: every sound keeps its chip-style
// square core but gains a sine gloss layer, a touch of detune, or a breath
// of echo so the menus feel like a console front-end, not a calculator.

import type { Synth } from "@ui/lib/synth.ts";

export type UiSound =
  "move" | "confirm" | "back" | "start" | "equip" | "blip" | "boom" | "guide";

export function playUiSound(synth: Synth, sound: UiSound): void {
  switch (sound) {
    case "guide":
      // The "go this way" beacon: a soft sonar ping in step with the guidance
      // arrow's blink (~once a second while the way is clear). A gentle sine
      // pulse with a glassy octave sparkle and a breath of echo — it sits at
      // the very bottom of the mix, a nudge onward, never an alert. Repeats
      // often, so it stays among the quietest and shortest voices in the set.
      synth.tone({
        type: "sine",
        from: 1245,
        durationMs: 70,
        volume: 0.02,
        echo: 0.18,
      });
      synth.tone({
        type: "sine",
        from: 2490,
        durationMs: 40,
        volume: 0.01,
        echo: 0.15,
      });
      break;
    case "blip":
      // The letter-print tick: the dry, quiet square pip heard under scrolling
      // 16-bit dialogue as each character lands. Fired many times per line, so
      // it stays the shortest and softest voice in the set — a whisper of a
      // chip pulse, never a menu blip's full "blip".
      synth.tone({ type: "square", from: 640, durationMs: 16, volume: 0.02 });
      break;
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
    case "boom":
      // The moon going up: a cracking sub-detonation, a long lowpass rumble,
      // and a falling scream, all pushed into the echo bus so the blast hangs
      // in the air before the warp picker opens. The title screen's loudest
      // moment by design — a secret payoff, not a menu tick.
      synth.noise({
        durationMs: 260,
        volume: 0.09,
        filter: { type: "highpass", frequency: 900 },
        echo: 0.3,
      });
      synth.noise({
        durationMs: 900,
        volume: 0.08,
        delayMs: 40,
        filter: { type: "lowpass", frequency: 700 },
        echo: 0.45,
      });
      synth.tone({
        type: "sawtooth",
        from: 260,
        to: 28,
        durationMs: 700,
        volume: 0.07,
        detuneCents: 12,
        echo: 0.4,
      });
      synth.tone({
        type: "sine",
        from: 1600,
        to: 160,
        durationMs: 520,
        volume: 0.05,
        delayMs: 70,
        echo: 0.45,
      });
      break;
    case "equip": {
      // Two blades crossing: a metallic double-clang. Each strike is a bright
      // bandpass noise chink under a pair of inharmonic steel partials (the
      // non-octave 3:2-ish ratio is what reads as "metal", not "note"); the
      // parry lands a beat after the first strike and rings out into the echo
      // bus for the WoW-style "shiiing".
      const clash = (delayMs: number, ring: number) => {
        synth.noise({
          durationMs: 40,
          volume: 0.05,
          delayMs,
          filter: { type: "bandpass", frequency: 3200, q: 1.4 },
        });
        synth.tone({
          type: "square",
          from: 1560,
          to: 1480,
          durationMs: 70,
          volume: 0.04,
          delayMs,
          detuneCents: 9,
          echo: ring,
        });
        synth.tone({
          type: "sawtooth",
          from: 2340,
          to: 2210,
          durationMs: 90,
          volume: 0.03,
          delayMs: delayMs + 4,
          detuneCents: 12,
          echo: ring,
        });
        synth.tone({
          type: "sine",
          from: 3130,
          durationMs: 120,
          volume: 0.02,
          delayMs: delayMs + 8,
          echo: ring,
        });
      };
      clash(0, 0.18);
      clash(85, 0.3);
      break;
    }
  }
}
