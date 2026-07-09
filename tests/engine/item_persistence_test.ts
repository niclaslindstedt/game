// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Item version immunity: a drop a player keeps must stay exactly as it dropped
// even after we rebalance or DELETE its base from the catalog — only NEW drops
// feel a catalog edit. Each instance carries a frozen snapshot of its def
// (`Equipment.def`, minted in rollEquipment); `adoptEquipment` re-homes a
// loaded instance onto that snapshot so every stat read resolves it as dropped.

import { afterEach, describe, expect, it } from "vitest";

import {
  adoptEquipment,
  baseDefId,
  equipmentBaseName,
  equipmentLevelReq,
  isWeaponDef,
  registerDefs,
  rollEquipment,
  weaponDamageFor,
  weaponDef,
} from "@game/core";
import type { Equipment } from "@game/core";

import { FIX_GEAR, FIX_WEAPONS, installFixtures } from "./fixtures.ts";
import { startGame } from "./helpers.ts";

// Several tests swap in a doctored equipment catalog; restore the fixtures
// afterwards so sibling suites see the untouched defs.
afterEach(() => installFixtures(true));

const WRENCH = FIX_WEAPONS.test_wrench!;
const VEST = FIX_GEAR.test_vest!;

/** Re-register the equipment catalog with `test_wrench` rebalanced, or dropped
 * entirely when `damage` is null — the "we changed/removed loot" event. */
function reload(wrenchDamage: number | null): void {
  const weapons = { ...FIX_WEAPONS };
  if (wrenchDamage === null) delete weapons.test_wrench;
  else weapons.test_wrench = { ...WRENCH, damage: wrenchDamage };
  registerDefs({ weapons, gear: FIX_GEAR });
}

describe("item version immunity", () => {
  it("mints every drop with a frozen snapshot of its def", () => {
    const state = startGame();
    const weapon = rollEquipment(state, { defId: "test_wrench" });
    expect(weapon.def).toEqual(weaponDef("test_wrench"));
    const gear = rollEquipment(state, { defId: "test_vest" });
    expect(gear.def).toBeDefined();
    expect(gear.def).toEqual(VEST);
  });

  it("keeps a dropped item's stats when its base is nerfed; new drops feel it", () => {
    const state = startGame();
    const kept = rollEquipment(state, {
      defId: "test_wrench",
      tier: "regular",
    });
    const before = weaponDamageFor(state, kept);

    // We halve the wrench's catalog damage in a later build.
    reload(WRENCH.damage / 2);

    // The kept item, adopted on load, deals exactly what it dropped with.
    const adopted = adoptEquipment(kept);
    expect(adopted).not.toBeNull();
    expect(weaponDamageFor(state, adopted!)).toBeCloseTo(before, 5);

    // A fresh roll of the same base is nerfed — the change lands on new loot.
    const fresh = rollEquipment(state, {
      defId: "test_wrench",
      tier: "regular",
    });
    expect(weaponDamageFor(state, fresh)).toBeLessThan(before);
  });

  it("keeps a dropped item usable after its base is deleted from the catalog", () => {
    const state = startGame();
    const kept = rollEquipment(state, {
      defId: "test_wrench",
      tier: "regular",
    });
    const before = weaponDamageFor(state, kept);

    reload(null); // the base no longer exists in the live catalog

    const adopted = adoptEquipment(kept);
    expect(adopted).not.toBeNull();
    // Its stats, name, level gate, and weapon-ness all still resolve.
    expect(weaponDamageFor(state, adopted!)).toBeCloseTo(before, 5);
    expect(equipmentBaseName(adopted!.defId)).toBe(WRENCH.name);
    expect(equipmentLevelReq(adopted!.defId)).toBe(WRENCH.levelReq);
    expect(isWeaponDef(adopted!.defId)).toBe(true);
    // Its ORIGINAL base id is still legible through the re-homing.
    expect(baseDefId(adopted!)).toBe("test_wrench");
  });

  it("re-adoption is idempotent — the frozen id is stable across loads", () => {
    const state = startGame();
    const kept = rollEquipment(state, { defId: "test_pipe" });
    reload(null);
    const once = adoptEquipment(kept)!;
    const twice = adoptEquipment(once)!;
    expect(twice.defId).toBe(once.defId);
    expect(twice.def).toEqual(once.def);
  });

  it("freezes a legacy item (no snapshot) at the current def while its base exists", () => {
    const state = startGame();
    // A piece minted by a build from before snapshots existed: no `.def`.
    const legacy: Equipment = {
      id: state.nextId++,
      defId: "test_pipe",
      slot: "weapon",
      tier: "regular",
      ilvl: 5,
      affixes: [],
    };
    const adopted = adoptEquipment(legacy);
    expect(adopted).not.toBeNull();
    expect(adopted!.def).toEqual(weaponDef("test_pipe"));
  });

  it("drops a legacy item only when its base is ALSO gone (unresolvable)", () => {
    const state = startGame();
    const legacy: Equipment = {
      id: state.nextId++,
      defId: "test_wrench",
      slot: "weapon",
      tier: "regular",
      ilvl: 5,
      affixes: [],
    };
    reload(null); // no snapshot and no live def — nothing left to resolve
    expect(adoptEquipment(legacy)).toBeNull();
  });
});
