// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The projectile behaviors the base weapon roster leans on for its identity:
// multi-pellet volleys (shotguns), piercing rounds (railguns), homing darts
// (smart pistols), and chain lightning (arc projectors). Volleys go through
// the real firing path (stepWeapon); flight behaviors are asserted on
// hand-pushed projectiles so each rule is tested in isolation.

import { describe, expect, it } from "vitest";

import { registerDefs, step, WEAPON } from "@game/core";
import type { GameState, Projectile } from "@game/core";

import {
  FIX_ABILITIES,
  FIX_DIFFICULTIES,
  FIX_ENEMIES,
  FIX_GEAR,
  FIX_LEVEL,
  FIX_STORY_ITEMS,
  FIX_WEAPONS,
} from "./fixtures.ts";
import { DT, idle, makeEnemy, startGame, stopWaves } from "./helpers.ts";

registerDefs({
  levels: { test_level: FIX_LEVEL },
  enemies: FIX_ENEMIES,
  weapons: {
    ...FIX_WEAPONS,
    // A three-pellet scattergun for the volley test.
    test_scattergun: {
      id: "test_scattergun",
      name: "TEST SCATTERGUN",
      class: "ranged",
      levelReq: 1,
      damage: 6,
      cooldownMs: 800,
      range: 200,
      durability: 100,
      projectile: {
        speed: 100,
        radius: 3,
        lifetimeMs: 2000,
        sprite: "pellet",
        count: 3,
        spreadDeg: 24,
      },
      icon: "icon_blaster",
    },
  },
  gear: FIX_GEAR,
  abilities: FIX_ABILITIES,
  difficulties: FIX_DIFFICULTIES,
  storyItems: FIX_STORY_ITEMS,
});

/** A cleared, quiet stage with the auto-attack holstered, so hand-pushed
 * projectiles are the only violence on the board. */
function quietStage(): GameState {
  const state = startGame();
  stopWaves(state);
  state.enemies = [];
  state.player.disarmed = true;
  state.rng = () => 0.99; // no misses, no dodges, no crits — pure mechanics
  return state;
}

function pushShot(
  state: GameState,
  overrides: Partial<Projectile> & { pos: Projectile["pos"] },
): Projectile {
  const shot: Projectile = {
    id: state.nextId++,
    dir: { x: 1, y: 0 },
    speed: 200,
    radius: 3,
    damage: 10,
    lifetimeMs: 1500,
    weaponClass: "ranged",
    sprite: "bolt",
    z: 0,
    ...overrides,
  };
  state.projectiles.push(shot);
  return shot;
}

describe("multi-pellet volleys", () => {
  it("fires `count` projectiles fanned across the spread on one trigger pull", () => {
    const state = startGame();
    stopWaves(state);
    state.rng = () => 0.99;
    state.player.equipment.weapon = {
      id: 900,
      defId: "test_scattergun",
      slot: "weapon",
      tier: "regular",
      ilvl: 1,
      affixes: [],
      durability: 100,
    };
    state.player.weaponCooldownMs = 0;
    // One sturdy target well inside range but outside a single tick's travel.
    state.enemies = [
      makeEnemy({
        pos: { x: state.player.pos.x + 150, y: state.player.pos.y },
      }),
    ];
    step(state, idle, DT);
    expect(state.projectiles).toHaveLength(3);
    expect(state.stats.shotsFired).toBe(1); // one pull, not three
    // The volley fans: three distinct headings, symmetric around the aim.
    const angles = state.projectiles.map((p) => Math.atan2(p.dir.y, p.dir.x));
    expect(new Set(angles.map((a) => a.toFixed(4))).size).toBe(3);
    const spread = Math.max(...angles) - Math.min(...angles);
    expect(spread).toBeCloseTo((24 * Math.PI) / 180, 2);
  });
});

describe("piercing rounds", () => {
  it("punches through `pierce` bodies and never bills the same body twice", () => {
    const state = quietStage();
    const p = state.player.pos;
    // Three 1-hp fodder in a row along the shot's lane.
    for (let i = 0; i < 3; i++) {
      state.enemies.push(
        makeEnemy(
          {
            id: 9100 + i,
            pos: { x: p.x + 40 + i * 40, y: p.y },
            hp: 1,
            maxHp: 1,
          },
          "test_fodder",
        ),
      );
    }
    pushShot(state, { pos: { ...p }, pierceLeft: 2, damage: 999 });
    for (let i = 0; i < 60 && state.enemies.length > 0; i++) {
      step(state, idle, DT);
    }
    // pierce 2 = the first body plus two more: the whole line falls to one shot.
    expect(state.enemies).toHaveLength(0);
    expect(state.projectiles).toHaveLength(0); // spent after its last body
  });
});

describe("homing darts", () => {
  it("curves onto a target it was not aimed at", () => {
    const state = quietStage();
    const p = state.player.pos;
    // Aimed due +x; the only target sits BEHIND the muzzle at −x.
    state.enemies.push(
      makeEnemy(
        { id: 9200, pos: { x: p.x - 100, y: p.y }, hp: 1, maxHp: 1 },
        "test_fodder",
      ),
    );
    pushShot(state, {
      pos: { ...p },
      dir: { x: 1, y: 0 },
      homing: 12, // an aggressive turn rate: the U-turn takes ~a quarter second
      lifetimeMs: 4000,
      damage: 999,
    });
    for (let i = 0; i < 200 && state.enemies.length > 0; i++) {
      step(state, idle, DT);
    }
    expect(state.enemies).toHaveLength(0);
  });
});

describe("chain lightning", () => {
  it("leaps from the struck foe to its neighbor at reduced damage, with a flash", () => {
    const state = quietStage();
    const p = state.player.pos;
    const first = makeEnemy(
      { id: 9300, pos: { x: p.x + 60, y: p.y }, hp: 1, maxHp: 1, mlvl: 1 },
      "test_fodder",
    );
    // The neighbor: inside chainRange of the first, sturdy enough to survive
    // the leap so the softened damage is measurable. Level-1 → ~no armor, so
    // the leap lands its pure chainDamageFrac rather than an armor-shaved cut.
    const second = makeEnemy(
      {
        id: 9301,
        pos: { x: p.x + 60 + WEAPON.chainRange / 2, y: p.y },
        hp: 100,
        maxHp: 100,
        mlvl: 1,
      },
      "test_fodder",
    );
    state.enemies.push(first, second);
    pushShot(state, { pos: { ...p }, chain: 1, damage: 10 });
    let sawLightning = false;
    for (let i = 0; i < 60 && state.enemies.length > 1; i++) {
      step(state, idle, DT);
      if (state.events.some((e) => e.type === "lightning")) sawLightning = true;
    }
    expect(state.enemies).toHaveLength(1); // the first fell to the bolt
    expect(sawLightning).toBe(true);
    // The leap carried chainDamageFrac of the blow: 10 × 0.6 = 6.
    expect(second.hp).toBe(100 - Math.round(10 * WEAPON.chainDamageFrac));
  });

  it("does not leap to foes beyond chainRange", () => {
    const state = quietStage();
    const p = state.player.pos;
    const first = makeEnemy(
      { id: 9310, pos: { x: p.x + 60, y: p.y }, hp: 1, maxHp: 1 },
      "test_fodder",
    );
    const far = makeEnemy(
      {
        id: 9311,
        pos: { x: p.x + 60 + WEAPON.chainRange * 2, y: p.y },
        hp: 100,
        maxHp: 100,
      },
      "test_fodder",
    );
    state.enemies.push(first, far);
    pushShot(state, { pos: { ...p }, chain: 1, damage: 10, lifetimeMs: 400 });
    for (let i = 0; i < 60 && state.enemies.length > 1; i++) {
      step(state, idle, DT);
    }
    expect(far.hp).toBe(100); // out of the arc's reach
  });
});
