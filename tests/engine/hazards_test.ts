// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Environmental hazards (src/game/hazards.ts): gravity wells drag the
// grounded player/enemies and devour minions in the core (no kill, no XP, no
// loot — the hole pays nobody) and the grounded hero too (instant death),
// while pulling loose loot in from a wider reach onto the rim; asteroids spawn
// on the level's cadence, strike the player once per rock (jumpable), shove
// minions aside unharmed, and despawn off the player's stage.

import { describe, expect, it } from "vitest";

import {
  ASTEROIDS,
  createGame,
  dismissIntro,
  HAY_BALLS,
  JUMP,
  skipCutscene,
  step,
  WELLS,
} from "@game/core";
import type {
  Asteroid,
  Difficulty,
  GameState,
  GravityWell,
  HayBall,
} from "@game/core";
import { clearStage, DT, idle, makeEnemy, run, startGame } from "./helpers.ts";

/** An asteroid-rain run started on a given rung, staged clean. */
function startAsteroidsOn(difficulty: Difficulty): GameState {
  const state = createGame(42, "test_asteroid_level", difficulty);
  skipCutscene(state);
  dismissIntro(state);
  clearStage(state);
  return state;
}

/** The well level's hole (config-default numbers), staged clean. */
function stageWell(state: GameState): GravityWell {
  clearStage(state);
  return state.wells[0]!;
}

/** A hand-built meteor, aimed by the test rather than the spawner. It lands on
 * `target`; by default it is already AT impact (`ageMs === fallMs`), so a
 * single `step` detonates it. Override `ageMs` to stage a still-falling rock. */
function makeRock(
  overrides: Partial<Asteroid> & { target: Asteroid["target"] },
): Asteroid {
  const fallMs = overrides.fallMs ?? 1500;
  return {
    id: 9100,
    entry: {
      x: overrides.target.x - 120,
      y: overrides.target.y - 120,
    },
    fallMs,
    ageMs: fallMs, // at impact — detonates on the next step
    blastRadius: 50,
    rockRadius: 9,
    spin: 0,
    ...overrides,
  };
}

/** A hand-built hay bale, parked (speed 0) by the test rather than the roller. */
function makeBall(
  overrides: Partial<HayBall> & { pos: HayBall["pos"] },
): HayBall {
  return {
    id: 9200,
    speed: 0,
    radius: 12,
    spin: 0,
    struck: false,
    ...overrides,
  };
}

describe("gravity wells", () => {
  it("builds the level's wells from config defaults", () => {
    const state = startGame(42, "test_well_level");
    expect(state.wells).toHaveLength(1);
    expect(state.wells[0]!.pullRadius).toBe(WELLS.pullRadius);
    expect(state.wells[0]!.lootRadius).toBe(WELLS.lootRadius);
  });

  it("drags the grounded player toward the core", () => {
    const state = startGame(42, "test_well_level");
    const well = stageWell(state);
    state.player.pos = { x: well.pos.x + 100, y: well.pos.y };
    step(state, idle, DT);
    expect(state.player.pos.x).toBeLessThan(well.pos.x + 100);
    expect(state.player.pos.y).toBe(well.pos.y);
  });

  it("has no reach past its pull radius", () => {
    const state = startGame(42, "test_well_level");
    const well = stageWell(state);
    const x = well.pos.x + WELLS.pullRadius + 20;
    state.player.pos = { x, y: well.pos.y };
    step(state, idle, DT);
    expect(state.player.pos.x).toBe(x);
  });

  it("a jumping player drifts toward the core and jumps less high", () => {
    const state = startGame(42, "test_well_level");
    const well = stageWell(state);
    state.player.pos = { x: well.pos.x + 60, y: well.pos.y };
    state.player.z = JUMP.dodgeHeight + 30;
    state.player.vz = 100;
    const vzBefore = state.player.vz;
    const hpBefore = state.player.hp;
    step(state, idle, DT);
    // No longer sails clean over: the hole still tugs him toward the core...
    expect(state.player.pos.x).toBeLessThan(well.pos.x + 60);
    expect(state.player.pos.x).toBeGreaterThan(well.pos.x);
    // ...and heaps gravity onto the hop, so vz drops FASTER than the level's
    // gravity alone would carry it — he jumps less high near the horizon.
    const levelOnly = vzBefore - state.level.gravity * (DT / 1000);
    expect(state.player.vz).toBeLessThan(levelOnly - 0.001);
    // But he floats above the core: no burn while airborne.
    expect(state.player.hp).toBe(hpBefore);
  });

  it("devours the grounded player in the core: instant death", () => {
    const state = startGame(42, "test_well_level");
    const well = stageWell(state);
    state.player.pos = { ...well.pos };
    step(state, idle, DT);
    // Getting stuck in a black hole is instant death — hp to 0, the run drops
    // into the death scene (the `dying` tableau, before the defeat modal) this
    // same tick, and the swallow event fires at the hole.
    expect(state.player.hp).toBe(0);
    expect(state.phase).toBe("dying");
    expect(
      state.events.some(
        (e) => e.type === "wellDeath" && e.pos.x === well.pos.x,
      ),
    ).toBe(true);
  });

  it("a player jumping over the core is not swallowed", () => {
    const state = startGame(42, "test_well_level");
    const well = stageWell(state);
    state.player.pos = { ...well.pos };
    state.player.z = JUMP.dodgeHeight + 30;
    state.player.vz = 100;
    step(state, idle, DT);
    // He floats above the core — no swallow while airborne.
    expect(state.player.hp).toBeGreaterThan(0);
    expect(state.phase).not.toBe("defeat");
  });

  it("devours a minion at the core: no kill, no XP, no loot", () => {
    const state = startGame(42, "test_well_level");
    const well = stageWell(state);
    state.player.pos = { x: well.pos.x + 600, y: well.pos.y };
    state.enemies.push(
      makeEnemy({ pos: { x: well.pos.x + 40, y: well.pos.y } }),
    );
    let swallowed = false;
    for (let i = 0; i < 300 && !swallowed; i++) {
      step(state, idle, DT);
      swallowed = state.events.some((e) => e.type === "wellSwallowed");
    }
    expect(swallowed).toBe(true);
    expect(state.enemies.some((e) => e.defId === "test_minion")).toBe(false);
    expect(state.stats.kills).toBe(0);
    expect(state.stats.xpGained).toBe(0);
    expect(state.items).toHaveLength(0);
  });

  it("drags but never devours an elite or boss", () => {
    const state = startGame(42, "test_well_level");
    const well = stageWell(state);
    state.player.pos = { x: well.pos.x + 600, y: well.pos.y };
    const boss = state.enemies[0]!;
    boss.pos = { x: well.pos.x + 40, y: well.pos.y };
    run(state, idle, 300);
    // Still on the board, parked in the core the pull dragged it into.
    expect(state.enemies).toContain(boss);
  });

  it("parks dragged items on the rim instead of eating them", () => {
    const state = startGame(42, "test_well_level");
    const well = stageWell(state);
    state.player.pos = { x: well.pos.x + 600, y: well.pos.y };
    state.items.push({
      id: state.nextId++,
      kind: "medkit",
      pos: { x: well.pos.x + 80, y: well.pos.y },
    });
    run(state, idle, 300);
    const item = state.items[0]!;
    const d = Math.hypot(item.pos.x - well.pos.x, item.pos.y - well.pos.y);
    expect(d).toBeGreaterThanOrEqual(WELLS.itemRestRadius - 1);
    expect(d).toBeLessThanOrEqual(WELLS.itemRestRadius + 2);
  });

  it("pulls loot from beyond the player's reach — about a screen away", () => {
    const state = startGame(42, "test_well_level");
    const well = stageWell(state);
    state.player.pos = { x: well.pos.x + 900, y: well.pos.y };
    // Past the player's own pull, but well inside the loot reach.
    const startX = well.pos.x + WELLS.pullRadius + 60;
    expect(startX).toBeLessThan(well.pos.x + WELLS.lootRadius);
    state.items.push({
      id: state.nextId++,
      kind: "medkit",
      pos: { x: startX, y: well.pos.y },
    });
    run(state, idle, 60);
    // The loot has crept toward the hole even from out here.
    expect(state.items[0]!.pos.x).toBeLessThan(startX);
  });

  it("leaves loot beyond the loot reach untouched", () => {
    const state = startGame(42, "test_well_level");
    const well = stageWell(state);
    state.player.pos = { x: well.pos.x + 900, y: well.pos.y };
    const x = well.pos.x + WELLS.lootRadius + 20;
    state.items.push({
      id: state.nextId++,
      kind: "medkit",
      pos: { x, y: well.pos.y },
    });
    run(state, idle, 60);
    expect(state.items[0]!.pos.x).toBe(x);
  });
});

/** Park the hero clear of the impact so a staged strike never catches him. */
function movePlayerAway(state: GameState, target: { x: number; y: number }) {
  state.player.pos = { x: target.x + 400, y: target.y };
}

describe("asteroids", () => {
  it("spawns on the level's cadence, capped at maxAlive", () => {
    const state = startGame(42, "test_asteroid_level");
    clearStage(state);
    expect(state.asteroids).toHaveLength(0);
    // The fixture cadence is a fixed 800ms; a rock lives its whole fall
    // (>=1250ms) so the cap must engage within a few intervals.
    run(state, idle, Math.ceil((800 * (ASTEROIDS.maxAlive + 3)) / DT));
    expect(state.asteroids.length).toBeGreaterThan(0);
    expect(state.asteroids.length).toBeLessThanOrEqual(ASTEROIDS.maxAlive);
  });

  it("never spawns on levels without the rain", () => {
    const state = startGame(42, "test_well_level");
    clearStage(state);
    run(state, idle, 200);
    expect(state.asteroids).toHaveLength(0);
  });

  it("falls first, detonates on impact — nothing happens mid-air", () => {
    const state = startGame(42, "test_asteroid_level");
    clearStage(state);
    state.asteroidTimerMs = 999_999;
    const hpBefore = state.player.hp;
    // A still-falling rock aimed at the hero: airborne, it touches nothing.
    state.asteroids.push(
      makeRock({
        target: { ...state.player.pos },
        fallMs: 1500,
        ageMs: 0,
      }),
    );
    step(state, idle, DT);
    expect(state.player.hp).toBe(hpBefore);
    expect(state.asteroids).toHaveLength(1);
    expect(state.events.some((e) => e.type === "asteroidImpact")).toBe(false);
    // Age it to impact — now it detonates, hurts, and clears off the board.
    state.asteroids[0]!.ageMs = state.asteroids[0]!.fallMs;
    step(state, idle, DT);
    expect(state.player.hp).toBeLessThan(hpBefore);
    expect(state.asteroids).toHaveLength(0);
    expect(state.events.some((e) => e.type === "asteroidImpact")).toBe(true);
  });

  it("bites the centred hero by the difficulty fraction of his max hp", () => {
    // The ladder's asteroid fractions, gentlest first.
    const rungs: [Difficulty, number][] = [
      ["easy", 0.2],
      ["medium", 0.3],
      ["hard", 0.4],
      ["nightmare", 0.5],
      ["jesus", 0.75],
    ];
    for (const [difficulty, frac] of rungs) {
      const state = startAsteroidsOn(difficulty);
      state.asteroidTimerMs = 999_999;
      const hpBefore = state.player.hp;
      // Dead centre: the distance falloff is ~1, so the bite is the full frac.
      state.asteroids.push(makeRock({ target: { ...state.player.pos } }));
      step(state, idle, DT);
      const expected = Math.max(1, Math.round(state.player.maxHp * frac));
      expect(state.player.hp, difficulty).toBe(hpBefore - expected);
    }
  });

  it("hurts less at the blast edge than at the centre", () => {
    const centre = startAsteroidsOn("medium");
    centre.asteroidTimerMs = 999_999;
    const centreHp = centre.player.hp;
    centre.asteroids.push(makeRock({ target: { ...centre.player.pos } }));
    step(centre, idle, DT);
    const centreBite = centreHp - centre.player.hp;

    const edge = startAsteroidsOn("medium");
    edge.asteroidTimerMs = 999_999;
    const edgeHp = edge.player.hp;
    // Impact almost a full blast radius away: near the rim, the bite eases off.
    edge.asteroids.push(
      makeRock({
        target: { x: edge.player.pos.x + 45, y: edge.player.pos.y },
        blastRadius: 50,
      }),
    );
    step(edge, idle, DT);
    const edgeBite = edgeHp - edge.player.hp;
    expect(edgeBite).toBeGreaterThan(0);
    expect(edgeBite).toBeLessThan(centreBite);
  });

  it("misses the hero entirely when he stands outside the blast", () => {
    const state = startAsteroidsOn("medium");
    state.asteroidTimerMs = 999_999;
    const hpBefore = state.player.hp;
    state.asteroids.push(
      makeRock({
        target: { x: state.player.pos.x + 300, y: state.player.pos.y },
        blastRadius: 50,
      }),
    );
    step(state, idle, DT);
    expect(state.player.hp).toBe(hpBefore);
  });

  it("a jumping hero rides out the blast unhurt", () => {
    const state = startAsteroidsOn("medium");
    state.asteroidTimerMs = 999_999;
    state.player.z = JUMP.dodgeHeight + 30;
    state.player.vz = 100;
    const hpBefore = state.player.hp;
    state.asteroids.push(makeRock({ target: { ...state.player.pos } }));
    step(state, idle, DT);
    expect(state.player.hp).toBe(hpBefore);
  });

  it("flings the caught hero outward from ground zero", () => {
    const state = startAsteroidsOn("easy");
    state.asteroidTimerMs = 999_999;
    const startX = state.player.pos.x;
    // Impact just to the LEFT of the hero — the shockwave shoves him RIGHT.
    state.asteroids.push(
      makeRock({
        target: { x: startX - 20, y: state.player.pos.y },
        blastRadius: 60,
      }),
    );
    run(state, idle, 200);
    expect(state.player.pos.x).toBeGreaterThan(startX);
  });

  it("vaporizes a minion at the lethal core — no kill, no XP, no loot", () => {
    const state = startGame(42, "test_asteroid_level");
    clearStage(state);
    state.asteroidTimerMs = 999_999;
    const target = { x: state.player.pos.x + 300, y: state.player.pos.y };
    movePlayerAway(state, target);
    const minion = makeEnemy({ pos: { ...target } });
    minion.maxHp = 500; // fat bar: proves it wasn't an overkill farm
    state.enemies.push(minion);
    state.asteroids.push(makeRock({ target, blastRadius: 50 }));
    step(state, idle, DT);
    expect(state.enemies).not.toContain(minion);
    expect(state.stats.kills).toBe(0);
    expect(state.stats.xpGained).toBe(0);
    expect(state.items).toHaveLength(0);
    expect(
      state.events.some(
        (e) => e.type === "asteroidKill" && e.defId === "test_minion",
      ),
    ).toBe(true);
  });

  it("flings a minion in the outer ring instead of killing it", () => {
    const state = startGame(42, "test_asteroid_level");
    clearStage(state);
    state.asteroidTimerMs = 999_999;
    const target = { x: state.player.pos.x + 400, y: state.player.pos.y };
    movePlayerAway(state, target);
    // Sit the minion in the outer ring: past the lethal core, inside the blast.
    const blastRadius = 60;
    const ringD = blastRadius * ASTEROIDS.killFraction + 6;
    const minion = makeEnemy({ pos: { x: target.x + ringD, y: target.y } });
    state.enemies.push(minion);
    const startX = minion.pos.x;
    state.asteroids.push(makeRock({ target, blastRadius }));
    run(state, idle, 200);
    expect(state.enemies).toContain(minion);
    expect(minion.hp).toBe(minion.maxHp); // flung, not hurt
    expect(minion.pos.x).toBeGreaterThan(startX); // shoved outward
  });

  it("never kills an elite or boss caught in the blast — only flings it", () => {
    const state = startGame(42, "test_asteroid_level");
    clearStage(state);
    state.asteroidTimerMs = 999_999;
    const target = { x: state.player.pos.x + 500, y: state.player.pos.y };
    movePlayerAway(state, target);
    const boss = state.enemies[0]!; // the fixture's set piece
    boss.pos = { ...target };
    state.asteroids.push(makeRock({ target, blastRadius: 50 }));
    step(state, idle, DT);
    expect(state.enemies).toContain(boss);
    expect(boss.hp).toBe(boss.maxHp);
  });

  it("leaves a fading crater where the ground can scar", () => {
    const state = startGame(42, "test_asteroid_level");
    clearStage(state);
    state.asteroidTimerMs = 999_999;
    const target = { x: state.player.pos.x + 300, y: state.player.pos.y };
    movePlayerAway(state, target);
    expect(state.craters).toHaveLength(0);
    state.asteroids.push(makeRock({ target, blastRadius: 50 }));
    step(state, idle, DT);
    expect(state.craters).toHaveLength(1);
    const crater = state.craters[0]!;
    expect(crater.sprite).toBe("crater_small");
    expect(crater.pos).toEqual(target);
    // It ages down and is gone once its life runs out.
    run(state, idle, ASTEROIDS.craterMs + 100);
    expect(state.craters).toHaveLength(0);
  });
});

describe("hay balls", () => {
  it("rolls in on the level's cadence, capped at maxAlive", () => {
    const state = startGame(42, "test_hayball_level");
    clearStage(state);
    expect(state.hayBalls).toHaveLength(0);
    // Fixed 800ms cadence; each bale lives long enough (despawn at 620px) that
    // the cap must engage within a few intervals.
    run(state, idle, Math.ceil((800 * (HAY_BALLS.maxAlive + 3)) / DT));
    expect(state.hayBalls.length).toBeGreaterThan(0);
    expect(state.hayBalls.length).toBeLessThanOrEqual(HAY_BALLS.maxAlive);
  });

  it("never rolls on levels without them", () => {
    const state = startGame(42, "test_asteroid_level");
    clearStage(state);
    run(state, idle, 200);
    expect(state.hayBalls).toHaveLength(0);
  });

  it("shoves the grounded hero LEFT and nicks slight hp once per bale", () => {
    const state = startGame(42, "test_hayball_level");
    clearStage(state);
    state.hayBallTimerMs = 999_999; // the hand-built bale is the only one
    const startX = state.player.pos.x;
    const hpBefore = state.player.hp;
    state.hayBalls.push(
      makeBall({ pos: { x: startX, y: state.player.pos.y } }),
    );
    step(state, idle, DT);
    // Pushed left, and nicked exactly the slight flat bite.
    expect(state.player.pos.x).toBeLessThan(startX);
    expect(state.player.hp).toBe(hpBefore - HAY_BALLS.damage);
    expect(state.events.some((e) => e.type === "hayBallHit")).toBe(true);
    // The bite latches — the same bale keeps shoving but never nicks again.
    const xAfterFirst = state.player.pos.x;
    step(state, idle, DT);
    expect(state.player.pos.x).toBeLessThan(xAfterFirst);
    expect(state.player.hp).toBe(hpBefore - HAY_BALLS.damage);
  });

  it("stops shoving once the hero steps out of the lane", () => {
    const state = startGame(42, "test_hayball_level");
    clearStage(state);
    state.hayBallTimerMs = 999_999;
    // A bale far off the hero's lane never touches him.
    state.hayBalls.push(
      makeBall({
        pos: { x: state.player.pos.x, y: state.player.pos.y + 400 },
      }),
    );
    const startX = state.player.pos.x;
    const hpBefore = state.player.hp;
    step(state, idle, DT);
    expect(state.player.pos.x).toBe(startX);
    expect(state.player.hp).toBe(hpBefore);
  });

  it("a jumping hero clears a bale untouched", () => {
    const state = startGame(42, "test_hayball_level");
    clearStage(state);
    state.hayBallTimerMs = 999_999;
    state.player.z = JUMP.dodgeHeight + 30;
    state.player.vz = 100;
    const startX = state.player.pos.x;
    const hpBefore = state.player.hp;
    state.hayBalls.push(
      makeBall({ pos: { x: startX, y: state.player.pos.y } }),
    );
    step(state, idle, DT);
    expect(state.player.pos.x).toBe(startX);
    expect(state.player.hp).toBe(hpBefore);
  });

  it("shoves minions out of its path without hurting them", () => {
    const state = startGame(42, "test_hayball_level");
    clearStage(state);
    state.hayBallTimerMs = 999_999;
    const minion = makeEnemy({
      pos: { x: state.player.pos.x + 200, y: state.player.pos.y + 3 },
    });
    state.enemies.push(minion);
    state.hayBalls.push(
      makeBall({
        pos: { x: minion.pos.x - 4, y: minion.pos.y - 3 },
        speed: 90,
      }),
    );
    step(state, idle, DT);
    expect(minion.hp).toBe(minion.maxHp);
    const ball = state.hayBalls[0]!;
    const gap = Math.hypot(
      minion.pos.x - ball.pos.x,
      minion.pos.y - ball.pos.y,
    );
    expect(gap).toBeGreaterThanOrEqual(ball.radius + 9 - 0.01);
  });

  it("despawns once it leaves the player's stage", () => {
    const state = startGame(42, "test_hayball_level");
    clearStage(state);
    state.hayBallTimerMs = 999_999;
    state.hayBalls.push(
      makeBall({
        pos: {
          x: state.player.pos.x - HAY_BALLS.despawnDistance - 10,
          y: state.player.pos.y,
        },
      }),
    );
    step(state, idle, DT);
    expect(state.hayBalls).toHaveLength(0);
  });
});
