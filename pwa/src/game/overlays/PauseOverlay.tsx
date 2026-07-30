// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The pause screen: shown while the engine sits in the `paused` phase (P on
// desktop, or auto-paused when the tab/app loses focus). The world and music
// are frozen behind it. Clicking anywhere resumes — the RESUME button just
// makes that affordance explicit. MENU drops back to the main menu, but the
// run is kept frozen in memory so CONTINUE resumes it — nothing is lost, so
// no confirmation is needed (handy for ducking out to change the volume).
//
// AUTO PILOT lives here too (see src/game/autopilot.ts): the coin-metered
// self-play mode is engaged from the pause menu. The button no longer prices
// the ride inline — tapping it raises the START picker (AutopilotStartModal),
// where the player picks a speed MULTIPLIER and sees its cost at the moment of
// enabling, unaffordable rungs greyed out. While the ride runs the row flips to
// STOP AUTO PILOT. The picker's STORE button (builds that have a store) stacks
// the in-run COIN STORE over it, so a purse too thin to fly can be topped up
// without leaving the run for the title menu.

import { useState } from "react";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

import type { Sprites } from "../assets.ts";
import {
  coinStoreAvailable,
  type CoinPack,
  type RunPurchaseResult,
} from "../store.ts";
import {
  AutopilotStartModal,
  AutopilotTrashConfirm,
  type AutopilotRung,
} from "./AutopilotOverlay.tsx";
import { CoinStoreOverlay } from "./CoinStoreOverlay.tsx";

/** What engaging a ride would TRASH out of the LOST & FOUND — the numbers the
 * last-call confirm puts in front of the player (see `AutopilotTrashConfirm`).
 * Recomputed by the owner on every repaint, so buying a piece back while the
 * confirm is up shrinks it live. */
export type PauseVault = {
  /** Pieces the vault holds right now. Zero → no confirm, the ride just flies. */
  count: number;
  /** The most precious piece's name and tier color. */
  best: string;
  bestColor: string;
  /** Open the run's own LOST & FOUND (the last chance to buy something back). */
  onBrowse: () => void;
};

/** The AUTO PILOT row's wiring (absent in contexts that can't fly — demo). */
export type PauseAutopilot = {
  /** The engine meter is running (the ride is engaged). */
  active: boolean;
  /** The live purse (shown in the START picker). */
  coins: number;
  /** The offered speed rungs with their per-game-second cost + affordability
   * (config `AUTOPILOT.speeds`) — the START picker's rows. */
  rungs: AutopilotRung[];
  /** Engage at the chosen multiplier (also resumes the run). */
  onStart: (speed: number) => void;
  /** The LOST & FOUND this ride would empty — the last-call confirm's numbers.
   * Absent (or empty) → picking a rung flies straight away. */
  vault?: PauseVault;
  /** Disengage; the player keeps flying manually. */
  onStop: () => void;
  /** Buy a coin pack for the flying hero — wires the picker's STORE button to
   * the in-run COIN STORE (see game-screen/run-store.ts). */
  onBuyCoins: (pack: CoinPack) => Promise<RunPurchaseResult>;
};

export function PauseOverlay({
  font,
  sprites,
  onResume,
  onExit,
  onQuestLog,
  autopilot,
}: {
  font: PixelFont;
  /** The atlas — forwarded to the AUTO PILOT picker for its column icons. */
  sprites: Sprites;
  onResume: () => void;
  onExit: () => void;
  /** Open the QUEST LOG. Omitted on a map that hands out no errands at all, so
   * the row never offers a screen that would open empty. */
  onQuestLog?: () => void;
  autopilot?: PauseAutopilot;
}) {
  const stop = (event: { stopPropagation: () => void }) =>
    event.stopPropagation();
  // The START picker is raised from the AUTO PILOT button and stacks over the
  // pause box (its own backdrop dismisses it back to the pause menu).
  const [picking, setPicking] = useState(false);
  // The in-run COIN STORE stacks over the picker (its STORE button), so
  // closing it drops back onto the rungs with the topped-up purse. Only where
  // this build has a store at all — native, or the FORCE STORE dev switch.
  const [shopping, setShopping] = useState(false);
  // The LAST CALL: a rung picked while the LOST & FOUND still holds something
  // parks its speed here instead of flying, and the confirm stacks over the
  // picker until the player either buys back or accepts the loss.
  const [confirming, setConfirming] = useState<number | null>(null);
  const storeOpen = coinStoreAvailable();
  const vault = autopilot?.vault;

  /** Engage — or raise the last call first, if a ride would bin the vault. */
  const pickSpeed = (speed: number) => {
    if (vault && vault.count > 0) {
      setConfirming(speed);
      return;
    }
    setPicking(false);
    autopilot?.onStart(speed);
  };

  return (
    <>
      <div
        className="game-overlay pause-overlay"
        // Clicking the backdrop resumes.
        onPointerDown={onResume}
        role="presentation"
      >
        <div className="intro-box pause-menu" onPointerDown={stop}>
          <PixelText font={font} text="PAUSED" scale={6} color="#7ef0c8" />
          <PixelText
            font={font}
            text="CLICK OR PRESS P TO RESUME"
            scale={2}
            color="#9aa3ad"
          />
          {/* A full-width vertical stack — clean in both orientations, no
              awkward wrap. RESUME leads (mint), AUTO PILOT is the amber accent
              CTA (the paid feature, tying into its picker's theme), MENU is the
              quiet exit. */}
          <div className="pause-actions">
            <button
              type="button"
              className="pixel-button"
              aria-label="resume"
              onClick={onResume}
            >
              <PixelText
                font={font}
                text="▶ RESUME"
                scale={3}
                color="#0b0d10"
              />
            </button>
            {autopilot && !autopilot.active && (
              <button
                type="button"
                className="pixel-button autopilot"
                aria-label="autopilot-start"
                onClick={() => setPicking(true)}
              >
                <PixelText
                  font={font}
                  text="» AUTO PILOT"
                  scale={3}
                  color="#0b0d10"
                />
              </button>
            )}
            {autopilot?.active && (
              <button
                type="button"
                className="pixel-button secondary"
                aria-label="autopilot-stop"
                onClick={autopilot.onStop}
              >
                <PixelText
                  font={font}
                  text="■ STOP AUTO PILOT"
                  scale={3}
                  color="#e06a6a"
                />
              </button>
            )}
            {onQuestLog && (
              <button
                type="button"
                className="pixel-button secondary"
                aria-label="quest-log"
                onClick={onQuestLog}
              >
                <PixelText
                  font={font}
                  text="! QUEST LOG"
                  scale={3}
                  color="#ffd75e"
                />
              </button>
            )}
            <button
              type="button"
              className="pixel-button secondary"
              aria-label="pause-menu"
              onClick={onExit}
            >
              <PixelText font={font} text="≡ MENU" scale={3} />
            </button>
          </div>
        </div>
      </div>
      {autopilot && !autopilot.active && picking && (
        <AutopilotStartModal
          font={font}
          sprites={sprites}
          coins={autopilot.coins}
          rungs={autopilot.rungs}
          onPick={pickSpeed}
          onStore={storeOpen ? () => setShopping(true) : undefined}
          onClose={() => setPicking(false)}
        />
      )}
      {autopilot && !autopilot.active && picking && shopping && (
        <CoinStoreOverlay
          font={font}
          sprites={sprites}
          coins={autopilot.coins}
          onBuy={autopilot.onBuyCoins}
          onClose={() => setShopping(false)}
        />
      )}
      {autopilot && !autopilot.active && confirming !== null && vault && (
        <AutopilotTrashConfirm
          font={font}
          sprites={sprites}
          count={vault.count}
          best={vault.best}
          bestColor={vault.bestColor}
          onBuyBack={vault.onBrowse}
          onConfirm={() => {
            const speed = confirming;
            setConfirming(null);
            setPicking(false);
            autopilot.onStart(speed);
          }}
          onClose={() => setConfirming(null)}
        />
      )}
    </>
  );
}
