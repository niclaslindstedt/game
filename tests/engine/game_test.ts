// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Core simulation tests: run the engine headlessly with a fixed seed and
// fixed timestep, exactly like the app's game loop does, and assert on the
// rules — level layout, steering, jumping, combat, enemy AI, win/lose.

import { describe, expect, it } from "vitest";

import {
  advanceDialogue,
  allocateStat,
  createGame,
  dismissIntro,
  ENEMY_AI,
  enemyDef,
  JUMP,
  levelDef,
  weaponDef,
  weaponCooldownFor,
  weaponRangeFor,
  PLAYER,
  RUN,
  step,
  WEAPON,
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
import { FIX_ENEMIES } from "./fixtures.ts";

const MOON = levelDef("test_level");
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);
const isBoss = (defId: string) => enemyDef(defId).role === "boss";
const isMinion = (defId: string) => enemyDef(defId).role === "minion";

describe("createGame", () => {
  it("opens on the intro text box and only plays after dismissal", () => {
    const state = createGame(SEED, "test_level");
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
    const state = createGame(SEED, "test_level");
    const minions = state.enemies.filter((e) => isMinion(e.defId));
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
    expect(state.level.biome).toBe("test");
  });

  it("bands enemy difficulty by distance from the player spawn", () => {
    const state = createGame(SEED, "test_level");
    const avg = (defId: string) => {
      const list = state.enemies.filter((e) => e.defId === defId);
      return (
        list.reduce((sum, e) => sum + dist(e.pos, state.playerSpawn), 0) /
        list.length
      );
    };
    expect(avg("test_fodder")).toBeLessThan(avg("test_minion"));
    expect(avg("test_minion")).toBeLessThan(avg("test_brute"));
  });

  it("is deterministic for a given seed", () => {
    const a = createGame(SEED, "test_level");
    const b = createGame(SEED, "test_level");
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

  it("only flips the sprite on decisively horizontal movement", () => {
    const state = startGame();
    clearStage(state);
    const { x, y } = state.player.pos;

    step(state, steerTo(x - 200, y), DT);
    expect(state.player.faceLeft).toBe(true);

    // Near-vertical steering (even leaning slightly right) keeps the flip:
    // this is what used to flicker when diagonals hovered around vertical.
    step(state, steerTo(state.player.pos.x + 2, state.player.pos.y + 300), DT);
    expect(state.player.faceLeft).toBe(true);

    step(state, steerTo(state.player.pos.x + 200, state.player.pos.y), DT);
    expect(state.player.faceLeft).toBe(false);
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
    // Clear the seeded obstacle field so this exercises boundary clamping, not
    // squeezing between rocks — a winded (half-speed) approach otherwise pins
    // on a solid block the full-speed run happened to skirt.
    state.obstacles = [];
    // Long enough for the diagonal to the corner even once the sprint pool
    // drains and the run drops to its winded half-speed floor.
    run(state, steerTo(-5000, -5000), 8000);
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
    const range = weaponDef("blaster").range;
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
    const shot = state.events.find((e) => e.type === "shot");
    expect(shot).toMatchObject({ type: "shot", weaponClass: "ranged" });
    // The shot carries the muzzle and aim the app draws the flash from.
    expect(shot).toHaveProperty("pos");
    expect(shot).toHaveProperty("dir");
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

  it("fires from the player's height mid-jump and the shot sinks back", () => {
    const state = startGame();
    clearStage(state);
    state.player.z = 40; // mid-jump
    state.enemies.push(
      makeEnemy({
        pos: { x: state.player.pos.x + 100, y: state.player.pos.y },
      }),
    );
    step(state, idle, DT);
    // Fired at z=40; one step of sink has already applied.
    const shot = state.projectiles[0]!;
    expect(shot.z).toBeGreaterThan(30);
    const early = shot.z;
    run(state, idle, 5); // a few more steps of flight, before it connects
    expect(shot.z).toBeLessThan(early); // sinking in flight
  });

  it("ignores monsters outside the given view — they aren't on screen yet", () => {
    const state = startGame();
    clearStage(state);
    const { x, y } = state.player.pos;
    state.enemies.push(makeEnemy({ pos: { x: x + 150, y } }));
    // A view that ends before the monster: in range, but not visible.
    const view = { x: x - 160, y: y - 90, width: 300, height: 180 };
    step(state, { ...idle, view }, DT);
    expect(state.projectiles).toHaveLength(0);

    // Widen the view and the same monster is fair game.
    view.width = 400;
    step(state, { ...idle, view }, DT);
    expect(state.projectiles).toHaveLength(1);
  });

  it("swings melee weapons directly, no projectile", () => {
    const state = startGame();
    state.player.equipment.weapon = {
      id: 777,
      defId: "test_wrench",
      slot: "weapon",
      tier: "regular",
      affixes: [],
    };
    state.enemies = [
      makeEnemy({ pos: { x: state.player.pos.x + 20, y: state.player.pos.y } }),
    ];
    step(state, idle, DT);
    expect(state.projectiles).toHaveLength(0);
    const swing = state.events.find((e) => e.type === "swing");
    expect(swing).toMatchObject({ type: "swing" });
    // The swing carries the pos, aim, and reach the app sweeps the arc over.
    expect(swing).toHaveProperty("pos");
    expect(swing).toHaveProperty("dir");
    expect(swing).toHaveProperty("range");
    expect(state.stats.damageDealt).toBeGreaterThanOrEqual(
      weaponDef("test_wrench").damage,
    );
  });
});

describe("melee sweep AoE", () => {
  const equip = (state: ReturnType<typeof startGame>, defId: string) => {
    state.player.equipment.weapon = {
      id: 777,
      defId,
      slot: "weapon",
      tier: "regular",
      affixes: [],
    };
  };

  it("a blade cleaves every monster in the cone in one swing (INT raises the cap)", () => {
    const state = startGame();
    state.obstacles = [];
    equip(state, "test_wrench"); // default 120° cone, reach 42
    // The swing's target cap starts at MELEE.baseAoeTargets (2); one point of
    // INT lifts it to 3 so the whole front rank is cleaved.
    state.player.stats.intelligence = 1;
    const { x, y } = state.player.pos;
    // Three minions clustered ahead, all within reach and the front cone.
    const front = [
      makeEnemy({ pos: { x: x + 20, y } }),
      makeEnemy({ pos: { x: x + 18, y: y + 10 } }),
      makeEnemy({ pos: { x: x + 18, y: y - 10 } }),
    ];
    // One directly behind the swing — in reach, but outside the cone.
    const behind = makeEnemy({ pos: { x: x - 24, y } });
    state.enemies = [...front, behind];

    step(state, idle, DT);

    // A single swing bloodied all three in front…
    for (const enemy of front) {
      expect(enemy.hp).toBeLessThan(enemy.maxHp);
    }
    // …and left the one behind the arc untouched.
    expect(behind.hp).toBe(behind.maxHp);
    // Only one swing was emitted for the whole cleave.
    expect(state.events.filter((e) => e.type === "swing")).toHaveLength(1);
  });

  it("an un-invested swing strikes only the two nearest of the cone", () => {
    const state = startGame();
    state.obstacles = [];
    equip(state, "test_wrench"); // default 120° cone, reach 42
    // No INTELLIGENCE: the cap sits at MELEE.baseAoeTargets (2).
    const { x, y } = state.player.pos;
    // Three foes in the cone at increasing distance; the swing must land on
    // the two NEAREST and spare the third even though it is inside the arc.
    const near = makeEnemy({ pos: { x: x + 16, y } });
    const mid = makeEnemy({ pos: { x: x + 22, y: y + 8 } });
    const far = makeEnemy({ pos: { x: x + 30, y: y - 8 } });
    state.enemies = [near, mid, far];

    step(state, idle, DT);

    expect(near.hp).toBeLessThan(near.maxHp);
    expect(mid.hp).toBeLessThan(mid.maxHp);
    expect(far.hp).toBe(far.maxHp); // beyond the two-target cap
  });

  it("the swing event carries the weapon's cone angle", () => {
    const state = startGame();
    state.obstacles = [];
    equip(state, "test_wrench");
    const { x, y } = state.player.pos;
    state.enemies = [makeEnemy({ pos: { x: x + 20, y } })];
    step(state, idle, DT);
    const swing = state.events.find((e) => e.type === "swing");
    // 120° default cone, in radians.
    expect(swing).toMatchObject({ arc: expect.closeTo((120 * Math.PI) / 180) });
  });

  it("a spear thrusts a narrow cone far, sparing what a blade would clip", () => {
    const state = startGame();
    state.obstacles = [];
    equip(state, "test_spear"); // narrow 40° cone, long reach 90
    const { x, y } = state.player.pos;
    // Nearest monster straight ahead sets the aim.
    const near = makeEnemy({ pos: { x: x + 40, y } });
    // A second monster far down the same line — beyond a blade's reach,
    // still skewered by the spear.
    const far = makeEnemy({ pos: { x: x + 80, y } });
    // Off to the side: inside a wide arc, but outside the narrow thrust.
    const flank = makeEnemy({ pos: { x: x + 50, y: y + 50 } });
    state.enemies = [near, far, flank];

    step(state, idle, DT);

    expect(near.hp).toBeLessThan(near.maxHp);
    expect(far.hp).toBeLessThan(far.maxHp); // reaches far down the line
    expect(flank.hp).toBe(flank.maxHp); // the flank is spared
  });
});

describe("weapon reach, cadence, and AoE", () => {
  const equipWrench = (state: ReturnType<typeof startGame>) => {
    state.player.equipment.weapon = {
      id: 777,
      defId: "test_wrench",
      slot: "weapon",
      tier: "regular",
      affixes: [],
    };
  };

  it("INTELLIGENCE widens reach, DEXTERITY quickens swings, STRENGTH does neither", () => {
    const state = startGame();
    equipWrench(state);
    const base = weaponDef("test_wrench");
    const weapon = () => state.player.equipment.weapon;

    // No stats: the plain catalog numbers (cadence via the global lever).
    const baseCadence = base.cooldownMs * WEAPON.baseCooldownMult;
    expect(weaponRangeFor(state, weapon())).toBeCloseTo(base.range);
    expect(weaponCooldownFor(state, weapon())).toBeCloseTo(baseCadence);

    // STRENGTH is a damage stat now — it moves neither reach nor cadence.
    state.player.stats.strength = 20;
    expect(weaponRangeFor(state, weapon())).toBeCloseTo(base.range);
    expect(weaponCooldownFor(state, weapon())).toBeCloseTo(baseCadence);

    // INTELLIGENCE lengthens the reach; DEXTERITY quickens the swing.
    state.player.stats.intelligence = 20;
    expect(weaponRangeFor(state, weapon())).toBeGreaterThan(base.range);
    expect(weaponCooldownFor(state, weapon())).toBeCloseTo(baseCadence); // INT is not a speed stat
    state.player.stats.dexterity = 20;
    expect(weaponCooldownFor(state, weapon())).toBeLessThan(base.cooldownMs);

    // A ranged weapon's reach also grows with INT and its cadence with DEX.
    const ranged = {
      id: 778,
      defId: "blaster",
      slot: "weapon" as const,
      tier: "regular" as const,
      affixes: [],
    };
    expect(weaponRangeFor(state, ranged)).toBeGreaterThan(
      weaponDef("blaster").range,
    );
    expect(weaponCooldownFor(state, ranged)).toBeLessThan(
      weaponDef("blaster").cooldownMs,
    );
  });

  it("lets a high-INT character strike a monster its base reach can't touch", () => {
    const base = weaponDef("test_wrench");
    // A target sat just outside the plain reach but inside the INT-widened one.
    const gap = base.range + 8;

    const weak = startGame();
    equipWrench(weak);
    weak.player.stats.intelligence = 0;
    stopWaves(weak);
    weak.enemies = [
      makeEnemy({ pos: { x: weak.player.pos.x + gap, y: weak.player.pos.y } }),
    ];
    step(weak, idle, DT);
    expect(weak.events.some((e) => e.type === "swing")).toBe(false);

    const reachy = startGame();
    equipWrench(reachy);
    reachy.player.stats.intelligence = 20;
    stopWaves(reachy);
    reachy.enemies = [
      makeEnemy({
        pos: { x: reachy.player.pos.x + gap, y: reachy.player.pos.y },
      }),
    ];
    step(reachy, idle, DT);
    expect(reachy.events.some((e) => e.type === "swing")).toBe(true);
  });

  it("INTELLIGENCE's wider AoE cone cleaves a foe off the flank", () => {
    // A larger area catches more enemies: a foe at 90° off the aim sits
    // outside the wrench's base 120° cone but inside an INT-widened one.
    const flankStruck = (intelligence: number) => {
      const state = startGame();
      equipWrench(state); // 120° cone (60° half-angle), reach 42
      state.player.stats.intelligence = intelligence;
      stopWaves(state);
      const { x, y } = state.player.pos;
      // The nearer foe dead ahead fixes the aim along +x; the flank foe is a
      // quarter-turn off it, well within reach.
      const flank = makeEnemy({ pos: { x, y: y + 30 }, hp: 500, maxHp: 500 });
      state.enemies = [
        makeEnemy({ pos: { x: x + 20, y }, hp: 500, maxHp: 500 }),
        flank,
      ];
      step(state, idle, DT);
      return flank.hp < flank.maxHp;
    };
    expect(flankStruck(0)).toBe(false); // the base cone misses the flank
    expect(flankStruck(20)).toBe(true); // the widened cone cleaves it
  });
});

describe("enemy AI", () => {
  it("chases inside the aggro radius and drifts home outside it", () => {
    const state = startGame();
    const aggro = enemyDef("test_minion").ai.aggroRadius;
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
        speed: enemyDef("test_minion").speed,
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
    for (const def of Object.values(FIX_ENEMIES)) {
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
      x: flag.pos.x - enemyDef("test_boss").ai.aggroRadius + 40,
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
    boss.spoke = true; // skip his arrival scene: this test is the victory flow
    boss.pos = { x: state.player.pos.x + 60, y: state.player.pos.y };
    boss.speed = 0;

    run(state, idle, 500, (s) => s.enemies.length === 0);
    expect(state.enemies).toHaveLength(0);
    expect(state.phase).not.toBe("victory"); // grace period first
    expect(state.victoryCountdownMs).toBeGreaterThan(RUN.victoryDelayMs - 100);

    // The boss gasps his last words as he falls: tap through the death scene,
    // then spend the level-ups the kill banked, so time can resume.
    while (state.phase === "dialogue") advanceDialogue(state);
    while (state.player.pendingStatPoints > 0) allocateStat(state, "stamina");
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
