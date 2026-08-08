// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The split guard for `@game/menu` (engine/menu.ts) — the engine's menu-side entry
// point, which exists so the app's startup path can read the catalogs without
// reaching the simulation behind them (see the file header there, and the
// critical-path budget in pwa/scripts/check-seo.mjs).
//
// Two things can silently undo that split, and neither shows up as a type
// error:
//
//   1. The level catalog is compiled in two halves — `generated/level-index.ts`
//      (the summaries the menus read) and `generated/levels.ts` (the full defs).
//      A generator change that stops deriving one from the other would leave the
//      menus naming levels differently from the game.
//   2. `menu.ts` re-exports from the same modules `index.ts` does, so a symbol
//      that drifts between the two barrels would resolve to a different
//      implementation depending on which alias the importer used.
//
// A budget breach is caught in CI by check-seo; these are the correctness half.

import { describe, expect, it } from "vitest";

import * as core from "@game/core";
import * as menu from "@game/menu";

import { LEVELS, LEVEL_ORDER, SECRET_LEVEL_ORDER } from "@game/core";

describe("level summaries", () => {
  it("cover every level in the full catalog", () => {
    const ids = Object.keys(LEVELS).sort();
    expect(ids.filter((id) => menu.hasLevel(id))).toEqual(ids);
  });

  it("carry the same name and foes label as the full def", () => {
    for (const id of Object.keys(LEVELS)) {
      const def = core.levelDef(id);
      expect(menu.levelSummary(id)).toEqual({
        name: def.name,
        foes: def.foes,
      });
    }
  });

  it("report an unknown level the way levelDef does", () => {
    expect(menu.hasLevel("no_such_level")).toBe(false);
    expect(() => menu.levelSummary("no_such_level")).toThrow(/unknown level/);
  });

  it("share the campaign and secret order with the full catalog", () => {
    expect(menu.LEVEL_ORDER).toEqual(LEVEL_ORDER);
    expect(menu.SECRET_LEVEL_ORDER).toEqual(SECRET_LEVEL_ORDER);
    // Every ordered id must actually resolve on the menu side.
    for (const id of [...LEVEL_ORDER, ...SECRET_LEVEL_ORDER]) {
      expect(menu.hasLevel(id)).toBe(true);
    }
  });
});

describe("the menu entry point", () => {
  it("hands back the identical binding `@game/core` does", () => {
    // Everything `menu.ts` exports and `index.ts` also exports must be the SAME
    // value — the split is about which modules the startup path can REACH, never
    // about a second implementation of anything.
    const shared = Object.keys(menu).filter((name) => name in core);
    // A sanity floor: if the barrels stopped overlapping, this test would pass
    // vacuously.
    expect(shared.length).toBeGreaterThan(15);
    for (const name of shared) {
      expect(
        menu[name as keyof typeof menu],
        `\`${name}\` differs between @game/menu and @game/core`,
      ).toBe(core[name as keyof typeof core]);
    }
  });

  it("exposes nothing that runs the simulation", () => {
    // The point of the split: a menu importer cannot reach the step pipeline,
    // the level builder, the loot roller or the autopilot through this barrel.
    for (const name of [
      "createGame",
      "step",
      "rollEquipment",
      "spawnEnemy",
      "botThink",
      "levelDef",
      "LEVELS",
    ]) {
      expect(Object.keys(menu)).not.toContain(name);
    }
  });
});
