// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The social card a library page unfurls as.
//
// WHY IT IS NOT THE SPRITE ITSELF. The obvious move — point `og:image` at the
// sprite PNG the page already draws — does not work: those previews run 128–384
// px square, and an unfurler wants 1200×630. Twitter drops anything under 300 px
// wide from a `summary_large_image` and falls back to no card at all, so the
// "free" version of this feature ships ~370 pages that unfurl worse than the
// shared default they replaced. A card has to be BUILT.
//
// WHY IT IS HTML AND NOT SVG. It is set in THE GAME'S OWN PIXEL FONT, and that
// rules out sharp: sharp rasterises SVG through librsvg, which finds fonts via
// fontconfig and therefore cannot see the WOFF2 this build packs — every string
// it drew came out in a system sans, which is the one thing a pixel game's card
// must never be. Rendered in the browser instead (card-shot.mjs `shootFrame`),
// the same `@font-face` every library page already uses simply applies.
//
// It is built out of what the page already is, not out of new art: the subject's
// own sprite at an INTEGER scale, its own name, and its own rarity. So a monster
// that gets resprited changes its card on the next build.
//
// The backdrop is DELIBERATELY NOT the venue's floor. An earlier pass tiled each
// card with the ground its subject stands on, which sounded right and read as
// noise: at the size a card is actually seen — a thumbnail in a chat unfurl — a
// busy texture behind the title costs legibility and buys nothing a viewer can
// make out. Where a thing comes from is the DROP SHOT's job (drop-shot.mjs); the
// card's job is the name and the rarity, and it does that on a clean field.

import { CAP_EM } from "./styles.mjs";

/** Open Graph's canonical card raster — what every unfurler crops against. */
export const CARD_W = 1200;
export const CARD_H = 630;

/** The box the subject's sprite is fitted into, on the card's right. */
const ART_BOX = 380;

/** Where the text column starts, and how wide it may run before it wraps. */
const TEXT_X = 80;
const TEXT_W = 600;

/**
 * Type sizes, in whole font-pixels.
 *
 * The pixel font's em is 8 font-pixels, so a size that is a multiple of 8 puts
 * every glyph edge on a whole device pixel. An arbitrary size — the 82px and
 * 30px this used while it was still being drawn in a system sans — lands the
 * grid on fractions and the letters come out soft, which on pixel art reads as
 * a mistake rather than as type.
 */
const TITLE_SIZES = [80, 72, 64, 56, 48, 40, 32];
const SUBTITLE_SIZES = [64, 56, 48, 40, 32];
/**
 * The rarity sits UNDER the subtitle and deliberately smaller. The two say
 * different kinds of thing — one is the concrete fact you need (what level it
 * wants, where it lives), the other is the classification — and setting them at
 * one size made the pair read as a single run-on label.
 */
const RARITY_SIZE = 32;
const BRAND_SIZE = 24;

/**
 * The pixel font is effectively monospaced — 8 font-pixels to the em with
 * 0.06em tracking — so a character is very close to `size * 0.66` wide. That
 * makes a width estimate dependable here in a way it never is for a
 * proportional face, and the browser still does the real wrapping.
 */
const widthAt = (text, size) => text.length * size * 0.66;

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** `#rrggbb` → components, for the rarity glow. */
function rgbOf(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  const n = m ? parseInt(m[1], 16) : 0xe6e8eb;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/**
 * The largest listed size at which the title fits the column in TWO lines —
 * no single word wider than a line, and the whole string inside two of them.
 */
function titleSize(title) {
  const longestWord = Math.max(...title.split(/\s+/).map((w) => w.length));
  return (
    TITLE_SIZES.find(
      (size) =>
        widthAt("x".repeat(longestWord), size) <= TEXT_W &&
        widthAt(title, size) <= TEXT_W * 2,
    ) ?? TITLE_SIZES.at(-1)
  );
}

/**
 * The largest listed size at which the subtitle fits on ONE line.
 *
 * One line, not two: the subtitle is a label ("LEGENDARY · LEVEL 16", "BOSS ·
 * SPACEZ HQ"), and a label that folds reads as a sentence that ran out of room.
 * So the size gives way instead — a long one sits smaller rather than wrapping.
 */
function subtitleSize(subtitle) {
  return (
    SUBTITLE_SIZES.find((size) => widthAt(subtitle, size) <= TEXT_W) ??
    SUBTITLE_SIZES.at(-1)
  );
}

/**
 * The subject's sprite scaled by a WHOLE NUMBER.
 *
 * `cell` is the sprite's size in the atlas — its real pixels — and the preview
 * on disk is that at 8×. Fitting the preview to the art box directly would land
 * on a fractional ratio and smear a pixel grid the whole game is drawn on;
 * picking the integer scale first keeps every source pixel a clean square.
 */
function spriteBox(cell) {
  const scale = Math.max(1, Math.floor(ART_BOX / Math.max(cell.w, cell.h)));
  return { width: cell.w * scale, height: cell.h * scale };
}

/**
 * The card, as markup for `shootFrame`. `accent` colours the subtitle and the
 * rarity treatment; `titleColor` is the name's own rarity colour, exactly as the
 * game draws an item name.
 */
export function ogCardHtml({
  spriteSrc,
  cell,
  title,
  subtitle,
  rarity,
  accent,
  titleColor,
  flair = 0,
  brand,
}) {
  const art = spriteBox(cell);
  const size = titleSize(title);
  const { r, g, b } = rgbOf(accent);
  const artCx = 930;

  // The rarity treatment: a halo behind the subject, and from flair 2 a frame.
  // The common tiers get neither — a treatment every card wears signals nothing.
  const halo =
    flair > 0
      ? `<div style="position:absolute;left:${artCx - 320}px;top:${CARD_H / 2 - 320}px;
           width:640px;height:640px;border-radius:50%;
           background:radial-gradient(circle,rgba(${r},${g},${b},${(0.1 + 0.1 * flair).toFixed(3)}) 0%,rgba(${r},${g},${b},0) 70%);"></div>`
      : "";
  const frame =
    flair >= 2
      ? `<div style="position:absolute;inset:26px;border-radius:10px;
           border:3px solid rgba(${r},${g},${b},${(0.16 + 0.1 * (flair - 2)).toFixed(2)});"></div>`
      : "";

  return `<div style="position:relative;width:${CARD_W}px;height:${CARD_H}px;overflow:hidden;
     background:linear-gradient(135deg,#151a23 0%,#0d1117 50%,#07090d 100%);
     font-family:'GamePixel',ui-monospace,monospace;letter-spacing:0.06em;">
  ${halo}
  <img src="${esc(spriteSrc)}" alt="" width="${art.width}" height="${art.height}"
       style="position:absolute;left:${artCx - art.width / 2}px;top:${CARD_H / 2 - art.height / 2}px;
              width:${art.width}px;height:${art.height}px;image-rendering:pixelated;" />
  ${frame}
  <div style="position:absolute;left:${TEXT_X}px;top:50%;transform:translateY(-50%);width:${TEXT_W}px;">
    <div style="font-size:${size}px;line-height:${(CAP_EM * 1.55).toFixed(3)};color:${esc(titleColor ?? "#e6e8eb")};">${esc(title)}</div>
    ${
      subtitle
        ? `<div style="font-size:${subtitleSize(subtitle)}px;line-height:${(CAP_EM * 1.55).toFixed(3)};
             margin-top:26px;white-space:nowrap;color:rgb(${r},${g},${b});">${esc(subtitle)}</div>`
        : ""
    }
    ${
      rarity
        ? `<div style="font-size:${RARITY_SIZE}px;line-height:${(CAP_EM * 1.55).toFixed(3)};
             margin-top:18px;white-space:nowrap;color:rgb(${r},${g},${b});">${esc(rarity)}</div>`
        : ""
    }
  </div>
  <div style="position:absolute;left:${TEXT_X}px;bottom:56px;font-size:${BRAND_SIZE}px;
       line-height:${(CAP_EM * 1.55).toFixed(3)};color:#5d6670;">${esc(brand)}</div>
</div>`;
}
