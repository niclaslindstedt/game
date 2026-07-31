// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE LOST & FOUND — buy back what the AUTO PILOT threw away.
//
// A paid ride flies unattended with a bag it cannot empty, so its bag
// discipline sheds the least precious piece to make room for the next find
// (src/game/bot/economy.ts `cullWorstLoot`). Everything magic-or-better it
// sheds is banked in the hero's vault (src/game/items/vault.ts) instead of
// destroyed, and this screen sells it back for coins on the per-tier ladder
// (config `VAULT.reclaimCost`) — 10 million for a magic find up to 2 billion
// for an artifact.
//
// It borrows the ARSENAL's shape wholesale (the same list + docked/pop-up
// ItemCard, the same overlay skin) so the two browsers read as one family;
// what it adds is a PRICE column, the purse, and a two-step reclaim — at
// these prices a stray tap must never spend the purse.
//
// The buy-back UNFOLDS FROM THE ROW it buys. A footer button parked under the
// list had to name the piece it would spend on ("RECLAIM ITEM 10M" while three
// items sit above it, each with its own price), which is exactly the ambiguity
// a purse this size cannot afford. Picking an item opens its action right
// beneath it instead — the price you are about to pay directly under the piece
// it pays for — and the footer keeps only the way out.

import { Fragment, useEffect, useMemo, useReducer, useState } from "react";

import {
  applyLoadout,
  createGame,
  equipmentName,
  reclaimCost,
  vaultContents,
  type Equipment,
  type GameState,
  type VaultRefusal,
} from "@game/core";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";
import { formatCoins } from "@ui/lib/format-number.ts";
import { useMediaQuery } from "@ui/lib/use-media-query.ts";

import { synth } from "./audio.ts";
import {
  characterPurse,
  characterVault,
  reclaimFromVault,
  type Character,
} from "./characters.ts";
import { ItemCard, ItemCardModal, ItemIcon } from "./ItemCard.tsx";
import { playUiSound } from "./sfx/ui.ts";
import { spriteDataUrl, type RelicTier, type Sprites } from "./assets.ts";
import { TIER_COLORS, tierGlowClass } from "./tiers.ts";
import { useHelpWrapRem } from "./title-screen/use-title-layout.ts";

import { runCommand } from "./run-commands.ts";

/** Uppercase slot label for a list row's sub-line (WEAPON, HEAD, CHARM, …). */
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

/** A price the pixel font can actually show at a glance: 2000000000 reads as
 * nothing, 2B reads as a number. Whole units only — the ladder's rungs are all
 * round, so no rung ever needs a decimal. */
export function coinsShort(coins: number): string {
  if (coins >= 1_000_000_000) return `${Math.round(coins / 1_000_000_000)}B`;
  if (coins >= 1_000_000) return `${Math.round(coins / 1_000_000)}M`;
  if (coins >= 1_000) return `${Math.round(coins / 1_000)}K`;
  return String(coins);
}

/**
 * THE LOST & FOUND browser — the list, the cards, and the two-step buy-back,
 * over whichever vault it is handed.
 *
 * Two surfaces drive it: the title screen's VaultScreen (the persisted hero's
 * banked vault) and the run's RunVaultScreen (the LIVE purse and bag, opened
 * from the AUTO PILOT start confirm as the last chance to buy something back
 * before the new ride trashes it). Both read the same list, so a player who
 * learns the screen in one place knows it in the other.
 */
function VaultBrowser({
  font,
  relicFonts,
  sprites,
  state,
  items,
  purse,
  bagFull,
  warning,
  onReclaim,
  overlayClass,
  onClose,
}: {
  font: PixelFont;
  relicFonts: Record<RelicTier, PixelFont>;
  sprites: Sprites;
  /** The build the cards are compared against (the hero wearing his kit). */
  state: GameState;
  /** The vault, most precious first (`vaultContents` order). */
  items: Equipment[];
  /** Coins the buy-back may spend. */
  purse: number;
  /** No free bag cell — every price is unbuyable until one is made. */
  bagFull: boolean;
  /** When the offer expires, in this surface's words. */
  warning: string;
  /** Do the trade; `null` on success, else why it was refused. */
  onReclaim: (item: Equipment) => VaultRefusal | null;
  /** Extra class on the overlay — the run's copy lifts itself over the pause
   * and AUTO PILOT overlays it is raised from (`.run-vault`). */
  overlayClass?: string;
  onClose: () => void;
}) {
  const wide = useMediaQuery("(min-aspect-ratio: 4/3)");
  // Every line under the title is read at the same size as the item names, so
  // a full sentence (the expiry warning, a refusal, the buy-back question) can
  // outrun a portrait phone's panel. Wrap them at the same viewport SHARE the
  // settings help line uses, so one line folds instead of running off the edge
  // — and folds identically on a phone, a tablet, and the 2× large-screen
  // regime.
  const wrapRem = useHelpWrapRem();
  const [cursor, setCursor] = useState(0);
  const [openItem, setOpenItem] = useState<number | null>(null);
  // The piece whose buy-back is UNFOLDED beneath it, and — one step further in
  // — the piece awaiting a CONFIRM. A mouse HOVER only moves the cursor; it
  // never unfolds an action, because a panel that opened under whatever the
  // pointer drifted across would shove the rest of the list out from under it.
  const [open, setOpen] = useState<number | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  // The outcome line under the list (a refusal, or the receipt of the last
  // buy-back).
  const [notice, setNotice] = useState<{ text: string; bad: boolean } | null>(
    null,
  );
  const at = Math.min(cursor, Math.max(0, items.length - 1));
  const selected = items[at] ?? null;
  const affordable = selected !== null && purse >= reclaimCost(selected);
  const coinIcon = spriteDataUrl(sprites, "icon_coin");

  const reclaim = (item: Equipment) => {
    const refused = onReclaim(item);
    setPending(null);
    setOpen(null);
    if (refused) {
      playUiSound(synth, "back");
      setNotice({
        text:
          refused === "coins"
            ? "NOT ENOUGH COINS"
            : refused === "bag"
              ? "BAG IS FULL - MAKE ROOM AND COME BACK"
              : "NO LONGER IN THE VAULT",
        bad: true,
      });
      return;
    }
    playUiSound(synth, "equip");
    setCursor((c) => Math.max(0, Math.min(c, items.length - 2)));
    setNotice({ text: `RECLAIMED ${equipmentName(item)}`, bad: false });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (openItem !== null) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (items.length === 0) return;
        playUiSound(synth, "move");
        const delta = event.key === "ArrowDown" ? 1 : -1;
        const next = (at + delta + items.length) % items.length;
        setPending(null);
        setCursor(next);
        // Stepping with the keys carries the unfolded action along with the
        // cursor — the arrows can't jitter the way a drifting pointer can, and
        // a keyboard player never has to press a key just to see the price.
        setOpen(items[next]?.id ?? null);
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (!selected) return;
        // Enter walks exactly the taps a pointer walks: unfold the action,
        // arm it, confirm.
        if (pending === selected.id) reclaim(selected);
        else if (open !== selected.id) {
          playUiSound(synth, "confirm");
          setNotice(null);
          setOpen(selected.id);
        } else if (affordable && !bagFull) {
          playUiSound(synth, "confirm");
          setNotice(null);
          setPending(selected.id);
        }
      } else if (event.key === "Escape") {
        event.preventDefault();
        playUiSound(synth, "back");
        if (pending !== null) setPending(null);
        else onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return (
    <div className={`arsenal-overlay${overlayClass ? ` ${overlayClass}` : ""}`}>
      <div className="arsenal-panel">
        <PixelText font={font} text="LOST & FOUND" scale={3} color="#c7a25a" />
        {items.length === 0 ? (
          <PixelText
            font={font}
            text="THE AUTO PILOT HAS THROWN NOTHING AWAY"
            scale={2}
            color="#9aa3ad"
            maxWidth={wrapRem}
            align="center"
          />
        ) : (
          // The purse is what every price is read against, so it wears the coin
          // icon and the word COINS — the prices in the list are abbreviated
          // (10M), and an abbreviation only reads as money if the unit is named
          // somewhere in plain sight.
          <div className="vault-purse">
            <PixelText
              font={font}
              text={`${items.length} RECOVERED ·`}
              scale={2}
              color="#9aa3ad"
            />
            {coinIcon && (
              <img src={coinIcon} alt="" className="pixel-img vault-coin" />
            )}
            <PixelText
              font={font}
              // The purse reads through `formatCoins` (not `coinsShort`): it is
              // an arbitrary balance, not one of the ladder's round rungs, and
              // the AUTO PILOT picker one layer up shows the same number the
              // same way — 2.99B in both places, never 3B here and 2.99B there.
              text={`${formatCoins(Math.floor(purse))} COINS`}
              scale={2}
              color="#ffd24a"
            />
          </div>
        )}
        {/* The offer EXPIRES: the vault holds one flight's discards, and
            engaging the next ride bins whatever was not bought back (see
            items/vault.ts `clearVault`). Say so plainly — a player must never
            discover that rule by losing an artifact to it. */}
        {items.length > 0 && (
          <PixelText
            font={font}
            text={warning}
            scale={2}
            color="#ff9f5b"
            maxWidth={wrapRem}
            align="center"
          />
        )}

        <div className="arsenal-body">
          <nav className="arsenal-list" aria-label="vault">
            {items.map((item, i) => {
              const selectedRow = i === at;
              const color = TIER_COLORS[item.tier];
              const cost = reclaimCost(item);
              const armed = pending === item.id;
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
                    aria-label={`vault-${item.defId}`}
                    onPointerEnter={(event) => {
                      if (event.pointerType !== "mouse") return;
                      setCursor(i);
                      // The highlight and the unfolded action must name the
                      // same piece, so drifting onto another row folds it away.
                      if (open !== item.id) {
                        setOpen(null);
                        setPending(null);
                      }
                    }}
                    // A tap SELECTS and UNFOLDS the buy-back beneath the row
                    // (and, on a phone, inspects) — it never buys. Spending is
                    // the action panel's own two steps, because a mis-tap here
                    // would otherwise cost up to two billion coins.
                    onClick={() => {
                      playUiSound(synth, "confirm");
                      setCursor(i);
                      setPending(null);
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
                    {/* The price wears the coin icon: a bare 10M in a list of
                        item levels could be read as anything, and the coin says
                        what is being asked without spending a row's width on the
                        word. Greyed when the purse can't cover it. */}
                    <span className="vault-price">
                      {coinIcon && (
                        <img
                          src={coinIcon}
                          alt=""
                          className={`pixel-img vault-coin${
                            purse >= cost ? "" : " spent"
                          }`}
                        />
                      )}
                      <PixelText
                        font={font}
                        text={coinsShort(cost)}
                        scale={2}
                        color={purse >= cost ? "#ffd24a" : "#7a8088"}
                      />
                    </span>
                  </button>
                  {open === item.id && (
                    // The buy-back, unfolded under the piece it buys. It scrolls
                    // itself into view: on a phone the picked row is often the
                    // last one visible, and an action that opened below the fold
                    // would read as nothing happening.
                    <div
                      className="vault-action"
                      ref={(el) => el?.scrollIntoView({ block: "nearest" })}
                    >
                      {armed && (
                        <PixelText
                          font={font}
                          text={`BUY BACK FOR ${coinsShort(cost)} COINS?`}
                          scale={2}
                          color="#ffd24a"
                          maxWidth={wrapRem}
                          align="center"
                        />
                      )}
                      <button
                        type="button"
                        className="pixel-button secondary vault-reclaim"
                        aria-label={armed ? "vault-confirm" : "vault-reclaim"}
                        disabled={purse < cost || bagFull}
                        onClick={() => {
                          if (armed) {
                            reclaim(item);
                            return;
                          }
                          playUiSound(synth, "confirm");
                          setNotice(null);
                          setPending(item.id);
                        }}
                      >
                        {armed || bagFull ? (
                          <PixelText
                            font={font}
                            text={armed ? "CONFIRM" : "BAG FULL"}
                            scale={2}
                            color="#e6e8eb"
                          />
                        ) : (
                          // What is reclaimed is the ITEM; the coins are what it
                          // COSTS. "RECLAIM 10M COINS" said the opposite, so the
                          // price sits apart behind a coin — the action on the
                          // left, its price on the right, the way a shop line
                          // reads.
                          <span className="vault-reclaim-face">
                            <PixelText
                              font={font}
                              text="RECLAIM ITEM"
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
                              text={coinsShort(cost)}
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
                item={selected}
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
            aria-label="vault-back"
            onClick={() => {
              playUiSound(synth, "back");
              if (pending !== null) setPending(null);
              else onClose();
            }}
          >
            <PixelText
              font={font}
              text={pending !== null ? "CANCEL" : "BACK"}
              scale={2}
              color="#0b0d10"
            />
          </button>
        </div>
      </div>

      {!wide && openItem !== null && items[openItem] && (
        <ItemCardModal
          font={font}
          relicFonts={relicFonts}
          sprites={sprites}
          state={state}
          item={items[openItem] as Equipment}
          compareTo={null}
          onClose={() => setOpenItem(null)}
        />
      )}
    </div>
  );
}

/** THE LOST & FOUND off the title screen: the persisted hero's banked vault,
 * bought back out of his banked purse into his banked bag. */
export function VaultScreen({
  font,
  relicFonts,
  sprites,
  character,
  onChange,
  onClose,
}: {
  font: PixelFont;
  relicFonts: Record<RelicTier, PixelFont>;
  sprites: Sprites;
  character: Character;
  /** A completed reclaim changed the roster — hand the updated hero back so
   * the title screen (and the next run) reads the new purse and bag. */
  onChange: (character: Character) => void;
  onClose: () => void;
}) {
  const items = useMemo(() => characterVault(character), [character]);
  // The hero's own build is the backdrop the cards are read against, so a
  // banked piece's stats compare with what he is actually wearing — the same
  // read the inventory gives. A bankless hero (never finished a level) has no
  // vault either, so the plain fresh state is enough.
  const state = useMemo(() => {
    const state = createGame(1);
    if (character.loadout)
      applyLoadout(state, state.players[0], character.loadout);
    return state;
  }, [character.loadout]);

  return (
    <VaultBrowser
      font={font}
      relicFonts={relicFonts}
      sprites={sprites}
      state={state}
      items={items}
      purse={characterPurse(character)}
      bagFull={(character.loadout?.inventory ?? []).every((c) => c !== null)}
      warning="TRASHED WHEN THE NEXT AUTO PILOT RIDE STARTS"
      onReclaim={(item) => {
        const result = reclaimFromVault(character, item.id);
        if ("refused" in result) return result.refused;
        onChange(result.character);
        return null;
      }}
      onClose={onClose}
    />
  );
}

/**
 * THE LOST & FOUND from inside a run — the LAST CHANCE the AUTO PILOT's start
 * confirm offers before the new ride trashes the vault. It trades against the
 * live run (`state.players[0]`): the running purse pays, and the piece lands in the
 * run's own bag, in play the moment the player resumes.
 */
export function RunVaultScreen({
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
  /** A completed buy-back changed the run — let the caller repaint the HUD (and
   * its own count of what the ride is about to trash). */
  onChange: () => void;
  onClose: () => void;
}) {
  // The run is mutated IN PLACE, so nothing about `state` changes identity to
  // re-render on: bump a counter of our own and read the live vault fresh.
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const items = vaultContents(state.players[0].vault);
  return (
    <VaultBrowser
      font={font}
      relicFonts={relicFonts}
      sprites={sprites}
      state={state}
      items={items}
      purse={state.players[0].coins}
      bagFull={state.players[0].inventory.every((c) => c !== null)}
      warning="TRASHED THE MOMENT THIS RIDE STARTS"
      overlayClass="run-vault"
      onReclaim={(item) => {
        const refused = runCommand(
          state,
          "reclaimVaultItem",
          item.id,
        ) as VaultRefusal | null;
        if (!refused) {
          bump();
          onChange();
        }
        return refused;
      }}
      onClose={onClose}
    />
  );
}
