// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Worn-gear overlay coverage: the paper-doll (pwa/src/game/paper-doll.ts)
// dresses the hero in a `worn_<defId>` overlay per equipped armor piece and
// puts the weapon's icon in his hand, so every armor base in the catalog must
// ship its generated overlay frames and every weapon must ship its icon.
// Guards against adding a piece (or renaming an icon) without regenerating
// the atlas.

import { readFileSync } from "node:fs";

import { GEAR_DEFS, WEAPON_DEFS, type ArmorSlot } from "@game/core";
import { describe, expect, it } from "vitest";

// Frame suffixes per slot: the upper body never bobs (one frame); legs and
// feet track the two stride frames (the jump pose reuses legs `_0` and hides
// the feet — see asset-tools/worn.mjs).
const SLOT_FRAMES: Record<ArmorSlot, string[]> = {
  head: [""],
  chest: [""],
  legs: ["_0", "_1"],
  feet: ["_0", "_1"],
};

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

describe("worn-gear overlays", () => {
  for (const def of Object.values(GEAR_DEFS)) {
    const frames = SLOT_FRAMES[def.slot as ArmorSlot];
    if (!frames) continue; // charms and bags have no on-body look
    if (def.grade) {
      // Grade variants share their normal ancestor's overlay via `gradeBase`.
      it(`${def.id} resolves to its base's overlay`, () => {
        expect(def.gradeBase, `${def.id} has no gradeBase`).toBeTruthy();
        expect(
          sprites.has(`worn_${def.gradeBase}${frames[0]}`),
          `worn_${def.gradeBase}${frames[0]} missing from the atlas`,
        ).toBe(true);
      });
      continue;
    }
    it(`${def.id} ships its worn overlay`, () => {
      for (const frame of frames) {
        expect(
          sprites.has(`worn_${def.id}${frame}`),
          `worn_${def.id}${frame} missing from the atlas — run \`make assets\``,
        ).toBe(true);
      }
    });
  }
});

describe("held-weapon icons", () => {
  for (const def of Object.values(WEAPON_DEFS)) {
    it(`${def.id} ships its icon`, () => {
      expect(
        sprites.has(def.icon),
        `${def.icon} missing from the atlas — run \`make assets\``,
      ).toBe(true);
    });
  }
});
