// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE PLANETS — the eight, as data: their real orbital elements, their real
// diameters, their real years, and the two scales that put them on a screen.
//
// Split from `title-sky.ts`, which is now only the DRIVER. The same split the
// satellites already have in `title-moons.ts`, and for the same reason: a
// catalogue and a render loop are two different things to read.

import type { GlobeKind, PlanetGlobe } from "@ui/lib/planet-globe.ts";
import { SAT_MS_PER_DAY } from "./title-moons.ts";
import type { SkyElements } from "./title-sky.ts";

/**
 * HOW BIG THE WHOLE PICTURE IS DRAWN — one number over both of the sky's two
 * chosen lengths, the disc scale (EARTH_DISC) and the distance scale
 * (AU_UNITS).
 *
 * IT IS ONE NUMBER AND NOT TWO ON PURPOSE. Everything else in this file is a
 * measured ratio, so scaling the two chosen lengths TOGETHER leaves every one
 * of those ratios untouched: the same sky, further from the eye. Scale the
 * discs alone and the system silts up — the worlds grow into orbits that did
 * not — which is the failure this constant exists to make impossible to write
 * by accident.
 *
 * WHY IT IS NOT 1. At the reference viewport (a 844×390 landscape phone) the
 * unscaled sky drew Earth under nine pixels across and put the whole of
 * Mercury's orbit — 29 px at its widest — INSIDE the sun's own painted glare,
 * whose rays reach 34 px. Mercury therefore had nowhere to be seen: it spent
 * every orbit either behind the star or inside its halo, which is exactly what
 * it looked like, a planet that blinks out at the sun's edges and never comes
 * back. Doubling the picture lifts Mercury's orbit clear of the glare (46–69 px
 * against the same 34 px) and takes every inner world from a smudge to a disc
 * with a readable terminator.
 *
 * WHAT IT COSTS: the giants ride out. Their orbits are true (ORBIT_AU), so
 * doubling the picture doubles their distance from the star as well, and
 * Jupiter — the only one of the four that was regularly in frame — now crosses
 * the viewport for a smaller share of its twelve-minute year. That trade is
 * worth making because the inner system is the part with anything to look at,
 * the giants were already a rare sight by design (see CAM_AU in title-sky.ts),
 * and the camera exists precisely so that anyone who wants them can pull back.
 */
export const SKY_SCALE = 2;

/** Earth's revolution time on screen — the anchor for the whole system. */
export const EARTH_PERIOD_MS = 64_000;

/**
 * TRUE SIDEREAL PERIODS, in Earth years. Every planet's year is this number
 * times EARTH_PERIOD_MS, so the ratios between them are exactly the real ones:
 * Mercury goes round four times while Earth goes round once, Jupiter takes
 * 11.86 Earth years, Neptune 164.8.
 *
 * IT USED TO BE DERIVED FROM THE DRAWN RADII by Kepler's third law, and that
 * was the wrong answer to the right question. The radii are compressed (see
 * AU_UNITS), so T² ∝ a³ over THOSE lengths gives the periods a solar system
 * shaped like this picture would have — internally tidy, and wrong by a factor
 * of forty at Neptune, which lapped the sun four times an hour instead of
 * standing nearly still.
 *
 * WHAT IT COSTS, stated plainly: the outer four barely move. Jupiter takes
 * 12.6 minutes to go round, Saturn 31, Uranus an hour and a half, Neptune very
 * nearly three hours. A player who sits on the title screen watches the inner
 * system wheel while the giants hold station — which is exactly what the sky
 * over their head does, and the whole reason the ancients had a word for
 * "wanderer" and used it for only five of them.
 */
export const ORBIT_YEARS = {
  mercury: 0.2408467,
  venus: 0.6151973,
  earth: 1,
  mars: 1.8808476,
  jupiter: 11.862615,
  saturn: 29.447498,
  uranus: 84.016846,
  neptune: 164.79132,
} as const;

export function orbitPeriodMs(kind: keyof typeof ORBIT_YEARS): number {
  return Math.round(EARTH_PERIOD_MS * ORBIT_YEARS[kind]);
}

/** Earth's on-screen day (one rotation). Every other world's spin scales from
 * it by the world's true sidereal rotation period. */
export const EARTH_SPIN_MS = 22_000;
export const EARTH_ROT_DAYS = 0.99727;

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
export function spinMs(days: number): number {
  return Math.round((days / EARTH_ROT_DAYS) * EARTH_SPIN_MS);
}

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
export const DEPTH_FADE = 0.32;

/**
 * The sun's own z-index in the sky band; planets straddle it by depth so the
 * far ones tuck behind and the near ones ride in front.
 *
 * THE BAND IS DELIBERATELY COARSE-FREE. z-index is an integer, so the depth
 * band has to be wide enough that two bodies overlapping on screen never round
 * to the SAME index — with the old 1..11 band a tenth of a screen of depth
 * separated nothing, ties fell back to DOM order, and a farther world could
 * draw over a nearer one. Nothing noticed while the discs were translucent;
 * everything notices now that they are solid.
 *
 * AND IT IS PRIVATE, which is what lets it be this wide. Every element these
 * numbers land on lives inside `.title-sky`, a stacking context — so the whole
 * band flattens to ONE band (0) as far as the rest of the title screen is
 * concerned. Widen it freely; just never write one of these numbers onto
 * anything outside that wrapper, or it starts bidding against the menu. (It
 * used to: unwrapped, 850 beat the SCREENSHOT gallery's 70 and a planet drew
 * straight over the picture being viewed. See the title band map in
 * styles.css.)
 */
export const SUN_Z = 500;

/** Half-width of the planets' z band around the sun. */
export const Z_SPREAD = 350;

/**
 * One world. The orbital elements are the standard J2000 set; `r` is the only
 * invented number on the row, and `au` is kept beside it so the compression is
 * visible at a glance rather than hidden.
 */
export type Planet = {
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
  /** True for a moon: its ellipse is drawn about its PLANET, not the sun. */
  satellite?: boolean;
  /** The colour it is as a POINT OF LIGHT, for every frame where it is too
   * small to be a disc. */
  tint?: readonly [number, number, number];
  /** How bright that point is, 0..1 — a satellite's comes off the magnitude
   * scale in `title-moons.ts`; a planet is simply full. */
  lum?: number;
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
export const DIAMETER_KM = {
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

/**
 * EVERY DISC IS TRUE AGAINST EVERY OTHER DISC. One scale over the real
 * diameters above: Earth gets this fraction of the viewport's short side and
 * the rest follow. Jupiter comes out 11.2 Earths because Jupiter IS 11.2
 * Earths, the Moon a quarter of Earth because it is, Mercury 0.38 of it.
 *
 * IT USED TO BE A POWER LAW — every size raised to 0.22, squeezing the real
 * 29:1 spread between Jupiter and Mercury down to about 2.3:1 so Earth's
 * coastlines could read on a phone AND Jupiter could fit the frame. The
 * argument was sound and the result was a lie about the one thing a picture of
 * the solar system is for: Jupiter drawn at 1.7 Earths is not a giant, it is a
 * slightly larger planet, and nothing on screen tells the viewer the difference
 * is the renderer's rather than the sky's.
 *
 * SO EARTH IS SMALL, and that is what it costs: seventeen pixels on a landscape
 * phone at rest, with continents that are a suggestion rather than a map. Zoom
 * in (SKY_CAMERA) and they come back. Jupiter sets the ceiling — 11.2 of
 * whatever Earth gets — and Saturn's RINGS set it lower still, reaching 2.27
 * planet radii and making Saturn the widest thing in the sky bar the sun.
 *
 * The 0.022 is the RATIO — how much of the frame an Earth is worth against the
 * distances beside it. SKY_SCALE is how big the whole picture is drawn. Raise
 * the scale, never this: a disc scale lifted on its own grows worlds into
 * orbits that did not grow with them.
 */
export const EARTH_DISC = 0.022 * SKY_SCALE;

export function discSize(kind: keyof typeof DIAMETER_KM): number {
  return EARTH_DISC * (DIAMETER_KM[kind] / DIAMETER_KM.earth);
}

/**
 * TRUE SEMI-MAJOR AXES, in AU — and now the drawn orbits are these times one
 * number, so every distance in the sky is proportional to every other one. Two
 * planets twice as far apart as another pair are drawn twice as far apart.
 *
 * THIS IS WHAT THE ZOOM BOUGHT. A single kilometres-per-pixel scale cannot show
 * this system on one screen — Neptune's orbit is 77 times Mercury's, so a scale
 * that fits Neptune puts the inner four inside the sun's own disc, and one that
 * separates the inner four puts Jupiter three screens out. That is why the
 * radii here were hand-chosen for years. With a camera that can pull back
 * (SKY_CAMERA) the frame is no longer the constraint: the picture is true at
 * every zoom, and the zoom decides how much of it you are looking at.
 */
export const ORBIT_AU = {
  mercury: 0.3871,
  venus: 0.72333,
  earth: 1,
  mars: 1.52371,
  jupiter: 5.20288,
  saturn: 9.53667,
  uranus: 19.18916,
  neptune: 30.06992,
} as const;

/**
 * How wide one AU is drawn, as a fraction of the short side, at rest.
 *
 * This is the ONE framing decision left in the file, and it is a framing
 * decision rather than a physical one: at rest the picture is the inner four
 * and their moons, comfortably clear of the star, because that is the part of
 * the solar system with anything to look at. Everything from Jupiter out is
 * there at its true distance, crossing the frame rarely and briefly, waiting
 * for somebody to pull the camera back.
 *
 * As with EARTH_DISC, the 0.19 is the FRAMING and SKY_SCALE is how big the
 * picture is drawn. The two are multiplied here so that one number moves both
 * of the sky's chosen lengths at once and their proportion never drifts.
 */
export const AU_UNITS = 0.19 * SKY_SCALE;

export function planetTable(els: SkyElements): Planet[] {
  return [
    {
      el: els.mercury,
      label: "1",
      kind: "mercury",
      r: ORBIT_AU.mercury * AU_UNITS,
      tint: [188, 178, 164],
      au: 0.3871,
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
      r: ORBIT_AU.venus * AU_UNITS,
      tint: [244, 226, 176],
      au: 0.72333,
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
      r: ORBIT_AU.earth * AU_UNITS,
      tint: [150, 190, 235],
      au: 1,
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
      r: ORBIT_AU.mars * AU_UNITS,
      tint: [226, 148, 104],
      au: 1.52371,
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
      r: ORBIT_AU.jupiter * AU_UNITS,
      tint: [232, 208, 176],
      au: 5.20288,
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
      r: ORBIT_AU.saturn * AU_UNITS,
      tint: [238, 222, 176],
      au: 9.53667,
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
      r: ORBIT_AU.uranus * AU_UNITS,
      tint: [186, 222, 220],
      au: 19.18916,
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
      r: ORBIT_AU.neptune * AU_UNITS,
      tint: [152, 190, 220],
      au: 30.06992,
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

/**
 * The Moon, orbiting the EARTH — and the one satellite in the sky that does not
 * come from `title-moons.ts`, because it is the one that does not behave like
 * the others.
 *
 * ITS ORBIT IS TIED TO THE ECLIPTIC, NOT TO EARTH'S EQUATOR, and that is real
 * rather than a simplification. A close-in moon is held in its planet's
 * equatorial plane by the planet's own bulge; a distant one is held in the
 * plane of the planet's orbit by the sun. The Moon is far enough out to be in
 * the second regime, which is why it rides within 5.14° of the ECLIPTIC while
 * Jupiter's four sit on Jupiter's equator. That 5.14° is also why eclipses are
 * rare rather than monthly: most months the Moon passes above or below the sun.
 *
 * Its orbit is drawn at 2.35 Earth radii — compressed like every other distance
 * in this sky, and the true 60 would put it four screens out. Airless, so no
 * halo and no limb haze.
 */
export function moonBody(el: HTMLElement): Planet {
  return {
    el,
    label: "M",
    kind: "moon",
    au: 1,
    /** Screen radius about the Earth (fraction of the short side). */
    r: (EARTH_DISC / 2) * 2.35,
    tint: [214, 212, 208],
    e: 0.0549,
    /** 5.14° to the ecliptic — which is why eclipses are rare rather than
     * monthly: most months the Moon passes above or below the sun. */
    inc: 5.145,
    node: 125.08,
    peri: 83.23,
    l0: 218.32,
    /** A true quarter of the Earth beside it — the same linear rule every
     * other body is sized by (`discSize`). */
    base: discSize("moon"),
    /** Tidally locked: one rotation per orbit, so it keeps one face to the
     * Earth. Set from the orbital period below. */
    rotDays: 0,
    satellite: true,
    /** 27.32 days on the satellites' clock — the same clock the other twenty
     * run on, so the Moon is right against Io and Titan rather than being the
     * one body with a period picked by feel. */
    ms: Math.round(27.321582 * SAT_MS_PER_DAY),
  };
}
