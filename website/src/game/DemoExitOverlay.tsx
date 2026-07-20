// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The HOW TO PLAY demo's exit prompt (see GameScreen `demo`). The demo is a
// self-playing showcase a newcomer only WATCHES, so it has no pause menu of its
// own — instead a tap ANYWHERE freezes the run and raises this confirm. KEEP
// WATCHING (or a tap on the backdrop) resumes the demo where it froze; MAIN MENU
// drops it and returns to the title. This is the demo's counterpart to
// PauseOverlay — the developer BOT VIEW still exits through the real pause menu.

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

export function DemoExitOverlay({
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
      className="game-overlay demo-exit-overlay"
      // Tapping the backdrop keeps watching (resumes the demo).
      onPointerDown={onResume}
      role="presentation"
    >
      <div className="intro-box" onPointerDown={stop}>
        <PixelText
          font={font}
          text="LEAVE THE DEMO?"
          scale={5}
          color="#ffd75e"
        />
        <PixelText
          font={font}
          text="RETURN TO THE MAIN MENU"
          scale={2}
          color="#9aa3ad"
        />
        <div className="splash-buttons">
          <button
            type="button"
            className="pixel-button"
            aria-label="demo-keep-watching"
            onClick={onResume}
          >
            <PixelText
              font={font}
              text="KEEP WATCHING"
              scale={3}
              color="#0b0d10"
            />
          </button>
          <button
            type="button"
            className="pixel-button secondary"
            aria-label="demo-exit-menu"
            onClick={onExit}
          >
            <PixelText font={font} text="MAIN MENU" scale={3} />
          </button>
        </div>
      </div>
    </div>
  );
}
