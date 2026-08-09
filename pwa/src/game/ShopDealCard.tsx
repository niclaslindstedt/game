// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The counter's FLOATING DEAL CARD: what a tapped stall entry or bag piece is,
// and the one button that trades it — raised beside the cell that was tapped
// rather than laid out in a section of its own.
//
// It replaced a fixed detail bar at the foot of the shop, and the reason is
// space: that bar had to be tall enough for the tallest thing it might ever
// show (a legendary weapon's full stat block) on every frame, including the ones
// where nothing was selected at all, and on a phone it ate about a third of the
// modal for a hint that read TAP AN ITEM TO TRADE. A hover card costs nothing
// until it is asked for, so the stall and the bag get the room back.
//
// An EQUIPMENT deal renders through the shared `ItemCard` — the same card the
// inventory floats and the arsenal docks — so a weapon reads identically
// wherever it is inspected, comparison deltas included. A powerup or a
// consumable has no `Equipment` to describe, so it wears the same skin around a
// short authored body (what it does, how long it lasts, how many are left).
// Positioning is `@ui/lib/anchor-box.ts`, shared with the inventory tooltip:
// beside the cell, NEVER over it, because on touch the second tap has to land
// on the icon the first one raised.

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import {
  abilityDef,
  MEDKIT,
  medkitTierIndex,
  stockName,
  type Equipment,
  type GameState,
  type MerchantConsumable,
  type MerchantStock,
} from "@game/core";

import { placeBeside, type BoxPos } from "@ui/lib/anchor-box.ts";
import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

import { type RelicTier, type Sprites } from "./assets.ts";
import {
  medkitColorFor,
  REPAIR_KIT_COLOR,
  STAMINA_POTION_COLOR,
} from "./consumables.ts";
import { ItemCard, ITEM_CARD_TEXT_REM } from "./ItemCard.tsx";

/** The electric blue a powerup is named in everywhere — the pickup toast, the
 * dock, the stall cell's rim. A power is not a rarity, so it borrows no tier
 * colour. */
export const POWERUP_BLUE = "#7ecbff";

/** What the player tapped, and therefore what the card offers to do. */
export type ShopDeal =
  | { kind: "stock"; entry: MerchantStock }
  | { kind: "bag"; index: number; item: Equipment };

/** The colour a non-equipment card is rimmed and named in: a power's blue, a
 * consumable's own dock accent (medkit quality, drink green, toolbox amber) —
 * so the card agrees with the slot the purchase lands in. */
function dealTint(entry: MerchantStock): string {
  if (entry.kind === "ability") return POWERUP_BLUE;
  if (entry.kind === "consumable") {
    if (entry.item === "medkit") {
      return medkitColorFor(medkitTierIndex(entry.tier));
    }
    return entry.item === "repair" ? REPAIR_KIT_COLOR : STAMINA_POTION_COLOR;
  }
  return POWERUP_BLUE; // unreachable: a weapon renders through ItemCard
}

/** What a consumable DOES, in one line. The medkit's figure is read off the
 * engine's own tier table rather than typed, so a rebalance of `MEDKIT.tiers`
 * moves the counter's copy with it. */
function consumableEffect(
  item: MerchantConsumable,
  tier: number | undefined,
): string {
  switch (item) {
    case "medkit": {
      const quality = MEDKIT.tiers[medkitTierIndex(tier)];
      const pct = Math.round((quality?.healPct ?? 0) * 100);
      return pct >= 100 ? "RESTORES FULL HEALTH" : `RESTORES ${pct}% HEALTH`;
    }
    case "repair":
      return "MENDS THE WHOLE KIT";
    case "drink":
      return "REFILLS THE SPRINT POOL";
  }
}

/** The lines under a non-equipment card's name: what it does, and the fine
 * print that changes how it is spent. */
function stockLines(entry: MerchantStock): string[] {
  if (entry.kind === "consumable") {
    return [consumableEffect(entry.item, entry.tier), "CARRIED IN THE DOCK"];
  }
  if (entry.kind === "ability") {
    const def = abilityDef(entry.defId);
    const lines = [
      def.durationMs > 0
        ? `LASTS ${Math.round(def.durationMs / 1000)} SECONDS`
        : "SPENT INSTANTLY",
    ];
    if (def.stackable) lines.push("COPIES STACK");
    if (def.uniqueHeld) lines.push("ONE IN THE DOCK AT A TIME");
    return lines;
  }
  return [];
}

/**
 * The card body for a stall entry that is NOT equipment: the name in its own
 * accent, the kicker naming what kind of thing it is, what it does, and —
 * because the stall no longer restocks — how many are left. `qty` is the whole
 * reason the line exists: a shelf that runs out is a decision, and a decision
 * needs its number on screen.
 *
 * THE NAME LEADS AND THE KICKER SITS UNDER IT, which is the order an equipment
 * card already reads in (name, then ITEM LEVEL, then what it does) — the kicker
 * led here for a while and made every consumable card open with the same grey
 * word instead of with the thing the player tapped.
 */
function StockCardBody({
  font,
  entry,
}: {
  font: PixelFont;
  entry: MerchantStock;
}) {
  const tint = dealTint(entry);
  const kicker = entry.kind === "ability" ? "POWERUP" : "CONSUMABLE";
  return (
    <>
      {/* 2× like every other line on the card: the pixel font at 1× is a
          three-pixel-tall glyph, which on a phone held at arm's length is not
          small text, it is texture. Nothing here is decoration — the kicker is
          what tells you whether the BUY button hands you a power or a bandage. */}
      <PixelText
        font={font}
        text={stockName(entry)}
        scale={2}
        color={tint}
        maxWidth={ITEM_CARD_TEXT_REM}
      />
      <PixelText font={font} text={kicker} scale={2} color="#9aa3ad" />
      {/* WHAT IT DOES, set apart from the facts around it by a couple of pixels
          more air than the card's own line gap. It is the one block on the card
          that is a SENTENCE rather than a label or a number, and at the shared
          gap it read as two more grey rows in a stack of grey rows. */}
      <div className="shop-card-desc">
        {stockLines(entry).map((line) => (
          <PixelText
            key={line}
            font={font}
            text={line}
            scale={2}
            color="#9aa3ad"
            maxWidth={ITEM_CARD_TEXT_REM}
          />
        ))}
      </div>
      <PixelText
        font={font}
        text={entry.qty > 0 ? `${entry.qty} LEFT` : "SOLD OUT"}
        scale={2}
        color={entry.qty > 0 ? "#e6e8eb" : "#e06a6a"}
      />
    </>
  );
}

/**
 * The deal card, portaled to `<body>` and positioned in viewport coordinates
 * beside `anchor`. Hidden until measured (one layout pass), so it never flashes
 * at the wrong spot; `action` is the BUY/SELL control, seated at the card's foot
 * where the inventory tooltip's USE row sits.
 */
export function ShopDealCard({
  font,
  relicFonts,
  sprites,
  state,
  deal,
  anchor,
  compareTo,
  action,
}: {
  font: PixelFont;
  relicFonts: Record<RelicTier, PixelFont>;
  sprites: Sprites;
  state: GameState;
  deal: ShopDeal;
  anchor: DOMRect;
  /** The piece worn in this item's slot, for the green/red deltas (equipment
   * deals only) — so a purchase reads as an upgrade and a sale as a loss. */
  compareTo: Equipment | null;
  action: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<BoxPos | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setPos(
      placeBeside(anchor, {
        width: el.offsetWidth,
        height: el.offsetHeight,
      }),
    );
  }, [anchor, deal]);

  const style = {
    left: pos?.left ?? anchor.right + 10,
    top: pos?.top ?? anchor.top,
    visibility: pos ? ("visible" as const) : ("hidden" as const),
  };
  // The whole card swallows its own presses so nothing under it reads them as
  // a press on the counter. (The DISMISS rule already spares the card — it
  // keys on the `item-tooltip` class both branches below wear, not on
  // propagation — but a portal's events still travel the React tree that
  // rendered it, and the panel below has other handlers.)
  const swallow = (event: { stopPropagation: () => void }) =>
    event.stopPropagation();

  const item = deal.kind === "bag" ? deal.item : null;
  const stockItem =
    deal.kind === "stock" && deal.entry.kind === "weapon"
      ? deal.entry.equipment
      : null;
  const equipment = item ?? stockItem;

  return createPortal(
    <div
      className="shop-deal-portal"
      onPointerDown={swallow}
      onPointerUp={swallow}
      onClick={swallow}
    >
      {equipment ? (
        <ItemCard
          cardRef={ref}
          className="item-tooltip shop-deal-card"
          style={style}
          font={font}
          relicFonts={relicFonts}
          sprites={sprites}
          state={state}
          item={equipment}
          compareTo={compareTo}
        >
          {action}
        </ItemCard>
      ) : (
        deal.kind === "stock" && (
          <div
            ref={ref}
            className="item-card item-tooltip shop-deal-card"
            style={{ borderColor: dealTint(deal.entry), ...style }}
          >
            <StockCardBody font={font} entry={deal.entry} />
            {action}
          </div>
        )
      )}
    </div>,
    document.body,
  );
}
