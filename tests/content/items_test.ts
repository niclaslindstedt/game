// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Loot and the inventory: tier rolls, boss drops, bag management, and how
// equipment feeds back into the player's derived stats.

import { describe, expect, it } from "vitest";

import {
  discardEquipped,
  discardFromInventory,
  ENEMY_DEFS,
  enemyDef,
  equipFromInventory,
  equipmentBaseName,
  equipmentName,
  GEAR_DEFS,
  LEVELS,
  LOOT,
  moveInventoryItem,
  rollEquipment,
  step,
  TIERS,
  unequipToInventory,
  WEAPON_DEFS,
} from "@game/core";
import type { Equipment, GameState, Tier } from "@game/core";
import {
  clearStage,
  DT,
  equipBlaster,
  idle,
  makeEnemy,
  run,
  startGame,
  stopWaves,
} from "../helpers.ts";

function makeSuit(id: number, tier: Tier = "regular"): Equipment {
  return {
    id,
    defId: "suit_plating",
    slot: "suit",
    tier,
    ilvl: 5,
    affixes: tier === "magic" ? [{ kind: "maxHp", value: 20 }] : [],
  };
}

function killTheBoss(state: GameState): void {
  equipBlaster(state); // pick the boss off at range, past the loot scatter
  stopWaves(state);
  const boss = state.enemies.find((e) => enemyDef(e.defId).role === "boss")!;
  state.enemies = [boss];
  boss.hp = 1;
  // Parked at the blaster's reach: the kill lands, but the scattered loot
  // (±45 px) can never fall inside the player's pickup radius.
  boss.pos = { x: state.player.pos.x + 200, y: state.player.pos.y };
  boss.speed = 0;
  run(state, idle, 500, (s) => s.enemies.length === 0);
}

describe("boss loot", () => {
  it("ALWAYS drops a weapon, gear, XP arrows, repairs, and medkits", () => {
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
      // The def's pinned gear count plus whatever his tierDrops paid out.
      expect(
        slots.filter((s) => s === "suit" || s === "charm").length,
      ).toBeGreaterThanOrEqual(1);
      expect(medkits.length).toBeGreaterThan(0);
      // His weapon drop is the survival-kit machete, always.
      expect(
        equipment.some(
          (i) => i.kind === "equipment" && i.equipment.defId === "machete",
        ),
      ).toBe(true);
      const arrows = state.items.filter((i) => i.kind === "xp").length;
      expect(arrows).toBe(ENEMY_DEFS.armstrong!.loot!.xpArrows);
      const repairs = state.items.filter((i) => i.kind === "repair").length;
      expect(repairs).toBe(ENEMY_DEFS.armstrong!.loot!.repairs);
    }
  });

  it("high-luck drops roll up to RARE, with affixes and a decorated name", () => {
    // At player level 7 the boss's levelBonus lifts him to monster level 10 —
    // the rare gate — and his tierBonus + max luck then clear the rare chance
    // every time, so every TIER-ROLLED piece (the machete, the pinned gear)
    // lands rare. His `tierDrops` pieces keep their forced tier — that's the
    // point of the pledge — so the haul reads rare + guaranteed magic.
    const state = startGame();
    state.player.level = 7;
    state.player.stats.luck = 30;
    state.items = [];
    killTheBoss(state);
    const equipment = state.items.filter((i) => i.kind === "equipment");
    expect(equipment.length).toBeGreaterThan(0);
    const machete = equipment.find(
      (i) => i.kind === "equipment" && i.equipment.defId === "machete",
    );
    expect(machete?.kind === "equipment" && machete.equipment.tier).toBe(
      "rare",
    );
    for (const item of equipment) {
      if (item.kind !== "equipment") continue;
      // Nothing plain off a boss at these odds — rare, or a pledged magic.
      expect(["rare", "magic"]).toContain(item.equipment.tier);
      expect(item.equipment.affixes.length).toBe(
        TIERS[item.equipment.tier].affixCount,
      );
      // The name is decorated from its affixes (a prefix and/or "of the X"
      // suffix), never the bare tier prefix and always longer than the base.
      const name = equipmentName(item.equipment);
      expect(name.startsWith("RARE ")).toBe(false);
      expect(name.length).toBeGreaterThan(0);
    }
  });

  it("unique and legendary never drop even at max luck", () => {
    // Their base chances sit at zero until their one-of-a-kind defs ship;
    // only the harder difficulties' tierChanceBonus will open them.
    const state = startGame();
    state.player.level = 30; // past every mlvl gate — chance is the only lock
    state.player.stats.luck = 100;
    for (let i = 0; i < 50; i++) {
      const rolled = rollEquipment(state);
      expect(["regular", "magic", "rare"]).toContain(rolled.tier);
    }
  });
});

describe("ghost drops", () => {
  it("max LUCK guarantees a drop from a regular ghost", () => {
    const state = equipBlaster(startGame()); // drop-rate test: kill at range
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
      const state = equipBlaster(startGame(seed)); // clear the fodder at range
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

describe("the scripted opening drops", () => {
  // Drive the next kill to fire the schedule entry at `atKills`: park kills
  // one short, then let the blaster finish a stray minion. Returns once the
  // minion is down (the boss clearStage keeps stays parked and alive).
  function killAt(state: GameState, atKills: number): void {
    equipBlaster(state); // finish the stray minion from range
    state.items = [];
    state.stats.kills = atKills - 1;
    state.enemies.push(
      makeEnemy({ pos: { x: state.player.pos.x + 60, y: state.player.pos.y } }),
    );
    run(state, idle, 2000, (s) => s.enemies.length === 1);
  }

  it("rolls MOON'S BLADE inside its configured window", () => {
    const range = LEVELS.moon!.loot.earlyDrops!.find(
      (d) => "weapon" in d && d.weapon === "moons_blade",
    )!.atKills as [number, number];
    for (const seed of [1, 2, 3, 4, 5, 99]) {
      const state = startGame(seed);
      expect(state.earlyDropKills[0]).toBeGreaterThanOrEqual(range[0]);
      expect(state.earlyDropKills[0]).toBeLessThanOrEqual(range[1]);
    }
  });

  it("hands MOON'S BLADE over on its rolled kill, exactly once", () => {
    const state = startGame();
    clearStage(state);
    killAt(state, state.earlyDropKills[0]!);
    // A unique — never in the random weapon pool, so any blade here is the
    // scheduled one, and there is exactly one.
    const blades = state.items.filter(
      (i) => i.kind === "equipment" && i.equipment.defId === "moons_blade",
    );
    expect(blades).toHaveLength(1);
    expect(state.earlyDropCursor).toBe(1); // never a second one
  });
});

describe("auto-equip on pickup", () => {
  it("equips a picked-up weapon that out-damages the held one", () => {
    const state = startGame(); // default medieval sword: melee, short cleave
    clearStage(state);
    const baton: Equipment = {
      id: 61,
      defId: "security_baton", // 16 dmg / 400 ms — clearly better DPS
      slot: "weapon",
      tier: "regular",
      ilvl: 5,
      affixes: [],
      durability: WEAPON_DEFS.security_baton!.durability,
    };
    state.items = [
      {
        id: 1,
        kind: "equipment",
        pos: { ...state.player.pos },
        equipment: baton,
      },
    ];
    step(state, idle, DT);
    expect(state.player.equipment.weapon.id).toBe(61);
    // The old starting weapon went into the bag, not into the void.
    expect(
      state.player.inventory.some((i) => i?.defId === "medieval_sword"),
    ).toBe(true);
    expect(state.events).toContainEqual({
      type: "autoEquipped",
      defId: "security_baton",
    });
  });

  it("bags a picked-up weapon that is worse than the held one", () => {
    const state = startGame();
    clearStage(state);
    // A box cutter (8 dmg / 300 ms) is a marginal pickup, so put the baton
    // (16 dmg / 400 ms) in hand to make it strictly worse and force the bag.
    const cutter: Equipment = {
      id: 62,
      defId: "box_cutter",
      slot: "weapon",
      tier: "regular",
      ilvl: 5,
      affixes: [],
      durability: WEAPON_DEFS.box_cutter!.durability,
    };
    state.player.equipment.weapon = {
      id: 63,
      defId: "security_baton",
      slot: "weapon",
      tier: "regular",
      ilvl: 5,
      affixes: [],
      durability: WEAPON_DEFS.security_baton!.durability,
    };
    state.items = [
      {
        id: 1,
        kind: "equipment",
        pos: { ...state.player.pos },
        equipment: cutter,
      },
    ];
    step(state, idle, DT);
    expect(state.player.equipment.weapon.id).toBe(63); // baton stays
    expect(state.player.inventory.some((i) => i?.id === 62)).toBe(true);
  });

  it("drops the displaced piece on the ground when the bag is full", () => {
    const state = startGame();
    clearStage(state);
    state.player.inventory = state.player.inventory.map((_, i) =>
      makeSuit(100 + i),
    );
    const baton: Equipment = {
      id: 64,
      defId: "security_baton",
      slot: "weapon",
      tier: "regular",
      ilvl: 5,
      affixes: [],
      durability: WEAPON_DEFS.security_baton!.durability,
    };
    state.items = [
      {
        id: 1,
        kind: "equipment",
        pos: { ...state.player.pos },
        equipment: baton,
      },
    ];
    step(state, idle, DT);
    expect(state.player.equipment.weapon.id).toBe(64);
    // The medieval sword had nowhere to go: it lies at the player's feet.
    expect(
      state.items.some(
        (i) => i.kind === "equipment" && i.equipment.defId === "medieval_sword",
      ),
    ).toBe(true);
  });
});

describe("inventory", () => {
  it("auto-equips gear picked up onto an empty slot", () => {
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
    expect(state.player.equipment.suit?.id).toBe(2);
  });

  it("bags gear that is worse than what is worn", () => {
    const state = startGame();
    state.enemies = [];
    state.player.equipment.suit = makeSuit(90, "magic"); // +20 hp affix
    state.items = [
      {
        id: 1,
        kind: "equipment",
        pos: { ...state.player.pos },
        equipment: makeSuit(2), // plain — strictly worse
      },
    ];
    step(state, idle, DT);
    expect(state.player.equipment.suit?.id).toBe(90);
    expect(state.player.inventory[0]?.id).toBe(2);
  });

  it("leaves lesser loot on the ground when the bag is full", () => {
    const state = startGame();
    state.enemies = [];
    state.player.equipment.suit = makeSuit(90, "magic");
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
    const cutter: Equipment = {
      id: 60,
      defId: "box_cutter",
      slot: "weapon",
      tier: "regular",
      ilvl: 5,
      affixes: [],
    };
    state.player.inventory[0] = cutter;
    expect(equipFromInventory(state, 0)).toBe(true);
    expect(state.player.equipment.weapon.defId).toBe("box_cutter");
    expect(state.player.inventory[0]?.defId).toBe("medieval_sword"); // swapped back

    // The equipped weapon can never be parked in the bag.
    expect(unequipToInventory(state, "weapon")).toBe(false);
    expect(state.player.equipment.weapon.defId).toBe("box_cutter");
  });

  it("rearranges bag cells by swapping", () => {
    const state = startGame();
    state.player.inventory[0] = makeSuit(70);
    moveInventoryItem(state, 0, 2);
    expect(state.player.inventory[0]).toBeNull();
    expect(state.player.inventory[2]?.id).toBe(70);
  });

  it("discards a bag item for good — no ground drop", () => {
    const state = startGame();
    state.items = [];
    state.player.inventory[2] = makeSuit(77);
    const removed = discardFromInventory(state, 2);
    expect(removed?.id).toBe(77);
    expect(state.player.inventory[2]).toBeNull();
    // Destroyed, not dropped: nothing lands on the ground to pick back up.
    expect(state.items.some((i) => i.kind === "equipment")).toBe(false);
  });

  it("discarding an empty cell is a no-op", () => {
    const state = startGame();
    state.player.inventory[1] = null;
    expect(discardFromInventory(state, 1)).toBeNull();
  });

  it("discards an equipped suit — strips it off the body and clears armor", () => {
    const state = startGame();
    state.player.inventory[0] = makeSuit(88);
    expect(equipFromInventory(state, 0)).toBe(true);
    expect(state.player.equipment.suit?.id).toBe(88);
    expect(state.player.armor).toBeGreaterThan(0);
    const removed = discardEquipped(state, "suit");
    expect(removed?.id).toBe(88);
    expect(state.player.equipment.suit).toBeNull();
    expect(state.player.armor).toBe(0); // plating stripped with the suit
  });

  it("never discards the equipped weapon — the holster is never empty", () => {
    const state = startGame();
    const held = state.player.equipment.weapon;
    expect(discardEquipped(state, "weapon")).toBeNull();
    expect(state.player.equipment.weapon).toBe(held);
  });
});

describe("Diablo-style item names", () => {
  function weapon(defId: string, affixes: Equipment["affixes"]): Equipment {
    return { id: 1, defId, slot: "weapon", tier: "regular", ilvl: 5, affixes };
  }
  function gear(
    defId: string,
    slot: Equipment["slot"],
    affixes: Equipment["affixes"],
  ): Equipment {
    return { id: 2, defId, slot, tier: "regular", ilvl: 5, affixes };
  }

  it("names an affix-less item by its bare base type", () => {
    expect(equipmentName(weapon("lunar_wrench", []))).toBe(equipmentBaseName("lunar_wrench"));
    expect(equipmentName(weapon("lunar_wrench", []))).toBe("LUNAR WRENCH");
  });

  it("prefixes a damage roll and suffixes a stat roll", () => {
    // damagePct → a magnitude-scaled prefix.
    expect(
      equipmentName(weapon("lunar_wrench", [{ kind: "damagePct", value: 0.3 }])),
    ).toBe("VICIOUS LUNAR WRENCH");
    // A stat roll → an "of the X" suffix keyed to the stat.
    expect(
      equipmentName(
        weapon("lunar_wrench", [{ kind: "stat", value: 1, stat: "dexterity" }]),
      ),
    ).toBe("LUNAR WRENCH OF THE FOX");
    // crit → its own suffix.
    expect(
      equipmentName(weapon("lunar_wrench", [{ kind: "crit", value: 0.08 }])),
    ).toBe("LUNAR WRENCH OF DEADLINESS");
  });

  it("composes a prefix and a suffix on a multi-affix piece", () => {
    expect(
      equipmentName(
        weapon("lunar_wrench", [
          { kind: "damagePct", value: 0.6 },
          { kind: "stat", value: 1, stat: "strength" },
        ]),
      ),
    ).toBe("CRUEL LUNAR WRENCH OF THE OX");
    expect(
      equipmentName(
        gear("suit_plating", "suit", [
          { kind: "maxHp", value: 15 },
          { kind: "stat", value: 1, stat: "luck" },
        ]),
      ),
    ).toBe("STURDY SUIT PLATING OF FORTUNE");
  });
});
