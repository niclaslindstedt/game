// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The "Loading…" placeholder shown while the heavy sprite atlas decodes (on a
// cold load / reload, and between menu screens before the shared decode pass
// resolves). It draws its label in the title menu's own pixel font — fetched
// ahead of the atlas via loadUiFont(), a tiny PNG that resolves fast — so the
// reload flash reads as one screen with the menu it hands off to instead of a
// bare system-ui line in the wrong font.

import { useEffect, useState } from "react";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

import { loadUiFont, peekUiFont } from "./assets.ts";

export function LoadingScreen() {
  const [font, setFont] = useState<PixelFont | null>(() => peekUiFont());
  useEffect(() => {
    if (font) return;
    let live = true;
    void loadUiFont().then((loaded) => {
      if (live) setFont(loaded);
    });
    return () => {
      live = false;
    };
  }, [font]);

  return (
    <div className="game-loading">
      {/* The font is tiny and usually cached, so the wait before it resolves is
          a blink on the dark backdrop — far better than flashing the label in
          the wrong font. The glyph set has no "…", so spell it with three dots.
          The muted tone matches the .game-loading CSS color. */}
      {font ? (
        <PixelText font={font} text="Loading..." color="#7a8088" />
      ) : null}
    </div>
  );
}
