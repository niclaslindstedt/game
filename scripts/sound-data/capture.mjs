// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Driving the game's sound bank and capturing what it plays.
//
// Split from `record.mjs` (the stub and the matrix) because THIS is the half
// that imports the app's TypeScript, and the test that replays the catalog
// wants the stub without paying for that import.

import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("../game-alias-loader.mjs", import.meta.url);

import { PARAMETERIZED, recordingSynth, soundId, VARIANTS } from "./record.mjs";

const sfx = (name) =>
  fileURLToPath(new URL(`../../pwa/src/game/sfx/${name}.ts`, import.meta.url));

/**
 * Every sound the bank produces, as `{ id, type, variant, calls }`.
 *
 * The dispatchers are tried in the order `playEventSounds` tries them, and a
 * claimed event stops the walk — so the recording reproduces not just each
 * sound but the PRECEDENCE between the domain modules, which is itself part of
 * the behaviour being preserved.
 */
export async function captureEventSounds() {
  const { playCombatSound } = await import(sfx("combat"));
  const { playWorldSound } = await import(sfx("world"));
  const { playPickupSound } = await import(sfx("pickups"));
  const { playPowerupSound } = await import(sfx("powerups"));
  const { playJingle } = await import(sfx("jingles"));
  const chain = [
    playCombatSound,
    playWorldSound,
    playPickupSound,
    playPowerupSound,
    playJingle,
  ];

  const captured = [];
  for (const type of await eventTypes()) {
    // A sound whose shape rides a continuous parameter cannot be a catalog
    // entry, and recording it once would freeze it at whatever value the stub
    // event happened to carry. Those keep their code.
    if (PARAMETERIZED.has(type)) continue;
    for (const variant of VARIANTS[type] ?? [{}]) {
      const synth = recordingSynth();
      // A synthetic event carrying only the fields the bank reads. The real
      // event has positions and ids too; `soundKey` proves they never reach
      // the synth, so leaving them out cannot change what is recorded.
      const event = { type, ...variant };
      for (const play of chain) {
        if (play(synth, event)) break;
      }
      if (synth.calls.length > 0) {
        captured.push({
          id: soundId(type, variant),
          type,
          variant,
          calls: synth.calls,
        });
      }
    }
  }
  return captured;
}

/** The UI sounds, which are chosen by name rather than by an event. */
export async function captureUiSounds() {
  const { playUiSound } = await import(sfx("ui"));
  const names = [
    "move",
    "confirm",
    "back",
    "start",
    "equip",
    "blip",
    "boom",
    "guide",
  ];
  return names.map((name) => {
    const synth = recordingSynth();
    playUiSound(synth, name);
    return { id: `ui_${name}`, ui: name, calls: synth.calls };
  });
}

/**
 * The achievement fanfares — their own entry point, not an event, and TWO of
 * them because the badge ladder genuinely makes two sounds.
 *
 * `achievement_unlocked` is the badge chime at its reference weight (the PRO
 * rung, the middle of the ladder). The tier's own weight scales that chime's
 * volume, which is a parameter rather than a sound — the same reason the
 * intensity-driven sounds stay out of the catalog entirely.
 *
 * `achievement_legend` is not a louder chime, it is a different piece: the
 * fanfare the top-tier card reveal plays, with its own rip, choir, climb and
 * landing chord. A catalog that carried only the first would describe the
 * quiet half of the feature.
 */
export async function captureAchievementJingle() {
  const { playAchievementJingle } = await import(sfx("jingles"));
  const synth = recordingSynth();
  playAchievementJingle(synth, "pro");
  return { id: "achievement_unlocked", calls: synth.calls };
}

export async function captureLegendJingle() {
  const { playAchievementJingle } = await import(sfx("jingles"));
  const synth = recordingSynth();
  playAchievementJingle(synth, "legend");
  return { id: "achievement_legend", calls: synth.calls };
}

/** Every `type` in the engine's GameEvent union, read out of the source.
 *
 * Read rather than hand-listed so a new event type joins the sweep the day it
 * is added: if it makes a sound, the capture finds it; if it does not, it is
 * simply absent from the catalog. */
async function eventTypes() {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
      "..",
      "src",
      "game",
      "types",
      "events.ts",
    ),
    "utf8",
  );
  return [
    ...new Set([...source.matchAll(/type:\s*"([a-zA-Z]+)"/g)].map((m) => m[1])),
  ].sort();
}
