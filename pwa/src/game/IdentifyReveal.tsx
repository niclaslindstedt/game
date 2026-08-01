// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE IDENTIFY REVEAL — the item-found spectacle, moved to the moment it
// belongs to. A magic-or-better find drops UNIDENTIFIED and its pickup is a
// quiet feed line; when the merchant's counter (or an ITEM LOOKUP TICKET in
// the field) lifts the veil, THIS takes center stage: the piece's icon large
// over a dimming backdrop, the full stat card under it, and the pickup card's
// own rarity flourish (sparkles, flames, the legendary blast) playing over
// the figure. Center screen rather than the pickup card's thumb-reach band,
// because identifying is a deliberate act at a counter or in the bag — there
// is no hero being steered under it.
//
// Shaped like ItemCardModal (the arsenal's tap-to-inspect pop-up): backdrop
// tap or capture-phase ESC dismisses, the figure swallows its own clicks.
// Mounted by whichever panel performed the identify (ShopPanel /
// InventoryPanel) — the reveal is cued directly from the command's result,
// never from an engine event, because a UI-driven mutator's events are wiped
// by the next step() before the app's event pass reads them.

import { useEffect } from "react";

import { PixelText } from "@ui/lib/PixelText.tsx";

import { synth } from "./audio.ts";
import { ItemCard, ItemIcon, type ItemCardProps } from "./ItemCard.tsx";
import { RarityReveal } from "./PickupModal.tsx";
import { playUiSound } from "./sfx/ui.ts";
import { TIER_COLORS, TIER_LABELS, tierGlowClass } from "./tiers.ts";

export function IdentifyReveal({
  onClose,
  ...card
}: ItemCardProps & { onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        playUiSound(synth, "back");
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  const tier = card.item.tier;
  return (
    <div
      className="item-card-overlay identify-reveal"
      onClick={() => {
        playUiSound(synth, "back");
        onClose();
      }}
    >
      <div
        className="item-card-figure identify-reveal-figure"
        onClick={(event) => event.stopPropagation()}
      >
        {/* The pickup card's one-shot flourish, replayed over the figure —
            same component, so a legendary identifies with the same blast it
            would have dropped with. */}
        <RarityReveal tier={tier} />
        <PixelText
          font={card.font}
          text={
            TIER_LABELS[tier] ? `${TIER_LABELS[tier]} IDENTIFIED` : "IDENTIFIED"
          }
          scale={2}
          color={TIER_COLORS[tier]}
          className="identify-reveal-kicker"
        />
        <span
          className={`inv-cell item-card-figure-icon${tierGlowClass(tier)}`}
          style={{ borderColor: TIER_COLORS[tier] }}
        >
          <ItemIcon sprites={card.sprites} item={card.item} />
        </span>
        <ItemCard {...card} />
      </div>
    </div>
  );
}
