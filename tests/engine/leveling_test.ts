// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// XP, level-ups, and the six stats: kills grant XP proportional to the
// victim's max hp, each level banks a stat point, spending points changes
// derived numbers (hp, damage, crits, drops) the way the design says.

import { describe, expect, it } from "vitest";

import {
  allocateStat,
  closeInventory,
  equipFromInventory,
  inventoryCapacity,
  LEVELING,
  LOOT,
  openInventory,
  PLAYER,
  playerCritChance,
  STATS,
  step,
  syncInventoryCapacity,
  WEAPON,
  weaponCooldownFor,
  weaponDef,
  weaponDamage,
  weaponDamageFor,
  type Equipment,
} from "@game/core";
import {
  clearStage,
  DT,
  idle,
  makeEnemy,
  run,
  startGame,
  steerTo,
} from "./helpers.ts";

/** Kill one hand-placed ghost of the given max hp and return the state. */
function killGhostWorth(maxHp: number) {
  const state = startGame();
  state.player.stats.luck = 0;
  clearStage(state); // keep the parked boss so the objective stays open
  state.enemies.push(
    makeEnemy({
      pos: { x: state.player.pos.x + 60, y: state.player.pos.y },
      hp: maxHp,
      maxHp,
    }),
  );
  run(state, idle, 8000, (s) => s.enemies.length === 1);
  return state;
}

describe("xp", () => {
  it("is proportional to the killed monster's max hp", () => {
    const small = killGhostWorth(20);
    expect(small.stats.xpGained).toBe(Math.round(20 * LEVELING.xpPerHp));
    expect(small.player.xp).toBe(small.stats.xpGained); // below the threshold

    const big = killGhostWorth(50);
    expect(big.stats.xpGained).toBe(Math.round(50 * LEVELING.xpPerHp));
  });

  it("levels up at the threshold, pauses, and banks a stat point", () => {
    const state = killGhostWorth(LEVELING.baseXpToLevel);
    expect(state.player.level).toBe(2);
    expect(state.player.pendingStatPoints).toBe(1);
    expect(state.phase).toBe("levelup");
    expect(state.events).toContainEqual({ type: "levelUp", level: 2 });
    // The next level costs more.
    expect(state.player.xpToNext).toBe(
      Math.round(LEVELING.baseXpToLevel * LEVELING.xpGrowth),
    );

    // The pause is real: time stands still until the point is spent.
    const time = state.stats.timeMs;
    step(state, idle, DT);
    expect(state.stats.timeMs).toBe(time);

    allocateStat(state, "luck");
    expect(state.phase).toBe("playing");
    expect(state.player.stats.luck).toBe(1);
    expect(state.player.pendingStatPoints).toBe(0);
  });

  it("banks multiple points when one kill crosses several thresholds", () => {
    const toLevel2 = LEVELING.baseXpToLevel;
    const toLevel3 = Math.round(LEVELING.baseXpToLevel * LEVELING.xpGrowth);
    const state = killGhostWorth(toLevel2 + toLevel3 + 10); // 10 into level 3
    expect(state.player.level).toBe(3);
    expect(state.player.pendingStatPoints).toBe(2);
    allocateStat(state, "health");
    expect(state.phase).toBe("levelup"); // one point still pending
    allocateStat(state, "dexterity");
    expect(state.phase).toBe("playing");
  });
});

describe("stats", () => {
  it("HEALTH raises max hp and current hp together", () => {
    const state = startGame();
    state.player.pendingStatPoints = 1;
    const before = state.player.maxHp;
    allocateStat(state, "health");
    expect(state.player.maxHp).toBe(before + STATS.healthPerPoint);
    expect(state.player.hp).toBe(before + STATS.healthPerPoint);
  });

  it("STRENGTH scales physical (melee + ranged) damage; DEX and INT do not", () => {
    const state = startGame(); // blaster equipped: ranged
    const base = weaponDamage(state);
    // The starting sidearm is the unbreakable baseline — exempt from the global
    // damage lever (which only cuts looted weapons), so it keeps full damage.
    expect(base).toBe(weaponDef("blaster").damage);

    // DEX (a speed stat now) and INT (magic/range) leave physical damage alone.
    state.player.stats.dexterity = 5;
    state.player.stats.intelligence = 5;
    expect(weaponDamage(state)).toBe(base);

    // STRENGTH scales the damage of physical weapons — ranged here, and melee.
    state.player.stats.strength = 2;
    expect(weaponDamage(state)).toBeCloseTo(
      base * (1 + 2 * STATS.damageBonusPerPoint),
    );
  });

  it("weaponDamageFor scales a bag weapon by ITS class stat, plus affixes", () => {
    // The HUD switcher and inventory readouts rank/label carried (unequipped)
    // weapons through weaponDamageFor, so it must apply the candidate's own
    // governing stat — not the equipped weapon's.
    const state = startGame(); // blaster equipped: ranged
    const wandDef = weaponDef("test_wand"); // magic
    const wand: Equipment = {
      id: 999,
      defId: "test_wand",
      slot: "weapon",
      tier: "regular",
      affixes: [],
      durability: wandDef.durability,
    };

    expect(weaponDamageFor(state, wand)).toBe(
      wandDef.damage * WEAPON.damageMult,
    );

    // DEX (the equipped blaster's stat) must NOT move the magic wand.
    state.player.stats.dexterity = 4;
    expect(weaponDamageFor(state, wand)).toBe(
      wandDef.damage * WEAPON.damageMult,
    );

    // INT (the wand's own class stat) does.
    state.player.stats.intelligence = 3;
    expect(weaponDamageFor(state, wand)).toBeCloseTo(
      wandDef.damage * WEAPON.damageMult * (1 + 3 * STATS.damageBonusPerPoint),
    );

    // A damagePct affix stacks into the same multiplier.
    wand.affixes = [{ kind: "damagePct", value: 0.5 }];
    expect(weaponDamageFor(state, wand)).toBeCloseTo(
      wandDef.damage *
        WEAPON.damageMult *
        (1 + 3 * STATS.damageBonusPerPoint + 0.5),
    );
  });

  it("DEXTERITY quickens ranged fire; STRENGTH and INTELLIGENCE do not", () => {
    const state = startGame(); // blaster equipped: ranged
    const weapon = state.player.equipment.weapon;
    const base = weaponCooldownFor(state, weapon);
    // The catalog cadence, slowed by the global base-cooldown lever.
    expect(base).toBeCloseTo(
      weaponDef("blaster").cooldownMs * WEAPON.baseCooldownMult,
    );

    // The off-class stats leave the sidearm's cadence untouched.
    state.player.stats.strength = 5;
    state.player.stats.intelligence = 5;
    expect(weaponCooldownFor(state, weapon)).toBe(base);

    // DEX divides the cooldown by (1 + points × attackSpeedPerStat).
    state.player.stats.dexterity = 4;
    expect(weaponCooldownFor(state, weapon)).toBeCloseTo(
      base / (1 + 4 * STATS.attackSpeedPerStat),
    );
  });

  it("weaponCooldownFor quickens a bag weapon by ITS class stat", () => {
    const state = startGame(); // blaster equipped: ranged
    const wandDef = weaponDef("test_wand"); // magic
    const wand: Equipment = {
      id: 999,
      defId: "test_wand",
      slot: "weapon",
      tier: "regular",
      affixes: [],
      durability: wandDef.durability,
    };
    const wandBase = wandDef.cooldownMs * WEAPON.baseCooldownMult;
    expect(weaponCooldownFor(state, wand)).toBeCloseTo(wandBase);

    // DEX (the equipped blaster's stat) must NOT move the magic wand.
    state.player.stats.dexterity = 4;
    expect(weaponCooldownFor(state, wand)).toBeCloseTo(wandBase);

    // INT (the wand's own class stat) does.
    state.player.stats.intelligence = 3;
    expect(weaponCooldownFor(state, wand)).toBeCloseTo(
      wandBase / (1 + 3 * STATS.attackSpeedPerStat),
    );
  });

  it("a DEX build actually fires more shots in the same window", () => {
    // End-to-end: the quicker cadence shows up as extra bolts downrange, not
    // just a smaller number. Park an unkillable target in range and count.
    const shotsIn = (dex: number) => {
      const state = startGame();
      state.player.stats.dexterity = dex;
      clearStage(state);
      state.enemies.push(
        makeEnemy({
          pos: { x: state.player.pos.x + 60, y: state.player.pos.y },
          hp: 1_000_000,
          maxHp: 1_000_000,
        }),
      );
      run(state, idle, 500); // ~8s of fire — long enough to resolve the gap
      return state.stats.shotsFired;
    };
    expect(shotsIn(6)).toBeGreaterThan(shotsIn(0));
  });

  it("SPEED quickens the walk", () => {
    const state = startGame();
    clearStage(state);
    const start = state.player.pos.x;
    step(state, steerTo(start + 1000, state.player.pos.y), DT);
    expect(state.player.pos.x - start).toBeCloseTo(
      PLAYER.speed * (DT / 1000),
      5,
    );

    state.player.stats.speed = 5;
    const mid = state.player.pos.x;
    step(state, steerTo(mid + 1000, state.player.pos.y), DT);
    expect(state.player.pos.x - mid).toBeCloseTo(
      PLAYER.speed * (1 + 5 * STATS.speedPerPoint) * (DT / 1000),
      5,
    );
  });

  it("LUCK raises the player's crit chance", () => {
    const state = startGame();
    const base = playerCritChance(state);
    expect(base).toBeCloseTo(STATS.baseCritChance);
    state.player.stats.luck = 3;
    expect(playerCritChance(state)).toBeCloseTo(
      STATS.baseCritChance + 3 * STATS.critChancePerLuck,
    );
  });

  it("a guaranteed crit doubles the damage dealt", () => {
    const state = startGame();
    state.player.stats.luck = 30; // crit chance > 1 → every hit crits
    clearStage(state);
    state.enemies.push(
      makeEnemy({
        pos: { x: state.player.pos.x + 60, y: state.player.pos.y },
        hp: 1_000_000,
        maxHp: 1_000_000,
      }),
    );
    run(state, idle, 400, (s) => s.stats.damageDealt > 0);
    // The starting sidearm keeps full damage (looted-only lever), so a
    // guaranteed crit deals exactly double its catalog damage.
    expect(state.stats.damageDealt).toBe(
      Math.round(weaponDef("blaster").damage * STATS.critMultiplier),
    );
  });

  it("LUCK shrugs off the ghosts' critical grips", () => {
    const state = startGame();
    state.player.stats.luck = 5; // 0.1 ghost crit − 5×0.02 → 0
    state.enemies = [makeEnemy({ pos: { ...state.player.pos } })];
    step(state, idle, DT);
    expect(state.stats.damageTaken).toBe(12); // ghost's touch, never doubled
  });

  it("STRENGTH widens the carry bag from the base floor", () => {
    const state = startGame();
    // A fresh run starts at the STRENGTH-0 floor.
    expect(state.player.inventory.length).toBe(LOOT.baseInventorySize);
    expect(inventoryCapacity(state)).toBe(LOOT.baseInventorySize);

    // Each allocated STRENGTH point adds bagSlotsPerStr cells.
    state.player.pendingStatPoints = 3;
    allocateStat(state, "strength");
    allocateStat(state, "strength");
    allocateStat(state, "strength");
    const expected = LOOT.baseInventorySize + 3 * STATS.bagSlotsPerStr;
    expect(inventoryCapacity(state)).toBe(expected);
    expect(state.player.inventory.length).toBe(expected);
    // The extra cells are empty and ready to catch loot.
    expect(state.player.inventory.every((c) => c === null)).toBe(true);
  });

  it("the bag only grows — a lost STRENGTH source never strands items", () => {
    const state = startGame();
    state.player.stats.strength = 4; // bag grown to the floor + 4
    syncInventoryCapacity(state);
    const grown = state.player.inventory.length;
    expect(grown).toBe(LOOT.baseInventorySize + 4 * STATS.bagSlotsPerStr);

    // Dropping the STRENGTH would lower the target capacity, but the physical
    // bag must not shrink (grow-only), so nothing carried can be discarded.
    state.player.stats.strength = 0;
    syncInventoryCapacity(state);
    expect(state.player.inventory.length).toBe(grown);
  });

  it("a +STRENGTH charm widens the bag when equipped", () => {
    const state = startGame();
    const before = state.player.inventory.length;
    const charm: Equipment = {
      id: 777,
      defId: "test_charm",
      slot: "charm",
      tier: "regular",
      affixes: [{ kind: "stat", stat: "strength", value: 2 }],
    };
    state.player.inventory[0] = charm;
    expect(equipFromInventory(state, 0)).toBe(true);
    expect(state.player.inventory.length).toBe(
      before + 2 * STATS.bagSlotsPerStr,
    );
  });
});

describe("pauses", () => {
  it("the inventory pauses the run and resumes on close", () => {
    const state = startGame();
    openInventory(state);
    expect(state.phase).toBe("inventory");
    const time = state.stats.timeMs;
    step(state, idle, DT);
    expect(state.stats.timeMs).toBe(time);
    closeInventory(state);
    expect(state.phase).toBe("playing");
  });

  it("closing the inventory with banked points returns to the level-up choice", () => {
    const state = startGame();
    state.player.pendingStatPoints = 1;
    openInventory(state);
    closeInventory(state);
    expect(state.phase).toBe("levelup");
  });

  it("base hp starts at the configured value", () => {
    const state = startGame();
    expect(state.player.maxHp).toBe(PLAYER.maxHp);
  });
});
