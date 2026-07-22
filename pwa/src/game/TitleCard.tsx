// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The level-name card: after the hero's monologue (or a skipped opening), the
// world stays black and the level name flashes up alone for a beat, then the
// run drops in. It fades itself out on a timer (TITLE_HOLD_MS); a tap drops in
// early. Shown while `phase === "title"`.

import { useEffect } from "react";

import { levelDef, type GameState } from "@game/core";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

/** How long the level name holds on black before the run drops in (ms). */
export const TITLE_HOLD_MS = 2200;

export function TitleCard({
  state,
  font,
  onBegin,
}: {
  state: GameState;
  font: PixelFont;
  /** Drop into the run (also fired by the auto-advance timer). */
  onBegin: () => void;
}) {
  const def = levelDef(state.level.id);

  // Auto-drop after the hold; a tap (below) drops in early. onBegin flips the
  // phase, which unmounts this card and clears the timer via cleanup.
  useEffect(() => {
    const timer = window.setTimeout(onBegin, TITLE_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [onBegin]);

  return (
    <div
      className="game-overlay title-card"
      onPointerDown={onBegin}
      role="presentation"
    >
      <div className="title-card-inner">
        <PixelText
          font={font}
          text={`LEVEL ${def.index}`}
          scale={2}
          color="#9aa3ad"
        />
        <PixelText font={font} text={def.name} scale={6} color="#7ef0c8" />
      </div>
    </div>
  );
}
