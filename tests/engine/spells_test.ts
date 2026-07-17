// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Player-CAST powers (defs/spells.ts + sorcery.ts): a hero's CLASS (their
// dominant STR/DEX/INT) unlocks one power per ×10 of that stat, a cast spends
// mana and arms a cooldown, and each school resolves — a single-target bolt, a
// hero nova, a ranged rain, a heal, a ward, a slow, a self-buff. Plus the ×10
// unlock queue, the class gating (a warrior never sees magic), and the buff
// timer.

import { describe, expect, it } from "vitest";

import {
  absorbPlayerDamage,
  allocateStat,
  castSpell,
  dominantSpellStat,
  effectiveStat,
  heroSpellStat,
  recomputeMaxMana,
  spellDef,
  spellsForStat,
  SPELL_SLOTS,
  spellsUnlockedBetweenForStat,
  stepRegen,
  unlockedSpellIds,
  unlockedSpellIdsForStat,
  weaponDamageFor,
} from "@game/core";
import type { GameState } from "@game/core";
import { clearStage, makeEnemy, startGame } from "./helpers.ts";

/** Pin a build (raw STR/DEX/INT, linear — no diminishing in tests), resize the
 * mana pool, fill it, and drop `spellId` into slot 0 ready to cast. The dominant
 * stat decides the hero's class; INT still sizes the pool. */
function ready(
  state: GameState,
  spellId: string,
  opts: { str?: number; dex?: number; int?: number } = {},
): GameState {
  const { str = 0, dex = 0, int = 250 } = opts;
  state.player.level = 99;
  state.player.stats.strength = str;
  state.player.stats.dexterity = dex;
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

describe("class selection (dominant stat)", () => {
  it("dominantSpellStat picks the highest of STR/DEX/INT (≥ 10), else null", () => {
    expect(dominantSpellStat(120, 40, 30)).toBe("strength");
    expect(dominantSpellStat(20, 90, 60)).toBe("dexterity");
    expect(dominantSpellStat(70, 40, 80)).toBe("intelligence");
    // Nothing reaches the first unlock step → no class.
    expect(dominantSpellStat(9, 5, 0)).toBe(null);
    // A tie resolves to the STR > DEX > INT priority so the class never flickers.
    expect(dominantSpellStat(50, 50, 10)).toBe("strength");
  });

  it("each class has its own 25-power ladder, 10..250", () => {
    for (const stat of ["strength", "dexterity", "intelligence"] as const) {
      const ladder = spellsForStat(stat);
      expect(ladder).toHaveLength(25);
      expect(ladder.at(0)?.minStat).toBe(10);
      expect(ladder.at(-1)?.minStat).toBe(250);
      expect(ladder.every((d) => d.stat === stat)).toBe(true);
    }
  });

  it("a stat unlocks one power per ×10, ascending", () => {
    expect(unlockedSpellIdsForStat("intelligence", 0)).toHaveLength(0);
    expect(unlockedSpellIdsForStat("intelligence", 10)).toEqual(["arc_bolt"]);
    expect(unlockedSpellIdsForStat("strength", 10)).toEqual(["rending_strike"]);
    expect(unlockedSpellIdsForStat("dexterity", 10)).toEqual(["quick_shot"]);
    const at55 = unlockedSpellIdsForStat("intelligence", 55);
    expect(at55).toContain("arc_bolt");
    expect(at55).toContain("gravitic_pulse"); // minStat 50
    expect(at55).not.toContain("mending_light"); // minStat 60
    expect(unlockedSpellIdsForStat("strength", 250)).toHaveLength(25);
  });

  it("only the hero's class list surfaces — a warrior never sees magic", () => {
    const state = startGame();
    // A STR-dominant hero: melee ARTS only.
    ready(state, "cleave", { str: 200, int: 40 });
    expect(heroSpellStat(state)).toBe("strength");
    const unlocked = unlockedSpellIds(state);
    expect(unlocked).toContain("cleave");
    expect(unlocked).not.toContain("arc_bolt"); // a magic spell
    expect(unlocked.every((id) => spellDef(id).stat === "strength")).toBe(true);
  });
});

describe("availability gating", () => {
  it("a cast is refused (locked) while the class stat is below minStat", () => {
    const state = startGame();
    clearStage(state);
    ready(state, "frost_lance", { int: 20 }); // minStat 40, INT only 20
    state.events = [];
    expect(castSpell(state, 0)).toBe(false);
    expect(state.events.some((e) => e.type === "spellFizzled")).toBe(true);
    expect(state.player.mana).toBe(state.player.maxMana); // nothing spent
  });

  it("a cast is refused when the power is off-class", () => {
    const state = startGame();
    clearStage(state);
    // Warrior build, but a magic spell somehow slotted → not available.
    ready(state, "arc_bolt", { str: 250, int: 250 });
    // Force STR strictly dominant.
    state.player.stats.intelligence = 100;
    state.enemies = [tallMob(state, 40)];
    state.events = [];
    expect(castSpell(state, 0)).toBe(false);
    expect(
      state.events.some(
        (e) => e.type === "spellFizzled" && e.reason === "locked",
      ),
    ).toBe(true);
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
    const manaAfterFirst = state.player.mana;
    expect(castSpell(state, 0)).toBe(false);
    expect(state.player.mana).toBe(manaAfterFirst);

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
    state.enemies = [];
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

  it("a ranged RAIN lands its burst on a distant cluster", () => {
    const state = startGame();
    clearStage(state);
    ready(state, "arrow_volley", { dex: 250 }); // rain, castRange 200, radius 80
    // A pack far from the hero but tight around one target.
    const lead = tallMob(state, 150, 8030);
    const near = makeEnemy(
      {
        id: 8031,
        pos: { x: lead.pos.x + 30, y: lead.pos.y },
        hp: 1_000_000,
        maxHp: 1_000_000,
      },
      "test_minion",
    );
    state.enemies = [lead, near];
    expect(castSpell(state, 0)).toBe(true);
    // Both took damage — the burst centred on the cluster, not the hero's feet.
    expect(lead.hp).toBeLessThan(lead.maxHp);
    expect(near.hp).toBeLessThan(near.maxHp);
  });

  it("a rain with no target in castRange is refunded", () => {
    const state = startGame();
    clearStage(state);
    ready(state, "arrow_volley", { dex: 250 });
    state.enemies = [tallMob(state, 600, 8032)]; // beyond castRange
    const before = state.player.mana;
    expect(castSpell(state, 0)).toBe(false);
    expect(state.player.mana).toBe(before);
  });

  it("a heal restores hp (and refuses at full)", () => {
    const state = startGame();
    clearStage(state);
    ready(state, "mending_light");
    state.player.hp = 1;
    expect(castSpell(state, 0)).toBe(true);
    expect(state.player.hp).toBeGreaterThan(1);
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

describe("self-buff (martial signature)", () => {
  it("WAR CRY amps the hero's weapon damage, then lapses back to 1", () => {
    const state = startGame();
    clearStage(state);
    ready(state, "war_cry", { str: 200, int: 40 }); // buff damageMult 1.25
    const weapon = state.player.equipment.weapon;
    const before = weaponDamageFor(state, weapon);

    expect(castSpell(state, 0)).toBe(true);
    expect(state.player.buffMs).toBeGreaterThan(0);
    expect(state.player.buffDamageMult).toBeCloseTo(1.25, 5);
    const during = weaponDamageFor(state, weapon);
    expect(during).toBeCloseTo(before * 1.25, 3);

    // Run the timer past the buff's duration — the mults snap back to neutral.
    stepRegen(state, 7, 7000);
    expect(state.player.buffMs).toBe(0);
    expect(state.player.buffDamageMult).toBe(1);
    expect(weaponDamageFor(state, weapon)).toBeCloseTo(before, 3);
  });

  it("a re-cast refreshes to the stronger buff, never stacking", () => {
    const state = startGame();
    clearStage(state);
    ready(state, "war_cry", { str: 200, int: 40 });
    expect(castSpell(state, 0)).toBe(true);
    const mult = state.player.buffDamageMult;
    state.player.spellCooldowns = {};
    state.player.mana = state.player.maxMana;
    expect(castSpell(state, 0)).toBe(true);
    // Still the single buff's mult (max of equal casts), not doubled.
    expect(state.player.buffDamageMult).toBeCloseTo(mult, 5);
  });
});

describe("the unlock queue", () => {
  it("spellsUnlockedBetweenForStat reports the crossings in (before, after]", () => {
    expect(spellsUnlockedBetweenForStat("intelligence", 9, 10)).toEqual([
      "arc_bolt",
    ]);
    expect(spellsUnlockedBetweenForStat("intelligence", 10, 10)).toEqual([]);
    expect(spellsUnlockedBetweenForStat("intelligence", 15, 35)).toEqual([
      "ember_burst", // 20
      "mana_ward", // 30
    ]);
    expect(spellsUnlockedBetweenForStat("strength", 15, 35)).toEqual([
      "cleave", // 20
      "war_cry", // 30
    ]);
  });

  it("allocating a class point across a ×10 threshold enqueues its power", () => {
    const state = startGame();
    state.player.level = 99;
    // Make STRENGTH the dominant (class) stat, sitting at 9.
    state.player.stats.strength = 9;
    state.player.stats.dexterity = 0;
    state.player.stats.intelligence = 0;
    state.player.pendingStatPoints = 3;
    state.pendingSpellUnlocks = [];
    expect(effectiveStat(state, "strength")).toBe(9);
    allocateStat(state, "strength");
    expect(effectiveStat(state, "strength")).toBe(10);
    // 9 → 10 crosses the first melee ART; a warrior gets RENDING STRIKE.
    expect(state.pendingSpellUnlocks).toContain("rending_strike");
  });

  it("an off-class point crosses a threshold silently", () => {
    const state = startGame();
    state.player.level = 99;
    // INT is dominant (a mage); a STRENGTH point is off-class.
    state.player.stats.strength = 9;
    state.player.stats.dexterity = 0;
    state.player.stats.intelligence = 200;
    state.player.pendingStatPoints = 3;
    state.pendingSpellUnlocks = [];
    allocateStat(state, "strength"); // 9 → 10 STR, but STR isn't the class
    expect(state.pendingSpellUnlocks).not.toContain("rending_strike");
  });
});
