// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// ELITE/BOSS XP is a SHARE OF THE HERO'S CURRENT LEVEL BAR, not the
// hp-proportional reward the rank and file ride: a set-piece kill lurches the
// bar the same noticeable 12% (elite) / 20% (boss) on every map and
// difficulty, because it reads `xpToLevelUp(player.level)` live instead of a
// flat number that would go stale as the hero out-levels the content. Runs on
// the synthetic engine fixtures (`test_elite`, `test_boss`).

import { describe, expect, it } from "vitest";

import {
  enemyDef,
  enemyKillXp,
  hitEnemy,
  LEVELING,
  mobLevelXp,
  overkillEfficiency,
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

describe("enemyKillXp — elite/boss bar-share rule", () => {
  it("an elite kill pays LEVELING.eliteXpBarShare of the current bar", () => {
    const state = heroAt(20);
    const enemy = makeEnemy({ pos: { x: 0, y: 0 } }, "test_elite");
    expect(enemyKillXp(state, enemyDef("test_elite"), enemy)).toBeCloseTo(
      LEVELING.eliteXpBarShare * xpToLevelUp(20),
    );
  });

  it("a boss kill pays LEVELING.bossXpBarShare of the current bar", () => {
    const state = heroAt(20);
    const enemy = makeEnemy({ pos: { x: 0, y: 0 } }, "test_boss");
    expect(enemyKillXp(state, enemyDef("test_boss"), enemy)).toBeCloseTo(
      LEVELING.bossXpBarShare * xpToLevelUp(20),
    );
  });

  it("bosses pay a bigger share than elites", () => {
    expect(LEVELING.bossXpBarShare).toBeGreaterThan(LEVELING.eliteXpBarShare);
  });

  it("the reward scales with the hero's level — the bar moves the same %", () => {
    const elite = enemyDef("test_elite");
    const enemy = makeEnemy({ pos: { x: 0, y: 0 } }, "test_elite");
    const low = enemyKillXp(heroAt(5), elite, enemy);
    const high = enemyKillXp(heroAt(50), elite, enemy);
    // Absolute XP grows with level (a fatter bar)…
    expect(high).toBeGreaterThan(low * 5);
    // …but the FRACTION of the bar is the same both times.
    expect(low / xpToLevelUp(5)).toBeCloseTo(high / xpToLevelUp(50));
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

describe("bar-share xp — end to end through the kill event", () => {
  it("an elite kill floats a bar-share (times the overkill toll) as its popup", () => {
    const state = heroAt(20);
    const { x, y } = state.player.pos;
    // Pin the bar (powerScaled) so the engage-time power match leaves maxHp
    // alone; the deep-campaign hero one-shots it with a guaranteed crit, so the
    // popup is the bar-share scaled by the overkill toll that big blow earns.
    const enemy = makeEnemy(
      {
        id: state.nextId++,
        pos: { x: x + 30, y },
        hp: 150,
        maxHp: 150,
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
      Math.round(LEVELING.eliteXpBarShare * xpToLevelUp(20) * toll),
    );
    // Even after the toll, the popup is a real slice of the bar — thousands of
    // xp, the "boss lurched my bar" reward the flat-xp rule never gave.
    expect(killed!.xp).toBeGreaterThan(xpToLevelUp(20) * 0.02);
  });
});
