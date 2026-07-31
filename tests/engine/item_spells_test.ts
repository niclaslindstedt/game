// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// GRANTED SPELLS, PROCS, and SURE STRIKE — the forever powers items carry
// (the `spell`/`proc`/`sureStrike` affix kinds, config SPELL) — plus the
// legendary rarity law (weight ∝ (rarityBudgetRef/budget)^rarityBudgetExp:
// stats determine rarity). Exercised on synthetic fixtures so the rules
// survive content deletion.

import { describe, expect, it } from "vitest";

import {
  MENACE,
  SPELL,
  UNIQUE,
  playerMissChance,
  stasisFactorAt,
} from "@game/core";
import type { Equipment, GameState } from "@game/core";
// Engine internals: the kill funnel (proc queueing), the granted-spell
// derivation, and the mint/rarity rules under test.
import { hitEnemy, queueStruckProcs } from "../../src/game/loot.ts";
import {
  spellIntervalScale,
  stormSpellBlock,
  syncItemSpells,
} from "../../src/game/spells.ts";
import { uniqueDropWeight } from "../../src/game/items/index.ts";
import type { UniqueDef } from "../../src/game/defs/uniques.ts";

import { idle, makeEnemy, run, startGame, stopWaves } from "./helpers.ts";

/**
 * A level-1, zero-INT hero's `abilityPowerScale` — the reference-minion anchor
 * every spell, proc and powerup figure is authored against. It is the flat
 * mob-hp scale, because the reference minion's healthbar carries that scale
 * too: a spell written at 22 is still "a fifth of a level-1 minion", the same
 * as before the weapon damper moved to the mob side.
 */
const ABILITY_SCALE = MENACE.mobHpBase;

/** What a spell/proc written at `d` actually bills, rounded the way the engine
 * rounds it — the anchor is no longer a whole number, so the expectations have
 * to round exactly where `hitEnemy` does rather than carry a fraction. */
const scaled = (d: number) => Math.round(d * ABILITY_SCALE);

// ---- Scaffolding ---------------------------------------------------------------

let nextItemId = 9000;

/** A worn AMULET carrying exactly the given affixes (the granted-power tests'
 * one lever — the fixture amulet base itself carries nothing). */
function wearCharm(state: GameState, affixes: Equipment["affixes"]): void {
  state.players[0].equipment.amulet = {
    id: nextItemId++,
    defId: "test_amulet",
    slot: "amulet",
    tier: "legendary",
    ilvl: 50,
    affixes,
  };
}

/** A quiet arena: no waves, no auto-attack (holstered), a pinned rng (no
 * crits, no whiffs, no drops), one staged mob. Any damage the mob takes is
 * the granted power's, at its exact authored size. */
function stageMob(
  state: GameState,
  offset: { x: number; y: number },
  hp = 500,
) {
  stopWaves(state);
  state.players[0].disarmed = true;
  state.rng = () => 0.99;
  const pos = {
    x: state.players[0].pos.x + offset.x,
    y: state.players[0].pos.y + offset.y,
  };
  const mob = makeEnemy({ pos, hp, maxHp: hp, speed: 0 });
  state.enemies = [mob];
  return mob;
}

// ---- Granted spells -------------------------------------------------------------

describe("granted spells (the `spell` affix)", () => {
  it("a worn orbit spell's orbs damage what they touch — and vanish with the piece", () => {
    const state = startGame();
    wearCharm(state, [{ kind: "spell", spell: "orbit", rank: 1 }]);
    const mob = stageMob(state, { x: SPELL.orbit.radius, y: 0 });
    run(state, idle, 3);
    expect(mob.hp).toBeLessThan(500);
    expect(state.players[0].itemSpells).toHaveLength(1);

    // Dropping the amulet silences the spell on the next tick.
    state.players[0].equipment.amulet = null;
    run(state, idle, 1);
    expect(state.players[0].itemSpells).toHaveLength(0);
  });

  it("a worn storm strikes the nearest foe on its interval", () => {
    const state = startGame();
    wearCharm(state, [{ kind: "spell", spell: "storm", rank: 1 }]);
    const mob = stageMob(state, { x: 120, y: 0 });
    run(state, idle, 1);
    // The first strike lands immediately (cooldown starts spent) and pays the
    // rank-1 bolt at the level-1 power scale.
    expect(mob.hp).toBe(500 - scaled(SPELL.storm.damage));
    expect(state.events.some((e) => e.type === "lightning")).toBe(true);
  });

  it("a worn stasis field slows foes inside its ring, not outside", () => {
    const state = startGame();
    wearCharm(state, [{ kind: "spell", spell: "stasis", rank: 1 }]);
    syncItemSpells(state);
    const near = {
      x: state.players[0].pos.x + SPELL.stasis.radius - 10,
      y: state.players[0].pos.y,
    };
    const far = {
      x: state.players[0].pos.x + SPELL.stasis.radius + 200,
      y: state.players[0].pos.y,
    };
    expect(stasisFactorAt(state, near)).toBe(SPELL.stasis.slowFactor);
    expect(stasisFactorAt(state, far)).toBe(1);
  });

  it("INTELLIGENCE shortens the granted intervals, floored", () => {
    const state = startGame();
    const base = stormSpellBlock(state, 1).intervalMs;
    state.players[0].stats.intelligence = 20;
    const quicker = stormSpellBlock(state, 1).intervalMs;
    expect(quicker).toBeLessThan(base);
    // A tower of INT can halve the cadence, never abolish it.
    state.players[0].stats.intelligence = 10_000;
    expect(spellIntervalScale(state)).toBe(SPELL.intervalFloor);
  });

  it("ranks from multiple worn sources ADD into one stronger spell", () => {
    const state = startGame();
    wearCharm(state, [{ kind: "spell", spell: "orbit", rank: 1 }]);
    state.players[0].equipment.head = {
      id: nextItemId++,
      defId: "test_helmet",
      slot: "head",
      tier: "legendary",
      ilvl: 50,
      affixes: [{ kind: "spell", spell: "orbit", rank: 2 }],
    };
    syncItemSpells(state);
    expect(state.players[0].itemSpells).toEqual([
      expect.objectContaining({ spell: "orbit", rank: 3 }),
    ]);
  });
});

// ---- Procs -----------------------------------------------------------------------

describe("procs (the `proc` affix)", () => {
  it("an on-hit BOLT queues on the hero's weapon blow and strikes next tick — once", () => {
    const state = startGame();
    wearCharm(state, [
      { kind: "proc", trigger: "hit", spell: "bolt", chance: 1, rank: 1 },
    ]);
    const mob = stageMob(state, { x: 200, y: 0 });
    state.rng = () => 0.99; // blow lands, no crit, the certain proc queues
    hitEnemy(state, mob, 10, "melee", { rollAccuracy: true });
    expect(state.pendingProcs).toHaveLength(1);
    const hpAfterBlow = mob.hp;

    run(state, idle, 1);
    expect(mob.hp).toBe(hpAfterBlow - scaled(SPELL.bolt.damage));
    expect(state.events.some((e) => e.type === "lightning")).toBe(true);
    // The bolt's own hit is not a weapon blow: nothing re-queued.
    expect(state.pendingProcs).toHaveLength(0);
  });

  it("a companion-style blow (no accuracy roll) never procs", () => {
    const state = startGame();
    wearCharm(state, [
      { kind: "proc", trigger: "hit", spell: "bolt", chance: 1, rank: 1 },
    ]);
    const mob = stageMob(state, { x: 200, y: 0 });
    state.rng = () => 0.99;
    hitEnemy(state, mob, 10, "melee");
    expect(state.pendingProcs).toHaveLength(0);
  });

  it("a WHEN-STRUCK proc casts back when an enemy blow lands on the hero", () => {
    const state = startGame();
    wearCharm(state, [
      { kind: "proc", trigger: "struck", spell: "bolt", chance: 1, rank: 1 },
    ]);
    const mob = stageMob(state, { x: 200, y: 0 });
    // The engine-internal queue hook the contact/mechanic/hostile-shot paths
    // call when a blow actually lands.
    queueStruckProcs(state, mob);
    expect(state.pendingProcs).toHaveLength(1);
    const before = mob.hp;
    run(state, idle, 1);
    expect(mob.hp).toBe(before - scaled(SPELL.bolt.damage));
    expect(state.events.some((e) => e.type === "lightning")).toBe(true);
  });

  it("a struck NOVA bursts around the HERO, and an unknown attacker still bolts the nearest foe", () => {
    const state = startGame();
    wearCharm(state, [
      { kind: "proc", trigger: "struck", spell: "nova", chance: 1, rank: 1 },
      { kind: "proc", trigger: "struck", spell: "bolt", chance: 1, rank: 1 },
    ]);
    // A foe hugging the hero: inside the player-centred nova ring, and the
    // nearest candidate for the shooterless bolt.
    const mob = stageMob(state, { x: SPELL.nova.radius - 10, y: 0 });
    queueStruckProcs(state); // a hostile shot — no attacker tracked
    expect(state.pendingProcs).toHaveLength(2);
    const before = mob.hp;
    run(state, idle, 1);
    expect(mob.hp).toBe(
      before - scaled(SPELL.nova.damage) - scaled(SPELL.bolt.damage),
    );
    expect(state.events.some((e) => e.type === "nova")).toBe(true);
  });

  it("an on-kill NOVA bursts around the victim and bills the neighbors", () => {
    const state = startGame();
    wearCharm(state, [
      { kind: "proc", trigger: "kill", spell: "nova", chance: 1, rank: 1 },
    ]);
    stopWaves(state);
    state.players[0].disarmed = true;
    const at = { x: state.players[0].pos.x + 200, y: state.players[0].pos.y };
    // Low mlvl → the kill pays trivial (level-based) xp, so no incidental ding
    // inflates abilityPowerScale and the nova damage this test measures.
    const victim = makeEnemy({ pos: at, hp: 1, speed: 0, mlvl: 1 });
    const neighbor = makeEnemy({
      id: 9001,
      pos: { x: at.x + SPELL.nova.radius - 10, y: at.y },
      hp: 500,
      maxHp: 500,
      speed: 0,
    });
    state.enemies = [victim, neighbor];
    state.rng = () => 0.99;
    hitEnemy(state, victim, 99, "melee", { rollAccuracy: true });
    expect(state.pendingProcs).toHaveLength(1);

    run(state, idle, 1);
    expect(neighbor.hp).toBe(500 - scaled(SPELL.nova.damage));
    expect(state.events.some((e) => e.type === "nova")).toBe(true);
    expect(state.pendingProcs).toHaveLength(0);
  });
});

// ---- Sure strike -----------------------------------------------------------------

describe("sure strike", () => {
  it("zeroes the hero's innate miss chance while worn", () => {
    const state = startGame();
    expect(playerMissChance(state)).toBeGreaterThan(0);
    wearCharm(state, [{ kind: "sureStrike" }]);
    expect(playerMissChance(state)).toBe(0);
    state.players[0].equipment.amulet = null;
    expect(playerMissChance(state)).toBeGreaterThan(0);
  });
});

// ---- Stats determine rarity --------------------------------------------------------

describe("stats determine legendary rarity", () => {
  const legend = (budgetStat: number): UniqueDef => ({
    id: "test_budget_legend",
    name: "TEST BUDGET LEGEND",
    base: "test_amulet",
    slot: "amulet",
    tier: "legendary",
    ilvl: 99,
    bonuses: [{ kind: "stat", stat: "strength", value: budgetStat }],
    lore: "ITS POWER IS ITS ODDS.",
  });

  it("a stronger bonus budget lowers the drop weight as a POWER LAW", () => {
    // At/below the reference budget the authored weight stands; past it the
    // weight collapses — twice the reference is 2^exp rarer, five times is
    // hundreds of times rarer. Vast authored power ⇒ astronomically rare.
    const atRef = uniqueDropWeight(legend(UNIQUE.rarityBudgetRef), "legendary");
    const double = uniqueDropWeight(
      legend(UNIQUE.rarityBudgetRef * 2),
      "legendary",
    );
    const god = uniqueDropWeight(
      legend(UNIQUE.rarityBudgetRef * 5),
      "legendary",
    );
    expect(atRef).toBe(UNIQUE.defaultRarity);
    expect(double).toBeCloseTo(
      UNIQUE.defaultRarity / Math.pow(2, UNIQUE.rarityBudgetExp),
    );
    expect(god).toBeCloseTo(
      UNIQUE.defaultRarity / Math.pow(5, UNIQUE.rarityBudgetExp),
    );
    expect(atRef / god).toBeGreaterThan(100);
  });

  it("plain uniques keep their flat authored weight regardless of budget", () => {
    const heavy = legend(UNIQUE.rarityBudgetRef * 4);
    expect(uniqueDropWeight({ ...heavy, tier: "unique" }, "unique")).toBe(
      UNIQUE.defaultRarity,
    );
  });
});
