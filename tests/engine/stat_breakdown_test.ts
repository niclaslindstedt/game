// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// statBreakdown — the itemised answer to "why is this attribute not the number
// I picked". The character sheet prints `effectiveStat` while the level-up
// chooser prints `spentStats`, and a hero who has spent nothing can honestly
// read 1 on one screen and 0 on the other: a carried chip, a starting ring, the
// difficulty's head start, or automatic per-level growth put it there. This
// suite pins each source to its own field, and pins the whole thing to the
// number it explains — a breakdown that disagrees with `effectiveStat` is worse
// than no breakdown at all.

import { afterEach, describe, expect, it } from "vitest";

import {
  allocateStat,
  baseStatBonus,
  createGame,
  effectiveStat,
  setAutoStatGainsEnabled,
  statBreakdown,
  type Equipment,
} from "@game/core";

import { startGame } from "./helpers.ts";

// The engine default is auto-growth ON; the tests that flip it restore it.
afterEach(() => setAutoStatGainsEnabled(true));

/** Mint a fixture gear instance with no rolled affixes on it. */
function piece(id: number, defId: string, slot: Equipment["slot"]): Equipment {
  return { id, defId, slot, tier: "regular", ilvl: 1, affixes: [] };
}

describe("statBreakdown", () => {
  it("a fresh hero's every source is zero", () => {
    setAutoStatGainsEnabled(false);
    const state = startGame();
    const parts = statBreakdown(state, state.players[0], "intelligence");
    expect(parts).toMatchObject({
      chosen: 0,
      headStart: 0,
      auto: 0,
      gear: 0,
      pct: 0,
      raw: 0,
      effective: 0,
    });
  });

  it("a chosen point lands in `chosen` and nowhere else", () => {
    setAutoStatGainsEnabled(false);
    const state = startGame();
    state.players[0].pendingStatPoints = 1;
    allocateStat(state, state.players[0], "strength");
    const parts = statBreakdown(state, state.players[0], "strength");
    expect(parts.chosen).toBe(1);
    expect(parts.headStart).toBe(0);
    expect(parts.auto).toBe(0);
    expect(parts.gear).toBe(0);
  });

  it("the difficulty head-start is its own source, not a chosen point", () => {
    setAutoStatGainsEnabled(false);
    // EASY banks a broad head start the player never picked (difficulties.ts).
    const state = createGame(7, "test_level", "easy");
    const parts = statBreakdown(state, state.players[0], "strength");
    expect(parts.headStart).toBeGreaterThan(0);
    expect(parts.chosen).toBe(0);
    expect(parts.raw).toBeGreaterThanOrEqual(parts.headStart);
  });

  it("automatic per-level growth is its own source, and the flag silences it", () => {
    const state = startGame();
    state.players[0].level = 5;
    setAutoStatGainsEnabled(true);
    expect(statBreakdown(state, state.players[0], "stamina").auto).toBe(
      baseStatBonus(5, "stamina"),
    );
    expect(baseStatBonus(5, "stamina")).toBeGreaterThan(0);

    setAutoStatGainsEnabled(false);
    expect(statBreakdown(state, state.players[0], "stamina").auto).toBe(0);
  });

  it("a CARRIED passive trinket shows up as gear — the +1 nothing else accounted for", () => {
    setAutoStatGainsEnabled(false);
    const state = startGame();
    const hero = state.players[0];
    expect(statBreakdown(state, hero, "intelligence").gear).toBe(0);

    // `test_chip` pays `+1 INT` from the BAG — never equipped, never chosen,
    // and until the sheet itemised it, never explained either.
    hero.inventory[0] = piece(1, "test_chip", "trinket");
    const parts = statBreakdown(state, hero, "intelligence");
    expect(parts.chosen).toBe(0);
    expect(parts.gear).toBe(1);
    expect(parts.effective).toBe(1);
  });

  it("a worn base's own stat bonus counts as gear", () => {
    setAutoStatGainsEnabled(false);
    const state = startGame();
    const hero = state.players[0];
    const before = statBreakdown(state, hero, "luck").gear;
    // `test_ring` grants `+1 LUCK` off its base, the way jewellery does.
    hero.equipment.ring1 = piece(2, "test_ring", "ring");
    expect(statBreakdown(state, hero, "luck").gear).toBe(before + 1);
  });

  it("the parts always sum to the raw total, and the breakdown to the sheet's number", () => {
    setAutoStatGainsEnabled(true);
    const state = createGame(9, "test_level", "easy");
    const hero = state.players[0];
    hero.level = 6;
    hero.pendingStatPoints = 2;
    allocateStat(state, hero, "luck");
    allocateStat(state, hero, "luck");
    hero.inventory[0] = piece(3, "test_chip", "trinket");
    hero.equipment.ring1 = piece(4, "test_ring_greater", "ring");

    for (const stat of ["luck", "intelligence", "stamina"] as const) {
      const parts = statBreakdown(state, hero, stat);
      expect(parts.chosen + parts.headStart + parts.auto + parts.gear).toBe(
        parts.raw,
      );
      expect(parts.effective).toBe(effectiveStat(state, hero, stat));
    }
  });
});
