// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The difficulty ladder: a rung turns a whole rack of knobs at once — the
// hero's opening kit (starting weapon + stat head-start), the horde's count
// and RELATIVE level, the drop economy (medkits/armor/powerups thin out, the
// tier and unique slices sweeten), the stamina burn, and how touchy the
// rampage meter is. MEDIUM is the exact 1.0 baseline the levels are tuned at.

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  autoPowerScale,
  createGame,
  DIFFICULTY_ORDER,
  difficultyDef,
  dismissIntro,
  dropChance,
  enemyDef,
  enemyDodgeChance,
  isBetterEquipment,
  levelDef,
  MENACE,
  mobHpScaleFor,
  PLAYER,
  playerDodgeChance,
  playerMissChance,
  registerDefs,
  rollEquipment,
  scaledMobCount as scaled,
  STAMINA,
  step,
  weaponDef,
} from "@game/core";
import type { Difficulty, GameState, Item, Tier } from "@game/core";
import { FIX_DIFFICULTIES, FIX_LEVEL, installFixtures } from "./fixtures.ts";
import { clearStage, DT, idle, SEED, steerTo } from "./helpers.ts";

const WAVES = levelDef("test_level").waves!;

function startOn(difficulty: Difficulty): GameState {
  const state = createGame(SEED, "test_level", difficulty);
  dismissIntro(state);
  return state;
}

const isBoss = (defId: string) => enemyDef(defId).role === "boss";
const isMinion = (defId: string) => enemyDef(defId).role === "minion";

describe("difficulty catalog", () => {
  it("registers every ladder entry, gentlest first", () => {
    expect(DIFFICULTY_ORDER).toEqual([
      "easy",
      "medium",
      "hard",
      "nightmare",
      "jesus",
    ]);
    DIFFICULTY_ORDER.forEach((id, i) => {
      expect(difficultyDef(id).id).toBe(id);
      expect(difficultyDef(id).index).toBe(i + 1);
    });
  });

  it("keeps MEDIUM as the exact 1.0 baseline the levels are tuned at", () => {
    const medium = difficultyDef("medium");
    expect(medium.mobCountMult).toBe(1);
    expect(medium.aliveMult).toBe(1);
    expect(medium.dropChanceBonus).toBe(0);
    expect(medium.medkitDropMult).toBe(1);
    expect(medium.armorDropMult).toBe(1);
    expect(medium.powerupDropMult).toBe(1);
    expect(medium.arrowDropMult).toBe(1);
    expect(medium.uniqueDropChance).toBe(0);
    expect(medium.staminaDrainMult).toBe(1);
    expect(medium.menaceDecayMult).toBe(1);
    expect(medium.menaceEffectMult).toBe(1);
    expect(medium.playerDodgeMult).toBe(1);
    expect(medium.playerMissMult).toBe(1);
    expect(medium.enemyDodgeMult).toBe(1);
    expect(medium.startingStats).toEqual({});
    expect(medium.tierChanceBonus).toEqual({});
  });

  it("escalates the horde monotonically up the ladder", () => {
    for (let i = 1; i < DIFFICULTY_ORDER.length; i++) {
      const prev = difficultyDef(DIFFICULTY_ORDER[i - 1] as Difficulty);
      const next = difficultyDef(DIFFICULTY_ORDER[i] as Difficulty);
      expect(next.mobCountMult).toBeGreaterThan(prev.mobCountMult);
      expect(next.mobLevelOffset).toBeGreaterThan(prev.mobLevelOffset);
      expect(next.aliveMult).toBeGreaterThan(prev.aliveMult);
      expect(next.menaceMult).toBeGreaterThan(prev.menaceMult);
      // The meter also cools slower and lands harder on the mobs.
      expect(next.menaceDecayMult).toBeLessThanOrEqual(prev.menaceDecayMult);
      expect(next.menaceEffectMult).toBeGreaterThanOrEqual(
        prev.menaceEffectMult,
      );
    }
  });

  it("thins the survival economy and sweetens the reward up the ladder", () => {
    for (let i = 1; i < DIFFICULTY_ORDER.length; i++) {
      const prev = difficultyDef(DIFFICULTY_ORDER[i - 1] as Difficulty);
      const next = difficultyDef(DIFFICULTY_ORDER[i] as Difficulty);
      expect(next.medkitDropMult).toBeLessThan(prev.medkitDropMult);
      expect(next.armorDropMult).toBeLessThan(prev.armorDropMult);
      expect(next.powerupDropMult).toBeLessThan(prev.powerupDropMult);
      // Golden arrows thin out too (easy and medium share the 1.0 baseline, so
      // this is non-increasing, not strictly down).
      expect(next.arrowDropMult).toBeLessThanOrEqual(prev.arrowDropMult);
      // JESUS deliberately burns no faster than nightmare — kiting country.
      expect(next.staminaDrainMult).toBeGreaterThanOrEqual(
        prev.staminaDrainMult,
      );
      // Reflexes fade and blows land less as the ladder climbs.
      expect(next.playerDodgeMult).toBeLessThan(prev.playerDodgeMult);
      expect(next.playerMissMult).toBeGreaterThan(prev.playerMissMult);
      expect(next.enemyDodgeMult).toBeGreaterThan(prev.enemyDodgeMult);
      expect(next.dropChanceBonus).toBeGreaterThanOrEqual(prev.dropChanceBonus);
      expect(next.uniqueDropChance).toBeGreaterThanOrEqual(
        prev.uniqueDropChance,
      );
      expect(next.tierChanceBonus.magic ?? 0).toBeGreaterThanOrEqual(
        prev.tierChanceBonus.magic ?? 0,
      );
      expect(next.tierChanceBonus.legendary ?? 0).toBeGreaterThanOrEqual(
        prev.tierChanceBonus.legendary ?? 0,
      );
    }
  });

  it("throws loudly on a broken id", () => {
    expect(() => difficultyDef("impossible" as Difficulty)).toThrow(
      /unknown difficulty/,
    );
  });

  it("never rounds a non-empty spawn line down to zero", () => {
    expect(scaled(1, "easy")).toBe(1);
    expect(scaled(0, "jesus")).toBe(0);
    expect(scaled(100, "jesus")).toBe(180);
  });
});

describe("the horde's relative level (mobLevelOffset)", () => {
  it("scales hp per level off the baseline, keyed to the player's level", () => {
    // NIGHTMARE matches the hero: catalog hp at player level 1 (no automatic
    // gains have landed yet, so autoPowerScale(1) is 1 and drops out).
    expect(mobHpScaleFor(1, "nightmare")).toBe(1);
    // EASY fields mobs three levels under a level-1 hero: −4 × 8%.
    expect(mobHpScaleFor(1, "easy")).toBeCloseTo(0.76, 10);
    expect(mobHpScaleFor(1, "medium")).toBeCloseTo(0.84, 10);
    // JESUS stays two levels ahead however far the hero climbs.
    expect(mobHpScaleFor(1, "jesus")).toBeCloseTo(1.16, 10);
    expect(mobHpScaleFor(5, "jesus")).toBeCloseTo(1.48 * autoPowerScale(5), 10);
    // The gap is CONSTANT once the automatic-growth curve is factored out:
    // relative to what leveling hands the hero for free (autoPowerScale),
    // leveling shifts every rung by the same 8%.
    expect(
      mobHpScaleFor(6, "easy") / autoPowerScale(6) -
        mobHpScaleFor(5, "easy") / autoPowerScale(5),
    ).toBeCloseTo(MENACE.mobHpPerLevel, 10);
  });

  it("stamps placed monsters (bosses included) with the level-1 scale", () => {
    const nightmare = startOn("nightmare");
    const jesus = startOn("jesus");

    const nightmareBoss = nightmare.enemies.find((e) => isBoss(e.defId))!;
    expect(nightmareBoss.maxHp).toBe(
      Math.round(
        enemyDef(nightmareBoss.defId).hp * mobHpScaleFor(1, "nightmare"),
      ),
    );
    for (const enemy of jesus.enemies) {
      expect(enemy.maxHp).toBe(
        Math.round(enemyDef(enemy.defId).hp * mobHpScaleFor(1, "jesus")),
      );
    }
  });

  it("eases monsters down below the baseline on easy", () => {
    const easy = startOn("easy");
    const medium = startOn("medium");
    expect(easy.enemies.length).toBeLessThan(medium.enemies.length);
    expect(easy.stats.totalEnemies).toBeLessThan(medium.stats.totalEnemies);
    const easyGhost = easy.enemies.find((e) => e.defId === "test_minion");
    expect(easyGhost?.maxHp).toBe(
      Math.round(enemyDef("test_minion").hp * mobHpScaleFor(1, "easy")),
    );
  });
});

describe("difficulty scaling in a run", () => {
  it("defaults to medium and matches the level's raw spawn counts", () => {
    const state = createGame(SEED, "test_level");
    expect(state.difficulty).toBe("medium");
    const budget = WAVES.budget.reduce((sum, e) => sum + e.count, 0);
    expect(state.stats.totalEnemies).toBe(state.enemies.length + budget);
  });

  it("spawns more placed monsters and a bigger wave budget on harder", () => {
    const medium = startOn("medium");
    const jesus = startOn("jesus");
    expect(jesus.enemies.length).toBeGreaterThan(medium.enemies.length);
    expect(jesus.stats.totalEnemies).toBeGreaterThan(medium.stats.totalEnemies);
  });

  it("stretches the live cap so the harder horde actually crowds in", () => {
    const state = startOn("jesus");
    state.stats.timeMs = WAVES.rampDurationMs; // the whole budget is due
    state.player.z = 100; // untouchable, so the run can't end mid-check
    step(state, idle, DT);
    const minions = state.enemies.filter((e) => isMinion(e.defId)).length;
    expect(minions).toBe(
      Math.round(WAVES.maxAlive * difficultyDef("jesus").aliveMult),
    );
  });

  it("raises the drop chance with difficulty", () => {
    const medium = startOn("medium");
    const jesus = startOn("jesus");
    expect(dropChance(jesus)).toBeCloseTo(
      dropChance(medium) + difficultyDef("jesus").dropChanceBonus,
      10,
    );
  });

  it("unlocks unique and legendary tiers the base chances never roll", () => {
    const mediumTiers = new Set<Tier>();
    const jesusTiers = new Set<Tier>();
    const medium = startOn("medium");
    const jesus = startOn("jesus");
    // Past every monster-level gate (LOOT.tierUnlockMlvl), so the roll is
    // purely about the chances — the gates have their own suite.
    medium.player.level = 40;
    jesus.player.level = 40;
    for (let i = 0; i < 600; i++) {
      mediumTiers.add(rollEquipment(medium).tier);
      jesusTiers.add(rollEquipment(jesus).tier);
    }
    // MEDIUM carries no tier bonus, so the top tiers stay at their zero
    // base chance…
    expect(mediumTiers.has("unique")).toBe(false);
    expect(mediumTiers.has("legendary")).toBe(false);
    // …but JESUS CHRIST! pays for its horde in uniques and legendaries.
    expect(jesusTiers.has("unique")).toBe(true);
    expect(jesusTiers.has("legendary")).toBe(true);
  });

  it("stays deterministic per (seed, difficulty)", () => {
    const a = startOn("nightmare");
    const b = startOn("nightmare");
    expect(a.enemies.map((e) => ({ ...e }))).toEqual(
      b.enemies.map((e) => ({ ...e })),
    );
  });
});

describe("the opening kit (startingWeapon / startingStats)", () => {
  it("mints the difficulty's starting weapon, breakable, in hand", () => {
    const easy = startOn("easy");
    expect(easy.player.equipment.weapon.defId).toBe(
      difficultyDef("easy").startingWeapon,
    );
    expect(easy.player.equipment.weapon.durability).toBe(
      weaponDef(difficultyDef("easy").startingWeapon).durability,
    );
    const medium = startOn("medium");
    expect(medium.player.equipment.weapon.defId).toBe(
      difficultyDef("medium").startingWeapon,
    );
  });

  it("swaps off the starting weapon only for a genuinely better find", () => {
    // No pickup floor anymore: weaponScore (the damage-budget model — AoE
    // targets and crit weight folded in) decides, so a weak sidearm no
    // longer supplants a decent wall weapon just for being loot.
    const easy = startOn("easy");
    const weak = {
      id: 999,
      defId: "test_pistol", // 7 dmg / 400 ms, single target
      slot: "weapon" as const,
      tier: "regular" as const,
      ilvl: 1,
      affixes: [],
      durability: 10,
    };
    expect(isBetterEquipment(easy, weak)).toBe(false);
    const strong = {
      id: 998,
      defId: "test_hammer", // 34 dmg / 640 ms — clearly out-scores the wand
      slot: "weapon" as const,
      tier: "regular" as const,
      ilvl: 1,
      affixes: [],
      durability: 120,
    };
    expect(isBetterEquipment(easy, strong)).toBe(true);
  });

  it("banks the difficulty's stat head-start and recomputes the pools", () => {
    const easy = startOn("easy");
    expect(easy.player.stats).toEqual({
      stamina: 1,
      strength: 1,
      dexterity: 1,
      intelligence: 1,
      speed: 0,
      luck: 0,
    });
    // STAMINA's point deepens both pools; STRENGTH's widens the bag.
    expect(easy.player.maxHp).toBe(PLAYER.maxHp + STAMINA.hpPerPoint);
    expect(easy.player.hp).toBe(easy.player.maxHp);
    expect(easy.player.maxStamina).toBe(STAMINA.base + STAMINA.maxPerPoint);
    expect(easy.player.stamina).toBe(easy.player.maxStamina);
    expect(easy.player.inventory.length).toBe(4);

    const medium = startOn("medium");
    expect(medium.player.stats.stamina).toBe(0);
    expect(medium.player.maxHp).toBe(PLAYER.maxHp);
  });
});

describe("dodge and miss (playerDodgeMult / playerMissMult / enemyDodgeMult)", () => {
  it("fades the hero's reflexes and hit rate up the ladder", () => {
    const easy = startOn("easy");
    const jesus = startOn("jesus");
    // Cancel EASY's stat head start so only the multipliers differ.
    easy.player.stats.dexterity = 0;
    // The hero slips fewer enemy blows on the harder rungs…
    expect(playerDodgeChance(easy)).toBeGreaterThan(playerDodgeChance(jesus));
    // …whiffs his own swings more…
    expect(playerMissChance(easy)).toBeLessThan(playerMissChance(jesus));
    expect(playerMissChance(jesus)).toBeCloseTo(
      playerMissChance(startOn("medium")) *
        difficultyDef("jesus").playerMissMult,
      10,
    );
    // …and faces slipperier monsters.
    expect(enemyDodgeChance(easy, 0.05)).toBeLessThan(
      enemyDodgeChance(jesus, 0.05),
    );
  });
});

describe("stamina burn (staminaDrainMult)", () => {
  // Sprint flat-out on an empty stage and compare what's left in the pool.
  const sprint = (difficulty: Difficulty): number => {
    const state = startOn(difficulty);
    clearStage(state);
    state.waveSpawned = state.waveSpawned.map(() => 1e9); // truly quiet
    // Cancel EASY's head start so only the drain multiplier differs.
    state.player.stats.stamina = 0;
    state.player.maxStamina = STAMINA.base;
    state.player.stamina = STAMINA.base;
    for (let i = 0; i < 60; i++) {
      step(state, steerTo(state.player.pos.x + 500, state.player.pos.y), DT);
    }
    return state.player.stamina;
  };

  it("drains the sprint faster on the harder rungs", () => {
    const medium = sprint("medium");
    const nightmare = sprint("nightmare");
    expect(nightmare).toBeLessThan(medium);
    const mediumSpent = STAMINA.base - medium;
    const nightmareSpent = STAMINA.base - nightmare;
    expect(nightmareSpent / mediumSpent).toBeCloseTo(
      difficultyDef("nightmare").staminaDrainMult,
      5,
    );
    // JESUS burns no faster than nightmare — the legs stay for the kiting.
    expect(sprint("jesus")).toBeCloseTo(nightmare, 5);
  });
});

describe("the drop economy (medkit/powerup mults, the unique slice)", () => {
  // Feed the engine a scripted rng: the listed values are consumed in order,
  // then the fallback keeps everything else (crits, scatter) out of the way.
  const scriptRng = (state: GameState, values: number[], fallback = 0.99) => {
    let i = 0;
    state.rng = () => (i < values.length ? (values[i++] as number) : fallback);
  };

  // Kill the one adjacent minion via a real step so the drop rolls through
  // the actual loot path. Returns the items dropped.
  const killForLoot = (difficulty: Difficulty, rolls: number[]): Item[] => {
    const state = startOn(difficulty);
    clearStage(state);
    state.waveSpawned = state.waveSpawned.map(() => 1e9);
    // Keep plenty of minions "remaining" so the equipment pity rule stays out
    // of the way (owed <= remaining).
    for (let i = 0; i < 4; i++) {
      state.enemies.push({
        id: 9100 + i,
        defId: "test_minion",
        pos: { x: 40, y: 40 + i * 30 },
        home: { x: 40, y: 40 + i * 30 },
        hp: 45,
        maxHp: 45,
        mlvl: 99,
        speed: 0,
        contactCooldownMs: 0,
      });
    }
    const victim = {
      id: 9000,
      defId: "test_minion",
      pos: { x: state.player.pos.x + 20, y: state.player.pos.y },
      home: { x: state.player.pos.x + 20, y: state.player.pos.y },
      hp: 1,
      maxHp: 45,
      mlvl: 99,
      speed: 0,
      contactCooldownMs: 0,
    };
    state.enemies.push(victim);
    state.player.weaponCooldownMs = 0;
    scriptRng(state, rolls);
    step(state, idle, DT);
    expect(state.enemies.find((e) => e.id === 9000)).toBeUndefined();
    return state.items;
  };

  it("shrinks the medkit slice on the harder rungs", () => {
    // rolls: [miss (no), dodge (no), crit (no), drop gate (pass), nuke (no),
    // ladder]. 0.36 sits
    // inside MEDIUM's medkit window but past JESUS's shrunken one (the
    // powerup slice ahead of it shrinks too, which narrows the window from
    // both sides).
    const medium = killForLoot("medium", [0.9, 0.9, 0.9, 0.0, 0.9, 0.36]);
    expect(medium.some((i) => i.kind === "medkit")).toBe(true);
    const jesus = killForLoot("jesus", [0.9, 0.9, 0.9, 0.0, 0.9, 0.36]);
    expect(jesus.some((i) => i.kind === "medkit")).toBe(false);
    expect(jesus.some((i) => i.kind === "repair")).toBe(true);
  });

  it("keeps the unique slice a strict no-op while no uniquePool exists", () => {
    // JESUS has a live uniqueDropChance but the level ships no pool: the
    // same scripted rolls must land the same drops as a zero-chance rung —
    // not even a roll is drawn for the empty slice.
    const rolls = [0.9, 0.9, 0.9, 0.0, 0.9, 0.2];
    const medium = killForLoot("medium", rolls);
    const jesus = killForLoot("jesus", rolls);
    expect(medium.map((i) => i.kind)).toEqual(jesus.map((i) => i.kind));
  });
});

describe("unique drops and the hp floor (custom catalog)", () => {
  // A rung with a guaranteed unique slice and one with a bottomless level
  // deficit, plus a level that actually ships a unique pool — the plumbing
  // the shipped content doesn't exercise yet. Registered in beforeAll so the
  // swap only covers this block; afterAll reinstalls the stock fixtures.
  beforeAll(() =>
    registerDefs({
      difficulties: {
        ...FIX_DIFFICULTIES,
        test_unique: {
          ...(FIX_DIFFICULTIES.jesus as NonNullable<
            (typeof FIX_DIFFICULTIES)["jesus"]
          >),
          id: "test_unique",
          index: 6,
          uniqueDropChance: 1,
        },
        test_paper: {
          ...(FIX_DIFFICULTIES.easy as NonNullable<
            (typeof FIX_DIFFICULTIES)["easy"]
          >),
          id: "test_paper",
          index: 7,
          mobLevelOffset: -30,
        },
      },
      levels: {
        test_level: FIX_LEVEL,
        test_unique_level: {
          ...FIX_LEVEL,
          id: "test_unique_level",
          loot: { ...FIX_LEVEL.loot, uniquePool: ["test_hammer"] },
        },
      },
    }),
  );
  afterAll(() => installFixtures(true));

  it("floors the hp scale so a deep level deficit can't zero a mob out", () => {
    expect(mobHpScaleFor(1, "test_paper")).toBe(MENACE.mobHpScaleFloor);
  });

  it("draws a unique from the level's pool at the difficulty's chance", () => {
    const state = createGame(SEED, "test_unique_level", "test_unique");
    dismissIntro(state);
    clearStage(state);
    state.waveSpawned = state.waveSpawned.map(() => 1e9);
    for (let i = 0; i < 4; i++) {
      state.enemies.push({
        id: 9100 + i,
        defId: "test_minion",
        pos: { x: 40, y: 40 + i * 30 },
        home: { x: 40, y: 40 + i * 30 },
        hp: 45,
        maxHp: 45,
        mlvl: 99,
        speed: 0,
        contactCooldownMs: 0,
      });
    }
    state.enemies.push({
      id: 9000,
      defId: "test_minion",
      pos: { x: state.player.pos.x + 20, y: state.player.pos.y },
      home: { x: state.player.pos.x + 20, y: state.player.pos.y },
      hp: 1,
      maxHp: 45,
      mlvl: 99,
      speed: 0,
      contactCooldownMs: 0,
    });
    state.player.weaponCooldownMs = 0;
    // rolls: miss no, dodge no, crit no, drop gate pass, nuke no, unique
    // gate pass (chance 1), pool pick 0 → test_hammer.
    const rolls = [0.9, 0.9, 0.9, 0.0, 0.9, 0.0, 0.0];
    let i = 0;
    state.rng = () => (i < rolls.length ? (rolls[i++] as number) : 0.99);
    step(state, idle, DT);
    const dropped = state.items.find((item) => item.kind === "equipment");
    expect(dropped?.kind === "equipment" && dropped.equipment.defId).toBe(
      "test_hammer",
    );
  });
});

describe("difficulty-gated content (minDifficulty)", () => {
  // `test_gated_level` copies `test_level` and adds one placed spawn line and
  // one wave-budget line tagged `minDifficulty: "hard"`. Comparing the two
  // levels at the same difficulty isolates the gate from the mob multiplier.
  const placedCount = (levelId: string, difficulty: Difficulty) =>
    createGame(SEED, levelId, difficulty).enemies.length;

  it("omits a gated placed spawn on the rungs below its gate", () => {
    expect(placedCount("test_gated_level", "easy")).toBe(
      placedCount("test_level", "easy"),
    );
    expect(placedCount("test_gated_level", "medium")).toBe(
      placedCount("test_level", "medium"),
    );
  });

  it("adds the gated placed spawn from its gate up", () => {
    const extra =
      placedCount("test_gated_level", "hard") -
      placedCount("test_level", "hard");
    expect(extra).toBe(scaled(5, "hard"));
  });

  it("counts a gated wave line in totalEnemies only from the gate up", () => {
    const mediumDelta =
      createGame(SEED, "test_gated_level", "medium").stats.totalEnemies -
      createGame(SEED, "test_level", "medium").stats.totalEnemies;
    expect(mediumDelta).toBe(0);

    const hardDelta =
      createGame(SEED, "test_gated_level", "hard").stats.totalEnemies -
      createGame(SEED, "test_level", "hard").stats.totalEnemies;
    expect(hardDelta).toBe(scaled(5, "hard") + scaled(200, "hard"));
  });

  it("never streams a gated wave line below its gate", () => {
    // The gated line is last in a priority-ordered spawner, so the earlier
    // lines would saturate the live cap first; exhaust them so the gated line
    // is the only one left to spawn, then the gate is what decides.
    const gatedIdx =
      createGame(SEED, "test_gated_level").waveSpawned.length - 1;
    const ramped = (difficulty: Difficulty): GameState => {
      const state = createGame(SEED, "test_gated_level", difficulty);
      dismissIntro(state);
      for (let i = 0; i < gatedIdx; i++) state.waveSpawned[i] = 1e9;
      state.stats.timeMs = WAVES.rampDurationMs; // the gated line is due
      state.player.z = 100; // untouchable, so the run can't end mid-check
      step(state, idle, DT);
      return state;
    };
    expect(ramped("medium").waveSpawned[gatedIdx] ?? 0).toBe(0);
    expect(ramped("hard").waveSpawned[gatedIdx] ?? 0).toBeGreaterThan(0);
  });
});

describe("the prelude's per-difficulty variant (cutsceneVariant)", () => {
  it("opens the run on the rung's own scene when one is registered", () => {
    const jesus = createGame(SEED, "test_prelude_level", "jesus");
    expect(jesus.cutscene?.defId).toBe("test_prelude_jesus");
  });

  it("falls back to the base scene on rungs without a variant", () => {
    const medium = createGame(SEED, "test_prelude_level", "medium");
    expect(medium.cutscene?.defId).toBe("test_prelude");
    const easy = createGame(SEED, "test_prelude_level", "easy");
    expect(easy.cutscene?.defId).toBe("test_prelude");
  });
});
