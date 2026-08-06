// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Menu and interface sounds (app-owned moments, not engine events). The
// 16-bit read on classic cursor blips: every sound keeps its chip-style
// square core but gains a sine gloss layer, a touch of detune, or a breath
// of echo so the menus feel like a console front-end, not a calculator.

import type { Synth } from "@ui/lib/synth.ts";

// The UI SLICE only. Importing the run's bank here would park every kill,
// explosion and jingle in the app's entry chunk to click a menu button —
// the same reason this module is not re-exported from ./index.ts.
import { GENERATED_UI_SOUNDS } from "../../generated/sounds-ui.ts";

import { playSound } from "./play.ts";

// `shutter` is the one entry here with no hand-written fallback below it: it
// was authored as content from the start (content/sounds/ui_shutter.yaml)
// rather than lifted out of the old imperative bank, so the catalog is the only
// place it has ever existed.
export type UiSound =
  | "move"
  | "confirm"
  | "back"
  | "start"
  | "equip"
  | "blip"
  | "boom"
  | "guide"
  | "shutter";

export function playUiSound(synth: Synth, sound: UiSound): void {
  // The interface's sounds are content like every other (content/sounds/ui_*),
  // and this file keeps only the ones the catalog cannot hold — see
  // `playSunCharge`, whose shape rides a continuous charge level.
  if (playSound(synth, GENERATED_UI_SOUNDS, `ui_${sound}`)) return;
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
      // The title sun going supernova: the star COLLAPSES first — a short,
      // rising, sucking sweep — and everything else lands 150ms later on the
      // white-out flash: a cracking sub-detonation, a long lowpass rumble that
      // rolls out under it, and a falling scream, all pushed into the echo bus
      // so the blast hangs in the air. The title screen's loudest moment by
      // design — a secret payoff, not a menu tick.
      synth.tone({
        type: "sawtooth",
        from: 70,
        to: 940,
        durationMs: 150,
        volume: 0.05,
        detuneCents: 10,
        echo: 0.2,
      });
      synth.noise({
        durationMs: 300,
        volume: 0.09,
        delayMs: 150,
        filter: { type: "highpass", frequency: 900 },
        echo: 0.3,
      });
      synth.noise({
        durationMs: 1200,
        volume: 0.08,
        delayMs: 190,
        filter: { type: "lowpass", frequency: 700 },
        echo: 0.45,
      });
      synth.tone({
        type: "sawtooth",
        from: 260,
        to: 24,
        durationMs: 900,
        volume: 0.07,
        delayMs: 150,
        detuneCents: 12,
        echo: 0.4,
      });
      synth.tone({
        type: "sine",
        from: 1600,
        to: 160,
        durationMs: 520,
        volume: 0.05,
        delayMs: 220,
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

/** The hidden developer gesture winding the title sun up (see
 * use-sun-charge.ts): one swelling solar groan per tap, `charge` being how far
 * along the build-up is (0..1 — the same ramp the visuals read).
 *
 * It takes a parameter rather than being a UiSound name because the point IS
 * the ramp: the first taps are SILENT so the secret stays secret, the sound
 * only creeps in once the fire starts showing, and from there each tap rises in
 * pitch, length and weight until the star lets go. */
export function playSunCharge(synth: Synth, charge: number): void {
  const t = Math.max(0, Math.min(1, charge));
  // Below the second REACTING tap nothing is audible — the sky is only just
  // beginning to look wrong, and a chirp would give the gesture away. (The
  // silent taps before it never reach here at all: the hook doesn't call.)
  if (t < 0.3) return;
  const volume = 0.012 + t * 0.048;
  // A rising sine swell (the star straining) under a band of fire noise that
  // opens up as the charge grows.
  const base = 170 + t * 250;
  synth.tone({
    type: "sine",
    from: base,
    to: base * 1.7,
    durationMs: Math.round(170 + t * 230),
    volume,
    detuneCents: 6,
    echo: 0.15 + t * 0.25,
  });
  synth.noise({
    durationMs: Math.round(120 + t * 260),
    volume: volume * 0.7,
    delayMs: 20,
    filter: { type: "bandpass", frequency: 800 + t * 1900, q: 0.9 },
    echo: 0.2 + t * 0.2,
  });
}

/** The arming tap: the star LOCKS ON and the click race begins (see
 * title-screen/sun-race.ts). One heavy, rising lock — the loudest thing the
 * gesture ever plays, because it is the moment the secret stops being a secret
 * and the player has to be told, unmistakably, that something just started. */
export function playSunRaceArmed(synth: Synth): void {
  // A deep swell under a hard bright snap: the mass of the star behind the
  // clean "on" of a machine arming.
  synth.tone({
    type: "sawtooth",
    from: 90,
    to: 300,
    durationMs: 420,
    volume: 0.05,
    detuneCents: 9,
    echo: 0.35,
  });
  synth.tone({
    type: "square",
    from: 620,
    to: 1240,
    durationMs: 180,
    volume: 0.035,
    echo: 0.3,
  });
  synth.noise({
    durationMs: 380,
    volume: 0.03,
    filter: { type: "bandpass", frequency: 2200, q: 0.8 },
    echo: 0.3,
  });
}

/** One beat of the click race: `progress` is how far up the star is (0..1 — the
 * same ramp its size reads) and `keeping` whether this press landed inside the
 * 250 ms beat.
 *
 * It takes parameters rather than being a UiSound name for the same reason
 * `playSunCharge` does: the sound IS the feedback loop. On the beat it is a
 * bright tick that climbs the whole way up, so the player can hear the tempo
 * holding without watching the sun; off it, a dull airless knock — the star not
 * catching — so a dropped beat is heard before the shrink is seen. Fired up to
 * four times a second, so both stay among the shortest voices in the set. */
export function playSunRace(
  synth: Synth,
  progress: number,
  keeping: boolean,
): void {
  const t = Math.max(0, Math.min(1, progress));
  if (!keeping) {
    // Off the beat: no pitch, no shine, nothing that rewards the press.
    synth.tone({
      type: "triangle",
      from: 132,
      to: 74,
      durationMs: 95,
      volume: 0.03,
    });
    synth.noise({
      durationMs: 70,
      volume: 0.016,
      filter: { type: "lowpass", frequency: 520, q: 0.7 },
    });
    return;
  }
  // On the beat: a chip tick rising through the race, with a sine body under it
  // so the last beats before the star lets go have real weight.
  const pitch = 430 + t * 880;
  synth.tone({
    type: "square",
    from: pitch,
    to: pitch * 1.32,
    durationMs: 55,
    volume: 0.016 + t * 0.026,
    echo: 0.1 + t * 0.2,
  });
  synth.tone({
    type: "sine",
    from: pitch * 0.5,
    to: pitch * 0.66,
    durationMs: 105,
    volume: 0.012 + t * 0.024,
    detuneCents: 5,
  });
  synth.noise({
    durationMs: 55,
    volume: 0.007 + t * 0.017,
    filter: { type: "bandpass", frequency: 1300 + t * 2500, q: 1.1 },
  });
}
