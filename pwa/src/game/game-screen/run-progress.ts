// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Run-outcome bookkeeping: the retry checkpoint, and everything a run's
// events bank onto the persistent CHARACTER — witnessed story, the merchant
// met, victories (build snapshots, campaign totals, high scores), deaths
// (hardcore retirement vs the softcore keep), and travel-gate crossings.
// Pure feedback (effects, toasts) lives in event-fx.ts; the AUTO PILOT's
// route decisions live in autopilot-director.ts.

import { fieldLive, localHero } from "../local-seat.ts";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import { bankCampaignQuests, isPartyRun, storyItemDef } from "@game/core";
import {
  extractLoadout,
  levelDef,
  type Difficulty,
  type GameEvent,
  type GameState,
} from "@game/core";

import {
  accrueCampaign,
  bankKeepsake,
  bankRiftRoad,
  bankLoadout,
  campaignTally,
  hasClearedLevel,
  bankCampaignChain,
  markMerchantMet,
  markStorySeen,
  recordDeath,
  recordVictory,
  resetCampaign,
  type Character,
} from "../characters.ts";
import type { WornPiece } from "../achievement-totals.ts";
import { hasSeenOpening } from "../character-progress.ts";
import { cloneGameState } from "../checkpoint.ts";
import { runCommand } from "../run-commands.ts";
import { playDeathHaptic } from "../haptics.ts";
import { recordCampaign } from "../highscores.ts";
import { publishLeaderboards } from "../leaderboards.ts";
import { stopMusic } from "../music/index.ts";
import type { Hud } from "./hud-model.ts";

/** How long the arrival takes to come up out of the drive-out's black (ms).
 * Shorter than the departure's own fade: going dark is the beat being watched,
 * coming back is just the door opening. */
export const ARRIVAL_FADE_MS = 700;

export type RunCheckpoint = { levelId: string; state: GameState };

/**
 * Has this character already earned the right to skip `levelId`'s opening on
 * this difficulty?
 *
 * The rule is `run-setup.ts`'s own and lives here so both readers share it: a
 * mission replays its prelude, monologue and opening strike until the level is
 * CLEARED (a run that died partway still owes its story), while the HUB — which
 * never "completes" — skips once its opening has been witnessed. An IN-SESSION
 * crossing has to answer the same question, because the destination is built
 * from the parameters the HOST hands the session rather than from the local
 * `createRunSession` that would otherwise ask this.
 */
export function openingSeenFor(
  character: Character,
  levelId: string,
  difficulty: Difficulty,
): boolean {
  return (
    hasClearedLevel(character, levelId, difficulty) ||
    (levelDef(levelId).objective.type === "hub" &&
      hasSeenOpening(character, levelId, difficulty))
  );
}

export type RunProgress = {
  /** Snapshot the combat-start checkpoint once per fresh run (see below). */
  captureCheckpoint: (state: GameState) => void;
  /** Bank whatever this event means for the character/checkpoint/scores. */
  onEvent: (event: GameEvent, state: GameState) => void;
  /** Cross to another level RIGHT NOW: bank the hero's build and the
   * thoughts read this run, then swap the mount to the destination. The
   * gate crossing, the hub's travel doors and the victory splash's NEXT LEVEL
   * are the same trip — see {@link TravelOptions} for the one way they differ. */
  travelTo: (state: GameState, to: string, opts?: TravelOptions) => void;
  /** Bank the hero's build and this run's thoughts WITHOUT ending anything —
   * the mid-run leave: a joiner quitting, or the session dying under
   * them. The victory/travel/defeat paths bank on their own; re-banking
   * unchanged content moves nothing (an unchanged hero keeps its stamp). */
  bankHero: (state: GameState) => void;
};

export type TravelOptions = {
  /**
   * The hero is ALREADY on the character, so the crossing must not bank again.
   *
   * Set by exactly one caller: the victory splash's NEXT LEVEL, whose hero was
   * banked a beat earlier by `recordVictory` — together with the clear and the
   * campaign tally that only a WIN books. Skipping the second bank is what
   * keeps the local crossing identical to the one this splash has always
   * performed; the gate and the travel doors bank here because nothing else
   * banked for them. (The splash unsets it after a STAY: a farmed field is
   * worth more than what the win put on the character.)
   */
  banked?: boolean;
  /**
   * THE TRIP WAS THROUGH A RIFT PORTAL, so the destination is banked on the
   * character (`riftRoads`) and the garage's seam can reach it from here on.
   *
   * Set by the three crossings that ARE a rift portal — a `direct` portal's
   * tap, the seam's own picker, and the blast gate the severed hand opens —
   * and by nothing else. The victory splash's NEXT LEVEL is a road walked, not
   * a seam torn, and must not teach the tool a shortcut the hero never took.
   */
  viaRift?: boolean;
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
  /**
   * WHETHER A CROSSING IS THE SESSION'S TO PERFORM. True when this run
   * is hosted with the doors open or has other people in it — then `travelTo`
   * sends the run command and the SESSION swaps the level under everybody at
   * once, instead of the app tearing the session down (which is what
   * disconnects every joiner). Absent/false is every local run, which keeps
   * the app-side crossing exactly as it has always been.
   */
  sessionTravels?: () => boolean;
  /** Whether this run actually shows its opening (see run-setup.ts). False —
   * a dev warp, a `?scenario=` staging, a muted run — means no progress event
   * may stamp the opening "seen": a level warped into once would otherwise
   * skip its real first-visit story forever. Thoughts still bank. */
  openingPlayed: boolean;
  /** THE DRIVE-OUT'S FAR SIDE: the wall-clock instant the arrival curtain
   * should be fully lifted by. The departing run washes the screen to black on
   * its own clock (`GameState.departure`); the run it hands over to is a fresh
   * state with no memory of that, so the deadline is parked on this
   * component-lifetime ref and the next run's render loop lifts the same
   * curtain back off. Left at 0 by every other kind of crossing. */
  arrivalFadeRef: MutableRefObject<number>;
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
    openingPlayed,
    arrivalFadeRef,
    setHud,
    setLevelId,
    setNewRecord,
  } = deps;

  // The first instant the run is truly in the player's hands — armed and
  // playing, past the prelude, the intro monologue, and (on GOODCO HQ)
  // the scripted opening strike that draws the blade. Snapshot it once so
  // a later RETRY drops the hero back HERE, into the action, instead of
  // replaying the whole opening. NEXT LEVEL runs this on its own fresh
  // run, superseding the previous level's checkpoint.
  const captureCheckpoint = (state: GameState) => {
    if (
      captureEnabled &&
      checkpointRef.current?.levelId !== runLevelId &&
      // On the field, nothing open: a checkpoint must never be snapped while
      // the local player sits in a screen (bag, pause, chooser).
      fieldLive(state) &&
      !localHero(state).disarmed
    ) {
      checkpointRef.current = {
        levelId: runLevelId,
        state: cloneGameState(state),
      };
      // Combat has begun, so the opening (cutscene + intro, and the strike
      // that armed him) has been witnessed — bank it on the character now,
      // together with the inner monologues read so far, so it stays skipped
      // even if the player quits before the run resolves. Late in-play
      // thoughts are added again at run's end below. A run that never SHOWED
      // its opening (a warp, a staging, a muted run) banks only the thoughts.
      characterRef.current = markStorySeen(
        characterRef.current,
        openingPlayed ? runLevelId : null,
        difficulty,
        state.thoughtsSeen,
      );
    }
  };

  // CROSS TO ANOTHER LEVEL: bank the hero's build and the thoughts read this
  // run, then swap the mount to the destination level. The next run dresses
  // the hero in the banked build, so the crossing carries everything he's
  // holding — the run he leaves behind simply ends. Shared by the latent
  // gate (`gateEntered`) and the hub's standing travel doors, so the two
  // trips can never drift apart on what gets banked.
  // Bank the hero as they stand — the shared half of a crossing and of a
  // mid-run leave. Extracting from the live state folds in everything the
  // funnels promise (an unrecovered corpse's gear included).
  const bankHero = (state: GameState) => {
    characterRef.current = bankLoadout(
      characterRef.current,
      extractLoadout(state, localHero(state)),
      coinsIncludePending,
    );
    characterRef.current = markStorySeen(
      characterRef.current,
      openingPlayed ? state.level.id : null,
      difficulty,
      state.thoughtsSeen,
    );
  };

  const travelTo = (state: GameState, to: string, opts: TravelOptions = {}) => {
    // WHERE THE TOOL HAS NOW BEEN. Booked before the session branch below, so a
    // hosted party's crossing teaches the host's own seam the same road a local
    // run's would — the trip happened either way.
    if (opts.viaRift) {
      characterRef.current = bankRiftRoad(characterRef.current, to, difficulty);
    }
    // WITH A PARTY ABOARD, THE CROSSING IS THE SESSION'S. The verb asks
    // the session to swap the level under everybody at once; the swap comes
    // back as a full snapshot, the driver's travel hook banks this hero off
    // the level being left, and the level-id change is what remounts the app
    // — with the driver and every joiner's connection intact. Only seat 0's
    // request is honored (the host chooses the road), so a joiner's copy of
    // the same event sends a verb the session politely refuses.
    //
    // THE VICTORY SPLASH'S NEXT LEVEL IS THE SAME TRIP. It used to re-mount
    // app-side like every crossing once did — which ENDED the session and
    // dropped every joiner exactly at the moment a co-op campaign wants to
    // carry on together. It routes here now, banked flag and all, so a party
    // that wins a level walks into the next one without a rejoin.
    if (deps.sessionTravels?.()) {
      runCommand(
        state,
        "travelTo",
        to,
        // How much of the destination's opening to skip — the same question a
        // locally-built run answers from this character (run-setup.ts), asked
        // through the rule the two share.
        openingSeenFor(characterRef.current, to, difficulty) ? "story" : "none",
      );
      return;
    }
    if (!opts.banked) bankHero(state);
    checkpointRef.current = null;
    stopMusic();
    setHud(null);
    setLevelId(to);
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
    // A KEEPSAKE story item (the RIFT CREATOR) banks on the character the
    // moment it is picked up — a permanent acquisition, not run state, so a
    // death or an abandoned run can never un-find it.
    if (
      event.type === "storyItemCollected" &&
      storyItemDef(event.defId)?.keepsake
    ) {
      characterRef.current = bankKeepsake(characterRef.current, event.defId);
    }
    // A CAMPAIGN ERRAND MOVED — bank the chain on the character now rather
    // than at the level's end. The whole point of a campaign chain is that it
    // is carried for hours across five venues, so the case that matters is the
    // player who quits to the menu halfway through one; a bank that waited for
    // a victory would lose exactly that. `bankCampaignChain` keeps the further
    // reading and skips the write when nothing moved, so firing on every quest
    // event is cheap and cannot churn the roster.
    if (
      event.type === "questAccepted" ||
      event.type === "questProgress" ||
      event.type === "questCompleted" ||
      event.type === "questTurnedIn" ||
      event.type === "questFailed" ||
      event.type === "questFlagSet" ||
      event.type === "questPieceSold" ||
      event.type === "questPieceBought"
    ) {
      characterRef.current = bankCampaignChain(
        characterRef.current,
        difficulty,
        bankCampaignQuests(state),
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
        extractLoadout(state, localHero(state)),
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
            // ONE CO-OP LEG TAINTS THE WHOLE CAMPAIGN, and the mark is kept on
            // the tally rather than asked at the end: by the time the campaign
            // is banked, the run that had a party in it is three venues back.
            party: isPartyRun(state),
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
          // A CAMPAIGN ANY LEG OF WHICH WAS PLAYED IN COMPANY IS OFF THE BOARD
          // (docs/multiplayer.md). The tally is still cleared below, so a tainted
          // campaign ends rather than lingering to be re-banked.
          if (
            !tally.party &&
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
          // Off the board if ANY leg was played in company — the cleared maps
          // (the tally's own latch) or this fatal one, which is never accrued
          // into the tally and so has to be asked separately.
          if (
            !tally.party &&
            !isPartyRun(state) &&
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
        const banked = extractLoadout(state, localHero(state));
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
    // tears open): the same crossing a hub's travel door makes on a tap. It is
    // a RIFT PORTAL — a door onto a vault that is nowhere, talked open by a
    // dead man's hand — so the seam at home learns the road from it.
    if (event.type === "gateEntered") {
      travelTo(state, event.to, { viaRift: true });
    }
    // DRIVING OUT of the garage: the drive-out beat has played out — the car
    // is away down the road and the screen is already black — and the trip it
    // commits is the car door's own destination, the same crossing as a gate
    // but booked by the wheel instead of a tap. The curtain is handed over
    // with it: the destination lifts the SAME black rather than snapping into
    // a lit level, so the two halves of the transition are one move.
    if (event.type === "carDeparted") {
      arrivalFadeRef.current = performance.now() + ARRIVAL_FADE_MS;
      travelTo(state, event.to);
    }
    // Run over either way: bank the opening and every inner monologue read
    // this run onto the character, so the next replay on this difficulty
    // skips them. This catches the late kill/sight beats that only fire
    // deep into a run (the combat-start mark above bags the opening ones).
    if (event.type === "victory" || event.type === "defeat") {
      characterRef.current = markStorySeen(
        characterRef.current,
        openingPlayed ? state.level.id : null,
        difficulty,
        state.thoughtsSeen,
      );
      // …and publish the player's slate to the platform's public boards (a
      // no-op outside the native app). Here because this is the moment every
      // board's source has just settled: the campaign totals above, and the
      // lifetime ledger the last tick's events fed. The platform keeps the
      // best value it has ever been sent, so re-publishing costs nothing and
      // needs no record of what went before — which is also what backfills a
      // player's whole history the first time they sign in. Ungated by run
      // type on purpose: the numbers are the ACCOUNT's records, and the demo
      // never inflates them (it skips the ledger entirely), so a demo run
      // republishes the same figures rather than false ones.
      void publishLeaderboards();
    }
  };

  return { captureCheckpoint, onEvent, travelTo, bankHero };
}

/** Every worn slot the wardrobe feats track, weapon first. */
const WORN_SLOTS = [
  "weapon",
  "head",
  "chest",
  "legs",
  "feet",
  "amulet",
  "ring1",
  "ring2",
  "offhand",
] as const;

/**
 * The hero's current outfit for the wardrobe achievement feats — the worn
 * weapon plus every filled armor / jewellery / offhand slot.
 */
export function wornEquipment(state: GameState): WornPiece[] {
  const eq = localHero(state).equipment;
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
    const eq = localHero(state).equipment;
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
