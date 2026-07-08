// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Pickup and loot sounds: collecting, dropping, equipping, and powers
// winding up or down. Rewards are consonant and bright — triangle and sine
// steps upward, with echo sparkle scaling up for the rarer finds.

import type { GameEvent } from "@game/core";

import type { Synth } from "@ui/lib/synth.ts";

/** Play the sound for a loot/pickup event; false when it isn't one. */
export function playPickupSound(synth: Synth, event: GameEvent): boolean {
  switch (event.type) {
    case "itemCollected":
      if (event.kind === "equipment") {
        // The treasure flourish — brighter and wetter for magic+ finds.
        const rare = event.tier !== "regular";
        [520, 780, rare ? 1180 : 1040].forEach((freq, i) =>
          synth.tone({
            type: "triangle",
            from: freq,
            durationMs: 90,
            volume: 0.055,
            delayMs: i * 70,
            detuneCents: rare ? 7 : 0,
            echo: rare ? 0.35 : 0.15,
          }),
        );
        if (rare) {
          synth.tone({
            type: "sine",
            from: 2360,
            durationMs: 120,
            volume: 0.02,
            delayMs: 220,
            echo: 0.45,
          });
        }
      } else if (event.kind === "xp") {
        // The golden arrow: a rising ring with a bell on top.
        synth.tone({
          type: "square",
          from: 440,
          to: 880,
          durationMs: 110,
          volume: 0.045,
        });
        synth.tone({
          type: "sine",
          from: 1320,
          durationMs: 150,
          volume: 0.04,
          delayMs: 90,
          echo: 0.3,
        });
      } else if (event.kind === "repair") {
        // The toolbox: two ratchet clicks, then the mended edge rings.
        synth.noise({
          durationMs: 35,
          volume: 0.05,
          filter: { type: "bandpass", frequency: 2600, q: 1.2 },
        });
        synth.noise({
          durationMs: 35,
          volume: 0.05,
          delayMs: 70,
          filter: { type: "bandpass", frequency: 2600, q: 1.2 },
        });
        synth.tone({
          type: "triangle",
          from: 988,
          durationMs: 140,
          volume: 0.05,
          delayMs: 140,
        });
      } else if (event.kind === "ability") {
        // A power surging on: a wide rising sweep into a hanging shimmer.
        synth.tone({
          type: "square",
          from: 220,
          to: 880,
          durationMs: 180,
          volume: 0.045,
          detuneCents: 8,
          echo: 0.3,
        });
        synth.tone({
          type: "sine",
          from: 1650,
          durationMs: 220,
          volume: 0.04,
          delayMs: 160,
          echo: 0.4,
        });
      } else {
        // The medkit: a warm two-note mend with a soft octave glow.
        synth.tone({
          type: "triangle",
          from: 523,
          durationMs: 90,
          volume: 0.055,
        });
        synth.tone({
          type: "triangle",
          from: 784,
          durationMs: 130,
          volume: 0.055,
          delayMs: 90,
        });
        synth.tone({
          type: "sine",
          from: 1568,
          durationMs: 120,
          volume: 0.02,
          delayMs: 90,
        });
      }
      return true;

    case "itemDropped":
      // Loot hitting the regolith: a tick and a puff of dust.
      synth.tone({ type: "square", from: 440, durationMs: 45, volume: 0.028 });
      synth.noise({
        durationMs: 30,
        volume: 0.015,
        filter: { type: "lowpass", frequency: 600 },
      });
      return true;

    case "autoEquipped":
      // The replacement clacking into the hand (mirrors the UI equip).
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
      return true;

    case "abilityStarted": {
      // Enabling a powerup: a bright ascending power-up flourish. A rising saw
      // sweep swells underneath a four-note arpeggio (C–E–G–C), capped with a
      // shimmering bell — the unmistakable "power ON" moment.
      [523, 659, 784, 1047].forEach((freq, i) =>
        synth.tone({
          type: "square",
          from: freq,
          durationMs: 90,
          volume: 0.05,
          delayMs: i * 55,
          detuneCents: 7,
          echo: 0.3,
        }),
      );
      synth.tone({
        type: "sawtooth",
        from: 180,
        to: 900,
        durationMs: 240,
        volume: 0.04,
        detuneCents: 10,
        echo: 0.3,
      });
      synth.tone({
        type: "sine",
        from: 2093,
        durationMs: 260,
        volume: 0.025,
        delayMs: 230,
        echo: 0.45,
      });
      return true;
    }

    case "abilityEnded":
      // The power winding down: a soft falling sigh into the echo.
      synth.tone({
        type: "triangle",
        from: 700,
        to: 320,
        durationMs: 200,
        volume: 0.04,
        echo: 0.25,
      });
      return true;

    default:
      return false;
  }
}
