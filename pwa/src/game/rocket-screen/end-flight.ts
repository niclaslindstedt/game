// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE THREE TERMINAL BEATS OF A FLIGHT — the wreck's restart, the orbit's
// hand-over to the drop, and the landing's crossing.
//
// POLICY, NOT PICTURE, in a plain module for the drive's reason
// (`drive-screen/end-drive.ts`): the drain is what a tick looks and sounds
// like and every host runs it unchanged; what happens AFTER a terminal beat is
// the SCREEN's answer, and a `.tsx` cannot carry a function the root test
// suite wants to pin.

import {
  FLIGHT,
  FLIGHT_OUTCOME,
  beginDescent,
  restartFlight,
  type FlightState,
} from "@game/core";

import { clearRocketFx, type RocketFxState } from "./rocket-fx.ts";
import { createFlightBeats, type FlightBeats } from "./loop.ts";

/**
 * A WRECK puts the player back at the top of the half that killed them (the
 * engine's own restart rule); ORBIT, held for its whole sequence (the settle,
 * the float, the separation, the departure), hands to the screen — the cabin
 * scenes and the landing's briefing sit between orbit and the drop, and a
 * plain module cannot mount them — falling back to the drop directly for a
 * host with no hands to watch them (`auto`); a LANDING hands the crossing
 * back to the screen.
 */
export function endFlight(
  flight: FlightState,
  fx: RocketFxState,
  beats: FlightBeats,
  /** Take the speech box away — a line about a ship that no longer exists must
   * not sit over the fresh one. */
  clearSpeech: () => void,
  /** What the landing hands the flight to — the screen's own `arrive`, where
   * the choice between the high-score board and a silent crossing is made. */
  onLanded: (flight: FlightState) => void,
  /** The orbit hold has run out — the screen decides what stands between the
   * climb and the drop. Absent, the drop begins directly. */
  onOrbitHeld?: () => void,
): void {
  if (
    flight.outcome === FLIGHT_OUTCOME.wrecked &&
    flight.outcomeMs > FLIGHT.wreckHoldMs
  ) {
    const wasLanding = flight.phase === "landing";
    Object.assign(flight, restartFlight(flight));
    clearSpeech();
    clearRocketFx(fx);
    // The climb's one-shot lines replay with the climb; the drop's with the
    // drop. A restart that kept the latches would fly its second attempt in
    // silence, and one that dropped the wrong ones would repeat the monologue
    // over a drop.
    const fresh = createFlightBeats();
    if (wasLanding) {
      fresh.monologueSaid = true;
      fresh.clearSaid = true;
    }
    Object.assign(beats, fresh);
  }
  if (
    flight.outcome === FLIGHT_OUTCOME.toOrbit &&
    flight.outcomeMs > FLIGHT.orbitHoldMs
  ) {
    clearSpeech();
    if (onOrbitHeld) {
      // The screen parks the sky (synchronously — the loop re-reads its refs
      // every step) and shows the cabin; the fx are cleared when the drop
      // actually begins, so the departing stage is not blinked away.
      onOrbitHeld();
    } else {
      beginDescent(flight);
      clearRocketFx(fx);
    }
  }
  if (
    flight.outcome === FLIGHT_OUTCOME.landed &&
    flight.outcomeMs > FLIGHT.landedHoldMs
  ) {
    onLanded(flight);
  }
}
