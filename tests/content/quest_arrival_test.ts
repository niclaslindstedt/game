// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// DOES A GIVER WHO WALKS IN ACTUALLY WALK IN — through the door, rather than
// through the brickwork beside it?
//
// The entrance is SCRIPTED, not pathfound: `stepArrivingGivers` walks straight
// legs between the corners the author picked (`QuestGiverDef.arrive.via`) and
// nothing pushes the walker out of a wall. That is deliberate — a giver shoved
// aside by collision arrives somewhere their errand was not written for — and
// it makes the geometry the AUTHOR'S to get right. Ada's mother is why this
// file exists: the single line from her doorstep on the drive to her spot by
// the engine parts passed within six px of the bay's south jamb, so the woman
// with her own key let herself in through the wall on every visit to the hub.
//
// Nothing in the build could see it. The schema checks each coordinate is ON
// the map; only the carve knows what stands between two of them, and only a
// run has the carve.
//
// A sequel deletes this file with the campaign it guards.

import {
  createGame,
  QUEST_GIVER_DEFS,
  type GameState,
  type Vec2,
} from "@game/core";
import { describe, expect, it } from "vitest";

/** Seeds to carve each hub on. Every venue carrying an arriving giver is
 * PINNED (`carveSeed`), so these agree; a handful covers a venue that is not. */
const SEEDS = [1, 2, 3];

/**
 * How close the walk may pass to a blocker's centre before it is a walk through
 * masonry: the blocker's own radius plus a body's. `QUESTS.radius` is 10, and a
 * giver whose shoulder is inside the stone reads exactly as badly as one whose
 * middle is.
 */
const BODY = 10;

const ARRIVING = Object.values(QUEST_GIVER_DEFS).filter((def) => def.arrive);

describe("a giver who walks in walks through the doorway", () => {
  it("crosses no wall on any leg of the entrance", () => {
    const crossings: string[] = [];
    for (const def of ARRIVING) {
      for (const seed of SEEDS) {
        const state = createGame(seed, def.level);
        const giver = state.questGivers.find((g) => g.id === def.id);
        expect(giver, `${def.id} is not on ${def.level}`).toBeDefined();
        const legs = walk(state, giver!);
        for (const [i, leg] of legs.entries()) {
          const wall = firstWallCrossed(state, leg.from, leg.to);
          if (wall) {
            crossings.push(
              `${def.id} [${def.level} seed ${seed}] leg ${i} ` +
                `(${leg.from.x},${leg.from.y} → ${leg.to.x},${leg.to.y}) ` +
                `crosses a ${wall.kind} at ${wall.pos.x},${wall.pos.y}`,
            );
          }
        }
      }
    }
    expect(crossings).toEqual([]);
  });
});

/** The legs the runtime will actually walk, read off the state the run built
 * (so `via` and the destination's clearance nudge are both included). */
function walk(
  state: GameState,
  giver: GameState["questGivers"][number],
): { from: Vec2; to: Vec2 }[] {
  const points = [
    giver.pos,
    ...(giver.to ? [giver.to] : []),
    ...(giver.path ?? []),
  ];
  const legs: { from: Vec2; to: Vec2 }[] = [];
  for (let i = 1; i < points.length; i++) {
    legs.push({ from: points[i - 1] as Vec2, to: points[i] as Vec2 });
  }
  return legs;
}

/**
 * The first WALL a straight leg passes through, or undefined. A door segment is
 * not one: the roll-up opens for a walker on approach (`stepDoors`), which is
 * the whole point of aiming the leg at it.
 */
function firstWallCrossed(
  state: GameState,
  from: Vec2,
  to: Vec2,
): GameState["obstacles"][number] | undefined {
  return state.obstacles.find(
    (o) =>
      o.kind === "wall" && distanceToSegment(o.pos, from, to) < o.radius + BODY,
  );
}

function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  const t =
    len === 0
      ? 0
      : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
