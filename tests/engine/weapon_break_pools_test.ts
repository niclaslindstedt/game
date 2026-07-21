// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A weapon that carries stat affixes feeds the derived pools (a +STAMINA blade
// deepens the sprint reserve and the health bar). When it BREAKS out of the
// hand it sheds those affixes, so the pools must be re-derived on the swap —
// exactly like equipping/unequipping through the bag. Before this was fixed,
// `wearEquippedWeapon` was the only hand-swap that skipped the recompute, so a
// broken +STAMINA weapon left maxStamina/maxHp sized to a weapon no longer
// held, and a later drink/heal topped off to that stale max.

import { describe, expect, it } from "vitest";

import {
  STAMINA,
  equipFromInventory,
  wearEquippedWeapon,
  type Equipment,
} from "@game/core";

import { clearStage, startGame } from "./helpers.ts";

/** A breakable fixture blade carrying `+stamina` on its affixes. */
function staminaSword(staminaBonus: number, id = 555): Equipment {
  return {
    id,
    defId: "crude_sword",
    slot: "weapon",
    tier: "rare",
    ilvl: 1,
    affixes: [{ kind: "stat", value: staminaBonus, stat: "stamina" }],
    durability: 120,
  };
}

describe("weapon break re-derives the stat pools", () => {
  it("drops maxStamina/maxHp back down when a +STAMINA weapon breaks", () => {
    const state = startGame();
    clearStage(state);

    const bareMaxStamina = state.player.maxStamina;
    const bareMaxHp = state.player.maxHp;

    // Equip a +10 STAMINA blade through the real bag path — the pools grow.
    const bonus = 10;
    state.player.inventory[0] = staminaSword(bonus);
    expect(equipFromInventory(state, 0)).toBe(true);
    expect(state.player.maxStamina).toBe(
      bareMaxStamina + bonus * STAMINA.maxPerPoint,
    );
    expect(state.player.maxHp).toBe(bareMaxHp + bonus * STAMINA.hpPerPoint);

    // Fill the pools so the clamp is visible. Clear the bag so the shattered
    // blade falls back to the unbreakable sidearm (no stat affixes), leaving
    // the pool drop attributable solely to the lost +STAMINA.
    state.player.stamina = state.player.maxStamina;
    state.player.hp = state.player.maxHp;
    state.player.inventory.fill(null);
    state.player.equipment.weapon.durability = 1;
    wearEquippedWeapon(state);

    // The blade is gone (swapped for the sidearm), so its bonus is too — the
    // pools are re-derived to the bare stats, not left at the broken weapon's.
    expect(state.events.some((e) => e.type === "weaponBroke")).toBe(true);
    expect(state.player.equipment.weapon.id).not.toBe(555);
    expect(
      state.player.equipment.weapon.affixes.some((a) => a.kind === "stat"),
    ).toBe(false);
    expect(state.player.maxStamina).toBe(bareMaxStamina);
    expect(state.player.maxHp).toBe(bareMaxHp);
    // Current pools clamp to the re-derived max (never left above the bar).
    expect(state.player.stamina).toBe(bareMaxStamina);
    expect(state.player.hp).toBe(bareMaxHp);
  });
});
