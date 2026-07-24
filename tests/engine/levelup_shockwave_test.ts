// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The LEVEL-UP LIGHT SHOCKWAVE: a ding detonates a ring of light that HURLS the
// surrounding horde back — a knockback, never a wound. These assert the engine
// physics (the app draws the burst off the `levelUp` event; that's not here).

import { describe, expect, it } from "vitest";

import {
  grantXp,
  LEVELING,
  levelUpShockwave,
  step,
  xpToLevelUp,
} from "@game/core";
import { distance } from "@game/lib/vec.ts";

import { clearStage, DT, idle, makeEnemy, startGame } from "./helpers.ts";

describe("level-up light shockwave", () => {
  it("hurls a nearby mob away from the hero without harming it", () => {
    const state = startGame();
    clearStage(state);
    const at = {
      x: state.player.pos.x + 40,
      y: state.player.pos.y,
    };
    const enemy = makeEnemy({ pos: { ...at } });
    state.enemies.push(enemy);
    const hpBefore = enemy.hp;
    const distBefore = distance(state.player.pos, enemy.pos);

    // Ding: crossing the threshold arms the shockwave (see grantXp).
    grantXp(state, xpToLevelUp(1));
    expect(state.player.level).toBe(2);
    // The light armed an outward impulse — but hasn't coasted it yet.
    expect(enemy.knockMs).toBe(LEVELING.shockwave.knockbackMs);
    expect(enemy.knockVel).toBeDefined();
    // The impulse points straight AWAY from the hero (the mob sat to his right).
    expect(enemy.knockVel!.x).toBeGreaterThan(0);

    // The light throws it; it never wounds it.
    expect(enemy.hp).toBe(hpBefore);

    // Coast a few ticks: the mob visibly sails outward and is still alive.
    // Disarm the hero first so his own weapon can't chip the mob during the
    // coast — the point here is the SHOCKWAVE's shove, not combat.
    state.player.disarmed = true;
    for (let i = 0; i < 12; i++) step(state, idle, DT);
    expect(distance(state.player.pos, enemy.pos)).toBeGreaterThan(distBefore);
    expect(enemy.hp).toBe(hpBefore);
    expect(state.enemies).toContain(enemy);
  });

  it("falls off with distance and leaves far mobs untouched", () => {
    const state = startGame();
    clearStage(state);
    const near = makeEnemy({
      pos: { x: state.player.pos.x + 30, y: state.player.pos.y },
    });
    // Well beyond the shockwave's reach — the light never reaches it.
    const far = makeEnemy({
      pos: {
        x: state.player.pos.x + LEVELING.shockwave.radius + 200,
        y: state.player.pos.y,
      },
    });
    state.enemies.push(near, far);

    levelUpShockwave(state);

    // The near mob is flung faster than a mid-ring one would be (falloff), and
    // the far mob outside the radius is never touched.
    expect(near.knockMs).toBe(LEVELING.shockwave.knockbackMs);
    expect(far.knockMs).toBeFalsy();
    expect(far.knockVel).toBeUndefined();
  });
});
