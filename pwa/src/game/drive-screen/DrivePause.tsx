// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ROAD'S PAUSE SCREEN — the same card the run's own is, minus everything
// that is about a run.
//
// IT WEARS THE RUN'S CLASSES ON PURPOSE (`pause-overlay`, `pause-menu`,
// `pause-actions`, `pixel-button`): a pause screen that looked like a different
// program would undo in one keypress the whole reason the minigame is drawn
// with the game's own font, panels and portraits.
//
// AND IT CARRIES THE WAY OUT — two of them, because a player who has had enough
// has two different things in mind. The SETTINGS switch is a decision about
// every future trip; SKIP is a decision about this one, and hands the crossing
// on exactly as arriving would, with whatever the count had reached (he still
// made the trip, the game just stops showing it). Without those, the only way
// past a road he is not enjoying is to keep driving it, which is the one thing
// an optional interlude must never be.
//
// MAIN MENU is the third, and it is the one that leaves the GAME rather than
// the road. It asks first — see the confirm face below — because it is the only
// press on this card that ends the run.

import { useState, type ReactElement } from "react";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

export function DrivePause({
  font,
  onResume,
  onSkip,
  onMenu,
  cost = "THE TRIP ENDS HERE - HE KEEPS WHAT HE CARRIES",
}: {
  font: PixelFont;
  onResume: () => void;
  /**
   * Give up on the road and arrive anyway.
   *
   * Absent where there is nothing on the far side to arrive AT — an arcade lap
   * off the shelf, where "hand the crossing on" and "leave" are the same press.
   * The row is then not drawn rather than drawn as a second way out.
   */
  onSkip?: () => void;
  /**
   * Leave the road AND the run: bank the hero as he sits and drop to the title.
   *
   * Absent where there is no menu to drop to — the `?drive` workbench, which is
   * a road with no game behind it — and the row is then not drawn at all rather
   * than drawn dead.
   */
  onMenu?: () => void;
  /** What leaving actually costs, in one line — the confirm's own subtitle.
   * Defaults to a campaign leg's, which is the trip and nothing else. */
  cost?: string;
}): ReactElement {
  // THE CONFIRM IS A FACE OF THIS CARD, not a second overlay stacked over it:
  // the question is one line long and its two answers are the same two buttons
  // the card already draws, so a whole second window would be ceremony around a
  // yes/no.
  const [leaving, setLeaving] = useState(false);
  const stop = (event: { stopPropagation: () => void }) =>
    event.stopPropagation();
  return (
    <div
      className="game-overlay pause-overlay"
      // A tap on the backdrop resumes, as it always has — except while the
      // confirm is up, where it means "no": a press that ended the run because
      // the player was aiming for the card would be exactly the accident the
      // confirm exists to prevent.
      onPointerDown={leaving ? () => setLeaving(false) : onResume}
      role="presentation"
    >
      <div className="intro-box pause-menu" onPointerDown={stop}>
        {leaving ? (
          <>
            <PixelText
              font={font}
              text="LEAVE THE ROAD?"
              scale={5}
              color="#e0b955"
            />
            {/* What it actually costs, in one line: for a campaign leg, the
                trip and only the trip — he is banked as he sits (GameScreen's
                own note), so nothing in the bag or the purse is at stake. An
                arcade lap says its own, because nothing about a hero is true
                there. Either way, saying so is what makes this a decision
                rather than a warning. */}
            <PixelText font={font} text={cost} scale={2} color="#9aa3ad" />
            <div className="pause-actions">
              <button
                type="button"
                className="pixel-button"
                aria-label="drive-menu-confirm"
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
                aria-label="drive-menu-cancel"
                onClick={() => setLeaving(false)}
              >
                <PixelText
                  font={font}
                  text="◀ KEEP DRIVING"
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
                    text="» SKIP THE DRIVE"
                    scale={3}
                    color="#9aa3ad"
                  />
                </button>
              )}
              {onMenu && (
                <button
                  type="button"
                  className="pixel-button secondary"
                  aria-label="drive-menu"
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
