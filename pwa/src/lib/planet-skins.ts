// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// game-spec:allow-large-file: nine worlds' paint recipes, one `bake*` function
// each, sharing one noise kit and one cache. Each is a self-contained colour
// pass over the same grid; splitting them by file would separate a world's
// palette from the only code that reads it.
//
// THE SKINS — turning the geography (planet-maps.ts) into pixels.
//
// THE PLANETS ARE HERE; THE SATELLITES ARE IN `moon-skins.ts`, and the split is
// by AUTHORING EFFORT rather than by kind. A planet is a page of its own — its
// biomes, its albedo features, its weather — and there are nine of them. There
// are twenty satellites, most of them the same sentence with different numbers
// (cratered ice, this bright, this grey), so they are written as a RECIPE TABLE
// with one baker over it. Both halves share `skin-kit.ts` and land in the same
// cache below, which is the seam that lets `surfaceSkin` stay the one door.
//
// Every world is baked ONCE into an equirectangular texture the globe shader
// (planet-globe.ts) then samples per pixel as the body turns. A skin is flat,
// unlit albedo: no shading, no terminator, no highlight — the shader owns all
// of that, and baking light into a texture would make the surface turn with a
// painted-on day.
//
// Two things are worth knowing before editing a palette:
//
//   • THE COLOURS ARE THE MEASURED ONES, not the poster ones. Mars is
//     butterscotch, not scarlet; the Moon is a warm grey a shade darker than
//     worn asphalt, not white; Venus is cream, not lemon. Photographs of these
//     worlds are far less saturated than everyone remembers, and a globe 60
//     pixels across reads as a toy the moment it is over-saturated.
//   • A WORLD WITH WEATHER GETS TWO SKINS. The surface is baked here and the
//     CLOUD DECK is baked separately (bakeClouds) as its own RGBA layer, so it
//     can turn at its own rate over the ground below — see planet-globe.ts.

import {
  blurField,
  stampBlobs,
  stampOutlines,
  stampOutlinesF,
  EARTH_BOREAL,
  EARTH_DESERT,
  EARTH_FOREST,
  EARTH_ICE,
  EARTH_LAND,
  EARTH_MOUNTAIN,
  EARTH_WATER,
  JUPITER_BANDS,
  JUPITER_SPOTS,
  MARS_BRIGHT,
  MARS_CANYON,
  MARS_DARK,
  MARS_FEATURES,
  MERCURY_PLAINS,
  MERCURY_RAYS,
  MOON_MARIA,
  MOON_RAYS,
  NEPTUNE_BANDS,
  NEPTUNE_SPOTS,
  SATURN_BANDS,
  URANUS_BANDS,
  type Band,
  type Blob,
} from "./planet-maps.ts";
import {
  clamp01,
  craterField,
  fbm3,
  mix,
  rowLat,
  smoothstep,
  spherePoint,
  type CloudSkin,
  type Rgb,
  type Skin,
} from "./skin-kit.ts";
import {
  SATELLITE_KINDS,
  SATELLITE_SKIN_SIZE,
  bakeSatellite,
  bakeSatelliteCloud,
  type SatelliteKind,
} from "./moon-skins.ts";

export type { CloudSkin, Skin } from "./skin-kit.ts";
export type { SatelliteKind } from "./moon-skins.ts";

/** The nine worlds with a hand-authored page each (this file). */
export type PlanetKind =
  | "mercury"
  | "venus"
  | "earth"
  | "moon"
  | "mars"
  | "jupiter"
  | "saturn"
  | "uranus"
  | "neptune";

/** Every world the title sky can draw: the nine above, plus the twenty
 * satellites of `moon-skins.ts`. */
export type GlobeKind = PlanetKind | SatelliteKind;

/** Sum a world's latitude bands at one row: >0 toward the belt colour, <0
 * toward the zone colour. Gaussian-ish falloff so neighbours blend. */
function bandShade(bands: readonly Band[], lat: number): number {
  let sum = 0;
  for (const b of bands) {
    const t = (lat - b.lat) / b.width;
    sum += b.shade * Math.exp(-t * t);
  }
  return sum;
}

/** Rasterise blobs into a signed field (blobs may carry a negative amount). */
function blobField(w: number, h: number, blobs: readonly Blob[]): Float32Array {
  const pos = new Float32Array(w * h);
  const neg = new Float32Array(w * h);
  stampBlobs(
    pos,
    w,
    h,
    blobs.filter((b) => (b.amount ?? 1) >= 0),
  );
  stampBlobs(
    neg,
    w,
    h,
    blobs
      .filter((b) => (b.amount ?? 1) < 0)
      .map((b) => ({ ...b, amount: -(b.amount ?? 1) })),
  );
  for (let i = 0; i < w * h; i++) {
    pos[i] = (pos[i] as number) - (neg[i] as number);
  }
  return pos;
}

// ---------------------------------------------------------------------------
// EARTH.
// ---------------------------------------------------------------------------

const OCEAN_DEEP: Rgb = [10, 30, 68];
const OCEAN_MID: Rgb = [22, 62, 112];
const SHELF: Rgb = [46, 116, 152];
const TROPIC_GREEN: Rgb = [72, 112, 50];
const RAINFOREST: Rgb = [36, 78, 38];
const TEMPERATE: Rgb = [88, 116, 62];
const BOREAL: Rgb = [56, 82, 60];
const TUNDRA: Rgb = [126, 122, 100];
const SAND: Rgb = [198, 168, 112];
const ROCK: Rgb = [154, 138, 116];
const ICE: Rgb = [238, 243, 248];

function bakeEarth(w: number, h: number): Skin {
  const n = w * h;
  const rgb = new Uint8ClampedArray(n * 3);

  // Land, minus the enclosed seas.
  const land = new Uint8Array(n);
  stampOutlines(land, w, h, EARTH_LAND, 1);
  stampOutlines(land, w, h, EARTH_WATER, 0);

  // A blurred copy of the same mask reads as distance-from-coast: it feathers
  // the shoreline and lights the continental shelf just offshore.
  const coast = new Float32Array(n);
  for (let i = 0; i < n; i++) coast[i] = land[i] ? 1 : 0;
  blurField(coast, w, h, Math.max(1, Math.round(w / 128)), 2);

  const desert = new Float32Array(n);
  stampOutlinesF(desert, w, h, EARTH_DESERT);
  blurField(desert, w, h, Math.max(1, Math.round(w / 160)), 2);
  const forest = new Float32Array(n);
  stampOutlinesF(forest, w, h, EARTH_FOREST);
  blurField(forest, w, h, Math.max(1, Math.round(w / 160)), 2);
  const boreal = new Float32Array(n);
  stampOutlinesF(boreal, w, h, EARTH_BOREAL);
  blurField(boreal, w, h, Math.max(1, Math.round(w / 128)), 2);
  const ice = new Float32Array(n);
  stampOutlinesF(ice, w, h, EARTH_ICE);
  blurField(ice, w, h, Math.max(1, Math.round(w / 160)), 2);
  const mountain = new Float32Array(n);
  stampBlobs(mountain, w, h, EARTH_MOUNTAIN);

  for (let j = 0; j < h; j++) {
    const lat = rowLat(j, h);
    const absLat = Math.abs(lat);
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      const [sx, sy, sz] = spherePoint(i, j, w, h);
      let col: Rgb;
      if (land[k]) {
        // Vegetation by latitude, then the named biomes over the top.
        const warm = smoothstep(60, 25, absLat);
        col = mix(BOREAL, TEMPERATE, warm);
        col = mix(col, TROPIC_GREEN, smoothstep(35, 12, absLat));
        col = mix(col, TUNDRA, smoothstep(58, 70, absLat));
        col = mix(col, BOREAL, clamp01((boreal[k] as number) * 1.6) * 0.85);
        col = mix(col, RAINFOREST, clamp01((forest[k] as number) * 1.6) * 0.9);
        const dry = clamp01((desert[k] as number) * 1.5);
        const grit = fbm3(sx * 7, sy * 7, sz * 7, 3, 17.4);
        col = mix(col, mix(SAND, ROCK, clamp01(grit * 1.6)), dry * 0.95);
        // Relief: high ground goes grey, then white above the snow line.
        const high = clamp01(mountain[k] as number);
        col = mix(col, ROCK, high * 0.7);
        col = mix(col, ICE, clamp01(high * 1.4 - 0.55));
        // A little large-scale mottling so no biome reads as flat paint.
        const patch = fbm3(sx * 3.1, sy * 3.1, sz * 3.1, 4, 5.2) - 0.5;
        col = [col[0] + patch * 26, col[1] + patch * 24, col[2] + patch * 18];
      } else {
        // Ocean: deep water offshore, shelf blue along the coast, with a slow
        // noise field standing in for basins and ridges.
        const depth = fbm3(sx * 2.2, sy * 2.2, sz * 2.2, 3, 31.8);
        col = mix(OCEAN_DEEP, OCEAN_MID, clamp01(depth * 1.5));
        col = mix(col, SHELF, smoothstep(0.06, 0.42, coast[k] as number));
      }
      // Ice sheets and pack ice sit over land and sea alike.
      col = mix(col, ICE, clamp01((ice[k] as number) * 1.35));
      // The last of the polar caps: sea ice thickens toward the poles.
      col = mix(col, ICE, smoothstep(76, 86, absLat) * (land[k] ? 0.5 : 0.85));
      const o = k * 3;
      rgb[o] = col[0];
      rgb[o + 1] = col[1];
      rgb[o + 2] = col[2];
    }
  }
  return { w, h, rgb };
}

/**
 * Earth's weather, as its own layer. Coverage is not uniform: the ITCZ near
 * the equator is a permanent band of convection, the subtropics at ±25° are
 * where the descending air keeps the deserts clear, and the mid-latitude storm
 * tracks at ±55° are a near-continuous belt of frontal cloud. Painting that
 * latitude structure — rather than an even scatter — is most of what makes a
 * cloud layer read as a planet's weather.
 */
function bakeEarthClouds(w: number, h: number): CloudSkin {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let j = 0; j < h; j++) {
    const lat = rowLat(j, h);
    const absLat = Math.abs(lat);
    // ITCZ, subtropical clear belt, storm track, polar deck.
    const itcz = Math.exp(-Math.pow((lat - 5) / 8, 2)) * 0.5;
    const clear = -Math.exp(-Math.pow((absLat - 25) / 11, 2)) * 0.4;
    const storm = Math.exp(-Math.pow((absLat - 55) / 13, 2)) * 0.38;
    const polar = smoothstep(72, 86, absLat) * 0.22;
    const bias = itcz + clear + storm + polar;
    for (let i = 0; i < w; i++) {
      const [sx, sy, sz] = spherePoint(i, j, w, h);
      // Stretch the noise east-west: weather systems are drawn out along the
      // wind, not blobby. The latitude bias only TILTS the odds — it must not
      // become a painted stripe, or the globe looks banded like a giant.
      const f = fbm3(sx * 2.6, sy * 5.4, sz * 2.6, 5, 21.7);
      const wisp = fbm3(sx * 8, sy * 13, sz * 8, 3, 44.1) - 0.5;
      const cover = smoothstep(0.52, 0.78, f + bias * 0.26 + wisp * 0.2);
      const o = (j * w + i) * 4;
      // Cloud tops are not pure white — they take a little of the sky's blue.
      rgba[o] = 244;
      rgba[o + 1] = 247;
      rgba[o + 2] = 252;
      rgba[o + 3] = 255 * cover * 0.92;
    }
  }
  return { w, h, rgba };
}

// ---------------------------------------------------------------------------
// MARS.
// ---------------------------------------------------------------------------

const MARS_DUST: Rgb = [198, 146, 102];
const MARS_PALE: Rgb = [214, 168, 124];
const MARS_BASALT: Rgb = [112, 84, 68];
const MARS_ICE: Rgb = [236, 236, 240];

function bakeMars(w: number, h: number): Skin {
  const n = w * h;
  const rgb = new Uint8ClampedArray(n * 3);

  // THE ALBEDO FEATURES ARE SMUDGES, NOT COUNTRIES. They are dust the wind has
  // swept off darker basalt, they have no edge to speak of, and they are
  // redrawn from decade to decade by the storms — the 19th-century observers
  // who mapped them as coastlines were seeing the sharpness they expected.
  // Blurred hard here, and the boundary is then pushed around by noise below;
  // a crisp-edged Syrtis Major is the single clearest tell of a fake Mars.
  const dark = new Float32Array(n);
  stampOutlinesF(dark, w, h, MARS_DARK);
  blurField(dark, w, h, Math.max(2, Math.round(w / 110)), 2);
  const bright = new Float32Array(n);
  stampOutlinesF(bright, w, h, MARS_BRIGHT);
  blurField(bright, w, h, Math.max(2, Math.round(w / 110)), 2);
  const volcano = new Float32Array(n);
  stampBlobs(volcano, w, h, MARS_FEATURES);
  const canyon = new Float32Array(n);
  stampBlobs(canyon, w, h, MARS_CANYON);
  const craters = new Float32Array(n);
  stampBlobs(craters, w, h, craterField(9931, 90, 3.4));

  for (let j = 0; j < h; j++) {
    const lat = rowLat(j, h);
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      const [sx, sy, sz] = spherePoint(i, j, w, h);
      const grain = fbm3(sx * 4.5, sy * 4.5, sz * 4.5, 4, 7.7) - 0.5;
      let col = mix(MARS_DUST, MARS_PALE, clamp01((bright[k] as number) * 1.4));
      // Two scales of wind on the boundary: broad tongues of swept ground, and
      // the streaking the dust devils leave behind them.
      const swept = fbm3(sx * 2.2, sy * 2.2, sz * 2.2, 3, 23.9) - 0.5;
      const streak = fbm3(sx * 5.5, sy * 3.5, sz * 5.5, 3, 41.3) - 0.5;
      const albedo = (dark[k] as number) * 2 + swept * 0.42 + streak * 0.2;
      col = mix(col, MARS_BASALT, clamp01(albedo) * 0.95);
      // The canyon floor is in shadow and dust-free: darker than the plateau.
      col = mix(col, [96, 70, 56], clamp01(canyon[k] as number) * 0.6);
      // The great shields are a shade darker than the dust around them, with
      // a bright rim where the flanks catch the light.
      col = mix(col, [136, 100, 76], clamp01(volcano[k] as number) * 0.55);
      col = mix(col, [190, 150, 116], clamp01((craters[k] as number) * 0.5));
      col = [col[0] + grain * 30, col[1] + grain * 24, col[2] + grain * 18];
      // The caps, at their summer extent: the north's water ice is ~1 000 km
      // across (out to about 81°N), the south's permanent CO₂ cap only ~350 km
      // — which is why every photograph of Mars has one big cap and one small.
      const north = smoothstep(78, 85, lat);
      const south = smoothstep(-81, -87, lat);
      col = mix(col, MARS_ICE, Math.max(north, south));
      const o = k * 3;
      rgb[o] = col[0];
      rgb[o + 1] = col[1];
      rgb[o + 2] = col[2];
    }
  }
  return { w, h, rgb };
}

// ---------------------------------------------------------------------------
// THE MOON and MERCURY — airless, cratered, and grey in different ways.
// ---------------------------------------------------------------------------

function bakeMoon(w: number, h: number): Skin {
  const n = w * h;
  const rgb = new Uint8ClampedArray(n * 3);
  const maria = new Float32Array(n);
  stampBlobs(maria, w, h, MOON_MARIA);
  blurField(maria, w, h, Math.max(1, Math.round(w / 96)), 1);
  const rays = new Float32Array(n);
  stampBlobs(rays, w, h, MOON_RAYS);
  const craters = new Float32Array(n);
  stampBlobs(craters, w, h, craterField(4242, 220, 4.2));

  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      const [sx, sy, sz] = spherePoint(i, j, w, h);
      const rough = fbm3(sx * 5.5, sy * 5.5, sz * 5.5, 4, 6.6);
      // Highland anorthosite: a warm mid grey. Not white — full moonlight only
      // looks white because it is the brightest thing in a night sky.
      const g = 148 + rough * 46;
      let col: Rgb = [g * 1.02, g, g * 0.97];
      // Craters brighten their rims and shadow their floors, so the highlands
      // read as worked-over rather than noisy.
      const c = clamp01(craters[k] as number);
      col = mix(col, [188, 186, 182], c * 0.55);
      // Mare basalt: darker, flatter, slightly blue from its titanium. The
      // catalogue gives each mare as a circle; the real ones flooded whatever
      // basin they found and merged where basins touched, so the edge is
      // pushed around by noise before it is used — otherwise the near side
      // reads as a scatter of drilled holes.
      const shore = fbm3(sx * 2.4, sy * 2.4, sz * 2.4, 3, 15.2) - 0.5;
      const ragged = (maria[k] as number) + shore * 0.5 + (rough - 0.5) * 0.12;
      const m = smoothstep(0.22, 0.46, ragged);
      col = mix(col, [72, 72, 79], m * 0.95);
      // Ray systems lie over everything, maria included — they are the
      // youngest thing on the surface.
      col = mix(col, [214, 213, 210], clamp01(rays[k] as number) * 0.75);
      const o = k * 3;
      rgb[o] = col[0];
      rgb[o + 1] = col[1];
      rgb[o + 2] = col[2];
    }
  }
  return { w, h, rgb };
}

function bakeMercury(w: number, h: number): Skin {
  const n = w * h;
  const rgb = new Uint8ClampedArray(n * 3);
  const plains = new Float32Array(n);
  stampBlobs(plains, w, h, MERCURY_PLAINS);
  blurField(plains, w, h, 1, 1);
  const rays = new Float32Array(n);
  stampBlobs(rays, w, h, MERCURY_RAYS);
  const craters = new Float32Array(n);
  stampBlobs(craters, w, h, craterField(1717, 420, 4));

  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      const [sx, sy, sz] = spherePoint(i, j, w, h);
      const rough = fbm3(sx * 6.5, sy * 6.5, sz * 6.5, 4, 3.3);
      // Mercury is DARKER than the Moon and browner with it — graphite from
      // the ancient crust, not the bright grey everyone paints it. Its
      // geometric albedo is 0.14, against the Moon's 0.12 and Earth's 0.43.
      const g = 104 + rough * 52;
      let col: Rgb = [g * 1.08, g * 0.99, g * 0.87];
      // Four billion years of impacts with no air and no water to soften them:
      // the rims catch the light, the floors hold the shadow, and the contrast
      // between the two is most of what the surface IS.
      const c = clamp01(craters[k] as number);
      col = mix(col, [176, 166, 150], c * 0.75);
      col = mix(col, [86, 80, 72], clamp01(c * 1.6 - 0.85) * 0.5);
      col = mix(col, [150, 142, 128], clamp01(plains[k] as number) * 0.55);
      col = mix(col, [214, 208, 196], clamp01(rays[k] as number) * 0.8);
      const o = k * 3;
      rgb[o] = col[0];
      rgb[o + 1] = col[1];
      rgb[o + 2] = col[2];
    }
  }
  return { w, h, rgb };
}

// ---------------------------------------------------------------------------
// VENUS — a surface nobody has ever seen, under the deck that hides it.
// ---------------------------------------------------------------------------

function bakeVenus(w: number, h: number): Skin {
  const n = w * h;
  const rgb = new Uint8ClampedArray(n * 3);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const [sx, sy, sz] = spherePoint(i, j, w, h);
      // Basalt plains and two highland "continents" (Ishtar, Aphrodite) —
      // radar-mapped, never photographed, and never visible from outside.
      const nf = fbm3(sx * 2.4, sy * 2.4, sz * 2.4, 4, 9.9);
      const g = 126 + nf * 70;
      const o = (j * w + i) * 3;
      rgb[o] = g * 1.12;
      rgb[o + 1] = g * 0.95;
      rgb[o + 2] = g * 0.7;
    }
  }
  return { w, h, rgb };
}

/**
 * Venus's cloud deck: sulfuric acid, effectively opaque, and the only thing
 * anyone has ever seen of the planet. In visible light it is a nearly
 * featureless cream; the banding and the great dark "Y" only come out in the
 * ultraviolet, so both are painted here at low contrast — present, but not the
 * poster version.
 */
function bakeVenusClouds(w: number, h: number): CloudSkin {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let j = 0; j < h; j++) {
    const lat = rowLat(j, h);
    const absLat = Math.abs(lat);
    for (let i = 0; i < w; i++) {
      const [sx, sy, sz] = spherePoint(i, j, w, h);
      // Bands stretched hard along longitude by the 360 km/h super-rotation.
      const band = fbm3(sx * 1.5, sy * 7, sz * 1.5, 4, 13.5) - 0.5;
      const swirl = fbm3(sx * 3.2, sy * 9, sz * 3.2, 3, 27.1) - 0.5;
      // The polar collars are brighter, the mid-latitudes streaked darker, and
      // the great dark "Y" opens westward from the equator — the one named
      // marking in the whole deck, and only really an ultraviolet feature, so
      // it is laid in at a fraction of its UV contrast.
      const collar = smoothstep(58, 72, absLat) * 0.4;
      const arm = Math.exp(-Math.pow((absLat - 24) / 13, 2));
      const spine = Math.exp(-Math.pow(lat / 9, 2));
      const wye =
        -0.16 * Math.max(arm * smoothstep(0.35, 0.75, band + 0.5), spine * 0.6);
      const shade = clamp01(0.62 + band * 0.34 + swirl * 0.16 + collar + wye);
      const o = (j * w + i) * 4;
      rgba[o] = 222 + shade * 34;
      rgba[o + 1] = 206 + shade * 40;
      rgba[o + 2] = 158 + shade * 52;
      // Opaque — but a hair short of it, so the deck reads as a layer with
      // depth rather than as the planet's own paint.
      rgba[o + 3] = 245;
    }
  }
  return { w, h, rgba };
}

// ---------------------------------------------------------------------------
// THE GIANTS — banded weather all the way down.
// ---------------------------------------------------------------------------

/** One giant's recipe: the zone colour, the belt colour, its band table, its
 * spots, and how hard the winds smear the band edges. */
type GiantMix = {
  zone: Rgb;
  belt: Rgb;
  bands: readonly Band[];
  spots: readonly Blob[];
  spotColor: Rgb;
  /** How far the bands ripple (deg of latitude) under the jet streams. */
  turbulence: number;
  /** Fine streak contrast along the bands. */
  streak: number;
};

const GIANTS: Partial<Record<GlobeKind, GiantMix>> = {
  jupiter: {
    zone: [242, 230, 206],
    belt: [148, 98, 68],
    bands: JUPITER_BANDS,
    spots: JUPITER_SPOTS,
    spotColor: [196, 108, 74],
    turbulence: 3.4,
    streak: 0.16,
  },
  saturn: {
    zone: [242, 224, 178],
    belt: [200, 168, 116],
    bands: SATURN_BANDS,
    spots: [],
    spotColor: [150, 140, 120],
    turbulence: 1.6,
    streak: 0.08,
  },
  // THE TWO ICE GIANTS ARE VERY NEARLY THE SAME COLOUR, and the deep-azure
  // Neptune everybody pictures is a processing artefact: Voyager 2's Neptune
  // frames were contrast-stretched to bring out the cloud bands, the caveat in
  // the captions got lost, and the stretched version became the planet. Irwin
  // et al. (Oxford, MNRAS, Jan 2024) rebuilt both from Hubble/STIS and VLT/MUSE
  // spectra: both are a pale greenish blue, Neptune only slightly the bluer of
  // the two for its thinner haze. Painted here as measured, not as remembered.
  uranus: {
    zone: [186, 216, 210],
    belt: [154, 194, 192],
    bands: URANUS_BANDS,
    spots: [],
    spotColor: [156, 186, 190],
    turbulence: 0.6,
    streak: 0.03,
  },
  neptune: {
    zone: [154, 190, 208],
    belt: [112, 156, 190],
    bands: NEPTUNE_BANDS,
    spots: NEPTUNE_SPOTS,
    spotColor: [62, 96, 148],
    turbulence: 1.2,
    streak: 0.07,
  },
};

function bakeGiant(kind: GlobeKind, w: number, h: number): Skin {
  const g = GIANTS[kind];
  if (!g) throw new Error(`no giant recipe for ${kind}`);
  const n = w * h;
  const rgb = new Uint8ClampedArray(n * 3);
  const spots = blobField(w, h, g.spots);

  for (let j = 0; j < h; j++) {
    const lat = rowLat(j, h);
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      const [sx, sy, sz] = spherePoint(i, j, w, h);
      // Ripple the band boundaries: the jets are not ruled lines, they are
      // shear zones that curl. Displacing the sampled latitude is enough.
      const wobble =
        (fbm3(sx * 2.2, sy * 8, sz * 2.2, 3, 12.1) - 0.5) * g.turbulence * 2;
      const shade = clamp01(0.5 + bandShade(g.bands, lat + wobble) * 0.5);
      let col = mix(g.zone, g.belt, shade);
      // Fine streaking along the flow, plus the named spots over the top.
      const streak = fbm3(sx * 4, sy * 22, sz * 4, 3, 33.3) - 0.5;
      col = [
        col[0] * (1 + streak * g.streak),
        col[1] * (1 + streak * g.streak),
        col[2] * (1 + streak * g.streak),
      ];
      const s = spots[k] as number;
      if (s > 0) col = mix(col, g.spotColor, clamp01(s) * 0.9);
      else if (s < 0) col = mix(col, [252, 250, 244], clamp01(-s) * 0.75);
      // Neptune's bright companions: methane cirrus that ride high above the
      // main deck and are the only sharp thing on the planet.
      if (kind === "neptune") {
        const cirrus = fbm3(sx * 3.4, sy * 26, sz * 3.4, 3, 51.7);
        col = mix(col, [232, 242, 248], smoothstep(0.62, 0.78, cirrus) * 0.5);
      }
      const o = k * 3;
      rgb[o] = col[0];
      rgb[o + 1] = col[1];
      rgb[o + 2] = col[2];
    }
  }
  return { w, h, rgb };
}

// ---------------------------------------------------------------------------
// The bakery, and its cache.
// ---------------------------------------------------------------------------

/** Texture resolution per world. Earth earns the extra rows — it is the only
 * one whose coastlines a player can name. The satellites' sizes are set in
 * `moon-skins.ts` and are far smaller, because a satellite is drawn at a
 * handful of pixels and a 256-wide sheet for it would be 250 of them nobody
 * ever sees. */
const PLANET_SKIN_SIZE: Record<PlanetKind, [number, number]> = {
  earth: [384, 192],
  mars: [288, 144],
  moon: [288, 144],
  mercury: [256, 128],
  venus: [192, 96],
  jupiter: [256, 128],
  saturn: [256, 128],
  uranus: [128, 64],
  neptune: [192, 96],
};

const surfaces = new Map<GlobeKind, Skin>();
const decks = new Map<GlobeKind, CloudSkin | null>();

function isSatellite(kind: GlobeKind): kind is SatelliteKind {
  return kind in SATELLITE_SKIN_SIZE;
}

/** The world's unlit surface albedo. Baked once per kind per session. */
export function surfaceSkin(kind: GlobeKind): Skin {
  const hit = surfaces.get(kind);
  if (hit) return hit;
  let skin: Skin;
  if (isSatellite(kind)) {
    const [w, h] = SATELLITE_SKIN_SIZE[kind];
    skin = bakeSatellite(kind, w, h);
  } else {
    const [w, h] = PLANET_SKIN_SIZE[kind];
    if (kind === "earth") skin = bakeEarth(w, h);
    else if (kind === "mars") skin = bakeMars(w, h);
    else if (kind === "moon") skin = bakeMoon(w, h);
    else if (kind === "mercury") skin = bakeMercury(w, h);
    else if (kind === "venus") skin = bakeVenus(w, h);
    else skin = bakeGiant(kind, w, h);
  }
  surfaces.set(kind, skin);
  return skin;
}

/** The world's cloud deck, or undefined if it has no weather of its own. The
 * giants are left out on purpose: their bands ARE the cloud deck, and a second
 * layer over them would only mud the first. Among the satellites exactly one
 * has a deck, and it is opaque — see `bakeSatelliteCloud`. */
export function cloudSkin(kind: GlobeKind): CloudSkin | undefined {
  const hit = decks.get(kind);
  if (hit !== undefined) return hit ?? undefined;
  let deck: CloudSkin | null = null;
  if (kind === "earth") deck = bakeEarthClouds(256, 128);
  else if (kind === "venus") deck = bakeVenusClouds(256, 128);
  else if (isSatellite(kind)) deck = bakeSatelliteCloud(kind) ?? null;
  decks.set(kind, deck);
  return deck ?? undefined;
}

/** Every world this module can bake, read off the size tables so it cannot fall
 * behind the type. */
export const GLOBE_KINDS = [
  ...(Object.keys(PLANET_SKIN_SIZE) as PlanetKind[]),
  ...SATELLITE_KINDS,
] as GlobeKind[];

/**
 * Bake every world into the cache ahead of the first consumer, ONE PER TURN of
 * the event loop.
 *
 * A bake costs tens of milliseconds, and the caller that would otherwise pay
 * for them is the title screen putting its globes on (see `title-sky.ts`,
 * which builds one body per frame for exactly this reason). Nine or ten of
 * those land as a visible stutter on the way into the menu — so the app spends
 * them behind its opening studio card instead, where there is nothing to
 * stutter. The yield between worlds is what keeps that card's own animation
 * running while they bake; `setTimeout` rather than `requestAnimationFrame`
 * because a backgrounded tab stops handing out frames altogether and the
 * warm-up would simply never finish.
 *
 * Idempotent — the caches below make a second call free.
 */
export async function warmPlanetSkins(): Promise<void> {
  for (const kind of GLOBE_KINDS) {
    surfaceSkin(kind);
    cloudSkin(kind);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}
