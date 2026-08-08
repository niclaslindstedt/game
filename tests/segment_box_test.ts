// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The segment-vs-box test (engine/lib/vec.ts) that every obstacle line-of-sight
// query runs on. It was unrolled onto scalars for speed — the loop it replaced
// built five arrays per call, and the simulator runs it millions of times per
// campaign — so these pin the unrolled form to a straightforward REFERENCE
// implementation of the same Liang–Barsky clip, plus the degenerate cases the
// unrolling is most likely to get wrong: zero-length segments, perfectly
// axis-aligned ones, zero-extent boxes, and grazes exactly on a face.

import { describe, expect, it } from "vitest";

import { segmentIntersectsBox, segmentIntersectsRect } from "@game/lib/vec.ts";

/** The straightforward slab clip, written for clarity rather than speed. */
function reference(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  hx: number,
  hy: number,
): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  let t0 = 0;
  let t1 = 1;
  const edges: [number, number][] = [
    [-dx, ax - (cx - hx)],
    [dx, cx + hx - ax],
    [-dy, ay - (cy - hy)],
    [dy, cy + hy - ay],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false;
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

describe("segmentIntersectsBox", () => {
  it("matches the reference clip across a deterministic sweep", () => {
    // A quarter-pixel lattice, so exact ties (a segment landing precisely on a
    // face, an endpoint exactly at a corner) come up constantly rather than
    // never — those are where an unrolled clip drifts from a looped one.
    let seed = 987654321;
    const rnd = () =>
      (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const coord = () => Math.round((rnd() * 200 - 100) * 4) / 4;
    // A quarter of the coordinates snap to 0, which manufactures axis-aligned
    // and zero-length segments (the `p === 0` branches) in bulk.
    const axis = () => (rnd() < 0.25 ? 0 : coord());

    let intersecting = 0;
    const cases = 200_000;
    for (let i = 0; i < cases; i++) {
      const ax = axis();
      const ay = axis();
      const bx = rnd() < 0.15 ? ax : axis();
      const by = rnd() < 0.15 ? ay : axis();
      const cx = coord();
      const cy = coord();
      const hx = Math.abs(coord()) % 40;
      const hy = Math.abs(coord()) % 40;
      const want = reference(ax, ay, bx, by, cx, cy, hx, hy);
      if (want) intersecting++;
      expect(
        segmentIntersectsBox(ax, ay, bx, by, cx, cy, hx, hy),
        `case ${i}: seg (${ax},${ay})→(${bx},${by}) box (${cx},${cy}) ±(${hx},${hy})`,
      ).toBe(want);
    }
    // Guard the sweep itself: a generator that stopped producing hits would
    // pass the comparison above while testing nothing interesting.
    expect(intersecting).toBeGreaterThan(cases * 0.02);
  });

  it("reads the obvious cases the way a wall does", () => {
    const box = { cx: 0, cy: 0, hx: 10, hy: 10 };
    const hit = (ax: number, ay: number, bx: number, by: number) =>
      segmentIntersectsBox(ax, ay, bx, by, box.cx, box.cy, box.hx, box.hy);

    expect(hit(-50, 0, 50, 0)).toBe(true); // straight through
    expect(hit(-50, 50, 50, 50)).toBe(false); // clean miss above
    expect(hit(0, 0, 1, 1)).toBe(true); // starts inside
    expect(hit(-50, 0, -20, 0)).toBe(false); // stops short
    expect(hit(-50, 10, 50, 10)).toBe(true); // grazes the top face
    expect(hit(-10, -10, -10, 10)).toBe(true); // runs along the left face
    expect(hit(5, 5, 5, 5)).toBe(true); // zero-length, inside
    expect(hit(50, 50, 50, 50)).toBe(false); // zero-length, outside
  });

  it("zero-extent boxes still block a segment through their centre", () => {
    expect(segmentIntersectsBox(-10, 0, 10, 0, 0, 0, 0, 0)).toBe(true);
    expect(segmentIntersectsBox(-10, 1, 10, 1, 0, 0, 0, 0)).toBe(false);
  });

  it("the Vec2 wrapper agrees with the scalar form", () => {
    const a = { x: -30, y: -7 };
    const b = { x: 25, y: 12 };
    const c = { x: 3, y: 2 };
    const half = { x: 8, y: 6 };
    expect(segmentIntersectsRect(a, b, c, half)).toBe(
      segmentIntersectsBox(a.x, a.y, b.x, b.y, c.x, c.y, half.x, half.y),
    );
  });
});
