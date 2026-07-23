// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Fog of war — over the world, under the HUD/flash (StarCraft/Warcraft): the
// unwalked map is dark, terrain seen-but-out-of-sight dims, and the hero's
// live sight circle stays clear. The distance-to-frontier field computed here
// is shared with the mob cull in the enemies pass, so a mob is only drawn on
// ground the hero has actually uncovered.

import { MAP, mapCols, type GameState } from "@game/core";

import { type Camera } from "./view.ts";
import { type ViewSize } from "./shared.ts";

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
// distance ramp into a crisp pixel stipple. Indexed in WORLD space so the dots
// stay pinned to the ground as the camera pans, not crawling with the view.
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
export function drawFog(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  view: ViewSize,
  field: FogField,
): void {
  const buffer = ensureFogBuffer(view.width, view.height);
  if (!buffer) return;
  const cell = MAP.cellSize;
  const band = MAP.fogBand;
  const { cols, rows, dist } = field;
  const w = view.width;
  const h = view.height;
  const data = buffer.img.data;
  // 1 buffer px == 1 world unit; floor the camera so the world-locked Bayer
  // index and the ground blit agree to the pixel.
  const camX = Math.floor(camera.x);
  const camY = Math.floor(camera.y);
  let p = 0;
  for (let by = 0; by < h; by++) {
    const wy = camY + by;
    const fy = wy / cell - 0.5;
    const y0 = Math.floor(fy);
    const ty = fy - y0;
    const y0in = y0 >= 0 && y0 < rows;
    const y1in = y0 + 1 >= 0 && y0 + 1 < rows;
    const row0 = y0 * cols;
    const row1 = row0 + cols;
    const brow = (wy & 3) << 2;
    for (let bx = 0; bx < w; bx++) {
      const wx = camX + bx;
      const fx = wx / cell - 0.5;
      const x0 = Math.floor(fx);
      const tx = fx - x0;
      const x0in = x0 >= 0 && x0 < cols;
      const x1in = x0 + 1 >= 0 && x0 + 1 < cols;
      const d00 = y0in && x0in ? (dist[row0 + x0] ?? 0) : 0;
      const d10 = y0in && x1in ? (dist[row0 + x0 + 1] ?? 0) : 0;
      const d01 = y1in && x0in ? (dist[row1 + x0] ?? 0) : 0;
      const d11 = y1in && x1in ? (dist[row1 + x0 + 1] ?? 0) : 0;
      const top = d00 + (d10 - d00) * tx;
      const bot = d01 + (d11 - d01) * tx;
      const d = top + (bot - top) * ty;
      let alpha = 0;
      if (d <= 0) {
        alpha = 255; // solid black: never seen
      } else if (d < band) {
        // Dense near the dark (cover→1), thinning toward the clear (cover→0).
        const cover = 1 - d / band;
        const thr = ((FOG_BAYER[brow + (wx & 3)] ?? 0) + 0.5) / 16;
        alpha = cover > thr ? 255 : 0;
      }
      data[p + 3] = alpha;
      p += 4;
    }
  }
  buffer.ctx.putImageData(buffer.img, 0, 0);
  ctx.drawImage(buffer.canvas, 0, 0);
}
