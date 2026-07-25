// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The coins a COIN STORE pack row wears before its label. A bigger pack is
// MORE coins, not a fatter one: the row's take is STACKED like poker chips —
// short columns for a million, a bank of tall ones for ten billion — with a
// few loose coins lying flat around their feet. Highlight the row and the
// stacks are stirred: coins are whipped off the top of each column, turn over
// in the air, and drop back onto the pile they came from.
//
// The layout is DERIVED from the row's id, never rolled with `Math.random`:
// MenuList re-renders on every cursor move and as store prices arrive, and a
// re-rolled pile would rearrange itself under the player mid-menu. Same id →
// same pile, forever.
//
// Each coin is ONE box plus its struck face (`.menu-chip` in styles.css) — a
// flat chip with a real thickness, not the rain's full 3D minted cylinder. A
// coin in a pile is a handful of pixels lying face-up: it never shows the
// machinery a turning coin needs, and the pile is where the element count
// lives (a ten-billion row is dozens of coins), so it pays for the whole
// screen to keep them cheap.

import type { CSSProperties } from "react";

/** How many HOP variants the CSS defines (`.menu-chip.hop1`…). Each is its own
 * throw — how high, how far out, how hard it turns over. They are fixed
 * animations rather than per-coin custom properties on purpose: keyframes built
 * out of `var()` can't be handed to the compositor, and a stirred pile is
 * dozens of coins moving at once. */
const HOP_VARIANTS = 5;

/** The tallest a single column may grow before the pile widens instead — past
 * this it outgrows the row. */
const MAX_STACK = 9;

/** How many coins a stir lifts off each column. */
const STIRRED_PER_STACK = 3;

/** One coin: where it lies, and how it is thrown. */
export type PileChip = {
  key: number;
  /** Held down by the coins on top of it — a stir leaves it where it is. */
  still: boolean;
  className: string;
  style: CSSProperties;
};

/** How much of a pack's haul is on show: tier 1..5 → 5, 11, 20, 32, 46 coins.
 * The ladder has to be FELT, not counted — the billion rows are a bank of
 * stacks next to the million row's handful of chips. */
function pileSize(tier: number): number {
  return Math.max(3, Math.round(2.2 * tier ** 1.9 + 2.8));
}

/** A stable 32-bit hash of a row's id — the seed the pile is laid out from. */
function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0 || 1;
  }
  return h;
}

/** A tiny deterministic 0..1 generator (mulberry32) — the pile's whole layout
 * comes out of one seed, so it is reproducible and allocation-free. */
function rngFrom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Piles are laid out once per (row, tier) and reused across renders — a
 * five-row store re-lays nothing as the cursor walks down it. */
const cache = new Map<string, PileChip[]>();

/** Split a pile's coins into columns: as many stacks as it takes to keep every
 * column under `MAX_STACK`, the tallest in the middle of the bank so the pile
 * has a summit instead of reading as a fence. */
function columnsFor(stacked: number, rnd: () => number): number[] {
  const columns = Math.max(1, Math.ceil(stacked / MAX_STACK));
  const heights: number[] = [];
  let left = stacked;
  for (let i = 0; i < columns; i += 1) {
    const remaining = columns - i;
    const even = Math.round(left / remaining);
    // Vary each column by a coin, so a bank never reads as a bar chart.
    const wanted = Math.max(
      1,
      Math.min(MAX_STACK, even + (rnd() < 0.5 ? -1 : 1)),
    );
    const h = Math.min(wanted, left - (remaining - 1));
    heights.push(h);
    left -= h;
  }
  if (left > 0) heights[heights.length - 1] = (heights.at(-1) ?? 0) + left;
  // Tallest in the middle: sort down, then deal outward from the centre.
  heights.sort((a, b) => b - a);
  const bank: number[] = [];
  heights.forEach((h, i) => (i % 2 ? bank.unshift(h) : bank.push(h)));
  return bank;
}

export function coinPile(id: string, tier: number): PileChip[] {
  const cacheKey = `${id}:${tier}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const total = pileSize(tier);
  const rnd = rngFrom(hashId(cacheKey));
  const loose = Math.min(total - 1, 1 + Math.round(total * 0.14));
  const bank = columnsFor(total - loose, rnd);

  const chips: PileChip[] = [];
  let key = 0;
  const chip = (
    d: number,
    x: number,
    y: number,
    opts: { still?: boolean; phase?: number } = {},
  ) => {
    const stir = 0.74 + rnd() * 0.66;
    chips.push({
      key: (key += 1),
      still: opts.still ?? false,
      className: `menu-chip hop${1 + Math.floor(rnd() * HOP_VARIANTS)}`,
      style: {
        "--d": `${d.toFixed(3)}rem`,
        "--x": `${x.toFixed(1)}%`,
        "--y": `${y.toFixed(3)}rem`,
        "--stir": `${stir.toFixed(2)}s`,
        "--stir-delay": `${(-(opts.phase ?? rnd()) * stir).toFixed(2)}s`,
      } as CSSProperties,
    });
  };

  // The stacks, dealt across the slot and emitted in DOM order so a column
  // paints over the coins behind it (a pile has no z-index to sort by, only
  // DOM order). A column is one denomination: every coin in it the same size,
  // standing on the same spot.
  const span = bank.length === 1 ? 0 : 74 / (bank.length - 1);
  bank.forEach((height, i) => {
    const d = 0.44 + rnd() * 0.1;
    const x = (bank.length === 1 ? 50 : 13 + i * span) + (rnd() * 2 - 1) * 4;
    const floor = rnd() * 0.1;
    for (let c = 0; c < height; c += 1) {
      // Each coin sits one thickness up the column, nudged a hair off true so
      // the stack looks hand-piled rather than machined.
      chip(d, x + (rnd() * 2 - 1) * 3, floor + c * d * 0.16, {
        // A stir takes the coins off the TOP of a column; the rest of the
        // stack is pinned under them and stays exactly where it stands. It is
        // what stirring a pile actually does — and it means a forty-coin row
        // puts a dozen coins in the air, not forty.
        still: c < height - STIRRED_PER_STACK,
        // The throw runs UP the column — the coin off the top leaves first.
        phase: height === 1 ? rnd() : 1 - c / height,
      });
    }
  });
  // …and the strays around their feet, scattered across the whole slot.
  for (let i = 0; i < loose; i += 1) {
    chip(0.42 + rnd() * 0.1, 8 + rnd() * 84, rnd() * 0.08, {
      // Half the strays skitter with the stir; the rest are just lying there.
      still: rnd() < 0.5,
    });
  }
  cache.set(cacheKey, chips);
  return chips;
}
