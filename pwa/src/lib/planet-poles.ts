// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Which way each planet's north pole points. An import-free leaf, because it is
// read from two places that must never meet: the globe shader (`planet-globe.ts`,
// lazily loaded, which leans each world's texture on its axis) and the orbit
// driver (`title-moons.ts`, on the app's critical path, which needs the same
// axis to lay a satellite's orbit in its planet's EQUATORIAL PLANE).
//
// Those two are the same physical fact, and before this file existed only one
// of them had it. A second copy is one edit from drift, and the drift would be
// invisible in the worst possible way: Uranus's moons would circle a planet
// that is lying on its side as though it were standing up.
//
// A NOTE ON THE NUMBERS, because the famous ones are the wrong ones. The
// textbook "axial tilt" (Mars 25.19°, Saturn 26.73°) is measured against the
// planet's OWN orbital plane. Everything here works in the ECLIPTIC instead, so
// what is tabulated is the tilt in that frame — which differs by the planet's
// orbital inclination, and by a full 7° for Mercury, whose axis is bolt upright
// to its own orbit but 7° off the ecliptic because its orbit is. Each pair is
// derived from the body's IAU J2000 north-pole right ascension and declination,
// converted to ecliptic coordinates.

const DEG = Math.PI / 180;

/** A spin axis: how far it leans from ecliptic north, and which way it leans —
 * the ecliptic longitude the pole's projection points at. Both in RADIANS. A
 * planet's axis holds a fixed direction in space as it orbits (that is what
 * gives it seasons), so both are constants. */
export type Pole = { obliquity: number; poleLon: number };

export const PLANET_POLES = {
  mercury: { obliquity: 7.01 * DEG, poleLon: 318.4 * DEG },
  venus: { obliquity: 1.24 * DEG, poleLon: 30.2 * DEG },
  earth: { obliquity: 23.44 * DEG, poleLon: 90 * DEG },
  mars: { obliquity: 26.71 * DEG, poleLon: 352.9 * DEG },
  jupiter: { obliquity: 2.21 * DEG, poleLon: 247.8 * DEG },
  saturn: { obliquity: 28.05 * DEG, poleLon: 79.5 * DEG },
  uranus: { obliquity: 82.28 * DEG, poleLon: 257.6 * DEG },
  neptune: { obliquity: 28.03 * DEG, poleLon: 319.2 * DEG },
} as const satisfies Record<string, Pole>;

export type PoleName = keyof typeof PLANET_POLES;

/**
 * A right-handed basis for the plane a satellite orbits in: the planet's
 * EQUATOR, expressed in the sky's world frame (x in the ecliptic plane,
 * y ecliptic north, z in the plane toward the camera's side).
 *
 * `north` is the pole itself; `east` and `front` span the equatorial plane. The
 * degenerate case is real and not hypothetical — Uranus's pole lies 82° over,
 * within 8° of the ecliptic plane — so the cross product is taken against
 * whichever reference axis it is least parallel to.
 */
export function equatorBasis(pole: Pole): {
  north: [number, number, number];
  east: [number, number, number];
  front: [number, number, number];
} {
  const so = Math.sin(pole.obliquity);
  const co = Math.cos(pole.obliquity);
  const north: [number, number, number] = [
    so * Math.cos(pole.poleLon),
    co,
    so * Math.sin(pole.poleLon),
  ];
  // Cross the pole with whichever axis it leans on least, so the basis stays
  // well-conditioned for an upright Jupiter and a toppled Uranus alike.
  const ref: [number, number, number] =
    Math.abs(north[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let ex = north[1] * ref[2] - north[2] * ref[1];
  let ey = north[2] * ref[0] - north[0] * ref[2];
  let ez = north[0] * ref[1] - north[1] * ref[0];
  const el = Math.hypot(ex, ey, ez) || 1;
  ex /= el;
  ey /= el;
  ez /= el;
  const east: [number, number, number] = [ex, ey, ez];
  const front: [number, number, number] = [
    north[1] * ez - north[2] * ey,
    north[2] * ex - north[0] * ez,
    north[0] * ey - north[1] * ex,
  ];
  return { north, east, front };
}
