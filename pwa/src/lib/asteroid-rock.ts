// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// AN IRREGULAR AIRLESS BODY, painted into a 2D context — the asteroid's peer
// of `planet-globe.ts`, and a very different problem from it.
//
// A planet is a sphere: worth a software shader, worth a baked equirectangular
// surface, worth a canvas of its own. An asteroid is not. It is a lumpy
// triaxial rock that is twelve pixels across when it appears and a hundred at
// its closest, it is one of several on screen at once, and each of them is
// tumbling — so the thing to draw is a SILHOUETTE and a TERMINATOR, not a
// texture. Everything here is 2D canvas: a closed path, one gradient, and a
// scatter of craters drawn as ramps across their own openings.
//
// WHAT MAKES IT READ AS A ROCK RATHER THAN A CIRCLE, in order of how much each
// is worth at these sizes:
//
//   1. THE OUTLINE CHANGES AS IT TURNS. The body is a triaxial ellipsoid
//      (a ≥ b ≥ c) spinning about its short axis, so its projected width
//      swings between a and b every half turn while its height stays at c —
//      which is exactly where a real asteroid LIGHTCURVE comes from, and the
//      reason anybody knows any asteroid's rotation period at all. The radial
//      noise on top of that ellipse is BODY-FIXED, so the bumps travel round
//      the limb rather than sitting still on the screen.
//   2. THE TERMINATOR IS SHARP AND OFF-CENTRE. No atmosphere means no twilight
//      and no limb haze: the day side ends in a line, and the night side is
//      very nearly black. A rock passing in front of the star is a silhouette.
//   3. THE CRATERS ARE LIT FROM THE SAME SIDE AS THE BODY. A bowl catches the
//      light on the wall FACING AWAY from the sun and shadows the wall facing
//      toward it, which is why a cratered surface reads as pitted rather than
//      spotted — and why the whole field turns into domes when the light does.
//      Their RELIEF dies at full phase and their ALBEDO does not, which is the
//      difference between a full moon and a featureless disc.
//   4. THE ALBEDO IS THE ALBEDO. Handed in already multiplied out, because
//      what colour a rock is and how bright it is are the caller's business.
//
// Nothing here knows what a belt is, what a spectral class is, or where the
// sun on this particular screen happens to be. It takes a look, a size, two
// phases and a light vector.

/** The frame every vector here is in: x right, y DOWN (canvas), z toward the
 * viewer. The same convention `planet-globe.ts` lights its worlds in. */
export type RockLight = { x: number; y: number; z: number };

/** What a rock IS, as far as the painter is concerned. Everything is a ratio
 * or a colour; the size is a separate argument, because one look is drawn at
 * a hundred different sizes as the thing flies past. */
export type RockLook = {
  /** Triaxial axis ratios, about a mean radius of 1. It turns about `c`. */
  a: number;
  b: number;
  c: number;
  /** Seed for the crater field and the silhouette's lumps. */
  seed: number;
  /** The surface at full illumination, RGB 0–255 — albedo and colour already
   * multiplied together by whoever knows what this rock is made of. */
  body: readonly [number, number, number];
  /** How much brighter freshly exposed material is, 0..1 — a young crater's
   * ray system. Silicate surfaces weather dark; carbonaceous ones barely. */
  fresh: number;
  /** A metallic specular glint, 0..1. Only an iron surface has one. */
  sheen: number;
  /** How heavily cratered, 0..1. Big old monoliths are saturated; small rubble
   * piles are boulder-strewn and hold craters poorly. */
  pitted: number;
};

/** How many points the silhouette is drawn with. Twenty-eight is under a
 * degree of chord error at a hundred pixels and costs nothing; the lumps
 * matter far more than the smoothness. */
const RIM = 28;

/** Below this many pixels across, craters are mud — draw the lit body and
 * stop. Most of a fly-by is spent under it. */
const CRATER_MIN_PX = 13;

/** The night side is not perfectly black — a rock in the belt is lit a little
 * by the rest of the sky. It is nearly black, though: this is an airless body
 * and the whole point of the terminator is that it is a line. */
const NIGHT = 0.045;

type Crater = {
  /** Body-fixed position: longitude about the spin axis, latitude from it. */
  lon: number;
  lat: number;
  /** Radius, as a fraction of the body's mean radius. */
  r: number;
  /** 1 for a young crater with bright ejecta, 0 for an old one. */
  fresh: number;
};

type Baked = { lumps: Float32Array; craters: Crater[]; patches: Crater[] };

/** A deterministic generator — the same rule as everywhere else in this sky:
 * a body that re-craters itself between two reloads cannot be reviewed. */
function lcg(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Rocks are cheap but they are not free, and the same rock is redrawn sixty
 * times a second for half a minute. The shape and the crater field are baked
 * once per seed and kept; the map is bounded because the belt only ever has a
 * handful of rocks alive. */
const BAKES = new Map<number, Baked>();

function bake(look: RockLook): Baked {
  const hit = BAKES.get(look.seed);
  if (hit) return hit;
  const rnd = lcg(look.seed);

  // The silhouette's lumps: three harmonics round the equator, so the outline
  // has a big asymmetry, a couple of shoulders and some grain. Sampled at RIM
  // points and read with an offset as the body turns.
  const h1 = 2 + Math.floor(rnd() * 2);
  const h2 = 4 + Math.floor(rnd() * 3);
  const h3 = 7 + Math.floor(rnd() * 4);
  const a1 = 0.1 + 0.09 * rnd();
  const a2 = 0.05 + 0.05 * rnd();
  const a3 = 0.02 + 0.03 * rnd();
  const p1 = rnd() * 7;
  const p2 = rnd() * 7;
  const p3 = rnd() * 7;
  const lumps = new Float32Array(RIM);
  for (let i = 0; i < RIM; i++) {
    const th = (i / RIM) * Math.PI * 2;
    lumps[i] =
      1 +
      a1 * Math.sin(h1 * th + p1) +
      a2 * Math.sin(h2 * th + p2) +
      a3 * Math.sin(h3 * th + p3);
  }

  // The crater field. Radii fall off as a power law — many small, few large —
  // which is the size distribution of the population doing the cratering, and
  // therefore of the holes it leaves. Latitude comes from an arcsine so the
  // poles are not carpeted.
  //
  // THERE ARE A LOT OF THEM, and that is the measured thing: an old surface in
  // the belt is SATURATED, meaning every new crater destroys an old one and
  // the count has stopped rising. Eros, Ida and Lutetia are covered edge to
  // edge; Mathilde has five craters as wide as itself. A handful of tidy pits
  // is what a moon in a cartoon has.
  const count = Math.round(7 + look.pitted * 24);
  const craters: Crater[] = [];
  for (let i = 0; i < count; i++) {
    craters.push({
      lon: rnd() * Math.PI * 2,
      lat: Math.asin(rnd() * 2 - 1) * 0.92,
      r: 0.06 + 0.24 * Math.pow(rnd(), 2.2),
      // A fifth of them are young enough to still show bright ejecta. Space
      // weathering closes that window in a few tens of millions of years,
      // which on a four-billion-year-old surface is a fifth of nothing —
      // it is generous, and it is what makes an S-type read as speckled.
      fresh: rnd() < 0.2 ? 1 : 0,
    });
  }

  // …and a handful of broad, very low-contrast albedo patches under all of it.
  // Real surfaces are blotchy at scales far bigger than any crater — Ryugu's
  // midlatitudes are redder than its poles, Bennu's boulders are brighter than
  // the regolith between them, Iapetus is two different worlds — and without
  // something at that scale a rock reads as moulded clay.
  const patches: Crater[] = [];
  for (let i = 0; i < 5; i++) {
    patches.push({
      lon: rnd() * Math.PI * 2,
      lat: Math.asin(rnd() * 2 - 1) * 0.8,
      r: 0.35 + 0.4 * rnd(),
      fresh: rnd() < 0.5 ? 1 : 0,
    });
  }
  const baked = { lumps, craters, patches };
  BAKES.set(look.seed, baked);
  return baked;
}

/** `rgba()` with a brightness multiplier — the one string this file builds. */
function shade(
  body: readonly [number, number, number],
  k: number,
  alpha: number,
): string {
  return `rgba(${Math.round(body[0] * k)}, ${Math.round(body[1] * k)}, ${Math.round(body[2] * k)}, ${alpha})`;
}

/**
 * Paint one rock.
 *
 * `r` is its MEAN radius in device pixels; `spin` and `tumble` are phases in
 * turns (the caller owns the clocks); `tilt` is where its pole points on
 * screen. `light` is the unit vector toward the sun in the frame above, and
 * `alpha` is the fade the caller wants — which is the only opacity this
 * function will apply, because a rock is an opaque body.
 */
export function paintRock(
  ctx: CanvasRenderingContext2D,
  look: RockLook,
  cx: number,
  cy: number,
  r: number,
  spin: number,
  tumble: number,
  tilt: number,
  light: RockLight,
  alpha: number,
): void {
  const { lumps, craters, patches } = bake(look);
  const phase = spin * Math.PI * 2;

  // THE PROJECTED ELLIPSE. Seen side-on, a triaxial body turning about its
  // short axis shows a width that swings between its long and its middle axis
  // and a height that never changes. Half a turn is a full cycle of that,
  // which is why an asteroid lightcurve has two maxima per rotation.
  const wob = tumble === 0 ? 0 : 0.16 * Math.sin(tumble * Math.PI * 2);
  const ax = Math.hypot(look.a * Math.cos(phase), look.b * Math.sin(phase));
  const ay = look.c * (1 + wob);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);
  ctx.rotate(tilt);

  // The light, rotated into the body's own screen frame — everything below is
  // measured against it, so it is easier to turn the light than the rock.
  const ct = Math.cos(-tilt);
  const st = Math.sin(-tilt);
  const lx = light.x * ct - light.y * st;
  const ly = light.x * st + light.y * ct;
  const lz = light.z;

  // THE SILHOUETTE: the ellipse, with the body-fixed lumps read at an offset
  // that advances with the spin.
  const slip = spin * RIM;
  ctx.beginPath();
  for (let i = 0; i <= RIM; i++) {
    const th = (i / RIM) * Math.PI * 2;
    const j = i + slip;
    const j0 = Math.floor(j);
    const f = j - j0;
    const l0 = lumps[((j0 % RIM) + RIM) % RIM] as number;
    const l1 = lumps[(((j0 + 1) % RIM) + RIM) % RIM] as number;
    const k = (l0 + (l1 - l0) * f) * r;
    const x = Math.cos(th) * ax * k;
    const y = Math.sin(th) * ay * k;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.clip();

  // THE SHADING, done in the body's own UNIT-CIRCLE space: scaling by the
  // projected semi-axes turns the ellipse into a circle, which is what lets
  // one radial gradient stand in for the whole cosine law — and turns back
  // into an ellipse on the way out, for free.
  ctx.save();
  ctx.scale(ax * r, ay * r);

  // THE NIGHT SIDE, laid down first — everything the light does not reach
  // stays this, which is what makes a rock crossing the star a silhouette
  // rather than a grey disc.
  ctx.fillStyle = shade(look.body, NIGHT, 1);
  ctx.fillRect(-1.3, -1.3, 2.6, 2.6);

  // THE DAY SIDE, and the whole trick is WHERE THE BRIGHTEST VISIBLE POINT IS.
  // A surface point's brightness is n·L, so:
  //
  //   • With the light behind the camera (Lz ≥ 0) the sub-solar point is ON
  //     the disc, at (Lx, Ly), and it is the full 1. The terminator crosses
  //     the axis at −Lz, so the gradient has to reach Lxy + Lz.
  //   • With the light behind the ROCK (Lz < 0) the sub-solar point is round
  //     the back and invisible. The brightest thing left is a point on the
  //     LIMB, at (Lx, Ly)/Lxy, and it only reaches Lxy — a crescent. The
  //     terminator crosses the axis at |Lz|, so the crescent is 1 − |Lz| of
  //     the radius wide, which at a small phase offset is a hairline.
  //
  // Both cases agree at Lz = 0, and both are the real geometry rather than a
  // fudge: the crescent narrows and dims correctly all the way to nothing as a
  // rock crosses in front of the star.
  const lxy = Math.hypot(lx, ly);
  const back = lz < 0;
  const cr = back ? (lxy > 1e-4 ? 1 / lxy : 0) : 1;
  const bx = lx * cr;
  const by = ly * cr;
  const peak = back ? lxy : 1;
  const reach = Math.max(0.03, back ? 1 - Math.abs(lz) : lxy + lz);
  if (peak > 0.008) {
    const lit = ctx.createRadialGradient(bx, by, 0, bx, by, reach);
    // Stops along the cosine falloff, scaled by how bright the brightest
    // visible point actually is.
    for (const [t, k] of [
      [0, 1],
      [0.34, 0.86],
      [0.62, 0.58],
      [0.84, 0.26],
    ] as const) {
      lit.addColorStop(t, shade(look.body, Math.max(NIGHT, peak * k), 1));
    }
    lit.addColorStop(1, shade(look.body, NIGHT, 0));
    ctx.fillStyle = lit;
    ctx.fillRect(-1.3, -1.3, 2.6, 2.6);
  }

  // A METAL SURFACE GLINTS. Not a highlight on a sphere — a tight, off-white
  // flare at the brightest point, which is what separates an M-type from a
  // grey stony one at any size. It goes with the phase, so a backlit iron rock
  // shows it as a hot rim rather than a spot.
  if (look.sheen > 0 && peak > 0.05) {
    const g = ctx.createRadialGradient(bx, by, 0, bx, by, Math.min(0.6, reach));
    g.addColorStop(0, `rgba(255, 252, 244, ${0.5 * look.sheen * peak})`);
    g.addColorStop(1, "rgba(255, 252, 244, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(-1.3, -1.3, 2.6, 2.6);
  }
  ctx.restore();

  if (r * 2 * Math.max(ax, ay) >= CRATER_MIN_PX) {
    paintPatches(ctx, look, patches, r, ax, ay, phase, lx, ly, lz);
    paintCraters(ctx, look, craters, r, ax, ay, phase, lx, ly, lz);
  }

  ctx.restore();
}

/**
 * Where a body-fixed feature lands on screen this frame, or null if it is
 * round the back. Shared by the craters and the broad albedo patches, because
 * "carry it round with the spin and squash it onto the projected ellipse" is
 * the same arithmetic for both.
 */
function place(
  c: Crater,
  r: number,
  ax: number,
  ay: number,
  phase: number,
  lx: number,
  ly: number,
  lz: number,
): {
  x: number;
  y: number;
  /** Semi-axes and rotation of the projected feature. */
  rMin: number;
  rMaj: number;
  ang: number;
  /** How lit it is, and how squarely it faces the viewer. */
  nl: number;
  face: number;
} | null {
  const lon = c.lon + phase;
  const cl = Math.cos(c.lat);
  // The feature's outward normal, as a unit vector in the screen frame: `w` is
  // toward the viewer, so anything on the far side is simply not drawn.
  const u = cl * Math.sin(lon);
  const w = cl * Math.cos(lon);
  const v = Math.sin(c.lat);
  if (w <= 0.1) return null;
  const nl = u * lx + v * ly + w * lz;
  if (nl <= 0.02) return null;

  // A circular patch on a sphere projects to an ellipse whose MINOR axis lies
  // along the screen projection of its own normal and is foreshortened by w —
  // which is what makes a crater near the limb a sliver lying the right way
  // round rather than a squashed circle lying the wrong way.
  const s = ((ax + ay) / 2) * r;
  return {
    x: u * ax * r,
    y: v * ay * r,
    rMin: Math.max(0.5, c.r * s * w),
    rMaj: Math.max(0.5, c.r * s),
    ang: Math.atan2(v * ay, u * ax),
    nl,
    face: w,
  };
}

/**
 * The crater field.
 *
 * A BOWL IS A GRADIENT, NOT TWO SPOTS. The inner wall on the side AWAY from
 * the sun is turned toward it and catches the light; the wall on the sunward
 * side is turned away and sits in shadow. So a crater is one smooth ramp
 * across its own opening, dark on the star's side and bright opposite — plus a
 * thin catch of light on the raised rim, which is the part that makes it read
 * as a hole rather than a stain. Swap the two ends and every crater on the
 * body turns into a dome; it is the single easiest thing to get backwards.
 */
function paintCraters(
  ctx: CanvasRenderingContext2D,
  look: RockLook,
  craters: Crater[],
  r: number,
  ax: number,
  ay: number,
  phase: number,
  lx: number,
  ly: number,
  lz: number,
): void {
  // The light's direction across the screen. With the sun nearly behind the
  // camera there is no direction to ramp along and the craters flatten out —
  // which is exactly what a full moon looks like through binoculars, and why
  // the terminator is the only place its craters have any relief at all.
  const lLen = Math.hypot(lx, ly);
  const ux = lLen > 1e-3 ? lx / lLen : 0;
  const uy = lLen > 1e-3 ? ly / lLen : 0;

  for (const c of craters) {
    const at = place(c, r, ax, ay, phase, lx, ly, lz);
    if (!at || at.rMin < 0.9) continue;

    // A CRATER IS TWO THINGS AND THEY FADE SEPARATELY, which is the whole
    // reason a full moon is not a featureless disc:
    //
    //   • its RELIEF — the shadowed wall and the lit one — is a shadow, so it
    //     dies both at the terminator and at full phase, where the light comes
    //     from behind the viewer and nothing on the body casts anything. That
    //     is why the Moon's craters are spectacular along the terminator and
    //     invisible at full.
    //   • its ALBEDO — a floor of a different tone, and the bright ejecta a
    //     young one threw out — is a property of the ground and shows at every
    //     phase. At full it is ALL that shows, and it is the ray systems that
    //     make a full moon worth looking at.
    const k = Math.min(1, at.nl * 1.5) * Math.min(1, at.face * 2.4);
    if (k < 0.03) continue;

    ctx.beginPath();
    ctx.ellipse(at.x, at.y, at.rMin, at.rMaj, at.ang, 0, Math.PI * 2);
    ctx.fillStyle = shade(look.body, 0.86, 0.3 * k);
    ctx.fill();

    if (lLen > 0.02) {
      const reach = Math.max(at.rMin, at.rMaj * 0.7);
      const g = ctx.createLinearGradient(
        at.x + ux * reach,
        at.y + uy * reach,
        at.x - ux * reach,
        at.y - uy * reach,
      );
      // Sunward wall: in shadow. Floor: the surface. Anti-sunward wall:
      // catching the light.
      const kr = k * lLen;
      g.addColorStop(0, shade(look.body, 0.08, 0.85 * kr));
      g.addColorStop(0.42, shade(look.body, 0.6, 0.32 * kr));
      g.addColorStop(0.72, shade(look.body, 1.2, 0.38 * kr));
      g.addColorStop(1, shade(look.body, 1.5, 0.6 * kr));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(at.x, at.y, at.rMin, at.rMaj, at.ang, 0, Math.PI * 2);
      ctx.fill();
    }

    // A young crater has thrown fresh material out of itself, and on a
    // weathered silicate surface that is a bright halo of ejecta around it.
    if (c.fresh && look.fresh > 0.15 && at.rMaj > 2) {
      const h = ctx.createRadialGradient(
        at.x,
        at.y,
        at.rMaj * 0.7,
        at.x,
        at.y,
        at.rMaj * 2.1,
      );
      h.addColorStop(
        0,
        shade(look.body, 1 + look.fresh, 0.34 * k * look.fresh),
      );
      h.addColorStop(1, shade(look.body, 1 + look.fresh, 0));
      ctx.fillStyle = h;
      ctx.beginPath();
      ctx.ellipse(
        at.x,
        at.y,
        at.rMin * 2.1,
        at.rMaj * 2.1,
        at.ang,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }
}

/** The broad albedo patches under the craters — no relief, just a surface that
 * is not one colour. They are drawn first and stay very low contrast; their
 * whole job is to stop a rock looking moulded. */
function paintPatches(
  ctx: CanvasRenderingContext2D,
  look: RockLook,
  patches: Crater[],
  r: number,
  ax: number,
  ay: number,
  phase: number,
  lx: number,
  ly: number,
  lz: number,
): void {
  for (const c of patches) {
    const at = place(c, r, ax, ay, phase, lx, ly, lz);
    if (!at || at.rMaj < 2) continue;
    const k = Math.min(1, at.nl * 1.4) * Math.min(1, at.face * 1.8);
    if (k < 0.03) continue;
    const tone = c.fresh ? 1.16 : 0.82;
    const g = ctx.createRadialGradient(at.x, at.y, 0, at.x, at.y, at.rMaj);
    g.addColorStop(0, shade(look.body, tone, 0.34 * k));
    g.addColorStop(1, shade(look.body, tone, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(at.x, at.y, at.rMin, at.rMaj, at.ang, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Drop every baked shape. The driver calls this when it stops, so a title
 * screen left and returned to does not carry the last visit's rocks. */
export function clearRockBakes(): void {
  BAKES.clear();
}
