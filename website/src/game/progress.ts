// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Story progress persisted on-device (same policy as settings.ts): which
// cutscenes the player has already watched — a prelude plays once, not on
// every retry — and which levels they have cleared, per difficulty, which
// drives the campaign: the victory splash's NEXT LEVEL button and the title
// menu's level-select unlock state. Rewatching a cutscene is always available
// through the `?cutscene=<id>` workbench, which deliberately bypasses this
// record; the `?level=` dev override likewise ignores the unlock gate.

import { LEVEL_ORDER, type Difficulty } from "@game/core";

import { createFlagStore } from "@ui/lib/flag-store.ts";

import { storageKey } from "../identity.ts";

const seenCutscenes = createFlagStore(storageKey("seen-cutscenes"));

/** Has this scene already played to its end (or been skipped) here? */
export function hasSeenCutscene(id: string): boolean {
  return seenCutscenes.has(id);
}

/** Record a scene as watched — called however it ended (played out,
 * tapped through, SKIP, Esc, or a bot skipping it). */
export function markCutsceneSeen(id: string): void {
  seenCutscenes.add(id);
}

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
