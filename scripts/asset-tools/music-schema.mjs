// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The MUSIC schema — one authored score, validated against what the sequencer
// in `pwa/src/lib/chiptune.ts` can actually be told to play.
//
// A track is a tracker module: a handful of INSTRUMENTS (synth patches), a set
// of PATTERNS (sections, each a grid of note tokens per instrument), and an
// ORDER that arranges the patterns into a loop. That is the whole format — the
// same rule the sounds keep, for the same reason: a mod's score is data the
// game replays, not a program it runs.
//
// Every check here answers a failure the sequencer used to have at PLAY time.
// A junk note token throws inside `noteFrequency` — mid-run, on the player's
// machine, three minutes into a level, and only for whoever reached the bar it
// is in. A voice whose length does not divide its pattern throws when the track
// starts. An `order` naming a pattern nobody wrote does the same. None of those
// is a thing an author should discover by playing far enough.

/** Oscillator shapes an instrument may use. `noise` makes every hit a burst. */
const WAVES = new Set(["sine", "square", "sawtooth", "triangle", "noise"]);
const FILTERS = new Set(["lowpass", "highpass", "bandpass"]);

/** Mirrors `ChiptuneInstrument`. Keep in step: a field the type grew and this
 * did not is a field an author cannot reach. */
const INSTRUMENT_FIELDS = new Set([
  "wave",
  "volume",
  "gate",
  "attackMs",
  "detuneCents",
  "vibrato",
  "pan",
  "echo",
  "filter",
  "slide",
]);

/** A pitched note token: `A4`, `C#3`, `F#-1`. */
const NOTE = /^[A-G]#?-?\d$/;

/** Split a pattern voice's authored text into step tokens. One bar per line is
 * the convention; the parser only cares about whitespace. */
export function stepsOf(text) {
  return String(text).trim().split(/\s+/).filter(Boolean);
}

/**
 * Validate one parsed music file.
 *
 * @param {object} doc  the parsed YAML
 * @returns `{ errors, warnings }`
 */
export function validateTrack(doc) {
  const errors = [];
  const warnings = [];
  const id = doc?.id ?? "(unnamed)";
  const err = (m) => errors.push(`track "${id}": ${m}`);

  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    return { errors: [`track "${id}": expected a mapping`], warnings };
  }
  if (typeof doc.id !== "string" || !/^[a-z][a-z0-9_]*$/.test(doc.id)) {
    err("id must be lowercase letters, digits and underscores");
  }
  if (typeof doc.name !== "string" || !doc.name) {
    err("needs a `name` — the track's title, as a listing would print it");
  }
  if (!doc.description) {
    warnings.push(`track "${id}": no description`);
  }
  // A tempo outside this is not a stylistic choice, it is a typo: the step grid
  // is bpm × stepsPerBeat, so 1400 bpm books notes faster than the scheduler's
  // own tick and 3 bpm is a loop nobody would sit through.
  if (typeof doc.bpm !== "number" || doc.bpm < 20 || doc.bpm > 300) {
    err("bpm must be a number between 20 and 300");
  }
  if (
    !Number.isInteger(doc.stepsPerBeat) ||
    doc.stepsPerBeat < 1 ||
    doc.stepsPerBeat > 16
  ) {
    err("stepsPerBeat must be a whole number of steps per beat (1–16)");
  }

  const instruments = doc.instruments;
  if (!instruments || typeof instruments !== "object") {
    err("needs an `instruments` map — a score with no voices is silence");
    return { errors, warnings };
  }
  for (const [name, inst] of Object.entries(instruments)) {
    const where = `instrument "${name}"`;
    if (!inst || typeof inst !== "object") {
      err(`${where}: expected a mapping`);
      continue;
    }
    if (!WAVES.has(inst.wave)) {
      err(`${where}: unknown wave "${inst.wave}" (${[...WAVES].join(", ")})`);
    }
    if (typeof inst.volume !== "number" || inst.volume <= 0) {
      err(`${where}: volume must be a positive number`);
    } else if (inst.volume > 0.3) {
      // The shipped scores sit between 0.006 and 0.07; music plays UNDER the
      // game, and a stray 0.6 is not a louder track, it is a clipped one.
      warnings.push(
        `track "${id}" ${where}: volume ${inst.volume} is very loud — the ` +
          "shipped scores live in 0.006–0.07",
      );
    }
    for (const [field, lo, hi] of [
      ["gate", 0, 1],
      ["pan", -1, 1],
      ["echo", 0, 1],
    ]) {
      const v = inst[field];
      if (v !== undefined && (typeof v !== "number" || v < lo || v > hi)) {
        err(`${where}: ${field} must be a number in ${lo}..${hi}`);
      }
    }
    if (inst.filter !== undefined) {
      if (!FILTERS.has(inst.filter?.type)) {
        err(
          `${where}: unknown filter "${inst.filter?.type}" ` +
            `(${[...FILTERS].join(", ")})`,
        );
      }
      if (typeof inst.filter?.frequency !== "number") {
        err(`${where}: a filter needs a \`frequency\``);
      }
    }
    for (const field of Object.keys(inst)) {
      if (!INSTRUMENT_FIELDS.has(field)) {
        err(`${where}: unknown field "${field}"`);
      }
    }
  }

  const patterns = doc.patterns;
  if (!patterns || typeof patterns !== "object") {
    err("needs a `patterns` map — the sections the order arranges");
    return { errors, warnings };
  }
  const barSteps = (doc.stepsPerBeat || 4) * 4;
  for (const [pname, pattern] of Object.entries(patterns)) {
    const where = `pattern "${pname}"`;
    if (!pattern || typeof pattern !== "object") {
      err(`${where}: expected a mapping of instrument to steps`);
      continue;
    }
    const lengths = [];
    for (const [voice, text] of Object.entries(pattern)) {
      if (!instruments[voice]) {
        err(`${where}: names unknown instrument "${voice}"`);
        continue;
      }
      const steps = stepsOf(text);
      if (steps.length === 0) {
        err(`${where} voice "${voice}": no steps`);
        continue;
      }
      // Whole bars only. A voice 15 steps long lines up with nothing and
      // walks its own downbeat around the pattern.
      if (steps.length % barSteps !== 0) {
        err(
          `${where} voice "${voice}": ${steps.length} steps is not whole ` +
            `bars of ${barSteps}`,
        );
      }
      lengths.push([voice, steps.length]);
      const pitched = instruments[voice].wave !== "noise";
      for (const token of steps) {
        if (token === "." || token === "=") continue;
        // A pitched voice reaches `noteFrequency`, which throws on anything
        // that is not a note — so "x" under a lead is a crash, not a drum.
        if (pitched && !NOTE.test(token)) {
          err(
            `${where} voice "${voice}": "${token}" is not a note — a pitched ` +
              'voice takes note names, "." or "="',
          );
        }
      }
    }
    // A shorter voice CYCLES inside the pattern (a one-bar drum line under an
    // eight-bar lead), which only works when it divides the longest.
    const longest = Math.max(0, ...lengths.map(([, n]) => n));
    for (const [voice, n] of lengths) {
      if (longest % n !== 0) {
        err(
          `${where} voice "${voice}": ${n} steps does not divide the ` +
            `pattern's ${longest}`,
        );
      }
    }
  }

  if (!Array.isArray(doc.order) || doc.order.length === 0) {
    err("needs an `order` — the patterns in play order");
  } else {
    for (const name of doc.order) {
      if (!patterns[name]) err(`order names unknown pattern "${name}"`);
    }
    const unused = Object.keys(patterns).filter((p) => !doc.order.includes(p));
    for (const p of unused) {
      warnings.push(`track "${id}": pattern "${p}" is never played`);
    }
  }

  for (const field of Object.keys(doc)) {
    if (
      ![
        "id",
        "name",
        "description",
        "bpm",
        "stepsPerBeat",
        "instruments",
        "patterns",
        "order",
      ].includes(field)
    ) {
      err(`unknown field "${field}"`);
    }
  }

  return { errors, warnings };
}
