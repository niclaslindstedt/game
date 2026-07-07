// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The menace system: the escalation meter that answers an overpowered player.
// Overkilling and fast kills bank menace; idling bleeds it off. The stage it
// reads lures a denser horde, evolves freshly-spawned minions (more hp → more
// xp → better loot), and — with the player's own level — scales elites and
// bosses when they engage. Runs on the synthetic engine fixtures.

import { describe, expect, it } from "vitest";

import {
  enemyDef,
  enemyPowerScale,
  MENACE,
  menaceStage,
  step,
} from "@game/core";
import type { Equipment, GameState } from "@game/core";

import { DT, idle, makeEnemy, run, startGame, stopWaves } from "./helpers.ts";

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

  it("an overkill crossing a stage boundary emits menaceRose", () => {
    const state = startGame();
    bareStage(state);
    equip(state, "test_hammer");
    const { x, y } = state.player.pos;
    state.enemies.push(
      makeEnemy({ pos: { x: x + 20, y }, hp: 10, maxHp: 10 }, "test_fodder"),
    );
    // Park menace just below stage 1: this kill's overkill (≥ 24 × perOverkill)
    // tips it over — being wildly overpowered escalates on the spot.
    state.menace = MENACE.perStage - 0.5;

    step(state, idle, DT);

    const rose = state.events.find((e) => e.type === "menaceRose");
    expect(rose).toBeDefined();
    expect(rose && rose.type === "menaceRose" && rose.stage).toBe(1);
    expect(menaceStage(state)).toBe(1);
  });

  it("sustained damage output heats the meter even without overkill", () => {
    // The rolling DPS/kill-rate driver: grind a tanky mob (no killing blow, so
    // no overkill spike) and the meter still climbs purely from output.
    const state = startGame();
    bareStage(state);
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
