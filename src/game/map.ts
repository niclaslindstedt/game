// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The level map and its fog of war. Exploration is a coarse byte grid on the
// state (`state.explored`, one cell per MAP.cellSize world px): playing sweeps a
// `MAP.revealRadius` CIRCLE around the hero every step (`revealAround`), so the
// fog lifts along his actual path — Warcraft-style, and what has been uncovered
// stays uncovered for the rest of the run (no re-fogging). The main-view fog
// then draws everything uncovered fully clear and stipples only the frontier
// band between clear and never-seen (MAP.fogBand, in the renderer), and hides
// any mob standing in it — so `clearOfFog` is the engine's own reading of that
// same frontier, and the auto-attack picks its target through it (nothing the
// player cannot see is ever fired at).
// `revealRect` (lift fog from a world rect) remains available for a
// caller that wants the whole camera view instead. Memorable events pin
// `state.mapMarkers` (story finds,
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
 *
 * @param radius override the sweep radius (world px) — an elevator arrival opens
 *   a wider disc than a footstep, so the room the car drops the hero into shows
 *   itself on the frame he lands rather than a second later.
 */
export function revealAround(
  state: GameState,
  pos: Vec2,
  radius: number = MAP.revealRadius,
): void {
  const cell = MAP.cellSize;
  const cols = mapCols(state.level);
  const rows = mapRows(state.level);
  const cx = Math.floor(pos.x / cell);
  const cy = Math.floor(pos.y / cell);
  const reach = Math.ceil(radius / cell);
  const radiusSq = radius * radius;
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

/**
 * Is this world position on ground the player can actually SEE — uncovered AND
 * clear of the frontier band the fog stipples over?
 *
 * `isExplored` answers the raw grid; this is the question the HORDE is judged
 * by, because the main view refuses to draw a body standing anywhere within
 * `MAP.fogBand` of the frontier (render/enemies.ts) — the stipple there is
 * still thick enough that a mob would be a silhouette in the dark. Targeting
 * reads THIS one, so the hero never swings at, shoots at, or conjures onto
 * something the player cannot see (step/weapon.ts `nearestEnemy`).
 *
 * The test is "no unexplored cell centre within `MAP.fogBand` of `pos`", which
 * is the engine's own deterministic reading of the renderer's chamfer field:
 * the drawn frontier eases outward over a few frames (render/fog.ts) and a
 * simulation may never depend on a render clock, so this answers where the
 * frontier IS rather than where it is currently drawn.
 *
 * OFF-MAP CELLS READ AS CLEAR, deliberately unlike the renderer (which seeds
 * them as frontier so a level's rim fogs). Out past the boundary there is
 * nothing left for the hero to discover — it is not undiscovered ground — and
 * fogging it would make a mob pinned against the level's edge permanently
 * untargetable, melee included, since bodies clamp to their own radius and the
 * rim is barely a cell and a half wide.
 *
 * Every automatic target pick in the game runs this, several times a tick and
 * once per candidate at horde scale, so the interior answer comes off a cached
 * bit — see {@link settledClear}.
 */
export function clearOfFog(state: GameState, pos: Vec2): boolean {
  const cell = MAP.cellSize;
  const cols = mapCols(state.level);
  const rows = mapRows(state.level);
  const cx = Math.floor(pos.x / cell);
  const cy = Math.floor(pos.y / cell);
  const settled = settledClear(state.explored, cols, rows);
  const home = cy * cols + cx;
  // Deep inside uncovered ground the answer is already known and needs no scan
  // at all. Only cells near the frontier (or never asked about) fall through.
  if (cx >= 0 && cy >= 0 && cx < cols && cy < rows && settled[home] === 1) {
    return true;
  }
  // Otherwise walk the neighbourhood: only a still-fogged cell whose CENTRE
  // falls inside the band refuses the position. `all` rides along — it says the
  // whole neighbourhood came back uncovered, which is stronger than the question
  // asked (it ignores where in the cell `pos` stands) and is therefore what may
  // be cached: a cell that clears it clears for EVERY point in it. Off-map
  // neighbours are skipped by both, since out there nothing is hidden.
  const band = MAP.fogBand;
  const reach = Math.ceil(band / cell);
  const bandSq = band * band;
  let all = true;
  for (let dy = -reach; dy <= reach; dy++) {
    const ty = cy + dy;
    if (ty < 0 || ty >= rows) continue;
    for (let dx = -reach; dx <= reach; dx++) {
      const tx = cx + dx;
      if (tx < 0 || tx >= cols) continue;
      if (state.explored[ty * cols + tx] === 1) continue;
      all = false;
      const ex = (tx + 0.5) * cell - pos.x;
      const ey = (ty + 0.5) * cell - pos.y;
      if (ex * ex + ey * ey <= bandSq) return false;
    }
  }
  if (all && cx >= 0 && cy >= 0 && cx < cols && cy < rows) settled[home] = 1;
  return true;
}

/**
 * The "this cell is DONE" bits behind {@link clearOfFog}: one byte per fog cell,
 * set once the cell's whole neighbourhood is uncovered.
 *
 * It needs no invalidation, which is the whole reason it can be this cheap: the
 * fog NEVER rolls back (see the file header), so a neighbourhood that is fully
 * uncovered stays fully uncovered for the rest of the run and a set bit can only
 * ever have been right. Nothing is cached the other way — a cell short of the
 * mark is re-asked every time, which is exactly where the answer still changes.
 *
 * Keyed off the run's own `explored` array, so a fresh level (or a second live
 * run — a session's world beside a client's) gets its own bits rather than
 * inheriting a stranger's, and the whole thing is collected with the run. This
 * is a derived cache and not simulation state: it holds no answer the grid does
 * not already imply, so nothing here can make two runs of the same seed differ.
 */
const settledClearBits = new WeakMap<Uint8Array, Uint8Array>();

function settledClear(
  explored: Uint8Array,
  cols: number,
  rows: number,
): Uint8Array {
  let bits = settledClearBits.get(explored);
  if (bits === undefined || bits.length !== cols * rows) {
    bits = new Uint8Array(cols * rows);
    settledClearBits.set(explored, bits);
  }
  return bits;
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
