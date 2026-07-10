// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Scaling unique bonuses: the `statPct` / `maxHpPct` affix kinds a hand-authored
// unique can carry. Unlike a flat `+N`, these are a fraction of the hero's OWN
// value, so they grow as the hero does — the "keeper" bonus. Verified through
// the same effective-stat / max-hp path all combat reads.

import { computeMaxHp, effectiveStat, type Equipment } from "@game/core";
import { describe, expect, it } from "vitest";

import { startGame } from "./helpers.ts";

describe("scaling unique bonuses", () => {
  it("statPct multiplies the hero's OWN total for that stat", () => {
    const state = startGame();
    state.player.stats.strength = 10;
    const base = effectiveStat(state, "strength");
    const dexBefore = effectiveStat(state, "dexterity");
    state.player.equipment.charm = {
      id: 778,
      defId: "test_charm",
      slot: "charm",
      tier: "unique",
      ilvl: 20,
      affixes: [{ kind: "statPct", stat: "strength", value: 0.5 }],
    };
    // +50% of the whole strength total (chosen + auto), not a flat add.
    expect(effectiveStat(state, "strength")).toBe(Math.round(base * 1.5));
    // It only touches its own stat.
    expect(effectiveStat(state, "dexterity")).toBe(dexBefore);
  });

  it("statPct stacks additively with a flat +N stat on the same piece", () => {
    const state = startGame();
    state.player.stats.strength = 20;
    state.player.equipment.charm = {
      id: 779,
      defId: "test_charm",
      slot: "charm",
      tier: "unique",
      ilvl: 20,
      affixes: [
        { kind: "stat", stat: "strength", value: 5 },
        { kind: "statPct", stat: "strength", value: 0.1 },
      ],
    };
    // (20 base + 5 flat) × 1.1
    expect(effectiveStat(state, "strength")).toBe(Math.round(25 * 1.1));
  });

  it("maxHpPct multiplies the whole health pool", () => {
    const state = startGame();
    const base = computeMaxHp(state);
    state.player.equipment.charm = {
      id: 780,
      defId: "test_charm",
      slot: "charm",
      tier: "unique",
      ilvl: 20,
      affixes: [{ kind: "maxHpPct", value: 0.2 }],
    };
    expect(computeMaxHp(state)).toBe(Math.round(base * 1.2));
  });

  it("a scaling bonus is worth more the more the hero has grown", () => {
    const grew = (strength: number): number => {
      const state = startGame();
      state.player.stats.strength = strength;
      const flat = effectiveStat(state, "strength");
      const charm: Equipment = {
        id: 781,
        defId: "test_charm",
        slot: "charm",
        tier: "unique",
        ilvl: 20,
        affixes: [{ kind: "statPct", stat: "strength", value: 0.1 }],
      };
      state.player.equipment.charm = charm;
      return effectiveStat(state, "strength") - flat;
    };
    // +10% yields a bigger absolute gain on a stronger hero.
    expect(grew(100)).toBeGreaterThan(grew(10));
  });
});
