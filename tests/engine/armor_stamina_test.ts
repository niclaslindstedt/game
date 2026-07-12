// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Armor and stamina rules. Armor is the D2/WoW shape: worn pieces
// (head/chest/legs/feet) carry flat armor points that sum into a physical
// damage reduction judged against the ATTACKER's level, wear a point per
// landed hit, go inactive at zero durability, and wake back up on repair.
// The sprint pool drains while running, refills while idle, and caps the
// top speed once empty. Engine rules — run against the synthetic fixtures
// (the test_helmet/vest/greaves/boots set; test_brute hits for 20).

import { describe, expect, it } from "vitest";

import {
  ARMOR,
  STAMINA,
  armorReduction,
  armorValueOf,
  createGame,
  dismissIntro,
  equipFromInventory,
  isArmorBroken,
  registerDefs,
  repairWornArmor,
  rollEquipment,
  skipCutscene,
  step,
  totalArmor,
  type ArmorSlot,
  type Equipment,
} from "@game/core";

import { FIX_DIFFICULTIES, FIX_GEAR, installFixtures } from "./fixtures.ts";
import {
  clearStage,
  DT,
  idle,
  makeEnemy,
  run,
  startGame,
  steerTo,
} from "./helpers.ts";

/** Mint a plain fixture armor piece into `slot`, full durability. */
function fixtureArmor(defId: string, slot: ArmorSlot, id = 77): Equipment {
  const def = FIX_GEAR[defId]!;
  return {
    id,
    defId,
    slot,
    tier: "regular",
    ilvl: 1,
    affixes: [],
    armor: def.armor,
    durability: def.durability,
  };
}

/** Dress the hero in the full fixture set (44 armor) through the real equip
 * path, so derived stats (the vest's +20 maxHp) apply like a genuine equip. */
function dressFully(state: ReturnType<typeof startGame>): void {
  const pieces: [string, ArmorSlot, number][] = [
    ["test_helmet", "head", 71],
    ["test_vest", "chest", 72],
    ["test_greaves", "legs", 73],
    ["test_boots", "feet", 74],
  ];
  for (const [defId, slot, id] of pieces) {
    state.player.inventory[0] = fixtureArmor(defId, slot, id);
    equipFromInventory(state, 0);
  }
}

/** One stationary brute (contact 20) parked on the player, ready to swing. */
function bruteOnTop(state: ReturnType<typeof startGame>, mlvl = 1): void {
  state.enemies = [
    makeEnemy(
      { pos: { ...state.player.pos }, contactCooldownMs: 0, mlvl },
      "test_brute",
    ),
  ];
}

describe("armor", () => {
  it("sums worn pieces into a level-scaled reduction of a landed hit", () => {
    const state = startGame();
    // A big LUCK pool zeroes the enemy's crit chance, so the hit is exactly
    // the brute's contact damage (20) with no doubling. Pin the RNG high so
    // the hero's dodge (which LUCK also feeds) can't swallow the blow.
    state.player.stats.luck = 100;
    state.rng = () => 0.99;
    dressFully(state);
    expect(totalArmor(state)).toBe(10 + 16 + 10 + 8);
    const maxHp = state.player.maxHp;

    // Against a level-1 attacker: k = kBase + kPerLevel, 44/(44+52) ≈ 0.458.
    const expected = 44 / (44 + ARMOR.kBase + ARMOR.kPerLevel);
    expect(armorReduction(state, 1)).toBeCloseTo(expected, 6);

    bruteOnTop(state, 1);
    step(state, idle, DT);
    expect(state.player.hp).toBe(maxHp - Math.round(20 * (1 - expected)));
  });

  it("turns less of a higher-level attacker's blow — armor decays as the horde outlevels it", () => {
    const state = startGame();
    dressFully(state);
    expect(armorReduction(state, 10)).toBeLessThan(armorReduction(state, 1));
    // And never past the cap, however small the attacker.
    expect(armorReduction(state, 1)).toBeLessThanOrEqual(ARMOR.maxReduction);
  });

  it("a bare hero takes the whole blow in HP", () => {
    const state = startGame();
    state.player.stats.luck = 100;
    state.rng = () => 0.99; // pin dodge (and crit) off
    expect(totalArmor(state)).toBe(0);
    const maxHp = state.player.maxHp;
    bruteOnTop(state);
    step(state, idle, DT);
    expect(state.player.hp).toBe(maxHp - 20);
  });

  it("wears every worn piece a point per landed hit; a dodged blow costs nothing", () => {
    const state = startGame();
    state.player.stats.luck = 100;
    state.rng = () => 0.99;
    dressFully(state);
    bruteOnTop(state);
    step(state, idle, DT);
    expect(state.player.equipment.head?.durability).toBe(
      FIX_GEAR.test_helmet!.durability! - 1,
    );
    expect(state.player.equipment.chest?.durability).toBe(
      FIX_GEAR.test_vest!.durability! - 1,
    );

    // A dodged hit (rng under the dodge chance) never touches the wardrobe.
    const hp = state.player.hp;
    state.rng = () => 0;
    state.enemies[0]!.contactCooldownMs = 0;
    step(state, idle, DT);
    expect(state.player.hp).toBe(hp);
    expect(state.player.equipment.head?.durability).toBe(
      FIX_GEAR.test_helmet!.durability! - 1,
    );
  });

  it("goes INACTIVE at zero durability — no armor, no bonuses — and wakes on repair", () => {
    const state = startGame();
    state.player.stats.luck = 100;
    state.rng = () => 0.99;
    dressFully(state);
    const armored = totalArmor(state);
    const maxHp = state.player.maxHp; // includes the vest's +20

    // One hit from breaking: the next landed blow snaps the vest.
    state.player.equipment.chest!.durability = 1;
    bruteOnTop(state);
    step(state, idle, DT);

    const vest = state.player.equipment.chest!;
    expect(vest.durability).toBe(0);
    expect(isArmorBroken(vest)).toBe(true);
    expect(armorValueOf(vest)).toBe(0);
    expect(totalArmor(state)).toBe(armored - 16);
    // The broken vest's +20 maxHp went silent with it.
    expect(state.player.maxHp).toBe(maxHp - 20);
    expect(state.events.some((e) => e.type === "armorBroke")).toBe(true);
    // Broken armor stays WORN — never discarded.
    expect(state.player.equipment.chest?.defId).toBe("test_vest");

    // The repair kit mends the whole wardrobe and revives the vest.
    expect(repairWornArmor(state)).toBe(true);
    expect(vest.durability).toBe(FIX_GEAR.test_vest!.durability);
    expect(isArmorBroken(vest)).toBe(false);
    expect(totalArmor(state)).toBe(armored);
    expect(state.player.maxHp).toBe(maxHp);
    // Nothing left to mend: a second kit would stay on the ground.
    expect(repairWornArmor(state)).toBe(false);
  });

  it("rolls bigger armor the deeper it drops (ilvl growth), stamped on the instance", () => {
    const state = startGame();
    const base = FIX_GEAR.test_vest!.armor!;
    // Pin the make quality so the growth rule is measured alone (a rolled
    // BROKEN/PERFECT make would scale the stamp — the quality suite's beat).
    const deep = rollEquipment(state, {
      defId: "test_vest",
      tier: "regular",
      quality: "normal",
      mlvl: 20,
    });
    // ilvl rolls at most a few under the mob, so a mlvl-20 find grew well
    // past the authored base (its value at levelReq 1).
    expect(deep.ilvl).toBeGreaterThan(10);
    expect(deep.armor).toBe(
      Math.round(base * (1 + ARMOR.armorPerIlvl * (deep.ilvl - 1))),
    );
    expect(deep.armor!).toBeGreaterThan(base);
    // Regular drops arrive breakable at the def's full durability.
    expect(deep.durability).toBe(FIX_GEAR.test_vest!.durability);
  });

  it("mints unique+ armor unbreakable, like unique weapons", () => {
    const state = startGame();
    const trophy = rollEquipment(state, { defId: "test_vest", tier: "unique" });
    expect(trophy.durability).toBeUndefined();
  });

  it("rolls a deeper item level on harder difficulties (lootIlvlBonus)", () => {
    const medium = startGame();
    const jesus = createGame(42, "test_level", "jesus");
    skipCutscene(jesus);
    dismissIntro(jesus);
    // Pin both streams to the same draw so the rolled deficit matches; the
    // only difference left is the rung's flat ilvl bonus.
    medium.rng = () => 0.5;
    jesus.rng = () => 0.5;
    // The offset-strip keys loot off the LOOT level (mlvl − offset), so target
    // the SAME loot level on both rungs — back out each difficulty's offset —
    // leaving `lootIlvlBonus` as the only difference.
    const lootLevel = 12;
    const common = { defId: "test_vest", tier: "regular" } as const;
    const plain = rollEquipment(medium, {
      ...common,
      mlvl: lootLevel + FIX_DIFFICULTIES.medium!.mobLevelOffset,
    });
    const hard = rollEquipment(jesus, {
      ...common,
      mlvl: lootLevel + FIX_DIFFICULTIES.jesus!.mobLevelOffset,
    });
    expect(hard.ilvl - plain.ilvl).toBe(
      FIX_DIFFICULTIES.jesus!.lootIlvlBonus -
        FIX_DIFFICULTIES.medium!.lootIlvlBonus,
    );
    expect(hard.armor!).toBeGreaterThan(plain.armor!);
  });

  it("dresses a fresh hero in the difficulty's startingGear, head bare", () => {
    // A fixture ladder whose MEDIUM opens dressed (the shipped rungs all do).
    registerDefs({
      difficulties: {
        ...FIX_DIFFICULTIES,
        medium: {
          ...FIX_DIFFICULTIES.medium!,
          startingGear: ["test_vest", "test_boots"],
        },
      },
    });
    try {
      const state = startGame();
      expect(state.player.equipment.head).toBeNull();
      expect(state.player.equipment.chest?.defId).toBe("test_vest");
      expect(state.player.equipment.chest?.durability).toBe(
        FIX_GEAR.test_vest!.durability,
      );
      expect(state.player.equipment.feet?.defId).toBe("test_boots");
      expect(totalArmor(state)).toBe(
        FIX_GEAR.test_vest!.armor! + FIX_GEAR.test_boots!.armor!,
      );
    } finally {
      installFixtures(true); // restore the reference catalogs
    }
  });
});

describe("stamina", () => {
  it("drains under a sustained run and refills while idle", () => {
    const state = startGame();
    // Isolate the sprint pool: no live horde, so no stray kill can grant XP
    // and refill stamina on a level-up mid-measurement (the run is deterministic
    // stamina math, not a combat scenario).
    clearStage(state);
    state.obstacles = []; // a clear lane so the run never stalls on a rock
    expect(state.player.stamina).toBe(state.player.maxStamina);

    run(state, steerTo(5000, 5000), 600);
    expect(state.player.stamina).toBe(0);

    run(state, idle, 600);
    expect(state.player.stamina).toBeGreaterThan(0);
  });

  it("recovers while walking — never drains — but slower than standing still", () => {
    const state = startGame();
    clearStage(state); // isolate the pool from combat XP/level-up refills
    state.obstacles = []; // a clear lane so the walk never stalls on a rock
    // A gentle nudge below the run threshold is a walk, not a run.
    const walk = { ...steerTo(5000, 5000), throttle: STAMINA.runThreshold };

    // Spend the pool with a sustained run, then confirm a walk refills it.
    run(state, steerTo(5000, 5000), 600);
    expect(state.player.stamina).toBe(0);

    run(state, walk, 60);
    const afterWalk = state.player.stamina;
    expect(afterWalk).toBeGreaterThan(0); // a walk regains, it does not drain

    // The same number of idle steps from empty refills strictly faster.
    state.player.stamina = 0;
    run(state, idle, 60);
    const afterIdle = state.player.stamina;
    expect(afterIdle).toBeGreaterThan(afterWalk);
    // Walking recovers at walkRegenFactor of the standing rate.
    expect(afterWalk).toBeCloseTo(afterIdle * STAMINA.walkRegenFactor, 4);
  });

  it("halves the top speed once the pool is empty", () => {
    const state = startGame();
    clearStage(state); // isolate movement from a horde blocking the lane
    state.obstacles = [];
    const target = steerTo(5000, 5000);

    // A full-pool step covers the full stride (one step barely dents stamina).
    state.player.stamina = state.player.maxStamina;
    const fullBefore = { ...state.player.pos };
    step(state, target, DT);
    const full = Math.hypot(
      state.player.pos.x - fullBefore.x,
      state.player.pos.y - fullBefore.y,
    );

    // An empty pool covers only its winded fraction of the same stride.
    state.player.stamina = 0;
    const emptyBefore = { ...state.player.pos };
    step(state, target, DT);
    const empty = Math.hypot(
      state.player.pos.x - emptyBefore.x,
      state.player.pos.y - emptyBefore.y,
    );

    expect(empty).toBeCloseTo(full * STAMINA.emptySpeedFactor, 2);
  });
});
