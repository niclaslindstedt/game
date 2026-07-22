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
        // Repair kits now STASH into the consumable dock rather than firing on
        // contact — so the pickup is a soft metallic "tuck the toolbox away"
        // click, leaving the satisfying ratchet-and-ring mend chime for the
        // moment it's actually spent (see the repairKitUsed case).
        synth.noise({
          durationMs: 45,
          volume: 0.02,
          filter: { type: "bandpass", frequency: 2200, q: 1 },
        });
        synth.tone({
          type: "triangle",
          from: 660,
          durationMs: 70,
          volume: 0.03,
          delayMs: 30,
        });
      } else if (event.kind === "drink" || event.kind === "medkit") {
        // Medkits and stamina potions now STASH into the consumable dock rather
        // than firing on contact — so the pickup is a soft "tuck it into the
        // pouch" click (a low cloth rustle + a quiet blip), leaving the
        // satisfying heal/fizz chime for the moment it's actually spent (see the
        // medkitUsed / staminaPotionUsed cases). The drink stows a touch lower
        // than the kit so the two read apart.
        synth.noise({
          durationMs: 45,
          volume: 0.02,
          filter: { type: "lowpass", frequency: 1400 },
        });
        synth.tone({
          type: "triangle",
          from: event.kind === "drink" ? 466 : 587,
          durationMs: 70,
          volume: 0.03,
          delayMs: 30,
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
      }
      return true;

    case "medkitUsed": {
      // Spending a kit: the warm two-note mend (a major fifth up) with a soft
      // octave glow — the satisfying "patched up" chime. A bigger kit
      // (`tier` ≥ LARGE) rings a brighter bell on top so the grade is audible.
      synth.tone({
        type: "triangle",
        from: 523,
        durationMs: 90,
        volume: 0.055,
      });
      synth.tone({
        type: "triangle",
        from: 784,
        durationMs: 150,
        volume: 0.055,
        delayMs: 90,
      });
      synth.tone({
        type: "sine",
        from: 1568,
        durationMs: 150,
        volume: 0.03,
        delayMs: 90,
        echo: 0.25,
      });
      if (event.tier >= 2) {
        synth.tone({
          type: "sine",
          from: 2093,
          durationMs: 200,
          volume: 0.022,
          delayMs: 180,
          echo: 0.4,
        });
      }
      return true;
    }

    case "staminaPotionUsed": {
      // Draining a stamina potion: a fizzy hiss cracking open, then a quick
      // two-note lift as the legs come back under the hero.
      synth.noise({
        durationMs: 90,
        volume: 0.03,
        filter: { type: "highpass", frequency: 3200 },
      });
      synth.tone({
        type: "square",
        from: 588,
        to: 784,
        durationMs: 120,
        volume: 0.045,
        delayMs: 60,
        detuneCents: 6,
      });
      synth.tone({
        type: "sine",
        from: 1568,
        durationMs: 120,
        volume: 0.025,
        delayMs: 150,
        echo: 0.25,
      });
      return true;
    }

    case "manaPotionUsed": {
      // Draining a blue gatorade: the same fizzy crack as the energy drink, but
      // the two-note lift rings HIGHER and glassier — arcane refreshment.
      synth.noise({
        durationMs: 90,
        volume: 0.03,
        filter: { type: "highpass", frequency: 3600 },
      });
      synth.tone({
        type: "triangle",
        from: 784,
        to: 1046,
        durationMs: 140,
        volume: 0.045,
        delayMs: 60,
        detuneCents: 5,
        echo: 0.25,
      });
      synth.tone({
        type: "sine",
        from: 2093,
        durationMs: 120,
        volume: 0.022,
        delayMs: 160,
        echo: 0.3,
      });
      return true;
    }

    case "repairKitUsed": {
      // Spending a repair kit: the toolbox at work — two ratchet clicks, then
      // the mended edge rings bright (the chime that used to fire on pickup).
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
      synth.tone({
        type: "sine",
        from: 1976,
        durationMs: 180,
        volume: 0.025,
        delayMs: 180,
        echo: 0.3,
      });
      return true;
    }

    case "mercyDrop": {
      // The guardian's arrival: a soft, consonant halo of sound — a rising
      // major arpeggio of sine bells (C6–E6–G6–C7) under a shimmering high
      // sine, all wet with echo. Gentle (a rescue, not a fanfare) and pitched
      // above the drop's own tick so the two layer rather than clash.
      [1047, 1319, 1568, 2093].forEach((freq, i) =>
        synth.tone({
          type: "sine",
          from: freq,
          durationMs: 260,
          volume: 0.032,
          delayMs: i * 90,
          echo: 0.4,
        }),
      );
      synth.tone({
        type: "sine",
        from: 3136,
        durationMs: 220,
        volume: 0.014,
        delayMs: 360,
        echo: 0.5,
      });
      return true;
    }

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
