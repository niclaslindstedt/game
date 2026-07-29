// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The YAML sound loader — the peer of the level/enemy/item loaders, and takes a
// DIRECTORY for the same reason they do: a MOD's sounds go through this exact
// loader and this exact schema (see mod/tools/build.mjs), so "it works in my
// mod" and "it works in the game" mean the same thing.
//
// Layout:
//   sounds/<id>.yaml   one sound: the file stem IS the id.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

const SHIPPED_SOUNDS_DIR = fileURLToPath(
  new URL("../../content/sounds", import.meta.url),
);

/**
 * Load a sound tree.
 *
 * @returns `{ sounds, entries }` — `sounds` is the flat `{ id → def }`
 *          catalog; `entries` is `[{ id, doc }]` in file order for the
 *          generator to validate. Throws on a structural error (a stem that
 *          disagrees with its `id`, or a duplicate).
 */
export function loadSounds(soundsDir = SHIPPED_SOUNDS_DIR) {
  const errors = [];
  const sounds = {};
  const entries = [];

  // A mod need not ship sounds; an absent tree is an empty catalog.
  if (!existsSync(soundsDir)) return { sounds, entries };

  const files = readdirSync(soundsDir)
    .filter((f) => f.endsWith(".yaml"))
    .sort();

  for (const file of files) {
    const stem = file.slice(0, -".yaml".length);
    const doc = parse(readFileSync(`${soundsDir}/${file}`, "utf8"));
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
      errors.push(`${file}: expected a mapping (a sound)`);
      continue;
    }
    if (doc.id !== stem) {
      errors.push(`${file}: id is "${doc.id}", expected "${stem}"`);
    }
    if (doc.id in sounds) {
      errors.push(`duplicate sound id "${doc.id}"`);
      continue;
    }
    sounds[doc.id] = doc;
    entries.push({ id: doc.id, doc });
  }

  if (errors.length > 0) {
    throw new Error(
      `${errors.length} sound tree error(s):\n  ${errors.join("\n  ")}`,
    );
  }
  return { sounds, entries };
}
