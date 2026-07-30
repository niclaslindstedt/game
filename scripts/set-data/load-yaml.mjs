// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The YAML SET loader — the peer of the companion/powerup/sound/music/level/
// enemy/item loaders, and takes a BASE DIRECTORY for the same reason they do: a
// MOD's sets go through this exact loader and this exact schema (see
// mod/tools/build.mjs), so "it works in my mod" and "it works in the game" mean
// the same thing.
//
// Layout — a single FILE at the tree's root, like `companions.yaml`:
//   sets.yaml   a `sets:` mapping of id → set.
//
// The catalog KEY is the id, stamped onto the def here so the YAML never has to
// repeat it (and so the two can never disagree).

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

const SHIPPED_ROOT = fileURLToPath(new URL("../../content", import.meta.url));

/**
 * Load a set catalog.
 *
 * @param baseDir  the tree holding `sets.yaml` (the game's `content/`, or a
 *                 mod's root).
 * @returns `{ sets, entries }` — `sets` is the flat `{ id → def }` catalog with
 *          each `id` stamped in; `entries` is `[{ id, def }]` in file order for
 *          the schema to validate. Throws on a structural error (a file that
 *          isn't a mapping, or no `sets:` key).
 */
export function loadSets(baseDir = SHIPPED_ROOT) {
  const sets = {};
  const entries = [];
  const source = `${baseDir}/sets.yaml`;

  // A mod need not ship sets; an absent file is an empty catalog.
  if (!existsSync(source)) return { sets, entries };

  const doc = parse(readFileSync(source, "utf8"));
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    throw new Error("sets.yaml: expected a YAML mapping");
  }
  const catalog = doc.sets;
  if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) {
    throw new Error('sets.yaml: expected a "sets:" mapping of id → set');
  }

  for (const [id, def] of Object.entries(catalog)) {
    if (id in sets) throw new Error(`duplicate set id "${id}"`);
    sets[id] = { id, ...def };
    entries.push({ id, def });
  }
  return { sets, entries };
}
