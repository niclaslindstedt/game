// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The MANA pool and SPIRIT-driven regen: INT sizes the pool, casting spends
// and pauses it, SPIRIT sets the mana/health regen rate, and the blue-gatorade
// mana potion banks and refills. See config MANA/REGEN, items.ts, sorcery.ts.

import { describe, expect, it } from "vitest";

import {
  absorbPlayerDamage,
  computeMaxMana,
  consumeManaPotion,
  castSpell,
  effectiveStat,
  hpRegenPerSec,
  MANA,
  manaRegenPerSec,
  recomputeMaxMana,
  REGEN,
  restoreMana,
  step,
  stepRegen,
} from "@game/core";
import type { GameState } from "@game/core";
import { clearStage, DT, idle, startGame } from "./helpers.ts";

/** Raise the hero to a level whose stat cap clears the endgame so a set INT
 * reads linearly (no diminishing) — then pin a raw INTELLIGENCE and resize the
 * pool, returning the effective INT the reads will see. */
function withInt(state: GameState, int: number): number {
  state.player.level = 99;
  state.player.stats.intelligence = int;
  recomputeMaxMana(state);
  return effectiveStat(state, "intelligence");
}

describe("mana pool", () => {
  it("sizes max mana from the base pool + INTELLIGENCE", () => {
    const state = startGame();
    withInt(state, 0);
    expect(state.player.maxMana).toBe(MANA.base);

    const effInt = withInt(state, 50);
    expect(state.player.maxMana).toBe(MANA.base + effInt * MANA.perInt);
    expect(computeMaxMana(state)).toBe(state.player.maxMana);
  });

  it("a deeper pool lifts the current reserve; a shallower one clamps", () => {
    const state = startGame();
    withInt(state, 20);
    state.player.mana = state.player.maxMana; // full
    const before = state.player.maxMana;
    withInt(state, 60); // deeper
    expect(state.player.mana).toBe(state.player.maxMana);
    expect(state.player.maxMana).toBeGreaterThan(before);
    withInt(state, 20); // shallower again — current clamps down
    expect(state.player.mana).toBe(state.player.maxMana);
  });
});

describe("mana regen (SPIRIT)", () => {
  it("holds off for the post-cast delay, then refills at the SPIRIT rate", () => {
    const state = startGame();
    clearStage(state);
    withInt(state, 40);
    state.player.stats.spirit = 30;
    state.player.mana = 0;
    // A cast just happened: regen is paused for the full window.
    state.player.manaRegenMs = REGEN.manaDelayMs;

    // One second inside the window: the timer ticks, mana does NOT move.
    stepRegen(state, 1, 1000);
    expect(state.player.mana).toBe(0);
    expect(state.player.manaRegenMs).toBe(REGEN.manaDelayMs - 1000);

    // Burn the rest of the window off, then a clean second regenerates.
    state.player.manaRegenMs = 0;
    const rate = manaRegenPerSec(state);
    expect(rate).toBeCloseTo(
      REGEN.manaBasePerSec +
        effectiveStat(state, "spirit") * REGEN.manaPerSpirit,
    );
    stepRegen(state, 1, 1000);
    expect(state.player.mana).toBeCloseTo(rate);
  });

  it("more SPIRIT regenerates mana faster", () => {
    const a = startGame();
    withInt(a, 40);
    a.player.stats.spirit = 0;
    const b = startGame();
    withInt(b, 40);
    b.player.stats.spirit = 50;
    expect(manaRegenPerSec(b)).toBeGreaterThan(manaRegenPerSec(a));
  });
});

describe("health regen (SPIRIT)", () => {
  it("mends out of combat, scaled by SPIRIT, and pauses after a hit", () => {
    const state = startGame();
    clearStage(state);
    state.player.stats.spirit = 50;
    state.player.hp = 10;
    state.player.hpRegenMs = 0;
    const rate = hpRegenPerSec(state);
    expect(rate).toBeGreaterThan(0);
    stepRegen(state, 1, 1000);
    expect(state.player.hp).toBeCloseTo(10 + rate);

    // A hit re-arms the pause (via absorbPlayerDamage): no mend that tick.
    absorbPlayerDamage(state, 3);
    expect(state.player.hpRegenMs).toBe(REGEN.hpDelayMs);
    const held = state.player.hp;
    stepRegen(state, 1, 1000);
    expect(state.player.hp).toBe(held);
  });

  it("is zero at zero SPIRIT — health regen is spirit's gift", () => {
    const state = startGame();
    state.player.stats.spirit = 0;
    expect(hpRegenPerSec(state)).toBe(0);
    state.player.hp = 10;
    state.player.hpRegenMs = 0;
    stepRegen(state, 1, 1000);
    expect(state.player.hp).toBe(10);
  });
});

describe("mana potion (blue gatorade)", () => {
  it("refills the pool and no-ops when already full", () => {
    const state = startGame();
    withInt(state, 40);
    state.player.mana = 0;
    const restored = restoreMana(state);
    expect(restored).toBeGreaterThan(0);
    expect(state.player.mana).toBe(state.player.maxMana);
    // Nothing to restore on a full pool.
    expect(restoreMana(state)).toBe(0);
  });

  it("banks on pickup and is spent on the use edge", () => {
    const state = startGame();
    clearStage(state);
    withInt(state, 40);
    state.player.mana = 0;
    state.items = [{ id: 700, kind: "mana", pos: { ...state.player.pos } }];
    step(state, idle, DT); // touch banks it
    expect(state.player.manaPotions).toBe(1);

    const full = state.player.maxMana;
    step(state, { ...idle, useManaPotion: true }, DT);
    expect(state.player.manaPotions).toBe(0);
    expect(state.player.mana).toBe(full);
    // A used-potion event fired.
    // (drained by the app; here we only assert the potion was spent.)
  });

  it("a full-pool pickup stays on the ground", () => {
    const state = startGame();
    clearStage(state);
    withInt(state, 40);
    state.player.mana = state.player.maxMana;
    state.player.manaPotions = 5; // stack already full → banking refuses
    state.items = [{ id: 701, kind: "mana", pos: { ...state.player.pos } }];
    step(state, idle, DT);
    expect(state.items.some((i) => i.kind === "mana")).toBe(true);
    expect(state.player.manaPotions).toBe(5);
  });
});

describe("mana carries between levels", () => {
  it("banks the mana-potion stack and refills the pool on arrival", () => {
    const state = startGame();
    withInt(state, 40);
    state.player.manaPotions = 2;
    // The pool arrives full on a fresh drop, sized to INT.
    expect(state.player.mana).toBe(state.player.maxMana);
    expect(consumeManaPotion(state)).toBe(false); // full pool → no-op
    expect(state.player.manaPotions).toBe(2);
  });
});
