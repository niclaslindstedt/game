// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHICH RUNG OF THE BLOOD LADDER A TILE DRAWS — the rule alone, import-free.
//
// Its own leaf because it is the whole answer to "why is there a red square on
// my floor", and a rule that load-bearing has to be testable without a canvas
// (`./blood-ground.ts`, which owns the grid and the drawing, reaches the atlas).

/** Saturation (0–255) at which each rung of `blood_tile_0..3` takes over. A tile
 * spends most of its life on the lower rungs — a single hit should stain a
 * floor, not soak it.
 *
 * The FIRST entry is a floor as much as a rung: a spray's outermost reach barely
 * wets the tiles it touches, and drawing those lays a wide even pink haze over
 * everything within throwing distance, which reads as a rash rather than as
 * spatter. Below it a tile stays clean, so the mess keeps a shape. */
export const RUNG_AT = [16, 52, 112, 190];

/** The soaked rung — near-total coverage, and the one that can draw a
 * rectangle. Also reused as the wash a surrounded tile gets laid over it. */
export const SOAKED_RUNG = 3;

/** Which rung a saturation sits on, ignoring the neighbourhood. */
export function rungOf(s: number): number {
  let rung = 0;
  while (rung + 1 < RUNG_AT.length && s >= (RUNG_AT[rung + 1] ?? Infinity)) {
    rung++;
  }
  return rung;
}

/**
 * Which rung a tile actually DRAWS, given its own saturation, the weakest of its
 * four ORTHOGONAL neighbours, and the weakest of ALL EIGHT.
 *
 * The soaked rung is near-total coverage, so a run of them side by side is one
 * solid mass whose outline is the TILE GRID. Two gates keep that from happening,
 * and it takes BOTH:
 *
 *  - **One rung above the orthogonal neighbourhood, at most.** This stops a
 *    single hard-hit cell in open ground from drawing as a lone square. On its
 *    own it is not enough, and believing otherwise is what shipped the bug: land
 *    a few kills together and every tile in the blob has soaked neighbours, so
 *    they all clear the cap and the blob goes solid — the exact rectangle the cap
 *    was meant to prevent.
 *  - **The soaked rung is INTERIOR-ONLY.** A tile may reach it only when all
 *    EIGHT of its neighbours are themselves heavy, so every tile on the RIM of a
 *    mess draws the hole-punched rung below instead. A mess has to be at least
 *    3×3 before one cell in the middle goes solid, and that cell is ringed by
 *    ragged ones — so the eye never meets a straight edge.
 *
 * Both are MINIMUMS, not averages: an average bleeds the fill outward past the
 * edge of the mess and the whole thing goes soft.
 */
export function drawnRung(
  s: number,
  orthogonalMin: number,
  neighbourMin: number,
): number {
  const rung = Math.min(rungOf(s), rungOf(orthogonalMin) + 1);
  if (rung < SOAKED_RUNG) return rung;
  return rungOf(neighbourMin) >= SOAKED_RUNG - 1 ? rung : SOAKED_RUNG - 1;
}
