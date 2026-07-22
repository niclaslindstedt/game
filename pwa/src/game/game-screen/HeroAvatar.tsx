// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The hero-avatar inventory button — the dressed paper-doll portrait with
// the gold level badge hung on its corner. Shared between the playing HUD's
// status unit and the arrival-scene corner: an elite/boss stare-down hides
// the HUD proper but still offers the bag (see canOpenInventory), so the
// player can size up the speaker and equip a fitting weapon before the fight.

import type { GameState } from "@game/core";

import { type PixelFont } from "@ui/lib/pixel-font.ts";
import { PixelText } from "@ui/lib/PixelText.tsx";

import { spriteDataUrl, type GameAssets } from "../assets.ts";
import { dollDataUrl, playerDollLayers } from "../paper-doll.ts";

export function HeroAvatar({
  state,
  appearance,
  level,
  assets,
  font,
  onOpen,
}: {
  state: GameState | null;
  /** Player sprite family (`playerAppearance`) — the no-state fallback bust. */
  appearance: string;
  level: number;
  assets: GameAssets;
  font: PixelFont;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className="inventory-avatar"
      aria-label="open-inventory"
      onClick={onOpen}
    >
      {/* The bust lives in its own clipping frame so it can be zoomed to the
          torso; the level badge is a sibling OUTSIDE that frame, free to
          overhang the portrait's corner (the button itself doesn't clip). */}
      <span className="avatar-frame">
        {(() => {
          // The dressed paper-doll in worn armor — but WITHOUT the held weapon,
          // so the portrait is a clean square bust (the weapon has its own slot
          // right below it now).
          const src = state
            ? dollDataUrl(
                assets.sprites,
                playerDollLayers(state, "0", { weapon: false }),
              )
            : spriteDataUrl(assets.sprites, `${appearance}_0`);
          return src ? (
            <img src={src} alt="" className="pixel-img avatar-img" />
          ) : null;
        })()}
      </span>
      {/* The level, hung on the portrait's LOWER-LEFT corner (WoW-style) so its
          edges sit OUTSIDE the frame border — gold, so the hero's rank reads
          without a "LV" label. */}
      <span className="avatar-level">
        <PixelText font={font} text={String(level)} scale={1} color="#ffd75e" />
      </span>
    </button>
  );
}
