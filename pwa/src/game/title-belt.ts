// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE MAIN BELT — the rocks the title camera is parked in the middle of, as
// data and as a distribution.
//
// `title-sky.ts` puts the viewer at CAM_AU = 3: the gap between Mars and
// Jupiter, which is where the asteroid belt is. That was chosen to sort the
// planets into inferior and superior worlds, and it has a second consequence
// this file is the whole of — the rocks that fly past the menu are BELT
// OBJECTS, seen from inside the belt, and everything about them can be the
// measured thing rather than an invented one.
//
// WHAT IS REAL HERE:
//
//   • THE TAXONOMY. Six spectral classes, at their real shares of the
//     kilometre-sized population, each with its MEASURED geometric albedo and
//     the colour its reflectance spectrum actually has. A C-type is drawn four
//     times darker than an S-type because it IS four times darker.
//   • THE SIZE DISTRIBUTION. A broken power law with the measured slopes —
//     the belt's size–frequency distribution is famously NOT a single line,
//     and the bend near a kilometre is in the surveys.
//   • THE SPEEDS. A Maxwellian about the belt's measured mean encounter
//     velocity, 5.3 km/s — so the spread, the most probable value and the
//     tail are the belt's own.
//   • THE GEOMETRY. Straight-line fly-bys past a pinhole camera, with the
//     impact parameter drawn from the real b·db law: a close pass is rare in
//     exactly the proportion that a close pass is rare.
//   • THE INTERVALS. A Poisson process, because independent arrivals are one.
//     Fly-bys clump and then go quiet; they do not take turns.
//   • THE SPINS. Periods from the observed distribution, floored at the 2.2 h
//     RUBBLE-PILE SPIN BARRIER — the sharp edge in the lightcurve databases
//     where a gravitationally-bound heap would start throwing itself apart.
//   • THE SHAPES. Triaxial, more elongated the smaller the body (a/b ≈ 1.6 at
//     the small end, rounding off toward the big), turning about the short
//     axis. A real asteroid LIGHTCURVE falls out of that on its own: the
//     projected area swings as the body turns, which is the entire reason
//     anybody knows an asteroid's rotation period.
//
// AND TWO THINGS ARE NOT, both stated rather than hidden — the same bargain
// `title-sky.ts` strikes with DISTANCE:
//
//   • DENSITY. The real belt is empty to a degree that no picture survives:
//     neighbouring kilometre-sized rocks sit about a MILLION kilometres apart,
//     more than twice the Earth–Moon distance, which is why every probe ever
//     sent through it needed a deliberate course change to get near one. At
//     that density a fly-by close enough to show a disc happens about once
//     every ten million years. The spacing here is compressed by roughly four
//     orders of magnitude in length, to a few tens of kilometres — see
//     `ARRIVAL_MS`. That one number is the difference between a belt nobody
//     ever sees and a belt.
//   • THE TOP OF THE SIZE RANGE. Sitting in a real belt, the rocks you can
//     see as DISCS are dominated by the biggest ones, because a big rock is
//     visible from proportionally further away — the same selection that made
//     Ceres the first asteroid ever found. Honest, and unwatchable: a 30 km
//     body picked up at its own detection limit crosses the frame over four
//     minutes, and half of everything that arrived would be one. So the drawn
//     population is cut at `CEIL_KM`, and what that costs is worth saying
//     plainly — the belt's real giants never come. Ceres (940 km), Vesta
//     (525), Pallas, Hygiea and the two hundred other bodies over 100 km are
//     not in this sky. Everything that IS in it is real.
//
// Nothing in this file touches the DOM, and nothing in it draws: it is the
// catalogue and the dice. `title-asteroids.ts` flies them, `@ui/lib/rock.ts`
// paints them.

/**
 * THE CAMERA'S FOCAL LENGTH, in the same short-side units the rest of the sky
 * measures screen offsets in. 1 puts the frame's half-height at one focal
 * length, so the vertical field of view is 2·atan(0.5) = 53° — a normal lens,
 * and about as much sky as a phone held at arm's length covers.
 *
 * It is the ONE thing in the sky drawn in perspective. The planets are
 * projected orthographically (`project` in title-sky.ts) and correctly so:
 * they are AU away and their perspective over a screen's width is nil. These
 * rocks are tens of kilometres away, so perspective is the entire effect —
 * a rock's size and its distance from the frame's centre both go as 1/depth,
 * which is why one swells and sweeps outward at the same time.
 */
export const FOCAL = 1;

/**
 * WHEN A ROCK BECOMES A ROCK: the apparent diameter, as a fraction of the
 * viewport's short side, at which one is picked up. Below it a body is a point
 * of light against a sky that is already full of points of light — the
 * starfield behind this belt IS the belt at range, so drawing a rock smaller
 * than this adds a star to a starfield.
 *
 * IT SETS EVERY ROCK'S DRAWN SIZE, because the whole apparent-size
 * distribution hangs off it: a fly-by peaks at SEE_AT/√u for a uniform u, so
 * halving this halves every rock on screen. It was halved once already — the
 * belt's first tuning drew them twice this big and they took the eye off the
 * planets, which are what the sky is a picture of.
 *
 * It also sets every fly-by's LENGTH, which is why it is a bigger decision
 * than it looks. A rock is first seen at range D/SEE_AT and passes at its miss
 * distance, so it is in the picture for about 2·D/(v·SEE_AT) seconds. Halving
 * it therefore doubles how long each rock lingers, which is the opposite of
 * what shrinking them is usually for — so `ARRIVAL_MS` has to come down with
 * it or the sky ends up busier rather than calmer.
 */
export const SEE_AT = 0.014;

/**
 * …and the biggest a rock may get before it goes past, as the same fraction.
 * A pass closer than this is redrawn at this distance rather than thrown away:
 * the population is scale-free, so there is no natural ceiling in the physics
 * and without one a rock eventually fills the menu.
 */
export const SPAN_MAX = 0.13;

/**
 * HOW LONG BEFORE ITS CLOSEST APPROACH A ROCK IS PICKED UP, in seconds — the
 * backstop on the rule above. `SEE_AT` bounds a fly-by's length only for a
 * given speed, and the Maxwellian has a slow tail: a four-kilometre rock
 * drifting past at 2 km/s would otherwise sit in the frame for two and a half
 * minutes. Whichever of the two limits is nearer wins, so nothing outstays
 * this.
 */
export const SIGHT_S = 30;

/** The drawn size range, in kilometres — see the note on the top of it above.
 * The floor is where the 2.2 h spin barrier stops applying (a body under about
 * 150 m can be a single rock rather than a heap, and some of those spin in
 * minutes); the ceiling is the watchability cut. */
export const FLOOR_KM = 0.15;
export const CEIL_KM = 4;

/**
 * THE BELT'S SIZE–FREQUENCY DISTRIBUTION, as the surveys measure it: a power
 * law N(>D) ∝ D^−b, but with a documented BEND rather than one slope all the
 * way down. Spitzer and the ecliptic surveys put the cumulative slope at about
 * 1.3 below a kilometre and about 2.3 in the several-to-tens-of-kilometres
 * range — the belt is short of small bodies compared with a single line, which
 * is the fingerprint of a collisionally relaxed population that has been
 * grinding itself down for four and a half billion years.
 *
 * WHAT ARRIVES IS NOT WHAT IS OUT THERE, and this is the interesting part. A
 * rock of diameter D is picked up out to a range proportional to D, so it
 * sweeps an area ∝ D²: the rate of VISIBLE fly-bys goes as n(D)·D², which
 * tilts the mix hard toward the top of the range even though the population
 * itself is overwhelmingly small rubble. That is the same bias that had
 * astronomers find the belt's largest bodies first and its kilometre-sized
 * ones last, and it is left in rather than corrected out.
 */
const SFD_BREAK_KM = 1;
const SFD_SLOPE_SMALL = 1.3;
const SFD_SLOPE_LARGE = 2.3;

/**
 * THE BELT'S ENCOUNTER SPEED. Collision studies of the main belt put the mean
 * impact velocity at 5.3 km/s and the most probable at about 4.4 — the
 * signature of a Maxwellian, which is what a swarm of bodies on randomly
 * oriented eccentric orbits gives. Drawn as one here (three Gaussians, root
 * sum of squares), so the mean, the mode and the long tail out past 12 km/s
 * are the belt's rather than a range picked by feel.
 *
 * IT IS A RELATIVE SPEED, NOT AN ORBITAL ONE. Everything at 3 AU — the camera
 * included — is going round the sun at about 17 km/s, and that shared motion
 * is invisible from inside it. What is left is the few km/s by which two belt
 * objects' orbits differ, and that is what a fly-by is made of.
 */
const V_SIGMA_KMS = 3.32;

/**
 * THE ONE INVENTED NUMBER: how often a rock arrives. See the density note at
 * the top of the file — the real belt would hand this camera a fly-by about
 * once every ten million years.
 *
 * IT IS CHOSEN AGAINST THE PACE OF THE REST OF THE SKY rather than in the
 * abstract, and the sky is unhurried. On its own clocks an Earth year is 64 s
 * and an Earth day 22 s (`title-planets.ts`); Mercury rounds the sun every
 * 15 s while the four giants hold station for minutes at a time. The belt is
 * the only fast thing in the picture, and the picture is of the PLANETS.
 *
 * WHICH IS WHY THIS NUMBER GOT FOUR TIMES BIGGER. The first tuning put one or
 * two rocks in frame at all times and a close pass every eight seconds; that
 * reads as weather, and weather is the wrong register for a backdrop whose
 * subject is somebody else. Measured through the real projection
 * (`tests/title_belt_test.ts` walks it at all three reference viewports) this
 * puts about HALF a rock in view — so usually one, often none — and a rock
 * big enough to read about once a minute. A close pass is meant to be an
 * event; an event every eight seconds is scenery.
 *
 * THE GAPS ARE EXPONENTIAL, not fixed, because arrivals of independent objects
 * are a Poisson process. That is the difference between a belt and a conveyor
 * belt, and it is the single most visible change from the fixed-cycle rocks
 * this replaced: sometimes three come at once and then nothing does for half a
 * minute.
 */
export const ARRIVAL_MS = 17000;

/** How many fly-bys may be alive at once. Poisson arrivals clump, so this sits
 * well above the mean (three or four, counting the ones the frame never sees);
 * an arrival that finds every slot taken is simply not born, which is one more
 * rock nobody sees in a belt defined by the rocks nobody sees. */
export const MAX_LIVE = 12;

/**
 * ROTATION, on the sky's SPIN clock — the same one every planet's day runs on
 * (EARTH_SPIN_MS = 22 s to the day in `title-planets.ts`), so a rock's tumble
 * is right against Jupiter's ten-hour day rather than picked to look busy.
 *
 * THE FLOOR IS THE SPIN BARRIER. Plot a few thousand asteroid rotation periods
 * against diameter and there is a wall at 2.2 hours that nothing above about
 * 150 m crosses: faster than that, the centrifugal force at the equator of a
 * gravitationally-bound rubble pile exceeds its own weight and the heap starts
 * shedding. The handful of known faster rotators are all sub-kilometre
 * monoliths held together by their own strength — and by cohesion, which is
 * how 2001 OE84 gets away with it. This belt's floor (FLOOR_KM) is above the
 * size where that is possible, so the barrier here is absolute.
 *
 * Above it the observed distribution is broad and peaked around six or seven
 * hours, with a long tail of slow rotators running to days. The slowest of
 * those are usually TUMBLING — in non-principal-axis rotation, because the
 * internal damping that would settle a body onto its short axis takes longer
 * than the time since its last big collision. Rocks past `TUMBLE_ABOVE_H` get
 * the second axis.
 */
export const SPIN_BARRIER_H = 2.2;
const SPIN_MEDIAN_H = 6.5;
const TUMBLE_ABOVE_H = 20;

/** One spectral class: what it is made of, how bright that is, and what colour
 * it is. */
export type RockClass = {
  /** Taxonomic label, as it would be written in a catalogue. */
  id: string;
  /** Share of the kilometre-sized belt population, by number. */
  share: number;
  /** MEASURED geometric albedo — the mean for the class. This is the single
   * most informative number on the row: the set spans a factor of twelve, from
   * the P- and D-types at 0.045 (darker than fresh asphalt) to the enstatite
   * E-types at 0.55 (about as bright as sea ice), and that spread is painted
   * rather than evened out. */
  albedo: number;
  /** The SHAPE of the class's reflectance spectrum as a unit RGB — its colour
   * with its brightness divided out, because brightness is the albedo above.
   * The S-, D- and V-types have genuinely steep red slopes; the C-complex is
   * famously featureless and close to neutral; the B-types inside it are the
   * one part of the sky that is faintly blue. */
  hue: readonly [number, number, number];
  /** How much brighter freshly exposed material is than the weathered surface
   * around it, 0..1. SPACE WEATHERING is why this varies: micrometeorites and
   * the solar wind darken and redden a silicate surface over tens of millions
   * of years, so a young crater on an S-type punches a bright ray system
   * through an old dark one. A carbonaceous surface has much less to lose and
   * barely shows it. */
  fresh: number;
  /** A metallic sheen, 0..1 — the specular glint an iron–nickel surface has
   * and a rubble pile of chondrite does not. Only the M-types have one, and it
   * is what a radar albedo of 0.37 looks like in visible light. */
  sheen: number;
};

/**
 * THE SIX, at their debiased shares of the kilometre-sized population. The
 * headline "over 75% of known asteroids are C-type" is a statement about a
 * CATALOGUE rather than about the belt: dark objects are hard to find, bright
 * ones are found first, and the two biases pull in opposite directions at
 * different sizes. What is left after they are taken out is roughly half
 * carbonaceous, a third silicaceous, and a tenth the X-complex — with the
 * S-types concentrated in the inner belt inside 2.5 AU and the C-types
 * dominant beyond 2.7, which is a compositional gradient left over from where
 * in the disc it was cold enough for the ices to survive.
 *
 * The classes are lumped into their COMPLEXES, which is also how the modern
 * taxonomies do it: the B-, F- and G-types sit inside C, the Q- and A-types
 * inside S, and the M-types are the metallic part of X.
 */
export const CLASSES: readonly RockClass[] = [
  {
    // Carbonaceous: primitive, unmelted, essentially the stuff the solar
    // system condensed out of. Ryugu and Bennu are the two that have been
    // landed on, and both came back darker than the models expected — Bennu's
    // geometric albedo is 0.044, which is charcoal.
    id: "C",
    share: 0.52,
    albedo: 0.066,
    hue: [1.0, 0.99, 0.98],
    fresh: 0.12,
    sheen: 0,
  },
  {
    // Silicaceous: stony, olivine and pyroxene, the ordinary chondrites. The
    // inner belt's own, and the class most of the meteorites that reach the
    // ground belong to.
    id: "S",
    share: 0.31,
    albedo: 0.23,
    hue: [1.0, 0.86, 0.67],
    fresh: 0.5,
    sheen: 0.05,
  },
  {
    // Metallic: the exposed iron–nickel cores of bodies that got big enough to
    // melt and differentiate, and were then broken open. Psyche is the one
    // being visited.
    id: "M",
    share: 0.1,
    albedo: 0.17,
    hue: [1.0, 0.95, 0.88],
    fresh: 0.25,
    sheen: 0.55,
  },
  {
    // Primitive and very red: organic-rich, ice-bearing, from the far side of
    // the belt and beyond it. The Trojans are almost all D-type.
    id: "D",
    share: 0.05,
    albedo: 0.045,
    hue: [1.0, 0.78, 0.6],
    fresh: 0.08,
    sheen: 0,
  },
  {
    // Basaltic: lava. Every V-type in the belt is a chip off Vesta, blasted
    // out of the Rheasilvia basin at its south pole and still recognisable
    // from its pyroxene bands a billion years later.
    id: "V",
    share: 0.015,
    albedo: 0.42,
    hue: [1.0, 0.9, 0.75],
    fresh: 0.6,
    sheen: 0.1,
  },
  {
    // Enstatite: the brightest surfaces in the belt, and its rarest. They sit
    // at the very inner edge, in the Hungaria group, cooked closer to the sun
    // than anything else that stayed.
    id: "E",
    share: 0.005,
    albedo: 0.55,
    hue: [1.0, 0.98, 0.95],
    fresh: 0.3,
    sheen: 0.15,
  },
];

/** A rolled rock: what it is, how big, what shape, and how it turns. Handed to
 * the painter, which knows nothing about belts. */
export type Rock = {
  cls: RockClass;
  /** Diameter, km — the real one, which is what sets its fly-by's length. */
  km: number;
  /** Seed for the painter's crater field and silhouette noise. */
  seed: number;
  /** Triaxial axis ratios a:b:c, normalised so the mean radius is 1. It turns
   * about c, the short axis, which is where a body's rotation settles once
   * internal friction has damped everything else out. */
  a: number;
  b: number;
  c: number;
  /** Rotation period on the sky's spin clock (ms), signed — a third of
   * asteroids turn retrograde, and the YORP effect is why the split is not
   * even. */
  spinMs: number;
  /** Second period (ms) for a body in non-principal-axis rotation, or 0. */
  tumbleMs: number;
  /** Where the spin axis points on screen (radians) — a rock's pole is not
   * conveniently vertical. */
  tilt: number;
};

/** A rock, and the straight line it is flying past the camera on. */
export type Flyby = {
  rock: Rock;
  /** When it appears and when it is done, on the sky's clock (ms). */
  from: number;
  to: number;
  /** The closest-approach point, in km, in camera space: x right, y down, z
   * into the screen. The rock is at `at + v·(t − mid)·dir`, and because the
   * velocity is perpendicular to this point by construction, `at` really is
   * the closest approach and the range really is √(b² + v²t²). */
  at: { x: number; y: number; z: number };
  dir: { x: number; y: number; z: number };
  /** Relative speed, km/s. */
  v: number;
  /** Miss distance, km. */
  miss: number;
};

// ---------------------------------------------------------------------------
// The dice.
// ---------------------------------------------------------------------------

/**
 * A deterministic little generator, as everywhere else in this sky — the belt
 * is a pure function of the clock, so `window.__skyFreeze` reproduces the
 * exact same rocks in the exact same places and a screenshot of the title
 * screen is reviewable. `Math.random` would make every reload a different
 * belt, which is un-reviewable in precisely the way a backdrop most needs to
 * be reviewable.
 */
export function lcg(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** A standard normal, by Box–Muller. */
function gauss(rnd: () => number): number {
  const u = Math.max(1e-9, rnd());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
}

/** The gap to the next arrival (ms): exponential, because the arrivals are a
 * Poisson process. */
export function nextGapMs(rnd: () => number): number {
  return -Math.log(Math.max(1e-9, rnd())) * ARRIVAL_MS;
}

/** A relative speed (km/s), Maxwellian about the belt's measured mean. */
export function rollSpeed(rnd: () => number): number {
  const x = gauss(rnd);
  const y = gauss(rnd);
  const z = gauss(rnd);
  return Math.max(0.4, Math.hypot(x, y, z) * V_SIGMA_KMS);
}

/**
 * A diameter (km) from the belt's broken power law, weighted by D² — because
 * this is the size of a rock that ARRIVES, and a rock twice as wide is picked
 * up from twice as far and so sweeps four times the area. See the note on
 * SFD_BREAK_KM.
 *
 * The rate density is n(D)·D² ∝ D^(1−b) on each segment; the two segments are
 * integrated, one is chosen by weight, and the draw inside it is the inverted
 * cumulative.
 */
export function rollDiameter(rnd: () => number): number {
  const pSmall = 1 - SFD_SLOPE_SMALL;
  const pLarge = 1 - SFD_SLOPE_LARGE;
  const seg = (p: number, lo: number, hi: number): number =>
    (Math.pow(hi, p + 1) - Math.pow(lo, p + 1)) / (p + 1);
  const wSmall = seg(pSmall, FLOOR_KM, SFD_BREAK_KM);
  const wLarge = seg(pLarge, SFD_BREAK_KM, CEIL_KM);
  const pick = rnd() * (wSmall + wLarge);
  const [p, lo, hi] =
    pick < wSmall
      ? [pSmall, FLOOR_KM, SFD_BREAK_KM]
      : [pLarge, SFD_BREAK_KM, CEIL_KM];
  const u = rnd();
  const a = Math.pow(lo, p + 1);
  const bb = Math.pow(hi, p + 1);
  return Math.pow(a + (bb - a) * u, 1 / (p + 1));
}

/** A spectral class, at the shares above. */
export function rollClass(rnd: () => number): RockClass {
  let u = rnd();
  for (const c of CLASSES) {
    u -= c.share;
    if (u <= 0) return c;
  }
  return CLASSES[0] as RockClass;
}

/**
 * A rotation period, in HOURS: log-normal about the observed median, hard-
 * floored at the spin barrier. A tenth of the draws are pushed into the slow
 * tail, which is where the tumblers live.
 */
export function rollSpinHours(rnd: () => number): number {
  const slow = rnd() < 0.1;
  const h = SPIN_MEDIAN_H * Math.exp(gauss(rnd) * (slow ? 1.5 : 0.55));
  return Math.max(SPIN_BARRIER_H, slow ? h * 3 : h);
}

/**
 * Roll one rock. `spinMsPerHour` is how long an hour lasts on the sky's spin
 * clock, handed in rather than imported so this file stays a leaf.
 */
export function rollRock(rnd: () => number, spinMsPerHour: number): Rock {
  const cls = rollClass(rnd);
  const km = rollDiameter(rnd);
  const hours = rollSpinHours(rnd);
  // ELONGATION FALLS OFF WITH SIZE, which is measured: a body under a few
  // kilometres is a fragment or a heap of them and averages a/b ≈ 1.6, while
  // past 25 km its own gravity has begun to round it off. Nothing in this belt
  // is anywhere near the ~400 km where a rocky body goes properly spherical.
  const elong = 1 + (0.62 * 0.9) / (0.9 + km) + 0.18 * rnd();
  // …and the short axis, the one it turns about, is flattened again.
  const flat = 0.72 + 0.2 * rnd();
  const mean = Math.cbrt(elong * 1 * flat);
  return {
    cls,
    km,
    seed: Math.floor(rnd() * 0x7fffffff),
    a: elong / mean,
    b: 1 / mean,
    c: flat / mean,
    // A third of asteroids turn backwards. It is not a coin toss: the YORP
    // effect — sunlight torquing an irregular body — drives spin axes toward
    // the poles of the ecliptic and leaves the two senses unevenly filled.
    spinMs: hours * spinMsPerHour * (rnd() < 0.36 ? -1 : 1),
    tumbleMs:
      hours > TUMBLE_ABOVE_H ? hours * spinMsPerHour * (2.3 + 2 * rnd()) : 0,
    tilt: (rnd() - 0.5) * 1.4,
  };
}

/**
 * Roll one fly-by: a rock, and the straight line it goes past on.
 *
 * THE GEOMETRY, in one paragraph. Pick where on the screen the closest
 * approach happens and unproject it to get the direction Ĉ the rock will be in
 * at that moment. Pick the miss distance b from the real impact-parameter law
 * — the flux through an annulus goes as b·db, so b = b_max·√u and a close pass
 * is rare in exactly the right proportion. Put the rock at C = b·Ĉ, and send
 * it off in a direction PERPENDICULAR to Ĉ at a random azimuth, which is both
 * isotropic and what makes C the closest approach rather than merely a point
 * on the path. Some rocks then come almost straight at the camera and swell;
 * most cross the field of view and slide. Both happen in a belt.
 *
 * `t0` is when it arrives, on the sky's clock. `spinMsPerHour` is passed
 * through to `rollRock`.
 */
export function rollFlyby(
  rnd: () => number,
  t0: number,
  spinMsPerHour: number,
): Flyby {
  const rock = rollRock(rnd, spinMsPerHour);
  const v = rollSpeed(rnd);

  // Where on screen it passes closest, in short-side units from the frame's
  // centre. A little outside the frame as well as inside it, so rocks clip the
  // corners and cross the edges instead of all aiming for the middle.
  const sx = (rnd() - 0.5) * 1.5;
  const sy = (rnd() - 0.5) * 1.5;
  const len = Math.hypot(sx, sy, FOCAL);
  const dir = { x: sx / len, y: sy / len, z: FOCAL / len };

  // The impact parameter. b_max is the distance at which the rock is exactly
  // at the detection limit; b_min is what would make it fill SPAN_MAX of the
  // frame. Anything closer is redrawn at b_min rather than discarded.
  const bMax = (rock.km * FOCAL) / SEE_AT;
  const bMin = (rock.km * FOCAL) / SPAN_MAX;
  const miss = Math.max(bMin, bMax * Math.sqrt(rnd()));

  // A unit vector perpendicular to `dir`, at a random azimuth about it.
  const up =
    Math.abs(dir.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 };
  const e1x = dir.y * up.z - dir.z * up.y;
  const e1y = dir.z * up.x - dir.x * up.z;
  const e1z = dir.x * up.y - dir.y * up.x;
  const e1n = Math.hypot(e1x, e1y, e1z) || 1;
  const u1 = { x: e1x / e1n, y: e1y / e1n, z: e1z / e1n };
  const u2 = {
    x: dir.y * u1.z - dir.z * u1.y,
    y: dir.z * u1.x - dir.x * u1.z,
    z: dir.x * u1.y - dir.y * u1.x,
  };
  const psi = rnd() * Math.PI * 2;
  const cp = Math.cos(psi);
  const sp = Math.sin(psi);
  const travel = {
    x: u1.x * cp + u2.x * sp,
    y: u1.y * cp + u2.y * sp,
    z: u1.z * cp + u2.z * sp,
  };

  // How far out it is picked up: whichever of the two limits is nearer — the
  // detection limit, or half a minute of flight (SIGHT_S).
  const reach = Math.max(miss * 1.001, Math.min(bMax, v * SIGHT_S));
  const halfS = Math.sqrt(reach * reach - miss * miss) / v;

  return {
    rock,
    from: t0,
    to: t0 + halfS * 2000,
    at: { x: dir.x * miss, y: dir.y * miss, z: dir.z * miss },
    dir: travel,
    v,
    miss,
  };
}

/** Where a fly-by's rock is at time `t` (ms on the sky's clock), in km, in
 * camera space. */
export function flybyAt(
  f: Flyby,
  t: number,
): { x: number; y: number; z: number } {
  const s = (t - (f.from + f.to) / 2) / 1000;
  const d = f.v * s;
  return {
    x: f.at.x + f.dir.x * d,
    y: f.at.y + f.dir.y * d,
    z: f.at.z + f.dir.z * d,
  };
}
