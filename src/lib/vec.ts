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
