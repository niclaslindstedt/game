// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Story progress persisted on-device (same policy as settings.ts): which
// levels the player has cleared, per difficulty, which drives the campaign —
// the victory splash's NEXT LEVEL button and the title menu's level-select
// unlock state — plus the hero's banked LOADOUT per cleared level, so the
// level, stats and items he finished with carry into the next level. The
// `?level=` dev override ignores the unlock gate (and falls back to a
// derived loadout when nothing is banked). (Cutscenes always play now —
// there is no "already watched" record to skip them.)

import {
  deriveArrivalLoadout,
  LEVEL_ORDER,
  type Difficulty,
  type Loadout,
} from "@game/core";

import { createFlagStore } from "@ui/lib/flag-store.ts";

import { storageKey } from "../identity.ts";

// Level completion is tracked per difficulty: clearing THE MOON on EASY does
// not unlock the next level on NIGHTMARE. Each flag is `${difficulty}:${id}`.
const completedLevels = createFlagStore(storageKey("completed-levels"));

const levelKey = (levelId: string, difficulty: Difficulty): string =>
  `${difficulty}:${levelId}`;

/** Record a level as cleared at this difficulty (called on victory). */
export function markLevelCompleted(
  levelId: string,
  difficulty: Difficulty,
): void {
  completedLevels.add(levelKey(levelId, difficulty));
}

/** Has this level been cleared at this difficulty on this device? */
export function hasCompletedLevel(
  levelId: string,
  difficulty: Difficulty,
): boolean {
  return completedLevels.has(levelKey(levelId, difficulty));
}

/**
 * Is this level reachable at this difficulty? The first level in LEVEL_ORDER
 * is always open; every later one unlocks when the level before it has been
 * cleared at the same difficulty. An id not in LEVEL_ORDER (a dev `?level=`)
 * counts as open so the override never gets gated out.
 */
export function isLevelUnlocked(
  levelId: string,
  difficulty: Difficulty,
): boolean {
  const index = LEVEL_ORDER.indexOf(levelId);
  if (index <= 0) return true;
  return hasCompletedLevel(LEVEL_ORDER[index - 1] as string, difficulty);
}

/** The next level along LEVEL_ORDER, or null if this is the last (or unknown)
 * — the campaign's "advance" step, shared by the splash and the menu. */
export function nextLevelId(levelId: string): string | null {
  const index = LEVEL_ORDER.indexOf(levelId);
  if (index < 0 || index + 1 >= LEVEL_ORDER.length) return null;
  return LEVEL_ORDER[index + 1] as string;
}

/**
 * Has the whole campaign been cleared at this difficulty? True once the last
 * level in LEVEL_ORDER has been beaten there. This is what unlocks free level
 * selection — until then the player is walked straight through the story.
 */
export function hasBeatenDifficulty(difficulty: Difficulty): boolean {
  const last = LEVEL_ORDER[LEVEL_ORDER.length - 1];
  return last !== undefined && hasCompletedLevel(last, difficulty);
}

/**
 * The story level to drop the player into next at this difficulty: the first
 * one along LEVEL_ORDER they have not yet cleared (falling back to the opener
 * once everything is done). Drives "continue the story" when the level select
 * is still locked.
 */
export function firstUnclearedLevel(difficulty: Difficulty): string {
  const opener = LEVEL_ORDER[0] as string;
  return LEVEL_ORDER.find((id) => !hasCompletedLevel(id, difficulty)) ?? opener;
}

// ---- Loadout carry-over -------------------------------------------------------
// Victory banks a snapshot of the hero (level, stats, items — the engine's
// `extractLoadout`), keyed by the CLEARED level and difficulty; starting the
// following level hands it back to `createGame`, so progress genuinely
// carries through the campaign. Plain JSON in localStorage, same policy as
// the high scores.

const loadoutKey = (levelId: string, difficulty: Difficulty): string =>
  storageKey(`loadout:${difficulty}:${levelId}`);

/** Bank the hero's end-of-level snapshot for the level just cleared. */
export function saveLoadout(
  levelId: string,
  difficulty: Difficulty,
  loadout: Loadout,
): void {
  try {
    window.localStorage.setItem(
      loadoutKey(levelId, difficulty),
      JSON.stringify(loadout),
    );
  } catch {
    // Storage full or unavailable: the run still plays, it just won't carry.
  }
}

/** The snapshot banked when `levelId` was cleared at `difficulty`, if any. */
export function loadLoadout(
  levelId: string,
  difficulty: Difficulty,
): Loadout | null {
  try {
    const raw = window.localStorage.getItem(loadoutKey(levelId, difficulty));
    return raw ? (JSON.parse(raw) as Loadout) : null;
  } catch {
    return null;
  }
}

/**
 * The loadout to start `levelId` with at `difficulty`: the snapshot banked
 * by clearing the previous story level — the real campaign carry-over — or,
 * when nothing is banked (dev `?level=` jumps, wiped storage), the engine's
 * derived stand-in. Null on the opener and on ids outside LEVEL_ORDER: those
 * start fresh as authored.
 */
export function startingLoadout(
  levelId: string,
  difficulty: Difficulty,
): Loadout | null {
  const index = LEVEL_ORDER.indexOf(levelId);
  if (index <= 0) return null;
  const previous = LEVEL_ORDER[index - 1] as string;
  return (
    loadLoadout(previous, difficulty) ??
    deriveArrivalLoadout(levelId, difficulty)
  );
}
