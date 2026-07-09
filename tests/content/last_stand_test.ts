// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The boss's last stand (config.LAST_STAND): at or below the hp-fraction
// threshold a boss's contact hits multiply — the "one last stand" spike the
// renderer telegraphs with the dying sprite and its flicker.

import { enemyDef, LAST_STAND, step } from "@game/core";
import type { GameState } from "@game/core";
import { describe, expect, it } from "vitest";

import { clearStage, DT, idle, startGame } from "../helpers.ts";

/** The parked moon boss, teleported onto the player and ready to strike. */
function bossOnPlayer(state: GameState) {
  clearStage(state);
  const boss = state.enemies[0];
  if (!boss) throw new Error("moon level should keep its boss");
  boss.pos = { ...state.player.pos };
  boss.home = { ...state.player.pos };
  boss.speed = 0;
  boss.contactCooldownMs = 0;
  boss.spoke = true; // skip the confrontation scene — this is a damage test
  state.rng = () => 0.999; // never crit, never drop: deterministic numbers
  return boss;
}

describe("boss last stand", () => {
  it("deals base contact damage above the threshold", () => {
    const state = startGame();
    const boss = bossOnPlayer(state);
    const hpBefore = state.player.hp;
    step(state, idle, DT);
    expect(hpBefore - state.player.hp).toBe(enemyDef(boss.defId).contactDamage);
  });

  it("multiplies contact damage at or below the threshold", () => {
    const state = startGame();
    const boss = bossOnPlayer(state);
    boss.hp = boss.maxHp * LAST_STAND.hpFraction;
    const hpBefore = state.player.hp;
    step(state, idle, DT);
    expect(hpBefore - state.player.hp).toBe(
      Math.round(
        enemyDef(boss.defId).contactDamage * LAST_STAND.damageMultiplier,
      ),
    );
  });

  it("leaves non-boss mobs at base damage however low they get", () => {
    const state = startGame();
    clearStage(state);
    const boss = state.enemies[0];
    if (!boss) throw new Error("moon level should keep its boss");
    boss.pos = { x: 40, y: 40 }; // park the boss far away
    boss.home = { x: 40, y: 40 };
    boss.speed = 0;
    state.player.pos = { x: 1200, y: 600 };
    const minion = {
      id: 9000,
      defId: "ghost",
      pos: { ...state.player.pos },
      home: { ...state.player.pos },
      // 1% hp — but enough absolute points to survive the player's
      // auto-attack landing first in the same step.
      hp: 40,
      maxHp: 4000,
      mlvl: 99,
      speed: 0,
      contactCooldownMs: 0,
    };
    state.enemies.push(minion);
    state.rng = () => 0.999;
    const hpBefore = state.player.hp;
    step(state, idle, DT);
    expect(hpBefore - state.player.hp).toBe(enemyDef("ghost").contactDamage);
  });
});
