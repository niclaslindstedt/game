// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE MOONS — every round satellite in the solar system, on its real orbit.
//
// The title sky's planets are in `title-sky.ts`; this is the twenty bodies that
// go round THEM, and the arithmetic that puts each one on screen. Their faces
// are baked by `moon-skins.ts` from the real geography in `moon-maps.ts`.
//
// WHICH TWENTY. Every satellite big enough for its own gravity to have pulled
// it round, plus Mars's two rocks and Neptune's Proteus, which miss that bar
// and are famous anyway. The other three hundred are captured rubble a few
// kilometres across — a rock with a number rather than a world — and drawing
// them would be a claim about the sky that is not true at any scale this frame
// can show.
//
// FOUR THINGS ARE EXACT HERE, and each of them is the answer to a question the
// old sky got wrong:
//
//   • SIZE. A satellite's disc is its true diameter over its planet's, times
//     the planet's drawn disc. No exponent, no floor, no easing — the same rule
//     our own Moon is held to, for the same reason: a moon is only ever seen
//     BESIDE the one body that measures it.
//   • THE PLANE. A satellite orbits in its planet's EQUATOR, not in the
//     ecliptic, and that is why Jupiter's four string out in a line while
//     Uranus's five wheel round it like a dartboard — Uranus is lying on its
//     side and its moons went over with it. The basis comes from the same pole
//     table the globe shader leans each texture on (`planet-poles.ts`).
//   • TIME. Every period below is the real one, on ONE clock shared by all
//     twenty, so every ratio between them is exactly right — including the
//     1:2:4 lock of Io, Europa and Ganymede, the only orbital resonance in the
//     solar system you can watch happen.
//   • THE FACE. All twenty are tidally locked, so each one's spin IS its orbit
//     and longitude 0 of its texture is the point that stares at its planet.
//
// AND ONE THING IS NOT, on purpose: DISTANCE, exactly as everywhere else in
// this sky. See `bandFor` — a true-scale Jovian system would be four screens
// wide with the moons themselves invisible inside it.

import {
  PLANET_POLES,
  equatorBasis,
  type PoleName,
} from "@ui/lib/planet-poles.ts";
import { orbitAt, type World } from "@ui/lib/orbit.ts";
import type { GlobeKind } from "@ui/lib/planet-globe.ts";

/** The planets that have one of these. (Earth's Moon is not here: it is old
 * enough in this file's history to have its own seat in `title-sky.ts`, and
 * physically it is the odd one out anyway — see `SATELLITES` below.) */
export type ParentName = "mars" | "jupiter" | "saturn" | "uranus" | "neptune";

/**
 * One satellite. Every number bar `l0` and `tint` is measured: the orbital
 * elements are JPL's mean elements (ssd.jpl.nasa.gov/sats/elem), the diameters
 * and albedos the tabulated ones.
 */
export type SatelliteDef = {
  /** Element id, dev label, and the key its geometry is published under. */
  id: string;
  /** Which texture the globe shader wears for it. */
  kind: GlobeKind;
  parent: ParentName;
  /** Mean diameter (km). */
  d: number;
  /** Semi-major axis (km) about its planet. */
  a: number;
  e: number;
  /** Inclination (deg) to the planet's equator/Laplace plane. Past 90° is
   * RETROGRADE, and Triton is the one that is. */
  inc: number;
  /** Sidereal period (days). */
  days: number;
  /** Geometric albedo — how much sunlight it throws back. */
  albedo: number;
  /** The colour it is, for the frames where it is too small for a globe and is
   * drawn as a point of light instead. */
  tint: readonly [number, number, number];
  /** Mean longitude at epoch (deg). THE ONE INVENTED NUMBER ON THE ROW: the
   * elements above are tabulated, but a satellite's phase at J2000 is not
   * something anybody can check against a title screen, and spreading them
   * keeps a system from starting as a straight line. */
  l0: number;
};

export const SATELLITES: readonly SatelliteDef[] = [
  // --- MARS: two captured asteroids, and the fastest moon in the system. ---
  // Phobos goes round in seven and a half hours — three times a Martian day —
  // so it rises in the WEST, crosses the sky and sets in the east, twice a day.
  {
    id: "phobos",
    kind: "phobos",
    parent: "mars",
    d: 22.2,
    a: 9375,
    e: 0.015,
    inc: 1.1,
    days: 0.3187,
    albedo: 0.071,
    tint: [104, 94, 84],
    l0: 20,
  },
  {
    id: "deimos",
    kind: "deimos",
    parent: "mars",
    d: 12.5,
    a: 23457,
    e: 0.0,
    inc: 1.8,
    days: 1.2625,
    albedo: 0.068,
    tint: [112, 100, 88],
    l0: 200,
  },

  // --- JUPITER: the four Galileo turned his glass on in January 1610, and ---
  // the reason we know the Earth is not the centre of anything. Their periods
  // lock 1:2:4 — Io laps Europa exactly twice and Ganymede exactly four times —
  // which is why all three can never be on the same side at once.
  {
    id: "io",
    kind: "io",
    parent: "jupiter",
    d: 3643.2,
    a: 421800,
    e: 0.004,
    inc: 0.0,
    days: 1.763,
    albedo: 0.62,
    tint: [238, 222, 150],
    l0: 0,
  },
  {
    id: "europa",
    kind: "europa",
    parent: "jupiter",
    d: 3121.6,
    a: 671100,
    e: 0.009,
    inc: 0.5,
    days: 3.525,
    albedo: 0.68,
    tint: [244, 240, 230],
    l0: 130,
  },
  {
    id: "ganymede",
    kind: "ganymede",
    parent: "jupiter",
    // The largest moon in the solar system — bigger than Mercury, and the only
    // one anywhere with a magnetic field of its own.
    d: 5268.2,
    a: 1070400,
    e: 0.001,
    inc: 0.2,
    days: 7.156,
    albedo: 0.44,
    tint: [186, 180, 172],
    l0: 250,
  },
  {
    id: "callisto",
    kind: "callisto",
    parent: "jupiter",
    d: 4820.6,
    a: 1882700,
    e: 0.007,
    inc: 0.3,
    days: 16.69,
    albedo: 0.19,
    tint: [140, 128, 114],
    l0: 60,
  },

  // --- SATURN: seven, and no two alike. --------------------------------------
  {
    id: "mimas",
    kind: "mimas",
    parent: "saturn",
    d: 395.0,
    a: 186000,
    e: 0.02,
    inc: 1.6,
    days: 0.942,
    albedo: 0.52,
    tint: [214, 214, 218],
    l0: 15,
  },
  {
    id: "enceladus",
    kind: "enceladus",
    parent: "saturn",
    // The brightest surface in the solar system: fresh snow, resurfaced by the
    // plumes it vents from its south pole into Saturn's E ring.
    d: 504.2,
    a: 238400,
    e: 0.005,
    inc: 0.0,
    days: 1.37,
    albedo: 0.96,
    tint: [246, 248, 252],
    l0: 145,
  },
  {
    id: "tethys",
    kind: "tethys",
    parent: "saturn",
    d: 1062.0,
    a: 295000,
    e: 0.001,
    inc: 1.1,
    days: 1.888,
    albedo: 0.78,
    tint: [230, 228, 224],
    l0: 275,
  },
  {
    id: "dione",
    kind: "dione",
    parent: "saturn",
    d: 1122.8,
    a: 377700,
    e: 0.002,
    inc: 0.0,
    days: 2.737,
    albedo: 0.65,
    tint: [222, 220, 216],
    l0: 40,
  },
  {
    id: "rhea",
    kind: "rhea",
    parent: "saturn",
    d: 1528.1,
    a: 527200,
    e: 0.001,
    inc: 0.3,
    days: 4.518,
    albedo: 0.65,
    tint: [218, 216, 212],
    l0: 190,
  },
  {
    id: "titan",
    kind: "titan",
    parent: "saturn",
    // The only moon with a real atmosphere, and the only place but Earth with
    // standing liquid on its surface. Bigger than Mercury.
    d: 5149.5,
    a: 1221900,
    e: 0.029,
    inc: 0.3,
    days: 15.945,
    albedo: 0.2,
    tint: [222, 168, 96],
    l0: 310,
  },
  {
    id: "iapetus",
    kind: "iapetus",
    parent: "saturn",
    // One face darker than coal, the other clean ice. Cassini found it in 1671
    // by noticing he could only see the moon on one side of Saturn.
    d: 1471.2,
    a: 3561700,
    e: 0.028,
    inc: 7.6,
    days: 79.331,
    albedo: 0.3,
    tint: [186, 180, 170],
    l0: 95,
  },

  // --- URANUS: five, seen once, by one spacecraft, in 1986. -----------------
  // They ride their planet's equator, and their planet is tipped 82°, so this
  // whole system faces the sun like a target rather than lying edge-on.
  {
    id: "miranda",
    kind: "miranda",
    parent: "uranus",
    d: 471.6,
    a: 129846,
    e: 0.001,
    inc: 4.4,
    days: 1.413,
    albedo: 0.32,
    tint: [196, 194, 192],
    l0: 25,
  },
  {
    id: "ariel",
    kind: "ariel",
    parent: "uranus",
    d: 1157.8,
    a: 190929,
    e: 0.001,
    inc: 0.0,
    days: 2.52,
    albedo: 0.39,
    tint: [210, 210, 212],
    l0: 165,
  },
  {
    id: "umbriel",
    kind: "umbriel",
    parent: "uranus",
    d: 1169.4,
    a: 265986,
    e: 0.004,
    inc: 0.1,
    days: 4.144,
    albedo: 0.21,
    tint: [130, 128, 128],
    l0: 290,
  },
  {
    id: "titania",
    kind: "titania",
    parent: "uranus",
    d: 1576.8,
    a: 436298,
    e: 0.002,
    inc: 0.1,
    days: 8.706,
    albedo: 0.27,
    tint: [176, 170, 164],
    l0: 80,
  },
  {
    id: "oberon",
    kind: "oberon",
    parent: "uranus",
    d: 1522.8,
    a: 583511,
    e: 0.002,
    inc: 0.1,
    days: 13.463,
    albedo: 0.23,
    tint: [168, 158, 148],
    l0: 220,
  },

  // --- NEPTUNE: a captured world, and the rubble that survived the capture. --
  {
    id: "proteus",
    kind: "proteus",
    parent: "neptune",
    d: 420,
    a: 117600,
    e: 0.0,
    inc: 0.0,
    days: 1.122,
    albedo: 0.096,
    tint: [92, 90, 90],
    l0: 55,
  },
  {
    id: "triton",
    kind: "triton",
    parent: "neptune",
    // 157° to Neptune's equator: the only large moon in the solar system going
    // round its planet BACKWARDS, which is how we know Neptune caught it rather
    // than grew it. The inclination is all this file needs to say — the orbit
    // solver turns it retrograde on its own.
    d: 2706.8,
    a: 354800,
    e: 0.0,
    inc: 157.3,
    days: 5.877,
    albedo: 0.76,
    tint: [238, 224, 214],
    l0: 135,
  },
];

/**
 * ONE CLOCK FOR EVERY SATELLITE IN THE SKY: milliseconds of screen time per day
 * of real time. Because it is one number, every period ratio in the catalogue
 * above survives intact — Io really does lap Callisto nine and a half times,
 * Phobos really does go round Mars four times while Deimos goes round once, and
 * the Galilean resonance really is 1:2:4 on screen.
 *
 * It is anchored on the FASTEST body rather than a favourite one: Phobos, at
 * 7.6 hours, is the quickest orbit in the solar system, and at this rate it
 * takes about 4.5 s — fast, which it should be, but not a strobe. Everything
 * slower follows: Io 25 s, Titan 3¾ minutes, Iapetus nearly 19, which is what
 * being 3.5 million kilometres out actually buys you.
 *
 * It is NOT the planets' clock (`EARTH_PERIOD_MS`, where a year is 64 s), and
 * it cannot be: on that clock Io's orbit would last a third of a second. That
 * is the same compromise the sky already makes between orbits and spins — each
 * clock exact within itself, only the ratio between them invented.
 */
export const SAT_MS_PER_DAY = 6_000;

/**
 * How far out a satellite system is drawn, in PLANET RADII: the band the whole
 * system is squeezed into, per planet.
 *
 * DISTANCE IS THE ONE LIE IN THIS SKY and satellites need it worse than
 * anything else. Io orbits at 5.9 Jupiter radii and Callisto at 26; drawn true
 * against a Jupiter this size, Callisto's orbit alone would be twice the width
 * of a phone screen, with a two-pixel moon somewhere on it. And the discs
 * cannot grow to compensate, because they are now exactly true (see `discOf`).
 *
 * So each system is mapped onto its band LOGARITHMICALLY, which is the one
 * compression that survives a 19:1 spread with the inner moons still separated:
 * order exact, spacing squeezed, and every gap still reads as a gap.
 *
 * The near edge is where it is for a physical reason in each case: far enough
 * out to clear the planet's own disc, and for SATURN far enough to clear the
 * RINGS as well — whose outer edge is 2.27 radii, and outside which Mimas
 * genuinely does orbit. Widen a band and check it against the neighbouring
 * planet's orbit in `title-sky.ts`; the two are one decision.
 */
const BANDS: Record<ParentName, [number, number]> = {
  mars: [1.5, 2.3],
  jupiter: [1.45, 2.5],
  saturn: [2.55, 3.45],
  uranus: [1.45, 2.4],
  neptune: [1.45, 2.4],
};

/** Below this many CSS pixels a satellite is drawn as a POINT OF LIGHT instead
 * of a shaded globe — see `isPoint`. Set where a terminator stops being
 * readable at all: under about four pixels a lit sphere and a lit dot are the
 * same handful of texels, and the globe is the one that costs a canvas. */
export const GLOBE_MIN_PX = 4;

/** How big a point of light is drawn, in CSS pixels. CONSTANT, and that is the
 * whole point of it: a point makes NO CLAIM about size. Phobos is 22 km across
 * and Ganymede is 5 268, and at this distance both are dots — what separates
 * them is how BRIGHT they are, which is exactly how the sky itself does it. */
export const POINT_PX = 2.4;

/**
 * A point's brightness, on a compressed magnitude scale.
 *
 * How much light a moon throws is its albedo times its area, so the real spread
 * across this catalogue is enormous: Ganymede outshines Deimos by fifteen
 * magnitudes, a factor of a million. Screens do not have a million to one, so
 * the scale is compressed — but compressed the way astronomy already compresses
 * brightness, LOGARITHMICALLY, so the ORDER is exactly right and only the range
 * is squeezed. Ganymede, Io, Europa, Titan and Triton come out bright; Mimas
 * and Miranda faint; Phobos and Deimos sit on the floor, where a body you would
 * need a telescope to split from its planet belongs.
 */
const MAG_RANGE = 12;
const MAG_FLOOR = 0.25;

function relLuminosity(s: SatelliteDef): number {
  return s.albedo * s.d * s.d;
}

const BRIGHTEST = Math.max(...SATELLITES.map(relLuminosity));

export function pointBrightness(s: SatelliteDef): number {
  const mag = -2.5 * Math.log10(relLuminosity(s) / BRIGHTEST);
  return Math.max(MAG_FLOOR, Math.min(1, 1 - mag / MAG_RANGE));
}

/** Every satellite's screen numbers, derived once per parent from the planet's
 * own drawn disc. */
export type SatelliteScreen = {
  def: SatelliteDef;
  /** Its disc, as a fraction of the viewport's short side — TRUE against its
   * planet's. */
  disc: number;
  /** Its orbit's semi-major axis, in the same units. */
  orbit: number;
  /** Its period on screen (ms), and — tidally locked — its spin. */
  ms: number;
  /** Its brightness as a point of light, 0..1. */
  lum: number;
};

/** A satellite's disc: the true ratio, times its planet's drawn disc. */
function discOf(s: SatelliteDef, parentDisc: number, parentKm: number): number {
  return parentDisc * (s.d / parentKm);
}

/** Map one system's true axes onto its band, logarithmically. */
function bandFor(s: SatelliteDef, parentDisc: number): number {
  const [near, far] = BANDS[s.parent];
  const family = SATELLITES.filter((o) => o.parent === s.parent);
  const lo = Math.min(...family.map((o) => o.a));
  const hi = Math.max(...family.map((o) => o.a));
  const t = hi > lo ? Math.log(s.a / lo) / Math.log(hi / lo) : 0;
  // The band is in PLANET RADII, and `parentDisc` is a diameter.
  return (parentDisc / 2) * (near + (far - near) * t);
}

/**
 * Work out every satellite's screen geometry from the planets' drawn discs.
 * Called once at start-up and again whenever the disc table changes — never per
 * frame, since none of it moves.
 */
export function layoutSatellites(
  parentDisc: Record<ParentName, number>,
  parentKm: Record<ParentName, number>,
): SatelliteScreen[] {
  return SATELLITES.map((def) => ({
    def,
    disc: discOf(def, parentDisc[def.parent], parentKm[def.parent]),
    orbit: bandFor(def, parentDisc[def.parent]),
    ms: Math.round(def.days * SAT_MS_PER_DAY),
    lum: pointBrightness(def),
  }));
}

/** Is this body too small to be worth a globe at the size it is being drawn? */
export function isPoint(discPx: number): boolean {
  return discPx < GLOBE_MIN_PX;
}

// The equatorial bases, built once per planet — none of them moves, and they
// cost a dozen trig calls each.
const BASES = new Map<ParentName, ReturnType<typeof equatorBasis>>();

function basisOf(parent: ParentName): ReturnType<typeof equatorBasis> {
  const hit = BASES.get(parent);
  if (hit) return hit;
  const made = equatorBasis(PLANET_POLES[parent as PoleName]);
  BASES.set(parent, made);
  return made;
}

/**
 * A satellite's offset from its planet, in the sky's world frame.
 *
 * The Kepler solve happens in the satellite's own reference plane — its
 * planet's EQUATOR — and the result is then re-based onto that plane's axes in
 * world coordinates. That single rebasing is what makes Uranus's five wheel
 * round a toppled planet and Jupiter's four hold a line, out of the same four
 * lines of code and no special case for either.
 */
export function satelliteOffset(s: SatelliteScreen, t: number): World {
  const local = orbitAt(
    t,
    s.ms,
    s.orbit,
    s.def.e,
    s.def.inc,
    // A satellite's node and perihelion precess fast and are quoted against a
    // plane that is itself moving; at this scale neither is visible, so the
    // orbit is drawn from its epoch longitude alone.
    0,
    0,
    s.def.l0,
  );
  const { north, east, front } = basisOf(s.def.parent);
  // `orbitAt` hands back y along the plane's north and (x, z) in the plane.
  return {
    x: local.x * east[0] + local.z * front[0] + local.y * north[0],
    y: local.x * east[1] + local.z * front[1] + local.y * north[1],
    z: local.x * east[2] + local.z * front[2] + local.y * north[2],
  };
}
