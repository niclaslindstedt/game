// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE NIGHT ABOVE THE ROAD — the backdrop the drive minigame is played against,
// and the only part of the picture that is NOT in world space.
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
 * THE TWO VERTICAL WASHES, built once per SKY HEIGHT rather than once per
 * frame. Both depend on nothing else, and the height only changes when the
 * window does — where `createLinearGradient` per frame is a fresh object per
 * frame for the whole length of a drive.
 */
let washCache: {
  skyH: number;
  wash: CanvasGradient;
  glow: CanvasGradient;
} | null = null;

function washes(
  ctx: CanvasRenderingContext2D,
  skyH: number,
): { wash: CanvasGradient; glow: CanvasGradient } {
  if (washCache?.skyH === skyH) return washCache;
  const wash = ctx.createLinearGradient(0, 0, 0, skyH);
  wash.addColorStop(0, NIGHT_HIGH);
  wash.addColorStop(1, NIGHT_LOW);
  const glow = ctx.createLinearGradient(
    0,
    Math.max(0, skyH - HAZE_PX),
    0,
    skyH,
  );
  glow.addColorStop(0, "rgba(0,0,0,0)");
  glow.addColorStop(1, HAZE);
  washCache = { skyH, wash, glow };
  return washCache;
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

/**
 * Paint the night above `horizonY`.
 *
 * Everything here is in CANVAS px, not world px: `cameraX` is only ever read as
 * a distance travelled, never as a place, which is what lets the whole file
 * ignore the projection.
 */
export function drawDriveSky(
  ctx: CanvasRenderingContext2D,
  sprites: Sprites,
  cameraX: number,
  viewW: number,
  horizonY: number,
  timeMs: number,
): void {
  const skyH = Math.max(0, horizonY);
  if (skyH <= 0) return;
  ctx.save();
  // The sky is CLIPPED to its own band rather than trusted to stay in it: a
  // cloud placed near the bottom of the lowest band would otherwise hang a few
  // px of itself over the town's roofline, which reads as fog in the street.
  ctx.beginPath();
  ctx.rect(0, 0, viewW, skyH);
  ctx.clip();

  ctx.fillStyle = washes(ctx, skyH).wash;
  ctx.fillRect(0, 0, viewW, skyH);

  drawStars(ctx, cameraX, viewW, skyH, timeMs);
  drawMoon(ctx, sprites, cameraX, viewW, skyH);
  for (const band of BANDS) {
    drawBand(ctx, sprites, band, cameraX, viewW, skyH, timeMs);
  }

  // THE TOWN'S OWN GLOW, last, over everything in the sky — a sodium wash off
  // the streetlights that sits in front of a low cloud rather than behind it,
  // because that is where the light actually is.
  ctx.fillStyle = washes(ctx, skyH).glow;
  ctx.fillRect(0, Math.max(0, skyH - HAZE_PX), viewW, Math.min(HAZE_PX, skyH));
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
  timeMs: number,
): void {
  const shift = -cameraX * STAR_PARALLAX;
  const rows = Math.max(1, Math.floor(skyH / STAR_CELL));
  const from = Math.floor(-shift / STAR_CELL) - 1;
  const to = Math.ceil((-shift + viewW) / STAR_CELL) + 1;
  for (let row = 0; row < rows; row++) {
    // How far down the sky this row sits, 0 at the top: the fade to the glow.
    const depth = rows <= 1 ? 0 : row / (rows - 1);
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
        tier < STAR_COLORS.length - 1
          ? 1
          : 0.55 + 0.45 * Math.sin(timeMs / 900 + roll * 60);
      ctx.fillStyle = color;
      const jx = hash(seed ^ 0x9e3779b1) * STAR_CELL;
      const jy = hash(seed ^ 0x7feb352d) * STAR_CELL;
      ctx.fillRect(
        Math.round(col * STAR_CELL + jx + shift),
        Math.round(row * STAR_CELL + jy),
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
  skyH: number,
): void {
  const moon = spriteByName(sprites, MOON_SPRITE);
  if (!moon) return;
  const x = Math.round(viewW * MOON_HOME_X - cameraX * MOON_PARALLAX);
  // KEPT WHOLE. A phone on its side leaves a strip of sky barely deeper than
  // the moon itself, and the fraction alone put its top row off the frame —
  // which reads as a bug, not as a moon behind the roofline. Held inside its
  // own band, it simply sits lower over the town on a short sky.
  const room = Math.max(0, (skyH - moon.height) / 2);
  const y = Math.round(
    skyH / 2 + Math.max(-room, Math.min(room, skyH * MOON_HOME_Y - skyH / 2)),
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
  skyH: number,
  timeMs: number,
): void {
  const shift = -cameraX * band.parallax - (timeMs / 1000) * band.drift;
  const from = Math.floor((-shift - band.spacing) / band.spacing);
  const to = Math.ceil((-shift + viewW + band.spacing) / band.spacing);
  const [fromFrac, toFrac] = band.height;
  const slice = skyH * (toFrac - fromFrac);
  const rows = Math.max(1, Math.round(slice / band.rowPitch));
  const salt = Math.round(band.spacing);
  for (let row = 0; row < rows; row++) {
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
        Math.round(skyH * fromFrac + (row + 0.5) * (slice / rows) + jy),
      );
    }
  }
}
