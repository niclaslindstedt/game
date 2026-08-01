// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// IS THIS SPOT SOMEWHERE THE PLAYER CAN SEE? — the fog read every automatic
// target pick asks (step/weapon.ts `nearestEnemy`, the crate fallback, the
// conjured powers, the companions' engage bubble, the autopilot's stand-off).
// The grid it reads and the sweep that lifts it are map.ts; this is only the
// question asked OF that grid.
//
// AND IT IS A SEPARATE FILE FROM map.ts FOR A REACHABILITY REASON, not a
// tidiness one. `src/menu.ts` re-exports map.ts's `mapCols`/`mapRows` — the
// level map's grid arithmetic is genuinely something the STARTUP path draws
// with — so the whole of map.ts sits inside the app's 170 KB critical-path
// budget (pwa/scripts/check-seo.mjs), where tree-shaking cannot help: an export
// used by any chunk keeps its bytes wherever its module was placed. Nothing
// that only a RUNNING RUN asks may live there; put it here instead, where the
// menus never reach. Adding this to map.ts is what tripped the budget the first
// time, at 170.0 KB against a 170 KB ceiling.

import type { Vec2 } from "@game/lib/vec.ts";
import { MAP } from "./config/index.ts";
import { mapCols, mapRows } from "./map.ts";
import type { GameState } from "./types/index.ts";

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
