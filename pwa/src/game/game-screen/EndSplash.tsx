// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The end-of-run splashes. Victory is a bare three-way choice, nothing else:
// NEXT LEVEL moves on, RESTART replays this level, and STAY drops the
// (already banked) hero back onto the cleared field to farm loot and mop up
// — tapping the boss corpse later re-opens this same menu. Defeat splits on
// the hero's mode: hardcore is retired for good, while a softcore hero keeps
// everything earned this run and only has to restart the level (or leave).

import { levelDef, type GameState } from "@game/core";

import { formatCompact } from "@ui/lib/format-number.ts";
import { type PixelFont } from "@ui/lib/pixel-font.ts";
import { PixelText } from "@ui/lib/PixelText.tsx";

import { nextLevelId } from "../characters.ts";
import { formatTime, type Hud } from "./hud-model.ts";

export function VictorySplash({
  state,
  font,
  newRecord,
  onAdvance,
  onRestart,
  onStay,
}: {
  state: GameState | null;
  font: PixelFont;
  /** The just-ended run set a new best on this difficulty. */
  newRecord: boolean;
  /** Move on to the given level (NEXT LEVEL / the bunker's return door). */
  onAdvance: (levelId: string) => void;
  /** Replay this level from scratch. */
  onRestart: () => void;
  /** Drop back onto the cleared field to farm (see stayOnField). */
  onStay: () => void;
}) {
  return (
    <div className="game-splash">
      <PixelText font={font} text="LEVEL CLEAR!" scale={6} color="#7ef0c8" />
      {newRecord && (
        <PixelText font={font} text="NEW RECORD!" scale={3} color="#ffd75e" />
      )}
      <div className="splash-buttons">
        {state &&
          (() => {
            // A level with a return door (`exitTo` — the bunker's way
            // back to the rift) offers the crossing instead of the
            // campaign's NEXT LEVEL; a level with neither shows nothing.
            const exitTo = levelDef(state.level.id).exitTo ?? null;
            const next = exitTo ?? nextLevelId(state.level.id);
            if (!next) return null;
            return (
              <button
                type="button"
                className="pixel-button"
                onClick={() => onAdvance(next)}
              >
                <PixelText
                  font={font}
                  text={
                    exitTo ? `BACK TO ${levelDef(exitTo).name}` : "NEXT LEVEL"
                  }
                  scale={3}
                  color="#0b0d10"
                />
              </button>
            );
          })()}
        <button
          type="button"
          className="pixel-button secondary"
          onClick={onRestart}
        >
          <PixelText font={font} text="RESTART" scale={3} />
        </button>
        {/* STAY only makes sense with a boss corpse to walk back to; the
            bossless hub (reachExit) skips it. */}
        {state?.bossCorpse && (
          <button
            type="button"
            className="pixel-button secondary"
            onClick={onStay}
          >
            <PixelText font={font} text="STAY" scale={3} />
          </button>
        )}
      </div>
    </div>
  );
}

export function DefeatSplash({
  hud,
  state,
  font,
  newRecord,
  hardcore,
  onRetry,
  onQuit,
}: {
  hud: Hud;
  state: GameState | null;
  font: PixelFont;
  newRecord: boolean;
  /** The fallen hero's mode — hardcore is permadeath. */
  hardcore: boolean;
  /** Rebuild the level from the kept softcore build. */
  onRetry: () => void;
  /** Abandon the run for good (back to the menu). */
  onQuit: () => void;
}) {
  return (
    <div className="game-splash">
      <PixelText font={font} text="YOU DIED" scale={6} color="#d83a3a" />
      {newRecord && (
        <PixelText font={font} text="NEW RECORD!" scale={3} color="#ffd75e" />
      )}
      {/* A death parts the two modes: hardcore is retired for good, while a
          softcore hero keeps everything earned this run and only has to
          restart the level (or leave). */}
      <PixelText
        font={font}
        text={hardcore ? "HARDCORE · HERO RETIRED" : "SOFTCORE · PROGRESS KEPT"}
        scale={2}
        color={hardcore ? "#ff6d6d" : "#7ef0c8"}
      />
      <div className="splash-stats">
        <PixelText
          font={font}
          text={`TIME ${formatTime(hud.stats.combatMs)}`}
          scale={2}
        />
        <PixelText
          font={font}
          text={`PEAK MENACE ${hud.stats.peakMenace}`}
          scale={2}
          color="#9aa3ad"
        />
        <PixelText font={font} text={`LEVEL REACHED ${hud.level}`} scale={2} />
        <PixelText
          font={font}
          text={`${state?.level.foes ?? "FOES"} ${hud.stats.kills}/${hud.stats.totalEnemies}`}
          scale={2}
        />
        <PixelText
          font={font}
          text={`XP ${formatCompact(hud.stats.xpGained)}`}
          scale={2}
        />
        {/* The DEATH TOLL: the XP the death cost, shown only when the penalty
            actually bit (knob on, bar not already empty) so "something went"
            when the hero fell. */}
        {hud.stats.xpLost > 0 && (
          <PixelText
            font={font}
            text={`XP LOST -${formatCompact(hud.stats.xpLost)}`}
            scale={2}
            color="#ff6d6d"
          />
        )}
        <PixelText
          font={font}
          text={`DAMAGE DEALT ${formatCompact(hud.stats.damageDealt)}`}
          scale={2}
        />
        <PixelText
          font={font}
          text={`DAMAGE TAKEN ${formatCompact(hud.stats.damageTaken)}`}
          scale={2}
        />
        <PixelText
          font={font}
          text={`ITEMS ${hud.stats.itemsCollected}`}
          scale={2}
        />
      </div>
      <div className="splash-buttons">
        {/* RETRY rebuilds the level from the kept softcore build; a hardcore
            hero is retired and can only exit to MENU. */}
        {!hardcore && (
          <button type="button" className="pixel-button" onClick={onRetry}>
            <PixelText font={font} text="RETRY" scale={3} color="#0b0d10" />
          </button>
        )}
        <button
          type="button"
          className="pixel-button secondary"
          onClick={onQuit}
        >
          <PixelText font={font} text="MENU" scale={3} />
        </button>
      </div>
    </div>
  );
}
