// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The KILL RATE window — the leaderboard metric that ranks killing the hero
// SUSTAINED, not a lucky moment. These pin the two rules that make it worth
// ranking: nothing scores until a full ten minutes of combat clock is behind
// it, and what scores is the rate across that whole window rather than the
// best burst inside it. Plain Node — the window is pure arithmetic over a
// clock the caller supplies.

import { describe, expect, it } from "vitest";

import {
  createKillRateWindow,
  KILL_RATE_WINDOW_MS,
} from "../pwa/src/game/kill-rate.ts";

/** Walk the combat clock forward in ten-second steps, booking `killsPerStep`
 * at each, and return the last rate the window reported. */
function run(steps: number, killsPerStep: number, startMs = 0): number {
  const window = createKillRateWindow();
  let rate = 0;
  for (let i = 0; i < steps; i++) {
    rate = window.note(startMs + i * 10_000, killsPerStep);
  }
  return rate;
}

describe("kill rate window", () => {
  it("reports nothing until a full window of combat clock has passed", () => {
    const window = createKillRateWindow();
    // A massacre inside the first nine minutes still scores zero: a rate
    // measured over less than the window is not the thing being ranked.
    let rate = 0;
    for (let ms = 0; ms < KILL_RATE_WINDOW_MS; ms += 10_000) {
      rate = window.note(ms, 100);
    }
    expect(rate).toBe(0);
  });

  it("reports the rate across the whole window once it is full", () => {
    // 61 ten-second steps = the window plus the partial bucket that opens the
    // next one. Six hundred kills over ten minutes is 60 per minute.
    const rate = run(61, 10);
    expect(rate).toBeCloseTo(60, 6);
  });

  it("does not let a burst outlive the window that held it", () => {
    const window = createKillRateWindow();
    // Ten minutes of slaughter…
    let rate = 0;
    for (let ms = 0; ms <= KILL_RATE_WINDOW_MS; ms += 10_000) {
      rate = window.note(ms, 10);
    }
    expect(rate).toBeCloseTo(60, 6);
    // …then idle until every one of those kills has aged out (a bucket past
    // two windows — the last kills landed one bucket INTO the second window,
    // and a kill exactly one window old is still inside it). The rate falls
    // back to nothing rather than standing as a permanent high-water mark
    // inside the window: the LEDGER keeps the high-water mark, the window
    // only ever reports what is true right now.
    for (
      let ms = KILL_RATE_WINDOW_MS;
      ms <= KILL_RATE_WINDOW_MS * 2 + 20_000;
      ms += 10_000
    ) {
      rate = window.note(ms, 0);
    }
    expect(rate).toBe(0);
  });

  it("excludes the partial bucket it is still filling", () => {
    // Kills land ONLY in the bucket that opens right after a full window has
    // elapsed. That bucket is the partial one, so it must not be counted —
    // counting it would divide a bucket's kills by a full window's time.
    const window = createKillRateWindow();
    for (let ms = 0; ms < KILL_RATE_WINDOW_MS; ms += 10_000) {
      window.note(ms, 0);
    }
    expect(window.note(KILL_RATE_WINDOW_MS, 500)).toBe(0);
  });

  it("survives a jump in the clock without counting stale buckets", () => {
    const window = createKillRateWindow();
    // A full window of steady killing, then the clock leaps an hour (a long
    // pause, a cutscene, a sim the app froze). The buckets behind the leap are
    // out of the window and must not be summed into the rate at the far side
    // — the ring is re-used, so this is the case a naive index wraps into.
    for (let ms = 0; ms <= KILL_RATE_WINDOW_MS; ms += 10_000) {
      window.note(ms, 20);
    }
    const after = window.note(KILL_RATE_WINDOW_MS + 3_600_000, 0);
    expect(after).toBe(0);
  });

  it("counts a run whose combat clock does not start at zero", () => {
    // The clock the window reads is the run's, and a run only starts banking
    // combat time when the first foe appears — so a window opened at minute
    // seven must still measure ten minutes from THERE.
    expect(run(61, 10, 420_000)).toBeCloseTo(60, 6);
  });
});
