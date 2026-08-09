// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The backdrop rocks, on a 3D fly-through toward the camera. Split out of
// title-sky.ts, which is the ORRERY: nothing here solves an orbit, nothing here
// is lit by the sun, and the two share only the z-band they sort into.

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

export function driveAsteroids(
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

export function clearAsteroid(el: HTMLElement): void {
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
