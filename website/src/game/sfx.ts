// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Sound design: maps engine events to synthesized effects (lib/synth.ts).
// Every sound is described by oscillator/noise parameters — tweak numbers
// here, no audio files involved. The palette is deliberately NES: square
// waves for actions and damage, triangle for rewards and jingles, noise for
// percussion and impacts — no sines or saws, they read as "not 8-bit".

import type { GameEvent } from "@game/core";

import type { Synth } from "@ui/lib/synth.ts";

/** Menu/interface moments (not engine events — the menus are app-owned). */
export type UiSound = "move" | "confirm" | "back" | "start" | "equip";

export function playUiSound(synth: Synth, sound: UiSound): void {
  switch (sound) {
    case "move":
      // A single dry square blip, straight off an NES cursor.
      synth.tone({ type: "square", from: 880, durationMs: 45, volume: 0.04 });
      break;
    case "confirm":
      // Two rising square steps: "accepted".
      synth.tone({ type: "square", from: 660, durationMs: 60, volume: 0.05 });
      synth.tone({
        type: "square",
        from: 990,
        durationMs: 90,
        volume: 0.05,
        delayMs: 60,
      });
      break;
    case "back":
      // The confirm inverted: two falling steps.
      synth.tone({ type: "square", from: 660, durationMs: 60, volume: 0.04 });
      synth.tone({
        type: "square",
        from: 440,
        durationMs: 90,
        volume: 0.04,
        delayMs: 60,
      });
      break;
    case "start":
      // The run-start fanfare: a fast rising square arpeggio + snare hit.
      [523, 659, 784, 1047].forEach((freq, i) =>
        synth.tone({
          type: "square",
          from: freq,
          durationMs: 70,
          volume: 0.05,
          delayMs: i * 70,
        }),
      );
      synth.noise({ durationMs: 80, volume: 0.04, delayMs: 280 });
      break;
    case "equip":
      // Gear clacking into its slot: a snap of noise, then a bright ring.
      synth.noise({ durationMs: 35, volume: 0.04 });
      synth.tone({
        type: "square",
        from: 784,
        durationMs: 80,
        volume: 0.05,
        delayMs: 30,
      });
      break;
  }
}

export function playEventSounds(
  synth: Synth,
  events: readonly GameEvent[],
): void {
  for (const event of events) {
    switch (event.type) {
      case "shot":
        if (event.weaponClass === "magic") {
          // A rising triangle zap — softer than the guns, clearly arcane.
          synth.tone({
            type: "triangle",
            from: 620,
            to: 1240,
            durationMs: 80,
            volume: 0.045,
          });
        } else {
          // The classic pew: a fast square dive.
          synth.tone({
            type: "square",
            from: 880,
            to: 220,
            durationMs: 60,
            volume: 0.03,
          });
        }
        break;
      case "swing":
        // A whoosh of noise over a low triangle thunk.
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
        // The Mario-school rising square boing (moon gravity edition).
        synth.tone({
          type: "square",
          from: 220,
          to: 660,
          durationMs: 140,
          volume: 0.035,
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
        // An 8-bit pop: noise burst over a square drop to the floor.
        synth.noise({ durationMs: 160, volume: 0.05 });
        synth.tone({
          type: "square",
          from: 420,
          to: 55,
          durationMs: 220,
          volume: 0.06,
        });
        break;
      case "playerHurt":
        // Must cut through: the low harsh square buzz, loudest in the mix.
        synth.tone({
          type: "square",
          from: event.crit ? 190 : 150,
          to: 60,
          durationMs: event.crit ? 260 : 190,
          volume: event.crit ? 0.12 : 0.09,
        });
        synth.noise({ durationMs: 70, volume: 0.05 });
        break;
      case "itemCollected":
        if (event.kind === "equipment") {
          // A little "treasure" flourish — brighter for magic+ finds.
          [520, 780, event.tier === "regular" ? 1040 : 1180].forEach(
            (freq, i) =>
              synth.tone({
                type: "triangle",
                from: freq,
                durationMs: 90,
                volume: 0.06,
                delayMs: i * 70,
              }),
          );
        } else if (event.kind === "xp") {
          // The golden arrow: a rising ring — a taste of the level-up scale.
          synth.tone({
            type: "square",
            from: 440,
            to: 880,
            durationMs: 110,
            volume: 0.05,
          });
          synth.tone({
            type: "triangle",
            from: 1320,
            durationMs: 140,
            volume: 0.05,
            delayMs: 90,
          });
        } else if (event.kind === "repair") {
          // The toolbox: two ratchet clicks, then the mended edge rings.
          synth.noise({ durationMs: 35, volume: 0.05 });
          synth.noise({ durationMs: 35, volume: 0.05, delayMs: 70 });
          synth.tone({
            type: "triangle",
            from: 988,
            durationMs: 140,
            volume: 0.05,
            delayMs: 140,
          });
        } else if (event.kind === "ability") {
          // A power surging on: a fast rising sweep into a shimmer.
          synth.tone({
            type: "square",
            from: 220,
            to: 880,
            durationMs: 180,
            volume: 0.05,
          });
          synth.tone({
            type: "triangle",
            from: 1320,
            durationMs: 200,
            volume: 0.05,
            delayMs: 160,
          });
        } else {
          // The medkit: a warm two-note triangle mend.
          synth.tone({
            type: "triangle",
            from: 523,
            durationMs: 90,
            volume: 0.06,
          });
          synth.tone({
            type: "triangle",
            from: 784,
            durationMs: 130,
            volume: 0.06,
            delayMs: 90,
          });
        }
        break;
      case "itemDropped":
        // Loot hitting the regolith: a tiny square tick.
        synth.tone({ type: "square", from: 440, durationMs: 50, volume: 0.03 });
        break;
      case "lightning":
        // The storm ability's strike: a snap of noise over a falling zap.
        synth.noise({ durationMs: 90, volume: 0.05 });
        synth.tone({
          type: "square",
          from: 1400,
          to: 180,
          durationMs: 120,
          volume: 0.045,
        });
        break;
      case "abilityEnded":
        // The power winding down: a soft falling sigh.
        synth.tone({
          type: "triangle",
          from: 700,
          to: 320,
          durationMs: 200,
          volume: 0.04,
        });
        break;
      case "weaponBroke":
        // The blade snapping: a hard crack, then the pieces fall.
        synth.noise({ durationMs: 90, volume: 0.08 });
        synth.tone({
          type: "square",
          from: 520,
          to: 90,
          durationMs: 240,
          volume: 0.07,
          delayMs: 40,
        });
        break;
      case "autoEquipped":
        // The replacement clacking into the hand (mirrors the UI equip).
        synth.noise({ durationMs: 35, volume: 0.04 });
        synth.tone({
          type: "square",
          from: 784,
          durationMs: 80,
          volume: 0.05,
          delayMs: 30,
        });
        break;
      case "nuke":
        // The screen-clearer: a deep detonation under a long falling roar.
        synth.noise({ durationMs: 600, volume: 0.1 });
        synth.tone({
          type: "square",
          from: 300,
          to: 40,
          durationMs: 500,
          volume: 0.09,
        });
        synth.tone({
          type: "triangle",
          from: 1400,
          to: 200,
          durationMs: 350,
          volume: 0.05,
          delayMs: 60,
        });
        break;
      case "levelUp":
        // The five-note triangle fanfare, straight up the major scale.
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
      case "dialogueStarted":
        // A speaker takes the stage: two square knocks, "listen up".
        synth.tone({ type: "square", from: 392, durationMs: 70, volume: 0.05 });
        synth.tone({
          type: "square",
          from: 523,
          durationMs: 110,
          volume: 0.05,
          delayMs: 80,
        });
        break;
      case "storyItemCollected":
        // A plot piece: a slow, reverent triangle rise — this one matters.
        [392, 523, 784].forEach((freq, i) =>
          synth.tone({
            type: "triangle",
            from: freq,
            durationMs: 140,
            volume: 0.06,
            delayMs: i * 110,
          }),
        );
        break;
      case "doorOpened":
        // The lock giving way: a clunk of noise, then the slide up.
        synth.noise({ durationMs: 60, volume: 0.06 });
        synth.tone({
          type: "square",
          from: 220,
          to: 440,
          durationMs: 260,
          volume: 0.05,
          delayMs: 60,
        });
        break;
      case "bossDefeated":
        // The giant coming down: a long rumble under descending squares.
        synth.noise({ durationMs: 500, volume: 0.08 });
        [220, 165, 110, 82].forEach((freq, i) =>
          synth.tone({
            type: "square",
            from: freq,
            durationMs: 300,
            volume: 0.07,
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
        // The falling minor line, a noise thud on the last note.
        [392, 311, 262, 196].forEach((freq, i) =>
          synth.tone({
            type: "triangle",
            from: freq,
            durationMs: 220,
            volume: 0.07,
            delayMs: i * 160,
          }),
        );
        synth.noise({ durationMs: 200, volume: 0.05, delayMs: 480 });
        break;
    }
  }
}
