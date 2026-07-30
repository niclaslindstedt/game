// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Fog of war — over the world, under the HUD/flash (StarCraft/Warcraft): the
// unwalked map is dark, terrain seen-but-out-of-sight dims, and the hero's
// live sight circle stays clear. The distance-to-frontier field computed here
// is shared with the mob cull in the enemies pass, so a mob is only drawn on
// ground the hero has actually uncovered.

import { MAP, mapCols, type GameState } from "@game/core";

import { type Camera } from "./view.ts";
import { type ViewSize } from "./shared.ts";
import {
  projectionKey,
  projectX,
  projectY,
  unprojectX,
  unprojectY,
} from "./tilt.ts";

// The offscreen buffer the fog is composited into per pixel, plus the
// reusable ImageData the frontier stipple is written to. Both are rebuilt when
// the view size changes; the buffer is blitted over the world in one draw so
// its transparent (cleared) pixels leave the game untouched.
let fogBuffer: {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  img: ImageData;
  w: number;
  h: number;
} | null = null;

function ensureFogBuffer(w: number, h: number) {
  if (fogBuffer && fogBuffer.w === w && fogBuffer.h === h) return fogBuffer;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const bctx = canvas.getContext("2d");
  if (!bctx) return null;
  bctx.imageSmoothingEnabled = false;
  fogBuffer = { canvas, ctx: bctx, img: bctx.createImageData(w, h), w, h };
  return fogBuffer;
}

// The per-cell distance-to-frontier field the fog band is built from: for each
// explored cell, the chamfer distance (in world px) to the nearest unexplored
// OR off-map cell. Cached and only rebuilt when the explored set grows — the
// hero never re-fogs, so the cell count strictly increases and doubles as a
// cheap change signal.
export type FogField = {
  explored: Uint8Array;
  count: number;
  cols: number;
  rows: number;
  dist: Float32Array;
};
let fogField: FogField | null = null;

export function ensureFogField(state: GameState): FogField {
  const explored = state.explored;
  const cell = MAP.cellSize;
  const cols = mapCols(state.level);
  const rows = Math.ceil(state.level.height / cell);
  let count = 0;
  for (let i = 0; i < explored.length; i++) count += explored[i] ?? 0;
  if (
    fogField &&
    fogField.explored === explored &&
    fogField.count === count &&
    fogField.cols === cols &&
    fogField.rows === rows
  ) {
    return fogField;
  }
  const n = cols * rows;
  const dist = new Float32Array(n);
  const INF = 1e9;
  const SQRT2 = Math.SQRT2;
  // Seed: unexplored cells are the frontier at distance 0; explored cells start
  // unbounded and get filled by the chamfer passes below.
  for (let i = 0; i < n; i++) dist[i] = (explored[i] ?? 0) === 1 ? INF : 0;
  // Two-pass chamfer. A cell just past the map edge counts as unexplored
  // (distance 0), so explored terrain hugging a level boundary still fogs.
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      let d = dist[i] ?? 0;
      if (d === 0) continue;
      d = Math.min(d, (x > 0 ? (dist[i - 1] ?? 0) : 0) + 1);
      d = Math.min(d, (y > 0 ? (dist[i - cols] ?? 0) : 0) + 1);
      d = Math.min(d, (x > 0 && y > 0 ? (dist[i - cols - 1] ?? 0) : 0) + SQRT2);
      d = Math.min(
        d,
        (x < cols - 1 && y > 0 ? (dist[i - cols + 1] ?? 0) : 0) + SQRT2,
      );
      dist[i] = d;
    }
  }
  for (let y = rows - 1; y >= 0; y--) {
    for (let x = cols - 1; x >= 0; x--) {
      const i = y * cols + x;
      let d = dist[i] ?? 0;
      if (d === 0) continue;
      d = Math.min(d, (x < cols - 1 ? (dist[i + 1] ?? 0) : 0) + 1);
      d = Math.min(d, (y < rows - 1 ? (dist[i + cols] ?? 0) : 0) + 1);
      d = Math.min(
        d,
        (x < cols - 1 && y < rows - 1 ? (dist[i + cols + 1] ?? 0) : 0) + SQRT2,
      );
      d = Math.min(
        d,
        (x > 0 && y < rows - 1 ? (dist[i + cols - 1] ?? 0) : 0) + SQRT2,
      );
      dist[i] = d;
    }
  }
  // Scale cell distances to world px so callers compare against MAP.fogBand.
  for (let i = 0; i < n; i++) dist[i] = Math.min(dist[i] ?? 0, INF) * cell;
  fogField = { explored, count, cols, rows, dist };
  return fogField;
}

/**
 * Bilinearly-sampled distance (world px) from a world position to the nearest
 * unexplored/off-map cell — 0 at the frontier, growing into the cleared
 * interior. Off-grid samples read as unexplored (0) so the map edge fogs. Used
 * both to grade the fog band and to decide whether a mob stands on ground the
 * hero can see.
 */
export function fogDistanceAt(field: FogField, wx: number, wy: number): number {
  const cell = MAP.cellSize;
  const { cols, rows, dist } = field;
  const fx = wx / cell - 0.5;
  const fy = wy / cell - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const at = (x: number, y: number) =>
    x < 0 || y < 0 || x >= cols || y >= rows ? 0 : (dist[y * cols + x] ?? 0);
  const d00 = at(x0, y0);
  const d10 = at(x0 + 1, y0);
  const d01 = at(x0, y0 + 1);
  const d11 = at(x0 + 1, y0 + 1);
  const top = d00 + (d10 - d00) * tx;
  const bot = d01 + (d11 - d01) * tx;
  return top + (bot - top) * ty;
}

// 4×4 Bayer matrix (values 0..15) for the ordered dither that turns the smooth
// distance ramp into a crisp pixel stipple. Indexed on the PROJECTED GROUND
// GRID — see `drawFog` — so the dots stay pinned to the floor as the camera
// pans, without crawling with the view or re-phasing under the tilt.
const FOG_BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/**
 * The main-view FOG OF WAR, Warcraft-2 style (see src/game/map.ts). Everything
 * the hero has uncovered reads fully CLEAR; the never-seen map is solid black;
 * the boundary between them is a graded ordered-dither TRANSITION band, dense
 * black stipple against the dark and thinning to nothing as it meets the clear.
 * The band comes from the cached distance-to-frontier field (`ensureFogField`),
 * sampled bilinearly per pixel so it curves smoothly, then thresholded against
 * the world-locked Bayer matrix so it reads as pixel stipple, not a soft alpha
 * ramp. Composited into the (small, world-unit) buffer and blitted in one draw.
 */
// What the current fog buffer was composited from — when none of it changed
// (camera parked on the same world pixel, no fresh exploration, same view
// size), the per-pixel rebuild and putImageData are skipped entirely and the
// cached canvas is re-blitted as-is.
let fogCompositeKey: {
  /** The camera's own spot on the projected ground grid, in whole px. */
  gridX: number;
  gridY: number;
  field: FogField;
  w: number;
  h: number;
  projection: string;
} | null = null;

/**
 * THE CAMERA'S SEAT ON THE PROJECTED GROUND GRID, in whole pixels.
 *
 * The fog buffer is one canvas pixel per buffer pixel, so buffer pixel `s` looks
 * at the floor point `unproject(anchor + s)` and dithers against the Bayer cell
 * `(anchor + s) mod 4`. Because `anchor + s` is the whole-pixel lattice the
 * screen itself is drawn on, a given point on the floor keeps the SAME cell
 * however the camera moves — which is the whole property: the stipple is pinned
 * to the ground rather than re-phasing under the hero's feet as he walks.
 *
 * Exported for the test that pins exactly that.
 */
export function fogGridAnchor(camera: { x: number; y: number }): {
  x: number;
  y: number;
} {
  return {
    x: Math.round(projectX(camera.x, camera.y)),
    y: Math.round(projectY(camera.x, camera.y)),
  };
}

export function drawFog(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  view: ViewSize,
  field: FogField,
): void {
  const buffer = ensureFogBuffer(view.width, view.height);
  if (!buffer) return;
  const band = MAP.fogBand;
  const w = view.width;
  const h = view.height;
  // THE PROJECTED GROUND GRID — where the camera itself stands on it, rounded to
  // a whole pixel. This is the one quantization the whole pass hangs off, and
  // getting it wrong is what made the stipple boil.
  //
  // The fog is composited in SCREEN space (one buffer pixel is one canvas
  // pixel), so a buffer pixel's position on the floor is `gridPoint + screen
  // offset`, run back through the projection. Snapping the camera HERE — on the
  // projected grid, exactly as the baked ground layer's blit does — is what
  // makes the stipple sit still: the buffer and the floor under it then quantize
  // to the same lattice and shift together, one whole pixel at a time.
  //
  // Snapping the camera in WORLD units instead (what this did before the tilt)
  // is the flicker: a whole world pixel is a FRACTIONAL number of screen pixels
  // once the floor is foreshortened and turned, so the dither's lattice landed a
  // little differently on the screen every time the camera crossed a world unit,
  // and the frontier band crawled and re-phased as the hero walked.
  const { x: gridX, y: gridY } = fogGridAnchor(camera);
  const projection = projectionKey();
  const key = fogCompositeKey;
  if (
    key &&
    key.gridX === gridX &&
    key.gridY === gridY &&
    key.field === field &&
    key.w === w &&
    key.h === h &&
    key.projection === projection
  ) {
    ctx.drawImage(buffer.canvas, 0, 0);
    return;
  }
  const data = buffer.img.data;
  // World position of a buffer pixel — the projection, run backwards from its
  // place on the grid above. Transforming a finished stipple instead would drop
  // a different set of its dots every time the camera moved a pixel.
  const worldX = (sx: number, sy: number) => unprojectX(gridX + sx, gridY + sy);
  const worldY = (sx: number, sy: number) => unprojectY(gridX + sx, gridY + sy);

  // The view is walked in BLOCKS, and only blocks that actually straddle the
  // frontier pay for the per-pixel dither — in ordinary play nearly the whole
  // screen is either long-since-cleared or never-seen and takes a flat fill.
  //
  // The block bound is what makes that safe. `dist` is a chamfer distance in
  // world px, so it is 1-Lipschitz: over a block whose corners span `reach`
  // world px it cannot move by more than `reach`. Sampling the four corners and
  // widening by that gives a bound on the whole block's interior — which holds
  // for ANY projection, including one where a screen-aligned block lands on the
  // world as a tilted parallelogram and cell-aligned walking is not available.
  const BLOCK = 8;
  const reach =
    Math.hypot(unprojectX(BLOCK, 0), unprojectY(BLOCK, 0)) +
    Math.hypot(unprojectX(0, BLOCK), unprojectY(0, BLOCK));
  for (let by = 0; by < h; by += BLOCK) {
    const byEnd = Math.min(h, by + BLOCK);
    for (let bx = 0; bx < w; bx += BLOCK) {
      const bxEnd = Math.min(w, bx + BLOCK);
      let min = Infinity;
      let max = -Infinity;
      for (const [cx, cy] of [
        [bx, by],
        [bxEnd, by],
        [bx, byEnd],
        [bxEnd, byEnd],
      ] as const) {
        const d = fogDistanceAt(field, worldX(cx, cy), worldY(cx, cy));
        if (d < min) min = d;
        if (d > max) max = d;
      }
      if (min - reach >= band || max + reach <= 0) {
        // Uniform block: fully clear past the band, or solid never-seen black.
        const alpha = max + reach <= 0 ? 255 : 0;
        for (let yy = by; yy < byEnd; yy++) {
          let p = (yy * w + bx) * 4 + 3;
          for (let xx = bx; xx < bxEnd; xx++) {
            data[p] = alpha;
            p += 4;
          }
        }
        continue;
      }
      // Frontier block: the graded ordered-dither stipple, per pixel.
      for (let yy = by; yy < byEnd; yy++) {
        let p = (yy * w + bx) * 4 + 3;
        for (let xx = bx; xx < bxEnd; xx++) {
          const d = fogDistanceAt(field, worldX(xx, yy), worldY(xx, yy));
          let alpha = 0;
          if (d <= 0) {
            alpha = 255; // solid black: never seen
          } else if (d < band) {
            // Dense near the dark (cover→1), thinning toward the clear. The
            // Bayer index is taken on the PROJECTED GROUND GRID: a whole number
            // in the same lattice the buffer's own pixels sit on, so the dots
            // stay pinned to the floor without ever landing between them.
            const cover = 1 - d / band;
            const brow = ((gridY + yy) & 3) << 2;
            const thr =
              ((FOG_BAYER[brow + ((gridX + xx) & 3)] ?? 0) + 0.5) / 16;
            alpha = cover > thr ? 255 : 0;
          }
          data[p] = alpha;
          p += 4;
        }
      }
    }
  }
  buffer.ctx.putImageData(buffer.img, 0, 0);
  fogCompositeKey = { gridX, gridY, field, w, h, projection };
  ctx.drawImage(buffer.canvas, 0, 0);
}
