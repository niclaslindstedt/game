// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The LEVEL TOKEN respec: a token jump refunds the carried build into a single
// pool and freezes the run in the `respec` phase, where points move both ways
// until every one is re-placed and the build is committed. Covers the refund,
// the deallocation floor, the "no auto-close" difference from a level-up, the
// confirm gate, and the createGame → dismissIntro arming path.

import { describe, expect, it } from "vitest";

import {
  allocateStat,
  beginRespec,
  confirmRespec,
  createGame,
  deallocateStat,
  dismissIntro,
  skipCutscene,
  STAT_NAMES,
  type GameState,
} from "@game/core";

import { startGame } from "./helpers.ts";

/** Sum of the six trainable stats' allocated (base) points. */
function statTotal(state: GameState): number {
  return STAT_NAMES.reduce((sum, stat) => sum + state.player.stats[stat], 0);
}

describe("beginRespec", () => {
  it("refunds every banked point into the pool and zeros the stats", () => {
    const state = startGame();
    state.player.stats.strength = 3;
    state.player.stats.luck = 2;
    state.player.pendingStatPoints = 1; // an unspent level-up folds in too

    beginRespec(state);

    expect(state.phase).toBe("respec");
    expect(state.player.pendingStatPoints).toBe(6); // 3 + 2 + 1
    expect(statTotal(state)).toBe(0);
    expect(state.respecPending).toBe(false);
  });

  it("shrinks the derived pools with the refund without over-filling bars", () => {
    const state = startGame();
    state.player.pendingStatPoints = 4;
    allocateStat(state, "stamina");
    allocateStat(state, "stamina");
    allocateStat(state, "strength");
    allocateStat(state, "strength");
    const maxHpWithStamina = state.player.maxHp;

    beginRespec(state);

    // STAMINA fed max hp; refunding it drops the ceiling and hp stays inside it.
    expect(state.player.maxHp).toBeLessThan(maxHpWithStamina);
    expect(state.player.hp).toBeLessThanOrEqual(state.player.maxHp);
    expect(state.player.stamina).toBeLessThanOrEqual(state.player.maxStamina);
  });
});

describe("respec allocation", () => {
  it("does not auto-close when the last point lands (unlike a level-up)", () => {
    const state = startGame();
    state.player.stats.luck = 2;
    beginRespec(state);
    expect(state.player.pendingStatPoints).toBe(2);

    allocateStat(state, "strength");
    allocateStat(state, "strength");

    // Pool is empty, but the chooser stays open for fine-tuning.
    expect(state.player.pendingStatPoints).toBe(0);
    expect(state.phase).toBe("respec");
  });

  it("deallocateStat puts a point back, floored at zero and respec-only", () => {
    const state = startGame();
    state.player.stats.dexterity = 1;
    beginRespec(state);
    allocateStat(state, "strength"); // pool 1 -> 0, strength 1

    expect(deallocateStat(state, "strength")).toBe(true);
    expect(state.player.stats.strength).toBe(0);
    expect(state.player.pendingStatPoints).toBe(1);

    // Nothing left in strength to refund.
    expect(deallocateStat(state, "strength")).toBe(false);
    expect(state.player.pendingStatPoints).toBe(1);
  });

  it("deallocateStat is inert outside the respec phase", () => {
    const state = startGame();
    state.player.stats.luck = 3;
    expect(state.phase).toBe("playing");
    expect(deallocateStat(state, "luck")).toBe(false);
    expect(state.player.stats.luck).toBe(3);
  });
});

describe("confirmRespec", () => {
  it("commits only once the whole pool is spent, then drops into play", () => {
    const state = startGame();
    state.player.stats.luck = 2;
    beginRespec(state);

    // A point still owed: the confirm is refused.
    allocateStat(state, "speed");
    expect(confirmRespec(state)).toBe(false);
    expect(state.phase).toBe("respec");

    allocateStat(state, "speed");
    expect(confirmRespec(state)).toBe(true);
    expect(state.phase).toBe("playing");
    // The commit lands rested, like any fresh drop.
    expect(state.player.hp).toBe(state.player.maxHp);
    expect(state.player.stamina).toBe(state.player.maxStamina);
  });

  it("is inert outside the respec phase", () => {
    const state = startGame();
    expect(confirmRespec(state)).toBe(false);
  });
});

describe("the token-jump arming path", () => {
  it("createGame(respec) opens the respec when the intro is dismissed", () => {
    // The gentle fixture rung banks four head-start points; a respec refunds
    // exactly those into the pool for a from-scratch rebuild.
    const state = createGame(42, "test_level", "easy", undefined, true);
    expect(state.respecPending).toBe(true);

    skipCutscene(state);
    dismissIntro(state);

    expect(state.phase).toBe("respec");
    expect(state.player.pendingStatPoints).toBe(4);
    expect(statTotal(state)).toBe(0);
  });

  it("an ordinary run drops straight into play, no respec", () => {
    const state = createGame(42, "test_level", "easy");
    expect(state.respecPending).toBe(false);
    skipCutscene(state);
    dismissIntro(state);
    expect(state.phase).toBe("playing");
  });
});
