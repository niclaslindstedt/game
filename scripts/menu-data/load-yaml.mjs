// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The YAML TITLE MENU loader — the one file describing the whole menu tree.
//
// IT TAKES NO DIRECTORY, AND THAT IS THE POINT. Every other content loader here
// (levels, enemies, items, quests, story) takes a base directory precisely so a
// MOD's copy can go through the same loader and the same schema. The menu is
// the deliberate exception: the tree decides which screens EXIST and which rows
// reach them, so a mod that could replace it could hand itself the hidden
// DEVELOPER tree — the warp, the balance knobs, the arsenal, the coin grant —
// on a shipped build. The menu is app chrome, not content, and the shipped
// `content/mainmenu.yaml` is the only one there ever is. `mod/tools/build.mjs`
// refuses a mod that ships one rather than ignoring it quietly, so the rule is
// stated to the author rather than discovered.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

const MENU_FILE = fileURLToPath(
  new URL("../../content/mainmenu.yaml", import.meta.url),
);

/**
 * Load the title-menu tree.
 *
 * @returns `{ screens, entries }` — `screens` is the `{ id → screen }` catalog
 *          in authored order; `entries` is `[{ id, screen }]` for the schema.
 *          Each screen's `id` is stamped from its catalog key, so the YAML
 *          never repeats itself and the two can never disagree.
 * @throws  on a structural error (a missing `screens:` map, a screen that is
 *          not a mapping, an `id:` that disagrees with its key).
 */
export function loadMenu() {
  const doc = parse(readFileSync(MENU_FILE, "utf8"));
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    throw new Error("content/mainmenu.yaml: expected a mapping");
  }
  const raw = doc.screens;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("content/mainmenu.yaml: expected a `screens:` mapping");
  }

  const screens = {};
  const entries = [];
  const errors = [];
  for (const [id, value] of Object.entries(raw)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      errors.push(`screen "${id}": expected a mapping`);
      continue;
    }
    if (value.id !== undefined && value.id !== id) {
      errors.push(`screen "${id}": id is "${value.id}", expected "${id}"`);
      continue;
    }
    const screen = { ...value, id };
    // A surface screen draws its own display instead of a row list, so it is
    // authored without `rows:` at all — normalise it here rather than making
    // every reader ask twice.
    screen.rows = Array.isArray(screen.rows) ? screen.rows : [];
    screens[id] = screen;
    entries.push({ id, screen });
  }
  if (errors.length > 0) {
    throw new Error(`content/mainmenu.yaml:\n  ${errors.join("\n  ")}`);
  }
  return { screens, entries };
}
