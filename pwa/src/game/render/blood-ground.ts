// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE BLOOD THAT STAYS — the floor a fight was had on.
//
// A spray is over in a third of a second; what makes a cleared field read as a
// cleared field is what it left behind. So the ground REMEMBERS, and the ground
// the hero fought his way across is visibly redder than the ground he hasn't
// reached yet — with the bodies long gone.
//
// **IT IS ONE BYTE PER TILE, AND THAT IS THE WHOLE RECORD.** The obvious build
// is a list of stains — a sprite, a position and an alpha per splat, redrawn
// every frame. Ten minutes of a horde map is tens of thousands of them, so the
// cost of a floor grows with the number of things that have died on it, and
// keeping it affordable means throwing old blood away. Instead the floor is a
// `Uint8Array` of SATURATION over the level's tile grid: painting is `+=`,
// drawing is one blit per bloodied tile in view, and the biggest map in the game
// costs 28 KB — for the WHOLE map, permanently. Nothing is ever evicted, nothing
// decays, and a floor with forty thousand hits on it costs exactly what a floor
// with forty does, because the record was never a list in the first place.
//
// Three things make a grid of squares read as spilled blood rather than as a
// grid of squares:
//
//  1. **A LADDER, NOT A SWITCH.** Four authored rungs (`blood_tile_0..3`) run
//     from a few scattered specks to soaked-through, two variants each, and the
//     tile's own hash picks the variant and mirrors it on both axes — eight
//     looks per rung, from eight sprites. Within a rung the alpha ramps with the
//     saturation, so a tile darkens smoothly and only CHANGES ART when it has
//     genuinely gained a rung. The light rungs are drawn inset and the heavy
//     ones run edge to edge, which is what makes a patch stop reading as
//     separate marks and start reading as ground once it thickens.
//
//  2. **THE NEIGHBOURS DECIDE HOW FAR A TILE MAY GO.** Two rules, both off the
//     WEAKEST of the four neighbours (a min, not an average — an average bleeds
//     the effect outward past the edge of the mess and the whole thing goes
//     soft). First, a tile may only climb ONE RUNG ABOVE its neighbourhood: an
//     isolated cell caps at the patchy rung however much blood landed in it,
//     because the soaked rung is opaque edge to edge and one of those on its own
//     is a red SQUARE — the single ugliest thing this system can draw. Second,
//     a tile whose neighbours are all bloodied gets the soaked tile laid over it
//     AGAIN, at an alpha off both the neighbourhood and its own saturation. The
//     two together are what turn a scatter of independently-stained cells into
//     one red field: the interior fills in, the rim stays ragged, and nothing
//     had to be autotiled into sixteen corner variants.
//
//  3. **IT IS WET.** Standing blood catches the light, and a floor that doesn't
//     is a floor someone painted. Soaked tiles carry an additive specular glint
//     (`blood_gloss_0..2`) that walks its three frames on the render clock with
//     a per-tile phase, so the highlights travel and twinkle out of step instead
//     of pulsing as one. Additive and faint — it is a sheen on a dark liquid,
//     not a light source.
//
// The whole feature is gated on the EXTRA GORE setting, checked by the caller
// (`bloodBlow`) before anything reaches here.

import { type GameState } from "@game/core";

import { spriteByName, type Sprites } from "../assets.ts";
import { type BloodSpill } from "../game-screen/blood-hit.ts";
import { tileHash } from "./ground-tiles.ts";
import { TILE, type ViewSize } from "./shared.ts";
import { type Camera } from "./view.ts";

/** The saturation ladder's four rungs, two variants each. The tile's hash picks
 * a variant and mirrors it, so eight sprites cover every cell on the map. */
const RUNGS = [
  ["blood_tile_0a", "blood_tile_0b"],
  ["blood_tile_1a", "blood_tile_1b"],
  ["blood_tile_2a", "blood_tile_2b"],
  ["blood_tile_3a", "blood_tile_3b"],
];
/** The soaked rung, reused as the wash a surrounded tile gets laid over it. */
const WASH_RUNG = 3;
/** The travelling specular glint, walked on the render clock. */
const GLOSS_FRAMES = ["blood_gloss_0", "blood_gloss_1", "blood_gloss_2"];

/** Saturation (0–255) at which each rung takes over. A tile spends most of its
 * life on the lower rungs — a single hit should stain a floor, not soak it.
 *
 * The FIRST entry is a floor as much as a rung: a spray's outermost reach barely
 * wets the tiles it touches, and drawing those lays a wide even pink haze over
 * everything within throwing distance, which reads as a rash rather than as
 * spatter. Below it a tile stays clean, so the mess keeps a shape. */
const RUNG_AT = [16, 52, 112, 190];
/** Alpha a rung is drawn at when it has only just been reached, and when it is
 * about to hand over to the next one. The ramp between them is what makes a
 * stain darken continuously instead of stepping. */
const RUNG_ALPHA_MIN = 0.45;
const RUNG_ALPHA_MAX = 1;

/** How bloodied the WEAKEST neighbour must be before the wash starts, and the
 * alpha it reaches when every neighbour is soaked through. Well under 1: the
 * wash is there to close the gaps between heavily stained cells, and a wash that
 * can reach opacity on its own paints rectangles. */
const WASH_FROM = 96;
const WASH_ALPHA = 0.5;

/** Saturation a tile needs before it is wet enough to shine, and the peak alpha
 * of the glint. The threshold sits at the heavy rung rather than at the soaked
 * one: a single fresh kill's pool has to catch the light, or the shine only ever
 * shows up in a massacre. Faint even so — additive light over a dark liquid goes
 * garish fast. */
const GLOSS_FROM = 112;
const GLOSS_ALPHA = 0.3;
/** Ms per glint frame, and the period of the per-tile twinkle. Both slow — a
 * fast sparkle reads as damage to the screen, not as a wet floor. */
const GLOSS_FRAME_MS = 260;
const GLOSS_TWINKLE_MS = 2200;

/** The ground plane is seen at a shallow angle, so a spill spreads wider than it
 * is deep — the same squash the dust, the spray and every ground ring use. */
const FLATTEN = 0.42;

/** Saturation added at the very centre of a full-strength spill. A hit is worth
 * a fraction of this, so a tile takes a proper mauling to soak through. */
const SPILL_UNIT = 255;

/** The run this floor belongs to. `step()` mutates the state in place, so the
 * object identity IS the run: a new level, a retry after a death, or a fresh
 * mount hands us a different object and the floor comes up clean. */
let owner: GameState | null = null;
let sat = new Uint8Array(0);
let cols = 0;
let rows = 0;

/** Pre-mirrored tile art, keyed `name/flip`. Four flips of eight 16×16 sprites
 * is a few KB, and it keeps the draw loop to one `drawImage` per tile — a
 * save/translate/scale/restore per tile is the one thing that would make a
 * screenful of bloodied floor cost real time. Keyed by the Sprites instance so a
 * hot reload drops it with everything else. */
let flipCacheFor: Sprites | null = null;
const flipCache = new Map<string, HTMLCanvasElement | ImageBitmap>();

/** Wipe the floor — a new run, or a hot reload. */
export function resetBloodGround(): void {
  owner = null;
  sat = new Uint8Array(0);
  cols = 0;
  rows = 0;
}

function ensureGrid(state: GameState): void {
  if (owner === state) return;
  owner = state;
  cols = Math.ceil(state.level.width / TILE);
  rows = Math.ceil(state.level.height / TILE);
  sat = new Uint8Array(cols * rows);
}

/**
 * Wet the floor. Called once per bleeding blow — everything after this is a byte
 * per tile, so a caller never has to hold on to what it spilled.
 *
 * Each spill is an ellipse (squashed by the view angle) whose strength falls off
 * toward its rim, JITTERED per tile off the same hash the ground tiles use: a
 * clean elliptical falloff lays down a visible oval, and blood does not land in
 * ovals.
 */
export function spillBlood(
  state: GameState,
  spills: readonly BloodSpill[],
): void {
  if (spills.length === 0) return;
  ensureGrid(state);
  for (const spill of spills) {
    const rx = Math.max(TILE * 0.5, spill.radius);
    const ry = Math.max(TILE * 0.5, spill.radius * FLATTEN);
    const tx0 = Math.max(0, Math.floor((spill.x - rx) / TILE));
    const tx1 = Math.min(cols - 1, Math.floor((spill.x + rx) / TILE));
    const ty0 = Math.max(0, Math.floor((spill.y - ry) / TILE));
    const ty1 = Math.min(rows - 1, Math.floor((spill.y + ry) / TILE));
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const dx = (tx * TILE + TILE / 2 - spill.x) / rx;
        const dy = (ty * TILE + TILE / 2 - spill.y) / ry;
        const d2 = dx * dx + dy * dy;
        if (d2 > 1) continue;
        // Strong in the middle, tailing off at the rim, then roughed up per
        // tile so the edge of a spill is ragged rather than elliptical.
        const falloff = 1 - Math.sqrt(d2);
        const jitter = 0.45 + 0.55 * ((tileHash(tx, ty) % 1000) / 1000);
        const add = spill.amount * SPILL_UNIT * falloff * jitter;
        const i = ty * cols + tx;
        sat[i] = Math.min(255, (sat[i] ?? 0) + add);
      }
    }
  }
}

/** The tile art for `name`, mirrored per `flip` (bit 0 = X, bit 1 = Y). */
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

/** Which rung a saturation sits on — the tile's own climb and the cap its
 * neighbourhood puts on it are both read through this. */
function rungOf(s: number): number {
  let rung = 0;
  while (rung + 1 < RUNGS.length && s >= (RUNG_AT[rung + 1] ?? Infinity))
    rung++;
  return rung;
}

/** Saturation at a tile, 0 outside the map — the neighbour lookups the wash
 * needs, without four bounds checks written out at each call site. */
function satAt(tx: number, ty: number): number {
  if (tx < 0 || ty < 0 || tx >= cols || ty >= rows) return 0;
  return sat[ty * cols + tx] ?? 0;
}

/**
 * Draw the bloodied floor under the frame. One pass over the tiles the view
 * covers, skipping every clean one — so a floor nothing has died on costs a
 * scan of a few hundred bytes, and the cost of a bloodied one is bounded by the
 * SCREEN rather than by how long the fight ran.
 */
export function drawBloodGround(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  sprites: Sprites,
  camera: Camera,
  view: ViewSize,
  timeMs: number,
): void {
  if (owner !== state || cols === 0) return;
  const tx0 = Math.max(0, Math.floor(camera.x / TILE));
  const ty0 = Math.max(0, Math.floor(camera.y / TILE));
  const tx1 = Math.min(cols - 1, Math.floor((camera.x + view.width) / TILE));
  const ty1 = Math.min(rows - 1, Math.floor((camera.y + view.height) / TILE));
  let anyWet = false;
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const s = sat[ty * cols + tx] ?? 0;
      if (s < RUNG_AT[0]!) continue;
      if (s >= GLOSS_FROM) anyWet = true;
      const px = tx * TILE - camera.x;
      const py = ty * TILE - camera.y;
      const hash = tileHash(tx, ty);
      const flip = (hash >>> 5) & 3;
      // How bloodied the WEAKEST of the four neighbours is — it governs both how
      // far this tile may climb and whether it gets the wash.
      const surround = Math.min(
        satAt(tx - 1, ty),
        satAt(tx + 1, ty),
        satAt(tx, ty - 1),
        satAt(tx, ty + 1),
      );
      // The rung this tile has reached, and how far into it — the alpha ramp is
      // what darkens a stain smoothly between two pieces of art. Capped at one
      // rung above the neighbourhood, so the opaque top rung can only appear
      // INSIDE a mess and a lone soaked cell can never draw as a red square.
      const rung = Math.min(rungOf(s), rungOf(surround) + 1);
      const from = RUNG_AT[rung]!;
      const to = RUNG_AT[rung + 1] ?? 256;
      const into = Math.min(1, Math.max(0, (s - from) / (to - from)));
      const art = flipped(sprites, RUNGS[rung]![(hash >>> 3) & 1]!, flip);
      if (art) {
        ctx.globalAlpha =
          RUNG_ALPHA_MIN + (RUNG_ALPHA_MAX - RUNG_ALPHA_MIN) * into;
        ctx.drawImage(art, px, py);
      }
      // THE WASH: a tile hemmed in on all four sides by bloodied ground fills
      // in, so a mess reads as one red field rather than as a scatter of
      // separately stained cells. Scaled by the tile's OWN saturation as well as
      // its neighbourhood — a barely-marked cell that happens to sit inside a
      // massacre must not jump straight to solid, which is what puts a hard
      // square edge in the middle of an otherwise ragged patch.
      if (surround > WASH_FROM) {
        const wash = flipped(
          sprites,
          RUNGS[WASH_RUNG]![(hash >>> 4) & 1]!,
          (hash >>> 7) & 3,
        );
        if (wash) {
          ctx.globalAlpha =
            (WASH_ALPHA * (surround - WASH_FROM) * s) /
            ((255 - WASH_FROM) * 255);
          ctx.drawImage(wash, px, py);
        }
      }
    }
  }
  ctx.globalAlpha = 1;
  if (anyWet) drawGloss(ctx, sprites, camera, timeMs, tx0, ty0, tx1, ty1);
}

/**
 * The wet sheen: an additive glint over the tiles soaked enough to stand in.
 * Its own pass so the composite mode is set once for the lot rather than
 * flipped per tile, and skipped outright when nothing in view is wet.
 */
function drawGloss(
  ctx: CanvasRenderingContext2D,
  sprites: Sprites,
  camera: Camera,
  timeMs: number,
  tx0: number,
  ty0: number,
  tx1: number,
  ty1: number,
): void {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const s = sat[ty * cols + tx] ?? 0;
      if (s < GLOSS_FROM) continue;
      const hash = tileHash(tx, ty);
      // Each tile runs the frame walk and the twinkle on its OWN phase, so the
      // highlights travel independently instead of the whole floor pulsing as
      // one sheet.
      const phase = (hash % 997) / 997;
      const frame =
        GLOSS_FRAMES[
          Math.floor(timeMs / GLOSS_FRAME_MS + phase * GLOSS_FRAMES.length) %
            GLOSS_FRAMES.length
        ]!;
      const art = spriteByName(sprites, frame);
      if (!art) continue;
      const twinkle =
        0.35 +
        0.65 *
          (0.5 +
            0.5 * Math.sin((timeMs / GLOSS_TWINKLE_MS + phase) * Math.PI * 2));
      ctx.globalAlpha =
        (GLOSS_ALPHA * twinkle * (s - GLOSS_FROM)) / (255 - GLOSS_FROM);
      ctx.drawImage(art, tx * TILE - camera.x, ty * TILE - camera.y);
    }
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

/** How much of the floor is bloodied, as a tile count — the probe the tests and
 * the debug diagnostics read. */
export function bloodTileCount(): number {
  let n = 0;
  for (let i = 0; i < sat.length; i++) if ((sat[i] ?? 0) > 0) n++;
  return n;
}

/** Saturation at a world point, 0–255 — a test/diagnostic reader. */
export function bloodAt(x: number, y: number): number {
  return satAt(Math.floor(x / TILE), Math.floor(y / TILE));
}
