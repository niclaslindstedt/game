// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The STORY schema validators — cutscenes, player thoughts, story items. Mirrors
// `powerup-schema.mjs` / `enemy-schema.mjs`: each `validate*` returns
// `{ errors, warnings }`, hard errors FAIL the build, so a scene that names a
// sprite nothing answers to or a beat that talks to an actor who isn't in the
// cast surfaces at `npm run levels` rather than as a blank frame or a throw
// mid-scene.
//
// The contracts checked here live in `src/lib/cutscene.ts` (`CutsceneDef`),
// `src/game/defs/thoughts.ts` (`ThoughtDef`) and `src/game/defs/story.ts`
// (`StoryItemDef`) — keep the two in step when a field is added. What the
// AUTHORED form changes on top of those types is documented in
// `scripts/story-data/load-yaml.mjs`: a prop's sprite is `sprite:` rather than
// `kind:`, and `variants:` expands into whole scenes.

/** Beat kind → the fields it requires and the ones it may also carry. Mirrors
 * the `CutsceneBeat` union; a kind not in here is a typo. */
const BEAT_SPECS = {
  wait: { nums: ["ms"] },
  caption: { text: true },
  say: { actors: ["actor"], text: true },
  move: { actors: ["actor"], vecs: ["to"], nums: ["speed"] },
  pose: { actors: ["actor"], sprites: ["sprite"] },
  face: { actors: ["actor"], bools: ["faceLeft"] },
  enter: { actors: ["actor"] },
  exit: { actors: ["actor"] },
  fade: { nums: ["to", "ms"] },
  pan: { vecs: ["by"], nums: ["ms"] },
  shake: { actors: ["actor"], nums: ["amp"] },
};

/** The colour channels a stage palette paints with. */
const PALETTE_COLORS = ["wall", "floor", "trim"];

/**
 * THE LENGTH BUDGET IS PER PAGE, NOT PER LINE. An authored line is a
 * PARAGRAPH: the overlay flows it into the column the box really has on the
 * device it is being read on (`wrapPage` + `useTextColumn`), so how many
 * characters fit on a ROW is the renderer's business and not the author's.
 * What the author still owns is how much of a thought lands on ONE SCREENFUL
 * before the box makes the player scroll for the rest — three rows of the
 * narrowest box the game supports, a portrait phone, which is about this many
 * characters. A longer page still reads; it just arrives in two taps.
 */
const PAGE_WARN_CHARS = 120;

/**
 * How many EXPLICIT line breaks a page may carry before it stops being
 * sparing. A second entry in a page's list is a deliberate held beat — a
 * punchline, a second hand on the same note, a pause the punctuation cannot
 * carry — and the whole shipped campaign spends five of them. A page cut into
 * four is the old fixed-box habit coming back, and it prints a ragged column.
 */
const MAX_PAGE_LINES = 2;

/** A `#rrggbb` (or `#rgb`) colour. */
const isHex = (v) => typeof v === "string" && /^#[0-9a-fA-F]{3,8}$/.test(v);

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/** How `{ x, y }` reads in a message (spelled once — it is backticked prose). */
const VEC = "`{ x, y }`";

const isVec = (v) =>
  v !== null &&
  typeof v === "object" &&
  !Array.isArray(v) &&
  isNum(v.x) &&
  isNum(v.y);

/** A page of lines: a non-empty list of non-empty strings. */
function checkPages(pages, what, err, warn) {
  if (!Array.isArray(pages) || pages.length === 0) {
    err(`${what} must be a non-empty list of pages`);
    return;
  }
  pages.forEach((page, i) => checkLines(page, `${what}[${i}]`, err, warn));
}

/**
 * A page: a non-empty list of authored lines, each one a paragraph the box
 * flows into its own width. See PAGE_WARN_CHARS / MAX_PAGE_LINES.
 */
function checkLines(lines, what, err, warn) {
  if (!Array.isArray(lines) || lines.length === 0) {
    err(`${what} must be a non-empty list of lines`);
    return;
  }
  for (const line of lines) {
    if (typeof line !== "string" || line.trim() === "") {
      err(`${what} has a line that is not text`);
    }
  }
  if (lines.length > MAX_PAGE_LINES) {
    warn(
      `${what} is cut into ${lines.length} lines — a line break is an ` +
        `explicit held beat, not a way to fit a box (the box wraps for you)`,
    );
  }
  const chars = lines.join(" ").length;
  if (chars > PAGE_WARN_CHARS) {
    warn(
      `${what} is ${chars} chars — over ${PAGE_WARN_CHARS} it needs a second ` +
        `tap to read on a phone; consider splitting the PAGE`,
    );
  }
}

/**
 * Validate one cutscene, as AUTHORED (variants intact).
 *
 * @param {object} doc   the parsed scene YAML.
 * @param {object} refs  `{ sprites, difficulties }` — a Set of live sprite names
 *                        (a prop or actor naming nothing draws as nothing, and
 *                        `spriteByName` says so silently), and the difficulty ids
 *                        a `variants:` key may name.
 */
export function validateCutscene(doc, refs) {
  const errors = [];
  const warnings = [];
  const tag = `cutscene "${doc?.id ?? "?"}"`;
  const err = (m) => errors.push(`${tag}: ${m}`);
  const warn = (m) => warnings.push(`${tag}: ${m}`);

  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    err("expected a mapping (a scene)");
    return { errors, warnings };
  }
  if (!/^[a-z][a-z0-9_]*$/.test(String(doc.id ?? ""))) {
    err("id must be lower_snake_case");
  }
  for (const key of Object.keys(doc)) {
    if (!["id", "stage", "actors", "beats", "variants"].includes(key)) {
      err(`unknown field "${key}"`);
    }
  }

  // ---- the stage -----------------------------------------------------------
  const stage = doc.stage;
  if (!stage || typeof stage !== "object" || Array.isArray(stage)) {
    err("stage is required — a scene needs somewhere to happen");
    return { errors, warnings };
  }
  for (const field of ["width", "height"]) {
    if (!Number.isInteger(stage[field]) || stage[field] <= 0) {
      err(`stage.${field} must be a positive integer (world px)`);
    }
  }
  if (typeof stage.backdrop !== "string" || stage.backdrop === "") {
    err("stage.backdrop is required — the renderer's key for the setting");
  }
  if (stage.palette !== undefined) {
    if (typeof stage.palette !== "object" || Array.isArray(stage.palette)) {
      err("stage.palette must be a mapping");
    } else {
      for (const channel of PALETTE_COLORS) {
        if (!isHex(stage.palette[channel])) {
          err(`stage.palette.${channel} must be a #rrggbb colour`);
        }
      }
      if (
        stage.palette.floorY !== undefined &&
        !Number.isInteger(stage.palette.floorY)
      ) {
        err("stage.palette.floorY must be an integer (world px from the top)");
      }
      for (const key of Object.keys(stage.palette)) {
        if (!PALETTE_COLORS.includes(key) && key !== "floorY") {
          err(`unknown field "stage.palette.${key}"`);
        }
      }
    }
  }
  if (stage.drift !== undefined && !isVec(stage.drift)) {
    err("stage.drift must be `{ x, y }` world px/s");
  }
  if (stage.props !== undefined && !Array.isArray(stage.props)) {
    err("stage.props must be a list");
  }
  for (const [i, prop] of (Array.isArray(stage.props)
    ? stage.props
    : []
  ).entries()) {
    const where = `stage.props[${i}]`;
    if (!prop || typeof prop !== "object" || Array.isArray(prop)) {
      err(`${where} must be a mapping`);
      continue;
    }
    checkSprite(prop.sprite, `${where}.sprite`, refs, err);
    if (!isVec(prop.at)) err(`${where}.at must be ${VEC}`);
    if (
      prop.parallax !== undefined &&
      (!isNum(prop.parallax) || prop.parallax < 0)
    ) {
      err(
        `${where}.parallax must be a number >= 0 (1 = the ground, 0 = the sky)`,
      );
    }
    if (prop.wrap !== undefined && typeof prop.wrap !== "boolean") {
      err(`${where}.wrap must be a boolean`);
    }
    for (const key of Object.keys(prop)) {
      if (!["label", "sprite", "at", "parallax", "wrap"].includes(key)) {
        err(`unknown field "${where}.${key}"`);
      }
    }
  }

  // ---- the cast ------------------------------------------------------------
  const cast = new Set();
  if (doc.actors !== undefined && !Array.isArray(doc.actors)) {
    err("actors must be a list");
  }
  for (const [i, actor] of (Array.isArray(doc.actors)
    ? doc.actors
    : []
  ).entries()) {
    const where = `actors[${i}]`;
    if (!actor || typeof actor !== "object" || Array.isArray(actor)) {
      err(`${where} must be a mapping`);
      continue;
    }
    if (typeof actor.id !== "string" || actor.id === "") {
      err(`${where}.id is required — beats address an actor by it`);
    } else if (cast.has(actor.id)) {
      err(`${where}.id "${actor.id}" is already in the cast`);
    } else {
      cast.add(actor.id);
    }
    // An actor's `sprite` names a FAMILY: the renderer draws `<sprite>_0` and
    // alternates `_1` while a `move` beat walks it.
    checkSprite(actor.sprite, `${where}.sprite`, refs, err, true);
    if (!isVec(actor.at)) err(`${where}.at must be ${VEC}`);
    for (const flag of ["faceLeft", "hidden"]) {
      if (actor[flag] !== undefined && typeof actor[flag] !== "boolean") {
        err(`${where}.${flag} must be a boolean`);
      }
    }
    for (const key of Object.keys(actor)) {
      if (!["id", "name", "sprite", "at", "faceLeft", "hidden"].includes(key)) {
        err(`unknown field "${where}.${key}"`);
      }
    }
  }

  // ---- the timeline --------------------------------------------------------
  if (!Array.isArray(doc.beats) || doc.beats.length === 0) {
    err(
      "beats must be a non-empty list — a scene with no beats is over at once",
    );
  }
  for (const [i, beat] of (Array.isArray(doc.beats)
    ? doc.beats
    : []
  ).entries()) {
    checkBeat(beat, `beats[${i}]`, { cast, refs }, err, warn);
  }

  // ---- the per-difficulty variants ----------------------------------------
  if (doc.variants !== undefined) {
    if (typeof doc.variants !== "object" || Array.isArray(doc.variants)) {
      err("variants must be a mapping of difficulty → patch");
    } else {
      for (const [difficulty, patch] of Object.entries(doc.variants)) {
        if (refs.difficulties && !refs.difficulties.has(difficulty)) {
          err(
            `variants."${difficulty}" is not a difficulty — a variant is ` +
              `resolved as <id>_<difficulty> at run creation`,
          );
        }
        if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
          err(`variants."${difficulty}" must be a mapping of label → patch`);
          continue;
        }
        // The labels themselves are resolved by the loader (it is what expands
        // them); here only the PATCH contents are checked, against the same
        // rules the part they replace goes through.
        for (const [label, part] of Object.entries(patch)) {
          const where = `variants."${difficulty}"."${label}"`;
          if (!part || typeof part !== "object" || Array.isArray(part)) {
            err(`${where} must be a mapping`);
            continue;
          }
          if (part.sprite !== undefined) {
            checkSprite(part.sprite, `${where}.sprite`, refs, err);
          }
          if (part.text !== undefined)
            checkLines(part.text, `${where}.text`, err, warn);
          if (part.at !== undefined && !isVec(part.at)) {
            err(`${where}.at must be ${VEC}`);
          }
        }
      }
    }
  }

  return { errors, warnings };
}

/** One beat, against its kind's spec. */
function checkBeat(beat, where, { cast, refs }, err, warn) {
  if (!beat || typeof beat !== "object" || Array.isArray(beat)) {
    err(`${where} must be a mapping`);
    return;
  }
  const spec = BEAT_SPECS[beat.kind];
  if (!spec) {
    err(
      `${where}.kind "${beat.kind}" is not a beat (valid: ` +
        `${Object.keys(BEAT_SPECS).join(", ")})`,
    );
    return;
  }
  for (const field of spec.nums ?? []) {
    if (!isNum(beat[field])) err(`${where}.${field} must be a number`);
    else if (beat[field] < 0) err(`${where}.${field} must be >= 0`);
  }
  if (beat.kind === "move" && isNum(beat.speed) && beat.speed <= 0) {
    err(`${where}.speed must be > 0 — a walk at 0 px/s never arrives`);
  }
  for (const field of spec.vecs ?? []) {
    if (!isVec(beat[field])) err(`${where}.${field} must be ${VEC}`);
  }
  for (const field of spec.bools ?? []) {
    if (typeof beat[field] !== "boolean")
      err(`${where}.${field} must be a boolean`);
  }
  for (const field of spec.actors ?? []) {
    const id = beat[field];
    if (typeof id !== "string" || id === "") {
      err(`${where}.${field} must name an actor`);
    } else if (!cast.has(id)) {
      err(`${where}.${field} "${id}" is not in the cast`);
    }
  }
  for (const field of spec.sprites ?? []) {
    checkSprite(beat[field], `${where}.${field}`, refs, err, true);
  }
  if (spec.text) checkLines(beat.text, `${where}.text`, err, warn);
  const allowed = new Set([
    "kind",
    "label",
    ...(spec.nums ?? []),
    ...(spec.vecs ?? []),
    ...(spec.bools ?? []),
    ...(spec.actors ?? []),
    ...(spec.sprites ?? []),
    ...(spec.text ? ["text"] : []),
  ]);
  for (const key of Object.keys(beat)) {
    if (!allowed.has(key))
      err(`unknown field "${where}.${key}" for kind "${beat.kind}"`);
  }
}

/**
 * A sprite reference. `family` names a two-frame family the renderer walks
 * (`<name>_0`/`_1`); a prop is drawn by name and falls back to `_0`, so either
 * resolves it.
 */
function checkSprite(name, where, refs, err, family = false) {
  if (typeof name !== "string" || name === "") {
    err(`${where} is required`);
    return;
  }
  if (!refs.sprites) return;
  const ok = family
    ? refs.sprites.has(`${name}_0`)
    : refs.sprites.has(name) || refs.sprites.has(`${name}_0`);
  if (!ok) {
    err(
      family
        ? `${where} "${name}" has no frames — expected "${name}_0"`
        : `${where} "${name}" is not a sprite`,
    );
  }
}

/**
 * Validate one player thought.
 *
 * @param {string} id    the catalog key (which becomes the def's `id`).
 * @param {object} def   the parsed YAML mapping.
 * @param {object} refs  `{ sprites }` — so a portrait nothing answers to fails
 *                        the build rather than drawing an empty box.
 */
export function validateThought(id, def, refs) {
  const errors = [];
  const warnings = [];
  const tag = `thought "${id}"`;
  const err = (m) => errors.push(`${tag}: ${m}`);
  const warn = (m) => warnings.push(`${tag}: ${m}`);

  if (!def || typeof def !== "object" || Array.isArray(def)) {
    err("expected a mapping (a ThoughtDef)");
    return { errors, warnings };
  }
  if (!/^[a-z][a-z0-9_]*$/.test(id)) err("id must be lower_snake_case");
  if (typeof def.speaker !== "string" || def.speaker === "") {
    err("speaker is required — the name over the words");
  }
  checkSprite(def.portrait, "portrait", refs, err, true);

  // THE OTHER VOICE. A beat is the hero alone by default; `voice` names whoever
  // answers him back, and a `{ them: … }` page is theirs. Both halves are
  // checked together because either one alone is a scene that reads wrong and
  // says nothing about it: a tagged page with nobody declared would come out in
  // the hero's own box under his own name, and a declared voice nobody uses is
  // a second speaker the player never meets.
  if (def.voice !== undefined) {
    if (!def.voice || typeof def.voice !== "object" || Array.isArray(def.voice)) {
      err("voice must be a mapping of { speaker, portrait }");
    } else {
      if (typeof def.voice.speaker !== "string" || def.voice.speaker === "") {
        err("voice.speaker is required — the name over their words");
      }
      checkSprite(def.voice.portrait, "voice.portrait", refs, err, true);
      for (const key of Object.keys(def.voice)) {
        if (!["speaker", "portrait"].includes(key)) {
          err(`unknown field "voice.${key}"`);
        }
      }
    }
  }
  const pages = Array.isArray(def.pages) ? def.pages : [];
  const tagged = pages.filter((p) => p && !Array.isArray(p));
  if (tagged.length > 0 && def.voice === undefined) {
    err(
      "a `them:` page needs a `voice:` — without one the other party's words " +
        "print in the hero's own box under his own name",
    );
  }
  if (def.voice !== undefined && tagged.length === 0) {
    err("voice declares a speaker no `them:` page uses");
  }
  if (tagged.length === pages.length && pages.length > 0) {
    err("every page is a `them:` page — this is somebody else's scene, not his");
  }
  for (const page of tagged) {
    for (const key of Object.keys(page)) {
      if (key !== "them") err(`unknown page tag "${key}" (only \`them\`)`);
    }
  }
  // Check the LINES of every page, tagged or not, against the same page rules.
  checkPages(
    Array.isArray(def.pages)
      ? def.pages.map((p) => (p && !Array.isArray(p) ? p.them : p))
      : def.pages,
    "pages",
    err,
    warn,
  );
  for (const key of Object.keys(def)) {
    if (!["speaker", "portrait", "voice", "pages"].includes(key)) {
      err(`unknown field "${key}"`);
    }
  }
  return { errors, warnings };
}

/**
 * Validate one story item.
 *
 * @param {string} id    the catalog key (which becomes the def's `id`).
 * @param {object} def   the parsed YAML mapping.
 * @param {object} refs  `{ sprites }` — the icon is drawn on the ground and in
 *                        the lore box, so a name nothing answers to is a plot
 *                        piece the player cannot see.
 */
export function validateStoryItem(id, def, refs) {
  const errors = [];
  const warnings = [];
  const tag = `story item "${id}"`;
  const err = (m) => errors.push(`${tag}: ${m}`);
  const warn = (m) => warnings.push(`${tag}: ${m}`);

  if (!def || typeof def !== "object" || Array.isArray(def)) {
    err("expected a mapping (a StoryItemDef)");
    return { errors, warnings };
  }
  if (!/^[a-z][a-z0-9_]*$/.test(id)) err("id must be lower_snake_case");
  if (typeof def.name !== "string" || def.name === "") {
    err("name is required — the dialogue header and the pickup toast");
  }
  checkSprite(def.icon, "icon", refs, err);
  checkPages(def.lore, "lore", err, warn);
  if (def.unlocks !== undefined && typeof def.unlocks !== "string") {
    err("unlocks must be the id of a level door");
  }
  if (def.suitsHero !== undefined && typeof def.suitsHero !== "boolean") {
    err("suitsHero must be a boolean");
  }
  for (const key of Object.keys(def)) {
    if (!["name", "icon", "lore", "unlocks", "suitsHero"].includes(key)) {
      err(`unknown field "${key}"`);
    }
  }
  return { errors, warnings };
}

/**
 * Validate the cap-farm rotation: the ids the engine cycles when a hero farms an
 * out-levelled map. Every id must be a thought this catalog ships, or the mutter
 * would look up nothing at the moment it fires.
 */
export function validateCapRotation(rotation, thoughtIds) {
  const errors = [];
  const warnings = [];
  if (!Array.isArray(rotation)) {
    errors.push("capRotation must be a list of thought ids");
    return { errors, warnings };
  }
  for (const id of rotation) {
    if (!thoughtIds.has(id)) {
      errors.push(`capRotation names "${id}", which is not a thought`);
    }
  }
  if (rotation.length === 0) {
    warnings.push(
      "capRotation is empty — a hero farming an out-levelled map mutters nothing",
    );
  }
  return { errors, warnings };
}
