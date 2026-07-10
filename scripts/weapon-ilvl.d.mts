// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Type declarations for the unique ilvl model (weapon-ilvl.mjs) so TypeScript
// callers (unique-check has none; the content test does) get a typed API for the
// shared model instead of `any`. Keep in sync with the exports in the .mjs.

/** One unique's ilvl model result (see `ilvlOf`). */
export type IlvlModel = {
  /** The base item's `levelReq` (the equip gate). */
  req: number;
  /** Signed ilvl worth of the fixed bonuses (= computed − req). */
  budget: number;
  /** The canonical ilvl to author: `Math.round(req + budget)`. */
  computed: number;
  /** The ilvl currently authored on the def. */
  authored: number;
  /** authored − computed (0 when in sync). */
  drift: number;
  /** The deviation cap for this base's req. */
  cap: number;
  /** True when the def opts out of the cap via `UniqueDef.keeper`. */
  keeper: boolean;
  /** True when a non-exempt unique's budget exceeds its cap. */
  overBudget: boolean;
};

/** The conversion table: bonus value that equals one ilvl, per kind. */
export const PER_ILVL: Record<string, number>;
/** The deviation cap as a function of the base's levelReq. */
export function devCap(req: number): number;
/** Slots exempt from the budget cap (charm/bag). */
export const TRINKET_SLOTS: Set<string>;
/** One bonus → its signed ilvl worth. */
export function bonusIlvl(bonus: { kind: string; value: number }): number;
/** The whole ilvl model for one unique def. */
export function ilvlOf(u: {
  base: string;
  slot: string;
  ilvl: number;
  bonuses: { kind: string; value: number }[];
  bagSlots?: number;
  keeper?: boolean;
}): IlvlModel;
/** Every shipped unique with its model, sorted by computed ilvl. */
export function computeAll(): (IlvlModel & { id: string; u: unknown })[];
