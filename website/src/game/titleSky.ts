// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The main-menu solar-system Easter egg: a sun sitting still while planets
// wheel around it, each lit *correctly* from the sun's real position.
//
// The sun hangs fixed in the sky. Earth and Mars orbit it on their own radii
// and periods; the Moon orbits the Earth. Every body is a disc whose sun-facing
// half is lit and whose far half lies in shadow: a terminator (::after) is
// pushed *away from the sun* using the body's and the sun's actual on-screen
// centres, so the lit limb always points at the sun as the body wheels around —
// correct in any viewport orientation. The outer orbit is wide enough that Mars
// drifts off-frame and back; the bodies need not all be visible at once.
//
// A single slow master progress (one loop every CYCLE_MS) drives every orbit,
// so a pinned frame (window.__skyFreeze) is reproducible for the verifier.
//
// Everything is set as inline styles / CSS custom properties each frame; the
// stylesheet only supplies the static look (surfaces, halos, rays, bloom) and a
// resting layout for when the driver never starts (prefers-reduced-motion).

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

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

type Vec = { x: number; y: number };

type SkyState = {
  p: number;
  phase: number;
  sun: Vec;
  earth: Vec;
  mars: Vec;
  moon: Vec;
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

/**
 * Start the sky driver. Returns a stop function that cancels the loop and
 * clears the inline styles it set. Honours prefers-reduced-motion by not
 * starting at all (the stylesheet then rests on plain, statically-placed
 * planets).
 */
export function startTitleSky(els: SkyElements): () => void {
  const reduce = window.matchMedia?.(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  if (reduce) return () => {};

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
