// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The inventory's floating item tooltip, extracted from InventoryPanel.tsx.
// Renders through the shared ItemCard so the tooltip and the arsenal viewer
// never drift.

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { wornCounterpart, type Equipment, type GameState } from "@game/core";

import { clamp as clampNum } from "@game/lib/vec.ts";
import { boxesOverlap, placeBeside } from "@ui/lib/anchor-box.ts";
import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

import type { RelicTier, Sprites } from "./assets.ts";
import { ItemCard } from "./ItemCard.tsx";

/**
 * WoW-style item tooltip: name (in tier color) plus the stat/affix lines,
 * floated next to the item that raised it. Portaled to <body> and positioned
 * in viewport coordinates from the anchoring cell's rect. The card NEVER
 * covers the cell that raised it — the icon must stay visible so the second
 * touch tap that commits the equip lands on something the player can see —
 * so it sits to the right, flips left, and on narrow screens drops below or
 * above the cell instead of clamping over it.
 *
 * Inspecting a bag piece whose slot already wears something ALSO raises the
 * worn piece's card, anchored over its own equip slot (covering THAT icon is
 * fine — the card repeats the icon in its header) and dodging the main card;
 * it carries an EQUIPPED kicker so the two cards can't be confused. Hidden on
 * the first paint until measured, to avoid a positioned flash. The card
 * CONTENT (name, stat lines, affixes) renders through the shared
 * `ItemCardBody`, so the tooltip and the arsenal viewer never drift.
 */
export function ItemTooltip({
  font,
  relicFonts,
  sprites,
  state,
  item,
  anchor,
  onUse,
}: {
  font: PixelFont;
  relicFonts: Record<RelicTier, PixelFont>;
  sprites: Sprites;
  state: GameState;
  item: Equipment;
  anchor: DOMRect;
  /**
   * Present only on a usable trinket in a place it works (a travel-gate key
   * on its home level — see gateKeyTarget): renders a USE row on the card.
   * The touch path to using it; desktop can also right-click the bag cell.
   */
  onUse?: () => void;
}) {
  const mainRef = useRef<HTMLDivElement>(null);
  const wornRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{
    main: { left: number; top: number };
    worn: { left: number; top: number } | null;
  } | null>(null);
  // The piece worn in this item's slot, for the side-by-side comparison —
  // unless we're inspecting that very piece (an item never compares to
  // itself; its own card says EQUIPPED instead).
  // `wornCounterpart` resolves a RING to the finger the piece would actually
  // land on (the weaker of the two), so the comparison shown is the trade the
  // player would really be making.
  const equipped = wornCounterpart(state, item);
  const isWorn = equipped?.id === item.id;
  const compareTo = equipped && !isWorn ? equipped : null;

  useLayoutEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const gap = 10;
    const margin = 6;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    // Beside the cell — right, else left, else below/above — never over it.
    // The rule itself is `@ui/lib/anchor-box.ts`, shared with the shop counter.
    const main = placeBeside(anchor, { width: w, height: h }, { gap, margin });

    // The worn piece's card: over its own equip slot when that doesn't
    // collide with the main card, else hugging the main card's free side.
    // No collision-free spot (tiny viewports) hides it — the main card's
    // (+N) deltas still carry the comparison.
    let worn: { left: number; top: number } | null = null;
    const wornEl = wornRef.current;
    if (wornEl) {
      const slotRect = document
        .querySelector(`[data-drop="slot:${item.slot}"]`)
        ?.getBoundingClientRect();
      const w2 = wornEl.offsetWidth;
      const h2 = wornEl.offsetHeight;
      // Colliding with the main card is a bad spot; so is covering the
      // inspected cell — the worn card obeys the same "the icon that raised
      // the tooltip stays visible" rule as the main card.
      const collides = (p: { left: number; top: number }) =>
        boxesOverlap(
          { ...p, width: w2, height: h2 },
          { left: main.left, top: main.top, width: w, height: h },
        ) ||
        boxesOverlap(
          { ...p, width: w2, height: h2 },
          {
            left: anchor.left,
            top: anchor.top,
            width: anchor.width,
            height: anchor.height,
          },
        );
      const candidates: { left: number; top: number }[] = [];
      if (slotRect) {
        candidates.push({
          left: clampNum(slotRect.left, margin, vw - margin - w2),
          top: clampNum(slotRect.top, margin, vh - margin - h2),
        });
      }
      candidates.push(
        {
          left: main.left - gap - w2,
          top: clampNum(main.top, margin, vh - margin - h2),
        },
        {
          left: main.left + w + gap,
          top: clampNum(main.top, margin, vh - margin - h2),
        },
        {
          left: clampNum(main.left, margin, vw - margin - w2),
          top: main.top - gap - h2,
        },
        {
          left: clampNum(main.left, margin, vw - margin - w2),
          top: main.top + h + gap,
        },
      );
      worn =
        candidates.find(
          (p) =>
            p.left >= margin &&
            p.left + w2 <= vw - margin &&
            p.top >= margin &&
            p.top + h2 <= vh - margin &&
            !collides(p),
        ) ?? null;
    }
    setPos({ main, worn });
  }, [anchor, item, compareTo]);

  return createPortal(
    <>
      <ItemCard
        cardRef={mainRef}
        className="item-tooltip"
        style={{
          left: pos?.main.left ?? anchor.right + 10,
          top: pos?.main.top ?? anchor.top,
          visibility: pos ? "visible" : "hidden",
        }}
        font={font}
        relicFonts={relicFonts}
        sprites={sprites}
        state={state}
        item={item}
        compareTo={compareTo}
        subtitle={isWorn ? "EQUIPPED" : undefined}
      >
        {onUse && (
          <button
            type="button"
            className="pixel-button tooltip-use"
            // Swallow the press so the overlay's tap-to-dismiss and the drag
            // machinery never see it — this click is the whole gesture.
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onUse}
          >
            <PixelText font={font} text="USE" scale={2} color="#0b0d10" />
          </button>
        )}
      </ItemCard>
      {compareTo && (
        <ItemCard
          cardRef={wornRef}
          className="item-tooltip"
          style={{
            left: pos?.worn?.left ?? 0,
            top: pos?.worn?.top ?? 0,
            visibility: pos?.worn ? "visible" : "hidden",
          }}
          font={font}
          relicFonts={relicFonts}
          sprites={sprites}
          state={state}
          item={compareTo}
          compareTo={null}
          subtitle="EQUIPPED"
        />
      )}
    </>,
    document.body,
  );
}
