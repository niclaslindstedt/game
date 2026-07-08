// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// World and movement sounds: jumping, landing, doors, dialogue — the level
// furniture. Small, physical sounds: filtered noise stands in for dust and
// mechanisms, and only the rare ones (a door unlocking) get any echo.

import type { GameEvent } from "@game/core";

import type { Synth } from "@ui/lib/synth.ts";

/** Play the sound for a world/movement event; false when it isn't one. */
export function playWorldSound(synth: Synth, event: GameEvent): boolean {
  switch (event.type) {
    case "jump":
      // The rising boing (moon gravity edition), with a soft sine top.
      synth.tone({
        type: "square",
        from: 220,
        to: 660,
        durationMs: 130,
        volume: 0.032,
      });
      synth.tone({
        type: "sine",
        from: 440,
        to: 1320,
        durationMs: 130,
        volume: 0.015,
      });
      return true;

    case "land":
      // Boots in regolith: a dull lowpass puff.
      synth.noise({
        durationMs: 60,
        volume: 0.03,
        filter: { type: "lowpass", frequency: 450 },
      });
      return true;

    case "doorOpened":
      // The lock giving way: a heavy clunk, then the slide up and open.
      synth.noise({
        durationMs: 60,
        volume: 0.06,
        filter: { type: "lowpass", frequency: 700 },
      });
      synth.tone({
        type: "square",
        from: 220,
        to: 440,
        durationMs: 260,
        volume: 0.045,
        delayMs: 60,
        detuneCents: 6,
        echo: 0.25,
      });
      return true;

    case "dialogueStarted":
      // A speaker takes the stage: two knocks with a glassy edge.
      synth.tone({ type: "square", from: 392, durationMs: 70, volume: 0.045 });
      synth.tone({
        type: "square",
        from: 523,
        durationMs: 110,
        volume: 0.045,
        delayMs: 80,
      });
      synth.tone({
        type: "sine",
        from: 1046,
        durationMs: 90,
        volume: 0.018,
        delayMs: 80,
      });
      return true;

    case "enemyLastWords":
      // A unique mob's death scene takes the stage: not the arrival knock but
      // a parting breath — a soft detuned tone sinking into the echo bus under
      // a faint high shimmer. Quiet by design; the kill thud already landed.
      synth.tone({
        type: "triangle",
        from: 330,
        to: 196,
        durationMs: 440,
        volume: 0.05,
        detuneCents: 8,
        echo: 0.4,
      });
      synth.tone({
        type: "sine",
        from: 990,
        to: 660,
        durationMs: 500,
        volume: 0.016,
        delayMs: 40,
        echo: 0.5,
      });
      return true;

    case "wellSwallowed":
      // A black hole swallows a mob: a deep spiral down into nothing —
      // a sine dive with a swallowed puff of filtered noise.
      synth.tone({
        type: "sine",
        from: 320,
        to: 48,
        durationMs: 320,
        volume: 0.05,
        detuneCents: 10,
        echo: 0.3,
      });
      synth.noise({
        durationMs: 160,
        volume: 0.025,
        delayMs: 120,
        filter: { type: "lowpass", frequency: 320 },
      });
      return true;

    case "apparitionVanished":
      // An apparition dissolves: a glassy shimmer rising out of hearing,
      // more sigh than event — the figure was never really there.
      synth.tone({
        type: "sine",
        from: 880,
        to: 1760,
        durationMs: 420,
        volume: 0.022,
        echo: 0.5,
      });
      synth.tone({
        type: "triangle",
        from: 440,
        to: 660,
        durationMs: 300,
        volume: 0.018,
        delayMs: 60,
        echo: 0.4,
      });
      return true;

    default:
      return false;
  }
}
