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
//
// THE GRID PROMISES WALKABILITY, NOT STANDABILITY — and the difference is the
// whole reason a plan can be trusted. A cell test only ever asks "does a body
// FIT here"; a route asks "can a body GET from here to there", and on a wall
// built of discrete stones the two come apart: two cells either side of a
// stone can both hold the hero while nothing can pass between them. A grid
// that answers the first question and is read as the second hands the runner a
// route through solid rock, and he grinds on it until the wedge escape drags
// him back — the measured TO BOSS ↔ UNSTICK livelock that cancelled a run at
// one spot for five minutes. So every LINK between neighbouring cells is
// verified by the engine's own swept body query ({@link NavGrid.links}), and
// each cell carries the ANCHOR the route actually passes through — its centre,
// or, for a cell re-opened by the doorway refinement, the clearest standing
// point in it, so a plan threads a gap at the gap rather than at the middle of
// the cell that happens to contain it.

import { clamp, distance, pointRectDistanceSq } from "@game/lib/vec.ts";
import type { Vec2 } from "@game/lib/vec.ts";
import { PLAYER } from "./config/index.ts";
import { blockedByObstacle } from "./obstacles.ts";
import type { GameState, Obstacle } from "./types/index.ts";

/** World px per nav cell. Coarse enough that A* over a whole level costs a
 * fraction of a millisecond, fine enough to thread the ~440px wall gaps. */
export const NAV_CELL = 40;

export type NavGrid = {
  cols: number;
  rows: number;
  cell: number;
  /** 1 = a hero-radius body can stand here, 0 = blocked by a solid obstacle. */
  walkable: Uint8Array;
  /** The world point a route passes through for each cell — its centre, or the
   * clearest standable point inside it when the doorway refinement re-opened
   * it (see {@link buildNavGrid}). Split into two arrays so the whole grid
   * stays three flat buffers rather than one object per cell. */
  anchorX: Float32Array;
  anchorY: Float32Array;
  /** Per-cell bitmask over {@link NEIGHBORS}: bit k is set when a hero-radius
   * body can actually sweep from this cell's anchor to that neighbour's. This
   * — not `walkable` — is what A* and the component labelling step through, so
   * a plan is a route a body can walk rather than a chain of places it could
   * stand. */
  links: Uint8Array;
  /**
   * CONNECTED-COMPONENT label per cell (a blocked cell is -1), filled lazily the
   * first time A* runs over this grid ({@link ensureComponents}). Two walkable
   * cells share a label iff A* can actually route between them (the same
   * {@link NavGrid.links} steps) — so `findPath` can reject an unreachable goal
   * in O(1) (different labels) instead of flooding the whole grid before
   * returning null. Static per level: the grid never changes after it's built +
   * cached, so the labels are computed once.
   */
  components?: Int32Array;
};

/** How finely a re-opened cell is searched for its standing point: an N×N
 * sample grid inset inside the cell. 5 puts a sample every 10px across a 40px
 * cell — fine enough to find the middle of a doorway that the cell centre
 * misses, coarse enough that the whole pass stays a handful of distance tests
 * per wall-fringe cell. */
const REFINE_SAMPLES = 5;

/** Bucketed lookup of the level's SOLID obstacles for the grid build. The
 * refinement pass asks "what is near this cell" for every cell along every
 * wall, and the old answer was the whole obstacle list — O(fringe cells ×
 * obstacles), which on a generated map is thousands × thousands. Each solid is
 * filed under every nav cell its footprint (inflated by the body radius plus a
 * whole cell, so one lookup covers every sample inside the cell) overlaps, so
 * a cell's query is a single array read. */
function solidBuckets(
  solids: Obstacle[],
  cols: number,
  rows: number,
  cell: number,
  pad: number,
): (Obstacle[] | undefined)[] {
  const buckets: (Obstacle[] | undefined)[] = new Array(cols * rows);
  const reach = pad + cell;
  for (const o of solids) {
    const hx = (o.half ? o.half.x : o.radius) + reach;
    const hy = (o.half ? o.half.y : o.radius) + reach;
    const x0 = Math.max(0, Math.floor((o.pos.x - hx) / cell));
    const x1 = Math.min(cols - 1, Math.floor((o.pos.x + hx) / cell));
    const y0 = Math.max(0, Math.floor((o.pos.y - hy) / cell));
    const y1 = Math.min(rows - 1, Math.floor((o.pos.y + hy) / cell));
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const i = ty * cols + tx;
        const bucket = buckets[i];
        if (bucket) bucket.push(o);
        else buckets[i] = [o];
      }
    }
  }
  return buckets;
}

/** How far `p` sits from the nearest of `near` — the CLEARANCE a body standing
 * there has. Negative-ish values are clamped by the caller's `>= pad` test, so
 * a point inside a solid simply loses. */
function clearanceAt(p: Vec2, near: Obstacle[] | undefined): number {
  if (!near) return Infinity;
  let best = Infinity;
  for (const o of near) {
    const d = o.half
      ? Math.sqrt(pointRectDistanceSq(p, o.pos, o.half))
      : distance(p, o.pos) - o.radius;
    if (d < best) best = d;
  }
  return best;
}

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
 *
 * The blocking is then REFINED: any-overlap blocking over 40px cells cannot
 * represent a doorway narrower than about two cells — the wall ends flanking a
 * 60px gap each bleed into the gap's cells and seal a pocket a body walks
 * through easily (measured: goodco_hq's break/stock rooms read UNREACHABLE, so
 * the sweep never cracked their chests). A blocked cell the hero's body still
 * FITS somewhere inside is re-opened, and the point it fits at becomes the
 * cell's {@link NavGrid.anchorX} — the route passes through the gap rather
 * than through the middle of the cell that contains it, which is what lets a
 * plan thread a doorway whose opening sits off-centre.
 *
 * Finally every LINK is verified. Two cells the wall REFINEMENT re-opened can
 * each hold the hero while nothing passes between them (the two sides of one
 * stone), so an edge touching a re-opened cell is only kept when the engine's
 * own swept body query says a hero can walk it. An edge between two cells that
 * no inflated footprint touches at all needs no query: everything within a body
 * radius of either cell is provably clear, and the sweep between their centres
 * never leaves that region — which is why the check costs the wall fringe
 * rather than the whole map.
 */
export function buildNavGrid(state: GameState): NavGrid {
  const cell = NAV_CELL;
  const cols = Math.ceil(state.level.width / cell);
  const rows = Math.ceil(state.level.height / cell);
  const n = cols * rows;
  const walkable = new Uint8Array(n).fill(1);
  const anchorX = new Float32Array(n);
  const anchorY = new Float32Array(n);
  for (let ty = 0; ty < rows; ty++) {
    for (let tx = 0; tx < cols; tx++) {
      anchorX[ty * cols + tx] = (tx + 0.5) * cell;
      anchorY[ty * cols + tx] = (ty + 0.5) * cell;
    }
  }
  const pad = PLAYER.radius;
  const solids = state.obstacles.filter((o) => !o.jumpable);
  for (const o of solids) {
    const hx = (o.half ? o.half.x : o.radius) + pad;
    const hy = (o.half ? o.half.y : o.radius) + pad;
    const x0 = Math.max(0, Math.floor((o.pos.x - hx) / cell));
    const x1 = Math.min(cols - 1, Math.floor((o.pos.x + hx) / cell));
    const y0 = Math.max(0, Math.floor((o.pos.y - hy) / cell));
    const y1 = Math.min(rows - 1, Math.floor((o.pos.y + hy) / cell));
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++) walkable[ty * cols + tx] = 0;
  }
  // The doorway refinement (see the doc block): re-open a blocked cell wherever
  // a hero-radius body genuinely fits inside it, and remember WHERE it fits.
  // `fringe` marks those cells — they are exactly the ones whose links can lie.
  const fringe = new Uint8Array(n);
  const buckets = solidBuckets(solids, cols, rows, cell, pad);
  const probe = { x: 0, y: 0 };
  const step = cell / (REFINE_SAMPLES + 1);
  for (let ty = 0; ty < rows; ty++) {
    for (let tx = 0; tx < cols; tx++) {
      const i = ty * cols + tx;
      if (walkable[i]) continue;
      fringe[i] = 1;
      const near = buckets[i];
      let bestClear = -Infinity;
      let bestX = 0;
      let bestY = 0;
      for (let sy = 1; sy <= REFINE_SAMPLES; sy++) {
        probe.y = ty * cell + sy * step;
        for (let sx = 1; sx <= REFINE_SAMPLES; sx++) {
          probe.x = tx * cell + sx * step;
          const clear = clearanceAt(probe, near);
          if (clear > bestClear) {
            bestClear = clear;
            bestX = probe.x;
            bestY = probe.y;
          }
        }
      }
      if (bestClear >= pad) {
        walkable[i] = 1;
        anchorX[i] = bestX;
        anchorY[i] = bestY;
      }
    }
  }
  // …AND A DOORWAY IS ANCHORED ON THE DOORWAY, because the map already knows
  // where its holes are and the sampler above does not.
  //
  // The refinement asks "where in this cell does a body fit BEST", which for a
  // cell straddling a wall is a point out in the open floor beside it rather
  // than the gap through it — and the route then has to sweep from THERE to the
  // next cell's anchor, on a line that never passes through the opening. On a
  // wide doorway that costs nothing (the sweep clears the hole wherever it
  // crosses); on a person-width one it is the difference between a building
  // with rooms in it and a building the autopilot cannot plan a step inside.
  // Measured on GOODCO with its doorways cut to 32 px: the boss, all four
  // caches and both story items came back UNREACHABLE, on a floor a player
  // walks through without noticing.
  //
  // A SHUT DOOR STILL SEALS ITSELF. The pin is applied only where a body
  // genuinely fits, and a closed door's own chain is in this obstacle field —
  // so a shut doorway fails the clearance and keeps whatever the sampler said,
  // which is what makes this a better ANSWER to the same question rather than a
  // second, more optimistic one.
  for (const door of state.doors) {
    const tx = Math.floor(door.center.x / cell);
    const ty = Math.floor(door.center.y / cell);
    if (tx < 0 || ty < 0 || tx >= cols || ty >= rows) continue;
    const i = ty * cols + tx;
    if (clearanceAt(door.center, buckets[i] ?? solids) < pad) continue;
    walkable[i] = 1;
    fringe[i] = 1;
    anchorX[i] = door.center.x;
    anchorY[i] = door.center.y;
  }
  // A cell NEXT TO the fringe keeps its centre anchor but its link to a fringe
  // neighbour still has to be swept, so mark the whole neighbourhood as needing
  // the honest check.
  const links = new Uint8Array(n);
  const a = { x: 0, y: 0 };
  const b = { x: 0, y: 0 };
  for (let ty = 0; ty < rows; ty++) {
    for (let tx = 0; tx < cols; tx++) {
      const i = ty * cols + tx;
      if (!walkable[i]) continue;
      for (let k = 0; k < NEIGHBORS.length; k++) {
        const [dx, dy] = NEIGHBORS[k] as readonly [number, number, number];
        const nx = tx + dx;
        const ny = ty + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const j = ny * cols + nx;
        if (!walkable[j]) continue;
        // No corner cutting: a diagonal step needs both orthogonal cells open,
        // so a planned route never clips a wall corner the hero would collide
        // with.
        const side1 = ty * cols + nx;
        const side2 = ny * cols + tx;
        const diagonal = dx !== 0 && dy !== 0;
        if (diagonal && (!walkable[side1] || !walkable[side2])) continue;
        const touchesFringe = diagonal
          ? fringe[i] || fringe[j] || fringe[side1] || fringe[side2]
          : fringe[i] || fringe[j];
        if (touchesFringe) {
          a.x = anchorX[i] as number;
          a.y = anchorY[i] as number;
          b.x = anchorX[j] as number;
          b.y = anchorY[j] as number;
          if (blockedByObstacle(state, a, b, pad)) continue;
        }
        links[i] = (links[i] as number) | (1 << k);
      }
    }
  }
  return { cols, rows, cell, walkable, anchorX, anchorY, links };
}

/**
 * Label the grid's connected components (see {@link NavGrid.components}), once
 * per grid, walking the EXACT {@link NavGrid.links} A* steps through — which
 * are symmetric by construction (the sweep from A to B is the sweep from B to
 * A), so "same label" is precisely "A* can route between them". `findPath` can
 * then reject a different-label goal in O(1) (provably unreachable) AND a
 * same-label goal is guaranteed routable, so A* never floods the grid to a null
 * again. Iterative flood fill (an explicit stack) so a big open level can't blow
 * the call stack.
 */
function ensureComponents(g: NavGrid): Int32Array {
  if (g.components) return g.components;
  const n = g.cols * g.rows;
  const label = new Int32Array(n).fill(-1);
  const stack: number[] = [];
  let next = 0;
  for (let seed = 0; seed < n; seed++) {
    if (!g.walkable[seed] || label[seed] !== -1) continue;
    const id = next++;
    label[seed] = id;
    stack.push(seed);
    while (stack.length) {
      const cur = stack.pop()!;
      const cx = cur % g.cols;
      const cy = (cur / g.cols) | 0;
      const mask = g.links[cur] as number;
      for (let k = 0; k < NEIGHBORS.length; k++) {
        if ((mask & (1 << k)) === 0) continue;
        const [dx, dy] = NEIGHBORS[k] as readonly [number, number, number];
        const ni = (cy + dy) * g.cols + (cx + dx);
        if (label[ni] !== -1) continue;
        label[ni] = id;
        stack.push(ni);
      }
    }
  }
  g.components = label;
  return label;
}

const inBounds = (g: NavGrid, tx: number, ty: number) =>
  tx >= 0 && ty >= 0 && tx < g.cols && ty < g.rows;
const cellIndex = (g: NavGrid, tx: number, ty: number) => ty * g.cols + tx;
/** The world point a route passes through for this cell — its centre, or the
 * standing point the doorway refinement found (see {@link NavGrid.anchorX}). */
const cellAnchor = (g: NavGrid, tx: number, ty: number): Vec2 => {
  const i = ty * g.cols + tx;
  return { x: g.anchorX[i] as number, y: g.anchorY[i] as number };
};

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

/**
 * A NavGrid over a walkability mask alone — cell centres for anchors and links
 * derived from geometry (8-connected, no corner cutting). The grid a caller
 * builds when there are no obstacles to sweep against: the synthetic fixtures
 * the A* fuzz tests run on, and anything that wants the search over a mask it
 * already has. {@link buildNavGrid} is the level-shaped constructor and does
 * the extra work a real map needs.
 */
export function navGridFromWalkable(
  walkable: Uint8Array,
  cols: number,
  rows: number,
  cell = NAV_CELL,
): NavGrid {
  const n = cols * rows;
  const anchorX = new Float32Array(n);
  const anchorY = new Float32Array(n);
  const links = new Uint8Array(n);
  for (let ty = 0; ty < rows; ty++) {
    for (let tx = 0; tx < cols; tx++) {
      const i = ty * cols + tx;
      anchorX[i] = (tx + 0.5) * cell;
      anchorY[i] = (ty + 0.5) * cell;
      if (!walkable[i]) continue;
      for (let k = 0; k < NEIGHBORS.length; k++) {
        const [dx, dy] = NEIGHBORS[k] as readonly [number, number, number];
        const nx = tx + dx;
        const ny = ty + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        if (!walkable[ny * cols + nx]) continue;
        if (
          dx !== 0 &&
          dy !== 0 &&
          (!walkable[ty * cols + nx] || !walkable[ny * cols + tx])
        )
          continue;
        links[i] = (links[i] as number) | (1 << k);
      }
    }
  }
  return { cols, rows, cell, walkable, anchorX, anchorY, links };
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

/** Walk the A* came-from chain back from the goal, emitting per-cell ANCHOR
 * waypoints start→goal, and DROP the collinear middle of each straight run so the
 * follower gets a handful of turning points rather than one node per cell.
 *
 * Collinear in CELLS only means collinear in WORLD while every node on the run
 * still sits at its cell centre. A node whose anchor the doorway refinement
 * moved is the point the route threads a gap at, so it is always kept — and so
 * are its two neighbours, because the straight line drawn between a moved
 * anchor and the next kept node no longer passes through the centres in
 * between, which is exactly a line through the wall the gap is in. */
function reconstruct(g: NavGrid, cameFrom: Int32Array, goal: number): Vec2[] {
  const cells: number[] = [];
  for (let c = goal; c !== -1; c = cameFrom[c]!) cells.push(c);
  cells.reverse();
  const pts: Vec2[] = [];
  for (let i = 0; i < cells.length; i++) {
    const idx = cells[i]!;
    const tx = idx % g.cols;
    const ty = (idx / g.cols) | 0;
    // Keep an endpoint, a moved anchor (or a neighbour of one), or a genuine
    // turn; drop a node whose incoming and outgoing step share a direction (a
    // straight run of centred anchors).
    if (
      i > 0 &&
      i < cells.length - 1 &&
      !movedAnchor(g, idx) &&
      !movedAnchor(g, cells[i - 1]!) &&
      !movedAnchor(g, cells[i + 1]!)
    ) {
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
    pts.push(cellAnchor(g, tx, ty));
  }
  return pts;
}

/** Did the doorway refinement move this cell's anchor off its centre? */
function movedAnchor(g: NavGrid, i: number): boolean {
  const tx = i % g.cols;
  const ty = (i / g.cols) | 0;
  return (
    g.anchorX[i] !== (tx + 0.5) * g.cell || g.anchorY[i] !== (ty + 0.5) * g.cell
  );
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
  if (start === goal) return [cellAnchor(g, t.tx, t.ty)];

  // O(1) reachability gate: a goal in a different walkable component than the
  // start is walled off, so skip the search entirely. Without this an
  // unreachable goal (an elite sealed behind a gate, a chest in a closed pocket)
  // floods the ENTIRE grid before returning null — and the autopilot re-asks
  // every tick, which at fast-forward crushed the frame rate to a crawl.
  const comp = ensureComponents(g);
  if (comp[start] !== comp[goal]) return null;

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
    // The link mask already encodes walkability, the no-corner-cutting rule and
    // the swept-body check on every wall-fringe edge (see `buildNavGrid`), so a
    // set bit IS a step a body can take.
    const mask = g.links[cur] as number;
    for (let k = 0; k < NEIGHBORS.length; k++) {
      if ((mask & (1 << k)) === 0) continue;
      const [dx, dy, cost] = NEIGHBORS[k] as readonly [number, number, number];
      const nx = cx + dx;
      const ny = cy + dy;
      const ni = cellIndex(g, nx, ny);
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

// === ROUTING THROUGH PORTALS ===
// An ELEVATOR (elevator.ts) links two points no wall connects — that is the
// whole point of it: the mission's last room hangs off the floor plan so the
// minimap cannot sketch it before the hero has stood in it. To the grid those
// two places are simply different components, so plain A* answers "unreachable"
// for the boss at the bottom of the shaft, and a runner that takes that answer
// at face value either gives up on the objective or marches at the wall the
// annex is behind. The route it needs is the one a player takes: walk to the
// pad, ride, walk on — so the search runs over the small graph of {here, every
// pad, there} with the pads' own hops costing nothing.

/** A one-way link between two points a body crosses instantly — an elevator
 * pad and where its car lets out. */
export type NavPortal = { from: Vec2; to: Vec2 };

/** A route that may ride portals: the waypoints to walk RIGHT NOW, the pad that
 * leg ends on (null when the leg runs to the goal itself), and the whole
 * journey's walking length — the cost to rank one destination against another
 * by how far away it really is. */
export type PortalRoute = { path: Vec2[]; via: Vec2 | null; length: number };

/** Total walking length of a waypoint chain from `from` — the cost used to
 * rank one destination against another by how far it really is. */
export function pathLength(from: Vec2, path: Vec2[]): number {
  let len = 0;
  let prev = from;
  for (const p of path) {
    len += distance(prev, p);
    prev = p;
  }
  return len;
}

/** The grid component a world point resolves to (via the same snap `findPath`
 * uses), or -1 when the grid has no walkable cell at all. */
function componentAt(g: NavGrid, p: Vec2): number {
  const c = cellOf(g, p);
  const s = snapWalkable(g, c.tx, c.ty);
  if (!s) return -1;
  return ensureComponents(g)[cellIndex(g, s.tx, s.ty)] as number;
}

/**
 * THE NEAREST POINT TO `at` THAT A BODY STANDING AT `from` CAN WALK TO — `at`
 * itself when it already qualifies, the anchor of the closest cell in `from`'s
 * own component otherwise, and null when `from` is not on walkable ground.
 *
 * `findPath` answers "can I get there", and it snaps an unreachable goal onto
 * the closest open cell only to then refuse it. This answers the other
 * question — "where is the nearest place I CAN get to" — which is what a spot a
 * carve may have put somewhere no route reaches needs before it is used as a
 * destination at all. A GENERATED map is where that bites: an authored
 * coordinate can land in a sealed pocket, in the annex the lift rides to, or
 * out on the dead rock past the carve, and every one of those is a goal nobody
 * can be walked to.
 *
 * At CELL resolution — the answer is clear ground for a hero-sized body, not
 * for anything wider — so a caller that also needs the spot clear of small
 * furniture nudges it first (see `quests/placement.ts`).
 *
 * The ring search is Chebyshev, so it can return a cell up to one ring further
 * out than the true euclidean nearest; on a 40px grid that is not a difference
 * anything downstream can measure. Deterministic, like everything else here.
 */
export function nearestReachable(
  g: NavGrid,
  from: Vec2,
  at: Vec2,
): Vec2 | null {
  const side = componentAt(g, from);
  if (side < 0) return null;
  const comp = ensureComponents(g);
  const c = cellOf(g, at);
  const home = cellIndex(g, c.tx, c.ty);
  if (g.walkable[home] && comp[home] === side) return { ...at };
  const maxR = Math.max(g.cols, g.rows);
  for (let r = 1; r <= maxR; r++) {
    let best: Vec2 | null = null;
    let bestSq = Infinity;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; // ring edge
        const tx = c.tx + dx;
        const ty = c.ty + dy;
        if (!inBounds(g, tx, ty)) continue;
        const i = cellIndex(g, tx, ty);
        if (!g.walkable[i] || comp[i] !== side) continue;
        const spot = cellAnchor(g, tx, ty);
        const sq = (spot.x - at.x) ** 2 + (spot.y - at.y) ** 2;
        if (sq < bestSq) {
          bestSq = sq;
          best = spot;
        }
      }
    }
    if (best) return best;
  }
  return null;
}

/**
 * Can `to` be reached from `from` at all, on foot or by riding the given
 * portals? Answered from the component labels alone — no search — so a plan can
 * ask "is the objective even reachable yet" every tick without paying for a
 * route it is not going to follow.
 */
export function routeReachable(
  g: NavGrid,
  portals: readonly NavPortal[],
  from: Vec2,
  to: Vec2,
): boolean {
  const goal = componentAt(g, to);
  if (goal < 0) return false;
  let side = componentAt(g, from);
  if (side < 0) return false;
  if (side === goal) return true;
  // Ride whatever the reached side connects to, until nothing new opens up.
  const reached = new Set<number>([side]);
  for (let pass = 0; pass < portals.length; pass++) {
    let grew = false;
    for (const portal of portals) {
      if (!reached.has(componentAt(g, portal.from))) continue;
      side = componentAt(g, portal.to);
      if (side < 0 || reached.has(side)) continue;
      if (side === goal) return true;
      reached.add(side);
      grew = true;
    }
    if (!grew) break;
  }
  return false;
}

/**
 * A* from `from` to `to`, RIDING PORTALS when walking alone cannot get there.
 * Returns the leg to walk now — straight to the goal when it is simply
 * reachable, otherwise to the first pad of the cheapest chain that ends in the
 * goal's component — or null when even the portals do not connect the two.
 *
 * Dijkstra over the portal graph rather than a grid search per candidate: the
 * node set is the hero, each pad and the goal (a handful of points, since a
 * mission has one shaft), and the only grid searches are between them.
 * Deterministic — a pure function of the grid, the portal list and the
 * endpoints.
 */
export function findPortalPath(
  g: NavGrid,
  portals: readonly NavPortal[],
  from: Vec2,
  to: Vec2,
): PortalRoute | null {
  const direct = findPath(g, from, to);
  if (direct)
    return { path: direct, via: null, length: pathLength(from, direct) };
  if (portals.length === 0) return null;
  const goalComp = componentAt(g, to);
  if (goalComp < 0) return null;
  // Cheapest walk from the hero's side to each pad, then from each pad's exit
  // onward — relaxed until no ride gets cheaper. A mission carries one shaft,
  // so this settles in a pass or two; the loop bound keeps a pathological
  // blueprint honest.
  const best = new Float64Array(portals.length).fill(Infinity);
  const firstLeg: (PortalRoute | null)[] = new Array(portals.length).fill(null);
  for (let i = 0; i < portals.length; i++) {
    const pad = portals[i]!.from;
    const walk = findPath(g, from, pad);
    if (!walk) continue;
    best[i] = pathLength(from, walk);
    firstLeg[i] = { path: walk, via: pad, length: 0 };
  }
  for (let pass = 0; pass < portals.length; pass++) {
    let changed = false;
    for (let i = 0; i < portals.length; i++) {
      if (!Number.isFinite(best[i] as number)) continue;
      for (let j = 0; j < portals.length; j++) {
        if (i === j) continue;
        const hop = findPath(g, portals[i]!.to, portals[j]!.from);
        if (!hop) continue;
        const cost = (best[i] as number) + pathLength(portals[i]!.to, hop);
        if (cost < (best[j] as number) - 1e-6) {
          best[j] = cost;
          firstLeg[j] = firstLeg[i] ?? null;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  let winner: PortalRoute | null = null;
  let winnerCost = Infinity;
  for (let i = 0; i < portals.length; i++) {
    const leg = firstLeg[i];
    if (!leg || !Number.isFinite(best[i] as number)) continue;
    const tail = findPath(g, portals[i]!.to, to);
    if (!tail) continue;
    const cost = (best[i] as number) + pathLength(portals[i]!.to, tail);
    if (cost < winnerCost) {
      winnerCost = cost;
      winner = leg;
    }
  }
  if (!winner) return null;
  return { path: winner.path, via: winner.via, length: winnerCost };
}

/**
 * CLOSE cells on a built grid — the hook for a caller that knows about hazards
 * the geometry does not (the autopilot stamps out every gravity well's no-go
 * disc, so a route curves around the holes instead of threading them).
 *
 * Blocking must go through here rather than writing `walkable` directly:
 * {@link NavGrid.links} is what A* and the component labelling actually step
 * through, so a cell struck off the walkability mask alone stays fully linked
 * and every route still runs straight through it. Removing links is always
 * safe — it can only ever make the grid more conservative — so this needs no
 * geometry and no re-verification: clear the closed cells' own links, clear
 * every link that pointed INTO one, and clear the diagonals whose corner the
 * closure just took away.
 */
export function closeNavCells(
  g: NavGrid,
  closed: (tx: number, ty: number) => boolean,
): void {
  const hit: number[] = [];
  for (let ty = 0; ty < g.rows; ty++) {
    for (let tx = 0; tx < g.cols; tx++) {
      const i = ty * g.cols + tx;
      if (!g.walkable[i] || !closed(tx, ty)) continue;
      g.walkable[i] = 0;
      g.links[i] = 0;
      hit.push(i);
    }
  }
  if (hit.length === 0) return;
  // Anything that could still step into (or corner past) a closed cell loses
  // that bit. Only the closed cells' neighbourhoods can be affected.
  for (const i of hit) {
    const cx = i % g.cols;
    const cy = (i / g.cols) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= g.cols || ny >= g.rows) continue;
        const j = ny * g.cols + nx;
        if (!g.walkable[j]) continue;
        let mask = g.links[j] as number;
        for (let k = 0; k < NEIGHBORS.length; k++) {
          if ((mask & (1 << k)) === 0) continue;
          const [sx, sy] = NEIGHBORS[k] as readonly [number, number, number];
          const tx2 = nx + sx;
          const ty2 = ny + sy;
          const target = ty2 * g.cols + tx2;
          const diagonal = sx !== 0 && sy !== 0;
          const blocked =
            !g.walkable[target] ||
            (diagonal &&
              (!g.walkable[ny * g.cols + tx2] ||
                !g.walkable[ty2 * g.cols + nx]));
          if (blocked) mask &= ~(1 << k);
        }
        g.links[j] = mask;
      }
    }
  }
  g.components = undefined; // the labels described the old grid
}

/**
 * WALKING DISTANCE from `from` to every cell within `maxDist` world px — a
 * Dijkstra flood over the same links A* steps through, so a cell's number is
 * the length of the route a body would actually walk to it (Infinity for cells
 * no route reaches, and for everything past the cap).
 *
 * The answer to "which of these many places is nearest" when the places are
 * counted in hundreds — the fog frontier, a scatter of drops — where asking A*
 * per candidate is a search per candidate and asking euclidean distance is a
 * lie the moment a wall stands between. One flood answers them all.
 */
export function navDistanceField(
  g: NavGrid,
  from: Vec2,
  maxDist = Infinity,
): Float64Array {
  const n = g.cols * g.rows;
  const dist = new Float64Array(n).fill(Infinity);
  const c = cellOf(g, from);
  const s = snapWalkable(g, c.tx, c.ty);
  if (!s) return dist;
  const start = cellIndex(g, s.tx, s.ty);
  dist[start] = 0;
  const open = new MinHeap();
  open.push(start, 0);
  while (open.size) {
    const cur = open.pop();
    const base = dist[cur] as number;
    if (base > maxDist) continue;
    const cx = cur % g.cols;
    const cy = (cur / g.cols) | 0;
    const mask = g.links[cur] as number;
    for (let k = 0; k < NEIGHBORS.length; k++) {
      if ((mask & (1 << k)) === 0) continue;
      const [dx, dy, cost] = NEIGHBORS[k] as readonly [number, number, number];
      const ni = (cy + dy) * g.cols + (cx + dx);
      const next = base + cost * g.cell;
      if (next < (dist[ni] as number) && next <= maxDist) {
        dist[ni] = next;
        open.push(ni, next);
      }
    }
  }
  return dist;
}

/** Is a world point on walkable ground in this grid? (Blocked cell or off-grid
 * → false.) Lets a follower tell whether it can string-pull straight to a node. */
export function navWalkable(g: NavGrid, p: Vec2): boolean {
  const tx = Math.floor(p.x / g.cell);
  const ty = Math.floor(p.y / g.cell);
  return inBounds(g, tx, ty) && g.walkable[cellIndex(g, tx, ty)] === 1;
}
