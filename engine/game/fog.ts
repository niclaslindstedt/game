// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THE PLAYER CAN SEE — both halves of it. `revealAround` is the SWEEP that
// lifts the fog as the hero walks, and `clearOfFog` is the read every automatic
// target pick asks of what it left behind (step/weapon.ts `nearestEnemy`, the
// crate fallback, the conjured powers, the companions' engage bubble, the
// autopilot's stand-off). The grid itself — its arithmetic, its rays, its
// markers — is map.ts.
//
// AND IT IS A SEPARATE FILE FROM map.ts FOR A REACHABILITY REASON, not a
// tidiness one. `engine/menu.ts` re-exports map.ts's `mapCols`/`mapRows` — the
// level map's grid arithmetic is genuinely something the STARTUP path draws
// with — so the whole of map.ts sits inside the app's 170 KB critical-path
// budget (pwa/scripts/check-seo.mjs), where tree-shaking cannot help: an export
// used by any chunk keeps its bytes wherever its module was placed. Nothing
// that only a RUNNING RUN asks may live there; put it here instead, where the
// menus never reach. Adding this to map.ts is what tripped the budget the first
// time, at 170.0 KB against a 170 KB ceiling. The sweep lives here for that
// same reason and a sharper one: it reads the level's OBSTACLES, so leaving it
// in map.ts would drag the whole collision module onto the startup path.

import type { Vec2 } from "@game/lib/vec.ts";
import { MAP } from "./config/index.ts";
import { mapCols, mapRows } from "./map.ts";
import { lineOfSight } from "./obstacles.ts";
import type { GameState } from "./types/index.ts";

/**
 * Uncover the fog around a world position: every cell whose centre lies within
 * `radius` of `pos` AND WHICH `pos` CAN ACTUALLY SEE is marked explored. The
 * running game sweeps this around each hero every tick, so the fog lifts along
 * his path (Warcraft-style, and nothing ever re-fogs); creation, an elevator
 * arrival and a scenario landing sweep it once where they put him.
 *
 * THE SIGHT LINE IS THE POINT. A disc alone let the hero see THROUGH the level:
 * standing outside a compound uncovered its whole interior, and a room lit up
 * before he had walked into it — including, since a mob is drawn exactly where
 * the fog is lifted, the horde waiting inside. So each cell is checked against
 * whatever the level puts in the way ({@link lineOfSight}) and the ground behind
 * a wall stays dark until he stands somewhere it is in view. What that buys is
 * the thing a top-down game is otherwise missing: rounding a corner is a
 * discovery, and a doorway shows you a cone of the room rather than the room.
 *
 * ONLY ARCHITECTURE CASTS A SHADOW, though. The low jumpable props a bullet
 * flies over are looked over too, and a LONE narrow obstacle — one crate, one
 * scattered rock — is looked past: it takes two obstacles in line, or one
 * wider than a unit of ground, before the sweep is stopped (obstacles.ts).
 * Otherwise every dressed field is a fan of dark wedges the hero has to walk
 * into one at a time, and the mob standing in one is undrawn and untargetable
 * on ground the player is plainly looking at.
 *
 * The line is tested only as far as {@link MAP.fogWallDepth} SHORT of the cell,
 * so the wall itself — and a sliver of what is immediately behind it — comes
 * up seen; that knob's comment is why, and it is load-bearing rather than
 * cosmetic.
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
  const explored = state.explored;
  const cx = Math.floor(pos.x / cell);
  const cy = Math.floor(pos.y / cell);
  const reach = Math.ceil(radius / cell);
  const radiusSq = radius * radius;
  const depth = MAP.fogWallDepth;
  for (let dy = -reach; dy <= reach; dy++) {
    const ty = cy + dy;
    if (ty < 0 || ty >= rows) continue;
    for (let dx = -reach; dx <= reach; dx++) {
      const tx = cx + dx;
      if (tx < 0 || tx >= cols) continue;
      const idx = ty * cols + tx;
      // ALREADY UNCOVERED — and the fog never rolls back, so there is nothing
      // left to decide and no sight line to pay for. This is the steady state:
      // a walking hero drags his disc over ground he uncovered on the previous
      // tick, and only the handful of cells at its leading edge (plus whatever
      // stays in a wall's shadow) ever reach the ray below.
      if (explored[idx] === 1) continue;
      const ex = (tx + 0.5) * cell - pos.x;
      const ey = (ty + 0.5) * cell - pos.y;
      const distSq = ex * ex + ey * ey;
      if (distSq > radiusSq) continue;
      const dist = Math.sqrt(distSq);
      if (dist > depth) {
        // Stop the ray a `depth` short of the cell rather than at it — see
        // MAP.fogWallDepth. The scratch point is reused across the sweep: this
        // runs per uncovered cell per hero per tick, and a fresh Vec2 for each
        // was pure garbage.
        const t = (dist - depth) / dist;
        sightTo.x = pos.x + ex * t;
        sightTo.y = pos.y + ey * t;
        if (!lineOfSight(state, pos, sightTo)) continue;
      }
      explored[idx] = 1;
    }
  }
}

/** Scratch end-point for the sweep's sight lines — see {@link revealAround}. */
const sightTo: Vec2 = { x: 0, y: 0 };

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
