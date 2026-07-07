// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Story progress persisted on-device (same policy as settings.ts): which
// cutscenes the player has already watched — a prelude plays once, not on
// every retry. Rewatching is always available through the `?cutscene=<id>`
// workbench, which deliberately bypasses this record.

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
