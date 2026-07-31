// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE BUST CROP — the head-and-shoulders window every portrait frame in the
// game shows (`@ui/lib/bust.ts`). The silhouettes below are traced from the
// shipped art, because every one of them broke a plausible earlier version of
// the rule: the hero's crown widens as sharply as his shoulders do, Houdini
// wears a hat brim that pinches at the face beneath it, the moon's astronauts
// have helmets exactly as wide as the shoulders they sit on, Tesla throws
// sparks a body's width out to either side, and the showgirl's feather is one
// pixel wide over a head that then triples in width row by row.
//
// The geometry half is pure (spans in, rect out), so this needs no canvas.

import { describe, expect, it } from "vitest";

import { bustFromSpans, type Span } from "@ui/lib/bust.ts";

/** A silhouette drawn as text — '.' is transparent, anything else is ink. */
function spans(art: string): (Span | null)[] {
  return art
    .split("\n")
    .filter((row) => row.length > 0)
    .map((row) => {
      let x0 = -1;
      let x1 = -1;
      for (let x = 0; x < row.length; x++) {
        if (row[x] === ".") continue;
        if (x0 < 0) x0 = x;
        x1 = x;
      }
      return x0 < 0 ? null : { x0, x1 };
    });
}

// hero_0, the 16×16 paper-doll body: head rows 1–6, shoulders from row 7.
const HERO = `
................
.....######.....
....########....
...##########...
...##########...
...##########...
....########....
...############.
..############..
..############..
..############..
...##########...
...##....##.....
...##....##.....
...##....##.....
................
`;

// harry_houdini_0: the top rows are a HAT, and the face under its brim pinches
// exactly like a neck. Framing on that first pinch crops to the hat alone.
const HAT = `
.......##########.......
.......##########.......
.....##############.....
........########........
.......##########.......
.......##########.......
.......##########.......
........########........
.....##################.
....####################
...######################
`;

// apollo_ghost_0: a helmet with no neck at all — the silhouette never pinches,
// so the shoulders have to be found by the step OUT below the helmet.
const HELMET = `
........................
........######..........
.......########.........
......##########........
......##########........
......##########........
......##########........
......##########........
......##########........
.....############.......
...################.....
.####################...
.####################...
.####################...
.####################...
.####################...
..##################....
...################.....
....##########..........
....####..####..........
....####..####..........
`;

describe("bust framing", () => {
  it("frames a body on its neck", () => {
    const rect = bustFromSpans(spans(HERO));
    // Head rows 1–6, so a window of 6 × HEADS ≈ 11, with air above the crown.
    expect(rect).toEqual({ x: 3, y: 0, w: 11, h: 11 });
  });

  it("reads past a hat brim to the real neck", () => {
    const rect = bustFromSpans(spans(HAT));
    // The hat is part of the head: the window covers rows 0–7, not 0–3.
    expect(rect?.h).toBeGreaterThanOrEqual(14);
  });

  it("finds the shoulders under a helmet that never pinches", () => {
    const rect = bustFromSpans(spans(HELMET));
    expect(rect).not.toBeNull();
    // The helmet is rows 1–9; the window is that plus about as much again,
    // and nowhere near the full 12-row body.
    expect(rect!.h).toBeGreaterThan(12);
    expect(rect!.h).toBeLessThan(20);
  });

  it("centres on the head, not on what the body is carrying", () => {
    // The hero again, with a weapon jutting four columns off his right side —
    // the window must not slide over to centre on the pair of them.
    const armed = spans(HERO).map((span, y) =>
      span && y > 6 ? { x0: span.x0, x1: span.x1 + 4 } : span,
    );
    expect(bustFromSpans(armed)?.x).toBe(3);
  });

  it("frames a creature with no head as itself", () => {
    // A drifting core: a blob that widens, narrows and never flares again.
    const blob = spans(`
....####....
..########..
.##########.
.##########.
..########..
....####....
`);
    const rect = bustFromSpans(blob);
    expect(rect?.w).toBe(10);
  });

  it("has nothing to say about an empty sprite", () => {
    expect(bustFromSpans(spans("....\n....\n"))).toBeNull();
  });
});
