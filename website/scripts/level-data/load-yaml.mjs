// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The YAML level loader (see the `level-design` skill). Globs the `levels/`
// tree — one self-describing file per level — and produces the plain LevelDef
// objects the engine consumes, mirroring the sprite loader
// (`sprite-data/load-yaml.mjs`). A level YAML carries every `LevelDef` field
// plus three authoring-only keys the loader strips before handing the def to
// the engine:
//
//   description   free-text design intent (documentation + the map renderer)
//   campaign      true → the level joins the ordered campaign (LEVEL_ORDER)
//   secret        true → an off-campaign venue (SECRET_LEVEL_ORDER)
//
// Layout:
//   levels/<id>.yaml   description, campaign|secret, then the LevelDef fields
//                      (the file stem must equal the level `id`).

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

const levelsDir = fileURLToPath(new URL("../levels", import.meta.url));

/**
 * Load the whole level tree.
 *
 * @returns `{ entries }` where each entry is
 *   `{ id, def, description, campaign, secret }` — `def` is the pure LevelDef
 *   (authoring keys stripped). Throws on a duplicate id or a stem/id mismatch.
 */
export function loadLevels() {
  const errors = [];
  const files = readdirSync(levelsDir)
    .filter((f) => f.endsWith(".yaml"))
    .sort();

  const seen = new Set();
  const entries = [];
  for (const file of files) {
    const stem = file.slice(0, -".yaml".length);
    const doc = parse(readFileSync(`${levelsDir}/${file}`, "utf8"));
    if (doc.id !== stem) {
      errors.push(`${file}: id is "${doc.id}", expected "${stem}"`);
    }
    if (seen.has(doc.id)) {
      errors.push(`duplicate level id "${doc.id}"`);
      continue;
    }
    seen.add(doc.id);

    const { description, campaign, secret, ...def } = doc;
    if (campaign && secret) {
      errors.push(`${file}: level is both campaign and secret — pick one`);
    }
    if (!campaign && !secret) {
      errors.push(
        `${file}: level is neither campaign nor secret — set one to true`,
      );
    }
    entries.push({
      id: doc.id,
      def,
      description: description ?? "",
      campaign: Boolean(campaign),
      secret: Boolean(secret),
    });
  }

  if (errors.length > 0) {
    throw new Error(
      `${errors.length} level load error(s):\n  ${errors.join("\n  ")}`,
    );
  }

  return { entries };
}
