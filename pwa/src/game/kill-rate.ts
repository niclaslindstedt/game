// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE KILL RATE WINDOW — how fast the hero fells the horde, SUSTAINED.
//
// A plain kills-per-minute figure is won by a moment: walk into one dense knot
// with a nuke banked and thirty kills land in four seconds, which divides out
// to a rate no player could hold for a minute, let alone a mission. So the
// leaderboard metric is the best rate the hero ever held across a FULL TEN
// MINUTES — long enough that it can only be earned by keeping the pressure up
// through several fights, a re-arm, and whatever the menace ratchet answers
// with.
//
// The clock is the engine's COMBAT clock (`GameStats.combatMs`), not wall time
// or the run timer: it accrues only while a fight is live (see the field's docs
// in types/events.ts), so standing in a cleared field cannot dilute a rate, and
// a player who reads a dialogue box mid-run is not punished for it. It is the
// same farm-proof clock the high-score board banks survival time on.
//
// Counting is BUCKETED rather than a list of kill timestamps: a ring of
// ten-second tallies is O(1) per kill and constant memory whatever the horde
// does, where a timestamp list on a heavy run would grow to thousands of
// entries and be re-scanned every tick.

/** The window a rate must be held across to count (ms of COMBAT clock). */
export const KILL_RATE_WINDOW_MS = 10 * 60_000;

/** Resolution of the ring — a tally per ten seconds of combat clock. */
const BUCKET_MS = 10_000;

/** Ten-second buckets spanning the window. */
const BUCKETS = KILL_RATE_WINDOW_MS / BUCKET_MS;

/** One slot MORE than the window holds: the bucket being filled right now is
 * partial, so it is excluded from the sum, and it must not evict the oldest
 * bucket the sum still needs. */
const SLOTS = BUCKETS + 1;

/** Minutes the window spans — the divisor turning its tally into a rate. */
const WINDOW_MINUTES = KILL_RATE_WINDOW_MS / 60_000;

export type KillRateWindow = {
  /**
   * Book `kills` landed at `combatMs` on the run's combat clock, and report
   * the rate (kills per minute) the hero is holding across the whole window
   * right now — or 0 while the window has yet to fill, because a rate measured
   * over less than ten minutes is not the thing being ranked.
   */
  note(combatMs: number, kills: number): number;
};

/**
 * A fresh window for one run. The combat clock restarts with the run, so the
 * window does too: a rate is something held within a single mission, not
 * stitched together across a menu visit.
 */
export function createKillRateWindow(): KillRateWindow {
  // Tally per slot, and WHICH bucket each slot currently holds. The stamp is
  // what makes a jump in the clock safe: a slot whose stamp has fallen out of
  // the window is simply not counted, so no bookkeeping has to chase a gap
  // (a paused sim, a long cutscene) and clear the slots it skipped.
  const counts = new Int32Array(SLOTS);
  const stamps = new Int32Array(SLOTS).fill(-1);
  /** The first bucket ever booked — the window is full `BUCKETS` after it. */
  let first = -1;

  return {
    note(combatMs: number, kills: number): number {
      const bucket = Math.floor(Math.max(0, combatMs) / BUCKET_MS);
      if (first < 0) first = bucket;
      if (kills > 0) {
        const slot = bucket % SLOTS;
        // Re-used slot from a window ago — its old tally is expired, not ours.
        // (The `?? 0` is the type checker's due on an indexed read, not a real
        // case: `bucket % SLOTS` is in range by construction.)
        const carried = stamps[slot] === bucket ? (counts[slot] ?? 0) : 0;
        stamps[slot] = bucket;
        counts[slot] = carried + kills;
      }
      // Not yet ten minutes of combat: there is no sustained rate to report.
      if (bucket - first < BUCKETS) return 0;
      // Sum the last BUCKETS COMPLETED buckets — exactly one window of elapsed
      // clock. The current bucket is excluded deliberately: it is a fraction of
      // ten seconds old, and counting it would divide a full window's kills by
      // slightly less than a full window's time, flattering every score.
      const oldest = bucket - BUCKETS;
      let sum = 0;
      for (let slot = 0; slot < SLOTS; slot++) {
        const stamp = stamps[slot] ?? -1;
        if (stamp >= oldest && stamp < bucket) sum += counts[slot] ?? 0;
      }
      return sum / WINDOW_MINUTES;
    },
  };
}
