// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE GEOGRAPHY OF THE TITLE SKY (`@ui/lib/planet-maps.ts`,
// `@ui/lib/planet-skins.ts`). The worlds in the main menu wear their real
// surfaces, and "real" is a claim a test can actually check: Africa has to be
// where Africa is, the Atlantic has to be water, Antarctica has to be white,
// and the Moon's near side has to be the dark one.
//
// The wrap test is the one that has already earned its place. A polygon whose
// longitudes run 350 → 5 fills the long way round the planet instead of the
// short way, which put Mars's Sinus Meridiani in a band across two-thirds of
// the globe — and looked, at a glance, like a plausible dark marking.

import { describe, expect, it } from "vitest";

import {
  EARTH_LAND,
  EARTH_WATER,
  EARTH_DESERT,
  EARTH_FOREST,
  EARTH_ICE,
  EARTH_BOREAL,
  MARS_BRIGHT,
  MARS_DARK,
  SATURN_RINGS,
  stampOutlines,
  type Outline,
} from "@ui/lib/planet-maps.ts";
import { cloudSkin, surfaceSkin, type Skin } from "@ui/lib/planet-skins.ts";

const ALL_OUTLINES: [string, readonly Outline[]][] = [
  ["EARTH_LAND", EARTH_LAND],
  ["EARTH_WATER", EARTH_WATER],
  ["EARTH_ICE", EARTH_ICE],
  ["EARTH_DESERT", EARTH_DESERT],
  ["EARTH_FOREST", EARTH_FOREST],
  ["EARTH_BOREAL", EARTH_BOREAL],
  ["MARS_DARK", MARS_DARK],
  ["MARS_BRIGHT", MARS_BRIGHT],
];

/** The RGB of one lat/lon on a baked skin. */
function sample(
  skin: Skin,
  lon: number,
  lat: number,
): [number, number, number] {
  const i = Math.min(
    skin.w - 1,
    Math.max(0, Math.floor(((lon + 180) / 360) * skin.w)),
  );
  const j = Math.min(
    skin.h - 1,
    Math.max(0, Math.floor(((90 - lat) / 180) * skin.h)),
  );
  const k = (j * skin.w + i) * 3;
  return [
    skin.rgb[k] as number,
    skin.rgb[k + 1] as number,
    skin.rgb[k + 2] as number,
  ];
}

/** Cloud coverage (0–1) at a lat/lon of a deck. */
function coverAt(kind: "earth" | "venus", lon: number, lat: number): number {
  const deck = cloudSkin(kind);
  if (!deck) throw new Error(`${kind} has no cloud deck`);
  const i = Math.floor(((lon + 180) / 360) * deck.w);
  const j = Math.floor(((90 - lat) / 180) * deck.h);
  return (deck.rgba[(j * deck.w + i) * 4 + 3] as number) / 255;
}

const isBlue = ([r, g, b]: [number, number, number]): boolean =>
  b > r + 20 && b > g + 10;
const isGreen = ([r, g, b]: [number, number, number]): boolean =>
  g > b && g >= r - 10;
const brightness = ([r, g, b]: [number, number, number]): number =>
  (r + g + b) / 3;

describe("outline data", () => {
  it("keeps every polygon's longitudes continuous", () => {
    // A step of more than 180° means the author wrote 350 → 5 where they meant
    // −10 → 5, and the scanline fill will span the wrong way round the world.
    // The exception is an edge along a PARALLEL (same latitude at both ends):
    // it crosses no scanline, so it fills nothing, which is how Antarctica is
    // closed across the pole from +180 back to −180.
    for (const [name, outlines] of ALL_OUTLINES) {
      outlines.forEach((outline, n) => {
        const pts = outline
          .trim()
          .split(/\s+/)
          .map((p) => p.split(",").map(Number) as [number, number]);
        for (let i = 1; i < pts.length; i++) {
          const [lon, lat] = pts[i] as [number, number];
          const [pLon, pLat] = pts[i - 1] as [number, number];
          if (lat === pLat) continue;
          const step = Math.abs(lon - pLon);
          expect(
            step,
            `${name}[${n}] jumps ${step}° between points ${i - 1} and ${i}`,
          ).toBeLessThanOrEqual(180);
        }
      });
    }
  });

  it("parses every point as a finite lat/lon pair", () => {
    for (const [name, outlines] of ALL_OUTLINES) {
      for (const outline of outlines) {
        for (const point of outline.trim().split(/\s+/)) {
          const [lon, lat] = point.split(",").map(Number);
          expect(Number.isFinite(lon), `${name}: bad point ${point}`).toBe(
            true,
          );
          expect(Number.isFinite(lat), `${name}: bad point ${point}`).toBe(
            true,
          );
          expect(Math.abs(lat as number)).toBeLessThanOrEqual(90);
        }
      }
    }
  });

  it("wraps a polygon that runs past the antimeridian", () => {
    const w = 72;
    const h = 36;
    const mask = new Uint8Array(w * h);
    // A box from 170°E to 190°E — i.e. across the date line into −170°.
    stampOutlines(mask, w, h, ["170,10 190,10 190,-10 170,-10"], 1);
    const at = (lon: number, lat: number): number =>
      mask[
        Math.floor(((90 - lat) / 180) * h) * w +
          Math.floor(((lon + 180) / 360) * w)
      ] as number;
    expect(at(175, 0)).toBe(1); // east of the line
    expect(at(-175, 0)).toBe(1); // and west of it: the same box
    expect(at(0, 0)).toBe(0); // and nowhere near the other side
  });
});

describe("earth", () => {
  const earth = surfaceSkin("earth");

  it("puts the continents where the continents are", () => {
    // A handful of places nobody can argue about.
    for (const [lon, lat, what] of [
      [20, 5, "central Africa"],
      [-60, -5, "the Amazon"],
      [133, -25, "central Australia"],
      [100, 60, "Siberia"],
      [-100, 40, "the American midwest"],
      [78, 22, "India"],
    ] as [number, number, string][]) {
      const c = sample(earth, lon, lat);
      expect(isBlue(c), `${what} came out as ocean: ${c.join()}`).toBe(false);
    }
  });

  it("puts the oceans where the oceans are", () => {
    for (const [lon, lat, what] of [
      [-30, 5, "the mid-Atlantic"],
      [-140, 5, "the mid-Pacific"],
      [75, -30, "the southern Indian Ocean"],
      [-25, -40, "the South Atlantic"],
      [160, 30, "the north-west Pacific"],
    ] as [number, number, string][]) {
      const c = sample(earth, lon, lat);
      expect(isBlue(c), `${what} came out as land: ${c.join()}`).toBe(true);
    }
  });

  it("ices both poles, and the south more than the north", () => {
    expect(brightness(sample(earth, 0, 88))).toBeGreaterThan(180);
    // Antarctica is a continent under ice, so it is white a long way from the
    // pole — at 75°S, where the Arctic at 75°N is still ocean.
    expect(brightness(sample(earth, 0, -80))).toBeGreaterThan(190);
    expect(brightness(sample(earth, 100, -75))).toBeGreaterThan(180);
  });

  it("greens the rainforests and sands the deserts", () => {
    const congo = sample(earth, 22, 0);
    const sahara = sample(earth, 15, 22);
    expect(isGreen(congo)).toBe(true);
    // Sand is brighter and warmer than jungle, which is the whole visual
    // difference between the two halves of Africa from space.
    expect(brightness(sahara)).toBeGreaterThan(brightness(congo) + 30);
    expect(sahara[0]).toBeGreaterThan(sahara[2] + 40);
  });

  it("gives the enclosed seas back to the water", () => {
    // Eurasia is drawn as one generous blob and these are punched out of it;
    // if the subtraction ever stops running they silently become land.
    for (const [lon, lat, what] of [
      [18, 35, "the Mediterranean"],
      [35, 43, "the Black Sea"],
      [51, 42, "the Caspian"],
      [20, 58, "the Baltic"],
      [38, 22, "the Red Sea"],
    ] as [number, number, string][]) {
      const c = sample(earth, lon, lat);
      expect(isBlue(c), `${what} came out as land: ${c.join()}`).toBe(true);
    }
  });
});

describe("cloud decks", () => {
  it("gives one to the worlds with weather and to no others", () => {
    expect(cloudSkin("earth")).toBeDefined();
    expect(cloudSkin("venus")).toBeDefined();
    // The giants' bands ARE their cloud deck; a second layer would only mud it.
    for (const kind of [
      "mars",
      "moon",
      "mercury",
      "jupiter",
      "neptune",
    ] as const) {
      expect(
        cloudSkin(kind),
        `${kind} should have no separate deck`,
      ).toBeUndefined();
    }
  });

  it("puts earth's cloud where the atmosphere puts it", () => {
    // The ITCZ is a standing band of convection; the subtropical highs at ±25°
    // are where the descending air keeps the deserts cloudless. Averaged round
    // a latitude circle, the first must beat the second — that structure is
    // what stops the layer reading as an even scatter of cotton wool.
    const mean = (lat: number): number => {
      let sum = 0;
      for (let lon = -180; lon < 180; lon += 5)
        sum += coverAt("earth", lon, lat);
      return sum / 72;
    };
    expect(mean(5)).toBeGreaterThan(mean(25) + 0.05);
    expect(mean(55)).toBeGreaterThan(mean(25));
  });

  it("keeps venus opaque and earth's sky mostly clear", () => {
    // Venus's deck hides the planet completely; Earth's is roughly two-thirds
    // cover, and a layer that covered everything would bury the map under it.
    expect(coverAt("venus", 0, 0)).toBeGreaterThan(0.9);
    let open = 0;
    let n = 0;
    for (let lat = -60; lat <= 60; lat += 10) {
      for (let lon = -180; lon < 180; lon += 10) {
        if (coverAt("earth", lon, lat) < 0.5) open++;
        n++;
      }
    }
    expect(open / n).toBeGreaterThan(0.4);
  });
});

describe("the other worlds", () => {
  it("keeps the moon's maria on the near side", () => {
    // The near side is a third mare; the far side is barely a twentieth. That
    // asymmetry is the most recognisable thing about the Moon, and it only
    // survives if longitude 0 stays the middle of the face we see.
    const moon = surfaceSkin("moon");
    const near =
      brightness(sample(moon, 0, 15)) +
      brightness(sample(moon, 30, 8)) +
      brightness(sample(moon, -20, 30));
    const far =
      brightness(sample(moon, 180, 15)) +
      brightness(sample(moon, 150, 8)) +
      brightness(sample(moon, -150, 30));
    expect(far).toBeGreaterThan(near + 40);
  });

  it("darkens Syrtis Major and brightens Hellas beside it", () => {
    // The two most famous markings on Mars, and they sit next to each other:
    // a dark wedge at 8°N 70°E and a bright basin at 42°S 70°E.
    const mars = surfaceSkin("mars");
    expect(brightness(sample(mars, 70, 8))).toBeLessThan(
      brightness(sample(mars, 70, -42)) - 25,
    );
  });

  it("caps Mars's north pole more broadly than its south", () => {
    const mars = surfaceSkin("mars");
    expect(brightness(sample(mars, 0, 86))).toBeGreaterThan(200);
    // The south's permanent CO₂ cap is ~350 km across against the north's
    // ~1000 km of water ice, so the same latitude is deep in one cap and only
    // at the edge of the other.
    expect(brightness(sample(mars, 0, 84))).toBeGreaterThan(
      brightness(sample(mars, 0, -84)) + 20,
    );
  });

  it("keeps the ice giants the same pale green-blue", () => {
    // Irwin et al. 2024: the deep-azure Neptune is a contrast-stretch artefact
    // of the Voyager 2 frames. Both worlds are a pale greenish blue, Neptune
    // only slightly the bluer — so the gap between them must stay small.
    const u = sample(surfaceSkin("uranus"), 0, 0);
    const n = sample(surfaceSkin("neptune"), 120, 20);
    expect(n[2]).toBeGreaterThan(n[0]); // Neptune is the bluer
    expect(u[2]).toBeGreaterThan(u[0] - 10);
    expect(Math.abs(brightness(u) - brightness(n))).toBeLessThan(90);
  });

  it("orders saturn's rings outward with no gap between them", () => {
    // The catalogued edges overlap slightly here and there (the D ring's outer
    // edge is quoted past the C ring's inner one), so the rule is ordering and
    // continuity rather than exact abutment — a GAP would leave a black band
    // through the system that is not the Cassini division.
    for (let i = 1; i < SATURN_RINGS.length; i++) {
      const prev = SATURN_RINGS[i - 1];
      const ring = SATURN_RINGS[i];
      if (!prev || !ring) continue;
      expect(ring.to).toBeGreaterThan(ring.from);
      expect(ring.from).toBeGreaterThanOrEqual(prev.from);
      expect(ring.from).toBeLessThanOrEqual(prev.to);
    }
    // The A ring's outer edge is 2.27 planet radii out; the globe pads its
    // canvas to fit that, and a ring beyond the padding would be clipped away.
    const outer = SATURN_RINGS[SATURN_RINGS.length - 1];
    expect(outer?.to).toBeLessThanOrEqual(2.4);
  });
});
