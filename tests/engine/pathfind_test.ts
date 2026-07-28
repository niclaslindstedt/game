// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A* over the autopilot's nav grid (src/game/pathfind.ts). The load-bearing
// invariant these fuzz tests pin: the O(1) connected-component reachability gate
// added to `findPath` must be EXACTLY equivalent to running A* — `findPath`
// returns a route iff a brute-force flood under the same step rules (8-connected,
// no corner cutting) says the goal is reachable. If the component labels ever
// drift from real A* reachability the bot would either wrongly give up on a
// reachable objective or flood the grid on an unreachable one (the fast-forward
// frame-rate collapse this gate fixes).

import { describe, expect, it } from "vitest";

import {
  buildNavGrid,
  findPath,
  findPortalPath,
  NAV_CELL,
  navDistanceField,
  navGridFromWalkable,
  routeReachable,
  type NavGrid,
} from "../../src/game/pathfind.ts";
import { PLAYER } from "../../src/game/config/index.ts";
import { blockedByObstacle } from "../../src/game/obstacles.ts";
import type { GameState } from "../../src/game/types/index.ts";
import { startGame } from "./helpers.ts";

/** A tiny deterministic LCG so the fuzz corpus is stable across runs. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** Build a NavGrid from an ASCII map (`#` blocked, anything else open). */
function grid(rows: string[]): NavGrid {
  const h = rows.length;
  const w = rows[0]!.length;
  const walkable = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      walkable[y * w + x] = rows[y]![x] === "#" ? 0 : 1;
  return navGridFromWalkable(walkable, w, h, NAV_CELL);
}

/** A random grid with `blockFrac` of cells blocked. */
function randomGrid(
  rng: () => number,
  cols: number,
  rows: number,
  blockFrac: number,
): NavGrid {
  const walkable = new Uint8Array(cols * rows);
  for (let i = 0; i < cols * rows; i++) walkable[i] = rng() < blockFrac ? 0 : 1;
  return navGridFromWalkable(walkable, cols, rows, NAV_CELL);
}

/** The world centre of a cell. */
const centre = (g: NavGrid, tx: number, ty: number) => ({
  x: (tx + 0.5) * g.cell,
  y: (ty + 0.5) * g.cell,
});

/** Brute-force reachability from `start` under A*'s exact step rules (orthogonal
 * always, diagonal only when both shared orthogonal cells are open) — the ground
 * truth `findPath`'s reject must agree with. */
function reachable(g: NavGrid, start: number): Uint8Array {
  const seen = new Uint8Array(g.cols * g.rows);
  if (!g.walkable[start]) return seen;
  const stack = [start];
  seen[start] = 1;
  const steps: [number, number][] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];
  while (stack.length) {
    const cur = stack.pop()!;
    const cx = cur % g.cols;
    const cy = (cur / g.cols) | 0;
    for (const [dx, dy] of steps) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= g.cols || ny >= g.rows) continue;
      const ni = ny * g.cols + nx;
      if (!g.walkable[ni] || seen[ni]) continue;
      if (
        dx !== 0 &&
        dy !== 0 &&
        (!g.walkable[cy * g.cols + (cx + dx)] ||
          !g.walkable[(cy + dy) * g.cols + cx])
      )
        continue;
      seen[ni] = 1;
      stack.push(ni);
    }
  }
  return seen;
}

describe("findPath reachability gate", () => {
  it("returns a route iff the goal is reachable — a walled-off pocket is null", () => {
    // A closed pocket (the 'o' cell) sealed by a ring of walls inside an open room.
    const g = grid([
      "........",
      ".######.",
      ".#....#.",
      ".#.o..#.",
      ".#....#.",
      ".######.",
      "........",
    ]);
    const outside = centre(g, 0, 0);
    const inside = centre(g, 3, 3);
    expect(findPath(g, outside, inside)).toBeNull();
    // Two open cells in the same (outer) region always route.
    expect(findPath(g, centre(g, 0, 0), centre(g, 7, 6))).not.toBeNull();
  });

  it("a diagonal gap joined only by a corner is NOT routable (no corner cutting)", () => {
    // Two open quadrants touching at a single diagonal corner: A* forbids the
    // corner cut, so they are different components and findPath must say null.
    const g = grid(["..#", "..#", "##."]);
    // (0,0) region vs the lone open cell (2,2) touching it only diagonally.
    expect(findPath(g, centre(g, 0, 0), centre(g, 2, 2))).toBeNull();
  });

  it("agrees with brute-force A* reachability across a fuzz corpus", () => {
    const rng = lcg(0xc0ffee);
    let checks = 0;
    for (let trial = 0; trial < 400; trial++) {
      const cols = 4 + Math.floor(rng() * 12);
      const rows = 4 + Math.floor(rng() * 12);
      const blockFrac = 0.15 + rng() * 0.5;
      const g = randomGrid(rng, cols, rows, blockFrac);
      // Pick a walkable start; skip a grid with none.
      let start = -1;
      for (let i = 0; i < cols * rows; i++)
        if (g.walkable[i]) {
          start = i;
          break;
        }
      if (start < 0) continue;
      const truth = reachable(g, start);
      const from = centre(g, start % cols, (start / cols) | 0);
      // Sample several goals per grid (all of a small grid, a subset of a big one).
      for (let s = 0; s < 12; s++) {
        const goal = Math.floor(rng() * cols * rows);
        if (!g.walkable[goal]) continue; // snapping would move the goal — skip
        const to = centre(g, goal % cols, (goal / cols) | 0);
        const path = findPath(g, from, to);
        expect(!!path).toBe(truth[goal] === 1);
        checks++;
      }
    }
    expect(checks).toBeGreaterThan(500);
  });

  it("caches the component labels on the grid (computed once, reused)", () => {
    const g = grid(["...", ".#.", "..."]);
    expect(g.components).toBeUndefined();
    findPath(g, centre(g, 0, 0), centre(g, 2, 2));
    expect(g.components).toBeInstanceOf(Int32Array);
    // Two open cells in the same region share a label; a blocked cell is -1.
    const label = g.components!;
    expect(label[0]).toBe(label[8]);
    expect(label[4]).toBe(-1); // the centre wall
  });
});

describe("nav grid honesty — a plan is a route a BODY can walk", () => {
  // The grid is built from a level's obstacles, and its doorway refinement
  // re-opens a blocked cell wherever the hero still FITS. Standing room is not
  // walking room: two cells either side of one stone can both hold him while
  // nothing passes between. A grid that conflates the two hands the runner a
  // route through solid rock, and he grinds on it until the wedge escape drags
  // him back — the measured TO BOSS ↔ UNSTICK livelock. These tests pin that
  // every step of every route `findPath` returns is a step the engine's own
  // swept body query agrees with.

  /** A level whose only feature is a wall of round stones spanning its FULL
   * height, with `gap` px between neighbouring stone EDGES — a picket fence
   * whose slots a body may or may not fit through. Spanning the whole height
   * matters: a fence with an end is simply walked around, and the test would
   * then measure nothing. */
  const pickets = (gap: number): GameState => {
    const state = startGame();
    state.level = { ...state.level, width: 800, height: 600 };
    const radius = 30;
    const step = radius * 2 + gap;
    const obstacles = [];
    for (let y = -radius, i = 0; y <= 600 + radius; y += step, i++)
      obstacles.push({
        id: 1000 + i,
        pos: { x: 400, y },
        radius,
        jumpable: false,
      });
    state.obstacles = obstacles as GameState["obstacles"];
    return state;
  };

  it("never returns a route a hero-radius body cannot sweep", () => {
    // A hair of a gap: cell centres between the stones are standable, but the
    // slot is far too narrow for a body. Whatever the grid decides about
    // reachability, no step of a returned route may cross stone.
    for (const gap of [4, 10, 20, 40, 80]) {
      const state = pickets(gap);
      const g = buildNavGrid(state);
      const path = findPath(g, { x: 120, y: 300 }, { x: 700, y: 300 });
      if (!path) continue;
      let prev = { x: 120, y: 300 };
      for (const node of path) {
        expect(
          blockedByObstacle(state, prev, node, PLAYER.radius),
          `gap ${gap}: (${prev.x},${prev.y})→(${node.x},${node.y}) crosses stone`,
        ).toBe(false);
        prev = node;
      }
    }
  });

  it("seals a picket fence too tight for a body, and opens one wide enough", () => {
    const tight = pickets(4);
    expect(
      findPath(buildNavGrid(tight), { x: 120, y: 300 }, { x: 700, y: 300 }),
    ).toBeNull();
    const wide = pickets(120);
    expect(
      findPath(buildNavGrid(wide), { x: 120, y: 300 }, { x: 700, y: 300 }),
    ).not.toBeNull();
  });

  it("threads a doorway the cell centres miss, by anchoring on the gap", () => {
    // One 90px gap in a solid wall, deliberately offset so it straddles a cell
    // boundary rather than sitting on a cell centre. The refinement has to move
    // the anchor onto the opening for the route to exist at all.
    const state = startGame();
    state.level = { ...state.level, width: 800, height: 600 };
    state.obstacles = [
      { id: 1, pos: { x: 400, y: 130 }, half: { x: 20, y: 130 }, radius: 130 },
      { id: 2, pos: { x: 400, y: 425 }, half: { x: 20, y: 155 }, radius: 155 },
    ] as unknown as GameState["obstacles"];
    const g = buildNavGrid(state);
    const path = findPath(g, { x: 120, y: 300 }, { x: 700, y: 300 });
    expect(path).not.toBeNull();
    let prev = { x: 120, y: 300 };
    for (const node of path!) {
      expect(blockedByObstacle(state, prev, node, PLAYER.radius)).toBe(false);
      prev = node;
    }
  });
});

describe("routing through portals (the elevator to a sealed annex)", () => {
  /** A level split in two by a solid wall, with `to` sealed off from `from`. */
  const split = (): GameState => {
    const state = startGame();
    state.level = { ...state.level, width: 800, height: 600 };
    state.obstacles = [
      { id: 1, pos: { x: 400, y: 300 }, half: { x: 20, y: 300 }, radius: 300 },
    ] as unknown as GameState["obstacles"];
    return state;
  };

  it("reaches a walled-off goal by riding a pad, and reports the pad as the leg", () => {
    const state = split();
    const g = buildNavGrid(state);
    const here = { x: 120, y: 300 };
    const there = { x: 700, y: 300 };
    expect(findPath(g, here, there)).toBeNull();
    const pad = { from: { x: 200, y: 500 }, to: { x: 700, y: 100 } };
    expect(routeReachable(g, [pad], here, there)).toBe(true);
    const route = findPortalPath(g, [pad], here, there);
    expect(route).not.toBeNull();
    // The leg to walk NOW ends on the pad, not at the goal.
    expect(route!.via).toEqual(pad.from);
    const last = route!.path.at(-1)!;
    expect(Math.hypot(last.x - pad.from.x, last.y - pad.from.y)).toBeLessThan(
      NAV_CELL,
    );
  });

  it("still says unreachable when no pad bridges the two sides", () => {
    const state = split();
    const g = buildNavGrid(state);
    const here = { x: 120, y: 300 };
    const there = { x: 700, y: 300 };
    // A pad that lands on the hero's OWN side bridges nothing.
    const useless = { from: { x: 200, y: 500 }, to: { x: 120, y: 100 } };
    expect(routeReachable(g, [useless], here, there)).toBe(false);
    expect(findPortalPath(g, [useless], here, there)).toBeNull();
  });

  it("walking distances respect the wall, unlike a straight-line guess", () => {
    const state = split();
    const g = buildNavGrid(state);
    const field = navDistanceField(g, { x: 120, y: 300 });
    const near =
      field[Math.floor(300 / NAV_CELL) * g.cols + Math.floor(200 / NAV_CELL)];
    const across =
      field[Math.floor(300 / NAV_CELL) * g.cols + Math.floor(700 / NAV_CELL)];
    expect(Number.isFinite(near!)).toBe(true);
    expect(Number.isFinite(across!)).toBe(false); // sealed off — no route at all
  });
});
