// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// HOW MANY OF THIS DO YOU WANT — the counter's purchase quantity, as arithmetic
// rather than as a component, so the clamp can be tested without a browser.
//
// The rule is one sentence and the whole reason the deal card no longer carries
// a second BUY ALL button: the field always holds a number the counter can
// actually honour. A value above what the trade would really part with (the
// pile's depth, the purse, the carry room — `stockBuyableCount` folds all three
// into one figure) is pulled DOWN to that figure the moment it is typed, rather
// than accepted and then refused by a dimmed button. There is no empty state and
// no zero: a cleared field reads 1, which is what the player wanted when they
// reached for the backspace.

/**
 * The text a quantity field should hold after `raw` was typed into it, given
 * that at most `max` units can be bought. Digits only, never below 1, never
 * above `max` — and `max` itself is floored at 1 so a field that is on screen
 * always offers a legal purchase.
 */
export function clampQtyText(raw: string, max: number): string {
  const digits = raw.replace(/[^0-9]/g, "");
  // An emptied field is a 1, not a hole: the button beside it prices what the
  // next press will spend, and "BUY 0" is not a thing the counter can do.
  const typed = digits === "" ? 1 : Number(digits);
  const ceiling = Math.max(1, Math.floor(max));
  return String(Math.min(Math.max(1, typed), ceiling));
}

/** The number a clamped quantity field stands for. */
export function qtyOfText(text: string): number {
  const n = Number(text);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}
