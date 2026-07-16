// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Prompt ↔ sprite coherence — the "is the prompt in sync with the sprite?" pass
// of the authoring loop (see the `pixel-assets` skill's `verify` step). A
// generated sprite is only trustworthy if its prompt could *recreate* it and
// nothing in the words contradicts the pixels. This module is the mechanical
// half of that check — the deterministic desyncs a human shouldn't have to
// eyeball — leaving the semantic "does it LOOK like the words" to the eye on
// the rendered pose.
//
// Everything here is a pure string/palette transform, so the same fields always
// yield the same findings. Findings carry a `level`:
//   "fix"  — a genuine contradiction (prose states a size the field denies).
//   "trim" — a fact already owned upstream (size / facing / medium), restated in
//            prose where it can silently drift out of sync. Owned by the `size`
//            field and STYLE_PREAMBLE; drop it from the words.
//   "note" — a recreatability gap (an unnamed palette color, an empty
//            description) that leaves the prompt weaker than the sprite.

/** `front-facing` / `front facing` — owned by STYLE_PREAMBLE, not the prose. */
const FACING_RE = /\bfront[- ]facing\b/i;
/** The medium tail (`flat 16-bit pixel art`, `16 bit`) — owned by STYLE_PREAMBLE. */
const MEDIUM_RE = /\b(?:pixel[- ]art|16[- ]bit|flat 16)\b/i;
/** An `NxN` / `N×N` resolution mention — owned by the `size` field. */
const SIZE_RE = /\b(\d+)\s*[x×]\s*(\d+)\b/gi;

/**
 * Gather every piece of human-authored prose on a sprite into one string: the
 * free `description` plus every `subject` slot value. This is the text a
 * restated fact could hide in.
 */
export function proseText({ description, subject } = {}) {
  const parts = [description];
  if (subject && typeof subject === "object")
    parts.push(...Object.values(subject));
  return parts
    .filter((p) => typeof p === "string")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Every `[w, h]` resolution mentioned in a blob of prose, in order. */
export function sizeMentions(text) {
  const out = [];
  for (const m of String(text ?? "").matchAll(SIZE_RE)) {
    out.push([Number(m[1]), Number(m[2])]);
  }
  return out;
}

/**
 * The one coherence finding cheap enough to run on EVERY build: prose that
 * states a resolution the `size` field contradicts (e.g. a `(20x20)` left
 * behind after `size` was bumped to `[24, 24]`). Returns the offending
 * `[w, h]` from the prose, or null when nothing in the words disagrees with the
 * field. A *matching* mention isn't returned here — it's merely redundant, and
 * `promptSelfCheck` flags that as "trim" for the authoring pass.
 */
export function proseSizeMismatch({ description, subject, size } = {}) {
  if (!Array.isArray(size) || size.length !== 2) return null;
  const [w, h] = size;
  for (const [pw, ph] of sizeMentions(proseText({ description, subject }))) {
    if (pw !== w || ph !== h) return [pw, ph];
  }
  return null;
}

/**
 * The full authoring-time self-check, run by `sprite-author verify`. Answers
 * "could I recreate the sprite from this prompt, and does anything in the words
 * fight the pixels?" as a list of `{ level, message }` findings (empty when the
 * prompt and sprite are in sync).
 *
 * @param {object} args
 * @param {string} [args.description]  the free-prose acceptance target
 * @param {object} [args.subject]  the structured subject slots
 * @param {[number, number]} [args.size]  the `size` field
 * @param {Record<string,string>} [args.palette]  char → hex
 * @param {Record<string,string>} [args.paletteNames]  char → human color name
 */
export function promptSelfCheck({
  description,
  subject,
  size,
  palette,
  paletteNames = {},
} = {}) {
  const findings = [];
  const text = proseText({ description, subject });

  // Recreatability: with no acceptance target there's nothing to prompt from.
  if (!text) {
    findings.push({
      level: "note",
      message:
        "no description or subject — the acceptance target is unset; the prompt cannot describe the sprite",
    });
  }

  // Restated size: a contradiction is a bug, a match is redundant. Either way
  // the `size` field owns the resolution — keep it out of the words.
  if (Array.isArray(size) && size.length === 2) {
    const [w, h] = size;
    for (const [pw, ph] of sizeMentions(text)) {
      if (pw !== w || ph !== h) {
        findings.push({
          level: "fix",
          message: `prose says ${pw}×${ph} but size is ${w}×${h} — the words contradict the field`,
        });
      } else {
        findings.push({
          level: "trim",
          message: `prose restates the ${w}×${h} size — the size field owns it; drop it from the words`,
        });
      }
    }
  }

  // Restated facing / medium: STYLE_PREAMBLE already pins front-facing,
  // orthographic, flat 16-bit pixel art on every prompt. Repeating it in the
  // prose adds nothing and can drift.
  if (FACING_RE.test(text)) {
    findings.push({
      level: "trim",
      message:
        'prose restates "front-facing" — STYLE_PREAMBLE owns the facing; drop it from the words',
    });
  }
  if (MEDIUM_RE.test(text)) {
    findings.push({
      level: "trim",
      message:
        "prose restates the pixel-art medium — STYLE_PREAMBLE owns it; drop it from the words",
    });
  }

  // Recreatability: an unnamed palette color prompts as bare hex — a weaker
  // instruction than a named one ("gold crest #f4c430" reproduces; "#f4c430"
  // is a guess). Name every color the sprite paints with.
  const unnamed = Object.keys(palette ?? {})
    .filter((k) => !(paletteNames[k] ?? "").trim())
    .sort();
  if (unnamed.length > 0) {
    findings.push({
      level: "note",
      message: `${unnamed.length} palette color(s) unnamed (${unnamed
        .map((k) => `${k} ${palette[k]}`)
        .join(
          ", ",
        )}) — name them with a "# name" comment so the prompt can recreate them`,
    });
  }

  return findings;
}
