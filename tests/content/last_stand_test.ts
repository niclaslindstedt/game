// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The boss's last stand (config.LAST_STAND): at or below the hp-fraction
// threshold a boss's contact hits multiply — the "one last stand" spike the
// renderer telegraphs with the dying sprite and its flicker.

import {
  activeMechanics,
  enemyDef,
  LAST_STAND,
  mobContactScaleFor,
  step,
} from "@game/core";
import type { GameState } from "@game/core";
import { describe, expect, it } from "vitest";

import { clearStage, DT, idle, startGame } from "../helpers.ts";

/** The parked moon boss, teleported onto the player and ready to strike. */
function bossOnPlayer(state: GameState) {
  clearStage(state);
  const boss = state.enemies[0];
  if (!boss) throw new Error("moon level should keep its boss");
  boss.pos = { ...state.players[0].pos };
  boss.home = { ...state.players[0].pos };
  boss.speed = 0;
  boss.contactCooldownMs = 0;
  boss.spoke = true; // skip the confrontation scene — this is a damage test
  state.rng = () => 0.999; // never crit, never drop: deterministic numbers
  // Strip the starting clothes: bare skin, so the blow lands unturned and
  // the numbers below are exactly the def's (armor has its own suite).
  state.players[0].equipment.chest = null;
  state.players[0].equipment.legs = null;
  state.players[0].equipment.feet = null;
  return boss;
}

describe("boss last stand", () => {
  it("deals base contact damage above the threshold", () => {
    const state = startGame();
    const boss = bossOnPlayer(state);
    const hpBefore = state.players[0].hp;
    step(state, idle, DT);
    // The horde's per-level contact ramp (mobContactScaleFor) is stamped on
    // every spawn — the boss's levelBonus puts its mlvl a few over 1.
    expect(hpBefore - state.players[0].hp).toBe(
      Math.round(
        enemyDef(boss.defId).contactDamage * mobContactScaleFor(boss.mlvl),
      ),
    );
  });

  it("multiplies contact damage at or below the threshold", () => {
    const state = startGame();
    const boss = bossOnPlayer(state);
    boss.hp = boss.maxHp * LAST_STAND.hpFraction;
    const hpBefore = state.players[0].hp;
    step(state, idle, DT);
    // THE FLAGBEARER's dying-phase ENRAGE (defs mechanics) stacks with the global
    // last stand — at a tenth hp his phase's fury multiplier is active too.
    const enrage = activeMechanics(boss, enemyDef(boss.defId))?.enrage;
    expect(hpBefore - state.players[0].hp).toBe(
      Math.round(
        enemyDef(boss.defId).contactDamage *
          mobContactScaleFor(boss.mlvl) *
          LAST_STAND.damageMultiplier *
          (enrage?.damageMult ?? 1),
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
    state.players[0].pos = { x: 1200, y: 600 };
    const minion = {
      id: 9000,
      defId: "ghost",
      pos: { ...state.players[0].pos },
      home: { ...state.players[0].pos },
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
    const hpBefore = state.players[0].hp;
    step(state, idle, DT);
    expect(hpBefore - state.players[0].hp).toBe(
      enemyDef("ghost").contactDamage,
    );
  });
});
