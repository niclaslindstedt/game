// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The end-of-run splashes. Victory is a bare three-way choice, nothing else:
// NEXT LEVEL moves on, RESTART replays this level, and STAY drops the
// (already banked) hero back onto the cleared field to farm loot and mop up
// — tapping the boss corpse later re-opens this same menu.
//
// DEFEAT IS TWO DIFFERENT SCREENS, because the two modes end differently and
// the numbers only mean something in one of them. A HARDCORE death is the end
// of the campaign, and the run sheet it prints — the combat clock, the peak
// menace, the foes felled — is literally the high-score board's own columns
// (`highscores.ts` ranks exactly those), so the hardcore splash is that final
// scorecard. SOFTCORE HEROES NEVER SCORE: nothing on that board will ever carry
// their name, so the same nine rows are a report card with no reader — printed
// over the one thing the player actually needs, which is to go again. The
// softcore splash therefore keeps three facts (what was kept, what the death
// cost, how close the mission came) and spends the rest of the screen on
// RESTARTING.

import { levelDef, runLevelDef, type GameState } from "@game/core";
import { useEffect, useState } from "react";

import { formatCompact } from "@ui/lib/format-number.ts";
import { type PixelFont } from "@ui/lib/pixel-font.ts";
import { PixelText } from "@ui/lib/PixelText.tsx";

import { nextLevelId } from "../characters.ts";
import { formatTime, type Hud } from "./hud-model.ts";

export function VictorySplash({
  state,
  font,
  newRecord,
  canAdvance,
  onAdvance,
  onRestart,
  onStay,
}: {
  state: GameState | null;
  font: PixelFont;
  /** The just-ended run set a new best on this difficulty. */
  newRecord: boolean;
  /**
   * MAY THIS DEVICE CHOOSE THE ROAD? False for a JOINER, whose copy of this
   * splash would otherwise offer two buttons the session refuses: the crossing
   * is seat 0's (`travelTo` — the host chooses the road, exactly as the travel
   * picker says), and a replay is a whole new run only the host can start. They
   * are told who is deciding instead of handed a dead control.
   */
  canAdvance: boolean;
  /** Move on to the given level (NEXT LEVEL / the bunker's return door). */
  onAdvance: (levelId: string) => void;
  /** Replay this level from scratch. */
  onRestart: () => void;
  /** Drop back onto the cleared field to farm (see stayOnField). */
  onStay: () => void;
}) {
  // THE CROSSING IS NOT INSTANT WHEN A PARTY IS ABOARD: `onAdvance` sends the
  // session a verb and this splash stays up until the new level's snapshot
  // lands, which is a second helping of NEXT LEVEL presses booking the same
  // trip twice. One press is all it takes either way — a local crossing
  // unmounts this component on the spot, so the latch is never seen there.
  const [committed, setCommitted] = useState(false);
  return (
    <div className="game-splash">
      <PixelText font={font} text="LEVEL CLEAR!" scale={6} color="#7ef0c8" />
      {newRecord && (
        <PixelText font={font} text="NEW RECORD!" scale={3} color="#ffd75e" />
      )}
      <div className="splash-buttons">
        {state &&
          canAdvance &&
          (() => {
            // A level with a return door (`exitTo` — the bunker's way
            // back to the rift) offers the crossing instead of the
            // campaign's NEXT LEVEL; a level with neither shows nothing.
            const exitTo = runLevelDef(state).exitTo ?? null;
            const next = exitTo ?? nextLevelId(state.level.id);
            if (!next) return null;
            return (
              <button
                type="button"
                className="pixel-button"
                disabled={committed}
                onClick={() => {
                  setCommitted(true);
                  onAdvance(next);
                }}
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
        {canAdvance && (
          <button
            type="button"
            className="pixel-button secondary"
            disabled={committed}
            onClick={onRestart}
          >
            <PixelText font={font} text="RESTART" scale={3} />
          </button>
        )}
        {/* STAY only makes sense with a boss corpse to walk back to; the
            bossless hub (reachExit) skips it. It is the one choice here a
            joiner keeps: the field is the party's, and dropping back onto it
            is a verb every seat may send. */}
        {state?.bossCorpse && (
          <button
            type="button"
            className="pixel-button secondary"
            disabled={committed}
            onClick={onStay}
          >
            <PixelText font={font} text="STAY" scale={3} />
          </button>
        )}
      </div>
      {!canAdvance && (
        <PixelText
          font={font}
          text="THE HOST CHOOSES THE ROAD"
          scale={2}
          color="#9aa3ad"
        />
      )}
    </div>
  );
}

export function DefeatSplash({
  hud,
  state,
  font,
  newRecord,
  hardcore,
  killedBy,
  onRetry,
  onQuit,
}: {
  hud: Hud;
  state: GameState | null;
  font: PixelFont;
  newRecord: boolean;
  /** The fallen hero's mode — hardcore is permadeath. */
  hardcore: boolean;
  /** What landed the fatal blow, ready to print (see death-cause.ts), or null
   * when the engine couldn't attribute it. Softcore only — a hardcore death
   * closes a campaign, and its splash is that campaign's scorecard. */
  killedBy: string | null;
  /** Rebuild the level from the kept softcore build. */
  onRetry: () => void;
  /** Abandon the run for good (back to the menu). */
  onQuit: () => void;
}) {
  if (hardcore) {
    return (
      <HardcoreDefeat
        hud={hud}
        state={state}
        font={font}
        newRecord={newRecord}
        onQuit={onQuit}
      />
    );
  }
  return (
    <SoftcoreDefeat
      hud={hud}
      state={state}
      font={font}
      killedBy={killedBy}
      onRetry={onRetry}
      onQuit={onQuit}
    />
  );
}

/**
 * THE END OF A CAMPAIGN. A hardcore hero is retired for good, so this is the
 * last screen they ever get and the full run sheet belongs on it: every row is
 * a column of the high-score board the death just banked against
 * (`recordCampaign`, outcome `fell`), which is why NEW RECORD! can fire here
 * and nowhere else. MENU is the only way out.
 */
function HardcoreDefeat({
  hud,
  state,
  font,
  newRecord,
  onQuit,
}: {
  hud: Hud;
  state: GameState | null;
  font: PixelFont;
  newRecord: boolean;
  onQuit: () => void;
}) {
  return (
    <div className="game-splash">
      <PixelText font={font} text="YOU DIED" scale={6} color="#d83a3a" />
      {newRecord && (
        <PixelText font={font} text="NEW RECORD!" scale={3} color="#ffd75e" />
      )}
      <PixelText
        font={font}
        text="HARDCORE · HERO RETIRED"
        scale={2}
        color="#ff6d6d"
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

/**
 * A SOFTCORE DEATH IS A SETBACK, NOT AN ENDING, and this screen is shaped like
 * one: it answers the three questions a player who is about to go again
 * actually has, then gets out of the way of the button.
 *
 *   • WHO KILLED ME — the one line that changes the next attempt.
 *   • WHAT DID IT COST — the hero keeps his level, his gear and his loot (the
 *     run's build is banked on death exactly as on victory), so the only real
 *     price is the XP toll, and it earns a row only when it actually bit.
 *   • HOW CLOSE WAS I — the mission's own kill share, the single number that
 *     argues for another run rather than grading the last one.
 *
 * Everything else the old shared splash printed (the combat clock, the peak
 * menace, damage dealt and taken, items, XP gained) went to the hardcore
 * scorecard above, where it is ranked. TRY AGAIN then takes the whole width and
 * says what it does — the level restarts FROM THE TOP with the kept build, not
 * from where the hero fell — with MENU demoted to a dim afterthought under it.
 */
function SoftcoreDefeat({
  hud,
  state,
  font,
  killedBy,
  onRetry,
  onQuit,
}: {
  hud: Hud;
  state: GameState | null;
  font: PixelFont;
  killedBy: string | null;
  onRetry: () => void;
  onQuit: () => void;
}) {
  // RESTART ON A KEYPRESS — the emphasis this screen is built around, wired by
  // hand rather than by focusing the button. `event.repeat` is the whole point:
  // a hand still resting on the jump key when the hero fell fires repeats for
  // as long as it's held, and a focused button would let those activate it the
  // instant the modal mounted (the same accident that used to eat the death
  // scene — see controls.ts). Only a FRESH press restarts, so the player has to
  // choose it exactly as a tap does.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.code !== "Space" && event.key !== "Enter") return;
      event.preventDefault();
      onRetry();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onRetry]);

  const foes = state?.level.foes ?? "FOES";
  const levelName = state?.level.name ?? "";
  return (
    <div className="game-splash">
      <PixelText font={font} text="YOU DIED" scale={6} color="#d83a3a" />
      {/* The killer, when the engine could attribute the fatal blow. A wrong
          name would be worse than none, so an unattributed death (a hay bale,
          a retired mob id) simply drops the line. */}
      {killedBy && (
        <PixelText
          font={font}
          text={`SLAIN BY ${killedBy}`}
          scale={2}
          color="#9aa3ad"
        />
      )}
      <div className="pixel-panel defeat-ledger">
        <PixelText font={font} text="KEPT" scale={2} color="#9aa3ad" />
        <PixelText
          font={font}
          text={`LEVEL ${hud.level} · GEAR · LOOT · COINS`}
          scale={2}
          color="#7ef0c8"
        />
        {/* The DEATH TOLL is the ONLY thing a softcore hero loses, so it is
            stated either way: the XP the fall cost, or — when the penalty knob
            is off or the bar was already empty — plainly nothing. */}
        <PixelText font={font} text="LOST" scale={2} color="#9aa3ad" />
        {hud.stats.xpLost > 0 ? (
          <PixelText
            font={font}
            text={`${formatCompact(hud.stats.xpLost)} XP`}
            scale={2}
            color="#ff6d6d"
          />
        ) : (
          <PixelText
            font={font}
            text="NOTHING BUT TIME"
            scale={2}
            color="#7ef0c8"
          />
        )}
        <PixelText font={font} text={foes} scale={2} color="#9aa3ad" />
        <PixelText
          font={font}
          text={`${hud.stats.kills} OF ${hud.stats.totalEnemies} DOWN`}
          scale={2}
        />
      </div>
      <div className="defeat-again">
        <button
          type="button"
          className="pixel-button defeat-retry"
          aria-label="try-again"
          onClick={onRetry}
        >
          <PixelText font={font} text="TRY AGAIN" scale={4} color="#0b0d10" />
        </button>
        {/* What TRY AGAIN actually does — the level from scratch with the build
            the death banked, not a respawn where he fell. */}
        <PixelText
          font={font}
          text={levelName ? `${levelName} FROM THE TOP` : "FROM THE TOP"}
          scale={2}
          color="#6b7480"
        />
      </div>
      <button
        type="button"
        className="pixel-button secondary defeat-quit"
        onClick={onQuit}
      >
        <PixelText font={font} text="MENU" scale={2} />
      </button>
    </div>
  );
}
