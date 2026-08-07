// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ANIMATION SCHEMA — what a CLIP may say about how a body moves.
//
// The game's own art is two frames per body, and the renderer has always known
// that by convention: `<sprite>_0` and `<sprite>_1` flip on a clock, a walk
// alternates them off the ground covered, a boss winding up wears
// `<sprite>_cast_0/1`. That convention is not going anywhere — it is what every
// shipped sprite is drawn to, and it needs no catalog to describe it.
//
// What it cannot do is describe anything ELSE. A mod that draws a six-frame
// walk cycle has nowhere to say the frames exist; a mod that draws a mouth
// moving has no moment to hang it on, because nothing in the game ever asked a
// body to talk. So a mod may ship an `animations.yaml`, and this is what may be
// in it:
//
//   ghoul:                            # the SUBJECT — a sprite base name
//     walk: { frames: [ghoul_walk_0, …, ghoul_walk_5], delayMs: 90 }
//     talk: { frames: [ghoul_talk_0, ghoul_talk_1], delayMs: 130 }
//
// THE STATE VOCABULARY IS CLOSED, and deliberately small: each of the four is a
// question the renderer already asks somewhere, which is what makes a clip play
// rather than sit in a file. A fifth state is a renderer change first and a
// schema change second — never the other way round, because a state nothing
// raises is a promise to a mod author that the game silently breaks.
//
// HOW A CLIP ADVANCES IS NOT AUTHORED. `walk` runs on the ground the body
// covers and everything else runs on the clock, because those are facts about
// what the state MEANS rather than preferences: a walk cycle driven by a timer
// moonwalks the instant the body is slowed, blocked or standing, and an idle
// breath driven by distance stops the moment a body stands still, which is the
// one time it is the only thing keeping the body alive. Letting a file choose
// would only be letting it choose wrong. `delayMs` is therefore read by the
// clock states and ignored by `walk`.

/**
 * The four moments a body can be in, and what the renderer asks to get there.
 *
 * `fallback` is what the game does for a subject that declares no clip for this
 * state — the shipped convention, written down so the docs and the mod compiler
 * can quote it instead of describing it twice.
 */
export const CLIP_STATES = {
  idle: {
    delayMs: 300,
    drive: "clock",
    what: "standing — the body is on the field, doing nothing in particular",
    fallback: "<sprite>_0 and <sprite>_1 alternating every 300ms",
  },
  walk: {
    delayMs: 160,
    drive: "stride",
    what: "covering ground — every frame is a step actually taken",
    fallback: "<sprite>_0 and <sprite>_1, one per half-stride",
  },
  talk: {
    delayMs: 130,
    drive: "clock",
    what: "speaking — a conversation, an errand offer or a shop counter is open",
    fallback:
      "nothing: the speaker's portrait holds <sprite>_0 and does not move",
  },
  cast: {
    delayMs: 110,
    drive: "clock",
    what: "winding up a telegraphed move — the tell, before it lands",
    fallback: "<sprite>_cast_0 and <sprite>_cast_1 alternating every 110ms",
  },
};

/** How a clip's frames advance, per state — never authored. See the header. */
export const CLIP_DRIVES = ["clock", "stride"];

/**
 * The most frames one clip may hold.
 *
 * Not a memory bound — 64 sprites is nothing — but a bound on the WRONG SHAPE.
 * A cycle past a couple of dozen frames is a mod trying to play a video through
 * the sprite system, and it will disappoint whoever tries: the frames are
 * atlas-less `ImageBitmap`s held for the run, the drive here has no notion of
 * ease or interpolation, and a body on this game's field is sixteen pixels
 * tall. Better to say so at compile time than to let somebody find out.
 */
export const MAX_CLIP_FRAMES = 64;

/** The tightest and loosest a clock-driven clip may tick. Under 20ms it is
 * faster than the display; past 5s it is not an animation, it is two pictures
 * with an intermission. */
const MIN_DELAY_MS = 20;
const MAX_DELAY_MS = 5000;

/** A subject, a state's frames, an id: the same lowercase id shape every other
 * catalog in this game uses. */
const ID_RE = /^[a-z][a-z0-9_]*$/;

/** Every key a clip may carry — anything else is a typo that would be dropped
 * silently, taking the author's intent with it. */
const CLIP_FIELDS = new Set(["frames", "delayMs"]);

/**
 * Validate a whole `animations.yaml` — a mapping of SUBJECT → STATE → clip.
 *
 * @param doc   the parsed document
 * @param refs  `{ sprites }` — the sprite names this mod may name (its own plus
 *              the base game's). Omit to skip the reference check, which is what
 *              a unit test of the shape itself wants.
 * @returns `{ errors, warnings, clips }` — `clips` normalized to
 *          `{ [subject]: { [state]: { frames, delayMs, drive } } }`, with every
 *          default filled in, and EMPTY when there are errors.
 */
export function validateAnimations(doc, refs = {}) {
  const errors = [];
  const warnings = [];
  const clips = {};

  if (doc === null || doc === undefined) return { errors, warnings, clips };
  if (typeof doc !== "object" || Array.isArray(doc)) {
    errors.push(
      "animations.yaml must be a mapping of sprite name → animations, " +
        "e.g. `ghoul:` then `  walk: { frames: [ghoul_walk_0, …] }`",
    );
    return { errors, warnings, clips };
  }

  for (const [subject, states] of Object.entries(doc)) {
    if (!ID_RE.test(subject)) {
      errors.push(
        `"${subject}" is not a sprite name — a subject takes lowercase ` +
          "letters, digits and underscores, and names the art it animates " +
          '(the `sprite:` on a monster, or a sprite id without its "_0")',
      );
      continue;
    }
    if (
      typeof states !== "object" ||
      states === null ||
      Array.isArray(states)
    ) {
      errors.push(
        `${subject}: must be a mapping of state → clip, one of ` +
          Object.keys(CLIP_STATES).join(", "),
      );
      continue;
    }

    const out = {};
    for (const [state, clip] of Object.entries(states)) {
      const spec = CLIP_STATES[state];
      if (spec === undefined) {
        errors.push(
          `${subject}.${state}: "${state}" is not a state the game plays — ` +
            `it plays ${Object.keys(CLIP_STATES).join(", ")}`,
        );
        continue;
      }
      const checked = validateClip(`${subject}.${state}`, clip, spec, refs, {
        errors,
        warnings,
      });
      if (checked !== null) out[state] = checked;
    }
    if (Object.keys(out).length > 0) clips[subject] = out;
  }

  return { errors, warnings: warnings, clips: errors.length > 0 ? {} : clips };
}

/** One clip, checked and filled in — or null when it cannot be played. */
function validateClip(label, clip, spec, refs, log) {
  const err = (message) => log.errors.push(`${label}: ${message}`);

  if (typeof clip !== "object" || clip === null || Array.isArray(clip)) {
    err("must be a mapping with a `frames:` list");
    return null;
  }
  for (const key of Object.keys(clip)) {
    if (!CLIP_FIELDS.has(key)) {
      err(
        `unknown field "${key}" — a clip carries ${[...CLIP_FIELDS].join(" and ")}`,
      );
      return null;
    }
  }

  const { frames } = clip;
  if (!Array.isArray(frames) || frames.length === 0) {
    err("`frames:` must be a list of at least one sprite name");
    return null;
  }
  if (frames.length > MAX_CLIP_FRAMES) {
    err(
      `${frames.length} frames is past the ${MAX_CLIP_FRAMES} a clip may hold`,
    );
    return null;
  }
  let bad = false;
  for (const frame of frames) {
    if (typeof frame !== "string" || !ID_RE.test(frame)) {
      err(`"${frame}" is not a sprite name`);
      bad = true;
      continue;
    }
    if (refs.sprites && !refs.sprites.has(frame)) {
      err(
        `no sprite "${frame}" — add it to this mod's sprites/ (as a .yaml ` +
          "grid or a .png), or name one the base game already draws",
      );
      bad = true;
    }
  }
  if (bad) return null;

  let delayMs = spec.delayMs;
  if (clip.delayMs !== undefined) {
    if (
      typeof clip.delayMs !== "number" ||
      !Number.isFinite(clip.delayMs) ||
      clip.delayMs < MIN_DELAY_MS ||
      clip.delayMs > MAX_DELAY_MS
    ) {
      err(
        `\`delayMs:\` must be a number between ${MIN_DELAY_MS} and ` +
          `${MAX_DELAY_MS} — it is how long ONE frame is held`,
      );
      return null;
    }
    delayMs = clip.delayMs;
    if (spec.drive === "stride") {
      log.warnings.push(
        `${label}: \`delayMs:\` is ignored — a walk is driven by the ground ` +
          "the body covers, so its frames keep the body's own pace",
      );
    }
  }

  // A one-frame clip is legal and occasionally what an author means (a body
  // that holds a pose while it talks), so it is not an error — but it is far
  // more often a list somebody meant to fill in.
  if (frames.length === 1) {
    log.warnings.push(
      `${label}: one frame, so nothing moves — a clip of one is a pose`,
    );
  }

  return { frames: [...frames], delayMs, drive: spec.drive };
}
