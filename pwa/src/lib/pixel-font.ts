// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Runtime renderer for the generated pixel font (see the pixel-assets
// skill: glyphs live in scripts/asset-tools/font.mjs and are packed
// into a white atlas + metrics at build time). Generic React/UI game code —
// lives in pwa/src/lib/, the pool a later game keeps as-is. The white atlas
// is tinted per color into cached offscreen canvases, then glyphs are
// blitted with smoothing off.

export type PixelFontMeta = {
  height: number;
  spacing: number;
  glyphs: Record<string, { x: number; width: number }>;
};

export type DrawTextOptions = {
  scale?: number;
  color?: string;
};

export type PixelFont = {
  height: number;
  /** Width of `text` in unscaled font pixels. */
  measure: (text: string) => number;
  /**
   * Greedily break `text` into lines no wider than `maxWidthPx` unscaled font
   * pixels — word wrap for the DOM overlays, which draw one canvas per line and
   * so can't reflow on their own. See {@link wrapLines}.
   */
  wrap: (text: string, maxWidthPx: number) => string[];
  draw: (
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    options?: DrawTextOptions,
  ) => void;
};

/**
 * Word-wrap `text` to lines no wider than `maxWidthPx` (in the same unscaled
 * font pixels `measure` returns). Breaks on whitespace; a single word too wide
 * to fit on its own line is hard-broken character by character so nothing ever
 * overflows. A non-positive or non-finite width disables wrapping (returns the
 * text as one line). Pure and DOM-free so it's unit-testable without a canvas.
 */
export function wrapLines(
  text: string,
  maxWidthPx: number,
  measure: (text: string) => number,
): string[] {
  if (!(maxWidthPx > 0) || !Number.isFinite(maxWidthPx)) return [text];
  const words = text.split(/\s+/).filter((word) => word.length > 0);
  if (words.length === 0) return [text];

  const lines: string[] = [];
  let line = "";

  // Split a word wider than an empty line into chunks that each fit, pushing
  // all but the trailing chunk; the caller adopts the returned tail as the new
  // current line. The first character of a chunk is always taken (even if it
  // alone exceeds the width) so the loop can't stall.
  const hardBreak = (word: string): string => {
    let chunk = "";
    for (const ch of word) {
      if (chunk !== "" && measure(chunk + ch) > maxWidthPx) {
        lines.push(chunk);
        chunk = ch;
      } else {
        chunk += ch;
      }
    }
    return chunk;
  };

  for (const word of words) {
    if (line === "") {
      line = measure(word) <= maxWidthPx ? word : hardBreak(word);
    } else if (measure(`${line} ${word}`) <= maxWidthPx) {
      line = `${line} ${word}`;
    } else {
      lines.push(line);
      line = measure(word) <= maxWidthPx ? word : hardBreak(word);
    }
  }
  lines.push(line);
  return lines;
}

/** Font pixels per mask pixel. The mask is stretched to the label's box by
 * `mask-size: 100% 100%`, and a mask image (unlike the label canvas, which is
 * `image-rendering: pixelated`) is SMOOTHED when the browser scales it — so it
 * is rendered well above the label's own scale and the glyph edges stay blocky
 * even where large screens double the root font-size. */
const MASK_SCALE = 8;

/** Per-font cache of glyph masks, keyed by the string. Keyed off the font
 * itself so two fonts (the UI font and the golden RELIC font) can't serve each
 * other's shapes, and weak so a discarded font takes its masks with it. */
const maskCache = new WeakMap<PixelFont, Map<string, string>>();

/**
 * An **alpha mask of `text`'s glyphs** as a PNG data URL: the string drawn in
 * solid white on transparency, at {@link MASK_SCALE}. Feed it to CSS
 * `mask-image` on an overlay sized to the same text and its paint reaches only
 * the lit glyph pixels — the way a metallic sheen is confined to the letters
 * instead of washing over the box around them (see PixelShinyText).
 *
 * The result is cached per string: building one costs a canvas and a
 * `toDataURL`, and menu labels re-render constantly.
 */
export function glyphMaskUrl(font: PixelFont, text: string): string {
  let cache = maskCache.get(font);
  if (!cache) {
    cache = new Map();
    maskCache.set(font, cache);
  }
  const hit = cache.get(text);
  if (hit !== undefined) return hit;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, font.measure(text) * MASK_SCALE);
  canvas.height = Math.max(1, font.height * MASK_SCALE);
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  font.draw(ctx, text, 0, 0, { scale: MASK_SCALE, color: "#ffffff" });
  const url = canvas.toDataURL();
  cache.set(text, url);
  return url;
}

export type CreatePixelFontOptions = {
  /**
   * When false, the atlas is already the finished color art (e.g. the
   * pre-shaded golden RELIC font) and is blitted as-is — the `color` draw
   * option is ignored, no source-in tint runs. Default true: a white atlas
   * recolored per requested color, cached per color string.
   */
  tinted?: boolean;
};

export function createPixelFont(
  atlas: HTMLImageElement,
  meta: PixelFontMeta,
  { tinted: isTinted = true }: CreatePixelFontOptions = {},
): PixelFont {
  const tinted = new Map<string, HTMLCanvasElement>();
  // The untinted (pre-colored) atlas drawn once into a canvas, so the glyph
  // blits below take a canvas source in both modes.
  let plain: HTMLCanvasElement | null = null;

  const atlasFor = (color: string): HTMLCanvasElement => {
    if (!isTinted) {
      if (plain) return plain;
      plain = document.createElement("canvas");
      plain.width = atlas.width;
      plain.height = atlas.height;
      const ctx = plain.getContext("2d");
      if (!ctx) throw new Error("2d context unavailable for the pixel font");
      ctx.drawImage(atlas, 0, 0);
      return plain;
    }
    let canvas = tinted.get(color);
    if (canvas) return canvas;
    canvas = document.createElement("canvas");
    canvas.width = atlas.width;
    canvas.height = atlas.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable for font tinting");
    ctx.drawImage(atlas, 0, 0);
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    tinted.set(color, canvas);
    return canvas;
  };

  const glyphFor = (char: string) =>
    meta.glyphs[char.toUpperCase()] ?? meta.glyphs["?"];

  const measure = (text: string): number => {
    let width = 0;
    for (const char of text) {
      const glyph = glyphFor(char);
      if (glyph) width += glyph.width + meta.spacing;
    }
    return Math.max(0, width - meta.spacing);
  };

  return {
    height: meta.height,

    measure,

    wrap: (text, maxWidthPx) => wrapLines(text, maxWidthPx, measure),

    draw(ctx, text, x, y, { scale = 1, color = "#f4f4f4" } = {}) {
      const source = atlasFor(color);
      const smoothing = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      let cursor = x;
      for (const char of text) {
        const glyph = glyphFor(char);
        if (!glyph) continue;
        ctx.drawImage(
          source,
          glyph.x,
          0,
          glyph.width,
          meta.height,
          cursor,
          y,
          glyph.width * scale,
          meta.height * scale,
        );
        cursor += (glyph.width + meta.spacing) * scale;
      }
      ctx.imageSmoothingEnabled = smoothing;
    },
  };
}
