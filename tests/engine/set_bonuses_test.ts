// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// SET BONUSES: the green tier's whole point — wearing several pieces of one set
// grants extra affixes on top of each piece's own, cumulative D2-style at 2/3/4
// pieces, with a signature CAPSTONE at the full set. Verified through the same
// effective-stat / max-hp / crit / active-affix reads all combat uses, on a
// SYNTHETIC fixture set (plain ids) so the rule survives content deletion.

import {
  activeEquippedAffixes,
  computeMaxHp,
  effectiveStat,
  playerCritChance,
  registerDefs,
  setBonusAffixes,
  wornSetCount,
  type Equipment,
} from "@game/core";
import { beforeAll, describe, expect, it } from "vitest";

import { startGame } from "./helpers.ts";

const SET_ID = "fix_bonus_set";

// A synthetic 4-piece melee set: +STR at 2pc, +CRIT at 3pc, and a +MAX HP plus
// a sure-strike CAPSTONE at the full 4pc.
beforeAll(() => {
  registerDefs({
    sets: {
      [SET_ID]: {
        id: SET_ID,
        name: "FIXTURE SET",
        weaponClass: "melee",
        members: ["fix_a", "fix_b", "fix_c", "fix_d"],
        bonuses: [
          {
            pieces: 2,
            bonuses: [{ kind: "stat", stat: "strength", value: 5 }],
          },
          { pieces: 3, bonuses: [{ kind: "crit", value: 0.1 }] },
          {
            pieces: 4,
            bonuses: [{ kind: "maxHp", value: 100 }, { kind: "sureStrike" }],
          },
        ],
      },
    },
  });
});

/** A worn set piece: a real fixture armor base (so gear reads resolve) stamped
 * with a set member's `uniqueId`. */
function piece(
  id: number,
  defId: string,
  slot: string,
  member: string,
): Equipment {
  return {
    id,
    defId,
    slot: slot as Equipment["slot"],
    tier: "set",
    ilvl: 20,
    affixes: [],
    uniqueId: member,
  };
}

function wearPieces(state: ReturnType<typeof startGame>, n: number): void {
  const slots: [string, string, string][] = [
    ["head", "test_helmet", "fix_a"],
    ["chest", "test_vest", "fix_b"],
    ["legs", "test_greaves", "fix_c"],
    ["feet", "test_boots", "fix_d"],
  ];
  for (let i = 0; i < n; i++) {
    const [slot, defId, member] = slots[i]!;
    // @ts-expect-error indexing the equipment record by a dynamic armor slot
    state.player.equipment[slot] = piece(900 + i, defId, slot, member);
  }
}

describe("set bonuses", () => {
  it("grant nothing below the 2-piece threshold", () => {
    const state = startGame();
    wearPieces(state, 1);
    expect(wornSetCount(state, SET_ID)).toBe(1);
    expect(setBonusAffixes(state)).toEqual([]);
  });

  it("apply cumulatively as more pieces are worn", () => {
    const state = startGame();
    const baseStr = effectiveStat(state, "strength");
    const baseCrit = playerCritChance(state);
    const baseHp = computeMaxHp(state);

    // 2 pieces → +5 STR only.
    wearPieces(state, 2);
    expect(wornSetCount(state, SET_ID)).toBe(2);
    expect(effectiveStat(state, "strength")).toBe(baseStr + 5);
    expect(playerCritChance(state)).toBe(baseCrit);

    // 3 pieces → +5 STR and +10% CRIT.
    wearPieces(state, 3);
    expect(effectiveStat(state, "strength")).toBe(baseStr + 5);
    expect(playerCritChance(state)).toBeGreaterThan(baseCrit);

    // 4 pieces → the capstone: +100 MAX HP and sure-strike, STR still lifted.
    wearPieces(state, 4);
    expect(effectiveStat(state, "strength")).toBe(baseStr + 5);
    expect(computeMaxHp(state)).toBeGreaterThan(baseHp);
    const affixKinds = activeEquippedAffixes(state).map((a) => a.kind);
    expect(affixKinds).toContain("sureStrike");
  });

  it("go quiet when a set piece breaks (inactive armor drops out)", () => {
    const state = startGame();
    wearPieces(state, 4);
    expect(wornSetCount(state, SET_ID)).toBe(4);
    // Break the feet piece: durability 0 makes it inactive, so the count and
    // the capstone fall back to the 3-piece tier.
    const feet = state.player.equipment.feet;
    if (feet) feet.durability = 0;
    expect(wornSetCount(state, SET_ID)).toBe(3);
    const affixKinds = activeEquippedAffixes(state).map((a) => a.kind);
    expect(affixKinds).not.toContain("sureStrike");
  });
});
