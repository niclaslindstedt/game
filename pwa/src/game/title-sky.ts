// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The main-menu sky, driven so every body is lit *correctly* from the sun's
// real on-screen position:
//
//   • startTitleSky — the orbital solar system: the sun sits still while
//     Mercury, Venus, Earth (with its Moon) and Mars wheel around it on tilted
//     3D orbits — each shrinks and slips *behind* the sun at the far side of
//     its loop, then swells back on the near side — and the asteroids fly a
//     perspective path toward the camera rather than sliding flat across.
//
// Each body is a real, per-pixel-lit rotating globe (planet-globe.ts) whose
// terminator falls out of the geometry, so the lit limb always points at the
// sun in any viewport orientation. Everything is set as inline styles / CSS
// custom properties each frame; the stylesheet supplies only the static look
// and a resting layout for when the driver never starts (prefers-reduced-motion).

import { PlanetGlobe } from "@ui/lib/planet-globe.ts";
import type { GlobeKind, GlobeLight } from "@ui/lib/planet-globe.ts";

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

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
  /** Per-body geometry (centre, on-screen scale, depth) for the dev harness. */
  bodies?: Record<string, { x: number; y: number; scale: number; far: number }>;
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

// ---------------------------------------------------------------------------
// The orbital solar system.
// ---------------------------------------------------------------------------
//
// The planets do NOT merely wheel around the sun in the screen plane — they
// ride tilted 3D orbits seen almost edge-on, so each one shrinks and sinks
// toward the sun at the far side of its loop (superior conjunction — it slips
// *behind* the sun, occluded by z-order and drowned in the glare), then swells
// back to full size as it swings round to the near side. Mercury and Venus run
// tiny inner orbits; Earth (with its Moon) and Mars ride wider ones. The
// asteroids likewise fly *through* space on a perspective path, rushing from a
// far vanishing point toward the camera, rather than sliding flat across.

export type SkyElements = {
  sun: HTMLElement;
  glare: HTMLElement;
  mercury: HTMLElement;
  venus: HTMLElement;
  earth: HTMLElement;
  mars: HTMLElement;
  moon: HTMLElement;
  /** Backdrop asteroids, driven on a 3D fly-through toward the camera. */
  asteroids: HTMLElement[];
};

// The sun's fixed seat, in fractions of the viewport. Held in the upper sky so
// the inner orbits ride above the centred menu.
const SUN_X = 0.5;
const SUN_Y = 0.32;

/** One unhurried master loop. A frozen progress maps 0..1 onto 0..CYCLE_MS of
 * orbital time, so a pinned frame reproduces the same geometry. */
const CYCLE_MS = 240_000;

/** Earth's revolution time on screen — the anchor for the whole system. The
 * on-screen *distances* are compressed (an honest solar system would be nearly
 * empty), but the relative *speeds* are real: each planet's period is scaled
 * from Earth's by its true sidereal ratio (REL_PERIOD below), so the inner
 * worlds genuinely race and the outer ones crawl, just sped up as a whole. */
const EARTH_PERIOD_MS = 64_000;

/** True sidereal orbital period of each body, in Earth years — the real
 * proportions Kepler's third law fixes (T² ∝ a³). Multiplied by EARTH_PERIOD_MS
 * they give each on-screen period. The Moon's is its ~27.3-day month about the
 * Earth (0.0748 yr); a strict ratio whips it round every few seconds, so it is
 * eased below for watchability — the one place proportion yields to feel. */
const REL_PERIOD = {
  mercury: 0.2408,
  venus: 0.6152,
  earth: 1,
  mars: 1.8808,
  moon: 0.0748,
} as const;

/** The Moon's true month is so short next to Earth's year that a strict ratio
 * spins it round every ~5 s — a blur. Ease it by this factor for watchability;
 * it still laps the Earth several times per orbit, reading as a fast satellite
 * rather than a planet. */
const MOON_EASE = 2.4;

/** Turn a body's real period ratio into its on-screen revolution time (ms). */
function orbitMs(rel: number): number {
  return Math.round(EARTH_PERIOD_MS * rel);
}

/** Earth's on-screen day (one rotation). The other worlds' spins scale from it
 * by their true sidereal rotation period, so Earth and Mars visibly turn while
 * the slow rotators barely drift. */
const EARTH_SPIN_MS = 22_000;

/** True sidereal rotation period of each body, in Earth days, SIGNED: negative
 * is retrograde. Venus turns backwards; Mercury and Venus turn so slowly that a
 * faithful scaling would freeze them on screen, so the magnitude is capped
 * (MAX_SPIN_MS) — they still creep, and keep their real direction. */
const ROT_DAYS = {
  mercury: 58.65,
  venus: -243.02,
  earth: 0.997,
  mars: 1.026,
};
const MAX_SPIN_MS = 150_000;

/** On-screen rotation time (ms, signed) for a body spinning `days` Earth-days
 * per turn — scaled from Earth's screen day and capped so the sluggish ones
 * still move. */
function spinMs(days: number): number {
  const mag = Math.min(
    MAX_SPIN_MS,
    (Math.abs(days) / ROT_DAYS.earth) * EARTH_SPIN_MS,
  );
  return Math.round(days < 0 ? -mag : mag);
}

/** The depth (camera-z) component of one unit of `far`, for an orbit of the
 * given `tilt`. The tilted orbit spends `tilt` of `far` on the screen's vertical
 * axis and the rest, √(1−tilt²), pointing along the view axis — so a body at
 * `far` sits this much toward (near, far<0) or away from (behind the sun, far>0)
 * the camera. A flatter orbit (small tilt) swings deep in z and so through full
 * phases; a rounder one (large tilt) stays near the flanks (half-lit). */
function zTilt(tilt: number): number {
  return Math.sqrt(1 - tilt * tilt);
}

/** Illuminated fraction of the disc facing us, from a body's depth `far` on an
 * orbit of the given `tilt`. The Lambert phase law k = (1 + cosφ)/2 with
 * cosφ = L·view = far·√(1−tilt²): 0 at the near side (new), 1 behind the sun
 * (full), ½ at the flanks (half) — the "3D relation to the sun" the flat
 * LIT = ½ threw away. */
function litFractionFor(far: number, tilt: number): number {
  return clamp01((1 + clamp(far, -1, 1) * zTilt(tilt)) / 2);
}

/** How hard depth swings a body's on-screen size: scale = 1 − DEPTH·far, with
 * far ∈ [−1 (near), +1 (behind the sun)]. Near swells, far shrinks. */
const DEPTH = 0.52;

/** How far depth dims a body — the atmospheric fade that helps a shrinking
 * planet melt into the sun's glare at the back of its loop. */
const DEPTH_FADE = 0.32;

/** The sun's own z-index in the sky band; planets straddle it by depth so the
 * far ones tuck behind and the near ones ride in front. Must stay below the
 * menu content (see .title-content z-index in styles.css). */
const SUN_Z = 5;

/** One orbiting body. Radii and base diameters are fractions of the viewport's
 * short side, so the layout stays proportional in any orientation. */
type Orbit = {
  el: HTMLElement;
  /** Orbit radius around the parent (sun, or Earth for the Moon). */
  r: number;
  /** Milliseconds for one revolution. */
  ms: number;
  /** Starting angle so the planets don't all line up. */
  phase: number;
  /** How edge-on this orbit is: the vertical squash of its tilted circle
   * (0 = seen as a flat line, 1 = face-on). Varying it per body stops the
   * system collapsing onto one shared plane. */
  tilt: number;
  /** Screen roll of the orbit's plane (radians): rotates the whole ellipse so
   * each ring sits at its own angle and the bodies spread to different heights
   * around the sun rather than strung along one line. */
  roll: number;
  /** Rest diameter at zero depth. */
  base: number;
  /** Halo colour template. */
  halo: string;
  label: string;
  /** Which world's skin the globe shader paints on this body. */
  kind: GlobeKind;
  /** Milliseconds for the surface to spin one full turn under the light. */
  spinMs: number;
  /** The lit, textured globe drawn onto this element (created on start). */
  globe?: PlanetGlobe;
};

/** Map a body's depth (far ∈ [−1, 1]) to a z-index straddling the sun, so the
 * back half of every orbit tucks behind the sun and the front half rides over
 * it — one branchless expression that also orders the planets among themselves
 * by depth. */
function depthZ(far: number): number {
  return Math.round(SUN_Z - far * 4);
}

/**
 * Start the orbital sky driver. Returns a stop function that cancels the loop
 * and clears the inline styles it set. Honours prefers-reduced-motion by not
 * starting at all (the stylesheet then rests on plain, statically-placed
 * planets).
 */
export function startTitleSky(els: SkyElements): () => void {
  if (prefersReducedMotion()) return () => {};

  const { sun, glare, mercury, venus, earth, mars, moon, asteroids } = els;
  // The detonation overlay (a sibling of the moon) centres on these vars so it
  // rides the moon wherever its orbit has carried it.
  const parent = moon.parentElement;
  let raf = 0;

  // The four sun-orbiting planets, innermost first. Mercury and Venus stay tiny
  // (you can just make out two more specks wheeling in close); Earth is the
  // largest, with the Moon riding around it; Mars is the rusty outer wanderer.
  const planets: Orbit[] = [
    {
      el: mercury,
      r: 0.19,
      ms: orbitMs(REL_PERIOD.mercury),
      phase: 0.7,
      base: 0.03,
      halo: "0 0 8px rgba(200, 180, 150, 0.28)",
      label: "1",
      kind: "mercury",
      spinMs: spinMs(ROT_DAYS.mercury),
      tilt: 0.5,
      roll: -0.55,
    },
    {
      el: venus,
      r: 0.31,
      ms: orbitMs(REL_PERIOD.venus),
      phase: 2.4,
      base: 0.048,
      halo: "0 0 12px rgba(235, 205, 150, 0.3)",
      label: "2",
      kind: "venus",
      spinMs: spinMs(ROT_DAYS.venus),
      tilt: 0.42,
      roll: 0.4,
    },
    {
      el: earth,
      r: 0.47,
      ms: orbitMs(REL_PERIOD.earth),
      phase: 4.1,
      base: 0.1,
      halo: "0 0 26px rgba(120, 170, 235, 0.32)",
      label: "3",
      kind: "earth",
      spinMs: spinMs(ROT_DAYS.earth),
      tilt: 0.36,
      roll: -0.22,
    },
    {
      el: mars,
      r: 0.68,
      ms: orbitMs(REL_PERIOD.mars),
      phase: 5.6,
      base: 0.07,
      halo: "0 0 18px rgba(235, 140, 90, 0.3)",
      label: "4",
      kind: "mars",
      spinMs: spinMs(ROT_DAYS.mars),
      tilt: 0.3,
      roll: 0.3,
    },
  ];
  const moonOrbit: Orbit = {
    el: moon,
    r: 0.1,
    ms: orbitMs(REL_PERIOD.moon * MOON_EASE),
    phase: 1.2,
    base: 0.038,
    halo: "0 0 14px rgba(220, 226, 235, 0.3)",
    label: "M",
    kind: "moon",
    // Tidally locked: one rotation per orbit, so it keeps a face to the Earth.
    spinMs: orbitMs(REL_PERIOD.moon * MOON_EASE),
    tilt: 0.55,
    roll: 0.5,
  };

  // Give every body a real, textured, rotating globe: a canvas child that the
  // shader (planet-globe.ts) paints each frame. It sits over the element's flat
  // CSS gradient (the resting/reduced-motion look) and takes it over while the
  // driver runs — `has-globe` drops the CSS terminator pseudo-elements so only
  // the per-pixel-lit sphere shows.
  const dpr = globeDpr();
  for (const o of [...planets, moonOrbit]) {
    const globe = new PlanetGlobe(o.kind);
    const c = globe.canvas;
    c.className = "title-globe";
    c.setAttribute("aria-hidden", "true");
    o.el.appendChild(c);
    o.el.classList.add("has-globe");
    o.globe = globe;
  }

  // Size a disc (base diameter × depth-scale, floored so a far speck never
  // vanishes to nothing) and centre it via width/height + left/top. Sizing by
  // box (not transform: scale) leaves the moon's transform free for its
  // charge/detonation animations.
  const placeSized = (
    el: HTMLElement,
    cx: number,
    cy: number,
    u: number,
    base: number,
    scale: number,
  ): number => {
    const d = Math.max(6, base * u * scale);
    el.style.width = `${d}px`;
    el.style.height = `${d}px`;
    el.style.left = `${cx - d / 2}px`;
    el.style.top = `${cy - d / 2}px`;
    return d;
  };

  // The unit sun→body direction in view space, from the body's on-screen offset
  // from the sun (the projected x/y) and its depth `far` (the z toward/away from
  // the camera). This is the light the globe shader lights each pixel against —
  // the body's genuine 3D relation to the sun, so it waxes and wanes and its
  // terminator sits where the geometry actually puts it.
  const lightVector = (
    cx: number,
    cy: number,
    far: number,
    tilt: number,
    sx: number,
    sy: number,
  ): GlobeLight => {
    const lz = clamp(far, -1, 1) * zTilt(tilt);
    const sinP = Math.sqrt(Math.max(0, 1 - lz * lz));
    const dx = sx - cx;
    const dy = sy - cy;
    const len = Math.hypot(dx, dy) || 1;
    return { x: (dx / len) * sinP, y: (dy / len) * sinP, z: lz };
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

    // Solve one body's tilted 3D orbit around a centre. Returns its screen
    // centre, on-screen scale and depth (far ∈ [−1, 1]).
    const solve = (
      o: Orbit,
      ox: number,
      oy: number,
    ): { cx: number; cy: number; scale: number; far: number } => {
      const a = (2 * Math.PI * t) / o.ms + o.phase;
      // In the orbit's own plane: cos → the in-plane major axis, sin → the axis
      // tilted away from us, foreshortened by `tilt` into a vertical bob and
      // driving depth. far = +1 at the back (behind the sun).
      const far = Math.sin(a);
      const ex = o.r * u * Math.cos(a);
      const ey = -o.r * u * o.tilt * far;
      // Roll the whole ellipse about the view axis so each orbit sits at its own
      // angle — the rings fan out in 3D instead of sharing one flat band.
      const cr = Math.cos(o.roll);
      const sr = Math.sin(o.roll);
      const cx = ox + ex * cr - ey * sr;
      const cy = oy + ex * sr + ey * cr;
      const scale = 1 - DEPTH * far;
      return { cx, cy, scale, far };
    };

    // Paint one body: size, place, light, depth-fade and z-order it. `far` also
    // decides whether it sits in front of or behind the sun.
    const paint = (
      o: Orbit,
      cx: number,
      cy: number,
      scale: number,
      far: number,
    ): void => {
      const d = placeSized(o.el, cx, cy, u, o.base, scale);
      // Paint the textured, sun-lit sphere onto the body's canvas (unless the
      // calibration overlay wants plain labelled discs). The outer halo stays a
      // CSS box-shadow so the glow can bleed beyond the disc.
      if (o.globe && !labels) {
        o.globe.canvas.style.display = "";
        o.globe.render(
          d,
          lightVector(cx, cy, far, o.tilt, sunCx, sunCy),
          t / o.spinMs,
          dpr,
        );
      } else if (o.globe) {
        o.globe.canvas.style.display = "none";
      }
      o.el.style.boxShadow = o.halo;
      o.el.style.zIndex = String(depthZ(far));
      // Fade with depth, and melt into the glare when a far body slips over the
      // sun's disc (superior conjunction).
      let op = 1 - DEPTH_FADE * Math.max(0, far);
      if (far > 0) {
        const near = Math.hypot(cx - sunCx, cy - sunCy) / (sunD * 0.75 + d);
        if (near < 1) op *= 0.15 + 0.85 * near;
      }
      o.el.style.opacity = String(op);
      if (labels) {
        o.el.textContent = o.label;
        o.el.style.setProperty("--sky-sx", "300%");
        o.el.style.setProperty("--sky-sy", "0px");
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
      bodies[o.label] = { x: cx, y: cy, scale, far };
    };

    let earthCx = sunCx;
    let earthCy = sunCy;
    let earthScale = 1;
    let earthFar = 0;
    for (const o of planets) {
      const s = solve(o, sunCx, sunCy);
      paint(o, s.cx, s.cy, s.scale, s.far);
      if (o.el === earth) {
        earthCx = s.cx;
        earthCy = s.cy;
        earthScale = s.scale;
        earthFar = s.far;
      }
    }

    // The Moon rides its own tilted orbit around the Earth's live position,
    // scaled by however big the Earth currently reads, so it can slip in front
    // of and behind its planet as well as swing round the sun with it.
    const ms = solve(moonOrbit, earthCx, earthCy);
    const moonScale = earthScale * ms.scale;
    // Its z-order blends Earth's depth (in front of/behind the sun) with its own
    // little orbit (in front of/behind the Earth).
    const moonFar = earthFar + ms.far * 0.3;
    const moonCx = ms.cx;
    const moonCy = ms.cy;
    paint(moonOrbit, moonCx, moonCy, moonScale, moonFar);

    if (parent) {
      parent.style.setProperty("--moon-cx", `${moonCx}px`);
      parent.style.setProperty("--moon-cy", `${moonCy}px`);
    }

    driveAsteroids(asteroids, t, vw, vh, u, SUN_Z);

    window.__skyState = {
      p,
      phase: litFractionFor(moonFar, moonOrbit.tilt),
      sun: { x: sunCx, y: sunCy },
      earth: { x: earthCx, y: earthCy },
      mars: bodies["4"] ? { x: bodies["4"].x, y: bodies["4"].y } : undefined,
      moon: { x: moonCx, y: moonCy },
      sunUp: true,
      bodies,
    };

    raf = window.requestAnimationFrame(frame);
  };

  raf = window.requestAnimationFrame(frame);

  return () => {
    window.cancelAnimationFrame(raf);
    for (const o of [...planets, moonOrbit]) {
      const el = o.el;
      o.globe?.canvas.remove();
      o.globe = undefined;
      el.classList.remove("has-globe");
      el.style.removeProperty("--sky-sx");
      el.style.removeProperty("--sky-sy");
      el.style.removeProperty("--sky-soft");
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
    if (parent) {
      parent.style.removeProperty("--moon-cx");
      parent.style.removeProperty("--moon-cy");
    }
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
    el.style.zIndex = String(Math.round(sunZ - 4 + s * 8));
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
