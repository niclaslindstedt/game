// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The app's single haptics surface — the vibration counterpart to audio.ts.
// One `Haptics` (one Vibration API, or a native driver later) shared by the
// game, plus the vibration vocabulary that mirrors sfx/. A kill buzzes the
// phone, and the bigger the mob the bigger the buzz: a minion is a flick, an
// elite a firm tap, a boss a rolling rumble. Dialogue is felt too — each
// letter of the typewriter crawl ticks the motor so a line lands under the
// thumb as well as on screen. On iOS (no Vibration API) the underlying driver
// is a noop, so this all costs nothing.

import { type GameEvent, enemyDef, type EnemyRole } from "@game/core";

import { createHaptics, type HapticPattern } from "@ui/lib/haptics.ts";

/** The one haptics surface the whole app shares. */
export const haptics = createHaptics();

/** Player toggle, wired from settings.ts (mirrors setAudioVolumes). */
export function setHapticsEnabled(enabled: boolean): void {
  haptics.setEnabled(enabled);
}

// Kill feedback scaled by enemy rarity (its role). Durations stay short —
// phone vibration motors are blunt and long buzzes read as a malfunction.
// Bosses get an on/off/on pattern so the extra energy is felt as a rumble
// rather than one overlong drone.
const KILL_PATTERNS: Record<EnemyRole, HapticPattern> = {
  minion: 12,
  elite: 28,
  boss: [45, 40, 70],
};

/** Translate one step's engine events into haptic feedback. The mirror of
 * playEventSounds: only kills buzz today, and unmatched events are silent by
 * design. Cheap to call every tick — a noop when haptics are off/unsupported
 * or when the step produced no kill. */
export function playEventHaptics(events: readonly GameEvent[]): void {
  if (!haptics.active) return; // skip the enemyDef lookups entirely
  for (const event of events) {
    if (event.type !== "enemyKilled") continue;
    const role = enemyDef(event.defId).role;
    haptics.vibrate(KILL_PATTERNS[role]);
  }
}

// A faint tick under each typewriter letter — the shortest pulse a motor can
// register, so the dialogue crawl reads as a light chatter under the thumb
// rather than one long buzz. Fired on the same cadence as the print blip.
const TYPEWRITER_TICK_MS = 7;

/** Buzz one letter of the dialogue crawl. Paired with the print blip so the
 * line is felt as it types; a noop when haptics are off/unsupported. */
export function playTypewriterHaptic(): void {
  haptics.vibrate(TYPEWRITER_TICK_MS);
}
