// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Jingles: the multi-note fanfares for the game's big beats — level-ups,
// story finds, boss kills, victory, defeat. Rare by definition, so these
// get the full 16-bit treatment: harmonized layers (melody + sine octave,
// or a triangle root under brass squares) and a generous echo send.

import type { GameEvent } from "@game/core";

import type { Synth } from "@ui/lib/synth.ts";

/**
 * The ACHIEVEMENT chime: a badge landing on the shelf. App-triggered (the
 * unlock ledger lives app-side, so there is no engine event to key on), and
 * deliberately a notch below the level-up DING — a quick major arpeggio with
 * glass octaves and one high sparkle, no root swell, no landing chord, so a
 * badge feels great without outshining a ding or a unique find.
 */
export function playAchievementJingle(synth: Synth): void {
  // The rise: G-C-E skyward, glass octave riding each step.
  [784, 1047, 1319].forEach((freq, i) => {
    synth.tone({
      type: "triangle",
      from: freq,
      durationMs: 120,
      volume: 0.05,
      delayMs: i * 70,
      echo: 0.3,
    });
    synth.tone({
      type: "sine",
      from: freq * 2,
      durationMs: 100,
      volume: 0.018,
      delayMs: i * 70,
      echo: 0.35,
    });
  });
  // A thin shimmer under the rise — air, not a note.
  synth.noise({
    durationMs: 260,
    volume: 0.01,
    delayMs: 40,
    filter: { type: "highpass", frequency: 6800 },
    echo: 0.35,
  });
  // One last sparkle drifting off in the echo.
  synth.tone({
    type: "sine",
    from: 2093,
    to: 2637,
    durationMs: 220,
    volume: 0.014,
    delayMs: 260,
    echo: 0.5,
  });
}

/** Play the jingle for a milestone event; false when it isn't one. */
export function playJingle(synth: Synth, event: GameEvent): boolean {
  switch (event.type) {
    case "levelUp":
      // The DING — sized to fill the engine's ding-celebration window
      // (LEVELING.dingCelebrationMs) while the golden burn plays, so sound
      // and light are one moment. Anatomy of the triumph:
      // 1. A warm root swell underneath — the ground the fanfare stands on.
      synth.tone({
        type: "triangle",
        from: 131, // C3
        durationMs: 950,
        volume: 0.045,
        attackMs: 40,
        detuneCents: 6,
        echo: 0.2,
      });
      // 2. A holy-light shimmer washing over — filtered air, not a note
      //    (noise fades over its length, so it rides under the flourish).
      synth.noise({
        durationMs: 620,
        volume: 0.016,
        delayMs: 90,
        filter: { type: "highpass", frequency: 6200 },
        echo: 0.4,
      });
      // 3. The harp flourish: a fast C-major run skyward, glass octaves on
      //    top — the "burst" of the ding.
      [523, 659, 784, 1047, 1319].forEach((freq, i) => {
        synth.tone({
          type: "triangle",
          from: freq,
          durationMs: 130,
          volume: 0.06,
          delayMs: i * 55,
          echo: 0.3,
        });
        synth.tone({
          type: "sine",
          from: freq * 2,
          durationMs: 110,
          volume: 0.02,
          delayMs: i * 55,
          echo: 0.35,
        });
      });
      // 4. The landing: a held, brassy C-major chord blooming where the run
      //    tops out, detuned into a section.
      [523, 659, 784].forEach((freq) => {
        synth.tone({
          type: "square",
          from: freq,
          durationMs: 480,
          volume: 0.032,
          delayMs: 330,
          attackMs: 25,
          detuneCents: 8,
          echo: 0.35,
        });
      });
      // 5. A last high sparkle drifting off in the echo as the burn fades.
      synth.tone({
        type: "sine",
        from: 2093,
        to: 3136,
        durationMs: 320,
        volume: 0.016,
        delayMs: 620,
        echo: 0.5,
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

    case "bossFled":
      // The coward's exit: reality unzipping — a long rising saw sweep with
      // a glassy shimmer on top, snapped shut by a bright crack instead of
      // a corpse hitting the floor.
      synth.tone({
        type: "sawtooth",
        from: 110,
        to: 1760,
        durationMs: 600,
        volume: 0.055,
        detuneCents: 14,
        echo: 0.35,
      });
      synth.tone({
        type: "sine",
        from: 1568,
        to: 3136,
        durationMs: 420,
        volume: 0.025,
        delayMs: 180,
        echo: 0.5,
      });
      synth.noise({
        durationMs: 140,
        volume: 0.06,
        delayMs: 600,
        filter: { type: "highpass", frequency: 2400 },
        echo: 0.3,
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
