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
// A MOD may also skip the voices entirely and ship a RECORDING — a `.wav` or
// `.mp3` named after the sound it replaces (see `sample:` below). The shipped
// game authors none: everything in `content/sounds/` is synthesized, which is
// what keeps the PWA free of audio files. But a mod is somebody else's work,
// and no list of oscillators is the orchestral hit they recorded.
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
 * @param {object} refs  `{ events, sampled }` — `events` is the engine's
 *                       GameEvent type names, so an `on.type` that no event
 *                       carries fails here rather than becoming a sound that
 *                       can never play. `sampled` says a RECORDING
 *                       (`sounds/<id>.wav|.mp3`) sits beside this file, which
 *                       is what makes `voices:` optional — only the compiler
 *                       can see the folder, so only it can answer that.
 *                       `shipped` is this repo's own content pipeline, which
 *                       has no recordings at all.
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

  // `sample` is a MOD's business and the game itself never authors one: it
  // says this sound comes out of `sounds/<id>.wav` (or `.mp3`) sitting beside
  // this file, and carries the three knobs that are ours rather than the
  // recording's — how loud to run it, where to put it, how much hall to send
  // it into. There is no `file:` field on purpose: the stem IS the id, so
  // there is exactly one place the recording can be and one thing it can
  // replace.
  const sampled = doc.sample !== undefined || refs.sampled === true;
  if (doc.sample !== undefined && refs.shipped) {
    // The game ships no audio files, and nothing under `content/sounds/` reads
    // one — a `sample:` here would compile into a sound with no voices at all.
    err("`sample:` is a mod's — the shipped game synthesizes every sound");
  } else if (doc.sample !== undefined) {
    if (
      typeof doc.sample !== "object" ||
      Array.isArray(doc.sample) ||
      doc.sample === null
    ) {
      err("`sample` must be a mapping (volume/pan/echo), or be left out");
    } else {
      for (const key of Object.keys(doc.sample)) {
        if (!SAMPLE_FIELDS.has(key)) {
          err(
            `\`sample.${key}\` is not a field a recording takes ` +
              `(${[...SAMPLE_FIELDS].join(", ")})` +
              (key === "file"
                ? " — the file is sounds/<id> with a .wav or .mp3 extension, " +
                  "named after this sound"
                : ""),
          );
        }
      }
      const num = (key, lo, hi) => {
        const value = doc.sample[key];
        if (value === undefined) return;
        if (typeof value !== "number" || value < lo || value > hi) {
          err(`\`sample.${key}\` must be a number in ${lo}–${hi}`);
        }
      };
      num("volume", 0, 1);
      num("pan", -1, 1);
      num("echo", 0, 1);
    }
  }

  if (sampled) {
    // ONE SOUND, ONE SOURCE. Voices under a recording are voices that can
    // never be heard, and "why is my sound design ignored" is a far worse
    // half-hour than this error.
    if (doc.voices !== undefined) {
      err(
        "carries both a recording and `voices` — a sound is played from one " +
          "or the other, so drop the voices or drop the file",
      );
    }
    return { errors, warnings };
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

/** What a `sample:` block may say. Deliberately three knobs and no more: the
 * recording carries its own envelope, pitch and length, and a field that
 * reshaped it would be this codebase overruling the person who mixed it. */
export const SAMPLE_FIELDS = new Set(["volume", "pan", "echo"]);

/** The event fields a sound may be matched on — exactly the ones `soundKey`
 * builds its key from. */
export const MATCHABLE = new Set([
  "type",
  "weaponClass",
  "crit",
  "kind",
  "tier",
]);
