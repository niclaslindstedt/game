// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Runtime renderer for the generated pixel font (see the pixel-assets
// skill: glyphs live in website/scripts/asset-tools/font.mjs and are packed
// into a white atlas + metrics at build time). Generic React/UI game code —
// lives in website/src/lib/ so it can be extracted into oss-framework once
// mature. The white atlas is tinted per color into cached offscreen
// canvases, then glyphs are blitted with smoothing off.

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
  draw: (
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    options?: DrawTextOptions,
  ) => void;
};

export function createPixelFont(
  atlas: HTMLImageElement,
  meta: PixelFontMeta,
): PixelFont {
  const tinted = new Map<string, HTMLCanvasElement>();

  const atlasFor = (color: string): HTMLCanvasElement => {
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

  return {
    height: meta.height,

    measure(text) {
      let width = 0;
      for (const char of text) {
        const glyph = glyphFor(char);
        if (glyph) width += glyph.width + meta.spacing;
      }
      return Math.max(0, width - meta.spacing);
    },

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
