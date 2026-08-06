// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The merchant's shop, shown while the engine sits in the `shop` phase (the run
// frozen behind it like the bag): his STALL on top — powerups, a shelf of
// consumables, and a couple of gambled weapons, each priced in coins and each a
// FINITE pile (what he sells is what he sells; nothing restocks mid-level) — and
// the hero's BAG below, where every piece is worth what he'll pay for it.
//
// Tapping anything raises a FLOATING CARD beside the cell (ShopDealCard) with
// the trade's own BUY/SELL button in it — and, on a STACKED stall row, a second
// BUY ALL that clears the pile in one tap for what it will really cost; tapping
// past the cells puts it away. That card replaced a fixed detail bar at the foot
// of the panel, which had to reserve room for the tallest item it might ever
// show and so spent a third of a phone screen on a TAP AN ITEM TO TRADE hint.
// SELL JUNK clears every outgrown piece in one tap, using the same scrap rule as
// the inventory's sweep. All mutations go through the engine's shop API
// (sellItem/buyStock) and `onChange` re-renders.

import { localHero } from "./local-seat.ts";
import { useEffect, useState } from "react";

import {
  abilityDef,
  canAffordStallRow,
  canBuyStock,
  questStallRows,
  type QuestStallRow,
  equipmentIcon,
  identifyCost,
  isScrappableLoot,
  isUnidentified,
  medkitTierIndex,
  merchantName,
  repairAllCost,
  sellValue,
  stockBuyableCount,
  wornCounterpart,
  type Equipment,
  type GameState,
  type MerchantStock,
} from "@game/core";

import { formatCoins } from "@ui/lib/format-number.ts";
import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";
import { useDismissOnOutsidePress } from "@ui/lib/use-outside-press.ts";

import { spriteDataUrl, type RelicTier, type Sprites } from "./assets.ts";
import { synth } from "./audio.ts";
import { BuybackPanel } from "./BuybackPanel.tsx";
import {
  medkitIconFor,
  REPAIR_KIT_ICON,
  STAMINA_POTION_ICON,
} from "./consumables.ts";
import { IdentifyReveal } from "./IdentifyReveal.tsx";
import { playUiSound } from "./sfx/ui.ts";
import { POWERUP_BLUE, ShopDealCard } from "./ShopDealCard.tsx";
import { bustSrc, SpritePortrait } from "./SpritePortrait.tsx";
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
 * The counter's one bulk-sell tool: every OUTGROWN piece across the counter in
 * a single gesture (the inventory's own scrap rule), wearing a coin, the label,
 * and — when there's anything to sell — the coins it would fetch. Disabled (and
 * total hidden) when nothing qualifies, so it can never fire on an empty bag.
 *
 * It is the counter's ONLY bulk sale: a SELL ALL sat beside it and sold the
 * keepers too, and it is gone. A whole bag still crosses the counter one deal
 * card at a time.
 */
function SellJunkButton({
  font,
  sprites,
  total,
  count,
  onSell,
}: {
  font: PixelFont;
  sprites: Sprites;
  total: number;
  count: number;
  onSell: () => void;
}) {
  const enabled = count > 0;
  const coin = spriteDataUrl(sprites, "icon_coin");
  return (
    <button
      type="button"
      className="pixel-button secondary shop-bulk-btn"
      aria-label="sell-junk"
      disabled={!enabled}
      onClick={enabled ? onSell : undefined}
    >
      {coin && <img src={coin} alt="" className="pixel-img shop-bulk-coin" />}
      <PixelText
        font={font}
        text="SELL JUNK"
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

/**
 * Arm the counter's APPRAISAL — the merchant's identify service as a MODE:
 * press this, then press the unidentified find to identify (the D2 Cain flow,
 * one press per piece). Pressing it again disarms. It wears the lookup
 * ticket's own barcode glyph (the two are the same service at two venues) and
 * carries the count of veiled finds in the bag; dead while the bag holds none.
 */
function IdentifyButton({
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
        armed ? " shop-identify-armed" : ""
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
        color={enabled ? (armed ? "#ffd75e" : "#e6e8eb") : "#5a6470"}
      />
      {enabled && (
        <PixelText font={font} text={String(count)} scale={2} color="#ffd75e" />
      )}
    </button>
  );
}

/**
 * Open the BUY-BACK shelf — the undo beside the sell tools it undoes. It wears
 * the satchel the LOST & FOUND's rows wear (the two screens are the same idea
 * at two prices) and carries the count of what is on the shelf, so a player who
 * has just swept SELL JUNK can see at a glance that the seven pieces are still
 * recoverable. Dead until something has actually been sold here.
 */
function BuybackButton({
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
        <PixelText font={font} text={String(count)} scale={2} color="#ffd75e" />
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
  // The BUY-BACK shelf, raised over the counter (BuybackPanel).
  const [buybackOpen, setBuybackOpen] = useState(false);
  // The just-identified piece whose centered REVEAL is on stage — the counter's
  // appraisal was paid and the veil came off (see doIdentify / IdentifyReveal).
  const [revealed, setRevealed] = useState<Equipment | null>(null);
  // The APPRAISAL mode: armed by the footer's IDENTIFY button, and while armed
  // a tap on a veiled bag find identifies it (doIdentify) instead of raising
  // its deal card. Stays armed across a run of identifies — press, tap, tap —
  // and disarms itself when nothing veiled is left.
  const [identifyMode, setIdentifyMode] = useState(false);
  const merchant = state.merchant;
  const player = localHero(state);

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

  // Any press that misses the card, a stall row or a bag cell puts the card
  // away — the shared rule every floating card in the game dismisses by, bound
  // above the whole window so a press on the backdrop counts too (see
  // use-outside-press.ts). The footer's own buttons still fire on the same
  // press: this only clears a selection, it never preventDefaults.
  useDismissOnOutsidePress(
    selected !== null,
    ".item-tooltip, .shop-stall-item, .shop-bag-cell",
    () => setSelected(null),
  );

  // ESCAPE (and the pad's B, which arrives as one) unwinds one layer at a time
  // — the CARD first, then an armed IDENTIFY mode, and the shop only once
  // nothing is raised — the same unwind the arsenal's card modal does. Caught
  // in the capture phase so it beats the run's own shop-closing handler
  // underneath. Bound only while something is raised, so an idle counter is
  // dismissed by Escape exactly as before.
  // How many veiled finds the bag still holds — the IDENTIFY button's badge
  // and gate. The ARMED read is derived rather than reset by an effect: the
  // mode collapses the moment the last veiled piece is read (or sold), with
  // no setState-in-effect cascade to lint about.
  const unidentifiedCount = player.inventory.filter(
    (item): item is Equipment => item !== null && isUnidentified(item),
  ).length;
  const identifyArmed = identifyMode && unidentifiedCount > 0;

  const hasCard = selected !== null;
  useEffect(() => {
    if (!hasCard && !identifyArmed) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      playUiSound(synth, "back");
      if (hasCard) setSelected(null);
      else setIdentifyMode(false);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [hasCard, identifyArmed]);

  // The stat card compares the selection against what the hero already wears in
  // that slot (the same green/red deltas the inventory shows) — so a purchase
  // reads as an upgrade and a sale shows what's being let go. Never compare a
  // piece to itself.
  const compareFor = (item: Equipment): Equipment | null => {
    const worn = wornCounterpart(state, player, item);
    return worn && worn.id !== item.id ? worn : null;
  };

  // The one-tap cleanup: every outgrown piece (the inventory SCRAP rule)
  // sold across the counter in a single gesture, for its full valuation.
  const junk = player.inventory
    .map((item, index) => ({ item, index }))
    .filter(
      (e): e is { item: Equipment; index: number } =>
        e.item !== null && isScrappableLoot(state, player, e.item),
    );
  const junkTotal = junk.reduce((sum, e) => sum + sellValue(e.item), 0);

  // BUY ALL: how many units of the selected STACKED row a single tap would
  // actually take — the pile's depth, the purse and the carry room at once
  // (stockBuyableCount), so the button's price tag is what the loop below will
  // really spend rather than an optimistic multiplication.
  const bulkBuy = selectedStock
    ? stockBuyableCount(state, player, selectedStock)
    : 0;
  // What that button SHOWS: the units it would take, or — when it can't take
  // two and is therefore dead — the whole pile it is dimmed against, which is
  // the number that explains the dimming.
  const bulkShown = bulkBuy > 1 ? bulkBuy : (selectedStock?.qty ?? 0);

  // REPAIR ALL: the coins to mend the worn weapon, worn armor, and every
  // breakable bag piece back to full (0 when the whole kit is already whole).
  const repairTotal = repairAllCost(state, player);

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

  // IDENTIFY the tapped bag piece at the counter (items/identify.ts): the fee
  // leaves the purse and the reveal takes center stage. Cued from the
  // command's own result rather than an engine event — a UI-driven mutator's
  // events are wiped by the next step() before the app's event pass runs.
  // The armed mode STAYS armed, so a bagful identifies press-tap-tap-tap.
  const doIdentify = (index: number) => {
    const item = player.inventory[index];
    if (!item || runCommand(state, "identifyItem", index) === null) {
      playUiSound(synth, "back");
      return;
    }
    playUiSound(synth, "confirm");
    setSelected(null);
    setRevealed(item);
    onChange();
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

  // BUY ALL: clear the stacked row in one tap. Still ONE `buyStock` per unit —
  // the verb every other route buys through, re-checking the purse and the
  // room each time — so this can never take a unit the single BUY would have
  // refused, and a session's command channel sees the same verb it always did.
  // `bulkBuy` bounds the loop, and the refusal breaks it anyway.
  const doBuyAll = (entry: MerchantStock, count: number) => {
    let bought = 0;
    while (bought < count && runCommandOk(state, "buyStock", entry.id)) {
      bought += 1;
    }
    playUiSound(synth, bought > 0 ? "equip" : "back");
    if (bought === 0) return;
    if (entry.qty <= 0) setSelected(null);
    onChange();
  };

  return (
    <div className="game-overlay" role="presentation">
      <div className="inventory-panel shop-panel">
        {/* Header: who you're trading with — his FACE and his name — and the
            purse. The portrait is the level's own merchant sprite (he dresses
            for the venue), shown the way a quest giver's is, so the counter
            reads as a person rather than a vending machine. */}
        <div className="shop-header">
          <SpritePortrait
            src={bustSrc(sprites, merchant.sprite)}
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
              const affordable = canBuyStock(state, localHero(state), entry);
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
                const affordable = canAffordStallRow(player, row);
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

        {/* The hero's bag: tap a piece to see what he pays for it — or, with
            the IDENTIFY mode armed, tap a veiled find to have it appraised on
            the spot (each target wears its fee as a gold corner chip). */}
        <div className="shop-section">
          <div className="shop-section-heading">
            <PixelText font={font} text="YOUR BAG" scale={3} color="#9aa3ad" />
            {identifyArmed && (
              <PixelText
                font={font}
                text="TAP A FIND TO IDENTIFY"
                scale={2}
                color="#ffd75e"
              />
            )}
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
                }${
                  identifyArmed && item && isUnidentified(item)
                    ? " identify-target"
                    : ""
                }${item ? tierGlowClass(item.tier) : ""}`}
                aria-label={`bag-${index}`}
                style={
                  item ? { borderColor: TIER_COLORS[item.tier] } : undefined
                }
                disabled={!item}
                onClick={
                  item
                    ? identifyArmed && isUnidentified(item)
                      ? () => doIdentify(index)
                      : (e) => select({ kind: "bag", index }, e.currentTarget)
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
                {/* A bag STACK's depth (lookup tickets) — the same corner chip
                    the stall piles wear. */}
                {item && (item.qty ?? 1) > 1 && (
                  <span className="consumable-count inv-stack-count">
                    <PixelText
                      font={font}
                      text={String(item.qty)}
                      scale={2}
                      color="#f4f4f4"
                    />
                  </span>
                )}
                {/* With the appraisal armed, each veiled find wears its FEE in
                    the same corner chip, in coin gold — what the next tap will
                    actually cost, before it is spent. */}
                {identifyArmed && item && isUnidentified(item) && (
                  <span className="consumable-count inv-stack-count">
                    <PixelText
                      font={font}
                      text={formatCoins(identifyCost(item))}
                      scale={2}
                      color="#ffd75e"
                    />
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* The counter's bottom row: the bulk-sell tools on the left, the
            dismiss on the right. */}
        <div className="shop-footer">
          <div className="shop-footer-sell">
            {/* SELL JUNK: only the outgrown pieces, one coin. */}
            <SellJunkButton
              font={font}
              sprites={sprites}
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
            {/* BUY BACK: the undo, parked with the sales it undoes. Only the
                shelf's own count is read here (never `buybackContents`, which
                copies the list) — the panel it raises does the reading. */}
            <BuybackButton
              font={font}
              sprites={sprites}
              count={merchant.buyback.length}
              onOpen={() => {
                playUiSound(synth, "confirm");
                // Never leave a deal card floating under the shelf: it is
                // anchored to a cell the overlay now covers.
                setSelected(null);
                setBuybackOpen(true);
              }}
            />
            {/* IDENTIFY: arm the appraisal, then tap the veiled find. */}
            <IdentifyButton
              font={font}
              sprites={sprites}
              count={unidentifiedCount}
              armed={identifyArmed}
              onToggle={() => {
                playUiSound(synth, identifyArmed ? "back" : "confirm");
                // The mode owns the bag's taps — a floating deal card under
                // it would read as the thing the next tap acts on.
                setSelected(null);
                setIdentifyMode(!identifyArmed);
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
            <div className="shop-deal-actions">
              <button
                type="button"
                className="pixel-button shop-deal-btn"
                aria-label="buy-selected"
                disabled={!canBuyStock(state, localHero(state), selectedStock)}
                onClick={() => doBuy(selectedStock)}
              >
                <DealLabel
                  font={font}
                  sprites={sprites}
                  verb="BUY"
                  amount={selectedStock.price}
                />
              </button>
              {/* BUY ALL — offered only on a STACKED row (a pile of medkits,
                  salts, lookup tickets), because on a one-off weapon it would
                  be the BUY button twice. It prices what it will actually take:
                  when the purse or the carry room stops short of the pile, the
                  button dims and shows the pile's own cost, so a dead button
                  still says WHY it is dead. */}
              {selectedStock.qty > 1 && (
                <button
                  type="button"
                  className="pixel-button shop-deal-btn"
                  aria-label="buy-all-selected"
                  disabled={bulkBuy < 2}
                  onClick={() => doBuyAll(selectedStock, bulkBuy)}
                >
                  <DealLabel
                    font={font}
                    sprites={sprites}
                    verb={`BUY ALL ${bulkShown}`}
                    amount={bulkShown * selectedStock.price}
                  />
                </button>
              )}
            </div>
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

      {/* THE BUY-BACK SHELF, raised over the counter — the last dozen pieces
          sold here, each redeemable for what he paid. Rendered last so it sits
          above the panel and any card left floating beside it. */}
      {buybackOpen && (
        <BuybackPanel
          font={font}
          relicFonts={relicFonts}
          sprites={sprites}
          state={state}
          onChange={onChange}
          onClose={() => setBuybackOpen(false)}
        />
      )}

      {/* THE IDENTIFY REVEAL — the appraisal just paid off: the item-found
          spectacle takes center stage with the piece's full stats. Rendered
          last so it sits above the counter and any floating card. */}
      {revealed && (
        <IdentifyReveal
          font={font}
          relicFonts={relicFonts}
          sprites={sprites}
          state={state}
          item={revealed}
          onClose={() => setRevealed(null)}
        />
      )}
    </div>
  );
}
