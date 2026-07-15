// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The STAY-on-a-cleared-field flow: felling the boss leaves a corpse, the
// victory menu's STAY choice drops the (already banked) hero back into play to
// farm loot without the auto-victory yanking the menu back up, and tapping the
// corpse re-opens the menu. Runs on the synthetic fixtures like every
// engine-rule suite.

import { describe, expect, it } from "vitest";

import {
  advanceDialogue,
  allocateStat,
  createGame,
  enemyDef,
  killEnemy,
  reopenVictoryChoice,
  RUN,
  stayOnField,
} from "@game/core";
import type { GameState } from "@game/core";

import { clearStage, DT, idle, run, SEED, startGame } from "./helpers.ts";

const isBoss = (defId: string) => enemyDef(defId).role === "boss";

/** Fell the level's boss and burn the loot-grab countdown down to the menu. */
function reachVictory(state: GameState): { x: number; y: number } {
  clearStage(state);
  const boss = state.enemies.find((e) => isBoss(e.defId))!;
  boss.spoke = true; // skip his arrival/death scene noise: this is the menu flow
  const pos = { ...boss.pos };
  killEnemy(state, boss, 9999, false);
  // The kill can open the death-words box and bank level-ups; clear both so
  // time can resume and the countdown can run out.
  while (state.phase === "dialogue") advanceDialogue(state);
  while (state.player.pendingStatPoints > 0) allocateStat(state, "stamina");
  run(
    state,
    idle,
    Math.ceil(RUN.victoryDelayMs / DT) + 20,
    (s) => s.phase === "victory",
  );
  expect(state.phase).toBe("victory");
  return pos;
}

describe("boss corpse", () => {
  it("a fresh run has no corpse and is not staying", () => {
    const state = createGame(SEED, "test_level");
    expect(state.bossCorpse).toBeNull();
    expect(state.staying).toBe(false);
  });

  it("marks where the boss fell when it dies", () => {
    const state = startGame();
    const pos = reachVictory(state);
    expect(state.bossCorpse).not.toBeNull();
    expect(state.bossCorpse!.pos).toEqual(pos);
    expect(state.bossCorpse!.sprite).toBe(enemyDef("test_boss").sprite);
    expect(state.staying).toBe(false); // not until the player picks STAY
  });
});

describe("stayOnField", () => {
  it("drops back into play without the auto-victory re-arming", () => {
    const state = startGame();
    reachVictory(state);

    expect(stayOnField(state)).toBe(true);
    expect(state.phase).toBe("playing");
    expect(state.staying).toBe(true);
    expect(state.victoryCountdownMs).toBeNull();
    // The corpse stays put as the tap target.
    expect(state.bossCorpse).not.toBeNull();

    // The still-cleared objective must NOT drag the menu straight back up:
    // idle well past the loot-grab delay and the run stays in the player's hands.
    run(state, idle, Math.ceil(RUN.victoryDelayMs / DT) + 40);
    expect(state.phase).toBe("playing");
    expect(state.victoryCountdownMs).toBeNull();
    expect(state.bossCorpse).not.toBeNull();
  });

  it("only takes from the victory phase with a corpse", () => {
    const state = startGame();
    // Mid-run, boss still alive: nothing to stay on.
    expect(stayOnField(state)).toBe(false);
    expect(state.phase).toBe("playing");
  });
});

describe("reopenVictoryChoice", () => {
  it("brings the menu back when the player is done farming", () => {
    const state = startGame();
    reachVictory(state);
    stayOnField(state);

    expect(reopenVictoryChoice(state)).toBe(true);
    expect(state.phase).toBe("victory");
    // Still staying — a re-open doesn't end the lingering.
    expect(state.staying).toBe(true);
  });

  it("is a no-op unless the player is staying", () => {
    const state = startGame();
    reachVictory(state);
    // Straight off the menu, before any STAY: nothing to re-open.
    expect(reopenVictoryChoice(state)).toBe(false);
    expect(state.phase).toBe("victory");
  });
});
