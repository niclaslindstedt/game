// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// React binding for the pixel font: renders a string into a small canvas so
// DOM overlays (HUD, splash screens) use the same generated font as the game
// canvas. Generic React/UI game code — lives in website/src/lib/ so it can
// be extracted into oss-framework once mature.

import { useEffect, useRef } from "react";

import type { PixelFont } from "./pixel-font.ts";

export type PixelTextProps = {
  font: PixelFont;
  text: string;
  /** Integer pixel scale. */
  scale?: number;
  color?: string;
  className?: string;
};

export function PixelText({
  font,
  text,
  scale = 3,
  color = "#f4f4f4",
  className,
}: PixelTextProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = Math.max(1, font.measure(text) * scale);
    canvas.height = font.height * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    font.draw(ctx, text, 0, 0, { scale, color });
  }, [font, text, scale, color]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      role="img"
      aria-label={text}
    />
  );
}
