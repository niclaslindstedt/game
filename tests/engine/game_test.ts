// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Core simulation tests: run the engine headlessly with a fixed seed and
// fixed timestep, exactly like the app's game loop does, and assert on the
// rules — level layout, steering, jumping, combat, enemy AI, win/lose.

import { afterEach, describe, expect, it } from "vitest";

import {
  advanceDialogue,
  advanceIntro,
  allocateStat,
  createGame,
  DEATH_SCENE,
  dismissIntro,
  ENEMY_AI,
  skipIntro,
  enemyDef,
  JUMP,
  levelDef,
  resetBalanceTuning,
  setBalanceTuning,
  skipDeathScene,
  weaponDef,
  weaponCooldownFor,
  weaponRangeFor,
  PLAYER,
  RUN,
  step,
} from "@game/core";
import {
  clearStage,
  DT,
  equipRangedSidearm,
  idle,
  jumpOnce,
  makeEnemy,
  revealAll,
  run,
  SEED,
  settleBossRite,
  startGame,
  steerTo,
  stopWaves,
} from "./helpers.ts";
import { FIX_ENEMIES } from "./fixtures.ts";

const MOON = levelDef("test_level");
import { distance as dist } from "@game/lib/vec.ts";
const isBoss = (defId: string) => enemyDef(defId).role === "boss";

// A few tests below park a single mob against a STATIONARY hero. KNOCKBACK
// (config `KNOCKBACK`) is now a rare weapon signature the default fixture
// weapon doesn't carry, so it wouldn't shove anyway — but they zero the
// BALANCE › KNOCKBACK knob as belt-and-suspenders so no future knockback
// weapon in the rig could hold the parked mob at bay. Always restore the
// neutral tuning afterward so the knob can't leak.
afterEach(() => resetBalanceTuning());
const isMinion = (defId: string) => enemyDef(defId).role === "minion";

describe("createGame", () => {
  it("opens on the intro monologue and only plays after dismissal", () => {
    const state = createGame(SEED, "test_level");
    expect(state.phase).toBe("intro");
    expect(state.introPage).toBe(0);
    expect(MOON.intro?.length ?? 0).toBeGreaterThan(0);

    step(state, steerTo(0, 0), DT);
    expect(state.stats.timeMs).toBe(0); // frozen during the intro

    dismissIntro(state);
    expect(state.phase).toBe("playing");
    step(state, idle, DT);
    expect(state.stats.timeMs).toBe(DT);
  });

  it("pages the intro monologue, then flashes the title before the drop", () => {
    const state = createGame(SEED, "test_level");
    const pages = MOON.intro?.length ?? 0;
    // Turning past every page lands on the title card, not straight into play.
    for (let i = 0; i < pages - 1; i++) {
      advanceIntro(state);
      expect(state.phase).toBe("intro");
      expect(state.introPage).toBe(i + 1);
    }
    advanceIntro(state); // past the last page
    expect(state.phase).toBe("title");

    step(state, idle, DT);
    expect(state.stats.timeMs).toBe(0); // the title card still freezes the world

    dismissIntro(state); // the card's drop into play
    expect(state.phase).toBe("playing");
  });

  it("skipIntro jumps the whole monologue straight to the title card", () => {
    const state = createGame(SEED, "test_level");
    skipIntro(state);
    expect(state.phase).toBe("title");
    // …and is a no-op once the run is underway.
    dismissIntro(state);
    skipIntro(state);
    expect(state.phase).toBe("playing");
  });

  it("builds the moonscape: ghosts, boss at the flag, lander-side spawn", () => {
    const state = createGame(SEED, "test_level");
    const minions = state.enemies.filter((e) => isMinion(e.defId));
    const bosses = state.enemies.filter((e) => isBoss(e.defId));
    const expectedMinions = (MOON.spawns ?? [])
      .filter((s) => "band" in s)
      .reduce((sum, s) => sum + ("count" in s ? s.count : 0), 0);
    expect(minions).toHaveLength(expectedMinions);
    expect(bosses).toHaveLength(1);

    const flag = state.landmarks.find((l) => l.kind === "flag")!;
    expect(bosses[0]!.pos).toEqual(flag.pos);
    expect(state.landmarks.some((l) => l.kind === "lander")).toBe(true);
    expect(dist(state.players[0].pos, state.playerSpawn)).toBe(0);
    expect(state.decor.length).toBeGreaterThan(0);
    expect(state.players[0].equipment.weapon.defId).toBe("crude_sword");
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
    const target = {
      x: state.players[0].pos.x + 60,
      y: state.players[0].pos.y,
    };
    step(state, steerTo(target.x, target.y), DT);
    expect(state.players[0].moving).toBe(true);
    expect(state.players[0].facing.x).toBeCloseTo(1);

    run(state, steerTo(target.x, target.y), 200);
    expect(Math.abs(state.players[0].pos.x - target.x)).toBeLessThanOrEqual(
      PLAYER.arriveRadius,
    );
  });

  it("only flips the sprite on decisively horizontal movement", () => {
    const state = startGame();
    clearStage(state);
    const { x, y } = state.players[0].pos;

    step(state, steerTo(x - 200, y), DT);
    expect(state.players[0].faceLeft).toBe(true);

    // Near-vertical steering (even leaning slightly right) keeps the flip:
    // this is what used to flicker when diagonals hovered around vertical.
    step(
      state,
      steerTo(state.players[0].pos.x + 2, state.players[0].pos.y + 300),
      DT,
    );
    expect(state.players[0].faceLeft).toBe(true);

    step(
      state,
      steerTo(state.players[0].pos.x + 200, state.players[0].pos.y),
      DT,
    );
    expect(state.players[0].faceLeft).toBe(false);
  });

  it("turns the hero onto what he is FIGHTING, not onto his legs", () => {
    const state = startGame();
    clearStage(state);
    equipRangedSidearm(state);
    const hero = state.players[0];
    const { x, y } = hero.pos;
    // One foe BEHIND him, well inside the sidearm's reach.
    state.enemies.push(makeEnemy({ pos: { x: x - 60, y } }));

    // He runs RIGHT and shoots LEFT — mirrored onto the fight, so the weapon
    // (and its muzzle flash) stays on the side the shots actually leave. His
    // legs still carry him the other way: that is the "running backward" read.
    run(state, steerTo(x + 400, y), 4);
    expect(hero.faceLeft).toBe(true);
    expect(hero.facing.x).toBeGreaterThan(0);
    expect(hero.pos.x).toBeGreaterThan(x);
  });

  it("holds the fighting facing between blows, then hands him back to his legs", () => {
    const state = startGame();
    clearStage(state);
    equipRangedSidearm(state);
    const hero = state.players[0];
    const { x, y } = hero.pos;
    const foe = makeEnemy({ pos: { x: x - 60, y } });
    state.enemies.push(foe);

    run(state, steerTo(x + 400, y), 4);
    expect(hero.faceLeft).toBe(true);
    // Mid-cooldown — between two shots — he stays turned on the fight rather
    // than flicking back to his legs the moment the round leaves the barrel.
    expect(hero.weaponCooldownMs).toBeGreaterThan(0);
    run(state, steerTo(hero.pos.x + 400, y), 4);
    expect(hero.faceLeft).toBe(true);

    // Fight over: the last cooldown drains and his legs have him again.
    state.enemies = state.enemies.filter((e) => e !== foe);
    run(
      state,
      steerTo(hero.pos.x + 400, y),
      Math.ceil(weaponCooldownFor(state, hero, hero.equipment.weapon) / DT) + 4,
    );
    expect(hero.faceLeft).toBe(false);
  });

  it("turns the hero with a held AIM even when no shot is fired", () => {
    const state = startGame();
    clearStage(state); // nothing in reach: the sidearm never pulls
    const hero = state.players[0];
    const { x, y } = hero.pos;
    // Desktop AIM & SHOOT: the cursor is a bearing on every tick, trigger or no
    // trigger, so the hero turns with it the instant it crosses him.
    const aimLeftRunRight = {
      ...steerTo(x + 400, y),
      aim: { x: x - 200, y },
      fire: false,
    };
    run(state, aimLeftRunRight, 4);
    expect(hero.weaponCooldownMs).toBe(0);
    expect(hero.faceLeft).toBe(true);
    expect(hero.pos.x).toBeGreaterThan(x);
  });

  it("does not move while the pointer is released", () => {
    const state = startGame();
    const before = { ...state.players[0].pos };
    step(state, idle, DT);
    expect(state.players[0].pos).toEqual(before);
    expect(state.players[0].moving).toBe(false);
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
    expect(state.players[0].pos.x).toBe(PLAYER.radius);
    expect(state.players[0].pos.y).toBe(PLAYER.radius);
  });
});

describe("jumping", () => {
  it("launches on the jump edge and floats a moon-high arc", () => {
    const state = startGame();
    clearStage(state);
    step(state, jumpOnce, DT);
    expect(state.players[0].z).toBeGreaterThan(0);
    expect(state.events).toContainEqual(
      expect.objectContaining({ type: "jump" }),
    );

    // Ride the arc to its apex: roughly v²/2g with the LEVEL's gravity —
    // the moon's low g makes it far higher than an earth hop would be.
    let apex = 0;
    run(state, idle, 400, (s) => {
      apex = Math.max(apex, s.players[0].z);
      return s.players[0].z === 0 && s.stats.timeMs > DT * 4;
    });
    const expected = JUMP.velocity ** 2 / (2 * state.level.gravity);
    expect(apex).toBeGreaterThan(expected * 0.85);
    expect(apex).toBeGreaterThan(50); // reads as a big, floaty moon jump
  });

  it("cannot double-jump mid-air", () => {
    const state = startGame();
    clearStage(state);
    step(state, jumpOnce, DT);
    const rising = state.players[0].vz;
    step(state, jumpOnce, DT);
    expect(state.players[0].vz).toBeLessThan(rising); // gravity, not a re-launch
  });

  it("sails over ghosts: no contact damage while airborne", () => {
    const state = startGame();
    clearStage(state);
    // Get airborne above the dodge height, then drop a ghost on the player.
    step(state, jumpOnce, DT);
    run(state, idle, 100, (s) => s.players[0].z > JUMP.dodgeHeight + 10);
    expect(state.players[0].z).toBeGreaterThan(JUMP.dodgeHeight);
    // Unkillable so the auto-attack can't clear it before the landing.
    const ghost = makeEnemy({
      pos: { ...state.players[0].pos },
      hp: 1_000_000,
      maxHp: 1_000_000,
    });
    state.enemies.push(ghost);
    step(state, idle, DT);
    expect(state.stats.damageTaken).toBe(0);

    // Back on the ground the same ghost connects.
    run(state, idle, 200, (s) => s.players[0].z === 0);
    ghost.pos = { ...state.players[0].pos };
    ghost.contactCooldownMs = 0;
    step(state, idle, DT);
    expect(state.stats.damageTaken).toBeGreaterThan(0);
  });
});

describe("weapon", () => {
  it("auto-fires only when a monster is in range", () => {
    const state = equipRangedSidearm(startGame());
    // The blaster outranges the reveal disc, so this is about RANGE only once
    // the floor is uncovered — fog is its own suite's subject (`revealAll`).
    revealAll(state);
    const range = weaponDef("blaster").range;
    state.enemies = [
      makeEnemy({
        pos: {
          x: state.players[0].pos.x + range + 100,
          y: state.players[0].pos.y,
        },
      }),
    ];
    step(state, idle, DT);
    expect(state.projectiles).toHaveLength(0);

    state.enemies[0]!.pos.x = state.players[0].pos.x + range - 50;
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
    const state = startGame(); // default crude sword: melee, so keep it close
    setBalanceTuning({ knockback: 0 }); // don't shove the parked mob out of reach
    stopWaves(state);
    state.enemies = [
      makeEnemy({
        pos: { x: state.players[0].pos.x + 30, y: state.players[0].pos.y },
      }),
    ];
    state.items = [];
    run(state, idle, 2000, (s) => s.enemies.length === 0);
    expect(state.enemies).toHaveLength(0);
    expect(state.stats.kills).toBe(1);
    expect(state.stats.damageDealt).toBeGreaterThanOrEqual(45);
  });

  it("fires from the player's height mid-jump and the shot sinks back", () => {
    const state = equipRangedSidearm(startGame());
    clearStage(state);
    state.players[0].z = 40; // mid-jump
    state.enemies.push(
      makeEnemy({
        pos: { x: state.players[0].pos.x + 100, y: state.players[0].pos.y },
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
    const state = equipRangedSidearm(startGame());
    clearStage(state);
    const { x, y } = state.players[0].pos;
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
    state.players[0].equipment.weapon = {
      id: 777,
      defId: "test_wrench",
      slot: "weapon",
      tier: "regular",
      ilvl: 5,
      affixes: [],
    };
    state.enemies = [
      // Level-1 mob → ~no armor, so the swing lands its full catalog damage.
      makeEnemy({
        pos: { x: state.players[0].pos.x + 20, y: state.players[0].pos.y },
        mlvl: 1,
      }),
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
    state.players[0].equipment.weapon = {
      id: 777,
      defId,
      slot: "weapon",
      tier: "regular",
      ilvl: 5,
      affixes: [],
    };
  };

  it("a blade cleaves every monster in the cone in one swing (INT raises the cap)", () => {
    const state = startGame();
    state.obstacles = [];
    equip(state, "test_wrench"); // default 120° cone, reach 42
    state.rng = () => 0.99; // no miss, no crit — this is a geometry test
    // The swing's target cap starts at MELEE.baseAoeTargets (2); one point of
    // INT lifts it to 3 so the whole front rank is cleaved.
    state.players[0].stats.intelligence = 1;
    const { x, y } = state.players[0].pos;
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
    state.rng = () => 0.99; // no miss, no crit — this is a geometry test
    // No INTELLIGENCE: the cap sits at MELEE.baseAoeTargets (2).
    const { x, y } = state.players[0].pos;
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
    const { x, y } = state.players[0].pos;
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
    state.rng = () => 0.99; // no miss, no crit — this is a geometry test
    const { x, y } = state.players[0].pos;
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
    state.players[0].equipment.weapon = {
      id: 777,
      defId: "test_wrench",
      slot: "weapon",
      tier: "regular",
      ilvl: 5,
      affixes: [],
    };
  };

  it("STRENGTH lengthens a melee weapon's reach, DEXTERITY quickens swings, INTELLIGENCE lengthens ranged reach", () => {
    const state = startGame();
    equipWrench(state);
    const base = weaponDef("test_wrench");
    const weapon = () => state.players[0].equipment.weapon;

    // No stats: the plain catalog numbers, cadence included.
    const baseCadence = base.cooldownMs;
    expect(weaponRangeFor(state, state.players[0], weapon())).toBeCloseTo(
      base.range,
    );
    expect(weaponCooldownFor(state, state.players[0], weapon())).toBeCloseTo(
      baseCadence,
    );

    // INTELLIGENCE does NOT lengthen a MELEE blade's reach (that is STRENGTH's;
    // INT owns the cone's WIDTH and target count instead) — nor is it a speed stat.
    state.players[0].stats.intelligence = 20;
    expect(weaponRangeFor(state, state.players[0], weapon())).toBeCloseTo(
      base.range,
    );
    expect(weaponCooldownFor(state, state.players[0], weapon())).toBeCloseTo(
      baseCadence,
    );

    // STRENGTH lengthens the melee reach; DEXTERITY quickens the swing.
    state.players[0].stats.strength = 20;
    expect(weaponRangeFor(state, state.players[0], weapon())).toBeGreaterThan(
      base.range,
    );
    expect(weaponCooldownFor(state, state.players[0], weapon())).toBeCloseTo(
      baseCadence,
    ); // STR is not a speed stat
    state.players[0].stats.dexterity = 20;
    expect(weaponCooldownFor(state, state.players[0], weapon())).toBeLessThan(
      base.cooldownMs,
    );

    // A RANGED weapon's reach grows with INT (not STR) and its cadence with DEX.
    const ranged = {
      id: 778,
      defId: "blaster",
      slot: "weapon" as const,
      tier: "regular" as const,
      ilvl: 1,
      affixes: [],
    };
    expect(weaponRangeFor(state, state.players[0], ranged)).toBeGreaterThan(
      weaponDef("blaster").range,
    );
    expect(weaponCooldownFor(state, state.players[0], ranged)).toBeLessThan(
      weaponDef("blaster").cooldownMs,
    );
  });

  it("lets a high-STR character strike a monster its base melee reach can't touch", () => {
    const base = weaponDef("test_wrench");
    // A target sat just outside the plain reach but inside the STR-widened one.
    const gap = base.range + 8;

    const weak = startGame();
    equipWrench(weak);
    weak.players[0].stats.strength = 0;
    stopWaves(weak);
    weak.enemies = [
      makeEnemy({
        pos: { x: weak.players[0].pos.x + gap, y: weak.players[0].pos.y },
      }),
    ];
    step(weak, idle, DT);
    expect(weak.events.some((e) => e.type === "swing")).toBe(false);

    const reachy = startGame();
    equipWrench(reachy);
    reachy.players[0].stats.strength = 20;
    stopWaves(reachy);
    reachy.enemies = [
      makeEnemy({
        pos: { x: reachy.players[0].pos.x + gap, y: reachy.players[0].pos.y },
      }),
    ];
    step(reachy, idle, DT);
    expect(reachy.events.some((e) => e.type === "swing")).toBe(true);
  });

  it("INTELLIGENCE's wider AoE cone cleaves a foe off the flank", () => {
    // A larger area catches more enemies: a foe 70° off the aim sits outside
    // the wrench's base 120° cone (60° half-angle) but inside an INT-widened
    // one. INT widens the cone GENTLY now, saturating at a half circle (90°
    // half-angle), so it takes a heavy INT investment to reach out this far.
    const flankStruck = (intelligence: number) => {
      const state = startGame();
      equipWrench(state); // 120° cone (60° half-angle), reach 42
      state.rng = () => 0.99; // no miss, no crit — this is a geometry test
      state.players[0].stats.intelligence = intelligence;
      stopWaves(state);
      const { x, y } = state.players[0].pos;
      // The nearer foe dead ahead fixes the aim along +x; the flank foe is 70°
      // off it (just past the base half-angle), well within reach.
      const flank = makeEnemy({
        pos: {
          x: x + 30 * Math.cos((70 * Math.PI) / 180),
          y: y + 30 * Math.sin((70 * Math.PI) / 180),
        },
        hp: 500,
        maxHp: 500,
      });
      state.enemies = [
        makeEnemy({ pos: { x: x + 20, y }, hp: 500, maxHp: 500 }),
        flank,
      ];
      step(state, idle, DT);
      return flank.hp < flank.maxHp;
    };
    expect(flankStruck(0)).toBe(false); // the base cone misses the flank
    expect(flankStruck(60)).toBe(true); // a big INT cone cleaves it
  });
});

describe("enemy AI", () => {
  it("chases inside the aggro radius and drifts home outside it", () => {
    const state = startGame();
    const aggro = enemyDef("test_minion").ai.aggroRadius;
    const near = makeEnemy({
      id: 1,
      pos: { x: state.players[0].pos.x + 100, y: state.players[0].pos.y },
      speed: 60,
    });
    const far = makeEnemy({
      id: 2,
      pos: {
        x: state.players[0].pos.x + aggro + 200,
        y: state.players[0].pos.y,
      },
      speed: 60,
    });
    far.home = { x: far.pos.x + 50, y: far.pos.y };
    state.enemies = [near, far];

    step(state, idle, DT);
    expect(near.pos.x).toBeLessThan(state.players[0].pos.x + 100); // closing in
    expect(far.pos.x).toBeGreaterThan(state.players[0].pos.x + aggro + 200); // heading home
  });

  it("deals contact damage with a cooldown", () => {
    const state = startGame();
    setBalanceTuning({ knockback: 0 }); // let the mob reach contact, not get shoved off
    stopWaves(state);
    state.enemies = [
      makeEnemy({
        pos: { x: state.players[0].pos.x + 40, y: state.players[0].pos.y },
        hp: 1_000_000,
        maxHp: 1_000_000,
        mlvl: 99,
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

    state.players[0].pos = {
      x: flag.pos.x - enemyDef("test_boss").ai.aggroRadius + 40,
      y: flag.pos.y,
    };
    const before = dist(boss.pos, state.players[0].pos);
    run(state, idle, 10);
    expect(dist(boss.pos, state.players[0].pos)).toBeLessThan(before); // awake
  });
});

describe("items", () => {
  it("banks a medkit into the consumable dock on pickup (heals on use)", () => {
    const state = startGame();
    clearStage(state);
    state.players[0].hp = state.players[0].maxHp - 10;
    state.items = [
      { id: 999, kind: "medkit", tier: 0, pos: { ...state.players[0].pos } },
    ];
    step(state, idle, DT);
    // Picked up but not spent: the hp is untouched, the kit is stacked.
    expect(state.players[0].hp).toBe(state.players[0].maxHp - 10);
    expect(state.players[0].medkits[0]).toBe(1);
    expect(state.items).toHaveLength(0);
    expect(state.stats.itemsCollected).toBe(1);
    // Spending it on the input edge tops the hero up, capped at max hp.
    step(state, { ...idle, useMedkit: true }, DT);
    expect(state.players[0].hp).toBe(state.players[0].maxHp);
    expect(state.players[0].medkits[0]).toBe(0);
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
    // Within the default crude sword's melee reach so a swing finishes him.
    boss.pos = { x: state.players[0].pos.x + 30, y: state.players[0].pos.y };
    boss.speed = 0;

    run(state, idle, 500, (s) => s.enemies.length === 0);
    expect(state.enemies).toHaveLength(0);
    // The boss's DEATH RITE plays before anything resolves (boss-death.ts) —
    // the countdown deliberately does NOT arm underneath it, or the loot-grab
    // window would be running out while the finisher was still on screen.
    expect(state.phase).toBe("bossDeath");
    expect(state.victoryCountdownMs).toBeNull();
    settleBossRite(state);
    expect(state.phase).not.toBe("victory"); // grace period first

    // The boss gasps his last words as he falls: tap through the death scene,
    // then spend the level-ups the kill banked, so time can resume.
    while (state.phase === "dialogue") advanceDialogue(state);
    while (state.players[0].pendingStatPoints > 0)
      allocateStat(state, state.players[0], "stamina");
    expect(state.phase).toBe("playing");
    // …and only now, with the rite done and the box tapped through, does the
    // loot-grab countdown arm.
    run(state, idle, 2, (s) => s.victoryCountdownMs !== null);
    expect(state.victoryCountdownMs).toBeGreaterThan(RUN.victoryDelayMs - 100);
    run(
      state,
      idle,
      Math.ceil(RUN.victoryDelayMs / DT) + 10,
      (s) => s.phase === "victory",
    );
    expect(state.phase).toBe("victory");
    expect(state.events).toContainEqual({ type: "victory" });
  });

  it("falls into the death scene when the player's hp reaches zero", () => {
    const state = startGame();
    state.players[0].hp = 1;
    state.enemies = [makeEnemy({ pos: { ...state.players[0].pos } })];
    step(state, idle, DT);
    // The fatal blow drops the run into the DEATH SCENE (the `dying` tableau),
    // not straight to the modal: hp 0, phase `dying`, and a `playerDeath` event
    // for the app's death sting/haptic/camera-kick.
    expect(state.players[0].hp).toBe(0);
    expect(state.phase).toBe("dying");
    expect(state.events).toContainEqual({
      type: "playerDeath",
      pos: state.players[0].pos,
    });
    expect(state.deathScene).not.toBeNull();
  });

  it("raises the defeat splash when the death scene times out", () => {
    const state = startGame();
    state.players[0].hp = 1;
    state.enemies = [makeEnemy({ pos: { ...state.players[0].pos } })];
    step(state, idle, DT); // fall → `dying`
    // Play out the whole scene; the run drops to `defeat` with a `defeat` event.
    let defeated = false;
    for (let i = 0; i < 1000 && state.phase === "dying"; i++) {
      step(state, idle, DT);
      if (state.events.some((e) => e.type === "defeat")) defeated = true;
    }
    expect(state.phase).toBe("defeat");
    // A fresh level-1 hero has an empty bar, so the death toll takes nothing.
    expect(defeated).toBe(true);
    expect(state.events).toContainEqual({ type: "defeat", xpLost: 0 });
  });

  it("skips the death scene straight to defeat on a tap", () => {
    const state = startGame();
    state.players[0].hp = 1;
    state.enemies = [makeEnemy({ pos: { ...state.players[0].pos } })];
    step(state, idle, DT); // fall → `dying`
    expect(state.phase).toBe("dying");
    // Past the opening grace window, a tap is a deliberate "get on with it".
    while (state.deathScene && state.deathScene.ms < DEATH_SCENE.skipGraceMs) {
      step(state, idle, DT);
    }
    expect(skipDeathScene(state)).toBe(true);
    step(state, idle, DT); // the skip flips it to defeat on the next tick
    expect(state.phase).toBe("defeat");
    expect(state.events).toContainEqual({ type: "defeat", xpLost: 0 });
  });

  it("refuses to skip the death scene inside its grace window", () => {
    const state = startGame();
    state.players[0].hp = 1;
    state.enemies = [makeEnemy({ pos: { ...state.players[0].pos } })];
    step(state, idle, DT); // fall → `dying`
    // The input that was steering when the hero fell must not throw the modal
    // up on the tick of the fall — the death beat plays.
    expect(skipDeathScene(state)).toBe(false);
    expect(state.deathScene?.skip).toBe(false);
    step(state, idle, DT);
    expect(state.phase).toBe("dying");
    // The headless calibration sim skips it anyway (force), so a death costs
    // one tick there instead of the whole tableau.
    expect(skipDeathScene(state, { force: true })).toBe(true);
    step(state, idle, DT);
    expect(state.phase).toBe("defeat");
  });

  it("freezes the simulation after the game ends", () => {
    const state = startGame();
    state.players[0].hp = 1;
    state.enemies = [makeEnemy({ pos: { ...state.players[0].pos } })];
    step(state, idle, DT);
    const time = state.stats.timeMs;
    step(state, steerTo(0, 0), DT);
    expect(state.stats.timeMs).toBe(time);
    expect(state.events).toHaveLength(0);
  });
});
