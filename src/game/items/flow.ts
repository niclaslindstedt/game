// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Phase toggles the app's UI calls: the intro/outro pagers, cutscene taps
// and skips, the bag and pause phases, and the post-victory STAY choice.

import { advanceCutsceneBeat, finishCutscene } from "@game/lib/cutscene.ts";
import { cutsceneDef } from "../defs/cutscenes.ts";
import { levelDef } from "../defs/levels/index.ts";
import { advanceCutsceneChain } from "../story.ts";
import type { GameState } from "../types/index.ts";
import { beginRespec } from "./stat-points.ts";

// ---- Phase toggles (called by the app's UI) -----------------------------------

/**
 * Does the hero have UNSPENT level-up points of either kind waiting on the
 * chooser — banked stat points or a queued talent pick? The gate the run's
 * opener and a resume both reopen the chooser on, so points a fresh run arrives
 * with (an adopted veteran's converted talents, or the AUTO PILOT refund's
 * handed-back allocations) are placed by the player before play, never left
 * silently on the table.
 */
export function hasPendingPoints(state: GameState): boolean {
  return (
    state.player.pendingStatPoints > 0 || state.pendingTalentPoints.length > 0
  );
}

/**
 * Force the level-up chooser open when the hero is in active play with unspent
 * points — the "allocate before you go on" gate the AUTO PILOT refund leans on
 * to hand a stopped ride straight to the stat chooser (and, as those points are
 * placed, the talent picker). From `playing` only, so it never fights the pause
 * menu or an end-of-run splash; a resume from `paused` routes through
 * `resumeGame` instead. Returns whether it diverted.
 */
export function promptPendingPoints(state: GameState): boolean {
  if (state.phase !== "playing" || !hasPendingPoints(state)) return false;
  state.phase = "levelup";
  return true;
}

/**
 * The player's tap through the level-intro monologue: turn the page. Past the
 * last page the briefing is over — flash the level-name `title` card before
 * the drop.
 */
export function advanceIntro(state: GameState): void {
  if (state.phase !== "intro") return;
  const pages = levelDef(state.level.id).intro;
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
    // A LEVEL TOKEN jump owes a respec before the first step: open the
    // reallocation chooser in place of dropping straight into play.
    if (state.respecPending) {
      beginRespec(state);
    } else if (hasPendingPoints(state)) {
      // The hero starts the run owing the chooser: an adopted veteran whose
      // loadout implies talent points (see `applyLoadout`), or a build the AUTO
      // PILOT refund handed its allocations back as pending stat points (see
      // `refundAutopilotBuild`). Greet them with the stat chooser / talent
      // picker (the level-up flow) so the pile is placed under the player's own
      // control before play, not left waiting on a ding a max-level hero might
      // never see.
      state.phase = "levelup";
    } else {
      state.phase = "playing";
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
  const pages = levelDef(state.level.id).outro ?? [];
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
 * Replay shortcut: bail the whole opening at once — the prelude cutscene AND
 * the hero's intro monologue — and drop straight into play with his weapon
 * drawn. The app calls this when the player has already witnessed this level's
 * opening on this difficulty (see the per-character story ledger in
 * characters.ts): a die-and-retry loop shouldn't sit through the cutscene, the
 * briefing, or the scripted "draw your weapon" strike every single time.
 * Arming here is what lets a level that opens holstered (SpaceZ HQ's
 * `openingStrike`) skip that beat cleanly — its thought is marked seen, so
 * `stepOpeningStrike` never fires to arm him, and he would stand defenceless
 * otherwise. A harmless no-op on a run already in play (a resumed or
 * checkpointed state).
 */
export function skipStoryOpening(state: GameState): void {
  if (state.phase === "cutscene") skipCutscene(state);
  dismissIntro(state);
  state.player.disarmed = false;
}

/**
 * Can the bag open right now? Mid-run always — and during an elite/boss
 * ARRIVAL scene (a `dialogue` with an `enemy` source): the stare-down is
 * exactly when the player wants to size up the speaker and equip a fitting
 * weapon, so the scene lends the bag the stage and takes it back on close.
 * Every other scene (last words, inner thoughts, lore, greetings, joins)
 * stays read-only.
 */
export function canOpenInventory(state: GameState): boolean {
  return (
    state.phase === "playing" ||
    (state.phase === "dialogue" && state.dialogue?.source.kind === "enemy")
  );
}

/** Pause into the bag — mid-run, or from an elite/boss arrival scene. */
export function openInventory(state: GameState): void {
  if (canOpenInventory(state)) state.phase = "inventory";
}

/** Close the bag and resume: the arrival scene it interrupted takes the
 * stage back if one is still up, else play (pending level-ups take
 * priority — a scene's own pending level-up lands when IT ends). */
export function closeInventory(state: GameState): void {
  if (state.phase !== "inventory") return;
  if (state.dialogue !== null) {
    state.phase = "dialogue";
    return;
  }
  state.phase = hasPendingPoints(state) ? "levelup" : "playing";
}

/** Freeze the run into the pause screen. Only possible mid-run — end-of-run
 * splashes and other overlays are already their own frozen phases. */
export function pauseGame(state: GameState): void {
  if (state.phase === "playing") state.phase = "paused";
}

/**
 * Leave the pause screen and resume the run — but a hero carrying unspent
 * points (a run resumed with them, or an AUTO PILOT ride stopped from the pause
 * menu) drops into the level-up chooser instead of straight into play, so the
 * points are placed under the player's own control first (see
 * `hasPendingPoints`).
 */
export function resumeGame(state: GameState): void {
  if (state.phase !== "paused") return;
  state.phase = hasPendingPoints(state) ? "levelup" : "playing";
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
  if (state.phase !== "victory" || !state.bossCorpse) return false;
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
