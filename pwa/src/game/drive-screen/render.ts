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
  type DriveRemain,
  type DriveState,
} from "@game/core";

import { spriteByName, type Sprites } from "../assets.ts";
import { drawWorldSprite } from "../render/plane.ts";
import { drawSpriteFacing, seatX, seatY } from "../render/shared.ts";
import { applyWorldProjection, billboard } from "../render/tilt.ts";
import { drawCarAssembly } from "../render/vehicles.ts";

import type { PixelFont } from "@ui/lib/pixel-font.ts";

import type { Camera } from "../render/view.ts";
import {
  bodySprite,
  drawRemain,
  drawRoadMarks,
  type DriveGoreState,
} from "./drive-gore.ts";
import { carCoat, carIsClean, wheelCoat } from "./car-soak.ts";
import { drawPlacard, GLUED_BARKS, MAX_PLACARDS } from "./placards.ts";
import {
  CROWD_FRAME_MS,
  CROWD_SPRITES,
  LAMP_SPRITE,
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

/** How high off the road something has to be to be OVER the car rather than
 * behind it (world px). The wagon's own assembly is 26 px tall on a 16-px body
 * scale; a piece past this has cleared the roofline, and the painter's order
 * has to say so or a body sent over the top is drawn tidily behind the car that
 * sent it. */
const ROOF_PX = 20;

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
  /** What the road is holding of the people it has met — the marks on the
   * tarmac and the pieces standing on it (`drive-gore.ts`). Omitted by a host
   * that has none (nothing does today; the parameter is optional so a caller
   * that only wants the road can have it). */
  gore?: DriveGoreState,
  /** The game's own pixel font, for the one thing on this road that has WORDS
   * in it — THE GLUED's lines. Omitted draws the blockade silently, which is
   * still a blockade. */
  font?: PixelFont,
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

  // ── WHAT THE ROAD REMEMBERS ───────────────────────────────────────────────
  // The blood, the drag marks, the tread prints and the pressed-flat remains,
  // ON the tarmac and UNDER everything standing on it. The order is the whole
  // reason this call is here rather than in the effect layer: that layer is
  // painted over the finished frame, so a player driving back through his own
  // mess would have chunks of somebody laid across the bonnet. (The run's own
  // gore learned this one the hard way — `restsOnFloor` in render/effects.ts.)
  if (gore) drawRoadMarks(ctx, gore, camera, sprites, viewW);

  // ── EVERYTHING WITH A BODY, PAINTED BACK TO FRONT ─────────────────────────
  // One list, one sort, one pass. A drive holds four kinds of standing thing
  // and every one of them has to interleave with the others by depth — a
  // pedestrian in lane 1 must be drawn before a van in lane 3 and after the
  // houses — so sorting them together is not a shortcut, it is the requirement.
  type Drawn = { y: number; draw: () => void };
  const drawn: Drawn[] = [];
  /** What THE GLUED are saying, collected as the field is walked and drawn over
   * the finished picture — a bubble sorted in with the bodies would be painted
   * over by whoever is sitting in the next row back. */
  const bubbles: { line: string; ped: DriveState["pedestrians"][number] }[] =
    [];

  const put = (
    name: string,
    x: number,
    y: number,
    lift = 0,
    faceLeft = false,
  ) => {
    const sprite = spriteByName(sprites, name);
    if (!sprite) return;
    drawn.push({
      y,
      draw: () => {
        if (!faceLeft) {
          drawWorldSprite(
            ctx,
            name,
            sprite,
            { x, y: y - lift },
            camera,
            "base",
          );
          return;
        }
        // NOSE-FIRST DOWN ITS OWN LANE. Every car sprite is drawn facing right,
        // so oncoming traffic has to be mirrored — without this the far lanes
        // were full of cars driving backwards at 60, which reads as a bug long
        // before it reads as traffic. Mirrored around the sprite's own centre
        // INSIDE the billboard, exactly as every actor renderer does it
        // (`drawSpriteFacing`), so the flip cannot move where the car is
        // standing.
        billboard(ctx, x, y - lift, camera.x, camera.y, () =>
          drawSpriteFacing(
            ctx,
            sprite,
            seatX(x, camera.x) - Math.round(sprite.width / 2),
            seatY(y - lift, camera.y) - Math.round(sprite.height - 2),
            true,
          ),
        );
      },
    });
  };

  for (const prop of sceneryBetween(left, right)) {
    put(prop.sprite, prop.x, prop.y);
  }
  // THE KERB, drawn from the SIM rather than derived here — the furniture is
  // world now, so what is painted is exactly what the bumper can reach
  // (src/game/drive/street.ts). A standing piece is a plain blit; a FELLED post
  // is the one thing on this road drawn turned over, because a street light
  // that has left its base is the only object here whose orientation carries
  // information.
  for (const prop of drive.props) {
    if (prop.kind === "parked_car") {
      const name = TRAFFIC_SPRITES[prop.variant % TRAFFIC_SPRITES.length];
      if (name) put(name, prop.pos.x, prop.pos.y);
      continue;
    }
    if (!prop.felled) {
      put(LAMP_SPRITE, prop.pos.x, prop.pos.y);
      continue;
    }
    const sprite = spriteByName(sprites, LAMP_SPRITE);
    if (!sprite) continue;
    drawn.push({
      y: prop.pos.y,
      draw: () =>
        billboard(ctx, prop.pos.x, prop.pos.y, camera.x, camera.y, () => {
          // Turned about its FOOT, which is where it broke: a post pivoting
          // around its own middle reads as a spinning stick rather than as
          // something that was bolted to the pavement a moment ago.
          const cx = seatX(prop.pos.x, camera.x);
          const cy = seatY(prop.pos.y - prop.z, camera.y);
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(prop.angle);
          ctx.drawImage(
            sprite,
            -Math.round(sprite.width / 2),
            -Math.round(sprite.height - 2),
          );
          ctx.restore();
        }),
    });
  }
  for (const other of drive.traffic) {
    const name = TRAFFIC_SPRITES[other.variant % TRAFFIC_SPRITES.length];
    if (name) put(name, other.pos.x, other.pos.y, 0, other.faceLeft);
  }
  // WHAT IS LEFT OF THE ONES HE HAS ALREADY MET — halves, whole bodies and
  // chunks, each at its OWN place on the road, y-sorted in with everything else
  // standing on the tarmac. A half of somebody in lane one has to interleave
  // with the van in lane three exactly as a whole one does.
  //
  // A piece in the AIR is the one exception and it is the point of the whole
  // feature: past the car's own roof it is drawn LAST, over everything, because
  // it is above the wagon rather than behind it. Sorting it by its ground y
  // would put the upper half of somebody neatly behind the car it has just gone
  // over the top of.
  const overhead: DriveRemain[] = [];
  if (gore) {
    for (const piece of drive.remains) {
      if (piece.z > ROOF_PX) {
        overhead.push(piece);
        continue;
      }
      drawn.push({
        // A piece caught UNDER the car is drawn a hair in front of it so the
        // wagon covers it — what the player is meant to see of a body being
        // dragged is the red coming out from under the back, not the body.
        y: piece.dragMs > 0 ? piece.pos.y - 0.01 : piece.pos.y,
        draw: () => drawRemain(ctx, piece, camera, sprites),
      });
    }
  }

  for (const ped of drive.pedestrians) {
    // THE GLUED wear their own art and never animate — they sat down (see
    // `GLUED_SPRITES`). Everybody else walks.
    if (ped.kind === "glued" && ped.mode === "afoot") {
      const seated = bodySprite("glued", ped.variant);
      put(seated, ped.pos.x, ped.pos.y, ped.z);
      // …and a handful of them are saying so. The bubble is drawn AFTER the
      // whole y-sorted field rather than inside it, or the body in the next row
      // back is painted over its own neighbour's words.
      if (font && ped.bark >= 0) {
        const line = GLUED_BARKS[ped.bark % GLUED_BARKS.length];
        if (line) bubbles.push({ line, ped });
      }
      continue;
    }
    const frames =
      ped.kind === "glued"
        ? ([
            bodySprite("glued", ped.variant),
            bodySprite("glued", ped.variant),
          ] as const)
        : CROWD_SPRITES[ped.variant % CROWD_SPRITES.length];
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
  // wagon, panel for panel, that was parked in the bay a minute ago — now
  // wearing whatever it has been driven through (`car-soak.ts`), masked to each
  // panel's own art. A clean wagon passes nothing and is the blit it always
  // was, which is what every other caller of that pass still gets.
  const coat = gore && !carIsClean(gore.car) ? carCoat(gore.car) : undefined;
  const tyres = gore ? wheelCoat(gore.tyre) : undefined;
  drawn.push({
    y: drive.car.pos.y,
    draw: () =>
      drawCarAssembly(ctx, drive.car, sprites, camera, timeMs, coat, tyres),
  });

  // A thrown wheel, bouncing down the road behind the wreck.
  for (const wheel of drive.wheelDebris) {
    const name = wheel.wheelState === 1 ? "car_wheel_flat" : "car_wheel_0";
    put(name, wheel.pos.x, wheel.pos.y, wheel.z);
  }

  drawn.sort((a, b) => a.y - b.y);
  for (const item of drawn) item.draw();
  // OVER THE ROOF: the half of somebody the bumper sent up. It is above the car
  // rather than behind it, so it is painted after the car whatever its ground y
  // says — which is exactly what the eye reads as "he went over the top".
  for (const piece of overhead) drawRemain(ctx, piece, camera, sprites);
  ctx.restore();

  // …AND THE WORDS, LAST OF ALL, OVER EVERYBODY — but only the NEAREST of them
  // (`MAX_PLACARDS`), which is the whole layout rule and is explained where that
  // number lives. Nearest-first is the honest cut: as the car closes, each
  // speaker in turn is passed and the next takes the bubble, so a picket line
  // reads as a SEQUENCE of lines rather than as a wall of overprinted text.
  if (font) {
    const dir = drive.params.direction;
    const near = bubbles
      .map((bubble) => ({
        ...bubble,
        away: (bubble.ped.pos.x - drive.car.pos.x) * dir,
      }))
      .filter((bubble) => bubble.away > 0)
      .sort((a, b) => a.away - b.away)
      .slice(0, MAX_PLACARDS);
    for (const bubble of near) {
      drawPlacard(
        ctx,
        font,
        bubble.line,
        bubble.ped.pos.x,
        bubble.ped.pos.y,
        camera,
        bubble.away,
      );
    }
  }
}
