// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The TRASH tier: the joke class below regular — zero affixes, never rolled
// by the loot rain (TIER_ROLL_ORDER omits it), minted only by scripted drops
// (a boss's forced-tier `loot.items`), and worth pocket lint at the counter.
// Also covers `loot.uniqueItems` — guaranteed named-unique payouts. Runs on
// the synthetic fixtures.

import { describe, expect, it } from "vitest";

import {
  killEnemy,
  registerDefs,
  rollEquipment,
  sellValue,
  TIER_ROLL_ORDER,
} from "@game/core";
import type { EnemyDef } from "@game/core";

import { FIX_ENEMIES } from "./fixtures.ts";
import { makeEnemy, startGame } from "./helpers.ts";

// A boss whose estate is one forced-TRASH weapon plus a guaranteed named
// unique (mirrors ELON MOSQUE's garbage and PUTAIN's watches in one def).
const TEST_HOARDER: EnemyDef = {
  id: "test_hoarder",
  name: "TEST HOARDER",
  role: "boss",
  sprite: "test_hoarder",
  hp: 100,
  speed: 0,
  radius: 14,
  contactDamage: 10,
  critChance: 0.1,
  contactCooldownMs: 900,
  ai: { aggroRadius: 280, leashRadius: 460 },
  loot: {
    items: [{ defId: "test_hammer", tier: "trash" }],
    uniqueItems: ["test_relic"],
    weapons: 0,
    gear: 0,
    xpArrows: 0,
    repairs: 0,
    medkits: 0,
    tierBonus: 0,
  },
};

registerDefs({ enemies: { ...FIX_ENEMIES, test_hoarder: TEST_HOARDER } });

describe("the TRASH tier", () => {
  it("never enters the rolled-tier ladder", () => {
    expect(TIER_ROLL_ORDER).not.toContain("trash");
  });

  it("mints with zero affixes and sells for next to nothing", () => {
    const state = startGame();
    const trash = rollEquipment(state, {
      defId: "test_pipe",
      tier: "trash",
      mlvl: 30,
    });
    expect(trash.tier).toBe("trash");
    expect(trash.affixes).toHaveLength(0);
    const regular = rollEquipment(state, {
      defId: "test_pipe",
      tier: "regular",
      quality: "normal",
      mlvl: 30,
    });
    // An order of magnitude below the same piece at regular.
    expect(sellValue(trash)).toBeLessThan(sellValue(regular) / 5);
  });
});

describe("scripted estates (forced-tier items + loot.uniqueItems)", () => {
  it("a kill pays the trash piece AND the guaranteed named unique", () => {
    const state = startGame();
    const hoarder = makeEnemy(
      { pos: { x: 500, y: 500 }, mlvl: 20 },
      "test_hoarder",
    );
    hoarder.hp = 1;
    hoarder.maxHp = 100;
    hoarder.powerScaled = true;
    state.enemies.push(hoarder);
    killEnemy(state, hoarder, 10, false);

    const equipment = state.items.filter((i) => i.kind === "equipment");
    const trash = equipment.find(
      (i) => i.kind === "equipment" && i.equipment.tier === "trash",
    );
    expect(trash).toBeDefined();
    if (trash?.kind === "equipment") {
      expect(trash.equipment.defId).toBe("test_hammer");
      expect(trash.equipment.affixes).toHaveLength(0);
    }
    const relic = equipment.find(
      (i) => i.kind === "equipment" && i.equipment.uniqueId === "test_relic",
    );
    expect(relic).toBeDefined();
    if (relic?.kind === "equipment") {
      expect(relic.equipment.tier).toBe("unique");
      expect(relic.equipment.name).toBe("TEST RELIC");
    }
  });
});
