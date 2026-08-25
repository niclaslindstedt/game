// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THE TRIP WAS WORTH — the flight's arcade score, and the tally the
// high-score screen prints on the way to it.
//
// IN THE ENGINE, beside the sim, for the drive's two reasons: a headless
// flight (a balance pass, a soak) can ask what a trip was worth without a
// renderer, and the tests pin the arithmetic without mounting a screen. The
// app half is only the BOARD — where the number is kept and how it is entered
// (`pwa/src/game/rocket-scores.ts`).
//
// THE JOKE ON THIS CARD is the trash line: the card counts every bag of
// GOODCO's garbage that took a swing at the ship on the way up, and pays
// nothing for any of it — the company's disposal business is on the
// scoreboard the way the drive's body count is, itemised and worthless.

import { FLIGHT, flightCoursePx } from "./config.ts";
import { landingGates } from "./field.ts";
import type { FlightLeg, FlightState } from "./types.ts";

/**
 * The tally, itemised — every line the results card prints, plus the trip's
 * own numbers behind them. Carried rather than recomputed by the screen,
 * because an arcade end-of-game card counts its bonuses up one at a time.
 */
export type FlightScorecard = {
  /** The number that goes on the board: the sum, floored at zero and rounded
   * to `FLIGHT.score.round`. */
  score: number;

  // ── WHAT IT IS MADE OF ────────────────────────────────────────────────────
  /** Flat, for getting there at all. */
  arrival: number;
  /** Per second under par. Zero for a trip that took longer. */
  time: number;
  /** For the fastest the ship climbed. */
  speed: number;
  /** For the skin the ship reached orbit with. */
  hull: number;
  /** For how gently the pads met the ground, plus the marked pad's flat. */
  touchdown: number;

  // ── AND WHAT THE TRIP ACTUALLY WAS ────────────────────────────────────────
  /** The trip time (ms) — climb and drop together, crashes included. */
  ms: number;
  /** Par for this sky's height (ms). */
  parMs: number;
  /** The fastest it went, in the unit the dashboard says out loud. */
  topSpeedMph: number;
  /** How much of the ship arrived in orbit, 0–100. */
  hullPercent: number;
  /** How hard the module met the moon (px/s). */
  touchdownVy: number;
  /** …and whether it was the marked pad. */
  onPad: boolean;
  /** GOODCO's garbage, met hull-first on the way up. ON THE CARD AND WORTH
   * NOTHING — see the header. */
  trash: number;
  /** The sky's soft bodies met on the way up — birds, hobbyists. Itemised
   * beside the trash, and worth exactly as much. */
  bodies: number;
};

/**
 * Par for a sky of this height (ms) — the climb at `parSpeedPx` plus the
 * landing's own fixed share. Derived from the course rather than pinned, so
 * the attract loop's short sky is scored against its own height — and a
 * LANDING leg is measured against the drop alone: there was no climb to be
 * quick on.
 */
export function flightPar(params: {
  coursePx?: number;
  leg?: FlightLeg;
}): number {
  const S = FLIGHT.score;
  if (params.leg === "landing") return S.landingParMs;
  return (flightCoursePx(params) / S.parSpeedPx) * 1000 + S.landingParMs;
}

/** How long the trip has actually taken (ms) — the stopwatch in the corner,
 * which survives the drop from orbit and every crashed module. */
export function flightTripMs(state: FlightState): number {
  return Math.max(0, state.clockMs);
}

/**
 * WHAT THIS TRIP WAS WORTH, itemised. Called once, on a landed flight, and it
 * spends no `state.rng()` draw — the same rule everything in this sky obeys.
 */
export function flightScore(state: FlightState): FlightScorecard {
  const S = FLIGHT.score;
  const parMs = flightPar(state.params);
  const tripMs = flightTripMs(state);
  // Floored at zero: par is a bonus a hot pilot earns, never a fine a careful
  // one pays.
  const underS = Math.max(0, (parMs - tripMs) / 1000);
  // The tally is already the dial's own mph (`state.topSpeed`), pegged here
  // exactly as the dashboard pegs it: past orbital speed a bonus that kept
  // growing would make the clear stretch worth more than the game.
  const topSpeedMph = Math.min(FLIGHT.orbitalMph, Math.round(state.topSpeed));
  const intact = Math.max(0, Math.min(1, state.hullAtOrbit));
  // A feather is the whole bonus, the legal limit is none of it — the RUNG's
  // limit (`landingGates`), so "gentle" means the same fraction of what was
  // ASKED on every rung rather than being free on the loose ones.
  const gentle = Math.max(
    0,
    1 - state.touchdownVy / landingGates(state.params.difficulty).vyPx,
  );

  const arrival = S.arrival;
  const time = Math.round(underS * S.perSecondUnderPar);
  const speed = Math.round(topSpeedMph * S.perTopMph);
  const hull = Math.round(intact * S.hull);
  const touchdown =
    Math.round(gentle * S.touchdown) + (state.touchdownPad ? S.pad : 0);

  const raw = arrival + time + speed + hull + touchdown;
  const score = Math.max(0, Math.round(raw / S.round) * S.round);

  return {
    score,
    arrival,
    time,
    speed,
    hull,
    touchdown,
    ms: tripMs,
    parMs,
    topSpeedMph,
    hullPercent: Math.round(intact * 100),
    touchdownVy: Math.round(state.touchdownVy),
    onPad: state.touchdownPad,
    trash: state.trashCount,
    bodies: state.softHits,
  };
}
