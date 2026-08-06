// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The run-flow verbs the app's UI calls: the intro/outro pagers, cutscene
// taps and skips, the bag / pause / level-up SCREENS (per-player —
// the run's phase stays `playing` and the hero's own `screen` carries
// what they are looking at), and the post-victory STAY choice.

import { advanceCutsceneBeat, finishCutscene } from "@game/lib/cutscene.ts";
import { cutsceneDef } from "../defs/cutscenes.ts";
import { runLevelDef } from "../defs/levels/index.ts";
import { heroInPlay } from "../party.ts";
import { isPartyRun } from "../seating.ts";
import { advanceCutsceneChain } from "../story.ts";
import type { GameState, Player } from "../types/index.ts";
import { beginRespec } from "./stat-points.ts";

// ---- Screen toggles (called by the app's UI) ----------------------------------

/**
 * Does the hero have UNSPENT level-up points of either kind waiting on the
 * chooser — banked stat points or a queued talent pick? The gate the run's
 * opener leans on, so points a fresh run arrives with (an adopted veteran's
 * converted talents, or the AUTO PILOT refund's handed-back allocations) are
 * placed by the player before play, never left silently on the table.
 */
export function hasPendingPoints(player: Player): boolean {
  return player.pendingStatPoints > 0 || player.pendingTalentPoints.length > 0;
}

/**
 * Open the level-up chooser for a hero with unspent points — the on-demand
 * opener behind the HUD's "points waiting" pip, and the door the AUTO PILOT
 * refund walks a stopped ride through — and, in a PARTY, the only door a
 * level-up's points are ever placed through (solo the ding raises the chooser
 * itself; see `openLevelupAfterDing`). From active play only, with no other
 * screen up — a pause menu or an end-of-run splash is never fought over.
 * Returns whether it opened.
 */
export function promptPendingPoints(state: GameState, player: Player): boolean {
  if (
    state.phase !== "playing" ||
    player.screen !== undefined ||
    !hasPendingPoints(player)
  ) {
    return false;
  }
  player.screen = "levelup";
  return true;
}

/**
 * THE DING'S OWN OPENING — the chooser rises out of the fading glare once the
 * celebration window (`GameState.levelUpFxMs`) has burned down, called from
 * step() on the tick that empties it.
 *
 * **SOLO ONLY, and that is the whole rule.** With one hero the chooser is what
 * a level-up IS — the reward lands, the light fades, the modal rises, and the
 * world waits for the pick because the world is one player's. In a PARTY the
 * same modal is a thing the run cannot wait for: it would either freeze seven
 * other people while one reads stat blurbs, or (since it does not — see
 * `partyBlocked`) drop a modal over a hero standing in a live fight nobody
 * paused. So a party BANKS the ding and the HUD's points pip carries it, to be
 * placed when its player chooses (`promptPendingPoints`).
 *
 * `isPartyRun` rather than a count of seats: a run whose second player quit an
 * hour ago is still a run two people are playing (the stamp never clears), and
 * a chooser that started forcing itself open the moment a friend left would be
 * a mid-fight modal by another door.
 *
 * Every gate the on-demand opener has applies unchanged — active play, no
 * other screen up, something actually owed — so a hero reading their bag or a
 * scene holding the stage is never interrupted; the pip keeps the reminder and
 * the press reopens it.
 */
export function openLevelupAfterDing(state: GameState): void {
  if (isPartyRun(state)) return;
  for (const hero of state.players) {
    if (heroInPlay(hero)) promptPendingPoints(state, hero);
  }
}

/**
 * Close the chooser — with points still banked, if that is how the player
 * wants it. The chooser is non-blocking: points keep, the pip
 * keeps showing, and the field takes the pointer back.
 */
export function closeLevelup(player: Player): void {
  if (player.screen !== "levelup") return;
  delete player.screen;
}

/**
 * The player's tap through the level-intro monologue: turn the page. Past the
 * last page the briefing is over — flash the level-name `title` card before
 * the drop.
 */
export function advanceIntro(state: GameState): void {
  if (state.phase !== "intro") return;
  const pages = runLevelDef(state).intro;
  state.introPage++;
  if (state.introPage >= pages.length) {
    state.introPage = pages.length;
    state.phase = "title";
  }
}

/** The intro's SKIP button: cut the monologue short, straight to the title. */
export function skipIntro(state: GameState): void {
  if (state.phase === "intro") state.phase = "title";
}

/**
 * Leave the intro flow and start the run. From the `title` card it is the
 * drop into play; from `intro` it skips the remaining monologue and the card
 * both (the "start now" shortcut the keyboard and headless bot use).
 */
export function dismissIntro(state: GameState): void {
  if (state.phase === "intro" || state.phase === "title") {
    state.phase = "playing";
    // A LEVEL TOKEN jump owes a respec before the first step: open the
    // reallocation chooser in place of dropping straight into play. Opened for
    // EVERY hero who is owed one — `respecPending` is a run parameter applied
    // before anybody joins, so solo this is the same single chooser it always
    // was, and a party arriving on a token jump each place their own points.
    if (state.respecPending) {
      for (const hero of state.players) {
        if (heroInPlay(hero)) beginRespec(state, hero);
      }
      return;
    }
    // A hero who starts the run owing the chooser — an adopted veteran whose
    // loadout implies talent points (see `applyLoadout`), or a build the AUTO
    // PILOT refund handed its allocations back as pending stat points — is
    // greeted with it open, so the pile is placed under the player's own
    // control before play, not left waiting on a ding a max-level hero might
    // never see. Per hero, and closeable: the chooser is non-blocking now.
    for (const hero of state.players) {
      if (
        heroInPlay(hero) &&
        hero.screen === undefined &&
        hasPendingPoints(hero)
      ) {
        hero.screen = "levelup";
      }
    }
  }
}

/**
 * The player's tap through a level's post-victory EPILOGUE (`LevelDef.outro`
 * — the intro's black-screen mirror, entered when the victory countdown runs
 * out): turn the page. Past the last page the story is told — on to the
 * victory splash.
 */
export function advanceOutro(state: GameState): void {
  if (state.phase !== "outro") return;
  const pages = runLevelDef(state).outro ?? [];
  state.outroPage++;
  if (state.outroPage >= pages.length) {
    state.outroPage = pages.length;
    state.phase = "victory";
  }
}

/** The outro's SKIP button: cut the epilogue short, straight to the splash. */
export function skipOutro(state: GameState): void {
  if (state.phase === "outro") state.phase = "victory";
}

/**
 * The player's tap during the prelude: cut the running beat short (snap a
 * walk to its mark, dismiss a line early). One tap, one beat. Tapping the
 * last beat rolls the chain forward — the next queued scene, or the intro.
 */
export function tapCutscene(state: GameState): void {
  if (state.phase !== "cutscene" || !state.cutscene) return;
  advanceCutsceneBeat(state.cutscene, cutsceneDef(state.cutscene.defId));
  if (state.cutscene.done) advanceCutsceneChain(state);
}

/**
 * The prelude's SKIP button: end the opening outright — the running scene
 * AND every scene still queued behind it. Skipping the prelude also skips
 * the hero's level-intro monologue that would follow — one press bails the
 * whole opening, landing on the level-name `title` card just before the
 * drop.
 */
export function skipCutscene(state: GameState): void {
  if (state.phase !== "cutscene") return;
  if (state.cutscene) {
    finishCutscene(state.cutscene, cutsceneDef(state.cutscene.defId));
  }
  state.cutscene = null;
  state.cutsceneQueue = [];
  state.phase = "title";
}

/**
 * Replay shortcut: bail the STORY half of the opening — the prelude cutscene
 * AND the hero's intro monologue — arm the hero, and land on the level-name
 * `title` card. The app calls this when the player has already witnessed this
 * level's opening on this difficulty (see the per-character story ledger in
 * characters.ts): a die-and-retry loop shouldn't sit through the cutscene, the
 * briefing, or the scripted "draw your weapon" strike every single time.
 * Arming here is what lets a level that opens holstered (GOODCO HQ's
 * `openingStrike`) skip that beat cleanly — its thought is marked seen, so
 * `stepOpeningStrike` never fires to arm him, and he would stand defenceless
 * otherwise. A harmless no-op on a run already in play (a resumed or
 * checkpointed state).
 *
 * THE TITLE CARD IS KEPT ON PURPOSE — it is orientation, not story. Landing
 * straight in play meant a hub's travel door (driving the car out of the
 * garage) dropped the player into a firefight with no announcement of where
 * they had arrived; the card names the level for one beat (or one tap) and
 * costs a replay nothing. Callers that genuinely want PLAY (a `?scenario=`
 * staging, a warp) follow with `dismissIntro`.
 */
export function skipStoryOpening(state: GameState): void {
  if (state.phase === "cutscene") skipCutscene(state);
  if (state.phase === "intro") state.phase = "title";
  // Arm the WHOLE party. The opening is the level's, so the skip is too: a
  // party that armed seat 0 alone would leave every joiner holstered for the
  // rest of a level whose one arming beat has just been skipped past — the
  // same soft-lock `stepOpeningStrike`'s vanquished-vanguard net exists for.
  for (const hero of state.players) hero.disarmed = false;
}

/**
 * Can this hero's bag open right now? Mid-run whenever they have no other
 * screen up — and during an elite/boss ARRIVAL scene (a `dialogue` with an
 * `enemy` source): the stare-down is exactly when the player wants to size up
 * the speaker and equip a fitting weapon, so the scene lends the bag the
 * stage and takes it back on close. Every other scene (last words, inner
 * thoughts, lore, greetings, joins) stays read-only.
 */
export function canOpenInventory(state: GameState, player: Player): boolean {
  if (player.screen !== undefined) return false;
  return (
    state.phase === "playing" ||
    (state.phase === "dialogue" && state.dialogue?.source.kind === "enemy")
  );
}

/** Open this hero's bag — mid-run, or from an elite/boss arrival scene. */
export function openInventory(state: GameState, player: Player): void {
  if (canOpenInventory(state, player)) player.screen = "inventory";
}

/** Close the bag. An arrival scene it was opened over is still on the global
 * phase and simply takes the whole stage back. */
export function closeInventory(player: Player): void {
  if (player.screen !== "inventory") return;
  delete player.screen;
}

/**
 * Can this hero raise the pause menu right now? Mid-run with nothing else up —
 * and over an in-world DIALOGUE, the way the bag is lent the stage above. A
 * scene can run for several pages, and the one control a player reaches for
 * when something interrupts them is ESCAPE: with the menu withheld there, the
 * only way out of a talking boss was to tap through the whole speech first (or
 * background the tab, which auto-pauses through this same door). The rest of
 * the phases keep the menu shut: an end-of-run splash, a cutscene and the
 * briefing hold the whole stage already, and each has its own way out.
 */
export function canPauseGame(state: GameState, player: Player): boolean {
  if (player.screen !== undefined) return false;
  return state.phase === "playing" || state.phase === "dialogue";
}

/**
 * Open this hero's pause menu (see `canPauseGame` for when that is allowed).
 * Solo it freezes the world exactly as it always did (`partyBlocked`); in a
 * party it parks one hero, and the other seven play on.
 */
export function pauseGame(state: GameState, player: Player): void {
  if (canPauseGame(state, player)) player.screen = "paused";
}

/** Leave the pause menu and take the field back. */
export function resumeGame(player: Player): void {
  if (player.screen !== "paused") return;
  delete player.screen;
}

/**
 * The victory menu's STAY choice: the level is already won and banked, but the
 * hero lingers on the cleared field to farm loot and mop up stragglers. Drops
 * back into `playing`, latches `staying` (which stops the auto-victory
 * countdown from re-arming — see step.ts), and disarms the countdown. The
 * boss's corpse (recorded on its death) is left as the tap target that
 * re-opens the menu when the player is ready to move on. Only valid from the
 * `victory` phase with a corpse to return to. Returns true if it took.
 */
export function stayOnField(state: GameState): boolean {
  if (state.phase !== "victory") return false;
  // SOMETHING TO GO BACK FOR. Usually that is the boss's corpse — it is the tap
  // that re-opens this menu. A boss who FLEES leaves none ("a coward leaves
  // nothing", boss-death.ts) but leaves something better: the tear he bolted
  // through, standing where he vanished, which the player can follow him into
  // (a `direct` travel door). Without this the level ended at the splash and
  // that tear could never be reached — the chase was a cutscene rather than a
  // thing the player does.
  const doors = runLevelDef(state).travelDoors ?? [];
  if (!state.bossCorpse && doors.length === 0) return false;
  state.staying = true;
  state.victoryCountdownMs = null;
  state.phase = "playing";
  return true;
}

/**
 * Re-open the victory menu after a STAY: the player has tapped the boss corpse
 * to declare they are done farming. Only valid while `staying` on a cleared
 * field. Returns true if it took.
 */
export function reopenVictoryChoice(state: GameState): boolean {
  if (!state.staying || state.phase !== "playing" || !state.bossCorpse) {
    return false;
  }
  state.phase = "victory";
  return true;
}
