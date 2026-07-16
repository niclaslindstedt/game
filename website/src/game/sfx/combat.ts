// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Combat sounds: weapons, damage, kills, destruction. These fire constantly
// during play, so the mixing rules bite hardest here — shots are the
// quietest and shortest sounds in the game, player damage is the loudest.
// The 16-bit treatment layers each hit: an oscillator body plus a
// band-shaped noise transient, with pitch dives and lowpass booms giving
// kills and explosions their weight.

import { spellDef, type GameEvent } from "@game/core";

import type { Synth } from "@ui/lib/synth.ts";

/** Play the sound for a combat event; false when it isn't one. */
export function playCombatSound(synth: Synth, event: GameEvent): boolean {
  switch (event.type) {
    case "shot":
      if (event.weaponClass === "magic") {
        // An arcane zap: detuned triangle rise with a shimmer tail.
        synth.tone({
          type: "triangle",
          from: 620,
          to: 1240,
          durationMs: 80,
          volume: 0.04,
          detuneCents: 8,
          echo: 0.25,
        });
        synth.tone({
          type: "sine",
          from: 1650,
          durationMs: 70,
          volume: 0.02,
          delayMs: 45,
          echo: 0.3,
        });
      } else {
        // The pew: a fast square dive with a muzzle-crack of noise.
        synth.tone({
          type: "square",
          from: 880,
          to: 220,
          durationMs: 55,
          volume: 0.028,
        });
        synth.noise({
          durationMs: 30,
          volume: 0.018,
          filter: { type: "highpass", frequency: 2500 },
        });
      }
      return true;

    case "swing":
      // Air being cut: a band-shaped whoosh over a low triangle thunk.
      synth.noise({
        durationMs: 70,
        volume: 0.045,
        filter: { type: "bandpass", frequency: 900, q: 0.8 },
      });
      synth.tone({
        type: "triangle",
        from: 240,
        to: 130,
        durationMs: 80,
        volume: 0.04,
      });
      return true;

    case "enemyHit":
      // Body blow: a mid square thud plus a click of contact.
      synth.tone({
        type: "square",
        from: event.crit ? 340 : 220,
        to: event.crit ? 190 : 150,
        durationMs: event.crit ? 90 : 60,
        volume: event.crit ? 0.07 : 0.045,
      });
      synth.noise({
        durationMs: 25,
        volume: event.crit ? 0.03 : 0.02,
        filter: { type: "bandpass", frequency: 1800, q: 1 },
      });
      return true;

    case "enemyKilled":
      // The takedown: a saw dive to the floor, a lowpass boom, and a spray
      // of debris sizzle just behind it.
      synth.tone({
        type: "sawtooth",
        from: 420,
        to: 50,
        durationMs: 220,
        volume: 0.05,
      });
      synth.noise({
        durationMs: 180,
        volume: 0.05,
        filter: { type: "lowpass", frequency: 500 },
      });
      synth.noise({
        durationMs: 120,
        volume: 0.025,
        delayMs: 50,
        filter: { type: "highpass", frequency: 3000 },
      });
      return true;

    case "playerHurt":
      // Must cut through everything: a wide detuned saw buzz dropping to
      // the sub register, with a dull body-impact under it. Mix ceiling.
      synth.tone({
        type: "sawtooth",
        from: event.crit ? 190 : 150,
        to: 55,
        durationMs: event.crit ? 260 : 200,
        volume: event.crit ? 0.12 : 0.09,
        detuneCents: 12,
      });
      synth.noise({
        durationMs: 80,
        volume: 0.05,
        filter: { type: "lowpass", frequency: 800 },
      });
      return true;

    case "playerDodge":
      // A clean sidestep: a short airy whiff sweeping up and out of the way,
      // no impact body — the blow that never landed.
      synth.noise({
        durationMs: 110,
        volume: 0.05,
        filter: { type: "bandpass", frequency: 1600, q: 0.7 },
      });
      synth.tone({
        type: "sine",
        from: 320,
        to: 760,
        durationMs: 120,
        volume: 0.035,
      });
      return true;

    case "enemyShot":
      // A hostile pew: lower and meaner than the hero's own shot, so return
      // fire reads as a threat arriving, not the player's output.
      synth.tone({
        type: "square",
        from: 520,
        to: 160,
        durationMs: 70,
        volume: 0.03,
      });
      synth.noise({
        durationMs: 35,
        volume: 0.02,
        filter: { type: "highpass", frequency: 1800 },
      });
      return true;

    case "enemyShielded":
      // The blow bouncing off the shield: a hard metallic tink with no give —
      // clearly a wall, not a wound.
      synth.tone({
        type: "triangle",
        from: 1900,
        to: 1500,
        durationMs: 70,
        volume: 0.04,
      });
      synth.noise({
        durationMs: 30,
        volume: 0.02,
        filter: { type: "bandpass", frequency: 3200, q: 2 },
      });
      return true;

    case "enemyDodge":
    case "enemyMiss":
      // A blow that hit only air: a short dry whiff, no impact body. Quieter
      // and higher than the hero's own dodge so a whiffed swing reads as a
      // near-miss, not a takedown — it fires often, so it stays out of the way.
      synth.noise({
        durationMs: 60,
        volume: 0.022,
        filter: { type: "bandpass", frequency: 2200, q: 0.8 },
      });
      return true;

    case "lightning":
      // The storm strike: a bright crack, a falling zap, thunder in the echo.
      synth.noise({
        durationMs: 90,
        volume: 0.05,
        filter: { type: "highpass", frequency: 2500 },
        echo: 0.3,
      });
      synth.tone({
        type: "square",
        from: 1400,
        to: 180,
        durationMs: 120,
        volume: 0.04,
        echo: 0.25,
      });
      return true;

    case "weaponBroke":
    case "armorBroke":
      // Something giving out: a metallic crack, a ping of shrapnel, and the
      // pieces sagging away down a saw drop. Armor wearing through shares the
      // weapon's snap — same "your kit just failed" alarm, same urgency.
      synth.noise({
        durationMs: 80,
        volume: 0.07,
        filter: { type: "bandpass", frequency: 3000, q: 1.5 },
      });
      synth.tone({
        type: "sine",
        from: 2600,
        durationMs: 90,
        volume: 0.03,
        delayMs: 20,
        echo: 0.3,
      });
      synth.tone({
        type: "sawtooth",
        from: 520,
        to: 90,
        durationMs: 240,
        volume: 0.06,
        delayMs: 40,
      });
      return true;

    case "nova":
      // A NOVA proc: a short arcane whump — a low burst and a rising shimmer,
      // deliberately smaller than the nuke (procs fire often).
      synth.noise({
        durationMs: 140,
        volume: 0.045,
        filter: { type: "lowpass", frequency: 1400 },
        echo: 0.15,
      });
      synth.tone({
        type: "triangle",
        from: 320,
        to: 900,
        durationMs: 150,
        volume: 0.03,
        delayMs: 15,
      });
      return true;

    case "spellCast": {
      // A cast: an arcane bloom shaped by the spell's school — a sharp zap for
      // an attack, a big shimmering whump for AOE, a warm swelling chord for a
      // defensive ward/heal. All get the echo tail so magic hangs in the air.
      const school = spellDef(event.spellId).category;
      if (school === "aoe") {
        synth.noise({
          durationMs: 200,
          volume: 0.05,
          filter: { type: "lowpass", frequency: 1600 },
          echo: 0.3,
        });
        synth.tone({
          type: "triangle",
          from: 300,
          to: 1100,
          durationMs: 220,
          volume: 0.045,
          echo: 0.3,
        });
      } else if (school === "defense") {
        synth.tone({
          type: "sine",
          from: 520,
          to: 880,
          durationMs: 260,
          volume: 0.05,
          echo: 0.35,
          detuneCents: 6,
        });
        synth.tone({
          type: "triangle",
          from: 780,
          to: 1320,
          durationMs: 240,
          volume: 0.03,
          delayMs: 40,
          echo: 0.3,
        });
      } else {
        // attack: a crisp rising zap with a shimmer flick.
        synth.tone({
          type: "square",
          from: 720,
          to: 1500,
          durationMs: 110,
          volume: 0.045,
          detuneCents: 8,
          echo: 0.25,
        });
        synth.tone({
          type: "sine",
          from: 1900,
          durationMs: 80,
          volume: 0.02,
          delayMs: 50,
          echo: 0.3,
        });
      }
      return true;
    }

    case "spellFizzled":
      // A refused cast: a short, dull descending buzz — the pool is dry or the
      // spell still cooling.
      synth.tone({
        type: "sawtooth",
        from: 360,
        to: 150,
        durationMs: 130,
        volume: 0.035,
        filter: { type: "lowpass", frequency: 900 },
      });
      return true;

    case "playerShielded":
      // A ward snapping up: a warm rising swell with a glassy top.
      synth.tone({
        type: "sine",
        from: 440,
        to: 760,
        durationMs: 240,
        volume: 0.05,
        echo: 0.3,
      });
      return true;

    case "spellHealed":
      // Arcane mending: a soft bright two-note lift, gentler than a medkit.
      synth.tone({
        type: "triangle",
        from: 660,
        to: 990,
        durationMs: 200,
        volume: 0.045,
        echo: 0.25,
      });
      return true;

    case "nuke":
      // The screen-clearer: sub detonation, long lowpass rumble, and a
      // falling scream, all sent to the echo so it hangs in the air.
      synth.noise({
        durationMs: 700,
        volume: 0.1,
        filter: { type: "lowpass", frequency: 900 },
        echo: 0.4,
      });
      synth.tone({
        type: "sawtooth",
        from: 300,
        to: 35,
        durationMs: 550,
        volume: 0.08,
        detuneCents: 10,
        echo: 0.35,
      });
      synth.tone({
        type: "sine",
        from: 1400,
        to: 200,
        durationMs: 380,
        volume: 0.045,
        delayMs: 60,
        echo: 0.4,
      });
      return true;

    default:
      return false;
  }
}
