// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Ranged enemies (EnemyDef.ranged): shooters fire hostile projectiles at the
// player, take cover behind obstacles between shots (takesCover), and a
// GUARDED unique (EnemyDef.shieldedBy) cannot be hurt while its guardian
// lives. Runs on the synthetic fixtures (test_gunner / test_shielded_boss /
// test_guard on test_ranged_level).

import { describe, expect, it } from "vitest";

import { hitEnemy, JUMP, step } from "@game/core";
import type { GameState, Obstacle } from "@game/core";

import { clearStage, idle, makeEnemy, run, startGame } from "./helpers.ts";

/** A run on the shooter arena with a clean stage (no scattered spawns). */
function stage(): GameState {
  const state = startGame(42, "test_ranged_level");
  clearStage(state);
  return state;
}

/** Park a solid rock at `pos` for cover choreography. */
function addRock(state: GameState, x: number, y: number): Obstacle {
  const rock: Obstacle = {
    id: state.nextId++,
    kind: "test_block",
    sprite: "test_block",
    pos: { x, y },
    radius: 12,
    jumpable: false,
  };
  state.obstacles.push(rock);
  return rock;
}

describe("shooters (EnemyDef.ranged)", () => {
  it("fires a hostile projectile at the player once awake, in range and in sight", () => {
    const state = stage();
    const gunner = makeEnemy(
      { pos: { x: state.player.pos.x + 150, y: state.player.pos.y } },
      "test_gunner",
    );
    gunner.awake = true;
    state.enemies.push(gunner);
    step(state, idle, 16);
    const shots = state.projectiles.filter((p) => p.hostile);
    expect(shots).toHaveLength(1);
    expect(shots[0]?.damage).toBe(20);
    expect(shots[0]?.sourceMlvl).toBe(gunner.mlvl);
    expect(state.events.some((e) => e.type === "enemyShot")).toBe(true);
    // The reload is armed: the very next tick fires nothing new.
    step(state, idle, 16);
    expect(state.projectiles.filter((p) => p.hostile)).toHaveLength(1);
  });

  it("holds fire without line of sight", () => {
    const state = stage();
    const gunner = makeEnemy(
      { pos: { x: state.player.pos.x + 150, y: state.player.pos.y } },
      "test_gunner",
    );
    gunner.awake = true;
    state.enemies.push(gunner);
    // A wall dead between them.
    addRock(state, state.player.pos.x + 75, state.player.pos.y);
    step(state, idle, 16);
    expect(state.projectiles.filter((p) => p.hostile)).toHaveLength(0);
  });

  it("a hostile shot hurts the grounded player and is spent on contact", () => {
    const state = stage();
    const before = state.player.hp;
    // Never dodge: DEX 0 hero, but the roll still draws — pin the rng so the
    // dodge branch can't fire.
    state.rng = () => 0.99;
    state.projectiles.push({
      id: state.nextId++,
      pos: { x: state.player.pos.x - 20, y: state.player.pos.y },
      dir: { x: 1, y: 0 },
      speed: 200,
      radius: 4,
      damage: 20,
      lifetimeMs: 2000,
      weaponClass: "ranged",
      sprite: "bolt",
      hostile: true,
      sourceMlvl: 1,
      z: 0,
    });
    run(state, idle, 12);
    expect(state.player.hp).toBeLessThan(before);
    expect(state.projectiles.filter((p) => p.hostile)).toHaveLength(0);
  });

  it("a jumping hero sails clean over a hostile shot", () => {
    const state = stage();
    const before = state.player.hp;
    state.rng = () => 0.99;
    state.player.z = JUMP.dodgeHeight + 10;
    state.player.vz = 0;
    state.projectiles.push({
      id: state.nextId++,
      pos: { x: state.player.pos.x - 8, y: state.player.pos.y },
      dir: { x: 1, y: 0 },
      speed: 200,
      radius: 4,
      damage: 20,
      lifetimeMs: 100,
      weaponClass: "ranged",
      sprite: "bolt",
      hostile: true,
      sourceMlvl: 1,
      z: 0,
    });
    // One tick: the shot passes under him (gravity would land him later).
    step(state, idle, 16);
    expect(state.player.hp).toBe(before);
  });

  it("hostile shots never touch the horde", () => {
    const state = stage();
    state.rng = () => 0.99;
    const bystander = makeEnemy(
      { pos: { x: state.player.pos.x - 60, y: state.player.pos.y } },
      "test_guard",
    );
    bystander.hp = 60;
    state.enemies.push(bystander);
    // A shot flying straight through the bystander toward the player.
    state.projectiles.push({
      id: state.nextId++,
      pos: { x: state.player.pos.x - 100, y: state.player.pos.y },
      dir: { x: 1, y: 0 },
      speed: 200,
      radius: 4,
      damage: 20,
      lifetimeMs: 2000,
      weaponClass: "ranged",
      sprite: "bolt",
      hostile: true,
      sourceMlvl: 1,
      z: 0,
    });
    run(state, idle, 20);
    expect(bystander.hp).toBe(60);
  });

  it("a covering shooter scrambles behind the nearest rock while reloading", () => {
    const state = stage();
    const gunner = makeEnemy(
      {
        pos: { x: state.player.pos.x + 120, y: state.player.pos.y },
        speed: 60,
      },
      "test_gunner",
    );
    gunner.awake = true;
    // Freshly fired: the whole reload still to burn.
    gunner.rangedCooldownMs = 1500;
    state.enemies.push(gunner);
    // A rock beside it — the far side is the hideout.
    const rock = addRock(state, state.player.pos.x + 180, state.player.pos.y);
    const beyond = () => gunner.pos.x - rock.pos.x;
    const before = beyond();
    run(state, idle, 30);
    // It moved toward (or past) the rock's far side — strictly away from the
    // player relative to the rock.
    expect(beyond()).toBeGreaterThan(before - 1);
    expect(gunner.pos.x).toBeGreaterThan(state.player.pos.x + 130);
  });
});

describe("guarded uniques (EnemyDef.shieldedBy)", () => {
  it("bounces every blow while the guardian lives, then falls normally", () => {
    const state = stage();
    const guard = makeEnemy({ pos: { x: 300, y: 300 } }, "test_guard");
    guard.hp = 60;
    guard.maxHp = 60;
    const boss = makeEnemy(
      { pos: { x: 600, y: 600 }, id: 9001 },
      "test_shielded_boss",
    );
    boss.hp = 500;
    boss.maxHp = 500;
    boss.powerScaled = true;
    state.enemies.push(guard, boss);

    hitEnemy(state, boss, 100);
    expect(boss.hp).toBe(500);
    expect(state.events.some((e) => e.type === "enemyShielded")).toBe(true);

    // Down the guardian: the shield falls with it.
    hitEnemy(state, guard, 999);
    expect(state.enemies).not.toContain(guard);
    state.events = [];
    hitEnemy(state, boss, 100);
    expect(boss.hp).toBeLessThan(500);
    expect(state.events.some((e) => e.type === "enemyShielded")).toBe(false);
  });
});
