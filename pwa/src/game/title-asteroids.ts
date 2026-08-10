// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE BELT, FLYING — the driver for the rocks that pass the main menu.
//
// Split three ways, the same split the orrery has: `title-belt.ts` is the
// CATALOGUE and the dice (what the belt is made of, how often a rock comes,
// how fast, how big), `@ui/lib/asteroid-rock.ts` is the PAINTER (what a lumpy
// airless body looks like), and this file is the CAMERA — the projection, the
// clock and the one canvas it all lands on.
//
// TWO DESIGN DECISIONS ARE WORTH KNOWING BEFORE READING ANY OF IT:
//
// ONE CANVAS, NOT ONE ELEMENT PER ROCK. The orrery gives every planet a div,
// because a planet is a persistent thing at a persistent depth that has to
// sort against the sun and against the other planets — and z-index is how that
// sort is expressed. A rock needs none of that. Every asteroid here is tens of
// kilometres from the camera while every planet is at least an AU, so THE
// WHOLE BELT IS IN FRONT OF THE WHOLE SOLAR SYSTEM, always, and a single
// full-frame canvas above the orrery's z-band says that once instead of
// writing an inline z-index sixty times a second. It also means the rocks
// occlude each other correctly for free (painter's algorithm, far to near) and
// that an irregular silhouette is a `lineTo` rather than a `border-radius`.
//
// THE BELT IS A PURE FUNCTION OF THE CLOCK. Arrivals are Poisson (see
// `nextGapMs`), and the obvious way to run a Poisson process is to keep a
// cursor and step it forward — which makes the belt depend on how the clock
// was walked rather than on what it says, and quietly breaks `__skyFreeze`,
// the pin the whole verification harness is built on. So time is cut into
// fixed BUCKETS and each bucket deterministically produces its own arrivals
// from its own index: a Poisson count, uniform times inside the bucket, which
// is exactly a Poisson process and needs no memory at all. Pin the clock and
// the same rocks are in the same places; scrub it backwards and they come
// back. The bucket cache below is a speed-up, never a state.

import { EARTH_SPIN_MS } from "./title-planets.ts";
import {
  paintRock,
  clearRockBakes,
  type RockLight,
  type RockLook,
} from "@ui/lib/asteroid-rock.ts";
import {
  ARRIVAL_MS,
  FOCAL,
  MAX_LIVE,
  SIGHT_S,
  flybyAt,
  lcg,
  rollFlyby,
  type Flyby,
} from "./title-belt.ts";

/** An hour on the sky's SPIN clock — the same clock every planet's day turns
 * on, so a 2.2-hour rotator is right against Jupiter's ten-hour one. */
const SPIN_MS_PER_HOUR = EARTH_SPIN_MS / 24;

/** How long a bucket of time is. One mean gap: a bucket then averages one
 * arrival, which keeps the Poisson draw a two-line inversion. */
const BUCKET_MS = ARRIVAL_MS;

/** The longest a fly-by can last (ms) — `SIGHT_S` either side of closest
 * approach, plus a beat. It is how far back the bucket sweep has to look. */
const MAX_LIFE_MS = SIGHT_S * 2000 + 1000;

/** Fractions of a fly-by's life spent fading in and out. The rock is picked up
 * at the detection limit, so it comes out of the starfield rather than
 * appearing in front of it; the tail is a backstop for the few that are still
 * on screen when their window closes. */
const FADE_IN = 0.16;
const FADE_OUT = 0.07;

/** Below this many pixels a rock is one more speck in a sky full of them. */
const MIN_PX = 1.4;

/**
 * ALBEDO ON SCREEN. The classes span a factor of twelve, from the D-types at
 * 0.045 to the enstatite E-types at 0.55, and a linear map of that onto the
 * screen puts three-quarters of the belt below the black point — which would
 * be honest about the physics and useless as a picture, because the sun at
 * 3 AU is already delivering a ninth of the light it gives Earth.
 *
 * So the albedo is raised to a power and scaled: a display gamma, the same
 * thing a camera does. It leaves a spread of three to one rather than twelve,
 * and — the part that matters — it leaves the ORDER and the relative gaps
 * intact. The ladder comes out D 0.32, C 0.38, M 0.59, S 0.67, V 0.88, E 0.99:
 * a C-type is still visibly a dark rock, an S-type is plainly brighter and
 * browner, and an E-type still reads as ice-bright. The gain is set so that
 * nothing CLIPS — an E-type pinned at white would flatten the top two rungs
 * into each other, which is the one thing the ladder cannot survive.
 */
const ALBEDO_GAMMA = 0.45;
const ALBEDO_GAIN = 1.3;

/** Everything the driver needs to know about the frame this tick. */
export type BeltView = {
  /** Viewport, CSS px. */
  vw: number;
  vh: number;
  /** Short side — the unit every screen offset in this sky is measured in. */
  u: number;
  /** Where the camera axis points: the frame's centre, panned. */
  vanX: number;
  vanY: number;
  /** Where the sun is drawn. The rocks are lit from it, which is the one law
   * the sky harness checks (`pwa/scripts/verify-sky.mjs`). */
  sunX: number;
  sunY: number;
  /** The orrery's zoom. A pinhole camera zooms by growing its focal length,
   * so this multiplies the projection and nothing else needs to know. */
  zoom: number;
};

export type Belt = {
  drive: (t: number, view: BeltView) => void;
  stop: () => void;
};

/** What the belt drew this frame, for a harness to read back. The orrery
 * publishes `__skyState` for exactly this reason and the belt needs it more,
 * not less: its rocks are inside a canvas, so there is no element to measure
 * and no `getBoundingClientRect` to ask. */
export type BeltRockState = {
  /** Spectral class id, so a screenshot can be told what it is looking at. */
  cls: string;
  x: number;
  y: number;
  /** Drawn diameter, CSS px. */
  px: number;
  /** Real diameter, km, and how far off it passes. */
  km: number;
  range: number;
  /** Lit fraction, (1 + Lz)/2 — 1 at full, 0 at silhouette. */
  lit: number;
};

declare global {
  interface Window {
    /** Live geometry for every rock the belt drew this frame. */
    __beltState?: BeltRockState[];
  }
}

/**
 * WHERE THE LIGHT COMES FROM — and the one place this belt bends a number,
 * stated here rather than buried.
 *
 * THE HONEST GEOMETRY IS UNWATCHABLE, and it is worth walking through because
 * the conclusion is so unintuitive. The camera looks toward the sun: the star
 * is drawn inside the frame. Every rock is fifty-odd kilometres in front of
 * that camera and the sun is three AU beyond it, so every rock is between the
 * viewer and the light — BACKLIT, at a phase angle of 180° minus however far
 * it sits from the star on screen. The frame is 53° wide (FOCAL), so across
 * the whole of it the phase runs 180° down to about 132°, and the lit fraction
 * runs from 0 to 0.17. That is a picture of black rocks, correct in every
 * particular, and no use at all — worse than no use, because the sun's warm
 * glare is screen-blended over the sky and a black rock underneath it reads as
 * a smear rather than a body.
 *
 * SO THE PHASE IS STRETCHED, and only stretched. The direction is real: the
 * lit limb always faces the star, which is the same law the sky harness checks
 * every planet against (`pwa/scripts/verify-sky.mjs`). The ORDER is real: a
 * rock crossing near the sun is a silhouette or a hairline crescent, and one
 * out at the frame's edge is nearly full — near the star means backlit, which
 * is exactly the way round it goes in life. What is invented is the RATE: the
 * angular separation is multiplied by `PHASE_STRETCH` before the phase is
 * taken from it, so a frame that really spans 48° of separation spends the
 * whole run from silhouette to full instead of the sliver of it that it owns.
 *
 * It is the same bargain the rest of this sky strikes — real ratios, one
 * invented scale — and it buys the thing the belt is for: six spectral classes
 * whose albedos and colours can actually be seen, and rocks that are solid
 * bodies rather than holes in the starfield.
 */
const PHASE_STRETCH = 3.8;

function lightOn(
  cx: number,
  cy: number,
  view: BeltView,
  focal: number,
): RockLight {
  // Toward the star, across the screen.
  const dx = view.sunX - cx;
  const dy = view.sunY - cy;
  const d = Math.hypot(dx, dy);
  // Angular separation through the same pinhole the rocks are projected with,
  // then stretched. Beyond half a turn the rock is simply full.
  const sep = Math.atan2(d / view.u, focal) * PHASE_STRETCH;
  // Phase angle φ = 180° − separation; the light's component toward the viewer
  // is cos φ, and what is left lies in the screen plane pointing at the star.
  const cz = -Math.cos(Math.min(Math.PI, sep));
  const plane = Math.sqrt(Math.max(0, 1 - cz * cz));
  const ux = d > 1e-6 ? dx / d : 0;
  const uy = d > 1e-6 ? dy / d : 0;
  return { x: ux * plane, y: uy * plane, z: cz };
}

/** One bucket's arrivals, rolled from its index alone. */
function bucketFlybys(index: number): Flyby[] {
  // Mix the index so neighbouring buckets do not produce near-identical draws:
  // a plain LCG seeded with n and n+1 walks almost in step.
  let h = (index * 0x9e3779b1) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  const rnd = lcg(h || 1);

  // Poisson(1) by inversion — the count of arrivals in one mean gap.
  const target = rnd();
  let n = 0;
  let p = Math.exp(-1);
  let cum = p;
  while (cum < target && n < 6) {
    n += 1;
    p /= n;
    cum += p;
  }

  const out: Flyby[] = [];
  for (let i = 0; i < n; i++) {
    out.push(rollFlyby(rnd, (index + rnd()) * BUCKET_MS, SPIN_MS_PER_HOUR));
  }
  return out;
}

/**
 * Start the belt on `canvas`. Returns a driver the sky's frame loop calls and
 * a stop that puts the canvas back the way it found it.
 */
export function createBelt(canvas: HTMLCanvasElement): Belt {
  const ctx = canvas.getContext("2d");
  const cache = new Map<number, Flyby[]>();
  let cw = 0;
  let ch = 0;

  const flybysAround = (t: number): Flyby[] => {
    const first = Math.floor((t - MAX_LIFE_MS) / BUCKET_MS);
    const last = Math.floor(t / BUCKET_MS);
    const live: Flyby[] = [];
    for (let b = first; b <= last; b++) {
      let rolled = cache.get(b);
      if (!rolled) {
        rolled = bucketFlybys(b);
        cache.set(b, rolled);
      }
      for (const f of rolled) if (t >= f.from && t <= f.to) live.push(f);
    }
    // The cache is a speed-up, not a state: anything outside the window this
    // frame asked about is dropped, so scrubbing the clock cannot grow it.
    if (cache.size > 64) {
      for (const b of cache.keys()) {
        if (b < first || b > last) cache.delete(b);
      }
    }
    return live;
  };

  const drive = (t: number, view: BeltView): void => {
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(view.vw * dpr);
    const h = Math.round(view.vh * dpr);
    if (w !== cw || h !== ch) {
      canvas.width = w;
      canvas.height = h;
      canvas.style.width = `${view.vw}px`;
      canvas.style.height = `${view.vh}px`;
      cw = w;
      ch = h;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, view.vw, view.vh);
    const state: BeltRockState[] = [];

    const f = FOCAL * view.zoom;

    // Far to near, so a nearer rock paints over a farther one — and if a
    // Poisson clump ever puts more in the frame than MAX_LIVE, it is the
    // FARTHEST that go, because they are the ones nobody would miss.
    const sorted = flybysAround(t)
      .map((fly) => ({ fly, p: flybyAt(fly, t) }))
      .filter((r) => r.p.z > 0.05)
      .sort((a, b) => b.p.z - a.p.z);
    const live = sorted.slice(Math.max(0, sorted.length - MAX_LIVE));

    for (const { fly, p } of live) {
      const persp = f / p.z;
      const d = fly.rock.km * persp * view.u;
      if (d < MIN_PX) continue;
      const cx = view.vanX + p.x * persp * view.u;
      const cy = view.vanY + p.y * persp * view.u;
      const m = d;
      if (cx < -m || cy < -m || cx > view.vw + m || cy > view.vh + m) continue;

      const age = (t - fly.from) / (fly.to - fly.from);
      const alpha =
        Math.min(1, age / FADE_IN) * Math.min(1, (1 - age) / FADE_OUT);
      if (alpha <= 0.01) continue;

      const light = lightOn(cx, cy, view, f);

      const [hr, hg, hb] = fly.rock.cls.hue;
      const level = Math.min(
        1,
        Math.pow(fly.rock.cls.albedo, ALBEDO_GAMMA) * ALBEDO_GAIN,
      );
      const look: RockLook = {
        a: fly.rock.a,
        b: fly.rock.b,
        c: fly.rock.c,
        seed: fly.rock.seed,
        body: [hr * level * 255, hg * level * 255, hb * level * 255],
        fresh: fly.rock.cls.fresh,
        sheen: fly.rock.cls.sheen,
        // A small body holds craters poorly — a rubble pile is boulders and
        // degraded bowls (Itokawa, Bennu, Ryugu), while a ten-kilometre
        // monolith is saturated with them (Eros, Ida, Mathilde).
        pitted: Math.min(1, 0.25 + fly.rock.km * 0.28),
      };
      paintRock(
        ctx,
        look,
        cx,
        cy,
        d / 2,
        t / fly.rock.spinMs,
        fly.rock.tumbleMs ? t / fly.rock.tumbleMs : 0,
        fly.rock.tilt,
        light,
        alpha,
      );
      state.push({
        cls: fly.rock.cls.id,
        x: cx,
        y: cy,
        px: d,
        km: fly.rock.km,
        range: Math.hypot(p.x, p.y, p.z),
        lit: (1 + light.z) / 2,
      });
    }
    window.__beltState = state;
  };

  const stop = (): void => {
    ctx?.setTransform(1, 0, 0, 1, 0, 0);
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    canvas.style.width = "";
    canvas.style.height = "";
    delete window.__beltState;
    cache.clear();
    clearRockBakes();
  };

  return { drive, stop };
}
