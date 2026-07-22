// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The native end of the vibration bridge. The game speaks the Web Vibration
// API's vocabulary — a duration in ms, or an on/off/on… array of ms values
// (see website/src/game/haptics.ts). This module replays that vocabulary on
// the real device via the Taptic Engine (iOS) / vibrator (Android) through
// expo-haptics.
//
// Why not just hand the pattern to react-native's Vibration API? On iOS that
// API is nearly inert — it ignores durations and does a single fixed buzz, so
// the game's carefully tuned "graze = flick, fatal blow = rumble" scaling would
// all feel identical. expo-haptics drives the Taptic Engine with real impact
// styles, so we map each pulse's duration onto an impact weight (or, for the
// shortest ticks, a gentle selection cue) and replay the pattern's rhythm with
// timers. That preserves the on-screen read: a light hit lands as a flick under
// the thumb, a near-fatal blow as a heavy jolt, death as a long heavy rumble,
// and the dialogue crawl as a soft per-letter chatter.

import * as Haptics from "expo-haptics";

/** The shapes the game emits through the injected `navigator.vibrate`. */
export type VibrationPattern = number | readonly number[];

// The very-shortest pulses — the dialogue typewriter's per-letter tick — map
// onto iOS "selection" feedback rather than an impact. Selection is the gentlest
// cue the Taptic Engine offers (the soft tick a picker wheel makes) and is built
// to fire in rapid succession, so a whole crawling line reads as a light chatter
// under the thumb instead of a row of hard knocks — and it isn't throttled away
// the way a burst of repeated impacts is. Pulses at/under this stay subtle;
// heavier pulses (menu tap and up) keep their weighted impact.
const SELECTION_MAX_MS = 8;

/** Map one pulse's duration (ms) to a Taptic impact weight. The thresholds
 * mirror the game's own vocabulary: a ~10–15ms tick (menu press, light graze)
 * is a light flick, a ~28ms tap (equip) is medium, and anything heavier (a big
 * hit, the death rumble) is a heavy hit. Pulses at/under SELECTION_MAX_MS never
 * reach here — they fire selection feedback instead. */
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

/** Fire one subtle selection tick now (the typewriter's per-letter cue), same
 * error-swallowing contract as `impact`. */
function selection(): void {
  Haptics.selectionAsync().catch(() => {});
}

/** The cue for one "on" span of duration `ms`: a gentle selection tick for the
 * shortest pulses, a weighted impact for everything heavier. */
function buzzFor(ms: number): () => void {
  if (ms <= SELECTION_MAX_MS) return selection;
  const style = styleForDuration(ms);
  return () => impact(style);
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
      const buzz = buzzFor(on);
      if (offset === 0) {
        buzz(); // fire the first pulse immediately for zero latency
      } else {
        pending.push(setTimeout(buzz, offset));
      }
    }
    const off = Number(spans[i + 1]) || 0;
    offset += on + off;
  }
}
