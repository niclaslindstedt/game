// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// React binding for the pixel font: renders a string into a small canvas so
// DOM overlays (HUD, splash screens) use the same generated font as the game
// canvas. Generic React/UI game code — lives in pwa/src/lib/ so it can
// be extracted into oss-framework once mature.

import { useLayoutEffect, useRef } from "react";

import type { PixelFont } from "./pixel-font.ts";

/** CSS px per rem at the default root font-size — the 1:1 reference. */
const REM_BASE_PX = 16;

export type PixelTextProps = {
  font: PixelFont;
  text: string;
  /** Integer pixel scale. */
  scale?: number;
  color?: string;
  className?: string;
  /**
   * Wrap the text to at most this width, in **rem** — the parent modal's inner
   * content width. The canvas grows downward into as many lines as it takes so
   * a long, data-driven string (an affix-built weapon name, a stat blurb) stays
   * inside its box instead of spilling off the edge. Omitted → the classic
   * single-line canvas, sized to the text.
   */
  maxWidth?: number;
};

/** Extra vertical space between wrapped lines, as a fraction of glyph height. */
const LINE_GAP_RATIO = 0.3;

export function PixelText({
  font,
  text,
  scale = 3,
  color = "#f4f4f4",
  className,
  maxWidth,
}: PixelTextProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Size AND draw the canvas in a layout effect (not a plain effect): a parent
  // that measures this text's box in its own useLayoutEffect — e.g. the
  // inventory item tooltip positioning itself next to the hovered slot — runs
  // AFTER its children's layout effects, so the canvas must already carry its
  // real width/height by then. A plain useEffect leaves the canvas at its
  // intrinsic 300×150 for that first measurement, which flung the tooltip into
  // the top-left corner until the next click.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // A rem cap converts to unscaled font pixels (the units `measure`/`wrap`
    // speak): rem → CSS px (×16) → font px (÷scale). Wrapping stays keyed to
    // rem so it tracks the root-font bump on large screens automatically.
    const lines =
      maxWidth && maxWidth > 0
        ? font.wrap(text, (maxWidth * REM_BASE_PX) / scale)
        : [text];
    const lineH = font.height * scale;
    const gap =
      lines.length > 1 ? Math.round(font.height * scale * LINE_GAP_RATIO) : 0;
    const step = lineH + gap;
    const textW = lines.reduce(
      (max, line) => Math.max(max, font.measure(line)),
      0,
    );
    const w = Math.max(1, textW * scale);
    const h = step * lines.length - gap;
    canvas.width = w;
    canvas.height = h;
    // Display the crisp bitmap in rem so it tracks the root font-size: at the
    // default 16px root this is exactly 1:1 (unchanged), and where the root is
    // bumped for large screens (styles.css) the text scales up with the rest
    // of the rem-sized UI. `pixelated` keeps that upscale sharp.
    canvas.style.width = `${w / REM_BASE_PX}rem`;
    canvas.style.height = `${h / REM_BASE_PX}rem`;
    canvas.style.imageRendering = "pixelated";
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    lines.forEach((line, i) => {
      font.draw(ctx, line, 0, i * step, { scale, color });
    });
  }, [font, text, scale, color, maxWidth]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      role="img"
      aria-label={text}
    />
  );
}
