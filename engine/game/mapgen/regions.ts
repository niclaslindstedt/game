// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// COMPASS REGIONS — how a blueprint says WHERE without saying where exactly.
//
// A generated map has no fixed coordinates to pin a boss to, and a raw `x, y`
// would be meaningless anyway: the same number lands in a different chamber at
// every size and seed. So a blueprint names a DIRECTION instead
// (`northeast`, `center-east`, `south`), the map is read as a 3×3 grid of
// thirds, and the generator picks a carved chamber whose centre falls in the
// named cell. One line of authoring buys "the boss may be in any far corner".
//
// The grammar is deliberately forgiving of how a person writes a direction —
// `northeast`, `north-east` and `east-north` all resolve to the same ninth —
// but NOT of a typo: an unknown term throws, and the compile step turns that
// into a build failure rather than a silently misplaced boss.

/** A rectangle in world px (top-left origin), like a `ZoneRect`'s `rect`. */
export type RegionRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

// Which axis a term constrains, and to which third of it. `null` on an axis
// means "anywhere along it" — a lone `north` is the whole northern band.
type Band = 0 | 1 | 2;

const HORIZONTAL: Record<string, Band> = { west: 0, center: 1, east: 2 };
const VERTICAL: Record<string, Band> = { north: 0, center: 1, south: 2 };

// The four diagonals, spelled as one word — the forms a level designer actually
// writes. Each fixes BOTH axes at once.
const DIAGONALS: Record<string, [Band, Band]> = {
  northwest: [0, 0],
  northeast: [2, 0],
  southwest: [0, 2],
  southeast: [2, 2],
};

/**
 * Every term the grammar knows, derived from the tables above rather than
 * restated — the vocabulary and the parser cannot drift.
 *
 * It exists for one consumer: `mod/tools/catalog.mjs`, which enumerates the
 * names {@link parseRegion} accepts into `mod/catalog.json` so the MOD compiler
 * can check a blueprint's regions. The shipped desktop app has no TypeScript
 * toolchain and cannot call this parser at all, and the alternative — a second
 * grammar living in the SDK — is exactly the drift this module's header refuses.
 * Enumerating from the real parser keeps ONE grammar with a list snapshotted
 * off it, the same arrangement the achievement manifests use.
 */
export const REGION_TERMS: readonly string[] = [
  ...new Set([
    ...Object.keys(HORIZONTAL),
    ...Object.keys(VERTICAL),
    ...Object.keys(DIAGONALS),
  ]),
];

/**
 * Parse a region name into its horizontal and vertical bands, `null` on an axis
 * no term constrains.
 *
 * Terms are split on `-` and applied in order; `center` fills whichever axis is
 * still free, which is what makes `center-east` (the middle-right ninth) read
 * differently from a bare `center` (the middle ninth) and from `east` (the whole
 * eastern band).
 *
 * @throws on an unknown term, a term that fights one already applied, or an
 *   empty name — every one of those is an authoring mistake worth a build break.
 */
export function parseRegion(name: string): {
  x: Band | null;
  y: Band | null;
} {
  const terms = name
    .toLowerCase()
    .split("-")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  if (terms.length === 0) throw new Error(`empty region name "${name}"`);
  let x: Band | null = null;
  let y: Band | null = null;
  // `center` is resolved LAST: it means "the middle of whatever axis the other
  // terms left free", so it must not claim an axis a real direction wants.
  const centers = terms.filter((t) => t === "center").length;
  for (const term of terms) {
    if (term === "center") continue;
    const diagonal = DIAGONALS[term];
    if (diagonal) {
      if (x !== null || y !== null)
        throw new Error(`region "${name}": "${term}" fixes both axes already`);
      [x, y] = diagonal;
      continue;
    }
    if (term in HORIZONTAL) {
      if (x !== null) throw new Error(`region "${name}": two horizontal terms`);
      x = HORIZONTAL[term] as Band;
      continue;
    }
    if (term in VERTICAL) {
      if (y !== null) throw new Error(`region "${name}": two vertical terms`);
      y = VERTICAL[term] as Band;
      continue;
    }
    throw new Error(`region "${name}": unknown direction "${term}"`);
  }
  for (let i = 0; i < centers; i++) {
    // A lone `center` centres BOTH axes (the middle ninth); a `center` beside a
    // direction centres only the axis that direction left free.
    if (terms.length === 1) {
      x = 1;
      y = 1;
    } else if (x === null) x = 1;
    else if (y === null) y = 1;
  }
  return { x, y };
}

/** One third of `extent`, as `[from, to)`; band 3 would be the whole extent. */
function bandSpan(band: Band | null, extent: number): [number, number] {
  if (band === null) return [0, extent];
  const step = extent / 3;
  return [band * step, band === 2 ? extent : (band + 1) * step];
}

/**
 * The world rectangle a region name covers on a `width`×`height` map.
 *
 * @throws on an unparseable name (see {@link parseRegion}).
 */
export function regionRect(
  name: string,
  width: number,
  height: number,
): RegionRect {
  const { x, y } = parseRegion(name);
  const [x0, x1] = bandSpan(x, width);
  const [y0, y1] = bandSpan(y, height);
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** Whether a point falls inside the region (half-open on the far edges, so the
 * three bands tile the map without overlapping). */
export function regionContains(
  rect: RegionRect,
  x: number,
  y: number,
): boolean {
  return (
    x >= rect.x &&
    x <= rect.x + rect.width &&
    y >= rect.y &&
    y <= rect.y + rect.height
  );
}
