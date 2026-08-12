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
//   • REAL SIZES. Every disc is its true diameter over Earth's, times one
//     scale — so Jupiter really is 11.2 Earths across here, Mercury really is
//     0.38, and the Moon really is a quarter of the planet beside it. See
//     EARTH_DISC.
//   • REAL PERIODS. Every planet's year is its true one on one clock, so the
//     ratios between them are exact: Mercury takes 0.241 of Earth's, Neptune
//     164.8 of it. See ORBIT_YEARS.
//   • REAL MOONS — twenty of them, in `title-moons.ts`, each on its planet's
//     own equator rather than on the ecliptic.
//
// ONE THING IS DELIBERATELY NOT TO SCALE, and it cannot be:
//
//   • DISTANCE. An honest solar system is almost entirely empty. Neptune's
//     orbit is 77 times Mercury's, so a single kilometres-per-pixel scale that
//     fits Neptune on a phone puts Mercury, Venus and Earth inside the sun's
//     own disc — and one that separates those four puts Jupiter three screens
//     out. So the true axes (ORBIT_AU) are turned into pixels by two chosen
//     numbers and only two — AU_UNITS, the framing, and SKY_SCALE, how big the
//     picture is drawn — and those are the only invented lengths in the sky.
//
// TIME NEEDS THREE CLOCKS, for the same reason, and each is exact inside
// itself: the planets' orbits (a year is 64 s), the satellites' orbits (a day
// is 6 s — on the planets' clock Io's orbit would last a third of a second),
// and axial spins (a day is 22 s — on the planets' clock a day would be 0.175 s
// and every world would strobe). Only the RATIOS BETWEEN the three are
// invented; no two bodies inside one of them are wrong against each other.
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
import { getSettings } from "./settings.ts";
import { orbitAt, type World } from "@ui/lib/orbit.ts";
import type { GlobeLight, PlanetGlobe } from "@ui/lib/planet-globe.ts";
import { createBelt } from "./title-asteroids.ts";
import {
  AU_UNITS,
  DEPTH_FADE,
  DIAMETER_KM,
  EARTH_SPIN_MS,
  ORBIT_AU,
  ORBIT_YEARS,
  SUN_Z,
  Z_SPREAD,
  discSize,
  moonBody,
  orbitPeriodMs,
  planetTable,
  spinMs,
  type Planet,
} from "./title-planets.ts";
import {
  isPoint,
  layoutSatellites,
  satelliteOffset,
  POINT_PX,
  type ParentName,
  type SatelliteScreen,
} from "./title-moons.ts";

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
  /** The camera's current zoom (1 = at rest). */
  zoom?: number;
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
    /** Test hook: put the camera at a zoom, centred. The gestures that would
     * otherwise do it are behind a developer switch (see `wireCamera`), and a
     * harness checking the geometry should not have to turn a setting on and
     * synthesise a pinch to see Neptune. */
    __skyZoom?: (zoom: number) => void;
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
  /** An empty box the driver fills with one element per SATELLITE. The other
   * bodies are written into the markup one by one, and these are not, because
   * twenty hand-written divs would be a data table typed out as JSX — the
   * catalogue in `title-moons.ts` is the list, and this is where it lands. */
  satellites: HTMLElement;
  /** ONE full-frame canvas for the whole asteroid belt. Not an element per
   * rock: every asteroid is tens of kilometres from the camera while every
   * planet is at least an AU, so the belt is in front of the entire solar
   * system at all times and needs no depth sort against it — see
   * `title-asteroids.ts`. */
  belt: HTMLCanvasElement;
};

// The sun's fixed seat, in fractions of the viewport. Held in the upper sky so
// the inner orbits ride above the centred menu. It NEVER moves, which is what
// lets the stylesheet park the sun's detonation overlay (`.sun-boom`) and its
// reduced-motion resting spot on the same fractions without the driver writing
// a live position anywhere — keep the two in step.
//
// IT IS ALSO THE GIANTS' ENTIRE HEADROOM (see ECLIPTIC_PITCH), which is why it
// moved down from 0.32: every hundredth here is a hundredth of conjunction
// height a superior world may spend. It does NOT go further. At 0.42 the star
// sits directly behind the first menu row and its glare eats the label — the
// backdrop swallowing the one word the screen exists to offer — so the rest of
// the headroom is bought from the pitch instead.
const SUN_X = 0.5;
const SUN_Y = 0.36;

/** One unhurried master loop. A frozen progress maps 0..1 onto 0..CYCLE_MS of
 * orbital time, so a pinned frame reproduces the same geometry. */
const CYCLE_MS = 240_000;

/**
 * WHERE THE CLOCK STARTS, and it is a real decision rather than a fudge.
 *
 * The elements below are J2000, so with no offset the sky opens on the
 * arrangement of 1 January 2000 — and on that date three of the four giants sit
 * on the near half of their orbits, which from a camera parked at 3 AU means
 * BEHIND THE VIEWER (see CAM_AU). They are therefore not drawn. That was
 * survivable while the periods were invented and Saturn came round every thirty
 * seconds; on the true periods it means no Saturn for a quarter of an hour and
 * no Uranus for the better part of an afternoon.
 *
 * So the sky opens on a different date — one where the giants are past
 * conjunction and in view. Choosing WHEN to look at a real sky is not the same
 * kind of liberty as changing how it moves: every position is still the one the
 * elements give, and a viewer who waits long enough sees each giant slide out
 * of sight exactly as it should. It is the same choice a planetarium makes
 * every time it picks a date.
 *
 * IT IS TIED TO SKY_SCALE, so it is re-chosen whenever the picture is resized.
 * "In view" is a claim about the FRAME, and a Jupiter that comfortably crossed
 * it at one scale rides past the corner at twice that — which is what happened
 * here: the date that opened on all four giants at the old scale opened on none
 * of them at this one. This one shows Jupiter for roughly half of the first
 * four minutes and Saturn for a third, at the reference landscape phone and at
 * a desktop alike.
 */
const EPOCH_MS = 1_060_000;

const DEG = Math.PI / 180;

/**
 * How far the camera sits above the ecliptic. Small, because the viewpoint is
 * very nearly IN the plane — which is also what lets the outer planets, whose
 * orbits are far wider than the frame, come back into it near conjunction
 * instead of riding off the top of the screen. It is handed to every globe as
 * well, because the axial tilts have to lean against the same plane the orbits
 * are projected onto.
 *
 * It is a BUDGET as much as an angle, and the budget is the whole reason for
 * the number. A superior world is only ever seen near CONJUNCTION (see CAM_AU),
 * and at conjunction it sits r·sin(pitch) above the sun on screen. The sun's
 * seat leaves SUN_Y of the short side above it, and in LANDSCAPE the short side
 * IS the height — so that fraction is the entire allowance at every landscape
 * viewport there is. A world whose conjunction wants more than the allowance is
 * not cropped, it is RETIRED: no moment of its orbit is in frame.
 *
 * IT USED TO BE 9°, AND THAT QUIETLY RETIRED THREE OF THE FOUR GIANTS. The old
 * number was chosen against Jupiter alone and it did hold Jupiter — but
 * `pwa/scripts/sky-visibility.mjs`, which measures the thing rather than
 * reasoning about it, put Jupiter MOSTLY in frame for 18% of the opening window
 * and Saturn, Uranus and Neptune for 0% of it. Saturn scored 43% on a looser
 * "any part of it" test, and what that 43% actually was is worth stating: its
 * box is 629 px across on a desktop and its top edge sat 575 px ABOVE the
 * frame, so a player saw a sliver of its outer ring creeping along the top and
 * never saw Saturn. Two degrees costs 3.6 units of Saturn's conjunction down to
 * 0.13 and puts the planet, its rings and its shadow on the screen for two
 * thirds of the window.
 *
 * WHAT IT COSTS, plainly: the ecliptic is now very nearly edge-on, so the inner
 * orbits read as a line through the sun rather than as a tilted disc. That is
 * what the sky looks like from inside the plane — which is where this camera
 * is — but it is a real change of picture and not a free one.
 *
 * THREE NUMBERS MOVE TOGETHER HERE and none of them may be changed alone: this,
 * SUN_Y (the allowance itself), and SKY_SCALE (which scales every r). Re-run
 * `sky-visibility.mjs` after touching any of them.
 */
const ECLIPTIC_PITCH = 2 * DEG;

/**
 * WHERE THE CAMERA STANDS, in AU: parked in the gap between Mars and Jupiter,
 * where the asteroid belt is. That one number sorts the system into two kinds
 * of world and is the reason the giants behave:
 *
 *   • INSIDE it — Mercury, Venus, Earth, Mars and their moons — are inferior
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
 *
 * IT IS IN AU AND NOT IN SCREEN UNITS, which matters now that the camera can
 * zoom: whether a world is inferior or superior is a fact about where the
 * viewer stands in the solar system, not about how far the picture is currently
 * pulled back.
 */
const CAM_AU = 3;

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

/** How much of a body the star's glare may swallow when it passes dead behind
 * it, and over how much depth that reaches full strength. See the swamp block
 * in `paint`. */
const SWAMP = 0.85;
const SWAMP_DEPTH = 0.35;

/** A slight roll of the whole plane, so the system sits at an angle across the
 * frame rather than lying on a ruled horizontal line. */
const ECLIPTIC_ROLL = -0.12;

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
 * THE CAMERA THE VIEWER OWNS — zoom, and pan.
 *
 * It exists because the distances are true now. A single kilometres-per-pixel
 * scale cannot show this system on one screen (see ORBIT_AU), so the frame
 * stopped trying: the picture is correct at every zoom, and the zoom is how
 * much of it you are looking at. Pull back far enough and Neptune's orbit comes
 * inside the frame; push in and Earth's continents are legible again.
 *
 * IT IS BEHIND A DEVELOPER SWITCH (`skyCamera`), and deliberately so for now.
 * The title screen is a menu first: taking the wheel and the pinch away from
 * the page is a real cost, and it is not obviously worth paying for a player
 * who came here to press NEW GAME. What it IS worth is being able to look at
 * the sky and check it — which is exactly what a developer switch is for.
 */
const ZOOM_MIN = 0.04;
const ZOOM_MAX = 12;
/** One wheel notch, as a multiplier. Gentle: a trackpad sends a lot of them. */
const WHEEL_STEP = 1.0015;

type Camera = { zoom: number; x: number; y: number };

/**
 * Wire the wheel, the pinch and the drag to a camera — and take nothing at all
 * unless the switch is on, because every one of these is a gesture the menu
 * underneath has its own use for.
 *
 * Zoom is ANCHORED ON THE POINTER: the world point under the cursor stays under
 * the cursor, which is the difference between a camera you can aim and one that
 * always pulls toward the middle. Since the projection is orthographic, that is
 * one similar-triangles line rather than a matrix.
 */
function wireCamera(cam: Camera, enabled: () => boolean): () => void {
  const pointers = new Map<number, { x: number; y: number }>();
  let pinch = 0;

  const zoomAt = (factor: number, px: number, py: number): void => {
    const next = clamp(cam.zoom * factor, ZOOM_MIN, ZOOM_MAX);
    const k = next / cam.zoom;
    if (k === 1) return;
    // Hold the point under the pointer: it sits at (p − sun − pan) in screen
    // units, and scaling by k must leave it where it is.
    const sunCx = SUN_X * window.innerWidth + cam.x;
    const sunCy = SUN_Y * window.innerHeight + cam.y;
    cam.x += (px - sunCx) * (1 - k);
    cam.y += (py - sunCy) * (1 - k);
    cam.zoom = next;
  };

  const onWheel = (e: WheelEvent): void => {
    if (!enabled()) return;
    e.preventDefault();
    zoomAt(Math.pow(WHEEL_STEP, -e.deltaY), e.clientX, e.clientY);
  };
  const onDown = (e: PointerEvent): void => {
    if (!enabled()) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    pinch = 0;
  };
  const onMove = (e: PointerEvent): void => {
    if (!enabled() || !pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId) as { x: number; y: number };
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const all = [...pointers.values()];
    if (all.length >= 2) {
      // Two fingers: the SPREAD is the zoom and the midpoint is its anchor.
      const [a, b] = all as [
        { x: number; y: number },
        { x: number; y: number },
      ];
      const span = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch > 0 && span > 0) {
        zoomAt(span / pinch, (a.x + b.x) / 2, (a.y + b.y) / 2);
      }
      pinch = span;
      return;
    }
    cam.x += e.clientX - prev.x;
    cam.y += e.clientY - prev.y;
  };
  const onUp = (e: PointerEvent): void => {
    pointers.delete(e.pointerId);
    pinch = 0;
  };

  window.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
  return () => {
    window.removeEventListener("wheel", onWheel);
    window.removeEventListener("pointerdown", onDown);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
  };
}

/**
 * Start the orbital sky driver. Returns a stop function that cancels the loop
 * and clears the inline styles it set. Honours prefers-reduced-motion by not
 * starting at all (the stylesheet then rests on plain, statically-placed
 * planets).
 */
export function startTitleSky(els: SkyElements): () => void {
  if (prefersReducedMotion()) return () => {};

  const { sun, glare, earth, moon } = els;
  const belt = createBelt(els.belt);
  let raf = 0;

  const planets = planetTable(els);
  for (const p of planets) {
    p.ms = orbitPeriodMs(p.kind as keyof typeof ORBIT_YEARS);
    p.spin = spinMs(p.rotDays);
    if (p.cloudDays) p.cloudMs = spinMs(p.cloudDays);
  }
  const moonOrbit = moonBody(moon);
  // Tidal lock: the rotation IS the orbit.
  moonOrbit.spin = moonOrbit.ms;

  // The other twenty satellites. They are DRIVER-OWNED elements rather than
  // markup, because they are a catalogue rather than a layout — see
  // `SkyElements.satellites`.
  const parentDisc = {
    mars: discSize("mars"),
    jupiter: discSize("jupiter"),
    saturn: discSize("saturn"),
    uranus: discSize("uranus"),
    neptune: discSize("neptune"),
  } as Record<ParentName, number>;
  const parentKm = {
    mars: DIAMETER_KM.mars,
    jupiter: DIAMETER_KM.jupiter,
    saturn: DIAMETER_KM.saturn,
    uranus: DIAMETER_KM.uranus,
    neptune: DIAMETER_KM.neptune,
  } as Record<ParentName, number>;
  // A satellite and the geometry it was laid out from travel TOGETHER, in one
  // object. They used to be two arrays walked by a shared index, and the only
  // thing keeping Io off Saturn was that the two `.map`s stayed in step —
  // a pairing nothing would have caught breaking, because a moon drawn round
  // the wrong planet still draws.
  const moons: { body: Planet; sat: SatelliteScreen }[] = layoutSatellites(
    parentDisc,
    parentKm,
  ).map((sat) => {
    const el = document.createElement("div");
    el.className = "title-planet title-satellite";
    el.setAttribute("aria-hidden", "true");
    els.satellites.appendChild(el);
    const body: Planet = {
      el,
      label: sat.def.id,
      kind: sat.def.kind,
      au: ORBIT_AU[sat.def.parent],
      r: sat.orbit,
      e: sat.def.e,
      inc: sat.def.inc,
      node: 0,
      peri: 0,
      l0: sat.def.l0,
      base: sat.disc,
      // Tidally locked, every one of them: the spin IS the orbit, which is why
      // they keep one face turned at their planet for ever.
      rotDays: 0,
      satellite: true,
      ms: sat.ms,
      spin: sat.ms,
      tint: sat.def.tint,
      lum: sat.lum,
    };
    return { body, sat };
  });

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
  // Then they are built ONE PER FRAME rather than all at once, because building
  // one BAKES its surface texture and that costs milliseconds: the difference
  // between a hitch on the way into the menu and no hitch at all. (The bakes
  // are cached per world, so coming back to the title screen is free.)
  //
  // A SATELLITE ONLY EVER GETS ONE IF IT EARNS ONE. Sized true, most of them
  // are under four pixels and are drawn as points of light instead (`isPoint`),
  // and a point needs no canvas and no texture — so on a phone the twenty of
  // them cost nothing at all, and on a desktop the handful that are big enough
  // ask for their globe when they first need it.
  const dpr = globeDpr();
  const pending: Planet[] = [...planets, moonOrbit];
  let Globe: typeof PlanetGlobe | undefined;
  let stopped = false;
  void import("@ui/lib/planet-globe.ts").then((m) => {
    if (!stopped) Globe = m.PlanetGlobe;
  });
  const attachGlobe = (o: Planet): void => {
    if (!Globe || o.globe) return;
    const globe = new Globe(o.kind, ECLIPTIC_PITCH);
    const c = globe.canvas;
    c.className = "title-globe";
    c.setAttribute("aria-hidden", "true");
    o.el.appendChild(c);
    o.el.classList.add("has-globe");
    if (globe.padding > 1) o.el.classList.add("has-rings");
    o.globe = globe;
  };

  // Size a disc and centre it via width/height + left/top. Sizing by box (not
  // transform: scale) leaves the moon's transform free for its detonation
  // animation.
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

  const cam: Camera = { zoom: 1, x: 0, y: 0 };
  const unwire = wireCamera(cam, () => getSettings().skyCamera === "on");
  window.__skyZoom = (z: number) => {
    cam.zoom = clamp(z, ZOOM_MIN, ZOOM_MAX);
    cam.x = 0;
    cam.y = 0;
  };

  const frame = (now: number) => {
    const frozen = window.__skyFreeze;
    const pinned = typeof frozen === "number" && Number.isFinite(frozen);
    const p = pinned ? clamp01(frozen as number) : (now % CYCLE_MS) / CYCLE_MS;
    // Orbital time: a pinned progress replays one master loop; otherwise the
    // clock spins the orbits freely (sin/cos are periodic, so no wrap needed).
    const t = (pinned ? p * CYCLE_MS : now) + EPOCH_MS;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const u = Math.min(vw, vh);
    const labels = labelsOn();
    const zoom = cam.zoom;

    const sunCx = SUN_X * vw + cam.x;
    const sunCy = SUN_Y * vh + cam.y;
    const sunD = sun.offsetWidth;
    sun.style.left = `${sunCx - sunD / 2}px`;
    sun.style.top = `${sunCy - sun.offsetHeight / 2}px`;
    sun.style.opacity = "1";
    sun.style.zIndex = String(SUN_Z);

    // Warm glare wash, centred on the sun wherever the camera has put it.
    glare.style.opacity = "0.85";
    glare.style.setProperty("--glare-x", `${(sunCx / vw) * 100}%`);
    glare.style.setProperty("--glare-y", `${(sunCy / vh) * 100}%`);

    const bodies: NonNullable<SkyState["bodies"]> = {};

    /**
     * Paint one body from its position: place it, light it from the sun's real
     * 3D direction, scale and fade it by depth, and sort it around the sun.
     * Everything lands in the DOM.
     */
    const paint = (
      o: Planet,
      world: World,
      orbitR: number,
    ): { cx: number; cy: number; scale: number; far: number } => {
      const s = project(world);
      const cx = sunCx + s.x * u;
      const cy = sunCy + s.y * u;
      // Normalised depth: +1 is straight behind the sun, −1 nearest the camera.
      // It is the EXPOSURE and sorting term, not the size one — see below.
      const far = clamp(-s.depth / Math.max(orbitR, 1e-6), -1, 1);

      // SIZE IS A PERSPECTIVE DIVIDE, because the alternative was obviously
      // wrong on screen. It used to be `1 − DEPTH·far` — linear in depth, and
      // capped at a 30% swing — which meant a world at conjunction was drawn
      // very nearly as large as one at its closest, and Jupiter beyond the sun
      // came out three times WIDER than the sun it was passing behind.
      //
      // The camera is a real place (CAM_AU, 3 AU out along the view axis), so
      // the honest term is its actual distance to the body: scale = camZ /
      // |body − camera|, normalised so something at the sun's own distance is
      // drawn at 1. Jupiter at conjunction is 8.2 AU from here against the
      // sun's 3, so it comes out at about a third of the size it was — and
      // Saturn, further still, at a quarter.
      //
      // IT IS NOT THE WHOLE TRUTH AND IS NOT MEANT TO BE. Angular size would
      // also have the sun 27× wider than Jupiter, and the sun cannot be drawn
      // on the planets' disc scale at all (it would be five screens across —
      // see EARTH_DISC). What this buys is that distance now reads as distance
      // and nothing is grotesque; the star is simply given a size of its own.
      //
      // The clamp is a safety rail rather than a look: a superior world on the
      // near half of its loop passes BEHIND the camera, where the divide would
      // blow up. It is hidden long before that (PAST_FADE), so the rail is
      // never the thing you see.
      const camZ = CAM_AU * AU_UNITS * zoom;
      const dist = Math.hypot(s.x, s.y, camZ - s.depth);
      const scale = clamp(camZ / Math.max(dist, 1e-6), 0.06, 2.5);
      // The whole box, rings included: a ringed world's canvas is wider than
      // its disc, and `base` is the DISC.
      const pad = o.globe?.padding ?? 1;
      const disc = o.base * zoom * u * scale;

      // A BODY TOO SMALL TO BE A DISC IS A POINT OF LIGHT, not a small disc.
      // Sized true and seen from here, most of this sky is under a pixel across
      // — every satellite on a phone, and every planet once the camera pulls
      // back far enough to hold Neptune. A point makes no claim about size (see
      // POINT_PX): what separates two of them is BRIGHTNESS, which is exactly
      // how the real sky separates them.
      const point = isPoint(disc);
      const d = point ? POINT_PX : disc * pad;

      // Has this world started round the front? Only a SUPERIOR one can be
      // hidden for it — inside CAM_AU the whole loop is in view, which is why
      // Mars still swings round and transits and Jupiter never does. `past` is
      // how far into the hidden half it has gone: 0 as it draws level with the
      // sun, 1 at the point directly behind the viewer.
      const past = o.au > CAM_AU ? Math.max(0, -far) : 0;
      const leaving = clamp01(past / PAST_FADE);

      // Off-frame worlds cost nothing: most of this system is outside the
      // viewport at any one time and there is no reason to shade a sphere
      // nobody can see. (The margin keeps a halo from popping at the edge.)
      const m = Math.max(d, 8);
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
      // How much of the lit face is turned toward us: 1 at full, 0 at new.
      const lit = clamp01((1 + light.z) / 2);

      // Depth is EXPOSURE, not alpha: the shader takes it and paints a darker
      // world, so the back of a loop dims into the sky without the sky showing
      // through it — and a superior world on its way round the front goes out
      // the same way, dark before it is gone.
      const dim =
        (1 - DEPTH_FADE * Math.max(0, far)) * Math.pow(1 - leaving, 1.6);
      if (point) {
        // A spark: its own colour, dimmed by its phase and its distance. No
        // canvas, no texture, no globe — which is why twenty satellites on a
        // phone cost nothing.
        o.globe?.canvas.style.setProperty("display", "none");
        const [r, g, b] = o.tint ?? [235, 235, 235];
        const a = (o.lum ?? 1) * dim * (0.25 + 0.75 * lit);
        o.el.style.background = `radial-gradient(circle at 50% 50%, rgba(${r}, ${g}, ${b}, ${a.toFixed(3)}) 0 42%, rgba(${r}, ${g}, ${b}, 0) 100%)`;
        o.el.style.boxShadow = "none";
      } else {
        if (!o.globe) attachGlobe(o);
        o.el.style.background = "";
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
        // The halo is scattered light, so it fades with the phase: full when
        // the lit face is toward us, gone at new.
        if (o.halo) {
          const [hr, hg, hb, blur, alpha] = o.halo;
          const a = alpha * (0.12 + 0.88 * lit) * (1 - leaving);
          o.el.style.boxShadow = `0 0 ${blur * zoom}px rgba(${hr}, ${hg}, ${hb}, ${a.toFixed(3)})`;
        } else {
          o.el.style.boxShadow = "none";
        }
      }
      o.el.style.zIndex = String(depthZ(s.depth));
      // A PLANET IS OPAQUE, and there is exactly one thing that may make one
      // see-through: passing BEHIND the sun, where the star's own light swamps
      // it. That is an occlusion, not a phase — and phase is the shader's job
      // anyway.
      //
      // BOTH HALVES OF IT RAMP, and the depth half is the one that bites. A
      // body crosses far = 0 at MAXIMUM ELONGATION — the widest, most watchable
      // point of its orbit, and the exact frame the eye is on — so a fade
      // switched on the sign of `far` makes it visibly jump as it rounds the
      // side of the star. It comes on over SWAMP_DEPTH of depth instead, which
      // is zero at the crossing and so cannot be seen happening.
      let op = 1 - clamp01((leaving - GONE_AT) / (1 - GONE_AT));
      if (far > 0) {
        const near = clamp01(
          Math.hypot(cx - sunCx, cy - sunCy) / (sunD * 0.75 + d),
        );
        op *= 1 - SWAMP * (1 - near) * clamp01(far / SWAMP_DEPTH);
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

    // The planets, each on the ecliptic, each about the sun.
    const worlds = new Map<string, World>();
    let earthWorld: World = { x: 0, y: 0, z: 0 };
    let earthPlaced = { cx: sunCx, cy: sunCy, scale: 1, far: 0 };
    for (const o of planets) {
      const world = orbitAt(
        t,
        o.ms as number,
        o.r * zoom,
        o.e,
        o.inc,
        o.node,
        o.peri,
        o.l0,
      );
      worlds.set(o.kind, world);
      const placed = paint(o, world, o.r * zoom);
      if (o.el === earth) {
        earthWorld = world;
        earthPlaced = placed;
      }
    }

    // The Moon rides its own inclined orbit around the Earth's live position,
    // so it can slip in front of and behind its planet as well as swing round
    // the sun with it.
    //
    // ITS DEPTH IS MEASURED THE SAME WAY EVERY OTHER BODY'S IS — against the
    // orbit it is riding round the sun, which is the EARTH's. That is what
    // holds the quarter-Earth disc at a quarter all the way round.
    const mo = orbitAt(
      t,
      moonOrbit.ms as number,
      moonOrbit.r * zoom,
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
      ORBIT_AU.earth * AU_UNITS * zoom,
    );

    // …and the other twenty, each about ITS OWN planet, in that planet's
    // equatorial plane rather than in the ecliptic (`satelliteOffset`).
    for (const { body, sat } of moons) {
      const host = worlds.get(sat.def.parent);
      if (!host) continue;
      const off = satelliteOffset(sat, t);
      paint(
        body,
        {
          x: host.x + off.x * zoom,
          y: host.y + off.y * zoom,
          z: host.z + off.z * zoom,
        },
        ORBIT_AU[sat.def.parent] * AU_UNITS * zoom,
      );
    }

    // The belt. It is handed the sun's DRAWN seat rather than a light vector,
    // because a pinhole camera can read the direction back off the screen
    // position — and doing it that way means the rocks are lit from wherever
    // the viewer can see the star, at any zoom or pan.
    belt.drive(t, {
      vw,
      vh,
      u,
      vanX: vw / 2 + cam.x,
      vanY: vh / 2 + cam.y,
      sunX: sunCx,
      sunY: sunCy,
      zoom,
    });

    // One globe per frame, once the shader has arrived, until every world that
    // wants one has one.
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
      zoom,
      bodies,
    };

    raf = window.requestAnimationFrame(frame);
  };

  raf = window.requestAnimationFrame(frame);

  return () => {
    stopped = true;
    window.cancelAnimationFrame(raf);
    unwire();
    delete window.__skyZoom;
    for (const o of [...planets, moonOrbit, ...moons.map((m) => m.body)]) {
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
      el.style.background = "";
      el.style.alignItems = "";
      el.style.justifyContent = "";
      el.style.textShadow = "";
      el.textContent = "";
    }
    for (const { body } of moons) body.el.remove();
    belt.stop();
    sun.style.left = "";
    sun.style.top = "";
    sun.style.opacity = "";
    sun.style.zIndex = "";
    glare.style.opacity = "";
  };
}
