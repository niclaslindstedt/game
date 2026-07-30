// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The YAML talent loader — the peer of the powerup/companion/sound loaders, and
// takes a BASE DIRECTORY for the same reason they do: a MOD's talents go
// through this exact loader and this exact schema (see mod/tools/build.mjs), so
// "it works in my mod" and "it works in the game" mean the same thing.
//
// Layout — one of the catalogs that lives in a SINGLE file, like
// `powerups.yaml` and `companions.yaml`:
//   talents.yaml   a `talents:` mapping of id → talent, at the tree's root.
//
// The catalog KEY is the id, stamped onto the def here so the YAML never has to
// repeat it (and so the two can never disagree).

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

const SHIPPED_ROOT = fileURLToPath(new URL("../../content", import.meta.url));

/**
 * Load a talent catalog.
 *
 * @param baseDir  the tree holding `talents.yaml` (the game's `content/`, or a
 *                 mod's root).
 * @returns `{ talents, entries }` — `talents` is the flat `{ id → def }`
 *          catalog with each `id` stamped in; `entries` is `[{ id, def }]` in
 *          file order for the generator to validate. Throws on a structural
 *          error (a file that isn't a mapping, or no `talents:` key).
 */
export function loadTalents(baseDir = SHIPPED_ROOT) {
  const talents = {};
  const entries = [];
  const source = `${baseDir}/talents.yaml`;

  // A mod need not ship talents; an absent file is an empty catalog.
  if (!existsSync(source)) return { talents, entries };

  const doc = parse(readFileSync(source, "utf8"));
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    throw new Error(`talents.yaml: expected a YAML mapping`);
  }
  const catalog = doc.talents;
  if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) {
    throw new Error(
      `talents.yaml: expected a "talents:" mapping of id → talent`,
    );
  }

  for (const [id, def] of Object.entries(catalog)) {
    if (id in talents) throw new Error(`duplicate talent id "${id}"`);
    talents[id] = { id, ...def };
    entries.push({ id, def });
  }
  return { talents, entries };
}
