// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Core simulation tests: run the engine headlessly with a fixed seed and
// fixed timestep, exactly like the app's game loop does, and assert on the
// rules — level layout, steering, jumping, combat, enemy AI, win/lose.

import { describe, expect, it } from "vitest";

import {
  allocateStat,
  createGame,
  dismissIntro,
  ENEMY_AI,
  ENEMY_DEFS,
  enemyDef,
  JUMP,
  LEVELS,
  PLAYER,
  RUN,
  step,
  WEAPON_DEFS,
} from "@game/core";
import {
  clearStage,
  DT,
  idle,
  jumpOnce,
  makeEnemy,
  run,
  SEED,
  startGame,
  steerTo,
  stopWaves,
} from "./helpers.ts";

const MOON = LEVELS.moon!;
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);
const isBoss = (defId: string) => enemyDef(defId).role === "boss";

describe("createGame", () => {
  it("opens on the intro text box and only plays after dismissal", () => {
    const state = createGame(SEED);
    expect(state.phase).toBe("intro");
    expect(MOON.intro.length).toBeGreaterThan(0);

    step(state, steerTo(0, 0), DT);
    expect(state.stats.timeMs).toBe(0); // frozen during the intro

    dismissIntro(state);
    expect(state.phase).toBe("playing");
    step(state, idle, DT);
    expect(state.stats.timeMs).toBe(DT);
  });

  it("builds the moonscape: ghosts, boss at the flag, lander-side spawn", () => {
    const state = createGame(SEED);
    const minions = state.enemies.filter((e) => !isBoss(e.defId));
    const bosses = state.enemies.filter((e) => isBoss(e.defId));
    const expectedMinions = MOON.spawns
      .filter((s) => "band" in s)
      .reduce((sum, s) => sum + ("count" in s ? s.count : 0), 0);
    expect(minions).toHaveLength(expectedMinions);
    expect(bosses).toHaveLength(1);

    const flag = state.landmarks.find((l) => l.kind === "flag")!;
    expect(bosses[0]!.pos).toEqual(flag.pos);
    expect(state.landmarks.some((l) => l.kind === "lander")).toBe(true);
    expect(dist(state.player.pos, state.playerSpawn)).toBe(0);
    expect(state.decor.length).toBeGreaterThan(0);
    expect(state.player.equipment.weapon.defId).toBe("blaster");
    expect(state.level.biome).toBe("moon");
  });

  it("bands enemy difficulty by distance from the player spawn", () => {
    const state = createGame(SEED);
    const avg = (defId: string) => {
      const list = state.enemies.filter((e) => e.defId === defId);
      return (
        list.reduce((sum, e) => sum + dist(e.pos, state.playerSpawn), 0) /
        list.length
      );
    };
    expect(avg("wisp")).toBeLessThan(avg("ghost"));
    expect(avg("ghost")).toBeLessThan(avg("wraith"));
  });

  it("is deterministic for a given seed", () => {
    const a = createGame(SEED);
    const b = createGame(SEED);
    expect(a.enemies.map((e) => e.pos)).toEqual(b.enemies.map((e) => e.pos));
    expect(a.decor).toEqual(b.decor);
  });
});

describe("steering", () => {
  it("moves the player toward the held target and stops on arrival", () => {
    const state = startGame();
    const target = { x: state.player.pos.x + 60, y: state.player.pos.y };
    step(state, steerTo(target.x, target.y), DT);
    expect(state.player.moving).toBe(true);
    expect(state.player.facing.x).toBeCloseTo(1);

    run(state, steerTo(target.x, target.y), 200);
    expect(Math.abs(state.player.pos.x - target.x)).toBeLessThanOrEqual(
      PLAYER.arriveRadius,
    );
  });

  it("does not move while the pointer is released", () => {
    const state = startGame();
    const before = { ...state.player.pos };
    step(state, idle, DT);
    expect(state.player.pos).toEqual(before);
    expect(state.player.moving).toBe(false);
  });

  it("clamps the player inside the finite level", () => {
    const state = startGame();
    clearStage(state);
    run(state, steerTo(-5000, -5000), 1800);
    expect(state.player.pos.x).toBe(PLAYER.radius);
    expect(state.player.pos.y).toBe(PLAYER.radius);
  });
});

describe("jumping", () => {
  it("launches on the jump edge and floats a moon-high arc", () => {
    const state = startGame();
    clearStage(state);
    step(state, jumpOnce, DT);
    expect(state.player.z).toBeGreaterThan(0);
    expect(state.events).toContainEqual({ type: "jump" });

    // Ride the arc to its apex: roughly v²/2g with the LEVEL's gravity —
    // the moon's low g makes it far higher than an earth hop would be.
    let apex = 0;
    run(state, idle, 400, (s) => {
      apex = Math.max(apex, s.player.z);
      return s.player.z === 0 && s.stats.timeMs > DT * 4;
    });
    const expected = JUMP.velocity ** 2 / (2 * state.level.gravity);
    expect(apex).toBeGreaterThan(expected * 0.85);
    expect(apex).toBeGreaterThan(50); // reads as a big, floaty moon jump
  });

  it("cannot double-jump mid-air", () => {
    const state = startGame();
    clearStage(state);
    step(state, jumpOnce, DT);
    const rising = state.player.vz;
    step(state, jumpOnce, DT);
    expect(state.player.vz).toBeLessThan(rising); // gravity, not a re-launch
  });

  it("sails over ghosts: no contact damage while airborne", () => {
    const state = startGame();
    clearStage(state);
    // Get airborne above the dodge height, then drop a ghost on the player.
    step(state, jumpOnce, DT);
    run(state, idle, 100, (s) => s.player.z > JUMP.dodgeHeight + 10);
    expect(state.player.z).toBeGreaterThan(JUMP.dodgeHeight);
    // Unkillable so the auto-blaster can't clear it before the landing.
    const ghost = makeEnemy({
      pos: { ...state.player.pos },
      hp: 1_000_000,
      maxHp: 1_000_000,
    });
    state.enemies.push(ghost);
    step(state, idle, DT);
    expect(state.stats.damageTaken).toBe(0);

    // Back on the ground the same ghost connects.
    run(state, idle, 200, (s) => s.player.z === 0);
    ghost.pos = { ...state.player.pos };
    ghost.contactCooldownMs = 0;
    step(state, idle, DT);
    expect(state.stats.damageTaken).toBeGreaterThan(0);
  });
});

describe("weapon", () => {
  it("auto-fires only when a monster is in range", () => {
    const state = startGame();
    const range = WEAPON_DEFS.blaster!.range;
    state.enemies = [
      makeEnemy({
        pos: { x: state.player.pos.x + range + 100, y: state.player.pos.y },
      }),
    ];
    step(state, idle, DT);
    expect(state.projectiles).toHaveLength(0);

    state.enemies[0]!.pos.x = state.player.pos.x + range - 50;
    step(state, idle, DT);
    expect(state.projectiles).toHaveLength(1);
    expect(state.stats.shotsFired).toBe(1);
    expect(state.events).toContainEqual({
      type: "shot",
      weaponClass: "ranged",
    });
  });

  it("kills a monster after enough hits and records the kill", () => {
    const state = startGame();
    stopWaves(state);
    state.enemies = [
      makeEnemy({ pos: { x: state.player.pos.x + 80, y: state.player.pos.y } }),
    ];
    state.items = [];
    run(state, idle, 2000, (s) => s.enemies.length === 0);
    expect(state.enemies).toHaveLength(0);
    expect(state.stats.kills).toBe(1);
    expect(state.stats.damageDealt).toBeGreaterThanOrEqual(45);
  });

  it("swings melee weapons directly, no projectile", () => {
    const state = startGame();
    state.player.equipment.weapon = {
      id: 777,
      defId: "wrench",
      slot: "weapon",
      tier: "regular",
      affixes: [],
    };
    state.enemies = [
      makeEnemy({ pos: { x: state.player.pos.x + 20, y: state.player.pos.y } }),
    ];
    step(state, idle, DT);
    expect(state.projectiles).toHaveLength(0);
    expect(state.events).toContainEqual({ type: "swing" });
    expect(state.stats.damageDealt).toBeGreaterThanOrEqual(
      WEAPON_DEFS.wrench!.damage,
    );
  });
});

describe("enemy AI", () => {
  it("chases inside the aggro radius and drifts home outside it", () => {
    const state = startGame();
    const aggro = ENEMY_DEFS.ghost!.ai.aggroRadius;
    const near = makeEnemy({
      id: 1,
      pos: { x: state.player.pos.x + 100, y: state.player.pos.y },
      speed: 60,
    });
    const far = makeEnemy({
      id: 2,
      pos: { x: state.player.pos.x + aggro + 200, y: state.player.pos.y },
      speed: 60,
    });
    far.home = { x: far.pos.x + 50, y: far.pos.y };
    state.enemies = [near, far];

    step(state, idle, DT);
    expect(near.pos.x).toBeLessThan(state.player.pos.x + 100); // closing in
    expect(far.pos.x).toBeGreaterThan(state.player.pos.x + aggro + 200); // heading home
  });

  it("deals contact damage with a cooldown", () => {
    const state = startGame();
    stopWaves(state);
    state.enemies = [
      makeEnemy({
        pos: { x: state.player.pos.x + 40, y: state.player.pos.y },
        hp: 1_000_000,
        maxHp: 1_000_000,
        speed: ENEMY_DEFS.ghost!.speed,
      }),
    ];
    run(state, idle, 300, (s) => s.stats.damageTaken > 0);
    const taken = state.stats.damageTaken;
    expect(taken).toBeGreaterThan(0);

    // Immediately after a hit the cooldown must block a second hit.
    step(state, idle, DT);
    expect(state.stats.damageTaken).toBe(taken);
  });

  it("is outpaced by the player: every monster is slower, even with jitter", () => {
    for (const def of Object.values(ENEMY_DEFS)) {
      expect(def.speed * (1 + ENEMY_AI.speedJitter)).toBeLessThan(PLAYER.speed);
    }
  });

  it("keeps the boss guarding the flag until the player closes in", () => {
    const state = startGame();
    const boss = state.enemies.find((e) => isBoss(e.defId))!;
    const flag = state.landmarks.find((l) => l.kind === "flag")!;
    run(state, idle, 20);
    expect(dist(boss.pos, flag.pos)).toBeLessThan(4); // still hiding

    state.player.pos = {
      x: flag.pos.x - ENEMY_DEFS.armstrong!.ai.aggroRadius + 40,
      y: flag.pos.y,
    };
    const before = dist(boss.pos, state.player.pos);
    run(state, idle, 10);
    expect(dist(boss.pos, state.player.pos)).toBeLessThan(before); // awake
  });
});

describe("items", () => {
  it("heals the player on medkit pickup, capped at max hp", () => {
    const state = startGame();
    clearStage(state);
    state.player.hp = state.player.maxHp - 10;
    state.items = [{ id: 999, kind: "medkit", pos: { ...state.player.pos } }];
    step(state, idle, DT);
    expect(state.player.hp).toBe(state.player.maxHp);
    expect(state.items).toHaveLength(0);
    expect(state.stats.itemsCollected).toBe(1);
  });
});

describe("win and lose", () => {
  it("does NOT end the level when regular ghosts die — only the boss", () => {
    const state = startGame();
    state.enemies = state.enemies.filter((e) => isBoss(e.defId));
    step(state, idle, DT);
    expect(state.phase).toBe("playing");
    expect(state.victoryCountdownMs).toBeNull();
  });

  it("ends in victory shortly after the boss falls", () => {
    const state = startGame();
    stopWaves(state);
    const boss = state.enemies.find((e) => isBoss(e.defId))!;
    state.enemies = [boss];
    boss.hp = 1;
    boss.pos = { x: state.player.pos.x + 60, y: state.player.pos.y };
    boss.speed = 0;

    run(state, idle, 500, (s) => s.enemies.length === 0);
    expect(state.enemies).toHaveLength(0);
    expect(state.phase).not.toBe("victory"); // grace period first
    expect(state.victoryCountdownMs).toBeGreaterThan(RUN.victoryDelayMs - 100);

    // The boss XP banks level-ups; spend them so time can resume.
    while (state.player.pendingStatPoints > 0) allocateStat(state, "health");
    expect(state.phase).toBe("playing");
    run(
      state,
      idle,
      Math.ceil(RUN.victoryDelayMs / DT) + 10,
      (s) => s.phase === "victory",
    );
    expect(state.phase).toBe("victory");
    expect(state.events).toContainEqual({ type: "victory" });
  });

  it("ends in defeat when the player's hp reaches zero", () => {
    const state = startGame();
    state.player.hp = 1;
    state.enemies = [makeEnemy({ pos: { ...state.player.pos } })];
    step(state, idle, DT);
    expect(state.phase).toBe("defeat");
    expect(state.player.hp).toBe(0);
    expect(state.events).toContainEqual({ type: "defeat" });
  });

  it("freezes the simulation after the game ends", () => {
    const state = startGame();
    state.player.hp = 1;
    state.enemies = [makeEnemy({ pos: { ...state.player.pos } })];
    step(state, idle, DT);
    const time = state.stats.timeMs;
    step(state, steerTo(0, 0), DT);
    expect(state.stats.timeMs).toBe(time);
    expect(state.events).toHaveLength(0);
  });
});
