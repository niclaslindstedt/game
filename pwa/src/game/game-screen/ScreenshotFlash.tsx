// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SCREENSHOT FLASH — what the SCREENSHOT bind looks like from the player's
// side: the field whites out for a frame, and the picture that was just taken
// slides in against the right edge as a framed miniature, holds, and leaves.
//
// It is a RECEIPT, not a dialog. The run keeps playing behind it, it never
// takes the keyboard, and it goes away on its own — a screenshot key that
// stopped the game to ask what to do with the picture would be a screenshot key
// nobody presses twice. Pressing the miniature is the one thing it offers, and
// THAT freezes the run and opens the gallery on the shot (GameScreen).
//
// INERT, like the achievement toast and the pickup card it shares the field
// with: the banner never takes the press itself, because a touch landing on it
// is also a touch that could be anchoring the virtual dpad. The canvas
// hit-tests the element and routes the tap (controls.ts), which is why the root
// element is handed out through `flashRef`.
//
// It carries `data-shot-hidden`, so the NEXT capture leaves it out — otherwise
// two presses in a row put the first picture inside the second one.

import type { Ref } from "react";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

import { SHOT_HIDDEN_ATTR } from "../screenshots.ts";

/** How long the flash stays up, in ms. Must match the `shot-flash` animation
 * in styles.css. Shorter than the achievement toast on purpose: a badge is a
 * moment, a screenshot is an acknowledgement. */
export const SHOT_FLASH_TTL_MS = 3200;

export type ShotFlashData = {
  /** Bumped per capture; keys the mount so every shot replays the flash. */
  id: string;
  /** An object URL for the picture — the miniature's source. */
  url: string;
  /** Where the shot was taken (the venue's name), printed under the frame. */
  label: string;
};

export function ScreenshotFlash({
  font,
  flash,
  flashRef,
  /** Whether pressing the miniature can actually open the gallery here — false
   * over a scene or a splash, where the run is in no state to be frozen. The
   * hint line is what changes; the picture shows either way. */
  pressable,
}: {
  font: PixelFont;
  flash: ShotFlashData;
  flashRef?: Ref<HTMLDivElement>;
  pressable: boolean;
}) {
  return (
    <>
      {/* The camera's own flash: one frame of white over the whole field. Its
          own element rather than a filter on the screen root, so it costs a
          composited layer for 200ms and nothing after that. */}
      <div
        className="shot-flash-burst"
        aria-hidden="true"
        {...{ [SHOT_HIDDEN_ATTR]: "" }}
      />
      <div
        ref={flashRef}
        className="shot-flash"
        role="status"
        aria-live="polite"
        {...{ [SHOT_HIDDEN_ATTR]: "" }}
      >
        <div className="shot-flash-frame">
          <img src={flash.url} alt="" className="shot-flash-img" />
          <span className="shot-flash-sheen" aria-hidden="true" />
        </div>
        <div className="shot-flash-body">
          <PixelText font={font} text="SCREENSHOT" scale={1} color="#e8eef5" />
          <PixelText
            font={font}
            text={pressable ? "PRESS TO OPEN" : flash.label}
            scale={1}
            color="#8b949e"
            maxWidth={7}
          />
        </div>
      </div>
    </>
  );
}
