// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE COUNTER'S CONTROLS — the price tags, the deal card's BUY row, and the
// four tools along the shop's footer. They live beside `ShopPanel` rather than
// inside it because the panel is the COUNTER (what is on the stall, what is in
// the bag, what a press means); these are the widgets it presses, and the panel
// was the longest file in the game before they moved out.
//
// The one that carries an idea rather than a shape is `BuyQuantityRow`. The
// stall used to offer a stacked pile TWO buttons — BUY and BUY ALL — which is a
// choice between exactly two of the numbers a player might want, and neither of
// them is "three of the five". It is one button now, with a field in front of
// it: type a number, the button reprices itself, press once. The field can only
// ever hold a legal number (see shop-quantity.ts), so the button never dims into
// a refusal the player has to reverse-engineer.

import { useState } from "react";

import { formatCoins } from "@ui/lib/format-number.ts";
import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

import { spriteDataUrl, type Sprites } from "./assets.ts";
import { clampQtyText, qtyOfText } from "./shop-quantity.ts";

/** The coin gold every price in the game is struck in. */
const COIN_GOLD = "#ffd75e";

export function CoinPrice({
  font,
  sprites,
  amount,
  color = COIN_GOLD,
  scale = 2,
}: {
  font: PixelFont;
  sprites: Sprites;
  amount: number;
  color?: string;
  /** Glyph scale — the shop's readable body size (2) by default, so a price is
   * never the smallest thing on the counter. */
  scale?: number;
}) {
  const coin = spriteDataUrl(sprites, "icon_coin");
  return (
    <span className="shop-price">
      {coin && <img src={coin} alt="" className="pixel-img shop-coin" />}
      <PixelText
        font={font}
        text={formatCoins(amount)}
        scale={scale}
        color={color}
      />
    </span>
  );
}

/**
 * The BUY/SELL action's face: the coin and the amount, with an optional verb
 * ahead of it. BUY spells the verb out ("BUY 🪙 12"); SELL leaves it off — the
 * button lives beside the item's own stats, so the coins-out reads as a sale
 * without the word.
 */
export function DealLabel({
  font,
  sprites,
  verb,
  amount,
}: {
  font: PixelFont;
  sprites: Sprites;
  verb?: string;
  amount: number;
}) {
  const coin = spriteDataUrl(sprites, "icon_coin");
  return (
    <span className="shop-deal-label">
      {verb && <PixelText font={font} text={verb} scale={2} color="#0b0d10" />}
      {coin && <img src={coin} alt="" className="pixel-img shop-deal-coin" />}
      <PixelText
        font={font}
        text={formatCoins(amount)}
        scale={2}
        color="#0b0d10"
      />
    </span>
  );
}

/**
 * THE DEAL CARD'S BUY ROW: how many, and the one button that pays for them.
 *
 * The field is only offered when there is a choice to make — `max` is what this
 * counter would really part with right now (`stockBuyableCount`: the pile, the
 * purse and the carry room at their smallest), so a lone weapon, a last medkit,
 * or a pile the purse can only afford one of shows the button alone.
 *
 * It is the `.pixel-input` skin the join prompt uses, shrunk: a real `<input>`
 * sits transparent over a `PixelText` of the number, so the glyphs are the
 * game's own font while focus, the caret and the phone's numeric keyboard stay
 * the browser's problem. Focusing it SELECTS what is there — the gesture is
 * "press the field, type 3", not "press, backspace, type 3".
 */
export function BuyQuantityRow({
  font,
  sprites,
  price,
  max,
  canBuy,
  onBuy,
}: {
  font: PixelFont;
  sprites: Sprites;
  /** What ONE unit costs; the button prices `qty × price`. */
  price: number;
  /** How many units this trade would actually hand over right now. */
  max: number;
  /** Whether a single unit can be bought at all — the button's own gate. */
  canBuy: boolean;
  onBuy: (count: number) => void;
}) {
  const [text, setText] = useState("1");
  // Clamped on the way OUT as well as on the way in: a purchase shrinks the
  // pile and the purse under a field that is still showing the old number, and
  // the card stays up so the next press can be made straight away.
  const shown = clampQtyText(text, max);
  const qty = qtyOfText(shown);
  return (
    <div className="shop-deal-actions">
      {max > 1 && (
        <div className="pixel-input shop-qty-field">
          <div className="pixel-input-display" aria-hidden="true">
            <PixelText font={font} text={shown} scale={2} color={COIN_GOLD} />
          </div>
          <input
            className="pixel-input-field shop-qty-input"
            aria-label="buy-quantity"
            inputMode="numeric"
            value={shown}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setText(clampQtyText(e.currentTarget.value, max))}
            onKeyDown={(e) => {
              // The field owns the keyboard while it has focus: the counter's
              // own Escape unwind and the run's key handlers underneath must
              // not read the digits being typed into it.
              e.stopPropagation();
              if (e.key === "Enter" && canBuy) onBuy(qty);
            }}
          />
        </div>
      )}
      <button
        type="button"
        className="pixel-button shop-deal-btn"
        aria-label="buy-selected"
        disabled={!canBuy}
        onClick={() => onBuy(qty)}
      >
        <DealLabel
          font={font}
          sprites={sprites}
          verb="BUY"
          amount={qty * price}
        />
      </button>
    </div>
  );
}

/**
 * The counter's bulk sale, as a TWO-PRESS mode rather than one irreversible
 * sweep. The first press ARMS it and ticks every outgrown piece (the inventory's
 * own scrap rule); the bag then answers presses by ticking and unticking, and
 * this button — now reading SELL and the coins the ticked pieces fetch — takes
 * the sale on the second press. Untick everything and it reads CANCEL, so the
 * mode is never a trap.
 *
 * It is still the counter's ONLY bulk sale. A SELL ALL sat beside it once and
 * sold the keepers too; picking them by hand is what replaced it.
 */
export function SellSweepButton({
  font,
  sprites,
  armed,
  total,
  count,
  canArm,
  onPress,
}: {
  font: PixelFont;
  sprites: Sprites;
  /** Whether the picking mode is up — the button is the CONFIRM while it is. */
  armed: boolean;
  /** What the ticked pieces (or, unarmed, the outgrown ones) would fetch. */
  total: number;
  /** How many pieces that is. */
  count: number;
  /** Whether there is anything in the bag to pick from at all — a bag of
   * KEEPERS still arms the mode, it just starts with nothing ticked. */
  canArm: boolean;
  onPress: () => void;
}) {
  // Armed, the button is always live: with nothing ticked it is the way OUT.
  const enabled = armed || canArm;
  const coin = spriteDataUrl(sprites, "icon_coin");
  const label = armed ? (count > 0 ? "SELL" : "CANCEL") : "SELL JUNK";
  const showTotal = count > 0;
  return (
    <button
      type="button"
      className={`pixel-button secondary shop-bulk-btn${
        armed ? " shop-tool-armed" : ""
      }`}
      aria-label="sell-junk"
      disabled={!enabled}
      onClick={enabled ? onPress : undefined}
    >
      {coin && <img src={coin} alt="" className="pixel-img shop-bulk-coin" />}
      <PixelText
        font={font}
        text={label}
        scale={2}
        color={enabled ? (armed ? COIN_GOLD : "#e6e8eb") : "#5a6470"}
      />
      {showTotal && (
        <PixelText
          font={font}
          text={formatCoins(total)}
          scale={2}
          color={COIN_GOLD}
        />
      )}
    </button>
  );
}

/** Mend the hero's whole kit for coins — an icon-only button beside the sell
 * tools: just the wrench, no label. Enabled (and tappable) only when something
 * needs mending AND the purse can cover it; otherwise it dims like a spent
 * action. A tap mends the whole kit at once. */
export function RepairButton({
  sprites,
  cost,
  coins,
  onRepair,
}: {
  sprites: Sprites;
  cost: number;
  coins: number;
  onRepair: () => void;
}) {
  const enabled = cost > 0 && coins >= cost;
  const wrench = spriteDataUrl(sprites, "icon_wrench");
  return (
    <button
      type="button"
      className="pixel-button secondary shop-repair-btn"
      aria-label="repair-all"
      disabled={!enabled}
      onClick={enabled ? onRepair : undefined}
    >
      {wrench && (
        <img src={wrench} alt="" className="pixel-img shop-repair-icon" />
      )}
    </button>
  );
}

/**
 * Arm the counter's APPRAISAL — the merchant's identify service as a MODE:
 * press this, then press the unidentified find to identify (the D2 Cain flow,
 * one press per piece). Pressing it again disarms. It wears the lookup
 * ticket's own barcode glyph (the two are the same service at two venues) and
 * carries the count of veiled finds in the bag; dead while the bag holds none.
 */
export function IdentifyButton({
  font,
  sprites,
  count,
  armed,
  onToggle,
}: {
  font: PixelFont;
  sprites: Sprites;
  count: number;
  armed: boolean;
  onToggle: () => void;
}) {
  const enabled = count > 0;
  const glyph = spriteDataUrl(sprites, "icon_lookup_ticket");
  return (
    <button
      type="button"
      className={`pixel-button secondary shop-bulk-btn${
        armed ? " shop-tool-armed" : ""
      }`}
      aria-label="identify-mode"
      disabled={!enabled}
      onClick={enabled ? onToggle : undefined}
    >
      {glyph && <img src={glyph} alt="" className="pixel-img shop-bulk-coin" />}
      <PixelText
        font={font}
        text="IDENTIFY"
        scale={2}
        color={enabled ? (armed ? COIN_GOLD : "#e6e8eb") : "#5a6470"}
      />
      {enabled && (
        <PixelText
          font={font}
          text={String(count)}
          scale={2}
          color={COIN_GOLD}
        />
      )}
    </button>
  );
}

/**
 * Open the BUY-BACK shelf — the undo beside the sell tools it undoes. It wears
 * the satchel the LOST & FOUND's rows wear (the two screens are the same idea
 * at two prices) and carries the count of what is on the shelf, so a player who
 * has just swept the bag can see at a glance that the seven pieces are still
 * recoverable. Dead until something has actually been sold here.
 */
export function BuybackButton({
  font,
  sprites,
  count,
  onOpen,
}: {
  font: PixelFont;
  sprites: Sprites;
  count: number;
  onOpen: () => void;
}) {
  const enabled = count > 0;
  const bag = spriteDataUrl(sprites, "icon_bag");
  return (
    <button
      type="button"
      className="pixel-button secondary shop-bulk-btn"
      aria-label="buy-back"
      disabled={!enabled}
      onClick={enabled ? onOpen : undefined}
    >
      {bag && <img src={bag} alt="" className="pixel-img shop-bulk-coin" />}
      <PixelText
        font={font}
        text="BUY BACK"
        scale={2}
        color={enabled ? "#e6e8eb" : "#5a6470"}
      />
      {enabled && (
        <PixelText
          font={font}
          text={String(count)}
          scale={2}
          color={COIN_GOLD}
        />
      )}
    </button>
  );
}
