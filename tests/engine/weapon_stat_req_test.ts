// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The weapon ATTRIBUTE requirement — the Diablo stat gate that forces a build
// to pick a lane (STRENGTH for melee, DEXTERITY for ranged, INTELLIGENCE for
// magic). It rides ON TOP of the level gate, is DERIVED from the weapon's
// levelReq (never authored per item), and scales with the AUTO LEVEL STATS dev
// flag so the arsenal never needs recalibrating when auto-attributes toggle.

import { afterEach, describe, expect, it } from "vitest";

import {
  baseStatBonus,
  canEquip,
  chosenStatPointsThrough,
  meetsStatReq,
  registerDefs,
  setAutoStatGainsEnabled,
  STAT_REQ,
  statRequirement,
} from "@game/core";
import type { Equipment, GameState, WeaponDef } from "@game/core";

import {
  FIX_ABILITIES,
  FIX_DIFFICULTIES,
  FIX_ENEMIES,
  FIX_GEAR,
  FIX_LEVEL,
  FIX_STORY_ITEMS,
  FIX_WEAPONS,
  installFixtures,
} from "./fixtures.ts";
import { startGame } from "./helpers.ts";

// One base per class at a mid-campaign levelReq, so the derived requirement is
// meaty enough to bite (a levelReq-1 base derives to nothing).
const REQ = 16;
const REQ_MELEE: WeaponDef = {
  id: "req_blade",
  name: "REQ BLADE",
  class: "melee",
  levelReq: REQ,
  damage: 30,
  cooldownMs: 500,
  range: 44,
  durability: 200,
  icon: "icon_medieval_sword",
};
const REQ_RANGED: WeaponDef = {
  ...REQ_MELEE,
  id: "req_bow",
  name: "REQ BOW",
  class: "ranged",
  projectile: { speed: 420, radius: 3, lifetimeMs: 800, sprite: "bolt" },
};
const REQ_MAGIC: WeaponDef = {
  ...REQ_MELEE,
  id: "req_staff",
  name: "REQ STAFF",
  class: "magic",
  projectile: { speed: 340, radius: 4, lifetimeMs: 1200, sprite: "spark" },
};

function installReqFixtures(): void {
  registerDefs({
    weapons: {
      ...FIX_WEAPONS,
      req_blade: REQ_MELEE,
      req_bow: REQ_RANGED,
      req_staff: REQ_MAGIC,
    },
    gear: FIX_GEAR,
    enemies: FIX_ENEMIES,
    abilities: FIX_ABILITIES,
    difficulties: FIX_DIFFICULTIES,
    storyItems: FIX_STORY_ITEMS,
    levels: { test_level: FIX_LEVEL },
  });
}

function weapon(defId: string): Equipment {
  return {
    id: 1,
    defId,
    slot: "weapon",
    tier: "regular",
    ilvl: REQ,
    affixes: [],
    durability: 200,
  };
}

// The chosen-point portion of a requirement at the fixture rung — the share of
// a hero's trainable points a focused build must commit, the same for every
// class and every auto-flag state.
const CHOSEN_PART = Math.round(
  STAT_REQ.investFraction * chosenStatPointsThrough(REQ),
);

afterEach(() => {
  setAutoStatGainsEnabled(true); // the engine default; tests must restore it
  installFixtures(true);
});

describe("weapon stat requirements", () => {
  it("gates each weapon class on its own attribute", () => {
    installReqFixtures();
    expect(statRequirement("req_blade")?.stat).toBe("strength");
    expect(statRequirement("req_bow")?.stat).toBe("dexterity");
    expect(statRequirement("req_staff")?.stat).toBe("intelligence");
  });

  it("derives the amount from levelReq — auto floor plus a share of chosen points", () => {
    installReqFixtures();
    setAutoStatGainsEnabled(true);
    // Melee/ranged carry the automatic growth of their stat as a floor…
    expect(statRequirement("req_blade")?.amount).toBe(
      baseStatBonus(REQ, "strength") + CHOSEN_PART,
    );
    expect(statRequirement("req_bow")?.amount).toBe(
      baseStatBonus(REQ, "dexterity") + CHOSEN_PART,
    );
    // …INTELLIGENCE has no auto growth, so a magic weapon's whole requirement
    // is the chosen share.
    expect(baseStatBonus(REQ, "intelligence")).toBe(0);
    expect(statRequirement("req_staff")?.amount).toBe(CHOSEN_PART);
  });

  it("leaves gear and levelReq-1 starters ungated", () => {
    installReqFixtures();
    expect(statRequirement("test_vest")).toBeNull(); // gear has no class
    expect(statRequirement("test_charm")).toBeNull();
    expect(statRequirement("crude_sword")).toBeNull(); // req 1 → derives to 0
    expect(statRequirement("blaster")).toBeNull();
  });

  it("turning auto-stats off drops the requirement by exactly the auto floor", () => {
    installReqFixtures();
    setAutoStatGainsEnabled(true);
    const onReq = statRequirement("req_blade")!.amount;
    setAutoStatGainsEnabled(false);
    const offReq = statRequirement("req_blade")!.amount;
    // Auto off, the STRENGTH floor is gone; only the chosen share remains.
    expect(offReq).toBe(CHOSEN_PART);
    setAutoStatGainsEnabled(true);
    expect(onReq - offReq).toBe(baseStatBonus(REQ, "strength"));
  });

  it("demands the SAME chosen investment whether auto-stats is on or off", () => {
    installReqFixtures();
    // A hero AT the weapon's rung: the automatic floor baked into the
    // requirement equals the floor the hero has actually accrued, so the two
    // cancel and the boundary is purely the CHOSEN points invested — identical
    // whether the free growth is switched on or off.
    for (const auto of [true, false]) {
      setAutoStatGainsEnabled(auto);
      const state: GameState = startGame();
      state.player.level = REQ;

      state.player.stats.strength = CHOSEN_PART - 1; // one point shy
      expect(canEquip(state, weapon("req_blade"))).toBe(false);

      state.player.stats.strength = CHOSEN_PART; // exactly enough
      expect(canEquip(state, weapon("req_blade"))).toBe(true);
    }
  });

  it("banks a weapon the build is too weak to wield, wields it once the stat is met", () => {
    installReqFixtures();
    const state: GameState = startGame();
    state.player.level = 40; // well past the level gate, so only the stat bites
    const need = statRequirement("req_blade")!.amount;

    // A hero who dumped nothing into STRENGTH can't heft the melee blade even
    // over-leveled — it banks.
    state.player.stats.strength = 0;
    setAutoStatGainsEnabled(false); // no auto STRENGTH to lean on
    expect(meetsStatReq(state, weapon("req_blade"))).toBe(false);
    expect(canEquip(state, weapon("req_blade"))).toBe(false);

    // Invest enough STRENGTH and the same find equips.
    state.player.stats.strength = need;
    expect(meetsStatReq(state, weapon("req_blade"))).toBe(true);
    expect(canEquip(state, weapon("req_blade"))).toBe(true);
  });
});
