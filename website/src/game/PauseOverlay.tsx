// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The pause screen: shown while the engine sits in the `paused` phase (P on
// desktop, or auto-paused when the tab/app loses focus). The world and music
// are frozen behind it. Clicking anywhere resumes — the RESUME button just
// makes that affordance explicit. MENU drops back to the main menu, but the
// run is kept frozen in memory so CONTINUE resumes it — nothing is lost, so
// no confirmation is needed (handy for ducking out to change the volume).
//
// AUTO PILOT lives here too (see src/game/autopilot.ts): the coin-metered
// self-play mode is engaged from the pause menu — the row shows the price per
// game-second and the purse, and is disabled when the purse can't cover a
// second. While the ride runs the row flips to STOP AUTO PILOT.

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";
import { formatCompact } from "@ui/lib/format-number.ts";

/** The AUTO PILOT row's wiring (absent in contexts that can't fly — demo). */
export type PauseAutopilot = {
  /** The engine meter is running (the ride is engaged). */
  active: boolean;
  /** The live purse. */
  coins: number;
  /** Coins per game-second at the rung the ride would start on. */
  drainPerSecond: number;
  /** Engage (also resumes the run) — absent affordance when unaffordable. */
  onStart: () => void;
  /** Disengage; the player keeps flying manually. */
  onStop: () => void;
};

export function PauseOverlay({
  font,
  onResume,
  onExit,
  autopilot,
}: {
  font: PixelFont;
  onResume: () => void;
  onExit: () => void;
  autopilot?: PauseAutopilot;
}) {
  const stop = (event: { stopPropagation: () => void }) =>
    event.stopPropagation();
  const affordable = autopilot
    ? autopilot.coins >= autopilot.drainPerSecond
    : false;

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
          {autopilot && !autopilot.active && (
            <button
              type="button"
              className="pixel-button secondary"
              aria-label="autopilot-start"
              disabled={!affordable}
              onClick={autopilot.onStart}
            >
              <PixelText
                font={font}
                text="AUTO PILOT"
                scale={3}
                color="#ffcf6b"
              />
            </button>
          )}
          {autopilot?.active && (
            <button
              type="button"
              className="pixel-button secondary"
              aria-label="autopilot-stop"
              onClick={autopilot.onStop}
            >
              <PixelText
                font={font}
                text="STOP AUTO PILOT"
                scale={3}
                color="#e06a6a"
              />
            </button>
          )}
          <button
            type="button"
            className="pixel-button secondary"
            aria-label="pause-menu"
            onClick={onExit}
          >
            <PixelText font={font} text="MENU" scale={3} />
          </button>
        </div>
        {autopilot && !autopilot.active && (
          <PixelText
            font={font}
            text={`AUTO PILOT: ${formatCompact(autopilot.drainPerSecond)} COINS/S · PURSE ${formatCompact(autopilot.coins)}`}
            scale={2}
            color={affordable ? "#9aa3ad" : "#e06a6a"}
          />
        )}
      </div>
    </div>
  );
}
