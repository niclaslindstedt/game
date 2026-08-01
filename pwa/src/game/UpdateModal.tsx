// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The PWA "a new version is ready" prompt, dressed to match the game: a
// pixel-font panel with the upgrade sprite and chunky pixel buttons, in
// place of the framework's plain system-font UpdateToast. The update
// lifecycle still comes from the framework's usePwaUpdate (see App.tsx);
// this component is only the presentation, so a new deploy surfaces in the
// same pixel-art dressing as the rest of the menu.

import { useEffect, useState } from "react";

import { PixelText } from "@ui/lib/PixelText.tsx";

import { loadGameAssets, spriteDataUrl, type GameAssets } from "./assets.ts";

// The atlas ships a middle-dot glyph (·) but no bullet (•), so normalize the
// framework's `v0.1.0 · 97868a7` separator to the one the font renders.
const forPixelFont = (version: string) => version.replace(/•/g, "·");

export function UpdateModal({
  needRefresh,
  incomingVersion,
  runInProgress = false,
  onReload,
  onDismiss,
}: {
  needRefresh: boolean;
  incomingVersion?: string | null;
  /** A run is parked mid-level (the menu's CONTINUE). Applying the update
   * reloads the page, and a parked run only survives that when the new build
   * still reads the old save format — a shape change drops it (saved-run.ts).
   * So UPDATE asks first instead of quietly gambling the run. */
  runInProgress?: boolean;
  onReload: () => void;
  onDismiss: () => void;
}) {
  const [assets, setAssets] = useState<GameAssets | null>(null);
  // The confirm beat: UPDATE was pressed while a run is parked, and the modal
  // is asking whether to risk it. Never entered when nothing is at stake.
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let alive = true;
    void loadGameAssets().then((loaded) => {
      if (alive) setAssets(loaded);
    });
    return () => {
      alive = false;
    };
  }, []);

  // A dismissed (or applied) prompt drops the confirm beat with it, so a
  // later deploy's toast opens on the plain prompt again. Adjusted during
  // render (the derived-state pattern) rather than in an effect — the reset
  // must land before the next paint, and the lint forbids a bare
  // setState-in-effect for exactly this case.
  if (!needRefresh && confirming) setConfirming(false);

  // Hold the prompt back until the sprite font is decoded: a flash of
  // system-font text that then snaps to pixels reads worse than a beat of
  // nothing. loadGameAssets is a shared memoized decode, so on the menu the
  // font is already in hand and this never actually waits.
  if (!needRefresh || !assets) return null;

  const font = assets.font;
  const icon = spriteDataUrl(assets.sprites, "upgrade") ?? "";

  // The confirm beat: same panel, harder question. UPDATE ANYWAY applies the
  // update; BACK returns to the plain prompt (the run stays parked, the toast
  // stays up, nothing is decided).
  if (confirming) {
    return (
      <div
        className="update-modal"
        role="alertdialog"
        aria-label="update while a run is in progress"
      >
        <div className="update-modal-main">
          <img
            src={icon}
            alt=""
            className="update-modal-icon"
            aria-hidden="true"
          />
          <div className="update-modal-copy">
            <PixelText
              font={font}
              text="A RUN IS STILL IN PROGRESS"
              scale={2}
              color="#ffcf6b"
            />
            <PixelText
              font={font}
              text="IT MAY NOT SURVIVE THE UPDATE"
              scale={2}
              color="#9aa3ad"
            />
          </div>
        </div>
        <div className="update-modal-actions">
          <button
            type="button"
            className="pixel-button"
            aria-label="update-anyway"
            onClick={onReload}
          >
            <PixelText
              font={font}
              text="UPDATE ANYWAY"
              scale={2}
              color="#0b0d10"
            />
          </button>
          <button
            type="button"
            className="pixel-button secondary update-modal-dismiss"
            aria-label="cancel-update"
            onClick={() => setConfirming(false)}
          >
            <PixelText font={font} text="X" scale={3} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="update-modal"
      role="alertdialog"
      aria-label="a new version is ready"
    >
      <div className="update-modal-main">
        <img
          src={icon}
          alt=""
          className="update-modal-icon"
          aria-hidden="true"
        />
        <div className="update-modal-copy">
          <PixelText
            font={font}
            text="A NEW VERSION IS READY"
            scale={2}
            color="#7ef0c8"
          />
          {incomingVersion && (
            <PixelText
              font={font}
              text={forPixelFont(incomingVersion)}
              scale={2}
              color="#9aa3ad"
            />
          )}
        </div>
      </div>
      <div className="update-modal-actions">
        <button
          type="button"
          className="pixel-button"
          aria-label="update"
          onClick={() => {
            // A parked run is on the line: ask before the reload gambles it.
            // With nothing parked the update applies straight away, as before.
            if (runInProgress) setConfirming(true);
            else onReload();
          }}
        >
          <PixelText font={font} text="UPDATE" scale={3} color="#0b0d10" />
        </button>
        <button
          type="button"
          className="pixel-button secondary update-modal-dismiss"
          aria-label="dismiss-update"
          onClick={onDismiss}
        >
          <PixelText font={font} text="X" scale={3} />
        </button>
      </div>
    </div>
  );
}
