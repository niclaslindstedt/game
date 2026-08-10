// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE LAUNCH NOTICE — the licence acknowledgement a desktop build shows in
// front of the title menu when its command line, rather than its packaging, is
// what turned multiplayer or mods on (pwa/src/game/LaunchNotice.tsx).
//
// Two halves are worth pinning, and both fail SILENTLY in the running game.
//
// The FACT is a shell's to state, and it must fail CLOSED: `__GIS_UNLOCKED__`
// is absent in a browser, in the installed PWA, on a phone and in any shell
// that predates the flag, and reading absence as "yes" would put a licence
// notice in front of every player on the web. This is the mirror image of the
// device policy next door, which fails OPEN — the two live one directory apart
// and the rules are opposites on purpose.
//
// The COPY is drawn in the game's own pixel font, which has no lowercase glyphs
// and draws a '?' for anything it does not carry. Nothing in the running game
// reports either failure: a typographic apostrophe or an ellipsis simply comes
// out as punctuation nobody wrote.

import { describe, expect, it, vi } from "vitest";

import { measureText } from "../scripts/asset-tools/font.mjs";
import { unlockedByLaunchOptions } from "../pwa/src/app/launch-options.ts";
import { LAUNCH_NOTICE } from "../pwa/src/game/copy.ts";

/** Every character the font has a glyph for that this copy has any business
 * using — letters, digits, space, and the sentence punctuation. The font
 * uppercases what it is given, so lowercase is allowed here and capitals are
 * what actually get drawn. */
const GLYPH_SAFE = /^[A-Za-z0-9 .,:;!?'"()&/%+-]+$/;

/**
 * The body column at the REFERENCE viewport (844×390, AGENTS.md), in unscaled
 * font px.
 *
 * The box is `min(92vw, 34rem)` with `1.4rem` of padding a side
 * (`.launch-notice-box`), so the landscape phone gets the full 34 rem: 544 CSS
 * px less 44.8 ≈ 499, and the body draws at scale 2 — 2 CSS px per font px at
 * the 1× tier. The 2× and 3× tiers scale the box and the glyphs together, so
 * the ratio holds there too.
 */
const COLUMN_FONT_PX = 250;

/**
 * The column at the NARROWEST viewport the game ships for — a 375 px portrait
 * phone, where 92vw leaves ≈300 CSS px. Every button LABEL has to fit inside
 * this, or a full-width button becomes a scrollbar.
 */
const NARROW_COLUMN_FONT_PX = 150;

/** How many lines of body copy the notice may run to before it stops being a
 * thing somebody reads and starts being a thing they click past. Six is what
 * the reference viewport has room for beside the heading and three buttons. */
const MAX_BODY_LINES = 6;

describe("who is shown the launch notice", () => {
  it("shows nobody, with no shell to say otherwise", () => {
    vi.stubGlobal("window", {});
    expect(unlockedByLaunchOptions()).toBe(false);
    vi.unstubAllGlobals();
  });

  it("shows it when the shell says the command line unlocked this launch", () => {
    vi.stubGlobal("window", { __GIS_UNLOCKED__: true });
    expect(unlockedByLaunchOptions()).toBe(true);
    vi.unstubAllGlobals();
  });

  it("shows nobody when the shell says the packaging carried it", () => {
    // What every stamped store build stamps — and what the Tauri shell writes
    // on EVERY launch, unlocked or not.
    vi.stubGlobal("window", { __GIS_UNLOCKED__: false });
    expect(unlockedByLaunchOptions()).toBe(false);
    vi.unstubAllGlobals();
  });

  it("takes only the boolean, never something that merely looks true", () => {
    // A shell that ever answered this in JSON, or a page that picked the value
    // up from a query string, would hand over the string "false" — which is
    // truthy, and would show the notice to a launch that owes nobody one.
    for (const value of ["true", "false", 1, {}, []]) {
      vi.stubGlobal("window", { __GIS_UNLOCKED__: value });
      expect(
        unlockedByLaunchOptions(),
        `__GIS_UNLOCKED__ = ${String(value)}`,
      ).toBe(false);
    }
    vi.unstubAllGlobals();
  });
});

describe("the launch notice's copy", () => {
  it("only uses characters the pixel font can draw", () => {
    for (const [key, text] of Object.entries(LAUNCH_NOTICE)) {
      expect(text, `${key}: "${text}"`).toMatch(GLYPH_SAFE);
    }
  });

  it("stays short enough to be read rather than clicked past", () => {
    const body = [LAUNCH_NOTICE.what, LAUNCH_NOTICE.where, LAUNCH_NOTICE.terms];
    // The wrap is the font's own (`wrapLines`); this is the cheap upper bound
    // on the same arithmetic — total width over the column's width, plus one
    // line per paragraph for the ragged last row.
    const lines = body.reduce(
      (total, text) => total + Math.ceil(measureText(text) / COLUMN_FONT_PX),
      0,
    );
    expect(lines).toBeLessThanOrEqual(MAX_BODY_LINES);
  });

  it("keeps every button label inside a button", () => {
    // A label wider than the box turns a full-width button into a scrollbar.
    for (const label of [
      LAUNCH_NOTICE.accept,
      LAUNCH_NOTICE.store,
      LAUNCH_NOTICE.quit,
    ]) {
      expect(measureText(label), `"${label}"`).toBeLessThanOrEqual(
        NARROW_COLUMN_FONT_PX,
      );
    }
  });

  it("names the cause in the heading, on one line", () => {
    expect(measureText(LAUNCH_NOTICE.heading)).toBeLessThanOrEqual(
      // Drawn at scale 3 rather than the body's 2, so it has two thirds of the
      // reference column's font pixels to fit in.
      (COLUMN_FONT_PX * 2) / 3,
    );
  });
});
