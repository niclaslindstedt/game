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

// How much each kill weighs into a pack rumble — a bigger foe pulls the buzz
// up faster, matching how it reads on screen (an elite is worth a couple of
// minions, a boss a small mob on its own).
const KILL_WEIGHT: Record<EnemyRole, number> = {
  minion: 1,
  elite: 2.5,
  boss: 5,
};

/** Build a rolling rumble for a pack of kills of total `weight`. More weight
 * throws more (and slightly longer) pulses, so a big pull is felt as a big
 * hit — capped at both ends so it never reads as a stuck motor. A pulsed
 * pattern, not one long buzz, keeps the extra energy legible on blunt phone
 * motors (the same reason bosses use an on/off/on pattern). */
function packRumble(weight: number): HapticPattern {
  const pulses = Math.max(2, Math.min(8, Math.round(weight / 3)));
  const on = Math.max(14, Math.min(34, Math.round(12 + weight)));
  const gap = 22;
  const pattern: number[] = [];
  for (let i = 0; i < pulses; i++) {
    pattern.push(on);
    if (i < pulses - 1) pattern.push(gap);
  }
  return pattern;
}

/** Translate one step's engine events into haptic feedback. The mirror of
 * playEventSounds: only kills buzz today, and unmatched events are silent by
 * design. A lone kill keeps its crisp role-tuned tap; a pack of kills in the
 * same tick (an AoE clear, a melee cleave) fuses into one rolling rumble that
 * grows with the pack — both because a big pull deserves a big hit, and because
 * `navigator.vibrate` replaces the active pattern, so firing a buzz per kill
 * would only leave the last stray tap anyway. Cheap to call every tick — a noop
 * when haptics are off/unsupported or when the step produced no kill. */
export function playEventHaptics(events: readonly GameEvent[]): void {
  if (!haptics.active) return; // skip the enemyDef lookups entirely
  let kills = 0;
  let weight = 0;
  let topRole: EnemyRole | null = null;
  for (const event of events) {
    if (event.type !== "enemyKilled") continue;
    const role = enemyDef(event.defId).role;
    kills++;
    weight += KILL_WEIGHT[role];
    if (topRole == null || KILL_WEIGHT[role] > KILL_WEIGHT[topRole]) {
      topRole = role;
    }
  }
  if (kills === 0) return;
  if (kills === 1) {
    haptics.vibrate(KILL_PATTERNS[topRole as EnemyRole]);
    return;
  }
  haptics.vibrate(packRumble(weight));
}

// A short triumphant roll when an achievement badge pops — pitched a beat above
// a kill so unlocking a feat is felt as a reward, not a hit.
const ACHIEVEMENT_PATTERN: HapticPattern = [30, 45, 55];

/** Buzz an achievement unlock — paired with the toast + jingle. A noop when
 * haptics are off/unsupported. */
export function playAchievementHaptic(): void {
  haptics.vibrate(ACHIEVEMENT_PATTERN);
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
