// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE DROP SHOT — the picture that goes hunting in Google Images.
//
// It answers the question an image search actually asks. Somebody types a
// weapon's name, or "gone in space legendary sword", and what they want back is
// a picture of THE THING — recognisably a game item, in the place it comes from.
// The social card (og-card.mjs) is the wrong picture for that: it is mostly
// typography, built to be readable at feed size in a link preview, and a wall of
// those in an image grid reads as a wall of text.
//
// So this one shows THE GAME'S OWN ITEM CARD — photographed, not redrawn (see
// card-shot.mjs) so it carries the real pixel font, the real rarity ring and the
// real affix colours — standing on a few tiles of the floor it comes from.
//
// A few tiles, and dimmed hard: enough that a metal deck reads as a metal deck
// and lunar dust as lunar dust, without the backdrop competing with the card in
// front of it. (An earlier pass used the whole level map here; at the size a
// thumbnail is actually seen, a whole level is noise.)
//
// WHY IT IS A SEPARATE FILE FROM THE OG CARD. Google Images indexes images it
// finds ON the page and judges them by their surroundings — the alt text, the
// caption, the heading above them. `og:image` is a social-unfurl signal and is
// frequently not even fetched by Images. An image that wants to rank has to be
// an `<img>` in the document, which is what these are; the og card stays the og
// card. The two surfaces want different pictures, so they get different
// pictures.

import sharp from "sharp";

/** Wide enough to clear Google's size filters, at a ratio it likes to grid. */
export const SHOT_W = 1200;
export const SHOT_H = 630;

/**
 * The zoom an ITEM's floor is shown at. Fixed, unlike a mob's: an item card is
 * the same size whatever it describes, so its backdrop has no sprite to stay in
 * proportion with and one settled framing across the arsenal reads best.
 */
export const ITEM_ZOOM = 8;

/** The room the card is allowed, leaving the floor visible around it. */
const CARD_MAX_W = 860;
const CARD_MAX_H = 520;

/** `#rrggbb` → components, for the rarity glow. */
function rgbOf(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  const n = m ? parseInt(m[1], 16) : 0xe6e8eb;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/**
 * Dim one venue's map patch so a card can sit on it — built once per venue.
 *
 * `crop` arrives from `renderMapCrop` as a patch of the REAL level at the scale
 * the game draws it (map-render.mjs): the same plated floor, decor and
 * obstacles a player sees, not a shrunk aerial and not a bare repeating tile.
 *
 * The dimming is a vignette rather than a flat wash, so the middle stays bright
 * enough to read as somewhere while the rim falls away behind the card.
 */
export async function dimBackdrop(crop, strength = 0.72) {
  const veil = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SHOT_W}" height="${SHOT_H}">
      <defs>
        <radialGradient id="v" cx="0.5" cy="0.5" r="0.75">
          <stop offset="0" stop-color="#05070a" stop-opacity="${(strength * 0.62).toFixed(3)}"/>
          <stop offset="0.6" stop-color="#05070a" stop-opacity="${(strength * 0.94).toFixed(3)}"/>
          <stop offset="1" stop-color="#05070a" stop-opacity="${Math.min(0.95, strength * 1.25).toFixed(3)}"/>
        </radialGradient>
      </defs>
      <rect width="${SHOT_W}" height="${SHOT_H}" fill="url(#v)"/>
    </svg>`,
  );
  return sharp(crop).composite([{ input: veil }]).png().toBuffer();
}

/**
 * One subject's card, laid on the floor it comes from.
 *
 * `cardPng` is the photographed card (card-shot.mjs) — already the right thing,
 * at whatever size the browser drew it. It is only ever scaled DOWN to fit the
 * frame: enlarging a raster card would soften the pixel font that is the whole
 * reason it was photographed rather than drawn.
 */
export async function writeDropShot({ cardPng, backdrop, accent, flair = 0, out }) {
  const meta = await sharp(cardPng).metadata();

  const scale = Math.min(1, CARD_MAX_W / meta.width, CARD_MAX_H / meta.height);
  const cardW = Math.round(meta.width * scale);
  const cardH = Math.round(meta.height * scale);
  const card =
    scale < 1
      ? await sharp(cardPng).resize(cardW, cardH, { kernel: "lanczos3" }).toBuffer()
      : cardPng;

  const left = Math.round((SHOT_W - cardW) / 2);
  const top = Math.round((SHOT_H - cardH) / 2);

  const { r, g, b } = rgbOf(accent);
  // The rarity's light spilling onto the floor around the card. The card itself
  // already carries the game's own rarity ring, so this only has to widen it.
  const glow = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SHOT_W}" height="${SHOT_H}">
      <defs>
        <radialGradient id="halo" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stop-color="rgb(${r},${g},${b})" stop-opacity="${(0.06 + 0.08 * flair).toFixed(3)}"/>
          <stop offset="1" stop-color="rgb(${r},${g},${b})" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <ellipse cx="${SHOT_W / 2}" cy="${SHOT_H / 2}" rx="${cardW * 0.85}" ry="${cardH * 0.95}"
               fill="url(#halo)"/>
    </svg>`,
  );

  await sharp(backdrop)
    .composite([{ input: glow }, { input: card, left, top }])
    .png({ compressionLevel: 9 })
    .toFile(out);
}
