// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The passive TALENT system: the point economy (10 chosen points in a tree stat
// earn one talent point), the picker queue reconciled from stats + owned ranks,
// spending a point, the level-up pause that holds behind the picker, the respec
// floor that locks a spent point's earning stat, the veteran-conversion on load,
// the autopilot's talent pick, and the stat-modifier effect reads.
//
// Talents are ENGINE machinery (like the built-in `blaster` sidearm), so these
// tests reference the shipped talent ids directly rather than a fixture catalog.

import { describe, expect, it } from "vitest";

import {
  allocateStat,
  applyLoadout,
  availableTalentPoints,
  beginRespec,
  botPickTalent,
  computeMaxHp,
  createBot,
  deallocateStat,
  earnedTalentPoints,
  extractLoadout,
  grantedSpellRanks,
  hasPendingTalentPoint,
  playerCritChance,
  playerDodgeChance,
  playerSpeed,
  reconcileTalentPoints,
  spendTalentPoint,
  SPELL,
  talentBerserkMult,
  talentDamageReduction,
  talentPointsEarned,
  talentRank,
  talentSpellRanks,
  talentStatFloor,
  treeCapacity,
} from "@game/core";
import type { Equipment, GameState } from "@game/core";
import { idle, makeEnemy, run, startGame, stopWaves } from "./helpers.ts";

/** A level-99 hero with the given CHOSEN stats, its talent queue reconciled —
 * the state a build reaches before spending its earned talent points. */
function heroWithStats(
  opts: { str?: number; dex?: number; int?: number } = {},
): GameState {
  const state = startGame();
  const { str = 0, dex = 0, int = 0 } = opts;
  state.player.level = 99;
  state.player.stats.strength = str;
  state.player.stats.dexterity = dex;
  state.player.stats.intelligence = int;
  state.player.spentStats.strength = str;
  state.player.spentStats.dexterity = dex;
  state.player.spentStats.intelligence = int;
  reconcileTalentPoints(state);
  return state;
}

describe("the talent point economy", () => {
  it("earns one point per 10 CHOSEN points in a tree stat", () => {
    const spent = {
      strength: 45,
      dexterity: 30,
      intelligence: 9,
      stamina: 99,
      luck: 20,
      spirit: 0,
    };
    expect(earnedTalentPoints(spent, "strength")).toBe(4);
    expect(earnedTalentPoints(spent, "dexterity")).toBe(3);
    expect(earnedTalentPoints(spent, "intelligence")).toBe(0);
    // Only the three TREE stats count toward the total — STAMINA/LUCK/SPIRIT
    // points, however deep, mint nothing (they have no tree).
    expect(talentPointsEarned(spent)).toBe(7); // 4 + 3 + 0
  });

  it("reconciles the picker queue from stats, STR>DEX>INT ordered", () => {
    const state = heroWithStats({ str: 20, dex: 10, int: 0 });
    // 2 STR points + 1 DEX point, none spent yet.
    expect(state.pendingTalentPoints).toEqual([
      "strength",
      "strength",
      "dexterity",
    ]);
    expect(hasPendingTalentPoint(state)).toBe(true);
  });

  it("clamps available points to what the tree can still hold", () => {
    // A deep-INT hero earns 25 points but only `treeCapacity` of them can land
    // in the magic tree — the rest would strand, so the queue never holds them.
    const cap = treeCapacity("magic");
    const state = heroWithStats({ int: 250 });
    expect(earnedTalentPoints(state.player.spentStats, "intelligence")).toBe(
      25,
    );
    expect(availableTalentPoints(state, "intelligence")).toBe(cap);
    // No point is stranded past the capacity — the queue holds exactly `cap`.
    expect(state.pendingTalentPoints.length).toBe(cap);
  });

  it("spends a point, ranking the talent up and shrinking the queue", () => {
    const state = heroWithStats({ str: 20 });
    expect(state.pendingTalentPoints.length).toBe(2);
    expect(spendTalentPoint(state, "executioner")).toBe(true);
    expect(talentRank(state, "executioner")).toBe(1);
    expect(state.pendingTalentPoints.length).toBe(1);
    // A second point ranks it again.
    expect(spendTalentPoint(state, "executioner")).toBe(true);
    expect(talentRank(state, "executioner")).toBe(2);
    expect(hasPendingTalentPoint(state)).toBe(false);
  });

  it("refuses to overspend, to rank a maxed talent, or an unknown id", () => {
    const state = heroWithStats({ str: 10 }); // one melee point
    expect(spendTalentPoint(state, "not_a_talent")).toBe(false);
    expect(spendTalentPoint(state, "deadeye")).toBe(false); // ranged, no point
    expect(spendTalentPoint(state, "executioner")).toBe(true);
    // The single point is gone — a second spend fails.
    expect(spendTalentPoint(state, "executioner")).toBe(false);
    expect(talentRank(state, "executioner")).toBe(1);
  });

  it("won't rank a talent past its maxRank", () => {
    const state = heroWithStats({ str: 250 });
    for (let i = 0; i < 5; i++) {
      expect(spendTalentPoint(state, "bulwark")).toBe(true);
    }
    expect(talentRank(state, "bulwark")).toBe(5);
    // A 6th spend on the maxed talent fails even with points still available.
    expect(spendTalentPoint(state, "bulwark")).toBe(false);
  });
});

describe("the level-up pause holds behind the talent picker", () => {
  it("earns a talent point on a ×10 tree milestone and holds the pause", () => {
    const state = startGame();
    state.player.level = 99;
    state.player.stats.strength = 9;
    state.player.spentStats.strength = 9;
    state.player.pendingStatPoints = 1;
    state.phase = "levelup";
    allocateStat(state, "strength"); // 9 → 10: crosses the first STR milestone
    expect(state.player.pendingStatPoints).toBe(0);
    expect(state.pendingTalentPoints).toEqual(["strength"]);
    // The point is spent, but the picker holds the run frozen.
    expect(state.phase).toBe("levelup");
  });

  it("resumes only once the talent point is spent", () => {
    const state = startGame();
    state.player.level = 99;
    state.player.stats.strength = 9;
    state.player.spentStats.strength = 9;
    state.player.pendingStatPoints = 1;
    state.phase = "levelup";
    allocateStat(state, "strength");
    expect(state.phase).toBe("levelup");
    expect(spendTalentPoint(state, "ironhide")).toBe(true);
    expect(state.phase).toBe("playing");
  });

  it("resumes immediately when the last point crosses no milestone", () => {
    const state = startGame();
    state.player.level = 99;
    state.player.stats.strength = 12; // mid-decade: 12 → 13 crosses no ×10
    state.player.spentStats.strength = 12;
    // The point the first 10 STR already earned is spent (rank 1), so nothing
    // is pending going in — a realistic mid-decade hero.
    state.player.talents.executioner = 1;
    reconcileTalentPoints(state);
    expect(hasPendingTalentPoint(state)).toBe(false);
    state.player.pendingStatPoints = 1;
    state.phase = "levelup";
    allocateStat(state, "strength");
    expect(state.pendingTalentPoints).toHaveLength(0);
    expect(state.phase).toBe("playing");
  });

  it("earns per-stat for a HYBRID build (no dominant-stat gate)", () => {
    // 9 STR + 9 INT, one banked point each; each crossing earns in its own tree.
    const state = startGame();
    state.player.level = 99;
    state.player.stats.strength = 9;
    state.player.stats.intelligence = 9;
    state.player.spentStats.strength = 9;
    state.player.spentStats.intelligence = 9;
    state.player.pendingStatPoints = 2;
    state.phase = "levelup";
    allocateStat(state, "strength"); // earns a STR (melee) point
    allocateStat(state, "intelligence"); // earns an INT (magic) point
    expect(state.pendingTalentPoints).toEqual(["strength", "intelligence"]);
  });
});

describe("the respec floor locks a spent talent's earning stat", () => {
  it("reports 10 × ranks spent in the tree as the floor", () => {
    const state = heroWithStats({ str: 30 });
    spendTalentPoint(state, "executioner");
    spendTalentPoint(state, "bulwark");
    expect(talentStatFloor(state, "strength")).toBe(20); // 2 ranks × 10
    expect(talentStatFloor(state, "dexterity")).toBe(0);
    // A non-tree stat never floors.
    expect(talentStatFloor(state, "stamina")).toBe(0);
  });

  it("beginRespec keeps the floor placed and refunds only the surplus", () => {
    const state = heroWithStats({ str: 30 });
    spendTalentPoint(state, "executioner"); // 1 rank → floor 10
    const before = state.player.pendingStatPoints;
    beginRespec(state);
    // STR can't drop below the floor; the surplus (30 − 10) returns to the pool.
    expect(state.player.stats.strength).toBe(10);
    expect(state.player.spentStats.strength).toBe(10);
    expect(state.player.pendingStatPoints).toBe(before + 20);
    // The spent rank survives, and its point is not re-owed.
    expect(talentRank(state, "executioner")).toBe(1);
    expect(availableTalentPoints(state, "strength")).toBe(0);
  });

  it("deallocateStat refuses to drop a tree stat below its floor", () => {
    const state = heroWithStats({ str: 30 });
    spendTalentPoint(state, "executioner"); // floor 10
    beginRespec(state); // STR now sits at its floor of 10
    expect(deallocateStat(state, "strength")).toBe(false);
    expect(state.player.stats.strength).toBe(10);
  });

  it("revokes an UNSPENT point when a respec drops below its milestone", () => {
    const state = heroWithStats({ str: 20 }); // 2 earned, 0 spent
    spendTalentPoint(state, "executioner"); // 1 spent, 1 still pending
    expect(availableTalentPoints(state, "strength")).toBe(1);
    beginRespec(state); // keeps only the floor (10) — the 2nd milestone is gone
    expect(state.player.stats.strength).toBe(10);
    expect(availableTalentPoints(state, "strength")).toBe(0);
  });
});

describe("veteran conversion on load", () => {
  it("mints talent points from a legacy loadout's chosen stats", () => {
    const donor = heroWithStats({ str: 30, dex: 10 });
    const loadout = extractLoadout(donor);
    // Simulate a save banked before talents existed.
    delete (loadout as { talents?: unknown }).talents;
    const fresh = startGame();
    applyLoadout(fresh, loadout);
    // 3 STR + 1 DEX earned points, none spent — all pending after load.
    expect(fresh.pendingTalentPoints).toEqual([
      "strength",
      "strength",
      "strength",
      "dexterity",
    ]);
  });

  it("round-trips owned ranks and only owes the remainder", () => {
    const donor = heroWithStats({ str: 30 });
    spendTalentPoint(donor, "executioner"); // 1 of 3 spent
    const loadout = extractLoadout(donor);
    const fresh = startGame();
    applyLoadout(fresh, loadout);
    expect(talentRank(fresh, "executioner")).toBe(1);
    expect(fresh.pendingTalentPoints).toHaveLength(2); // 3 earned − 1 spent
  });
});

describe("the autopilot spends talent points", () => {
  it("picks the build's top priority talent in the earning tree", () => {
    const bot = createBot("balanced", "melee");
    const state = heroWithStats({ str: 20 });
    const id = botPickTalent(bot, state);
    // The melee build leads with executioner.
    expect(id).toBe("executioner");
    expect(spendTalentPoint(state, id!)).toBe(true);
  });

  it("only ever picks a talent in the front point's tree", () => {
    const bot = createBot("balanced", "melee");
    const state = heroWithStats({ int: 10 }); // an INT (magic) point
    const id = botPickTalent(bot, state);
    expect(id).toBe("mage_armor"); // the only magic talent
  });
});

describe("stat-modifier effect reads", () => {
  it("BULWARK deepens the max-hp pool per rank", () => {
    const base = heroWithStats({ str: 50 });
    const baseHp = computeMaxHp(base);
    spendTalentPoint(base, "bulwark"); // +5% per rank
    expect(computeMaxHp(base)).toBeGreaterThan(baseHp);
  });

  it("WIND RUNNER quickens the walk per rank", () => {
    const state = heroWithStats({ dex: 50 });
    const baseSpeed = playerSpeed(state);
    spendTalentPoint(state, "wind_runner");
    expect(playerSpeed(state)).toBeGreaterThan(baseSpeed);
  });

  it("EVASION lifts dodge chance per rank", () => {
    const state = heroWithStats({ dex: 50 });
    const baseDodge = playerDodgeChance(state);
    spendTalentPoint(state, "evasion");
    expect(playerDodgeChance(state)).toBeGreaterThan(baseDodge);
  });

  it("EXECUTIONER lifts crit only for MELEE, DEADEYE only for RANGED", () => {
    const state = heroWithStats({ str: 50, dex: 50 });
    const meleeBefore = playerCritChance(state, "melee");
    const rangedBefore = playerCritChance(state, "ranged");
    spendTalentPoint(state, "executioner"); // melee tree
    expect(playerCritChance(state, "melee")).toBeGreaterThan(meleeBefore);
    // The melee talent leaves the ranged crit untouched.
    expect(playerCritChance(state, "ranged")).toBeCloseTo(rangedBefore, 5);
  });

  it("IRONHIDE + MAGE ARMOR cut incoming damage at the choke point", () => {
    const state = heroWithStats({ str: 50, int: 50 });
    expect(talentDamageReduction(state)).toBe(0);
    spendTalentPoint(state, "ironhide"); // +3%
    spendTalentPoint(state, "mage_armor"); // +3%
    expect(talentDamageReduction(state)).toBeCloseTo(0.06, 5);
  });

  it("BERSERKER RAGE scales weapon damage with MISSING hp", () => {
    const state = heroWithStats({ str: 50 });
    spendTalentPoint(state, "berserker_rage"); // +10% at 0 hp, rank 1
    state.player.maxHp = 100;
    state.player.hp = 100; // full → no bonus
    expect(talentBerserkMult(state)).toBeCloseTo(1, 5);
    state.player.hp = 50; // half → half the bonus
    expect(talentBerserkMult(state)).toBeCloseTo(1.05, 5);
    state.player.hp = 0; // dead-ish → full bonus
    expect(talentBerserkMult(state)).toBeCloseTo(1.1, 5);
  });
});

describe("magic CONJURATION talents feed the granted-spell machinery", () => {
  it("an untrained hero conjures nothing", () => {
    const state = heroWithStats({ int: 50 });
    expect(talentSpellRanks(state)).toEqual({});
    expect(grantedSpellRanks(state)).toEqual({});
  });

  it("ORBITING FLAMES / STORM CALL feed the orbit / storm spell at their rank", () => {
    const state = heroWithStats({ int: 50 }); // 5 magic points
    spendTalentPoint(state, "orbiting_flames");
    spendTalentPoint(state, "orbiting_flames"); // rank 2
    spendTalentPoint(state, "storm_call"); // rank 1
    expect(talentSpellRanks(state)).toEqual({ orbit: 2, storm: 1 });
    // The derivation the always-on spell step reads sees the same ranks.
    expect(grantedSpellRanks(state)).toEqual({ orbit: 2, storm: 1 });
  });

  it("talent ranks STACK on top of a worn item that grants the same spell", () => {
    const state = heroWithStats({ int: 50 });
    spendTalentPoint(state, "orbiting_flames"); // talent rank 1
    const charm: Equipment = {
      id: 8001,
      defId: "test_charm",
      slot: "charm",
      tier: "legendary",
      ilvl: 50,
      affixes: [{ kind: "spell", spell: "orbit", rank: 2 }],
    };
    state.player.equipment.charm = charm;
    // 1 (talent) + 2 (item) → one rank-3 orbit spell.
    expect(grantedSpellRanks(state)).toEqual({ orbit: 3 });
  });

  it("a trained ORBITING FLAMES actually burns a foe through the live step", () => {
    const state = heroWithStats({ int: 50 });
    spendTalentPoint(state, "orbiting_flames"); // rank 1: one orb on the ring
    // A quiet arena: no waves, the hero holstered, a pinned rng, one mob sitting
    // on the orbit ring so an orb sweeps through it. Any damage is the talent's.
    stopWaves(state);
    state.player.disarmed = true;
    state.rng = () => 0.99;
    const hp = 500;
    const mob = makeEnemy({
      pos: {
        x: state.player.pos.x + SPELL.orbit.radius,
        y: state.player.pos.y,
      },
      hp,
      maxHp: hp,
      speed: 0,
    });
    state.enemies = [mob];
    run(state, idle, 3);
    expect(mob.hp).toBeLessThan(hp);
    expect(state.player.itemSpells).toEqual([
      expect.objectContaining({ spell: "orbit", rank: 1 }),
    ]);
  });
});
