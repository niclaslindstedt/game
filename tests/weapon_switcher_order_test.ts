// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The QUICK DRAW switcher's ORDER (pwa/src/game/game-screen/hud-model.ts
// `weaponAlternatives`, SETTINGS → CONTROLS → QUICK DRAW): the one list the
// in-HUD switcher, the 1-4 hotkeys and the demo's played swap all read, so
// whatever it says about slot order is what every one of them does. Two modes:
// the BACKPACK's own cell order (the default — one place per weapon across
// both screens) and BEST FIRST for this hero. Plus the rules that hold in
// both: a broken weapon is never offered, and the number on a slot is the one
// the list is ranked by.

import { describe, expect, it } from "vitest";

import { weaponDamageFor, weaponDps, type Equipment } from "@game/core";

import { weaponAlternatives } from "../pwa/src/game/game-screen/hud-model.ts";
import { getSettings, updateSettings } from "../pwa/src/game/settings.ts";
import { startGame } from "./helpers.ts";

/** Mint a plain weapon instance from a shipped def. */
function weapon(
  state: ReturnType<typeof startGame>,
  defId: string,
  ilvl = 1,
): Equipment {
  return {
    id: state.nextId++,
    defId,
    slot: "weapon",
    tier: "regular",
    ilvl,
    affixes: [],
  };
}

/** A hero carrying three weapons in a deliberately un-ranked bag order: the
 * feeble sidearm first, the heavy hitter last. */
function stagedBag() {
  const state = startGame();
  const inv = state.players[0].inventory;
  for (let i = 0; i < inv.length; i++) inv[i] = null;
  inv[0] = weapon(state, "blaster"); // the last-resort sidearm
  inv[1] = weapon(state, "box_cutter");
  inv[2] = weapon(state, "executioners_axe", 8);
  return state;
}

describe("quick-draw order (weaponAlternatives)", () => {
  it("defaults to the BACKPACK's own order, cell by cell", () => {
    expect(getSettings().weaponSwitchOrder).toBe("bag");
    const state = stagedBag();
    expect(weaponAlternatives(state).map((a) => a.index)).toEqual([0, 1, 2]);
    // ...and each slot shows what one blow of it lands.
    for (const alt of weaponAlternatives(state)) {
      expect(alt.dmg).toBe(Math.round(weaponDamageFor(state, alt.item)));
    }
  });

  it("ranks BEST FIRST for this hero when asked to", () => {
    const state = stagedBag();
    const ranked = weaponAlternatives(state, "dps");
    const dps = ranked.map((a) => weaponDps(state, a.item));
    // Descending, and the number each slot shows is the one it ranks by.
    for (let i = 1; i < dps.length; i++) {
      expect(dps[i - 1]!).toBeGreaterThanOrEqual(dps[i]!);
    }
    for (const alt of ranked) {
      expect(alt.dmg).toBe(Math.round(weaponDps(state, alt.item)));
    }
    // The bag order stayed a different answer — otherwise this proves nothing.
    expect(ranked.map((a) => a.index)).not.toEqual([0, 1, 2]);
  });

  it("follows the stored setting, so every surface reads one list", () => {
    const state = stagedBag();
    try {
      updateSettings({ weaponSwitchOrder: "dps" });
      expect(weaponAlternatives(state).map((a) => a.index)).toEqual(
        weaponAlternatives(state, "dps").map((a) => a.index),
      );
      updateSettings({ weaponSwitchOrder: "bag" });
      expect(weaponAlternatives(state).map((a) => a.index)).toEqual([0, 1, 2]);
    } finally {
      updateSettings({ weaponSwitchOrder: "bag" });
    }
  });

  it("never offers a broken weapon in either order", () => {
    const state = stagedBag();
    state.players[0].inventory[2]!.durability = 0;
    for (const order of ["bag", "dps"] as const) {
      expect(weaponAlternatives(state, order).some((a) => a.index === 2)).toBe(
        false,
      );
    }
  });
});
