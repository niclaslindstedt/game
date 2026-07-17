// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Wall-aware aggro: a wall the player can't jump over also hides them from
// grounded monsters — both WAKING and the ongoing CHASE need line of sight, so
// ducking behind stone breaks a chase (the mob drifts home) instead of grinding
// into the wall. Ghostly (phasing) monsters sense straight through stone, and a
// wound still wakes a mob (though a wall then stalls its advance).
// Plus the pack-overlap rule that lets a kited horde bunch into one clump.

import { describe, expect, it } from "vitest";

import { ENEMY_AI, LEVELS, step } from "@game/core";
import type { GameState, Obstacle } from "@game/core";
import { clearStage, DT, idle, makeEnemy, run, startGame } from "../helpers.ts";

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

/** A wall segment (or a low rock) dropped between the player and +dx. */
function placeObstacle(
  state: GameState,
  dx: number,
  jumpable: boolean,
): Obstacle {
  const kind = jumpable ? "rock" : "boulder";
  const obstacle: Obstacle = {
    id: 8000,
    kind,
    sprite: kind,
    pos: { x: state.player.pos.x + dx, y: state.player.pos.y },
    radius: 12,
    jumpable,
  };
  state.obstacles = [obstacle];
  return obstacle;
}

/** A tough, mobile, non-phasing mob parked east of the player. */
function placeStalker(state: GameState, dx: number) {
  const mob = makeEnemy(
    {
      pos: { x: state.player.pos.x + dx, y: state.player.pos.y },
      speed: 40,
      hp: 1_000_000, // survives the auto-blaster for the whole run
      maxHp: 1_000_000,
    },
    "guard",
  );
  state.enemies.push(mob);
  return mob;
}

describe("aggro through walls", () => {
  it("a wall hides the player: the mob sleeps at its post", () => {
    const state = startGame();
    clearStage(state);
    placeObstacle(state, 50, false);
    const mob = placeStalker(state, 100);
    const post = { ...mob.pos };

    run(state, idle, 200);
    expect(mob.awake).toBeFalsy();
    expect(mob.pos).toEqual(post); // never moved
  });

  it("with a clear sightline the same mob gives chase", () => {
    const state = startGame();
    clearStage(state);
    state.obstacles = [];
    const mob = placeStalker(state, 100);

    run(state, idle, 20);
    expect(mob.awake).toBe(true);
    expect(mob.pos.x).toBeLessThan(state.player.pos.x + 100); // closing in
  });

  it("a low, jumpable rock hides nothing", () => {
    const state = startGame();
    clearStage(state);
    placeObstacle(state, 50, true);
    const mob = placeStalker(state, 100);

    run(state, idle, 20);
    expect(mob.awake).toBe(true);
  });

  it("wounding a mob wakes it even behind a wall, but the wall stalls its advance", () => {
    const state = startGame();
    clearStage(state);
    placeObstacle(state, 50, false);
    const mob = placeStalker(state, 100);
    const post = { ...mob.pos };
    mob.hp -= 1;

    run(state, idle, 30);
    expect(mob.awake).toBe(true); // a wound wakes it, wall or no wall
    // …but with no line of sight it can't chase THROUGH the wall — it holds/
    // drifts around its post rather than closing on the hidden hero.
    expect(mob.pos.x).toBeGreaterThan(post.x - 20);
  });

  it("an awake chase BREAKS when a wall cuts the sightline", () => {
    const state = startGame();
    clearStage(state);
    state.obstacles = [];
    const mob = placeStalker(state, 120);
    run(state, idle, 10); // acquires the player in the open
    expect(mob.awake).toBe(true);
    const acquired = dist(mob.pos, state.player.pos);
    expect(acquired).toBeLessThan(120); // was closing in

    // The player ducks behind stone — the sightline breaks, so the chase stops
    // closing (the mob no longer grinds toward a hero it can't see).
    placeObstacle(state, 40, false);
    const before = dist(mob.pos, state.player.pos);
    run(state, idle, 20);
    expect(dist(mob.pos, state.player.pos)).toBeGreaterThanOrEqual(before - 2);
  });

  it("escaping the aggro radius puts the mob back to sleep", () => {
    const state = startGame();
    clearStage(state);
    state.obstacles = [];
    const mob = placeStalker(state, 100);
    run(state, idle, 10);
    expect(mob.awake).toBe(true);

    // Teleport the player out of range: the latch releases and the mob
    // needs a fresh line of sight to wake again.
    state.player.pos = { x: mob.pos.x + 1200, y: mob.pos.y };
    step(state, idle, DT);
    expect(mob.awake).toBe(false);
  });

  it("a phasing ghost senses the player straight through stone", () => {
    const state = startGame();
    clearStage(state);
    placeObstacle(state, 50, false);
    const ghost = makeEnemy({
      pos: { x: state.player.pos.x + 100, y: state.player.pos.y },
      speed: 40,
      hp: 1_000_000,
      maxHp: 1_000_000,
    });
    state.enemies.push(ghost);

    run(state, idle, 20);
    expect(ghost.awake).toBe(true);
    expect(ghost.pos.x).toBeLessThan(state.player.pos.x + 100); // closing in
  });
});

describe("pack overlap", () => {
  it("separation pushes pairs apart only to the overlapped distance", () => {
    const state = startGame();
    clearStage(state);
    state.obstacles = [];
    // Two sleeping ghosts stacked nearly on top of each other, far from
    // the player so nothing else moves them.
    const spot = { x: state.player.pos.x + 1200, y: state.player.pos.y };
    const a = makeEnemy({ id: 1, pos: { ...spot } });
    const b = makeEnemy({ id: 2, pos: { x: spot.x + 4, y: spot.y } });
    state.enemies.push(a, b);

    step(state, idle, DT);
    const overlapped = ENEMY_AI.separation * (1 - ENEMY_AI.overlapFraction);
    expect(dist(a.pos, b.pos)).toBeCloseTo(overlapped, 5);
    // The point of the knob: tighter than the full separation distance.
    expect(dist(a.pos, b.pos)).toBeLessThan(ENEMY_AI.separation);
  });
});

describe("moon stone ridges", () => {
  it("the moon def raises solid boulder walls", () => {
    const walls = LEVELS.moon!.walls!;
    expect(walls.length).toBeGreaterThan(0);
    for (const wall of walls) {
      expect(wall.jumpable).toBe(false); // true walls, not hop-overs
      expect(wall.kind).toBe("boulder"); // stone, rendered with a sprite
    }
  });

  it("expands the ridges into obstacle chains at creation", () => {
    const state = startGame();
    const segments = LEVELS.moon!.walls!.length;
    const boulders = state.obstacles.filter((o) => o.kind === "boulder");
    // Every ridge segment becomes a chain of overlapping boulders, so the
    // count dwarfs the handful of authored segments.
    expect(boulders.length).toBeGreaterThan(segments * 2);
  });
});
