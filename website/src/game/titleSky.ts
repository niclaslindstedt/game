// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The main-menu "sun glare" Easter egg, driven so the moon is lit *correctly*.
//
// A single slow progress value (one loop every CYCLE_MS) sends the sun on an
// arc across the sky and sets the moon's phase. Two rules make it match the
// real sky in any viewport orientation:
//
//   1. Direction — the moon's shadow is offset *away from the sun*, using the
//      elements' actual on-screen centres. So the lit limb always points at
//      the sun, whether the sun is left, right, above or below the moon, and
//      whether the screen is landscape or portrait. (The old version only ever
//      slid the shadow left↔right, which is wrong the moment the sun isn't
//      horizontally level with the moon.)
//
//   2. Phase — the moon is only full when the sun is *gone*. While the sun is
//      above the horizon the moon is all but black (a thin sun-lit rim); as the
//      sun sets and passes "behind" the sky the moon swells to full, peaking at
//      the dead of night, then wanes back to new before the sun rises again.
//      That is the true full-moon-at-midnight geometry: a full moon sits
//      opposite the sun, so you never see both blazing at once.
//
// Everything is set as inline styles / CSS custom properties each frame; the
// stylesheet only supplies the static look (gradients, rays, bloom).

export type SkyElements = {
  sun: HTMLElement;
  glare: HTMLElement;
  moon: HTMLElement;
};

/** One unhurried loop. The sun is only overhead for the DAY slice of it. */
const CYCLE_MS = 200_000;

/** Fraction of the loop the sun spends above the horizon — kept short so the
 * glare is a brief event and the full moon lingers through the long night. */
const DAY = 0.34;

// The sun's arc, in fractions of the viewport. It rises out of one side, crests
// high, and sets on the other; below the horizon it keeps travelling (off the
// bottom) so the terminator direction stays smooth through dusk and dawn.
const SUN_CX = 0.55; // arc centre x
const SUN_RX = 0.42; // horizontal swing
const SUN_HORIZON = 0.82; // y where the sun meets the horizon
const SUN_RY = 0.74; // how high it climbs

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

// Warp progress → orbit angle so the whole daytime arc (0→π) is crossed in the
// first DAY of the loop and the long night (π→2π) fills the rest.
const orbitAngle = (p: number): number =>
  p < DAY ? Math.PI * (p / DAY) : Math.PI + Math.PI * ((p - DAY) / (1 - DAY));

type SkyState = {
  p: number;
  phase: number;
  sun: { x: number; y: number };
  moon: { x: number; y: number };
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
 * starting at all (the stylesheet then rests on a plain full moon).
 */
export function startTitleSky(els: SkyElements): () => void {
  const reduce = window.matchMedia?.(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  if (reduce) return () => {};

  const { sun, glare, moon } = els;
  let raf = 0;

  const frame = (now: number) => {
    const frozen = window.__skyFreeze;
    const p =
      typeof frozen === "number" && Number.isFinite(frozen)
        ? clamp01(frozen)
        : (now % CYCLE_MS) / CYCLE_MS;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const a = orbitAngle(p);
    const az = Math.cos(a); // +1 right … −1 left
    const elev = Math.sin(a); // +1 zenith … −1 nadir (below horizon)
    const sunUp = elev > 0;

    // Sun centre in px, then place the element (top:0/left:0) by its centre.
    const sunCxF = SUN_CX + SUN_RX * az;
    const sunCyF = SUN_HORIZON - SUN_RY * elev;
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
    for (const prop of ["--sky-sx", "--sky-sy"]) {
      moon.style.removeProperty(prop);
    }
    moon.style.boxShadow = "";
    sun.style.transform = "";
    sun.style.opacity = "";
    glare.style.opacity = "";
  };
}
