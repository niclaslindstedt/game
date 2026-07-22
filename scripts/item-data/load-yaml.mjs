// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The YAML item loader (see the `weapon-system` skill). Globs the
// `content/items/` tree — one self-describing file per hand-authored item,
// grouped into RARITY directories (regular/trash for the plain bases,
// set/unique/legendary/artifact for the named chase) — plus the two knob
// files `content/item-quality.yaml` (the make-quality axis) and
// `content/item-rarity.yaml` (the tier ladder + rarity economy). Produces the
// flat catalogs the generator validates and compiles into
// `src/generated/items.ts`.
//
// Layout:
//   items/<rarity>/<id>.yaml   one item: file stem == id, dir == its rarity;
//                              `kind` says which family it is —
//                              `weapon` / `gear` (a plain base the loot
//                              system rolls tiers onto) or `unique` (a named
//                              def minted at its authored rarity).
//   item-quality.yaml          the craftsmanship ladder (BROKEN … PERFECT)
//   item-rarity.yaml           the tier ladder (trash … artifact) + knobs

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

const contentDir = fileURLToPath(new URL("../../content", import.meta.url));

/** Parse one YAML mapping file, failing loudly on a non-mapping. */
function loadMapping(path, what) {
  const doc = parse(readFileSync(path, "utf8"));
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    throw new Error(`${what}: expected a YAML mapping`);
  }
  return doc;
}

/**
 * Load the whole item tree plus the quality/rarity knob files.
 *
 * @returns `{ items, entries, quality, rarity }` — `items` is the flat
 *          `{ id → doc }` catalog across every rarity directory; `entries` is
 *          `[{ id, rarity, doc }]` in (rarity, file) order for the generator
 *          to validate; `quality`/`rarity` are the parsed knob files. Throws
 *          on a structural error (a file stem that disagrees with its `id`, a
 *          `rarity` field that disagrees with its directory, or a duplicate
 *          id).
 */
export function loadItems() {
  const errors = [];
  const items = {};
  const entries = [];
  const seenIn = {}; // id → rarity dir that first defined it

  const itemsDir = `${contentDir}/items`;
  const rarities = existsSync(itemsDir)
    ? readdirSync(itemsDir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort()
    : [];

  for (const rarity of rarities) {
    const dir = `${itemsDir}/${rarity}`;
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".yaml"))
      .sort();
    for (const file of files) {
      const stem = file.slice(0, -".yaml".length);
      const doc = parse(readFileSync(`${dir}/${file}`, "utf8"));
      if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
        errors.push(`${rarity}/${file}: expected a mapping (an item def)`);
        continue;
      }
      if (doc.id !== stem) {
        errors.push(
          `${rarity}/${file}: id is "${doc.id}", expected "${stem}" (the file stem)`,
        );
      }
      if (doc.rarity !== rarity) {
        errors.push(
          `${rarity}/${file}: rarity is "${doc.rarity}", expected "${rarity}" (the directory)`,
        );
      }
      if (doc.id in items) {
        errors.push(
          `item "${doc.id}" defined by both "${seenIn[doc.id]}" and "${rarity}"`,
        );
        continue;
      }
      items[doc.id] = doc;
      seenIn[doc.id] = rarity;
      entries.push({ id: doc.id, rarity, doc });
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `${errors.length} item tree error(s):\n  ${errors.join("\n  ")}`,
    );
  }

  return {
    items,
    entries,
    quality: loadMapping(
      `${contentDir}/item-quality.yaml`,
      "item-quality.yaml",
    ),
    rarity: loadMapping(`${contentDir}/item-rarity.yaml`, "item-rarity.yaml"),
  };
}
