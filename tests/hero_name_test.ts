// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The NEW GAME name field's text rules (pwa/src/game/hero-name.ts). The
// load-bearing one is that a field edit comes back VERBATIM: the input is a
// controlled input, so any rewrite of its value makes the renderer assign
// `input.value` behind the keyboard's back — which is what made an iOS
// predictive-text tap ("JO" → "Jonas") land nothing but a space. The uppercase
// look belongs to the display, the uppercase name to the minted hero.

import { describe, expect, it } from "vitest";

import {
  clampHeroName,
  heroName,
  heroNameDisplay,
  MAX_HERO_NAME,
} from "../pwa/src/game/hero-name.ts";

describe("clampHeroName", () => {
  it("hands a fitting edit straight back, character for character", () => {
    for (const typed of ["", "J", "Jo", "Jonas", "Jonas ", "jonas the bold"]) {
      expect(clampHeroName(typed)).toBe(typed);
    }
  });

  it("returns the very same string, so the renderer writes nothing to the input", () => {
    const typed = "Jonas";
    // Identity, not just equality: a fresh string would still equal `typed`,
    // but the renderer compares the rendered value against the live DOM value — the
    // point is that nothing about the edit was rewritten.
    expect(clampHeroName(typed)).toBe(typed);
    expect(clampHeroName(typed).length).toBe(typed.length);
  });

  it("clamps an over-long edit to the name budget", () => {
    const long = "A".repeat(MAX_HERO_NAME + 6);
    expect(clampHeroName(long)).toHaveLength(MAX_HERO_NAME);
    expect(clampHeroName(long)).toBe("A".repeat(MAX_HERO_NAME));
  });
});

describe("heroNameDisplay", () => {
  it("upper-cases for the pixel font, which has no lowercase glyphs", () => {
    expect(heroNameDisplay("Jonas")).toBe("JONAS");
    expect(heroNameDisplay("")).toBe("");
  });

  it("keeps the trailing space a suggestion leaves, so the caret sits right", () => {
    expect(heroNameDisplay("Jonas ")).toBe("JONAS ");
  });
});

describe("heroName", () => {
  it("mints the uppercase name the roster and HUD show", () => {
    expect(heroName("Jonas")).toBe("JONAS");
  });

  it("trims the whitespace an autocomplete tap appends", () => {
    expect(heroName("Jonas ")).toBe("JONAS");
    expect(heroName("  jon snow  ")).toBe("JON SNOW");
  });

  it("keeps an all-blank field empty, for createCharacter to name", () => {
    expect(heroName("   ")).toBe("");
  });
});
