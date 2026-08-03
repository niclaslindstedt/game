// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A PixelText label wearing a POLISHED-METAL finish: the same crisp glyph
// canvas, overlaid with a struck bevel (lit along the top of every letter,
// shaded along the bottom) and a specular highlight that sweeps THROUGH the
// letters. Every overlay is masked by the glyphs themselves (glyphMaskUrl), so
// the shine lives INSIDE the text — a band drawn over the whole row instead
// just slides a light past the words and never makes them read as metal.
// Generic React/UI game code — lives in pwa/src/lib/, the pool a later game
// keeps as-is.

import { useMemo, type CSSProperties } from "react";

import { PixelText } from "./PixelText.tsx";
import { glyphMaskUrl, type PixelFont } from "./pixel-font.ts";

export type PixelShinyTextProps = {
  font: PixelFont;
  text: string;
  /** Integer pixel scale, as PixelText's. */
  scale?: number;
  /** The metal's own color — the bevel and sweep lighten and shade THIS. */
  color?: string;
  /**
   * Delay the specular sweep by this many seconds, so a column of shiny labels
   * catches the light one after another rather than all flashing at once
   * (which reads as a blinking block, not as separate metal).
   */
  sweepDelay?: number;
};

export function PixelShinyText({
  font,
  text,
  scale = 3,
  color,
  sweepDelay = 0,
}: PixelShinyTextProps) {
  const mask = useMemo(() => glyphMaskUrl(font, text), [font, text]);
  const style = {
    "--glyphs": `url("${mask}")`,
    "--sweep-delay": `${sweepDelay}s`,
  } as CSSProperties;
  return (
    <span className="pixel-shiny" style={style}>
      <PixelText font={font} text={text} scale={scale} color={color} />
      {/* Three masked passes over the glyphs: the lit top edge, the shaded
          bottom, and the travelling highlight. All decorative — the canvas
          underneath carries the text (and its aria-label). */}
      <span className="pixel-shiny-lit" aria-hidden="true" />
      <span className="pixel-shiny-shade" aria-hidden="true" />
      <span className="pixel-shiny-sweep" aria-hidden="true" />
    </span>
  );
}
