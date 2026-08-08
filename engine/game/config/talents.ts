// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// GLOBAL talent tuning — the knobs shared across the whole talent system, as
// opposed to the per-talent numbers, which are authored on each def in
// `content/talents.yaml` (see `defs/talents/index.ts`). Deliberately tiny: what
// belongs here is only what is true of EVERY talent, i.e. the point economy
// itself, and everything a single talent owns — its slopes, its proc chances,
// its radii and its cooldowns — travels on the def so a mod can author or
// retune it without an engine change.
//
// This file must stay IMPORT-FREE: `scripts/generate-talents.mjs` reads the cap
// out of it to validate the YAML, which keeps that pipeline a leaf.

export const TALENTS = {
  /**
   * The rank ceiling every talent shares. A tree can hold at most
   * `Σ maxRank` points (see `treeCapacity`); with 40 ranks per full tree vs a
   * 25-point hard cap per stat (250 ÷ 10), even a pure spec can't max its tree,
   * so which talents to deepen stays a real choice. The build validates each
   * def against this (a talent may choose a SHALLOWER ladder, never a deeper
   * one), `spendTalentPoint` gates on it, and the picker draws this many rank
   * pips.
   */
  maxRank: 5,
} as const;
