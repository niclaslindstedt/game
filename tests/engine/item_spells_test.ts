// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// GRANTED SPELLS, PROCS, SURE STRIKE, and the 99+ SCALING MINT — the forever
// powers items carry (the `spell`/`proc`/`sureStrike` affix kinds, config
// SPELL) and the legendary endgame rules (UNIQUE.scalingPerIlvl /
// rarityBudgetRef). Exercised on synthetic fixtures so the rules survive
// content deletion.

import { describe, expect, it } from "vitest";

import { SPELL, UNIQUE, playerMissChance, stasisFactorAt } from "@game/core";
import type { Equipment, GameState } from "@game/core";
import { registerDefs } from "@game/core";
// Engine internals: the kill funnel (proc queueing), the granted-spell
// derivation, and the mint/rarity rules under test.
import { hitEnemy } from "../../src/game/loot.ts";
import {
  spellIntervalScale,
  stormSpellParams,
  syncItemSpells,
} from "../../src/game/spells.ts";
import { mintUnique, uniqueDropWeight } from "../../src/game/items.ts";
import type { UniqueDef } from "../../src/game/defs/uniques.ts";

import { FIX_UNIQUES } from "./fixtures.ts";
import { idle, makeEnemy, run, startGame, stopWaves } from "./helpers.ts";

// ---- Scaffolding ---------------------------------------------------------------

let nextItemId = 9000;

/** A worn charm carrying exactly the given affixes (the granted-power tests'
 * one lever — the fixture charm base itself carries nothing). */
function wearCharm(state: GameState, affixes: Equipment["affixes"]): void {
  state.player.equipment.charm = {
    id: nextItemId++,
    defId: "test_charm",
    slot: "charm",
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
  state.player.disarmed = true;
  state.rng = () => 0.99;
  const pos = {
    x: state.player.pos.x + offset.x,
    y: state.player.pos.y + offset.y,
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
    expect(state.player.itemSpells).toHaveLength(1);

    // Dropping the charm silences the spell on the next tick.
    state.player.equipment.charm = null;
    run(state, idle, 1);
    expect(state.player.itemSpells).toHaveLength(0);
  });

  it("a worn storm strikes the nearest foe on its interval", () => {
    const state = startGame();
    wearCharm(state, [{ kind: "spell", spell: "storm", rank: 1 }]);
    const mob = stageMob(state, { x: 120, y: 0 });
    run(state, idle, 1);
    // The first strike lands immediately (cooldown starts spent) and pays the
    // rank-1 bolt at the level-1 power scale.
    expect(mob.hp).toBe(500 - SPELL.storm.damage);
    expect(state.events.some((e) => e.type === "lightning")).toBe(true);
  });

  it("a worn stasis field slows foes inside its ring, not outside", () => {
    const state = startGame();
    wearCharm(state, [{ kind: "spell", spell: "stasis", rank: 1 }]);
    syncItemSpells(state);
    const near = {
      x: state.player.pos.x + SPELL.stasis.radius - 10,
      y: state.player.pos.y,
    };
    const far = {
      x: state.player.pos.x + SPELL.stasis.radius + 200,
      y: state.player.pos.y,
    };
    expect(stasisFactorAt(state, near)).toBe(SPELL.stasis.slowFactor);
    expect(stasisFactorAt(state, far)).toBe(1);
  });

  it("INTELLIGENCE shortens the granted intervals, floored", () => {
    const state = startGame();
    const base = stormSpellParams(state, 1).intervalMs;
    state.player.stats.intelligence = 20;
    const quicker = stormSpellParams(state, 1).intervalMs;
    expect(quicker).toBeLessThan(base);
    // A tower of INT can halve the cadence, never abolish it.
    state.player.stats.intelligence = 10_000;
    expect(spellIntervalScale(state)).toBe(SPELL.intervalFloor);
  });

  it("ranks from multiple worn sources ADD into one stronger spell", () => {
    const state = startGame();
    wearCharm(state, [{ kind: "spell", spell: "orbit", rank: 1 }]);
    state.player.equipment.head = {
      id: nextItemId++,
      defId: "test_helmet",
      slot: "head",
      tier: "legendary",
      ilvl: 50,
      affixes: [{ kind: "spell", spell: "orbit", rank: 2 }],
    };
    syncItemSpells(state);
    expect(state.player.itemSpells).toEqual([
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
    expect(mob.hp).toBe(hpAfterBlow - SPELL.bolt.damage);
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

  it("an on-kill NOVA bursts around the victim and bills the neighbors", () => {
    const state = startGame();
    wearCharm(state, [
      { kind: "proc", trigger: "kill", spell: "nova", chance: 1, rank: 1 },
    ]);
    stopWaves(state);
    state.player.disarmed = true;
    const at = { x: state.player.pos.x + 200, y: state.player.pos.y };
    const victim = makeEnemy({ pos: at, hp: 1, speed: 0 });
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
    expect(neighbor.hp).toBe(500 - SPELL.nova.damage);
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
    state.player.equipment.charm = null;
    expect(playerMissChance(state)).toBeGreaterThan(0);
  });
});

// ---- The 99+ scaling mint & budget-derived rarity ---------------------------------

const SCALING_LEGEND: UniqueDef = {
  id: "test_scaling_legend",
  name: "TEST SCALING LEGEND",
  base: "test_charm",
  slot: "charm",
  tier: "legendary",
  scaling: true,
  ilvl: 99,
  bonuses: [
    { kind: "stat", stat: "strength", value: 10 },
    { kind: "crit", value: 0.1 },
  ],
  lore: "IT GROWS WITH THE KILL THAT YIELDS IT.",
};

function installScalingFixtures(): void {
  registerDefs({
    uniques: { ...FIX_UNIQUES, test_scaling_legend: SCALING_LEGEND },
  });
}

describe("99+ scaling legendaries", () => {
  it("a deeper kill stamps its mlvl and grows the numeric bonuses", () => {
    installScalingFixtures();
    const state = startGame();
    const grown = mintUnique(state, "test_scaling_legend", { mlvl: 110 });
    expect(grown.ilvl).toBe(110);
    const growth = 1 + UNIQUE.scalingPerIlvl * (110 - 99);
    expect(grown.affixes).toContainEqual({
      kind: "stat",
      stat: "strength",
      value: Math.round(10 * growth),
    });
    const crit = grown.affixes.find((a) => a.kind === "crit");
    expect(crit && "value" in crit ? crit.value : 0).toBeCloseTo(0.1 * growth);
  });

  it("mints at the authored floor off shallower kills and scripted mints", () => {
    installScalingFixtures();
    const state = startGame();
    for (const minted of [
      mintUnique(state, "test_scaling_legend", { mlvl: 60 }),
      mintUnique(state, "test_scaling_legend"),
    ]) {
      expect(minted.ilvl).toBe(99);
      expect(minted.affixes).toContainEqual({
        kind: "stat",
        stat: "strength",
        value: 10,
      });
    }
  });

  it("a non-scaling unique ignores the kill's mlvl entirely", () => {
    installScalingFixtures();
    const state = startGame();
    const relic = mintUnique(state, "test_greedy_relic", { mlvl: 110 });
    expect(relic.ilvl).toBe(FIX_UNIQUES.test_greedy_relic?.ilvl);
  });
});

describe("stats determine legendary rarity", () => {
  const legend = (budgetStat: number): UniqueDef => ({
    id: "test_budget_legend",
    name: "TEST BUDGET LEGEND",
    base: "test_charm",
    slot: "charm",
    tier: "legendary",
    ilvl: 99,
    bonuses: [{ kind: "stat", stat: "strength", value: budgetStat }],
    lore: "ITS POWER IS ITS ODDS.",
  });

  it("a stronger bonus budget mechanically lowers the drop weight", () => {
    // At/below the reference budget the authored weight stands; past it the
    // weight falls in proportion — twice the reference is half as common.
    const atRef = uniqueDropWeight(legend(UNIQUE.rarityBudgetRef), "legendary");
    const double = uniqueDropWeight(
      legend(UNIQUE.rarityBudgetRef * 2),
      "legendary",
    );
    expect(atRef).toBe(UNIQUE.defaultRarity);
    expect(double).toBeCloseTo(UNIQUE.defaultRarity / 2);
  });

  it("plain uniques keep their flat authored weight regardless of budget", () => {
    const heavy = legend(UNIQUE.rarityBudgetRef * 4);
    expect(uniqueDropWeight({ ...heavy, tier: "unique" }, "unique")).toBe(
      UNIQUE.defaultRarity,
    );
  });
});
