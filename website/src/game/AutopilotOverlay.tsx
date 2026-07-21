// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// AUTO PILOT HUD — shown while the engine autopilot flies the hero (see
// src/game/autopilot.ts and the GameScreen wiring). Three pieces:
//
// - The PANEL: a small rounded control tucked into the top-right HUD column,
//   directly BELOW the minimap/kill strip (not pinned to the top edge, where
//   it used to collide with the iOS Dynamic Island). It carries the speed rung
//   (tap to go faster), STOP, and a LOOT button counting the session's special
//   finds. A touch taller than the kill bar so its buttons stay tappable.
// - The COINS monitor: a live gold-coin readout sitting just under the panel —
//   the purse spelled out digit for digit (never compacted), so the per-tick
//   drain is watchable in the number itself.
// - The HISTORY: a modal (the LOOT button / "show more") listing every
//   special find of the session — upgrades, auto-equipped pieces, and
//   unique-or-better drops — newest first, with the level it dropped on. The
//   world keeps running behind it (the bot doesn't need the screen).
//
// All presentational; GameScreen owns the session state and the engine
// mutators. Finds are captured from `itemCollected` events there. The panel and
// coins monitor are rendered inside the minimap's HUD column so they align to
// it and inherit its safe-area handling.

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";
import { formatCompact } from "@ui/lib/format-number.ts";

/** One special find banked by the session's upgrade feed. */
export type AutopilotFind = {
  /** Session-unique id (the list key). */
  id: number;
  /** Display name, tinted `color` (the tier color). */
  name: string;
  color: string;
  /** Icon data URL (spriteDataUrl), when the piece has one. */
  icon?: string;
  /** The piece was auto-equipped on pickup. */
  equipped: boolean;
  /** The piece would improve its slot (the engine's upgrade flag). */
  upgrade: boolean;
  /** Name of the level it dropped on. */
  levelName: string;
};

const AMBER = "#ffcf6b";
const COIN = "#ffd75e";
const DRAIN = "#e06a6a";
const GREEN = "#5fd97a";
const GREY = "#9aa3ad";

/**
 * The AUTO PILOT control + live coin monitor. Rendered INSIDE the minimap's HUD
 * column (below the map/kill strip) so it aligns to the minimap and clears the
 * Dynamic Island. The LOOT history is a separate `AutopilotHistory` modal (it
 * needs the full shell, which this column can't provide).
 */
export function AutopilotOverlay({
  font,
  coins,
  speed,
  findsCount,
  onToggleHistory,
  onCycleSpeed,
  onStop,
}: {
  font: PixelFont;
  /** The live purse (hud.coins). */
  coins: number;
  /** The engaged speed rung (config `AUTOPILOT.speeds` — 1× to 16×). */
  speed: number;
  /** How many special finds the session has banked (the LOOT badge). */
  findsCount: number;
  onToggleHistory: () => void;
  onCycleSpeed: () => void;
  onStop: () => void;
}) {
  const stop = (event: { stopPropagation: () => void }) =>
    event.stopPropagation();

  return (
    <>
      {/* The control panel — a small rounded block under the minimap. Its head
          names the mode and hangs the LOOT count; the button row carries the
          speed rung (tap = faster) and STOP. */}
      <div className="autopilot-panel" onPointerDown={stop}>
        <div className="autopilot-panel-head">
          <PixelText font={font} text="AUTO PILOT" scale={1} color={AMBER} />
          <button
            type="button"
            className="autopilot-loot"
            aria-label="autopilot-loot"
            onClick={onToggleHistory}
          >
            <PixelText font={font} text={`LOOT ${findsCount}`} scale={1} />
          </button>
        </div>
        <div className="autopilot-panel-buttons">
          <button
            type="button"
            className="pixel-button autopilot-chip autopilot-speed"
            aria-label="autopilot-speed"
            onClick={onCycleSpeed}
          >
            <PixelText
              font={font}
              text={`${speed}× +`}
              scale={1}
              color="#0b0d10"
            />
          </button>
          <button
            type="button"
            className="pixel-button secondary autopilot-chip autopilot-stop"
            aria-label="autopilot-stop"
            onClick={onStop}
          >
            <PixelText font={font} text="STOP" scale={1} color={DRAIN} />
          </button>
        </div>
      </div>

      {/* The live gold-coin monitor — the purse spelled out digit for digit
          (never compacted), so the engine's per-tick drain reads as the number
          counting down. */}
      <div className="autopilot-coins" onPointerDown={stop}>
        <PixelText
          font={font}
          text={Math.floor(coins).toLocaleString("en-US")}
          scale={2}
          color={COIN}
        />
      </div>
    </>
  );
}

/**
 * The AUTO PILOT LOOT history modal — the session's special finds, newest
 * first. Rendered at the game-shell root (not the HUD column) so it covers the
 * full screen and its buttons take the pointer.
 */
export function AutopilotHistory({
  font,
  finds,
  clears,
  deaths,
  coinsSpent,
  onClose,
}: {
  font: PixelFont;
  /** The session's special finds, oldest first (rendered newest first). */
  finds: AutopilotFind[];
  clears: number;
  deaths: number;
  /** Coins the whole session has burned (across restarts/advances). */
  coinsSpent: number;
  onClose: () => void;
}) {
  const stop = (event: { stopPropagation: () => void }) =>
    event.stopPropagation();

  return (
    <div className="game-overlay" onPointerDown={onClose} role="presentation">
      <div className="intro-box autopilot-history" onPointerDown={stop}>
        <PixelText font={font} text="AUTO PILOT LOOT" scale={3} color={AMBER} />
        <div className="autopilot-session-stats">
          <PixelText
            font={font}
            text={`CLEARS ${clears} · DEATHS ${deaths}`}
            scale={2}
            color={GREY}
          />
          <PixelText
            font={font}
            text={`COINS SPENT ${formatCompact(coinsSpent)}`}
            scale={2}
            color={COIN}
          />
        </div>
        <div className="autopilot-find-list">
          {finds.length === 0 && (
            <PixelText
              font={font}
              text="NO SPECIAL LOOT YET"
              scale={2}
              color={GREY}
            />
          )}
          {[...finds].reverse().map((find) => (
            <div key={find.id} className="autopilot-find">
              {find.icon && (
                <img
                  src={find.icon}
                  alt=""
                  className="pixel-img autopilot-find-icon"
                />
              )}
              <div className="autopilot-find-text">
                <PixelText
                  font={font}
                  text={find.name}
                  scale={2}
                  color={find.color}
                />
                <PixelText
                  font={font}
                  text={`${
                    find.equipped
                      ? "EQUIPPED · "
                      : find.upgrade
                        ? "UPGRADE · "
                        : ""
                  }${find.levelName}`}
                  scale={2}
                  color={find.equipped || find.upgrade ? GREEN : GREY}
                />
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="pixel-button"
          aria-label="autopilot-history-close"
          onClick={onClose}
        >
          <PixelText font={font} text="CLOSE" scale={3} color="#0b0d10" />
        </button>
      </div>
    </div>
  );
}
