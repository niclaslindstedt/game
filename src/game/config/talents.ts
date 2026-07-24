// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// GLOBAL talent tuning — the knobs shared across the whole talent system, as
// opposed to the per-talent numbers authored on each def (see
// `defs/talents/`). Kept deliberately small: one lever per shared rule, each
// read at the single site that owns it, so it stays BALANCE-slider-ready the
// way the other config blocks are. Proc caps and cooldown floors join here as
// those talent kinds are added; the shared rank ceiling is what's needed today.

export const TALENTS = {
  /**
   * The rank ceiling every talent shares. A tree can hold at most
   * `Σ maxRank` points (see `treeCapacity`); with 40 ranks per full tree vs a
   * 25-point hard cap per stat (250 ÷ 10), even a pure spec can't max its tree,
   * so which talents to deepen stays a real choice. The registry validates each
   * def against this, `spendTalentPoint` gates on it, and the picker draws this
   * many rank pips.
   */
  maxRank: 5,
  /**
   * FROST NOVA (magic-tree defense): when the hero is STRUCK, freeze the foes
   * around him solid for a beat, then go on an internal cooldown so a dogpile
   * can't chain-freeze the screen every frame (the proc ceiling the plan calls
   * for). Rank widens the ring, lengthens the freeze, and shortens the reset
   * (floored). The freeze reuses the engine's chill fields (`chillMs`/
   * `chillFactor`), so a frozen mob crawls at `slowFactor` like a companion's
   * frost pulse. Read once in the struck path (`applyFrostNova`).
   */
  frostNova: {
    /** Freeze reach at rank 1 / added per further rank. */
    radius: 60,
    radiusPerRank: 10,
    /** Freeze duration (ms) at rank 1 / added per further rank. */
    freezeMs: 800,
    freezeMsPerRank: 250,
    /** Enemy speed multiplier while frozen (near-still; kiting still a skill). */
    slowFactor: 0.15,
    /** Internal cooldown (ms) at rank 1, trimmed per rank, never below floor. */
    cooldownMs: 6000,
    cooldownPerRank: 700,
    cooldownFloorMs: 2500,
  },
} as const;
