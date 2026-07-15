// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The native end of the vibration bridge. The game speaks the Web Vibration
// API's vocabulary — a duration in ms, or an on/off/on… array of ms values
// (see website/src/game/haptics.ts). This module replays that vocabulary on
// the real device via the Taptic Engine (iOS) / vibrator (Android) through
// expo-haptics.
//
// Why not just hand the pattern to react-native's Vibration API? On iOS that
// API is nearly inert — it ignores durations and does a single fixed buzz, so
// the game's carefully tuned "minion = flick, boss = rumble" scaling would all
// feel identical. expo-haptics drives the Taptic Engine with real impact
// styles, so we map each pulse's duration onto an impact weight and replay the
// pattern's rhythm with timers. That preserves the on-screen read: a bigger
// mob lands as a bigger, longer-rolling hit under the thumb.

import * as Haptics from "expo-haptics";

/** The shapes the game emits through the injected `navigator.vibrate`. */
export type VibrationPattern = number | readonly number[];

/** Map one pulse's duration (ms) to a Taptic impact weight. The thresholds
 * mirror the game's own vocabulary: a ~7–12ms tick (typewriter, minion) is a
 * light flick, a ~28ms tap (elite, equip) is medium, and anything heavier
 * (boss, big pack rumble) is a heavy hit. */
function styleForDuration(ms: number): Haptics.ImpactFeedbackStyle {
  if (ms <= 15) return Haptics.ImpactFeedbackStyle.Light;
  if (ms <= 35) return Haptics.ImpactFeedbackStyle.Medium;
  return Haptics.ImpactFeedbackStyle.Heavy;
}

// Timers for an in-flight multi-pulse pattern. `navigator.vibrate` REPLACES the
// active pattern rather than queuing (the game relies on this — see the pack
// rumble note in game/haptics.ts), so a new buzz cancels any pending pulses.
let pending: ReturnType<typeof setTimeout>[] = [];

function clearPending(): void {
  for (const t of pending) clearTimeout(t);
  pending = [];
}

/** Fire one impact now, swallowing errors — feedback is non-essential and must
 * never crash the shell (a device without a Taptic Engine simply does less). */
function impact(style: Haptics.ImpactFeedbackStyle): void {
  Haptics.impactAsync(style).catch(() => {});
}

/**
 * Replay a Web-Vibration pattern on the native motor.
 *
 * A bare number is a single pulse. An array is `[on, off, on, off, …]`: we fire
 * an impact at the start of every "on" span, offset by the accumulated
 * on+off time so the rhythm matches what the game intended. `vibrate(0)` / an
 * empty array cancels any running pattern (again matching the web API).
 */
export function playPattern(pattern: VibrationPattern): void {
  clearPending();
  const spans: readonly number[] =
    typeof pattern === "number"
      ? [pattern]
      : Array.isArray(pattern)
        ? pattern
        : [];

  let offset = 0;
  for (let i = 0; i < spans.length; i += 2) {
    const on = Number(spans[i]) || 0;
    if (on > 0) {
      const style = styleForDuration(on);
      if (offset === 0) {
        impact(style); // fire the first pulse immediately for zero latency
      } else {
        pending.push(setTimeout(() => impact(style), offset));
      }
    }
    const off = Number(spans[i + 1]) || 0;
    offset += on + off;
  }
}
