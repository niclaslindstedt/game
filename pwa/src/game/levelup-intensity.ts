// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// How BIG the level-up spectacle plays, as a function of the level reached.
// The ding's light explosion is the game's loudest celebration, and an early
// hero eats one every few kills — at full strength that whites the screen out
// over and over before the run has really started. So the whole show is scaled:
// a dim, modest glow for the first dings, growing with the climb, and only the
// last ding before the cap detonates at the full, blinding 100%. One number
// drives every surface of the effect (the canvas blast, the hero's burn, the
// full-screen CSS overlay, the haptic) so they always agree.

import { LEVELING } from "@game/core";

/** The floor: what the FIRST ding (level 1 → 2) plays at. */
export const LEVELUP_MIN_INTENSITY = 0.2;

// The climb's shape. Leveling gets steadily more expensive, so the celebration
// should hold back while dings are cheap and cheap-feeling, then open up over
// the long grind. A mild ease-in (>1) keeps the frequent early dings modest
// (~0.3 by level 25, ~0.5 at the halfway mark) and saves the blinding end of
// the range for the levels that actually cost something.
const CURVE = 1.35;

/**
 * The level-up effect's intensity in `[LEVELUP_MIN_INTENSITY, 1]` for the level
 * just REACHED: `LEVELUP_MIN_INTENSITY` at level 2 (the 1 → 2 ding) rising to a
 * full 1 at `LEVELING.maxLevel` (the 98 → 99 ding). Every level-up surface
 * multiplies its brightness/reach/weight by this, so the ding grows with the
 * hero instead of shouting at the same volume for a hundred levels.
 */
export function levelUpIntensity(level: number): number {
  const span = LEVELING.maxLevel - 2; // levels between the first ding and the cap
  const p = span > 0 ? (level - 2) / span : 1;
  const clamped = p < 0 ? 0 : p > 1 ? 1 : p;
  return LEVELUP_MIN_INTENSITY + (1 - LEVELUP_MIN_INTENSITY) * clamped ** CURVE;
}
