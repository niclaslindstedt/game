// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Player-CAST spells (defs/spells.ts + sorcery.ts): INT unlocks them, a cast
// spends mana and arms a cooldown, and each school resolves — a single-target
// bolt, an AOE nova, a heal, a ward that absorbs, a slow that chills. Plus the
// ×10 unlock queue and the persistent spell bar.

import { describe, expect, it } from "vitest";

import {
  absorbPlayerDamage,
  allocateStat,
  castSpell,
  effectiveStat,
  recomputeMaxMana,
  spellDef,
  SPELL_DEFS,
  SPELL_SLOTS,
  spellsUnlockedBetween,
  unlockedSpellIds,
} from "@game/core";
import type { GameState } from "@game/core";
import { clearStage, makeEnemy, startGame } from "./helpers.ts";

/** Pin a raw INTELLIGENCE at a high level (linear, no diminishing), resize the
 * pool, fill mana, and drop `spellId` into slot 0 ready to cast. */
function ready(state: GameState, spellId: string, int = 250): GameState {
  state.player.level = 99;
  state.player.stats.intelligence = int;
  recomputeMaxMana(state);
  state.player.mana = state.player.maxMana;
  state.player.spellSlots[0] = spellId;
  return state;
}

/** A tall-hp mob at `dx` world px from the hero — survives a scaled cast so
 * damage can be measured off the surviving bar. */
function tallMob(state: GameState, dx: number, id = 8000) {
  const enemy = makeEnemy(
    {
      id,
      pos: { x: state.player.pos.x + dx, y: state.player.pos.y },
      hp: 1_000_000,
      maxHp: 1_000_000,
    },
    "test_minion",
  );
  return enemy;
}

describe("the spell bar", () => {
  it("opens empty with SPELL_SLOTS slots", () => {
    const state = startGame();
    expect(state.player.spellSlots).toHaveLength(SPELL_SLOTS);
    expect(state.player.spellSlots.every((s) => s === null)).toBe(true);
  });
});

describe("unlock gating", () => {
  it("effective INT unlocks one spell per ×10, ascending", () => {
    expect(unlockedSpellIds(0)).toHaveLength(0);
    expect(unlockedSpellIds(10)).toEqual(["arc_bolt"]);
    const at55 = unlockedSpellIds(55);
    expect(at55).toContain("arc_bolt");
    expect(at55).toContain("gravitic_pulse"); // minInt 50
    expect(at55).not.toContain("mending_light"); // minInt 60
    expect(unlockedSpellIds(250)).toHaveLength(
      Object.keys(SPELL_DEFS).length,
    );
  });

  it("a cast is refused (locked) while INT is below the spell's minInt", () => {
    const state = startGame();
    clearStage(state);
    ready(state, "frost_lance", 20); // minInt 40, INT only 20
    state.events = [];
    expect(castSpell(state, 0)).toBe(false);
    expect(state.events.some((e) => e.type === "spellFizzled")).toBe(true);
    expect(state.player.mana).toBe(state.player.maxMana); // nothing spent
  });
});

describe("casting economy", () => {
  it("spends mana, arms the cooldown, pauses regen, and books stats", () => {
    const state = startGame();
    clearStage(state);
    ready(state, "arc_bolt");
    state.enemies = [tallMob(state, 40)];
    const def = spellDef("arc_bolt");
    const before = state.player.mana;
    state.events = [];

    expect(castSpell(state, 0)).toBe(true);
    expect(state.player.mana).toBe(before - def.manaCost);
    expect(state.player.spellCooldowns["arc_bolt"]).toBe(def.cooldownMs);
    expect(state.player.manaRegenMs).toBeGreaterThan(0);
    expect(state.stats.spellsCast).toBe(1);
    expect(state.stats.manaSpent).toBe(def.manaCost);
    expect(state.events.some((e) => e.type === "spellCast")).toBe(true);
  });

  it("refuses on cooldown, then on empty mana", () => {
    const state = startGame();
    clearStage(state);
    ready(state, "arc_bolt");
    state.enemies = [tallMob(state, 40)];
    expect(castSpell(state, 0)).toBe(true);
    // Still on cooldown → refused, no further spend.
    const manaAfterFirst = state.player.mana;
    expect(castSpell(state, 0)).toBe(false);
    expect(state.player.mana).toBe(manaAfterFirst);

    // Clear the cooldown but drain the pool → refused for mana.
    state.player.spellCooldowns = {};
    state.player.mana = 0;
    state.events = [];
    expect(castSpell(state, 0)).toBe(false);
    expect(
      state.events.some(
        (e) => e.type === "spellFizzled" && e.reason === "mana",
      ),
    ).toBe(true);
  });

  it("an attack bolt with no foe in range does nothing (refunded)", () => {
    const state = startGame();
    clearStage(state);
    ready(state, "arc_bolt");
    state.enemies = []; // empty field
    const before = state.player.mana;
    expect(castSpell(state, 0)).toBe(false);
    expect(state.player.mana).toBe(before);
  });
});

describe("spell effects", () => {
  it("a bolt damages the nearest foe (and chains to more)", () => {
    const state = startGame();
    clearStage(state);
    ready(state, "chain_spark"); // chain: 2
    const a = tallMob(state, 30, 8001);
    const b = tallMob(state, 55, 8002);
    const c = tallMob(state, 80, 8003);
    state.enemies = [a, b, c];
    expect(castSpell(state, 0)).toBe(true);
    // The primary plus two chained leaps all took damage.
    expect(a.hp).toBeLessThan(a.maxHp);
    expect(b.hp).toBeLessThan(b.maxHp);
    expect(c.hp).toBeLessThan(c.maxHp);
  });

  it("a nova damages every foe in its radius", () => {
    const state = startGame();
    clearStage(state);
    ready(state, "ember_burst");
    const near = tallMob(state, 20, 8010);
    const far = tallMob(state, 400, 8011); // outside the radius
    state.enemies = [near, far];
    expect(castSpell(state, 0)).toBe(true);
    expect(near.hp).toBeLessThan(near.maxHp);
    expect(far.hp).toBe(far.maxHp);
  });

  it("a heal restores hp (and refuses at full)", () => {
    const state = startGame();
    clearStage(state);
    ready(state, "mending_light");
    state.player.hp = 1;
    expect(castSpell(state, 0)).toBe(true);
    expect(state.player.hp).toBeGreaterThan(1);
    // At full hp there is nothing to heal — refused, refunded.
    state.player.hp = state.player.maxHp;
    state.player.spellCooldowns = {};
    const mana = state.player.mana;
    expect(castSpell(state, 0)).toBe(false);
    expect(state.player.mana).toBe(mana);
  });

  it("a ward absorbs incoming damage until drained", () => {
    const state = startGame();
    clearStage(state);
    ready(state, "mana_ward");
    expect(castSpell(state, 0)).toBe(true);
    expect(state.player.shieldHp).toBeGreaterThan(0);
    const ward = state.player.shieldHp;
    // A blow smaller than the ward is fully soaked (0 through to hp).
    expect(absorbPlayerDamage(state, ward - 1)).toBe(0);
    expect(state.player.shieldHp).toBe(1);
  });

  it("a slow chills every foe in its radius", () => {
    const state = startGame();
    clearStage(state);
    ready(state, "frost_nova");
    const near = tallMob(state, 30, 8020);
    state.enemies = [near];
    expect(castSpell(state, 0)).toBe(true);
    expect(near.chillMs).toBeGreaterThan(0);
    expect(near.chillFactor).toBeLessThan(1);
  });
});

describe("the unlock queue", () => {
  it("spellsUnlockedBetween reports the crossings in (before, after]", () => {
    expect(spellsUnlockedBetween(9, 10)).toEqual(["arc_bolt"]);
    expect(spellsUnlockedBetween(10, 10)).toEqual([]);
    expect(spellsUnlockedBetween(15, 35)).toEqual([
      "ember_burst", // 20
      "mana_ward", // 30
    ]);
  });

  it("allocating an INT point across a ×10 threshold enqueues the spell", () => {
    const state = startGame();
    state.player.level = 99;
    state.player.stats.intelligence = 9;
    state.player.pendingStatPoints = 3;
    state.player.pendingSpellUnlocks = [];
    // 9 → 10 effective INT crosses arc_bolt's threshold.
    expect(effectiveStat(state, "intelligence")).toBe(9);
    allocateStat(state, "intelligence");
    expect(effectiveStat(state, "intelligence")).toBe(10);
    expect(state.player.stats).toBeTruthy();
    expect(state.pendingSpellUnlocks).toContain("arc_bolt");
  });
});
