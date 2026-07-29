// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The SOUND schema — one authored sound, validated against what the synth can
// actually be told to do (`pwa/src/lib/synth.ts`).
//
// A sound is a list of VOICES fired in order, each a `tone` (an oscillator) or
// a `noise` (a filtered burst), optionally offset by `delayMs` so a sound can
// be a little melody rather than one hit. That is the whole format: there is no
// control flow in it, and there is not going to be. A mod's sound is data the
// game replays, not a program it runs — the same rule the rest of the mod
// format keeps.
//
// The field list mirrors `ToneOptions` / `NoiseOptions`. Keep them in step: a
// field the synth grew and this did not is a field an author cannot reach, and
// a field here the synth dropped is one that silently does nothing.

/** Oscillator shapes a `tone` voice may use. */
const WAVES = new Set(["sine", "square", "sawtooth", "triangle"]);
const FILTERS = new Set(["lowpass", "highpass", "bandpass"]);

/** Fields common to both voice kinds. */
const SHARED = new Set([
  "call",
  "durationMs",
  "volume",
  "delayMs",
  "pan",
  "echo",
  "filter",
]);
/** `tone` only — a noise burst has no pitch to glide or detune. */
const TONE_ONLY = new Set([
  "type",
  "from",
  "to",
  "attackMs",
  "detuneCents",
  "vibrato",
]);

/**
 * Validate one parsed sound file.
 *
 * @param {object} doc   the parsed YAML
 * @param {object} refs  `{ events }` — the engine's GameEvent type names, so an
 *                       `on.type` that no event carries fails here rather than
 *                       becoming a sound that can never play.
 * @returns `{ errors, warnings }`
 */
export function validateSound(doc, refs = {}) {
  const errors = [];
  const warnings = [];
  const id = doc?.id ?? "(unnamed)";
  const err = (m) => errors.push(`sound "${id}": ${m}`);

  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    return { errors: [`sound "${id}": expected a mapping`], warnings };
  }
  if (typeof doc.id !== "string" || !/^[a-z][a-z0-9_]*$/.test(doc.id)) {
    err("id must be lowercase letters, digits and underscores");
  }
  if (!doc.description) {
    // Advisory, like a sprite's: a sound with no word about what it should
    // feel like is one nobody can retune with confidence later.
    warnings.push(`sound "${id}": no description`);
  }

  // `on` is optional: a sound with one plays when that event fires, a sound
  // without is played BY NAME (the UI sounds, and a weapon's own `sfx`).
  if (doc.on !== undefined) {
    if (typeof doc.on !== "object" || Array.isArray(doc.on)) {
      err("`on` must be a mapping of event fields to match");
    } else {
      if (typeof doc.on.type !== "string") {
        err("`on` needs a `type` — the event that plays this sound");
      } else if (refs.events && !refs.events.has(doc.on.type)) {
        err(`\`on.type\` "${doc.on.type}" is not an event the game emits`);
      }
      for (const key of Object.keys(doc.on)) {
        if (!MATCHABLE.has(key)) {
          err(
            `\`on.${key}\` is not a field sounds are chosen by ` +
              `(${[...MATCHABLE].join(", ")})`,
          );
        }
      }
    }
  }

  if (!Array.isArray(doc.voices) || doc.voices.length === 0) {
    err("needs at least one voice — a sound with none is silence");
    return { errors, warnings };
  }

  doc.voices.forEach((voice, at) => {
    const where = `voice ${at + 1}`;
    if (!voice || typeof voice !== "object") {
      err(`${where}: expected a mapping`);
      return;
    }
    const kind = voice.call;
    if (kind !== "tone" && kind !== "noise") {
      err(`${where}: call must be "tone" or "noise" (got ${kind})`);
      return;
    }
    if (typeof voice.durationMs !== "number" || voice.durationMs <= 0) {
      err(`${where}: durationMs must be a positive number`);
    }
    if (kind === "tone" && typeof voice.from !== "number") {
      err(`${where}: a tone needs a \`from\` frequency in Hz`);
    }
    if (voice.type !== undefined && !WAVES.has(voice.type)) {
      err(`${where}: unknown wave "${voice.type}" (${[...WAVES].join(", ")})`);
    }
    if (voice.filter !== undefined) {
      if (!FILTERS.has(voice.filter?.type)) {
        err(
          `${where}: unknown filter "${voice.filter?.type}" ` +
            `(${[...FILTERS].join(", ")})`,
        );
      }
      if (typeof voice.filter?.frequency !== "number") {
        err(`${where}: a filter needs a \`frequency\``);
      }
    }
    for (const key of Object.keys(voice)) {
      if (SHARED.has(key)) continue;
      if (kind === "tone" && TONE_ONLY.has(key)) continue;
      err(
        `${where}: unknown field "${key}"` +
          (kind === "noise" && TONE_ONLY.has(key)
            ? ` — a noise burst has no pitch, so it takes no "${key}"`
            : ""),
      );
    }
    // Volumes are the one number worth a guard rail: the bank's ceiling is
    // 0.09 and a stray 0.9 is not a louder sound, it is a clipped one.
    if (typeof voice.volume === "number" && voice.volume > 0.5) {
      warnings.push(
        `sound "${id}" ${where}: volume ${voice.volume} is very loud — the ` +
          "game's own sounds live in 0.01–0.09",
      );
    }
  });

  return { errors, warnings };
}

/** The event fields a sound may be matched on — exactly the ones `soundKey`
 * builds its key from. */
export const MATCHABLE = new Set([
  "type",
  "weaponClass",
  "crit",
  "kind",
  "tier",
]);
