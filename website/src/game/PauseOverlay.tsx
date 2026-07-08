// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The pause screen: shown while the engine sits in the `paused` phase (P on
// desktop, or auto-paused when the tab/app loses focus). The world and music
// are frozen behind it. Clicking anywhere resumes — the RESUME button just
// makes that affordance explicit. MENU ends the run, so it asks first.

import { useState } from "react";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

export function PauseOverlay({
  font,
  onResume,
  onQuit,
}: {
  font: PixelFont;
  onResume: () => void;
  onQuit: () => void;
}) {
  // Quitting to the menu abandons the run — a second step guards against a
  // stray click throwing away a good game.
  const [confirmingQuit, setConfirmingQuit] = useState(false);
  const stop = (event: { stopPropagation: () => void }) =>
    event.stopPropagation();

  return (
    <div
      className="game-overlay pause-overlay"
      // Clicking the backdrop resumes — but not while the quit prompt is up,
      // so a misclick there can't accidentally unpause instead of answering.
      onPointerDown={confirmingQuit ? undefined : onResume}
      role="presentation"
    >
      <div className="intro-box" onPointerDown={stop}>
        {confirmingQuit ? (
          <>
            <PixelText
              font={font}
              text="QUIT TO MENU?"
              scale={4}
              color="#d83a3a"
            />
            <PixelText
              font={font}
              text="YOUR RUN WILL END AND THIS PROGRESS IS LOST"
              scale={1}
              color="#9aa3ad"
            />
            <div className="splash-buttons">
              <button
                type="button"
                className="pixel-button"
                aria-label="confirm-quit"
                onClick={onQuit}
              >
                <PixelText font={font} text="QUIT" scale={3} color="#0b0d10" />
              </button>
              <button
                type="button"
                className="pixel-button secondary"
                aria-label="cancel-quit"
                onClick={() => setConfirmingQuit(false)}
              >
                <PixelText font={font} text="CANCEL" scale={3} />
              </button>
            </div>
          </>
        ) : (
          <>
            <PixelText font={font} text="PAUSED" scale={6} color="#7ef0c8" />
            <PixelText
              font={font}
              text="CLICK OR PRESS P TO RESUME"
              scale={1}
              color="#9aa3ad"
            />
            <div className="splash-buttons">
              <button
                type="button"
                className="pixel-button"
                aria-label="resume"
                onClick={onResume}
              >
                <PixelText
                  font={font}
                  text="RESUME"
                  scale={3}
                  color="#0b0d10"
                />
              </button>
              <button
                type="button"
                className="pixel-button secondary"
                aria-label="pause-menu"
                onClick={() => setConfirmingQuit(true)}
              >
                <PixelText font={font} text="MENU" scale={3} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
