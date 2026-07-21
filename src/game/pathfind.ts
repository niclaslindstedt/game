// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// GLOBAL PATHFINDING for the autopilot: a coarse WALKABILITY GRID built from the
// level's solid obstacles, plus A* over it, so the no-reflex runner can plan a
// real route to ANY point — a chest deep in a walled pocket, the boss, a fog
// frontier — instead of only sliding along the walls it can see 140px ahead.
//
// The grid is STATIC per level (walls and scattered rock never move), so a caller
// builds it ONCE and caches it (see bot.ts `nav.grid`). Everything here is a pure
// function of its inputs — no RNG, no wall clock — so a botted run stays exactly
// as deterministic as before: the same state yields the same route.

import { clamp } from "@game/lib/vec.ts";
import type { Vec2 } from "@game/lib/vec.ts";
import { PLAYER } from "./config.ts";
import type { GameState } from "./types.ts";

/** World px per nav cell. Coarse enough that A* over a whole level costs a
 * fraction of a millisecond, fine enough to thread the ~440px wall gaps. */
export const NAV_CELL = 40;

export type NavGrid = {
  cols: number;
  rows: number;
  cell: number;
  /** 1 = a hero-radius body can stand here, 0 = blocked by a solid obstacle. */
  walkable: Uint8Array;
};

/**
 * Build the walkability grid for a level: every cell a SOLID obstacle's footprint
 * — inflated by the player radius so a planned route keeps clear of the wall —
 * overlaps is blocked. Jumpable cover (craters) stays WALKABLE: the hero hops
 * it. BREAKABLE crates/chests block like walls: the auto-weapon only swings at
 * enemies, so a crate plugging a wall gap is unsmashable on an empty field —
 * routing through one ground the runner into a wedge → unstick → re-route
 * livelock for whole minutes (measured). A chest TARGET stays reachable
 * regardless: `findPath` snaps a blocked goal cell to the nearest open one —
 * the chest's doorstep, exactly where the hero smashes it from. Static per
 * level; build once and cache.
 */
export function buildNavGrid(state: GameState): NavGrid {
  const cell = NAV_CELL;
  const cols = Math.ceil(state.level.width / cell);
  const rows = Math.ceil(state.level.height / cell);
  const walkable = new Uint8Array(cols * rows).fill(1);
  const pad = PLAYER.radius;
  for (const o of state.obstacles) {
    if (o.jumpable) continue;
    const hx = (o.half ? o.half.x : o.radius) + pad;
    const hy = (o.half ? o.half.y : o.radius) + pad;
    const x0 = Math.max(0, Math.floor((o.pos.x - hx) / cell));
    const x1 = Math.min(cols - 1, Math.floor((o.pos.x + hx) / cell));
    const y0 = Math.max(0, Math.floor((o.pos.y - hy) / cell));
    const y1 = Math.min(rows - 1, Math.floor((o.pos.y + hy) / cell));
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++) walkable[ty * cols + tx] = 0;
  }
  return { cols, rows, cell, walkable };
}

const inBounds = (g: NavGrid, tx: number, ty: number) =>
  tx >= 0 && ty >= 0 && tx < g.cols && ty < g.rows;
const cellIndex = (g: NavGrid, tx: number, ty: number) => ty * g.cols + tx;
const cellCenter = (g: NavGrid, tx: number, ty: number): Vec2 => ({
  x: (tx + 0.5) * g.cell,
  y: (ty + 0.5) * g.cell,
});

/** The (clamped) grid cell a world point falls in. */
function cellOf(g: NavGrid, p: Vec2): { tx: number; ty: number } {
  return {
    tx: clamp(Math.floor(p.x / g.cell), 0, g.cols - 1),
    ty: clamp(Math.floor(p.y / g.cell), 0, g.rows - 1),
  };
}

/** The nearest WALKABLE cell to (tx,ty) by expanding-ring search — snaps a start
 * or goal that lands inside a wall (a chest hard against a pocket edge, or the
 * hero shoved into a rock) onto open floor so A* has somewhere to begin/end. */
function snapWalkable(
  g: NavGrid,
  tx: number,
  ty: number,
): { tx: number; ty: number } | null {
  if (inBounds(g, tx, ty) && g.walkable[cellIndex(g, tx, ty)])
    return { tx, ty };
  const maxR = Math.max(g.cols, g.rows);
  for (let r = 1; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; // ring edge
        const nx = tx + dx;
        const ny = ty + dy;
        if (inBounds(g, nx, ny) && g.walkable[cellIndex(g, nx, ny)])
          return { tx: nx, ty: ny };
      }
    }
  }
  return null;
}

const SQRT2 = Math.SQRT2;
/** 8-connected neighbours (dx, dy, step cost). */
const NEIGHBORS: readonly (readonly [number, number, number])[] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, SQRT2],
  [1, -1, SQRT2],
  [-1, 1, SQRT2],
  [-1, -1, SQRT2],
];

/** Octile distance — the exact cost of the cheapest 8-connected path across open
 * ground, so A* stays admissible (never over-estimates) and optimal. */
function heuristic(ax: number, ay: number, bx: number, by: number): number {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return dx + dy + (SQRT2 - 2) * Math.min(dx, dy);
}

/** A tiny binary min-heap of cell indices keyed by f-score — the A* frontier. */
class MinHeap {
  private nodes: number[] = [];
  private prio: number[] = [];
  get size(): number {
    return this.nodes.length;
  }
  push(node: number, priority: number): void {
    this.nodes.push(node);
    this.prio.push(priority);
    let i = this.nodes.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.prio[parent]! <= this.prio[i]!) break;
      this.swap(i, parent);
      i = parent;
    }
  }
  pop(): number {
    const top = this.nodes[0]!;
    const last = this.nodes.length - 1;
    this.swap(0, last);
    this.nodes.pop();
    this.prio.pop();
    let i = 0;
    const n = this.nodes.length;
    for (;;) {
      const l = i * 2 + 1;
      const r = l + 1;
      let smallest = i;
      if (l < n && this.prio[l]! < this.prio[smallest]!) smallest = l;
      if (r < n && this.prio[r]! < this.prio[smallest]!) smallest = r;
      if (smallest === i) break;
      this.swap(i, smallest);
      i = smallest;
    }
    return top;
  }
  private swap(a: number, b: number): void {
    [this.nodes[a], this.nodes[b]] = [this.nodes[b]!, this.nodes[a]!];
    [this.prio[a], this.prio[b]] = [this.prio[b]!, this.prio[a]!];
  }
}

/** Walk the A* came-from chain back from the goal, emitting cell-CENTRE
 * waypoints start→goal, and DROP the collinear middle of each straight run so the
 * follower gets a handful of turning points rather than one node per cell. */
function reconstruct(g: NavGrid, cameFrom: Int32Array, goal: number): Vec2[] {
  const cells: number[] = [];
  for (let c = goal; c !== -1; c = cameFrom[c]!) cells.push(c);
  cells.reverse();
  const pts: Vec2[] = [];
  for (let i = 0; i < cells.length; i++) {
    const tx = cells[i]! % g.cols;
    const ty = (cells[i]! / g.cols) | 0;
    // Keep an endpoint or a genuine turn; drop a node whose incoming and outgoing
    // step share a direction (a straight run).
    if (i > 0 && i < cells.length - 1) {
      const px = cells[i - 1]! % g.cols;
      const py = (cells[i - 1]! / g.cols) | 0;
      const nx = cells[i + 1]! % g.cols;
      const ny = (cells[i + 1]! / g.cols) | 0;
      if (
        Math.sign(tx - px) === Math.sign(nx - tx) &&
        Math.sign(ty - py) === Math.sign(ny - ty)
      )
        continue;
    }
    pts.push(cellCenter(g, tx, ty));
  }
  return pts;
}

/**
 * A* a route across the nav grid from `from` to `to`, as world-space waypoints
 * (turning points, start→goal) — or null when no route exists (the target is
 * walled off from the hero). A start/goal that lands inside a wall snaps to the
 * nearest open cell first. Deterministic: a pure function of the grid + endpoints.
 */
export function findPath(g: NavGrid, from: Vec2, to: Vec2): Vec2[] | null {
  const sc = cellOf(g, from);
  const tc = cellOf(g, to);
  const s = snapWalkable(g, sc.tx, sc.ty);
  const t = snapWalkable(g, tc.tx, tc.ty);
  if (!s || !t) return null;
  const start = cellIndex(g, s.tx, s.ty);
  const goal = cellIndex(g, t.tx, t.ty);
  if (start === goal) return [cellCenter(g, t.tx, t.ty)];

  const n = g.cols * g.rows;
  const gScore = new Float64Array(n).fill(Infinity);
  const cameFrom = new Int32Array(n).fill(-1);
  gScore[start] = 0;
  const open = new MinHeap();
  open.push(start, heuristic(s.tx, s.ty, t.tx, t.ty));

  while (open.size) {
    const cur = open.pop();
    if (cur === goal) return reconstruct(g, cameFrom, cur);
    const cx = cur % g.cols;
    const cy = (cur / g.cols) | 0;
    const base = gScore[cur]!;
    for (const [dx, dy, cost] of NEIGHBORS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inBounds(g, nx, ny)) continue;
      const ni = cellIndex(g, nx, ny);
      if (!g.walkable[ni]) continue;
      // No corner cutting: a diagonal step needs both orthogonal cells open, so a
      // planned route never clips a wall corner the hero would collide with.
      if (
        dx !== 0 &&
        dy !== 0 &&
        (!g.walkable[cellIndex(g, cx + dx, cy)] ||
          !g.walkable[cellIndex(g, cx, cy + dy)])
      )
        continue;
      const tentative = base + cost;
      if (tentative < gScore[ni]!) {
        gScore[ni] = tentative;
        cameFrom[ni] = cur;
        open.push(ni, tentative + heuristic(nx, ny, t.tx, t.ty));
      }
    }
  }
  return null; // walled off — no route
}

/** Is a world point on walkable ground in this grid? (Blocked cell or off-grid
 * → false.) Lets a follower tell whether it can string-pull straight to a node. */
export function navWalkable(g: NavGrid, p: Vec2): boolean {
  const tx = Math.floor(p.x / g.cell);
  const ty = Math.floor(p.y / g.cell);
  return inBounds(g, tx, ty) && g.walkable[cellIndex(g, tx, ty)] === 1;
}
