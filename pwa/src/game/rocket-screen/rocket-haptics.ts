// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THE STICK FEELS — the flight's vibration, through the app's one motor
// (`../haptics.ts`), with the rules that are the flight's own kept here.
//
// ONE BUZZ PER TICK, FOR THE HARDEST THING IN IT — the drive's funnel rule: a
// chain of satellites going up is a sight, not a drumroll, so the tick's worst
// event buzzes and the rest are heard instead.

import { FLIGHT, type FlightState } from "@game/core";

import { haptics } from "../haptics.ts";

/** The last buzz's clock — a floor between pulses so a bad second reads as
 * impacts rather than as a motor left on. */
let lastBuzzMs = -1e9;
const BUZZ_GAP_MS = 120;

export function resetFlightHaptics(): void {
  lastBuzzMs = -1e9;
}

/** How hard one event is under the thumb, 0–1. */
function forceOf(event: FlightState["events"][number]): number {
  switch (event.type) {
    case "explosion":
      return event.size === "big" ? 1 : 0.55;
    case "strike":
      return 0.4;
    case "stuck":
      return 0.15;
    case "touchdown":
      return 0.35;
    case "warning":
      return 0.2;
    default:
      return 0;
  }
}

/** Read the tick's events and buzz once for the worst of them. Called after
 * the drain, never on an unattended flight. */
export function feelFlight(flight: FlightState): void {
  if (!haptics.active) return;
  let hardest = 0;
  for (const event of flight.events) {
    hardest = Math.max(hardest, forceOf(event));
  }
  if (hardest <= 0) return;
  if (flight.ms - lastBuzzMs < BUZZ_GAP_MS) return;
  lastBuzzMs = flight.ms;
  const on = Math.round(20 + hardest * 60);
  if (hardest >= 1) {
    // The ship going up: three pulses, falling away — wreckage settling.
    haptics.vibrate([on, 40, Math.round(on * 0.7), 45, Math.round(on * 0.4)]);
  } else if (hardest >= 0.5) {
    haptics.vibrate([on, 32, Math.round(on * 0.5)]);
  } else {
    haptics.vibrate(on);
  }
}

/** …and the one continuous feel the flight has: a faint tick while the
 * boosters are open, on its own slow cadence — the engine under the floor.
 * Returns the next tick's due time; the caller keeps the clock. */
export function feelBoost(nowMs: number, dueMs: number): number {
  if (!haptics.active) return nowMs + FLIGHT.opening.handsOffMs;
  if (nowMs < dueMs) return dueMs;
  haptics.vibrate(8);
  return nowMs + 260;
}
