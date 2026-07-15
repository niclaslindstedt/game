// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The merchant's shop, shown while the engine sits in the `shop` phase (the
// run frozen behind it like the bag): his STALL on top — powerups that
// restock and one-off weapons, each with a coin price — and the hero's BAG
// below, where every piece shows what he'll pay for it. Tap an item to
// select it (its facts land in the detail bar), then confirm with the big
// BUY/SELL button; SELL JUNK clears every outgrown piece in one tap, using
// the same scrap rule as the inventory's sweep. All mutations go through
// the engine's shop API (sellItem/buyStock) and `onChange` re-renders.

import { useState } from "react";

import {
  abilityDef,
  buyStock,
  canBuyStock,
  equipmentIcon,
  isScrappableLoot,
  merchantName,
  repairAllCost,
  repairGear,
  sellItem,
  sellValue,
  type Equipment,
  type GameState,
  type MerchantStock,
} from "@game/core";

import { formatCompact } from "@ui/lib/format-number.ts";
import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

import { spriteDataUrl, type RelicTier, type Sprites } from "./assets.ts";
import { synth } from "./audio.ts";
import { ItemCardBody, ItemIcon } from "./ItemCard.tsx";
import { playUiSound } from "./sfx/index.ts";
import { TIER_COLORS, tierGlowClass } from "./tiers.ts";

/** Wrap the detail card's name/stat lines to the same rem cap the inventory
 * tooltip and arsenal viewer use, so the three read identically. */
const SHOP_DETAIL_REM = 14.3;

/** What the player has tapped: a stall entry to buy, or a bag cell to sell. */
type Selection = { kind: "stock"; id: number } | { kind: "bag"; index: number };

function CoinPrice({
  font,
  sprites,
  amount,
  color = "#ffd75e",
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
        text={formatCompact(amount)}
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
function DealLabel({
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
        text={formatCompact(amount)}
        scale={2}
        color="#0b0d10"
      />
    </span>
  );
}

/**
 * A one-tap bulk-sell tool in the bag header: a coin glyph (one for JUNK, a
 * stack of three for ALL), the label, and — when there's anything to sell —
 * the coins it would fetch. Disabled (and total hidden) when nothing qualifies
 * so it can never fire on an empty bag.
 */
function BulkSellButton({
  font,
  sprites,
  coinIcon,
  label,
  ariaLabel,
  total,
  count,
  onSell,
}: {
  font: PixelFont;
  sprites: Sprites;
  coinIcon: string;
  label: string;
  ariaLabel: string;
  total: number;
  count: number;
  onSell: () => void;
}) {
  const enabled = count > 0;
  const coin = spriteDataUrl(sprites, coinIcon);
  return (
    <button
      type="button"
      className="pixel-button secondary shop-bulk-btn"
      aria-label={ariaLabel}
      disabled={!enabled}
      onClick={enabled ? onSell : undefined}
    >
      {coin && <img src={coin} alt="" className="pixel-img shop-bulk-coin" />}
      <PixelText
        font={font}
        text={label}
        scale={2}
        color={enabled ? "#e6e8eb" : "#5a6470"}
      />
      {enabled && (
        <PixelText
          font={font}
          text={formatCompact(total)}
          scale={2}
          color="#ffd75e"
        />
      )}
    </button>
  );
}

/** Mend the hero's whole kit for coins — a SPEND, so it shows the price (gold
 * when affordable, red when the purse is short) and disables when nothing needs
 * mending or the hero can't cover it. */
function RepairButton({
  font,
  sprites,
  cost,
  coins,
  onRepair,
}: {
  font: PixelFont;
  sprites: Sprites;
  cost: number;
  coins: number;
  onRepair: () => void;
}) {
  const needsRepair = cost > 0;
  const affordable = coins >= cost;
  const enabled = needsRepair && affordable;
  const coin = spriteDataUrl(sprites, "icon_coin");
  return (
    <button
      type="button"
      className="pixel-button secondary shop-bulk-btn"
      aria-label="repair-all"
      disabled={!enabled}
      onClick={enabled ? onRepair : undefined}
    >
      {coin && <img src={coin} alt="" className="pixel-img shop-bulk-coin" />}
      <PixelText
        font={font}
        text="REPAIR"
        scale={2}
        color={enabled ? "#e6e8eb" : "#5a6470"}
      />
      {needsRepair && (
        <PixelText
          font={font}
          text={formatCompact(cost)}
          scale={2}
          color={affordable ? "#ffd75e" : "#c65f5f"}
        />
      )}
    </button>
  );
}

export function ShopPanel({
  state,
  font,
  relicFonts,
  sprites,
  onChange,
  onClose,
}: {
  state: GameState;
  font: PixelFont;
  relicFonts: Record<RelicTier, PixelFont>;
  sprites: Sprites;
  onChange: () => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Selection | null>(null);
  const merchant = state.merchant;
  const player = state.player;

  const stockIcon = (entry: MerchantStock) =>
    spriteDataUrl(
      sprites,
      entry.kind === "ability"
        ? abilityDef(entry.defId).icon
        : equipmentIcon(entry.equipment.defId),
    );

  const selectedStock =
    selected?.kind === "stock"
      ? merchant.stock.find((s) => s.id === selected.id)
      : undefined;
  const selectedBag =
    selected?.kind === "bag" ? player.inventory[selected.index] : undefined;

  // The stat card compares the selection against what the hero already wears in
  // that slot (the same green/red deltas the inventory shows) — so a purchase
  // reads as an upgrade and a sale shows what's being let go. Never compare a
  // piece to itself.
  const compareFor = (item: Equipment): Equipment | null => {
    const worn = player.equipment[item.slot];
    return worn && worn.id !== item.id ? worn : null;
  };

  // The one-tap cleanup: every outgrown piece (the inventory SCRAP rule)
  // sold across the counter in a single gesture, for its full valuation.
  const junk = player.inventory
    .map((item, index) => ({ item, index }))
    .filter(
      (e): e is { item: Equipment; index: number } =>
        e.item !== null && isScrappableLoot(state, e.item),
    );
  const junkTotal = junk.reduce((sum, e) => sum + sellValue(e.item), 0);

  // SELL ALL: the whole bag across the counter in one gesture — every loose
  // piece, keepers included (the equipped loadout is untouched). The count
  // gates the button; the total is what the purse gains.
  const bag = player.inventory
    .map((item, index) => ({ item, index }))
    .filter((e): e is { item: Equipment; index: number } => e.item !== null);
  const bagTotal = bag.reduce((sum, e) => sum + sellValue(e.item), 0);

  // REPAIR ALL: the coins to mend the worn weapon, worn armor, and every
  // breakable bag piece back to full (0 when the whole kit is already whole).
  const repairTotal = repairAllCost(state);

  const doRepair = () => {
    if (repairGear(state) !== null) {
      playUiSound(synth, "confirm");
      onChange();
    } else {
      playUiSound(synth, "back");
    }
  };

  const doSell = (index: number) => {
    if (sellItem(state, index) !== null) {
      playUiSound(synth, "confirm");
      setSelected(null);
      onChange();
    }
  };

  const doBuy = (entry: MerchantStock) => {
    if (buyStock(state, entry.id)) {
      playUiSound(synth, "equip");
      // A bought weapon sells out — drop the selection so the detail bar
      // never offers a dead purchase; powerups restock and stay selected.
      if (entry.kind === "weapon") setSelected(null);
      onChange();
    } else {
      playUiSound(synth, "back");
    }
  };

  return (
    <div className="game-overlay" role="presentation">
      <div className="inventory-panel shop-panel">
        {/* Header: who you're trading with, and the purse. */}
        <div className="shop-header">
          <PixelText
            font={font}
            text={merchantName(state.level.id)}
            scale={3}
            color="#ffd75e"
          />
          <CoinPrice font={font} sprites={sprites} amount={player.coins} />
        </div>

        {/* The stall: his goods, priced. Sold-out weapons stay visible but
            dark — the run remembers what it passed up. */}
        <div className="shop-section">
          <PixelText font={font} text="FOR SALE" scale={3} color="#9aa3ad" />
          <div className="shop-stall">
            {merchant.stock.map((entry) => {
              const icon = stockIcon(entry);
              const soldOut = entry.kind === "weapon" && entry.sold;
              const affordable = canBuyStock(state, entry);
              const tint =
                entry.kind === "weapon"
                  ? TIER_COLORS[entry.equipment.tier]
                  : "#7ecbff";
              return (
                <button
                  key={entry.id}
                  type="button"
                  className={`shop-stall-item${soldOut ? " sold-out" : ""}${
                    selected?.kind === "stock" && selected.id === entry.id
                      ? " selected"
                      : ""
                  }`}
                  aria-label={`stock-${entry.id}`}
                  disabled={soldOut}
                  onClick={() => setSelected({ kind: "stock", id: entry.id })}
                >
                  <span
                    className={`inv-cell${
                      entry.kind === "weapon"
                        ? tierGlowClass(entry.equipment.tier)
                        : ""
                    }`}
                    style={{ borderColor: tint }}
                  >
                    {icon && (
                      <img
                        src={icon}
                        alt=""
                        className="pixel-img inv-item-icon"
                      />
                    )}
                  </span>
                  {soldOut ? (
                    <PixelText
                      font={font}
                      text="SOLD"
                      scale={2}
                      color="#5a6470"
                    />
                  ) : (
                    <CoinPrice
                      font={font}
                      sprites={sprites}
                      amount={entry.price}
                      color={affordable ? "#ffd75e" : "#e06a6a"}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* The hero's bag: tap a piece to see what he pays for it. */}
        <div className="shop-section">
          <div className="inv-bag-header">
            <PixelText font={font} text="YOUR BAG" scale={3} color="#9aa3ad" />
            <div className="shop-bag-actions">
              {/* SELL JUNK: only the outgrown pieces, one coin. */}
              <BulkSellButton
                font={font}
                sprites={sprites}
                coinIcon="icon_coin"
                label="SELL JUNK"
                ariaLabel="sell-junk"
                total={junkTotal}
                count={junk.length}
                onSell={() => {
                  for (const { index } of junk) sellItem(state, index);
                  playUiSound(synth, "confirm");
                  setSelected(null);
                  onChange();
                }}
              />
              {/* SELL ALL: the whole bag, a stack of three coins. */}
              <BulkSellButton
                font={font}
                sprites={sprites}
                coinIcon="icon_coins"
                label="SELL ALL"
                ariaLabel="sell-all"
                total={bagTotal}
                count={bag.length}
                onSell={() => {
                  for (const { index } of bag) sellItem(state, index);
                  playUiSound(synth, "confirm");
                  setSelected(null);
                  onChange();
                }}
              />
              {/* REPAIR ALL: mend the whole kit for coins. */}
              <RepairButton
                font={font}
                sprites={sprites}
                cost={repairTotal}
                coins={player.coins}
                onRepair={doRepair}
              />
            </div>
          </div>
          <div className="inv-grid shop-bag-grid">
            {player.inventory.map((item, index) => (
              <button
                key={index}
                type="button"
                className={`inv-cell shop-bag-cell${
                  selected?.kind === "bag" && selected.index === index
                    ? " selected"
                    : ""
                }${item ? tierGlowClass(item.tier) : ""}`}
                aria-label={`bag-${index}`}
                style={
                  item ? { borderColor: TIER_COLORS[item.tier] } : undefined
                }
                disabled={!item}
                onClick={
                  item ? () => setSelected({ kind: "bag", index }) : undefined
                }
              >
                {item &&
                  (() => {
                    const src = spriteDataUrl(
                      sprites,
                      equipmentIcon(item.defId),
                    );
                    return src ? (
                      <img
                        src={src}
                        alt=""
                        className="pixel-img inv-item-icon"
                      />
                    ) : null;
                  })()}
              </button>
            ))}
          </div>
        </div>

        {/* The detail bar: the selection's full stat card on the left — the
            same icon + lines the inventory shows, so you weigh a trade on the
            item's real facts — and the one BUY/SELL action on the right. */}
        <div className="shop-detail">
          {selectedStock && (
            <>
              <div className="shop-detail-info">
                {selectedStock.kind === "weapon" ? (
                  <>
                    <span
                      className={`inv-cell shop-detail-icon${tierGlowClass(
                        selectedStock.equipment.tier,
                      )}`}
                      style={{
                        borderColor: TIER_COLORS[selectedStock.equipment.tier],
                      }}
                    >
                      <ItemIcon
                        sprites={sprites}
                        item={selectedStock.equipment}
                      />
                    </span>
                    <div className="shop-detail-card">
                      <ItemCardBody
                        font={font}
                        relicFonts={relicFonts}
                        sprites={sprites}
                        state={state}
                        item={selectedStock.equipment}
                        compareTo={compareFor(selectedStock.equipment)}
                        maxWidth={SHOP_DETAIL_REM}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <span className="inv-cell shop-detail-icon">
                      {(() => {
                        const icon = stockIcon(selectedStock);
                        return icon ? (
                          <img
                            src={icon}
                            alt=""
                            className="pixel-img inv-item-icon"
                          />
                        ) : null;
                      })()}
                    </span>
                    <div className="shop-detail-card">
                      <PixelText
                        font={font}
                        text={abilityDef(selectedStock.defId).name}
                        scale={2}
                        color="#7ecbff"
                        maxWidth={SHOP_DETAIL_REM}
                      />
                    </div>
                  </>
                )}
              </div>
              <button
                type="button"
                className="pixel-button shop-deal-btn"
                aria-label="buy-selected"
                disabled={!canBuyStock(state, selectedStock)}
                onClick={() => doBuy(selectedStock)}
              >
                <DealLabel
                  font={font}
                  sprites={sprites}
                  verb="BUY"
                  amount={selectedStock.price}
                />
              </button>
            </>
          )}
          {selectedBag && (
            <>
              <div className="shop-detail-info">
                <span
                  className={`inv-cell shop-detail-icon${tierGlowClass(
                    selectedBag.tier,
                  )}`}
                  style={{ borderColor: TIER_COLORS[selectedBag.tier] }}
                >
                  <ItemIcon sprites={sprites} item={selectedBag} />
                </span>
                <div className="shop-detail-card">
                  <ItemCardBody
                    font={font}
                    relicFonts={relicFonts}
                    sprites={sprites}
                    state={state}
                    item={selectedBag}
                    compareTo={compareFor(selectedBag)}
                    maxWidth={SHOP_DETAIL_REM}
                  />
                </div>
              </div>
              <button
                type="button"
                className="pixel-button shop-deal-btn"
                aria-label="sell-selected"
                onClick={() =>
                  selected?.kind === "bag" && doSell(selected.index)
                }
              >
                <DealLabel
                  font={font}
                  sprites={sprites}
                  amount={sellValue(selectedBag)}
                />
              </button>
            </>
          )}
          {!selectedStock && !selectedBag && (
            <div className="shop-detail-empty">
              <PixelText
                font={font}
                text="TAP AN ITEM TO TRADE"
                scale={2}
                color="#5a6470"
              />
            </div>
          )}
        </div>

        <button
          type="button"
          className="pixel-button secondary modal-close-btn"
          aria-label="close-shop"
          onClick={onClose}
        >
          <PixelText font={font} text="CLOSE" scale={2} />
        </button>
      </div>
    </div>
  );
}
