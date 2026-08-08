// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Kind-glyph coverage: every item card prints, in its bottom-right foot, the
// sprite naming WHAT KIND of thing the piece is — `icon_class_<class>` for a
// weapon, `icon_slot_<kind>` for everything else (`itemKindGlyph`). The name is
// BUILT from the slot vocabulary rather than looked up, so a kind whose sprite
// was never drawn (or was drawn under an older name) fails silently: the card
// simply omits the glyph, which is exactly how every TRINKET shipped without
// one after the charm → trinket rename left `icon_slot_charm` orphaned.
//
// So this walks `ITEM_SLOTS` and the weapon classes and asserts each glyph is
// in the shipped ATLAS — the inventory the card actually draws from.

import { readFileSync } from "node:fs";

import { WEAPON_DEFS } from "@game/core";
import { describe, expect, it } from "vitest";

import { ITEM_SLOTS } from "../../engine/game/items/slots.ts";
import { slotGlyph } from "../../pwa/src/game/item-glyph.ts";

describe("item kind glyphs", () => {
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

  const shipsGlyph = (name: string) =>
    expect(
      sprites.has(name),
      `${name} missing from the atlas — draw content/sprites/icons/${name}.yaml and run \`make assets\``,
    ).toBe(true);

  for (const slot of ITEM_SLOTS) {
    it(`the ${slot} kind ships a glyph`, () => {
      shipsGlyph(slotGlyph(slot));
    });
  }

  for (const cls of new Set(
    Object.values(WEAPON_DEFS).map((def) => def.class),
  )) {
    it(`the ${cls} weapon class ships a glyph`, () => {
      shipsGlyph(`icon_class_${cls}`);
    });
  }
});
