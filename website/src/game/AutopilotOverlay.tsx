// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// AUTO PILOT HUD — shown while the engine autopilot flies the hero (see
// src/game/autopilot.ts and the GameScreen wiring). Two pieces:
//
// - The BAR: a slim always-on strip pinned top-center while the ride runs —
//   the purse, the burn rate (per game-second), the speed rung, STOP, and a
//   LOOT button counting the session's special finds.
// - The HISTORY: a modal (the LOOT button / "show more") listing every
//   special find of the session — upgrades, auto-equipped pieces, and
//   unique-or-better drops — newest first, with the level it dropped on. The
//   world keeps running behind it (the bot doesn't need the screen).
//
// Both are presentational; GameScreen owns the session state and the engine
// mutators. Finds are captured from `itemCollected` events there.

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

export function AutopilotOverlay({
  font,
  coins,
  speed,
  drainPerSecond,
  finds,
  clears,
  deaths,
  coinsSpent,
  historyOpen,
  onToggleHistory,
  onCycleSpeed,
  onStop,
}: {
  font: PixelFont;
  /** The live purse (hud.coins). */
  coins: number;
  /** The engaged speed rung (config `AUTOPILOT.speeds` — 1× to 16×). */
  speed: number;
  /** Coins burned per GAME-second at the engaged rung. */
  drainPerSecond: number;
  /** The session's special finds, oldest first (rendered newest first). */
  finds: AutopilotFind[];
  clears: number;
  deaths: number;
  /** Coins the whole session has burned (across restarts/advances). */
  coinsSpent: number;
  historyOpen: boolean;
  onToggleHistory: () => void;
  onCycleSpeed: () => void;
  onStop: () => void;
}) {
  const stop = (event: { stopPropagation: () => void }) =>
    event.stopPropagation();

  return (
    <>
      <div className="autopilot-bar" onPointerDown={stop}>
        <PixelText font={font} text="AUTO PILOT" scale={2} color={AMBER} />
        <PixelText
          font={font}
          text={`${formatCompact(coins)} COINS`}
          scale={2}
          color={COIN}
        />
        <PixelText
          font={font}
          text={`-${formatCompact(drainPerSecond)}/S`}
          scale={2}
          color={DRAIN}
        />
        <button
          type="button"
          className="pixel-button autopilot-chip"
          aria-label="autopilot-speed"
          onClick={onCycleSpeed}
        >
          <PixelText font={font} text={`${speed}X`} scale={2} color="#0b0d10" />
        </button>
        <button
          type="button"
          className="pixel-button secondary autopilot-chip"
          aria-label="autopilot-loot"
          onClick={onToggleHistory}
        >
          <PixelText font={font} text={`LOOT ${finds.length}`} scale={2} />
        </button>
        <button
          type="button"
          className="pixel-button secondary autopilot-chip"
          aria-label="autopilot-stop"
          onClick={onStop}
        >
          <PixelText font={font} text="STOP" scale={2} color={DRAIN} />
        </button>
      </div>

      {historyOpen && (
        <div
          className="game-overlay"
          onPointerDown={onToggleHistory}
          role="presentation"
        >
          <div className="intro-box autopilot-history" onPointerDown={stop}>
            <PixelText
              font={font}
              text="AUTO PILOT LOOT"
              scale={3}
              color={AMBER}
            />
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
              onClick={onToggleHistory}
            >
              <PixelText font={font} text="CLOSE" scale={3} color="#0b0d10" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
