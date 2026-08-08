// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE GLUED — twenty people sitting across the carriageway with their hands in
// the resin, and the one thing on this road that cannot be driven around.
//
// WHY IT IS ITS OWN FILE AND NOT A DENSER PATCH OF CROWD. The crowd
// (`crowd.ts`) is a STREAM: a running mark, a body laid down every so many
// pixels, forever, and every one of them wanders and lunges. This is the
// opposite of all four of those — it is laid down ONCE, at one place in the
// trip, as a formation rather than a density, and not one of them moves so much
// as a pixel however close the car gets. Folding it into the spawner would mean
// a spawner with a mode, which is how a spawner stops being readable.
//
// THEY ARE NAMED FOR WHAT THEY ARE DOING AND NOTHING ELSE, and that is a rule
// rather than a shortage of imagination (docs/naming.md): nothing in this game
// is named after a real organisation, campaign or person, including the
// near-miss. THE GLUED is the role. The role is the funnier half anyway, and
// unlike a name it does not date — there has been somebody sitting in a road
// since there have been roads, and there will be somebody sitting in one long
// after whoever is doing it this year has been forgotten.
//
// THE SATIRE POINTS AT THE COLLISION, NOT AT THE CAUSE. They are right about
// the road and right about the cars; they are sitting in front of the ONE man
// in the game who is not listening to anything, in a wagon he cannot stop, on
// his way to a job he hates. Nobody in this scene gets to be the sensible one,
// which is the only version of it worth shipping.
//
// NOT A SINGLE `state.rng()` DRAW. The formation is hashed off its own slot
// index, exactly as the kerb's furniture and the crossings are — so a restart
// after a breakdown puts every one of them back in the same seat, which matters
// more here than anywhere else on the road: this is the stretch a player is
// going to drive four times, and a demonstration that reshuffled between
// attempts would make it a lottery instead of a thing to learn.

import { courseLength, DRIVE } from "./config.ts";
import { roadEdges } from "./crowd.ts";
import type { DriveState } from "./types.ts";

/**
 * HOW MANY SEATED BODIES THERE ARE TO DRAW FROM. The app's own table is this
 * long (`GLUED_SPRITES`, pwa/src/game/drive-screen/scenery.ts) — keep the two in
 * step, or the blockade quietly stops using its last posture.
 */
export const GLUED_VARIANTS = 8;

/**
 * HOW MANY LINES THE GLUED HAVE BETWEEN THEM — the length of the app's own list
 * (`GLUED_BARKS`, pwa/src/game/drive-screen/placards.ts), which is where the
 * words live, because the engine has never been told this game has words in it.
 */
export const GLUED_BARKS = 5;

/** A stable 0→1 off a seat index — the formation's only source of variety, and
 * not a draw. */
function hash(n: number): number {
  let h = Math.imul(n ^ 0x2545f491, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** How far into the course the blockade sits (world px along the leg). */
export function blockadeAt(params: DriveState["params"]): number {
  return courseLength(params) * DRIVE.blockade.atFrac;
}

/**
 * Lay the demonstration down, once, as the road unrolls to it.
 *
 * Called from the same place the crowd's spawner is and latched the same way
 * the monologue is — this happens once a leg, and a blockade that could be laid
 * twice is a wall the player drives into and then into again.
 */
export function spawnBlockade(state: DriveState): void {
  if (state.blockadeDone) return;
  const at = blockadeAt(state.params);
  if (state.distance + DRIVE.spawnAheadPx < at) return;
  state.blockadeDone = true;

  const { blockade } = DRIVE;
  const dir = state.params.direction;
  const edges = roadEdges();
  // ACROSS EVERY LANE, KERB TO KERB. The width is the road's own — they are not
  // leaving a gap, because leaving a gap is the one thing a blockade must not
  // do and the one thing a player will spend the whole approach looking for.
  const span = edges.bottom - edges.top;
  const perRow = Math.max(1, Math.floor(span / blockade.seatPitchPx));
  const rows = Math.ceil(blockade.count / perRow);
  // Centred on the mark, so the formation's MIDDLE is where the course says it
  // is however many rows it takes.
  const frontX =
    state.car.home.x + dir * (at - (rows * blockade.rowPitchPx) / 2);
  // WHICH OF THEM SPEAKS: spread evenly through the formation rather than
  // rolled, so the bubbles are never all in one row and never all in the row the
  // bumper reaches first.
  const voiceEvery = Math.max(1, Math.floor(blockade.count / blockade.voices));

  for (let i = 0; i < blockade.count; i++) {
    const row = Math.floor(i / perRow);
    const seat = i % perRow;
    const jitter = (n: number) =>
      (hash(i * 31 + n) - 0.5) * 2 * blockade.jitterPx;
    state.pedestrians.push({
      id: state.nextId++,
      pos: {
        x: frontX + dir * (row * blockade.rowPitchPx) + jitter(1),
        // Seats are laid from the top edge and centred inside the road's own
        // band, so a formation narrower than the road sits in the middle of it
        // rather than being pushed against one kerb.
        y:
          edges.top +
          (span - (perRow - 1) * blockade.seatPitchPx) / 2 +
          seat * blockade.seatPitchPx +
          jitter(2),
      },
      vel: { x: 0, y: 0 },
      mode: "afoot",
      kind: "glued",
      variant: Math.floor(hash(i * 7 + 3) * GLUED_VARIANTS) % GLUED_VARIANTS,
      // Unread — nothing about one of THE GLUED drifts, because that is the
      // entire point of them — but the field is not optional and a body with a
      // phase of zero is one that would drift in step with every other if it
      // ever did.
      phase: hash(i * 11 + 5) * Math.PI * 2,
      z: 0,
      vz: 0,
      counted: false,
      crushed: false,
      bark:
        i % voiceEvery === 0
          ? Math.floor(hash(i * 13 + 7) * GLUED_BARKS) % GLUED_BARKS
          : -1,
    });
  }
}
