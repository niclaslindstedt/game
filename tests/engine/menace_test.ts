// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The menace system: the escalation meter that answers an overpowered player.
// Overkilling and fast kills bank menace; idling bleeds it off. The stage it
// reads lures a denser horde, evolves freshly-spawned minions (more hp → more
// xp → better loot), and — with the player's own level — scales elites and
// bosses when they engage. Runs on the synthetic engine fixtures.

import { describe, expect, it } from "vitest";

import {
  createGame,
  dismissIntro,
  enemyDef,
  enemyPowerScale,
  MENACE,
  menaceStage,
  menaceWarmup,
  skipCutscene,
  step,
} from "@game/core";
import type { Equipment, GameState } from "@game/core";

import { DT, idle, makeEnemy, run, startGame, stopWaves } from "./helpers.ts";

/** A run past the prelude on a chosen difficulty (fixtures are installed). */
function startOn(difficulty: string, levelId = "test_level"): GameState {
  const state = createGame(42, levelId, difficulty as never);
  skipCutscene(state);
  dismissIntro(state);
  return state;
}

/** Slot a specific weapon so the swing/shot damage is known. */
function equip(state: GameState, defId: string): void {
  const weapon: Equipment = {
    id: 777,
    defId,
    slot: "weapon",
    tier: "regular",
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
  it("buckets menace into evolution stages, capped at maxStage", () => {
    const state = startGame();
    state.menace = 0;
    expect(menaceStage(state)).toBe(0);
    state.menace = MENACE.perStage - 0.01;
    expect(menaceStage(state)).toBe(0);
    state.menace = MENACE.perStage;
    expect(menaceStage(state)).toBe(1);
    state.menace = MENACE.max * 10; // way over the cap
    expect(menaceStage(state)).toBe(MENACE.maxStage);
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

  it("sustained damage output heats the meter even without overkill", () => {
    // The rolling DPS/kill-rate driver: grind a tanky mob (no killing blow, so
    // no overkill spike) and the meter still climbs purely from output. Run it
    // on a sensitive difficulty with a warmed-up hero, since the DPS channel is
    // deliberately a gentle supporting term (see MENACE.perDps).
    const state = startOn("jesus");
    bareStage(state);
    state.player.level = 8;
    equip(state, "test_hammer");
    const { x, y } = state.player.pos;
    state.enemies.push(
      makeEnemy(
        { pos: { x: x + 20, y }, hp: 100_000, maxHp: 100_000 },
        "test_fodder",
      ),
    );
    expect(state.menace).toBe(0);

    // A couple of seconds of sustained swings, never landing a kill.
    run(state, idle, 180, (s) => s.stats.kills > 0);

    expect(state.stats.kills).toBe(0); // never died: no overkill possible
    expect(state.combatDps).toBeGreaterThan(0); // output was tracked
    expect(state.menace).toBeGreaterThan(0); // and it heated the meter
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
  /** Menace banked by one identical overkill kill on the given difficulty. */
  function joltOn(difficulty: string, level: number): number {
    const state = startOn(difficulty);
    bareStage(state);
    state.player.level = level;
    equip(state, "test_hammer"); // 34 dmg vs a 10-hp fodder → fixed overkill
    const { x, y } = state.player.pos;
    state.enemies.push(
      makeEnemy({ pos: { x: x + 20, y }, hp: 10, maxHp: 10 }, "test_fodder"),
    );
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
      expect(e.maxHp).toBe(enemyDef(e.defId).hp); // medium mobHpMult = 1
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
      // Each mob's hp is consistent with its OWN stamped stage.
      const mult = 1 + (e.evo ?? 0) * MENACE.hpPerStage;
      expect(e.maxHp).toBe(Math.round(enemyDef(e.defId).hp * mult));
      // An evolved mob is worth more xp (xp is hp-proportional).
      expect(e.maxHp).toBeGreaterThan(enemyDef(e.defId).hp);
    }
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
    expect(minionsAfter(MENACE.max)).toBeGreaterThan(minionsAfter(0));
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
    const scale = enemyPowerScale(state); // 1 + 9 * bossLevelWeight
    expect(scale).toBeGreaterThan(1);
    state.player.pos = { x: boss.pos.x + 40, y: boss.pos.y };

    step(state, idle, DT);

    expect(boss.powerScaled).toBe(true);
    expect(boss.maxHp).toBe(Math.round(base * scale));
    // Contact damage scales too, but softened by bossContactShare.
    expect(boss.contactMult).toBeCloseTo(
      1 + (scale - 1) * MENACE.bossContactShare,
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
