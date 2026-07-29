// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The YAML powerup loader — the peer of the sound/music/level/enemy/item
// loaders, and takes a BASE DIRECTORY for the same reason they do: a MOD's
// powers go through this exact loader and this exact schema (see
// mod/tools/build.mjs), so "it works in my mod" and "it works in the game" mean
// the same thing.
//
// Layout — the one catalog that lives in a SINGLE file, like `ladder.yaml`:
//   powerups.yaml   a `powerups:` mapping of id → power, at the tree's root.
//
// The catalog KEY is the id, stamped onto the def here so the YAML never has to
// repeat it (and so the two can never disagree).

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

const SHIPPED_ROOT = fileURLToPath(new URL("../../content", import.meta.url));

/**
 * Load a powerup catalog.
 *
 * @param baseDir  the tree holding `powerups.yaml` (the game's `content/`, or a
 *                 mod's root).
 * @returns `{ powerups, entries }` — `powerups` is the flat `{ id → def }`
 *          catalog with each `id` stamped in; `entries` is `[{ id, def }]` in
 *          file order for the generator to validate. Throws on a structural
 *          error (a file that isn't a mapping, or no `powerups:` key).
 */
export function loadPowerups(baseDir = SHIPPED_ROOT) {
  const powerups = {};
  const entries = [];
  const source = `${baseDir}/powerups.yaml`;

  // A mod need not ship powers; an absent file is an empty catalog.
  if (!existsSync(source)) return { powerups, entries };

  const doc = parse(readFileSync(source, "utf8"));
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    throw new Error(`powerups.yaml: expected a YAML mapping`);
  }
  const catalog = doc.powerups;
  if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) {
    throw new Error(
      `powerups.yaml: expected a "powerups:" mapping of id → powerup`,
    );
  }

  for (const [id, def] of Object.entries(catalog)) {
    if (id in powerups) throw new Error(`duplicate powerup id "${id}"`);
    powerups[id] = { id, ...def };
    entries.push({ id, def });
  }
  return { powerups, entries };
}
