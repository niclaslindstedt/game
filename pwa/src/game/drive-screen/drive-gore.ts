// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT A PERSON UNDER A CAR LOOKS LIKE — the road's own gore, and the mess it
// leaves on the tarmac afterwards.
//
// THE ENGINE HAS ALREADY DECIDED EVERYTHING THAT MATTERS. `src/game/drive/
// remains.ts` owns the pieces: how many there are, where each one is, whether it
// is caught under the car or skidding or settled, and whether the wheels have
// been over it. This file answers the only question left, which is what any of
// that is made OF — and it is the same fence the whole gore system is built
// along (`game-screen/gore-gate.ts`): the sim knows a lump of a person is at a
// spot, and the app knows what a person is.
//
// IT IS THE RUN'S OWN CLEAVE, DRIVEN BY A BUMPER INSTEAD OF A BLADE. Everything
// here that takes a body apart is `render/sprite-split.ts` — the one module in
// the game that cuts authored art up — and it is used exactly as a sword cleave
// uses it:
//
//   `slicedPiece` cuts the victim's OWN sprite along the line the steel caught
//   them at (`DriveRemain.cut`) and paints the family's own viscera into the
//   band it opened, so the tear reads as an inside rather than as a sprite with
//   a line through it. A green jacket throws a green half; one of THE GLUED
//   throws a half of the person who was sitting there, holding their board.
//   Nothing whatever is authored per body, and a MOD's crowd gets the same.
//
// THE ONE PLACE IT DIVERGES FROM THE BLADE, and it is the whole feature: a
// cleave's two halves are drawn at ONE anchor and part from each other over
// `CLEAVE_MS`, because a sword opens a body and the pieces stay where they fell.
// A car does not leave them anywhere near each other. So each half is drawn at
// its OWN world position, for as long as the road holds it, because each half is
// a separate physical thing having a separate afternoon: one of them went over
// the roof, and the other one is under the back axle.
//
// AND THE FLOOR REMEMBERS IT — `RoadMark`. The run's blood floor is a byte per
// TILE over a carved level's grid; a road has no grid and is 24,000 px long, so
// this is a list instead, BOUNDED the way the run's bootprints are (bucketed by
// a coarse cell with a per-cell cap) rather than by forgetting the oldest. The
// marks are laid where the PIECES are, every tick, off the same positions the
// pieces are drawn at — the same agreement `landingSpots` enforces inside a run,
// and for the same reason: blood under nothing and a piece on clean tarmac are
// the two halves of one bug.

import { DRIVE, type DriveRemain, type DriveState } from "@game/core";

import { spriteByName, type Sprites } from "../assets.ts";
import { goreFamily } from "../game-screen/gore.ts";
import { slicedPiece, splitSprite } from "../render/sprite-split.ts";
import { fract, seatX, seatY } from "../render/shared.ts";
import { billboard } from "../render/tilt.ts";
import type { Camera } from "../render/view.ts";
import { cleanCar, soakCarFromDrag, type CarSoak } from "./car-soak.ts";
import { CROWD_SPRITES, GLUED_SPRITES } from "./scenery.ts";

/** One mark on the tarmac: a drag streak, a tyre print, a splash, or a body
 * pressed into the road. */
type RoadMark = {
  sprite: string;
  x: number;
  y: number;
  /** Which way it lies (radians) — a smear runs along the travel that made it,
   * and a mark laid at a fixed bearing on a road whose pieces skid sideways is a
   * decal rather than a record. */
  angle: number;
  /** How solid it goes down: a mark laid by something nearly out of blood is
   * fainter than the first one it left. */
  alpha: number;
};

/**
 * WHAT THE ROAD IS HOLDING — the marks, and the per-piece bookkeeping that lays
 * them.
 *
 * The `wet` and `last` maps are the app's HALF of a remain (see
 * `DriveRemain`'s note): how much blood this particular lump still has to give
 * the road, and where it was the last time we looked. Both are keyed on the
 * piece's engine id and dropped when the road forgets the piece.
 */
export type DriveGoreState = {
  marks: RoadMark[];
  /** How much blood each live piece has left, 1 → 0. A CARRY, not a timer,
   * exactly as the hero's own bootprints are: a trail that ran on a clock would
   * print at full strength and then stop dead, which reads as a bug, where one
   * that runs out always fades and always ENDS. */
  wet: Map<number, number>;
  /** Where each piece was last tick, so a mark can be laid along the ground it
   * actually covered rather than at the single point it happens to be at now —
   * at 624 px/s a tick is ten pixels, and a mark per tick with nothing between
   * them is a dotted line. */
  last: Map<number, { x: number; y: number }>;
  /** Occupancy per coarse cell, so the record is bounded by the ROAD's area
   * rather than by how long somebody was dragged. */
  cells: Map<string, number>;
  /**
   * HOW MUCH BLOOD THE TYRES ARE STILL CARRYING, 1 → 0 — the car's own share of
   * the mess, and the only mark on this road the CAR makes rather than a body.
   *
   * It is the hero's bootprints, on wheels (`render/blood-tracks.ts`), and it is
   * the same rule for the same reason: a CARRY, never a timer. A tyre that
   * printed at full strength for N seconds and then stopped dead reads as a bug;
   * one that runs OUT always fades and always ends, and the length of the trail
   * is then a record of how much it picked up rather than of how long ago.
   */
  tyre: number;
  /** Where the car was when the last pair of prints went down, so the cadence
   * is measured in GROUND COVERED rather than in ticks — the same accumulator
   * the hero's own gait spends. */
  tyreAt: { x: number; y: number } | null;
  /**
   * HOW FILTHY EACH PANEL OF THE CAR IS — the hero's coat, on a wagon
   * (`car-soak.ts`). It rides here rather than on the car itself for the same
   * reason the marks do: it is what the ROAD did to it, thrown away with the
   * rest of the mess when the leg restarts, where `CarVehicle.panels` is
   * damage the garage still has to fix.
   */
  car: CarSoak;
};

/** The three drag rungs, lightest first — picked by how wet the piece still is,
 * so a trail visibly thins out along its own length. */
const SMEARS = ["gib_road_smear_0", "gib_road_smear_1", "gib_road_smear_2"];
/** …and the two splashes, for a piece arriving rather than sliding. */
const SPLATS = ["gib_road_splat_0", "gib_road_splat_1"];
/** What a piece the wheels have flattened leaves behind: a half or a chunk
 * makes the small one, a whole body the big one. */
const PASTES = ["gib_road_paste_0", "gib_road_paste_1"];
const TYRE = "gib_tyre_print";

/** The lumps a collision throws, by weight — the road's own big torn pieces
 * first, then the run's own gore for the smaller ones. A car takes bigger
 * pieces off a body than a blade does, so the slabs lead. */
const CHUNK_SPRITES = [
  "gib_slab_0",
  "gib_slab_0",
  "gib_slab_1",
  "gib_slab_1",
  "gib_spine",
  "gib_gut_0",
  "gib_gut_1",
  "gib_meat_1",
  "gib_bone",
  "gib_liver",
];

/** How far a piece has to travel before it lays another mark (world px). Under
 * a mark's own length, so the marks overlap into a continuous streak rather
 * than a row of stamps. */
const MARK_STEP_PX = 7;
/**
 * …and how much blood one mark costs.
 *
 * MEASURED IN THE GALLERY, twice, and both ends were wrong first. At a twentieth
 * a piece was dry after fourteen marks — about 140 px of road, which at the top
 * end is a fifth of a second and is off the left edge before the eye finds it.
 * A drag has to reach a couple of hundred pixels or it is not a drag, it is a
 * splash that moved.
 */
const MARK_COST = 0.022;
/**
 * HOW SOLID ONE MARK GOES DOWN — the base, and how much the piece's remaining
 * blood adds on top.
 *
 * LOW, AND IT HAS TO BE. One body's trail at full strength is a legible red
 * streak; THE GLUED are twenty bodies met inside two seconds, and at the alpha
 * this shipped with first the whole carriageway went to one flat red slab with
 * no marks in it at all — a colour rather than a mess. The density has to come
 * from marks OVERLAPPING, exactly as the run's own blood floor builds a pool out
 * of rungs, or the worst case paints over the best one.
 */
const MARK_ALPHA_BASE = 0.3;
const MARK_ALPHA_WET = 0.35;
/** How many marks one coarse cell may hold, and how big a cell is (world px).
 * The whole record is bounded by the road's area at this density however long
 * somebody paces one lane, which is the run's bootprint rule exactly — and it
 * is what stops a blockade's twenty bodies stacking a hundred marks on one
 * stretch of tarmac. */
const CELL_PX = 12;
const CELL_MAX = 2;
/** The most marks the road keeps at all — a floor over the whole 24,000 px
 * course, and a hard backstop under the per-cell cap above. */
const MARK_MAX = 1200;

/** A tyre print is laid instead of a smear this often, so a drag reads as
 * having been made by a CAR rather than by something being pulled by a rope. */
const TYRE_EVERY = 4;

/**
 * THE CAR'S OWN TRAIL — what a wheel that has just been through somebody prints
 * on the clean road behind it.
 *
 * IT IS THE ONE MARK ON THIS ROAD THE CAR MAKES, and it is the one that follows
 * the player rather than being left behind at a collision. Everything else here
 * is laid by a BODY: the splash where it landed, the smear where it was dragged,
 * the paste where the wheels found it — all of it anchored to the spot the
 * collision happened at, all of it a screen behind you two hundred milliseconds
 * later. The tyres carry it OUT. A driver who has just been through a blockade
 * spends the next four hundred pixels of empty tarmac printing what he did on
 * it, which is the only part of this whole feature that is still on screen while
 * he is looking at the road ahead.
 *
 * THE STEP GROWS AS THE CARRY FALLS, and that IS the thinning: a wet tyre prints
 * a continuous streak (the prints overlap), a drying one prints separated
 * treads further and further apart, and a dry one prints nothing. Nobody has to
 * fade anything out — it is what a real bloody tyre does, and it means the trail
 * never stops mid-stride the way a timed one would.
 */
const TREAD_STEP_WET = 8;
const TREAD_STEP_DRY = 24;
/** How much of the carry one pair of prints spends. About twenty-six pairs, which
 * over the widening step above is roughly four hundred px of road — a couple of
 * screens at the top end, and gone before the next crossing. */
const TREAD_COST = 0.038;
/** How far apart the two tracks sit either side of the car's own line (world
 * px). A single line down the middle reads as something being dragged; two
 * lines a wheelbase apart read as a car, which is the whole point. */
const TREAD_GAUGE = 4;
/** …and how solid a print goes down, at the base and per unit of carry left. */
const TREAD_ALPHA_BASE = 0.16;
const TREAD_ALPHA_WET = 0.38;

/** How long a body's own two halves keep their cut faces wet, in world px of
 * travel — past this the piece is drawn plain, because a tear that stays
 * glistening a hundred metres later reads as a decal. Unused for now beyond
 * documenting intent; the halves keep their faces for the life of the road,
 * which is at most the ~400 px the camera can still see behind the car. */
const BODY_LIFT = 2;

export function createDriveGore(): DriveGoreState {
  return {
    marks: [],
    wet: new Map(),
    last: new Map(),
    cells: new Map(),
    tyre: 0,
    tyreAt: null,
    car: cleanCar(),
  };
}

/** Everything the road throws away when the leg restarts. */
export function clearDriveGore(state: DriveGoreState): void {
  state.marks.length = 0;
  state.wet.clear();
  state.last.clear();
  state.cells.clear();
  state.tyre = 0;
  state.tyreAt = null;
  state.car = cleanCar();
}

/**
 * THE WHEELS HAVE JUST BEEN THROUGH SOMEBODY — load them up.
 *
 * Called on the engine's own `bodyCrushed` and `bodyCaught`, which between them
 * are every moment a tyre is actually IN it: one is a wheel finding a piece in
 * the road, the other is a body wedged under the floorpan with the back axle
 * turning in it. It SETS rather than adds, so driving through a blockade does
 * not bank twenty trails' worth to be paid out over the rest of the leg — the
 * tyre holds what a tyre holds, and the twentieth body does not make it wetter
 * than the first did.
 */
export function wetTyres(state: DriveGoreState): void {
  state.tyre = 1;
}

/** Which crowd's art a piece or a body wears — the two tables, chosen by the
 * `PedestrianKind` the engine carried through. */
export function bodySprite(kind: string, variant: number): string {
  if (kind === "glued") {
    return GLUED_SPRITES[variant % GLUED_SPRITES.length] ?? GLUED_SPRITES[0]!;
  }
  const frames = CROWD_SPRITES[variant % CROWD_SPRITES.length];
  return frames?.[0] ?? "walker_hoodie_0";
}

/**
 * ONE TICK OF THE MESS — walk what the road is holding and lay down whatever it
 * has bled onto the tarmac since we last looked.
 *
 * Called from `drainDrive`, inside the fixed step, so the marks are laid on the
 * DRIVE's own clock exactly as the sparks and the gibs are: a slow frame lays
 * the same trail a fast one does, and a paused road lays none.
 */
export function stepDriveGore(state: DriveGoreState, drive: DriveState): void {
  const live = new Set<number>();
  for (const piece of drive.remains) {
    live.add(piece.id);
    const was = state.last.get(piece.id);
    state.last.set(piece.id, { x: piece.pos.x, y: piece.pos.y });
    // A piece that has just been minted has nowhere to have come from, and a
    // piece in the AIR is not touching the road — a smear under something four
    // feet up is the bug the shadow pass exists to prevent, drawn permanently.
    if (!was || piece.z > 2) continue;
    let wet = state.wet.get(piece.id);
    if (wet === undefined) {
      // A whole body carries more than a chunk does, and a piece that has been
      // run over is already emptied of most of it.
      wet = piece.part === "chunk" ? 0.45 : piece.part === "whole" ? 1 : 0.8;
      state.wet.set(piece.id, wet);
    }
    if (wet <= 0) continue;
    const dx = piece.pos.x - was.x;
    const dy = piece.pos.y - was.y;
    const travelled = Math.hypot(dx, dy);
    if (travelled < MARK_STEP_PX) continue;
    const angle = Math.atan2(dy, dx);
    // ALONG THE GROUND IT ACTUALLY COVERED, not at the point it reached: at the
    // top end a tick is ten pixels and a drag is a couple of hundred, so a mark
    // per tick would be a dotted line down the road.
    const steps = Math.min(
      6,
      Math.max(1, Math.round(travelled / MARK_STEP_PX)),
    );
    for (let i = 1; i <= steps && wet > 0; i++) {
      const t = i / steps;
      // The tread print is what names the cause: a smear could be anything
      // being dragged, and a tyre pattern could only be a car.
      const n = Math.round((piece.pos.x + piece.pos.y) / MARK_STEP_PX) + i;
      const tyre = n % TYRE_EVERY === 0;
      const rung = Math.min(SMEARS.length - 1, Math.floor(wet * SMEARS.length));
      push(state, {
        sprite: tyre ? TYRE : (SMEARS[rung] ?? SMEARS[0]!),
        x: was.x + dx * t,
        y: was.y + dy * t,
        angle,
        alpha: MARK_ALPHA_BASE + MARK_ALPHA_WET * wet,
      });
      wet -= MARK_COST;
    }
    state.wet.set(piece.id, Math.max(0, wet));
  }
  // Drop the bookkeeping for pieces the road has forgotten. Cheap: this walks
  // the maps rather than the road, and both are the size of what is on screen.
  for (const id of [...state.wet.keys()])
    if (!live.has(id)) state.wet.delete(id);
  for (const id of [...state.last.keys()])
    if (!live.has(id)) state.last.delete(id);

  layTreads(state, drive);

  // …and the underside, for as long as something is wedged under it. A rate
  // rather than a hit, because a drag is the one thing on this road that is
  // still happening a second after it started.
  if (drive.remains.some((piece) => piece.dragMs > 0)) {
    soakCarFromDrag(state.car, STEP_MS);
  }
}

/** The drive's fixed step (ms) — the rate `stepDriveGore` is called at, which
 * is what the drag soak above is measured against. The engine's own, so a
 * slow frame wets the car by exactly as much as a fast one. */
const STEP_MS = 16;

/**
 * THE CAR'S OWN TRAIL — a pair of tread prints laid every so much ground
 * covered, for as long as the tyres have anything left in them.
 *
 * The cadence WIDENS as the carry falls (`TREAD_STEP_WET` → `TREAD_STEP_DRY`),
 * which is the whole of the thinning: a wet tyre lays overlapping prints that
 * read as an unbroken streak, a drying one lays separated treads that march
 * further and further apart, and a dry one lays nothing at all. See the note on
 * those constants for why that is better than fading anything out.
 */
function layTreads(state: DriveGoreState, drive: DriveState): void {
  const { car } = drive;
  const at = state.tyreAt;
  if (!at) {
    state.tyreAt = { x: car.pos.x, y: car.pos.y };
    return;
  }
  if (state.tyre <= 0) {
    // Keep the mark moving with the car even while it is dry, or the first
    // print after the next body would be laid a whole blockade back up the road.
    state.tyreAt = { x: car.pos.x, y: car.pos.y };
    return;
  }
  const step =
    TREAD_STEP_WET + (TREAD_STEP_DRY - TREAD_STEP_WET) * (1 - state.tyre);
  const dx = car.pos.x - at.x;
  const dy = car.pos.y - at.y;
  if (Math.hypot(dx, dy) < step) return;
  const angle = Math.atan2(dy, dx);
  const alpha = TREAD_ALPHA_BASE + TREAD_ALPHA_WET * state.tyre;
  // TWO TRACKS, a gauge apart. One line down the middle is something being
  // dragged; two are a car.
  for (const side of [-1, 1]) {
    push(state, {
      sprite: TYRE,
      x: car.pos.x,
      y: car.pos.y + side * TREAD_GAUGE,
      angle,
      alpha,
    });
  }
  state.tyre = Math.max(0, state.tyre - TREAD_COST);
  state.tyreAt = { x: car.pos.x, y: car.pos.y };
}

/**
 * A BODY ARRIVING RATHER THAN SLIDING — the splash a collision throws down at
 * the point of impact, laid once from the strike.
 */
export function splashAt(
  state: DriveGoreState,
  x: number,
  y: number,
  force: number,
): void {
  const big = force >= 1;
  push(state, {
    sprite: (big ? SPLATS[1] : SPLATS[0]) ?? SPLATS[0]!,
    x,
    y,
    // A splash has no bearing of its own worth respecting — it is a blob — but
    // laying every one of them square makes a road of them read as a tiled
    // pattern, so each takes a turn off its own spot.
    angle: fract(x * 0.017 + y * 0.031) * Math.PI * 2,
    alpha: 0.7,
  });
}

/** …and a piece the wheels have just flattened: the paste, laid where it lies
 * and pointing the way it was travelling. */
function pasteAt(state: DriveGoreState, piece: DriveRemain): void {
  push(state, {
    sprite: (piece.part === "whole" ? PASTES[1] : PASTES[0]) ?? PASTES[0]!,
    x: piece.pos.x,
    y: piece.pos.y,
    angle: Math.atan2(piece.vel.y, piece.vel.x),
    alpha: 0.9,
  });
}

/** Record a mark, if the cell it falls in still has room for one. */
function push(state: DriveGoreState, mark: RoadMark): void {
  if (state.marks.length >= MARK_MAX) return;
  const key = `${Math.round(mark.x / CELL_PX)},${Math.round(mark.y / CELL_PX)}`;
  const held = state.cells.get(key) ?? 0;
  if (held >= CELL_MAX) return;
  state.cells.set(key, held + 1);
  state.marks.push(mark);
}

/**
 * THE FLOOR, DRAWN UNDER EVERYTHING THAT IS STANDING ON IT.
 *
 * Called from inside `drawDrive`'s projected space, after the tarmac and before
 * the y-sorted bodies — which is not a preference, it is the lesson the run's
 * own gore learned the hard way: anything drawn in the effect layer is painted
 * over the actors, and a player driving through his own mess had chunks of
 * somebody laid across the bonnet for the rest of the leg.
 *
 * **AND THAT DECIDES THE ANCHOR, which is the trap this file fell into.** There
 * are TWO conventions for putting a world point on this screen and they differ
 * by the projection itself:
 *
 *   INSIDE the projected context (this pass, the road bands, every actor) a
 *   world point is a PLAIN CAMERA SUBTRACT — `seatX`/`seatY` — and the context's
 *   own transform rakes it.
 *   OUTSIDE it (`drawDriveFx`, the placards) the projection has to be applied by
 *   hand, which is what `bodyAnchorX`/`bodyAnchorY` are for.
 *
 * Using the OUTSIDE anchor in here projects everything twice. At the shipped
 * camera that is a y multiplied by 0.75 twice over, so a mark on the near lane
 * came out about 28 world px high — taller than the car — and the tyre trail
 * appeared to pour out of the ROOF rather than off the wheels. It is invisible
 * in a still of an empty road and obvious the moment anything is drawn beside
 * the thing that made it.
 */
export function drawRoadMarks(
  ctx: CanvasRenderingContext2D,
  state: DriveGoreState,
  camera: Camera,
  sprites: Sprites,
  viewW: number,
): void {
  const left = camera.x - 64;
  const right = camera.x + viewW + 64;
  for (const mark of state.marks) {
    if (mark.x < left || mark.x > right) continue;
    const art = spriteByName(sprites, mark.sprite);
    if (!art) continue;
    ctx.save();
    ctx.globalAlpha = mark.alpha;
    // A PLAIN CAMERA SUBTRACT, because this pass runs INSIDE the world
    // projection — see the note on `drawRoadMarks` for why that is not the same
    // anchor the effect layer uses.
    ctx.translate(seatX(mark.x, camera.x), seatY(mark.y, camera.y));
    ctx.rotate(mark.angle);
    ctx.drawImage(art, -Math.round(art.width / 2), -Math.round(art.height / 2));
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

/**
 * ONE PIECE OF SOMEBODY, at its own place on the road.
 *
 * Returns the draw for the caller to y-sort with everything else standing on
 * the tarmac (`render.ts`), because a half of a person in lane one has to
 * interleave with the van in lane three exactly as a whole one does.
 */
export function drawRemain(
  ctx: CanvasRenderingContext2D,
  piece: DriveRemain,
  camera: Camera,
  sprites: Sprites,
): void {
  // A BILLBOARD, like every other body on this road: the caller has the world
  // projection on the context, so the piece is un-projected around its own
  // anchor and drawn standing at full size rather than squashed into the
  // tarmac. Anchored with `seatX`/`seatY` for the reason `drawRoadMarks`
  // explains at length — the effect layer's anchor would project it twice and
  // hang it a lane and a half above the road it is lying on.
  billboard(ctx, piece.pos.x, piece.pos.y, camera.x, camera.y, () =>
    drawRemainAt(ctx, piece, camera, sprites),
  );
}

function drawRemainAt(
  ctx: CanvasRenderingContext2D,
  piece: DriveRemain,
  camera: Camera,
  sprites: Sprites,
): void {
  const sx = seatX(piece.pos.x, camera.x);
  const sy = seatY(piece.pos.y, camera.y) - Math.round(piece.z) - BODY_LIFT;

  if (piece.part === "chunk") {
    const art = spriteByName(
      sprites,
      CHUNK_SPRITES[
        Math.floor(fract(piece.seed * 0.618) * CHUNK_SPRITES.length) %
          CHUNK_SPRITES.length
      ] ?? CHUNK_SPRITES[0]!,
    );
    if (!art) return;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(piece.angle);
    ctx.drawImage(art, -Math.round(art.width / 2), -Math.round(art.height / 2));
    ctx.restore();
    return;
  }

  // A HALF, OR A WHOLE BODY — the victim's own art, cut where the steel caught
  // them. Once the wheels have been over it there is no shape left to draw at
  // all: it is a mark on the road, and the paste was laid down for it the
  // instant it was crushed (see `crushRemain`).
  if (piece.crushed) return;
  const name = bodySprite(piece.kind, piece.variant);
  const body = spriteByName(sprites, name);
  if (!body) return;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(piece.angle);
  const half = halfOf(body, name, piece, sprites);
  ctx.drawImage(
    half ?? body,
    -Math.round(body.width / 2),
    -Math.round(body.height / 2),
  );
  ctx.restore();
}

/**
 * THE VICTIM'S OWN SPRITE, CUT AT THE BUMPER'S LINE — the run's cleave, exactly,
 * with the blade's bearing replaced by a car's.
 *
 * `slicedPiece` gives each half its own art out to where the steel entered and
 * then the FAMILY's own viscera out to where it left, masked to the body's own
 * silhouette — which is why a green jacket throws a green half with a red inside
 * and nothing is authored per person. The band is narrow: a car tears rather
 * than slices, so what shows is a wet edge and not the wide oblique face a blade
 * driven through a body leaves.
 *
 * A `whole` piece is not cut at all — nobody went through it.
 */
function halfOf(
  body: ImageBitmap,
  name: string,
  piece: DriveRemain,
  sprites: Sprites,
): HTMLCanvasElement | ImageBitmap | null {
  if (piece.part === "whole") return null;
  // The cut is a fraction from the TOP of the sprite; `splitSprite` measures its
  // offset from the MIDDLE, along the cut's own normal.
  const cutPx = Math.round((piece.cut - 0.5) * body.height);
  const side = piece.part === "upper" ? -1 : 1;
  const wet = spriteByName(sprites, goreFamily("blood").inside);
  const band = side * TEAR_PX;
  if (wet) {
    const sliced = slicedPiece(body, name, wet, 0, cutPx + band, cutPx, side);
    if (sliced) return sliced;
  }
  // No viscera tile to hand (a headless canvas, a stripped atlas): fall back to
  // the plain half, which is still a body in two pieces rather than nothing.
  const halves = splitSprite(body, name, 0, cutPx);
  return halves?.[side < 0 ? 0 : 1] ?? null;
}

/** How wide the wet tear along a half's cut edge is, in sprite px. Two: a car
 * TEARS, and the wide oblique face `slicedPiece` can draw is what a blade
 * driven through a body leaves, not what a bumper does. */
const TEAR_PX = 2;

/** Lay the paste for a piece the wheels have just found. Called from the drain
 * on the engine's own `bodyCrushed` event, so the mark and the noise are the
 * same moment. */
export function crushRemain(
  state: DriveGoreState,
  drive: DriveState,
  x: number,
  y: number,
): void {
  // The event carries a position rather than an id (it is booked for a tumbling
  // BODY as well as for a piece), so the paste is laid at the spot — which is
  // where the wheel was, which is what a paste is a picture of.
  const piece = drive.remains.find(
    (candidate) =>
      candidate.crushed &&
      Math.abs(candidate.pos.x - x) < 2 &&
      Math.abs(candidate.pos.y - y) < 2,
  );
  if (piece) {
    pasteAt(state, piece);
    // Whatever it had left goes into that one mark.
    state.wet.set(piece.id, 0);
    return;
  }
  push(state, {
    sprite: PASTES[0]!,
    x,
    y,
    angle: fract(x * 0.023 + y * 0.041) * Math.PI * 2,
    alpha: 0.9,
  });
}

/** The paste rungs, exported for the exhibit test's benefit — every sprite this
 * module can ask the atlas for, so a rename fails a check rather than a road. */
export const DRIVE_GORE_SPRITES: readonly string[] = [
  ...SMEARS,
  ...SPLATS,
  ...PASTES,
  TYRE,
  ...new Set(CHUNK_SPRITES),
];

/** The one knob the drive's own physics and this module have to agree on: how
 * hard a hit has to be before its splash is the big one. Read off the engine's
 * own split line rather than restated. */
export function splashForce(joules: number): number {
  return joules / (DRIVE.impact.wearJoules * DRIVE.gore.splitJoules);
}
