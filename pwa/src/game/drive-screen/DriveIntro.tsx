// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE TITLE CARD THE ROAD OPENS ON — "ROAD TO GOODCO", printed over the black
// the garage handed across, and then the road.
//
// IT IS THE SEAM MADE LEGIBLE. Leaving the hub is a half-second dim now (see
// DEPARTURE, engine/game/vehicles.ts): the bumper touches the tarmac, the picture
// goes dark, and the frame after that is a wholly different game — a side-on
// road at 120 mph with its own dashboard, its own controls and its own way of
// ending. Cut to it cold and the first thing a player does is spend a second
// working out what happened, which is a second of a minigame that is a minute
// long. A card that names the thing costs a beat and buys the whole of that
// second back: it says WHERE this is going before the road starts moving, and
// it gives the departure's black something to be rather than a gap.
//
// IT IS ALSO A HOLD, NOT A DECORATION. The road behind it does not tick while
// it is up (`DriveScreen` gates the fixed step on it, exactly as it does on the
// pause card and the high-score board), so nothing happens to a car nobody is
// looking at yet — the first crowd of the leg is not walked into during a title
// card.
//
// AND IT ANSWERS THE FIRST TOUCH. A tap or any key takes it away on the spot,
// because the second trip of a session is one the player has already read.
//
// A COMPONENT RATHER THAN HUD CONTENT, on the rule `DriveScores` and
// `DrivePause` beside it are filed under: `content/hud/` owns the DASHBOARD —
// live dials republished off a running road — and this is a screen raised over
// a stopped one, with its own timing and its own way of being dismissed.

import type { ReactElement } from "react";
import { useEffect } from "react";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

/**
 * How long the card holds if nobody touches it (ms) — long enough to read four
 * words and take the picture in, short enough that a player who drives this
 * road every trip is never made to wait on it. The CSS below spends this same
 * budget: the type arrives over the first fifth and the card lifts over the
 * last quarter, so the road is already moving under the tail of the fade.
 */
export const DRIVE_INTRO_MS = 1900;

/** THE ROAD'S TWO ENDS, as a destination a card can print. Keyed by the level
 * the leg is bound for, because that is what a `DriveParams` carries — and it
 * is only ever one of these two: `legDirection` (begin.ts) refuses to build a
 * drive for anything else, so the fallback below is a belt on a fastened belt
 * rather than a case anybody can reach. */
const DESTINATIONS: Record<string, string> = {
  goodco_hq: "GOODCO",
  garage: "HOME",
};

/** What this leg is called. Bare `to` is deliberately NOT printed as a
 * fallback: a level id is a thing with an underscore in it, and a title card
 * that prints one has stopped being a title card. */
function destinationOf(to: string): string {
  return DESTINATIONS[to] ?? "GOODCO";
}

export function DriveIntro({
  font,
  to,
  onDone,
}: {
  font: PixelFont;
  /** The level this leg is bound for (`DriveParams.to`). */
  to: string;
  /** Take the card away and let the road run. Called exactly once — on the
   * timer, or on the first touch, whichever lands first. */
  onDone: () => void;
}): ReactElement {
  // ONE TIMER, ARMED ON MOUNT. `onDone` is not in the deps on purpose: it is
  // the screen's own `useCallback`, and re-arming the hold every time that
  // identity changed would be a card that never times out on a screen that
  // re-renders (which this one does, sixty times a second, off the dials).
  useEffect(() => {
    const id = window.setTimeout(onDone, DRIVE_INTRO_MS);
    const skip = () => onDone();
    window.addEventListener("keydown", skip);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("keydown", skip);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="drive-intro" onPointerDown={onDone} role="presentation">
      <div className="drive-intro-card">
        {/* Small over large: the preposition is furniture and the place is the
            point, so the eye lands on the destination and the line above it is
            read second, if at all. */}
        <PixelText font={font} text="ROAD TO" scale={3} color="#7c8592" />
        <PixelText
          font={font}
          text={destinationOf(to)}
          scale={8}
          color="#ffd75e"
        />
        {/* The one thing a player might not know and needs before the first
            corner: which way this wagon is driven. Below the title and in the
            quiet grey, so it is available rather than announced. */}
        <PixelText
          font={font}
          text="DRAG THE WAY THE CAR IS POINTING"
          scale={2}
          color="#7c8592"
        />
      </div>
    </div>
  );
}
