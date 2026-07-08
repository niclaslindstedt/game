// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// XP, level-ups, and the six stats: kills grant XP proportional to the
// victim's max hp, each level banks a stat point, spending points changes
// derived numbers (hp, damage, crits, drops) the way the design says.

import { describe, expect, it } from "vitest";

import {
  allocateStat,
  closeInventory,
  DODGE,
  equipFromInventory,
  inventoryCapacity,
  LEVELING,
  LOOT,
  openInventory,
  PLAYER,
  playerCritChance,
  playerDodgeChance,
  STAMINA,
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
  equipBlaster,
  idle,
  makeEnemy,
  run,
  startGame,
  steerTo,
} from "./helpers.ts";

/** Kill one hand-placed ghost of the given max hp and return the state. */
function killGhostWorth(maxHp: number) {
  // Ranged blaster: the XP maths is about the victim's hp, not the weapon, so
  // pick it off from a fixed distance rather than closing with the melee sword.
  const state = equipBlaster(startGame());
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
    allocateStat(state, "stamina");
    expect(state.phase).toBe("levelup"); // one point still pending
    allocateStat(state, "dexterity");
    expect(state.phase).toBe("playing");
  });
});

describe("stats", () => {
  it("STAMINA raises max stamina and current stamina together, and max hp", () => {
    const state = startGame();
    state.player.pendingStatPoints = 1;
    const beforeStamina = state.player.maxStamina;
    const beforeHp = state.player.maxHp;
    const beforeCurHp = state.player.hp;
    allocateStat(state, "stamina");
    expect(state.player.maxStamina).toBe(beforeStamina + STAMINA.maxPerPoint);
    expect(state.player.stamina).toBe(beforeStamina + STAMINA.maxPerPoint);
    // STAMINA now deepens the sprint pool AND the health bar; the gain heals
    // current hp along with it (like a fresh suit).
    expect(state.player.maxHp).toBe(beforeHp + STAMINA.hpPerPoint);
    expect(state.player.hp).toBe(beforeCurHp + STAMINA.hpPerPoint);
  });

  it("STRENGTH scales physical (melee + ranged) damage; DEX and INT do not", () => {
    const state = startGame(); // default crude sword: melee (STR-scaled)
    const base = weaponDamage(state);
    // The crude sword is finite (it carries durability), so — unlike the old
    // unbreakable sidearm — the global damage lever cuts it like any weapon.
    expect(base).toBe(weaponDef("crude_sword").damage * WEAPON.damageMult);

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

  it("DEXTERITY quickens physical fire; STRENGTH and INTELLIGENCE do not", () => {
    const state = startGame(); // default crude sword: melee (DEX-quickened)
    const weapon = state.player.equipment.weapon;
    const base = weaponCooldownFor(state, weapon);
    // The catalog cadence, slowed by the global base-cooldown lever.
    expect(base).toBeCloseTo(
      weaponDef("crude_sword").cooldownMs * WEAPON.baseCooldownMult,
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
      const state = equipBlaster(startGame()); // ranged: bolts are countable
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

  it("DEXTERITY lands physical crits, INTELLIGENCE lands magic crits, LUCK nudges both", () => {
    // Crude sword is melee → its crit rides DEXTERITY. Bare base first.
    const state = startGame();
    expect(playerCritChance(state)).toBeCloseTo(STATS.baseCritChance);

    // DEX raises the melee/ranged crit; INT does NOT touch a physical swing.
    state.player.stats.dexterity = 4;
    state.player.stats.intelligence = 7;
    expect(playerCritChance(state, "melee")).toBeCloseTo(
      STATS.baseCritChance + 4 * STATS.critChancePerStat,
    );
    expect(playerCritChance(state, "ranged")).toBeCloseTo(
      STATS.baseCritChance + 4 * STATS.critChancePerStat,
    );
    // A magic swing rides INT instead (DEX leaves it alone).
    expect(playerCritChance(state, "magic")).toBeCloseTo(
      STATS.baseCritChance + 7 * STATS.critChancePerStat,
    );

    // LUCK adds a MARGINAL crit on top of whichever stat governs — a quarter
    // of a primary point, so it never replaces the class stat.
    state.player.stats.luck = 3;
    expect(playerCritChance(state, "melee")).toBeCloseTo(
      STATS.baseCritChance +
        4 * STATS.critChancePerStat +
        3 * STATS.critChancePerLuck,
    );
    expect(STATS.critChancePerLuck).toBeCloseTo(STATS.critChancePerStat / 4);
  });

  it("a guaranteed crit doubles the damage dealt", () => {
    const state = equipBlaster(startGame()); // unbreakable blaster: full damage
    // Blaster is ranged → DEXTERITY drives its crit. Stack it far past 1 so
    // every shot crits (DEX also quickens cadence, which only lands the crit
    // sooner — the first hit's damage is what we measure).
    state.player.stats.dexterity = 40;
    clearStage(state);
    state.enemies.push(
      makeEnemy({
        pos: { x: state.player.pos.x + 60, y: state.player.pos.y },
        hp: 1_000_000,
        maxHp: 1_000_000,
      }),
    );
    run(state, idle, 400, (s) => s.stats.damageDealt > 0);
    // The unbreakable blaster keeps full damage (looted-only lever), so a
    // guaranteed crit deals exactly double its catalog damage.
    expect(state.stats.damageDealt).toBe(
      Math.round(weaponDef("blaster").damage * STATS.critMultiplier),
    );
  });

  it("LUCK shrugs off the ghosts' critical grips", () => {
    const state = startGame();
    state.player.stats.luck = 5; // 0.1 ghost crit − 5×0.02 → 0
    // Pin the RNG high so neither the hero's 5% base dodge nor the (already
    // zeroed) ghost crit can fire — this isolates the "touch lands at base 12,
    // never doubled" promise from the new dodge roll.
    state.rng = () => 0.99;
    state.enemies = [makeEnemy({ pos: { ...state.player.pos } })];
    step(state, idle, DT);
    expect(state.stats.damageTaken).toBe(12); // ghost's touch, never doubled
  });

  it("DEXTERITY and LUCK raise the dodge chance off its base", () => {
    const state = startGame();
    expect(playerDodgeChance(state)).toBeCloseTo(DODGE.base);
    // DEX sharpens the sidestep; LUCK nudges it MARGINALLY (a quarter of DEX).
    state.player.stats.dexterity = 4;
    state.player.stats.luck = 6;
    expect(playerDodgeChance(state)).toBeCloseTo(
      DODGE.base + 4 * DODGE.perDex + 6 * DODGE.perLuck,
    );
    expect(DODGE.perLuck).toBeCloseTo(DODGE.perDex / 4);
    // Capped so no build becomes untouchable.
    state.player.stats.dexterity = 1000;
    expect(playerDodgeChance(state)).toBe(DODGE.max);
  });

  it("a high-dodge hero eventually sidesteps a blow entirely (no damage)", () => {
    const state = startGame();
    state.player.stats.dexterity = 20; // dodge well up off base
    // An unkillable brute glued to the hero so it keeps swinging (the crude
    // sword can chip it, but 1e6 hp means it never dies and the loop runs).
    state.enemies = [
      makeEnemy({
        pos: { ...state.player.pos },
        hp: 1_000_000,
        maxHp: 1_000_000,
      }),
    ];
    let dodged = false;
    for (let i = 0; i < 300 && !dodged; i++) {
      const taken = state.stats.damageTaken;
      state.enemies[0]!.contactCooldownMs = 0; // let it swing every step
      step(state, idle, DT);
      if (state.events.some((e) => e.type === "playerDodge")) {
        dodged = true;
        // A dodged blow deals no damage that step.
        expect(state.stats.damageTaken).toBe(taken);
      }
    }
    expect(dodged).toBe(true);
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
