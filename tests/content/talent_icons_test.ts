// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Talent-icon coverage: the talent picker draws each talent's glyph through
// `talentIcon` — the def's own `icon:` or the `icon_talent_<id>` convention —
// so every talent in the catalog must ship that sprite. Guards against adding a
// talent to `content/talents.yaml`, or renaming one, without drawing its icon
// under `content/sprites/icons/`.
//
// The BUILD checks the same thing against the sprite TREE (the talent schema's
// icon cross-reference, which is what a mod's talents are held to); this checks
// the shipped ATLAS, which is the inventory the picker actually reads from.

import { readFileSync } from "node:fs";

import { talentDefs, talentIcon } from "@game/core";
import { describe, expect, it } from "vitest";

describe("talent icons", () => {
  // The generated sprite-atlas manifest is the shipping sprite inventory.
  const sprites = new Set(
    Object.keys(
      JSON.parse(
        readFileSync(
          new URL("../../pwa/src/game/assets/atlas.json", import.meta.url),
          "utf8",
        ),
      ),
    ),
  );

  for (const def of Object.values(talentDefs())) {
    it(`${def.id} ships an icon`, () => {
      const name = talentIcon(def);
      expect(
        sprites.has(name),
        `${name} missing from the atlas — draw content/sprites/icons/${name}.yaml and run \`make assets\``,
      ).toBe(true);
    });
  }
});
