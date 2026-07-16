// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// XP, level-ups, and the six stats: kills grant XP proportional to the
// victim's max hp, each level banks a stat point, spending points changes
// derived numbers (hp, damage, crits, drops) the way the design says.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  allocateStat,
  arrowXpShareAt,
  autoGainAt,
  autoPowerScale,
  baseStatBonus,
  beginRespec,
  closeInventory,
  DODGE,
  effectiveStat,
  endgameSteepenMult,
  equipFromInventory,
  grantXp,
  inventoryCapacity,
  LEVELING,
  levelDiffXpMult,
  levelStatGains,
  LOOT,
  mobHpLevelFactor,
  mobHpScaleFor,
  mobLevelFor,
  mobLevelXp,
  openInventory,
  PLAYER,
  playerCritChance,
  playerDodgeChance,
  resetBalanceTuning,
  saturateToward,
  setAutoStatGainsEnabled,
  setBalanceTuning,
  STAMINA,
  STATS,
  step,
  syncInventoryCapacity,
  tierLevelCostMult,
  WEAPON,
  weaponCooldownFor,
  weaponDef,
  weaponDamage,
  weaponDamageFor,
  xpToLevelUp,
  type Equipment,
} from "@game/core";
import {
  clearStage,
  DT,
  equipBlaster,
  idle,
  makeEnemy,
  run,
  runUntilChooser,
  startGame,
  steerTo,
} from "./helpers.ts";

/** Kill one hand-placed ghost of the given max hp and monster level, return
 * the state. Kill XP now keys off `mlvl`, not hp, so both are parameterized. */
function killGhostWorth(maxHp: number, mlvl: number) {
  // Ranged blaster: pick the ghost off from a fixed distance (its per-shot
  // damage stays under the ghost's hp, so no overkill toll clips the xp).
  const state = equipBlaster(startGame());
  state.player.stats.luck = 0;
  clearStage(state); // keep the parked boss so the objective stays open
  state.enemies.push(
    makeEnemy({
      pos: { x: state.player.pos.x + 60, y: state.player.pos.y },
      hp: maxHp,
      maxHp,
      mlvl,
    }),
  );
  run(state, idle, 8000, (s) => s.enemies.length === 1);
  return state;
}

/**
 * Ding a fresh hero to level 2 by banking exactly the level-1 threshold. The
 * curve now costs thousands of XP per level (kills-per-level accounting), far
 * more than one blaster-killed ghost pays, so the level-up mechanics are
 * exercised through `grantXp` directly — the same path `killEnemy` routes a
 * kill's XP through.
 */
function dingToLevel2() {
  const state = startGame();
  clearStage(state);
  grantXp(state, xpToLevelUp(1));
  return state;
}

describe("xp", () => {
  it("is proportional to the mob's LEVEL, not its hp", () => {
    // Same monster level, different hp: a tank and a squishy pay the SAME xp —
    // kill xp keys off the level, never the health bar. (mlvl 3 keeps the
    // reward under the tiny level-1 threshold, so no ding muddies the read.)
    const squishy = killGhostWorth(20, 3);
    const tank = killGhostWorth(50, 3);
    const atThree = Math.round(mobLevelXp(3, 1));
    expect(squishy.stats.xpGained).toBe(atThree);
    expect(tank.stats.xpGained).toBe(atThree);
    expect(squishy.player.xp).toBe(squishy.stats.xpGained); // below the threshold

    // A higher-level mob pays more, its hp held equal to the squishy above.
    const hotter = killGhostWorth(20, 12);
    expect(hotter.stats.xpGained).toBe(Math.round(mobLevelXp(12, 1)));
    expect(hotter.stats.xpGained).toBeGreaterThan(atThree);
  });

  it("levels up at the threshold, celebrates, then pauses on a stat point", () => {
    const state = dingToLevel2();
    expect(state.player.level).toBe(2);
    expect(state.player.pendingStatPoints).toBe(1);
    // The ding does NOT pause the run on the spot: the celebration window
    // (the golden burn + fanfare) is armed and burns down first.
    expect(state.phase).toBe("playing");
    expect(state.levelUpFxMs).toBe(LEVELING.dingCelebrationMs);
    expect(state.events).toContainEqual({
      type: "levelUp",
      level: 2,
      gains: levelStatGains(2),
    });
    // The next level costs more.
    expect(state.player.xpToNext).toBe(xpToLevelUp(2));
    expect(xpToLevelUp(2)).toBeGreaterThan(xpToLevelUp(1));

    // The chooser opens only once the celebration has burned down.
    runUntilChooser(state);
    expect(state.levelUpFxMs).toBe(0);
    expect(state.phase).toBe("levelup");

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
    const state = startGame();
    clearStage(state);
    // 10 XP into level 3: one grant crossing both thresholds at once.
    grantXp(state, xpToLevelUp(1) + xpToLevelUp(2) + 10);
    expect(state.player.level).toBe(3);
    expect(state.player.pendingStatPoints).toBe(2);
    runUntilChooser(state); // burn the celebration down
    expect(state.phase).toBe("levelup");
    allocateStat(state, "stamina");
    expect(state.phase).toBe("levelup"); // one point still pending
    allocateStat(state, "dexterity");
    expect(state.phase).toBe("playing");
  });
});

describe("golden-arrow XP share tapers with level", () => {
  it("pays the full base share at level 1 and decays harmonically after", () => {
    // Level 1 is the base share, untapered.
    expect(arrowXpShareAt(1)).toBeCloseTo(LEVELING.arrowXpShare);
    // The harmonic law: share / (1 + taper × (L−1)).
    expect(arrowXpShareAt(11)).toBeCloseTo(
      LEVELING.arrowXpShare / (1 + LEVELING.arrowXpShareTaper * 10),
    );
    // Monotonically down: every level pays a thinner slice of its own bar…
    expect(arrowXpShareAt(20)).toBeLessThan(arrowXpShareAt(5));
    expect(arrowXpShareAt(99)).toBeLessThan(arrowXpShareAt(20));
    // …but never negative or zero — an arrow always pays something.
    expect(arrowXpShareAt(99)).toBeGreaterThan(0);
    // A level floor: absurd inputs clamp to the level-1 share, never blow up.
    expect(arrowXpShareAt(0)).toBeCloseTo(LEVELING.arrowXpShare);
  });
});

describe("per-tier leveling slowdown", () => {
  it("compounds the level cost 25% per difficulty tier above the bottom lanes", () => {
    // Bottom lanes (easy/medium/hard) share tier 0 — no slowdown.
    expect(tierLevelCostMult("easy")).toBe(1);
    expect(tierLevelCostMult("medium")).toBe(1);
    expect(tierLevelCostMult("hard")).toBe(1);
    // nightmare (tier 1) and jesus (tier 2) compound the step.
    const step = LEVELING.tierLevelCostStep;
    expect(tierLevelCostMult("nightmare")).toBeCloseTo(1 + step);
    expect(tierLevelCostMult("jesus")).toBeCloseTo((1 + step) ** 2);
    // No difficulty (the bare curve) is tier 0.
    expect(tierLevelCostMult()).toBe(1);
  });

  it("makes a level cost more on harder difficulties (below the endgame wall)", () => {
    const base = xpToLevelUp(30);
    expect(xpToLevelUp(30, "medium")).toBe(base); // bottom = bare curve
    expect(xpToLevelUp(30, "nightmare")).toBe(
      Math.round(base * tierLevelCostMult("nightmare")),
    );
    expect(xpToLevelUp(30, "jesus")).toBeGreaterThan(
      xpToLevelUp(30, "nightmare"),
    );
  });

  it("scales the slowdown with the runtime BALANCE knob", () => {
    const shipped = tierLevelCostMult("nightmare");
    setBalanceTuning({ levelingSlowdown: 0 });
    expect(tierLevelCostMult("nightmare")).toBe(1); // knob off → no slowdown
    setBalanceTuning({ levelingSlowdown: 2 });
    expect(tierLevelCostMult("nightmare")).toBeCloseTo(
      1 + LEVELING.tierLevelCostStep * 2,
    );
    resetBalanceTuning();
    expect(tierLevelCostMult("nightmare")).toBeCloseTo(shipped);
  });
});

describe("endgame steepening wall", () => {
  it("is neutral up to the threshold, then compounds per level past it", () => {
    expect(endgameSteepenMult(LEVELING.endgameSteepenFrom)).toBe(1);
    expect(endgameSteepenMult(LEVELING.endgameSteepenFrom - 5)).toBe(1);
    // One level past the threshold pays exactly (1 + rate).
    expect(endgameSteepenMult(LEVELING.endgameSteepenFrom + 1)).toBeCloseTo(
      1 + LEVELING.endgameSteepenRate,
    );
    // It compounds: deeper levels wall up geometrically.
    expect(endgameSteepenMult(LEVELING.endgameSteepenFrom + 10)).toBeCloseTo(
      (1 + LEVELING.endgameSteepenRate) ** 10,
    );
    expect(endgameSteepenMult(99)).toBeGreaterThan(
      endgameSteepenMult(LEVELING.endgameSteepenFrom + 1),
    );
  });

  it("steepens the level curve past the threshold and scales with its knob", () => {
    const from = LEVELING.endgameSteepenFrom;
    // A level past the wall costs strictly more than the bare geometric would.
    expect(xpToLevelUp(from + 8)).toBeGreaterThan(xpToLevelUp(from));
    setBalanceTuning({ endgameSteepen: 0 });
    expect(endgameSteepenMult(from + 8)).toBe(1); // knob off → pure geometric tail
    resetBalanceTuning();
  });
});

describe("hard-capped horde level (fixture difficulties are uncapped)", () => {
  it("clamps into the difficulty's [min, max] band", () => {
    // The fixture rungs carry a wide [1, 999] band (no clamp), so mobLevelFor
    // is the bare player+offset here; the SHIPPED per-difficulty caps (easy
    // 1–34, nightmare 38–56, …) and their hp/XP effects are asserted against
    // the real catalog in tests/content/difficulty_caps_test.ts.
    expect(mobLevelFor(10, "medium")).toBe(8); // player − 2, unclamped
    expect(mobLevelFor(1, "medium")).toBe(1); // floored at 1
  });
});

describe("WoW-style level-difference XP", () => {
  it("is neutral at the hero's level, a bonus above, a penalty below", () => {
    expect(levelDiffXpMult(30, 30)).toBe(1); // same level → neutral
    expect(levelDiffXpMult(34, 30)).toBeCloseTo(
      1 + 4 * LEVELING.xpAbovePlayerPerLevel,
    );
    expect(levelDiffXpMult(24, 30)).toBeCloseTo(
      1 - 6 * LEVELING.xpBelowPlayerPerLevel,
    );
  });

  it("bottoms out at ZERO for a grey mob and caps the above bonus", () => {
    // Far enough below → the grey mob pays nothing (never negative).
    const grey = 30 - Math.ceil(1 / LEVELING.xpBelowPlayerPerLevel) - 1;
    expect(levelDiffXpMult(grey, 30)).toBe(0);
    // Far above → capped at the ceiling multiplier.
    expect(levelDiffXpMult(99, 1)).toBe(LEVELING.xpAboveMaxMult);
  });

  it("leaves a same-level reference mob (the curve anchor) untouched", () => {
    // referenceMobXp uses mobLevelXp(L, L) → diff 0 → ×1, so the kills-per-level
    // curve is unchanged by the multiplier.
    expect(levelDiffXpMult(20, 20)).toBe(1);
  });

  it("flattens when the REST XP knob is off", () => {
    setBalanceTuning({ restXp: 0 });
    expect(levelDiffXpMult(24, 30)).toBe(1);
    expect(levelDiffXpMult(40, 30)).toBe(1);
    resetBalanceTuning();
  });
});

describe("the ding: automatic base gains and the celebration window", () => {
  // Auto-stat growth is an experimental, opt-in feature (OFF by engine default);
  // this block exercises it, so turn it on and restore the default after each.
  beforeEach(() => setAutoStatGainsEnabled(true));
  afterEach(() => setAutoStatGainsEnabled(false));

  it("each ding grants automatic base stats whose size scales with the level", () => {
    // The per-ding gain is the configured rate × the new level, rounded…
    expect(autoGainAt(2, "stamina")).toBe(
      Math.round(LEVELING.autoGainsPerLevel.stamina * 2),
    );
    // …so a later ding pays more than an early one.
    expect(autoGainAt(12, "stamina")).toBeGreaterThan(autoGainAt(2, "stamina"));
    // The cumulative bonus is every ding summed from level 2 up.
    let sum = 0;
    for (let l = 2; l <= 6; l++) sum += autoGainAt(l, "strength");
    expect(baseStatBonus(6, "strength")).toBe(sum);
    // Stats off the auto-growth list never grow on their own.
    expect(baseStatBonus(20, "luck")).toBe(0);
    // A level-1 hero has banked nothing.
    expect(baseStatBonus(1, "stamina")).toBe(0);
  });

  it("auto gains raise effective stats and the pools without touching chosen points", () => {
    const state = dingToLevel2(); // ding to level 2
    // The chosen-points record is untouched — the growth is derived…
    expect(state.player.stats.stamina).toBe(0);
    // …but the effective stat carries it.
    expect(effectiveStat(state, "stamina")).toBe(baseStatBonus(2, "stamina"));
    // The deeper pools landed with the ding (and the ding heals to full).
    expect(state.player.maxHp).toBe(
      PLAYER.maxHp + effectiveStat(state, "stamina") * STAMINA.hpPerPoint,
    );
    expect(state.player.hp).toBe(state.player.maxHp);
    expect(state.player.maxStamina).toBe(
      STAMINA.base + effectiveStat(state, "stamina") * STAMINA.maxPerPoint,
    );
  });

  it("a respec refunds only the CHOSEN points — never the automatic growth", () => {
    const state = dingToLevel2(); // 1 pending point
    runUntilChooser(state);
    allocateStat(state, "luck");
    beginRespec(state);
    // The pool holds exactly the chosen point; the auto gains stay derived.
    expect(state.player.pendingStatPoints).toBe(1);
    expect(effectiveStat(state, "stamina")).toBe(baseStatBonus(2, "stamina"));
  });

  it("the horde's hp answers the free damage growth — no one-hit-kill drift", () => {
    const state = startGame();
    const hitsToKill = (level: number) => {
      state.player.level = level;
      const mobHp = 20 * mobHpScaleFor(level, state.difficulty);
      return Math.ceil(mobHp / weaponDamage(state));
    };
    // The automatic gains alone never shrink the hits a mob takes: the hp
    // scale rides the same curve (autoPowerScale) the free stats produce.
    expect(hitsToKill(12)).toBeGreaterThanOrEqual(hitsToKill(1));
    // And the compensation is exact by construction: stripped of the auto
    // curve, the ladder is the geometric hp-by-level factor. Read at level 45,
    // inside nightmare's [38, 56] mob-level band, so the horde tracks the hero
    // (offset 0) rather than sitting on the tier's floor.
    expect(mobHpScaleFor(45, "nightmare") / autoPowerScale(45)).toBeCloseTo(
      mobHpLevelFactor(45),
      10,
    );
  });

  it("the developer flag switches the free growth AND its mob compensation off together", () => {
    try {
      setAutoStatGainsEnabled(false);
      // No stat grows on its own, at any level…
      expect(autoGainAt(12, "stamina")).toBe(0);
      expect(baseStatBonus(20, "strength")).toBe(0);
      // …the ding readout is empty…
      expect(levelStatGains(5)).toEqual([]);
      // …the hero's effective stat is just his chosen points…
      const state = dingToLevel2(); // ding to level 2
      expect(effectiveStat(state, "stamina")).toBe(state.player.stats.stamina);
      // …and the horde's hp scale drops the compensating curve in lockstep, so
      // the ladder is the bare linear ramp (autoPowerScale collapses to 1).
      // Read at level 45, inside nightmare's [38, 56] band (offset 0 tracks).
      expect(autoPowerScale(45)).toBe(1);
      expect(mobHpScaleFor(45, "nightmare")).toBeCloseTo(
        mobHpLevelFactor(45),
        10,
      );
    } finally {
      setAutoStatGainsEnabled(true);
    }
    // Restored: the growth is back for the rest of the suite.
    expect(autoGainAt(12, "stamina")).toBeGreaterThan(0);
  });

  it("xp gained during the celebration window never yanks the chooser open early", () => {
    const state = dingToLevel2(); // window armed
    expect(state.phase).toBe("playing");
    // More xp lands mid-celebration (below the next threshold): still playing.
    grantXp(state, 1);
    expect(state.phase).toBe("playing");
    runUntilChooser(state);
    expect(state.phase).toBe("levelup");
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

    // STRENGTH scales the damage of physical weapons — ranged here, and melee —
    // by its own (steeper) per-point slope.
    state.player.stats.strength = 2;
    expect(weaponDamage(state)).toBeCloseTo(
      base * (1 + 2 * STATS.damageBonusPerPoint.strength),
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
      // At the def's levelReq the ITEM-LEVEL damage term is 1, so this test
      // isolates the class-stat scaling it is about.
      ilvl: 1,
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

    // INT (the wand's own class stat) does, by INT's per-point slope.
    state.player.stats.intelligence = 3;
    expect(weaponDamageFor(state, wand)).toBeCloseTo(
      wandDef.damage *
        WEAPON.damageMult *
        (1 + 3 * STATS.damageBonusPerPoint.intelligence),
    );

    // A damagePct affix stacks into the same multiplier.
    wand.affixes = [{ kind: "damagePct", value: 0.5 }];
    expect(weaponDamageFor(state, wand)).toBeCloseTo(
      wandDef.damage *
        WEAPON.damageMult *
        (1 + 3 * STATS.damageBonusPerPoint.intelligence + 0.5),
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
      ilvl: 5,
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
    // The raw stat sum bends toward `critCap` via `saturateToward`, so the
    // expected value runs through the same saturation the getter applies.
    state.player.stats.dexterity = 4;
    state.player.stats.intelligence = 7;
    const crit = (linear: number) => saturateToward(linear, STATS.critCap);
    expect(playerCritChance(state, "melee")).toBeCloseTo(
      crit(STATS.baseCritChance + 4 * STATS.critChancePerStat),
    );
    expect(playerCritChance(state, "ranged")).toBeCloseTo(
      crit(STATS.baseCritChance + 4 * STATS.critChancePerStat),
    );
    // A magic swing rides INT instead (DEX leaves it alone).
    expect(playerCritChance(state, "magic")).toBeCloseTo(
      crit(STATS.baseCritChance + 7 * STATS.critChancePerStat),
    );

    // LUCK adds a MARGINAL crit on top of whichever stat governs — a quarter
    // of a primary point, so it never replaces the class stat.
    state.player.stats.luck = 3;
    expect(playerCritChance(state, "melee")).toBeCloseTo(
      crit(
        STATS.baseCritChance +
          4 * STATS.critChancePerStat +
          3 * STATS.critChancePerLuck,
      ),
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
    // Pin the rng mid-band: above the (DEX-trimmed) miss/dodge chances so the
    // shot lands, below the saturated crit chance (~0.79 at DEX 40) so it
    // always crits — deterministic regardless of the seeded stream position.
    state.rng = () => 0.5;
    state.enemies.push(
      makeEnemy({
        pos: { x: state.player.pos.x + 60, y: state.player.pos.y },
        hp: 1_000_000,
        maxHp: 1_000_000,
        mlvl: 1, // a level-1 mob carries ~no armor, so we measure pure crit
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
    // The linear inputs bend toward `DODGE.max` via `saturateToward`, so the
    // expected value runs through the same saturation the getter applies.
    state.player.stats.dexterity = 4;
    state.player.stats.luck = 6;
    expect(playerDodgeChance(state)).toBeCloseTo(
      saturateToward(
        DODGE.base + 4 * DODGE.perDex + 6 * DODGE.perLuck,
        DODGE.max,
      ),
    );
    expect(DODGE.perLuck).toBeCloseTo(DODGE.perDex / 4);
    // Saturates toward the cap so no build becomes untouchable: a huge DEX pile
    // crawls right up to `DODGE.max` but never reaches (let alone exceeds) it.
    state.player.stats.dexterity = 1000;
    const maxed = playerDodgeChance(state);
    expect(maxed).toBeLessThan(DODGE.max);
    expect(maxed).toBeGreaterThan(DODGE.max * 0.9);
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
      ilvl: 5,
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
