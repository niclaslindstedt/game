// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The merchant's shop, shown while the engine sits in the `shop` phase (the run
// frozen behind it like the bag): his STALL on top — powerups, a shelf of
// consumables, and a couple of gambled weapons, each priced in coins and each a
// FINITE pile (what he sells is what he sells; nothing restocks mid-level) — and
// the hero's BAG below, where every piece is worth what he'll pay for it.
//
// Tapping anything raises a FLOATING CARD beside the cell (ShopDealCard) with
// the trade's own BUY/SELL control in it — on a stacked stall row, a quantity
// field in front of the BUY button, which reprices as it is typed into
// (ShopTools / shop-quantity.ts); tapping past the cells puts it away. That card
// replaced a fixed detail bar at the foot of the panel, which had to reserve
// room for the tallest item it might ever show and so spent a third of a phone
// screen on a TAP AN ITEM TO TRADE hint.
//
// SELL JUNK is a MODE, not a sweep: the first press ticks every outgrown piece
// (the inventory's own scrap rule) and hands the bag over to picking, the second
// press takes the sale. While it is armed a bag cell is a TICK BOX — so reading
// one moves to the gestures that are not presses: HOVER on a mouse, PRESS AND
// HOLD on a finger, both of which raise the piece's card with no button on it.
// All mutations go through the engine's shop API (sellItem/buyStock) and
// `onChange` re-renders.

import { localHero } from "./local-seat.ts";
import { useEffect, useRef, useState } from "react";

import {
  canAffordStallRow,
  canBuyStock,
  questStallRows,
  type QuestStallRow,
  equipmentIcon,
  identifyCost,
  isScrappableLoot,
  isUnidentified,
  merchantLine,
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
import { watchLongPress, type LongPressWatch } from "@ui/lib/long-press.ts";
import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";
import { useDismissOnOutsidePress } from "@ui/lib/use-outside-press.ts";

import { spriteDataUrl, type RelicTier, type Sprites } from "./assets.ts";
import { synth } from "./audio.ts";
import { BuybackPanel } from "./BuybackPanel.tsx";
import { IdentifyReveal } from "./IdentifyReveal.tsx";
import { playUiSound } from "./sfx/ui.ts";
import { POWERUP_BLUE, ShopDealCard } from "./ShopDealCard.tsx";
import { stockIconName } from "./shop-stock-icon.ts";
import {
  BuybackButton,
  BuyQuantityRow,
  CoinPrice,
  DealLabel,
  IdentifyButton,
  RepairButton,
  SellSweepButton,
} from "./ShopTools.tsx";
import { SpritePortrait, useSpeakingBust } from "./SpritePortrait.tsx";
import { useHelpWrapRem } from "./title-screen/use-title-layout.ts";
import { TIER_COLORS, tierGlowClass } from "./tiers.ts";

import { runCommand, runCommandOk } from "./run-commands.ts";

/** What the player has tapped, plus the cell rect the card anchors to. Held
 * together because they change together: a selection with a stale anchor would
 * float the card over whatever moved into that spot.
 *
 * A bag selection raised by a HOVER or a HOLD while the sell mode is picking is
 * a `peek`: the same card with no button on it, because in that mode the press
 * that would have sold the piece is the press that ticks it. */
type Selection = (
  { kind: "stock"; id: number } | { kind: "bag"; index: number; peek?: true }
) & { anchor: DOMRect };

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
  // THE SELL PICK: the bag indices ticked for the bulk sale, or null while the
  // mode is not up at all. A Set rather than a flag on each item because the
  // pick is the SHOP's, not the run's — closing the counter forgets it, and
  // nothing in the engine ever hears that a piece was considered.
  const [sellPick, setSellPick] = useState<Set<number> | null>(null);
  const merchant = state.merchant;
  const player = localHero(state);
  const line = merchantLine(state.level.id);
  // The counter is a conversation like any other, so the trader's face moves
  // while he is behind it — when a mod's art gave him a `talk:` clip
  // (`render/clips.ts`). The still bust otherwise, which is the shipped game.
  const portrait = useSpeakingBust(sprites, merchant.sprite);
  // His line is a SENTENCE, so it wraps to the same width every other piece of
  // running copy in the overlays does rather than running off the phone.
  const wrapRem = useHelpWrapRem();

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

  // Any press that misses the card, a live stall row or a filled bag cell puts
  // the card away — the shared rule every floating card in the game dismisses
  // by, bound above the whole window so a press on the backdrop counts too (see
  // use-outside-press.ts). The footer's own buttons still fire on the same
  // press: this only clears a selection, it never preventDefaults.
  //
  // The exemption is `data-card`, stamped on the rows and cells that actually
  // RAISE a card, rather than on their classes: a bag is mostly empty cells and
  // a picked-over stall mostly sold-out rows, and a press on one of those does
  // nothing at all — so exempting the class made most of the counter's surface
  // eat the dismiss instead of performing it.
  useDismissOnOutsidePress(
    selected !== null,
    ".item-tooltip, [data-card]",
    () => setSelected(null),
  );

  // How many veiled finds the bag still holds — the IDENTIFY button's badge
  // and gate. The ARMED read is derived rather than reset by an effect: the
  // mode collapses the moment the last veiled piece is read (or sold), with
  // no setState-in-effect cascade to lint about.
  const unidentifiedCount = player.inventory.filter(
    (item): item is Equipment => item !== null && isUnidentified(item),
  ).length;
  const identifyArmed = identifyMode && unidentifiedCount > 0;
  const sellArmed = sellPick !== null;

  // ESCAPE (and the pad's B, which arrives as one) unwinds one layer at a time
  // — the CARD first, then a picking SELL mode, then an armed IDENTIFY mode,
  // and the shop only once nothing is raised — the same unwind the arsenal's
  // card modal does. Caught in the capture phase so it beats the run's own
  // shop-closing handler underneath. Bound only while something is raised, so
  // an idle counter is dismissed by Escape exactly as before.
  const hasCard = selected !== null;
  useEffect(() => {
    if (!hasCard && !identifyArmed && !sellArmed) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      playUiSound(synth, "back");
      if (hasCard) setSelected(null);
      else if (sellArmed) setSellPick(null);
      else setIdentifyMode(false);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [hasCard, identifyArmed, sellArmed]);

  // The stat card compares the selection against what the hero already wears in
  // that slot (the same green/red deltas the inventory shows) — so a purchase
  // reads as an upgrade and a sale shows what's being let go. Never compare a
  // piece to itself.
  const compareFor = (item: Equipment): Equipment | null => {
    const worn = wornCounterpart(state, player, item);
    return worn && worn.id !== item.id ? worn : null;
  };

  // What the SELL sweep would take: while the mode is picking, exactly what is
  // ticked; before it is armed, the outgrown pieces the first press will tick
  // (the inventory SCRAP rule), which is what the button's price tag promises.
  const junk = player.inventory
    .map((item, index) => ({ item, index }))
    .filter(
      (e): e is { item: Equipment; index: number } =>
        e.item !== null && isScrappableLoot(state, player, e.item),
    );
  const sellIndices = sellPick
    ? [...sellPick].sort((a, b) => a - b)
    : junk.map((e) => e.index);
  const sellTotal = sellIndices.reduce((sum, index) => {
    const item = player.inventory[index];
    return item ? sum + sellValue(item) : sum;
  }, 0);
  const bagHoldsAnything = player.inventory.some((item) => item !== null);

  // How many units of the selected STACKED row this counter would really part
  // with — the pile's depth, the purse and the carry room at once
  // (stockBuyableCount). It is the quantity field's ceiling, so the field can
  // never be typed into a purchase the counter would then refuse.
  const maxBuy = selectedStock
    ? stockBuyableCount(state, player, selectedStock)
    : 0;

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

  // BUY `count` units in one press. Still ONE `buyStock` per unit — the verb
  // every other route buys through, re-checking the purse and the room each
  // time — so a typed quantity can never take a unit the single BUY would have
  // refused, and a session's command channel sees the same verb it always did.
  // The field's own clamp bounds the loop, and the refusal breaks it anyway.
  const doBuy = (entry: MerchantStock, count: number) => {
    let bought = 0;
    while (bought < count && runCommandOk(state, "buyStock", entry.id)) {
      bought += 1;
    }
    playUiSound(synth, bought > 0 ? "equip" : "back");
    if (bought === 0) return;
    // Nothing on the stall restocks, so a purchase that empties the entry
    // leaves a dead row selected — drop the card rather than offering a SOLD
    // OUT button. A pile with units left keeps its card up so the next medkit
    // is one press away.
    if (entry.qty <= 0) setSelected(null);
    onChange();
  };

  // ---- THE SELL PICK -------------------------------------------------------

  /** Arm the picking mode with every outgrown piece already ticked. */
  const armSell = () => {
    playUiSound(synth, "confirm");
    // A mode owns the bag's presses, so two of them can never be up at once,
    // and a floating card under either would read as the thing the next press
    // acts on.
    setIdentifyMode(false);
    setSelected(null);
    setSellPick(new Set(junk.map((e) => e.index)));
  };

  /** The second press: take the sale, or — with nothing ticked — back out. */
  const takeSale = () => {
    const indices = sellIndices;
    setSellPick(null);
    setSelected(null);
    if (indices.length === 0) {
      playUiSound(synth, "back");
      return;
    }
    // `sellItem` empties the slot in place (it never compacts the bag), so the
    // indices stay meaningful across the loop.
    for (const index of indices) runCommand(state, "sellItem", index);
    playUiSound(synth, "confirm");
    onChange();
  };

  /** Tick or untick one bag cell while the mode is picking. */
  const togglePick = (index: number) => {
    if (!sellPick) return;
    const next = new Set(sellPick);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    playUiSound(synth, next.has(index) ? "confirm" : "back");
    setSellPick(next);
    // A pick is not a read: whatever card the hold or the hover raised goes.
    setSelected(null);
  };

  // PRESS AND HOLD to read a piece while the mode is picking — the press
  // itself is spoken for by the tick, so the card moves to the gesture that is
  // not a press. One watch for the whole bag: there is only ever one pointer on
  // it, and the click handler asks `fired` to know whether the release it is
  // about to read was a hold rather than a tap.
  const hold = useRef<LongPressWatch | null>(null);
  useEffect(() => () => hold.current?.cancel(), []);

  /** Raise the buttonless card for a bag cell — a read, never a trade. */
  const peekBag = (index: number, anchor: DOMRect) =>
    setSelected({ kind: "bag", index, peek: true, anchor });

  /** Lower a card that a hover raised, leaving a tapped one alone. */
  const dropPeek = () =>
    setSelected((current) =>
      current?.kind === "bag" && current.peek ? null : current,
    );

  return (
    <div className="game-overlay" role="presentation">
      <div className="inventory-panel shop-panel">
        {/* Header: who you're trading with — his FACE and his name — and the
            purse. The portrait is the level's own merchant sprite (he dresses
            for the venue), shown the way a quest giver's is, so the counter
            reads as a person rather than a vending machine. */}
        <div className="shop-header">
          <SpritePortrait src={portrait} frameClass="shop-portrait-frame" />
          <PixelText
            font={font}
            text={merchantName(state.level.id)}
            scale={3}
            color="#ffd75e"
            className="shop-name"
          />
          <CoinPrice font={font} sprites={sprites} amount={player.coins} />
        </div>

        {/* HIS LINE — what he says while you shop (`LevelDef.merchant.line`).
            Across the counter rather than through the dialogue box on purpose:
            it is said on EVERY visit, and a scene that has to be dismissed
            before the hero can buy a medkit is a toll booth. Absent on a venue
            that authored none, which is most of them. */}
        {line !== null && (
          <PixelText
            font={font}
            text={line}
            scale={2}
            color="#9aa3ad"
            className="shop-line"
            maxWidth={wrapRem}
            align="center"
          />
        )}

        {/* The stall: his goods, priced. Sold-out weapons stay visible but
            dark — the run remembers what it passed up. */}
        <div className="shop-section">
          <PixelText font={font} text="FOR SALE" scale={3} color="#9aa3ad" />
          <div className="shop-stall">
            {merchant.stock.map((entry) => {
              const icon = stockIcon(entry);
              const soldOut = entry.qty <= 0;
              const affordable = canBuyStock(state, player, entry);
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
                  data-card={soldOut ? undefined : ""}
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
            engine/game/quests/merchant.ts). Its own section rather than mixed
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

        {/* The hero's bag: tap a piece to see what he pays for it — or, with a
            mode armed, tap to have a veiled find appraised on the spot, or to
            tick it for the sale (each target wears its fee or its price as a
            corner chip). */}
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
            {sellArmed && !identifyArmed && (
              <PixelText
                font={font}
                text="TAP TO PICK - HOLD TO READ"
                scale={2}
                color="#7fd08a"
              />
            )}
          </div>
          <div className="inv-grid shop-bag-grid">
            {player.inventory.map((item, index) => {
              const picked = sellArmed && sellPick.has(index);
              // While the sale is picking, the press TICKS: reading a piece
              // moves to hover (mouse) and press-and-hold (finger).
              const pickable = sellArmed && item !== null;
              return (
                <button
                  key={index}
                  type="button"
                  className={`inv-cell shop-bag-cell${
                    selected?.kind === "bag" && selected.index === index
                      ? " selected"
                      : ""
                  }${picked ? " sell-target" : ""}${
                    identifyArmed && item && isUnidentified(item)
                      ? " identify-target"
                      : ""
                  }${item ? tierGlowClass(item.tier) : ""}`}
                  aria-label={`bag-${index}`}
                  aria-pressed={pickable ? picked : undefined}
                  data-card={item ? "" : undefined}
                  style={
                    item ? { borderColor: TIER_COLORS[item.tier] } : undefined
                  }
                  disabled={!item}
                  onClick={
                    !item
                      ? undefined
                      : pickable
                        ? () => {
                            // A hold has already done this press's job; the
                            // release that follows it is not a tick.
                            if (hold.current?.fired) {
                              hold.current = null;
                              return;
                            }
                            togglePick(index);
                          }
                        : identifyArmed && isUnidentified(item)
                          ? () => doIdentify(index)
                          : (e) =>
                              select({ kind: "bag", index }, e.currentTarget)
                  }
                  onPointerDown={
                    pickable
                      ? (e) => {
                          const anchor =
                            e.currentTarget.getBoundingClientRect();
                          hold.current?.cancel();
                          hold.current = watchLongPress(
                            { x: e.clientX, y: e.clientY },
                            () => peekBag(index, anchor),
                          );
                        }
                      : undefined
                  }
                  onPointerMove={
                    pickable
                      ? (e) => hold.current?.moved(e.clientX, e.clientY)
                      : undefined
                  }
                  onPointerUp={
                    pickable ? () => hold.current?.cancel() : undefined
                  }
                  onPointerCancel={
                    pickable
                      ? () => {
                          hold.current?.cancel();
                          hold.current = null;
                        }
                      : undefined
                  }
                  onPointerEnter={
                    pickable
                      ? (e) => {
                          if (e.pointerType !== "mouse") return;
                          peekBag(
                            index,
                            e.currentTarget.getBoundingClientRect(),
                          );
                        }
                      : undefined
                  }
                  onPointerLeave={
                    pickable
                      ? (e) => {
                          hold.current?.cancel();
                          if (e.pointerType === "mouse") dropPeek();
                        }
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
                  {/* A TICKED piece wears what it fetches, in the OPPOSITE
                      corner from the stack chip — the two say different things
                      about the same cell and one must not sit on the other. */}
                  {picked && item && (
                    <span className="consumable-count shop-sell-chip">
                      <PixelText
                        font={font}
                        text={formatCoins(sellValue(item))}
                        scale={2}
                        color="#7fd08a"
                      />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* The counter's bottom row: the bulk-sell tools on the left, the
            dismiss on the right. */}
        <div className="shop-footer">
          <div className="shop-footer-sell">
            {/* SELL JUNK: arm the pick, then take the sale. */}
            <SellSweepButton
              font={font}
              sprites={sprites}
              armed={sellArmed}
              total={sellTotal}
              count={sellIndices.length}
              canArm={bagHoldsAnything}
              onPress={sellArmed ? takeSale : armSell}
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
                setSellPick(null);
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
                // it, or a half-made sell pick, would read as the thing the
                // next tap acts on.
                setSelected(null);
                setSellPick(null);
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

      {/* THE DEAL CARD: what the tapped thing is, and the one control that
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
            <BuyQuantityRow
              // A fresh row is a fresh quantity: the field is remounted rather
              // than reset, so nothing carries "5" from the medkits over to
              // the salts.
              key={selectedStock.id}
              font={font}
              sprites={sprites}
              price={selectedStock.price}
              max={maxBuy}
              canBuy={canBuyStock(state, player, selectedStock)}
              onBuy={(count) => doBuy(selectedStock, count)}
            />
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
            // A PEEK has no button: the card was raised to answer "what is
            // this", and the sale it belongs to is the one being picked below.
            selected.peek ? null : (
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
            )
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
