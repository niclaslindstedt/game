// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Talent-icon coverage: the talent picker draws each talent's glyph by deriving
// `icon_talent_<id>` from its def id (TalentPickerOverlay), so every talent in
// the catalog must ship that sprite. Guards against adding a talent — or
// renaming one — without drawing its icon under `content/sprites/icons/`.

import { readFileSync } from "node:fs";

import { talentDefs } from "@game/core";
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
      const name = `icon_talent_${def.id}`;
      expect(
        sprites.has(name),
        `${name} missing from the atlas — draw content/sprites/icons/${name}.yaml and run \`make assets\``,
      ).toBe(true);
    });
  }
});
