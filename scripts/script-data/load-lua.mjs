// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The SCRIPT loader — the peer of the talent/powerup/companion loaders, and it
// takes a BASE DIRECTORY for the same reason they do: a MOD's scripts go
// through this exact loader, this exact schema and this exact compiler (see
// mod/tools/build.mjs), so "it works in my mod" and "it works in the game" mean
// the same thing.
//
// Layout — one file per system, the stem being the script id:
//   scripts/progression.lua
//   scripts/menace.lua
//   scripts/loot.lua
//   scripts/combat.lua
//
// The one catalog whose source is NOT YAML: a rule is code, and authoring code
// as a quoted string inside a data file would cost every author their editor's
// syntax highlighting, their line numbers and their diff.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SHIPPED_ROOT = fileURLToPath(new URL("../../content", import.meta.url));

/**
 * Load a script catalog.
 *
 * @param baseDir  the tree holding a `scripts/` folder (the game's `content/`,
 *                 or a mod's root).
 * @returns `{ scripts, entries }` — `scripts` is the flat `{ id → { id,
 *          source } }` catalog the engine registers, `entries` is
 *          `[{ id, source, file }]` in load order for the generator to compile
 *          and validate, with `file` for the error messages.
 */
export function loadScripts(baseDir = SHIPPED_ROOT) {
  const scripts = {};
  const entries = [];
  const dir = path.join(baseDir, "scripts");

  // A mod need not ship scripts; an absent folder is an empty catalog — which
  // is the normal case, since a mod that only adds content changes no rules.
  if (!existsSync(dir)) return { scripts, entries };

  // Sorted, so the compile ORDER (and therefore the order errors are reported
  // in) is the same on every filesystem.
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".lua") && !f.startsWith("_"))
    .sort();

  for (const file of files) {
    const id = file.slice(0, -".lua".length);
    const source = readFileSync(path.join(dir, file), "utf8");
    scripts[id] = { id, source };
    entries.push({ id, source, file: `scripts/${file}` });
  }
  return { scripts, entries };
}
