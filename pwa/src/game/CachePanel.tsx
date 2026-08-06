// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CACHE — the garage chest's own window (src/game/cache.ts).
//
// TWO GRIDS AND ONE GESTURE, which is the whole design. The chest is on top,
// the bag underneath, and TAPPING A CELL MOVES IT TO THE OTHER GRID: tap
// something in the bag and it goes into the chest, tap something in the chest
// and it comes back. There is no drag, no pick-up-and-place, no destination to
// aim at — the engine puts the piece in the first free cell either way
// (`stashItem` / `takeFromCache`), which is what lets one tap be the whole
// interaction on a phone held in two hands.
//
// The alternative — D2's own carry-the-cursor drag — needs a precise drop
// target, and the reference device is a 844×390 phone where a bag cell is about
// a thumbnail. The bag panel affords drag because it has somewhere meaningful to
// drop (a specific equip slot); a stash does not. Both halves of a stash move
// are "put this on the other side", so both are one tap.
//
// It borrows the SHOP's skin wholesale — the same overlay, the same panel, the
// same section headings and cells — because it is the same kind of surface: two
// inventories side by side with the hero moving pieces between them. A stash
// that looked like its own thing would be a second vocabulary for a gesture the
// player already knows.

import { useReducer, useState } from "react";

import {
  CACHE,
  equipmentName,
  isArmorBroken,
  isWeaponBroken,
  type Equipment,
  type GameState,
} from "@game/core";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

import { spriteDataUrl, type RelicTier, type Sprites } from "./assets.ts";
import { synth } from "./audio.ts";
import { ItemCardModal, ItemIcon } from "./ItemCard.tsx";
import { localHero } from "./local-seat.ts";
import { runCommand } from "./run-commands.ts";
import { playUiSound } from "./sfx/ui.ts";
import { TIER_COLORS, tierGlowClass } from "./tiers.ts";

/** Which side of the window a cell is on. The two differ only in the verb the
 * tap runs, so everything else about a cell is shared. */
type Side = "cache" | "bag";

export function CachePanel({
  state,
  font,
  relicFonts,
  sprites,
  onChange,
  onClose,
}: {
  state: GameState;
  font: PixelFont;
  relicFonts?: Record<RelicTier, PixelFont>;
  sprites: Sprites;
  onChange: () => void;
  onClose: () => void;
}) {
  // The two grids are read straight off the live hero every render, so a move
  // shows up without either side being told what changed. `bump` is what a
  // successful command re-reads through — the same idiom the shop uses.
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const player = localHero(state);
  const cache = player.cache;
  const bag = player.inventory;
  /** The piece whose full card is open, if any. A LONG look at a find is what
   * the player is here for — this is where they decide what is worth keeping —
   * so inspecting is a deliberate second gesture rather than something a move
   * has to dodge. */
  const [inspect, setInspect] = useState<Equipment | null>(null);

  const used = cache.filter(Boolean).length;
  const bagUsed = bag.filter(Boolean).length;

  const move = (side: Side, index: number) => () => {
    // BOTH VERBS RETURN THE CELL THEY LANDED IN, and the first cell is 0 — so
    // the answer is tested against null rather than for truthiness. Read as a
    // boolean, every move into an empty chest's first slot would report itself
    // as a refusal and leave the grid un-redrawn.
    const landed = runCommand(
      state,
      side === "bag" ? "stashItem" : "takeFromCache",
      index,
    );
    const ok = typeof landed === "number";
    // A REFUSED MOVE SAYS SO. The only two ways either verb fails are a full
    // destination and an empty cell, and the second cannot happen from a cell
    // the player can see something in — so a "back" note here always means
    // "there is no room over there", which is the one thing they need told.
    playUiSound(synth, ok ? "confirm" : "back");
    if (ok) {
      bump();
      onChange();
    }
  };

  /** One cell of either grid — the bag's own look, so a piece reads the same
   * on both sides of the window and in the bag panel next door. */
  const cell = (item: Equipment | null, side: Side, index: number) => (
    <button
      key={`${side}:${index}`}
      type="button"
      className={`inv-cell cache-cell${
        item && (isArmorBroken(item) || isWeaponBroken(item)) ? " broken" : ""
      }${item ? tierGlowClass(item.tier) : ""}`}
      aria-label={item ? equipmentName(item) : `${side}-${index}-empty`}
      disabled={!item}
      style={item ? { borderColor: TIER_COLORS[item.tier] } : undefined}
      onClick={item ? move(side, index) : undefined}
      onContextMenu={
        item
          ? (e) => {
              e.preventDefault();
              setInspect(item);
            }
          : undefined
      }
    >
      {item && <ItemIcon sprites={sprites} item={item} />}
    </button>
  );

  return (
    <div className="game-overlay" role="presentation">
      <div className="inventory-panel shop-panel cache-panel">
        <div className="shop-header">
          <span className="shop-portrait-frame">
            <img
              src={spriteDataUrl(sprites, "antique_chest") ?? undefined}
              alt=""
              className="pixel-img"
            />
          </span>
          <PixelText
            font={font}
            text="THE CACHE"
            scale={3}
            color="#ffd75e"
            className="shop-name"
          />
          <PixelText
            font={font}
            text={`${used}/${CACHE.slots}`}
            scale={2}
            color={used >= CACHE.slots ? "#e06a6a" : "#9aa3ad"}
          />
        </div>

        {/* THE CHEST, on top — what is being kept. It is the reason the window
            is open, so it gets the first read. */}
        <div className="shop-section">
          <div className="shop-section-heading">
            <PixelText font={font} text="KEPT" scale={3} color="#e0b955" />
            <PixelText
              font={font}
              text="TAP TO TAKE BACK"
              scale={2}
              color="#5a6470"
            />
          </div>
          <div className="inv-bag-frame">
            <div className="inv-grid inv-bag-grid cache-grid">
              {cache.map((item, index) => cell(item, "cache", index))}
            </div>
          </div>
        </div>

        {/* THE BAG, underneath — what is being carried, and the source of
            everything above. */}
        <div className="shop-section">
          <div className="shop-section-heading">
            <PixelText font={font} text="CARRIED" scale={3} color="#9aa3ad" />
            <PixelText
              font={font}
              text={used >= CACHE.slots ? "THE CHEST IS FULL" : "TAP TO KEEP"}
              scale={2}
              color={used >= CACHE.slots ? "#e06a6a" : "#5a6470"}
            />
          </div>
          <div className="inv-bag-frame">
            <div className="inv-grid inv-bag-grid cache-grid">
              {bag.map((item, index) => cell(item, "bag", index))}
            </div>
          </div>
        </div>

        <div className="inv-footer">
          <PixelText
            font={font}
            text={`BAG ${bagUsed}/${bag.length}`}
            scale={2}
            color="#5a6470"
          />
          <button type="button" className="pixel-button" onClick={onClose}>
            <PixelText font={font} text="CLOSE" scale={3} />
          </button>
        </div>
      </div>

      {inspect && (
        <ItemCardModal
          font={font}
          relicFonts={relicFonts}
          sprites={sprites}
          state={state}
          item={inspect}
          onClose={() => setInspect(null)}
        />
      )}
    </div>
  );
}
