// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Pickup and loot sounds: collecting, dropping, equipping, and powers
// winding up or down. Rewards are consonant and bright — triangle and sine
// steps upward, with echo sparkle scaling up for the rarer finds.

import type { GameEvent } from "@game/menu";

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
        // An XP SCROLL read on the run: parchment unrolling in a short dry
        // rasp, then the script catching — a rising arcane shimmer with a bell
        // over the top. It is not a pickup, it is a spell going off, and the
        // thirty seconds it lights are worth announcing. Kept byte-identical to
        // `content/sounds/item_collected_xp.yaml`, which is the shipped voice
        // (the catalog answers first — see sfx/index.ts); this is the fallback,
        // and `tests/sound_catalog_test.ts` proves the two agree.
        synth.noise({
          durationMs: 90,
          volume: 0.035,
          filter: { type: "bandpass", frequency: 4200, q: 0.9 },
        });
        synth.tone({
          type: "triangle",
          from: 520,
          to: 1560,
          durationMs: 240,
          volume: 0.045,
          detuneCents: 9,
          delayMs: 40,
          echo: 0.35,
        });
        synth.tone({
          type: "sine",
          from: 1980,
          durationMs: 320,
          volume: 0.035,
          delayMs: 200,
          echo: 0.45,
        });
      } else if (event.kind === "repair") {
        // A repair kit stashed into the consumable dock: the toolbox latch
        // shutting — two hard metallic clicks — then a bright fourth up
        // (G5 → C6) on a detuned triangle, so it rings like struck metal. All
        // hardware where the medkit below it is all cloth. The satisfying
        // ratchet-and-ring mend belongs to the moment it is actually spent (see
        // the repairKitUsed case). Kept byte-identical to
        // `content/sounds/item_collected_repair.yaml`, which is the shipped
        // voice (the catalog answers first — see sfx/index.ts); this is the
        // fallback, and `tests/sound_catalog_test.ts` proves the two agree.
        synth.noise({
          durationMs: 22,
          volume: 0.026,
          filter: { type: "bandpass", frequency: 2600, q: 1.8 },
        });
        synth.noise({
          durationMs: 22,
          volume: 0.02,
          delayMs: 55,
          filter: { type: "bandpass", frequency: 3400, q: 1.8 },
        });
        synth.tone({
          type: "triangle",
          from: 784,
          durationMs: 50,
          volume: 0.028,
          delayMs: 40,
          detuneCents: 8,
        });
        synth.tone({
          type: "triangle",
          from: 1047,
          durationMs: 90,
          volume: 0.028,
          delayMs: 95,
          detuneCents: 8,
          echo: 0.15,
        });
      } else if (event.kind === "medkit") {
        // A medkit stashed into the consumable dock: soft canvas into the pouch,
        // then a major third up (C5 → E5) on a triangle with an attack on it so
        // it swells rather than blips, under an octave of sine for glow. No
        // click anywhere in it — what the hero heals with sounds like cloth, not
        // hardware — and a THIRD where medkitUsed is a loud FIFTH, because the
        // mend chime belongs to spending the kit rather than finding it. Kept
        // byte-identical to `content/sounds/item_collected_medkit.yaml` — see
        // the note on the repair branch above.
        synth.noise({
          durationMs: 60,
          volume: 0.02,
          filter: { type: "lowpass", frequency: 1200 },
        });
        // Butted end to end rather than overlapped, so the swell stays under
        // medkitUsed's own peak — stacking them made the find as loud as
        // spending it.
        synth.tone({
          type: "triangle",
          from: 523,
          durationMs: 60,
          volume: 0.03,
          attackMs: 8,
          delayMs: 25,
        });
        synth.tone({
          type: "triangle",
          from: 659,
          durationMs: 110,
          volume: 0.03,
          attackMs: 8,
          delayMs: 85,
        });
        synth.tone({
          type: "sine",
          from: 1319,
          durationMs: 120,
          volume: 0.018,
          delayMs: 85,
          echo: 0.15,
        });
      } else if (event.kind === "drink") {
        // A stamina potion stows the same way, but stays the plain low blip the
        // dock pickups used to share (a cloth rustle + one note) — the fizz
        // belongs to draining it (see staminaPotionUsed).
        synth.noise({
          durationMs: 45,
          volume: 0.02,
          filter: { type: "lowpass", frequency: 1400 },
        });
        synth.tone({
          type: "triangle",
          from: 466,
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
