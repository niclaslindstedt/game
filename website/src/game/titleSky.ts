// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The main-menu sky Easter egg, driven so every body is lit *correctly* from
// the sun's real on-screen position. Two looks live here, chosen by the
// DEVELOPER "ORBITAL MENU" flag (settings.ts `titleOrbits`):
//
//   • startTitleArcSky — the classic default: a lone sun arcs across the sky
//     and a corner-fixed moon waxes to full at the dead of night.
//   • startTitleSky — the orbital solar system: the sun sits still while
//     Mercury, Venus, Earth (with its Moon) and Mars wheel around it on tilted
//     3D orbits — each shrinks and slips *behind* the sun at the far side of
//     its loop, then swells back on the near side — and the asteroids fly a
//     perspective path toward the camera rather than sliding flat across.
//
// Both obey the same lighting law: a terminator (::after) is pushed *away from
// the sun* using the elements' actual centres, so the lit limb always points at
// the sun in any viewport orientation. Everything is set as inline styles / CSS
// custom properties each frame; the stylesheet supplies only the static look
// and a resting layout for when a driver never starts (prefers-reduced-motion).

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

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

const prefersReducedMotion = (): boolean =>
  !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// ---------------------------------------------------------------------------
// The orbital solar system (ORBITAL MENU on).
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
  /** Backdrop asteroids, driven on a 3D fly-through in orbit mode (they keep
   * their plain CSS drift with the flag off). */
  asteroids: HTMLElement[];
};

// The sun's fixed seat, in fractions of the viewport. Held in the upper sky so
// the inner orbits ride above the centred menu.
const SUN_X = 0.5;
const SUN_Y = 0.32;

/** One unhurried master loop. A frozen progress maps 0..1 onto 0..CYCLE_MS of
 * orbital time, so a pinned frame reproduces the same geometry. */
const CYCLE_MS = 240_000;

/** How flat the orbits look — the vertical squash of the tilted circle, seen
 * nearly edge-on. Small ⇒ the far side hugs the sun (a clean pass *behind* it);
 * too small reads as a flat line. */
const TILT = 0.34;

/** How hard depth swings a body's on-screen size: scale = 1 − DEPTH·far, with
 * far ∈ [−1 (near), +1 (behind the sun)]. Near swells, far shrinks. */
const DEPTH = 0.52;

/** How far depth dims a body — the atmospheric fade that helps a shrinking
 * planet melt into the sun's glare at the back of its loop. */
const DEPTH_FADE = 0.32;

/** Illuminated fraction of every disc: a clean half, the day side facing the
 * sun. The shadow disc is a touch oversized (::after inset), so this clears just
 * about half the face — a terminator straight through the centre. */
const LIT = 0.5;

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
  /** Rest diameter at zero depth. */
  base: number;
  /** Halo colour template. */
  halo: string;
  label: string;
};

/** Map a body's depth (far ∈ [−1, 1]) to a z-index straddling the sun, so the
 * back half of every orbit tucks behind the sun and the front half rides over
 * it — one branchless expression that also orders the planets among themselves
 * by depth. */
const depthZ = (far: number): number => Math.round(SUN_Z - far * 4);

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
      ms: 32_000,
      phase: 0.7,
      base: 0.03,
      halo: "0 0 8px rgba(200, 180, 150, 0.28)",
      label: "1",
    },
    {
      el: venus,
      r: 0.31,
      ms: 56_000,
      phase: 2.4,
      base: 0.048,
      halo: "0 0 12px rgba(235, 205, 150, 0.3)",
      label: "2",
    },
    {
      el: earth,
      r: 0.47,
      ms: 92_000,
      phase: 4.1,
      base: 0.1,
      halo: "0 0 26px rgba(120, 170, 235, 0.32)",
      label: "3",
    },
    {
      el: mars,
      r: 0.68,
      ms: 150_000,
      phase: 5.6,
      base: 0.07,
      halo: "0 0 18px rgba(235, 140, 90, 0.3)",
      label: "4",
    },
  ];
  const moonOrbit: Orbit = {
    el: moon,
    r: 0.1,
    ms: 13_000,
    phase: 1.2,
    base: 0.038,
    halo: "0 0 14px rgba(220, 226, 235, 0.3)",
    label: "M",
  };

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

  // Push a body's shadow disc away from the sun so its lit limb faces the sun.
  // Direction comes from the real element centres → correct in any orientation.
  const light = (
    el: HTMLElement,
    cx: number,
    cy: number,
    sx: number,
    sy: number,
    diam: number,
    halo: string,
  ): void => {
    let dx = sx - cx;
    let dy = sy - cy;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const offset = LIT * diam * 1.08;
    el.style.setProperty("--sky-sx", `${-dx * offset}px`);
    el.style.setProperty("--sky-sy", `${-dy * offset}px`);
    el.style.boxShadow = halo;
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
      // cos → horizontal sweep; sin → depth (the tilted axis we see foreshortened
      // into a little vertical bob). far = +1 at the back (behind the sun).
      const far = Math.sin(a);
      const cx = ox + o.r * u * Math.cos(a);
      const cy = oy - o.r * u * TILT * far;
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
      light(o.el, cx, cy, sunCx, sunCy, d, o.halo);
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
      phase: LIT,
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
      el.style.removeProperty("--sky-sx");
      el.style.removeProperty("--sky-sy");
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
// Asteroids on a 3D fly-through (ORBITAL MENU on).
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
    // Freeze the CSS drift; JS owns the transform in orbit mode.
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

// ---------------------------------------------------------------------------
// The classic arcing sun (ORBITAL MENU off — the default).
// ---------------------------------------------------------------------------

export type ArcSkyElements = {
  sun: HTMLElement;
  glare: HTMLElement;
  moon: HTMLElement;
};

/** One unhurried loop. The sun is only overhead for the DAY slice of it. */
const ARC_CYCLE_MS = 200_000;

/** Fraction of the loop the sun spends above the horizon — kept short so the
 * glare is a brief event and the full moon lingers through the long night. */
const DAY = 0.34;

// The sun's arc, in fractions of the viewport. It rises out of one side, crests
// high, and sets on the other; below the horizon it keeps travelling (off the
// bottom) so the terminator direction stays smooth through dusk and dawn.
const ARC_CX = 0.55; // arc centre x
const ARC_RX = 0.42; // horizontal swing
const ARC_HORIZON = 0.82; // y where the sun meets the horizon
const ARC_RY = 0.74; // how high it climbs

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

// Warp progress → orbit angle so the whole daytime arc (0→π) is crossed in the
// first DAY of the loop and the long night (π→2π) fills the rest.
const arcAngle = (p: number): number =>
  p < DAY ? Math.PI * (p / DAY) : Math.PI + Math.PI * ((p - DAY) / (1 - DAY));

/**
 * Start the classic arcing-sun driver. The moon hangs in its CSS corner; only
 * its phase (shadow offset), halo, and the sun/glare move. Returns a stop
 * function that clears the inline styles it set; a noop under reduced motion
 * (the stylesheet then rests on a plain full moon).
 */
export function startTitleArcSky(els: ArcSkyElements): () => void {
  if (prefersReducedMotion()) return () => {};

  const { sun, glare, moon } = els;
  let raf = 0;

  const frame = (now: number) => {
    const frozen = window.__skyFreeze;
    const p =
      typeof frozen === "number" && Number.isFinite(frozen)
        ? clamp01(frozen)
        : (now % ARC_CYCLE_MS) / ARC_CYCLE_MS;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const a = arcAngle(p);
    const az = Math.cos(a); // +1 right … −1 left
    const elev = Math.sin(a); // +1 zenith … −1 nadir (below horizon)
    const sunUp = elev > 0;

    // Sun centre in px, then place the element (top:0/left:0) by its centre.
    const sunCxF = ARC_CX + ARC_RX * az;
    const sunCyF = ARC_HORIZON - ARC_RY * elev;
    const sunCx = sunCxF * vw;
    const sunCy = sunCyF * vh;
    const halfW = sun.offsetWidth / 2;
    const halfH = sun.offsetHeight / 2;
    sun.style.transform = `translate(${sunCx - halfW}px, ${sunCy - halfH}px)`;
    sun.style.opacity = String(sunUp ? smoothstep(0, 0.1, elev) : 0);

    // The warm glare wash swells with the sun's height and tracks its position.
    glare.style.opacity = String(sunUp ? smoothstep(0, 0.12, elev) * 0.9 : 0);
    glare.style.setProperty("--glare-x", `${sunCxF * 100}%`);
    glare.style.setProperty("--glare-y", `${sunCyF * 100}%`);

    // Illuminated fraction: 0 while the sun is up (a hair of rim so the disc is
    // not pure void), swelling to a full 1 at the dead of night.
    const night = Math.max(0, -elev);
    const f = Math.max(night, sunUp ? 0.06 : 0);

    // Shadow offset: push the dark disc *away from the sun* so the lit crescent
    // faces it. Direction comes from the real element centres → correct in any
    // orientation; magnitude clears the disc (→ full moon) at f = 1.
    const m = moon.getBoundingClientRect();
    const mCx = m.left + m.width / 2;
    const mCy = m.top + m.height / 2;
    let dx = sunCx - mCx;
    let dy = sunCy - mCy;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const offset = f * m.width * 1.08;
    moon.style.setProperty("--sky-sx", `${-dx * offset}px`);
    moon.style.setProperty("--sky-sy", `${-dy * offset}px`);

    // Cool moonlight halo, brightening as the moon fills.
    const halo = 8 + 26 * f;
    const haloA = 0.1 + 0.3 * f;
    moon.style.boxShadow = `0 0 ${halo}px rgba(226, 232, 240, ${haloA})`;

    window.__skyState = {
      p,
      phase: f,
      sun: { x: sunCx, y: sunCy },
      moon: { x: mCx, y: mCy },
      sunUp,
    };

    raf = window.requestAnimationFrame(frame);
  };

  raf = window.requestAnimationFrame(frame);

  return () => {
    window.cancelAnimationFrame(raf);
    moon.style.removeProperty("--sky-sx");
    moon.style.removeProperty("--sky-sy");
    moon.style.boxShadow = "";
    sun.style.transform = "";
    sun.style.opacity = "";
    glare.style.opacity = "";
  };
}
