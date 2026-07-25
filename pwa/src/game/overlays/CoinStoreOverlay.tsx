// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The IN-RUN COIN STORE — the coin packs, reachable without leaving the run.
// Raised from the AUTO PILOT picker's STORE button, because that is where a
// player learns their purse is too thin to fly: sending them out to the title
// menu's STORE (and then through DISTRIBUTE) to fix it would drop the run they
// were about to hand to the bot.
//
// Same catalog and same money-safety path as the title-menu store
// (game/store.ts): a tapped pack pauses on a CONFIRM step so a mis-tap can't
// spend anything, and the purchase banks before it is sent to the hero who is
// playing (`buyCoinPackForHero`). The coins land in the run's purse the moment
// they arrive, so the picker behind this modal can immediately afford a rung.
//
// Presentational: the caller owns the buy runner (game-screen/run-store.ts) and
// the live purse.

import { useEffect, useState } from "react";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";
import { formatCoins } from "@ui/lib/format-number.ts";

import { spriteDataUrl, type Sprites } from "../assets.ts";
import { COIN_PACKS, fetchCoinPrices, type CoinPack } from "../store.ts";
import type { RunPurchaseResult } from "../store.ts";

const AMBER = "#ffcf6b";
const COIN = "#ffd75e";
const GREEN = "#5fd97a";
const GREY = "#9aa3ad";
const WARN = "#ff6b6b";

/** The line under the pack list: what the last purchase did, or what went
 * wrong. Cleared when the player starts another buy. */
type Notice = { tone: "info" | "error"; text: string };

export function CoinStoreOverlay({
  font,
  sprites,
  coins,
  onBuy,
  onClose,
}: {
  font: PixelFont;
  /** The atlas — for the coin icons. */
  sprites: Sprites;
  /** The hero's live purse (the run's coins), so the top-up reads. */
  coins: number;
  /** Run the purchase and credit the flying hero — see run-store.ts. */
  onBuy: (pack: CoinPack) => Promise<RunPurchaseResult>;
  onClose: () => void;
}) {
  const stop = (event: { stopPropagation: () => void }) =>
    event.stopPropagation();
  // Localized price tags from the platform store, fetched on open; null until
  // they arrive (rows show the shipped USD tags meanwhile). A FORCED store
  // without the native shell answers "FREE" for every pack.
  const [prices, setPrices] = useState<Record<string, string> | null>(null);
  // The pack awaiting CONFIRM — a tap never buys straight away, mirroring the
  // title-menu store's confirmation screen.
  const [pending, setPending] = useState<CoinPack | null>(null);
  // A pay sheet is open: every row locks until it settles.
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchCoinPrices().then((fetched) => {
      if (!cancelled && fetched) setPrices(fetched);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const coinIcon = spriteDataUrl(sprites, "icon_coin");
  const priceOf = (pack: CoinPack) => prices?.[pack.sku] ?? pack.price;

  const confirm = async (pack: CoinPack) => {
    setPending(null);
    setBusy(true);
    setNotice({ tone: "info", text: "OPENING THE STORE" });
    const result = await onBuy(pack);
    setBusy(false);
    if (result.ok) {
      setNotice({
        tone: "info",
        text:
          result.coins > 0
            ? `+${formatCoins(result.coins)} COINS`
            : `${pack.amount} COINS BANKED`,
      });
    } else if (result.reason === "cancelled") {
      // The player changed their mind — that's fine, and it stays quiet.
      setNotice(null);
    } else {
      setNotice({ tone: "error", text: "STORE UNAVAILABLE - TRY AGAIN LATER" });
    }
  };

  return (
    <div className="game-overlay" onPointerDown={onClose} role="presentation">
      <div className="intro-box coin-store" onPointerDown={stop}>
        <PixelText font={font} text="COIN STORE" scale={4} color={AMBER} />
        <div className="autopilot-start-purse">
          <PixelText font={font} text="PURSE" scale={2} color={GREY} />
          {coinIcon && (
            <img src={coinIcon} alt="" className="pixel-img autopilot-icon" />
          )}
          <PixelText
            font={font}
            text={formatCoins(coins)}
            scale={2}
            color={COIN}
          />
        </div>
        {pending ? (
          // CONFIRM: nothing is spent until this button. BACK returns to the
          // list with the purse untouched.
          <div className="coin-store-confirm">
            <PixelText
              font={font}
              text={`BUY ${pending.amount} COINS`}
              scale={3}
              color={COIN}
            />
            <PixelText
              font={font}
              text={priceOf(pending)}
              scale={3}
              color={AMBER}
            />
            <PixelText
              font={font}
              text="THEY GO STRAIGHT TO YOUR PURSE"
              scale={2}
              color={GREY}
            />
            <div className="coin-store-actions">
              <button
                type="button"
                className="pixel-button secondary"
                aria-label="coin-store-back"
                onClick={() => setPending(null)}
              >
                <PixelText font={font} text="BACK" scale={3} />
              </button>
              <button
                type="button"
                className="pixel-button"
                aria-label="coin-store-confirm"
                onClick={() => void confirm(pending)}
              >
                <PixelText
                  font={font}
                  text="CONFIRM"
                  scale={3}
                  color="#0b0d10"
                />
              </button>
            </div>
          </div>
        ) : (
          <div className="coin-store-packs">
            {COIN_PACKS.map((pack) => (
              <button
                key={pack.sku}
                type="button"
                className="pixel-button secondary coin-store-pack"
                aria-label={`coin-store-${pack.sku}`}
                disabled={busy}
                onClick={() => {
                  setNotice(null);
                  setPending(pack);
                }}
              >
                <span className="autopilot-cell">
                  {coinIcon && (
                    <img
                      src={coinIcon}
                      alt=""
                      className="pixel-img autopilot-icon"
                    />
                  )}
                  <PixelText
                    font={font}
                    text={pack.amount}
                    scale={2}
                    color={COIN}
                  />
                </span>
                <PixelText
                  font={font}
                  text={priceOf(pack)}
                  scale={2}
                  color={AMBER}
                />
              </button>
            ))}
          </div>
        )}
        {notice && (
          <div className="coin-store-notice">
            <PixelText
              font={font}
              text={notice.text}
              scale={2}
              color={notice.tone === "error" ? WARN : GREEN}
            />
          </div>
        )}
        {/* CLOSE stands down during the CONFIRM step — BACK is the way out of
            it, and two dismiss buttons under one question read as a trap. */}
        {!pending && (
          <button
            type="button"
            className="pixel-button secondary coin-store-close"
            aria-label="coin-store-close"
            disabled={busy}
            onClick={onClose}
          >
            <PixelText font={font} text="CLOSE" scale={3} />
          </button>
        )}
      </div>
    </div>
  );
}
