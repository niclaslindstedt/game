// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The level map and its fog of war. Exploration is a coarse byte grid on the
// state (`state.explored`, one cell per MAP.cellSize world px): playing sweeps a
// `MAP.revealRadius` circle of everything the hero can SEE around him every step
// (`revealAround`), so the fog lifts along his actual path and stops at the
// walls — Warcraft-style, and what has been uncovered stays uncovered for the
// rest of the run (no re-fogging). The main-view fog then draws everything
// uncovered fully clear and stipples only the frontier band between clear and
// never-seen (MAP.fogBand, in the renderer), and hides any mob standing in it.
// BOTH the sweep and the question every automatic target pick asks of it
// (`clearOfFog`) live in the sibling fog.ts, which is a separate file for a
// REACHABILITY reason: see its header.
// `revealRect` (lift fog from a world rect, sight lines ignored) remains
// available for a caller that wants the whole camera view instead. Memorable
// events pin `state.mapMarkers` (story finds,
// elite/boss victories, the merchant) so the map tells the run's story back. The
// `map` phase freezes the simulation exactly like the bag or the pause
// screen; `openMap`/`closeMap` are the app's toggles, safe outside `step()`.

import type { Vec2 } from "@game/lib/vec.ts";
import { MAP } from "./config/index.ts";
import type { GameState, MapMarker, Player } from "./types/index.ts";

/** Fog-grid columns for a level (cells per explored-array row). */
export function mapCols(level: { width: number }): number {
  return Math.ceil(level.width / MAP.cellSize);
}

/** Fog-grid rows for a level. */
export function mapRows(level: { height: number }): number {
  return Math.ceil(level.height / MAP.cellSize);
}

/** A level's blank (fully fogged) exploration grid. */
export function createExplored(level: {
  width: number;
  height: number;
}): Uint8Array {
  return new Uint8Array(mapCols(level) * mapRows(level));
}

/**
 * Uncover the fog under a world-space rectangle: every cell the rect overlaps
 * is marked explored, sight lines and walls ignored.
 *
 * The blunt instrument, and the only caller left is the one that wants it: the
 * DEATH SCENE lifts the whole camera field around the corpse so the horde
 * gathering into its ring is visible however the room is shaped. Play itself
 * uses the sight-limited disc instead (`revealAround` in fog.ts).
 */
export function revealRect(
  state: GameState,
  rect: { x: number; y: number; width: number; height: number },
): void {
  const cell = MAP.cellSize;
  const cols = mapCols(state.level);
  const rows = mapRows(state.level);
  const x0 = Math.max(0, Math.floor(rect.x / cell));
  const y0 = Math.max(0, Math.floor(rect.y / cell));
  const x1 = Math.min(cols - 1, Math.floor((rect.x + rect.width) / cell));
  const y1 = Math.min(rows - 1, Math.floor((rect.y + rect.height) / cell));
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      state.explored[ty * cols + tx] = 1;
    }
  }
}

/** What an {@link exploredRay} march ended on. */
export type ExploredRay = {
  /** World px from the ray's origin to where the known ground ends. */
  dist: number;
  /** True when the march ended ON a still-fogged cell (a fog frontier the
   * walker could go uncover); false when it ran out of level first — the
   * ground that way is fully uncovered to the edge, nothing left to learn. */
  fog: boolean;
};

/** March a ray through the fog grid from `from` along `angle`: how far the
 * ground that way is ALREADY UNCOVERED — the walker's map knowledge in that
 * direction. Stops at the first still-fogged cell (`fog: true` — a frontier)
 * or at the level edge (`fog: false` — explored all the way out), capped at
 * `maxDist`. This is the "what does my minimap show that way" read the
 * autopilot's wall-end sense sees with; a pure function of `state.explored`,
 * so botted runs stay deterministic. */
export function exploredRay(
  state: GameState,
  from: Vec2,
  angle: number,
  maxDist: number,
): ExploredRay {
  const cell = MAP.cellSize;
  const cols = mapCols(state.level);
  const rows = mapRows(state.level);
  // Half-cell steps can't skip over a cell of the coarse grid diagonally.
  const stepLen = cell / 2;
  const dx = Math.cos(angle) * stepLen;
  const dy = Math.sin(angle) * stepLen;
  let x = from.x;
  let y = from.y;
  for (let d = 0; d <= maxDist; d += stepLen) {
    const tx = Math.floor(x / cell);
    const ty = Math.floor(y / cell);
    if (tx < 0 || ty < 0 || tx >= cols || ty >= rows)
      return { dist: d, fog: false };
    if (state.explored[ty * cols + tx] !== 1) return { dist: d, fog: true };
    x += dx;
    y += dy;
  }
  return { dist: maxDist, fog: false };
}

/** Has the fog been lifted from the cell containing this world position? */
export function isExplored(state: GameState, pos: Vec2): boolean {
  const cell = MAP.cellSize;
  const tx = Math.floor(pos.x / cell);
  const ty = Math.floor(pos.y / cell);
  if (tx < 0 || ty < 0 || tx >= mapCols(state.level)) return false;
  if (ty >= mapRows(state.level)) return false;
  return state.explored[ty * mapCols(state.level) + tx] === 1;
}

/** Pin a memorable event to the level map (position is copied). */
export function addMapMarker(
  state: GameState,
  kind: MapMarker["kind"],
  pos: Vec2,
  defId: string,
): void {
  state.mapMarkers.push({ kind, pos: { ...pos }, defId });
}

/**
 * Take markers back off the level map — what a pin that described something no
 * longer there owes the map (the trader's stall after he has been run down).
 *
 * By KIND, and optionally by the ONE thing it pinned: a venue with three errand
 * givers on it that lost one of them must not have the other two go with it.
 */
export function removeMapMarkers(
  state: GameState,
  kind: MapMarker["kind"],
  defId?: string,
): void {
  state.mapMarkers = state.mapMarkers.filter(
    (m) => m.kind !== kind || (defId !== undefined && m.defId !== defId),
  );
}

/** Open this hero's level map. Only possible mid-run, like the bag. */
export function openMap(state: GameState, player: Player): void {
  if (state.phase === "playing" && player.screen === undefined) {
    player.screen = "map";
  }
}

/** Close the map. */
export function closeMap(player: Player): void {
  if (player.screen !== "map") return;
  delete player.screen;
}
