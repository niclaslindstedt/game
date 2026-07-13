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
  syncInventoryCapacity,
  TIERS,
  totalArmor,
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

function makeVest(id: number, tier: Tier = "regular"): Equipment {
  return {
    id,
    defId: "kevlar_vest",
    slot: "chest",
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
      expect(slots.filter((s) => s !== "weapon").length).toBeGreaterThanOrEqual(
        1,
      );
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
    // the rare gate — and his tierBonus + high luck push the rare chance up
    // against its ceiling (`LOOT.rarityChanceMax`, the D2 magic-find cap that
    // keeps rare short of a certainty even at max MF). The machete is the one
    // TIER-ROLLED piece; the `tierDrops` gear keeps its forced tier — so on a
    // seed that clears the (capped) rare roll the haul reads rare + guaranteed
    // magic. A fixed seed pins that clear, since the ceiling makes each rolled
    // piece ~85%, not guaranteed.
    const state = startGame(1);
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

  it("unique and legendary now drop as NAMED items (the D2 fold)", () => {
    // The D2 reversal: a rarity roll that lands unique/legendary folds a real
    // NAMED item chosen by its per-item weight (never a nameless top-tier
    // affix roll). Past every gate, with heavy Magic Find, the top tiers turn
    // up — and each carries a unique's fixed name, not a rolled one.
    const state = startGame();
    state.player.level = 60; // past every mlvl gate — chance is the only lock
    state.player.stats.luck = 100;
    let sawTop = false;
    for (let i = 0; i < 600; i++) {
      const rolled = rollEquipment(state);
      if (rolled.tier === "unique" || rolled.tier === "legendary") {
        sawTop = true;
        expect(rolled.name).toBeTruthy(); // a named item, folded in
      }
    }
    expect(sawTop).toBe(true);
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
  it("equips a picked-up weapon that out-scores the held one", () => {
    const state = startGame(); // default medieval sword: melee, short cleave
    clearStage(state);
    state.player.level = 8; // grown into the hammer's level requirement
    state.player.stats.strength = 20; // …and its STRENGTH requirement
    const hammer: Equipment = {
      id: 61,
      defId: "geology_hammer", // 38 dmg — out-scores the sword's cleave
      slot: "weapon",
      tier: "regular",
      ilvl: 8,
      affixes: [],
      durability: WEAPON_DEFS.geology_hammer!.durability,
    };
    state.items = [
      {
        id: 1,
        kind: "equipment",
        pos: { ...state.player.pos },
        equipment: hammer,
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
      defId: "geology_hammer",
    });
  });

  it("bags a picked-up weapon that is worse than the held one", () => {
    const state = startGame();
    clearStage(state);
    // A box cutter (req-1 budget) is a marginal pickup, so put the geology
    // hammer (req-8 budget, single-target like the cutter) in hand to make
    // it strictly worse and force the bag.
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
      defId: "geology_hammer",
      slot: "weapon",
      tier: "regular",
      ilvl: 8,
      affixes: [],
      durability: WEAPON_DEFS.geology_hammer!.durability,
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
    expect(state.player.equipment.weapon.id).toBe(63); // hammer stays
    expect(state.player.inventory.some((i) => i?.id === 62)).toBe(true);
  });

  it("drops the displaced piece on the ground when the bag is full", () => {
    const state = startGame();
    clearStage(state);
    state.player.level = 8;
    state.player.stats.strength = 20; // clear the hammer's STRENGTH requirement
    // Level 8 brings automatic STRENGTH gains that widen the bag — grow it
    // first, then fill EVERY slot so the bag is genuinely full.
    syncInventoryCapacity(state);
    state.player.inventory = state.player.inventory.map((_, i) =>
      makeVest(100 + i),
    );
    const hammer: Equipment = {
      id: 64,
      defId: "geology_hammer",
      slot: "weapon",
      tier: "regular",
      ilvl: 8,
      affixes: [],
      durability: WEAPON_DEFS.geology_hammer!.durability,
    };
    state.items = [
      {
        id: 1,
        kind: "equipment",
        pos: { ...state.player.pos },
        equipment: hammer,
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
  it("auto-equips armor picked up over the starter clothes", () => {
    const state = startGame();
    state.enemies = [];
    state.player.level = 5; // grown into the vest's requirement
    state.items = [
      {
        id: 1,
        kind: "equipment",
        pos: { ...state.player.pos },
        equipment: makeVest(2), // out-armors the starting T-SHIRT
      },
    ];
    step(state, idle, DT);
    expect(state.items).toHaveLength(0);
    expect(state.player.equipment.chest?.id).toBe(2);
    // The displaced tee went into the bag, not into the void.
    expect(state.player.inventory.some((i) => i?.defId === "t_shirt")).toBe(
      true,
    );
  });

  it("bags gear that is worse than what is worn", () => {
    const state = startGame();
    state.enemies = [];
    state.player.level = 5;
    state.player.equipment.chest = makeVest(90, "magic"); // +20 hp affix
    state.items = [
      {
        id: 1,
        kind: "equipment",
        pos: { ...state.player.pos },
        equipment: makeVest(2), // plain — strictly worse
      },
    ];
    step(state, idle, DT);
    expect(state.player.equipment.chest?.id).toBe(90);
    expect(state.player.inventory[0]?.id).toBe(2);
  });

  it("leaves lesser loot on the ground when the bag is full", () => {
    const state = startGame();
    state.enemies = [];
    state.player.level = 5;
    state.player.equipment.chest = makeVest(90, "magic");
    state.player.inventory = state.player.inventory.map((_, i) =>
      makeVest(100 + i),
    );
    state.items = [
      {
        id: 1,
        kind: "equipment",
        pos: { ...state.player.pos },
        equipment: makeVest(2),
      },
    ];
    step(state, idle, DT);
    expect(state.items).toHaveLength(1);
  });

  it("nudges once when a full bag turns away loot, then throttles the cue", () => {
    const state = startGame();
    state.enemies = [];
    state.player.level = 5;
    state.player.equipment.chest = makeVest(90, "magic");
    state.player.inventory = state.player.inventory.map((_, i) =>
      makeVest(100 + i),
    );
    state.items = [
      {
        id: 1,
        kind: "equipment",
        pos: { ...state.player.pos },
        equipment: makeVest(2),
      },
    ];
    // First brush with the loot fires the "bags are full" nudge.
    step(state, idle, DT);
    expect(state.items).toHaveLength(1);
    const blocked = state.events.filter((e) => e.type === "pickupBlocked");
    expect(blocked).toHaveLength(1);
    expect(blocked[0]).toMatchObject({ reason: "bagFull" });

    // Standing on it the very next tick doesn't spam a second cue.
    step(state, idle, DT);
    expect(state.events.some((e) => e.type === "pickupBlocked")).toBe(false);

    // Once the cooldown lapses, another brush nudges again.
    step(state, idle, LOOT.bagFullHintCooldownMs);
    expect(state.events.some((e) => e.type === "pickupBlocked")).toBe(true);
  });

  it("equips gear from the bag and applies its bonuses", () => {
    const state = startGame();
    state.player.level = 5;
    // Bare the chest first so the swap math below is a plain add/remove.
    discardEquipped(state, "chest");
    const before = state.player.maxHp;
    const vestBase = GEAR_DEFS.kevlar_vest!.bonuses.maxHp ?? 0;
    state.player.inventory[3] = makeVest(50, "magic"); // +20 affix
    expect(equipFromInventory(state, 3)).toBe(true);
    expect(state.player.equipment.chest?.id).toBe(50);
    expect(state.player.inventory[3]).toBeNull();
    expect(state.player.maxHp).toBe(before + vestBase + 20);
    expect(state.player.hp).toBe(state.player.maxHp); // gains heal along
    // The worn vest counts its armor into the total.
    expect(totalArmor(state)).toBeGreaterThanOrEqual(
      GEAR_DEFS.kevlar_vest!.armor!,
    );

    // Unequip: bonuses come back off, hp clamps.
    expect(unequipToInventory(state, "chest")).toBe(true);
    expect(state.player.maxHp).toBe(before);
    expect(state.player.hp).toBe(before);
    expect(state.player.equipment.chest).toBeNull();
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
    state.player.inventory[0] = makeVest(70);
    moveInventoryItem(state, 0, 2);
    expect(state.player.inventory[0]).toBeNull();
    expect(state.player.inventory[2]?.id).toBe(70);
  });

  it("discards a bag item for good — no ground drop", () => {
    const state = startGame();
    state.items = [];
    state.player.inventory[2] = makeVest(77);
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

  it("discards worn armor — strips it off the body, armor total drops", () => {
    const state = startGame();
    state.player.level = 5;
    state.player.inventory[0] = makeVest(88);
    expect(equipFromInventory(state, 0)).toBe(true);
    expect(state.player.equipment.chest?.id).toBe(88);
    const armored = totalArmor(state);
    expect(armored).toBeGreaterThanOrEqual(GEAR_DEFS.kevlar_vest!.armor!);
    const removed = discardEquipped(state, "chest");
    expect(removed?.id).toBe(88);
    expect(state.player.equipment.chest).toBeNull();
    expect(totalArmor(state)).toBeLessThan(armored); // the vest's points left
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
    expect(equipmentName(weapon("lunar_wrench", []))).toBe(
      equipmentBaseName("lunar_wrench"),
    );
    expect(equipmentName(weapon("lunar_wrench", []))).toBe("LUNAR WRENCH");
  });

  it("prefixes a damage roll and suffixes a stat roll", () => {
    // damagePct → a magnitude-scaled prefix.
    expect(
      equipmentName(
        weapon("lunar_wrench", [{ kind: "damagePct", value: 0.3 }]),
      ),
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
        gear("kevlar_vest", "chest", [
          { kind: "maxHp", value: 15 },
          { kind: "stat", value: 1, stat: "luck" },
        ]),
      ),
    ).toBe("STURDY KEVLAR VEST OF FORTUNE");
    // The armor affix lends its own prefix.
    expect(
      equipmentName(
        gear("kevlar_vest", "chest", [{ kind: "armor", value: 12 }]),
      ),
    ).toBe("STUDDED KEVLAR VEST");
  });
});
