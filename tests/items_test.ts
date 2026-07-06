// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Loot and the inventory: tier rolls, boss drops, bag management, and how
// equipment feeds back into the player's derived stats.

import { describe, expect, it } from "vitest";

import {
  ENEMY_DEFS,
  enemyDef,
  equipFromInventory,
  equipmentName,
  GEAR_DEFS,
  LEVELS,
  LOOT,
  moveInventoryItem,
  rollEquipment,
  step,
  TIERS,
  unequipToInventory,
  UPGRADE,
  weaponDamage,
} from "@game/core";
import type { Equipment, GameState, Tier } from "@game/core";
import {
  clearStage,
  DT,
  idle,
  makeEnemy,
  run,
  startGame,
  stopWaves,
} from "./helpers.ts";

function makeSuit(id: number, tier: Tier = "regular"): Equipment {
  return {
    id,
    defId: "suit_plating",
    slot: "suit",
    tier,
    affixes: tier === "magic" ? [{ kind: "maxHp", value: 20 }] : [],
  };
}

function killTheBoss(state: GameState): void {
  stopWaves(state);
  const boss = state.enemies.find((e) => enemyDef(e.defId).role === "boss")!;
  state.enemies = [boss];
  boss.hp = 1;
  boss.pos = { x: state.player.pos.x + 60, y: state.player.pos.y };
  boss.speed = 0;
  run(state, idle, 500, (s) => s.enemies.length === 0);
}

describe("boss loot", () => {
  it("ALWAYS drops a weapon, gear, upgrades, and medkits", () => {
    // No luck involved: the drop is unconditional across seeds.
    for (const seed of [1, 2, 3, 99]) {
      const state = startGame(seed);
      state.items = [];
      killTheBoss(state);
      const equipment = state.items.filter((i) => i.kind === "equipment");
      const medkits = state.items.filter((i) => i.kind === "medkit");
      const slots = equipment.map((i) =>
        i.kind === "equipment" ? i.equipment.slot : "",
      );
      expect(slots).toContain("weapon");
      expect(slots.filter((s) => s === "suit" || s === "charm")).toHaveLength(
        1,
      );
      expect(medkits.length).toBeGreaterThan(0);
      // His weapon drop is the survival-kit machete, always.
      expect(
        equipment.some(
          (i) => i.kind === "equipment" && i.equipment.defId === "machete",
        ),
      ).toBe(true);
      // Scattered upgrades may land on the player and apply instantly.
      const upgrades = state.items.filter((i) => i.kind === "upgrade").length;
      const applied = state.player.equipment.weapon.upgrades ?? 0;
      expect(upgrades + applied).toBe(ENEMY_DEFS.armstrong!.loot!.upgrades);
    }
  });

  it("magic-tier drops carry an affix and the MAGIC name prefix", () => {
    // Max luck forces the tier roll deterministically.
    const state = startGame();
    state.player.stats.luck = 30;
    state.items = [];
    killTheBoss(state);
    for (const item of state.items) {
      if (item.kind !== "equipment") continue;
      expect(item.equipment.tier).toBe("magic"); // the moon caps at magic
      expect(item.equipment.affixes).toHaveLength(TIERS.magic.affixCount);
      expect(equipmentName(item.equipment).startsWith("MAGIC ")).toBe(true);
    }
  });

  it("epic and legendary never drop on the moon even at max luck", () => {
    const state = startGame();
    state.player.stats.luck = 100;
    for (let i = 0; i < 50; i++) {
      const rolled = rollEquipment(state);
      expect(["regular", "magic"]).toContain(rolled.tier);
    }
  });
});

describe("ghost drops", () => {
  it("max LUCK guarantees a drop from a regular ghost", () => {
    const state = startGame();
    state.player.stats.luck = 100; // dropChance ≥ 1
    state.items = [];
    clearStage(state);
    state.enemies.push(
      makeEnemy({ pos: { x: state.player.pos.x + 60, y: state.player.pos.y } }),
    );
    run(state, idle, 2000, (s) => s.enemies.length === 1);
    expect(state.items.length).toBeGreaterThan(0);
  });

  it("killing every regular monster yields the equipment minimum", () => {
    // Three 1-hp minions can miss their rolls at most once: the pity rule
    // must still land at least LOOT.minEquipmentPerLevel equipment drops.
    for (const seed of [1, 2, 3, 4, 5]) {
      const state = startGame(seed);
      clearStage(state); // only the parked boss remains
      state.items = [];
      for (let i = 0; i < 3; i++) {
        state.enemies.push(
          makeEnemy({
            id: 9000 + i,
            pos: { x: state.player.pos.x + 40 + i * 12, y: state.player.pos.y },
            hp: 1,
            maxHp: 1,
          }),
        );
      }
      run(state, idle, 5000, (s) => s.enemies.length === 1);
      const equipment = state.items.filter((i) => i.kind === "equipment");
      expect(equipment.length).toBeGreaterThanOrEqual(
        LOOT.minEquipmentPerLevel,
      );
    }
  });
});

describe("the guaranteed early weapon", () => {
  it("rolls its drop kill inside the configured window", () => {
    const early = LEVELS.moon!.loot.earlyWeapon!;
    for (const seed of [1, 2, 3, 4, 5, 99]) {
      const state = startGame(seed);
      expect(state.earlyWeaponAtKills).toBeGreaterThanOrEqual(early.minKills);
      expect(state.earlyWeaponAtKills).toBeLessThanOrEqual(early.maxKills);
    }
  });

  it("surrenders MOON'S BLADE on the rolled kill, exactly once", () => {
    const state = startGame();
    clearStage(state);
    state.items = [];
    // One kill away from the rolled count: the next death pays out.
    state.stats.kills = state.earlyWeaponAtKills! - 1;
    state.enemies.push(
      makeEnemy({ pos: { x: state.player.pos.x + 60, y: state.player.pos.y } }),
    );
    run(state, idle, 2000, (s) => s.enemies.length === 1);
    const blades = state.items.filter(
      (i) => i.kind === "equipment" && i.equipment.defId === "moons_blade",
    );
    expect(blades).toHaveLength(1);
    expect(state.earlyWeaponAtKills).toBeNull(); // never a second one
  });
});

describe("weapon upgrades", () => {
  it("an upgrade pickup permanently sharpens the held weapon", () => {
    const state = startGame();
    clearStage(state);
    const base = weaponDamage(state);
    state.items = [{ id: 1, kind: "upgrade", pos: { ...state.player.pos } }];
    step(state, idle, DT);
    expect(state.items).toHaveLength(0);
    expect(state.player.equipment.weapon.upgrades).toBe(1);
    expect(weaponDamage(state)).toBeCloseTo(base * (1 + UPGRADE.damageBonus));
    expect(state.events).toContainEqual({
      type: "itemCollected",
      kind: "upgrade",
    });
  });

  it("upgrades stick to the weapon they were applied to", () => {
    const state = startGame();
    state.player.equipment.weapon.upgrades = 3;
    state.player.inventory[0] = {
      id: 60,
      defId: "wand",
      slot: "weapon",
      tier: "regular",
      affixes: [],
    };
    equipFromInventory(state, 0); // swap to the plain wand
    expect(state.player.equipment.weapon.upgrades ?? 0).toBe(0);
    expect(state.player.inventory[0]?.upgrades).toBe(3); // rides the blaster
  });
});

describe("inventory", () => {
  it("picks dropped equipment up into the bag", () => {
    const state = startGame();
    state.enemies = [];
    state.items = [
      {
        id: 1,
        kind: "equipment",
        pos: { ...state.player.pos },
        equipment: makeSuit(2),
      },
    ];
    step(state, idle, DT);
    expect(state.items).toHaveLength(0);
    expect(state.player.inventory[0]?.defId).toBe("suit_plating");
  });

  it("leaves loot on the ground when the bag is full", () => {
    const state = startGame();
    state.enemies = [];
    state.player.inventory = state.player.inventory.map((_, i) =>
      makeSuit(100 + i),
    );
    state.items = [
      {
        id: 1,
        kind: "equipment",
        pos: { ...state.player.pos },
        equipment: makeSuit(2),
      },
    ];
    step(state, idle, DT);
    expect(state.items).toHaveLength(1);
  });

  it("equips gear from the bag and applies its bonuses", () => {
    const state = startGame();
    const before = state.player.maxHp;
    const suitBase = GEAR_DEFS.suit_plating!.bonuses.maxHp!;
    state.player.inventory[3] = makeSuit(50, "magic"); // +20 base, +20 affix
    expect(equipFromInventory(state, 3)).toBe(true);
    expect(state.player.equipment.suit?.id).toBe(50);
    expect(state.player.inventory[3]).toBeNull();
    expect(state.player.maxHp).toBe(before + suitBase + 20);
    expect(state.player.hp).toBe(state.player.maxHp); // gains heal along

    // Unequip: bonuses come back off, hp clamps.
    expect(unequipToInventory(state, "suit")).toBe(true);
    expect(state.player.maxHp).toBe(before);
    expect(state.player.hp).toBe(before);
    expect(state.player.equipment.suit).toBeNull();
  });

  it("swaps weapons — the weapon slot is never empty", () => {
    const state = startGame();
    const wand: Equipment = {
      id: 60,
      defId: "wand",
      slot: "weapon",
      tier: "regular",
      affixes: [],
    };
    state.player.inventory[0] = wand;
    expect(equipFromInventory(state, 0)).toBe(true);
    expect(state.player.equipment.weapon.defId).toBe("wand");
    expect(state.player.inventory[0]?.defId).toBe("blaster"); // swapped back

    // The equipped weapon can never be parked in the bag.
    expect(unequipToInventory(state, "weapon")).toBe(false);
    expect(state.player.equipment.weapon.defId).toBe("wand");
  });

  it("rearranges bag cells by swapping", () => {
    const state = startGame();
    state.player.inventory[0] = makeSuit(70);
    moveInventoryItem(state, 0, 5);
    expect(state.player.inventory[0]).toBeNull();
    expect(state.player.inventory[5]?.id).toBe(70);
  });
});
