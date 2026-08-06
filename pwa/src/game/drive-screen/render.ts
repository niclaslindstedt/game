// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// DRAWING THE ROAD — the drive's own frame, painted with the run's own tools.
//
// IT REUSES THE PROJECTION RATHER THAN INVENTING ONE. The shipped camera
// already looks down at the ground at about forty degrees (`render/tilt.ts`,
// pitch 0.75) — which is exactly the three-quarter road view this minigame
// wants — so the drive draws through the SAME `drawWorldSprite` every obstacle,
// actor and piece of loot in the game goes through, and gets the rake, the
// billboarding and the crisp-pixel seating for free. A second projection would
// have been a second thing to keep in step with the art.
//
// WHAT IT DOES NOT REUSE is `drawFrame`. The run's frame pass wants a
// `GameState` — a carve, a fog grid, a horde, a hero doll, a HUD model — and a
// drive has none of those. What it needs is the LEAF passes, and those were
// already leaves: `drawWorldSprite` for anything with a body, `drawGore` for a
// body coming apart. That split is why this file is short.
//
// THE PAINTER'S ORDER IS THE WHOLE OF THE 3/4 LOOK, and it is a y-sort like
// everywhere else in the game: the town stands behind the road because its y is
// smaller, the kerb in front of it because its y is larger, and a car in the far
// lane is drawn before a car in the near one. Get it wrong and the picture
// reads as flat.

import {
  crossingsBetween,
  crowdEdges,
  DRIVE,
  type DriveState,
} from "@game/core";

import { spriteByName, type Sprites } from "../assets.ts";
import { drawWorldSprite } from "../render/plane.ts";
import { drawCarAssembly } from "../render/vehicles.ts";
import { applyWorldProjection } from "../render/tilt.ts";
import type { Camera } from "../render/view.ts";
import {
  CROWD_FRAME_MS,
  CROWD_SPRITES,
  roadBands,
  sceneryBetween,
  TRAFFIC_SPRITES,
} from "./scenery.ts";

/** The night the whole first trip happens on — the sky behind the town. */
const SKY = "#141826";
/** The ground either side of the tarmac. */
const VERGE = "#2b3327";
/** The pavement each side of the road, and the kerb that steps up to it. A
 * touch warmer and lighter than the tarmac so the eye reads a different surface
 * at a glance rather than a wider road. */
const PAVEMENT = "#4a4741";
const KERB = "#605c53";
/** The tarmac, and the paint on it. */
const ROAD = "#31333c";
const ROAD_EDGE = "#3c3f4a";
const PAINT = "#c9c4a8";

/** The kerb's own step up off the tarmac (world px). The pavement's DEPTH is
 * not a drawing decision at all — it is `DRIVE.pavementPx`, because people
 * stand on it (`crowdEdges`). */
const KERB_DEPTH = 2;

/** How far ahead of the car the camera sits (world px) — the car rides in the
 * trailing third of the picture so the player can read the crowd coming. */
const CAMERA_LEAD = 96;

/** Where the camera stands for a drive. */
export function driveCamera(
  drive: DriveState,
  viewW: number,
  viewH: number,
): Camera {
  const dir = drive.params.direction;
  return {
    x: drive.car.pos.x + dir * CAMERA_LEAD - viewW / 2,
    // Pinned to the road's middle rather than to the car: a camera that tracked
    // the car across the lanes would make changing lanes look like the WORLD
    // moving, which is the one thing that must not happen in a lane game.
    y: -viewH / 2,
  };
}

/**
 * Paint one frame of the drive.
 *
 * `viewW`/`viewH` are the world-space extents of the canvas, and `timeMs` is
 * the render clock — used only for the walk cycle, never for physics.
 */
export function drawDrive(
  ctx: CanvasRenderingContext2D,
  drive: DriveState,
  camera: Camera,
  sprites: Sprites,
  viewW: number,
  viewH: number,
  timeMs: number,
): void {
  const bands = roadBands();

  // ── THE GROUND ────────────────────────────────────────────────────────────
  // Flat fills rather than tiles: the road is 24,000 px long and a baked tile
  // layer for it would be a megabyte of atlas for four flat colours.
  //
  // THE WHOLE PASS IS DRAWN IN THE PROJECTED SPACE — the ground AND everything
  // standing on it — and that is not a detail. `drawWorldSprite` billboards a
  // body by translating and then applying the INVERSE projection, which only
  // comes out where the body belongs if the context it lands in already has the
  // projection on it (that is the space `drawFrame` hands the run's own passes).
  // Projecting the tarmac alone, as this file first did, left every sprite's
  // seat divided by the pitch: the lamp posts and the parked cars sat a good
  // twenty world px below the pavement they were authored onto, out in the
  // grass, and the far row floated above the kerb by the same amount. One
  // `save`/`projection`/`restore` around the lot, and the road and the things
  // on it cannot disagree.
  ctx.fillStyle = SKY;
  ctx.fillRect(0, 0, viewW, viewH);
  ctx.save();
  applyWorldProjection(ctx);
  const left = camera.x - 64;
  const right = camera.x + viewW + 64;
  const band = (top: number, bottom: number, fill: string) => {
    ctx.fillStyle = fill;
    ctx.fillRect(left - camera.x, top - camera.y, right - left, bottom - top);
  };
  band(bands.top - 400, bands.bottom + 400, VERGE);
  // THE PAVEMENTS, drawn exactly as wide as the sim lets a person stand
  // (`crowdEdges` — `DRIVE.pavementPx`), so somebody waiting at a crossing is
  // standing ON the paving rather than hovering over its inside edge.
  // THE PAVING RUNS RIGHT UP TO THE TARMAC. The car's own gutter (`roadEdges`,
  // the ten px it may stray past the outer lane marking) used to be left as
  // bare verge between the road and the paving, which put a green strip down
  // both sides of the street and left every lamp post looking marooned in the
  // middle of its pavement. A kerb is at the road's edge; so is this one.
  const walk = crowdEdges();
  band(walk.top, bands.top, PAVEMENT);
  band(bands.bottom, walk.bottom, PAVEMENT);
  band(bands.top - KERB_DEPTH, bands.top, KERB);
  band(bands.bottom, bands.bottom + KERB_DEPTH, KERB);
  band(bands.top - 2, bands.bottom + 2, ROAD_EDGE);
  band(bands.top, bands.bottom, ROAD);

  // THE CROSSINGS — the same paint the crowd is gathered onto
  // (`crossingsBetween`, and `DRIVE.crossingCrowdShare` in the sim), so what
  // the player reads a screen ahead is exactly where the people will be.
  //
  // THE STRIPES RUN THE WAY THE CARS DO, stacked across the road: a zebra is a
  // ladder the pedestrian steps over and the driver drives along, and drawn the
  // other way round it reads as a cattle grid.
  for (const cx of crossingsBetween(left, right)) {
    const bars = 6;
    const step = (bands.bottom - bands.top) / bars;
    for (let i = 0; i < bars; i++) {
      ctx.fillStyle = PAINT;
      ctx.fillRect(
        cx - DRIVE.crossingWidthPx / 2 - camera.x,
        bands.top + i * step + step * 0.2 - camera.y,
        DRIVE.crossingWidthPx,
        Math.max(1, step * 0.6),
      );
    }
  }

  // The lane paint. The centre line is solid (it divides the two directions of
  // travel and is the one line that means something); the rest are dashes.
  for (const [i, y] of bands.lanes.entries()) {
    const middle = i === Math.floor((DRIVE.laneCount - 1) / 2);
    ctx.fillStyle = PAINT;
    if (middle) {
      ctx.fillRect(left - camera.x, y - camera.y - 1, right - left, 2);
      continue;
    }
    const dash = 22;
    const gap = 20;
    const start = Math.floor(left / (dash + gap)) * (dash + gap);
    for (let x = start; x < right; x += dash + gap) {
      ctx.fillRect(x - camera.x, y - camera.y, dash, 1);
    }
  }

  // ── EVERYTHING WITH A BODY, PAINTED BACK TO FRONT ─────────────────────────
  // One list, one sort, one pass. A drive holds four kinds of standing thing
  // and every one of them has to interleave with the others by depth — a
  // pedestrian in lane 1 must be drawn before a van in lane 3 and after the
  // houses — so sorting them together is not a shortcut, it is the requirement.
  type Drawn = { y: number; draw: () => void };
  const drawn: Drawn[] = [];

  const put = (name: string, x: number, y: number, lift = 0) => {
    const sprite = spriteByName(sprites, name);
    if (!sprite) return;
    drawn.push({
      y,
      draw: () =>
        drawWorldSprite(ctx, name, sprite, { x, y: y - lift }, camera, "base"),
    });
  };

  for (const prop of sceneryBetween(left, right)) {
    put(prop.sprite, prop.x, prop.y);
  }
  for (const other of drive.traffic) {
    const name = TRAFFIC_SPRITES[other.variant % TRAFFIC_SPRITES.length];
    if (name) put(name, other.pos.x, other.pos.y);
  }
  for (const ped of drive.pedestrians) {
    const frames = CROWD_SPRITES[ped.variant % CROWD_SPRITES.length];
    if (!frames) continue;
    if (ped.mode === "tumbling") {
      // KNOCKED ASIDE, NOT KILLED — the gore-off outcome. Laid over on its side
      // by drawing the walk frame rotated, which is cheap and reads instantly
      // as "down" without needing a second set of art.
      const sprite = spriteByName(sprites, frames[0]);
      if (!sprite) continue;
      drawn.push({
        y: ped.pos.y,
        draw: () => {
          ctx.save();
          ctx.globalAlpha = 0.9;
          drawWorldSprite(
            ctx,
            frames[0],
            sprite,
            { x: ped.pos.x, y: ped.pos.y - ped.z },
            camera,
            "center",
          );
          ctx.restore();
        },
      });
      continue;
    }
    const frame = Math.floor(timeMs / CROWD_FRAME_MS) % 2;
    put(frames[frame] ?? frames[0], ped.pos.x, ped.pos.y, ped.z);
  }

  // The hero's own car, drawn by the RUN's own assembly pass so it is the same
  // wagon, panel for panel, that was parked in the bay a minute ago.
  drawn.push({
    y: drive.car.pos.y,
    draw: () => drawCarAssembly(ctx, drive.car, sprites, camera, timeMs),
  });

  // A thrown wheel, bouncing down the road behind the wreck.
  for (const wheel of drive.wheelDebris) {
    const name = wheel.wheelState === 1 ? "car_wheel_flat" : "car_wheel_0";
    put(name, wheel.pos.x, wheel.pos.y, wheel.z);
  }

  drawn.sort((a, b) => a.y - b.y);
  for (const item of drawn) item.draw();
  ctx.restore();
}
