// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE HERO'S XP BAR, read from the pair the engine keeps on him — and it is a
// pair that reads backwards from its name: `xp` counts UP from 0 toward
// `xpToNext`, which is the WHOLE cost of the level he is on rather than what is
// left of it. A ding subtracts the bar from `xp` and re-derives it for the new
// level, so "how far into this level is he" is `xp`, full stop, and the
// remainder is `xpToNext - xp`.
//
// Read the pair off the hero rather than recomputing the cost from the curve:
// at the level cap the engine deliberately pins `xp` equal to `xpToNext` so the
// bar sits full for ever, and a formula would have to know that.

import type { Player } from "@game/core";

export type XpBar = {
  /** XP banked into the current level. */
  into: number;
  /** What the whole level costs — the bar's width. At least 1, so a caller may
   * divide by it. */
  toNext: number;
  /** How full the bar is, 0–1. */
  frac: number;
};

export function heroXpBar(hero: Player): XpBar {
  const toNext = Math.max(1, hero.xpToNext);
  const into = Math.min(Math.max(0, hero.xp), toNext);
  return { into, toNext, frac: into / toNext };
}
