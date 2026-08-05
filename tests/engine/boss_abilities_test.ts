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
  lineOfSight,
  registerDefs,
  seatHero,
  skipCutscene,
  step,
} from "@game/core";
import type { Enemy, EnemyDef, GameState, Player } from "@game/core";

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
  const pos = {
    x: state.players[0].pos.x + dx,
    y: state.players[0].pos.y + dy,
  };
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
    state.players[0].pos.x += 140;
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
    const before = state.players[0].hp;
    run(state, idle, steps(LASER.windupMs + 60));
    const beam = boss.mech?.beam;
    expect(beam).toBeDefined();
    const first = beamBearing(beam!);
    run(state, idle, steps(240));
    const later = beamBearing(boss.mech!.beam!);
    expect(later).toBeGreaterThan(first); // travels one way
    run(state, idle, steps(LASER.sweepMs));
    expect(state.players[0].hp).toBeLessThan(before);
  });

  it("leaves the floor burning, and the burn bites, then burns out", () => {
    const state = startAt();
    plant(state, "test_burner", 90, 0);
    run(state, idle, steps(LASER.windupMs + LASER.sweepMs + 100));
    expect(state.scorches.length).toBeGreaterThan(0);
    // Standing in it costs hp on the patch's own cadence.
    state.enemies = [];
    const patch = state.scorches[0]!;
    state.players[0].pos = { ...patch.pos };
    state.players[0].hp = state.players[0].maxHp;
    run(state, idle, steps(LASER.scorchTickMs * 3));
    expect(state.players[0].hp).toBeLessThan(state.players[0].maxHp);
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
        pos: { ...state.players[0].pos },
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
    state.players[0].hp = state.players[0].maxHp;
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
      pos: { ...state.players[0].pos },
      radius: 14,
      remainingMs: 4000,
      durationMs: 4000,
      tickMs: 0,
      intervalMs: 500,
      damage: 20,
      defId: "test_burner",
      seed: 1,
    });
    state.players[0].z = 40;
    state.players[0].hp = state.players[0].maxHp;
    run(state, idle, steps(200));
    expect(state.players[0].hp).toBe(state.players[0].maxHp);
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

// ─── The catalog's second wave ────────────────────────────────────────────────
// Four more abilities, and between them they exercise the three ways an ability
// is allowed to reach the world: its own projectiles (the coin cannon), its own
// state list (the bait), and — twice — an EXISTING hazard system pointed at a
// boss's intent rather than a level's timer (the pods, the herd).

const CANNON = {
  id: "coin_cannon" as const,
  windupMs: 400,
  cooldownMs: 8000,
  count: 5,
  spreadDeg: 60,
  range: 220,
  speed: 150,
  lifetimeMs: 3000,
  damageFrac: 0.35,
  bounces: 2,
};

const BAIT = {
  id: "bait_drop" as const,
  windupMs: 300,
  cooldownMs: 9000,
  count: 4,
  spread: 90,
  armMs: 800,
  lifeMs: 6000,
  triggerRadius: 20,
  blastRadius: 50,
  damageFrac: 0.8,
};

const STRIKE = {
  id: "airstrike" as const,
  windupMs: 400,
  cooldownMs: 9000,
  count: 3,
  spread: 100,
  fallMs: 900,
  blastRadius: 55,
  damageFrac: 0.7,
  hatch: "test_minion",
  hatchCount: 2,
};

const HORDE = {
  id: "call_horde" as const,
  windupMs: 300,
  cooldownMs: 9000,
  waves: 2,
  waveGapMs: 3000,
};

function kitted(id: string, ability: unknown) {
  return {
    ...(FIX_ENEMIES.test_boss as EnemyDef),
    id,
    name: id.toUpperCase(),
    sprite: "test_boss",
    speed: 0,
    contactDamage: 40,
    critChance: 0,
    dialogue: undefined,
    lastWords: undefined,
    mechanics: { abilities: [ability] },
  } as EnemyDef;
}

function startKitted(defId: string, ability: unknown): GameState {
  registerDefs({
    enemies: { ...FIX_ENEMIES, [defId]: kitted(defId, ability) },
  });
  return startAt();
}

describe("coin cannon", () => {
  it("throws the whole fan at once, spread across the locked bearing", () => {
    const state = startKitted("test_cannon", CANNON);
    const boss = plant(state, "test_cannon", 120, 0);
    run(state, idle, steps(CANNON.windupMs + 60));
    const coins = state.projectiles.filter((p) => p.hostile);
    expect(coins).toHaveLength(CANNON.count);
    // A FAN, not a stream: every coin left on the same tick, and they point in
    // measurably different directions. Measured as an offset from the fan's own
    // centre and unwrapped — a fan aimed along -X straddles the ±pi seam, so
    // raw sorted angles would report a 5.8 radian "spread" that is really 1.05.
    const centre = Math.atan2(
      state.players[0].pos.y - boss.pos.y,
      state.players[0].pos.x - boss.pos.x,
    );
    const offsets = coins
      .map((c) => {
        let d = Math.atan2(c.dir.y, c.dir.x) - centre;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        return d;
      })
      .sort((a, b) => a - b);
    const span = (offsets.at(-1) ?? 0) - (offsets[0] ?? 0);
    expect(span).toBeCloseTo((CANNON.spreadDeg * Math.PI) / 180, 2);
    expect(boss.mech?.abilityCooldownMs?.coin_cannon).toBeGreaterThan(0);
  });

  it("comes off a wall instead of dying on it, while bounces remain", () => {
    const state = startKitted("test_cannon", CANNON);
    state.enemies = [];
    // Fire one coin straight at the level's own edge — the bound is a wall with
    // a normal known by inspection, which is exactly what a ricochet needs.
    const coin = state.projectiles;
    coin.length = 0;
    state.players[0].pos = { x: 60, y: 60 };
    coin.push({
      id: state.nextId++,
      pos: { x: 6, y: 60 },
      dir: { x: -1, y: 0 },
      speed: 400,
      radius: 4,
      damage: 1,
      lifetimeMs: 4000,
      weaponClass: "ranged",
      sprite: "coin_shot",
      bouncesLeft: 2,
      hostile: true,
      sourceMlvl: 1,
      sourceDefId: "test_cannon",
      z: 0,
    } as (typeof coin)[number]);
    // Watched just past the bounce: given long enough it would cross the whole
    // level, spend its second bounce on the far wall and die, which says
    // nothing about the ricochet itself.
    const seen = collect(state, 60);
    expect(seen.some((e) => e.type === "projectileBounced")).toBe(true);
    // It survived the wall and is now travelling the other way, with one of its
    // two bounces spent.
    const alive = state.projectiles.find((p) => p.sprite === "coin_shot");
    expect(alive).toBeDefined();
    expect(alive?.dir.x).toBeGreaterThan(0);
    expect(alive?.bouncesLeft).toBe(1);
  });
});

describe("pump and dump", () => {
  it("lays inert piles that arm on a delay", () => {
    const state = startKitted("test_bait", BAIT);
    plant(state, "test_bait", 90, 0);
    run(state, idle, steps(BAIT.windupMs + 60));
    expect(state.baits.length).toBeGreaterThan(0);
    // Still arming — the walk-away window, and the whole reason it is fair.
    expect(state.baits.every((b) => b.armMs > 0)).toBe(true);
    const hp = state.players[0].hp;
    state.players[0].pos = {
      ...(state.baits[0] as { pos: GameState["players"][0]["pos"] }).pos,
    };
    run(state, idle, steps(120));
    expect(state.players[0].hp).toBe(hp);
  });

  it("goes off once armed and the hero walks into it", () => {
    const state = startKitted("test_bait", BAIT);
    state.enemies = [];
    state.baits.push({
      id: 1,
      pos: { ...state.players[0].pos },
      armMs: 0,
      remainingMs: 5000,
      durationMs: 5000,
      triggerRadius: 20,
      blastRadius: 50,
      damage: 30,
      defId: "test_bait",
      seed: 3,
    });
    const seen = collect(state, 100);
    expect(seen.some((e) => e.type === "baitDetonated")).toBe(true);
    expect(state.players[0].hp).toBeLessThan(state.players[0].maxHp);
    expect(state.baits).toHaveLength(0);
  });

  it("goes cold on its own, so ignoring a scatter costs nothing", () => {
    const state = startKitted("test_bait", BAIT);
    state.enemies = [];
    state.baits.push({
      id: 1,
      pos: { x: state.players[0].pos.x + 400, y: state.players[0].pos.y },
      armMs: 0,
      remainingMs: 900,
      durationMs: 900,
      triggerRadius: 20,
      blastRadius: 50,
      damage: 30,
      defId: "test_bait",
      seed: 3,
    });
    run(state, idle, steps(1200));
    expect(state.baits).toHaveLength(0);
    expect(state.players[0].hp).toBe(state.players[0].maxHp);
  });
});

describe("orbital delivery", () => {
  it("puts pods in the sky on marks around the hero, not on him", () => {
    const state = startKitted("test_strike", STRIKE);
    plant(state, "test_strike", 140, 0);
    run(state, idle, steps(STRIKE.windupMs + 60));
    const pods = state.asteroids.filter((a) => a.sprite === "drop_pod");
    expect(pods).toHaveLength(STRIKE.count);
    // Bracketing, not chasing — every mark is off the hero's own spot.
    for (const pod of pods) {
      const dx = pod.target.x - state.players[0].pos.x;
      const dy = pod.target.y - state.players[0].pos.y;
      expect(Math.hypot(dx, dy)).toBeGreaterThan(20);
    }
  });

  it("pops open on impact and the crater delivers", () => {
    const state = startKitted("test_strike", STRIKE);
    state.enemies = [];
    const before = state.enemies.length;
    state.asteroids.push({
      id: state.nextId++,
      target: { x: state.players[0].pos.x + 200, y: state.players[0].pos.y },
      entry: {
        x: state.players[0].pos.x + 300,
        y: state.players[0].pos.y - 200,
      },
      fallMs: 200,
      ageMs: 0,
      blastRadius: 55,
      rockRadius: 9,
      spin: 0,
      sprite: "drop_pod",
      damage: 10,
      sourceDefId: "test_strike",
      hatch: { defId: "test_minion", count: 2 },
    });
    const seen = collect(state, 400);
    expect(seen.some((e) => e.type === "podOpened")).toBe(true);
    expect(state.enemies.length).toBe(before + 2);
  });
});

describe("call of incels", () => {
  it("calls a herd in on the boss's own timing, wearing its own runners", () => {
    const state = startKitted("test_caller", {
      ...HORDE,
      runnerSprite: "incel",
    });
    plant(state, "test_caller", 90, 0);
    const seen = collect(state, HORDE.windupMs + 120);
    expect(seen.some((e) => e.type === "bossHorde")).toBe(true);
    expect(state.stampedes).toHaveLength(1);
    expect(state.stampedes[0]?.runnerSprite).toBe("incel");
  });

  it("will not stack a second herd on top of the first", () => {
    const state = startKitted("test_caller", HORDE);
    const boss = plant(state, "test_caller", 90, 0);
    run(state, idle, steps(HORDE.windupMs + 120));
    expect(state.stampedes).toHaveLength(1);
    // Off cooldown, but its own herd is still running: nothing more is called.
    boss.mech!.abilityCooldownMs = { call_horde: 0 };
    run(state, idle, steps(400));
    expect(state.stampedes).toHaveLength(1);
  });
});

// ─── RECOMPILE and LOCKDOWN ───────────────────────────────────────────────────

const NODE = {
  ...(FIX_ENEMIES.test_elite as EnemyDef),
  id: "test_node",
  name: "TEST NODE",
  sprite: "test_elite",
  structure: true,
  speed: 0,
  contactDamage: 0,
  hp: 80,
  xpMobMult: 0,
  dialogue: undefined,
  lastWords: undefined,
  mechanics: undefined,
} as EnemyDef;

const RECOMPILE = {
  id: "recompile" as const,
  windupMs: 300,
  cooldownMs: 9000,
  defId: "test_node",
  distance: 50,
  lifeMs: 20000,
  healFracPerSec: 0.1,
};

const LOCKDOWN = {
  id: "lockdown" as const,
  windupMs: 300,
  cooldownMs: 9000,
  radius: 80,
  segments: 16,
  gapDeg: 45,
  durationMs: 2000,
  sprite: "test_elite",
  segmentRadius: 9,
};

function startWith(defId: string, ability: unknown): GameState {
  registerDefs({
    enemies: {
      ...FIX_ENEMIES,
      test_node: NODE,
      [defId]: kitted(defId, ability),
    },
  });
  return startAt();
}

describe("recompile", () => {
  it("holds off at full health — the first sighting must be obviously worth it", () => {
    const state = startWith("test_fixer", RECOMPILE);
    const boss = plant(state, "test_fixer", 90, 0);
    run(state, idle, steps(900));
    expect(boss.mech?.nodeId).toBeUndefined();
    expect(state.enemies.some((e) => e.defId === "test_node")).toBe(false);
  });

  it("raises a node once hurt, and climbs while it stands", () => {
    const state = startWith("test_fixer", RECOMPILE);
    const boss = plant(state, "test_fixer", 90, 0);
    boss.hp = boss.maxHp * 0.5;
    const events = collect(state, RECOMPILE.windupMs + 60);
    expect(events.some((e) => e.type === "bossRecompile")).toBe(true);
    const node = state.enemies.find((e) => e.defId === "test_node");
    expect(node).toBeDefined();
    expect(boss.mech?.nodeId).toBe(node?.id);
    const before = boss.hp;
    run(state, idle, steps(600));
    expect(boss.hp).toBeGreaterThan(before);
  });

  it("breaking the node stops the healing — the answer is in the room", () => {
    const state = startWith("test_fixer", RECOMPILE);
    const boss = plant(state, "test_fixer", 90, 0);
    boss.hp = boss.maxHp * 0.5;
    run(state, idle, steps(RECOMPILE.windupMs + 60));
    const node = state.enemies.find((e) => e.defId === "test_node");
    expect(node).toBeDefined();
    state.enemies = state.enemies.filter((e) => e.id !== node?.id);
    run(state, idle, steps(120)); // let the tether notice and drop
    const after = boss.hp;
    run(state, idle, steps(800));
    expect(boss.hp).toBe(after);
    expect(boss.mech?.nodeId).toBeUndefined();
  });
});

describe("lockdown", () => {
  it("drops a ring of shutters with exactly one way out", () => {
    const state = startWith("test_warden", LOCKDOWN);
    plant(state, "test_warden", 140, 0);
    const before = state.obstacles.length;
    const events = collect(state, LOCKDOWN.windupMs + 60);
    expect(events.some((e) => e.type === "bossLockdown")).toBe(true);
    const shutters = state.obstacles.filter((o) => o.kind === "shutter");
    expect(shutters.length).toBeGreaterThan(0);
    expect(state.obstacles.length).toBe(before + shutters.length);
    // The gap is real: a full ring would be every segment, and it is not.
    expect(shutters.length).toBeLessThan(LOCKDOWN.segments);
    // And it is a ring around the HERO, at the authored radius.
    for (const s of shutters) {
      const d = Math.hypot(
        s.pos.x - state.players[0].pos.x,
        s.pos.y - state.players[0].pos.y,
      );
      expect(Math.abs(d - LOCKDOWN.radius)).toBeLessThan(2);
    }
  });

  it("drops shutters that actually STOP something", () => {
    // The ring is only a cage if the obstacle index knows about it. It did not:
    // the spatial grid caches on `state.obstacles`' identity, and the raise
    // pushed into the live array instead of replacing it — so every shutter
    // registered in no cell, collided with nothing and stopped no shot, while
    // all three assertions above stayed green.
    const state = startWith("test_warden", LOCKDOWN);
    plant(state, "test_warden", 140, 0);
    run(state, idle, steps(LOCKDOWN.windupMs + 60));
    const shutter = state.obstacles.find((o) => o.kind === "shutter");
    expect(shutter).toBeDefined();
    const at = shutter?.pos ?? { x: 0, y: 0 };
    expect(
      lineOfSight(state, { x: at.x - 20, y: at.y }, { x: at.x + 20, y: at.y }),
    ).toBe(false);
  });

  it("bumps the obstacle version so a cached nav grid rebuilds", () => {
    const state = startWith("test_warden", LOCKDOWN);
    plant(state, "test_warden", 140, 0);
    const v0 = state.obstaclesVersion;
    run(state, idle, steps(LOCKDOWN.windupMs + 60));
    expect(state.obstaclesVersion).toBeGreaterThan(v0);
  });

  it("retracts on its own and leaves the room exactly as it found it", () => {
    const state = startWith("test_warden", LOCKDOWN);
    plant(state, "test_warden", 140, 0);
    const before = state.obstacles.length;
    run(state, idle, steps(LOCKDOWN.windupMs + 60));
    expect(state.obstacles.length).toBeGreaterThan(before);
    const lifted = collect(state, LOCKDOWN.durationMs + 200);
    expect(lifted.some((e) => e.type === "bossLockdownLifted")).toBe(true);
    expect(state.obstacles.filter((o) => o.kind === "shutter")).toHaveLength(0);
    expect(state.obstacles.length).toBe(before);
  });
});

describe("in a party, a set piece aims at the mob's own quarry", () => {
  // Every ability used to read `state.players[0]` for its bearing, its reach
  // and its victim — which in a party means "the host", wherever the fight
  // happens to be. `AbilityCtx.target` is the mob's OWN quarry (`aggro.ts`),
  // so the tell, the cast and the resolve all address one person, and it is
  // the person the boss is actually chasing.

  /** Seat a second hero and put the two of them far apart. */
  function apart(state: GameState): { host: Player; joiner: Player } {
    const joiner = seatHero(state, null);
    const host = state.players[0] as Player;
    host.pos = { x: 300, y: 1400 };
    joiner.pos = { x: 1800, y: 300 };
    return { host, joiner };
  }

  it("locks the bearing onto the hero it is fighting, not onto seat 0", () => {
    const state = startAt();
    const { joiner } = apart(state);
    // The boss stands beside the JOINER, half a map from the host.
    const boss = plant(state, "test_burner", 0, 0);
    boss.pos = { x: joiner.pos.x - 90, y: joiner.pos.y };
    boss.home = { ...boss.pos };
    step(state, idle, DT);
    const dir = boss.mech?.telegraph?.dir;
    if (!dir) throw new Error("the boss never wound up");
    // Aimed EAST at the hero beside it. The host lies south-west, so a seat-0
    // read would have pointed the other way on both axes.
    expect(dir.x).toBeGreaterThan(0);
    expect(dir.y).toBeLessThan(0.5);
  });

  it("burns the hero it is fighting, and leaves the other one untouched", () => {
    const state = startAt();
    const { host, joiner } = apart(state);
    const boss = plant(state, "test_burner", 0, 0);
    boss.pos = { x: joiner.pos.x - 60, y: joiner.pos.y };
    boss.home = { ...boss.pos };
    host.hp = host.maxHp;
    joiner.hp = joiner.maxHp;
    run(state, idle, steps(LASER.windupMs + LASER.hitIntervalMs + 120));
    expect(joiner.hp).toBeLessThan(joiner.maxHp);
    expect(host.hp).toBe(host.maxHp);
  });
});
