// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The developer ARSENAL viewer: a browsable gallery of every hand-authored
// UNIQUE / LEGENDARY item, ordered by item level. Each entry is MINTED as a
// real live instance (`mintUnique`) and inspected through the very same
// `ItemCard` the in-game inventory raises — so the arsenal shows each piece
// exactly as it reads in play and never drifts from it (no arsenal-only card,
// no diff hints). Reached from the hidden DEVELOPER menu (TitleScreen).
//
// Follows the achievements shelf's shape: a scrollable list steered by pointer
// or the arrow keys. Wide viewports dock the card BESIDE the list, always
// showing the selected row; narrow phones show ONLY the list and pop the card
// up as a modal on tap. ESC backs out.

import { useEffect, useMemo, useState } from "react";

import {
  createGame,
  equipmentName,
  mintUnique,
  UNIQUE_IDS,
  type Equipment,
} from "@game/core";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";
import { useMediaQuery } from "@ui/lib/use-media-query.ts";

import { synth } from "./audio.ts";
import { ItemCard, ItemCardModal, ItemIcon } from "./ItemCard.tsx";
import { playUiSound } from "./sfx/index.ts";
import { type RelicTier, type Sprites } from "./assets.ts";
import { TIER_COLORS, tierGlowClass } from "./tiers.ts";

/** Uppercase slot label for a list row's sub-line (WEAPON, HEAD, CHARM, …). */
const SLOT_LABEL: Record<Equipment["slot"], string> = {
  weapon: "WEAPON",
  head: "HEAD",
  chest: "CHEST",
  legs: "LEGS",
  feet: "FEET",
  charm: "CHARM",
  bag: "BAG",
};

export function ArsenalScreen({
  font,
  relicFonts,
  sprites,
  onClose,
}: {
  font: PixelFont;
  relicFonts: Record<RelicTier, PixelFont>;
  sprites: Sprites;
  onClose: () => void;
}) {
  // Mint every unique/legendary into a throwaway run so each reads with real,
  // in-game stats, then sort by item level (name-tiebroken for a stable order).
  // A fresh level-1 hero is the neutral stat backdrop the card is read against
  // — the same numbers a player sees inspecting the drop at the start of a run.
  const { state, items } = useMemo(() => {
    const state = createGame(1);
    const items = UNIQUE_IDS.map((id) => mintUnique(state, id)).sort(
      (a, b) =>
        a.ilvl - b.ilvl || equipmentName(a).localeCompare(equipmentName(b)),
    );
    return { state, items };
  }, []);

  // Wide viewports dock the card beside the list, always showing the selected
  // row; narrow phones drop the docked card and pop it up on tap instead.
  const wide = useMediaQuery("(min-aspect-ratio: 4/3)");

  const [cursor, setCursor] = useState(0);
  // Narrow-only: the item whose pop-up card is open (index into `items`), or
  // null. On wide the side panel follows `cursor` and this stays null.
  const [openItem, setOpenItem] = useState<number | null>(null);
  const selected = items[cursor] ?? null;

  // Doom-menu keys: arrows walk the list, ESC backs out. Enter pops the card on
  // narrow phones (where it isn't already docked beside the list).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // While a pop-up card is open it owns the keyboard (its own ESC closes
      // it); the shelf's shortcuts stand down.
      if (openItem !== null) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (items.length === 0) return;
        playUiSound(synth, "move");
        const delta = event.key === "ArrowDown" ? 1 : -1;
        setCursor((c) => (c + delta + items.length) % items.length);
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (items.length === 0 || wide) return;
        playUiSound(synth, "confirm");
        setOpenItem(cursor);
      } else if (event.key === "Escape") {
        event.preventDefault();
        playUiSound(synth, "back");
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [items.length, cursor, openItem, wide, onClose]);

  return (
    <div className="arsenal-overlay">
      <div className="arsenal-panel">
        <PixelText font={font} text="ARSENAL" scale={3} color="#c7a25a" />
        <PixelText
          font={font}
          text={`${items.length} UNIQUE & LEGENDARY ITEMS`}
          scale={1}
          color="#9aa3ad"
        />

        <div className="arsenal-body">
          <nav className="arsenal-list" aria-label="arsenal">
            {items.map((item, i) => {
              const selectedRow = i === cursor;
              const color = TIER_COLORS[item.tier];
              return (
                <button
                  key={item.id}
                  type="button"
                  ref={
                    selectedRow
                      ? (el) => el?.scrollIntoView({ block: "nearest" })
                      : undefined
                  }
                  className={`arsenal-row${selectedRow ? " selected" : ""}`}
                  aria-label={`arsenal-${item.defId}`}
                  // Only a MOUSE hover moves the cursor — a touch drag to scroll
                  // must not light up every row the finger passes over.
                  onPointerEnter={(event) => {
                    if (event.pointerType === "mouse") setCursor(i);
                  }}
                  // Tap/click selects the row; on narrow phones it also pops the
                  // card open. A scroll-drag isn't a click, so this never fires
                  // while flicking the list.
                  onClick={() => {
                    playUiSound(synth, "confirm");
                    setCursor(i);
                    if (!wide) setOpenItem(i);
                  }}
                >
                  <span
                    className={`inv-cell arsenal-cell${tierGlowClass(item.tier)}`}
                    style={{ borderColor: color }}
                  >
                    <ItemIcon sprites={sprites} item={item} />
                  </span>
                  <span className="arsenal-row-text">
                    <PixelText
                      font={font}
                      text={equipmentName(item)}
                      scale={2}
                      color={color}
                    />
                    <PixelText
                      font={font}
                      text={`ILVL ${item.ilvl} · ${SLOT_LABEL[item.slot]}`}
                      scale={1}
                      color="#7a8088"
                    />
                  </span>
                </button>
              );
            })}
          </nav>

          {wide && selected && (
            <div className="arsenal-detail">
              <ItemCard
                font={font}
                relicFonts={relicFonts}
                sprites={sprites}
                state={state}
                item={selected}
                compareTo={null}
              />
            </div>
          )}
        </div>

        <button
          type="button"
          className="pixel-button arsenal-close"
          aria-label="arsenal-back"
          onClick={() => {
            playUiSound(synth, "back");
            onClose();
          }}
        >
          <PixelText font={font} text="BACK" scale={2} color="#0b0d10" />
        </button>
      </div>

      {!wide && openItem !== null && items[openItem] && (
        <ItemCardModal
          font={font}
          relicFonts={relicFonts}
          sprites={sprites}
          state={state}
          item={items[openItem]}
          compareTo={null}
          onClose={() => setOpenItem(null)}
        />
      )}
    </div>
  );
}
