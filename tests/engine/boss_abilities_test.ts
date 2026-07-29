// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE BOSS ABILITY CATALOG (src/game/mechanics/, authored shapes in
// defs/enemies/abilities.ts): the three-beat contract every ability obeys, the
// per-rung difficulty gate, and the two abilities the catalog ships with — the
// sweeping beam that sets the floor alight, and the planted flag that gives a
// summon an answer. All on synthetic fixtures; no shipped content ids.

import { beforeEach, describe, expect, it } from "vitest";

import {
  createGame,
  dismissIntro,
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

/** Sim steps covering `ms` of game time — `run` counts STEPS, and every
 * window in this suite is authored in the ability's own milliseconds. */
const steps = (ms: number): number => Math.ceil(ms / DT) + 1;

/**
 * Run `ms` of game time and return EVERY event it produced. `step` clears
 * `state.events` at the top of each tick, so a plain `run` followed by a look
 * at `state.events` only ever sees the last 16ms — which silently passes any
 * assertion looking for something that did NOT happen.
 */
function collect(state: GameState, ms: number): GameState["events"] {
  const out: GameState["events"] = [];
  const n = steps(ms);
  for (let i = 0; i < n; i++) {
    step(state, idle, DT);
    out.push(...state.events);
  }
  return out;
}

const LASER = {
  windupMs: 400,
  cooldownMs: 9000,
  range: 200,
  sweepDeg: 90,
  sweepMs: 600,
  beamWidth: 10,
  damageFrac: 0.5,
  hitIntervalMs: 200,
  scorchMs: 4000,
  scorchDamageFrac: 0.2,
  scorchTickMs: 500,
  scorchRadius: 14,
} as const;

/** A boss whose whole kit is the beam. */
const BURNER = {
  ...(FIX_ENEMIES.test_boss as EnemyDef),
  id: "test_burner",
  name: "TEST BURNER",
  sprite: "test_boss",
  speed: 0,
  contactDamage: 40,
  critChance: 0,
  dialogue: undefined,
  lastWords: undefined,
  mechanics: { abilities: [{ id: "laser_eyes" as const, ...LASER }] },
};

/** The same boss, with the beam gated to NIGHTMARE and above. */
const GATED = {
  ...BURNER,
  id: "test_gated",
  name: "TEST GATED",
  mechanics: {
    abilities: [
      { id: "laser_eyes" as const, ...LASER, minDifficulty: "nightmare" },
    ],
  },
};

/** A boss that plants a flag, and the flag it plants. */
const PLANTER = {
  ...(FIX_ENEMIES.test_boss as EnemyDef),
  id: "test_planter",
  name: "TEST PLANTER",
  sprite: "test_boss",
  speed: 0,
  dialogue: undefined,
  lastWords: undefined,
  mechanics: {
    abilities: [
      {
        id: "flag_plant" as const,
        windupMs: 300,
        cooldownMs: 9000,
        defId: "test_flag",
        distance: 40,
        lifeMs: 20000,
      },
    ],
  },
};

const FLAG = {
  ...(FIX_ENEMIES.test_elite as EnemyDef),
  id: "test_flag",
  name: "TEST FLAG",
  sprite: "test_elite",
  structure: true,
  speed: 0,
  contactDamage: 0,
  hp: 100,
  xpMobMult: 0,
  dialogue: undefined,
  lastWords: undefined,
  mechanics: {
    summon: { defId: "test_minion", count: 1, cooldownMs: 1000, maxAlive: 3 },
  },
};

function install(): void {
  installFixtures(true);
  registerDefs({
    levels: { test_level: FIX_LEVEL },
    uniques: FIX_UNIQUES,
    enemies: {
      ...FIX_ENEMIES,
      test_burner: BURNER,
      test_gated: GATED,
      test_planter: PLANTER,
      test_flag: FLAG,
    },
    companions: FIX_COMPANIONS,
    weapons: FIX_WEAPONS,
    gear: FIX_GEAR,
    abilities: FIX_ABILITIES,
    difficulties: FIX_DIFFICULTIES,
    storyItems: FIX_STORY_ITEMS,
  });
}

function startAt(
  difficulty: "easy" | "medium" | "hard" | "nightmare" | "jesus" = "medium",
): GameState {
  const state = createGame(42, "test_level", difficulty);
  skipCutscene(state);
  dismissIntro(state);
  stopWaves(state);
  state.enemies = [];
  return state;
}

function plant(state: GameState, defId: string, dx = 90, dy = 0): Enemy {
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

describe("the three-beat contract", () => {
  it("telegraphs before it casts — the windup is owned by the engine", () => {
    const state = startAt();
    const boss = plant(state, "test_burner");
    step(state, idle, DT);
    // Beat 1: rooted in a windup, and the app was told about it.
    expect(boss.mech?.telegraph?.kind).toBe("laser_eyes");
    expect(
      state.events.some(
        (e) => e.type === "enemyTelegraph" && e.kind === "laser_eyes",
      ),
    ).toBe(true);
    // Nothing has been cast yet — the tell strictly precedes the move.
    expect(boss.mech?.beam).toBeUndefined();
  });

  it("locks the bearing at the START of the windup, so walking beats it", () => {
    const state = startAt();
    const boss = plant(state, "test_burner", 0, -120);
    step(state, idle, DT);
    const locked = {
      ...(boss.mech?.telegraph?.dir as { x: number; y: number }),
    };
    // The hero moves off while the eyes are still lighting — far enough to
    // swing the bearing well off true, but not so far the boss loses him and
    // stands down (an unaggroed boss stops running its mechanics entirely).
    state.player.pos.x += 140;
    run(state, idle, steps(LASER.windupMs + 40));
    const beam = boss.mech?.beam;
    expect(beam).toBeDefined();
    // The sweep is centred on where he WAS, not on where he went.
    expect(beam?.angle).toBeCloseTo(Math.atan2(locked.y, locked.x), 5);
  });

  it("starts the cooldown from the cast, and will not re-cast inside it", () => {
    const state = startAt();
    const boss = plant(state, "test_burner");
    run(state, idle, steps(LASER.windupMs + LASER.sweepMs + 200));
    expect(boss.mech?.beam).toBeUndefined(); // the sweep finished
    expect(boss.mech?.abilityCooldownMs?.laser_eyes).toBeGreaterThan(0);
    run(state, idle, steps(1000));
    expect(boss.mech?.telegraph).toBeUndefined(); // still on cooldown
  });

  it("barks once and only once, and never freezes the run to do it", () => {
    const state = startAt();
    const barker = {
      ...BURNER,
      id: "test_barker",
      mechanics: {
        abilities: [
          { id: "laser_eyes" as const, ...LASER, bark: ["STAND STILL"] },
        ],
      },
    };
    registerDefs({ enemies: { ...FIX_ENEMIES, test_barker: barker } });
    const state2 = startAt();
    void state;
    plant(state2, "test_barker");
    const first = collect(state2, LASER.windupMs + 60);
    expect(first.filter((e) => e.type === "bossBark")).toHaveLength(1);
    // The whole point of a bark rather than dialogue: play does not stop.
    expect(state2.phase).toBe("playing");
    expect(state2.dialogue).toBeNull();
    // A second cast, much later, says nothing.
    const again = collect(state2, LASER.cooldownMs + LASER.windupMs + 400);
    expect(again.filter((e) => e.type === "bossBark")).toHaveLength(0);
  });
});

describe("the difficulty gate", () => {
  it("withholds a gated ability below its rung", () => {
    const state = startAt("hard");
    const boss = plant(state, "test_gated");
    run(state, idle, steps(2000));
    expect(boss.mech?.telegraph).toBeUndefined();
    expect(boss.mech?.beam).toBeUndefined();
  });

  it("grants it at the rung and above", () => {
    for (const rung of ["nightmare", "jesus"] as const) {
      const state = startAt(rung);
      const boss = plant(state, "test_gated");
      run(state, idle, steps(LASER.windupMs + 200));
      expect(boss.mech?.beam, rung).toBeDefined();
    }
  });

  it("squeezes the windup toward its floor as the ladder climbs, never below", () => {
    const floored = {
      ...BURNER,
      id: "test_floored",
      mechanics: {
        abilities: [
          { id: "laser_eyes" as const, ...LASER, windupFloorMs: 250 },
        ],
      },
    };
    registerDefs({ enemies: { ...FIX_ENEMIES, test_floored: floored } });
    const easy = startAt("easy");
    const easyBoss = plant(easy, "test_floored");
    step(easy, idle, DT);
    const jesus = startAt("jesus");
    const jesusBoss = plant(jesus, "test_floored");
    step(jesus, idle, DT);
    const easyMs = easyBoss.mech?.telegraph?.remainingMs ?? 0;
    const jesusMs = jesusBoss.mech?.telegraph?.remainingMs ?? 0;
    expect(jesusMs).toBeLessThan(easyMs);
    // A tell shorter than a reaction is not a tell.
    expect(jesusMs).toBeGreaterThanOrEqual(250 - DT * 1000 - 1);
  });
});

describe("laser eyes", () => {
  it("sweeps one way, edge to edge, and burns the hero standing in it", () => {
    const state = startAt();
    const boss = plant(state, "test_burner", 90, 0);
    const before = state.player.hp;
    run(state, idle, steps(LASER.windupMs + 60));
    const beam = boss.mech?.beam;
    expect(beam).toBeDefined();
    const first = beamBearing(beam!);
    run(state, idle, steps(240));
    const later = beamBearing(boss.mech!.beam!);
    expect(later).toBeGreaterThan(first); // travels one way
    run(state, idle, steps(LASER.sweepMs));
    expect(state.player.hp).toBeLessThan(before);
  });

  it("leaves the floor burning, and the burn bites, then burns out", () => {
    const state = startAt();
    plant(state, "test_burner", 90, 0);
    run(state, idle, steps(LASER.windupMs + LASER.sweepMs + 100));
    expect(state.scorches.length).toBeGreaterThan(0);
    // Standing in it costs hp on the patch's own cadence.
    state.enemies = [];
    const patch = state.scorches[0]!;
    state.player.pos = { ...patch.pos };
    state.player.hp = state.player.maxHp;
    run(state, idle, steps(LASER.scorchTickMs * 3));
    expect(state.player.hp).toBeLessThan(state.player.maxHp);
    // And it is temporary: a boss may carve the floor, never delete it.
    run(state, idle, steps(LASER.scorchMs + 500));
    expect(state.scorches).toHaveLength(0);
  });

  it("bites ONCE per cadence however many patches overlap", () => {
    const state = startAt();
    state.enemies = [];
    // Six patches stacked on the hero — the shape a swept band actually makes.
    for (let i = 0; i < 6; i++) {
      state.scorches.push({
        pos: { ...state.player.pos },
        radius: 14,
        remainingMs: 4000,
        durationMs: 4000,
        tickMs: 0,
        intervalMs: 500,
        damage: 10,
        defId: "test_burner",
        seed: i,
      });
    }
    state.player.hp = state.player.maxHp;
    // One cadence's worth of time: one bite, not six.
    const hits = collect(state, 100).filter(
      (e) => e.type === "playerHurt" && e.cause?.startsWith("hazard:scorch"),
    );
    expect(hits).toHaveLength(1);
  });

  it("a jump clears burning floor, exactly like it clears a slam", () => {
    const state = startAt();
    state.enemies = [];
    state.scorches.push({
      pos: { ...state.player.pos },
      radius: 14,
      remainingMs: 4000,
      durationMs: 4000,
      tickMs: 0,
      intervalMs: 500,
      damage: 20,
      defId: "test_burner",
      seed: 1,
    });
    state.player.z = 40;
    state.player.hp = state.player.maxHp;
    run(state, idle, steps(200));
    expect(state.player.hp).toBe(state.player.maxHp);
  });
});

describe("flag plant", () => {
  it("plants a killable body that calls the adds in the boss's place", () => {
    const state = startAt();
    const boss = plant(state, "test_planter", 90, 0);
    const events = collect(state, 400);
    const flag = state.enemies.find((e) => e.defId === "test_flag");
    expect(flag).toBeDefined();
    expect(boss.mech?.flagId).toBe(flag?.id);
    expect(events.some((e) => e.type === "bossFlagPlanted")).toBe(true);
    // The adds come out of the FLAG, which is the whole point.
    run(state, idle, steps(1500));
    expect(
      state.enemies.filter((e) => e.defId === "test_minion").length,
    ).toBeGreaterThan(0);
  });

  it("will not plant a second while the first still stands", () => {
    const state = startAt();
    plant(state, "test_planter", 90, 0);
    run(state, idle, steps(400));
    const planted = () =>
      state.enemies.filter((e) => e.defId === "test_flag").length;
    expect(planted()).toBe(1);
    run(state, idle, steps(12000));
    expect(planted()).toBe(1);
  });

  it("breaking the flag lets the boss plant again — the tap has an answer", () => {
    const state = startAt();
    const boss = plant(state, "test_planter", 90, 0);
    run(state, idle, steps(400));
    const flag = state.enemies.find((e) => e.defId === "test_flag");
    expect(flag).toBeDefined();
    // Break it. The boss is free to plant another, but only after its cooldown
    // — so the answer buys real time rather than nothing.
    state.enemies = state.enemies.filter((e) => e.id !== flag?.id);
    boss.mech!.abilityCooldownMs = { flag_plant: 0 };
    run(state, idle, steps(400));
    expect(state.enemies.some((e) => e.defId === "test_flag")).toBe(true);
  });
});

/** The bearing a beam is pointing along right now. */
function beamBearing(beam: NonNullable<Enemy["mech"]>["beam"]): number {
  if (!beam) return 0;
  const t = 1 - beam.remainingMs / beam.durationMs;
  return beam.angle - beam.sweep / 2 + beam.sweep * t;
}
