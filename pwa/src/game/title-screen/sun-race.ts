// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CLICK RACE — the second half of the hidden developer gesture, and the
// half that actually costs something.
//
// Sixteen quick taps on the title sun no longer unlock anything; they ARM this.
// From there the star has to be held at TEMPO: a press at least every
// `RACE_BEAT_MS`, sustained for `RACE_HOLD_MS` of banked on-beat time. Fall
// behind and the bank DRAINS, at `RACE_DECAY`× the rate it filled — so a slip
// costs more than it saves and a half-hearted mash never converges. Reach the
// top and the star lets go.
//
// The rule is a pure function over a clock for one reason: the whole feature is
// a curve the player feels rather than sees, and a curve that only exists
// inside a rAF loop can neither be reasoned about nor tested. The hook
// (use-sun-charge.ts) owns the presses, the frames and the pixels; everything
// about WHAT THE RACE IS lives here.

/** The beat: the longest gap between presses that still counts as on tempo.
 * Four presses a second — fast enough to be a race on a phone, slow enough to
 * be sustainable for the five seconds the star wants. Pressing FASTER is free:
 * the bank fills with real time, not with presses, so mashing buys nothing
 * beyond never missing the beat. */
export const RACE_BEAT_MS = 250;

/** On-tempo time that has to be banked before the star lets go. */
export const RACE_HOLD_MS = 5000;

/** How much faster the bank drains off tempo than it fills on it. Above 1 on
 * purpose: at parity the race would be a pure endurance test you could pause in
 * the middle of, and the whole point is that losing the beat SETS YOU BACK. */
export const RACE_DECAY = 1.5;

/** How long the race may sit at empty before it gives up and the gesture falls
 * back to the tap count. Not zero: a player who fumbles one beat at the very
 * start would otherwise be thrown out before their next press lands. */
export const RACE_LAPSE_MS = 1200;

/** Largest frame step the race will honour, ms. A backgrounded tab hands the
 * next rAF a gap of seconds; billed straight in, it would drain a nearly-won
 * race to nothing while the player was looking at another window. */
export const RACE_MAX_STEP_MS = 100;

/** The race, as of one instant. */
export interface SunRace {
  /** On-tempo time banked so far, ms, clamped to [0, RACE_HOLD_MS]. */
  heldMs: number;
  /** When the last press landed, on the same clock the ticks are stamped in. */
  lastPressMs: number;
  /** How long the bank has been sitting at empty — the lapse counter. */
  emptyMs: number;
}

/** Arm the race. The press that armed it IS the first beat, so the player is
 * already on tempo and the bank starts filling with the very next frame — a
 * race that began off-beat would spend its first 250 ms draining. */
export function startRace(nowMs: number): SunRace {
  return { heldMs: 0, lastPressMs: nowMs, emptyMs: 0 };
}

/** A press landed. Nothing but the beat clock moves: the bank is filled by
 * TIME, so a press is a promise about the next 250 ms rather than a deposit. */
export function pressRace(race: SunRace, nowMs: number): SunRace {
  return { ...race, lastPressMs: nowMs };
}

/** Is the star still being fed? True for `RACE_BEAT_MS` after each press. */
export function onTempo(race: SunRace, nowMs: number): boolean {
  return nowMs - race.lastPressMs <= RACE_BEAT_MS;
}

/** Advance the race by one frame. `dtMs` is billed at the fill rate while the
 * beat is being kept and at `RACE_DECAY`× that rate while it is not. */
export function tickRace(race: SunRace, nowMs: number, dtMs: number): SunRace {
  const step = Math.max(0, Math.min(RACE_MAX_STEP_MS, dtMs));
  const keeping = onTempo(race, nowMs);
  const heldMs = Math.max(
    0,
    Math.min(RACE_HOLD_MS, race.heldMs + (keeping ? step : -step * RACE_DECAY)),
  );
  // The lapse counter only runs once the bank is spent AND the beat is gone —
  // a player still pressing is still racing, however little they have banked.
  const emptyMs = heldMs > 0 || keeping ? 0 : race.emptyMs + step;
  return { heldMs, lastPressMs: race.lastPressMs, emptyMs };
}

/** How far up the star is, 0..1 — the ONE ramp the sun's size, its heat and the
 * race's rising tick all read. */
export function raceProgress(race: SunRace): number {
  return race.heldMs / RACE_HOLD_MS;
}

/** The tempo was held long enough: the star lets go. */
export function raceWon(race: SunRace): boolean {
  return race.heldMs >= RACE_HOLD_MS;
}

/** Spent and abandoned: the star cools and the gesture rearms at the taps. */
export function raceLapsed(race: SunRace): boolean {
  return race.emptyMs >= RACE_LAPSE_MS;
}
