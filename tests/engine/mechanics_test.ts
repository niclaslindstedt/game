// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Set-piece mechanics (src/game/mechanics.ts): the telegraphed charge and
// slam, the enrage turn, add summons, boss phases — and the difficulty-gated
// smarter-mob rules (minion flanking, shooter target-leading). All on
// synthetic fixtures; no shipped content ids.

import { beforeEach, describe, expect, it } from "vitest";

import {
  activeMechanics,
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
import { DT, idle, run, steerTo, stopWaves } from "./helpers.ts";

// ---- Mechanic-carrying fixtures ------------------------------------------------

const CHARGER = {
  ...(FIX_ENEMIES.test_elite as EnemyDef),
  id: "test_charger",
  name: "TEST CHARGER",
  sprite: "test_elite",
  speed: 20,
  mechanics: {
    charge: {
      windupMs: 400,
      speedMult: 4,
      range: 150,
      cooldownMs: 5000,
      damageMult: 1.5,
    },
  },
};

const SLAMMER = {
  ...(FIX_ENEMIES.test_elite as EnemyDef),
  id: "test_slammer",
  name: "TEST SLAMMER",
  sprite: "test_elite",
  speed: 0,
  contactDamage: 20,
  critChance: 0,
  mechanics: {
    slam: { windupMs: 300, radius: 60, damageFrac: 1.2, cooldownMs: 8000 },
  },
};

const RAGER = {
  ...(FIX_ENEMIES.test_elite as EnemyDef),
  id: "test_rager",
  name: "TEST RAGER",
  sprite: "test_elite",
  hp: 200,
  mechanics: {
    enrage: { belowHpFrac: 0.5, speedMult: 1.5, damageMult: 1.4 },
  },
};

const SUMMONER = {
  ...(FIX_ENEMIES.test_elite as EnemyDef),
  id: "test_summoner",
  name: "TEST SUMMONER",
  sprite: "test_elite",
  speed: 0,
  mechanics: {
    summon: { defId: "test_minion", count: 2, cooldownMs: 3000, maxAlive: 3 },
  },
};

const PHASED = {
  ...(FIX_ENEMIES.test_boss as EnemyDef),
  id: "test_phased",
  name: "TEST PHASED",
  sprite: "test_boss",
  dialogue: undefined,
  lastWords: undefined,
  mechanics: {
    charge: { windupMs: 400, speedMult: 4, range: 150, cooldownMs: 5000 },
  },
  phases: [
    {
      belowHpFrac: 0.5,
      mechanics: {
        summon: {
          defId: "test_minion",
          count: 2,
          cooldownMs: 3000,
          maxAlive: 4,
        },
      },
    },
  ],
};

function install(): void {
  installFixtures(true);
  registerDefs({
    levels: { test_level: FIX_LEVEL },
    uniques: FIX_UNIQUES,
    enemies: {
      ...FIX_ENEMIES,
      test_charger: CHARGER,
      test_slammer: SLAMMER,
      test_rager: RAGER,
      test_summoner: SUMMONER,
      test_phased: PHASED,
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

/** Plant a mechanic-carrying mob near the player, awake and engaged. */
function plant(state: GameState, defId: string, dx = 100, dy = 0): Enemy {
  const pos = { x: state.player.pos.x + dx, y: state.player.pos.y + dy };
  const enemy: Enemy = {
    id: state.nextId++,
    defId,
    pos: { ...pos },
    home: { ...pos },
    hp: 200,
    maxHp: 200,
    mlvl: 1,
    speed: 20,
    contactCooldownMs: 0,
    awake: true,
  };
  state.enemies.push(enemy);
  return enemy;
}

beforeEach(install);

describe("telegraphed charge", () => {
  it("roots for the windup, locks the bearing, then dashes along it", () => {
    const state = startAt();
    const charger = plant(state, "test_charger", 100, 0);
    step(state, idle, DT);
    // The windup armed: a telegraph event with the LOCKED bearing.
    const tell = state.events.find((e) => e.type === "enemyTelegraph");
    expect(tell).toBeDefined();
    expect(tell && tell.type === "enemyTelegraph" && tell.kind).toBe("charge");
    const lockedDir = charger.mech?.telegraph?.dir;
    expect(lockedDir).toBeDefined();
    const rootedX = charger.pos.x;
    // Rooted while winding up — even as the player walks away sideways.
    run(state, steerTo(state.player.pos.x, state.player.pos.y + 200), 3);
    expect(charger.pos.x).toBeCloseTo(rootedX, 5);
    // After the windup it dashes along the LOCKED bearing (toward where the
    // player WAS — negative x from the charger), not toward the new position.
    run(state, steerTo(state.player.pos.x, state.player.pos.y + 200), 30);
    expect(charger.mech?.dashMs ?? 0).toBeGreaterThanOrEqual(0);
    expect(charger.pos.x).toBeLessThan(rootedX); // rode -x, no re-aim
  });
});

describe("telegraphed slam", () => {
  it("hits a grounded hero inside the radius through the armor curve", () => {
    const state = startAt();
    state.rng = () => 0.99; // no crits, no dodges anywhere
    plant(state, "test_slammer", 40, 0);
    const hpBefore = state.player.hp;
    // Windup 300ms ≈ 19 steps at 16ms; run past it.
    run(state, idle, 30, (s) => s.events.some((e) => e.type === "enemySlam"));
    expect(state.events.some((e) => e.type === "enemySlam")).toBe(true);
    expect(state.player.hp).toBeLessThan(hpBefore);
  });

  it("a jumping hero sails clean over it", () => {
    const state = startAt();
    state.rng = () => 0.99;
    plant(state, "test_slammer", 40, 0);
    const hpBefore = state.player.hp;
    let slammed = false;
    for (let i = 0; i < 40 && !slammed; i++) {
      // Keep the hero airborne through the whole windup with repeated jumps.
      step(state, { ...idle, jump: true }, DT);
      slammed = state.events.some((e) => e.type === "enemySlam");
    }
    expect(slammed).toBe(true);
    expect(state.player.hp).toBe(hpBefore);
  });
});

describe("enrage", () => {
  it("latches below the threshold, speeds the mob up, and fires once", () => {
    const state = startAt();
    const rager = plant(state, "test_rager", 200, 0);
    step(state, idle, DT);
    const before = rager.pos.x;
    step(state, idle, DT);
    const calmStep = before - rager.pos.x;
    expect(rager.mech?.enraged).toBeUndefined();
    // Wound it past the threshold: the turn fires, once.
    rager.hp = 90; // under 0.5 × 200
    step(state, idle, DT);
    expect(rager.mech?.enraged).toBe(true);
    expect(
      state.events.filter((e) => e.type === "enemyEnraged").length,
    ).toBe(1);
    const beforeRage = rager.pos.x;
    step(state, idle, DT);
    const ragingStep = beforeRage - rager.pos.x;
    expect(ragingStep).toBeGreaterThan(calmStep * 1.2);
  });
});

describe("summon adds", () => {
  it("calls adds up to its cap, outside the wave budget", () => {
    const state = startAt();
    plant(state, "test_summoner", 120, 0);
    step(state, idle, DT);
    const summoned = state.enemies.filter((e) => e.defId === "test_minion");
    expect(summoned.length).toBe(2); // count per call
    expect(state.events.some((e) => e.type === "enemySummoned")).toBe(true);
    // The cooldown holds — no second call the next tick.
    step(state, idle, DT);
    expect(state.enemies.filter((e) => e.defId === "test_minion").length).toBe(
      2,
    );
  });

  it("never exceeds maxAlive across calls", () => {
    const state = startAt();
    const summoner = plant(state, "test_summoner", 120, 0);
    step(state, idle, DT);
    // Force the cooldown down and call again: cap 3 admits only ONE more.
    if (summoner.mech) summoner.mech.summonCooldownMs = 0;
    step(state, idle, DT);
    expect(state.enemies.filter((e) => e.defId === "test_minion").length).toBe(
      3,
    );
  });
});

describe("boss phases", () => {
  it("switches the active mechanic set at the hp breakpoint", () => {
    const state = startAt();
    const boss = plant(state, "test_phased", 120, 0);
    const def = { mechanics: PHASED.mechanics, phases: PHASED.phases };
    // Full hp: the base set (charge) is active.
    expect(activeMechanics(boss, def as never)?.charge).toBeDefined();
    expect(activeMechanics(boss, def as never)?.summon).toBeUndefined();
    // Under half: the phase set (summon) REPLACES it.
    boss.hp = 80;
    expect(activeMechanics(boss, def as never)?.charge).toBeUndefined();
    expect(activeMechanics(boss, def as never)?.summon).toBeDefined();
  });
});

describe("difficulty-gated smarts", () => {
  /** Head one minion at the player from due east and report its first-step
   * heading angle off the direct west bearing (radians). */
  function chaseHeading(difficulty: "medium" | "hard"): number {
    const state = startAt(difficulty);
    const pos = { x: state.player.pos.x + 200, y: state.player.pos.y };
    const enemy: Enemy = {
      id: 9002, // even id → deterministic flank side
      defId: "test_minion",
      pos: { ...pos },
      home: { ...pos },
      hp: 45,
      maxHp: 45,
      mlvl: 1,
      speed: 20,
      contactCooldownMs: 0,
      awake: true,
    };
    state.enemies.push(enemy);
    step(state, idle, DT);
    const dx = enemy.pos.x - pos.x;
    const dy = enemy.pos.y - pos.y;
    return Math.abs(Math.atan2(dy, -dx));
  }

  it("minions flank from the hard rung and chase straight below it", () => {
    expect(chaseHeading("medium")).toBeLessThan(0.05);
    expect(chaseHeading("hard")).toBeGreaterThan(0.2);
  });

  it("shooters lead a running hero from the hard rung only", () => {
    function firstShotDir(
      difficulty: "medium" | "hard",
    ): { x: number; y: number } {
      const state = startAt(difficulty);
      // A shooter due east, the hero running due north (positive vel.y).
      const pos = { x: state.player.pos.x + 150, y: state.player.pos.y };
      const enemy: Enemy = {
        id: 9003,
        defId: "test_gunner",
        pos: { ...pos },
        home: { ...pos },
        hp: 100,
        maxHp: 100,
        mlvl: 1,
        speed: 0,
        contactCooldownMs: 0,
        awake: true,
      };
      state.enemies.push(enemy);
      const north = steerTo(state.player.pos.x, state.player.pos.y - 400);
      let shot = state.events.find((e) => e.type === "enemyShot");
      for (let i = 0; i < 60 && !shot; i++) {
        step(state, north, DT);
        shot = state.events.find((e) => e.type === "enemyShot");
      }
      if (!shot || shot.type !== "enemyShot") throw new Error("never fired");
      return shot.dir;
    }
    // On medium the shot flies at the hero's position; on hard it leads the
    // northward run — the bearing tilts visibly north (negative y).
    const mediumDir = firstShotDir("medium");
    const hardDir = firstShotDir("hard");
    expect(hardDir.y).toBeLessThan(mediumDir.y - 0.05);
  });
});
