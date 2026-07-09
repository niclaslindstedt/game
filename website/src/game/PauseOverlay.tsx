// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The pause screen: shown while the engine sits in the `paused` phase (P on
// desktop, or auto-paused when the tab/app loses focus). The world and music
// are frozen behind it. Clicking anywhere resumes — the RESUME button just
// makes that affordance explicit. MENU drops back to the main menu, but the
// run is kept frozen in memory so CONTINUE resumes it — nothing is lost, so
// no confirmation is needed (handy for ducking out to change the volume).

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

export function PauseOverlay({
  font,
  onResume,
  onExit,
}: {
  font: PixelFont;
  onResume: () => void;
  onExit: () => void;
}) {
  const stop = (event: { stopPropagation: () => void }) =>
    event.stopPropagation();

  return (
    <div
      className="game-overlay pause-overlay"
      // Clicking the backdrop resumes.
      onPointerDown={onResume}
      role="presentation"
    >
      <div className="intro-box" onPointerDown={stop}>
        <PixelText font={font} text="PAUSED" scale={6} color="#7ef0c8" />
        <PixelText
          font={font}
          text="CLICK OR PRESS P TO RESUME"
          scale={2}
          color="#9aa3ad"
        />
        <div className="splash-buttons">
          <button
            type="button"
            className="pixel-button"
            aria-label="resume"
            onClick={onResume}
          >
            <PixelText font={font} text="RESUME" scale={3} color="#0b0d10" />
          </button>
          <button
            type="button"
            className="pixel-button secondary"
            aria-label="pause-menu"
            onClick={onExit}
          >
            <PixelText font={font} text="MENU" scale={3} />
          </button>
        </div>
      </div>
    </div>
  );
}
