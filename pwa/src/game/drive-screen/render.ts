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
  cityStartPx,
  citySpanX,
  crossingsBetween,
  crowdEdges,
  driveSite,
  DRIVE,
  DRIVE_OUTCOME,
  planSite,
  planTown,
  siteSpanX,
  siteVehicles,
  roadBandHalfAt,
  townRoad,
  vehicleDef,
  type DriveRemain,
  type DriveState,
  type DriveTraffic,
} from "@game/core";

import { spriteByName, type Sprites } from "../assets.ts";
import { drawNightSky } from "../render/night-sky.ts";
import { drawWorldSprite } from "../render/plane.ts";
import { drawSpriteFacing, seatX, seatY } from "../render/shared.ts";
import {
  applyWorldProjection,
  billboard,
  projectX,
  projectY,
  unprojectY,
} from "../render/tilt.ts";
import {
  drawCarAssembly,
  drawLightCones,
  wheelSprite,
} from "../render/vehicles.ts";

import type { PixelFont } from "@ui/lib/pixel-font.ts";

import { VIEW_SCALE, type Camera } from "../render/view.ts";
import {
  bodySprite,
  drawRemain,
  drawRoadMarks,
  type DriveGoreState,
} from "./drive-gore.ts";
import { carCoat, carIsClean, wheelCoat } from "./car-soak.ts";
import { drawSkidMarks, type SkidState } from "./skid.ts";
import { drawTrafficBody } from "./wreck-draw.ts";
import {
  CROWD_THOUGHTS,
  drawPlacard,
  GLUED_BARKS,
  MAX_PLACARDS,
  PLACARD_READ_PX,
  type PlacardVoice,
} from "./placards.ts";
import {
  CROWD_FRAME_MS,
  CROWD_SPRITES,
  LAMP_SPRITE,
  LAMP_STUB_PX,
  mastAt,
  roadBands,
  ROAD_LAMP_HEAD_PX,
  ROAD_LAMP_POOL_PX,
  lightBody,
  RIDER_SEATS,
  RIDER_SPRITES,
  ROAD_INK,
  CENTRE_DASH,
  trafficSprite,
} from "./scenery.ts";
import { drawTownProp, ensureTownArt } from "./town-art.ts";

/** The ground either side of the tarmac. */
const VERGE = "#2b3327";
/** …and the same ground going away from the eye, at the far edge of what can be
 * seen of it. A flat verge running right up to the skyline reads as a wall of
 * grass standing behind the town; darkening the last stretch of it is what
 * turns the same fill into ground receding. */
const VERGE_FAR = "#232a20";
/** The pavement each side of the road, and the kerb that steps up to it. A
 * touch warmer and lighter than the tarmac so the eye reads a different surface
 * at a glance rather than a wider road. */
const PAVEMENT = "#4a4741";
/** …and GOODCO's own ground, which is neither: a poured concrete apron running
 * from its fence back to the halls. Cooler and flatter than the town's paving,
 * because that is what a car park is and because the change of surface is half
 * of what tells the player the town is behind him. */
const APRON = "#3b414a";
/** …and the OTHER end of the same road, which is neither again: the mown grass
 * of the hero's own front lawn, running from his fence back to the pad. Warmer
 * and plainly greener than the wild verge outside it — a kept lawn against
 * scrub is the cheapest way to say somebody lives here, and it is the whole
 * visual answer to GOODCO's concrete. */
const LAWN = "#2f4028";
/** What a SITE's ground is, by the name the engine gives it (`SiteGround`).
 * The engine has no palette; this is the one place the two ends of the road
 * become colours. */
const SITE_GROUND: Record<string, string> = { apron: APRON, lawn: LAWN };
/** The tarmac, its rim, the kerb off it and the paint on it — read from the
 * ONE road table (`scenery.ts`), because the garage cutscenes lay this same
 * stretch of road across the front of the lot as authored ground art, and two
 * sets of greys for one road is a drift with nothing watching it. */
const { road: ROAD, edge: ROAD_EDGE, kerb: KERB, paint: PAINT } = ROAD_INK;

/** The kerb's own step up off the tarmac (world px). The pavement's DEPTH is
 * not a drawing decision at all — it is `DRIVE.pavementPx`, because people
 * stand on it (`crowdEdges`). */
const KERB_DEPTH = 2;

/**
 * …and the tarmac's own darker rim outside the outer lane markings (world px) —
 * the gutter the paint stops short of.
 *
 * IT USED TO BE A LITERAL `2` PAINTED AFTER THE KERB, and the two numbers being
 * the same number is exactly why the kerb was never once visible: the rim was
 * laid from `bands.top - 2` to `bands.bottom + 2`, which is precisely the pair
 * of strips the kerb had just been drawn into, so every frame of every drive
 * painted the kerb and then painted over the whole of it. The pavement met the
 * tarmac with nothing between them but a dark lip, which reads as a road that
 * is four px wider rather than as a street with a kerb down each side.
 *
 * The three bands are disjoint now and stack outward from the paint: road, rim,
 * kerb, pavement.
 */
const ROAD_LIP = 2;

/**
 * How far ahead of the car the camera sits, as a share of the frame's width —
 * the car rides in the trailing third of the picture so the player can read the
 * crowd coming.
 *
 * A SHARE rather than a distance, because "the trailing third" is a statement
 * about the PICTURE. Held as a flat 96 world px it was the trailing third of a
 * phone on its side and very nearly the left edge of one held upright, where
 * the frame is less than half as wide — the wagon drove with its nose in the
 * bezel.
 */
const CAMERA_LEAD_FRAC = 0.23;

/** How much ground is kept below the near pavement (world px) — the strip of
 * verge between the kerb and the dashboard's own band. */
const NEAR_MARGIN = 6;

/**
 * THE DASHBOARD'S BAND — how many CSS px at the bottom of the frame the road is
 * kept OUT of, so the dials have grass under them instead of tarmac.
 *
 * The HUD is DOM and the road is a canvas, so this is the one number the two
 * sides have to agree on by hand. It is arithmetic rather than taste, and the
 * arithmetic is worth writing down because the pieces move:
 *
 *   the dials' INK          0.8 × `--drive-dial-size`   77
 *   …their baseline         `.drive-dash`              12
 *   …and the verge above                               12
 *
 * IT IS THE INK AND NOT THE BOX, because the last fifth of a dial's box is the
 * empty mouth of its 250° sweep and it is hung off the bottom of the frame on
 * purpose (`--drive-dial-tail`, styles.css) so the arcs level with the speech
 * window rather than floating above it. Reserving road for air nobody draws in
 * would push the tarmac up for nothing.
 *
 * WHICH ALSO CLEARS THE SPEECH WINDOW BESIDE IT: that window is 77 px on the
 * same baseline, so one band covers both to the pixel. Any smaller and the
 * instruments print over the lane the crowd is walking into, which is the one
 * thing the band exists to stop.
 *
 * IN CSS PX AT THE 1× TIER, which is what the rem column above resolves to on a
 * phone — and the conversion below is a division by `VIEW_SCALE` alone rather
 * than by the whole zoom. The dashboard is rem all the way down now, so it
 * DOUBLES with the root font on a desktop exactly as the canvas doubles beneath
 * it: the two step together, and the band it needs is therefore a constant
 * number of WORLD px. (It was a division by the whole zoom when the dials were
 * fixed px, and that was right then — a dial that did not grow needed a band
 * that shrank.)
 *
 * A speedometer half over the road was legible — the shadow saw to that — but it
 * read as a HUD dropped on top of a picture rather than as a dashboard the
 * player is looking over, and the arcs fought the lane markings the whole way.
 */
const DASH_BAND_CSS = 101;

/**
 * …and what PORTRAIT adds to it: the hero's speech window, which on a tall
 * screen has nowhere beside the dials to go and sits above them instead
 * (`.drive-bark`'s portrait rule). Landscape puts it to their right and pays
 * nothing.
 *
 * The road can afford it there and cannot here: a portrait frame is mostly sky
 * (the ground is a fixed 167 px band however tall the screen is), so this
 * spends the room the sky had going spare.
 */
const BARK_BAND_CSS = 132;

/** Where the ground stops and the sky starts, measured back from the far
 * pavement (world px). The town's frontages stand 13 px back from that same
 * edge (`TOWN_SETBACK_PX`, engine/game/drive/town-parts.ts), so this leaves a
 * strip of verge visible BEHIND the houses and through the alleys between
 * them — without it the roofline would be the horizon, and the gaps in the row
 * would show sky at street level. */
const SKYLINE_SETBACK = 26;

/** How high off the road something has to be to be OVER the car rather than
 * behind it (world px). The wagon's own assembly is 26 px tall on a 16-px body
 * scale; a piece past this has cleared the roofline, and the painter's order
 * has to say so or a body sent over the top is drawn tidily behind the car that
 * sent it. */
const ROOF_PX = 20;

/**
 * Where the camera stands for a drive.
 *
 * IT IS HUNG OFF THE BOTTOM OF THE FRAME, NOT THE MIDDLE, and both halves of
 * that are load-bearing.
 *
 * THE BOTTOM, because the ground is a FIXED band of world — the kerb, the four
 * lanes and the far pavement are 167 px however big the screen is — while the
 * frame is not. Centring the road handed every spare pixel to the near verge,
 * which has nothing on it by design (the town stands on the FAR side, so a row
 * of houses this side would hide the lane the crowd is walking into). On a
 * phone held upright that was more than half the picture: a road across the top
 * and an empty field under it. Pinning the near kerb near the bottom edge sends
 * the spare room UP instead, where the sky is (`render/night-sky.ts`), and a
 * taller screen now buys more night rather than more grass.
 *
 * AND IN PROJECTED PX, because the view is TALLER in world units than the
 * canvas is in pixels — that is what the pitch does (`render/tilt.ts`). The old
 * `-viewH / 2` measured the drop in canvas px and used it as world px, so the
 * road sat at 37% of the frame rather than where it was asked to; `unprojectY`
 * is the same conversion the run's own camera makes (`computeCamera`).
 *
 * The y is pinned to the ROAD rather than to the car, exactly as it always was:
 * a camera that tracked the car across the lanes would make changing lanes look
 * like the WORLD moving, which is the one thing that must not happen in a lane
 * game.
 *
 * AND THE BOTTOM OF THE FRAME IS NOT THE BOTTOM OF THE ROAD. A band is held
 * back for the DASHBOARD (`DASH_BAND_CSS`, plus the speech window's own in
 * portrait), so the dials sit on the verge rather than over the lane the crowd
 * is walking into. Reserving it is exactly "pretend the frame is shorter":
 * everything else about the framing — the fixed ground band, the spare room
 * going to the sky — is unchanged above it.
 */
export function driveCamera(
  drive: DriveState,
  viewW: number,
  viewH: number,
): Camera {
  const dir = drive.params.direction;
  // Portrait is the taller-than-wide frame, and it is the one that also has to
  // find room for the hero talking to himself.
  const bandCss = DASH_BAND_CSS + (viewH > viewW ? BARK_BAND_CSS : 0);
  // CSS px at the 1× tier → world px. `VIEW_SCALE` alone, because the UI tier's
  // own multiplier cancels: the dashboard is rem-sized, so it grows by exactly
  // the factor the canvas zooms by (`viewScaleFor` is `VIEW_SCALE × uiScale`).
  const band = Math.min(viewH * 0.6, bandCss / VIEW_SCALE);
  return {
    // …PLUS WHATEVER OF THE OPENING IS LEFT. A leg starts with the camera
    // carried this much further down the road than it belongs
    // (`DriveState.entryPx`), so the first frame is empty tarmac and the wagon
    // comes into the picture from behind as the lead is given back. It is the
    // ONE thing on this road that moves the frame rather than the world, and it
    // is zero for every frame after the car has arrived.
    x:
      drive.car.pos.x +
      dir * (viewW * CAMERA_LEAD_FRAC + drive.entryPx) -
      viewW / 2,
    // …AND THE RUN-IN'S OWN LIFT, which is the one thing besides the opening's
    // lead that moves the frame rather than the world. See
    // `DRIVE.arrival.cameraLiftPx`: the road is framed for the road, and the
    // arrival is the one beat that is about what is standing behind the fence.
    y:
      crowdEdges().bottom +
      NEAR_MARGIN -
      unprojectY(0, viewH - band) -
      arrivalLift(drive),
  };
}

/**
 * How far the camera has risen into the arrival (world px) — zero for the whole
 * of a drive, easing to `DRIVE.arrival.cameraLiftPx` over the first second of
 * the run-in.
 *
 * SMOOTHSTEPPED rather than linear, because the only thing this beat must never
 * look like is the road jumping: a linear ramp starts and stops with a corner in
 * it, and at this size a corner in a camera move reads as a dropped frame.
 */
function arrivalLift(drive: DriveState): number {
  if (drive.outcome !== DRIVE_OUTCOME.arrived) return 0;
  const { cameraLiftPx, cameraLiftMs } = DRIVE.arrival;
  const t = Math.max(0, Math.min(1, drive.outcomeMs / cameraLiftMs));
  return cameraLiftPx * t * t * (3 - 2 * t);
}

/** The world y at which the ground gives out and the sky takes over. */
function skylineY(): number {
  return crowdEdges().top - SKYLINE_SETBACK;
}

/**
 * THE TARMAC, WHICH IS NOT A RECTANGLE — the carriageway between two world x,
 * filled at whatever width the road actually is there.
 *
 * THE ROAD OUT OF TOWN IS TWO LANES and the town's is four (`roadBandHalfAt`),
 * so somewhere on the approach it OPENS OUT — and a band drawn at one width or
 * the other is wrong on one side of that. It is a polygon rather than a stack of
 * per-pixel slices for the obvious reason: the shape is piecewise LINEAR, so
 * four points describe it exactly and a hundred and twenty `fillRect`s a frame
 * would describe it worse.
 *
 * `inset` widens it on both sides — which is how the darker rim outside the
 * outer lane markings is drawn from the same shape rather than from a second
 * one that could disagree with it by a pixel.
 *
 * IT IS SAMPLED AT THE ENDS AND AT THE TAPER'S OWN CORNERS. Every other x on the
 * road is one of the two flats, and a straight edge between two points on a
 * straight edge is the same straight edge — so the only samples that carry
 * information are the frame's two edges and the two places the width starts and
 * stops changing.
 */
function carriageway(
  ctx: CanvasRenderingContext2D,
  drive: DriveState,
  camera: Camera,
  left: number,
  right: number,
  inset: number,
  fill: string,
): void {
  const dir = drive.params.direction;
  const half = (x: number) => roadBandHalfAt(dir * x, drive.params) + inset;
  // The taper's two corners, in world x — the leg's own direction settles which
  // of them is the smaller coordinate, so they are sorted rather than assumed.
  const gate = dir * cityStartPx(drive.params);
  const opens = dir * (cityStartPx(drive.params) - DRIVE.opening.widenPx);
  const marks = [left, right, gate, opens]
    .filter((x) => x >= left && x <= right)
    .sort((a, b) => a - b);
  if (marks.length < 2) return;
  ctx.fillStyle = fill;
  ctx.beginPath();
  for (const x of marks) ctx.lineTo(x - camera.x, -half(x) - camera.y);
  for (let i = marks.length - 1; i >= 0; i--) {
    const x = marks[i]!;
    ctx.lineTo(x - camera.x, half(x) - camera.y);
  }
  ctx.closePath();
  ctx.fill();
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
  /** The rubber the DRIVER left — every handbrake stop's two black lines
   * (`skid.ts`). Optional on the same terms as the gore beside it. */
  skids?: SkidState,
  /** False in SFW mode: draw the road's live actors but none of the damaged,
   * felled, thrown or remnant sprites collisions created. */
  collisionVisuals = true,
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
  //
  // …EXCEPT THE SKY, which is drawn BEFORE the projection is on and is the one
  // pass in this file that stays in canvas px (`render/night-sky.ts` — a moon
  // run through a transform that foreshortens distance would be squashed toward
  // the horizon as though it were lying in a field). It is painted first
  // because it is behind everything: the town's roofline, the gaps between the
  // frontages and the strip of verge behind them are all drawn over it.
  //
  // IT IS ALSO THE LAUNCH CUTSCENE'S SKY, which is why the file sits in the
  // shared render pool: the same night, the same moon, the same weather, held
  // still over the garage the road starts from.
  const horizon = projectY(0, skylineY() - camera.y);
  // The same taller-than-wide test the camera makes above, and the sky spends
  // it on exactly one thing: bringing the moon down clear of the phone's own
  // status bar (`render/night-sky.ts`).
  drawNightSky(ctx, sprites, camera.x, viewW, horizon, timeMs, {
    portrait: viewH > viewW,
  });
  ctx.save();
  applyWorldProjection(ctx);
  const left = camera.x - 64;
  const right = camera.x + viewW + 64;
  const band = (top: number, bottom: number, fill: string) => {
    ctx.fillStyle = fill;
    ctx.fillRect(left - camera.x, top - camera.y, right - left, bottom - top);
  };
  /**
   * …and the same thing for a band that does NOT run the whole length of the
   * road: the far pavement, the far kerb and GOODCO's apron each exist only over
   * their own stretch of world x.
   *
   * THE FAR SIDE OF THIS ROAD IS NOT ALWAYS THERE, which is the change every
   * clipped band below is serving. The leg opens OUT OF TOWN — one pavement, the
   * near one, and nothing but verge on the other side of the carriageway — and
   * it ends on a company's own concrete. Painting the far paving from end to end
   * put a kerb and a footway along the top of a road with no houses on it, which
   * reads as the town having failed to load rather than as somewhere before it.
   */
  const bandX = (
    fromX: number,
    toX: number,
    top: number,
    bottom: number,
    fill: string,
  ) => {
    const x0 = Math.max(left, fromX);
    const x1 = Math.min(right, toX);
    if (x1 <= x0) return;
    ctx.fillStyle = fill;
    ctx.fillRect(x0 - camera.x, top - camera.y, x1 - x0, bottom - top);
  };
  const road = townRoad(drive.params);
  const city = citySpanX(drive.params);
  const site = driveSite(drive.params.to);
  const grounds = siteSpanX(road, site);
  // THE BUILT-UP STRETCH — the town and GOODCO's site together, which is
  // everywhere the road has a far pavement and a far kerb. The two overlap (the
  // fence opens before the finish line), so this is a union rather than a pair
  // of adjacent bands, and it is taken in world x rather than along the leg
  // because the trip HOME lays the identical road out along negative x.
  const built = {
    fromX: Math.min(city.fromX, grounds.fromX),
    toX: Math.max(city.toX, grounds.toX),
  };
  // THE GROUND STOPS AT THE SKYLINE. It used to run 400 px past the road on
  // both sides, which on any screen meant "everywhere" — so the sky colour
  // underneath it was never once visible and the night was a field of grass.
  band(skylineY(), bands.bottom + 400, VERGE);
  band(skylineY(), skylineY() + SKYLINE_SETBACK * 0.6, VERGE_FAR);
  // THE PAVEMENTS, drawn exactly as wide as the sim lets a person stand
  // (`crowdEdges` — `DRIVE.pavementPx`), so somebody waiting at a crossing is
  // standing ON the paving rather than hovering over its inside edge.
  // THE PAVING RUNS RIGHT UP TO THE TARMAC. The car's own gutter (`roadEdges`,
  // the ten px it may stray past the outer lane marking) used to be left as
  // bare verge between the road and the paving, which put a green strip down
  // both sides of the street and left every lamp post looking marooned in the
  // middle of its pavement. A kerb is at the road's edge; so is this one.
  const walk = crowdEdges();
  // THE SITE'S OWN GROUND, first of the far-side surfaces because everything
  // else out there is drawn over it: GOODCO's concrete, or the hero's own mown
  // lawn, running from its boundary back to the skyline — which is what turns
  // the last stretch of far verge into a place rather than a field with
  // buildings in it.
  bandX(
    grounds.fromX,
    grounds.toX,
    skylineY(),
    walk.top,
    SITE_GROUND[site.ground] ?? APRON,
  );
  // THE FAR PAVEMENT IS THE BUILT-UP ROAD'S, and stops where the buildings do.
  bandX(built.fromX, built.toX, walk.top, bands.top, PAVEMENT);
  // The near one is the whole road's: it is the pavement the delivery riders are
  // on out of town, the crowd's on the way through it, and GOODCO's own footway
  // at the end.
  band(bands.bottom, walk.bottom, PAVEMENT);
  // OUTWARD FROM THE PAINT, and each band strictly outside the last: the
  // tarmac, its darker rim, then the KERB stepping up onto the pavement. Laid
  // in any other order they overlap and one of them is simply not there — see
  // `ROAD_LIP`, which is the mistake this ordering exists to hold shut.
  //
  // …AND THE TARMAC ITSELF IS NOT A BAND, because it is not the same width all
  // the way down the road. The approach is the middle TWO lanes and it opens out
  // to four over the last stretch before the first house (`roadBandHalfAt`), so
  // the carriageway and its rim are drawn as a TAPERED shape: a constant strip
  // out on the approach, a trapezoid where it widens, and a constant strip
  // through the town and out the other side.
  carriageway(ctx, drive, camera, left, right, ROAD_LIP, ROAD_EDGE);
  bandX(
    built.fromX,
    built.toX,
    bands.top - ROAD_LIP - KERB_DEPTH,
    bands.top - ROAD_LIP,
    KERB,
  );
  // THE NEAR KERB IS THE PAVEMENT'S, not the road's, and that is why it runs the
  // whole length while the far one stops with the buildings: out of town the
  // footway is still a footway with a kerb on it — there is simply a lane's
  // worth of verge between that kerb and the tarmac, which is the gap the
  // cyclists are safe in.
  band(bands.bottom + ROAD_LIP, bands.bottom + ROAD_LIP + KERB_DEPTH, KERB);
  carriageway(ctx, drive, camera, left, right, 0, ROAD);

  // THE CROSSINGS — the same paint the crowd is gathered onto
  // (`crossingsBetween`, and `DRIVE.crossingCrowdShare` in the sim), so what
  // the player reads a screen ahead is exactly where the people will be.
  //
  // THE STRIPES RUN THE WAY THE CARS DO, stacked across the road: a zebra is a
  // ladder the pedestrian steps over and the driver drives along, and drawn the
  // other way round it reads as a cattle grid.
  // …AND ONLY WHERE THERE IS SOMETHING TO CROSS TO. A zebra needs a pavement at
  // both ends of it, and out of town there is one — a crossing painted across
  // four empty lanes between two verges is the single loudest way to say the
  // wrong thing about where the player is.
  for (const cx of crossingsBetween(
    Math.max(left, city.fromX),
    Math.min(right, city.toX),
  )) {
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
  //
  // …AND THE DASHES ONLY EXIST WHERE THERE ARE FOUR LANES. The approach is the
  // middle two, so its lane markings are the centre line and nothing else — a
  // dash painted out there would be a lane division running down the middle of
  // the grass, which is the loudest possible way to say the road did not finish
  // drawing. The CENTRE line runs the whole length, because a two-lane road has
  // one and it is in exactly the same place.
  //
  // …AND THE CENTRE LINE IS ONLY SOLID IN THE TOWN. A solid centre is a
  // four-lane dual carriageway's — it says "do not cross" between two pairs of
  // lanes — and out on the approach there are only the two, where every road in
  // the world paints a broken white line down the middle. It is a SHORTER dash
  // than the lane markings beside it, which is also what a real one is: a centre
  // line's marks are stubbier and closer together than a lane divider's, and at
  // this size that difference is the whole of what tells the two apart.
  const dashes = (
    y: number,
    from: number,
    to: number,
    on: number,
    off: number,
  ) => {
    const start = Math.floor(from / (on + off)) * (on + off);
    for (let x = start; x < to; x += on + off) {
      const run = Math.min(on, to - x);
      if (x < from || run <= 0) continue;
      ctx.fillRect(x - camera.x, y - camera.y, run, 1);
    }
  };
  const inTownFrom = Math.max(left, built.fromX);
  const inTownTo = Math.min(right, built.toX);
  for (const [i, y] of bands.lanes.entries()) {
    const middle = i === Math.floor((DRIVE.laneCount - 1) / 2);
    ctx.fillStyle = PAINT;
    if (middle) {
      // Solid through the built-up road…
      if (inTownTo > inTownFrom) {
        ctx.fillRect(
          inTownFrom - camera.x,
          y - camera.y - 1,
          inTownTo - inTownFrom,
          2,
        );
      }
      // …and broken either side of it, which out here is both sides of the leg:
      // the approach in front of the town, and nothing behind GOODCO's gate.
      if (inTownFrom > left)
        dashes(y, left, inTownFrom, CENTRE_DASH.on, CENTRE_DASH.off);
      if (inTownTo < right)
        dashes(y, inTownTo, right, CENTRE_DASH.on, CENTRE_DASH.off);
      continue;
    }
    dashes(y, inTownFrom, inTownTo, 22, 20);
  }

  // ── WHAT THE ROAD REMEMBERS ───────────────────────────────────────────────
  // The blood, the drag marks, the tread prints and the pressed-flat remains,
  // ON the tarmac and UNDER everything standing on it. The order is the whole
  // reason this call is here rather than in the effect layer: that layer is
  // painted over the finished frame, so a player driving back through his own
  // mess would have chunks of somebody laid across the bonnet. (The run's own
  // gore learned this one the hard way — `restsOnFloor` in render/effects.ts.)
  // The RUBBER goes down first, under the blood: a skid is laid by a car that
  // was still moving and the mess is laid by what it then arrived at, so a
  // splash on top of a skid is the order those two things happened in.
  if (skids) drawSkidMarks(ctx, skids, camera, viewW);
  if (gore) drawRoadMarks(ctx, gore, camera, sprites, viewW);

  // ── AND WHAT THE STREET LIGHTING PUTS ON IT ───────────────────────────────
  // The pools go down LAST of everything lying on the road, because light falls
  // ON the paint and on the mess rather than under it — a pool drawn before the
  // blood is a pool with the blood painted over it, which reads as a wet patch.
  // They are drawn in the PROJECTED space with the rest of the ground, so a
  // circle here comes out as the ellipse a downward lamp actually casts; the
  // masts themselves stand up out of the y-sorted pass below.
  for (const prop of drive.props) {
    if (prop.kind !== "lamp_post" || prop.felled) continue;
    const mast = mastAt(prop.pos);
    if (!mast) continue;
    ctx.save();
    ctx.translate(prop.pos.x - camera.x, mast.poolY - camera.y);
    ctx.fillStyle = lampPool(ctx);
    ctx.beginPath();
    ctx.arc(0, 0, ROAD_LAMP_POOL_PX, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ── EVERYTHING WITH A BODY, PAINTED BACK TO FRONT ─────────────────────────
  // One list, one sort, one pass. A drive holds four kinds of standing thing
  // and every one of them has to interleave with the others by depth — a
  // pedestrian in lane 1 must be drawn before a van in lane 3 and after the
  // houses — so sorting them together is not a shortcut, it is the requirement.
  type Drawn = { y: number; draw: () => void };
  const drawn: Drawn[] = [];
  /** What the road is saying and thinking, collected as the field is walked and
   * drawn over the finished picture — a bubble sorted in with the bodies would
   * be painted over by whoever is standing in the next row back. */
  const bubbles: {
    line: string;
    voice: PlacardVoice;
    ped: DriveState["pedestrians"][number];
  }[] = [];

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

  /**
   * A RIDER, SEATED ON WHAT THEY ARE RIDING.
   *
   * Drawn as its OWN entry at the machine's lane rather than composited into
   * it, and sorted a hair behind so it lands on top of the saddle it belongs to
   * — which is what lets the machine keep going down the road without one the
   * instant the road takes them off it.
   *
   * The lift is a SCREEN offset rather than a world one, and that is the whole
   * of getting a seated body onto a machine: raising the rider in world y would
   * move them UP THE ROAD as well as up the screen (the ground foreshortens),
   * so at the shipped pitch a rider seated five px above the frame would also be
   * sitting most of a metre behind it.
   */
  const putRider = (
    name: string,
    x: number,
    y: number,
    lift: number,
    faceLeft: boolean,
  ) => {
    const sprite = spriteByName(sprites, name);
    if (!sprite) return;
    drawn.push({
      y: y + 0.001,
      draw: () =>
        billboard(ctx, x, y, camera.x, camera.y, () =>
          drawSpriteFacing(
            ctx,
            sprite,
            seatX(x, camera.x) - Math.round(sprite.width / 2),
            seatY(y, camera.y) - Math.round(sprite.height - 2) - lift,
            faceLeft,
          ),
        ),
    });
  };

  /** …and a machine that has gone over: turned about its own centre and lifted
   * by whatever it is still off the road, exactly as a felled lamp post is. */
  const putTumbling = (name: string, other: DriveTraffic) => {
    const sprite = spriteByName(sprites, name);
    if (!sprite) return;
    drawn.push({
      y: other.pos.y,
      draw: () =>
        billboard(ctx, other.pos.x, other.pos.y, camera.x, camera.y, () => {
          ctx.save();
          ctx.translate(
            seatX(other.pos.x, camera.x),
            seatY(other.pos.y, camera.y) - Math.round(other.z),
          );
          ctx.rotate(other.angle);
          ctx.drawImage(
            sprite,
            -Math.round(sprite.width / 2),
            -Math.round(sprite.height / 2),
          );
          ctx.restore();
        }),
    });
  };

  // THE TOWN. Planned by the engine and ASSEMBLED here (`town-art.ts`) — a
  // building is a stack of parts rather than a sprite, so what goes into the
  // painter's list is a composed canvas and its own base rather than a name.
  // Sorted in with everything else for the usual reason: a frontage fence
  // stands nearer the camera than the house it fences, and both stand behind
  // every body on the pavement.
  ensureTownArt(sprites);
  for (const prop of planTown(left, right, road)) {
    drawn.push({
      y: prop.y,
      draw: () => drawTownProp(ctx, sprites, prop, camera),
    });
  }
  // …AND WHAT IS AT THE END OF IT. Whichever way this leg runs: GOODCO's fence,
  // its staff lot, its halls and the ship behind them, or the hero's own gate,
  // his house and the ship he built in its garage (`engine/game/drive/sites.ts`)
  // — a second planner, because a fixed arrangement is not a district of a
  // procedural street, and the SAME pass, because a planned piece of scenery is
  // a stack of sprites on a base either way.
  for (const prop of planSite(left, right, road, site)) {
    drawn.push({
      y: prop.y,
      draw: () => drawTownProp(ctx, sprites, prop, camera),
    });
  }
  // …and any vehicles standing on it — GOODCO's staff lot; nothing at all at the
  // other end, where the only car this house has is the one just driven home.
  // Placed by the same planner and drawn by the ORDINARY blit rather than the
  // compositor, because a car's grid is authored art whose size the engine does
  // not know — see `SiteLayout.vehicles`.
  for (const car of siteVehicles(left, right, road, site)) {
    put(car.sprite, car.x, car.y);
  }
  // THE KERB, drawn from the SIM rather than derived here — the furniture is
  // world now, so what is painted is exactly what the bumper can reach
  // (engine/game/drive/street.ts). A standing piece is a plain blit; a FELLED post
  // is the one thing on this road drawn turned over, because a street light
  // that has left its base is the only object here whose orientation carries
  // information.
  for (const prop of drive.props) {
    if (prop.kind === "parked_car") {
      // Somebody's own vehicle, left at the kerb — undamaged, because nobody
      // parks a wreck.
      put(trafficSprite(prop.variant, 0), prop.pos.x, prop.pos.y);
      continue;
    }
    if (!collisionVisuals) {
      const stood = prop.stub ?? prop.pos;
      put(mastAt(stood)?.sprite ?? LAMP_SPRITE, stood.x, stood.y);
      continue;
    }
    // EVERY POST ON THIS ROAD IS A MAST. The little yard lights that used to
    // stand between them are gone (`street.ts`): once the masts were tall
    // enough to throw real light on the tarmac, the short ones stopped reading
    // as lighting and started reading as a row of sticks along the kerb. What
    // is still one of TWO pictures is which WAY it points — the far row burns
    // toward the eye, the near row shows the back of its cowl (`mastAt`).
    //
    // The cone is drawn WITH the mast rather than in a pass of its own — a beam
    // is part of the lamp, and one sorted separately would be thrown by a post
    // the picture had already covered up.
    const mast = prop.felled ? null : mastAt(prop.pos);
    if (mast) {
      // THE BEAM IS SORTED WHERE THE LIGHT LANDS, not where the lamp stands,
      // and that is the whole of getting the near row right. Light travels from
      // the head to the tarmac, so the lit volume sits BETWEEN the two — which
      // for the far row is in front of its own post and for the near row is
      // BEHIND it. Sorted with the post instead, the near row painted its cone
      // over every car it was supposed to be lighting.
      drawn.push({
        y: mast.poolY,
        draw: () => drawLampBeam(ctx, prop.pos, mast.poolY, camera),
      });
      put(mast.sprite, prop.pos.x, prop.pos.y);
      continue;
    }
    if (!prop.felled) {
      put(LAMP_SPRITE, prop.pos.x, prop.pos.y);
      continue;
    }
    // A FELLED post has BROKEN, and the picture has to say so in three ways.
    //
    // It is THE SAME POST. This is the one that was wrong, and it was wrong
    // twice over. The picture was looked up from `mastAt(prop.pos)` — and a
    // felled post's `pos` is the FLYING HALF's, which is already moving by the
    // next tick. So a tall mast on the far row became, on the frame it was hit,
    // the near row's picture (a different head, seen from the other side), and
    // then a tick later — once the column had travelled the one pixel `mastAt`
    // tolerates — the little garden yard light, which is a third of the height.
    // The post did not read as breaking; it read as being SUBSTITUTED, twice.
    //
    // Both halves of that are the same fix: ask where the post STOOD, which is
    // the foot it left behind (`prop.stub`, stamped by `fellLamp` for exactly
    // this reason and nothing else), and never the thing that is moving.
    //
    // It is DARK — the lens is on the road, and the beam and the pool above are
    // already gone (they are gated on `felled`). It wears its own lights-out
    // grid for that (`<name>_out`, derived beside it by `asset-tools/lamp.mjs`)
    // rather than borrowing another lamp's picture, so the silhouette the eye
    // was tracking is the silhouette that breaks. A lamp with no lens in its
    // art has nothing to put out and falls back to itself.
    //
    // It is in TWO PIECES. A slip-base column shears at its foot, so the stump
    // stays bolted to the pavement where it always was and the rest of the
    // column goes down the road WITHOUT it — the flying half is drawn with its
    // own bottom rows cropped away, so the two together are one broken post
    // rather than a whole one plus a spare.
    //
    // And it TURNS ABOUT ITS BREAK, which is where it broke: a post pivoting
    // around its own middle reads as a spinning stick rather than as something
    // that was bolted to the pavement a moment ago.
    const stood = prop.stub ?? prop.pos;
    const standing = mastAt(stood)?.sprite ?? LAMP_SPRITE;
    const sprite =
      spriteByName(sprites, `${standing}_out`) ??
      spriteByName(sprites, standing);
    if (!sprite) continue;
    const stump = prop.stub;
    if (stump) {
      // THE STUMP IS CROPPED FROM THE SAME COLUMN THAT FLEW OFF IT. It used to
      // come off the yard light whatever had actually been standing there,
      // which was invisible while most posts WERE yard lights and is a
      // mast-sized column over a doll's-house foot now that none of them are.
      const foot = sprite;
      if (foot) {
        drawn.push({
          y: stump.y,
          draw: () =>
            billboard(ctx, stump.x, stump.y, camera.x, camera.y, () => {
              ctx.drawImage(
                foot,
                0,
                foot.height - LAMP_STUB_PX,
                foot.width,
                LAMP_STUB_PX,
                seatX(stump.x, camera.x) - Math.round(foot.width / 2),
                seatY(stump.y, camera.y) - Math.round(LAMP_STUB_PX - 2),
                foot.width,
                LAMP_STUB_PX,
              );
            }),
        });
      }
    }
    const flying = sprite.height - LAMP_STUB_PX;
    drawn.push({
      y: prop.pos.y,
      draw: () =>
        billboard(ctx, prop.pos.x, prop.pos.y, camera.x, camera.y, () => {
          const cx = seatX(prop.pos.x, camera.x);
          const cy = seatY(prop.pos.y - prop.z, camera.y);
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(prop.angle);
          ctx.drawImage(
            sprite,
            0,
            0,
            sprite.width,
            flying,
            -Math.round(sprite.width / 2),
            -Math.round(flying - 2),
            sprite.width,
            flying,
          );
          ctx.restore();
        }),
    });
  }
  // THE OTHER TRAFFIC, WITH ITS LIGHTS ON. Everything in this list is a car
  // that is RUNNING — the ones somebody left at the kerb are `drive.props` and
  // are dark, which is most of what tells the two apart at a glance on a road
  // where both are the same ten sprites. The cones are the hero's own
  // (`render/vehicles.ts` → `drawLightCones`), mirrored by the same `faceLeft`
  // the body is, so an oncoming car lights the road ahead of it rather than out
  // of its boot. They are pushed BEFORE the body at the same y, so a car's own
  // beam never paints over the car in front of it.
  for (const other of drive.traffic) {
    const def = vehicleDef(other.variant);
    const name = trafficSprite(
      other.variant,
      collisionVisuals ? other.rung : 0,
    );
    // ITS LIGHTS GO OUT WHEN IT DOES. A wreck coasting to a halt and a moped
    // lying on its side are both still drawn, and a beam thrown down the road
    // out of either one would undo the whole read — and a car somebody LEFT at
    // the kerb never had them on in the first place (`driverless`, the flag a
    // parked car keeps after it stops being furniture and joins this list).
    //
    // …AND SOME OF THEM NEVER HAD ANY. A skateboard has no lamps on it, so it
    // throws none (`DriveVehicleDef.lights`) — which is a fact about the vehicle
    // and lives on its def, beside how much it weighs.
    if (
      def.lights &&
      (!collisionVisuals || (!other.downed && !other.wrecked)) &&
      !other.driverless
    ) {
      drawn.push({
        y: other.pos.y - 0.001,
        draw: () =>
          drawLightCones(
            ctx,
            other.pos,
            camera,
            timeMs,
            0,
            0,
            other.faceLeft,
            other.noseOut,
            other.tailOut,
            // …AND THE BEAMS TURN WITH THE BODY. They used to be drawn square
            // to the road whatever the car was doing, so a car spun out by a
            // clip pointed one way and lit another — the lights visibly came
            // off it. Same angle, same pivot as the sprite (`wreck-draw.ts`).
            other.angle,
            // …AND THEY ARE BOLTED TO THIS BODY rather than to the hero's. Every
            // offset in that pass used to be measured off the wagon's own 48-px
            // side profile, which on a twenty-px delivery moped put the beam a
            // body and a half out in front of the bike and the tail glow the
            // same distance behind it — two loose smears of light with a moped
            // riding between them. `lightBody` is what this machine actually is
            // (`scenery.ts`).
            lightBody(def),
            // …AND ITS STOP LAMPS, when somebody has just been driven into the
            // back of it and is standing on the pedal (`DriveTraffic.brakeMs`).
            other.brakeMs > 0,
          ),
      });
    }
    if (collisionVisuals && other.downed && def.class === "open") {
      // ON ITS SIDE, and turned about its own centre — a dropped machine is
      // drawn about its MIDDLE rather than its wheels, because a thing lying
      // down has no wheels underneath it any more.
      putTumbling(name, other);
      continue;
    }
    // EVERYTHING ELSE GOES THROUGH THE WRECK PASS — folded at whichever end was
    // hit, turned by whatever spun it, lifted by whatever put it in the air,
    // and wearing whatever happened to the people inside it. An undamaged car
    // comes out of it as the plain blit it always was.
    drawn.push({
      y: other.pos.y,
      draw: () =>
        drawTrafficBody(ctx, other, sprites, camera, timeMs, !collisionVisuals),
    });
    // …AND THE PERSON ON IT, drawn on top at the machine's own saddle. Seated
    // separately rather than baked in, because the whole point of a rider is
    // that the machine can lose them (`ejectRider`).
    if ((other.rider || !collisionVisuals) && def.rider !== null) {
      const seat = RIDER_SEATS[def.id];
      const rider = RIDER_SPRITES[def.rider];
      if (seat && rider) {
        putRider(
          rider,
          other.pos.x + (other.faceLeft ? -seat.dx : seat.dx),
          other.pos.y,
          seat.dy,
          other.faceLeft,
        );
      }
    }
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
    if (!collisionVisuals && ped.mode !== "afoot") continue;
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
        if (line) bubbles.push({ line, voice: "shout", ped });
      }
      continue;
    }
    // …AND WHAT ONE OF THE WALKING IS THINKING, every so often (`CROWD_THOUGHTS`,
    // dealt by the sim). Gathered into the same list as a shout and told apart by
    // its VOICE, so the one bubble the picture can carry is decided once, over
    // the whole road, rather than by two passes that would print over each other
    // the moment a walker happened to be standing beside the blockade.
    //
    // ONLY WHILE THEY ARE ON THEIR FEET. A body that has been hit is mid-flight
    // or lying in the gutter, and a private thought still hanging over it would
    // be the game making a remark about what just happened — which is the one
    // thing this whole minigame refuses to do.
    if (font && ped.bark >= 0 && ped.mode === "afoot") {
      const line = CROWD_THOUGHTS[ped.bark % CROWD_THOUGHTS.length];
      if (line) bubbles.push({ line, voice: "thought", ped });
    }
    // WHOSE ART, ASKED ONCE. Only the WALKERS have a stride; everybody else on
    // this list is drawn seated and still, so their "cycle" is the same frame
    // twice and the gait animates nothing.
    //
    // IT USED TO SPECIAL-CASE THE GLUED AND NOTHING ELSE, which was fine while
    // they were the only seated people who could end up in this list — and
    // quietly wrong from the moment a rider could be knocked off a moped, since
    // a thrown rider IS a pedestrian (`kind: "rider"`) and fell through to the
    // crowd table. With the gore switched off, a biker knocked into the gutter
    // got up as a completely different person in a completely different coat.
    // `bodySprite` has always known the answer; this is the call site that was
    // not asking it.
    const frames =
      ped.kind === "walker"
        ? CROWD_SPRITES[ped.variant % CROWD_SPRITES.length]
        : ([
            bodySprite(ped.kind, ped.variant),
            bodySprite(ped.kind, ped.variant),
          ] as const);
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
      drawCarAssembly(
        ctx,
        drive.car,
        sprites,
        camera,
        timeMs,
        coat,
        tyres,
        undefined,
        collisionVisuals,
      ),
  });

  // ── A THROWN WHEEL, SPINNING AWAY DOWN THE ROAD ───────────────────────────
  // TWO THINGS MAKE IT READ AS A WHEEL RATHER THAN AS A DISC BEING SLID ABOUT,
  // and it had neither: it was blitted at one fixed frame, at one fixed
  // attitude, for the whole of its flight.
  //
  //   THE FRAME  — the same two-picture spoke pair the hero's own thrown wheels
  //                use (`wheelSprite`, render/vehicles.ts), picked off the
  //                wheel's OWN roll angle, which the sim advances from its
  //                ground speed. A flat one deliberately holds one picture,
  //                because a flat does not roll.
  //   THE ANGLE  — and the whole sprite turned by that same angle, which is what
  //                actually sells it while the thing is in the air and its
  //                ground speed is doing nothing to the spokes. A tyre is round,
  //                so rotating it costs the pixel art nothing — the same licence
  //                the felled lamp posts and the yawing traffic already take on
  //                this road.
  if (collisionVisuals) {
    for (const wheel of drive.wheelDebris) {
      const frame = Math.floor(wheel.angle / (Math.PI / 5)) % 2;
      const name = wheelSprite(wheel.wheelState, frame);
      const sprite = spriteByName(sprites, name);
      if (!sprite) continue;
      drawn.push({
        y: wheel.pos.y,
        draw: () =>
          billboard(ctx, wheel.pos.x, wheel.pos.y, camera.x, camera.y, () => {
            ctx.save();
            ctx.translate(
              seatX(wheel.pos.x, camera.x),
              seatY(wheel.pos.y, camera.y) - Math.round(wheel.z),
            );
            ctx.rotate(wheel.angle);
            ctx.drawImage(
              sprite,
              -Math.round(sprite.width / 2),
              -Math.round(sprite.height - 2),
            );
            ctx.restore();
          }),
      });
    }
  }

  // ── AND NOBODY IS EVER DRAWN OUT OF THE CAR ───────────────────────────────
  // There is no hero body anywhere on this road, including at the end of it: the
  // run-in fades out with the wagon still rolling, and the arrival is played
  // properly by the level on the far side of the black — which opens with the
  // car already in a bay and the man standing beside it. Drawing him here as
  // well would be the same arrival twice, the first time with nothing to do in
  // it.

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
    const ahead = bubbles
      .map((bubble) => ({
        ...bubble,
        away: (bubble.ped.pos.x - drive.car.pos.x) * dir,
      }))
      .filter((bubble) => bubble.away > 0 && bubble.away <= PLACARD_READ_PX)
      .sort((a, b) => a.away - b.away);
    // AND A SHOUT OUTRANKS A THOUGHT, whatever the order on the road is. The
    // blockade is a SET PIECE — twenty people, four voices, one demonstration a
    // trip — and the crowd walks straight through it like everywhere else on this
    // road, so without this the one line the picture can carry gets handed to a
    // passer-by's thought about the bus fare in the middle of it. The thoughts
    // are a texture and there are forty of them; missing one costs nothing, and
    // one of them stepping on the set piece costs the set piece.
    const shouts = ahead.filter((bubble) => bubble.voice === "shout");
    const near = (shouts.length > 0 ? shouts : ahead).slice(0, MAX_PLACARDS);
    for (const bubble of near) {
      drawPlacard(
        ctx,
        font,
        bubble.line,
        bubble.ped.pos.x,
        bubble.ped.pos.y,
        camera,
        bubble.away,
        bubble.voice,
      );
    }
  }
}

/**
 * THE POOL a street lamp lays on the tarmac, cached and drawn under a
 * translate.
 *
 * Built once rather than once per lamp per frame: a `createRadialGradient` at
 * each mast's own coordinates is three fresh gradient objects a frame for the
 * whole length of a drive, and the shape is the same every time — only the
 * place changes, which is what the translate is for.
 */
let poolCache: CanvasGradient | null = null;

/** …and the BEAM, cached per reach. There are exactly two shapes on this road —
 * the far row's and the near row's — so keying on the reach is keying on which
 * side of the street a lamp is standing, and the gradient is built in the cone's
 * own space so the same one serves every lamp in that row. */
const beamCache = new Map<number, CanvasGradient>();

function lampBeam(
  ctx: CanvasRenderingContext2D,
  reach: number,
): CanvasGradient {
  const held = beamCache.get(reach);
  if (held) return held;
  const beam = ctx.createLinearGradient(
    0,
    -ROAD_LAMP_HEAD_PX,
    projectX(0, reach),
    projectY(0, reach),
  );
  beam.addColorStop(0, "rgba(255, 242, 190, 0.20)");
  beam.addColorStop(0.7, "rgba(255, 230, 155, 0.07)");
  beam.addColorStop(1, "rgba(255, 226, 150, 0)");
  beamCache.set(reach, beam);
  return beam;
}

function lampPool(ctx: CanvasRenderingContext2D): CanvasGradient {
  if (poolCache) return poolCache;
  const pool = ctx.createRadialGradient(0, 0, 0, 0, 0, ROAD_LAMP_POOL_PX);
  pool.addColorStop(0, "rgba(255, 238, 186, 0.22)");
  pool.addColorStop(0.5, "rgba(255, 226, 150, 0.11)");
  pool.addColorStop(1, "rgba(255, 226, 150, 0)");
  poolCache = pool;
  return pool;
}

/**
 * THE CONE ONE MAST THROWS — the light, not the lamp. The post itself goes
 * through `put` like any other body on this road; only the beam is drawn here,
 * because it is sorted somewhere else (see the call site).
 *
 * IT IS DRAWN IN THE MAST'S OWN BILLBOARD, which is 1:1 screen px, so the pool
 * it lands in has to be CONVERTED rather than dropped in as a world coordinate:
 * the ground foreshortens and the billboard does not. `projectY` off the mast's
 * feet is that conversion — the same one the projection itself makes — and
 * using the raw world offset instead put every beam short of the light it was
 * supposed to be casting, by exactly the pitch.
 *
 * Light has no pixels, so the beam is a gradient rather than a sprite, and it
 * speaks the same vocabulary as the car's own headlights (`render/vehicles.ts`
 * → `drawLightCones`): a warm fill faded out along its length, laid over the
 * picture rather than added to it. Additive blending was tried and blows the
 * lane paint out to white the moment two beams overlap.
 */
function drawLampBeam(
  ctx: CanvasRenderingContext2D,
  at: { x: number; y: number },
  poolY: number,
  camera: Camera,
): void {
  billboard(ctx, at.x, at.y, camera.x, camera.y, () => {
    const reach = poolY - at.y;
    const baseX = projectX(0, reach);
    const baseY = projectY(0, reach);
    ctx.save();
    ctx.translate(seatX(at.x, camera.x), seatY(at.y, camera.y));
    ctx.fillStyle = lampBeam(ctx, reach);
    ctx.beginPath();
    ctx.moveTo(-2, -ROAD_LAMP_HEAD_PX);
    ctx.lineTo(2, -ROAD_LAMP_HEAD_PX);
    ctx.lineTo(baseX + ROAD_LAMP_POOL_PX * 0.8, baseY);
    ctx.lineTo(baseX - ROAD_LAMP_POOL_PX * 0.8, baseY);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  });
}
