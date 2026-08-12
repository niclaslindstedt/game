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
  isBareHands,
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
  equipRangedSidearm,
  idle,
  makeEnemy,
  revealAll,
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
  equipRangedSidearm(state); // pick the boss off at range, past the loot scatter
  stopWaves(state);
  // …on ground the hero has walked: the auto-attack refuses anything still in
  // the fog, and the blaster outranges the reveal disc (`revealAll`).
  revealAll(state);
  const boss = state.enemies.find((e) => enemyDef(e.defId).role === "boss")!;
  state.enemies = [boss];
  boss.hp = 1;
  // Parked at the blaster's reach: the kill lands, but the scattered loot
  // (±45 px) can never fall inside the player's pickup radius.
  boss.pos = { x: state.players[0].pos.x + 200, y: state.players[0].pos.y };
  boss.speed = 0;
  run(state, idle, 500, (s) => s.enemies.length === 0);
}

describe("boss loot", () => {
  it("ALWAYS drops a weapon, gear, XP scrolls, repairs, and medkits", () => {
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
      expect(arrows).toBe(ENEMY_DEFS.the_flagbearer!.loot!.xpScrolls);
      const repairs = state.items.filter((i) => i.kind === "repair").length;
      expect(repairs).toBe(ENEMY_DEFS.the_flagbearer!.loot!.repairs);
    }
  });

  it("high-luck drops roll up to RARE, with affixes and a decorated name", () => {
    // At player level 7 the boss's levelBonus lifts him to monster level 10 —
    // the rare gate — and his tierBonus + high luck push the rare chance up
    // against its ceiling (`LOOT.rarityChanceMax`, the D2 magic-find cap that
    // keeps rare short of a certainty even at max MF). The machete is the one
    // TIER-ROLLED piece; the `tierDrops` gear keeps its forced tier — so on a
    // seed that clears the capped rare roll the haul reads rare + guaranteed
    // magic.
    //
    // The roll is NOT guaranteed, so the seed has to be chosen rather than
    // assumed — and it must be chosen HERE rather than hard-coded, because the
    // seed that happens to clear it is a function of where the boss kill lands
    // in the level's rng stream, which any change to what a level SPAWNS shifts
    // (the density ladder did exactly that). Scanning a fixed, ordered seed
    // list for the first clear keeps the assertion pinned to one deterministic
    // haul while surviving a stream shift; the scan's own length is the second
    // assertion — if a clear needed more than a handful of tries the ceiling
    // itself has regressed.
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
    let state!: GameState;
    let cleared = -1;
    for (const seed of seeds) {
      const candidate = startGame(seed);
      candidate.players[0].level = 7;
      candidate.players[0].stats.luck = 30;
      candidate.items = [];
      killTheBoss(candidate);
      const rolled = candidate.items.find(
        (i) => i.kind === "equipment" && i.equipment.defId === "machete",
      );
      state = candidate;
      if (rolled?.kind === "equipment" && rolled.equipment.tier === "rare") {
        cleared = seed;
        break;
      }
    }
    // A capped-but-high rare chance clears well inside a handful of seeds; a
    // scan that runs the list out means the odds have collapsed.
    expect(cleared).toBeGreaterThan(0);
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
      // Nothing plain off a boss at these odds — rare, a pledged magic, or
      // (the boss's levelBonus carrying him past the mlvl-15 unique gate) a
      // folded NAMED unique or a SET piece. Named items keep their own affix
      // rules and fixed names, so the decorated-name assertions below only
      // read the rolled tiers.
      expect(["rare", "magic", "unique", "set"]).toContain(item.equipment.tier);
      if (item.equipment.tier === "unique" || item.equipment.tier === "set")
        continue;
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
    state.players[0].level = 60;
    state.players[0].stats.luck = 100;
    let sawTop = false;
    for (let i = 0; i < 600; i++) {
      // A DEEP mob (nightmare/jesus depth) — past every mlvl gate, so chance is
      // the only lock. On the bottom lanes the horde level now HARD-CAPS (medium
      // 36), which strips loot below the legendary gate on purpose, so the fold
      // is tested against a killer that actually reaches the top tiers.
      const rolled = rollEquipment(state, state.players[0], {
        mlvl: 60,
        role: "boss",
      });
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
    const state = equipRangedSidearm(startGame()); // drop-rate test: kill at range
    state.players[0].stats.luck = 100; // dropChance ≥ 1
    state.items = [];
    clearStage(state);
    state.enemies.push(
      makeEnemy({
        pos: { x: state.players[0].pos.x + 60, y: state.players[0].pos.y },
      }),
    );
    run(state, idle, 2000, (s) => s.enemies.length === 1);
    expect(state.items.length).toBeGreaterThan(0);
  });

  it("killing every regular monster yields the equipment minimum", () => {
    // Three 1-hp minions can miss their rolls at most once: the pity rule
    // must still land at least LOOT.minEquipmentPerLevel equipment drops.
    for (const seed of [1, 2, 3, 4, 5]) {
      const state = equipRangedSidearm(startGame(seed)); // clear the fodder at range
      clearStage(state); // only the parked boss remains
      state.items = [];
      for (let i = 0; i < 3; i++) {
        state.enemies.push(
          makeEnemy({
            id: 9000 + i,
            pos: {
              x: state.players[0].pos.x + 40 + i * 12,
              y: state.players[0].pos.y,
            },
            hp: 1,
            maxHp: 1,
            // Low mlvl → trivial (level-based) kill xp, so clearing the three
            // never dings the fresh hero and freezes the run mid-sweep.
            mlvl: 1,
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
    equipRangedSidearm(state); // finish the stray minion from range
    state.items = [];
    state.stats.kills = atKills - 1;
    state.enemies.push(
      makeEnemy({
        pos: { x: state.players[0].pos.x + 60, y: state.players[0].pos.y },
      }),
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
    state.players[0].level = 8; // grown into the hammer's level requirement
    state.players[0].stats.strength = 20; // …and its STRENGTH requirement
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
        pos: { ...state.players[0].pos },
        equipment: hammer,
      },
    ];
    step(state, idle, DT);
    expect(state.players[0].equipment.weapon.id).toBe(61);
    // The old starting weapon went into the bag, not into the void.
    expect(
      state.players[0].inventory.some((i) => i?.defId === "medieval_sword"),
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
    state.players[0].equipment.weapon = {
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
        pos: { ...state.players[0].pos },
        equipment: cutter,
      },
    ];
    step(state, idle, DT);
    expect(state.players[0].equipment.weapon.id).toBe(63); // hammer stays
    expect(state.players[0].inventory.some((i) => i?.id === 62)).toBe(true);
  });

  it("drops the displaced piece on the ground when the bag is full", () => {
    const state = startGame();
    clearStage(state);
    state.players[0].level = 8;
    state.players[0].stats.strength = 20; // clear the hammer's STRENGTH requirement
    // Level 8 brings automatic STRENGTH gains that widen the bag — grow it
    // first, then fill EVERY slot so the bag is genuinely full.
    syncInventoryCapacity(state, state.players[0]);
    state.players[0].inventory = state.players[0].inventory.map((_, i) =>
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
        pos: { ...state.players[0].pos },
        equipment: hammer,
      },
    ];
    step(state, idle, DT);
    expect(state.players[0].equipment.weapon.id).toBe(64);
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
    state.players[0].level = 5; // grown into the vest's requirement
    state.players[0].stats.strength = 20; // …and its LEATHER strength requirement
    state.items = [
      {
        id: 1,
        kind: "equipment",
        pos: { ...state.players[0].pos },
        equipment: makeVest(2), // out-armors the starting T-SHIRT
      },
    ];
    step(state, idle, DT);
    expect(state.items).toHaveLength(0);
    expect(state.players[0].equipment.chest?.id).toBe(2);
    // The displaced tee went into the bag, not into the void.
    expect(state.players[0].inventory.some((i) => i?.defId === "t_shirt")).toBe(
      true,
    );
  });

  it("bags gear that is worse than what is worn", () => {
    const state = startGame();
    state.enemies = [];
    state.players[0].level = 5;
    state.players[0].equipment.chest = makeVest(90, "magic"); // +20 hp affix
    state.items = [
      {
        id: 1,
        kind: "equipment",
        pos: { ...state.players[0].pos },
        equipment: makeVest(2), // plain — strictly worse
      },
    ];
    step(state, idle, DT);
    expect(state.players[0].equipment.chest?.id).toBe(90);
    expect(state.players[0].inventory[0]?.id).toBe(2);
  });

  it("leaves lesser loot on the ground when the bag is full", () => {
    const state = startGame();
    state.enemies = [];
    state.players[0].level = 5;
    state.players[0].equipment.chest = makeVest(90, "magic");
    state.players[0].inventory = state.players[0].inventory.map((_, i) =>
      makeVest(100 + i),
    );
    state.items = [
      {
        id: 1,
        kind: "equipment",
        pos: { ...state.players[0].pos },
        equipment: makeVest(2),
      },
    ];
    step(state, idle, DT);
    expect(state.items).toHaveLength(1);
  });

  it("nudges once when a full bag turns away loot, then throttles the cue", () => {
    const state = startGame();
    state.enemies = [];
    // Silence the level's spawn points too: the cooldown re-nudge steps a big dt,
    // during which an armed moon spawner would otherwise emit a mob into the
    // staged field and perturb the pickup probe.
    stopWaves(state);
    state.players[0].level = 5;
    state.players[0].equipment.chest = makeVest(90, "magic");
    state.players[0].inventory = state.players[0].inventory.map((_, i) =>
      makeVest(100 + i),
    );
    state.items = [
      {
        id: 1,
        kind: "equipment",
        pos: { ...state.players[0].pos },
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
    state.players[0].level = 5;
    state.players[0].stats.strength = 20; // heft the LEATHER vest's strength gate
    // Bare the chest first so the swap math below is a plain add/remove.
    discardEquipped(state, state.players[0], "chest");
    const before = state.players[0].maxHp;
    const vestBase = GEAR_DEFS.kevlar_vest!.bonuses.maxHp ?? 0;
    state.players[0].inventory[3] = makeVest(50, "magic"); // +20 affix
    expect(equipFromInventory(state, state.players[0], 3)).toBe(true);
    expect(state.players[0].equipment.chest?.id).toBe(50);
    expect(state.players[0].inventory[3]).toBeNull();
    expect(state.players[0].maxHp).toBe(before + vestBase + 20);
    expect(state.players[0].hp).toBe(state.players[0].maxHp); // gains heal along
    // The worn vest counts its armor into the total.
    expect(totalArmor(state, state.players[0])).toBeGreaterThanOrEqual(
      GEAR_DEFS.kevlar_vest!.armor!,
    );

    // Unequip: bonuses come back off, hp clamps.
    expect(unequipToInventory(state, state.players[0], "chest")).toBe(true);
    expect(state.players[0].maxHp).toBe(before);
    expect(state.players[0].hp).toBe(before);
    expect(state.players[0].equipment.chest).toBeNull();
  });

  it("swaps weapons, and comes off into the bag leaving bare hands", () => {
    const state = startGame();
    const cutter: Equipment = {
      id: 60,
      defId: "box_cutter",
      slot: "weapon",
      tier: "regular",
      ilvl: 5,
      affixes: [],
    };
    state.players[0].inventory[0] = cutter;
    expect(equipFromInventory(state, state.players[0], 0)).toBe(true);
    expect(state.players[0].equipment.weapon.defId).toBe("box_cutter");
    expect(state.players[0].inventory[0]?.defId).toBe("medieval_sword"); // swapped back

    // …and the hand comes off like any other slot: the weapon banks and the
    // hero is left holding nothing but his hands. The slot stays TYPED
    // never-empty (every read of it leans on that) — "empty" is the bare-hands
    // piece, which is what `isBareHands` answers for.
    expect(unequipToInventory(state, state.players[0], "weapon")).toBe(true);
    expect(isBareHands(state.players[0].equipment.weapon)).toBe(true);
    expect(
      state.players[0].inventory.some((i) => i?.defId === "box_cutter"),
    ).toBe(true);

    // Nothing to take off twice: a hero already bare-handed is refused, so the
    // bag never fills up with copies of an empty hand.
    expect(unequipToInventory(state, state.players[0], "weapon")).toBe(false);
  });

  it("rearranges bag cells by swapping", () => {
    const state = startGame();
    state.players[0].inventory[0] = makeVest(70);
    moveInventoryItem(state, state.players[0], 0, 2);
    expect(state.players[0].inventory[0]).toBeNull();
    expect(state.players[0].inventory[2]?.id).toBe(70);
  });

  it("discards a bag item for good — no ground drop", () => {
    const state = startGame();
    state.items = [];
    state.players[0].inventory[2] = makeVest(77);
    const removed = discardFromInventory(state, state.players[0], 2);
    expect(removed?.id).toBe(77);
    expect(state.players[0].inventory[2]).toBeNull();
    // Destroyed, not dropped: nothing lands on the ground to pick back up.
    expect(state.items.some((i) => i.kind === "equipment")).toBe(false);
  });

  it("discarding an empty cell is a no-op", () => {
    const state = startGame();
    state.players[0].inventory[1] = null;
    expect(discardFromInventory(state, state.players[0], 1)).toBeNull();
  });

  it("discards worn armor — strips it off the body, armor total drops", () => {
    const state = startGame();
    state.players[0].level = 5;
    state.players[0].stats.strength = 20; // heft the LEATHER vest's strength gate
    state.players[0].inventory[0] = makeVest(88);
    expect(equipFromInventory(state, state.players[0], 0)).toBe(true);
    expect(state.players[0].equipment.chest?.id).toBe(88);
    const armored = totalArmor(state, state.players[0]);
    expect(armored).toBeGreaterThanOrEqual(GEAR_DEFS.kevlar_vest!.armor!);
    const removed = discardEquipped(state, state.players[0], "chest");
    expect(removed?.id).toBe(88);
    expect(state.players[0].equipment.chest).toBeNull();
    expect(totalArmor(state, state.players[0])).toBeLessThan(armored); // the vest's points left
  });

  it("never discards the equipped weapon — the holster is never empty", () => {
    const state = startGame();
    const held = state.players[0].equipment.weapon;
    expect(discardEquipped(state, state.players[0], "weapon")).toBeNull();
    expect(state.players[0].equipment.weapon).toBe(held);
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
