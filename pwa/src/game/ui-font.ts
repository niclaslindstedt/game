// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE MENU FONT, ON ITS OWN — a leaf module rather than two functions inside
// `assets.ts`, because the STUDIO CARD needs the font and must NOT need the
// atlas.
//
// `assets.ts` statically imports `atlas.json` (≈95 KB of source rects) plus the
// slicer and the bust/monochrome helpers around it, so anything that touched it
// for the font alone dragged the whole sprite catalog into its chunk. The card
// is the app's entry now (see `Boot.tsx`), and the whole point of the entry is
// that it is small: a tiny PNG and its metrics, nothing else.
//
// `assets.ts` re-exports both functions and awaits this loader rather than
// decoding the font a second time, so every existing call site is unchanged and
// the font is decoded exactly once however it is reached.

import { loadImages } from "@ui/lib/load-images.ts";
import { createPixelFont, type PixelFont } from "@ui/lib/pixel-font.ts";

import fontMeta from "./assets/font.json";
import fontUrl from "./assets/font.png";

let uiFont: Promise<PixelFont> | null = null;
let uiFontValue: PixelFont | null = null;

/**
 * Load just the main UI pixel font — the menu font — on its own. It's a tiny
 * PNG next to the whole sprite atlas, so it resolves well ahead of a full
 * `loadGameAssets` decode, letting the studio card (and the "Loading…"
 * placeholder) draw in the same font as the title menu it precedes instead of
 * a bare DOM fallback. Memoized and shared.
 */
export function loadUiFont(): Promise<PixelFont> {
  uiFont ??= loadImages({ font: fontUrl }).then((images) => {
    const font = createPixelFont(images.font, fontMeta);
    uiFontValue = font;
    return font;
  });
  return uiFont;
}

/** The decoded UI font if {@link loadUiFont} has resolved, else null. */
export function peekUiFont(): PixelFont | null {
  return uiFontValue;
}
