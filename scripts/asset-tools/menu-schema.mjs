// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The TITLE MENU schema — what `content/mainmenu.yaml` may say, and the whole
// -tree rules that make the compiled menu trustworthy.
//
// The per-screen checks are the ordinary ones (known fields, known enums, an
// icon the atlas answers to). The two that earn this file are structural:
//
//  1. EVERY SCREEN HANGS OFF `main`. A screen's `parent` is where BACK and
//     Escape go, and `home` is the row of that parent the cursor lands on — so
//     a parent chain that loops, or a `home` naming a row that is not there,
//     is a player stranded on a screen with no way out. Both are decided here,
//     at build time, rather than discovered on a phone.
//  2. EVERY GLYPH IS IN THE FONT. Labels and help lines are drawn with the
//     game's own 3x5 pixel font, which renders anything outside its GLYPHS map
//     as `?`. A typed apostrophe, an ellipsis pasted from a doc, an en dash —
//     each is one silent `?` in a shipped menu, and none of them shows up in a
//     test that only reads strings.
//
// Widths are capped for the same reason: a label is drawn at scale 3 beside a
// right-aligned control, and a help line wraps to at most two lines in the
// settings tree's reserved slot. Neither cap is a style preference — past them
// the row overflows a phone held in landscape.

import { GLYPHS } from "./font.mjs";

/** Fields a screen may carry. */
const SCREEN_FIELDS = new Set([
  "id",
  "title",
  "trailName",
  "trail",
  "tone",
  "form",
  "parent",
  "home",
  "surface",
  "scroll",
  "notice",
  "dev",
  "rows",
]);

/** Fields a row may carry. */
const ROW_FIELDS = new Set(["id", "label", "icon", "help", "opens"]);

const TONES = new Set(["player", "dev", "store"]);
const FORMS = new Set(["menu", "settings"]);
const SURFACES = new Set(["full", "column"]);

/** The root of the tree: the one screen with no parent. */
export const ROOT_SCREEN = "main";

/** BACK is appended to every non-root screen from `parent`/`home`, so no screen
 * may author a row by that id — one would render twice and disagree. */
const RESERVED_ROW_IDS = new Set(["back"]);

/** A label sits beside a right-aligned control at scale 3; past this it starts
 * shoving the control off a landscape phone's right edge. */
const MAX_LABEL = 20;
/** The settings tree reserves two lines for the help slot; past this a line
 * wraps to a third and pushes the rows. */
const MAX_HELP = 64;
/** An INLINE blurb (a `menu`-form screen, where the help sits under its own
 * row) has less room before it starts stretching the centred column. */
const MAX_INLINE_HELP = 48;

const ID_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const STATE_RE = /^[a-z][a-zA-Z0-9]*$/;

/** Every character the pixel font can actually draw (lookups uppercase, so the
 * check does too — see pixel-font.ts). */
function unrenderable(text) {
  return [...text.toUpperCase()].filter((ch) => !(ch in GLYPHS));
}

/**
 * Validate ONE screen in isolation: its own fields, and its rows.
 *
 * @param {string} id      the screen id (its key in `screens:`).
 * @param {object} screen  the authored screen.
 * @param {{ sprites: Set<string> }} refs  live sprite names, so an icon the
 *                                          atlas has no answer for fails here.
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function validateMenuScreen(id, screen, refs) {
  const errors = [];
  const warnings = [];
  const err = (msg) => errors.push(`screen "${id}": ${msg}`);

  if (!ID_RE.test(id)) err("id must be lower-case kebab-case");
  for (const key of Object.keys(screen)) {
    if (!SCREEN_FIELDS.has(key)) err(`unknown field "${key}"`);
  }

  const tone = screen.tone ?? "player";
  if (!TONES.has(tone)) err(`unknown tone "${tone}"`);
  const surface = screen.surface;
  if (surface !== undefined && !SURFACES.has(surface)) {
    err(`unknown surface "${surface}"`);
  }
  const form = screen.form ?? "menu";
  if (surface === undefined && !FORMS.has(form)) err(`unknown form "${form}"`);
  if (surface !== undefined && screen.form !== undefined) {
    err("a surface draws its own display, so it has no form");
  }
  for (const flag of ["scroll", "notice", "dev"]) {
    if (screen[flag] !== undefined && typeof screen[flag] !== "boolean") {
      err(`${flag} must be true or false`);
    }
  }
  if (id === ROOT_SCREEN) {
    if (screen.parent !== undefined) err("the root screen has no parent");
    if (screen.title !== undefined) {
      err("the root screen's logo IS its header — it takes no title");
    }
  } else if (typeof screen.parent !== "string") {
    err("needs a parent (where BACK goes)");
  }

  for (const field of ["title", "trailName", "trail"]) {
    const value = screen[field];
    if (value === undefined) continue;
    if (typeof value !== "string") {
      err(`${field} must be a string`);
      continue;
    }
    // `trail: ""` is the authored way to drop a breadcrumb; an empty title or
    // trailName is just a mistake.
    if (value === "" && field !== "trail") err(`${field} must not be empty`);
    const bad = unrenderable(value);
    if (bad.length > 0) {
      err(
        `${field} "${value}" uses ${quote(bad)}, which the pixel font has no glyph for`,
      );
    }
  }
  if (screen.trailName !== undefined && screen.title === undefined) {
    err(
      "trailName names this screen inside a child's trail, so it needs a title",
    );
  }

  if (surface !== undefined && screen.rows.length > 0) {
    err("a surface draws its own display, so it has no rows");
  }

  const seenRows = new Set();
  const seenIcons = new Map();
  // Does this screen use icons AT ALL? They are the idiom of a column of
  // DESTINATIONS (the front door, EXTRAS, the settings index), not of a page of
  // switches — so a missing emblem is only worth saying on a screen that has
  // already decided its rows wear them.
  const wearsIcons = screen.rows.some((row) => row?.icon !== undefined);
  for (const row of screen.rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      err("every row must be a mapping");
      continue;
    }
    const rowId = row.id;
    const at = `row "${rowId ?? "?"}"`;
    if (typeof rowId !== "string" || !ID_RE.test(rowId)) {
      err(`${at}: id must be lower-case kebab-case`);
      continue;
    }
    if (RESERVED_ROW_IDS.has(rowId)) {
      err(`${at}: "${rowId}" is appended from the tree — never author one`);
    }
    if (seenRows.has(rowId)) err(`${at}: duplicate row id`);
    seenRows.add(rowId);
    for (const key of Object.keys(row)) {
      if (!ROW_FIELDS.has(key)) err(`${at}: unknown field "${key}"`);
    }

    if (typeof row.label !== "string" || row.label.length === 0) {
      err(`${at}: needs a label`);
    } else {
      if (row.label !== row.label.toUpperCase()) {
        err(`${at}: label "${row.label}" must be upper-case`);
      }
      if (row.label.length > MAX_LABEL) {
        err(
          `${at}: label "${row.label}" is ${row.label.length} chars — ` +
            `${MAX_LABEL} is what fits beside a control on a phone`,
        );
      }
      const bad = unrenderable(row.label);
      if (bad.length > 0) {
        err(
          `${at}: label uses ${quote(bad)}, which the pixel font has no glyph for`,
        );
      }
    }

    if (row.icon !== undefined) {
      if (typeof row.icon !== "string" || !refs.sprites.has(row.icon)) {
        err(`${at}: icon "${row.icon}" is not a sprite`);
      } else if (seenIcons.has(row.icon)) {
        // Two rows on ONE screen wearing the same emblem is worse than none:
        // on a touch device the icon IS the row's mark, so a repeat says the
        // two rows go to the same place.
        err(
          `${at}: icon "${row.icon}" is already worn by "${seenIcons.get(row.icon)}"`,
        );
      } else {
        seenIcons.set(row.icon, rowId);
      }
    } else if (row.opens !== undefined && wearsIcons) {
      // A navigation row is what an icon is FOR (see the tree's own header), so
      // a destination added to a screen that marks its destinations and left
      // bare is a hole in the map rather than a style choice.
      warnings.push(
        `screen "${id}" ${at}: every other destination here wears an icon`,
      );
    }

    if (row.opens !== undefined && typeof row.opens !== "string") {
      err(`${at}: opens must name a screen`);
    }

    errors.push(...helpErrors(id, at, row.help, form, surface));
  }

  return { errors, warnings };
}

/** A row's help: one line, or a map of STATE to line. */
function helpErrors(id, at, help, form, surface) {
  if (help === undefined) return [];
  const errors = [];
  const cap =
    surface === undefined && form === "menu" ? MAX_INLINE_HELP : MAX_HELP;
  const lines =
    typeof help === "string"
      ? [["", help]]
      : help && typeof help === "object" && !Array.isArray(help)
        ? Object.entries(help)
        : null;
  if (lines === null) {
    return [
      `screen "${id}": ${at}: help must be a line or a map of state to line`,
    ];
  }
  for (const [state, line] of lines) {
    const what = state === "" ? "help" : `help.${state}`;
    if (state !== "" && !STATE_RE.test(state)) {
      errors.push(
        `screen "${id}": ${at}: help state "${state}" must be camelCase`,
      );
    }
    if (typeof line !== "string" || line.length === 0) {
      errors.push(`screen "${id}": ${at}: ${what} must be a non-empty line`);
      continue;
    }
    if (line !== line.toUpperCase()) {
      errors.push(`screen "${id}": ${at}: ${what} must be upper-case`);
    }
    if (line.length > cap) {
      errors.push(
        `screen "${id}": ${at}: ${what} is ${line.length} chars — ` +
          `${cap} is what fits without pushing the rows`,
      );
    }
    const bad = unrenderable(line);
    if (bad.length > 0) {
      errors.push(
        `screen "${id}": ${at}: ${what} uses ${quote(bad)}, ` +
          "which the pixel font has no glyph for",
      );
    }
  }
  return errors;
}

/**
 * Validate the tree as a WHOLE — the half that no per-screen check can see.
 *
 * @param {Record<string, object>} screens  the loaded `{ id → screen }` map.
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function validateMenuTree(screens) {
  const errors = [];
  const warnings = [];

  if (!screens[ROOT_SCREEN]) {
    return {
      errors: [`no "${ROOT_SCREEN}" screen — the tree has no root`],
      warnings,
    };
  }

  for (const [id, screen] of Object.entries(screens)) {
    // --- every `opens` names a real screen, and that screen agrees ----------
    for (const row of screen.rows) {
      const target = row.opens;
      if (target === undefined) continue;
      const child = screens[target];
      if (!child) {
        errors.push(
          `screen "${id}" row "${row.id}": opens "${target}", which is not a screen`,
        );
        continue;
      }
      if (child.parent !== id) {
        errors.push(
          `screen "${id}" row "${row.id}": opens "${target}", whose parent is ` +
            `"${child.parent}" — BACK would not come back here`,
        );
      }
    }

    if (id === ROOT_SCREEN) continue;

    // --- the parent exists, and the chain reaches the root ------------------
    const parent = screens[screen.parent];
    if (!parent) {
      errors.push(`screen "${id}": parent "${screen.parent}" is not a screen`);
      continue;
    }
    const chain = walkUp(screens, id);
    if (chain === null) {
      errors.push(
        `screen "${id}": its parent chain loops — BACK would never reach the menu`,
      );
      continue;
    }

    // --- the developer tree is closed under its children --------------------
    if (parent.dev && !screen.dev) {
      errors.push(
        `screen "${id}": hangs under the developer screen "${parent.id}" but is ` +
          "not marked `dev: true` — it would survive into the store build",
      );
    }

    // --- BACK lands on a row that is really there ---------------------------
    const home = resolveHome(screens, id);
    if (home.error) {
      errors.push(`screen "${id}": ${home.error}`);
    }
  }

  return { errors, warnings };
}

/** The chain of ancestors from `id` up to the root, or null if it loops. */
export function walkUp(screens, id) {
  const chain = [];
  const seen = new Set([id]);
  let at = screens[id]?.parent;
  while (at) {
    if (seen.has(at)) return null;
    seen.add(at);
    const screen = screens[at];
    if (!screen) return chain;
    chain.push(screen);
    at = screen.parent;
  }
  return chain;
}

/** The authored `home:` for a screen whose parent's rows come from a CATALOG
 * (the mission list under the difficulty ladder, the coin packs under the
 * vault): there is no named row to land on, so the builder hands BACK its own
 * cursor. Spelled out rather than left blank, so "no home" is always a decision
 * somebody made and never a row somebody forgot. */
export const DYNAMIC_HOME = "dynamic";

/**
 * Which row of the parent the cursor lands on coming BACK.
 *
 * Authored `home:` wins; otherwise it is the parent row that `opens` this
 * screen — which is why most screens never write one down. Zero or several such
 * rows is not a default anybody chose, so it is an error naming the fix.
 */
export function resolveHome(screens, id) {
  const screen = screens[id];
  const parent = screens[screen.parent];
  if (!parent) return { error: `parent "${screen.parent}" is not a screen` };
  if (screen.home === DYNAMIC_HOME) return { home: undefined };
  if (screen.home !== undefined) {
    return parent.rows.some((row) => row.id === screen.home)
      ? { home: screen.home }
      : {
          error: `home "${screen.home}" is not a row of "${parent.id}"`,
        };
  }
  const openers = parent.rows.filter((row) => row.opens === id);
  if (openers.length === 1) return { home: openers[0].id };
  return {
    error:
      openers.length === 0
        ? `nothing in "${parent.id}" opens it, so BACK has no row to land on — ` +
          "name one with `home:`"
        : `${openers.length} rows of "${parent.id}" open it — name the one BACK ` +
          "lands on with `home:`",
  };
}

function quote(chars) {
  return chars.map((ch) => `"${ch}"`).join(", ");
}
