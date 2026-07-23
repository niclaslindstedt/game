// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The live HUD minimap: a World-of-Warcraft-style hub in the upper HUD that
// shows the actual fog-of-war level (not a static icon). The survival timer
// plate sits centered on the top of the map (and doubles as the PAUSE target,
// the same tap the old clock owned), the RAMPAGE meter fills and reddens as a
// gauge around the rounded-rect border (it replaced the row of pips), and a
// strip below the map carries the rampage STAGE on the left and the kill tally
// ("N kills") on the right. Tapping the map body opens the full-screen
// `MapOverlay` (the expand). The map itself is the same chunky fog-of-war
// render as the overlay, refreshed every frame from the render loop via
// `drawMinimap`, in one of two views (SETTINGS → DISPLAY → MINIMAP): the
// whole level contain-fit into the frame (letterboxed in fog — the default),
// or a close-up window hovering over the hero, drawn from a higher-resolution
// terrain layer so the ground sprites read clearly at that zoom.

import { useEffect, useRef, type RefObject } from "react";

import {
  MAP,
  mapCols,
  mapRows,
  isExplored,
  type GameState,
  type MapMarkerKind,
  type TileSpec,
} from "@game/core";

import { clamp01 } from "@game/lib/vec.ts";
import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

import { spriteByName, type GameAssets, type Sprites } from "./assets.ts";
import { getSettings } from "./settings.ts";

/** Backing-store pixels per fog cell in the cached terrain layer — the map's
 * chunky "pixel" size, matched to the full map overlay. */
const CELL_PX = 4;

/** Fog cells across the FOLLOW view's width — the close-up zoom. A dozen
 * cells (384 world px) is roughly the phone's near view, so the hovering
 * minimap reads as a true satellite pass over the fight. */
const FOLLOW_VIEW_CELLS = 12;

/** Backing-store pixels per fog cell in the FOLLOW terrain layer — high
 * enough that the ground tiles' own pixels survive into the close-up instead
 * of collapsing to a 4-px smear like the whole-level view's cells. */
const FOLLOW_CELL_PX = 16;

const FOG_COLOR = "#0b0d10";

/** Blip color per marker kind — at minimap scale the shaped pins of the full
 * map read as mud, so the minimap speaks in the same color language as dots
 * (the expanded overlay keeps the proper shaped markers + legend). */
const BLIP_COLOR: Record<MapMarkerKind, string> = {
  story: "#ffd24a",
  elite: "#ff9040",
  boss: "#ff3020",
  merchant: "#ffcf3a",
};

/** How many rampage stages fill the ring gauge (mirrors the old pip count). */
export const RAMPAGE_MAX = 10;

/** The rampage ring's color ramp — the same escalation the pips used. */
export function rampageColor(stage: number): string {
  if (stage >= 8) return "#ff3020";
  if (stage >= 5) return "#ff5030";
  if (stage >= 2) return "#ff9040";
  return "#ffd050";
}

/** The ground sprite for a world position — the level-wide pair, or the zone's
 * own where a `TileSpec.zones` rect covers it (mirrors MapOverlay). */
function groundSpriteFor(
  sprites: Sprites,
  tiles: TileSpec,
  wx: number,
  wy: number,
) {
  const zone = tiles.zones?.find(
    (z) =>
      wx >= z.rect.x &&
      wx < z.rect.x + z.rect.width &&
      wy >= z.rect.y &&
      wy < z.rect.y + z.rect.height,
  );
  return spriteByName(sprites, (zone?.ground ?? tiles.ground).common);
}

/** The cached, whole-level terrain layer for a minimap canvas: painted whole
 * once per level, then patched INCREMENTALLY as the explored frontier grows (a
 * handful of times a second as the hero walks — only the cells around him
 * change, so only those repaint), and blitted each frame. `snapshot` is the
 * explored grid as of the last paint, the diff base for the patch. Keyed off
 * the canvas element so a remount gets a fresh cache. */
type TerrainCache = {
  off: HTMLCanvasElement;
  explored: number;
  levelId: string;
  cols: number;
  rows: number;
  /** The layer's resolution (px per fog cell) — the FOLLOW view paints at a
   * higher one, so flipping the setting mid-run rebuilds the layer. */
  cellPx: number;
  snapshot: Uint8Array;
};
const terrainCaches = new WeakMap<HTMLCanvasElement, TerrainCache>();

/** Count revealed fog cells — cheap enough to run per frame, and the only
 * signal we need to know the terrain layer is stale. */
function exploredCount(explored: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < explored.length; i++) if (explored[i] === 1) n++;
  return n;
}

/** The minimap canvas's CSS size, tracked by a ResizeObserver instead of read
 * off `clientWidth`/`clientHeight` every frame — those getters force a layout
 * flush, which at 60 draws a second was the single most expensive line of the
 * whole minimap. */
const cssSizes = new WeakMap<HTMLCanvasElement, { w: number; h: number }>();
function cssSizeOf(canvas: HTMLCanvasElement): { w: number; h: number } {
  let size = cssSizes.get(canvas);
  if (!size) {
    size = { w: canvas.clientWidth, h: canvas.clientHeight };
    cssSizes.set(canvas, size);
    const observer = new ResizeObserver(() => {
      const s = cssSizes.get(canvas);
      if (s) {
        s.w = canvas.clientWidth;
        s.h = canvas.clientHeight;
      }
    });
    observer.observe(canvas);
  }
  return size;
}

/** Repaint one rectangular region of the terrain layer [cx0..cx1]×[cy0..cy1]
 * (cell coordinates, inclusive) at `cellPx` px per fog cell: fog base,
 * explored ground, the frontier penumbra, and the architecture outlines
 * clipped to the box. The full level paint and the incremental frontier patch
 * both route through here — the patch just passes the few cells around the
 * hero instead of the whole grid. */
function paintTerrainRegion(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  assets: GameAssets,
  cols: number,
  rows: number,
  cx0: number,
  cy0: number,
  cx1: number,
  cy1: number,
  cellPx: number,
) {
  cx0 = Math.max(0, cx0);
  cy0 = Math.max(0, cy0);
  cx1 = Math.min(cols - 1, cx1);
  cy1 = Math.min(rows - 1, cy1);
  if (cx1 < cx0 || cy1 < cy0) return;

  const cellAt = (tx: number, ty: number) =>
    tx >= 0 && ty >= 0 && tx < cols && ty < rows
      ? state.explored[ty * cols + tx]
      : undefined;

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = FOG_COLOR;
  ctx.fillRect(
    cx0 * cellPx,
    cy0 * cellPx,
    (cx1 - cx0 + 1) * cellPx,
    (cy1 - cy0 + 1) * cellPx,
  );

  for (let ty = cy0; ty <= cy1; ty++) {
    for (let tx = cx0; tx <= cx1; tx++) {
      if (cellAt(tx, ty) !== 1) continue;
      const sprite = groundSpriteFor(
        assets.sprites,
        state.level.tiles,
        (tx + 0.5) * MAP.cellSize,
        (ty + 0.5) * MAP.cellSize,
      );
      if (sprite)
        ctx.drawImage(sprite, tx * cellPx, ty * cellPx, cellPx, cellPx);
    }
  }

  // The fog's penumbra: explored cells bordering the dark get a half-shade.
  ctx.fillStyle = "rgba(11, 13, 16, 0.5)";
  for (let ty = cy0; ty <= cy1; ty++) {
    for (let tx = cx0; tx <= cx1; tx++) {
      if (cellAt(tx, ty) !== 1) continue;
      if (
        cellAt(tx - 1, ty) === 0 ||
        cellAt(tx + 1, ty) === 0 ||
        cellAt(tx, ty - 1) === 0 ||
        cellAt(tx, ty + 1) === 0
      ) {
        ctx.fillRect(tx * cellPx, ty * cellPx, cellPx, cellPx);
      }
    }
  }

  // Architecture outlines under the lifted fog — clipped to the box so a
  // repaint never restacks the translucent fill on pixels outside it.
  ctx.save();
  ctx.beginPath();
  ctx.rect(
    cx0 * cellPx,
    cy0 * cellPx,
    (cx1 - cx0 + 1) * cellPx,
    (cy1 - cy0 + 1) * cellPx,
  );
  ctx.clip();
  const s = cellPx / MAP.cellSize;
  const boxX0 = (cx0 * MAP.cellSize) | 0;
  const boxY0 = (cy0 * MAP.cellSize) | 0;
  const boxX1 = ((cx1 + 1) * MAP.cellSize) | 0;
  const boxY1 = ((cy1 + 1) * MAP.cellSize) | 0;
  for (const obstacle of state.obstacles) {
    if (!isExplored(state, obstacle.pos)) continue;
    const halfW = obstacle.half?.x ?? obstacle.radius;
    const halfH = obstacle.half?.y ?? obstacle.radius;
    // Skip anything whose footprint can't touch the repainted box.
    if (
      obstacle.pos.x + halfW < boxX0 ||
      obstacle.pos.x - halfW > boxX1 ||
      obstacle.pos.y + halfH < boxY0 ||
      obstacle.pos.y - halfH > boxY1
    ) {
      continue;
    }
    ctx.fillStyle =
      obstacle.kind === "door_locked" ? "#c46a3a" : "rgba(16, 19, 27, 0.75)";
    ctx.fillRect(
      Math.round((obstacle.pos.x - halfW) * s),
      Math.round((obstacle.pos.y - halfH) * s),
      Math.max(1, Math.round(halfW * 2 * s)),
      Math.max(1, Math.round(halfH * 2 * s)),
    );
  }
  ctx.restore();
}

/** Paint the whole level's fog-of-war terrain (explored ground under lifted
 * fog, architecture outlines, a soft frontier penumbra) into the offscreen
 * layer at `cellPx` px per fog cell. No markers — those ride live on top each
 * frame. */
function drawTerrain(
  off: HTMLCanvasElement,
  state: GameState,
  assets: GameAssets,
  cellPx: number,
) {
  const cols = mapCols(state.level);
  const rows = mapRows(state.level);
  off.width = cols * cellPx;
  off.height = rows * cellPx;
  const ctx = off.getContext("2d");
  if (!ctx) return;
  paintTerrainRegion(
    ctx,
    state,
    assets,
    cols,
    rows,
    0,
    0,
    cols - 1,
    rows - 1,
    cellPx,
  );
}

/** Patch the terrain layer for the cells explored since `snapshot`: repaint
 * the bounding box of the freshly uncovered cells padded by one (the penumbra
 * of a neighbor can flip when a cell clears). The hero uncovers a small disc
 * around himself, so the box is a handful of cells — not the whole level. */
function patchTerrain(
  off: HTMLCanvasElement,
  state: GameState,
  assets: GameAssets,
  cols: number,
  rows: number,
  snapshot: Uint8Array,
  cellPx: number,
) {
  const ctx = off.getContext("2d");
  if (!ctx) return;
  const explored = state.explored;
  let cx0 = Infinity;
  let cy0 = Infinity;
  let cx1 = -Infinity;
  let cy1 = -Infinity;
  for (let i = 0; i < explored.length; i++) {
    if (explored[i] === snapshot[i]) continue;
    const tx = i % cols;
    const ty = (i / cols) | 0;
    if (tx < cx0) cx0 = tx;
    if (tx > cx1) cx1 = tx;
    if (ty < cy0) cy0 = ty;
    if (ty > cy1) cy1 = ty;
  }
  if (cx1 < cx0) return; // count moved but nothing actually flipped
  paintTerrainRegion(
    ctx,
    state,
    assets,
    cols,
    rows,
    cx0 - 1,
    cy0 - 1,
    cx1 + 1,
    cy1 + 1,
    cellPx,
  );
}

/** Draw the live minimap into `canvas`: the terrain (whole level contain-fit
 * into the frame, or — in the FOLLOW view — a close-up window centered on the
 * hero), then the event blips, black holes, and the hero's own pin over the
 * top. Called every frame from the render loop, so the heavy terrain paint is
 * cached and only the light overlay is redone. */
export function drawMinimap(
  canvas: HTMLCanvasElement,
  state: GameState,
  assets: GameAssets,
) {
  // Size the backing store to the frame's device pixels; only reset (which
  // clears the canvas) when it actually changes.
  const dpr = window.devicePixelRatio || 1;
  const { w: cssW, h: cssH } = cssSizeOf(canvas);
  if (cssW === 0 || cssH === 0) return;
  const bw = Math.round(cssW * dpr);
  const bh = Math.round(cssH * dpr);
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;

  const cols = mapCols(state.level);
  const rows = mapRows(state.level);
  const follow = getSettings().minimapMode === "follow";
  const cellPx = follow ? FOLLOW_CELL_PX : CELL_PX;
  let cache = terrainCaches.get(canvas);
  const explored = exploredCount(state.explored);
  if (
    !cache ||
    cache.levelId !== state.level.id ||
    cache.cols !== cols ||
    cache.rows !== rows ||
    cache.cellPx !== cellPx
  ) {
    // New level, first frame, or a view flip (the resolution changed): paint
    // the whole layer once.
    const off = cache?.off ?? document.createElement("canvas");
    drawTerrain(off, state, assets, cellPx);
    cache = {
      off,
      explored,
      levelId: state.level.id,
      cols,
      rows,
      cellPx,
      snapshot: state.explored.slice(),
    };
    terrainCaches.set(canvas, cache);
  } else if (cache.explored !== explored) {
    // The frontier grew: patch just the cells that flipped since last paint.
    patchTerrain(cache.off, state, assets, cols, rows, cache.snapshot, cellPx);
    cache.snapshot.set(state.explored);
    cache.explored = explored;
  }

  ctx.fillStyle = FOG_COLOR;
  ctx.fillRect(0, 0, bw, bh);
  const off = cache.off;
  const worldW = cols * MAP.cellSize;
  const worldH = rows * MAP.cellSize;

  // World px → minimap backing px, set per view below.
  let toX: (x: number) => number;
  let toY: (y: number) => number;

  if (follow) {
    // The close-up: a fixed-width world window centered on the hero, so the
    // map hovers over him as he moves. Fog fills whatever the window hangs
    // past the level's edge.
    const scale = bw / (FOLLOW_VIEW_CELLS * MAP.cellSize);
    const viewW = bw / scale;
    const viewH = bh / scale;
    const vx = state.player.pos.x - viewW / 2;
    const vy = state.player.pos.y - viewH / 2;
    const src = cellPx / MAP.cellSize;
    const wx0 = Math.max(0, vx);
    const wy0 = Math.max(0, vy);
    const wx1 = Math.min(worldW, vx + viewW);
    const wy1 = Math.min(worldH, vy + viewH);
    if (wx1 > wx0 && wy1 > wy0) {
      ctx.drawImage(
        off,
        wx0 * src,
        wy0 * src,
        (wx1 - wx0) * src,
        (wy1 - wy0) * src,
        (wx0 - vx) * scale,
        (wy0 - vy) * scale,
        (wx1 - wx0) * scale,
        (wy1 - wy0) * scale,
      );
    }
    toX = (x) => (x - vx) * scale;
    toY = (y) => (y - vy) * scale;
  } else {
    // Contain-fit the whole level into the frame, centered; fog fills the
    // letterbox so the bars are invisible against the frame background.
    const fit = Math.min(bw / off.width, bh / off.height);
    const dw = off.width * fit;
    const dh = off.height * fit;
    const dx = (bw - dw) / 2;
    const dy = (bh - dh) / 2;
    ctx.drawImage(off, dx, dy, dw, dh);
    toX = (x) => dx + (x / worldW) * dw;
    toY = (y) => dy + (y / worldH) * dh;
  }
  const dot = (x: number, y: number, r: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(toX(x), toY(y), r * dpr, 0, Math.PI * 2);
    ctx.fill();
  };

  // Black holes: a violet blip (rift only).
  for (const well of state.wells) {
    dot(well.pos.x, well.pos.y, 2, "rgba(138, 108, 224, 0.9)");
  }
  // Event blips: only where the hero has been (the full map shows the rest).
  for (const marker of state.mapMarkers) {
    if (!isExplored(state, marker.pos)) continue;
    dot(marker.pos.x, marker.pos.y, 1.8, BLIP_COLOR[marker.kind]);
  }
  // The hero's own pin: a bright green dot ringed dark so it reads over any
  // terrain, always shown.
  const px = toX(state.player.pos.x);
  const py = toY(state.player.pos.y);
  ctx.fillStyle = "rgba(11,13,16,0.9)";
  ctx.beginPath();
  ctx.arc(px, py, 3.2 * dpr, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#6ff06a";
  ctx.beginPath();
  ctx.arc(px, py, 2 * dpr, 0, Math.PI * 2);
  ctx.fill();
}

/** A rounded-rect path string starting at the top-center and running
 * clockwise, so the rampage gauge grows away from the timer plate at the top.
 * Inset by half the stroke so the border isn't clipped by the viewBox. */
function ringPath(w: number, h: number, r: number, inset: number): string {
  const x0 = inset;
  const y0 = inset;
  const x1 = w - inset;
  const y1 = h - inset;
  const cx = w / 2;
  return [
    `M ${cx} ${y0}`,
    `H ${x1 - r}`,
    `A ${r} ${r} 0 0 1 ${x1} ${y0 + r}`,
    `V ${y1 - r}`,
    `A ${r} ${r} 0 0 1 ${x1 - r} ${y1}`,
    `H ${x0 + r}`,
    `A ${r} ${r} 0 0 1 ${x0} ${y1 - r}`,
    `V ${y0 + r}`,
    `A ${r} ${r} 0 0 1 ${x0 + r} ${y0}`,
    `Z`,
  ].join(" ");
}

/** The rampage ring: a dim always-on track with a colored fraction filled over
 * it, drawn on the rounded-rect border. `stage` is the menace stage (0 hides
 * the fill entirely, `RAMPAGE_MAX`+ fills the whole ring). */
function RampageRing({ stage }: { stage: number }) {
  // A fixed viewBox; the SVG scales to the frame via CSS. Corner radius and
  // stroke are in these viewBox units.
  const W = 100;
  const H = 66;
  const R = 8;
  const SW = 4;
  const path = ringPath(W, H, R, SW / 2);
  const frac = clamp01(stage / RAMPAGE_MAX);
  const color = rampageColor(stage);
  return (
    <svg
      className="hud-minimap-ring"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <path
        d={path}
        fill="none"
        stroke="rgba(255,255,255,0.14)"
        strokeWidth={SW}
      />
      {frac > 0 && (
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth={SW}
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={`${frac} 1`}
          style={{ filter: `drop-shadow(0 0 2px ${color})` }}
        />
      )}
    </svg>
  );
}

/** The live kill tally, jolting on every kill so a fresh frag is felt. The jolt
 * scales with the recent kill rate: a lone kill is a small nudge, but a burst —
 * several mobs downed inside a one-second window — stacks into a hard, wide
 * shake. Reads "N kills" at the right of the strip under the minimap. */
function KillCounter({ font, kills }: { font: PixelFont; kills: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const prevKills = useRef(kills);
  const recent = useRef<number[]>([]);

  useEffect(() => {
    const delta = kills - prevKills.current;
    prevKills.current = kills;
    if (delta <= 0) return; // resets (retry) and no-ops don't shake
    const el = ref.current;
    if (!el) return;

    const now = performance.now();
    for (let i = 0; i < delta; i++) recent.current.push(now);
    recent.current = recent.current.filter((t) => now - t <= 1000);
    const burst = recent.current.length;

    const amp = Math.min(3 + (burst - 1) * 1.6, 12);
    const rot = Math.min(1.5 + (burst - 1) * 1.1, 9);
    const dur = Math.min(160 + (burst - 1) * 24, 420);
    el.style.setProperty("--shake-amp", `${amp}px`);
    el.style.setProperty("--shake-rot", `${rot}deg`);
    el.style.setProperty("--shake-dur", `${dur}ms`);

    // Restart the animation from the top on every kill.
    el.classList.remove("kill-shake");
    void el.offsetWidth;
    el.classList.add("kill-shake");
  }, [kills]);

  return (
    <div ref={ref} className="hud-kills" aria-hidden>
      <PixelText
        font={font}
        text={`${kills} kills`}
        scale={1}
        color="#f4f4f4"
      />
    </div>
  );
}

export function Minimap({
  font,
  hudFont,
  canvasRef,
  timerText,
  kills,
  menaceStage,
  onExpand,
  onPause,
}: {
  font: PixelFont;
  /** The taller HUD font for the strip readouts (see assets.hudFont). */
  hudFont: PixelFont;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  timerText: string;
  kills: number;
  menaceStage: number;
  onExpand: () => void;
  onPause: () => void;
}) {
  return (
    <div className="hud-minimap">
      <div className="hud-minimap-map">
        <button
          type="button"
          className="hud-minimap-frame"
          aria-label="open-map"
          onClick={onExpand}
        >
          <canvas ref={canvasRef} className="hud-minimap-canvas" />
        </button>
        <RampageRing stage={menaceStage} />
        {/* PAUSE hit-zone — the upper strip of the map plus the corner above
            the timer (the whole upper-right of the HUD), so pausing is an easy,
            fat target instead of the tiny clock plate. Laid over the frame's
            top so a tap here pauses (the tap the old clock owned) while the map
            body below still opens the full map. */}
        <button
          type="button"
          className="hud-minimap-pause"
          aria-label="pause"
          onClick={(e) => {
            e.stopPropagation();
            onPause();
          }}
        />
        {/* Timer plate — centered at the top of the map (the WoW-clock spot).
            Presentational now: the pause hit-zone above owns the tap, so this
            lets taps fall through to it (pointer-events: none). */}
        <div className="hud-minimap-timer" aria-hidden>
          <PixelText font={font} text={timerText} scale={2} />
        </div>
      </div>
      {/* The strip under the map: the rampage stage on the left (hot-colored,
          shown only while the meter is up) and the kill tally on the right. */}
      <div className="hud-minimap-strip" aria-hidden>
        <span className="hud-minimap-rampage">
          {menaceStage > 0 && (
            <PixelText
              font={hudFont}
              text={`RAMPAGE ${menaceStage}`}
              scale={1}
              color="#f4f4f4"
            />
          )}
        </span>
        <KillCounter font={hudFont} kills={kills} />
      </div>
    </div>
  );
}
