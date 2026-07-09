// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The pickup card: a bordered panel — dressed like the HUD clock/kill units —
// that pops in mid-screen when a weapon or item drops into the bag, showing the
// piece's icon and its rarity-tinted name. A spark laps the frame so a fresh
// find reads as "new and shiny", not chrome. Only bag gear triggers it; loose
// pickups (medkits, arrows, powerups) stay in the lower-corner PickupFeed.
//
// One card shows at a time — the newest replaces whatever is on screen. The
// caller keys the mount by the card's id so a new pickup restarts the pop and
// spark, and clears it after PICKUP_CARD_TTL_MS (kept in sync with the CSS
// animation length in styles.css).

import type { CSSProperties } from "react";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

/** How long a pickup card stays on screen before it clears, in ms. Must match
 * the `.pickup-card` animation duration in styles.css. */
export const PICKUP_CARD_TTL_MS = 2600;

export type PickupCard = {
  /** Bumped per pickup; used as the mount key so the pop/spark restart. */
  id: number;
  /** The piece's icon as a data URL (equipmentIcon → spriteDataUrl), if any. */
  icon?: string;
  /** The item's display name. */
  name: string;
  /** Rarity (tier) color — tints both the name and the frame. */
  color: string;
};

export function PickupModal({
  font,
  card,
}: {
  font: PixelFont;
  card: PickupCard;
}) {
  return (
    <div
      className="pickup-card"
      style={{ "--rarity": card.color } as CSSProperties}
      aria-live="polite"
    >
      <span className="pickup-card-spark" aria-hidden="true" />
      {card.icon && (
        <img src={card.icon} alt="" className="pixel-img pickup-card-icon" />
      )}
      <PixelText font={font} text={card.name} scale={2} color={card.color} />
    </div>
  );
}
