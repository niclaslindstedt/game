// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Spatial clustering for touch games. Generic React/UI game code — lives in
// website/src/lib/ so it can be extracted into oss-framework once mature.
//
// A single primitive: group circular items into connected clusters where two
// items belong together when their bodies touch. The reference use is fusing a
// swing's worth of simultaneous kills into one merged floater, but the shape is
// generic — anything with a position and a radius clusters the same way.

/** A positioned circle: a world point plus the radius of its body. */
export type Clusterable = {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
};

/**
 * Group items into connected clusters. Two items are joined when their circles
 * touch — centre distance ≤ the sum of their radii, plus an optional `slack`
 * so near-misses still count — and clusters are the transitive closure of that
 * relation (A touches B touches C ⇒ all one cluster, even if A and C don't).
 *
 * Union–find over an O(n²) proximity scan: `n` is a single moment's item count
 * (a handful to a few dozen kills from one attack), so the quadratic pass is
 * comfortably cheap and needs no spatial index. Returns arrays of the original
 * indices, one array per cluster; ordering is unspecified.
 */
export function clusterByTouch(
  items: readonly Clusterable[],
  slack = 0,
): number[][] {
  const n = items.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => {
    let root = i;
    while (parent[root]! !== root) root = parent[root]!;
    // Path-compress the walked chain so repeat lookups stay flat.
    let cur = i;
    while (parent[cur]! !== root) {
      const next = parent[cur]!;
      parent[cur] = root;
      cur = next;
    }
    return root;
  };
  for (let i = 0; i < n; i++) {
    const a = items[i]!;
    for (let j = i + 1; j < n; j++) {
      const b = items[j]!;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const reach = a.radius + b.radius + slack;
      if (dx * dx + dy * dy <= reach * reach) {
        const ra = find(i);
        const rb = find(j);
        if (ra !== rb) parent[ra] = rb;
      }
    }
  }
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const g = groups.get(root);
    if (g) g.push(i);
    else groups.set(root, [i]);
  }
  return [...groups.values()];
}
