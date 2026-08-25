// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE TWO CARDS THE FLIGHT OPENS ON — the title, and then, once per session,
// the controls.
//
// THE TITLE IS THE DRIVE'S BEAT: it names the trip over the black the cutscene
// handed across, holds the sky (the fixed step breaks on it), times itself out
// and answers the first touch. It names the place and says nothing else.
//
// THE CONTROLS CARD IS THE EXCEPTION THE DRIVE REFUSED, and the difference is
// honest: the wagon's one gesture teaches itself in the first corner, and an
// inverted pendulum does not — a player who discovers "thrust feeds the flip"
// by flipping has paid a whole climb for one sentence. So the manual gets a
// card OF ITS OWN (never a subtitle on the title — a card carries one thing),
// it WAITS for a press instead of timing out, and it is shown once per
// session: the second flight of an evening opens on the title alone.

import type { ReactElement } from "react";
import { useEffect, useState } from "react";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

/** The title's hold — the drive card's own timing. */
export const ROCKET_INTRO_MS = 1900;

/** Once per SESSION, not per mount: a crashed climb remounts nothing (the
 * screen holds one flight), but a second trip to the arcade shelf does. The
 * landing's briefing keeps its own latch on the same rule. */
let controlsShown = false;
let landingShown = false;

/** The workbench and the tests reset both; the game never does. */
export function resetControlsCard(): void {
  controlsShown = false;
  landingShown = false;
}

const INK = "#9aa3ad";
const HOT = "#ffd75e";

export function RocketIntro({
  font,
  onDone,
}: {
  font: PixelFont;
  /** Both cards are behind us: let the sky run. Called exactly once. */
  onDone: () => void;
}): ReactElement {
  const [page, setPage] = useState<"title" | "controls">("title");

  const advance = () => {
    if (page === "title" && !controlsShown) {
      controlsShown = true;
      setPage("controls");
      return;
    }
    onDone();
  };

  // The title times itself out; the controls card never does — it is the one
  // screen in the minigame that waits for a thumb, because it is the one
  // screen a player must not be scrolled past by a clock.
  useEffect(() => {
    if (page !== "title") return;
    const id = window.setTimeout(advance, ROCKET_INTRO_MS);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  useEffect(() => {
    const skip = () => advance();
    window.addEventListener("keydown", skip);
    return () => window.removeEventListener("keydown", skip);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  return (
    // `.rocket-intro` opts out of the drive card's self-lifting fade: that
    // animation is timed to a card that always unmounts at 1900 ms, and the
    // controls page here outlives it — a manual under an opacity-0 container
    // is a screen the player cannot know they are stuck on. The rocket's card
    // leaves on the spot instead; `key` restarts the type-in per page.
    <div
      className="drive-intro rocket-intro"
      onPointerDown={advance}
      role="presentation"
    >
      {page === "title" ? (
        <div key="title" className="drive-intro-card">
          <PixelText font={font} text="FLIGHT TO" scale={3} color="#7c8592" />
          <PixelText font={font} text="THE MOON" scale={8} color={HOT} />
        </div>
      ) : (
        <div key="controls" className="drive-intro-card rocket-controls-card">
          <PixelText font={font} text="PRE-FLIGHT" scale={4} color={HOT} />
          {/* One line per control, one control per line — a manual read in
              four seconds, standing between the player and a pendulum. */}
          <PixelText
            font={font}
            text="HOLD DOWN - BURN. SPEED FEEDS THE FLIP"
            scale={2}
            color={INK}
          />
          <PixelText
            font={font}
            text="LEFT / RIGHT - STEERING POOFS. STAY UPRIGHT"
            scale={2}
            color={INK}
          />
          <PixelText
            font={font}
            text="TRASH SHOVES BY ITS WEIGHT. SATELLITES HOLE"
            scale={2}
            color={INK}
          />
          <PixelText
            font={font}
            text="CLIMB OUT OF THE JUNK. THEN LAND"
            scale={2}
            color={INK}
          />
          <PixelText font={font} text="▶ TAP TO LAUNCH" scale={2} color={HOT} />
        </div>
      )}
    </div>
  );
}

/**
 * THE DROP'S OWN DOOR — MOON LANDING, and what is about to happen. The same
 * two-card shape as the climb's: a title that names the beat and times itself
 * out, then (once per session) the briefing that WAITS — the module is a new
 * machine, and a player who discovers "the moon still pulls" by cratering has
 * paid a module for one sentence. The campaign shows it between the cabin
 * scenes and the drop; the arcade's MOON LANDING cabinet opens on it.
 */
export function MoonLandingIntro({
  font,
  onDone,
}: {
  font: PixelFont;
  /** The briefing is behind us: hand the module over. Called exactly once. */
  onDone: () => void;
}): ReactElement {
  const [page, setPage] = useState<"title" | "briefing">("title");

  const advance = () => {
    if (page === "title" && !landingShown) {
      landingShown = true;
      setPage("briefing");
      return;
    }
    onDone();
  };

  useEffect(() => {
    if (page !== "title") return;
    const id = window.setTimeout(advance, ROCKET_INTRO_MS);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  useEffect(() => {
    const skip = () => advance();
    window.addEventListener("keydown", skip);
    return () => window.removeEventListener("keydown", skip);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  return (
    <div
      className="drive-intro rocket-intro"
      onPointerDown={advance}
      role="presentation"
    >
      {page === "title" ? (
        <div key="title" className="drive-intro-card">
          <PixelText font={font} text="GET READY" scale={3} color="#7c8592" />
          <PixelText font={font} text="MOON LANDING" scale={6} color={HOT} />
        </div>
      ) : (
        <div key="briefing" className="drive-intro-card rocket-controls-card">
          <PixelText font={font} text="THE DROP" scale={4} color={HOT} />
          <PixelText
            font={font}
            text="ONE SIXTH GRAVITY. THE MODULE OBEYS"
            scale={2}
            color={INK}
          />
          <PixelText
            font={font}
            text="HOLD DOWN - BURN. KILL THE FALL"
            scale={2}
            color={INK}
          />
          <PixelText
            font={font}
            text="LEFT / RIGHT - TILT. KILL THE DRIFT"
            scale={2}
            color={INK}
          />
          <PixelText
            font={font}
            text="LAND SLOW AND LEVEL. THE PAD PAYS EXTRA"
            scale={2}
            color={INK}
          />
          <PixelText font={font} text="▶ TAP TO DROP" scale={2} color={HOT} />
        </div>
      )}
    </div>
  );
}
