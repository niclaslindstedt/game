// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The pure word-wrap behind the DOM overlays' text (@ui/lib/pixel-font.ts).
// The overlays draw one canvas per line and can't reflow on their own, so
// `wrapLines` folds a long, data-driven string (an affix-built weapon name,
// a stat blurb) into lines that fit the modal — this proves it never spills
// past the cap and never drops or reorders a character.

import { describe, expect, it } from "vitest";

import { wrapLines } from "@ui/lib/pixel-font.ts";

// A stand-in metric: every glyph is one unit wide plus one unit of spacing, so
// a string of length n measures 2n - 1 (matching the real font's "width +
// spacing per glyph, minus the trailing spacing"). Spaces count as glyphs.
const measure = (text: string): number => Math.max(0, text.length * 2 - 1);

/** Reassemble wrapped lines the way the crawl reads them, to prove no loss. */
const words = (text: string): string[] =>
  text.split(/\s+/).filter((w) => w.length > 0);

describe("wrapLines", () => {
  it("keeps a string that already fits on one line", () => {
    expect(wrapLines("HELLO WORLD", 100, measure)).toEqual(["HELLO WORLD"]);
  });

  it("breaks on spaces so no line exceeds the cap", () => {
    const lines = wrapLines("ALPHA BETA GAMMA DELTA", 19, measure);
    for (const line of lines) expect(measure(line)).toBeLessThanOrEqual(19);
    // Nothing is lost or reordered across the wrap.
    expect(lines.flatMap(words)).toEqual(["ALPHA", "BETA", "GAMMA", "DELTA"]);
    expect(lines.length).toBeGreaterThan(1);
  });

  it("hard-breaks a single word too wide for any line", () => {
    // "SUPERCALIFRAGILISTIC" can't fit in a 9px line at any split point.
    const lines = wrapLines("SUPERCALIFRAGILISTIC", 9, measure);
    for (const line of lines) expect(measure(line)).toBeLessThanOrEqual(9);
    // The characters round-trip exactly (a hard break never eats a letter).
    expect(lines.join("")).toBe("SUPERCALIFRAGILISTIC");
    expect(lines.length).toBeGreaterThan(1);
  });

  it("wraps the reported affix-built weapon name", () => {
    const name = "CRUEL EXECUTIONER'S AXE OF DEADLINES";
    const lines = wrapLines(name, 40, measure);
    for (const line of lines) expect(measure(line)).toBeLessThanOrEqual(40);
    expect(lines.flatMap(words)).toEqual(words(name));
    expect(lines.length).toBeGreaterThan(1);
  });

  it("takes at least one character per chunk even below a glyph's width", () => {
    // A cap smaller than any glyph still terminates: one char per line.
    const lines = wrapLines("ABCD", 0.5, measure);
    expect(lines).toEqual(["A", "B", "C", "D"]);
  });

  it("disables wrapping for a non-positive or non-finite cap", () => {
    expect(wrapLines("KEEP ME WHOLE", 0, measure)).toEqual(["KEEP ME WHOLE"]);
    expect(wrapLines("KEEP ME WHOLE", -5, measure)).toEqual(["KEEP ME WHOLE"]);
    expect(wrapLines("KEEP ME WHOLE", Infinity, measure)).toEqual([
      "KEEP ME WHOLE",
    ]);
  });

  it("returns empty/whitespace input unchanged", () => {
    expect(wrapLines("", 100, measure)).toEqual([""]);
    expect(wrapLines("   ", 100, measure)).toEqual(["   "]);
  });
});
