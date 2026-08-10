// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The "Loading…" placeholder shown while the heavy sprite atlas decodes (on a
// cold load / reload, and between menu screens before the shared decode pass
// resolves) — and while the APP SHELL's own chunk is still on the wire, which
// is what a player sees when they clear the studio card before the game is
// warm (`Boot.tsx`). It draws its label in the title menu's own pixel font —
// fetched ahead of the atlas via loadUiFont(), a tiny PNG that resolves fast —
// so the flash reads as one screen with the menu it hands off to instead of a
// bare system-ui line in the wrong font.
//
// The font comes from the LEAF (`ui-font.ts`), not from `assets.ts`: this is in
// the entry chunk now, and reaching the atlas for the font alone would put the
// whole sprite catalogue in front of the card it stands in for.

import { useEffect, useState } from "react";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

import { loadUiFont, peekUiFont } from "./ui-font.ts";

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
