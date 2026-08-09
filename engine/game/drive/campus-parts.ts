// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// HOW BIG GOODCO'S SITE IS — the one table the campus generator draws to and the
// campus planner anchors against, and NOTHING else.
//
// ITS OWN FILE, AND THE REASON IS MECHANICAL RATHER THAN TIDY. This is the
// town's `town-parts.ts` rule, learnt the same way: the generator that RULES
// these pictures (`scripts/asset-tools/campus.mjs`) is a plain `node` script run
// with no loader, so every module it reaches has to resolve without the `@game/*`
// aliases. `campus.ts` beside this one reaches the crowd's own geometry (it has
// to — a fence stands at a setback off the far pavement), and that pulls in
// `@game/lib`, and the build stops before it has drawn a pixel.
//
// So the table is a LEAF: no imports, no engine, nothing but numbers. The
// planner re-exports it, so nothing downstream has to know it lives here.

/**
 * HOW BIG EVERY PIECE OF THE CAMPUS IS (px) — the one table the generator draws
 * to (`scripts/asset-tools/campus.mjs`) and the layout below anchors against.
 *
 * The same rule `TOWN_ART_SIZE` exists for: a piece a pixel wider than its entry
 * does not look slightly wrong, it lands somewhere it was not placed. The
 * generator imports THIS, so the picture is the size the plan believes it is by
 * construction rather than by agreement.
 */
export const CAMPUS_ART_SIZE: Readonly<
  Record<string, readonly [number, number]>
> = {
  /** One bay of palisade on a concrete plinth. Tiled the length of the site. */
  goodco_fence: [24, 16],
  /** …and the sliding gate in it, which is shut. */
  goodco_gate: [34, 22],
  /** The totem sign on the approach — lit, and the only words out here. */
  goodco_sign: [30, 34],
  /** A floodlight mast over the staff lot. */
  goodco_flood: [14, 62],
  /** THE HALLS. Long, low, windowless and full of somebody's mail: the wide
   * one, and the taller one with the stair tower and the dishes on it. */
  goodco_hall: [120, 44],
  goodco_hall_tall: [84, 58],
  /** THE GANTRY, and what is standing in it. */
  goodco_gantry: [44, 124],
  goodco_rocket: [34, 168],
};
