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
  onReload,
  onDismiss,
}: {
  needRefresh: boolean;
  incomingVersion?: string | null;
  onReload: () => void;
  onDismiss: () => void;
}) {
  const [assets, setAssets] = useState<GameAssets | null>(null);

  useEffect(() => {
    let alive = true;
    void loadGameAssets().then((loaded) => {
      if (alive) setAssets(loaded);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Hold the prompt back until the sprite font is decoded: a flash of
  // system-font text that then snaps to pixels reads worse than a beat of
  // nothing. loadGameAssets is a shared memoized decode, so on the menu the
  // font is already in hand and this never actually waits.
  if (!needRefresh || !assets) return null;

  const font = assets.font;
  const icon = spriteDataUrl(assets.sprites, "upgrade") ?? "";

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
          onClick={onReload}
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
