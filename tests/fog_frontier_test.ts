// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE FOG'S FRONTIER (pwa/src/game/render/fog.ts): how the edge of the dark
// MOVES as the hero walks into it.
//
// `state.explored` is one byte per `MAP.cellSize` (32 world px) cell, so the
// chamfer distance the band is built from advances a whole CELL at a time —
// while `MAP.fogBand` is only 48 px, barely more than one cell. Un-eased, a
// single cell flipping therefore shifts the frontier by a third to a half of
// the entire band in ONE frame and redraws the whole stipple at once, which
// reads as the fog flashing. Measured walking a straight line, the edge sat
// still for 20–30 px of travel and then jumped 16, over and over, with a period
// of exactly 32.
//
// So the drawn distance eases toward the real one, and what these pin is the
// two halves of that: the edge never moves in a lurch, and it always arrives.

import { describe, expect, it } from "vitest";

import { MAP } from "@game/core";

import { ensureFogField, fogDistanceAt } from "../pwa/src/game/render/fog.ts";
import { revealAround } from "../engine/game/fog.ts";
import { startGame } from "./engine/helpers.ts";

/** One 60 Hz frame, in ms — the cadence the ease actually runs at. */
const FRAME_MS = 1000 / 60;

/**
 * Walk the hero east one world px per frame and report where the frontier sits
 * on each, straight out along his own line.
 */
function walkFrontier(steps: number): number[] {
  const state = startGame();
  const probeY = 600;
  const edges: number[] = [];
  let clock = 0;
  for (let step = 0; step <= steps; step++) {
    const heroX = 500 + step;
    revealAround(state, { x: heroX, y: probeY });
    clock += FRAME_MS;
    const field = ensureFogField(state, clock);
    let edge = heroX;
    for (let x = heroX; x < heroX + 800; x++) {
      if (fogDistanceAt(field, x, probeY) < MAP.fogBand) {
        edge = x;
        break;
      }
    }
    edges.push(edge);
  }
  return edges;
}

describe("the fog frontier", () => {
  it("glides rather than lurching as the hero walks into it", () => {
    // The hero covers one world px per frame here, so the frontier may not
    // outrun him by much on any single one. The cell quantum is 32 px and the
    // un-eased field jumped 16 in a frame; anything at or above a third of a
    // cell is the pop coming back.
    const edges = walkFrontier(240);
    let worst = 0;
    for (let i = 1; i < edges.length; i++) {
      worst = Math.max(worst, (edges[i] ?? 0) - (edges[i - 1] ?? 0));
    }
    expect(worst).toBeLessThan(MAP.cellSize / 3);
  });

  it("keeps up with the hero rather than falling behind him", () => {
    // The other half, and the one a gentle ease gets wrong: the frontier
    // advances at exactly the speed the hero walks, so an ease slower than his
    // pace would lag a little further behind on every step and quietly shrink
    // the cleared ground he moves in. Both samples are taken well after the
    // spawn's own opening reveal has been walked out of, so this compares
    // steady state against steady state rather than against a transient.
    const edges = walkFrontier(240);
    const gapAt = (step: number) => (edges[step] ?? 0) - (500 + step);
    expect(gapAt(240)).toBeGreaterThanOrEqual(gapAt(150) - 1);
    // …and it settles where the reveal actually reaches: a `revealRadius` disc
    // around him, less the band that has not thinned to nothing yet.
    expect(gapAt(240)).toBeGreaterThan(MAP.revealRadius - MAP.fogBand - 16);
  });

  it("arrives exactly once the hero stops", () => {
    // An exponential ease alone never quite lands, which would park the
    // frontier a hair inside where it belongs for the rest of the run — hence
    // the floor under the rate. Standing still, it must settle and stay put.
    const state = startGame();
    const probeY = 600;
    let clock = 0;
    revealAround(state, { x: 500, y: probeY });
    for (let frame = 0; frame < 60; frame++) {
      clock += FRAME_MS;
      ensureFogField(state, clock);
    }
    const settled = ensureFogField(state, clock);
    // Nothing left owing anywhere on the grid — an exact arrival, not a very
    // close one, so the drawn frontier and the real one are the same picture
    // for as long as the hero stands still.
    for (let i = 0; i < settled.dist.length; i++) {
      expect(settled.shown[i]).toBe(settled.dist[i]);
    }
    // …and it stays put: a settled field reports no further movement, which is
    // what lets the fog's composite cache re-blit instead of rebuilding.
    const before = settled.version;
    ensureFogField(state, clock + FRAME_MS);
    expect(settled.version).toBe(before);
  });
});
