// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The AUTO-EQUIP-ON-PICKUP setting (setAutoEquipEnabled): with it on (the
// engine default), a picked-up upgrade is worn on the spot; with it off, even
// a genuine upgrade banks to the bag so the player equips it by hand. The flag
// gates the pickup path only — the pure `isBetterEquipment` ranking and the
// manual AUTO-EQUIP sweep are unaffected. Runs on synthetic fixtures.

import { afterEach, describe, expect, it } from "vitest";

import {
  autoEquipBest,
  isAutoEquipEnabled,
  isBetterEquipment,
  setAutoEquipEnabled,
  step,
  weaponDef,
} from "@game/core";
import type { Equipment } from "@game/core";
import { clearStage, DT, idle, startGame } from "./helpers.ts";

function weapon(id: number, defId: string): Equipment {
  return {
    id,
    defId,
    slot: "weapon",
    tier: "regular",
    ilvl: 5,
    affixes: [],
    durability: weaponDef(defId).durability,
  };
}

/** Drop `upgrade` on top of the player so the next step collects it. */
function dropOnPlayer(state: ReturnType<typeof startGame>, up: Equipment) {
  state.items = [
    { id: 1, kind: "equipment", pos: { ...state.player.pos }, equipment: up },
  ];
}

describe("auto-equip-on-pickup setting", () => {
  // The engine default is on; every test restores it so ordering can't leak.
  afterEach(() => setAutoEquipEnabled(true));

  it("defaults on", () => {
    expect(isAutoEquipEnabled()).toBe(true);
  });

  it("wears a picked-up upgrade on the spot when on", () => {
    const state = startGame();
    clearStage(state);
    state.player.equipment.weapon = weapon(50, "crude_sword"); // dmg 20
    const upgrade = weapon(60, "test_hammer"); // dmg 34 → out-scores
    dropOnPlayer(state, upgrade);

    setAutoEquipEnabled(true);
    step(state, idle, DT);

    expect(state.player.equipment.weapon.id).toBe(60);
    // The displaced sword banks; nothing is destroyed.
    expect(state.player.inventory.some((i) => i?.id === 50)).toBe(true);
  });

  it("banks the same upgrade to the bag when off", () => {
    const state = startGame();
    clearStage(state);
    state.player.equipment.weapon = weapon(50, "crude_sword");
    const upgrade = weapon(60, "test_hammer");
    dropOnPlayer(state, upgrade);

    setAutoEquipEnabled(false);
    step(state, idle, DT);

    // Weapon untouched; the find sits in the bag for a manual equip.
    expect(state.player.equipment.weapon.id).toBe(50);
    expect(state.player.inventory.some((i) => i?.id === 60)).toBe(true);
    // The ground is clear — it was collected, just not worn.
    expect(state.items).toHaveLength(0);
  });

  it("leaves the ranking predicate and the manual sweep unaffected when off", () => {
    const state = startGame();
    state.player.equipment.weapon = weapon(50, "crude_sword");
    const upgrade = weapon(60, "test_hammer");
    // The find still RANKS as better — the setting gates only the pickup path.
    setAutoEquipEnabled(false);
    expect(isBetterEquipment(state, upgrade)).toBe(true);
    // And the manual AUTO-EQUIP button still wears it from the bag.
    state.player.inventory[0] = upgrade;
    expect(autoEquipBest(state)).toBe(1);
    expect(state.player.equipment.weapon.id).toBe(60);
  });
});
