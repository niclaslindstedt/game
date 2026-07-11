// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The developer ARSENAL viewer: a browsable gallery of every hand-authored
// UNIQUE / LEGENDARY item, ordered by item level. Each entry is MINTED as a
// real live instance (`mintUnique`) and rendered through the very same
// `ItemIcon` + `ItemCardBody` the in-game inventory tooltip uses — so the
// arsenal shows each piece exactly as it reads in play and never drifts from
// it. Reached from the hidden DEVELOPER menu (TitleScreen); a scrollable list
// steered by pointer or the keyboard arrows, ESC backs out.

import { useEffect, useMemo, useState } from "react";

import {
  createGame,
  equipmentName,
  mintUnique,
  UNIQUE_IDS,
  type Equipment,
} from "@game/core";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

import { synth } from "./audio.ts";
import { ItemCardBody, ItemIcon } from "./ItemCard.tsx";
import { playUiSound } from "./sfx/index.ts";
import { type Sprites } from "./assets.ts";
import { TIER_COLORS, tierGlowClass } from "./tiers.ts";

/** Wrap width (rem) for the detail card's text — mirrors the inventory
 * tooltip's cap so a long unique name folds instead of spilling. */
const DETAIL_TEXT_REM = 14.3;

/** Uppercase slot label for a list row's sub-line (WEAPON, HEAD, CHARM, …). */
const SLOT_LABEL: Record<Equipment["slot"], string> = {
  weapon: "WEAPON",
  head: "HEAD",
  chest: "CHEST",
  legs: "LEGS",
  feet: "FEET",
  charm: "CHARM",
  bag: "BAG",
};

export function ArsenalScreen({
  font,
  sprites,
  onClose,
}: {
  font: PixelFont;
  sprites: Sprites;
  onClose: () => void;
}) {
  // Mint every unique/legendary into a throwaway run so each reads with real,
  // in-game stats, then sort by item level (name-tiebroken for a stable order).
  // A fresh level-1 hero is the neutral stat backdrop the card is read against
  // — the same numbers a player sees inspecting the drop at the start of a run.
  const { state, items } = useMemo(() => {
    const state = createGame(1);
    const items = UNIQUE_IDS.map((id) => mintUnique(state, id)).sort(
      (a, b) =>
        a.ilvl - b.ilvl || equipmentName(a).localeCompare(equipmentName(b)),
    );
    return { state, items };
  }, []);

  const [cursor, setCursor] = useState(0);
  const selected = items[cursor] ?? null;

  // Doom-menu keys: arrows walk the list, ESC backs out. Enter is a no-op —
  // these are trophies to browse, not choices to confirm.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (items.length === 0) return;
        playUiSound(synth, "move");
        const delta = event.key === "ArrowDown" ? 1 : -1;
        setCursor((c) => (c + delta + items.length) % items.length);
      } else if (event.key === "Escape") {
        event.preventDefault();
        playUiSound(synth, "back");
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [items.length, onClose]);

  return (
    <div className="arsenal-overlay">
      <div className="arsenal-panel">
        <PixelText font={font} text="ARSENAL" scale={3} color="#c7a25a" />
        <PixelText
          font={font}
          text={`${items.length} UNIQUE & LEGENDARY ITEMS`}
          scale={1}
          color="#9aa3ad"
        />

        <div className="arsenal-body">
          <nav className="arsenal-list" aria-label="arsenal">
            {items.map((item, i) => {
              const selectedRow = i === cursor;
              const color = TIER_COLORS[item.tier];
              return (
                <button
                  key={item.id}
                  type="button"
                  ref={
                    selectedRow
                      ? (el) => el?.scrollIntoView({ block: "nearest" })
                      : undefined
                  }
                  className={`arsenal-row${selectedRow ? " selected" : ""}`}
                  aria-label={`arsenal-${item.defId}`}
                  onPointerEnter={() => {
                    if (i !== cursor) {
                      playUiSound(synth, "move");
                      setCursor(i);
                    }
                  }}
                  onClick={() => setCursor(i)}
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
                      scale={1}
                      color="#7a8088"
                    />
                  </span>
                </button>
              );
            })}
          </nav>

          {selected && (
            <div
              className={`arsenal-detail${tierGlowClass(selected.tier)}`}
              style={{ borderColor: TIER_COLORS[selected.tier] }}
            >
              <span
                className={`inv-cell arsenal-detail-icon${tierGlowClass(
                  selected.tier,
                )}`}
              >
                <ItemIcon sprites={sprites} item={selected} />
              </span>
              <div className="arsenal-detail-card">
                <ItemCardBody
                  font={font}
                  sprites={sprites}
                  state={state}
                  item={selected}
                  compareTo={null}
                  maxWidth={DETAIL_TEXT_REM}
                />
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          className="pixel-button arsenal-close"
          aria-label="arsenal-back"
          onClick={() => {
            playUiSound(synth, "back");
            onClose();
          }}
        >
          <PixelText font={font} text="BACK" scale={2} color="#0b0d10" />
        </button>
      </div>
    </div>
  );
}
