// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ROAD'S PAUSE SCREEN — the same card the run's own is, minus everything
// that is about a run.
//
// IT WEARS THE RUN'S CLASSES ON PURPOSE (`pause-overlay`, `pause-menu`,
// `pause-actions`, `pixel-button`): a pause screen that looked like a different
// program would undo in one keypress the whole reason the minigame is drawn
// with the game's own font, panels and portraits.
//
// AND IT CARRIES THE WAY OUT. A player who does not want the minigame today has
// exactly two doors — the SETTINGS switch, which is a decision about every
// future trip, and this button, which is a decision about this one. Without it
// the only way past a road he is not enjoying is to keep driving it, which is
// the one thing an optional interlude must never be. SKIP hands the crossing on
// exactly as arriving would, with whatever the count had reached: he still made
// the trip, the game just stops showing it.

import type { ReactElement } from "react";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

export function DrivePause({
  font,
  onResume,
  onSkip,
}: {
  font: PixelFont;
  onResume: () => void;
  /** Give up on the road and arrive anyway. */
  onSkip: () => void;
}): ReactElement {
  const stop = (event: { stopPropagation: () => void }) =>
    event.stopPropagation();
  return (
    <div
      className="game-overlay pause-overlay"
      onPointerDown={onResume}
      role="presentation"
    >
      <div className="intro-box pause-menu" onPointerDown={stop}>
        <PixelText font={font} text="PAUSED" scale={6} color="#7ef0c8" />
        <PixelText
          font={font}
          text="CLICK OR PRESS ESC TO RESUME"
          scale={2}
          color="#9aa3ad"
        />
        <div className="pause-actions">
          <button
            type="button"
            className="pixel-button"
            aria-label="resume"
            onClick={onResume}
          >
            <PixelText font={font} text="▶ RESUME" scale={3} color="#0b0d10" />
          </button>
          <button
            type="button"
            className="pixel-button secondary"
            aria-label="skip-minigame"
            onClick={onSkip}
          >
            <PixelText
              font={font}
              text="» SKIP THE DRIVE"
              scale={3}
              color="#9aa3ad"
            />
          </button>
        </div>
      </div>
    </div>
  );
}
