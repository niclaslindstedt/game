// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The YAML COMPANION loader — the peer of the powerup/sound/music/level/enemy/
// item loaders, and takes a BASE DIRECTORY for the same reason they do: a MOD's
// companions go through this exact loader and this exact schema (see
// mod/tools/build.mjs), so "it works in my mod" and "it works in the game" mean
// the same thing.
//
// Layout — a single FILE at the tree's root, like `powerups.yaml`:
//   companions.yaml   a `companions:` mapping of id → companion.
//
// The catalog KEY is the id, stamped onto the def here so the YAML never has to
// repeat it (and so the two can never disagree).

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

const SHIPPED_ROOT = fileURLToPath(new URL("../../content", import.meta.url));

/**
 * Load a companion catalog.
 *
 * @param baseDir  the tree holding `companions.yaml` (the game's `content/`, or
 *                 a mod's root).
 * @returns `{ companions, entries }` — `companions` is the flat `{ id → def }`
 *          catalog with each `id` stamped in; `entries` is `[{ id, def }]` in
 *          file order for the schema to validate. Throws on a structural error
 *          (a file that isn't a mapping, or no `companions:` key).
 */
export function loadCompanions(baseDir = SHIPPED_ROOT) {
  const companions = {};
  const entries = [];
  const source = `${baseDir}/companions.yaml`;

  // A mod need not ship companions; an absent file is an empty catalog.
  if (!existsSync(source)) return { companions, entries };

  const doc = parse(readFileSync(source, "utf8"));
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    throw new Error("companions.yaml: expected a YAML mapping");
  }
  const catalog = doc.companions;
  if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) {
    throw new Error(
      'companions.yaml: expected a "companions:" mapping of id → companion',
    );
  }

  for (const [id, def] of Object.entries(catalog)) {
    if (id in companions) throw new Error(`duplicate companion id "${id}"`);
    companions[id] = { id, ...def };
    entries.push({ id, def });
  }
  return { companions, entries };
}
