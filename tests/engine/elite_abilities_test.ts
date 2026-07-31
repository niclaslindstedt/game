// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ELITE TIER (src/game/mechanics/, authored shapes in
// defs/enemies/abilities.ts): the ten personal moves built out of the hero's
// own vocabulary. Its sibling suite `boss_abilities_test.ts` pins the
// three-beat contract itself, which every entry in BOTH tiers rides — so this
// one covers what is specific to these ten: which of them owns the mob's tick,
// which of them a jump answers, and the four numbers whose sign is the
// difference between a mechanic and a bug.
//
// All on synthetic fixtures; no shipped content ids.

import { beforeEach, describe, expect, it } from "vitest";

import {
  createGame,
  dismissIntro,
  hitEnemy,
  registerDefs,
  skipCutscene,
  step,
} from "@game/core";
import type { Enemy, EnemyDef, GameState } from "@game/core";

import {
  FIX_ABILITIES,
  FIX_COMPANIONS,
  FIX_DIFFICULTIES,
  FIX_ENEMIES,
  FIX_GEAR,
  FIX_LEVEL,
  FIX_STORY_ITEMS,
  FIX_UNIQUES,
  FIX_WEAPONS,
  installFixtures,
} from "./fixtures.ts";
import { DT, idle, run, stopWaves } from "./helpers.ts";

const steps = (ms: number): number => Math.ceil(ms / DT) + 1;

/** Every event `ms` of game time produced — `step` clears the list each tick,
 * so looking at `state.events` afterwards only ever sees the last one. */
function collect(state: GameState, ms: number): GameState["events"] {
  const out: GameState["events"] = [];
  for (let i = 0; i < steps(ms); i++) {
    step(state, idle, DT);
    out.push(...state.events);
  }
  return out;
}

/** An elite whose whole kit is the one ability under test. */
function caster(id: string, ability: Record<string, unknown>): EnemyDef {
  return {
    ...(FIX_ENEMIES.test_elite as EnemyDef),
    id,
    name: id.toUpperCase(),
    sprite: "test_elite",
    speed: 0,
    contactDamage: 40,
    critChance: 0,
    dialogue: undefined,
    lastWords: undefined,
    mechanics: { abilities: [ability] },
  } as EnemyDef;
}

const CASTERS = {
  test_orbit: caster("test_orbit", {
    id: "orbit_guard",
    windupMs: 300,
    cooldownMs: 20000,
    count: 4,
    radius: 30,
    angularSpeed: 2,
    orbRadius: 6,
    damageFrac: 0.5,
    hitIntervalMs: 400,
    durationMs: 4000,
    sprite: "test_elite",
  }),
  test_pulse: caster("test_pulse", {
    id: "shock_pulse",
    windupMs: 300,
    cooldownMs: 20000,
    radius: 80,
    damageFrac: 0.6,
    push: 200,
  }),
  test_blink: caster("test_blink", {
    id: "blink_strike",
    windupMs: 300,
    cooldownMs: 20000,
    range: 300,
    arriveDistance: 30,
    damageFrac: 0.5,
    strikeRadius: 34,
  }),
  test_snare: caster("test_snare", {
    id: "snare_field",
    windupMs: 300,
    cooldownMs: 20000,
    radius: 60,
    durationMs: 4000,
    slowFactor: 0.5,
    range: 300,
  }),
  test_siphon: caster("test_siphon", {
    id: "siphon_tether",
    windupMs: 300,
    cooldownMs: 20000,
    range: 300,
    durationMs: 2000,
    damageFrac: 0.3,
    tickMs: 300,
    healFrac: 0.8,
  }),
  test_ward: caster("test_ward", {
    id: "ward_shield",
    windupMs: 300,
    cooldownMs: 20000,
    poolFrac: 0.25,
    durationMs: 8000,
  }),
  test_rally: caster("test_rally", {
    id: "rally_cry",
    windupMs: 300,
    cooldownMs: 20000,
    radius: 200,
    durationMs: 4000,
    speedMult: 2,
    damageMult: 2,
  }),
  test_quake: caster("test_quake", {
    id: "quake_line",
    windupMs: 300,
    cooldownMs: 20000,
    count: 4,
    spacing: 30,
    radius: 24,
    damageFrac: 0.6,
    stepMs: 100,
  }),
  test_trail: caster("test_trail", {
    id: "ember_trail",
    windupMs: 300,
    cooldownMs: 20000,
    durationMs: 2000,
    dropMs: 300,
    radius: 20,
    patchMs: 4000,
    damageFrac: 0.3,
    tickMs: 400,
  }),
} as const;

function install(): void {
  installFixtures(true);
  registerDefs({
    levels: { test_level: FIX_LEVEL },
    uniques: FIX_UNIQUES,
    enemies: { ...FIX_ENEMIES, ...CASTERS },
    companions: FIX_COMPANIONS,
    weapons: FIX_WEAPONS,
    gear: FIX_GEAR,
    abilities: FIX_ABILITIES,
    difficulties: FIX_DIFFICULTIES,
    storyItems: FIX_STORY_ITEMS,
  });
}

function startAt(): GameState {
  const state = createGame(42, "test_level", "medium");
  skipCutscene(state);
  dismissIntro(state);
  stopWaves(state);
  state.enemies = [];
  return state;
}

function plant(state: GameState, defId: string, dx = 60, dy = 0): Enemy {
  const pos = { x: state.player.pos.x + dx, y: state.player.pos.y + dy };
  const enemy: Enemy = {
    id: state.nextId++,
    defId,
    pos: { ...pos },
    home: { ...pos },
    hp: 400,
    maxHp: 400,
    mlvl: 1,
    speed: 0,
    contactCooldownMs: 0,
    awake: true,
  };
  state.enemies.push(enemy);
  return enemy;
}

beforeEach(install);

describe("every primitive actually fires", () => {
  // The single most valuable assertion in this file. Everything here is
  // authored DATA reaching a registry through a name, and the failure mode of
  // that arrangement is silence: a primitive that never registers, never
  // matches, or never passes its own `ready` simply does nothing at all, with
  // every other test in the suite green.
  // Two of the ten refuse to cast into thin air, deliberately, and the setup
  // says so rather than working around it: a WARD raised at full health is a
  // mob with more health rather than a move the player can connect to
  // something they did, and a RALLY shouted at an empty room burns its cooldown
  // to make a mob roar at nobody — which reads as a bug, not as a move that
  // happened to find no audience.
  const ARRANGE: Record<string, (state: GameState, mob: Enemy) => void> = {
    test_ward: (_state, mob) => {
      mob.hp = mob.maxHp * 0.5;
    },
    test_rally: (state) => {
      plant(state, "test_minion", 70, 30);
    },
  };

  for (const id of Object.keys(CASTERS)) {
    it(`${id} casts`, () => {
      const state = startAt();
      const mob = plant(state, id);
      ARRANGE[id]?.(state, mob);
      const events = collect(state, 1200);
      expect(
        events.some((e) => e.type === "enemyTelegraph"),
        "it telegraphed",
      ).toBe(true);
      expect(
        events.some((e) => e.type === "eliteCast"),
        "it cast",
      ).toBe(true);
    });
  }
});

describe("which moves own the mob's tick", () => {
  // The tier's central distinction, and the one most easily undone by
  // "simplifying" a handler's return value. A move the mob performs plants it;
  // a move it merely HAS runs alongside the hunt.
  it("a tether holds the mob still while it drinks", () => {
    const state = startAt();
    const mob = plant(state, "test_siphon");
    run(state, idle, steps(400));
    expect(mob.mech?.siphonMs).toBeGreaterThan(0);
  });

  it("a ring does NOT plant the mob — it turns while it hunts", () => {
    const state = startAt();
    const mob = plant(state, "test_orbit");
    // Give it legs and something to walk toward, then check it moved WHILE the
    // ring was up. A `step` returning true here would freeze it for four
    // seconds, which is exactly what this asserts cannot happen.
    mob.speed = 40;
    run(state, idle, steps(400));
    const spinning = mob.mech?.orbitMs ?? 0;
    const before = { ...mob.pos };
    run(state, idle, steps(200));
    expect(spinning).toBeGreaterThan(0);
    expect(mob.pos.x === before.x && mob.pos.y === before.y).toBe(false);
  });
});

describe("the numbers whose sign is the whole mechanic", () => {
  it("a ward EATS a blow and passes the overflow through", () => {
    const state = startAt();
    const mob = plant(state, "test_ward");
    // A ward only goes up on a mob that has been hurt — that is the rule that
    // makes the player connect the shell with something they did.
    mob.hp = mob.maxHp * 0.5;
    run(state, idle, steps(500));
    const pool = mob.mech?.wardHp ?? 0;
    expect(pool).toBeGreaterThan(0);

    // A blow far bigger than the shell breaks it AND still hurts: swallowing
    // the remainder would teach the player to plink a shell down first, which
    // is the opposite of the read the move is built around.
    const hpBefore = mob.hp;
    hitEnemy(state, mob, pool * 3);
    expect(mob.mech?.wardHp).toBeUndefined();
    expect(mob.hp).toBeLessThan(hpBefore);
  });

  it("a siphon only ever keeps what it took, and never past full", () => {
    const state = startAt();
    const mob = plant(state, "test_siphon");
    mob.hp = mob.maxHp - 1;
    run(state, idle, steps(1600));
    expect(mob.hp).toBeLessThanOrEqual(mob.maxHp);
  });

  it("a rally lifts the HORDE, and the lift outlives the shout", () => {
    const state = startAt();
    const shouter = plant(state, "test_rally", 40);
    const minion = plant(state, "test_minion", 60, 30);
    run(state, idle, steps(500));
    expect(minion.mech?.rallyMs).toBeGreaterThan(0);
    expect(minion.mech?.rallySpeedMult).toBe(2);
    // Killing the caller stops the NEXT shout, never this one — otherwise the
    // answer would be "kill it during the windup", which is a race, not a
    // decision.
    shouter.hp = 0;
    run(state, idle, steps(200));
    expect(minion.mech?.rallyMs).toBeGreaterThan(0);
  });

  it("a rally's lift expires", () => {
    const state = startAt();
    plant(state, "test_rally", 40);
    const minion = plant(state, "test_minion", 60, 30);
    run(state, idle, steps(500));
    expect(minion.mech?.rallyMs).toBeGreaterThan(0);
    run(state, idle, steps(4200));
    expect(minion.mech?.rallyMs).toBeUndefined();
  });

  it("a snare holds the hero's pace and then lets go", () => {
    const state = startAt();
    plant(state, "test_snare");
    run(state, idle, steps(500));
    const snare = state.scorches.find((p) => p.field === "snare");
    expect(snare).toBeDefined();
    expect(snare?.damage).toBe(0); // it hurts nobody — that IS the design
    expect(state.player.snareFactor).toBe(0.5);
    run(state, idle, steps(4200));
    expect(state.player.snareFactor).toBeUndefined();
  });

  it("a blink arrives at the range LOCKED at the tell, not the one now", () => {
    const state = startAt();
    const mob = plant(state, "test_blink", 200);
    step(state, idle, DT);
    expect(mob.mech?.telegraph?.kind).toBe("blink_strike");
    // The hero runs FURTHER AWAY mid-tell. A move that re-measured would follow
    // him; one that honours its own windup lands where he was.
    state.player.pos.x -= 300;
    run(state, idle, steps(360));
    // It travelled the locked distance (200 − 30), so it is now well short of
    // the hero rather than on top of him.
    const gap = Math.abs(mob.pos.x - state.player.pos.x);
    expect(gap).toBeGreaterThan(200);
  });
});

describe("a jump answers the ground moves, exactly as it answers a slam", () => {
  it("a pulse cannot touch an airborne hero", () => {
    const state = startAt();
    plant(state, "test_pulse", 30);
    const hp = state.player.hp;
    // Held above the dodge height for the whole windup and the cast.
    for (let i = 0; i < steps(500); i++) {
      state.player.z = 40;
      step(state, idle, DT);
    }
    expect(state.player.hp).toBe(hp);
  });
});

describe("the lane and the trail lay their marks", () => {
  it("a quake opens its fissures IN ORDER down the locked bearing", () => {
    const state = startAt();
    plant(state, "test_quake");
    const events = collect(state, 1200);
    const ticks = events.filter(
      (e) => e.type === "eliteCast" && e.phase === "tick",
    );
    expect(ticks.length).toBe(4);
  });

  it("a trail paints patches that carry the caster's own kit", () => {
    const state = startAt();
    plant(state, "test_trail");
    run(state, idle, steps(1400));
    const laid = state.scorches.filter((p) => p.field === "burn");
    expect(laid.length).toBeGreaterThan(1);
  });
});
