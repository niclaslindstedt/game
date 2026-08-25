// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE NIGHT ABOVE THE ROAD — the backdrop the drive minigame is played against,
// and the only part of the picture that is NOT in world space.
//
// IT IS ALSO THE NIGHT ABOVE THE LAUNCH. The garage cutscene stands on the same
// ground on the same evening, so it is painted by this file rather than by a
// second sky made of props (`overlays/CutsceneOverlay.tsx`) — which is why the
// module sits in the shared render pool and not under `drive-screen/`. A scene
// gets it STILL: no travel to parallax against, the twinkle switched off, and
// only the cloud bands' own drift left moving.
//
// …AND THE PARALLAX LADDER WORKS UPWARDS TOO (`SkyOptions.cameraY`). When the
// launch's camera follows the ship up, every layer here comes down the frame by
// its own `parallax` — the hedgerows nearly two thirds as fast as the lawn, the
// far ridge under a third, the cloud bank a fifth, the wisp a twentieth, the
// stars and the moon at almost nothing. One depth per layer, spent on both
// axes, which is what makes a rocket look like it is leaving rather than the
// picture look like it is sliding.
//
// WHY IT IS DRAWN FLAT. Everything else on this road stands on the ground
// plane and takes the projection (`render.ts` — one `save`/`projection`/
// `restore` around the lot). The sky is not on the ground plane: it is at
// infinity, and running it through a transform that foreshortens DISTANCE would
// squash the moon toward the horizon as though it were lying in a field. So the
// sky is painted first, in plain canvas space, and the projected world is drawn
// over it.
//
// THE DEPTH IS THE PARALLAX, and it is the whole point of the file. Five bands
// scroll at five fractions of the car's own speed, and the fractions are a
// HEIGHT ordering rather than an arbitrary spread: the moon and the stars are
// furthest off and barely move, the high wisp is next, then the mid puffs, and
// the low bank slides past fastest because it hangs nearest. Get that order
// backwards and the sky reads as a broken texture rather than as distance.
//
// A CLOUD IS DERIVED, NEVER SPAWNED — the same rule the town obeys
// (`scenery.ts`). Every cloud's identity, position and height are a pure
// function of the cell it sits in, so the sky costs the drive no state and no
// rng draw, and a restart puts the same weather back over the same stretch of
// road. That last part matters more than it sounds: the player is re-driving a
// mile he just died on, and a sky that reshuffled would make it read as a
// different night.
//
// …AND IT DRIFTS WHEN THE CAR DOES NOT. Parallax alone means a stopped car has
// a frozen sky, which is exactly when the player is looking at it (the pause
// card, a monologue, a breakdown). So each cloud band carries a slow drift on
// the RENDER clock as well, on the same height ordering — the wisp barely
// creeps, the bank actually moves.
//
// A BAND IS A WINDOW ON THE GROUND AND A LADDER IN A CLIMB. Standing still, a
// band is exactly the rows it was hung in, and the road never leaves the
// ground, so nothing on it pays for the rest of this. Under a CLIMB the same
// band is something the camera is moving THROUGH: it is fed from above the
// frame and retired below it, so a scene can keep rising for as long as it
// holds without running its own sky out from under it (see `drawBand`).

import { spriteByName, type Sprites } from "../assets.ts";

/** The deep of the night, at the top of the frame. */
const NIGHT_HIGH = "#0d1020";
/** …and nearer the horizon, where the town's own light lifts it. */
const NIGHT_LOW = "#1b2136";
/** The glow the streetlights throw up into the last few px above the skyline.
 * A hard line between sky and ground reads as a cut; this is what softens it. */
const HAZE = "#2a2c3a";
/** How deep that glow reaches up off the horizon (canvas px). */
const HAZE_PX = 10;

/**
 * ONE BAND OF SKY.
 *
 * `drift` and `parallax` are the same fact said two ways — how far off this
 * band hangs — and they move together. A band whose parallax says "distant"
 * and whose drift says "close" reads as two different skies.
 */
type Band = {
  /** The sprites this band is made of, chosen per cell by its own hash. */
  readonly sprites: readonly string[];
  /** How much of the car's travel this band shows, 0 = infinitely far. */
  readonly parallax: number;
  /** …and how fast it creeps on its own, in canvas px per second. */
  readonly drift: number;
  /** How far apart the cells are ACROSS (canvas px) — the band's density. */
  readonly spacing: number;
  /** …and how deep one row of them is. A band is a GRID rather than a line
   * because the sky is a different height on every phone: on a handset held
   * upright it is most of the picture, and one row of cloud strung across the
   * top of it left the rest bare night. Rows are derived from the band's own
   * slice, so a short sky quietly collapses back to the single row it wants. */
  readonly rowPitch: number;
  /** The share of cells that actually carry a cloud, 0..1. */
  readonly fill: number;
  /** Where in the sky the band sits, as a fraction of the sky's own height
   * measured from the top: `[from, to]`, the cloud's TOP edge landing between
   * them. */
  readonly height: readonly [number, number];
};

/** How far above the frame a band is fed while the camera climbs (canvas px) —
 * the tallest cloud plus the deepest row jitter, so a new one is always born
 * out of sight rather than in the middle of the picture. */
const CLOUD_SPAN = 24;

/**
 * The three cloud bands, HIGHEST FIRST — which is also slowest first, and the
 * order they are painted in, since a nearer cloud passes in front of a further
 * one.
 */
const BANDS: readonly Band[] = [
  {
    sprites: ["night_cloud_wisp"],
    parallax: 0.05,
    drift: 0.6,
    spacing: 105,
    rowPitch: 26,
    fill: 0.4,
    height: [0.06, 0.42],
  },
  {
    sprites: ["night_cloud_puff", "night_cloud_wisp"],
    parallax: 0.11,
    drift: 1.5,
    spacing: 92,
    rowPitch: 24,
    fill: 0.36,
    height: [0.34, 0.66],
  },
  {
    sprites: ["night_cloud_bank"],
    parallax: 0.2,
    drift: 3.2,
    spacing: 130,
    rowPitch: 22,
    fill: 0.34,
    height: [0.58, 0.9],
  },
];

/**
 * THE DECK A CAMERA CLIMBS THROUGH — a fourth band, nearer than all three and
 * therefore the fastest thing in the sky, drawn only for a caller that asks
 * (`SkyOptions.deck`).
 *
 * It is opt-in rather than a fourth row above because it is only worth its
 * cost to a camera that LEAVES THE GROUND. It hangs low, which on the road
 * puts most of it behind the open country, and it slides at a third of the
 * climb where the bank slides at a fifth — so on the way up the ground falls
 * away and uncovers a layer moving visibly faster than anything else in the
 * frame. Without it the quickest thing in a launch is the low bank, and a
 * fifth of the ship is not enough motion to say the ship is moving at all.
 */
const CLIMB_DECK: Band = {
  sprites: ["night_cloud_bank", "night_cloud_puff"],
  parallax: 0.34,
  drift: 5.4,
  spacing: 118,
  rowPitch: 26,
  fill: 0.3,
  height: [0.55, 0.95],
};

/**
 * ONE RIDGE OF OPEN COUNTRY behind the town.
 *
 * The town stands with its back to something, and until these existed that
 * something was the night itself — the frontages were cut out against stars,
 * which reads as a stage flat rather than as a street on the edge of a place.
 *
 * `lift` is in CANVAS px and deliberately NOT a share of the sky, because the
 * measurement that matters is against the town's ROOFLINE, and that is set by
 * the town's own art rather than by the screen (the houses are 18–53 px
 * billboards standing 13 px of projected ground behind the kerb —
 * `TOWN_SETBACK_PX`). A layer lifted less than the row it stands behind is
 * only ever seen through the alleys between frontages — which is the right
 * answer for the nearest one and the wrong answer for all of them.
 */
type Field = {
  /** How far its crest rides above the horizon, on average (canvas px). */
  readonly lift: number;
  /** …and how much that crest wanders either side of it. */
  readonly roll: number;
  /** How far apart the crest's control points sit — the wavelength of the
   * land. Wide and low is farmland; tight and tall would be moor. */
  readonly node: number;
  /** How often a HEDGEROW stands on the crest, and how big it gets. At this
   * size a tree IS a bump: three px of it is a hawthorn, seven is a copse, and
   * a field without any is a dune. */
  readonly tuft: { pitch: number; fill: number; size: number };
  /** How much of the car's travel it shows. Every one of these is nearer than
   * every cloud and further than the road. */
  readonly parallax: number;
  readonly body: string;
  /** The moonlight that catches the crest — the one line that separates a
   * layer from the one behind it. */
  readonly rim: string;
};

/** How often the crest is sampled across the frame (canvas px). Two is the
 * whole of the trade: at one the land is smooth and costs twice as much to
 * walk, at four the hedgerows start looking chipped. */
const SAMPLE = 2;

/** Furthest first: drawn in that order, so each nearer ridge covers the one
 * behind it from its own crest down. */
const FIELDS: readonly Field[] = [
  {
    lift: 30,
    roll: 3.5,
    node: 68,
    tuft: { pitch: 34, fill: 0.3, size: 3 },
    parallax: 0.3,
    body: "#2a3348",
    rim: "#3d4a6b",
  },
  {
    lift: 21,
    roll: 4,
    node: 52,
    tuft: { pitch: 27, fill: 0.42, size: 4.5 },
    parallax: 0.45,
    body: "#232e37",
    rim: "#33424e",
  },
  {
    lift: 12,
    roll: 4,
    node: 39,
    tuft: { pitch: 21, fill: 0.5, size: 5.5 },
    parallax: 0.64,
    body: "#1d2a23",
    rim: "#2c3f2f",
  },
];

/**
 * THE STARS — the furthest band, and the one thing in this file that is NOT a
 * sprite.
 *
 * A STAR IS ONE PIXEL, so there is no art to place: the drawing is entirely in
 * WHERE and HOW BRIGHT, which is what a hash answers. The shipped starfield
 * tiles (`stars_a`/`stars_b`) were tried first and are the wrong tool twice
 * over — they are cutscene-scale, so at the road's scale they laid a wallpaper
 * of fat white crosses over the whole sky; and a tile repeats, which at 422
 * world px across is seven visible copies of the same constellation.
 */
const STAR_PARALLAX = 0.02;
/** How much sky one star gets (canvas px each way). Bigger is emptier. */
const STAR_CELL = 17;
/** The share of cells that light up at all. */
const STAR_FILL = 0.42;
/** The three brightnesses a star comes in, dimmest first — most of the sky is
 * the faintest of them, which is what keeps a starfield from reading as salt. */
const STAR_COLORS = ["#3f4a68", "#7c88a8", "#dfe6f4"] as const;

/** THE MOON. Further off than the stars, because it is the one thing up there
 * the eye tracks: at the stars' rate it would cross the whole windscreen over a
 * mile of road, and a moon that visibly travels is a moon nobody believes. */
const MOON_SPRITE = "night_moon";
const MOON_PARALLAX = 0.006;
/** Where it hangs when the trip starts, as a fraction of the frame. Chosen so
 * the whole road's worth of drift keeps it on screen in BOTH directions — the
 * way home is the same sky seen from the other end. */
const MOON_HOME_X = 0.55;
const MOON_HOME_Y = 0.16;
/**
 * …AND HOW FAR DOWN IT COMES ON A PHONE HELD UPRIGHT (world px).
 *
 * A fraction of the sky is the right way to place it in landscape and the wrong
 * way in portrait, because the two frames do not disagree about the SKY — they
 * disagree about what is in front of the top of it. Upright, the top of the
 * picture is where the phone keeps its clock, its signal and its notch, and a
 * sixth of a tall sky lands the moon squarely behind that furniture: the one
 * thing up there worth looking at, printed under the status bar.
 *
 * A FIXED DROP RATHER THAN A BIGGER FRACTION, because the fraction would grow
 * with the sky and a tablet held upright — which has no notch and a great deal
 * of sky — would end up with its moon halfway to the roofline. This is the
 * height of the furniture, and the furniture is the same size on every phone.
 * The whole-moon clamp below still has the last word on a short sky.
 */
const MOON_PORTRAIT_DROP = 9;

/**
 * A HASH, NOT A DRAW — the same one the town is dressed from, and for the same
 * reason: a cell can be asked about out of order, so only the stretch of sky
 * actually on screen is ever built.
 */
function hash(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * THE TWO VERTICAL WASHES, built once per HEIGHT rather than once per frame.
 * Both depend on nothing else, and the height only changes when the window
 * does — where `createLinearGradient` per frame is a fresh object per frame for
 * the whole length of a drive.
 *
 * The night is as deep as the sky was COMPOSED (`hangH`, which an ascent leaves
 * behind) and so is keyed on that; the glow comes off the ground, which moves
 * every frame of one — so it is built ONCE at the origin and drawn under a
 * translate, the same trick the moon's halo uses below. Keying it on the ground
 * line instead would be a fresh gradient per frame for the whole climb.
 */
let washCache: { h: number; wash: CanvasGradient } | null = null;
let glowCache: CanvasGradient | null = null;

/** The night itself, deep at the top and lifted at the bottom. Painted DOWN TO
 * `hangH`; a sky clipped lower than that keeps the last stop, which is what
 * leaves an ascent's newly bared strip continuous with the night above it. */
function wash(ctx: CanvasRenderingContext2D, hangH: number): CanvasGradient {
  if (washCache?.h === hangH) return washCache.wash;
  const grad = ctx.createLinearGradient(0, 0, 0, hangH);
  grad.addColorStop(0, NIGHT_HIGH);
  grad.addColorStop(1, NIGHT_LOW);
  washCache = { h: hangH, wash: grad };
  return grad;
}

/** …and the light the ground throws back up into it, hung off the origin. */
function glow(ctx: CanvasRenderingContext2D): CanvasGradient {
  if (glowCache) return glowCache;
  const grad = ctx.createLinearGradient(0, 0, 0, HAZE_PX);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, HAZE);
  glowCache = grad;
  return grad;
}

/** …and the moon's halo, built once per moon. It MOVES, so it is cached
 * centred on the origin and drawn under a translate rather than rebuilt at each
 * new position. */
let haloCache: { size: number; halo: CanvasGradient } | null = null;

function moonHalo(ctx: CanvasRenderingContext2D, size: number): CanvasGradient {
  if (haloCache?.size === size) return haloCache.halo;
  const halo = ctx.createRadialGradient(0, 0, size * 0.4, 0, 0, size * 2);
  halo.addColorStop(0, "rgba(196,212,255,0.20)");
  halo.addColorStop(1, "rgba(196,212,255,0)");
  haloCache = { size, halo };
  return halo;
}

/** What a caller may say about the night besides where its horizon is. */
export type SkyOptions = {
  /** Whether the frame is taller than it is wide — the ONE thing in this file
   * the shape of the screen changes, and it changes it for the moon alone
   * (`MOON_PORTRAIT_DROP`). */
  readonly portrait?: boolean;
  /**
   * Whether the brightest stars breathe. The road wants them alive; a CUTSCENE
   * wants the sky it is played against to hold perfectly still behind the
   * acting, with nothing moving in it but the weather.
   */
  readonly twinkle?: boolean;
  /**
   * HOW FAR THE CAMERA HAS CLIMBED since the night was composed (canvas px,
   * positive sending the world down the frame). The road never leaves the
   * ground and pays nothing for it; the launch cutscene climbs 180 px of it
   * behind the ship, and it is what makes that shot a shot.
   *
   * EVERY LAYER ANSWERS IT BY ITS OWN DEPTH, on the SAME `parallax` each
   * already carries for travel ACROSS — because it is one fact said about a
   * second axis: how far off the thing hangs. So the lot goes first and
   * fastest (at full depth, and the caller's own business), then the near
   * hedgerows at two thirds of the climb, the middle fields at under a half,
   * the far ridge at under a third, the low cloud bank at a fifth, the high
   * wisp at a twentieth — and the stars and the moon at very nearly nothing,
   * which is exactly what makes them the things being climbed toward.
   *
   * `horizonY` is where the GROUND is and has therefore already taken the
   * whole climb; the height the sky itself was hung at is what is left when
   * this is taken back off it.
   */
  readonly cameraY?: number;
  /**
   * Whether to hang the near CLOUD DECK under the three bands — the layer a
   * climbing camera is meant to go through. See {@link CLIMB_DECK}: the road
   * leaves it off, a scene that climbs asks for it.
   */
  readonly deck?: boolean;
};

/**
 * Paint the night above `horizonY`.
 *
 * Everything here is in CANVAS px, not world px: `cameraX` is only ever read as
 * a distance travelled, never as a place, which is what lets the whole file
 * ignore the projection.
 */
export function drawNightSky(
  ctx: CanvasRenderingContext2D,
  sprites: Sprites,
  cameraX: number,
  viewW: number,
  horizonY: number,
  timeMs: number,
  opts: SkyOptions = {},
): void {
  const skyH = Math.max(0, horizonY);
  if (skyH <= 0) return;
  // THE CLIMB, and the height the night was hung at before it. Everything below
  // is placed against `hangH` and then pushed back down by its own share of
  // `rise` — which for the road is nought and nothing here can tell.
  const rise = opts.cameraY ?? 0;
  const hangH = Math.max(1, skyH - rise);
  const portrait = opts.portrait ?? false;
  ctx.save();
  // The sky is CLIPPED to its own band rather than trusted to stay in it: a
  // cloud placed near the bottom of the lowest band would otherwise hang a few
  // px of itself over the town's roofline, which reads as fog in the street.
  ctx.beginPath();
  ctx.rect(0, 0, viewW, skyH);
  ctx.clip();

  ctx.fillStyle = wash(ctx, hangH);
  ctx.fillRect(0, 0, viewW, skyH);

  drawStars(
    ctx,
    cameraX,
    viewW,
    skyH,
    hangH,
    rise,
    opts.twinkle ?? true,
    timeMs,
  );
  drawMoon(ctx, sprites, cameraX, viewW, hangH, rise, portrait);
  // The frame a climbing band is fed across. The clip is the SKY's own band,
  // which under a long climb is taller than the canvas it is being painted
  // on; the picture is what a cloud has to cross.
  const frameH = Math.min(skyH, ctx.canvas.height);
  const bands = opts.deck ? [...BANDS, CLIMB_DECK] : BANDS;
  for (const band of bands) {
    drawBand(ctx, sprites, band, cameraX, viewW, hangH, rise, frameH, timeMs);
  }
  // THE COUNTRY BETWEEN, standing on the bottom edge of the sky: the ground the
  // town has its back to. Painted after the weather (it is under it) and before
  // the glow (which is in front of it), and each layer is nearer than every
  // cloud, so this is where the parallax ladder steps up toward the road.
  //
  // A layer is FILLED TO THE GROUND LINE rather than to its own crest's depth,
  // so a climb that spreads the three of them apart bares no seam between them:
  // whatever the near ridge has dropped past, the ridge behind it is still
  // painting.
  for (const field of FIELDS) {
    drawField(ctx, field, cameraX, viewW, hangH, rise, skyH);
  }

  // THE TOWN'S OWN GLOW, last, over everything in the sky — a sodium wash off
  // the streetlights that sits in front of a low cloud rather than behind it,
  // because that is where the light actually is. It comes off the GROUND, so it
  // is the one thing up here that takes the whole climb.
  ctx.save();
  ctx.translate(0, Math.max(0, skyH - HAZE_PX));
  ctx.fillStyle = glow(ctx);
  ctx.fillRect(0, 0, viewW, Math.min(HAZE_PX, skyH));
  ctx.restore();
  ctx.restore();
}

/**
 * The starfield — one pixel per lit cell, thinning out toward the horizon.
 *
 * THE THINNING IS THE DEPTH CUE the stars have instead of parallax. They barely
 * move (that is what makes them stars), so the only thing left to say "these are
 * further away than the clouds" is that the ones near the horizon are dimmer and
 * sparser, the way a real sky is under a town's own light.
 */
function drawStars(
  ctx: CanvasRenderingContext2D,
  cameraX: number,
  viewW: number,
  skyH: number,
  hangH: number,
  rise: number,
  twinkle: boolean,
  timeMs: number,
): void {
  const shift = -cameraX * STAR_PARALLAX;
  // The stars' share of a climb, which is the smallest of anything drawn here
  // bar the moon: over the launch's whole ascent they come down four px.
  const drop = rise * STAR_PARALLAX;
  // FILLED TO THE CLIP, FADED AGAINST THE COMPOSED HEIGHT. The two differ only
  // while a scene's ground is falling away, and there the strip it bares wants
  // stars (bare wash reads as a seam) at the thinnest the fade ever gets —
  // which is what the clamp below hands it.
  const fadeRows = Math.max(1, Math.floor(hangH / STAR_CELL));
  const rowFrom = Math.floor(-drop / STAR_CELL);
  const rowTo = Math.floor((skyH - drop) / STAR_CELL);
  const from = Math.floor(-shift / STAR_CELL) - 1;
  const to = Math.ceil((-shift + viewW) / STAR_CELL) + 1;
  for (let row = rowFrom; row < rowTo; row++) {
    // How far down the sky this row sits, 0 at the top: the fade to the glow.
    const depth =
      fadeRows <= 1 ? 0 : Math.max(0, Math.min(1, row / (fadeRows - 1)));
    for (let col = from; col <= to; col++) {
      const seed = col * 2654435761 + row * 40503;
      const roll = hash(seed);
      if (roll > STAR_FILL * (1 - 0.55 * depth)) continue;
      const tier = Math.floor(hash(seed ^ 0x5bf03635) * STAR_COLORS.length);
      const color = STAR_COLORS[tier] ?? STAR_COLORS[0];
      // A twinkle only on the BRIGHTEST tier, and a slow one. Every star
      // breathing at once is a fairy light, not a night; the periods are spread
      // by the star's own hash so no two are ever in step.
      ctx.globalAlpha =
        !twinkle || tier < STAR_COLORS.length - 1
          ? 1
          : 0.55 + 0.45 * Math.sin(timeMs / 900 + roll * 60);
      ctx.fillStyle = color;
      const jx = hash(seed ^ 0x9e3779b1) * STAR_CELL;
      const jy = hash(seed ^ 0x7feb352d) * STAR_CELL;
      ctx.fillRect(
        Math.round(col * STAR_CELL + jx + shift),
        Math.round(row * STAR_CELL + jy + drop),
        1,
        1,
      );
    }
  }
  ctx.globalAlpha = 1;
}

/** The moon, and the ring of sky it lights. The GLOW is a gradient rather than
 * art on purpose: it is not an object, it is what the object is doing to the
 * air around it, and a sprite would have to carry a hard edge where there is
 * none. */
function drawMoon(
  ctx: CanvasRenderingContext2D,
  sprites: Sprites,
  cameraX: number,
  viewW: number,
  /** The height the sky was composed for — never the ground line, or a scene
   * whose lot falls away would walk its moon down the frame after it. */
  hangH: number,
  rise: number,
  portrait: boolean,
): void {
  const moon = spriteByName(sprites, MOON_SPRITE);
  if (!moon) return;
  const x = Math.round(viewW * MOON_HOME_X - cameraX * MOON_PARALLAX);
  const home = hangH * MOON_HOME_Y + (portrait ? MOON_PORTRAIT_DROP : 0);
  // KEPT WHOLE. A phone on its side leaves a strip of sky barely deeper than
  // the moon itself, and the fraction alone put its top row off the frame —
  // which reads as a bug, not as a moon behind the roofline. Held inside its
  // own band, it simply sits lower over the town on a short sky. It is also
  // what stops the portrait drop above from ever pushing the moon into the
  // clouds on a sky too shallow to spend it.
  const room = Math.max(0, (hangH - moon.height) / 2);
  // The clamp is applied to the PERCH and the climb added after it: a moon held
  // inside the sky it was hung in, then given the ~1 px a whole ascent buys the
  // furthest thing in the picture.
  const y = Math.round(
    hangH / 2 +
      Math.max(-room, Math.min(room, home - hangH / 2)) +
      rise * MOON_PARALLAX,
  );
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = moonHalo(ctx, moon.width);
  ctx.fillRect(
    -moon.width * 2,
    -moon.width * 2,
    moon.width * 4,
    moon.width * 4,
  );
  ctx.drawImage(
    moon,
    -Math.round(moon.width / 2),
    -Math.round(moon.height / 2),
  );
  ctx.restore();
}

/** One cloud band, cell by cell across the stretch of sky on screen. */
function drawBand(
  ctx: CanvasRenderingContext2D,
  sprites: Sprites,
  band: Band,
  cameraX: number,
  viewW: number,
  /** The composed height, like the moon's: weather hangs where it was hung. */
  hangH: number,
  rise: number,
  /** How tall the picture is (canvas px) — where a climbing band is fed from
   * and retired to. */
  frameH: number,
  timeMs: number,
): void {
  const shift = -cameraX * band.parallax - (timeMs / 1000) * band.drift;
  const from = Math.floor((-shift - band.spacing) / band.spacing);
  const to = Math.ceil((-shift + viewW + band.spacing) / band.spacing);
  const [fromFrac, toFrac] = band.height;
  const top = hangH * fromFrac;
  const slice = hangH * (toFrac - fromFrac);
  const rows = Math.max(1, Math.round(slice / band.rowPitch));
  const step = slice / rows;
  const fall = rise * band.parallax;
  // WHICH ROWS ARE WORTH DRAWING, as a stretch of screen y. A still camera
  // gets the band's own slice, and the arithmetic below hands back exactly
  // rows 0…rows-1 for it — the road's sky, unchanged. A camera that has
  // CLIMBED gets the whole frame instead, with a cloud's own span of margin
  // at each end: the lattice keeps its pitch and simply runs off the top of
  // the picture, so rows arrive from above out of sight and the band never
  // empties however long the climb is held.
  const climbing = fall > 0;
  const headY = climbing ? -CLOUD_SPAN : top;
  const footY = climbing ? frameH + CLOUD_SPAN : top + slice;
  const rowFrom = Math.ceil((headY - top - fall) / step - 0.5);
  const rowTo = Math.floor((footY - top - fall) / step - 0.5);
  const salt = Math.round(band.spacing);
  for (let row = rowFrom; row <= rowTo; row++) {
    for (let cell = from; cell <= to; cell++) {
      const seed = cell * 7919 + row * 104729 + salt;
      if (hash(seed) > band.fill) continue;
      const pick = Math.floor(hash(seed ^ 0x2545f491) * band.sprites.length);
      const name = band.sprites[pick];
      const cloud = name ? spriteByName(sprites, name) : undefined;
      if (!cloud) continue;
      // The jitter is the difference between a band and a fence: the cells are
      // regular, so without it every cloud sits on the same pitch at the same
      // height, which is a fence.
      const jx = (hash(seed ^ 0x9e3779b1) - 0.5) * band.spacing * 0.8;
      const jy = (hash(seed ^ 0x7feb352d) - 0.5) * band.rowPitch * 0.7;
      ctx.drawImage(
        cloud,
        Math.round(cell * band.spacing + jx + shift),
        Math.round(top + (row + 0.5) * step + jy + fall),
      );
    }
  }
}

/**
 * ONE LAYER OF OPEN COUNTRY, from its own rolling crest down to the horizon.
 *
 * THE CREST IS DERIVED, NOT DRAWN, for the same reason the stars are: a ridge
 * this long has no art to place. A tiled silhouette would repeat every few
 * hundred px, and the eye finds a repeating skyline immediately — it is the one
 * shape in a picture it has nothing else to compare against.
 *
 * It is smooth VALUE NOISE — hashed heights at control points `node` apart,
 * cosine-eased between them — plus hedgerows sitting on top. Straight linear
 * interpolation was tried first and gives the land creases: farmland does not
 * have corners in it, and the ease is the whole difference between a field and
 * a saw blade.
 */
function drawField(
  ctx: CanvasRenderingContext2D,
  field: Field,
  cameraX: number,
  viewW: number,
  /** The height the sky was composed for — this layer's own skyline. */
  hangH: number,
  rise: number,
  /** …and where its fill has to reach: the GROUND line, which took the whole
   * climb. The three ridges come apart under one (each at its own depth) and
   * this is what keeps the gaps that opens filled with the land behind. */
  groundY: number,
): void {
  const shift = -cameraX * field.parallax;
  // This ridge's own skyline once the camera has climbed: nearer country comes
  // down the frame faster, which is the whole of the effect.
  const base = hangH + rise * field.parallax;
  const salt = Math.round(field.lift * 1000);
  /** The rolling land at a point, in canvas px above the horizon. */
  const land = (at: number): number => {
    const cell = Math.floor(at / field.node);
    // Cosine ease between the two control points this column sits between.
    const t = at / field.node - cell;
    const ease = 0.5 - 0.5 * Math.cos(t * Math.PI);
    const a = hash(cell + salt);
    const b = hash(cell + 1 + salt);
    return field.lift + (a + (b - a) * ease - 0.5) * 2 * field.roll;
  };
  /** …and what is standing on it there. */
  const hedge = (at: number): number => {
    const { pitch, fill, size } = field.tuft;
    let tall = 0;
    // The two neighbouring cells are asked as well, so a hedge whose centre is
    // just off screen still puts its shoulder on screen — without that a copse
    // pops into being whole as the car reaches it.
    for (
      let cell = Math.floor(at / pitch) - 1;
      cell <= Math.ceil(at / pitch);
      cell++
    ) {
      const seed = cell * 6151 + salt;
      if (hash(seed) > fill) continue;
      const cx = (cell + hash(seed ^ 0x27d4eb2f)) * pitch;
      const half = size * (0.6 + 0.8 * hash(seed ^ 0x165667b1));
      const d = Math.abs(at - cx) / half;
      if (d >= 1) continue;
      tall = Math.max(tall, size * Math.sqrt(1 - d * d));
    }
    return tall;
  };

  // THE CREST IS WALKED ONCE, not once per fill. It is the expensive half of
  // this file — a hash per control point and three more per hedgerow cell, at
  // every sample — and the two fills below want the identical line anyway.
  const crest: number[] = [];
  for (let x = -2; x <= viewW + 2; x += SAMPLE) {
    const at = x - shift;
    crest.push(Math.round(base - land(at) - hedge(at)));
  }
  const foot = Math.max(base, groundY) + 2;

  // ONE SHAPE, FILLED TWICE — the second a pixel lower, so the sliver of rim
  // colour left showing along the top IS the moonlight on the crest. Cheaper
  // and crisper than stroking it: a stroke straddles the line and comes out
  // half-lit on both sides of a pixel grid this coarse.
  const trace = (drop: number) => {
    ctx.beginPath();
    ctx.moveTo(-2, foot);
    for (const [i, y] of crest.entries()) ctx.lineTo(-2 + i * SAMPLE, y + drop);
    ctx.lineTo(-2 + (crest.length - 1) * SAMPLE, foot);
    ctx.closePath();
    ctx.fill();
  };
  ctx.fillStyle = field.rim;
  trace(0);
  ctx.fillStyle = field.body;
  trace(1);
}
