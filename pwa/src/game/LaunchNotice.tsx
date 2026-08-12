// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE LAUNCH NOTICE — what a build whose licensed features were switched on by
// command line says before it lets anybody at the menu.
//
// It used to be an OPERATING-SYSTEM MESSAGE BOX (`dialog.showMessageBoxSync` in
// electron/src/main.ts), raised before the window existed: a system-font panel
// with the platform's own buttons, in front of a black rectangle, seconds
// before the game drew its first pixel. Nothing about it belonged to the game —
// which is a poor way to make somebody read a sentence about the terms they are
// playing under, and a worse first impression than the studio card it cut in
// front of. So the shell now states the FACT (`__GIS_UNLOCKED__`, see
// pwa/src/app/launch-options.ts) and this says the WORDS, in the game's own
// window skin, over the title menu the player is about to reach.
//
// WHAT IT KEEPS FROM THE DIALOG IT REPLACED, because all three were the point:
//
//   • IT IS SHOWN ON EVERY SUCH LAUNCH. A "don't ask again" would turn an
//     acknowledgement into a checkbox, so nothing here is remembered — the page
//     load IS the launch.
//   • IT IS A REFUSAL, NOT A TOAST. The menu is not behind it, it is not
//     dismissible by pressing elsewhere, and there is no Escape out of it: the
//     ways out are understanding it or QUIT, exactly as the dialog's cancel path
//     closed the game rather than starting it with the options quietly dropped.
//   • THE PROPER WAY TO PLAY IS A BUTTON. The store page is offered beside the
//     way to carry on, not printed as a line of text somebody has to copy out.
//     It is absent (rather than dead) until `game.config.json` carries a
//     `steamUrl`, which is the same rule every other store link in the game
//     follows.
//
// AND IT NOW ANSWERS TWO FACTS, NOT ONE. The second is the AUTO PILOT: no
// desktop build carries the ride, `--autopilot` is the developer switch that
// hands it back, and it costs the launch its multiplayer — which is a thing
// somebody has to be told before they wonder where the HOST row went. It is one
// box with a paragraph per reason rather than two boxes stacked, because what
// the player is being asked for is the same single acknowledgement.
//
// The copy is UPPERCASED BY THE FONT (there are no lowercase glyphs), so it is
// written short: four sentences of all-caps is a paragraph nobody finishes.

import { useEffect, useRef, useState } from "react";

import { useAutoFocus } from "@ui/lib/auto-focus.ts";
import type { PixelFont } from "@ui/lib/pixel-font.ts";
import { PixelText } from "@ui/lib/PixelText.tsx";
import { columnCapRem, useTextColumn } from "@ui/lib/use-text-column.ts";

import type { LaunchNoticeReasons } from "../app/launch-options.ts";
import { canQuitApp, quitApp } from "../app/quit-bridge.ts";
import { IDENTITY } from "../identity.ts";
import { synth } from "./audio.ts";
import { AUTOPILOT_NOTICE, LAUNCH_NOTICE } from "./copy.ts";
import { LoadingScreen } from "./LoadingScreen.tsx";
import { playUiSound } from "./sfx/ui.ts";
import { loadUiFont, peekUiFont } from "./ui-font.ts";

/** The pixel scale the body is drawn at — the quality bar's floor for text the
 * player has to read to act (scale 1 is for captions). */
const BODY_SCALE = 2;

/** What the body wraps to until the column has measured itself, in rem. Only
 * ever used for the first frame; `columnCapRem` takes over from the real box. */
const BODY_FALLBACK_REM = 26;

export function LaunchNotice({
  reasons,
  onAccept,
}: {
  /** WHAT this launch has to be told about — the licence, the AUTO PILOT, or
   * both (`pwa/src/app/launch-options.ts`). One box either way: the heading,
   * the acknowledgement and the QUIT are the notice's, and each reason
   * contributes its own paragraph and its own store button. */
  reasons: LaunchNoticeReasons;
  onAccept: () => void;
}) {
  // The UI FONT rather than the sprite atlas (`assets.ts`): the notice draws
  // text and nothing else, and it stands in front of the menu — reaching the
  // atlas for a font would make this wait on the whole sprite catalogue.
  const [font, setFont] = useState<PixelFont | null>(() => peekUiFont());
  useEffect(() => {
    if (font) return;
    let live = true;
    void loadUiFont().then((loaded) => {
      if (live) setFont(loaded);
    });
    return () => {
      live = false;
    };
  }, [font]);

  // The body re-breaks to the box it is ACTUALLY drawn in — a constant would
  // disagree with the column on one of the ten reference viewports, and the
  // 2× tiers move the goalposts (see `useTextColumn`).
  const { ref: bodyRef, fontPx: colFontPx } = useTextColumn(BODY_SCALE);
  const acceptRef = useRef<HTMLButtonElement>(null);
  // The notice owns the keyboard while it is up: ENTER/SPACE lands on the
  // button that carries on, and the gamepad reaches it the same way, because
  // the pad steers menus by dispatching those very keys.
  useAutoFocus(acceptRef);

  if (!font) return <LoadingScreen />;

  // Each reason's own way to get the thing properly: the licensed edition is on
  // Steam, the AUTO PILOT is on a phone. Both are absent rather than dead until
  // `game.config.json` carries the listing, which is the rule every store link
  // in the game follows.
  const storeUrl = reasons.licence ? IDENTITY.steamUrl : "";
  const phoneUrl = reasons.autopilot ? IDENTITY.appStoreUrl : "";
  const cap = columnCapRem(colFontPx, BODY_SCALE, BODY_FALLBACK_REM);
  const line = (text: string) => (
    <PixelText
      font={font}
      text={text}
      scale={BODY_SCALE}
      color="#cfd6de"
      maxWidth={cap}
    />
  );

  return (
    <div
      className="launch-notice"
      role="alertdialog"
      aria-label="launch options notice"
    >
      <div className="launch-notice-box pixel-panel">
        <PixelText
          font={font}
          text={LAUNCH_NOTICE.heading}
          scale={3}
          color="#ffcf6b"
        />
        <div className="launch-notice-body" ref={bodyRef}>
          {reasons.licence ? line(LAUNCH_NOTICE.what) : null}
          {reasons.licence && storeUrl ? line(LAUNCH_NOTICE.where) : null}
          {reasons.licence ? line(LAUNCH_NOTICE.terms) : null}
          {reasons.autopilot ? line(AUTOPILOT_NOTICE.what) : null}
          {reasons.autopilot ? line(AUTOPILOT_NOTICE.terms) : null}
          {reasons.autopilot && phoneUrl ? line(AUTOPILOT_NOTICE.where) : null}
        </div>
        <div className="launch-notice-actions">
          <button
            ref={acceptRef}
            type="button"
            className="pixel-button modal-action"
            aria-label="accept-launch-notice"
            onClick={() => {
              playUiSound(synth, "confirm");
              onAccept();
            }}
          >
            <PixelText
              font={font}
              text={LAUNCH_NOTICE.accept}
              scale={2}
              color="#0b0d10"
            />
          </button>
          {storeUrl ? (
            <button
              type="button"
              className="pixel-button secondary modal-action"
              aria-label="open-store-page"
              onClick={() => {
                playUiSound(synth, "confirm");
                // The shells deny the popup and hand the URL to the player's
                // own browser (`setWindowOpenHandler` in electron/src/main.ts,
                // the navigation guard in the Tauri shell), so the game is
                // still standing here when they come back.
                window.open(storeUrl, "_blank", "noopener,noreferrer");
              }}
            >
              <PixelText font={font} text={LAUNCH_NOTICE.store} scale={2} />
            </button>
          ) : null}
          {phoneUrl ? (
            <button
              type="button"
              className="pixel-button secondary modal-action"
              aria-label="open-phone-store-page"
              onClick={() => {
                playUiSound(synth, "confirm");
                window.open(phoneUrl, "_blank", "noopener,noreferrer");
              }}
            >
              <PixelText font={font} text={AUTOPILOT_NOTICE.store} scale={2} />
            </button>
          ) : null}
          {canQuitApp() ? (
            <button
              type="button"
              className="pixel-button secondary modal-action"
              aria-label="quit-from-launch-notice"
              onClick={() => {
                playUiSound(synth, "back");
                quitApp();
              }}
            >
              <PixelText font={font} text={LAUNCH_NOTICE.quit} scale={2} />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
