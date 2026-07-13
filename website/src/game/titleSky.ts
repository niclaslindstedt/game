// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The main-menu sky Easter egg, driven so every body is lit *correctly* from
// the sun's real on-screen position. Two looks live here, chosen by the
// DEVELOPER "ORBITAL MENU" flag (settings.ts `titleOrbits`):
//
//   • startTitleArcSky — the classic default: a lone sun arcs across the sky
//     and a corner-fixed moon waxes to full at the dead of night.
//   • startTitleSky — the orbital solar system: the sun sits still while Earth
//     and Mars wheel around it and the Moon orbits Earth.
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
};

declare global {
  interface Window {
    /** Test hook: pin the effect to a fixed progress instead of the clock. */
    __skyFreeze?: number;
    /** Live geometry the verification harness reads back. */
    __skyState?: SkyState;
  }
}

const prefersReducedMotion = (): boolean =>
  !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// ---------------------------------------------------------------------------
// The orbital solar system (ORBITAL MENU on).
// ---------------------------------------------------------------------------

export type SkyElements = {
  sun: HTMLElement;
  glare: HTMLElement;
  earth: HTMLElement;
  mars: HTMLElement;
  moon: HTMLElement;
};

// The sun's fixed seat, in fractions of the viewport. Held in the upper sky so
// the inner orbits ride above the centred menu.
const SUN_X = 0.5;
const SUN_Y = 0.3;

/** One unhurried master loop. A frozen progress maps 0..1 onto 0..CYCLE_MS of
 * orbital time, so a pinned frame reproduces the same geometry. */
const CYCLE_MS = 240_000;

// Orbit radii as fractions of the viewport's short side (so orbits stay round
// in any orientation) and the period of one revolution each. The Moon orbits
// the Earth, not the sun; Mars rides a wide, slow orbit that leaves the frame.
const EARTH_R = 0.3;
const EARTH_MS = 90_000;
const MARS_R = 0.8;
const MARS_MS = 150_000;
const MOON_R = 0.12;
const MOON_MS = 15_000;

/** Illuminated fraction of every disc: a clean half, the day side facing the
 * sun. The shadow disc is a touch oversized (::after inset), so this clears just
 * about half the face — a terminator straight through the centre. */
const LIT = 0.5;

/**
 * Start the orbital sky driver. Returns a stop function that cancels the loop
 * and clears the inline styles it set. Honours prefers-reduced-motion by not
 * starting at all (the stylesheet then rests on plain, statically-placed
 * planets).
 */
export function startTitleSky(els: SkyElements): () => void {
  if (prefersReducedMotion()) return () => {};

  const { sun, glare, earth, mars, moon } = els;
  // The detonation overlay (a sibling of the moon) centres on these vars so it
  // rides the moon wherever its orbit has carried it.
  const parent = moon.parentElement;
  let raf = 0;

  // Place an element by its centre via left/top (not transform), so the moon's
  // charge/detonation scale animations keep the transform to themselves.
  const place = (el: HTMLElement, cx: number, cy: number): void => {
    el.style.left = `${cx - el.offsetWidth / 2}px`;
    el.style.top = `${cy - el.offsetHeight / 2}px`;
  };

  // Push a body's shadow disc away from the sun so its lit limb faces the sun.
  // Direction comes from the real element centres → correct in any orientation.
  const light = (
    el: HTMLElement,
    cx: number,
    cy: number,
    sx: number,
    sy: number,
    halo: string,
  ): void => {
    let dx = sx - cx;
    let dy = sy - cy;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const offset = LIT * el.offsetWidth * 1.08;
    el.style.setProperty("--sky-sx", `${-dx * offset}px`);
    el.style.setProperty("--sky-sy", `${-dy * offset}px`);
    el.style.boxShadow = halo;
  };

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

    const sunCx = SUN_X * vw;
    const sunCy = SUN_Y * vh;
    place(sun, sunCx, sunCy);
    sun.style.opacity = "1";

    // Warm glare wash, centred on the (static) sun.
    glare.style.opacity = "0.85";
    glare.style.setProperty("--glare-x", `${SUN_X * 100}%`);
    glare.style.setProperty("--glare-y", `${SUN_Y * 100}%`);

    const ea = (2 * Math.PI * t) / EARTH_MS;
    const ma = (2 * Math.PI * t) / MARS_MS;
    const mo = (2 * Math.PI * t) / MOON_MS;

    const earthCx = sunCx + EARTH_R * u * Math.cos(ea);
    const earthCy = sunCy + EARTH_R * u * Math.sin(ea);
    const marsCx = sunCx + MARS_R * u * Math.cos(ma);
    const marsCy = sunCy + MARS_R * u * Math.sin(ma);
    // The Moon rides around the Earth's current position.
    const moonCx = earthCx + MOON_R * u * Math.cos(mo);
    const moonCy = earthCy + MOON_R * u * Math.sin(mo);

    place(earth, earthCx, earthCy);
    place(mars, marsCx, marsCy);
    place(moon, moonCx, moonCy);

    light(
      earth,
      earthCx,
      earthCy,
      sunCx,
      sunCy,
      "0 0 26px rgba(120, 170, 235, 0.32)",
    );
    light(
      mars,
      marsCx,
      marsCy,
      sunCx,
      sunCy,
      "0 0 18px rgba(235, 140, 90, 0.3)",
    );
    light(
      moon,
      moonCx,
      moonCy,
      sunCx,
      sunCy,
      "0 0 16px rgba(220, 226, 235, 0.3)",
    );

    if (parent) {
      parent.style.setProperty("--moon-cx", `${moonCx}px`);
      parent.style.setProperty("--moon-cy", `${moonCy}px`);
    }

    window.__skyState = {
      p,
      phase: LIT,
      sun: { x: sunCx, y: sunCy },
      earth: { x: earthCx, y: earthCy },
      mars: { x: marsCx, y: marsCy },
      moon: { x: moonCx, y: moonCy },
      sunUp: true,
    };

    raf = window.requestAnimationFrame(frame);
  };

  raf = window.requestAnimationFrame(frame);

  return () => {
    window.cancelAnimationFrame(raf);
    for (const el of [earth, mars, moon]) {
      el.style.removeProperty("--sky-sx");
      el.style.removeProperty("--sky-sy");
      el.style.boxShadow = "";
      el.style.left = "";
      el.style.top = "";
    }
    sun.style.left = "";
    sun.style.top = "";
    sun.style.opacity = "";
    glare.style.opacity = "";
    if (parent) {
      parent.style.removeProperty("--moon-cx");
      parent.style.removeProperty("--moon-cy");
    }
  };
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
