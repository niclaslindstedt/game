// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The RELIC font — the golden name font for unique / legendary / artifact
// items on their display cards (see the pixel-assets skill). It reuses the
// EXACT glyphs of the workaday UI font (font.mjs) — same size, same shapes,
// same metrics — so a top-tier name sits at the identical scale as every
// other line on the card; the ONLY difference is the metal it's struck in.
//
// Where the UI font is a white atlas tinted one flat color at runtime, the
// relic font is baked PRE-COLORED into gold: a vertical gradient — light-gold
// highlight up top, a gold body, an orange shadow below — struck across the
// glyph so a name reads as gilt metal rather than flat text. The three rarity
// tiers escalate the treatment so unique < legendary < artifact reads at a
// glance:
//   unique     — 2-tone polished gold (light top, gold body). Matte, plain.
//   legendary  — 3-tone gilt (light top, gold body, orange shadow). Fuller.
//   artifact   — molten: light → gold → orange → deep base, with white-hot
//                specular glints on the top-left corners. The level-99 chase.

import { FONT_HEIGHT, GLYPHS, LETTER_SPACING } from "./font.mjs";
import { createSurface, setPixel } from "./surface.mjs";

/** The rarity tiers the relic font is minted for, plainest → richest. */
export const RELIC_TIERS = ["unique", "legendary", "artifact"];

// The golden ramp — the "gold + orange + light gold" the cards are struck in.
const LIGHT = [255, 235, 170, 255]; // light gold — the top highlight
const GOLD = [237, 189, 74, 255]; // gold — the body of every stroke
const ORANGE = [208, 118, 38, 255]; // orange — the bottom shadow
const SPEC = [255, 250, 226, 255]; // white-hot specular — artifact only
const DEEP = [150, 78, 24, 255]; // deep orange — artifact's molten base

// The metal is a vertical gradient struck across the font's cap-height, so
// every letter catches the same overhead light. Each tier bands the rows
// differently, escalating the richness. Rows run 0 (top) … FONT_HEIGHT-1
// (bottom); a shorter glyph is padded from the bottom band.
const TIER_BANDS = {
  //           r0     r1    r2    r3    r4
  unique: [LIGHT, GOLD, GOLD, GOLD, GOLD],
  legendary: [LIGHT, GOLD, GOLD, GOLD, ORANGE],
  artifact: [LIGHT, LIGHT, GOLD, ORANGE, DEEP],
};

// The metal for one lit pixel of a glyph at (y,x) in the given tier.
function colorFor(glyph, y, x, tier) {
  const bands = TIER_BANDS[tier];
  const band = bands[Math.min(y, bands.length - 1)] ?? GOLD;
  // artifact keeps a white-hot specular on the top-left corner of every
  // stroke — a top pixel (nothing lit above) whose left neighbour is open —
  // so the letters glint where the light first strikes them.
  if (tier === "artifact") {
    const openAbove = (glyph[y - 1]?.[x] ?? ".") !== "#";
    const openLeft = (glyph[y]?.[x - 1] ?? ".") !== "#";
    if (openAbove && openLeft) return SPEC;
  }
  return band;
}

/** Render a relic string to a new PRE-COLORED surface for the given tier. */
export function renderRelicText(text, tier) {
  const width = measureRelicText(text);
  const surface = createSurface(Math.max(1, width), FONT_HEIGHT);
  let cursor = 0;
  for (const char of text.toUpperCase()) {
    const glyph = GLYPHS[char.toUpperCase()] ?? GLYPHS["?"];
    glyph.forEach((row, y) => {
      [...row].forEach((cell, x) => {
        if (cell === "#")
          setPixel(surface, cursor + x, y, colorFor(glyph, y, x, tier));
      });
    });
    cursor += glyph[0].length + LETTER_SPACING;
  }
  return surface;
}

/** Pixel width of a rendered relic string (identical to the UI font). */
export function measureRelicText(text) {
  let width = 0;
  for (const char of text.toUpperCase()) {
    const glyph = GLYPHS[char.toUpperCase()] ?? GLYPHS["?"];
    width += glyph[0].length + LETTER_SPACING;
  }
  return Math.max(0, width - LETTER_SPACING);
}

/**
 * Pack the glyphs into ONE pre-colored atlas per tier plus a shared metrics
 * object — the SAME layout the UI font's `buildFontAtlas` produces (glyph
 * positions are identical; only the pixel colors differ per tier):
 * { meta, atlases: { unique, legendary, artifact } }. The runtime blits these
 * directly, no tint (see pixel-font.ts `tinted: false`).
 */
export function buildRelicFonts() {
  const chars = Object.keys(GLYPHS);
  const totalWidth = chars.reduce((w, c) => w + GLYPHS[c][0].length + 1, 0);
  const meta = { height: FONT_HEIGHT, spacing: LETTER_SPACING, glyphs: {} };
  const atlases = {};

  for (const tier of RELIC_TIERS) {
    const atlas = createSurface(totalWidth, FONT_HEIGHT);
    let x = 0;
    for (const char of chars) {
      const glyph = GLYPHS[char];
      glyph.forEach((row, y) => {
        [...row].forEach((cell, gx) => {
          if (cell === "#")
            setPixel(atlas, x + gx, y, colorFor(glyph, y, gx, tier));
        });
      });
      if (tier === RELIC_TIERS[0])
        meta.glyphs[char] = { x, width: glyph[0].length };
      x += glyph[0].length + 1;
    }
    atlases[tier] = atlas;
  }
  return { meta, atlases };
}
