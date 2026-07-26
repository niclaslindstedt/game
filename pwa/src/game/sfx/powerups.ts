// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The POWERUPS' own sounds — the beats the powers throw while they run, as
// opposed to the bright "power ON" flourish a pickup plays when it is spent
// (that stays in pickups.ts with the rest of the loot audio).
//
// The mix follows the house rules: the FREQUENT ones (a shield eating a blow,
// a blow passing through a spectral hero) are the quietest and shortest in the
// game — they can fire several times a second — while the two that happen once
// in a run's worth of danger (a shield shattering, a ward refusing a killing
// blow) are allowed the echo bus and the top of the volume band.

import type { GameEvent } from "@game/core";

import type { Synth } from "@ui/lib/synth.ts";

/** Play the sound for a powerup event; false when it isn't one. */
export function playPowerupSound(synth: Synth, event: GameEvent): boolean {
  switch (event.type) {
    case "meteorFall":
      // MOONFALL landing: a dead-weight rock hitting regolith — a low lowpassed
      // thud with a short gravel crack over it. No ring: this is stone, not
      // ordnance, and it repeats every half second, so it stays dry.
      synth.noise({
        durationMs: 130,
        volume: 0.055,
        filter: { type: "lowpass", frequency: 340 },
      });
      synth.tone({
        type: "sine",
        from: 120,
        to: 40,
        durationMs: 180,
        volume: 0.045,
      });
      synth.noise({
        durationMs: 45,
        volume: 0.03,
        delayMs: 20,
        filter: { type: "bandpass", frequency: 1600, q: 1.1 },
      });
      return true;

    case "voidWave":
      // THE UNMAKING: a swell that falls away instead of rising — a descending
      // sine under a wide, filtered wash, so the wave reads as taking
      // something out of the room rather than adding to it.
      synth.tone({
        type: "sine",
        from: 520,
        to: 90,
        durationMs: 420,
        volume: 0.05,
        detuneCents: 12,
        echo: 0.35,
      });
      synth.tone({
        type: "triangle",
        from: 260,
        to: 60,
        durationMs: 380,
        volume: 0.03,
        delayMs: 30,
      });
      synth.noise({
        durationMs: 260,
        volume: 0.025,
        filter: { type: "bandpass", frequency: 900, q: 0.7 },
      });
      return true;

    case "barrierAbsorbed":
      // The BLAST SHIELD eating a blow: one glassy tick. This can fire on every
      // contact hit, so it is the quietest sound the game makes.
      synth.tone({
        type: "triangle",
        from: 1180,
        durationMs: 45,
        volume: 0.022,
        filter: { type: "bandpass", frequency: 2200, q: 1.4 },
      });
      return true;

    case "barrierBroke":
      // The shell giving up: a bright shatter — a hard noise crack, then two
      // falling shards. The player must hear that the protection is GONE.
      synth.noise({
        durationMs: 90,
        volume: 0.07,
        filter: { type: "highpass", frequency: 1800 },
      });
      [1568, 1046].forEach((freq, i) =>
        synth.tone({
          type: "triangle",
          from: freq,
          to: freq * 0.55,
          durationMs: 160,
          volume: 0.045,
          delayMs: 40 + i * 70,
          echo: 0.3,
        }),
      );
      return true;

    case "wardHeld":
      // CONTINUITY PROTOCOL refusing a killing blow — the single most important
      // beat a run has. A struck gold bell over a rising swell, wet with echo:
      // the one powerup sound written to be unmistakable through everything
      // else happening at the moment the hero should have died.
      [784, 1175, 1568].forEach((freq, i) =>
        synth.tone({
          type: "sine",
          from: freq,
          durationMs: 480,
          volume: 0.055,
          delayMs: i * 60,
          detuneCents: 5,
          echo: 0.5,
        }),
      );
      synth.tone({
        type: "triangle",
        from: 196,
        to: 392,
        durationMs: 320,
        volume: 0.04,
        echo: 0.4,
      });
      return true;

    case "playerPhased":
      // A blow passing clean through the spectral hero: a breath of air where a
      // hit should have been. Deliberately almost nothing — the ABSENCE of the
      // usual thud is the feedback.
      synth.noise({
        durationMs: 110,
        volume: 0.02,
        filter: { type: "bandpass", frequency: 2600, q: 0.6 },
      });
      synth.tone({
        type: "sine",
        from: 880,
        to: 1320,
        durationMs: 130,
        volume: 0.018,
      });
      return true;

    default:
      return false;
  }
}
