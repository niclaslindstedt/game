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
      const reach = ring * QUESTS.repelRadius * 0.5;
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
