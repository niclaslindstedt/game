// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE WALK TO THE WAGON — what a venue you leave BY CAR does between the player
// choosing to move on and the road picking the car up (`LevelDef.exitByCar`,
// and `BoardingState` in types/state.ts for the shape).
//
// WHY IT IS A CUT RATHER THAN A WALK. The wagon is parked where the hero
// arrived; the boss falls wherever the carve put him. Left to itself that is a
// minute of walking back across a floor with nothing on it, at the exact moment
// the player has been told the mission is over — and a player who has not
// worked out that the car is the door just stands there. So the picture goes
// dark on the boss room, the man is put down a short walk off his own bumper,
// the picture comes back, and he walks the last few paces and gets in. The
// player sees the thing the story says happens, and never has to find it.
//
// THE LAST FEW PACES ARE THE POINT, and the reason he is not simply put in the
// driver's seat. A cut straight to a car already pulling away is a loading
// screen with a car in it; a man crossing tarmac to a wagon with his own dents
// in it is the trip home starting. It costs about two seconds.
//
// IT IS ENGINE-OWNED, clock and all, for `DepartureState`'s reason one beat
// earlier: the simulation is what knows where the car is standing and when the
// man reaches it, so the beat stays deterministic, replicable and
// headless-testable, and the app paints what the clock says.
//
// AND IT SPENDS NOTHING OFF `state.rng`. Where a man is put down beside his own
// car is presentation, and the drop ladder's draws are load-bearing — see
// `arrival-plan.ts`, which parks a whole car park under the same rule.

import {
  direction,
  distance,
  moveToward,
  vec,
  type Vec2,
} from "@game/lib/vec.ts";

import { PLAYER } from "./config/index.ts";
import { runLevelDef } from "./defs/levels/index.ts";
import { blockedByObstacle, insideObstacle } from "./obstacles.ts";
import { startPlayerThought } from "./story.ts";
import type { CarVehicle, GameState, Player } from "./types/index.ts";
import { CAR, enterCar } from "./vehicles.ts";

export const BOARDING = {
  /** How long the picture takes to go dark on the boss room (ms). A shade
   * longer than the departure's own dim: this one is a scene change rather
   * than a handover, and a cut the player can feel is a cut they read as
   * deliberate. */
  cutMs: 420,
  /**
   * HOW LONG IT STAYS AT FULL BLACK (ms) — the stretch the man is actually
   * moved in, and it is a correctness margin rather than a beat.
   *
   * The picture is painted off the same clock the move happens on, but not on
   * the same schedule: a dropped frame lands the next paint some way past the
   * instant the curtain peaks, and with the lift starting there that paint is
   * already partly transparent — which is a hero popping across the level in
   * plain sight. A hold wide enough to swallow a bad frame costs an eighth of a
   * second and makes that impossible instead of unlikely.
   */
  holdMs: 140,
  /** …and how long it takes to come back up on the lot (ms). Longer than the
   * way down, because what is being revealed is WHERE HE IS, and a reveal
   * that snaps reads as a teleport. */
  liftMs: 520,
  /**
   * HOW FAR OFF THE WAGON HE IS PUT DOWN (world px).
   *
   * Read against the reference viewport — ~422x260 world units — and against
   * `CAR.boardRadius` (44), which is where the walk ends. This puts the car
   * comfortably inside the frame when the black lifts, about two seconds of
   * walking away: far enough that he is plainly WALKING TO something, near
   * enough that nobody wonders whether they have been given the controls back.
   */
  standOffPx: 104,
  /** How fast he covers it (px/s). Under his own top speed (`PLAYER.speed`,
   * 84) and a shade over an arriving staffer's (`ARRIVALS.walkSpeed`, 48):
   * a man walking to his car at the end of a shift, not a man running. */
  walkSpeed: 54,
  /**
   * THE BEAT MAY NEVER STOP HAPPENING (ms), the arrivals rule again. Something
   * standing between him and the bumper — a crate the carve dropped, a body,
   * a wagon nudged since he parked — must not be able to strand a cleared run
   * on a floor with no other way off it. Past this he gets in from wherever he
   * has got to.
   */
  giveUpMs: 6000,
} as const;

/** How many bearings are tried when looking for somewhere to put him down. */
const STAND_OFF_BEARINGS = 16;

/**
 * THE PLAYER HAS CHOSEN TO MOVE ON, AND THIS VENUE'S WAY OUT IS THE CAR — cut
 * to the lot and start the walk.
 *
 * `to` is where the NIGHT goes, which is not where the road ends: the wagon
 * drives home whatever venue the campaign has next, so the destination travels
 * on the beat and is booked onto the departure when he gets in (`leaveByCar`).
 *
 * Returns whether the beat took the stage, so the caller keeps the plain
 * crossing for every venue that leaves any other way — and for this one when
 * there is no wagon left to leave in.
 */
export function departByCar(
  state: GameState,
  hero: Player,
  to: string,
): boolean {
  if (!runLevelDef(state).exitByCar || state.boarding) return false;
  // ONLY OFF THE SPLASH. This is the LEVEL CLEAR menu's own button, and the
  // menu is only up once the win is banked — so the phase IS the check, and it
  // is the one that keeps a verb which books a trip to a named level from being
  // a way to leave a venue whose boss is still standing. (A player who took
  // STAY re-opens the same menu from the boss corpse, so the press still
  // arrives here in `victory`.)
  if (state.phase !== "victory") return false;
  if (!boardableCar(state)) return false;
  const seat = state.players.indexOf(hero);
  if (seat < 0) return false;
  // The win is already banked (the `victory` event fired at the end of the
  // countdown), so this drops the run back onto its own field exactly as STAY
  // does — `staying` and all, which is what keeps the countdown from re-arming
  // over a still-cleared objective while the beat plays.
  state.phase = "playing";
  state.staying = true;
  state.victoryCountdownMs = null;
  state.boarding = { seat, to, ms: 0, staged: false };
  // Nobody watches a scene change through their own bag — the same drop every
  // other handover makes.
  for (const p of state.players) p.screen = undefined;
  // AND THE LINE IS THE BRIDGE INTO THE BEAT (`LevelDef.exitByCar.thought`) —
  // the one piece of dialogue in the game that is an instruction, said at the
  // moment the player has just asked for the thing it explains. It freezes the
  // run in the `dialogue` phase, which stalls this beat's own clock until it is
  // tapped through: the words are read over the room he is still standing in,
  // and the cut to the lot begins when he is done reading them.
  const thought = runLevelDef(state).exitByCar?.thought;
  if (thought) startPlayerThought(state, thought);
  return true;
}

/**
 * One tick of the beat. Runs from the step pipeline just ahead of the player
 * pass, so the fog lifts wherever he has just been put down and the seat's own
 * input is already being ignored by the time anything reads it.
 */
export function stepBoarding(state: GameState, dtMs: number): void {
  const beat = state.boarding;
  if (!beat) return;
  const hero = state.players[beat.seat];
  const car = boardableCar(state);
  // The wagon or the man has gone out from under the beat (a mod, a scenario,
  // a session that moved the seat). Hand the choice back rather than holding a
  // cleared run in a scene with no actors.
  if (!hero || !car) {
    state.boarding = null;
    state.phase = "victory";
    return;
  }
  beat.ms += dtMs;
  if (beat.ms < BOARDING.cutMs) return;
  if (!beat.staged) {
    beat.staged = true;
    const spot = standOffSpot(state, car);
    hero.pos.x = spot.x;
    hero.pos.y = spot.y;
    return;
  }
  // The black is holding, then lifting: he is standing on the tarmac being
  // revealed, which is the whole of what this stretch is for. He starts
  // walking when the picture is his again.
  if (beat.ms < BOARDING.cutMs + BOARDING.holdMs + BOARDING.liftMs) return;
  const late = beat.ms >= BOARDING.giveUpMs;
  if (distance(hero.pos, car.pos) > CAR.boardRadius && !late) {
    const step = moveToward(
      hero.pos,
      car.pos,
      (BOARDING.walkSpeed * dtMs) / 1000,
    );
    hero.pos.x = step.x;
    hero.pos.y = step.y;
    return;
  }
  if (late) {
    hero.pos.x = car.pos.x;
    hero.pos.y = car.pos.y;
  }
  // `enterCar` books the departure off this beat's own destination
  // (`leaveByCar`), so the beat is cleared only once it has actually taken.
  if (enterCar(state, hero)) state.boarding = null;
}

/** The wagon this venue is left in: parked, empty, and not already away. */
function boardableCar(state: GameState): CarVehicle | null {
  for (const vehicle of state.vehicles) {
    if (vehicle.kind !== "car") continue;
    if (vehicle.driver !== null || vehicle.departed) continue;
    return vehicle;
  }
  return null;
}

/**
 * WHERE HE IS PUT DOWN — `standOffPx` off the bumper, on the first bearing
 * with room for a man and a clear walk back to the car.
 *
 * Swept from BEHIND the wagon outwards, because that is where a lot leaves
 * room: a car is parked nose-in against something, and the ground it was
 * reversed over is the ground nothing else is standing on. Every candidate has
 * to hold a body AND be walkable to the door, or the beat spends its whole
 * clock pressed against a crate and gets in by the give-up rule instead.
 */
function standOffSpot(state: GameState, car: CarVehicle): Vec2 {
  const behind = car.heading + Math.PI;
  const margin = PLAYER.radius + 4;
  for (let i = 0; i < STAND_OFF_BEARINGS; i++) {
    // Alternate to either side of "behind" so the first acceptable bearing is
    // also the nearest one to it, rather than the first one going clockwise.
    const step = Math.ceil(i / 2) * ((2 * Math.PI) / STAND_OFF_BEARINGS);
    const angle = behind + (i % 2 === 0 ? step : -step);
    const spot = vec(
      car.pos.x + Math.cos(angle) * BOARDING.standOffPx,
      car.pos.y + Math.sin(angle) * BOARDING.standOffPx,
    );
    if (spot.x < margin || spot.x > state.level.width - margin) continue;
    if (spot.y < margin || spot.y > state.level.height - margin) continue;
    if (insideObstacle(state, spot, PLAYER.radius)) continue;
    if (blockedByObstacle(state, spot, car.pos, PLAYER.radius)) continue;
    return spot;
  }
  // Nowhere within a stand-off of the wagon will hold him — put him at the
  // door and let the beat be a shorter one. He still gets in.
  const away = direction(car.pos, vec(state.level.width / 2, car.pos.y));
  return vec(
    car.pos.x + away.x * CAR.boardRadius,
    car.pos.y + away.y * CAR.boardRadius,
  );
}
