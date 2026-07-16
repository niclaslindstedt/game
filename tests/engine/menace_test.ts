// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The menace system: the escalation meter that answers an overpowered player.
// Overkilling and fast kills bank menace; idling bleeds it off — but never
// below the permanent floor the evolution RATCHET earns by one-shotting the
// current crop. The stage lures a denser horde, evolves freshly-spawned
// minions (more hp → more xp, worse loot), and — with the hero's power level —
// scales elites and bosses when they engage. Each difficulty caps the meter's
// PEAK (easy 3, medium 5, hard 10, nightmare 100; JESUS uncapped). Runs on the
// synthetic engine fixtures.

import { describe, expect, it } from "vitest";

import {
  createGame,
  currentMobLevel,
  dismissIntro,
  enemyDef,
  enemyPowerLevelTerm,
  enemyPowerScale,
  mobContactScaleFor,
  heroDamageLevel,
  heroGearLevel,
  heroPowerLevel,
  hitEnemy,
  MENACE,
  menaceCeiling,
  menaceClearGate,
  menaceFloorStage,
  menaceStage,
  menaceStageCap,
  menaceWarmup,
  mobHpLevelFactor,
  mobHpScaleFor,
  mobLevelFor,
  mobLevelScale,
  recruitCompanion,
  resetBalanceTuning,
  setBalanceTuning,
  skipCutscene,
  step,
  xpToLevelUp,
} from "@game/core";
import type { Equipment, GameInput, GameState } from "@game/core";

import { DT, idle, makeEnemy, run, startGame, stopWaves } from "./helpers.ts";

/** A run past the prelude on a chosen difficulty (fixtures are installed). */
function startOn(difficulty: string, levelId = "test_level"): GameState {
  const state = createGame(42, levelId, difficulty as never);
  skipCutscene(state);
  dismissIntro(state);
  return state;
}

/** The [min, max] rounded hp a rank-and-file minion can carry off base `hp`,
 * horde `scale`, and an optional evolution `mult`, once the per-mob spawn band
 * (MENACE.mobLevelBand) rolls its ±level offset in ramp space. */
function bandHpBounds(
  hp: number,
  difficulty: string,
  mult = 1,
  playerLevel = 1,
): [number, number] {
  const scale = mobHpScaleFor(playerLevel, difficulty);
  const mlvl = mobLevelFor(playerLevel, difficulty);
  const at = (offset: number) =>
    Math.round(
      hp *
        Math.max(
          MENACE.mobHpScaleFloor,
          scale * (mobHpLevelFactor(mlvl + offset) / mobHpLevelFactor(mlvl)),
        ) *
        mult,
    );
  return [at(MENACE.mobLevelBand.min), at(MENACE.mobLevelBand.max)];
}

/** Slot a specific weapon so the swing/shot damage is known. */
function equip(state: GameState, defId: string): void {
  const weapon: Equipment = {
    id: 777,
    defId,
    slot: "weapon",
    tier: "regular",
    ilvl: 5,
    affixes: [],
  };
  state.player.equipment.weapon = weapon;
  state.player.weaponCooldownMs = 0;
}

/** Strip to just the far boss and clear obstacles for surgical arrangements. */
function bareStage(state: GameState): void {
  stopWaves(state);
  state.obstacles = [];
  state.enemies = state.enemies.filter(
    (e) => enemyDef(e.defId).role === "boss",
  );
}

describe("menace — the meter", () => {
  it("buckets menace into evolution stages (the stage arithmetic itself is unbounded)", () => {
    const state = startGame();
    state.menace = 0;
    expect(menaceStage(state)).toBe(0);
    state.menace = MENACE.perStage - 0.01;
    expect(menaceStage(state)).toBe(0);
    state.menace = MENACE.perStage;
    expect(menaceStage(state)).toBe(1);
    // `menaceStage` is pure floor-division arithmetic with no roof — the PEAK
    // is enforced on the METER (see the "difficulty caps the peak" suite),
    // which never lets `state.menace` grow past the rung's ceiling in play.
    state.menace = MENACE.perStage * 25;
    expect(menaceStage(state)).toBe(25);
  });

  it("an overpowered kill jolts the meter and lures the horde in", () => {
    const state = startGame();
    bareStage(state);
    state.player.level = 6; // past the early-game warmup so the jolt isn't damped
    equip(state, "test_hammer"); // melee, 34 dmg, reach 44
    const { x, y } = state.player.pos;
    // One 10-hp fodder in reach: a 34-damage swing overkills it by ≥ 24, so the
    // OVERKILL still triggers the meter on top of the rolling output.
    state.enemies.push(
      makeEnemy({ pos: { x: x + 20, y }, hp: 10, maxHp: 10 }, "test_fodder"),
    );
    expect(state.menace).toBe(0);
    const creditBefore = state.moveSpawnCredit;

    step(state, idle, DT);

    expect(state.stats.kills).toBe(1);
    // The overkill spike pushed the meter off zero this very step.
    expect(state.menace).toBeGreaterThan(0);
    // Overkill banked spawn-credit (idle, so nothing else could add it).
    expect(state.moveSpawnCredit).toBeGreaterThan(creditBefore);
  });

  it("overkill is damage beyond FULL hp — finishing a wounded mob doesn't count", () => {
    // Overkill is the blow's damage minus the mob's MAX hp, not the hp it had
    // left. A modest hit that finishes an almost-dead mob banks nothing; the
    // same hit that dwarfs a mob's whole bar banks overkill.
    const kill = (hp: number, maxHp: number) => {
      const state = startGame();
      bareStage(state);
      state.player.level = 6; // warmed up so any overkill lands at full weight
      equip(state, "test_hammer"); // ~34 dmg — far under a 500-hp bar
      const { x, y } = state.player.pos;
      state.enemies.push(
        makeEnemy({ pos: { x: x + 20, y }, hp, maxHp }, "test_fodder"),
      );
      const creditBefore = state.moveSpawnCredit;
      step(state, idle, DT);
      expect(state.stats.kills).toBe(1);
      return {
        menace: state.menace,
        credit: state.moveSpawnCredit - creditBefore,
      };
    };
    // Finishing a 5/500 mob: the 34-dmg blow is far below its 500 max, so
    // damage − maxHp < 0 → no overkill at all.
    const wounded = kill(5, 500);
    // Crushing a 10/10 mob: 34 − 10 = 24 of overkill → a real jolt.
    const crushed = kill(10, 10);
    expect(wounded.credit).toBe(0);
    expect(crushed.credit).toBeGreaterThan(0);
    expect(crushed.menace).toBeGreaterThan(wounded.menace);
  });

  it("an overkill crossing a stage boundary emits menaceRose", () => {
    const state = startGame();
    bareStage(state);
    state.player.level = 6; // warmed up so the overkill jolt lands at full weight
    equip(state, "test_hammer");
    const { x, y } = state.player.pos;
    state.enemies.push(
      makeEnemy({ pos: { x: x + 20, y }, hp: 10, maxHp: 10 }, "test_fodder"),
    );
    // Park menace just below stage 1: this kill's overkill — ≥ 2.4 healthbars
    // (24 / 10 maxHp) × perOverkill × sensitivity — tips it over. Being wildly
    // overpowered relative to the mob escalates on the spot.
    state.menace = MENACE.perStage - 0.5;

    step(state, idle, DT);

    const rose = state.events.find((e) => e.type === "menaceRose");
    expect(rose).toBeDefined();
    expect(rose && rose.type === "menaceRose" && rose.stage).toBe(1);
    expect(menaceStage(state)).toBe(1);
  });

  it("sustained output heats the meter ONLY while out-clearing the spawn rate", () => {
    // The rolling DPS/kill-rate driver now fires through the CLEARANCE GATE: the
    // SAME brutal output heats the meter while the hero is THINNING the horde and
    // goes inert the moment the screen is merely holding or filling — a strong
    // slow weapon pumping damage into a rising crowd no longer rampages.
    const heat = (killRate: number, spawnRate: number): number => {
      const state = startOn("jesus");
      bareStage(state);
      state.player.level = 8;
      equip(state, "test_hammer");
      state.menace = 0;
      // Pin identical output and the chosen clearance rates every tick (a real
      // fight would sustain them) across a couple of seconds.
      for (let i = 0; i < 120; i++) {
        state.combatDps = 800;
        state.combatKillRate = 4;
        state.minionKillRate = killRate;
        state.minionSpawnRate = spawnRate;
        step(state, idle, DT);
      }
      return state.menace;
    };
    // Out-clearing (killing far faster than the horde spawns) opens the gate —
    // the meter heats.
    expect(heat(4, 0)).toBeGreaterThan(0);
    // Being out-spawned (the screen filling) shuts the gate — the identical
    // output banks nothing; only decay touches the meter.
    expect(heat(1, 5)).toBe(0);
  });

  it("the clearance gate: kills over spawns opens it, being swamped shuts it", () => {
    const gate = (kr: number, sr: number): number => {
      const state = startGame();
      state.minionKillRate = kr;
      state.minionSpawnRate = sr;
      return menaceClearGate(state);
    };
    // No minion activity at all reads shut — grinding a lone unkillable tank no
    // longer heats the meter.
    expect(gate(0, 0)).toBe(0);
    // Clearing with nothing spawning is a full rout — wide open.
    expect(gate(3, 0)).toBe(1);
    // Matched by the spawn rate (a standoff) or swamped by it: shut.
    expect(gate(3, 3)).toBe(0);
    expect(gate(1, 4)).toBe(0);
    // Just past the 10% threshold cracks it open a sliver; well past it opens
    // fully (the gate ramps from the threshold to twice it).
    expect(gate(1.15, 1)).toBeGreaterThan(0);
    expect(gate(1.15, 1)).toBeLessThan(1);
    expect(gate(2, 1)).toBe(1);
  });

  it("the menaceClearance knob moves the clearance threshold", () => {
    const state = startGame();
    state.minionKillRate = 1.05; // clearing ~5% faster than spawns
    state.minionSpawnRate = 1;
    // At the shipped 10% threshold, a 5% edge isn't enough — the gate is shut.
    expect(menaceClearGate(state)).toBe(0);
    // Drop the threshold toward zero and any positive clearance opens it.
    setBalanceTuning({ menaceClearance: 0 });
    expect(menaceClearGate(state)).toBe(1);
    resetBalanceTuning();
  });

  it("idling bleeds menace back off over time", () => {
    const state = startGame();
    bareStage(state); // only the far boss remains — nothing to fight
    state.menace = 30;

    run(state, idle, 63); // ~1s of standing still

    // ~decayPerSec drained over the second, never below zero.
    expect(state.menace).toBeLessThan(30);
    expect(state.menace).toBeCloseTo(30 - MENACE.decayPerSec, 0);
  });
});

describe("menace — difficulty and warmup gate the heat", () => {
  /** Menace banked by one identical overkill kill on the given difficulty.
   * The fodder's bar is sized so the overkill stays well under the ratchet
   * threshold (`MENACE.ratchetHealthbars`) — this suite compares the METER
   * jolt the rungs' menace knobs produce; the difficulty-blind ratchet has
   * its own suite below. */
  function joltOn(difficulty: string, level: number): number {
    const state = startOn(difficulty);
    bareStage(state);
    state.player.level = level;
    equip(state, "test_hammer");
    // An OVERPOWERED build: enough STRENGTH that the hammer roughly triples its
    // ~34 base (well under the ratchet's 6-healthbar threshold) so the overkill
    // is unambiguous. Auto-stat growth is off by default now, so the hero can't
    // lean on free per-level STR — spell it out, or even EASY's tiny jolt is
    // eaten by the per-step menace decay.
    state.player.stats.strength = 8;
    const { x, y } = state.player.pos;
    state.enemies.push(
      // Level-1 fodder → ~no armor, so the overkill (and its jolt) is the pure
      // formula rather than an armor-shaved remainder.
      makeEnemy(
        { pos: { x: x + 20, y }, hp: 30, maxHp: 30, mlvl: 1 },
        "test_fodder",
      ),
    );
    // Pin the rng high so the blow neither misses, is dodged, nor crits (and
    // no drop rolls) — the jolt is then the pure overkill formula, and the
    // rungs compare on their menace knobs alone instead of per-seed luck.
    state.rng = () => 0.99;
    step(state, idle, DT);
    expect(state.stats.kills).toBe(1);
    return state.menace;
  }

  it("the same overpowered kill escalates far harder as difficulty climbs", () => {
    const warmed = 8; // past the warmup so only the difficulty mult differs
    const easy = joltOn("easy", warmed);
    const medium = joltOn("medium", warmed);
    const hard = joltOn("hard", warmed);
    const nightmare = joltOn("nightmare", warmed);
    const jesus = joltOn("jesus", warmed);
    expect(easy).toBeGreaterThan(0);
    expect(medium).toBeGreaterThan(easy);
    expect(hard).toBeGreaterThan(medium);
    expect(nightmare).toBeGreaterThan(hard);
    expect(jesus).toBeGreaterThan(nightmare);
    // EASY is near-inert: a rampage is practically impossible even for an
    // overpowered build (a whole stage is MENACE.perStage of heat).
    expect(easy).toBeLessThan(MENACE.perStage * 0.1);
  });

  it("early levels are damped so a fresh hero cannot rampage yet", () => {
    // The same kill on the same difficulty banks far less at level 1 than once
    // the player has grown into their power.
    expect(joltOn("medium", 1)).toBeLessThan(joltOn("medium", 8));
    // The warmup eases from the floor at level 1 up to 1.0 by 1 + warmupLevels.
    expect(menaceWarmup({ player: { level: 1 } } as GameState)).toBeCloseTo(
      MENACE.warmupFloor,
    );
    expect(
      menaceWarmup({ player: { level: 1 + MENACE.warmupLevels } } as GameState),
    ).toBeCloseTo(1);
  });

  it("even a god-tier build barely warms the meter on EASY", () => {
    // A maxed hero clearing a whole warmed-up run on EASY stays cool: the
    // difficulty's menaceMult keeps gain below the decay floor.
    const state = startOn("easy");
    state.player.level = 20;
    for (let i = 0; i < 20 * 60; i++) {
      // Feed the meter a brutal, sustained overkill stream by hand.
      state.combatDps = 800;
      state.combatKillRate = 8;
      step(state, idle, DT);
    }
    expect(menaceStage(state)).toBe(0);
  });
});

describe("menace — evolution of the horde", () => {
  it("un-evolved at menace 0: wave spawns carry no evo and base hp", () => {
    const state = startGame();
    state.menace = 0;
    const before = new Set(state.enemies.map((e) => e.id));
    run(state, idle, 4); // the live floor pulls minions in

    const spawned = state.enemies.filter(
      (e) => !before.has(e.id) && enemyDef(e.defId).role === "minion",
    );
    expect(spawned.length).toBeGreaterThan(0);
    for (const e of spawned) {
      expect(e.evo).toBeUndefined();
      // No evolution — just the horde's relative-level scale (medium fields
      // mobs two levels under a level-1 hero) plus each mob's own spawn band.
      const [lo, hi] = bandHpBounds(enemyDef(e.defId).hp, "medium");
      expect(e.maxHp).toBeGreaterThanOrEqual(lo);
      expect(e.maxHp).toBeLessThanOrEqual(hi);
    }
  });

  it("evolves wave-spawned minions while menace is high: more hp, stamped", () => {
    const state = startGame();
    // Mid-bucket so the stage is stable across the few decaying ticks.
    state.menace = MENACE.perStage * 3 + MENACE.perStage / 2; // stage 3
    run(state, idle, 4);

    const evolved = state.enemies.filter((e) => e.evo !== undefined);
    expect(evolved.length).toBeGreaterThan(0);
    for (const e of evolved) {
      expect(e.evo).toBeGreaterThanOrEqual(1);
      // Each mob's hp is consistent with its OWN stamped stage, on top of the
      // relative-level scale (medium menaceEffectMult is 1) and its spawn band.
      const mult = 1 + (e.evo ?? 0) * MENACE.hpPerStage;
      const [lo, hi] = bandHpBounds(enemyDef(e.defId).hp, "medium", mult);
      expect(e.maxHp).toBeGreaterThanOrEqual(lo);
      expect(e.maxHp).toBeLessThanOrEqual(hi);
      // Even the lowest band roll on a stage-3 evolved mob out-toughens an
      // un-evolved spawn's baseline — a rampage crop takes more killing.
      // (It no longer pays more xp, though: kill xp is LEVEL-based now, and
      // evolution stacks hp, not level.)
      expect(e.maxHp).toBeGreaterThan(
        Math.round(enemyDef(e.defId).hp * mobHpScaleFor(1, "medium")),
      );
    }
  });

  it("evolved (malice) mobs find worse gear — the tier roll pays the penalty", () => {
    // Kill 120 mobs at saturated drop odds, once un-evolved and once at a
    // deep evolution stage, off the same seed: the per-stage tier PENALTY
    // (MENACE.tierPenaltyPerStage) drives the evolved crop's magic odds to
    // zero — a rampage is a leveling faucet, not a loot farm.
    const magicOrBetter = (evo: number): number => {
      setBalanceTuning({ dropRate: 20 });
      const state = startGame(); // same seed both arms — comparable streams
      stopWaves(state);
      state.items = [];
      for (let i = 0; i < 120; i++) {
        const enemy = makeEnemy(
          {
            id: state.nextId++,
            pos: { x: state.player.pos.x + 60, y: state.player.pos.y },
            hp: 45,
            maxHp: 45,
          },
          "test_minion",
        );
        if (evo > 0) enemy.evo = evo;
        state.enemies.push(enemy);
        hitEnemy(state, enemy, 45, undefined, { rollAccuracy: false });
      }
      resetBalanceTuning();
      return state.items.filter(
        (i) =>
          i.kind === "equipment" &&
          i.equipment.tier !== "regular" &&
          i.equipment.tier !== "trash",
      ).length;
    };
    const plain = magicOrBetter(0);
    const evolved = magicOrBetter(10);
    expect(plain).toBeGreaterThan(0); // the ordinary rain pays magic finds
    // Ten stages of tier PENALTY thin the evolved crop's magic+ rate well
    // below the ordinary rain — a rampage is a leveling faucet, not a loot farm.
    expect(evolved).toBeLessThan(plain);
  });

  it("high menace lures a denser crowd than a calm field", () => {
    // Sustained rampage vs. calm: re-pin menace each tick so the stage holds.
    const minionsAfter = (keepMenace: number) => {
      const state = startGame();
      for (let i = 0; i < 30; i++) {
        state.menace = keepMenace;
        step(state, idle, DT);
      }
      return state.enemies.filter((e) => enemyDef(e.defId).role === "minion")
        .length;
    };
    expect(minionsAfter(MENACE.perStage * 10)).toBeGreaterThan(minionsAfter(0));
  });
});

describe("menace — the evolution ratchet (no breaks)", () => {
  /** A clean, warmed-up stage with the rng pinned high (no crits, no drops)
   * so each hand-dealt blow banks exactly its own overkill. */
  function warmedStage(difficulty = "medium"): GameState {
    const state = startOn(difficulty);
    bareStage(state);
    state.player.level = 8; // fully past the warmup damping
    // Sync the bar to the pinned level: kills now pay real (level-based) xp, so
    // a stale level-1 threshold would ding mid-test and freeze the run in the
    // levelup phase — stalling the ratchet cooldown these tests measure.
    state.player.xpToNext = xpToLevelUp(state.player.level);
    state.rng = () => 0.99;
    return state;
  }

  /** One-shot a staged 10-hp mob of evolution stage `evo` with a 40-damage
   * blow — 3 healthbars of overkill banked toward the ratchet per kill. */
  function oneShot(state: GameState, evo: number): void {
    const { x, y } = state.player.pos;
    const enemy = makeEnemy(
      { id: state.nextId++, pos: { x: x + 30, y }, hp: 10, maxHp: 10 },
      "test_fodder",
    );
    if (evo > 0) enemy.evo = evo;
    state.enemies.push(enemy);
    hitEnemy(state, enemy, 40);
  }

  it("one-shotting the current crop lifts the permanent floor, stage by stage", () => {
    const state = warmedStage();
    expect(state.menaceFloor).toBe(0);
    // 3 healthbars of overkill per kill: two kills cross ratchetHealthbars (6)
    // and the floor locks in stage 1 — the next crop spawns evolved.
    oneShot(state, 0);
    expect(menaceFloorStage(state)).toBe(0);
    oneShot(state, 0);
    expect(menaceFloorStage(state)).toBe(1);
    expect(state.menace).toBeGreaterThanOrEqual(state.menaceFloor);
    // Stage-1 mobs getting one-shot just as fast force stage 2 — and so on,
    // with NO roof. (The between-stages breather is skipped by hand here;
    // its pacing has its own test below.)
    state.evoRatchetMs = 0;
    oneShot(state, 1);
    oneShot(state, 1);
    expect(menaceFloorStage(state)).toBe(2);
  });

  it("stale un-evolved leftovers prove nothing once the floor has risen", () => {
    const state = warmedStage();
    state.menaceFloor = MENACE.perStage; // stage-1 floor already earned
    state.menace = state.menaceFloor;
    // Massacring old evo-0 stragglers banks no proof toward stage 2.
    for (let i = 0; i < 6; i++) oneShot(state, 0);
    expect(menaceFloorStage(state)).toBe(1);
    // The same blows against the CURRENT crop do.
    oneShot(state, 1);
    oneShot(state, 1);
    expect(menaceFloorStage(state)).toBe(2);
  });

  it("clean kills of the crop RELIEVE the proof — a mixed horde holds the floor", () => {
    const state = warmedStage();
    // One overkill banks 3 healthbars of proof…
    oneShot(state, 0);
    expect(state.evoProof).toBeCloseTo(3);
    // …and three honest kills (a finisher within the bar — no overkill)
    // refund it back to zero: trash one-shots alone can't evolve a horde
    // whose heavies still take real fights.
    const { x, y } = state.player.pos;
    for (let i = 0; i < 3; i++) {
      const heavy = makeEnemy(
        { id: state.nextId++, pos: { x: x + 30, y }, hp: 40, maxHp: 400 },
        "test_fodder",
      );
      state.enemies.push(heavy);
      hitEnemy(state, heavy, 100); // kills from 40, far under the 400 bar
    }
    expect(state.evoProof).toBe(0);
    expect(menaceFloorStage(state)).toBe(0);
  });

  it("climbs at most one stage per cooldown — one evolve per malice round", () => {
    const state = warmedStage();
    oneShot(state, 0);
    oneShot(state, 0); // stage 1 locks in and arms the breather
    expect(menaceFloorStage(state)).toBe(1);
    expect(state.evoRatchetMs).toBe(MENACE.ratchetCooldownMs);
    // A massacre burst against the fresh crop banks proof, but the breather
    // holds the next stage — and the bank caps at 2× the threshold, so the
    // burst defers at most ONE stage past its own moment.
    for (let i = 0; i < 10; i++) oneShot(state, 1);
    expect(menaceFloorStage(state)).toBe(1);
    expect(state.evoProof).toBe(MENACE.ratchetHealthbars * 2);
    // Once the breather has burned down (playing ticks), the banked proof
    // spends the next stage on the very next overkill.
    run(state, idle, Math.ceil(MENACE.ratchetCooldownMs / DT) + 2);
    oneShot(state, 1);
    expect(menaceFloorStage(state)).toBe(2);
  });

  it("idling never cools the meter below the earned floor", () => {
    const state = warmedStage();
    state.menaceFloor = MENACE.perStage * 2;
    state.menace = MENACE.perStage * 3; // some transient heat on top
    run(state, idle, 300); // ~5s of standing still
    expect(state.menace).toBe(state.menaceFloor); // heat bled, floor held
    expect(menaceStage(state)).toBe(2);
  });

  it("ratchets even on EASY — the difficulty sizes the step, not whether it happens", () => {
    // EASY's menaceMult (0.05) makes the METER nearly inert, but the ratchet
    // is deliberately difficulty-blind: mobs getting one-shot instantly must
    // evolve the horde on every rung.
    const state = warmedStage("easy");
    oneShot(state, 0);
    oneShot(state, 0);
    expect(menaceFloorStage(state)).toBe(1);
  });

  it("the early-game warmup damps the ratchet for a fresh hero", () => {
    const state = warmedStage();
    state.player.level = 1; // warmupFloor (0.12) damps the proof
    oneShot(state, 0);
    oneShot(state, 0);
    expect(menaceFloorStage(state)).toBe(0);
  });
});

describe("menace — difficulty caps the peak", () => {
  /** One-shot a staged 10-hp mob of the current crop with a crushing blow,
   * skipping the between-stages breather — enough overkill (well past the
   * ratchet threshold) that each qualifying kill spends a full stage, so the
   * floor climbs one rung per call until the cap halts it. */
  function ratchetOnce(state: GameState): void {
    state.evoRatchetMs = 0; // ignore the cooldown; we're driving the floor up
    const { x, y } = state.player.pos;
    const enemy = makeEnemy(
      { id: state.nextId++, pos: { x: x + 30, y }, hp: 10, maxHp: 10 },
      "test_fodder",
    );
    enemy.evo = menaceFloorStage(state); // a mob of the CURRENT crop
    state.enemies.push(enemy);
    hitEnemy(state, enemy, 130); // ~12 healthbars of overkill (proof caps at 12)
  }

  it("each rung's peak matches the design (easy 3 … nightmare 100, jesus uncapped)", () => {
    expect(menaceStageCap(startOn("easy"))).toBe(3);
    expect(menaceStageCap(startOn("medium"))).toBe(5);
    expect(menaceStageCap(startOn("hard"))).toBe(10);
    expect(menaceStageCap(startOn("nightmare"))).toBe(100);
    // JESUS omits the knob entirely — no roof.
    expect(menaceStageCap(startOn("jesus"))).toBe(Infinity);
    expect(menaceCeiling(startOn("medium"))).toBe(5 * MENACE.perStage);
    expect(menaceCeiling(startOn("jesus"))).toBe(Infinity);
  });

  it("the live meter can't climb past the difficulty's peak", () => {
    const state = startOn("medium"); // cap 5, ceiling 60 raw points
    bareStage(state);
    // Even a meter poked absurdly high is pulled back under the ceiling by the
    // next tick — sustained output can never bank the horde past the rung's peak.
    state.menace = MENACE.perStage * 40;
    step(state, idle, DT);
    expect(state.menace).toBeLessThanOrEqual(menaceCeiling(state));
    expect(menaceStage(state)).toBe(5);
  });

  it("the ratchet stops evolving the horde at the peak (EASY tops out at 3)", () => {
    // EASY's meter is near-inert, but the ratchet is difficulty-blind — so a
    // relentless steamroll is exactly what would run it past a low cap. It
    // climbs to stage 3 and then holds, no matter how long the one-shots last.
    const state = startOn("easy");
    bareStage(state);
    state.player.level = 8; // past the warmup damping
    state.rng = () => 0.99; // no crits/dodges/drops — clean overkill each blow
    for (let i = 0; i < 40; i++) ratchetOnce(state);
    expect(menaceFloorStage(state)).toBe(3);
    expect(menaceStage(state)).toBe(3);
    // The meter itself is likewise pinned at the ceiling, never a stage beyond.
    expect(state.menace).toBeLessThanOrEqual(menaceCeiling(state));
  });

  it("JESUS is uncapped — the horde evolves without a roof", () => {
    const state = startOn("jesus");
    bareStage(state);
    state.player.level = 8;
    state.rng = () => 0.99;
    // The same relentless steamroll ratchets far past any finite rung's peak.
    for (let i = 0; i < 150; i++) ratchetOnce(state);
    expect(menaceFloorStage(state)).toBeGreaterThan(100);
    expect(menaceStage(state)).toBeGreaterThan(100);
  });
});

describe("hero power level — character level only", () => {
  it("power IS the character level, whatever the rack", () => {
    const state = startGame();
    // The fresh rack (wall weapon + street clothes, all ilvl 1-ish) reads
    // well under the character level.
    expect(heroGearLevel(state)).toBeLessThan(1);
    expect(heroPowerLevel(state)).toBe(state.player.level);
    // Deck the hero out: a 70-ilvl weapon averages gear level 10 — but the
    // horde no longer follows gear at all, so power stays the character level.
    state.player.equipment.weapon.ilvl = 70;
    expect(heroGearLevel(state)).toBe(10);
    expect(heroPowerLevel(state)).toBe(state.player.level);
  });

  it("gear and weapon damage never toughen the horde", () => {
    const state = startGame(); // medium: mobLevelOffset −2
    const mlvlBefore = currentMobLevel(state);
    const hpScaleBefore = mobLevelScale(state);
    const bossScaleBefore = enemyPowerScale(state);
    // A twink rack AND an absurd +900% damage affix — the old power-match would
    // have toughened the horde to both. Now neither moves minion hp or the
    // set-piece power-match.
    state.player.equipment.weapon.ilvl = 70;
    state.player.equipment.weapon.affixes.push({ kind: "damagePct", value: 9 });
    expect(heroDamageLevel(state)).toBeGreaterThan(state.player.level);
    expect(heroPowerLevel(state)).toBe(state.player.level);
    expect(mobLevelScale(state)).toBe(hpScaleBefore);
    expect(enemyPowerScale(state)).toBe(bossScaleBefore);
    // …and the loot-facing monster level stays on the character sheet too.
    expect(currentMobLevel(state)).toBe(mlvlBefore);
  });

  it("only the character level moves toughness and the loot gates", () => {
    const state = startGame();
    const mlvlBefore = currentMobLevel(state);
    const hpScaleBefore = mobLevelScale(state);
    state.player.level = 10;
    expect(heroPowerLevel(state)).toBe(10);
    expect(mobLevelScale(state)).toBeGreaterThan(hpScaleBefore);
    expect(currentMobLevel(state)).toBeGreaterThan(mlvlBefore);
    expect(currentMobLevel(state)).toBe(8); // 10 − 2, the difficulty offset
  });

  it("heroDamageLevel survives as a diagnostic (analytic readout)", () => {
    const state = startGame();
    // The mapping still computes the weapon's sustained output as a level; it
    // simply no longer feeds heroPowerLevel.
    const fair = heroDamageLevel(state);
    state.player.equipment.weapon.affixes.push({ kind: "damagePct", value: 9 });
    expect(heroDamageLevel(state)).toBeGreaterThan(fair);
    expect(heroPowerLevel(state)).toBe(state.player.level);
  });
});

describe("menace — powerups don't trigger it", () => {
  const useItem: GameInput = { ...idle, useItem: true };

  /** A warmed-up, bare stage with the hero's own weapon silenced, so the only
   * combat output is whatever powerup the test fires. */
  function powerupStage(): GameState {
    const state = startGame();
    bareStage(state);
    state.player.level = 8; // past the warmup, so a real kill WOULD escalate
    state.player.weaponCooldownMs = 1_000_000; // the hero swings nothing himself
    return state;
  }

  /** Drop `count` overkillable fodder in blast range of the hero. */
  function seedFodder(state: GameState, count: number): void {
    const { x, y } = state.player.pos;
    for (let i = 0; i < count; i++) {
      state.enemies.push(
        makeEnemy(
          { pos: { x: x + 16 + i * 6, y }, hp: 10, maxHp: 10 },
          "test_fodder",
        ),
      );
    }
  }

  it("a screen-nuke bomb clears the pack without heating the meter", () => {
    const state = powerupStage();
    seedFodder(state, 6);
    state.player.heldAbilities = ["test_nuke"];
    const creditBefore = state.moveSpawnCredit;

    step(state, useItem, DT);

    // The bomb did its job — six fodder dead, the field cleared.
    expect(state.stats.kills).toBe(6);
    expect(
      state.enemies.filter((e) => enemyDef(e.defId).role === "minion"),
    ).toHaveLength(0);
    // …yet nothing on the menace side moved: no meter, no rolling fuel, no
    // dinner-bell lure, no permanent-floor ratchet.
    expect(state.menace).toBe(0);
    expect(state.combatDps).toBe(0);
    expect(state.combatKillRate).toBe(0);
    expect(state.moveSpawnCredit).toBe(creditBefore);
    expect(state.menaceFloor).toBe(0);
    expect(state.evoProof).toBe(0);
  });

  it("even a CRITTING bomb — real overkill — banks no jolt or ratchet", () => {
    const state = powerupStage();
    state.rng = () => 0; // force the crit so each blast overkills its target
    seedFodder(state, 4);
    state.player.heldAbilities = ["test_nuke"];
    const creditBefore = state.moveSpawnCredit;

    step(state, useItem, DT);

    expect(state.stats.kills).toBe(4);
    // The overkill spike that a WEAPON crit would have jolted/lured/ratcheted
    // with is inert here — a bomb's overkill is not the hero's own power.
    expect(state.menace).toBe(0);
    expect(state.moveSpawnCredit).toBe(creditBefore);
    expect(state.menaceFloor).toBe(0);
    expect(state.evoProof).toBe(0);
  });

  it("damage powerups (storm) deal damage without feeding the meter", () => {
    const state = powerupStage();
    state.player.heldAbilities = ["test_storm"];
    step(state, useItem, DT); // start the storm running
    state.enemies.push(
      makeEnemy(
        {
          pos: { x: state.player.pos.x + 40, y: state.player.pos.y },
          hp: 1_000_000,
          maxHp: 1_000_000,
        },
        "test_minion",
      ),
    );
    const dealtBefore = state.stats.damageDealt;

    run(state, idle, 120); // a couple of seconds of strikes

    // The storm connected — the run stats book its damage…
    expect(state.stats.damageDealt).toBeGreaterThan(dealtBefore);
    // …but that output never entered the menace fuel, so the meter stays cold.
    expect(state.combatDps).toBe(0);
    expect(state.menace).toBe(0);
  });

  it("the hero's OWN weapon still escalates — the exemption spares only non-hero output", () => {
    // Same overkillable fodder, but felled by the hero's weapon rather than a
    // bomb: the meter and the lure both react, proving nothing global changed.
    const state = startGame();
    bareStage(state);
    state.player.level = 8;
    equip(state, "test_hammer"); // ~34 dmg vs a 10-hp bar → real overkill
    const { x, y } = state.player.pos;
    state.enemies.push(
      makeEnemy({ pos: { x: x + 20, y }, hp: 10, maxHp: 10 }, "test_fodder"),
    );
    const creditBefore = state.moveSpawnCredit;

    step(state, idle, DT);

    expect(state.stats.kills).toBe(1);
    expect(state.menace).toBeGreaterThan(0);
    expect(state.moveSpawnCredit).toBeGreaterThan(creditBefore);
  });
});

describe("menace — companions don't trigger it", () => {
  /** A warmed-up, bare stage with the hero's own weapon silenced, so the only
   * combat output is the recruited companion's — the party carries the fight
   * while the hero swings nothing. */
  function partyStage(state: GameState): void {
    bareStage(state);
    state.player.level = 8; // past the warmup, so a real hero kill WOULD escalate
    state.player.weaponCooldownMs = 1_000_000; // the hero swings nothing himself
  }

  it("a companion clears the pack without heating the meter", () => {
    const state = startGame();
    partyStage(state);
    // Recruit the fixture companion (melee wrench) a short way off, with
    // overkillable fodder pressed right against it so its blows land.
    const companion = recruitCompanion(state, "test_companion", {
      x: state.player.pos.x + 120,
      y: state.player.pos.y,
    });
    state.events = [];
    for (let i = 0; i < 4; i++) {
      state.enemies.push(
        makeEnemy(
          {
            pos: { x: companion.pos.x + 12 + i * 6, y: companion.pos.y },
            hp: 10,
            maxHp: 10,
            mlvl: 1, // ~no armor, so the companion's wrench clears the fodder
          },
          "test_fodder",
        ),
      );
    }
    const creditBefore = state.moveSpawnCredit;
    const killsExemptBefore = state.menaceExemptKills;

    const fodderLeft = () =>
      state.enemies.filter((e) => e.defId === "test_fodder").length;
    for (let i = 0; i < 200 && fodderLeft() > 0; i++) step(state, idle, DT);

    // The party did its job — the fodder is dead and the kills are booked.
    expect(fodderLeft()).toBe(0);
    expect(state.stats.kills).toBeGreaterThan(0);
    // …yet the whole menace side stayed cold: no meter, no rolling fuel, no
    // dinner-bell lure, no permanent-floor ratchet — a party carrying the
    // fight is not the hero being overpowered.
    expect(state.menace).toBe(0);
    expect(state.combatDps).toBe(0);
    expect(state.combatKillRate).toBe(0);
    expect(state.moveSpawnCredit).toBe(creditBefore);
    expect(state.menaceFloor).toBe(0);
    expect(state.evoProof).toBe(0);
    // The kills are netted straight out of the meter's kill-rate fuel.
    expect(state.menaceExemptKills).toBeGreaterThan(killsExemptBefore);
  });
});

describe("menace — elites and bosses match the player", () => {
  const findBoss = (state: GameState) =>
    state.enemies.find((e) => enemyDef(e.defId).role === "boss")!;

  it("leaves a boss at base hp when the player is fresh (level 1, no menace)", () => {
    const state = startGame();
    stopWaves(state);
    const boss = findBoss(state);
    const base = boss.maxHp;
    // Stand on the boss so it engages this step.
    state.player.pos = { x: boss.pos.x + 40, y: boss.pos.y };
    expect(enemyPowerScale(state)).toBe(1);

    step(state, idle, DT);

    expect(boss.powerScaled).toBe(true);
    expect(boss.maxHp).toBe(base); // scale 1 → untouched
    expect(boss.contactMult).toBe(1);
  });

  it("scales a boss to the player's power when it engages", () => {
    const state = startGame();
    stopWaves(state);
    const boss = findBoss(state);
    const base = boss.maxHp;
    state.player.level = 10; // a leveled hero
    const scale = enemyPowerScale(state); // (1 + 9·bossLevelWeight) × autoPowerScale
    expect(scale).toBeGreaterThan(1);
    // Contact rides only the LEVEL term (never autoPowerScale — nothing in
    // the hero's survivability grows with the auto-stat curve) times the
    // horde's gentle per-level damage ramp.
    const levelTerm = enemyPowerLevelTerm(state);
    state.player.pos = { x: boss.pos.x + 40, y: boss.pos.y };

    step(state, idle, DT);

    expect(boss.powerScaled).toBe(true);
    expect(boss.maxHp).toBe(Math.round(base * scale));
    expect(boss.contactMult).toBeCloseTo(
      mobContactScaleFor(boss.mlvl) *
        (1 + (levelTerm - 1) * MENACE.bossContactShare),
    );
  });

  it("locks the scale in exactly once (idempotent across ticks)", () => {
    const state = startGame();
    stopWaves(state);
    const boss = findBoss(state);
    state.player.level = 10;
    state.player.pos = { x: boss.pos.x + 40, y: boss.pos.y };
    step(state, idle, DT);
    const scaled = boss.maxHp;

    // Level up mid-fight; the already-engaged boss must NOT re-scale.
    state.player.level = 20;
    run(state, idle, 5);
    expect(boss.maxHp).toBe(scaled);
  });
});
