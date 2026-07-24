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
} as const;
