// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The merchant's shop, shown while the engine sits in the `shop` phase (the run
// frozen behind it like the bag): his STALL on top — powerups, a shelf of
// consumables, and a couple of gambled weapons, each priced in coins and each a
// FINITE pile (what he sells is what he sells; nothing restocks mid-level) — and
// the hero's BAG below, where every piece is worth what he'll pay for it.
//
// Tapping anything raises a FLOATING CARD beside the cell (ShopDealCard) with
// the trade's own BUY/SELL button in it; tapping past the cells puts it away.
// That card replaced a fixed detail bar at the foot of the panel, which had to
// reserve room for the tallest item it might ever show and so spent a third of a
// phone screen on a TAP AN ITEM TO TRADE hint. SELL JUNK clears every outgrown
// piece in one tap, using the same scrap rule as the inventory's sweep. All
// mutations go through the engine's shop API (sellItem/buyStock) and `onChange`
// re-renders.

import { useCallback, useEffect, useState, type PointerEvent } from "react";

import {
  abilityDef,
  canAffordStallRow,
  canBuyStock,
  questStallRows,
  type QuestStallRow,
  equipmentIcon,
  isScrappableLoot,
  medkitTierIndex,
  merchantName,
  repairAllCost,
  sellValue,
  wornCounterpart,
  type Equipment,
  type GameState,
  type MerchantStock,
} from "@game/core";

import { formatCoins } from "@ui/lib/format-number.ts";
import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

import { spriteDataUrl, type RelicTier, type Sprites } from "./assets.ts";
import { synth } from "./audio.ts";
import {
  medkitIconFor,
  REPAIR_KIT_ICON,
  STAMINA_POTION_ICON,
} from "./consumables.ts";
import { playUiSound } from "./sfx/ui.ts";
import { POWERUP_BLUE, ShopDealCard } from "./ShopDealCard.tsx";
import { portraitSrc, SpritePortrait } from "./SpritePortrait.tsx";
import { TIER_COLORS, tierGlowClass } from "./tiers.ts";

import { runCommand, runCommandOk } from "./run-commands.ts";

/** What the player has tapped, plus the cell rect the card anchors to. Held
 * together because they change together: a selection with a stale anchor would
 * float the card over whatever moved into that spot. */
type Selection = (
  { kind: "stock"; id: number } | { kind: "bag"; index: number }
) & { anchor: DOMRect };

/** The sprite a stall entry shows on the counter — a powerup's own icon, a
 * consumable's dock glyph (medkits per quality), a weapon's item icon. */
function stockIconName(entry: MerchantStock): string {
  switch (entry.kind) {
    case "ability":
      return abilityDef(entry.defId).icon;
    case "consumable":
      return entry.item === "medkit"
        ? medkitIconFor(medkitTierIndex(entry.tier))
        : entry.item === "repair"
          ? REPAIR_KIT_ICON
          : STAMINA_POTION_ICON;
    case "weapon":
      return equipmentIcon(entry.equipment.defId);
  }
}

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
        text={formatCoins(amount)}
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
          text={formatCoins(total)}
          scale={2}
          color="#ffd75e"
        />
      )}
    </button>
  );
}

/** Mend the hero's whole kit for coins — an icon-only button beside the sell
 * tools: just the wrench, no label. Enabled (and tappable) only when something
 * needs mending AND the purse can cover it; otherwise it dims like a spent
 * action. A tap mends the whole kit at once. */
function RepairButton({
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

  // Derived per render, never stored: a row goes stale the instant a flag
  // three rooms away unlocks or spends it (see quests/merchant.ts).
  const questRows = questStallRows(state);

  /** Take an errand row — the sale that unlocks, or the purchase it unlocked. */
  const onErrandRow = (row: QuestStallRow) => {
    const ok =
      row.kind === "sell"
        ? runCommandOk(state, "sellQuestPiece", row.questId, row.item)
        : runCommandOk(state, "buyQuestPiece", row.questId, row.item);
    if (ok) onChange();
  };

  const stockIcon = (entry: MerchantStock) =>
    spriteDataUrl(sprites, stockIconName(entry));

  const selectedStock =
    selected?.kind === "stock"
      ? merchant.stock.find((s) => s.id === selected.id)
      : undefined;
  const selectedBag =
    selected?.kind === "bag" ? player.inventory[selected.index] : undefined;

  /** Raise the card for a tapped cell, anchored to the cell's own rect. */
  const select = (
    pick: { kind: "stock"; id: number } | { kind: "bag"; index: number },
    target: EventTarget,
  ) => {
    const anchor = (target as HTMLElement).getBoundingClientRect();
    setSelected({ ...pick, anchor });
  };

  // Any press that misses a stall or bag cell puts the card away — the card
  // itself swallows its own presses (see ShopDealCard), and the footer's own
  // buttons still fire because this only clears a selection, never preventDefault.
  const dismissOnMiss = useCallback((event: PointerEvent) => {
    if (
      !(event.target as HTMLElement).closest(".shop-stall-item, .shop-bag-cell")
    ) {
      setSelected(null);
    }
  }, []);

  // ESCAPE (and the pad's B, which arrives as one) closes the CARD first and the
  // shop only once nothing is raised — the same one-layer-at-a-time unwind the
  // arsenal's card modal does. Caught in the capture phase so it beats the
  // run's own shop-closing handler underneath. Bound only while a card is up, so
  // an un-selected counter is dismissed by Escape exactly as before.
  const hasCard = selected !== null;
  useEffect(() => {
    if (!hasCard) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      playUiSound(synth, "back");
      setSelected(null);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [hasCard]);

  // The stat card compares the selection against what the hero already wears in
  // that slot (the same green/red deltas the inventory shows) — so a purchase
  // reads as an upgrade and a sale shows what's being let go. Never compare a
  // piece to itself.
  const compareFor = (item: Equipment): Equipment | null => {
    const worn = wornCounterpart(state, item);
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
    if (runCommand(state, "repairGear") !== null) {
      playUiSound(synth, "confirm");
      onChange();
    } else {
      playUiSound(synth, "back");
    }
  };

  const doSell = (index: number) => {
    if (runCommand(state, "sellItem", index) !== null) {
      playUiSound(synth, "confirm");
      setSelected(null);
      onChange();
    }
  };

  const doBuy = (entry: MerchantStock) => {
    if (runCommandOk(state, "buyStock", entry.id)) {
      playUiSound(synth, "equip");
      // Nothing on the stall restocks, so a purchase that empties the entry
      // leaves a dead row selected — drop the card rather than offering a
      // SOLD OUT button. A pile with units left keeps its card up so the next
      // medkit is one tap away.
      if (entry.qty <= 0) setSelected(null);
      onChange();
    } else {
      playUiSound(synth, "back");
    }
  };

  return (
    <div className="game-overlay" role="presentation">
      <div className="inventory-panel shop-panel" onPointerDown={dismissOnMiss}>
        {/* Header: who you're trading with — his FACE and his name — and the
            purse. The portrait is the level's own merchant sprite (he dresses
            for the venue), shown the way a quest giver's is, so the counter
            reads as a person rather than a vending machine. */}
        <div className="shop-header">
          <SpritePortrait
            src={portraitSrc(sprites, merchant.sprite)}
            frameClass="shop-portrait-frame"
          />
          <PixelText
            font={font}
            text={merchantName(state.level.id)}
            scale={3}
            color="#ffd75e"
            className="shop-name"
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
              const soldOut = entry.qty <= 0;
              const affordable = canBuyStock(state, entry);
              const tint =
                entry.kind === "weapon"
                  ? TIER_COLORS[entry.equipment.tier]
                  : POWERUP_BLUE;
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
                  onClick={(e) =>
                    select({ kind: "stock", id: entry.id }, e.currentTarget)
                  }
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
                    {/* HOW MANY ARE LEFT, on the cell itself. The stall no
                        longer restocks, so the pile's depth is a fact the
                        player plans around — it belongs on the counter, not
                        only inside the card. A single unit shows nothing (every
                        weapon is one, and a "1" on all of them is noise). */}
                    {entry.qty > 1 && (
                      <span className="consumable-count shop-stall-count">
                        <PixelText
                          font={font}
                          text={String(entry.qty)}
                          scale={2}
                          color="#f4f4f4"
                        />
                      </span>
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

        {/* ERRANDS — the rows a running quest put on this counter (see
            src/game/quests/merchant.ts). Its own section rather than mixed
            into FOR SALE, because these are not the trader's goods: they exist
            only while somebody is doing the errand that produced them, and
            burying a chain's one purchasable piece among the medkits is how a
            player walks past the thing they came for.

            The rows are DERIVED per render, so a sale that unlocks a purchase
            makes the new row appear without the panel being told. */}
        {questRows.length > 0 && (
          <div className="shop-section">
            <PixelText font={font} text="ERRANDS" scale={3} color="#e0b955" />
            <div className="shop-errands">
              {questRows.map((row) => {
                const affordable = canAffordStallRow(state, row);
                return (
                  <button
                    key={`${row.questId}:${row.item}:${row.kind}`}
                    type="button"
                    className={`shop-errand-row${
                      affordable ? "" : " sold-out"
                    }`}
                    aria-label={`errand-${row.kind}-${row.item}`}
                    disabled={!affordable}
                    onClick={() => onErrandRow(row)}
                  >
                    <PixelText
                      font={font}
                      text={row.kind === "sell" ? "SELL" : "BUY"}
                      scale={2}
                      color={row.kind === "sell" ? "#7fd08a" : "#e0b955"}
                    />
                    <PixelText
                      font={font}
                      text={row.name}
                      scale={2}
                      color="#e8e2d0"
                    />
                    <CoinPrice
                      font={font}
                      sprites={sprites}
                      amount={row.coins}
                      color={affordable ? "#ffd75e" : "#e06a6a"}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* The hero's bag: tap a piece to see what he pays for it. */}
        <div className="shop-section">
          <PixelText font={font} text="YOUR BAG" scale={3} color="#9aa3ad" />
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
                  item
                    ? (e) => select({ kind: "bag", index }, e.currentTarget)
                    : undefined
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

        {/* The counter's bottom row: the bulk-sell tools on the left, the
            dismiss on the right. */}
        <div className="shop-footer">
          <div className="shop-footer-sell">
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
                for (const { index } of junk)
                  runCommand(state, "sellItem", index);
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
                for (const { index } of bag)
                  runCommand(state, "sellItem", index);
                playUiSound(synth, "confirm");
                setSelected(null);
                onChange();
              }}
            />
            {/* REPAIR ALL: mend the whole kit — an icon-only button, no label. */}
            <RepairButton
              sprites={sprites}
              cost={repairTotal}
              coins={player.coins}
              onRepair={doRepair}
            />
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

      {/* THE DEAL CARD: what the tapped thing is, and the one button that
          trades it — floated beside the cell (never over it), portaled above
          the panel. Nothing is reserved for it while nothing is selected,
          which is the whole point of moving it out of the layout. */}
      {selected && selectedStock && (
        <ShopDealCard
          font={font}
          relicFonts={relicFonts}
          sprites={sprites}
          state={state}
          deal={{ kind: "stock", entry: selectedStock }}
          anchor={selected.anchor}
          compareTo={
            selectedStock.kind === "weapon"
              ? compareFor(selectedStock.equipment)
              : null
          }
          action={
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
          }
        />
      )}
      {selected?.kind === "bag" && selectedBag && (
        <ShopDealCard
          font={font}
          relicFonts={relicFonts}
          sprites={sprites}
          state={state}
          deal={{ kind: "bag", index: selected.index, item: selectedBag }}
          anchor={selected.anchor}
          compareTo={compareFor(selectedBag)}
          action={
            <button
              type="button"
              className="pixel-button shop-deal-btn"
              aria-label="sell-selected"
              onClick={() => doSell(selected.index)}
            >
              <DealLabel
                font={font}
                sprites={sprites}
                amount={sellValue(selectedBag)}
              />
            </button>
          }
        />
      )}
    </div>
  );
}
