// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Stacked consumables: medkits and stamina potions no longer fire on contact
// — a touched kit BANKS into the consumable dock (one stack per medkit
// quality, one shared stamina stack, each `CONSUMABLES.stackCap` deep), and
// the hero spends them on his own input edge (`useMedkit` / `useStaminaPotion`)
// best-quality-first, never wasting one at a full bar. Engine rules — run on
// the shipped MEDKIT/CONSUMABLES config (only the built-in loose-pickup kinds
// are used, no shipped content ids).

import { describe, expect, it } from "vitest";

import {
  CONSUMABLES,
  MEDKIT,
  bankMedkit,
  bankStaminaPotion,
  bestMedkitTier,
  consumeMedkit,
  consumeStaminaPotion,
  step,
  type GameState,
  type Item,
} from "@game/core";

import { DT, idle, startGame } from "./helpers.ts";

/** Distributes `Omit` across the `Item` union so a medkit member keeps its
 * variant-only `tier` field (a plain `Omit<Item, …>` collapses to the shared
 * keys). */
type DistributiveOmit<T, K extends keyof T> = T extends unknown
  ? Omit<T, K>
  : never;

/** A loose ground pickup dropped right on top of the hero, grabbed next step. */
function dropAtHero(
  state: GameState,
  item: DistributiveOmit<Item, "id" | "pos">,
): void {
  state.items.push({
    id: state.nextId++,
    pos: { ...state.players[0].pos },
    ...item,
  } as Item);
}

describe("stacked medkits", () => {
  it("banks a touched medkit per quality instead of healing on contact", () => {
    const state = startGame();
    state.players[0].hp = 10;
    dropAtHero(state, { kind: "medkit", tier: 0 });
    step(state, idle, DT);
    // Banked, not spent: the hp is untouched and the stack grew.
    expect(state.players[0].hp).toBe(10);
    expect(state.players[0].medkits[0]).toBe(1);
    expect(state.items).toHaveLength(0);
  });

  it("stacks only within a quality and caps each stack at stackCap", () => {
    const state = startGame();
    for (let i = 0; i < CONSUMABLES.stackCap + 2; i++) {
      bankMedkit(state, 0);
    }
    expect(state.players[0].medkits[0]).toBe(CONSUMABLES.stackCap);
    // A different quality banks into its own stack, unblocked by the full one.
    expect(bankMedkit(state, 2)).toBe(true);
    expect(state.players[0].medkits[2]).toBe(1);
  });

  it("leaves an overflowing medkit on the ground", () => {
    const state = startGame();
    state.players[0].medkits[0] = CONSUMABLES.stackCap;
    dropAtHero(state, { kind: "medkit", tier: 0 });
    step(state, idle, DT);
    expect(state.items).toHaveLength(1);
    expect(state.players[0].medkits[0]).toBe(CONSUMABLES.stackCap);
  });

  it("spends the biggest heal first and reports it", () => {
    const state = startGame();
    state.players[0].maxHp = 1000;
    state.players[0].hp = 100;
    state.players[0].medkits[0] = 2; // LIGHT
    state.players[0].medkits[2] = 1; // LARGE (bigger heal)
    expect(bestMedkitTier(state)).toBe(2);
    const before = state.players[0].hp;
    // Percentage-of-max heal: LARGE (tier 2) mends 75% of the 1000 hp bar.
    const largeHeal = Math.round(
      state.players[0].maxHp * MEDKIT.tiers[2]!.healPct,
    );
    expect(consumeMedkit(state)).toBe(true);
    expect(state.players[0].hp).toBe(before + largeHeal);
    // The LARGE stack drained; the LIGHT reserve is untouched.
    expect(state.players[0].medkits[2]).toBe(0);
    expect(state.players[0].medkits[0]).toBe(2);
    const used = state.events.find((e) => e.type === "medkitUsed");
    expect(used).toMatchObject({ tier: 2, heal: largeHeal });
  });

  it("is a no-op at full hp so a mistap never wastes a kit", () => {
    const state = startGame();
    state.players[0].hp = state.players[0].maxHp;
    state.players[0].medkits[0] = 3;
    expect(consumeMedkit(state)).toBe(false);
    expect(state.players[0].medkits[0]).toBe(3);
  });

  it("is a no-op with an empty medkit inventory", () => {
    const state = startGame();
    state.players[0].hp = 1;
    expect(bestMedkitTier(state)).toBe(-1);
    expect(consumeMedkit(state)).toBe(false);
  });

  it("heals through the useMedkit input edge", () => {
    const state = startGame();
    state.players[0].hp = 10;
    state.players[0].medkits[0] = 1;
    const lightHeal = Math.max(
      1,
      Math.round(state.players[0].maxHp * MEDKIT.tiers[0]!.healPct),
    );
    step(state, { ...idle, useMedkit: true }, DT);
    expect(state.players[0].hp).toBe(
      Math.min(state.players[0].maxHp, 10 + lightHeal),
    );
    expect(state.players[0].medkits[0]).toBe(0);
  });
});

describe("stacked stamina potions", () => {
  it("banks a touched drink instead of drinking it on contact", () => {
    const state = startGame();
    state.players[0].stamina = 0;
    dropAtHero(state, { kind: "drink" });
    step(state, idle, DT);
    // Banked, not drunk: the pool wasn't slammed to full (a tiny idle regen
    // aside), and the stack grew.
    expect(state.players[0].stamina).toBeLessThan(state.players[0].maxStamina);
    expect(state.players[0].staminaPotions).toBe(1);
    expect(state.items).toHaveLength(0);
  });

  it("caps the stamina stack and overflows to the ground", () => {
    const state = startGame();
    for (let i = 0; i < CONSUMABLES.stackCap + 1; i++) bankStaminaPotion(state);
    expect(state.players[0].staminaPotions).toBe(CONSUMABLES.stackCap);
    dropAtHero(state, { kind: "drink" });
    step(state, idle, DT);
    expect(state.items).toHaveLength(1);
  });

  it("refills the sprint pool best-effort and is a no-op when rested", () => {
    const state = startGame();
    state.players[0].staminaPotions = 2;
    state.players[0].stamina = 0;
    expect(consumeStaminaPotion(state)).toBe(true);
    expect(state.players[0].stamina).toBe(state.players[0].maxStamina);
    expect(state.players[0].staminaPotions).toBe(1);
    // Rested now — the second sip is refused, keeping the potion.
    expect(consumeStaminaPotion(state)).toBe(false);
    expect(state.players[0].staminaPotions).toBe(1);
  });
});
