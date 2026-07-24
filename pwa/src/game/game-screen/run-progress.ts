// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Run-outcome bookkeeping: the retry checkpoint, and everything a run's
// events bank onto the persistent CHARACTER — witnessed story, the merchant
// met, victories (build snapshots, campaign totals, high scores), deaths
// (hardcore retirement vs the softcore keep), and travel-gate crossings.
// Pure feedback (effects, toasts) lives in event-fx.ts; the AUTO PILOT's
// route decisions live in autopilot-director.ts.

import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import {
  extractLoadout,
  type Difficulty,
  type GameEvent,
  type GameState,
} from "@game/core";

import {
  accrueCampaign,
  bankLoadout,
  campaignTally,
  hasClearedLevel,
  markMerchantMet,
  markStorySeen,
  recordDeath,
  recordVictory,
  resetCampaign,
  type Character,
} from "../characters.ts";
import type { WornPiece } from "../achievement-totals.ts";
import { cloneGameState } from "../checkpoint.ts";
import { playDeathHaptic } from "../haptics.ts";
import { recordCampaign } from "../highscores.ts";
import { stopMusic } from "../music/index.ts";
import type { Hud } from "./hud-model.ts";

export type RunCheckpoint = { levelId: string; state: GameState };

export type RunProgress = {
  /** Snapshot the combat-start checkpoint once per fresh run (see below). */
  captureCheckpoint: (state: GameState) => void;
  /** Bank whatever this event means for the character/checkpoint/scores. */
  onEvent: (event: GameEvent, state: GameState) => void;
};

export function createRunProgress(deps: {
  /** The live character — victories/deaths bank back into this ref so a
   * second clear in the same mount starts from the updated build. */
  characterRef: MutableRefObject<Character>;
  checkpointRef: MutableRefObject<RunCheckpoint | null>;
  difficulty: Difficulty;
  /** True when this run's purse was funded from the hero's FULL wealth at the
   * start (banked coins + any `pendingCoins`) — a real run, not BOT VIEW /
   * demo. Banking then must NOT fold pendingCoins in again (it's already in
   * the run's coins); see run-setup.ts and characters.ts `foldPendingCoins`. */
  coinsIncludePending: boolean;
  /** The level THIS run actually plays (after the `?level=` dev override). */
  runLevelId: string;
  /** Whether this mount should capture a combat-start checkpoint (a run
   * started from scratch — not resumed, not itself adopted from one). */
  captureEnabled: boolean;
  setHud: Dispatch<SetStateAction<Hud | null>>;
  setLevelId: (id: string) => void;
  setNewRecord: (flag: boolean) => void;
}): RunProgress {
  const {
    characterRef,
    checkpointRef,
    difficulty,
    coinsIncludePending,
    runLevelId,
    captureEnabled,
    setHud,
    setLevelId,
    setNewRecord,
  } = deps;

  // The first instant the run is truly in the player's hands — armed and
  // playing, past the prelude, the intro monologue, and (on SpaceZ HQ)
  // the scripted opening strike that draws the blade. Snapshot it once so
  // a later RETRY drops the hero back HERE, into the action, instead of
  // replaying the whole opening. NEXT LEVEL runs this on its own fresh
  // run, superseding the previous level's checkpoint.
  const captureCheckpoint = (state: GameState) => {
    if (
      captureEnabled &&
      checkpointRef.current?.levelId !== runLevelId &&
      state.phase === "playing" &&
      !state.player.disarmed
    ) {
      checkpointRef.current = {
        levelId: runLevelId,
        state: cloneGameState(state),
      };
      // Combat has begun, so the opening (cutscene + intro, and the strike
      // that armed him) has been witnessed — bank it on the character now,
      // together with the inner monologues read so far, so it stays skipped
      // even if the player quits before the run resolves. Late in-play
      // thoughts are added again at run's end below.
      characterRef.current = markStorySeen(
        characterRef.current,
        runLevelId,
        difficulty,
        state.thoughtsSeen,
      );
    }
  };

  const onEvent = (event: GameEvent, state: GameState) => {
    // The merchant met: remember the meeting per map+difficulty so he's set
    // up at the door on every later entry (repair-after-death within reach).
    if (event.type === "merchantDiscovered") {
      characterRef.current = markMerchantMet(
        characterRef.current,
        runLevelId,
        difficulty,
      );
    }
    // The run is over: silence the loop so the death sting / jingle stands
    // alone. The hero's FALL (`playerDeath`) opens the death scene — cut the
    // music there so the tableau plays over the doom tone, not the level loop;
    // `defeat` (the modal) is a beat later and re-cuts idempotently. High
    // scores are banked below — per CAMPAIGN, hardcore only (not per run).
    if (
      event.type === "playerDeath" ||
      event.type === "victory" ||
      event.type === "defeat"
    ) {
      stopMusic();
    }
    // The hero fell: the hardest buzz the game plays. Fired on `playerDeath`
    // (the moment of the collapse, after the fatal blow's own damage buzz
    // earlier this tick) so death lands at full strength as he drops — not
    // seconds later when the scene ends. navigator.vibrate replaces the active
    // pattern, so this overrides that last hit's rumble.
    if (event.type === "playerDeath") {
      playDeathHaptic();
    }
    // Clearing a level records it (per difficulty) so the campaign
    // unlocks the next one and the menu marks this one replayable —
    // and banks the hero's snapshot (level, stats, items) so the next
    // level starts with everything he finished this one with. Beating
    // the difficulty's LAST level also banks any unique/legendary
    // finds into the forever-stash.
    if (event.type === "victory") {
      // Whether this clear ADDS to the hardcore campaign score: it must
      // be the level's FIRST clear on a difficulty not yet beaten, so a
      // replay through the free level picker can't inflate a total.
      const before = characterRef.current;
      const scores =
        before.hardcore &&
        !before.beaten.includes(difficulty) &&
        !hasClearedLevel(before, state.level.id, difficulty);
      // Bank the win onto the character: their build becomes the
      // end-of-level snapshot, the clear is recorded, and clearing the
      // difficulty's LAST level marks it beaten (opening its level picker
      // and the next rung of the ladder). The updated character feeds the
      // next level's carry-over.
      characterRef.current = recordVictory(
        before,
        state.level.id,
        difficulty,
        extractLoadout(state),
        coinsIncludePending,
      );
      if (scores) {
        // Fold this map into the running campaign total.
        characterRef.current = accrueCampaign(
          characterRef.current,
          difficulty,
          {
            kills: state.stats.kills,
            combatMs: state.stats.combatMs,
            peakMenace: state.stats.peakMenace,
          },
        );
        // Beating the LAST level completes the campaign (recordVictory
        // just marked it beaten): bank the whole campaign total as a
        // SURVIVED high score, flag a new record, and clear the tally so
        // a replay can't re-bank it.
        const completed =
          !before.beaten.includes(difficulty) &&
          characterRef.current.beaten.includes(difficulty);
        if (completed) {
          const tally = campaignTally(characterRef.current, difficulty);
          if (
            recordCampaign(difficulty, {
              name: characterRef.current.name,
              kills: tally.kills,
              combatMs: tally.combatMs,
              peakMenace: tally.peakMenace,
              levels: tally.levels,
              outcome: "survived",
              at: Date.now(),
            })
          )
            setNewRecord(true);
          characterRef.current = resetCampaign(
            characterRef.current,
            difficulty,
          );
        }
      }
    }
    // Death splits on the hero's mode. Hardcore is permadeath: bank the
    // campaign the hero fell in (its cleared maps PLUS this fatal,
    // uncleared run) as a FELL high score, then retire them for good.
    // Softcore costs no progress: bank the run's build so the level,
    // stats and items earned this run are kept, and drop the retry
    // checkpoint (which froze the entry build at combat-start) so RETRY
    // rebuilds the level from this just-banked build — replaying from the
    // lower entry build would regress the hero on the next clear.
    if (event.type === "defeat") {
      if (characterRef.current.hardcore) {
        // Bank the campaign total reached — the cleared maps plus this
        // fatal run — but only while the difficulty is unbeaten (a death
        // on a replay of an already-conquered campaign scores nothing).
        if (!characterRef.current.beaten.includes(difficulty)) {
          const tally = campaignTally(characterRef.current, difficulty);
          if (
            recordCampaign(difficulty, {
              name: characterRef.current.name,
              kills: tally.kills + state.stats.kills,
              combatMs: tally.combatMs + state.stats.combatMs,
              peakMenace: Math.max(tally.peakMenace, state.stats.peakMenace),
              levels: tally.levels,
              outcome: "fell",
              levelId: state.level.id,
              at: Date.now(),
            })
          )
            setNewRecord(true);
        }
        characterRef.current = recordDeath(characterRef.current);
      } else {
        // Powerups do NOT survive death: the banked build keeps the level,
        // stats, gear, bag and coins earned this run, but the dock's
        // pocketed powerups are spent — a RETRY rebuilds the level from
        // this build and starts it with an empty dock, so a hoarded stack
        // can't be replayed through the same fight over and over.
        const banked = extractLoadout(state);
        banked.heldAbilities = [];
        characterRef.current = bankLoadout(
          characterRef.current,
          banked,
          coinsIncludePending,
        );
        checkpointRef.current = null;
      }
    }
    // Stepping into a travel gate (the cow-level door the SEVERED HAND
    // tears open): bank the hero's build and the thoughts read this
    // run, then swap the mount to the destination level. The next run
    // dresses the hero in the banked build, so the crossing carries
    // everything he's holding — the run he leaves behind simply ends.
    if (event.type === "gateEntered") {
      characterRef.current = bankLoadout(
        characterRef.current,
        extractLoadout(state),
        coinsIncludePending,
      );
      characterRef.current = markStorySeen(
        characterRef.current,
        state.level.id,
        difficulty,
        state.thoughtsSeen,
      );
      checkpointRef.current = null;
      stopMusic();
      setHud(null);
      setLevelId(event.to);
    }
    // Run over either way: bank the opening and every inner monologue read
    // this run onto the character, so the next replay on this difficulty
    // skips them. This catches the late kill/sight beats that only fire
    // deep into a run (the combat-start mark above bags the opening ones).
    if (event.type === "victory" || event.type === "defeat") {
      characterRef.current = markStorySeen(
        characterRef.current,
        state.level.id,
        difficulty,
        state.thoughtsSeen,
      );
    }
  };

  return { captureCheckpoint, onEvent };
}

/** Every worn slot the wardrobe feats track, weapon first. */
const WORN_SLOTS = [
  "weapon",
  "head",
  "chest",
  "legs",
  "feet",
  "charm",
  "bag",
] as const;

/**
 * The hero's current outfit for the wardrobe achievement feats — the worn
 * weapon plus every filled armor/charm/bag slot.
 */
export function wornEquipment(state: GameState): WornPiece[] {
  const eq = state.player.equipment;
  const worn: WornPiece[] = [];
  for (const slot of WORN_SLOTS) {
    const piece = eq[slot];
    if (piece) {
      worn.push({ slot, tier: piece.tier, defId: piece.defId });
    }
  }
  return worn;
}

/**
 * Allocation-free per-tick change gate for the wardrobe report. Worn pieces
 * are only ever REPLACED whole (equip, unequip, sidearm fallback — never a
 * `tier`/`defId` mutated in place), so slot-object identity is an exact
 * change signal; the game loop runs the full report (an array of pieces plus
 * a signature string, at 60 Hz otherwise pure garbage) only on the handful of
 * ticks where the outfit actually changed. Fires on its first read so a fresh
 * run always reports the arriving outfit once.
 */
export function makeWornEquipmentGate(): (state: GameState) => boolean {
  const seen: unknown[] = WORN_SLOTS.map(() => undefined);
  let primed = false;
  return (state) => {
    const eq = state.player.equipment;
    let changed = !primed;
    primed = true;
    for (let i = 0; i < WORN_SLOTS.length; i++) {
      const piece = eq[WORN_SLOTS[i]!];
      if (seen[i] !== piece) {
        seen[i] = piece;
        changed = true;
      }
    }
    return changed;
  };
}
