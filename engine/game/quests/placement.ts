// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHERE AN ERRAND'S AUTHORED COORDINATES ACTUALLY LAND — the one adjustment a
// GENERATED map (see mapgen/) forces on a quest.
//
// An errand's spots are authored against a hand-drawn map: the survey marker is
// out past the ridge, the page is in the far corner, the pieces lie where they
// were put. A carved run replaces that geometry wholesale and may not even be
// the same SIZE, so those coordinates can land inside a wall, inside the
// sealed annex, or off the map entirely — and every one of those is the same
// failure from the player's side: an objective that cannot be completed, with
// nothing on screen to say why.
//
// THE ANSWER IS THE ONE THE GIVERS ALREADY USE (`clearSpot` in ./index.ts):
// clamp into the map, then ring outward to the nearest clear ground. It is
// deliberately not cleverer than that. A carve could be asked for somewhere
// THEMATIC — the deepest cell, a cell of a named area — but a search objective
// whose spot moved to a different KIND of place each run would make its
// authored sentence ("THE SITE T SURVEY MARKER") a lie, and the sentence is
// the only thing the player has to go on. Nearest-clear keeps the spot as
// close to where the author meant as the carve allows.
//
// On a hand-authored map every check here passes on the first try and nothing
// moves, so this costs the shipped campaign exactly one predicate.

import { clamp, type Vec2 } from "@game/lib/vec.ts";

import { QUESTS } from "../config/index.ts";
import { insideObstacle } from "../obstacles.ts";
import { buildNavGrid, nearestReachable } from "../pathfind.ts";
import type { GameState } from "../types/index.ts";

/** Body radius a quest spot is cleared for — a piece on the floor, or the
 * hero standing on the mark. */
const SPOT_RADIUS = 10;

/**
 * The authored spot, or the nearest clear ground when this run's geometry
 * refuses it. Returns a fresh vector — callers push it onto the world.
 */
export function questSpot(state: GameState, at: Vec2): Vec2 {
  const margin = SPOT_RADIUS + 4;
  const home: Vec2 = {
    x: clamp(at.x, margin, state.level.width - margin),
    y: clamp(at.y, margin, state.level.height - margin),
  };
  if (!blocked(state, home)) return home;
  // The same outward ring the givers walk, at the same step, so a piece and the
  // person who asked for it are displaced by a carve in the same way.
  for (let ring = 1; ring <= 8; ring++) {
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const reach = ring * QUESTS.displaceStep;
      const candidate: Vec2 = {
        x: clamp(
          home.x + Math.cos(angle) * reach,
          margin,
          state.level.width - margin,
        ),
        y: clamp(
          home.y + Math.sin(angle) * reach,
          margin,
          state.level.height - margin,
        ),
      };
      if (!blocked(state, candidate)) return candidate;
    }
  }
  // Nowhere clear within eight rings. Hand the authored spot back rather than
  // dropping the piece: a piece in a wall is at least findable by a player who
  // walks the whole map, and a piece that never existed is not.
  return home;
}

function blocked(state: GameState, pos: Vec2): boolean {
  return insideObstacle(state, pos, SPOT_RADIUS);
}

/**
 * WHERE AN ESCORT'S WALK STARTS AND ENDS — `questSpot` plus the one thing a
 * destination needs that a dropped piece does not: somebody has to be able to
 * WALK there.
 *
 * A piece nudged out of a wall is still findable, so clear ground is the whole
 * question for one. An escort's destination is judged the other way round: the
 * errand is handed in when the person standing there is inside
 * `QUESTS.escortArriveRadius` of it, and nothing about the objective moves once
 * the run has started. So a spot in a sealed pocket, in the annex the lift
 * rides to, or out on the dead rock past the carve is an errand that can never
 * be completed — and it reaches the player as a marker they walk at and never
 * arrive at, with nothing on screen to say why. Measured across the six shipped
 * escort errands, the authored destination was unreachable on most seeds of
 * most maps; on the worst of them, on every seed.
 *
 * `anchor` is ground somebody is already standing on — the hero, whose own
 * component is by definition the one the party can walk in. Doors are read as
 * they stand: one the hero has opened is already out of the obstacle field, and
 * re-homing against a map with every door dissolved would hang the mark behind
 * one this run may never unlock.
 *
 * BOTH ENDS COME BACK FROM ONE CALL because they share the grid, and building
 * it is the expensive half. They are re-homed INDEPENDENTLY, each staying as
 * near its own authored spot as the carve allows — that the walk stays a walk
 * is then a property of the shipped errands rather than of this function, and
 * `tests/content/quest_reachability_test.ts` is where it is held.
 */
export function escortSpots(
  state: GameState,
  body: Vec2,
  to: Vec2,
  anchor: Vec2,
): { body: Vec2; to: Vec2 } {
  const grid = buildNavGrid(state);
  const home = questSpot(state, body);
  const goal = questSpot(state, to);
  return {
    body: nearestReachable(grid, anchor, home) ?? home,
    to: nearestReachable(grid, anchor, goal) ?? goal,
  };
}
