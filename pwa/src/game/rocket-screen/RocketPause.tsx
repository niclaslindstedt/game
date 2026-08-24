// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE FLIGHT'S PAUSE SCREEN — the drive's card (`DrivePause.tsx`) at the second
// cabinet, and its own copy on purpose: the two minigames must stay deletable
// folder by folder, so neither imports the other's chrome.
//
// It wears the run's classes for the run's reason (a pause screen that looked
// like a different program would undo the whole skin), and it carries the same
// three ways out: RESUME, SKIP (arrive anyway, absent on an arcade lap), and
// MAIN MENU behind a one-line confirm that says what leaving costs.

import { useState, type ReactElement } from "react";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

export function RocketPause({
  font,
  onResume,
  onSkip,
  onMenu,
  cost = "THE TRIP ENDS HERE - HE KEEPS WHAT HE CARRIES",
}: {
  font: PixelFont;
  onResume: () => void;
  /** Give up on the sky and arrive anyway. Absent on an arcade lap, where
   * "hand the crossing on" and "leave" are the same press. */
  onSkip?: () => void;
  /** Leave the flight AND the run. Absent where there is no menu to drop to
   * (the `?rocket` workbench). */
  onMenu?: () => void;
  /** What leaving actually costs, in one line — the confirm's subtitle. */
  cost?: string;
}): ReactElement {
  const [leaving, setLeaving] = useState(false);
  const stop = (event: { stopPropagation: () => void }) =>
    event.stopPropagation();
  return (
    <div
      className="game-overlay pause-overlay"
      onPointerDown={leaving ? () => setLeaving(false) : onResume}
      role="presentation"
    >
      <div className="intro-box pause-menu" onPointerDown={stop}>
        {leaving ? (
          <>
            <PixelText
              font={font}
              text="ABORT THE FLIGHT?"
              scale={5}
              color="#e0b955"
            />
            <PixelText font={font} text={cost} scale={2} color="#9aa3ad" />
            <div className="pause-actions">
              <button
                type="button"
                className="pixel-button"
                aria-label="rocket-menu-confirm"
                onClick={onMenu}
              >
                <PixelText
                  font={font}
                  text="≡ MAIN MENU"
                  scale={3}
                  color="#0b0d10"
                />
              </button>
              <button
                type="button"
                className="pixel-button secondary"
                aria-label="rocket-menu-cancel"
                onClick={() => setLeaving(false)}
              >
                <PixelText
                  font={font}
                  text="◀ KEEP FLYING"
                  scale={3}
                  color="#9aa3ad"
                />
              </button>
            </div>
          </>
        ) : (
          <>
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
                <PixelText
                  font={font}
                  text="▶ RESUME"
                  scale={3}
                  color="#0b0d10"
                />
              </button>
              {onSkip && (
                <button
                  type="button"
                  className="pixel-button secondary"
                  aria-label="skip-minigame"
                  onClick={onSkip}
                >
                  <PixelText
                    font={font}
                    text="» SKIP THE FLIGHT"
                    scale={3}
                    color="#9aa3ad"
                  />
                </button>
              )}
              {onMenu && (
                <button
                  type="button"
                  className="pixel-button secondary"
                  aria-label="rocket-menu"
                  onClick={() => setLeaving(true)}
                >
                  <PixelText
                    font={font}
                    text="≡ MAIN MENU"
                    scale={3}
                    color="#9aa3ad"
                  />
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
