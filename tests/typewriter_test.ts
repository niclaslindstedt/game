// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The letter-by-letter dialogue reveal (@ui/lib/typewriter.ts). Two concerns:
// the pure `pauseAfter` timing (punctuation → dramatic beat), and a sweep over
// every shipped line to prove the crawl reads the way the writing intends and
// never runs unreasonably long.

import { describe, expect, it } from "vitest";

import { ENEMY_DEFS, LEVELS, STORY_ITEM_DEFS } from "@game/core";

import { pauseAfter } from "@ui/lib/typewriter.ts";

describe("pauseAfter", () => {
  it("gives plain letters the base crawl", () => {
    expect(pauseAfter("STEP", 0)).toBe(30);
    expect(pauseAfter("A B", 1)).toBe(30); // spaces are undramatic
    expect(pauseAfter("IT'S", 2)).toBe(30); // apostrophes are mid-word
  });

  it("holds hard on a sentence end", () => {
    expect(pauseAfter("DONE. NEXT", 4)).toBe(260);
  });

  it("keeps ellipsis dots ticking, then holds on the tail", () => {
    const s = "STEP... ONTO";
    expect(pauseAfter(s, 4)).toBe(45); // first dot, more coming
    expect(pauseAfter(s, 5)).toBe(45); // middle dot
    expect(pauseAfter(s, 6)).toBe(440); // tail of the ellipsis — the drama
  });

  it("gives commas, dashes, and questions their own beats", () => {
    expect(pauseAfter("YES, NO", 3)).toBe(170);
    expect(pauseAfter("HAND - OFF", 5)).toBe(220); // free-standing dash
    expect(pauseAfter("WHO?", 3)).toBe(320);
  });

  it("does not pause on a hyphen inside a compound word", () => {
    expect(pauseAfter("REVERSE-DRIVE", 7)).toBe(30);
    expect(pauseAfter("1969-002", 4)).toBe(30);
  });

  it("breathes between rows", () => {
    expect(pauseAfter("A\nB", 1)).toBe(180);
  });
});

/** Total crawl time (ms) for a page of lines, mirroring the hook's schedule:
 * a base gap before the first char, then `pauseAfter` between the rest. */
function pageDurationMs(page: string[]): number {
  const full = page.join("\n");
  if (full.length === 0) return 0;
  let ms = 30; // BASE_CHAR_MS before the first character
  for (let i = 0; i < full.length - 1; i++) ms += pauseAfter(full, i);
  return ms;
}

describe("dialogue sweep", () => {
  // Every crawled page across the shipped catalogs: level-intro briefings,
  // elite arrivals, last words, and story-item lore. The sweep proves the
  // timing is sane on real content — not a single stall, and every page
  // delivered inside a patient bound.
  const pages: { who: string; page: string[] }[] = [];
  for (const def of Object.values(LEVELS)) {
    for (const page of def.intro)
      pages.push({ who: `intro:${def.id}`, page: [...page] });
  }
  for (const def of Object.values(ENEMY_DEFS)) {
    for (const page of def.dialogue ?? []) pages.push({ who: def.name, page });
    if (def.lastWords) pages.push({ who: def.name, page: def.lastWords });
  }
  for (const def of Object.values(STORY_ITEM_DEFS)) {
    for (const page of def.lore) pages.push({ who: def.name, page });
  }

  it("has content to sweep", () => {
    expect(pages.length).toBeGreaterThan(20);
  });

  it("prints every page within a patient bound", () => {
    for (const { who, page } of pages) {
      const ms = pageDurationMs(page);
      // A generous ceiling: even the longest, most punctuated page should read
      // in well under fifteen seconds of crawl.
      expect(ms, `${who}: ${page.join(" / ")}`).toBeLessThan(15000);
    }
  });

  it("never stalls longer than the ellipsis hold", () => {
    for (const { who, page } of pages) {
      const full = page.join("\n");
      for (let i = 0; i < full.length; i++) {
        expect(
          pauseAfter(full, i),
          `${who} @${i} (${full[i]})`,
        ).toBeLessThanOrEqual(440);
      }
    }
  });
});
