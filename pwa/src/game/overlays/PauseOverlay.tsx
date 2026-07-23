// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The pause screen: shown while the engine sits in the `paused` phase (P on
// desktop, or auto-paused when the tab/app loses focus). The world and music
// are frozen behind it. Clicking anywhere resumes — the RESUME button just
// makes that affordance explicit. MENU drops back to the main menu, but the
// run is kept frozen in memory so CONTINUE resumes it — nothing is lost, so
// no confirmation is needed (handy for ducking out to change the volume).
//
// AUTO PILOT lives here too (see src/game/autopilot.ts): the coin-metered
// self-play mode is engaged from the pause menu. The button no longer prices
// the ride inline — tapping it raises the START picker (AutopilotStartModal),
// where the player picks a speed MULTIPLIER and sees its cost at the moment of
// enabling, unaffordable rungs greyed out. While the ride runs the row flips to
// STOP AUTO PILOT.

import { useState } from "react";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

import type { Sprites } from "../assets.ts";
import {
  AutopilotStartModal,
  type AutopilotRung,
} from "./AutopilotOverlay.tsx";

/** The AUTO PILOT row's wiring (absent in contexts that can't fly — demo). */
export type PauseAutopilot = {
  /** The engine meter is running (the ride is engaged). */
  active: boolean;
  /** The live purse (shown in the START picker). */
  coins: number;
  /** The offered speed rungs with their per-game-second cost + affordability
   * (config `AUTOPILOT.speeds`) — the START picker's rows. */
  rungs: AutopilotRung[];
  /** Engage at the chosen multiplier (also resumes the run). */
  onStart: (speed: number) => void;
  /** Disengage; the player keeps flying manually. */
  onStop: () => void;
};

export function PauseOverlay({
  font,
  sprites,
  onResume,
  onExit,
  autopilot,
}: {
  font: PixelFont;
  /** The atlas — forwarded to the AUTO PILOT picker for its column icons. */
  sprites: Sprites;
  onResume: () => void;
  onExit: () => void;
  autopilot?: PauseAutopilot;
}) {
  const stop = (event: { stopPropagation: () => void }) =>
    event.stopPropagation();
  // The START picker is raised from the AUTO PILOT button and stacks over the
  // pause box (its own backdrop dismisses it back to the pause menu).
  const [picking, setPicking] = useState(false);

  return (
    <>
      <div
        className="game-overlay pause-overlay"
        // Clicking the backdrop resumes.
        onPointerDown={onResume}
        role="presentation"
      >
        <div className="intro-box pause-menu" onPointerDown={stop}>
          <PixelText font={font} text="PAUSED" scale={6} color="#7ef0c8" />
          <PixelText
            font={font}
            text="CLICK OR PRESS P TO RESUME"
            scale={2}
            color="#9aa3ad"
          />
          {/* A full-width vertical stack — clean in both orientations, no
              awkward wrap. RESUME leads (mint), AUTO PILOT is the amber accent
              CTA (the paid feature, tying into its picker's theme), MENU is the
              quiet exit. */}
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
            {autopilot && !autopilot.active && (
              <button
                type="button"
                className="pixel-button autopilot"
                aria-label="autopilot-start"
                onClick={() => setPicking(true)}
              >
                <PixelText
                  font={font}
                  text="» AUTO PILOT"
                  scale={3}
                  color="#0b0d10"
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
                  text="■ STOP AUTO PILOT"
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
              <PixelText font={font} text="≡ MENU" scale={3} />
            </button>
          </div>
        </div>
      </div>
      {autopilot && !autopilot.active && picking && (
        <AutopilotStartModal
          font={font}
          sprites={sprites}
          coins={autopilot.coins}
          rungs={autopilot.rungs}
          onPick={(speed) => {
            setPicking(false);
            autopilot.onStart(speed);
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </>
  );
}
