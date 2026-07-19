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

    case "wellDeath":
      // The hole swallows the HERO: the swallow dive, longer and lower, with a
      // heavier low rumble behind it — the same spiral, but this one is fatal.
      synth.tone({
        type: "sine",
        from: 360,
        to: 30,
        durationMs: 620,
        volume: 0.075,
        detuneCents: 12,
        echo: 0.45,
      });
      synth.noise({
        durationMs: 340,
        volume: 0.05,
        delayMs: 160,
        filter: { type: "lowpass", frequency: 240 },
        echo: 0.4,
      });
      return true;

    case "sandstormHit": {
      // The gust catches the hero and flattens him: a gritty sand rush (a long
      // band of hissy highpassed noise swelling in) over a dull body-drop thud
      // as he hits the dirt. The separate `playerHurt` cue carries the sting;
      // this is the WIND and the fall around it.
      synth.noise({
        durationMs: 520,
        volume: 0.05,
        filter: { type: "highpass", frequency: 900 },
        echo: 0.2,
      });
      synth.noise({
        durationMs: 120,
        volume: 0.055,
        delayMs: 60,
        filter: { type: "lowpass", frequency: 360 },
      });
      synth.tone({
        type: "triangle",
        from: 200,
        to: 70,
        durationMs: 300,
        volume: 0.045,
        delayMs: 60,
        detuneCents: 10,
      });
      return true;
    }

    case "knockoutRecovered":
      // He shakes it off and gets up: a quick, light rising triangle — relief,
      // not fanfare, well under the hurt ceiling.
      synth.tone({
        type: "triangle",
        from: 262,
        to: 523,
        durationMs: 200,
        volume: 0.035,
        detuneCents: 6,
        echo: 0.2,
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

    case "spareOffered":
      // A beaten unique kneels and the verdict lands on the table: a held
      // low question mark — two slow detuned steps that don't resolve,
      // hanging in the echo until the player answers.
      synth.tone({
        type: "triangle",
        from: 262,
        durationMs: 220,
        volume: 0.05,
        detuneCents: 8,
        echo: 0.35,
      });
      synth.tone({
        type: "triangle",
        from: 370,
        durationMs: 320,
        volume: 0.045,
        delayMs: 200,
        detuneCents: 8,
        echo: 0.45,
      });
      return true;

    case "companionJoined":
      // A spared figure takes the hero's side: a warm little oath — a rising
      // third with a glassy top, brighter than the dialogue knock but far
      // short of a jingle (the joining scene follows anyway).
      synth.tone({ type: "square", from: 523, durationMs: 90, volume: 0.045 });
      synth.tone({
        type: "square",
        from: 659,
        durationMs: 150,
        volume: 0.045,
        delayMs: 90,
        detuneCents: 5,
        echo: 0.25,
      });
      synth.tone({
        type: "sine",
        from: 1318,
        durationMs: 120,
        volume: 0.018,
        delayMs: 90,
        echo: 0.3,
      });
      return true;

    case "companionDowned":
      // A companion beaten to its knees: a dull body-drop thud under a short
      // falling tone — heavy, but under playerHurt's ceiling (an ally, not
      // the hero).
      synth.noise({
        durationMs: 90,
        volume: 0.05,
        filter: { type: "lowpass", frequency: 500 },
      });
      synth.tone({
        type: "triangle",
        from: 330,
        to: 165,
        durationMs: 260,
        volume: 0.045,
        detuneCents: 8,
      });
      return true;

    case "companionRevived":
      // Back on its feet: the downed thud inverted — a quick rising triangle
      // with a soft top, more relief than fanfare.
      synth.tone({
        type: "triangle",
        from: 196,
        to: 392,
        durationMs: 200,
        volume: 0.04,
      });
      synth.tone({
        type: "sine",
        from: 784,
        durationMs: 90,
        volume: 0.016,
        delayMs: 140,
      });
      return true;

    case "crateHit":
      // A blow biting a wooden crate: a short, dry knock — a low filtered thud
      // under a woody click, quiet so a flurry of hits doesn't drown the fight.
      synth.noise({
        durationMs: 40,
        volume: 0.04,
        filter: { type: "lowpass", frequency: 900 },
      });
      synth.tone({
        type: "square",
        from: 180,
        to: 130,
        durationMs: 55,
        volume: 0.03,
      });
      return true;

    case "crateBroken":
      // The crate gives way: a wooden crash — a burst of broadband noise (the
      // splintering) over a short falling tone (the box collapsing), a touch
      // meatier than a single hit so the break lands.
      synth.noise({
        durationMs: 150,
        volume: 0.075,
        filter: { type: "lowpass", frequency: 2200 },
      });
      synth.tone({
        type: "square",
        from: 200,
        to: 90,
        durationMs: 160,
        volume: 0.045,
        detuneCents: 8,
      });
      synth.tone({
        type: "triangle",
        from: 320,
        to: 160,
        durationMs: 120,
        volume: 0.025,
        delayMs: 30,
      });
      return true;

    case "hayBallHit":
      // A hay bale bumping the hero: a soft, muffled WHUMP — a low band of
      // noise (the straw) under a short low tone (the shove), gentle so a bale
      // caught in the lane doesn't nag on every overlap tick.
      synth.noise({
        durationMs: 120,
        volume: 0.05,
        filter: { type: "lowpass", frequency: 700 },
      });
      synth.tone({
        type: "sine",
        from: 150,
        to: 90,
        durationMs: 130,
        volume: 0.035,
      });
      return true;

    case "asteroidImpact": {
      // A meteor slamming the surface: a sharp crack of broadband noise on top
      // of a deep, echoing BOOM that drops away, with a grit-and-rubble tail —
      // the whole thing bigger than the hazard cues around it, but well under
      // the mix ceiling so a run of strikes never overwhelms the fight.
      synth.noise({
        durationMs: 90,
        volume: 0.09,
        filter: { type: "highpass", frequency: 1400 },
      });
      synth.tone({
        type: "sine",
        from: 150,
        to: 34,
        durationMs: 560,
        volume: 0.11,
        detuneCents: 14,
        echo: 0.4,
      });
      synth.noise({
        durationMs: 340,
        volume: 0.06,
        delayMs: 40,
        filter: { type: "lowpass", frequency: 420 },
        echo: 0.3,
      });
      return true;
    }

    default:
      return false;
  }
}
