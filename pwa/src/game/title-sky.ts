// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The main-menu sky: the solar system, turning.
//
// The sun sits still at the centre and all eight planets wheel around it IN
// ONE PLANE — the ecliptic — because that is how the real system is built: it
// condensed out of a single spinning disc, and four and a half billion years
// later the planets still ride within a few degrees of that disc. Each one
// keeps its own true inclination to it (Mercury's 7.0° is the outlier;
// Neptune's is 1.8°), so the plane reads as a plane rather than a drawn line.
//
// Everything else is the real numbers too:
//
//   • REAL ORBITAL ELEMENTS at J2000 — semi-major axis, eccentricity,
//     inclination, ascending node, perihelion and mean longitude. Kepler's
//     equation is solved each frame, so the orbits are genuine ellipses with
//     the sun at a FOCUS and each planet runs fastest at perihelion.
//   • REAL AXIAL TILTS, held fixed in space as a planet goes round — which is
//     what gives Earth its seasons and Uranus its rolled-over pole, and both
//     fall out of the geometry here rather than being drawn on.
//   • REAL SURFACES: every body wears its own geography (planet-maps.ts),
//     lit per pixel by a software globe shader (planet-globe.ts) from the
//     sun's actual 3D direction, so the terminator lands where the geometry
//     puts it in any viewport orientation.
//
// TWO THINGS ARE DELIBERATELY NOT TO SCALE, and both have to be:
//
//   • DISTANCE. An honest solar system is almost entirely empty — at Earth's
//     orbit drawn 0.46 of a screen wide, Neptune's would be thirteen screens
//     out and the inner four would be a smudge on the sun. The radii below are
//     hand-compressed to fit one frame, generously out to Mars (the inner
//     system is the picture) and hard beyond it.
//   • TIME, once — see SCREEN_KEPLER. Everything else follows from the
//     compressed radii rather than being invented.
//
// The frame stays sized to the INNER system, so the giants spend most of their
// orbits off the edge of it and swing into view around superior conjunction,
// small and dim, on their way behind the sun. That is the intended sight of
// them: distant, and rarely.
//
// Everything is set as inline styles / CSS custom properties each frame; the
// stylesheet supplies only the static look and a resting layout for when the
// driver never starts (prefers-reduced-motion).

import { clamp, clamp01 } from "@game/lib/vec.ts";
import type {
  GlobeKind,
  GlobeLight,
  PlanetGlobe,
} from "@ui/lib/planet-globe.ts";

/** Device pixel ratio, capped: the software globe shader renders one buffer
 * pixel per device pixel up to this, then upscales (which softens nicely). */
function globeDpr(): number {
  return Math.min(2, window.devicePixelRatio || 1);
}

type Vec = { x: number; y: number };

type SkyState = {
  p: number;
  phase: number;
  sun: Vec;
  moon: Vec;
  earth?: Vec;
  mars?: Vec;
  sunUp: boolean;
  /** Per-body geometry for the dev harness: screen centre, on-screen scale,
   * depth, and the unit vector toward the sun in view space (x right, y DOWN,
   * z toward the camera) that the globe was lit with. The harness checks the
   * light against the screen geometry, which is the one law the whole effect
   * has to obey. */
  bodies?: Record<
    string,
    {
      x: number;
      y: number;
      scale: number;
      far: number;
      lx: number;
      ly: number;
      lz: number;
    }
  >;
};

declare global {
  interface Window {
    /** Test hook: pin the effect to a fixed progress instead of the clock. */
    __skyFreeze?: number;
    /** Live geometry the verification harness reads back. */
    __skyState?: SkyState;
    /** Dev hook: label each orbiting body with a number/letter and drop its
     * terminator, to calibrate orbit sizes and depth against plain circles. */
    __skyLabels?: boolean;
  }
}

function prefersReducedMotion(): boolean {
  return !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export type SkyElements = {
  sun: HTMLElement;
  glare: HTMLElement;
  mercury: HTMLElement;
  venus: HTMLElement;
  earth: HTMLElement;
  mars: HTMLElement;
  jupiter: HTMLElement;
  saturn: HTMLElement;
  uranus: HTMLElement;
  neptune: HTMLElement;
  moon: HTMLElement;
  /** Backdrop asteroids, driven on a 3D fly-through toward the camera. */
  asteroids: HTMLElement[];
};

// The sun's fixed seat, in fractions of the viewport. Held in the upper sky so
// the inner orbits ride above the centred menu. It NEVER moves, which is what
// lets the stylesheet park the sun's detonation overlay (`.sun-boom`) and its
// reduced-motion resting spot on the same fractions without the driver writing
// a live position anywhere — keep the two in step.
const SUN_X = 0.5;
const SUN_Y = 0.32;

/** One unhurried master loop. A frozen progress maps 0..1 onto 0..CYCLE_MS of
 * orbital time, so a pinned frame reproduces the same geometry. */
const CYCLE_MS = 240_000;

/** Earth's revolution time on screen — the anchor for the whole system. */
const EARTH_PERIOD_MS = 64_000;

const DEG = Math.PI / 180;

/**
 * How far the camera sits above the ecliptic. Small, because the viewpoint is
 * very nearly IN the plane — which is also what lets the outer planets, whose
 * orbits are far wider than the frame, come back into it near conjunction
 * instead of riding off the top of the screen. It is handed to every globe as
 * well, because the axial tilts have to lean against the same plane the orbits
 * are projected onto.
 *
 * It is a BUDGET as much as an angle: a body at superior conjunction sits
 * r·sin(pitch) above the sun on screen, and the sun's seat leaves only 0.32 of
 * the short side above it, so the pitch and the outermost SCREEN_R below have
 * to be chosen together or Neptune's conjunction — now the only half of its
 * orbit we ever see, see CAM_R — happens off the top of the frame.
 */
const ECLIPTIC_PITCH = 14 * DEG;

/**
 * WHERE THE CAMERA STANDS, as an orbital radius in the same short-side units as
 * SCREEN_R: parked in the gap between Mars and Jupiter. That one number sorts
 * the system into two kinds of world and is the reason the giants behave:
 *
 *   • INSIDE it — Mercury, Venus, Earth, Mars and the Moon — are inferior
 *     worlds from here. They show every phase, swing round in front of the sun,
 *     and transit it. That is the inner system, and it is the picture.
 *   • OUTSIDE it — Jupiter, Saturn, Uranus, Neptune — are superior worlds and
 *     can NEVER come round the front, because the half of the orbit that would
 *     do it is behind the viewer. Each one rises into the frame from the side,
 *     runs in toward the star, crosses BEHIND it at conjunction, comes out the
 *     far side and then slips away over our shoulder.
 *
 * That is the correct sight of them, and it is also what stopped them looking
 * broken. Passing in front, a giant is at NEW phase and at its largest — the
 * near leg of the loop parked a screen-filling black Saturn over the middle of
 * the menu for a third of the cycle, crossing whatever else was down there.
 * Behind the sun it is at its smallest and FULLY LIT, which is the one moment a
 * distant world is worth looking at.
 */
const CAM_R = 0.7;

/**
 * How far into its hidden half a superior world takes to go — as a fraction of
 * the way from the sun's own plane (0) to the point directly behind the viewer
 * (1). It leaves in TWO stages over that band, and the order is the whole
 * trick:
 *
 *   1. it goes DARK, on the shader's exposure, the same knob distance already
 *      uses — which is what a world turning its night side to us does anyway;
 *   2. only then, from GONE_AT onward, does its alpha come off.
 *
 * So the one fade in this file is spent on a disc that is already black. Fade
 * it while it is still lit and it ghosts — the starfield and whatever it is
 * passing show through a solid planet, which is the artefact the rest of this
 * file exists to avoid. Dim it all the way to nothing instead and it ends as a
 * black hole sliding over the stars. Doing both, in that order, is invisible.
 */
const PAST_FADE = 0.55;

/** Where in that band the alpha starts to come off — see PAST_FADE. */
const GONE_AT = 0.55;

/** A slight roll of the whole plane, so the system sits at an angle across the
 * frame rather than lying on a ruled horizontal line. */
const ECLIPTIC_ROLL = -0.12;

/**
 * SCREEN KEPLER. The distances above are compressed, so the true periods would
 * no longer belong to them — a Neptune on a Mars-ish orbit taking 165 years is
 * not a slow planet, it is a broken one. Instead the periods are re-derived
 * from the COMPRESSED radii by Kepler's own third law (T² ∝ a³), which keeps
 * the orrery internally consistent: the inner worlds still race, the outer
 * ones still crawl, and the ratios stay within about a tenth of the real ones
 * across the inner system (Mercury's true 0.241 of an Earth year comes out
 * 0.287 here). Within a single orbit the speed variation is the real thing —
 * that comes from the eccentricity, not from this.
 */
function screenPeriodMs(rScreen: number, rEarth: number): number {
  return Math.round(EARTH_PERIOD_MS * Math.pow(rScreen / rEarth, 1.5));
}

/** Earth's on-screen day (one rotation). Every other world's spin scales from
 * it by the world's true sidereal rotation period. */
const EARTH_SPIN_MS = 22_000;
const EARTH_ROT_DAYS = 0.99727;

/**
 * On-screen rotation time (ms, signed — negative is retrograde) for a body
 * turning once every `days` Earth days. One scale for every world, so the
 * RATIOS are exactly the real ones: Jupiter's ten-hour day really does come
 * out 2.4× faster than Earth's here, Mars's is a whisker slower, and Venus
 * takes an hour and a half to turn once because Venus takes 243 days to turn
 * once. Nothing is capped — a cap is what would break the comparison, and the
 * two worlds it would have "helped" are the two whose whole character is that
 * they barely move.
 *
 * THE ONE HONEST COMPROMISE IN THE WHOLE SKY: spins and orbits run on
 * DIFFERENT clocks. They have to. A year here is 64 s, so a faithful day would
 * be 0.175 s and every world would strobe; a day here is 22 s, so a faithful
 * year would be over two hours. Each clock is internally exact — every spin is
 * right against every other spin, every orbit right against every other orbit
 * — and only the ratio BETWEEN the two clocks is invented.
 */
function spinMs(days: number): number {
  return Math.round((days / EARTH_ROT_DAYS) * EARTH_SPIN_MS);
}

/** How hard depth swings a body's on-screen size: scale = 1 − DEPTH·far, with
 * far ∈ [−1 (near), +1 (behind the sun)]. Near swells, far shrinks. Kept
 * modest: the giants ride orbits two and three times Earth's, so a big swing
 * has Saturn filling half a phone screen on the near leg of its loop. */
const DEPTH = 0.3;

/**
 * How far depth DIMS a body at the back of its loop — and dims is the whole
 * word. It is handed to the globe shader as an exposure, so a distant world
 * goes dark; it is NOT element opacity, because a planet is an opaque body and
 * a fade lets the starfield, the glare and whatever is behind it show straight
 * through a solid world. (That is the artefact this replaced: every body on the
 * title screen was see-through, worst on the near leg of a loop where a
 * phase-driven fade took Saturn down to a quarter alpha and it read as a ghost
 * laid over Jupiter rather than a planet in front of one.)
 */
const DEPTH_FADE = 0.32;

/**
 * The sun's own z-index in the sky band; planets straddle it by depth so the
 * far ones tuck behind and the near ones ride in front. Must stay below the
 * menu content (see .title-content z-index in styles.css).
 *
 * THE BAND IS DELIBERATELY COARSE-FREE. z-index is an integer, so the depth
 * band has to be wide enough that two bodies overlapping on screen never round
 * to the SAME index — with the old 1..11 band a tenth of a screen of depth
 * separated nothing, ties fell back to DOM order, and a farther world could
 * draw over a nearer one. Nothing noticed while the discs were translucent;
 * everything notices now that they are solid.
 */
const SUN_Z = 500;

/** Half-width of the planets' z band around the sun. */
const Z_SPREAD = 350;

/**
 * One world. The orbital elements are the standard J2000 set; `r` is the only
 * invented number on the row, and `au` is kept beside it so the compression is
 * visible at a glance rather than hidden.
 */
type Planet = {
  el: HTMLElement;
  label: string;
  kind: GlobeKind;
  /** True semi-major axis (AU) — documentation for the row below it. */
  au: number;
  /** Screen semi-major axis, as a fraction of the viewport's short side. */
  r: number;
  /** Orbital eccentricity: the real one, so the ellipse and the speed-up at
   * perihelion are real even though the size is not. */
  e: number;
  /** Inclination to the ecliptic (deg). */
  inc: number;
  /** Longitude of the ascending node (deg). */
  node: number;
  /** Longitude of perihelion (deg). */
  peri: number;
  /** Mean longitude at J2000 (deg) — so the system starts in the arrangement
   * the sky actually had on 1 January 2000, rather than a made-up fan. */
  l0: number;
  /** Rest diameter at zero depth, as a fraction of the short side. */
  base: number;
  /** Sidereal rotation period in Earth days, signed (negative = retrograde). */
  rotDays: number;
  /** The cloud deck's own circulation period in Earth days, where the world
   * has weather that moves independently of the ground beneath it. */
  cloudDays?: number;
  /** The soft glow around the body: [r, g, b, blur px, peak alpha]. It is
   * SCATTERED SUNLIGHT, so it is scaled each frame by how much of the lit face
   * is turned toward us — a halo of constant strength around a planet showing
   * its night side draws a bright ring around a black disc, which is the
   * artefact this replaced. Undefined for an airless body, which must have no
   * halo at all: a glow around a world with no atmosphere is a claim about its
   * physics that isn't true. */
  halo?: readonly [number, number, number, number, number];
  /** True for the Moon: its ellipse is drawn about the EARTH, not the sun. */
  satellite?: boolean;
  // Filled in on start, from the fields above.
  /** Orbital period on screen (ms). */
  ms?: number;
  /** Rotation period on screen (ms, signed). */
  spin?: number;
  /** Cloud-deck circulation period on screen (ms, signed), if it has one. */
  cloudMs?: number;
  globe?: PlanetGlobe;
};

/**
 * TRUE EQUATORIAL DIAMETERS (km). The on-screen size of every body is derived
 * from these, so the worlds read correctly AGAINST EACH OTHER — Jupiter the
 * giant, Saturn just behind it, the two ice giants clearly above Earth,
 * Mercury below Mars, the Moon smallest of all.
 */
const DIAMETER_KM = {
  mercury: 4879,
  venus: 12104,
  earth: 12756,
  moon: 3475,
  mars: 6792,
  jupiter: 142984,
  saturn: 120536,
  uranus: 51118,
  neptune: 49528,
} as const;

/** Earth's disc, as a fraction of the viewport's short side — the anchor every
 * other body is sized from. Big enough that its coastlines read on a phone. */
const EARTH_DISC = 0.085;

/**
 * A LINEAR size scale is impossible and it is worth being exact about why:
 * Jupiter is 11.2 Earths across and Mercury is 0.38, a 29:1 spread. Anchor
 * Earth where its geography is legible and Jupiter is 350 px wide; anchor
 * Jupiter where it fits the frame and Earth is a 5-px dot with no map on it.
 *
 * So the ratios are compressed by a power law — every size is
 * (diameter / Earth's) ^ SIZE_POWER — which preserves the ORDER exactly and
 * squeezes the spread from 29:1 down to about 2.3:1. Jupiter reads 1.7 Earths
 * rather than 11.2 — still unmistakably the largest thing but the sun, with
 * Saturn just under it, both ice giants clearly above Earth, Venus its near
 * twin, then Mars, then Mercury, then the Moon.
 *
 * THE EXPONENT IS ALSO WHAT KEEPS THE ORBITS APART, which is why it is lower
 * than it first looks like it wants to be. A giant's disc is a fraction of the
 * screen and so is the gap to the next orbit out; push the discs up and the
 * outer four stop reading as four distances from the sun and start reading as
 * one crowded ring — Jupiter and Saturn ran with barely a tenth of a disc
 * between their orbits and crossed each other most of the cycle. Any change
 * here is a change to SCREEN_R below as well; the two are one decision.
 */
const SIZE_POWER = 0.22;

function discSize(kind: keyof typeof DIAMETER_KM): number {
  return (
    EARTH_DISC * Math.pow(DIAMETER_KM[kind] / DIAMETER_KM.earth, SIZE_POWER)
  );
}

/**
 * THE DISTANCE COMPRESSION, stated once. Out to Mars the screen radii are close to
 * proportional (Mars's true 1.52 AU lands at 1.39× Earth's screen orbit); past
 * it they are squeezed hard — Jupiter's true 5.2 AU would be 2.4 screens out —
 * so the giants sit just past the frame and sweep through it near conjunction.
 */
// EVERY GAP CLEARS THE TWO DISCS THAT HAVE TO FIT IN IT, and that is the rule
// the outer four are laid out by rather than by feel. Two worlds a screen-tenth
// apart in orbit but a screen-sixth wide are not on two orbits: they are one
// smear that crosses itself every few seconds, which is exactly what Jupiter
// and Saturn (0.86 and 0.98, discs 0.18 wide) used to be. So each gap below is
// at least the sum of its two neighbours' RADII with room to spare — check any
// change here against `discSize` above, because the two tables are one
// decision.
//
// The outer four still sit close behind Mars, and that part IS a framing
// constraint: a body at superior conjunction sits r·sin(pitch) above the sun on
// screen, so every step outward costs headroom at the top of a landscape phone
// — and conjunction is now the ONLY time a giant crosses the middle of the
// frame at all (CAM_R above), so the headroom has to be there. Spacing them
// properly is paid for by the smaller discs above, not by pushing Neptune out
// of the frame.
//
// THE ROW MARS SITS ON IS THE OTHER LOAD-BEARING ONE: it is the last radius
// inside CAM_R, which is what makes Mars the outermost world that can still
// come round in front of the sun. Moving Mars past 0.7, or the camera inside
// it, silently changes which half of the system transits.
const SCREEN_R = {
  mercury: 0.2,
  venus: 0.31,
  earth: 0.46,
  mars: 0.64,
  jupiter: 0.77,
  saturn: 0.92,
  uranus: 1.05,
  neptune: 1.18,
} as const;

function planetTable(els: SkyElements): Planet[] {
  return [
    {
      el: els.mercury,
      label: "1",
      kind: "mercury",
      au: 0.3871,
      r: SCREEN_R.mercury,
      e: 0.20563,
      inc: 7.005,
      node: 48.331,
      peri: 77.456,
      l0: 252.251,
      base: discSize("mercury"),
      rotDays: 58.646,
      // Airless: no halo, and the globe draws no limb haze either.
    },
    {
      el: els.venus,
      label: "2",
      kind: "venus",
      au: 0.72333,
      r: SCREEN_R.venus,
      e: 0.00677,
      inc: 3.395,
      node: 76.68,
      peri: 131.564,
      l0: 181.98,
      base: discSize("venus"),
      // 243 days, backwards — the slowest rotation of any planet, and the only
      // retrograde one among the inner four.
      rotDays: -243.025,
      // …under a cloud deck that laps the planet every FOUR days, sixty times
      // faster than the ground it hides. Super-rotation: nobody is quite sure
      // what drives it. Retrograde, with the surface.
      cloudDays: -4,
      halo: [235, 205, 150, 12, 0.3],
    },
    {
      el: els.earth,
      label: "3",
      kind: "earth",
      au: 1,
      r: SCREEN_R.earth,
      e: 0.01671,
      inc: 0,
      node: 0,
      peri: 102.947,
      l0: 100.464,
      base: discSize("earth"),
      rotDays: 0.99727,
      // Weather runs a little ahead of the ground — the jet streams, drawn out
      // here from a few per cent to something the eye can catch in a minute.
      cloudDays: 0.845,
      halo: [120, 170, 235, 26, 0.32],
    },
    {
      el: els.mars,
      label: "4",
      kind: "mars",
      au: 1.52371,
      r: SCREEN_R.mars,
      e: 0.09339,
      inc: 1.85,
      node: 49.558,
      peri: 336.041,
      l0: 355.453,
      base: discSize("mars"),
      rotDays: 1.02595,
      halo: [235, 140, 90, 18, 0.26],
    },
    {
      el: els.jupiter,
      label: "5",
      kind: "jupiter",
      au: 5.20288,
      r: SCREEN_R.jupiter,
      e: 0.04839,
      inc: 1.304,
      node: 100.474,
      peri: 14.728,
      l0: 34.396,
      base: discSize("jupiter"),
      // Ten hours: the fastest day in the solar system, on the largest planet.
      rotDays: 0.41354,
      halo: [235, 205, 170, 14, 0.22],
    },
    {
      el: els.saturn,
      label: "6",
      kind: "saturn",
      au: 9.53667,
      r: SCREEN_R.saturn,
      e: 0.05386,
      inc: 2.486,
      node: 113.666,
      peri: 92.599,
      l0: 49.954,
      base: discSize("saturn"),
      rotDays: 0.44401,
      // No halo: the rings ARE Saturn's outline, and a glow behind them only
      // fogs the Cassini division.
    },
    {
      el: els.uranus,
      label: "7",
      kind: "uranus",
      au: 19.18916,
      r: SCREEN_R.uranus,
      e: 0.04726,
      inc: 0.773,
      node: 74.006,
      peri: 170.954,
      l0: 313.238,
      base: discSize("uranus"),
      // Tipped 98°, so it rolls along its orbit on its side — and turns
      // backwards while it does.
      rotDays: -0.71833,
      halo: [190, 225, 225, 10, 0.22],
    },
    {
      el: els.neptune,
      label: "8",
      kind: "neptune",
      au: 30.06992,
      r: SCREEN_R.neptune,
      e: 0.00859,
      inc: 1.77,
      node: 131.784,
      peri: 44.964,
      l0: 304.88,
      base: discSize("neptune"),
      rotDays: 0.67125,
      halo: [150, 190, 220, 10, 0.22],
    },
  ];
}

/** The Moon, orbiting the EARTH. Its true month is so short next to Earth's
 * year that a strict ratio whips it round every ~5 s — a blur — so its period
 * is eased for watchability, the one place proportion yields to feel. It still
 * laps the Earth several times per Earth orbit, reading as a fast satellite
 * rather than a planet. Airless, so no halo and no limb haze. */
function moonBody(el: HTMLElement): Planet {
  return {
    el,
    label: "M",
    kind: "moon",
    au: 0.00257,
    /** Screen radius about the Earth (fraction of the short side). */
    r: 0.1,
    e: 0.0549,
    /** 5.14° to the ecliptic — which is why eclipses are rare rather than
     * monthly: most months the Moon passes above or below the sun. */
    inc: 5.145,
    node: 125.08,
    peri: 83.23,
    l0: 218.32,
    base: discSize("moon"),
    /** Tidally locked: one rotation per orbit, so it keeps one face to the
     * Earth. Set from the orbital period below. */
    rotDays: 0,
    satellite: true,
    ms: 11_500,
  };
}

/**
 * Solve Kepler's equation M = E − e·sin E for the eccentric anomaly, by
 * Newton's method. Three iterations is plenty at these eccentricities (the
 * worst is Mercury's 0.21) and it is the whole reason the planets sweep equal
 * areas in equal times rather than sliding round at a constant rate.
 */
function eccentricAnomaly(m: number, e: number): number {
  let ecc = m;
  for (let i = 0; i < 3; i++) {
    ecc -= (ecc - e * Math.sin(ecc) - m) / (1 - e * Math.cos(ecc));
  }
  return ecc;
}

/** A body's heliocentric position, in the ecliptic frame: x in the plane,
 * y toward ecliptic north, z in the plane toward the camera's side. */
type World = { x: number; y: number; z: number };

/**
 * Where is this body, in its own orbit, at time `t`? Standard Keplerian
 * elements → heliocentric ecliptic coordinates, with `a` in whatever unit the
 * caller wants back (here: fractions of the viewport's short side).
 */
function orbitAt(
  t: number,
  ms: number,
  a: number,
  e: number,
  incDeg: number,
  nodeDeg: number,
  periDeg: number,
  l0Deg: number,
): World {
  const node = nodeDeg * DEG;
  const peri = periDeg * DEG;
  const inc = incDeg * DEG;
  // Mean anomaly: the mean longitude advances uniformly; perihelion does not.
  const mean = (l0Deg * DEG + (2 * Math.PI * t) / ms - peri) % (2 * Math.PI);
  const ecc = eccentricAnomaly(mean, e);
  // In the orbital plane, with the SUN AT A FOCUS — not at the centre.
  const xo = a * (Math.cos(ecc) - e);
  const yo = a * Math.sqrt(1 - e * e) * Math.sin(ecc);
  // Rotate by the argument of perihelion, the inclination, and the node.
  const w = peri - node;
  const cw = Math.cos(w);
  const sw = Math.sin(w);
  const cn = Math.cos(node);
  const sn = Math.sin(node);
  const ci = Math.cos(inc);
  const si = Math.sin(inc);
  const ex = xo * (cw * cn - sw * sn * ci) - yo * (sw * cn + cw * sn * ci);
  const ey = xo * (cw * sn + sw * cn * ci) + yo * (cw * cn * ci - sw * sn);
  const ez = xo * sw * si + yo * cw * si;
  // The ecliptic's own plane is (ex, ey); ez is ecliptic north. Map onto the
  // renderer's world frame: y is north, z lies in the plane toward the camera.
  return { x: ex, y: ez, z: ey };
}

/** The camera: look down on the ecliptic by ECLIPTIC_PITCH, then roll the whole
 * picture. Orthographic, so the projected x/y ARE the screen offsets (in short-
 * side units) and z is depth toward the camera. */
function project(p: World): { x: number; y: number; depth: number } {
  const sp = Math.sin(ECLIPTIC_PITCH);
  const cp = Math.cos(ECLIPTIC_PITCH);
  const x = p.x;
  // Screen y is DOWN, so the far half of the plane rides above the sun.
  const y = p.z * sp - p.y * cp;
  const depth = p.y * sp + p.z * cp;
  const cr = Math.cos(ECLIPTIC_ROLL);
  const sr = Math.sin(ECLIPTIC_ROLL);
  return { x: x * cr - y * sr, y: x * sr + y * cr, depth };
}

/** Map a body's depth to a z-index straddling the sun, so the back half of
 * every orbit tucks behind the sun and the front half rides over it. */
function depthZ(depth: number): number {
  return Math.round(
    clamp(SUN_Z + depth * 250, SUN_Z - Z_SPREAD, SUN_Z + Z_SPREAD),
  );
}

/**
 * Start the orbital sky driver. Returns a stop function that cancels the loop
 * and clears the inline styles it set. Honours prefers-reduced-motion by not
 * starting at all (the stylesheet then rests on plain, statically-placed
 * planets).
 */
export function startTitleSky(els: SkyElements): () => void {
  if (prefersReducedMotion()) return () => {};

  const { sun, glare, earth, moon, asteroids } = els;
  let raf = 0;

  const planets = planetTable(els);
  for (const p of planets) {
    p.ms = screenPeriodMs(p.r, SCREEN_R.earth);
    p.spin = spinMs(p.rotDays);
    if (p.cloudDays) p.cloudMs = spinMs(p.cloudDays);
  }
  const moonOrbit = moonBody(moon);
  // Tidal lock: the rotation IS the orbit.
  moonOrbit.spin = moonOrbit.ms;

  // Give every body a real, textured, rotating globe: a canvas child that the
  // shader (planet-globe.ts) paints each frame.
  //
  // THE SHADER AND ITS GEOGRAPHY ARE LOADED LAZILY, and that is a budget
  // decision rather than a style one: the title screen is the app's critical
  // path (170 KB gzipped — see pwa/scripts/check-seo.mjs), and the world maps
  // are ~11 KB of it. Nothing is lost by waiting, because the bodies already
  // have a resting look — the flat CSS gradient the stylesheet gives them, and
  // the same one prefers-reduced-motion never leaves — so the sky is correct
  // from the first frame and simply gains its globes a moment later.
  //
  // Then they are built ONE PER FRAME rather than nine at once, because
  // building one BAKES its surface texture and that costs tens of
  // milliseconds: the difference between a hitch on the way into the menu and
  // no hitch at all. (The bakes are cached per world, so coming back to the
  // title screen is free.)
  const dpr = globeDpr();
  const pending: Planet[] = [...planets, moonOrbit];
  let Globe: typeof PlanetGlobe | undefined;
  let stopped = false;
  void import("@ui/lib/planet-globe.ts").then((m) => {
    if (!stopped) Globe = m.PlanetGlobe;
  });
  const attachGlobe = (o: Planet): void => {
    if (!Globe) return;
    const globe = new Globe(o.kind, ECLIPTIC_PITCH);
    const c = globe.canvas;
    c.className = "title-globe";
    c.setAttribute("aria-hidden", "true");
    o.el.appendChild(c);
    o.el.classList.add("has-globe");
    if (globe.padding > 1) o.el.classList.add("has-rings");
    o.globe = globe;
  };

  // Size a disc (base diameter × depth-scale, floored so a far speck never
  // vanishes to nothing) and centre it via width/height + left/top. Sizing by
  // box (not transform: scale) leaves the moon's transform free for its
  // detonation animation.
  const placeSized = (
    el: HTMLElement,
    cx: number,
    cy: number,
    d: number,
  ): void => {
    el.style.width = `${d}px`;
    el.style.height = `${d}px`;
    el.style.left = `${cx - d / 2}px`;
    el.style.top = `${cy - d / 2}px`;
  };

  const labelsOn = (): boolean => !!window.__skyLabels;

  const frame = (now: number) => {
    const frozen = window.__skyFreeze;
    const pinned = typeof frozen === "number" && Number.isFinite(frozen);
    const p = pinned ? clamp01(frozen as number) : (now % CYCLE_MS) / CYCLE_MS;
    // Orbital time: a pinned progress replays one master loop; otherwise the
    // clock spins the orbits freely (sin/cos are periodic, so no wrap needed).
    const t = pinned ? p * CYCLE_MS : now;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const u = Math.min(vw, vh);
    const labels = labelsOn();

    const sunCx = SUN_X * vw;
    const sunCy = SUN_Y * vh;
    const sunD = sun.offsetWidth;
    sun.style.left = `${sunCx - sunD / 2}px`;
    sun.style.top = `${sunCy - sun.offsetHeight / 2}px`;
    sun.style.opacity = "1";
    sun.style.zIndex = String(SUN_Z);

    // Warm glare wash, centred on the (static) sun.
    glare.style.opacity = "0.85";
    glare.style.setProperty("--glare-x", `${SUN_X * 100}%`);
    glare.style.setProperty("--glare-y", `${SUN_Y * 100}%`);

    const bodies: NonNullable<SkyState["bodies"]> = {};

    /**
     * Paint one body from its heliocentric position: place it, light it from
     * the sun's real 3D direction, scale and fade it by depth, and sort it
     * around the sun. Returns nothing — everything lands in the DOM.
     */
    const paint = (
      o: Planet,
      world: World,
      orbitR: number,
      extraScale = 1,
    ): { cx: number; cy: number; scale: number; far: number } => {
      const s = project(world);
      const cx = sunCx + s.x * u;
      const cy = sunCy + s.y * u;
      // Normalised depth: +1 is straight behind the sun, −1 nearest the camera.
      const far = clamp(-s.depth / Math.max(orbitR, 1e-6), -1, 1);
      const scale = (1 - DEPTH * far) * extraScale;
      // The whole box, rings included: a ringed world's canvas is wider than
      // its disc, and `base` is the DISC.
      const pad = o.globe?.padding ?? 1;
      const d = Math.max(6, o.base * u * scale * pad);

      // Has this world started round the front? Only a SUPERIOR one can be
      // hidden for it — inside CAM_R the whole loop is in view, which is why
      // Mars still swings round and transits and Jupiter never does. `past` is
      // how far into the hidden half it has gone: 0 as it draws level with the
      // sun, 1 at the point directly behind the viewer.
      const past = orbitR > CAM_R ? Math.max(0, -far) : 0;
      const leaving = clamp01(past / PAST_FADE);

      // Off-frame worlds cost nothing: the giants spend most of their orbits
      // outside the viewport and there is no reason to shade a sphere nobody
      // can see. (The margin keeps a body's halo from popping at the edge.)
      const m = d;
      if (leaving >= 1 || cx < -m || cy < -m || cx > vw + m || cy > vh + m) {
        o.el.style.display = "none";
        return { cx, cy, scale, far };
      }
      o.el.style.display = "";
      placeSized(o.el, cx, cy, d);

      // The unit vector from the body TOWARD the sun, in view space — the same
      // frame the globe's normals use. It comes straight out of the geometry
      // (the sun is at the origin), so the terminator needs no fudging.
      const len = Math.hypot(s.x, s.y, s.depth) || 1;
      const light: GlobeLight = {
        x: -s.x / len,
        y: -s.y / len,
        z: -s.depth / len,
      };

      // Depth is EXPOSURE, not alpha: the shader takes it and paints a darker
      // world, so the back of a loop dims into the sky without the sky showing
      // through it — and a superior world on its way round the front goes out
      // the same way, dark before it is gone.
      const dim =
        (1 - DEPTH_FADE * Math.max(0, far)) * Math.pow(1 - leaving, 1.6);
      if (o.globe && !labels) {
        o.globe.canvas.style.display = "";
        const spinTurns = t / (o.spin || EARTH_SPIN_MS);
        o.globe.render(
          d,
          light,
          spinTurns,
          dpr,
          o.cloudMs ? t / o.cloudMs : spinTurns,
          dim,
        );
      } else if (o.globe) {
        o.globe.canvas.style.display = "none";
      }
      // How much of the lit face is turned toward us: 1 at full, 0 at new.
      const lit = clamp01((1 + light.z) / 2);
      // The halo is scattered light, so it fades with the phase: full when the
      // lit face is toward us, gone at new.
      if (o.halo) {
        const [hr, hg, hb, blur, alpha] = o.halo;
        const a = alpha * (0.12 + 0.88 * lit) * (1 - leaving);
        o.el.style.boxShadow = `0 0 ${blur}px rgba(${hr}, ${hg}, ${hb}, ${a.toFixed(3)})`;
      } else {
        o.el.style.boxShadow = "none";
      }
      o.el.style.zIndex = String(depthZ(s.depth));
      // A PLANET IS OPAQUE, and there is exactly one thing that may make one
      // see-through: passing BEHIND the sun, where the star's own light swamps
      // it. That is an occlusion, not a phase — and phase is the shader's job
      // anyway. It already paints a world at the near point of its loop as the
      // near-black crescent it really is, with the thread of lit atmosphere
      // round the limb that makes the shape read; fading the element on top of
      // that only let the starfield through the lit face as well.
      let op = 1 - clamp01((leaving - GONE_AT) / (1 - GONE_AT));
      if (far > 0) {
        const near = Math.hypot(cx - sunCx, cy - sunCy) / (sunD * 0.75 + d);
        if (near < 1) op *= 0.15 + 0.85 * near;
      }
      o.el.style.opacity = String(op);
      if (labels) {
        o.el.textContent = o.label;
        o.el.style.color = "#fff";
        o.el.style.font = "700 13px/1 monospace";
        o.el.style.display = "flex";
        o.el.style.alignItems = "center";
        o.el.style.justifyContent = "center";
        o.el.style.textShadow = "0 0 3px #000";
      } else if (o.el.textContent) {
        o.el.textContent = "";
        o.el.style.display = "";
      }
      bodies[o.label] = {
        x: cx,
        y: cy,
        scale,
        far,
        lx: light.x,
        ly: light.y,
        lz: light.z,
      };
      return { cx, cy, scale, far };
    };

    let earthWorld: World = { x: 0, y: 0, z: 0 };
    let earthPlaced = { cx: sunCx, cy: sunCy, scale: 1, far: 0 };
    for (const o of planets) {
      const world = orbitAt(
        t,
        o.ms as number,
        o.r,
        o.e,
        o.inc,
        o.node,
        o.peri,
        o.l0,
      );
      const placed = paint(o, world, o.r);
      if (o.el === earth) {
        earthWorld = world;
        earthPlaced = placed;
      }
    }

    // The Moon rides its own inclined orbit around the Earth's live position,
    // scaled by however big the Earth currently reads — so it can slip in
    // front of and behind its planet as well as swing round the sun with it.
    const mo = orbitAt(
      t,
      moonOrbit.ms as number,
      moonOrbit.r,
      moonOrbit.e,
      moonOrbit.inc,
      moonOrbit.node,
      moonOrbit.peri,
      moonOrbit.l0,
    );
    const moonWorld: World = {
      x: earthWorld.x + mo.x,
      y: earthWorld.y + mo.y,
      z: earthWorld.z + mo.z,
    };
    const moonPlaced = paint(
      moonOrbit,
      moonWorld,
      SCREEN_R.earth,
      earthPlaced.scale,
    );

    driveAsteroids(asteroids, t, vw, vh, u, SUN_Z);

    // One globe per frame, once the shader has arrived, until every world has
    // one.
    if (Globe && pending.length) attachGlobe(pending.shift() as Planet);

    window.__skyState = {
      p,
      // The Moon's lit fraction, straight off the geometry: k = (1 + cos φ)/2
      // with cos φ the sun's direction along the view axis.
      phase: clamp01((1 + moonPlaced.far) / 2),
      sun: { x: sunCx, y: sunCy },
      earth: { x: earthPlaced.cx, y: earthPlaced.cy },
      mars: bodies["4"] ? { x: bodies["4"].x, y: bodies["4"].y } : undefined,
      moon: { x: moonPlaced.cx, y: moonPlaced.cy },
      sunUp: true,
      bodies,
    };

    raf = window.requestAnimationFrame(frame);
  };

  raf = window.requestAnimationFrame(frame);

  return () => {
    stopped = true;
    window.cancelAnimationFrame(raf);
    for (const o of [...planets, moonOrbit]) {
      const el = o.el;
      o.globe?.canvas.remove();
      o.globe = undefined;
      el.classList.remove("has-globe");
      el.classList.remove("has-rings");
      el.style.boxShadow = "";
      el.style.left = "";
      el.style.top = "";
      el.style.width = "";
      el.style.height = "";
      el.style.opacity = "";
      el.style.zIndex = "";
      el.style.color = "";
      el.style.font = "";
      el.style.display = "";
      el.style.alignItems = "";
      el.style.justifyContent = "";
      el.style.textShadow = "";
      el.textContent = "";
    }
    for (const a of asteroids) clearAsteroid(a);
    sun.style.left = "";
    sun.style.top = "";
    sun.style.opacity = "";
    sun.style.zIndex = "";
    glare.style.opacity = "";
  };
}

// ---------------------------------------------------------------------------
// Asteroids on a 3D fly-through.
// ---------------------------------------------------------------------------
//
// Instead of sliding flat across the backdrop, each rock rushes out of a far
// vanishing point straight toward the camera: it starts tiny and near screen
// centre, swells and accelerates outward on a perspective path, then blows past
// the edge and parks off-screen until its next pass. A simple pinhole camera —
// screen offset and size both scale as FOCAL / depth.

/** One rock's cycle length; each rides a fraction of it visible, the rest
 * parked, so fly-bys stay occasional. */
const AST_CYCLE_MS = 26_000;
/** Fraction of the cycle a rock is actually crossing (the rest: parked). */
const AST_VISIBLE = 0.62;
/** Perspective focal length and the depth span a rock travels (far → near). */
const AST_FOCAL = 1;
const AST_Z_FAR = 6.5;
const AST_Z_NEAR = 0.36;
/** Base rock diameter as a fraction of the short side, at unit depth. */
const AST_BASE = 0.03;

/** Per-rock character: a FIXED world-space lateral offset (lx, ly) from the
 * vanishing point — a straight line through space parallel to the view axis, so
 * the rock holds its heading and only its depth changes; plus a speed, spin and
 * phase so no two arrive together. The perspective divide (offset × FOCAL/z)
 * sweeps it out from centre and swells it as it nears the camera. */
const AST_TRACKS = [
  { lx: 0.42, ly: -0.26, speed: 1, spin: 140, phase: 0.0 },
  { lx: -0.36, ly: 0.34, speed: 1.35, spin: -110, phase: 0.42 },
  { lx: 0.14, ly: 0.44, speed: 0.82, spin: 170, phase: 0.72 },
];

function driveAsteroids(
  asteroids: HTMLElement[],
  t: number,
  vw: number,
  vh: number,
  u: number,
  sunZ: number,
): void {
  // Vanishing point: a touch above centre, so rocks blossom out of deep space
  // rather than from the exact middle of the menu.
  const vanX = vw * 0.5;
  const vanY = vh * 0.42;
  for (let i = 0; i < asteroids.length; i++) {
    const el = asteroids[i];
    const tr = AST_TRACKS[i % AST_TRACKS.length];
    if (!el || !tr) continue;
    const q = ((t / AST_CYCLE_MS) * tr.speed + tr.phase) % 1;
    // Freeze the CSS drift; JS owns the transform for the fly-through.
    el.style.animation = "none";
    if (q > AST_VISIBLE) {
      el.style.opacity = "0";
      continue;
    }
    const s = q / AST_VISIBLE; // 0 (far) → 1 (rushing past)
    const z = AST_Z_FAR + (AST_Z_NEAR - AST_Z_FAR) * s;
    const persp = AST_FOCAL / z;
    // A fixed world-space heading, divided by depth: the rock sits near the
    // vanishing point while far, then sweeps outward and swells as z shrinks —
    // a straight line flown toward the camera.
    const cx = vanX + tr.lx * u * persp;
    const cy = vanY + tr.ly * u * persp;
    const d = Math.max(3, AST_BASE * u * persp);
    el.style.left = `${cx - d / 2}px`;
    el.style.top = `${cy - d / 2}px`;
    el.style.width = `${d}px`;
    el.style.height = `${d}px`;
    el.style.transform = `rotate(${tr.spin * s}deg)`;
    // Fade in from the far haze, hold full through the sweep (including the big
    // near-camera climax), then blink out only as it blows past the edge.
    const fade = Math.min(1, s / 0.1) * Math.min(1, (1 - s) / 0.08);
    el.style.opacity = String(0.92 * fade);
    // Near rocks pass in front of the planets, far ones behind — same band as
    // the planets so the belt threads through the solar system.
    el.style.zIndex = String(Math.round(sunZ - 300 + s * 600));
  }
}

function clearAsteroid(el: HTMLElement): void {
  for (const prop of [
    "animation",
    "left",
    "top",
    "width",
    "height",
    "transform",
    "opacity",
    "zIndex",
  ]) {
    el.style.removeProperty(
      prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`),
    );
  }
}
