// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT A JOINER LOOKS AT WHILE THE DOOR IS BEING OPENED.
//
// It exists because the wait is genuinely long and genuinely fallible: a probe
// that may go unanswered for six seconds, a handshake, and then a level being
// built on somebody else's machine. A spinner would be the wrong shape for that
// — what a player needs is WHO is being reached and, if it does not work, WHY.
//
// **A REFUSAL IS THE POINT OF THE SCREEN, NOT ITS ERROR STATE.** Version skew
// is the failure this whole handshake exists for, and the difference between
// "could not connect" and "one of you needs to update - build 1.4.2 here, 1.5.0
// there" is the difference between a bug report and a player who fixes it in a
// minute. The wording is the wire's own (`net-text.ts`).

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

export function ConnectingScreen({
  font,
  target,
  refusal,
  onBack,
}: {
  font: PixelFont;
  /** Who is being reached — a browser row's session name, or the address as it
   * was typed. Never "the server": a player joining two friends' games in a row
   * has to be able to see which one this is. */
  target: string;
  /** The refusal, once there is one. Until then the join is still in flight. */
  refusal: string | null;
  /** Give up and go back to the menu. */
  onBack: () => void;
}) {
  return (
    <div className="game-loading net-connecting">
      <PixelText
        font={font}
        text={refusal ? "COULD NOT JOIN" : "CONNECTING"}
        scale={3}
        color={refusal ? "#ff6d6d" : "#7ef0c8"}
      />
      <PixelText
        font={font}
        text={target.toUpperCase()}
        scale={2}
        color="#9aa3ad"
      />
      {refusal && (
        // Wrapped to a share of the viewport rather than to a fixed width: a
        // refusal naming two builds is a long line, and a phone held in
        // landscape is the reference device.
        <PixelText
          font={font}
          text={refusal}
          scale={2}
          color="#ffd75e"
          align="center"
          maxWidth={22}
        />
      )}
      <button
        type="button"
        className="pixel-button secondary"
        aria-label="net-connect-back"
        onClick={onBack}
      >
        <PixelText font={font} text="BACK" scale={2} color="#9aa3ad" />
      </button>
    </div>
  );
}
