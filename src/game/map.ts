// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The level map and its fog of war. Exploration is a coarse byte grid on the
// state (`state.explored`, one cell per MAP.cellSize world px): walking
// uncovers everything within MAP.revealRadius of the hero, and what has been
// uncovered stays uncovered for the rest of the run — Warcraft-style, minus
// the re-fogging. Memorable events pin `state.mapMarkers` (story finds,
// elite/boss victories, the merchant) so the map tells the run's story back. The
// `map` phase freezes the simulation exactly like the bag or the pause
// screen; `openMap`/`closeMap` are the app's toggles, safe outside `step()`.

import type { Vec2 } from "@game/lib/vec.ts";
import { MAP } from "./config.ts";
import type { GameState, MapMarker } from "./types.ts";

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
 * Uncover the fog around a world position: every cell whose center lies
 * within MAP.revealRadius of `pos` is marked explored. Called from the step
 * on the hero's position each tick (a handful of byte writes — cheap) and
 * once at creation around the spawn.
 */
export function revealAround(state: GameState, pos: Vec2): void {
  const cell = MAP.cellSize;
  const cols = mapCols(state.level);
  const rows = mapRows(state.level);
  const cx = Math.floor(pos.x / cell);
  const cy = Math.floor(pos.y / cell);
  const reach = Math.ceil(MAP.revealRadius / cell);
  const radiusSq = MAP.revealRadius * MAP.revealRadius;
  for (let dy = -reach; dy <= reach; dy++) {
    const ty = cy + dy;
    if (ty < 0 || ty >= rows) continue;
    for (let dx = -reach; dx <= reach; dx++) {
      const tx = cx + dx;
      if (tx < 0 || tx >= cols) continue;
      const ex = (tx + 0.5) * cell - pos.x;
      const ey = (ty + 0.5) * cell - pos.y;
      if (ex * ex + ey * ey > radiusSq) continue;
      state.explored[ty * cols + tx] = 1;
    }
  }
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

/** Pause into the level map. Only possible mid-run, like the bag. */
export function openMap(state: GameState): void {
  if (state.phase === "playing") state.phase = "map";
}

/** Close the map and resume (pending level-ups take priority). */
export function closeMap(state: GameState): void {
  if (state.phase !== "map") return;
  state.phase = state.player.pendingStatPoints > 0 ? "levelup" : "playing";
}
