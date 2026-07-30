// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// AN EXECUTIONER MUST ACTUALLY TAKE THE BODY APART — the one claim its whole
// design rests on, checked against the app's OWN burst ladder rather than
// against a number somebody typed twice.
//
// `WeaponDef.execute.bars` is authored in `content/items/`, floored by the item
// schema (`scripts/asset-tools/item-schema.mjs`), and judged by a ladder that
// lives on the far side of the engine/app seam
// (`pwa/src/game/game-screen/overkill.ts`). Three files, no import between the
// first and the last — which is precisely the shape of thing that drifts in
// silence: the ladder's constants have already been renamed, re-based onto the
// OVERKILL rather than the blow, and re-valued (2.2 → 0.4) once. Nothing failed
// when they were, because nothing was comparing them.
//
// So this suite closes the loop. It takes every shipped executioner, stages the
// WORST case its own rules allow — a full-health ELITE, which pays the ladder's
// 2.5x set-piece cost AND spends a whole bar of the blow just getting to zero —
// and asserts the body still comes apart. If a future pass moves `GIB_BARS`,
// re-prices the role costs, or changes what the overkill is measured against,
// this fails with the weapon named, instead of an executioner quietly turning
// into a weapon that kills everything and leaves plain corpses.

import { describe, expect, it } from "vitest";

import { WEAPON_DEFS, isEdgedWeapon, weaponExecuteBars } from "@game/core";

import {
  goreKind,
  overkillBars,
} from "../../pwa/src/game/game-screen/overkill.ts";

/** The shipped weapons that take a body rather than damaging it. */
const EXECUTIONERS = Object.values(WEAPON_DEFS).filter(
  (def) => def.execute !== undefined,
);

describe("every executioner clears the app's burst ladder", () => {
  it("ships at least one (the rule is not vacuously true)", () => {
    expect(EXECUTIONERS.length).toBeGreaterThan(0);
  });

  for (const def of EXECUTIONERS) {
    // The hardest body an execution is ever allowed to take: an ELITE (a boss
    // is refused outright) at FULL health, so the blow both pays the 2.5x
    // set-piece cost and spends a whole bar reaching zero before any of it
    // counts as overkill.
    it(`${def.id} takes a full-health elite apart`, () => {
      const bars = weaponExecuteBars(def.id);
      expect(bars).toBeDefined();
      const maxHp = 1000;
      const overkill = overkillBars(
        (bars as number) * maxHp,
        maxHp, // full health — nothing has softened it up
        maxHp,
      );
      expect(goreKind(overkill, "elite", isEdgedWeapon(def.id))).not.toBeNull();
      // And the fodder it will actually meet, for the same reason.
      expect(
        goreKind(overkill, "minion", isEdgedWeapon(def.id)),
      ).not.toBeNull();
    });

    it(`${def.id} would NOT clear it a bar lower — the floor is load-bearing`, () => {
      // The schema's floor exists because the ladder eats the first whole bar.
      // Prove that is a real cliff rather than a superstition: an execution
      // priced at one bar (i.e. "exactly lethal") has no overkill at all in it.
      const maxHp = 1000;
      expect(overkillBars(1 * maxHp, maxHp, maxHp)).toBe(0);
      expect(goreKind(0, "minion", isEdgedWeapon(def.id))).toBeNull();
    });
  }
});
