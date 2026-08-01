// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE BUY-BACK SHELF — take back what you just sold him.
//
// Raised from the shop's own footer, beside the sell tools it exists to undo:
// the last dozen pieces sold across this counter (config
// `MERCHANT.buybackSlots`), most recent first, each redeemable for exactly the
// coins he paid. A buy-back is an UNDO rather than a purchase, which is why
// there is no vendor markup on it and no two-step confirm in front of it — the
// worst a stray tap can do here is put a mop back in the bag for what the mop
// sold for.
//
// It wears the LOST & FOUND's skin wholesale (the same overlay, panel, list,
// price column and docked/pop-up ItemCard — see VaultScreen.tsx), because the
// two answer the same question in the same words: here is something that left
// your bag, here is what it costs to have it back. A player who has used one
// already knows this one.
//
// What it does NOT borrow is that screen's armed CONFIRM. The vault sells a
// legendary back for two billion coins, so a mis-tap there is a catastrophe; a
// buy-back is priced at the sale and moves no money at all. Two taps to undo a
// mis-tap would be one tap too many.

import { Fragment, useEffect, useReducer, useState } from "react";

import {
  buybackContents,
  equipmentName,
  type BuybackRefusal,
  type Equipment,
  type GameState,
} from "@game/core";

import { formatCoins } from "@ui/lib/format-number.ts";
import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";
import { useMediaQuery } from "@ui/lib/use-media-query.ts";

import { spriteDataUrl, type RelicTier, type Sprites } from "./assets.ts";
import { synth } from "./audio.ts";
import { ItemCard, ItemCardModal, ItemIcon } from "./ItemCard.tsx";
import { localHero } from "./local-seat.ts";
import { runCommand } from "./run-commands.ts";
import { playUiSound } from "./sfx/ui.ts";
import { TIER_COLORS, tierGlowClass } from "./tiers.ts";
import { useHelpWrapRem } from "./title-screen/use-title-layout.ts";

/** Uppercase slot label for a row's sub-line — the same vocabulary the LOST &
 * FOUND lists a banked piece under. */
const SLOT_LABEL: Record<Equipment["slot"], string> = {
  weapon: "WEAPON",
  head: "HEAD",
  chest: "CHEST",
  legs: "LEGS",
  feet: "FEET",
  amulet: "AMULET",
  ring: "RING",
  trinket: "TRINKET",
  bag: "BAG",
  shield: "SHIELD",
};

export function BuybackPanel({
  font,
  relicFonts,
  sprites,
  state,
  onChange,
  onClose,
}: {
  font: PixelFont;
  relicFonts: Record<RelicTier, PixelFont>;
  sprites: Sprites;
  state: GameState;
  /** A completed buy-back changed the run — let the shop repaint its purse,
   * its bag grid and its bulk-sell totals. */
  onChange: () => void;
  onClose: () => void;
}) {
  const wide = useMediaQuery("(min-aspect-ratio: 4/3)");
  // Every full sentence under the title (the expiry warning, a refusal) is read
  // at the item names' size, so it wraps at the same viewport share the
  // settings help line uses rather than running off a phone's panel.
  const wrapRem = useHelpWrapRem();
  // The run is mutated IN PLACE, so nothing about `state` changes identity to
  // re-render on: bump a counter of our own and read the live shelf fresh, the
  // way the run's LOST & FOUND does.
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const [cursor, setCursor] = useState(0);
  const [openItem, setOpenItem] = useState<number | null>(null);
  // The piece whose action is UNFOLDED beneath it. A mouse HOVER only moves the
  // cursor; it never unfolds, because a panel opening under whatever the
  // pointer drifted across would shove the rest of the list out from under it.
  const [open, setOpen] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ text: string; bad: boolean } | null>(
    null,
  );

  const shelf = buybackContents(state.merchant);
  const hero = localHero(state);
  const purse = hero.coins;
  const bagFull = hero.inventory.every((cell) => cell !== null);
  const coinIcon = spriteDataUrl(sprites, "icon_coin");

  const at = Math.min(cursor, Math.max(0, shelf.length - 1));
  const selected = shelf[at] ?? null;

  const buyBack = (entry: { item: Equipment; price: number }) => {
    const refused = runCommand(
      state,
      "buybackItem",
      entry.item.id,
    ) as BuybackRefusal | null;
    setOpen(null);
    if (refused) {
      playUiSound(synth, "back");
      setNotice({
        text:
          refused === "coins"
            ? "NOT ENOUGH COINS"
            : refused === "bag"
              ? "BAG IS FULL - MAKE ROOM AND COME BACK"
              : "HE NO LONGER HAS IT",
        bad: true,
      });
      return;
    }
    playUiSound(synth, "equip");
    setCursor((c) => Math.max(0, Math.min(c, shelf.length - 2)));
    setNotice({ text: `BOUGHT BACK ${equipmentName(entry.item)}`, bad: false });
    bump();
    onChange();
  };

  // ESCAPE (and the pad's B, which arrives as one) closes this shelf and
  // nothing else — caught in the capture phase so it beats both the shop's own
  // handler and the run's shop-closing one underneath, exactly the way the
  // shop's deal card unwinds one layer at a time.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (openItem !== null) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (shelf.length === 0) return;
        playUiSound(synth, "move");
        const delta = event.key === "ArrowDown" ? 1 : -1;
        const next = (at + delta + shelf.length) % shelf.length;
        setCursor(next);
        // Stepping with the keys carries the unfolded action along with the
        // cursor, so a keyboard player never presses a key just to see a price.
        setOpen(shelf[next]?.item.id ?? null);
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (!selected) return;
        // Enter walks exactly the taps a pointer walks: unfold, then buy.
        if (open !== selected.item.id) {
          playUiSound(synth, "confirm");
          setNotice(null);
          setOpen(selected.item.id);
        } else if (purse >= selected.price && !bagFull) {
          buyBack(selected);
        }
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        playUiSound(synth, "back");
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  });

  return (
    <div className="arsenal-overlay shop-buyback">
      <div className="arsenal-panel">
        <PixelText font={font} text="BUY BACK" scale={3} color="#c7a25a" />
        {shelf.length === 0 ? (
          <PixelText
            font={font}
            text="YOU HAVE SOLD HIM NOTHING YET"
            scale={2}
            color="#9aa3ad"
            maxWidth={wrapRem}
            align="center"
          />
        ) : (
          // The purse every price is read against, with the unit spelled out —
          // the one place on this screen the word COINS appears, which is what
          // makes the coin-marked numbers in the list read as money.
          <div className="vault-purse">
            <PixelText
              font={font}
              text={`${shelf.length} SOLD ·`}
              scale={2}
              color="#9aa3ad"
            />
            {coinIcon && (
              <img src={coinIcon} alt="" className="pixel-img vault-coin" />
            )}
            <PixelText
              font={font}
              text={`${formatCoins(Math.floor(purse))} COINS`}
              scale={2}
              color="#ffd24a"
            />
          </div>
        )}
        {/* The offer EXPIRES with the trader: his shelf is his memory, and the
            next level is a different man with an empty one. Say so plainly — a
            player must never discover that rule by losing a keeper to it. */}
        {shelf.length > 0 && (
          <PixelText
            font={font}
            text="HE FORGETS EVERYTHING WHEN YOU LEAVE THIS LEVEL"
            scale={2}
            color="#ff9f5b"
            maxWidth={wrapRem}
            align="center"
          />
        )}

        <div className="arsenal-body">
          <nav className="arsenal-list" aria-label="buyback">
            {shelf.map((entry, i) => {
              const item = entry.item;
              const selectedRow = i === at;
              const color = TIER_COLORS[item.tier];
              const affordable = purse >= entry.price;
              return (
                <Fragment key={item.id}>
                  <button
                    type="button"
                    ref={
                      selectedRow
                        ? (el) => el?.scrollIntoView({ block: "nearest" })
                        : undefined
                    }
                    className={`arsenal-row${selectedRow ? " selected" : ""}`}
                    aria-label={`buyback-${item.id}`}
                    onPointerEnter={(event) => {
                      if (event.pointerType !== "mouse") return;
                      setCursor(i);
                      // The highlight and the unfolded action must name the
                      // same piece, so drifting onto another row folds it away.
                      if (open !== item.id) setOpen(null);
                    }}
                    onClick={() => {
                      playUiSound(synth, "confirm");
                      setCursor(i);
                      setNotice(null);
                      setOpen(item.id);
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
                        scale={2}
                        color="#7a8088"
                      />
                    </span>
                    <span className="vault-price">
                      {coinIcon && (
                        <img
                          src={coinIcon}
                          alt=""
                          className={`pixel-img vault-coin${
                            affordable ? "" : " spent"
                          }`}
                        />
                      )}
                      <PixelText
                        font={font}
                        text={formatCoins(entry.price)}
                        scale={2}
                        color={affordable ? "#ffd24a" : "#7a8088"}
                      />
                    </span>
                  </button>
                  {open === item.id && (
                    // The action, unfolded under the piece it buys. It scrolls
                    // itself into view: on a phone the picked row is often the
                    // last one visible, and a button that opened below the fold
                    // would read as nothing happening.
                    <div
                      className="vault-action"
                      ref={(el) => el?.scrollIntoView({ block: "nearest" })}
                    >
                      <button
                        type="button"
                        className="pixel-button secondary vault-reclaim"
                        aria-label="buyback-confirm"
                        disabled={!affordable || bagFull}
                        onClick={() => buyBack(entry)}
                      >
                        {bagFull ? (
                          <PixelText
                            font={font}
                            text="BAG FULL"
                            scale={2}
                            color="#e6e8eb"
                          />
                        ) : (
                          // The action on the left, its price on the right,
                          // the way a shop line reads.
                          <span className="vault-reclaim-face">
                            <PixelText
                              font={font}
                              text="BUY BACK"
                              scale={2}
                              color="#e6e8eb"
                            />
                            {coinIcon && (
                              <img
                                src={coinIcon}
                                alt=""
                                className="pixel-img vault-coin"
                              />
                            )}
                            <PixelText
                              font={font}
                              text={formatCoins(entry.price)}
                              scale={2}
                              color="#ffd24a"
                            />
                          </span>
                        )}
                      </button>
                    </div>
                  )}
                </Fragment>
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
                item={selected.item}
                compareTo={null}
              />
            </div>
          )}
        </div>

        {notice && (
          <PixelText
            font={font}
            text={notice.text}
            scale={2}
            color={notice.bad ? "#ff6b6b" : "#7ef0c8"}
            maxWidth={wrapRem}
            align="center"
          />
        )}

        {/* The footer keeps only the way out — the buy-back lives with its
            item, up in the list. */}
        <div className="vault-actions">
          <button
            type="button"
            className="pixel-button"
            aria-label="buyback-back"
            onClick={() => {
              playUiSound(synth, "back");
              onClose();
            }}
          >
            <PixelText font={font} text="BACK" scale={2} color="#0b0d10" />
          </button>
        </div>
      </div>

      {!wide && openItem !== null && shelf[openItem] && (
        <ItemCardModal
          font={font}
          relicFonts={relicFonts}
          sprites={sprites}
          state={state}
          item={shelf[openItem].item}
          compareTo={null}
          onClose={() => setOpenItem(null)}
        />
      )}
    </div>
  );
}
