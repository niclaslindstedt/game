// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The difficulty ladder: harder settings spawn more monsters with more hp,
// stretch the wave spawner's live cap, and pay the risk back with more
// frequent drops and higher-tier gear (nightmare+ unlocks epic/legendary on
// levels whose own loot table caps lower).

import { describe, expect, it } from "vitest";

import {
  createGame,
  DIFFICULTY_ORDER,
  difficultyDef,
  dismissIntro,
  dropChance,
  enemyDef,
  levelDef,
  rollEquipment,
  scaledMobCount,
  step,
} from "@game/core";
import type { Difficulty, GameState, Tier } from "@game/core";
import { DT, idle, SEED } from "./helpers.ts";

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
    expect(medium.mobHpMult).toBe(1);
    expect(medium.aliveMult).toBe(1);
    expect(medium.dropChanceBonus).toBe(0);
    expect(medium.tierChanceBonus).toEqual({});
  });

  it("escalates monsters and loot monotonically up the ladder", () => {
    for (let i = 1; i < DIFFICULTY_ORDER.length; i++) {
      const prev = difficultyDef(DIFFICULTY_ORDER[i - 1] as Difficulty);
      const next = difficultyDef(DIFFICULTY_ORDER[i] as Difficulty);
      expect(next.mobCountMult).toBeGreaterThan(prev.mobCountMult);
      expect(next.mobHpMult).toBeGreaterThan(prev.mobHpMult);
      expect(next.aliveMult).toBeGreaterThan(prev.aliveMult);
      expect(next.dropChanceBonus).toBeGreaterThanOrEqual(prev.dropChanceBonus);
      expect(next.tierChanceBonus.magic ?? 0).toBeGreaterThanOrEqual(
        prev.tierChanceBonus.magic ?? 0,
      );
    }
  });

  it("throws loudly on a broken id", () => {
    expect(() => difficultyDef("impossible" as Difficulty)).toThrow(
      /unknown difficulty/,
    );
  });

  it("never rounds a non-empty spawn line down to zero", () => {
    expect(scaledMobCount(1, "easy")).toBe(1);
    expect(scaledMobCount(0, "jesus")).toBe(0);
    expect(scaledMobCount(100, "jesus")).toBe(260);
  });
});

describe("difficulty scaling in a run", () => {
  it("defaults to medium and matches the level's raw numbers", () => {
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

  it("scales every monster's hp, bosses included", () => {
    const medium = startOn("medium");
    const nightmare = startOn("nightmare");
    const mult = difficultyDef("nightmare").mobHpMult;

    const mediumBoss = medium.enemies.find((e) => isBoss(e.defId))!;
    const nightmareBoss = nightmare.enemies.find((e) => isBoss(e.defId))!;
    expect(nightmareBoss.maxHp).toBe(Math.round(mediumBoss.maxHp * mult));

    for (const enemy of nightmare.enemies) {
      expect(enemy.maxHp).toBe(Math.round(enemyDef(enemy.defId).hp * mult));
    }
  });

  it("eases monsters down below the baseline on easy", () => {
    const easy = startOn("easy");
    const medium = startOn("medium");
    expect(easy.enemies.length).toBeLessThan(medium.enemies.length);
    expect(easy.stats.totalEnemies).toBeLessThan(medium.stats.totalEnemies);
    const easyGhost = easy.enemies.find((e) => e.defId === "test_minion");
    expect(easyGhost?.maxHp).toBe(
      Math.round(enemyDef("test_minion").hp * difficultyDef("easy").mobHpMult),
    );
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

  it("unlocks epic and legendary tiers the moon alone never rolls", () => {
    const mediumTiers = new Set<Tier>();
    const jesusTiers = new Set<Tier>();
    const medium = startOn("medium");
    const jesus = startOn("jesus");
    for (let i = 0; i < 600; i++) {
      mediumTiers.add(rollEquipment(medium).tier);
      jesusTiers.add(rollEquipment(jesus).tier);
    }
    // The moon's own loot table caps at magic…
    expect(mediumTiers.has("epic")).toBe(false);
    expect(mediumTiers.has("legendary")).toBe(false);
    // …but JESUS CHRIST! pays for its horde in epics and legendaries.
    expect(jesusTiers.has("epic")).toBe(true);
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
