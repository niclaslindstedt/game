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
// Two things make a grid of squares read as spilled blood rather than as a
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
//  2. **THE NEIGHBOURS DECIDE HOW FAR A TILE MAY GO** (`drawnRung`). The top
//     rung is near-total coverage, so a run of them side by side is one solid
//     mass whose outline is the TILE GRID — a red RECTANGLE, the single ugliest
//     thing this system can draw. Two gates stop it, and it takes both: a tile
//     may climb at most ONE RUNG above its four orthogonal neighbours (which
//     handles a lone hard-hit cell in open ground), AND the top rung is
//     INTERIOR-ONLY, needing all EIGHT neighbours heavy (which handles the case
//     the first gate misses — a knot of kills where every tile has soaked
//     neighbours and the whole blob clears the cap together). Every tile on the
//     RIM of a mess therefore draws the hole-punched rung below. A third rule
//     softens the middle: a tile hemmed in on all four sides gets the soaked
//     tile washed over it AGAIN, at an alpha off both the neighbourhood and its
//     own saturation. Together they turn a scatter of independently-stained
//     cells into one red field with a ragged edge — with no autotiling into
//     sixteen corner variants. All the minimums are MINIMUMS, not averages: an
//     average bleeds the effect outward past the edge of the mess.
//
// **AND IT IS BAKED FLAT, NOT SQUASHED ON THE WAY OUT.** The blood lies on the
// ground and takes the world projection whole — but it takes it ONCE, in the art
// (`bakeFlat`), and the per-frame draw is a plain blit at the tile's own
// whole-pixel seat (`drawFloorDecal`). Drawn through the live tilt instead, a
// screenful of stains WOBBLES as the hero walks north: a nearest-neighbour
// squash picks which rows to drop from the DESTINATION offset, and a pitch of
// 0.75 moves that offset three quarters of a pixel per world unit of travel, so
// every tile re-picks its dropped rows at its own moment against a ground layer
// that is one rigid blit. Walking east or west hid it perfectly — there the
// projection is the identity and the camera is a whole world unit — which is why
// the wobble read as "only on some axes" rather than as a resample.
//
// And the floor is deliberately STILL: nothing here animates, which is why the
// draw takes no clock. A travelling specular glint over the soaked cells was
// tried and cut — a highlight moving across a dark red mass reads as the blood
// BUBBLING, and a floor that simmers is a floor nobody believes. Blood on the
// ground is settled; the only thing that moves is the spray, and that is over in
// a third of a second.
//
// **AND NOT EVERY MESS STAYS.** Blood, a machine's oil and a ghost's goo are all
// matter and are all on this floor for the rest of the level. A rift-thing is the
// one exception: it is light, and light goes out, so it marks nothing at all.
// That is a fact about it rather than a saving, and it is enforced at the CALLER
// (`GoreFamily.stains`) — a family that leaves no mark never reaches this module,
// so the grid holds only things that are genuinely still there.
//
// What DOES stay is recorded in a second byte per tile: WHICH family last spilled
// on it, so oil draws black and amber and ectoplasm green where blood draws red,
// out of the same eight authored rungs re-hued (`render/recolor.ts`). Last writer
// wins the colour —
// the freshest thing spilled on a tile is the thing lying on top of it — while
// the SATURATION is the running total either way, because a tile with blood and
// oil on it is a dirtier tile whichever one you can see.
//
// The whole feature is gated on the victim's own GORE switch, checked by the
// caller (`bloodBlow`, through game-screen/gore-gate.ts) before anything
// reaches here.

import { type GameState } from "@game/core";

import { spriteByName, type Sprites } from "../assets.ts";
import { type BloodSpill } from "../game-screen/blood-hit.ts";
import {
  goreFamily,
  GORE_FAMILIES,
  type GoreFamily,
  type GoreFamilyId,
} from "../game-screen/gore.ts";
import { drawnRung, RUNG_AT, SOAKED_RUNG } from "./blood-rungs.ts";
import { bakeFlat } from "./caches.ts";
import { tileHash } from "./ground-tiles.ts";
import { drawFloorDecal } from "./plane.ts";
import { recolorSprite } from "./recolor.ts";
import { TILE, type ViewSize } from "./shared.ts";
import { projectionKey } from "./tilt.ts";
import { type Camera } from "./view.ts";

/** The saturation ladder's four rungs, two variants each. The tile's hash picks
 * a variant and mirrors it, so eight sprites cover every cell on the map. */
const RUNGS = [
  ["blood_tile_0a", "blood_tile_0b"],
  ["blood_tile_1a", "blood_tile_1b"],
  ["blood_tile_2a", "blood_tile_2b"],
  ["blood_tile_3a", "blood_tile_3b"],
];

/** THE RIM. A pool's edge is not a fainter pool — it is a scalloped boundary
 * with droplets frayed off it, so it gets AUTHORED ART rather than a lower
 * alpha. Two sprites cover all four directions: `_h` is solid on the left and
 * frays to the right, `_v` is solid on top and frays downward, and the flip
 * cache mirrors each for the opposite side. Ordered [east, west, south, north]
 * to match `EDGE_DIRS`. */
const FRINGE: readonly [string, number][] = [
  ["blood_fringe_h", 0], // fades east — as authored
  ["blood_fringe_h", 1], // fades west — mirrored in X
  ["blood_fringe_v", 0], // fades south — as authored
  ["blood_fringe_v", 2], // fades north — mirrored in Y
];
/** The neighbour each fringe faces, same order. */
const EDGE_DIRS: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
/** How much bloodier a cell must be than the neighbour it faces before it grows
 * a rim toward it, and the further drop over which that rim reaches full
 * strength. Below the first number the two cells are near enough to be the same
 * mess and a rim between them would cut it in half. */
const EDGE_DROP = 56;
const EDGE_FULL = 80;

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
const WASH_ALPHA = 0.42;

/** How far a cell's art may be nudged off its own centre, in world px. Small,
 * but it is the difference between a boundary that follows the tile grid and one
 * that wanders — every straight edge in a tiled overlay is a run of cells that
 * agreed on where to stop. */
const JITTER_PX = 3;

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
/** WHICH family last spilled on each tile, as an index into `GORE_FAMILIES` —
 * the second byte, and the whole of what makes oil look like oil. */
let fam = new Uint8Array(0);
let cols = 0;
let rows = 0;

/** `GORE_FAMILIES`' order IS the tile encoding, so the lookup is an index rather
 * than a string compare inside the draw loop. Blood is index 0, which is also
 * what a freshly-zeroed grid reads as — the right default in both directions. */
const FAMILY_INDEX = new Map<GoreFamilyId, number>(
  GORE_FAMILIES.map((f, i) => [f.id, i]),
);
const BLOOD_INDEX = FAMILY_INDEX.get("blood") ?? 0;

/** Pre-mirrored, pre-PROJECTED tile art, keyed `name/flip/family`. Four flips of
 * eight 16×16 sprites is a few KB, and it keeps the draw loop to one `drawImage`
 * per tile — a save/translate/scale/restore per tile is the one thing that would
 * make a screenful of bloodied floor cost real time. Keyed by the Sprites
 * instance so a hot reload drops it with everything else, and dropped outright
 * when the camera knobs move, because the projection is baked into every entry
 * (`bakeFlat`; the same deal `flatSprite` strikes for the level's flat
 * furniture). */
let flipCacheFor: Sprites | null = null;
let flipCacheProjection = projectionKey();
const flipCache = new Map<string, HTMLCanvasElement | ImageBitmap>();

/** Wipe the floor — a new run, or a hot reload. */
export function resetBloodGround(): void {
  owner = null;
  sat = new Uint8Array(0);
  fam = new Uint8Array(0);
  cols = 0;
  rows = 0;
}

function ensureGrid(state: GameState): void {
  if (owner === state) return;
  owner = state;
  cols = Math.ceil(state.level.width / TILE);
  rows = Math.ceil(state.level.height / TILE);
  sat = new Uint8Array(cols * rows);
  fam = new Uint8Array(cols * rows);
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
  family: GoreFamilyId = "blood",
): void {
  if (spills.length === 0) return;
  ensureGrid(state);
  const mark = FAMILY_INDEX.get(family) ?? BLOOD_INDEX;
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
        fam[i] = mark;
      }
    }
  }
}

/**
 * The tile art for `name`, mirrored per `flip` (bit 0 = X, bit 1 = Y) — RE-HUED,
 * MIRRORED and PROJECTED, in that order, and each step is in that place for a
 * reason.
 *
 * The re-hue is a full pixel walk with a cache of its own keyed on the sprite,
 * so doing it first means one walk per (tile, family) rather than one per (tile,
 * family, flip) — four times the work for four identical results. The mirror
 * comes before the projection because a mirror and a turn do not commute: under
 * a yaw, flipping the already-turned art would fray a pool's rim toward the
 * wrong corner of the floor.
 */
function flipped(
  sprites: Sprites,
  name: string,
  flip: number,
  family: GoreFamily,
): HTMLCanvasElement | ImageBitmap | null {
  const projection = projectionKey();
  if (flipCacheFor !== sprites || flipCacheProjection !== projection) {
    flipCacheFor = sprites;
    flipCacheProjection = projection;
    flipCache.clear();
  }
  const key = `${name}/${flip}/${family.id}`;
  const cached = flipCache.get(key);
  if (cached) return cached;
  const source = spriteByName(sprites, name);
  if (!source) return null;
  const art = family.ramp ? recolorSprite(source, name, family.ramp) : source;
  const mirrored = flip === 0 ? art : mirror(art, flip);
  if (!mirrored) return null;
  // Baked through the projection once, so the per-frame draw is a plain blit of
  // pre-squashed art rather than a live resample that re-picks its dropped rows
  // every time the camera moves a fraction of a pixel — see `drawFloorDecal`.
  //
  // NEAREST, at every camera and whatever the ANTI-ALIASING switch says: a
  // stain has no straight edge to keep straight, so averaging its rotation
  // cleans nothing up and only softens the clots into a smudge (`bakeFlat`).
  const flat = bakeFlat(mirrored, { antialias: false }) ?? mirrored;
  flipCache.set(key, flat);
  return flat;
}

/** `art` mirrored per `flip` (bit 0 = X, bit 1 = Y). */
function mirror(
  art: HTMLCanvasElement | ImageBitmap,
  flip: number,
): HTMLCanvasElement | ImageBitmap {
  const canvas = document.createElement("canvas");
  canvas.width = art.width;
  canvas.height = art.height;
  const g = canvas.getContext("2d");
  if (!g) return art;
  g.imageSmoothingEnabled = false;
  g.translate(flip & 1 ? art.width : 0, flip & 2 ? art.height : 0);
  g.scale(flip & 1 ? -1 : 1, flip & 2 ? -1 : 1);
  g.drawImage(art, 0, 0);
  return canvas;
}

/** The weakest of the four DIAGONAL neighbours, folded together with the
 * orthogonal minimum — the 8-neighbourhood the soaked rung is gated on. */
function diagonalMin(tx: number, ty: number, orthogonal: number): number {
  return Math.min(
    orthogonal,
    satAt(tx - 1, ty - 1),
    satAt(tx + 1, ty - 1),
    satAt(tx - 1, ty + 1),
    satAt(tx + 1, ty + 1),
  );
}

/**
 * Draw one piece of blood art for the cell whose CENTRE is at world (`cx`,
 * `cy`), nudged by (`jx`, `jy`) world px.
 *
 * **The art is CENTRED on the cell and nudged, never blitted into the cell
 * rect.** The heavy rungs are wider than a cell, so centring makes neighbouring
 * cells OVERLAP — the boundary of a mess becomes the ragged union of a dozen
 * blobs instead of the outline of the cells that happen to be stained. The nudge
 * finishes the job: a straight edge in a tiled overlay is a run of cells that
 * agreed on where to stop, and three pixels of disagreement is enough that they
 * never do.
 *
 * The nudge is a WORLD offset applied before the seat is worked out, not a
 * screen one applied after: it moves the blot across the FLOOR, so a turned
 * camera nudges it along the floor's own axes, and the seat stays a pure
 * function of where the blot is (`drawFloorDecal`).
 */
function blot(
  ctx: CanvasRenderingContext2D,
  art: HTMLCanvasElement | ImageBitmap | null,
  camera: Camera,
  cx: number,
  cy: number,
  jx: number,
  jy: number,
  alpha: number,
): void {
  if (!art || alpha <= 0) return;
  ctx.globalAlpha = Math.min(1, alpha);
  drawFloorDecal(ctx, art, cx + jx, cy + jy, camera);
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
): void {
  if (owner !== state || cols === 0) return;
  // One cell of margin on every side: the heavy rungs OVERHANG their cell, so a
  // blob belonging to a cell just off the rim still reaches into the frame.
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
      const s = sat[ty * cols + tx] ?? 0;
      if (s < RUNG_AT[0]!) continue;
      // WHAT IS ON THIS TILE. Every blot below is asked for through it, so a
      // machine's oil comes out of the same four rungs in its own black and
      // amber (see the header).
      const family =
        GORE_FAMILIES[fam[ty * cols + tx] ?? BLOOD_INDEX] ??
        goreFamily("blood");
      // The cell's CENTRE, in the world — every blot below is seated on it
      // (`blot`), never on a screen offset worked out here.
      const cx = tx * TILE + TILE / 2;
      const cy = ty * TILE + TILE / 2;
      const hash = tileHash(tx, ty);
      const flip = (hash >>> 5) & 3;
      // How bloodied the WEAKEST of the four neighbours is, and of all EIGHT.
      // Between them they decide how far this tile may climb and whether it
      // gets the wash.
      const surround = Math.min(
        satAt(tx - 1, ty),
        satAt(tx + 1, ty),
        satAt(tx, ty - 1),
        satAt(tx, ty + 1),
      );
      // The rung this tile has reached, and how far into it — the alpha ramp is
      // what darkens a stain smoothly between two pieces of art.
      const rung = drawnRung(s, surround, diagonalMin(tx, ty, surround));
      const from = RUNG_AT[rung]!;
      const to = RUNG_AT[rung + 1] ?? 256;
      const into = Math.min(1, Math.max(0, (s - from) / (to - from)));
      // Each cell's art is CENTRED on it and nudged off centre by its own hash,
      // never blitted into the cell rect — see `blot`. That, plus the heavy
      // rungs being wider than a cell, is what dissolves the grid.
      const jx = ((hash >>> 11) % (JITTER_PX * 2 + 1)) - JITTER_PX;
      const jy = ((hash >>> 15) % (JITTER_PX * 2 + 1)) - JITTER_PX;
      // A heavy cell lays the rung BELOW it down first. The heavy rungs are
      // feathered away at their rims, and a gap that shows bare floor through
      // the middle of a massacre is its own kind of wrong — so the rung under it
      // fills in, at its own variant, flip and nudge so the two never line up.
      if (rung >= 2) {
        blot(
          ctx,
          flipped(
            sprites,
            RUNGS[rung - 1]![(hash >>> 9) & 1]!,
            (hash >>> 10) & 3,
            family,
          ),
          camera,
          cx,
          cy,
          -jx,
          -jy,
          1,
        );
      }
      blot(
        ctx,
        flipped(sprites, RUNGS[rung]![(hash >>> 3) & 1]!, flip, family),
        camera,
        cx,
        cy,
        jx,
        jy,
        RUNG_ALPHA_MIN + (RUNG_ALPHA_MAX - RUNG_ALPHA_MIN) * into,
      );
      // THE RIM: wherever this cell is much bloodier than the neighbour it
      // faces, the pool's own EDGE art frays out over that neighbour — solid on
      // this side, scalloped through the middle, droplets petering out on the
      // clean side. This is the piece that makes a soaked area stop looking
      // stamped: without it the boundary of the mess is wherever the cells
      // happened to stop, and no amount of alpha on a full-coverage tile fixes
      // that, because the problem was never the opacity.
      if (rung >= 2) {
        for (let d = 0; d < EDGE_DIRS.length; d++) {
          const [dx, dy] = EDGE_DIRS[d]!;
          const drop = s - satAt(tx + dx, ty + dy);
          if (drop <= EDGE_DROP) continue;
          const [name, edgeFlip] = FRINGE[d]!;
          blot(
            ctx,
            flipped(sprites, name, edgeFlip, family),
            camera,
            cx,
            cy,
            jx,
            jy,
            Math.min(1, (drop - EDGE_DROP) / EDGE_FULL),
          );
        }
      }
      // THE WASH: a tile hemmed in on all four sides by bloodied ground fills
      // in, so a mess reads as one red field rather than as a scatter of
      // separately stained cells. Scaled by the tile's OWN saturation as well as
      // its neighbourhood — a barely-marked cell that happens to sit inside a
      // massacre must not jump straight to solid, which is what puts a hard
      // square edge in the middle of an otherwise ragged patch.
      if (surround > WASH_FROM) {
        blot(
          ctx,
          flipped(
            sprites,
            RUNGS[SOAKED_RUNG]![(hash >>> 4) & 1]!,
            (hash >>> 7) & 3,
            family,
          ),
          camera,
          cx,
          cy,
          jy,
          jx,
          (WASH_ALPHA * (surround - WASH_FROM) * s) / ((255 - WASH_FROM) * 255),
        );
      }
    }
  }
  ctx.globalAlpha = 1;
}

/** How much of the floor is bloodied, as a tile count — the probe the tests and
 * the debug diagnostics read. */
export function bloodTileCount(): number {
  let n = 0;
  for (let i = 0; i < sat.length; i++) if ((sat[i] ?? 0) > 0) n++;
  return n;
}

/**
 * BLOOD at a world point, 0–255 — what the hero's boots may pick up.
 *
 * Deliberately blood ALONE: the hero wades through what is on the floor and
 * tracks it out on his boots (render/blood-tracks.ts, game-screen/hero-soak.ts),
 * and both of those are built out of blood art in blood's colours. A tile whose
 * last spill was a machine's oil reads as clean to them rather than printing red
 * bootprints out of a puddle of oil — which is the one way this grid could lie
 * about what is on the floor.
 */
export function bloodAt(x: number, y: number): number {
  const tx = Math.floor(x / TILE);
  const ty = Math.floor(y / TILE);
  if (tx < 0 || ty < 0 || tx >= cols || ty >= rows) return 0;
  return (fam[ty * cols + tx] ?? BLOOD_INDEX) === BLOOD_INDEX
    ? (sat[ty * cols + tx] ?? 0)
    : 0;
}
