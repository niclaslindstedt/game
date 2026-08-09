// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Keplerian orbital mechanics: standard elements in, a position out. Generic
// enough for the @ui/lib pool — it knows nothing about this sky, this game or
// this renderer, and it is read by both halves of the title orrery (the planets
// in `title-sky.ts` and the satellites in `title-moons.ts`), which is why it
// stopped being private to the first of them.

const DEG = Math.PI / 180;

/**
 * Solve Kepler's equation M = E − e·sin E for the eccentric anomaly, by
 * Newton's method. Three iterations is plenty at solar-system eccentricities
 * (the worst planet is Mercury's 0.21) and it is the whole reason a body sweeps
 * equal areas in equal times rather than sliding round at a constant rate.
 */
export function eccentricAnomaly(m: number, e: number): number {
  let ecc = m;
  for (let i = 0; i < 3; i++) {
    ecc -= (ecc - e * Math.sin(ecc) - m) / (1 - e * Math.cos(ecc));
  }
  return ecc;
}

/** A position in the reference frame: x in the plane, y toward the plane's
 * north, z in the plane at right angles to x. For a heliocentric orbit that
 * frame is the ecliptic; for a satellite it is its planet's equator. */
export type World = { x: number; y: number; z: number };

/**
 * Where is this body, in its own orbit, at time `t`? Standard Keplerian
 * elements → coordinates in the reference plane, with `a` in whatever unit the
 * caller wants back.
 *
 * An inclination past 90° is not a special case here and does not need to be:
 * the rotation handles it, and the motion comes out RETROGRADE on its own —
 * which is exactly how Triton, at 157°, ends up going round Neptune backwards
 * without a line of code that knows it does.
 */
export function orbitAt(
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
  // In the orbital plane, with the PRIMARY AT A FOCUS — not at the centre.
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
  // The reference plane is (ex, ey); ez is its north. Map onto the renderer's
  // frame: y is north, z lies in the plane.
  return { x: ex, y: ez, z: ey };
}
