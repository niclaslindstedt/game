// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The passive TALENT system: the point economy (10 chosen points in a tree stat
// earn one talent point), the picker queue reconciled from stats + owned ranks,
// spending a point, the level-up pause that holds behind the picker, the respec
// floor that locks a spent point's earning stat, the veteran-conversion on load,
// the autopilot's talent pick, and the stat-modifier effect reads.
//
// Talents are ENGINE machinery (like the built-in `blaster` sidearm), so these
// tests reference the shipped talent ids directly rather than a fixture catalog.

import { afterEach, describe, expect, it } from "vitest";

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
  resetBalanceTuning,
  setBalanceTuning,
  spendTalentPoint,
  SPELL,
  talentBerserkMult,
  talentCleavingEcho,
  talentConcussive,
  talentCrippling,
  talentDamageReduction,
  talentEvasionBurstMs,
  talentEvasionBurstMult,
  talentFrostNova,
  talentJumpMods,
  talentParry,
  talentPiercing,
  talentPointsEarned,
  talentRank,
  talentReflectFrac,
  talentSeismic,
  talentSpellRanks,
  talentStatFloor,
  talentTwinStrike,
  talentVolley,
  treeCapacity,
} from "@game/core";
import type { Equipment, GameState } from "@game/core";
import {
  equipBlaster,
  idle,
  jumpOnce,
  makeEnemy,
  run,
  startGame,
  stopWaves,
} from "./helpers.ts";

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
    // With a full 8-talent tree (40 ranks) the 250-stat hard cap (25 points)
    // can never overflow it, so every earned point lands — the clamp is slack
    // but still holds: available is the min of earned and remaining capacity.
    const cap = treeCapacity("magic");
    expect(cap).toBeGreaterThanOrEqual(25); // even a full spec can't max the tree
    const state = heroWithStats({ int: 250 });
    expect(earnedTalentPoints(state.player.spentStats, "intelligence")).toBe(
      25,
    );
    // All 25 earned points fit — none stranded.
    expect(availableTalentPoints(state, "intelligence")).toBe(25);
    expect(state.pendingTalentPoints.length).toBe(25);
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
    // A melee build's stray INT point dips into the magic tree's ward first.
    expect(id).toBe("mage_armor");
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

  it("SEEKER ORBS / IMMOLATION / SINGULARITY feed their own spell at their rank", () => {
    const state = heroWithStats({ int: 50 });
    spendTalentPoint(state, "seeker_orbs");
    spendTalentPoint(state, "immolation_aura");
    spendTalentPoint(state, "immolation_aura"); // rank 2
    spendTalentPoint(state, "arcane_singularity");
    expect(talentSpellRanks(state)).toEqual({
      seeker: 1,
      immolation: 2,
      singularity: 1,
    });
    expect(grantedSpellRanks(state)).toEqual({
      seeker: 1,
      immolation: 2,
      singularity: 1,
    });
  });
});

/** Stage a holstered hero (only the trained conjuration deals damage) in a quiet
 * arena with a pinned rng — any damage a mob takes is the talent's. */
function conjurerArena(talentId: string, ranks = 1): GameState {
  const state = heroWithStats({ int: 50 });
  for (let i = 0; i < ranks; i++) spendTalentPoint(state, talentId);
  stopWaves(state);
  state.player.disarmed = true;
  state.rng = () => 0.99;
  return state;
}

describe("the new magic conjurations kill through the live step", () => {
  it("IMMOLATION AURA scorches a foe standing inside the ring", () => {
    const state = conjurerArena("immolation_aura");
    const hp = 5000;
    const mob = makeEnemy({
      pos: { x: state.player.pos.x + 12, y: state.player.pos.y },
      hp,
      maxHp: hp,
      speed: 0,
    });
    state.enemies = [mob];
    // A full aura tick lands within ~40 frames (tickMs, INT-quickened).
    run(state, idle, 45);
    expect(mob.hp).toBeLessThan(hp);
  });

  it("SEEKER ORBS loose a homing burst that finds a distant foe", () => {
    const state = conjurerArena("seeker_orbs");
    const hp = 5000;
    const mob = makeEnemy({
      pos: { x: state.player.pos.x + 120, y: state.player.pos.y },
      hp,
      maxHp: hp,
      speed: 0,
    });
    state.enemies = [mob];
    // The first orb spawns on frame one; give it flight time to home in.
    let spawned = false;
    for (let i = 0; i < 90; i++) {
      run(state, idle, 1);
      if (state.projectiles.some((p) => p.burst)) spawned = true;
    }
    expect(spawned).toBe(true);
    expect(mob.hp).toBeLessThan(hp);
  });

  it("ARCANE SINGULARITY drags a nearby foe inward and crushes both", () => {
    const state = conjurerArena("arcane_singularity");
    const hp = 5000;
    const cx = state.player.pos.x + 120;
    const cy = state.player.pos.y;
    const seed = makeEnemy({ pos: { x: cx, y: cy }, hp, maxHp: hp, speed: 0 });
    const drawn = makeEnemy(
      { pos: { x: cx, y: cy + 60 }, hp, maxHp: hp, speed: 0 },
      "test_minion",
    );
    drawn.id = 9001;
    state.enemies = [seed, drawn];
    const before = Math.hypot(drawn.pos.x - cx, drawn.pos.y - cy);
    run(state, idle, 2); // the collapse fires on frame one (cooldown starts at 0)
    const after = Math.hypot(drawn.pos.x - cx, drawn.pos.y - cy);
    expect(after).toBeLessThan(before); // pulled toward the vortex core
    expect(seed.hp).toBeLessThan(hp);
    expect(drawn.hp).toBeLessThan(hp);
  });
});

describe("the magic tree's STRUCK defenses", () => {
  it("FROST NOVA scales its ring, freeze, and cooldown with rank", () => {
    const state = heroWithStats({ int: 50 });
    expect(talentFrostNova(state)).toBeNull(); // untrained
    spendTalentPoint(state, "frost_nova"); // rank 1
    const r1 = talentFrostNova(state)!;
    spendTalentPoint(state, "frost_nova");
    spendTalentPoint(state, "frost_nova");
    spendTalentPoint(state, "frost_nova");
    spendTalentPoint(state, "frost_nova"); // rank 5
    const r5 = talentFrostNova(state)!;
    expect(r5.radius).toBeGreaterThan(r1.radius);
    expect(r5.freezeMs).toBeGreaterThan(r1.freezeMs);
    // Rank shortens the internal cooldown, never below the floor.
    expect(r5.cooldownMs).toBeLessThan(r1.cooldownMs);
    expect(r5.cooldownMs).toBeGreaterThanOrEqual(0);
  });

  it("FROST NOVA freezes the swarm when the hero is struck, then goes on cooldown", () => {
    const state = heroWithStats({ int: 50 });
    spendTalentPoint(state, "frost_nova");
    stopWaves(state);
    state.player.disarmed = false;
    state.player.maxHp = 1e6;
    state.player.hp = 1e6; // survive the blows so the assert is reached
    state.rng = () => 0.99; // no dodge
    const mob = makeEnemy({
      pos: { ...state.player.pos }, // touching → a contact blow lands
      hp: 1e6,
      maxHp: 1e6,
      speed: 0,
      contactCooldownMs: 0,
    });
    state.enemies = [mob];
    run(state, idle, 20);
    expect(mob.chillMs).toBeGreaterThan(0); // frozen by the nova
    expect(state.player.frostNovaCooldownMs).toBeGreaterThan(0); // armed
  });

  it("ARCANE RETRIBUTION reflects a share of every blow back at the attacker", () => {
    expect(talentReflectFrac(heroWithStats({ int: 50 }))).toBe(0); // untrained
    // Two identical struck runs — one with Retribution, one without: the
    // reflected bite makes the attacker lose strictly more hp.
    const stage = (reflect: boolean): number => {
      const state = heroWithStats({ int: 50 });
      if (reflect) spendTalentPoint(state, "arcane_retribution");
      stopWaves(state);
      state.player.disarmed = false;
      state.player.maxHp = 1e6;
      state.player.hp = 1e6;
      state.rng = () => 0.99;
      const mob = makeEnemy({
        pos: { ...state.player.pos },
        hp: 1e6,
        maxHp: 1e6,
        speed: 0,
        contactCooldownMs: 0,
      });
      state.enemies = [mob];
      run(state, idle, 20);
      return mob.hp;
    };
    expect(stage(true)).toBeLessThan(stage(false));
  });
});

/** Rank a talent up `ranks` times (each spend takes one point in its tree). */
function trained(state: GameState, id: string, ranks: number): GameState {
  for (let i = 0; i < ranks; i++) spendTalentPoint(state, id);
  return state;
}

describe("the melee tree's proc talents", () => {
  it("TWIN STRIKE scales its chance (capped) and echo (full at rank 5)", () => {
    const state = heroWithStats({ str: 50 });
    expect(talentTwinStrike(state)).toBeNull(); // untrained
    trained(state, "twin_strike", 1);
    const r1 = talentTwinStrike(state)!;
    expect(r1.echoFrac).toBeCloseTo(0.5, 5); // half-damage echo below rank 5
    trained(state, "twin_strike", 4); // → rank 5
    const r5 = talentTwinStrike(state)!;
    expect(r5.chance).toBeGreaterThan(r1.chance);
    expect(r5.chance).toBeLessThanOrEqual(0.5); // chance cap
    expect(r5.echoFrac).toBeCloseTo(1, 5); // full-damage echo at rank 5
  });

  it("TWIN STRIKE echoes a melee blow for extra damage through the live step", () => {
    // Two identical single-swing runs with a pinned rng that clears the miss/
    // dodge rolls AND fires the echo (< the chance): the echo makes the mob
    // lose strictly more hp.
    const stage = (twin: boolean): number => {
      const state = heroWithStats({ str: 50 });
      if (twin) trained(state, "twin_strike", 5);
      stopWaves(state);
      state.rng = () => 0.3; // no miss/dodge; fires the echo (chance 0.5)
      state.player.weaponCooldownMs = 0;
      const mob = makeEnemy({
        pos: { x: state.player.pos.x + 18, y: state.player.pos.y },
        hp: 1e6,
        maxHp: 1e6,
        speed: 0,
      });
      state.enemies = [mob];
      run(state, idle, 1); // exactly one swing
      return mob.hp;
    };
    expect(stage(true)).toBeLessThan(stage(false));
  });

  it("CLEAVING ECHO scales its chance (capped) and extra targets (+2 from rank 4)", () => {
    const state = heroWithStats({ str: 50 });
    expect(talentCleavingEcho(state)).toBeNull();
    trained(state, "cleaving_echo", 1);
    expect(talentCleavingEcho(state)!.extraTargets).toBe(1);
    trained(state, "cleaving_echo", 3); // → rank 4
    const r4 = talentCleavingEcho(state)!;
    expect(r4.extraTargets).toBe(2);
    expect(r4.chance).toBeLessThanOrEqual(0.55); // chance cap
  });

  it("PARRY scales its chance (capped) and only ripostes at rank 5", () => {
    const state = heroWithStats({ str: 50 });
    expect(talentParry(state)).toBeNull();
    trained(state, "parry", 1);
    expect(talentParry(state)!.riposteFrac).toBe(0); // no riposte below rank 5
    trained(state, "parry", 4); // → rank 5
    const r5 = talentParry(state)!;
    expect(r5.chance).toBeLessThanOrEqual(0.4); // chance cap
    expect(r5.riposteFrac).toBeGreaterThan(0); // riposte unlocks at rank 5
  });

  it("PARRY turns a melee blow fully aside (no hp lost)", () => {
    // A pinned rng below the rank-5 parry chance (0.4) and above the low dodge:
    // the blow is parried, so the parrying hero keeps his full pool while the
    // untrained one bleeds.
    const stage = (parry: boolean): number => {
      const state = heroWithStats({ str: 50 });
      if (parry) trained(state, "parry", 5);
      stopWaves(state);
      // Armed (a holstered hero takes no contact at all); his own swings never
      // touch his hp, so the incoming blow is still the only thing that can.
      state.player.disarmed = false;
      state.player.maxHp = 1e6;
      state.player.hp = 1e6;
      // Below the rank-5 parry chance (0.3) and above the low dodge → the blow
      // is parried, not dodged.
      state.rng = () => 0.2;
      const mob = makeEnemy({
        pos: { ...state.player.pos },
        hp: 1e6,
        maxHp: 1e6,
        speed: 0,
        contactCooldownMs: 0,
      });
      state.enemies = [mob];
      run(state, idle, 20);
      return state.player.hp;
    };
    expect(stage(true)).toBeGreaterThan(stage(false));
  });

  it("SEISMIC LANDING scales its radius and damage with rank", () => {
    const state = heroWithStats({ str: 50 });
    expect(talentSeismic(state)).toBeNull();
    trained(state, "seismic_landing", 1);
    const r1 = talentSeismic(state)!;
    trained(state, "seismic_landing", 4); // → rank 5
    const r5 = talentSeismic(state)!;
    expect(r5.radius).toBeGreaterThan(r1.radius);
    expect(r5.damage).toBeGreaterThan(r1.damage);
  });

  it("SEISMIC LANDING slams a nearby foe on touchdown", () => {
    const state = heroWithStats({ str: 50 });
    trained(state, "seismic_landing", 3);
    stopWaves(state);
    state.player.disarmed = true; // only the landing deals damage
    state.rng = () => 0.99;
    const hp = 1e6;
    const mob = makeEnemy({
      pos: { x: state.player.pos.x + 20, y: state.player.pos.y },
      hp,
      maxHp: hp,
      speed: 0,
    });
    state.enemies = [mob];
    let landed = false;
    // Hop, then idle until the arc completes and touches down (the `land` fires).
    run(state, jumpOnce, 1);
    run(state, idle, 240, (s) => {
      if (s.player.z === 0 && s.player.vz === 0) landed = true;
      return landed;
    });
    expect(landed).toBe(true);
    expect(mob.hp).toBeLessThan(hp); // scorched by the shockwave
  });
});

describe("the ranged tree's proc talents", () => {
  it("PIERCING SHOT scales its pierce count and softens the falloff with rank", () => {
    const state = heroWithStats({ dex: 50 });
    expect(talentPiercing(state)).toBeNull();
    trained(state, "piercing_shot", 1);
    const r1 = talentPiercing(state)!;
    expect(r1.pierce).toBe(1);
    trained(state, "piercing_shot", 4); // → rank 5
    const r5 = talentPiercing(state)!;
    expect(r5.pierce).toBe(5);
    expect(r5.retain).toBeGreaterThan(r1.retain); // rank softens the falloff
  });

  it("PIERCING SHOT punches through a foe to strike the one behind it", () => {
    const state = heroWithStats({ dex: 50 });
    trained(state, "piercing_shot", 5);
    equipBlaster(state);
    stopWaves(state);
    state.rng = () => 0.9; // clean hits, no crit
    const hp = 1e6;
    const near = makeEnemy({
      pos: { x: state.player.pos.x + 40, y: state.player.pos.y },
      hp,
      maxHp: hp,
      speed: 0,
    });
    const far = makeEnemy({
      pos: { x: state.player.pos.x + 90, y: state.player.pos.y },
      hp,
      maxHp: hp,
      speed: 0,
    });
    far.id = 9101;
    state.enemies = [near, far];
    run(state, idle, 40);
    expect(near.hp).toBeLessThan(hp);
    expect(far.hp).toBeLessThan(hp); // the shot pierced through to the second
  });

  it("CONCUSSIVE ROUNDS scales its chance (capped) and shove distance", () => {
    const state = heroWithStats({ dex: 50 });
    expect(talentConcussive(state)).toBeNull();
    trained(state, "concussive_rounds", 1);
    const r1 = talentConcussive(state)!;
    trained(state, "concussive_rounds", 4);
    const r5 = talentConcussive(state)!;
    expect(r5.chance).toBeLessThanOrEqual(0.65);
    expect(r5.distance).toBeGreaterThan(r1.distance);
  });

  it("CONCUSSIVE ROUNDS shoves a struck foe back", () => {
    const state = heroWithStats({ dex: 50 });
    trained(state, "concussive_rounds", 5);
    equipBlaster(state);
    stopWaves(state);
    state.rng = () => 0.3; // clears miss/dodge, fires the shove (chance 0.65)
    const hp = 1e6;
    const startX = state.player.pos.x + 40;
    const mob = makeEnemy({
      pos: { x: startX, y: state.player.pos.y },
      hp,
      maxHp: hp,
      speed: 0,
    });
    state.enemies = [mob];
    run(state, idle, 30);
    expect(mob.hp).toBeLessThan(hp); // it was hit
    expect(mob.pos.x).toBeGreaterThan(startX); // and shoved further out
  });

  it("CRIPPLING SHOT slows a struck foe (the chill fields)", () => {
    const state = heroWithStats({ dex: 50 });
    expect(talentCrippling(state)).toBeNull();
    trained(state, "crippling_shot", 5);
    const c = talentCrippling(state)!;
    expect(c.chance).toBeLessThanOrEqual(0.75);
    equipBlaster(state);
    stopWaves(state);
    state.rng = () => 0.3; // fires the slow (chance 0.75)
    const hp = 1e6;
    const mob = makeEnemy({
      pos: { x: state.player.pos.x + 40, y: state.player.pos.y },
      hp,
      maxHp: hp,
      speed: 0,
    });
    state.enemies = [mob];
    run(state, idle, 30);
    expect(mob.chillMs ?? 0).toBeGreaterThan(0); // hobbled
    expect(mob.chillFactor).toBeCloseTo(c.slowFactor, 5);
  });

  it("VOLLEY scales its chance (capped) and extra shots (+4 from rank 4)", () => {
    const state = heroWithStats({ dex: 50 });
    expect(talentVolley(state)).toBeNull();
    trained(state, "volley", 1);
    expect(talentVolley(state)!.extra).toBe(2);
    trained(state, "volley", 3); // → rank 4
    const r4 = talentVolley(state)!;
    expect(r4.extra).toBe(4);
    expect(r4.chance).toBeLessThanOrEqual(0.5);
  });

  it("VOLLEY looses extra projectiles on a single trigger pull", () => {
    const state = heroWithStats({ dex: 50 });
    trained(state, "volley", 5);
    equipBlaster(state);
    stopWaves(state);
    state.rng = () => 0.3; // fires the extra spread (chance 0.5)
    state.player.weaponCooldownMs = 0;
    const mob = makeEnemy({
      pos: { x: state.player.pos.x + 120, y: state.player.pos.y },
      hp: 1e6,
      maxHp: 1e6,
      speed: 0,
    });
    state.enemies = [mob];
    run(state, idle, 1); // one pull
    // The blaster's single round plus the volley's +4 = a spread of pellets.
    expect(state.projectiles.length).toBeGreaterThan(1);
  });
});

describe("the ranged tree's mobility kickers", () => {
  it("SPRING HEELS lifts the takeoff and (at rank 5) cheapens the hop", () => {
    const state = heroWithStats({ dex: 50 });
    const untrained = talentJumpMods(state);
    expect(untrained.velocityMult).toBe(1);
    expect(untrained.costMult).toBe(1);
    trained(state, "spring_heels", 1);
    const r1 = talentJumpMods(state);
    expect(r1.velocityMult).toBeGreaterThan(1);
    expect(r1.costMult).toBe(1); // cost only drops at rank 5
    trained(state, "spring_heels", 4); // → rank 5
    const r5 = talentJumpMods(state);
    expect(r5.velocityMult).toBeGreaterThan(r1.velocityMult);
    expect(r5.costMult).toBeLessThan(1);
  });

  it("SPRING HEELS actually jumps higher through the live step", () => {
    const peak = (springHeels: boolean): number => {
      const state = heroWithStats({ dex: 50 });
      if (springHeels) trained(state, "spring_heels", 5);
      stopWaves(state);
      state.enemies = [];
      let top = 0;
      run(state, jumpOnce, 1);
      run(state, idle, 240, (s) => {
        top = Math.max(top, s.player.z);
        return s.player.z === 0 && s.player.vz === 0 && top > 0;
      });
      return top;
    };
    expect(peak(true)).toBeGreaterThan(peak(false));
  });

  it("EVASION's rank-5 burst arms only at rank 5 and speeds the walk", () => {
    const state = heroWithStats({ dex: 50 });
    trained(state, "evasion", 4); // rank 4: no burst yet
    expect(talentEvasionBurstMs(state)).toBe(0);
    expect(talentEvasionBurstMult(state)).toBe(1);
    trained(state, "evasion", 1); // → rank 5
    expect(talentEvasionBurstMs(state)).toBeGreaterThan(0);
    // Untriggered, the multiplier is still 1 (no live burst window).
    expect(talentEvasionBurstMult(state)).toBe(1);
    const base = playerSpeed(state);
    state.player.evasionBurstMs = 500; // arm the window
    expect(talentEvasionBurstMult(state)).toBeGreaterThan(1);
    expect(playerSpeed(state)).toBeGreaterThan(base);
  });

  it("EVASION rank 5 arms the speed burst on a dodge in the struck path", () => {
    const state = heroWithStats({ dex: 50 });
    trained(state, "evasion", 5);
    stopWaves(state);
    state.player.disarmed = false; // a holstered hero takes no contact to dodge
    state.rng = () => 0; // force the dodge roll to succeed
    const mob = makeEnemy({
      pos: { ...state.player.pos },
      hp: 1e6,
      maxHp: 1e6,
      speed: 0,
      contactCooldownMs: 0,
    });
    state.enemies = [mob];
    run(state, idle, 3);
    expect(state.player.evasionBurstMs ?? 0).toBeGreaterThan(0);
  });
});

describe("the TALENT POWER developer dial (BALANCE.talentPower)", () => {
  // Every knobbed test restores neutral so ordering can't leak (mirrors
  // balance_tuning_test.ts).
  afterEach(() => resetBalanceTuning());

  it("scales the summed always-on stat bonuses", () => {
    const state = heroWithStats({ str: 50, int: 50 });
    trained(state, "ironhide", 1); // +3%
    trained(state, "mage_armor", 1); // +3%
    const base = talentDamageReduction(state);
    expect(base).toBeCloseTo(0.06, 5);

    setBalanceTuning({ talentPower: 2 });
    expect(talentDamageReduction(state)).toBeCloseTo(base * 2, 5);

    // 0× turns the passive stat layer off entirely.
    setBalanceTuning({ talentPower: 0 });
    expect(talentDamageReduction(state)).toBe(0);
  });

  it("scales an offensive proc RATE below its cap", () => {
    const state = heroWithStats({ str: 50 });
    trained(state, "twin_strike", 1); // one rank, well under the chance cap
    const base = talentTwinStrike(state)!.chance;
    expect(base).toBeGreaterThan(0);

    setBalanceTuning({ talentPower: 2 });
    const doubled = talentTwinStrike(state)!;
    expect(doubled.chance).toBeCloseTo(base * 2, 5);
    // The echo's damage share is SHAPE, not power — the dial leaves it at its
    // rank-1 half regardless.
    expect(doubled.echoFrac).toBeCloseTo(0.5, 5);

    setBalanceTuning({ talentPower: 0 });
    expect(talentTwinStrike(state)!.chance).toBe(0);
  });

  it("scales the seismic-landing blast but not its radius", () => {
    const state = heroWithStats({ str: 50 });
    trained(state, "seismic_landing", 2);
    const base = talentSeismic(state)!;

    setBalanceTuning({ talentPower: 3 });
    const strong = talentSeismic(state)!;
    expect(strong.damage).toBeCloseTo(base.damage * 3, 5);
    // Radius and knockback are SHAPE — fixed regardless of the dial.
    expect(strong.radius).toBe(base.radius);
    expect(strong.knockback).toBe(base.knockback);
  });

  it("leaves the conjuration ranks (abilityPowerScale's domain) untouched", () => {
    const state = heroWithStats({ int: 50 });
    trained(state, "orbiting_flames", 2);
    const base = { ...talentSpellRanks(state) };

    setBalanceTuning({ talentPower: 0 });
    // The dial governs the stat/proc layer, not the granted-spell rank source.
    expect(talentSpellRanks(state)).toEqual(base);
  });
});
