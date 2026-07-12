// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The NAMED-ITEM drop economy (uniques/legendaries/artifacts via the global
// rarity roll — `rollTier` → `pickUniqueForDrop`): the HARD+ gate on the chase
// tiers, the item-level FLOOR that drags drops up with the hero (no "level-60
// crap" at level 99), the equip-req ceiling (a req-99 legendary drops only
// once the hero is high enough), and the farm-venue `namedDropMult`. Driven on
// synthetic fixtures so the rules survive content deletion.

import { describe, expect, it } from "vitest";

import { LOOT, registerDefs } from "@game/core";
import type { GameState, UniqueDef } from "@game/core";
import { rollEquipment } from "../../src/game/items.ts";

import { FIX_UNIQUES } from "./fixtures.ts";
import { startGame } from "./helpers.ts";

// A fixture legendary + artifact on fixture bases spanning the ilvl ladder, so
// the floor/gate rules have real named items to select. The fixture weapon
// bases (`test_hammer`, `test_wand`) and `test_charm` all gate at req ~1, so
// the equip CEILING never bites here — the req-gate (a req-99 item drops only
// at the cap) is verified against the shipped catalog in scripts/drop-rate.mjs.
const LEG_LOW: UniqueDef = {
  id: "test_leg_low",
  name: "TEST LEG LOW",
  base: "test_hammer",
  slot: "weapon",
  tier: "legendary",
  ilvl: 40,
  bonuses: [{ kind: "damagePct", value: 0.2 }],
  lore: "x",
};
const LEG_CAP: UniqueDef = {
  id: "test_leg_cap",
  name: "TEST LEG CAP",
  base: "test_wand",
  slot: "weapon",
  tier: "legendary",
  ilvl: 99,
  bonuses: [{ kind: "damagePct", value: 0.2 }],
  lore: "x",
};
const ART_CAP: UniqueDef = {
  id: "test_art_cap",
  name: "TEST ART CAP",
  base: "test_charm",
  slot: "charm",
  tier: "artifact",
  ilvl: 99,
  bonuses: [{ kind: "stat", stat: "luck", value: 8 }],
  lore: "x",
};

function installNamed(): void {
  registerDefs({
    uniques: {
      ...FIX_UNIQUES,
      test_leg_low: LEG_LOW,
      test_leg_cap: LEG_CAP,
      test_art_cap: ART_CAP,
    },
  });
}

/** Roll `n` drops of a forced family and tally the named ids / tiers seen. */
function rollMany(
  state: GameState,
  n: number,
): { ids: Set<string>; tiers: Record<string, number> } {
  const ids = new Set<string>();
  const tiers: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    const e = rollEquipment(state);
    tiers[e.tier] = (tiers[e.tier] ?? 0) + 1;
    if (e.uniqueId) ids.add(e.uniqueId);
  }
  return { ids, tiers };
}

describe("named-item drop gates", () => {
  it("legendaries/artifacts NEVER drop below HARD", () => {
    for (const difficulty of ["easy", "medium"] as const) {
      installNamed();
      const state = startGame(7, "test_level");
      state.difficulty = difficulty;
      state.player.level = 60;
      const { tiers } = rollMany(state, 20_000);
      expect(tiers.legendary ?? 0).toBe(0);
      expect(tiers.artifact ?? 0).toBe(0);
    }
  });

  it("legendaries drop from HARD up", () => {
    installNamed();
    const state = startGame(7, "test_level");
    state.difficulty = "jesus";
    state.player.level = 60;
    const { tiers } = rollMany(state, 30_000);
    expect(tiers.legendary ?? 0).toBeGreaterThan(0);
  });

  it("the item-level FLOOR retires low-ilvl relics as the hero levels", () => {
    // At level 99 (loot level ~99, floor 99 − namedIlvlWindow) the ilvl-40
    // legendary is retired — no 'level-60 crap' — while the ilvl-99 one drops.
    installNamed();
    const hi = startGame(7, "test_level");
    hi.difficulty = "jesus";
    hi.player.level = 99;
    const { ids: hiIds } = rollMany(hi, 40_000);
    expect(hiIds.has("test_leg_cap")).toBe(true);
    expect(hiIds.has("test_leg_low")).toBe(false);
    expect(99 - LOOT.namedIlvlWindow).toBeGreaterThan(LEG_LOW.ilvl);

    // Earlier, at a level where its ilvl sits in-band, the low one DOES drop.
    installNamed();
    const lo = startGame(7, "test_level");
    lo.difficulty = "hard";
    lo.player.level = 45;
    const { ids: loIds } = rollMany(lo, 40_000);
    expect(loIds.has("test_leg_low")).toBe(true);
  });

  it("the ARTIFACT tier lands at the cap (its own rarer roll, HARD+)", () => {
    installNamed();
    const art = startGame(7, "test_level");
    art.difficulty = "jesus";
    art.player.level = 99;
    const { tiers } = rollMany(art, 120_000);
    expect(tiers.artifact ?? 0).toBeGreaterThan(0);
  });
});
