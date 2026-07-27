// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SPAWN SHOT — a monster's picture for Google Images.
//
// An item's search picture is its CARD on the floor it drops on (drop-shot.mjs),
// because a card is what the game actually shows you when you find loot. A
// monster has no card. Dressing one in the loot card's skin — which this did at
// first — states something false about the game: it makes a mob look like a
// thing you pick up, and every stat sits in a frame the player has only ever
// seen wrapped around a weapon.
//
// What the game shows you of a monster is the monster, standing in a place. So
// that is the picture: the mob on its own venue's floor, AT THE SCALE IT SPAWNS
// — the sprite and the ground blown up by the same factor, which is the whole
// trick. Enlarge the sprite alone and it is a cut-out pasted on a map; enlarge
// both together and the tiles under its feet are the size they are when you
// meet it, so it reads as a screenshot of an encounter rather than a montage.
//
// The title is set in the game's own pixel font, which is why this is HTML for
// `shootFrame` rather than an SVG through sharp — see the note in og-card.mjs.

import { CAP_EM } from "./styles.mjs";

export const SHOT_W = 1200;
export const SHOT_H = 630;

/**
 * How tall we want the mob to stand, and the zoom range that is allowed to
 * achieve it.
 *
 * The zoom is derived from the sprite so that a 16-px minion and a 48-px boss
 * both end up a readable size in an image grid — and because the BACKDROP is
 * rendered at the very same zoom, an intern seen close up gets big floor plates
 * and a boss seen wider gets smaller ones, which is exactly how the two look in
 * play. Clamped at both ends: past 12× a frame holds four tiles and stops
 * reading as a place, below 6× the mob is a speck.
 */
const TARGET_MOB_PX = 260;
const MIN_ZOOM = 6;
const MAX_ZOOM = 12;

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** `#rrggbb` → components. */
function rgbOf(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  const n = m ? parseInt(m[1], 16) : 0xe6e8eb;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** The whole-number zoom this mob is staged at — sprite AND ground alike. */
export function zoomFor(cell) {
  const wanted = Math.round(TARGET_MOB_PX / Math.max(cell.w, cell.h));
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, wanted));
}

/** Title sizes in whole font-pixels, so glyph edges land on whole pixels. */
const TITLE_SIZES = [72, 64, 56, 48, 40, 32];
const RANK_SIZE = 32;
const widthAt = (text, size) => text.length * size * 0.66;

function titleSize(title) {
  return (
    TITLE_SIZES.find((size) => widthAt(title, size) <= SHOT_W - 160) ??
    TITLE_SIZES.at(-1)
  );
}

/**
 * The staged monster, as markup for `shootFrame`.
 *
 * `backdropSrc` is that venue's floor already rendered at `zoom` and dimmed.
 * The mob is placed a little above centre so the title has room beneath it
 * without covering its feet — a mob standing on the caption looks pasted on.
 */
export function spawnShotHtml({
  backdropSrc,
  spriteSrc,
  cell,
  zoom,
  title,
  rank,
  accent,
  flair = 0,
}) {
  const w = cell.w * zoom;
  const h = cell.h * zoom;
  const { r, g, b } = rgbOf(accent);
  const cx = SHOT_W / 2;
  const feet = SHOT_H / 2 + 40;
  const top = feet - h;
  const size = titleSize(title);

  // Elites and bosses stand in their own light; the rank and file do not, so
  // that the glow means "this one is an event" rather than "this is a monster".
  const halo =
    flair > 0
      ? `<div style="position:absolute;left:${cx - 340}px;top:${feet - h / 2 - 340}px;
           width:680px;height:680px;border-radius:50%;
           background:radial-gradient(circle,rgba(${r},${g},${b},${(0.08 + 0.07 * flair).toFixed(3)}) 0%,rgba(${r},${g},${b},0) 70%);"></div>`
      : "";

  return `<div style="position:relative;width:${SHOT_W}px;height:${SHOT_H}px;overflow:hidden;
     background:#05070a url('${esc(backdropSrc)}') center/cover no-repeat;
     font-family:'GamePixel',ui-monospace,monospace;letter-spacing:0.06em;">
  ${halo}
  <!-- A contact shadow, so the mob stands ON the floor instead of over it. -->
  <div style="position:absolute;left:${cx - w * 0.42}px;top:${feet - 16}px;
       width:${w * 0.84}px;height:32px;border-radius:50%;
       background:radial-gradient(ellipse,rgba(5,7,10,0.65) 0%,rgba(5,7,10,0) 70%);"></div>
  <img src="${esc(spriteSrc)}" alt="" width="${w}" height="${h}"
       style="position:absolute;left:${cx - w / 2}px;top:${top}px;width:${w}px;height:${h}px;
              image-rendering:pixelated;" />
  <!-- The floor darkens under the title so the name reads over any venue. -->
  <div style="position:absolute;left:0;right:0;bottom:0;height:210px;
       background:linear-gradient(180deg,rgba(5,7,10,0) 0%,rgba(5,7,10,0.88) 65%,rgba(5,7,10,0.95) 100%);"></div>
  <div style="position:absolute;left:0;right:0;bottom:52px;text-align:center;">
    <div style="font-size:${size}px;line-height:${(CAP_EM * 1.55).toFixed(3)};
         color:rgb(${r},${g},${b});
         text-shadow:0 ${Math.round(size / 16)}px 0 rgba(5,7,10,0.85);">${esc(title)}</div>
    ${
      rank
        ? `<div style="font-size:${RANK_SIZE}px;line-height:${(CAP_EM * 1.55).toFixed(3)};
             margin-top:20px;color:#c2c9d2;">${esc(rank)}</div>`
        : ""
    }
  </div>
</div>`;
}
