// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE TRAIL HE LEAVES — bloody boot prints, tracked out of the mess and across
// the clean floor.
//
// The floor already remembers where the fighting was (`./blood-ground.ts`) and
// the hero wears what he did (`../game-screen/hero-soak.ts`). This is the line
// BETWEEN them: he walks through the pool, his boots pick it up, and for the
// next few tiles he prints it onto ground nothing has ever died on. It is the
// one thing on the field that records where he WENT rather than what he did
// there — a map of his own path, drawn by the map itself.
//
// Three decisions carry it.
//
//  1. **A CARRY, NOT A TIMER.** The boot holds a finite amount and spends it one
//     print at a time, so the trail always FADES OUT and always ends: eight or
//     so prints from a soaked tile, fewer from a light one, and topped back up
//     the moment he crosses blood again. A duration would leave him printing at
//     full strength for N seconds and then stopping dead, which reads as a bug.
//
//  2. **THE STEP IS GROUND COVERED, NOT A CLOCK** — the same rule the gait runs
//     on (`./gait.ts`), for the same reason: a print is a FOOT LANDING, so it
//     belongs to a distance, and a hero shoved against a wall stops printing on
//     the spot for free. Its own accumulator rather than a second `walkGait`
//     call, because that tracker measures the step from the last call and a
//     second one in the same frame reads zero.
//
//  3. **PERMANENT, AND BOUNDED BY THE MAP RATHER THAN BY THE RUN.** A print
//     stays for the rest of the level, exactly as the floor's blood does — a
//     trail that faded would be a trail that lies about where he has been. So it
//     cannot be a list that grows with the walking: prints are BUCKETED BY TILE
//     with a small per-tile cap, which bounds the whole record by the map's own
//     area (a few prints per tile is already more than reads as a trail) and
//     keeps the draw to a scan of the tiles in view, like the floor's.
//
// Orientation is quantized to the four compass steps and drawn from two authored
// sprites mirrored — the same two-sprites-four-directions trick the floor's
// fringe uses. Rotating a boot print to an arbitrary bearing would resample the
// art, and the world is drawn square-on anyway.

import type { GameState } from "@game/core";

import { spriteByName, type Sprites } from "../assets.ts";
import { bloodTrackAmount } from "../game-screen/gore-gate.ts";
import { syncHeroGear, wadeHero } from "../game-screen/hero-soak.ts";
import { bloodAt } from "./blood-ground.ts";
import { RUNG_AT } from "./blood-rungs.ts";
import { TILE, type ViewSize } from "./shared.ts";
import { type Camera } from "./view.ts";

/** The print art, wettest first, and how each of the four bearings is drawn from
 * it: `[sprite suffix, flip]` where flip bit 0 mirrors X and bit 1 mirrors Y.
 * Ordered [north, south, east, west] to match `heading`. */
const BEARINGS: readonly ["v" | "h", number][] = [
  ["v", 0], // north — the vertical print as authored, toe up
  ["v", 2], // south — mirrored in Y
  ["h", 0], // east — the horizontal print as authored, toe right
  ["h", 1], // west — mirrored in X
];

/** World px of walking between one print and the next. Half the gait's own
 * stride cycle, because a cycle is two steps and every step leaves a boot. */
const STEP_PX = 12;

/** How far to either side of his line of travel a boot lands (world px). Without
 * it both feet print down the centre line and the trail reads as a smear rather
 * than as somebody walking. */
const STANCE_PX = 3;

/** How much a boot picks up off a fully-soaked tile, in prints' worth, and the
 * floor saturation below which there is nothing to pick up at all — a tile the
 * spray only freckled is not a puddle to step in.
 *
 * STAINING a boot has a lower bar than TRACKING out of it (`WET_FROM`, the
 * floor's own first rung): a few specks are plenty to mark him and nowhere near
 * enough to carry a print to the next tile. One threshold for both was wrong in
 * the obvious direction — his boots stayed clean crossing freckled ground he had
 * visibly just fought over. */
const CARRY_FULL = 9;
const PICKUP_FROM = 40;
const WET_FROM = RUNG_AT[0]!;

/** Carry at which a print drops from the wet sole to the drying partial one, and
 * the carry below which nothing is laid at all. */
const DRY_AT = 3.2;
const CARRY_MIN = 0.2;

/** Alpha a print is drawn at with a boot full of blood, and with the last of it.
 * High, and it has to be: a print lands ON ground the fight has already
 * freckled, in the same three reds, so a faint one is invisible exactly where
 * the trail matters most. What separates it from the spray is that it is DARKER
 * (see the print art) — not that it is fainter. */
const PRINT_ALPHA_MAX = 1;
const PRINT_ALPHA_MIN = 0.55;

/** Prints kept per tile. Small deliberately: this is what makes the record
 * bounded by the MAP rather than by how long the player walks in circles, and
 * more than a few in one 16px cell is mud, not a trail. The oldest in a full
 * tile is overwritten, so pacing the same corridor keeps the latest pass. */
const PRINTS_PER_TILE = 3;

/** A jump beyond this in one frame is a teleport (an elevator, a level warp),
 * not a stride — it lays no prints and banks no distance. */
const TELEPORT_PX = 24;

/** One boot print on the floor: where it landed, which way it was pointing, and
 * how much blood was still on the sole. */
type Print = {
  x: number;
  y: number;
  /** Index into `BEARINGS`. */
  dir: number;
  /** Carry at the moment it was laid — picks the rung and the alpha. */
  carry: number;
};

/** The run this trail belongs to — the same ownership trick the floor's
 * saturation grid uses, so a new level or a retry starts on clean ground. */
let owner: GameState | null = null;
let cols = 0;
let rows = 0;
let prints = new Map<number, Print[]>();

/** The walk, between frames. */
let lastX = 0;
let lastY = 0;
let lastMs = 0;
/** Distance banked toward the next footfall, and which foot is next. */
let sinceStep = 0;
let leftFoot = false;
/** Prints' worth of blood still on the boots. */
let carry = 0;

/** Pre-mirrored print art, keyed `name/flip` — one `drawImage` per print in the
 * draw loop, exactly as the floor's tiles are handled. */
let flipCacheFor: Sprites | null = null;
const flipCache = new Map<string, HTMLCanvasElement | ImageBitmap>();

/** Wipe the trail — a new run, or a hot reload. */
export function resetBloodTracks(): void {
  owner = null;
  cols = 0;
  rows = 0;
  prints = new Map();
  carry = 0;
  sinceStep = 0;
}

function ensureRun(state: GameState): boolean {
  if (owner === state) return true;
  owner = state;
  cols = Math.ceil(state.level.width / TILE);
  rows = Math.ceil(state.level.height / TILE);
  prints = new Map();
  carry = 0;
  sinceStep = 0;
  leftFoot = false;
  lastX = state.player.pos.x;
  lastY = state.player.pos.y;
  lastMs = state.stats.timeMs;
  return false;
}

/**
 * Walk the hero one frame: pick blood up off the floor he is standing on, wet
 * his boots with it, and lay a print every time a foot comes down.
 *
 * Called once per frame from the render pass, like `walkGait` and for the same
 * reason — it measures the step from the last call, so a second one in the same
 * frame reads a step of zero. It is also where the hero's GEAR is checked for a
 * swap: this is the one thing in the blood system that runs every frame whether
 * or not anything died, which makes it the honest place to notice that he put a
 * clean pair of boots on.
 */
export function stepBloodTracks(state: GameState): void {
  const first = !ensureRun(state);
  syncHeroGear(state);
  const amount = bloodTrackAmount();
  const pos = state.player.pos;
  const nowMs = state.stats.timeMs;
  const dtMs = Math.max(0, nowMs - lastMs);
  const dx = pos.x - lastX;
  const dy = pos.y - lastY;
  const moved = Math.hypot(dx, dy);
  const step = first || moved > TELEPORT_PX ? 0 : moved;
  lastX = pos.x;
  lastY = pos.y;
  lastMs = nowMs;
  if (amount == null) return;

  // WHAT IS UNDER HIS BOOTS, read once and used for both halves.
  const sat = bloodAt(pos.x, pos.y);
  // STAINING: anything the floor visibly shows marks him (see `WET_FROM`).
  if (sat > WET_FROM) {
    wadeHero(state, (sat - WET_FROM) / (255 - WET_FROM), dtMs);
  }
  // TRACKING: a real pool tops the carry back UP rather than adding to it — a
  // boot holds what a boot holds, and walking a long pool must not bank a trail
  // that outlasts the level.
  if (sat > PICKUP_FROM) {
    carry = Math.max(
      carry,
      ((sat - PICKUP_FROM) / (255 - PICKUP_FROM)) * CARRY_FULL,
    );
  }
  if (step <= 0) return;

  sinceStep += step;
  const dir = bearingOf(dx, dy);
  // The stance offset is PERPENDICULAR to travel, so the two feet straddle the
  // line he is walking down whichever way that is.
  const nx = -dy / moved;
  const ny = dx / moved;
  while (sinceStep >= STEP_PX) {
    sinceStep -= STEP_PX;
    if (carry <= CARRY_MIN) {
      carry = 0;
      continue;
    }
    leftFoot = !leftFoot;
    const side = leftFoot ? STANCE_PX : -STANCE_PX;
    stamp(pos.x + nx * side, pos.y + ny * side, dir);
    carry = Math.max(0, carry - 1);
  }
}

/** Lay one print into its tile's bucket, evicting the oldest when the tile is
 * already full — the cap that keeps the whole record bounded by the map's area
 * however long the player paces the same corridor. */
function stamp(x: number, y: number, dir: number): void {
  const tx = Math.floor(x / TILE);
  const ty = Math.floor(y / TILE);
  if (tx < 0 || ty < 0 || tx >= cols || ty >= rows) return;
  const key = ty * cols + tx;
  let bucket = prints.get(key);
  if (!bucket) {
    bucket = [];
    prints.set(key, bucket);
  }
  if (bucket.length >= PRINTS_PER_TILE) bucket.shift();
  bucket.push({ x, y, dir, carry });
}

/** Which of the four bearings a movement delta points along. Quantized to the
 * compass because the print is authored art, and rotating pixel art to an
 * arbitrary angle resamples it — the same reason the floor's fringe covers four
 * directions with two sprites. */
function bearingOf(dx: number, dy: number): number {
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 2 : 3;
  return dy >= 0 ? 1 : 0;
}

/** The print art for `name`, mirrored per `flip` (bit 0 = X, bit 1 = Y). */
function flipped(
  sprites: Sprites,
  name: string,
  flip: number,
): HTMLCanvasElement | ImageBitmap | null {
  if (flipCacheFor !== sprites) {
    flipCacheFor = sprites;
    flipCache.clear();
  }
  const key = `${name}/${flip}`;
  const cached = flipCache.get(key);
  if (cached) return cached;
  const art = spriteByName(sprites, name);
  if (!art) return null;
  if (flip === 0) {
    flipCache.set(key, art);
    return art;
  }
  const canvas = document.createElement("canvas");
  canvas.width = art.width;
  canvas.height = art.height;
  const g = canvas.getContext("2d");
  if (!g) return art;
  g.imageSmoothingEnabled = false;
  g.translate(flip & 1 ? art.width : 0, flip & 2 ? art.height : 0);
  g.scale(flip & 1 ? -1 : 1, flip & 2 ? -1 : 1);
  g.drawImage(art, 0, 0);
  flipCache.set(key, canvas);
  return canvas;
}

/**
 * Draw the trail under the frame — one pass over the tiles in view, skipping
 * every tile nobody has walked across, so the cost is bounded by the SCREEN
 * rather than by how far the player has walked.
 */
export function drawBloodTracks(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  sprites: Sprites,
  camera: Camera,
  view: ViewSize,
): void {
  if (owner !== state || prints.size === 0) return;
  // The trail is not drawn at all once the gore gate is shut — and this is NOT
  // the draw-time gate the blood system forbids. Nothing has been RECORDED while
  // it was shut (`stepBloodTracks` stops at the same check), so there is no
  // hidden pile to hand back; a player who turns BOOTPRINTS (or HUMAN GORE itself)
  // off mid-run gets a clean floor immediately and, turning it back on, exactly
  // the trail he had.
  if (bloodTrackAmount() == null) return;
  const tx0 = Math.max(0, Math.floor(camera.x / TILE) - 1);
  const ty0 = Math.max(0, Math.floor(camera.y / TILE) - 1);
  const tx1 = Math.min(
    cols - 1,
    Math.floor((camera.x + view.width) / TILE) + 1,
  );
  const ty1 = Math.min(
    rows - 1,
    Math.floor((camera.y + view.height) / TILE) + 1,
  );
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const bucket = prints.get(ty * cols + tx);
      if (!bucket) continue;
      for (const print of bucket) {
        const [kind, flip] = BEARINGS[print.dir] ?? BEARINGS[0]!;
        const wet = print.carry >= DRY_AT;
        const art = flipped(sprites, `blood_print_${kind}${wet ? 0 : 1}`, flip);
        if (!art) continue;
        const into = Math.min(1, print.carry / CARRY_FULL);
        ctx.globalAlpha =
          PRINT_ALPHA_MIN + (PRINT_ALPHA_MAX - PRINT_ALPHA_MIN) * into;
        ctx.drawImage(
          art,
          Math.round(print.x - camera.x - art.width / 2),
          Math.round(print.y - camera.y - art.height / 2),
        );
      }
    }
  }
  ctx.globalAlpha = 1;
}

/** How many prints are on the floor — the probe the tests and the debug
 * diagnostics read. */
export function bloodPrintCount(): number {
  let n = 0;
  for (const bucket of prints.values()) n += bucket.length;
  return n;
}
