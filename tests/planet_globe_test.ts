// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE GLOBE SHADER (`@ui/lib/planet-globe.ts`) — the three rules that make the
// title sky's worlds read as worlds rather than as shaded circles:
//
//   • THE CLOUD DECK IS ITS OWN LAYER. Turn only the clouds and the picture
//     must change; turn only the clouds on a world with no weather and nothing
//     may. A deck baked into the surface texture would pass every other check
//     in this file and quietly turn with the ground for ever.
//   • AN AIRLESS WORLD HAS NO LIMB GLOW. Mercury and the Moon get a knife-edge
//     terminator and a hard limb; Earth gets a bright rim, and keeps it when
//     backlit, because sunlight forward-scatters through an atmosphere.
//   • THE LIT SIDE FACES THE LIGHT, at any angle, which is the law the
//     screenshot harness (pwa/scripts/verify-sky.mjs) checks end to end.
//
// The shader needs a canvas, so one is faked below: it is a pure function of
// its inputs into an ImageData buffer, and nothing about it wants a browser.

import { beforeAll, describe, expect, it } from "vitest";

import type { GlobeKind, GlobeLight } from "@ui/lib/planet-globe.ts";

type Rendered = { data: Uint8ClampedArray; res: number };

/** The last buffer each fake canvas was handed, keyed by the canvas object. */
const painted = new WeakMap<object, Rendered>();

/** A canvas just real enough for the shader: a 2d context that can mint an
 * ImageData and be handed one back. */
function fakeDocument(): void {
  const make = (): unknown => {
    const canvas: Record<string, unknown> = {
      width: 0,
      height: 0,
      className: "",
      style: {} as Record<string, string>,
      setAttribute: () => {},
      remove: () => {},
    };
    canvas.getContext = () => ({
      createImageData: (w: number, h: number) => ({
        width: w,
        height: h,
        data: new Uint8ClampedArray(w * h * 4),
      }),
      putImageData: (img: { data: Uint8ClampedArray; width: number }) => {
        painted.set(canvas, { data: img.data, res: img.width });
      },
    });
    return canvas;
  };
  (globalThis as unknown as { document: unknown }).document = {
    createElement: () => make(),
  };
}

let PlanetGlobe: typeof import("@ui/lib/planet-globe.ts").PlanetGlobe;

beforeAll(async () => {
  fakeDocument();
  ({ PlanetGlobe } = await import("@ui/lib/planet-globe.ts"));
});

const SIZE = 64;

/** Render a world and hand back its pixels. */
function shot(
  kind: GlobeKind,
  light: GlobeLight,
  spin: number,
  cloudSpin = spin,
): Rendered {
  const globe = new PlanetGlobe(kind);
  globe.render(SIZE, light, spin, 1, cloudSpin);
  const out = painted.get(globe.canvas as unknown as object);
  if (!out) throw new Error("nothing was painted");
  return { data: out.data.slice(), res: out.res };
}

/** How many pixels differ between two renders of the same world. */
function differing(a: Rendered, b: Rendered): number {
  let n = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    if (
      Math.abs((a.data[i] as number) - (b.data[i] as number)) > 2 ||
      Math.abs((a.data[i + 1] as number) - (b.data[i + 1] as number)) > 2 ||
      Math.abs((a.data[i + 2] as number) - (b.data[i + 2] as number)) > 2
    ) {
      n++;
    }
  }
  return n;
}

/** Mean luminance of the opaque pixels on one side of the disc: `sign` +1 for
 * the half the light comes from, −1 for the other. */
function halfLuma(r: Rendered, light: GlobeLight, sign: number): number {
  const half = r.res / 2;
  let sum = 0;
  let n = 0;
  for (let y = 0; y < r.res; y++) {
    for (let x = 0; x < r.res; x++) {
      const i = (y * r.res + x) * 4;
      if ((r.data[i + 3] as number) < 128) continue;
      const dx = x + 0.5 - half;
      const dy = y + 0.5 - half;
      if ((dx * light.x + dy * light.y) * sign < 0) continue;
      sum +=
        0.299 * (r.data[i] as number) +
        0.587 * (r.data[i + 1] as number) +
        0.114 * (r.data[i + 2] as number);
      n++;
    }
  }
  return n > 0 ? sum / n : 0;
}

/** The brightest pixel anywhere on the disc. */
function peak(r: Rendered): number {
  let best = 0;
  for (let i = 0; i < r.data.length; i += 4) {
    if ((r.data[i + 3] as number) < 128) continue;
    const l =
      0.299 * (r.data[i] as number) +
      0.587 * (r.data[i + 1] as number) +
      0.114 * (r.data[i + 2] as number);
    if (l > best) best = l;
  }
  return best;
}

/** Lit from the left, slightly toward the camera. */
const SIDE: GlobeLight = { x: -0.78, y: -0.1, z: 0.62 };
/** The sun directly BEHIND the world, so we see its unlit face. */
const BEHIND: GlobeLight = { x: 0.02, y: 0, z: -0.999 };

describe("the cloud deck turns on its own", () => {
  it("changes earth's face when only the clouds move", () => {
    const still = shot("earth", SIDE, 0.25, 0.25);
    const drifted = shot("earth", SIDE, 0.25, 0.55);
    // The ground is in exactly the same place in both; only the weather moved.
    expect(differing(still, drifted)).toBeGreaterThan(200);
  });

  it("changes venus's face when only the clouds move", () => {
    // Venus's deck laps the planet sixty times per Venusian day, so this is
    // the ONLY motion the planet has to show.
    const still = shot("venus", SIDE, 0.1, 0.1);
    const drifted = shot("venus", SIDE, 0.1, 0.6);
    expect(differing(still, drifted)).toBeGreaterThan(200);
  });

  it("leaves a world with no weather completely alone", () => {
    for (const kind of ["mars", "moon", "mercury"] as const) {
      const a = shot(kind, SIDE, 0.25, 0.25);
      const b = shot(kind, SIDE, 0.25, 0.8);
      expect(differing(a, b), `${kind} moved something`).toBe(0);
    }
  });

  it("still turns the ground when the ground turns", () => {
    const a = shot("earth", SIDE, 0.1, 0.1);
    const b = shot("earth", SIDE, 0.5, 0.1);
    expect(differing(a, b)).toBeGreaterThan(200);
  });
});

describe("atmospheres, and the worlds without one", () => {
  it("gives an airless world no limb glow when backlit", () => {
    // A new-phase Mercury or Moon is simply not there: no air, nothing to
    // scatter sunlight round the edge. Anything above the ambient floor here
    // would be a glow the body cannot physically have.
    for (const kind of ["mercury", "moon"] as const) {
      expect(peak(shot(kind, BEHIND, 0.2)), `${kind} glowed`).toBeLessThan(24);
    }
  });

  it("keeps earth's limb alight when backlit", () => {
    // The famous crescent-from-orbit shot: the ground is dark and a thread of
    // atmosphere runs all the way round it.
    const earth = shot("earth", BEHIND, 0.2);
    expect(peak(earth)).toBeGreaterThan(60);
  });

  it("reports which worlds have air", () => {
    const air: Record<string, boolean> = {};
    for (const kind of [
      "mercury",
      "venus",
      "earth",
      "moon",
      "mars",
      "jupiter",
      "saturn",
      "uranus",
      "neptune",
    ] as const) {
      air[kind] = new PlanetGlobe(kind).hasAir;
    }
    expect(air).toEqual({
      mercury: false,
      moon: false,
      venus: true,
      earth: true,
      mars: true,
      jupiter: true,
      saturn: true,
      uranus: true,
      neptune: true,
    });
  });
});

describe("the terminator", () => {
  it("puts the lit half on the sun's side, whichever side that is", () => {
    // Near-side-on light, so each world sits at roughly half phase and the
    // terminator runs down the middle of the disc. At gibbous phase most of
    // BOTH halves is lit, and on a high-contrast surface (the Moon's maria are
    // a third the albedo of its highlands) the texture can outvote the
    // lighting — which is a fact about lunar geology, not a shader bug.
    for (const light of [
      { x: -0.99, y: 0, z: 0.14 },
      { x: 0.99, y: 0, z: 0.14 },
      { x: 0, y: -0.99, z: 0.14 },
      { x: 0.7, y: 0.7, z: 0.14 },
    ]) {
      for (const kind of ["earth", "mars", "moon", "jupiter"] as const) {
        const r = shot(kind, light, 0.3);
        const lit = halfLuma(r, light, 1);
        const dark = halfLuma(r, light, -1);
        expect(
          lit,
          `${kind} lit from ${JSON.stringify(light)}`,
        ).toBeGreaterThan(dark * 1.5);
      }
    }
  });
});

describe("rings", () => {
  it("pads only the ringed world's canvas", () => {
    expect(new PlanetGlobe("saturn").padding).toBeGreaterThan(2.27);
    for (const kind of ["earth", "jupiter", "uranus", "moon"] as const) {
      expect(new PlanetGlobe(kind).padding, kind).toBe(1);
    }
  });

  it("draws ring pixels outside saturn's own disc", () => {
    // Past the planet's limb but inside the padded box there must be something
    // — that region is nothing but rings.
    const r = shot("saturn", SIDE, 0.2);
    const half = r.res / 2;
    const discR = half / new PlanetGlobe("saturn").padding;
    let beyond = 0;
    for (let y = 0; y < r.res; y++) {
      for (let x = 0; x < r.res; x++) {
        const dx = x + 0.5 - half;
        const dy = y + 0.5 - half;
        if (Math.hypot(dx, dy) < discR * 1.15) continue;
        if ((r.data[(y * r.res + x) * 4 + 3] as number) > 40) beyond++;
      }
    }
    expect(beyond).toBeGreaterThan(30);
  });
});
