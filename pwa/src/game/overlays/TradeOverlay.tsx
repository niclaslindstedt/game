// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE TRADE WINDOW (docs/multiplayer.md — Trade) — the screen over the engine's
// table. Everything binding lives in `src/game/trade.ts`; this component only
// SHOWS the table and sends the five verbs, so nothing here can mint an item:
// my side draws my real bag, their side draws the COPY the wire carries
// (`TradeSide.item` — presentation, never authority), and the swap itself
// happens in one server-side transaction the moment both lamps are lit.
//
// The one rule worth restating at the screen: ANY change to the table drops
// both acceptances (engine rule 2), so the ACCEPT lamp going out under you is
// the window working, not a bug — what you accepted is no longer on the table.

import { localHero, localSeat } from "../local-seat.ts";
import { useState, type ReactNode } from "react";

import {
  equipmentName,
  tradeOf,
  type Equipment,
  type GameState,
} from "@game/core";

import { formatCoins } from "@ui/lib/format-number.ts";
import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";
import { useDismissOnOutsidePress } from "@ui/lib/use-outside-press.ts";

import type { GameAssets } from "../assets.ts";
import { synth } from "../audio.ts";
import { ItemIcon } from "../ItemCard.tsx";
import { ItemTooltip } from "../ItemTooltip.tsx";
import { playUiSound } from "../sfx/ui.ts";
import { TIER_COLORS, tierGlowClass } from "../tiers.ts";

import { runCommand } from "../run-commands.ts";

/** The coin stepper's rungs — tap to add, CLEAR to zero. A typed amount needs
 * a text field and the iOS predictive-text dance for three digits nobody
 * enjoys entering; steppers cover the real trades (a tip, a price, a ransom). */
const COIN_STEPS = [10, 100, 1000] as const;

/** What the player has tapped for inspection, with the cell rect the floating
 * card anchors to (the ShopPanel pattern). */
type Inspect = { item: Equipment; anchor: DOMRect };

export function TradeOverlay({
  state,
  assets,
  font,
  partnerName,
  bumpUi,
}: {
  state: GameState;
  assets: GameAssets;
  font: PixelFont;
  /** The other seat's display name, resolved from the session roster — the
   * engine's `Player` carries no name. Null when nothing can say (offline
   * simulation, a test), which falls back to the seat number. */
  partnerName: string | null;
  bumpUi: () => void;
}) {
  const seat = localSeat();
  const me = localHero(state);
  const trade = tradeOf(state, seat);
  const [inspect, setInspect] = useState<Inspect | null>(null);
  // Any press that misses both the card and a cell puts the card away — the
  // same rule the bag and the counter dismiss by. Bound above the whole window
  // rather than on the panel, so a press on the backdrop counts too and a press
  // on the PORTALED card never reads as a miss (see use-outside-press.ts).
  useDismissOnOutsidePress(inspect !== null, ".item-tooltip, .inv-cell", () =>
    setInspect(null),
  );
  // The screen can outlive the table by a frame (a cancel or a settle lands in
  // a snapshot before the lowered screen does the render after). Draw nothing
  // rather than a window over a table that is gone.
  if (!trade) return null;
  const side = trade.seats[0] === seat ? 0 : 1;
  const mine = trade.offers[side]!;
  const theirs = trade.offers[1 - side]!;
  const partnerSeat = trade.seats[1 - side]!;
  const partnerLabel = partnerName ?? `SEAT ${partnerSeat + 1}`;

  const send = (name: Parameters<typeof runCommand>[1], ...args: number[]) => {
    runCommand(state, name, ...args);
    bumpUi();
  };
  const toggleInspect = (item: Equipment, target: HTMLElement) => {
    setInspect((prev) =>
      prev?.item.id === item.id
        ? null
        : { item, anchor: target.getBoundingClientRect() },
    );
  };

  return (
    <div className="game-overlay" role="presentation">
      <div className="inventory-panel trade-panel">
        <div className="trade-header">
          <PixelText font={font} text="TRADE" scale={3} color="#ffd75e" />
          <PixelText
            font={font}
            text={`WITH ${partnerLabel.toUpperCase()}`}
            scale={2}
            color="#9aa3ad"
          />
        </div>

        {/* THE TABLE — two sides, index-aligned with the engine's offers. */}
        <div className="trade-sides">
          <TradeSidePane
            font={font}
            assets={assets}
            title="YOU GIVE"
            offer={mine}
            ready={mine.accepted}
            onItemPress={() => {
              // My own offer: a tap takes it back off the table. Inspecting my
              // own piece is the bag's job — it is still in my bag, after all.
              playUiSound(synth, "back");
              send("clearTradeOffer");
            }}
            coinControls={
              <div className="trade-coin-row">
                {COIN_STEPS.map((step) => (
                  <button
                    key={step}
                    type="button"
                    className="pixel-button secondary trade-coin-btn"
                    aria-label={`offer-coins-${step}`}
                    disabled={mine.coins + step > me.coins}
                    onClick={() => {
                      playUiSound(synth, "move");
                      send("offerTradeCoins", mine.coins + step);
                    }}
                  >
                    <PixelText font={font} text={`+${step}`} scale={2} />
                  </button>
                ))}
                <button
                  type="button"
                  className="pixel-button secondary trade-coin-btn"
                  aria-label="offer-coins-clear"
                  disabled={mine.coins === 0}
                  onClick={() => {
                    playUiSound(synth, "back");
                    send("offerTradeCoins", 0);
                  }}
                >
                  <PixelText font={font} text="0" scale={2} />
                </button>
              </div>
            }
          />
          <TradeSidePane
            font={font}
            assets={assets}
            title="YOU GET"
            offer={theirs}
            ready={theirs.accepted}
            onItemPress={(item, el) => toggleInspect(item, el)}
          />
        </div>

        {/* MY BAG — tap a piece to put it on the table. One item per side is
            the engine's shape; tapping another swaps the offer (and drops both
            acceptances, as every change must). */}
        <div className="trade-bag">
          <PixelText font={font} text="YOUR BAG" scale={3} color="#9aa3ad" />
          <div className="inv-grid trade-bag-grid">
            {me.inventory.map((item, index) => (
              <button
                key={index}
                type="button"
                className={`inv-cell trade-bag-cell${
                  item && mine.cell === index ? " selected" : ""
                }${item ? tierGlowClass(item.tier) : ""}`}
                aria-label={`trade-bag-${index}`}
                style={
                  item ? { borderColor: TIER_COLORS[item.tier] } : undefined
                }
                disabled={!item}
                onClick={
                  item
                    ? () => {
                        playUiSound(synth, "move");
                        if (mine.cell === index) send("clearTradeOffer");
                        else send("offerTradeItem", index);
                      }
                    : undefined
                }
              >
                {item && <ItemIcon sprites={assets.sprites} item={item} />}
              </button>
            ))}
          </div>
        </div>

        <div className="trade-actions">
          <button
            type="button"
            className="pixel-button"
            aria-label="trade-accept"
            disabled={mine.accepted}
            onClick={() => {
              playUiSound(synth, "confirm");
              send("acceptTrade");
            }}
          >
            <PixelText
              font={font}
              text={mine.accepted && !theirs.accepted ? "WAITING..." : "ACCEPT"}
              scale={2}
            />
          </button>
          <button
            type="button"
            className="pixel-button secondary"
            aria-label="trade-cancel"
            onClick={() => {
              playUiSound(synth, "back");
              send("cancelTrade");
            }}
          >
            <PixelText font={font} text="CANCEL" scale={2} />
          </button>
        </div>
      </div>

      {inspect && (
        <ItemTooltip
          font={font}
          relicFonts={assets.relicFonts}
          sprites={assets.sprites}
          state={state}
          item={inspect.item}
          anchor={inspect.anchor}
        />
      )}
    </div>
  );
}

/** One side of the table: the offered piece (or the empty slot), the coins on
 * it, and the READY lamp. My side adds the coin steppers and a press takes the
 * piece back; their side's press inspects the COPY the wire carries. */
function TradeSidePane({
  font,
  assets,
  title,
  offer,
  ready,
  onItemPress,
  coinControls,
}: {
  font: PixelFont;
  assets: GameAssets;
  title: string;
  offer: { item?: Equipment; coins: number };
  ready: boolean;
  onItemPress: (item: Equipment, target: HTMLElement) => void;
  coinControls?: ReactNode;
}) {
  const item = offer.item;
  return (
    <div className="trade-side">
      <div className="trade-side-heading">
        <PixelText font={font} text={title} scale={2} color="#9aa3ad" />
        <span className={`trade-ready${ready ? " lit" : ""}`}>
          <PixelText
            font={font}
            text={ready ? "READY" : "..."}
            scale={2}
            color={ready ? "#7fd08a" : "#5a6470"}
          />
        </span>
      </div>
      <button
        type="button"
        className={`inv-cell trade-offer-cell${
          item ? tierGlowClass(item.tier) : ""
        }`}
        aria-label={`trade-offer-${title === "YOU GIVE" ? "mine" : "theirs"}`}
        style={item ? { borderColor: TIER_COLORS[item.tier] } : undefined}
        disabled={!item}
        onClick={item ? (e) => onItemPress(item, e.currentTarget) : undefined}
      >
        {item && <ItemIcon sprites={assets.sprites} item={item} />}
      </button>
      {item && (
        <PixelText
          font={font}
          text={equipmentName(item)}
          scale={2}
          color={TIER_COLORS[item.tier]}
          className="trade-item-name"
        />
      )}
      <div className="trade-coins">
        <PixelText
          font={font}
          text={`${formatCoins(offer.coins)} COINS`}
          scale={2}
          color={offer.coins > 0 ? "#ffd75e" : "#5a6470"}
        />
      </div>
      {coinControls}
    </div>
  );
}
