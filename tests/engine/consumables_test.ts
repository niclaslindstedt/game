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
    pos: { ...state.player.pos },
    ...item,
  } as Item);
}

describe("stacked medkits", () => {
  it("banks a touched medkit per quality instead of healing on contact", () => {
    const state = startGame();
    state.player.hp = 10;
    dropAtHero(state, { kind: "medkit", tier: 0 });
    step(state, idle, DT);
    // Banked, not spent: the hp is untouched and the stack grew.
    expect(state.player.hp).toBe(10);
    expect(state.player.medkits[0]).toBe(1);
    expect(state.items).toHaveLength(0);
  });

  it("stacks only within a quality and caps each stack at stackCap", () => {
    const state = startGame();
    for (let i = 0; i < CONSUMABLES.stackCap + 2; i++) {
      bankMedkit(state, 0);
    }
    expect(state.player.medkits[0]).toBe(CONSUMABLES.stackCap);
    // A different quality banks into its own stack, unblocked by the full one.
    expect(bankMedkit(state, 2)).toBe(true);
    expect(state.player.medkits[2]).toBe(1);
  });

  it("leaves an overflowing medkit on the ground", () => {
    const state = startGame();
    state.player.medkits[0] = CONSUMABLES.stackCap;
    dropAtHero(state, { kind: "medkit", tier: 0 });
    step(state, idle, DT);
    expect(state.items).toHaveLength(1);
    expect(state.player.medkits[0]).toBe(CONSUMABLES.stackCap);
  });

  it("spends the biggest heal first and reports it", () => {
    const state = startGame();
    state.player.maxHp = 1000;
    state.player.hp = 100;
    state.player.medkits[0] = 2; // LIGHT
    state.player.medkits[2] = 1; // LARGE (bigger heal)
    expect(bestMedkitTier(state)).toBe(2);
    const before = state.player.hp;
    expect(consumeMedkit(state)).toBe(true);
    expect(state.player.hp).toBe(before + MEDKIT.tiers[2]!.heal);
    // The LARGE stack drained; the LIGHT reserve is untouched.
    expect(state.player.medkits[2]).toBe(0);
    expect(state.player.medkits[0]).toBe(2);
    const used = state.events.find((e) => e.type === "medkitUsed");
    expect(used).toMatchObject({ tier: 2, heal: MEDKIT.tiers[2]!.heal });
  });

  it("is a no-op at full hp so a mistap never wastes a kit", () => {
    const state = startGame();
    state.player.hp = state.player.maxHp;
    state.player.medkits[0] = 3;
    expect(consumeMedkit(state)).toBe(false);
    expect(state.player.medkits[0]).toBe(3);
  });

  it("is a no-op with an empty medkit inventory", () => {
    const state = startGame();
    state.player.hp = 1;
    expect(bestMedkitTier(state)).toBe(-1);
    expect(consumeMedkit(state)).toBe(false);
  });

  it("heals through the useMedkit input edge", () => {
    const state = startGame();
    state.player.hp = 10;
    state.player.medkits[0] = 1;
    step(state, { ...idle, useMedkit: true }, DT);
    expect(state.player.hp).toBe(10 + MEDKIT.tiers[0]!.heal);
    expect(state.player.medkits[0]).toBe(0);
  });
});

describe("stacked stamina potions", () => {
  it("banks a touched drink instead of drinking it on contact", () => {
    const state = startGame();
    state.player.stamina = 0;
    dropAtHero(state, { kind: "drink" });
    step(state, idle, DT);
    // Banked, not drunk: the pool wasn't slammed to full (a tiny idle regen
    // aside), and the stack grew.
    expect(state.player.stamina).toBeLessThan(state.player.maxStamina);
    expect(state.player.staminaPotions).toBe(1);
    expect(state.items).toHaveLength(0);
  });

  it("caps the stamina stack and overflows to the ground", () => {
    const state = startGame();
    for (let i = 0; i < CONSUMABLES.stackCap + 1; i++) bankStaminaPotion(state);
    expect(state.player.staminaPotions).toBe(CONSUMABLES.stackCap);
    dropAtHero(state, { kind: "drink" });
    step(state, idle, DT);
    expect(state.items).toHaveLength(1);
  });

  it("refills the sprint pool best-effort and is a no-op when rested", () => {
    const state = startGame();
    state.player.staminaPotions = 2;
    state.player.stamina = 0;
    expect(consumeStaminaPotion(state)).toBe(true);
    expect(state.player.stamina).toBe(state.player.maxStamina);
    expect(state.player.staminaPotions).toBe(1);
    // Rested now — the second sip is refused, keeping the potion.
    expect(consumeStaminaPotion(state)).toBe(false);
    expect(state.player.staminaPotions).toBe(1);
  });
});
