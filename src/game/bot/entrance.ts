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
// The rung is deliberately narrow. It answers null the instant the doors are
// open, and null on every map that has no arrivals at all, so the ladder below
// it is untouched everywhere else and the bot goes back to playing the level
// the moment there is a level to play.
//
// Pure, like every decision module here: reads the state, mutates nothing,
// draws no rng.

import { distance } from "@game/lib/vec.ts";
import type { Vec2 } from "@game/lib/vec.ts";

import { ENTRANCE_DOOR } from "../arrivals.ts";
import { runLevelDef } from "../defs/levels/index.ts";
import { anyZoneContains } from "../zones.ts";
import type { GameState, Player } from "../types/index.ts";

/** Where the bot is going while the way in is shut, and what BOT VIEW calls
 * it. */
export type EntranceGoal = { pos: Vec2; thought: string };

/**
 * IS THE WAY IN STILL SHUT, AND IS THIS HERO STILL OUTSIDE IT?
 *
 * Both halves matter. A door that has been badged open stays open for the rest
 * of the run, so the first is a one-way latch and the rung retires itself. The
 * second is what keeps a party honest: a hero who has already followed somebody
 * through is playing the building, and pulling him back onto the tarmac because
 * a second leaf of the same entrance is still shut would be the rung fighting
 * the run.
 */
export function lockedOut(state: GameState, hero: Player): boolean {
  const def = runLevelDef(state);
  const spec = def.arrivals;
  if (!spec || !state.arrivalPlan || !def.arrivalLot) return false;
  const id = spec.door ?? ENTRANCE_DOOR;
  if (!state.doors.some((d) => d.id === id && !d.open)) return false;
  return anyZoneContains(def.arrivalLot, hero.pos);
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
 * Null whenever the doors are open or the hero is already through.
 */
export function entranceGoal(
  state: GameState,
  hero: Player,
): EntranceGoal | null {
  const plan = state.arrivalPlan;
  if (!plan || !lockedOut(state, hero)) return null;
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
