// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The level map and its fog of war. Exploration is a coarse byte grid on the
// state (`state.explored`, one cell per MAP.cellSize world px): playing
// uncovers every cell the on-screen camera view covers (`revealRect`), so the
// map remembers everything the player has actually SEEN, not just a circle
// around the hero. What has been uncovered stays uncovered for the rest of the
// run — Warcraft-style, minus the re-fogging. The seed reveal at spawn (with no
// camera view yet) still uses the MAP.revealRadius circle (`revealAround`). Memorable events pin `state.mapMarkers` (story finds,
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
 * Uncover the fog under a world-space rectangle: every cell the rect overlaps
 * is marked explored. Fed the on-screen camera view each step (see
 * `input.view`), so the fog lifts from *everything the player can see*, not
 * just a circle around the hero — walk to a level's edge and the whole strip
 * you looked at stays uncovered on the map.
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

/**
 * Uncover the fog around a world position: every cell whose center lies
 * within MAP.revealRadius of `pos` is marked explored. The seed reveal at
 * creation/scenario landing (and any headless caller without a camera view)
 * uses this circle; the running game lifts fog by the on-screen rect instead
 * (see `revealRect`).
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
