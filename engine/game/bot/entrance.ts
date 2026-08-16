// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE AUTOPILOT ON THE WRONG SIDE OF THE DOOR — what the bot does while the
// staff lot's ENTRANCE is still shut (`LevelDef.arrivals`, `arrivals.ts`).
//
// It exists because the entrance is the one obstacle on any map in this game
// that no amount of competent play opens. Everything the travel ladder knows
// how to want — a knot to farm, a cache to crack, a fog frontier, the boss —
// is on the far side of a wall with a keyed door in it, and the key does not
// exist. Left to itself the bot reads "the objective is that way", finds no
// route, falls through to the fog sweep, exhausts the car park in twenty
// seconds and then spends the rest of the run pressing whichever wall is
// nearest the boss. (That failure is not hypothetical — it is exactly what the
// `noWayYet` gate in `macro.ts` was written for, and it cannot help here,
// because the way in is not a lift the search will eventually walk past. It
// opens on a timer nobody can influence.)
//
// So the bot is told the one thing a player works out in about four seconds of
// watching: SOMEBODY IS ABOUT TO OPEN THAT DOOR — go and be standing there
// when they do. Which is also, precisely, what the level is asking for.
//
// …AND THEN THROUGH IT. Getting the doors to move is only half the errand: the
// venue's own opening beats wait on a hero who is actually ON the floor rather
// than standing in the opening (`ARRIVALS.enteredStep`), so the rung carries him
// a few tiles past the jambs before it retires. Left to stop at the threshold he
// waits there forever — the read that arms him is behind a depth he never walks,
// and every rung below this one is still waiting for a weapon.
//
// The rung is deliberately narrow. It answers null the moment he is properly
// inside, and null on every map that has no arrivals at all, so the ladder below
// it is untouched everywhere else and the bot goes back to playing the level
// the moment there is a level to play.
//
// Pure, like every decision module here: reads the state, mutates nothing,
// draws no rng.

import { distance } from "@game/lib/vec.ts";
import type { Vec2 } from "@game/lib/vec.ts";

import { ENTRANCE_DOOR } from "../arrivals.ts";
import { ARRIVALS, PLAYER } from "../config/index.ts";
import { runLevelDef } from "../defs/levels/index.ts";
import { anyZoneContains } from "../zones.ts";
import type { ArrivalPlan, GameState, Player } from "../types/index.ts";

/** Where the bot is going while the way in is shut, and what BOT VIEW calls
 * it. */
export type EntranceGoal = { pos: Vec2; thought: string };

/**
 * IS THE WAY IN STILL SHUT, AND IS THIS HERO STILL OUTSIDE IT?
 *
 * Both halves matter, and the FIRST is not a latch — the gate shuts again
 * (`ARRIVALS.gateHoldMs`), so the rung retires itself for the second and a half
 * the way in is open and re-arms behind it, which is exactly the read a player
 * has: while it is open there is a level to play, and while it is shut there is
 * a car to wait for. The second is what keeps a party honest: a hero who has
 * already followed somebody through is playing the building, and pulling him
 * back onto the tarmac because the gate has since shut behind him would be the
 * rung fighting the run.
 */
export function lockedOut(state: GameState, hero: Player): boolean {
  const def = runLevelDef(state);
  const spec = def.arrivals;
  if (!spec || !state.arrivalPlan || !def.arrivalLot) return false;
  const id = spec.door ?? ENTRANCE_DOOR;
  if (!state.doors.some((d) => d.id === id && !d.open)) return false;
  return anyZoneContains(def.arrivalLot, hero.pos);
}

/** How far past the doorway a body stands, in world px down the plan's own
 * normal — negative is the tarmac. The plan holds a point either side of the
 * opening, so the way in is simply the direction between them. */
function depthInside(plan: ArrivalPlan, at: Vec2): number {
  const nx = plan.inside.x - plan.door.x;
  const ny = plan.inside.y - plan.door.y;
  const len = Math.hypot(nx, ny) || 1;
  return ((at.x - plan.door.x) * nx + (at.y - plan.door.y) * ny) / len;
}

/**
 * WHERE TO STAND WHILE HE WAITS — and it is a PERSON first, the doorway second.
 *
 * Walking at the badge carrier rather than straight at the apron is not
 * decoration. It is the read the level is teaching, and it is what the beat
 * looks like from outside the car: the bot falls in behind somebody crossing
 * the tarmac and arrives at the doors with them. Aiming at the apron alone
 * would have him standing on the threshold before the first car had even
 * parked, which teaches the player watching him nothing at all.
 *
 * Once nobody is walking — between arrivals, or after the swipe — the apron IS
 * the answer: it is a step off the doorway, which is where somebody waiting to
 * go in stands.
 *
 * AND ONCE THE WAY IS OPEN THE GOAL IS THE FLOOR, not the doorway. The venue's
 * first beats wait on a hero who has walked a few tiles in
 * (`ARRIVALS.enteredStep`), and the crowd they are about stands well beyond
 * that — so a bot that stops on the threshold is a bot standing among neutral
 * staff with no weapon, waiting for a read that is waiting for him. He goes to
 * the landing: the doorway's own normal, that far in.
 *
 * THE LANDING IS PAST THE BAR, NOT ON IT. Steering stops within
 * `PLAYER.arriveRadius` of its target, so aiming AT the depth the beats want
 * leaves him a few px short of it — arrived, satisfied, and still not inside as
 * far as the venue is concerned. A body's radius of overshoot puts him plainly
 * on the floor rather than balanced on the line.
 *
 * Null once he is properly inside — which is what hands the run back to the
 * ladder below.
 */
export function entranceGoal(
  state: GameState,
  hero: Player,
): EntranceGoal | null {
  const plan = state.arrivalPlan;
  if (!plan) return null;
  if (depthInside(plan, hero.pos) >= ARRIVALS.enteredStep) return null;
  if (!lockedOut(state, hero)) {
    const nx = plan.inside.x - plan.door.x;
    const ny = plan.inside.y - plan.door.y;
    const len = Math.hypot(nx, ny) || 1;
    const landing = ARRIVALS.enteredStep + PLAYER.arriveRadius + PLAYER.radius;
    return {
      pos: {
        x: plan.door.x + (nx / len) * landing,
        y: plan.door.y + (ny / len) * landing,
      },
      thought: "GET INSIDE",
    };
  }
  // The nearest one still on their feet — nearest, because on a lot with three
  // cars in the rank the person to fall in behind is the one already passing.
  let follow: Vec2 | null = null;
  let best = Infinity;
  for (const arrival of state.arrivals) {
    if (arrival.phase !== "walking" || arrival.staff === null) continue;
    const body = state.enemies.find((e) => e.id === arrival.staff && e.hp > 0);
    if (!body) continue;
    const d = distance(body.pos, hero.pos);
    if (d < best) {
      best = d;
      follow = body.pos;
    }
  }
  return follow
    ? { pos: follow, thought: "FOLLOW STAFF IN" }
    : { pos: plan.apron, thought: "WAIT AT ENTRANCE" };
}
