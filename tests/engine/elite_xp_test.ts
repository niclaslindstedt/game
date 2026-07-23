// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// ELITE/BOSS XP is MOB-PRICED — a flat multiple of the set piece's own
// mob-level XP (`mobLevelXp(mlvl)` × XP_TUNING.eliteXpMobMult/bossXpMobMult,
// authored in content/leveling.yaml) — never a share of the hero's level bar,
// so the leveling table's kills-per-level stays true in play. Runs on the
// synthetic engine fixtures (`test_elite`, `test_boss`).

import { describe, expect, it } from "vitest";

import {
  enemyDef,
  enemyKillXp,
  hitEnemy,
  mobLevelXp,
  overkillEfficiency,
  XP_TUNING,
  xpToLevelUp,
} from "@game/core";
import type { GameEvent, GameState } from "@game/core";

import { clearStage, makeEnemy, startGame } from "./helpers.ts";

/** A state with the hero pinned at `level`; the rng never crits or rolls. */
function heroAt(level: number): GameState {
  const state = startGame();
  clearStage(state);
  state.rng = () => 0.99;
  state.player.level = level;
  state.player.xpToNext = xpToLevelUp(level);
  return state;
}

describe("enemyKillXp — elite/boss mob-mult rule", () => {
  it("an elite kill pays XP_TUNING.eliteXpMobMult × its mob-level XP", () => {
    const state = heroAt(20);
    const enemy = makeEnemy({ pos: { x: 0, y: 0 }, mlvl: 22 }, "test_elite");
    expect(enemyKillXp(state, enemyDef("test_elite"), enemy)).toBeCloseTo(
      XP_TUNING.eliteXpMobMult * mobLevelXp(22, 20),
    );
  });

  it("a boss kill pays XP_TUNING.bossXpMobMult × its mob-level XP", () => {
    const state = heroAt(20);
    const enemy = makeEnemy({ pos: { x: 0, y: 0 }, mlvl: 24 }, "test_boss");
    expect(enemyKillXp(state, enemyDef("test_boss"), enemy)).toBeCloseTo(
      XP_TUNING.bossXpMobMult * mobLevelXp(24, 20),
    );
  });

  it("bosses pay a bigger multiple than elites", () => {
    expect(XP_TUNING.bossXpMobMult).toBeGreaterThan(XP_TUNING.eliteXpMobMult);
  });

  it("the reward rides the mob-level unit — same multiple at any level", () => {
    const elite = enemyDef("test_elite");
    const low = enemyKillXp(
      heroAt(5),
      elite,
      makeEnemy({ pos: { x: 0, y: 0 }, mlvl: 5 }, "test_elite"),
    );
    const high = enemyKillXp(
      heroAt(50),
      elite,
      makeEnemy({ pos: { x: 0, y: 0 }, mlvl: 50 }, "test_elite"),
    );
    // Absolute XP grows with the mob level (the compounding mob unit)…
    expect(high).toBeGreaterThan(low);
    expect(high / low).toBeCloseTo(mobLevelXp(50, 50) / mobLevelXp(5, 5));
    // …and the MULTIPLE of the unit is the same both times.
    expect(low / mobLevelXp(5, 5)).toBeCloseTo(high / mobLevelXp(50, 50));
  });

  it("minions pay a LEVEL-based reward — the same xp whatever the hp", () => {
    const state = heroAt(20);
    // Two brutes of the same monster level but wildly different hp pay alike:
    // kill xp keys off `mobLevelXp(mlvl)`, never the health bar.
    const squishy = makeEnemy(
      { pos: { x: 0, y: 0 }, maxHp: 30, mlvl: 12 },
      "test_brute",
    );
    const tank = makeEnemy(
      { pos: { x: 0, y: 0 }, maxHp: 300, mlvl: 12 },
      "test_brute",
    );
    const expected = mobLevelXp(12, 20);
    expect(enemyKillXp(state, enemyDef("test_brute"), squishy)).toBe(expected);
    expect(enemyKillXp(state, enemyDef("test_brute"), tank)).toBe(expected);
  });
});

describe("mob-mult xp — end to end through the kill event", () => {
  it("an elite kill floats its mob-mult reward (times the overkill toll) as its popup", () => {
    const state = heroAt(20);
    const { x, y } = state.player.pos;
    // Pin the bar (powerScaled) so the engage-time power match leaves maxHp
    // alone; the deep-campaign hero one-shots it with a guaranteed crit, so the
    // popup is the mob-mult reward scaled by the overkill toll that big blow
    // earns.
    const enemy = makeEnemy(
      {
        id: state.nextId++,
        pos: { x: x + 30, y },
        hp: 150,
        maxHp: 150,
        mlvl: 20,
        powerScaled: true,
      },
      "test_elite",
    );
    state.enemies.push(enemy);
    state.events = [];
    hitEnemy(state, enemy, 150);
    const killed = state.events.find(
      (e): e is Extract<GameEvent, { type: "enemyKilled" }> =>
        e.type === "enemyKilled",
    );
    expect(killed).toBeDefined();
    const toll = overkillEfficiency(killed!.damage, enemy.maxHp);
    expect(killed!.xp).toBe(
      Math.round(XP_TUNING.eliteXpMobMult * mobLevelXp(20, 20) * toll),
    );
    // Even after the toll, the popup is several mob kills' worth — the "an
    // elite is worth stopping for" reward.
    expect(killed!.xp).toBeGreaterThan(mobLevelXp(20, 20));
  });
});
