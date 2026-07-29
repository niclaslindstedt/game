// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The YAML enemy loader (see the `enemy-design` skill). Globs the `enemies/`
// tree — one self-describing file per monster, grouped into biome directories —
// and produces the flat `{ id → EnemyDef }` map the engine's ENEMY_DEFS reads,
// the same shape the old per-biome `.ts` rosters produced. The biome directory
// is organizational only (the merged catalog is flat); the file stem IS the
// enemy id, and a duplicate id across the tree fails loudly (the same loud-fail
// style the old `mergeRosters` had).
//
// Layout:
//   enemies/<biome>/<id>.yaml   one enemy: the full EnemyDef, file stem == id

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

// The shipped tree; a MOD passes its own directory so its enemies go through
// the identical loader and schema (see mod/tools/build.mjs).
const SHIPPED_ENEMIES_DIR = fileURLToPath(
  new URL("../../content/enemies", import.meta.url),
);

/**
 * Load the whole enemy tree.
 *
 * @returns `{ enemies, entries }` — `enemies` is the flat `{ id → EnemyDef }`
 *          catalog; `entries` is `[{ id, biome, def }]` in (biome, file) order
 *          for the generator to validate. Throws on a structural error (a file
 *          stem that disagrees with its `id`, or a duplicate id).
 */
export function loadEnemies(enemiesDir = SHIPPED_ENEMIES_DIR) {
  const errors = [];
  const enemies = {};
  const entries = [];
  const seenIn = {}; // id → biome that first defined it

  // A mod need not ship enemies at all; an absent tree is an empty catalog,
  // not a failure.
  if (!existsSync(enemiesDir)) return { enemies, entries };

  const biomes = readdirSync(enemiesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  for (const biome of biomes) {
    const dir = `${enemiesDir}/${biome}`;
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".yaml"))
      .sort();
    for (const file of files) {
      const stem = file.slice(0, -".yaml".length);
      const def = parse(readFileSync(`${dir}/${file}`, "utf8"));
      if (!def || typeof def !== "object" || Array.isArray(def)) {
        errors.push(`${biome}/${file}: expected a mapping (an EnemyDef)`);
        continue;
      }
      if (def.id !== stem) {
        errors.push(
          `${biome}/${file}: id is "${def.id}", expected "${stem}" (the file stem)`,
        );
      }
      if (def.id in enemies) {
        errors.push(
          `enemy "${def.id}" defined by both "${seenIn[def.id]}" and "${biome}"`,
        );
        continue;
      }
      enemies[def.id] = def;
      seenIn[def.id] = biome;
      entries.push({ id: def.id, biome, def });
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `${errors.length} enemy tree error(s):\n  ${errors.join("\n  ")}`,
    );
  }

  return { enemies, entries };
}
