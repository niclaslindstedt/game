// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CLICK RACE — the second movement of the hidden developer gesture.
//
// What is pinned here is the PROMISE the race makes, not its pixels: the bank
// fills with real time while the 250 ms beat is kept, drains half again as fast
// when it is dropped, tops out at five banked seconds, and gives up only after
// sitting empty. The rule is a pure function over a clock precisely so it can be
// stated here instead of only existing inside a rAF loop.

import { describe, expect, it } from "vitest";

import {
  onTempo,
  pressRace,
  RACE_BEAT_MS,
  RACE_DECAY,
  RACE_HOLD_MS,
  RACE_LAPSE_MS,
  RACE_MAX_STEP_MS,
  raceLapsed,
  raceProgress,
  raceWon,
  startRace,
  tickRace,
  type SunRace,
} from "../pwa/src/game/title-screen/sun-race.ts";

/** One frame at 60 Hz — the loop's real step. */
const FRAME_MS = 1000 / 60;

/** A player at the sun: the race, the clock, and when their next press is due.
 * The press schedule is CARRIED between stretches — restarting it at each call
 * would silently drop a beat at every boundary and make a chained hold read as
 * a slip. */
interface Player {
  race: SunRace;
  nowMs: number;
  nextPressMs: number;
}

/** Sit the player down at an armed star. */
function arm(atMs = 0): Player {
  return {
    race: startRace(atMs),
    nowMs: atMs,
    nextPressMs: atMs + HOLD_GAP_MS,
  };
}

/** The gap a player holding tempo presses at — a shade INSIDE the beat, since
 * pressing at exactly 250 ms is the knife edge and says nothing useful. */
const HOLD_GAP_MS = RACE_BEAT_MS - 30;

/** Play `ms` of race at 60 Hz, pressing every `gapMs` (never, if omitted). */
function play(p: Player, ms: number, gapMs?: number): Player {
  let { nowMs: now, race } = p;
  const end = now + ms;
  let nextPress = gapMs === undefined ? Infinity : p.nextPressMs;
  while (now < end - 1e-9) {
    const step = Math.min(FRAME_MS, end - now);
    now += step;
    if (now >= nextPress) {
      race = pressRace(race, now);
      nextPress = now + gapMs!;
    }
    race = tickRace(race, now, step);
  }
  return { race, nowMs: now, nextPressMs: nextPress };
}

/** Hold the tempo for `ms`. A player picking the beat back up after a slip
 * PRESSES as they resume, so a recovery starts banking immediately rather than
 * paying another beat's drain for the gap before their first press. */
function hold(p: Player, ms: number): Player {
  const due = onTempo(p.race, p.nowMs)
    ? Math.min(p.nextPressMs, p.nowMs + HOLD_GAP_MS)
    : p.nowMs;
  return play({ ...p, nextPressMs: due }, ms, HOLD_GAP_MS);
}

/** Drop the beat for `ms`, from this instant — the last press is backdated past
 * the beat so the whole stretch drains, rather than the first quarter-second
 * riding the grace the previous press bought. */
function slip(p: Player, ms: number): Player {
  const cold = pressRace(p.race, p.nowMs - RACE_BEAT_MS - 1);
  return play({ race: cold, nowMs: p.nowMs, nextPressMs: Infinity }, ms);
}

describe("the beat", () => {
  it("holds tempo for the whole beat after a press, and no longer", () => {
    const race = startRace(1000);
    expect(onTempo(race, 1000)).toBe(true);
    expect(onTempo(race, 1000 + RACE_BEAT_MS)).toBe(true);
    expect(onTempo(race, 1000 + RACE_BEAT_MS + 1)).toBe(false);
    // A late press picks the tempo straight back up — that is what makes a
    // recovery possible at all.
    expect(onTempo(pressRace(race, 4000), 4000)).toBe(true);
  });

  it("arms already on tempo, so the opening beat is not spent waiting", () => {
    // The tap that armed the race IS its first beat: the very next frame banks.
    const armed = startRace(0);
    const after = tickRace(armed, FRAME_MS, FRAME_MS);
    expect(after.heldMs).toBeCloseTo(FRAME_MS, 6);
  });
});

describe("the bank", () => {
  it("fills with real time, not with presses", () => {
    // Two players, one pressing at the beat and one hammering four times as
    // fast, bank the SAME second — the race is a tempo to hold, not a number
    // to game.
    const steady = hold(arm(), 1000).race;
    const masher = play(arm(), 1000, FRAME_MS);
    expect(steady.heldMs).toBeCloseTo(1000, 0);
    expect(masher.race.heldMs).toBeCloseTo(1000, 0);
  });

  it("banks the whole beat a press buys, then starts to drain", () => {
    // A press is a promise about the next 250 ms: stop dead after one and the
    // bank still fills for the rest of the beat before it turns over.
    const grace = play(arm(), RACE_BEAT_MS, undefined);
    expect(grace.race.heldMs).toBeCloseTo(RACE_BEAT_MS, 0);
    const after = play(grace, 100);
    expect(after.race.heldMs).toBeCloseTo(RACE_BEAT_MS - 100 * RACE_DECAY, 0);
  });

  it("drains at 1.5x the fill rate once the beat is dropped", () => {
    const banked = hold(arm(), 2000);
    expect(banked.race.heldMs).toBeCloseTo(2000, 0);
    const dropped = slip(banked, 1000);
    // A second off costs a second and a half of bank.
    expect(dropped.race.heldMs).toBeCloseTo(2000 - 1000 * RACE_DECAY, 0);
  });

  it("costs more to slip than it saves — a recovery owes the difference", () => {
    // The shape the whole feature turns on: four seconds banked, one dropped,
    // and the player is 2.5 s along rather than 4 — so 2.5 s of tempo are owed,
    // not the 1 s they lost.
    const banked = hold(arm(), 4000);
    const dropped = slip(banked, 1000);
    expect(dropped.race.heldMs).toBeCloseTo(2500, 0);
    const short = hold(dropped, 1500);
    expect(raceWon(short.race)).toBe(false);
    const enough = hold(short, 1100);
    expect(raceWon(enough.race)).toBe(true);
  });

  it("never banks past the top or drains past empty", () => {
    const over = hold(arm(), RACE_HOLD_MS * 2);
    expect(over.race.heldMs).toBe(RACE_HOLD_MS);
    expect(raceProgress(over.race)).toBe(1);
    const under = slip(arm(), 10_000);
    expect(under.race.heldMs).toBe(0);
    expect(raceProgress(under.race)).toBe(0);
  });

  it("ignores the gap a backgrounded tab hands the next frame", () => {
    // Billed straight in, a multi-second rAF gap would drain a nearly-won race
    // to nothing while the player was looking at another window.
    const banked = hold(arm(), 4500);
    const jumped = tickRace(banked.race, banked.nowMs + 30_000, 30_000);
    expect(jumped.heldMs).toBeCloseTo(4500 - RACE_MAX_STEP_MS * RACE_DECAY, 0);
  });
});

describe("winning and lapsing", () => {
  it("lets go at exactly five banked seconds of tempo", () => {
    const almost = hold(arm(), RACE_HOLD_MS - 200);
    expect(raceWon(almost.race)).toBe(false);
    expect(raceWon(hold(almost, 300).race)).toBe(true);
  });

  it("gives up only after sitting EMPTY, never merely on a dropped beat", () => {
    const banked = hold(arm(), 3000);
    // Long enough off tempo to have lost the beat, nowhere near empty.
    const slipping = slip(banked, 800);
    expect(slipping.race.heldMs).toBeGreaterThan(0);
    expect(raceLapsed(slipping.race)).toBe(false);
    // Drained, but the lapse counter has only just started.
    const drained = play(slipping, 1400);
    expect(drained.race.heldMs).toBe(0);
    expect(raceLapsed(drained.race)).toBe(false);
    expect(raceLapsed(play(drained, RACE_LAPSE_MS).race)).toBe(true);
  });

  it("does not lapse under a player who is still pressing but has nothing banked", () => {
    // A fumbled opening must not throw the player out before their next press
    // lands: the counter runs only when the bank is spent AND the beat is gone.
    const empty = slip(arm(), 2000);
    expect(empty.race.heldMs).toBe(0);
    const pressing = hold(empty, RACE_LAPSE_MS * 2);
    expect(raceLapsed(pressing.race)).toBe(false);
    expect(pressing.race.heldMs).toBeGreaterThan(0);
  });
});
