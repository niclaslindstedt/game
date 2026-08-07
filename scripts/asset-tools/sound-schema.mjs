// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The SOUND schema — one authored sound, validated against what the synth can
// actually be told to do (`pwa/src/lib/synth.ts`).
//
// A sound is a list of VOICES fired in order, each a `tone` (an oscillator), a
// `noise` (a filtered burst) or — only in a mod — a `sample` (a recording),
// optionally offset by `delayMs` so a sound can be a little arrangement rather
// than one hit. That is the whole format: there is no control flow in it, and
// there is not going to be. A mod's sound is data the game replays, not a
// program it runs — the same rule the rest of the mod format keeps.
//
// A MOD may ship RECORDINGS — `.wav`, `.mp3`, `.ogg`, `.opus` or `.flac` — and
// reach them two ways. The plain way is to name the file after the sound it
// replaces and write no YAML at all (`sounds/enemy_killed.wav`); the compiler
// turns that into a one-voice sound for you. The composed way is a `voices:`
// list with `call: sample` in it, which is what lets a recording be layered
// under a synthesized tail, spaced out with `delayMs`, or given variants. The
// shipped game authors neither: everything in `content/sounds/` is synthesized,
// which is what keeps the PWA free of audio files. But a mod is somebody else's
// work, and no list of oscillators is the orchestral hit they recorded.
//
// The field list mirrors `ToneOptions` / `NoiseOptions` / `SampleVoiceOptions`.
// Keep them in step: a field the synth grew and this did not is a field an
// author cannot reach, and a field here the synth dropped is one that silently
// does nothing.

/** Oscillator shapes a `tone` voice may use. */
const WAVES = new Set(["sine", "square", "sawtooth", "triangle"]);
const FILTERS = new Set(["lowpass", "highpass", "bandpass"]);
/** How a clip with several takes chooses one. */
const PICKS = new Set(["cycle", "random", "hash"]);

/** Fields common to every voice kind. */
const SHARED = new Set(["call", "volume", "delayMs", "pan", "echo"]);
/** `tone` and `noise` — a recording brings its own length. */
const SYNTH_SHARED = new Set(["durationMs", "filter"]);
/** `tone` only — a noise burst has no pitch to glide or detune. */
const TONE_ONLY = new Set([
  "type",
  "from",
  "to",
  "attackMs",
  "detuneCents",
  "vibrato",
]);
/** `sample` only — the knobs that mean something to a recording and nothing to
 * an oscillator. */
const SAMPLE_ONLY = new Set([
  "clip",
  "rate",
  "pitchJitter",
  "volumeJitter",
  "pick",
]);

/**
 * Validate one parsed sound file.
 *
 * @param {object} doc   the parsed YAML
 * @param {object} refs  `{ events, cues, sampled, clips, shipped }`.
 *                       `events` is the engine's GameEvent type names, so an
 *                       `on.type` that no event carries fails here rather than
 *                       becoming a sound that can never play. `cues` is the
 *                       app-raised moments (`Cue` in pwa/src/game/sfx/cues.ts).
 *                       `sampled` says a RECORDING named after this sound sits
 *                       beside this file, which is what makes `voices:`
 *                       optional — only the compiler can see the folder, so
 *                       only it can answer that. `clips` is every clip name the
 *                       mod shipped, so a `call: sample` naming nothing is
 *                       caught at build time rather than being silence.
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

  validateOn(doc, refs, err);
  validateStage(doc, err, warnings, id);

  // `sample` is a MOD's business and the game itself never authors one: it
  // says this sound comes out of `sounds/<id>.<ext>` sitting beside this file,
  // and carries the knobs that are ours rather than the recording's — how loud
  // to run it, where to put it, how much hall to send it into, and how much to
  // vary it so four hundred plays are not four hundred copies. There is no
  // `file:` field on purpose: the stem IS the id, so there is exactly one place
  // the recording can be and one thing it can replace.
  const sampled = doc.sample !== undefined || refs.sampled === true;
  if (doc.sample !== undefined && refs.shipped) {
    // The game ships no audio files, and nothing under `content/sounds/` reads
    // one — a `sample:` here would compile into a sound with no voices at all.
    err("`sample:` is a mod's — the shipped game synthesizes every sound");
  } else if (doc.sample !== undefined) {
    validateSampleBlock(doc.sample, err);
  }

  if (sampled) {
    // ONE SOUND, ONE SOURCE. Voices under a dropped-in recording are voices
    // that can never be heard, and "why is my sound design ignored" is a far
    // worse half-hour than this error. (A composed sound is the other way
    // round: it has `voices:` with `call: sample` in them and NO file named
    // after it, so it never reaches here.)
    if (doc.voices !== undefined) {
      err(
        "carries both a recording named after it and `voices` — a sound is " +
          "played from one or the other, so drop the voices, or rename the " +
          "file and name it from a `call: sample` voice instead",
      );
    }
    return { errors, warnings };
  }

  if (!Array.isArray(doc.voices) || doc.voices.length === 0) {
    err("needs at least one voice — a sound with none is silence");
    return { errors, warnings };
  }

  doc.voices.forEach((voice, at) => {
    validateVoice(voice, `voice ${at + 1}`, refs, err, warnings, id);
  });

  // A LOOP IS A RECORDING, and the schema says so rather than the runtime
  // discovering it: an oscillator loop is what the music system is for, and a
  // `loop:` on a def of tones would start a source that plays once and a flag
  // that never clears.
  if (doc.loop && !doc.voices.every((v) => v?.call === "sample")) {
    err(
      "`loop: true` needs every voice to be a `sample` — a sustained sound is " +
        "a recording (a loop of oscillators is what music/ is for)",
    );
  }

  return { errors, warnings };
}

/** The `on:` block — which event, or which cue, plays this sound. */
function validateOn(doc, refs, err) {
  // `on` is optional: a sound with one plays when that event fires (or that cue
  // is raised), a sound without is played BY NAME (the UI sounds, the road's,
  // and the ones a weapon points at with `sfx:`).
  if (doc.on === undefined) return;
  if (typeof doc.on !== "object" || Array.isArray(doc.on) || doc.on === null) {
    err("`on` must be a mapping of event fields to match");
    return;
  }

  const isCue = doc.on.cue !== undefined;
  if (isCue && doc.on.type !== undefined) {
    err(
      "`on` names both a `type` and a `cue` — an event and a cue are two " +
        "different moments, so answer one of them",
    );
    return;
  }

  if (isCue) {
    if (typeof doc.on.cue !== "string") {
      err("`on.cue` must be the name of a cue the app raises");
    } else if (refs.cues && !refs.cues.has(doc.on.cue)) {
      err(
        `\`on.cue\` "${doc.on.cue}" is not a cue the game raises ` +
          `(${[...(refs.cues ?? [])].join(", ")})`,
      );
    }
    if (doc.on.surface !== undefined && typeof doc.on.surface !== "string") {
      err("`on.surface` must be a string — the material it happened on");
    }
    for (const key of Object.keys(doc.on)) {
      if (!CUE_MATCHABLE.has(key)) {
        err(
          `\`on.${key}\` is not a field a CUE is chosen by ` +
            `(${[...CUE_MATCHABLE].join(", ")})`,
        );
      }
    }
    return;
  }

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

/** How the sound sits in the world: spatial placement, and sustain. */
function validateStage(doc, err, warnings, id) {
  if (doc.spatial !== undefined && typeof doc.spatial !== "boolean") {
    err("`spatial` must be true or false");
  }
  if (doc.fadeMs !== undefined) {
    if (typeof doc.fadeMs !== "number" || doc.fadeMs < 0) {
      err("`fadeMs` must be a non-negative number of milliseconds");
    }
  }
  if (doc.loop !== undefined && typeof doc.loop !== "boolean") {
    err("`loop` must be true or false");
  }
  if (doc.stopOn !== undefined) {
    if (typeof doc.stopOn !== "string") {
      err("`stopOn` must be the event type that ends this sound");
    }
    if (!doc.loop) {
      err(
        "`stopOn` without `loop: true` — only a sustained sound has anything " +
          "to stop",
      );
    }
  }
  if (doc.loop && doc.stopOn === undefined) {
    // Not an error: a level-long room tone genuinely wants to run until the
    // run ends, and that is what happens. But it is far more often a
    // forgotten field, and the failure mode is weather that never lifts.
    warnings.push(
      `sound "${id}": loops with no \`stopOn\` — it will play until the run ` +
        "ends, which is right for an ambience and wrong for anything else",
    );
  }
  if (doc.loop && doc.spatial) {
    // The placement is stamped once, when the loop starts, and a sustained
    // source does not follow anything. Silent drift is worse than a warning.
    warnings.push(
      `sound "${id}": is both looping and spatial — a loop is placed once, ` +
        "where it started, and does not follow anything",
    );
  }
}

/** A `sample:` block (a dropped-in recording's mix), or a `call: sample`
 * voice's own knobs — the same fields, validated the same way. */
function validateSampleBlock(sample, err, where = "`sample`") {
  if (typeof sample !== "object" || Array.isArray(sample) || sample === null) {
    err(`${where} must be a mapping, or be left out`);
    return;
  }
  for (const key of Object.keys(sample)) {
    if (!SAMPLE_FIELDS.has(key)) {
      err(
        `${where}.${key} is not a field a recording takes ` +
          `(${[...SAMPLE_FIELDS].join(", ")})` +
          (key === "file"
            ? " — the file is sounds/<id> with an audio extension, named " +
              "after this sound"
            : ""),
      );
    }
  }
  const num = (key, lo, hi) => {
    const value = sample[key];
    if (value === undefined) return;
    if (typeof value !== "number" || value < lo || value > hi) {
      err(`${where}.${key} must be a number in ${lo}–${hi}`);
    }
  };
  num("volume", 0, 1);
  num("pan", -1, 1);
  num("echo", 0, 1);
  // A rate below a twentieth is a drone and above four is a chirp; both are
  // almost always a typo for a jitter.
  num("rate", 0.05, 4);
  num("pitchJitter", 0, 1);
  num("volumeJitter", 0, 1);
  if (sample.pick !== undefined && !PICKS.has(sample.pick)) {
    err(
      `${where}.pick must be one of ${[...PICKS].join(", ")} — how a clip ` +
        "with several takes chooses one",
    );
  }
}

/** One entry in `voices:`. */
function validateVoice(voice, where, refs, err, warnings, id) {
  if (!voice || typeof voice !== "object") {
    err(`${where}: expected a mapping`);
    return;
  }
  const kind = voice.call;
  if (kind !== "tone" && kind !== "noise" && kind !== "sample") {
    err(`${where}: call must be "tone", "noise" or "sample" (got ${kind})`);
    return;
  }

  if (kind === "sample") {
    if (refs.shipped) {
      err(
        `${where}: \`call: sample\` is a mod's — the shipped game ships no ` +
          "audio files and synthesizes every sound",
      );
      return;
    }
    if (typeof voice.clip !== "string" || !voice.clip) {
      err(`${where}: a sample voice needs a \`clip\` — an audio file's stem`);
    } else if (refs.clips && !refs.clips.has(voice.clip)) {
      err(
        `${where}: clip "${voice.clip}" has no recording — expected ` +
          `sounds/${voice.clip} with an audio extension (or ` +
          `sounds/${voice.clip}.1.<ext> … for variants)`,
      );
    }
    // Everything but `clip` and `delayMs` is a `sample:` block's field, so it
    // is checked by exactly the same code and cannot drift from it.
    const { call: _c, clip: _clip, delayMs, ...mix } = voice;
    if (delayMs !== undefined && (typeof delayMs !== "number" || delayMs < 0)) {
      err(`${where}: delayMs must be a non-negative number`);
    }
    validateSampleBlock(mix, err, where);
    for (const key of Object.keys(voice)) {
      if (SHARED.has(key) || SAMPLE_ONLY.has(key)) continue;
      err(
        `${where}: unknown field "${key}"` +
          (SYNTH_SHARED.has(key) || TONE_ONLY.has(key)
            ? ` — a recording brings its own, so it takes no "${key}"`
            : ""),
      );
    }
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
    if (SHARED.has(key) || SYNTH_SHARED.has(key)) continue;
    if (kind === "tone" && TONE_ONLY.has(key)) continue;
    err(
      `${where}: unknown field "${key}"` +
        (kind === "noise" && TONE_ONLY.has(key)
          ? ` — a noise burst has no pitch, so it takes no "${key}"`
          : "") +
        (SAMPLE_ONLY.has(key)
          ? ` — that is a \`call: sample\` field, not a ${kind}'s`
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
}

/** What a `sample:` block (or a `call: sample` voice) may say. The recording
 * carries its own envelope, pitch and length; these are the knobs that are the
 * GAME's rather than the recording's — where to put it, how loud to run it,
 * how much hall, and how much to vary it play to play. */
export const SAMPLE_FIELDS = new Set([
  "volume",
  "pan",
  "echo",
  "rate",
  "pitchJitter",
  "volumeJitter",
  "pick",
]);

/** The event fields a sound may be matched on — exactly the ones `routeKey`
 * builds its key from. */
export const MATCHABLE = new Set([
  "type",
  "weaponClass",
  "crit",
  "kind",
  "tier",
]);

/** …and the fields a CUE is matched on. Its own key space (`cue|surface`), so
 * a cue never has to pretend to be an event with a blank type. */
export const CUE_MATCHABLE = new Set(["cue", "surface"]);
