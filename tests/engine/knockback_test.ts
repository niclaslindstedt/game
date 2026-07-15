// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// KNOCKBACK (config `KNOCKBACK`): the hero's own MELEE/RANGED weapon blow
// shoves a surviving mob straight back, away from him, so kiting the horde is
// that bit easier. Magic hits don't push; companions/procs/abilities don't;
// heavier roles (elite half, boss none) plant their feet; the developer
// BALANCE › KNOCKBACK knob scales the shove. Runs on synthetic fixtures.

import { afterEach, describe, expect, it } from "vitest";

import {
  hitEnemy,
  KNOCKBACK,
  resetBalanceTuning,
  setBalanceTuning,
} from "@game/core";
import type { Enemy, GameState } from "@game/core";
import { clearStage, makeEnemy, startGame } from "./helpers.ts";

afterEach(() => resetBalanceTuning());

/**
 * A landing-guaranteed test rig: the hero can't whiff (huge DEXTERITY zeroes
 * both his innate miss and the foe's dodge, so `rollAccuracy` always connects)
 * and the map is bare (no obstacle can deflect the shove). Returns the mob
 * parked `dx` to the hero's RIGHT on his own row, so a push reads as a clean
 * +x displacement.
 */
function rig(
  defId = "test_minion",
  dx = 60,
): { state: GameState; enemy: Enemy } {
  const state = startGame();
  clearStage(state);
  state.obstacles = [];
  // Never miss, never get dodged — the blow always lands, so the knockback is
  // deterministic (its magnitude carries no rng of its own).
  state.player.stats.dexterity = 1000;
  const enemy = makeEnemy(
    {
      pos: { x: state.player.pos.x + dx, y: state.player.pos.y },
      hp: 1_000_000,
      maxHp: 1_000_000,
    },
    defId,
  );
  state.enemies.push(enemy);
  return { state, enemy };
}

describe("knockback", () => {
  it("shoves a surviving minion straight back on a melee blow", () => {
    const { state, enemy } = rig();
    const before = enemy.pos.x;
    const y = enemy.pos.y;
    hitEnemy(state, enemy, 20, "melee", { rollAccuracy: true });
    // Pushed directly away from the hero (+x here) by the shipped distance.
    expect(enemy.pos.x).toBeCloseTo(before + KNOCKBACK.distance, 6);
    expect(enemy.pos.y).toBeCloseTo(y, 6); // no sideways drift
  });

  it("shoves on a ranged blow too", () => {
    const { state, enemy } = rig();
    const before = enemy.pos.x;
    hitEnemy(state, enemy, 20, "ranged", { rollAccuracy: true });
    expect(enemy.pos.x).toBeCloseTo(before + KNOCKBACK.distance, 6);
  });

  it("does NOT shove on a magic blow", () => {
    const { state, enemy } = rig();
    const before = enemy.pos.x;
    hitEnemy(state, enemy, 20, "magic", { rollAccuracy: true });
    expect(enemy.pos.x).toBe(before);
  });

  it("only pushes the hero's OWN weapon blows (rollAccuracy)", () => {
    // A companion shot / proc / conjured power omits rollAccuracy — no shove.
    const { state, enemy } = rig();
    const before = enemy.pos.x;
    hitEnemy(state, enemy, 20, "melee", { rollAccuracy: false });
    expect(enemy.pos.x).toBe(before);
  });

  it("scales the shove with the BALANCE knob, and 0 turns it off", () => {
    const doubled = rig();
    setBalanceTuning({ knockback: 2 });
    const beforeD = doubled.enemy.pos.x;
    hitEnemy(doubled.state, doubled.enemy, 20, "melee", { rollAccuracy: true });
    expect(doubled.enemy.pos.x).toBeCloseTo(
      beforeD + KNOCKBACK.distance * 2,
      6,
    );

    const off = rig();
    setBalanceTuning({ knockback: 0 });
    const beforeOff = off.enemy.pos.x;
    hitEnemy(off.state, off.enemy, 20, "melee", { rollAccuracy: true });
    expect(off.enemy.pos.x).toBe(beforeOff);
  });

  it("plants heavier roles: elite half, boss immovable", () => {
    const elite = rig("test_elite");
    const beforeE = elite.enemy.pos.x;
    hitEnemy(elite.state, elite.enemy, 20, "melee", { rollAccuracy: true });
    expect(elite.enemy.pos.x).toBeCloseTo(
      beforeE + KNOCKBACK.distance * KNOCKBACK.roleScale.elite,
      6,
    );

    const boss = rig("test_boss");
    const beforeB = boss.enemy.pos.x;
    hitEnemy(boss.state, boss.enemy, 20, "melee", { rollAccuracy: true });
    expect(boss.enemy.pos.x).toBe(beforeB); // roleScale.boss is 0
  });

  it("does not move a mob the blow KILLS (the corpse launch owns that)", () => {
    const { state, enemy } = rig();
    enemy.hp = 5;
    enemy.maxHp = 5;
    const before = enemy.pos.x;
    hitEnemy(state, enemy, 50, "melee", { rollAccuracy: true });
    // The mob died and left the field; its last position was never shoved.
    expect(state.enemies.includes(enemy)).toBe(false);
    expect(enemy.pos.x).toBe(before);
  });
});
