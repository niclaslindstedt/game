// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// RECORDING THE GAME'S OWN SOUNDS — the instrument that made lifting them to
// content safe, and the one that keeps them honest afterwards.
//
// The sound bank was ~2,000 lines of imperative `synth.tone()` / `synth.noise()`
// calls, every number hand-tuned over the life of the project. Transcribing
// that to YAML by hand would have changed how the game sounds, silently, in
// ways no test would catch — a volume of 0.035 typed as 0.35 is not a build
// failure, it is a sound that is ten times too loud, discovered by a player.
//
// So the conversion was DERIVED instead. Every sound is a deterministic
// sequence of calls (no randomness, no timers, no state — verified), so a stub
// synth that records its arguments captures each sound EXACTLY, and the YAML
// was emitted from those recordings rather than read off the screen.
//
// It stays in the tree because the same recording is the equivalence check:
// `tests/sound_catalog_test.ts` replays the compiled catalog through the same
// stub and asserts the call sequences match, so the shipped audio is pinned to
// what it was on the day it moved.

import { register } from "node:module";

register("../game-alias-loader.mjs", import.meta.url);

/**
 * A synth that plays nothing and remembers everything.
 *
 * The shape mirrors `@ui/lib/synth.ts`'s `Synth`. Only `tone` and `noise` are
 * recorded because they are the only two the sound bank calls; anything else
 * appearing here later would show up as a missing method rather than as silence.
 */
export function recordingSynth() {
  const calls = [];
  return {
    calls,
    tone: (options) => calls.push({ call: "tone", ...options }),
    noise: (options) => calls.push({ call: "noise", ...options }),
    // Present so a sound that reaches for them fails loudly rather than
    // recording nothing at all.
    now: () => 0,
    unlock: () => {},
  };
}

/**
 * THE VARIANT MATRIX — every distinct sound the bank can produce.
 *
 * A sound is chosen by `soundKey` in sfx/index.ts: the event's `type` plus
 * whichever of `weaponClass` / `crit` / `kind` / `tier` it carries. So the set
 * of sounds is the set of those combinations, and this is that set, written
 * out rather than discovered — a combination nobody listed is a sound nobody
 * lifted, and `tests/sound_catalog_test.ts` proves the list is complete by
 * checking every recorded sound is non-empty and every event the bank claims
 * has an entry.
 *
 * `intensity` is deliberately NOT here: it is a continuous parameter, not a
 * discriminant (sandstorm and stampede sounds scale with it), and a continuous
 * parameter cannot be a catalog entry. Those sounds keep their code — see
 * PARAMETERIZED below.
 */
export const VARIANTS = {
  shot: [{ weaponClass: "magic" }, { weaponClass: "ranged" }],
  enemyKilled: [{ crit: true }, { crit: false }],
  enemyHit: [{ crit: true }, { crit: false }],
  // itemCollected branches on `kind` FIRST and only then, for equipment, on
  // `tier` — and the tier branch is really "regular vs anything better". Every
  // real tier still gets its own entry rather than one shared "rare" one: the
  // runtime looks a sound up by the tier the event actually carried, and an
  // entry per tier is also the more useful thing to hand a modder, who can now
  // give artifacts a sound of their own.
  itemCollected: [
    ...[
      "trash",
      "regular",
      "magic",
      "rare",
      "set",
      "unique",
      "legendary",
      "artifact",
    ].map((tier) => ({ kind: "equipment", tier })),
    { kind: "xp" },
    { kind: "repair" },
    { kind: "drink" },
    { kind: "medkit" },
    { kind: "ability" },
  ],
};

/** Sounds whose shape depends on a CONTINUOUS parameter, so they cannot be a
 * catalog entry and keep their code. Listed here so the completeness test
 * knows to expect them missing rather than reporting a gap. */
export const PARAMETERIZED = new Set([
  "sandstormHit",
  "stampedeHit",
  "stampedeRumble",
  "stampedeTrample",
  "asteroidImpact",
]);

/** The catalog id for one event variant: the event type, then each
 * discriminant, joined by `_`. `shot_magic`, `item_collected_legendary`. */
export function soundId(type, variant = {}) {
  const parts = [snake(type)];
  for (const [key, value] of Object.entries(variant)) {
    // A boolean is named by its FIELD, not its value: `enemy_killed_crit`
    // reads as a sound, `enemy_killed_true` reads as a bug.
    if (value === true) parts.push(snake(key));
    else if (value === false) continue;
    else parts.push(snake(String(value)));
  }
  return parts.join("_");
}

const snake = (s) => s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
