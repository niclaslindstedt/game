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

import { findPath, NAV_CELL, type NavGrid } from "../../src/game/pathfind.ts";

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
  return { cols: w, rows: h, cell: NAV_CELL, walkable };
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
  return { cols, rows, cell: NAV_CELL, walkable };
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
