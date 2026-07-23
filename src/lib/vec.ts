// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Minimal 2D vector math. Generic engine code (usable by any game) — lives in
// src/lib/ so it can be extracted into oss-framework once mature.

export type Vec2 = {
  x: number;
  y: number;
};

export function vec(x: number, y: number): Vec2 {
  return { x, y };
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function distanceSq(a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return dx * dx + dy * dy;
}

/** Unit vector from `from` toward `to`; zero vector when they coincide. */
export function direction(from: Vec2, to: Vec2): Vec2 {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return { x: 0, y: 0 };
  return { x: dx / len, y: dy / len };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Unit vector of the delta `(dx, dy)` plus its true length. Zero-safe: a zero
 * delta yields `{ x: 0, y: 0, len: 0 }`, so `x`/`y` are always finite.
 */
export function normalize(
  dx: number,
  dy: number,
): { x: number; y: number; len: number } {
  const len = Math.hypot(dx, dy);
  const d = len || 1;
  return { x: dx / d, y: dy / d, len };
}

/** Squared distance from point `p` to the segment `a`→`b`. */
export function segmentDistanceSq(a: Vec2, b: Vec2, p: Vec2): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  const t =
    lenSq === 0
      ? 0
      : clamp(((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq, 0, 1);
  const dx = p.x - (a.x + abx * t);
  const dy = p.y - (a.y + aby * t);
  return dx * dx + dy * dy;
}

/** Move `pos` up to `maxStep` toward `target`, never overshooting. */
export function moveToward(pos: Vec2, target: Vec2, maxStep: number): Vec2 {
  const dist = distance(pos, target);
  if (dist <= maxStep || dist === 0) return { x: target.x, y: target.y };
  const dir = direction(pos, target);
  return { x: pos.x + dir.x * maxStep, y: pos.y + dir.y * maxStep };
}

/** The point on the axis-aligned box (center `c`, half-extents `half`)
 * closest to `p` — `p` itself when it lies inside the box. */
export function closestPointOnRect(p: Vec2, c: Vec2, half: Vec2): Vec2 {
  return {
    x: clamp(p.x, c.x - half.x, c.x + half.x),
    y: clamp(p.y, c.y - half.y, c.y + half.y),
  };
}

/** Squared distance from point `p` to the axis-aligned box (center `c`,
 * half-extents `half`); 0 when `p` is inside it. */
export function pointRectDistanceSq(p: Vec2, c: Vec2, half: Vec2): number {
  const q = closestPointOnRect(p, c, half);
  const dx = p.x - q.x;
  const dy = p.y - q.y;
  return dx * dx + dy * dy;
}

/**
 * How far a ray from `origin` along `angle` (radians) travels before EXITING
 * the axis-aligned box (center `c`, half-extents `half`) — e.g. the distance
 * from a point on screen to the screen's edge in that direction. 0 when the
 * origin lies outside the box.
 */
export function rayRectExitDistance(
  origin: Vec2,
  angle: number,
  c: Vec2,
  half: Vec2,
): number {
  if (Math.abs(origin.x - c.x) > half.x || Math.abs(origin.y - c.y) > half.y) {
    return 0;
  }
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  // Per axis, the positive distance to whichever slab face the ray heads
  // toward; a near-zero component never limits (Infinity).
  const tx =
    dx > 1e-9
      ? (c.x + half.x - origin.x) / dx
      : dx < -1e-9
        ? (c.x - half.x - origin.x) / dx
        : Infinity;
  const ty =
    dy > 1e-9
      ? (c.y + half.y - origin.y) / dy
      : dy < -1e-9
        ? (c.y - half.y - origin.y) / dy
        : Infinity;
  return Math.min(tx, ty);
}

/**
 * Does the segment `a`→`b` intersect the axis-aligned box (center `c`,
 * half-extents `half`)? Liang–Barsky slab clipping; a segment that starts
 * inside the box counts as intersecting.
 */
export function segmentIntersectsRect(
  a: Vec2,
  b: Vec2,
  c: Vec2,
  half: Vec2,
): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  // Each slab clips the parametric range [t0, t1]; a fully-rejected slab
  // means the segment misses the box entirely.
  const edges: [number, number][] = [
    [-dx, a.x - (c.x - half.x)],
    [dx, c.x + half.x - a.x],
    [-dy, a.y - (c.y - half.y)],
    [dy, c.y + half.y - a.y],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false; // parallel to this slab and outside it
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
  }
  return true;
}
