// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import { clusterByTouch, type Clusterable } from "@ui/lib/cluster.ts";

/** Sort clusters (and the indices within) so assertions ignore ordering. */
function normalize(groups: number[][]): number[][] {
  return groups
    .map((g) => [...g].sort((a, b) => a - b))
    .sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0));
}

describe("clusterByTouch", () => {
  it("returns one singleton per item when nothing touches", () => {
    const items: Clusterable[] = [
      { x: 0, y: 0, radius: 1 },
      { x: 100, y: 0, radius: 1 },
      { x: 0, y: 100, radius: 1 },
    ];
    expect(normalize(clusterByTouch(items))).toEqual([[0], [1], [2]]);
  });

  it("joins two circles whose bodies overlap", () => {
    const items: Clusterable[] = [
      { x: 0, y: 0, radius: 5 },
      { x: 8, y: 0, radius: 5 }, // distance 8 <= 5 + 5
    ];
    expect(normalize(clusterByTouch(items))).toEqual([[0, 1]]);
  });

  it("treats exactly-touching circles as one cluster", () => {
    const items: Clusterable[] = [
      { x: 0, y: 0, radius: 3 },
      { x: 6, y: 0, radius: 3 }, // distance 6 == 3 + 3
    ];
    expect(normalize(clusterByTouch(items))).toEqual([[0, 1]]);
  });

  it("keeps circles that fall just short of touching apart", () => {
    const items: Clusterable[] = [
      { x: 0, y: 0, radius: 3 },
      { x: 7, y: 0, radius: 3 }, // distance 7 > 3 + 3
    ];
    expect(normalize(clusterByTouch(items))).toEqual([[0], [1]]);
  });

  it("honors slack so near-misses still merge", () => {
    const items: Clusterable[] = [
      { x: 0, y: 0, radius: 3 },
      { x: 7, y: 0, radius: 3 }, // gap of 1 closes under slack 2
    ];
    expect(normalize(clusterByTouch(items, 2))).toEqual([[0, 1]]);
  });

  it("chains transitively — a touches b touches c even if a and c are apart", () => {
    const items: Clusterable[] = [
      { x: 0, y: 0, radius: 3 },
      { x: 5, y: 0, radius: 3 }, // touches 0
      { x: 10, y: 0, radius: 3 }, // touches 1, not 0 (distance 10 > 6)
    ];
    expect(normalize(clusterByTouch(items))).toEqual([[0, 1, 2]]);
  });

  it("separates two knots that don't touch each other", () => {
    const items: Clusterable[] = [
      { x: 0, y: 0, radius: 3 },
      { x: 4, y: 0, radius: 3 }, // knot A
      { x: 100, y: 0, radius: 3 },
      { x: 104, y: 0, radius: 3 }, // knot B
    ];
    expect(normalize(clusterByTouch(items))).toEqual([
      [0, 1],
      [2, 3],
    ]);
  });

  it("returns nothing for an empty input", () => {
    expect(clusterByTouch([])).toEqual([]);
  });
});
