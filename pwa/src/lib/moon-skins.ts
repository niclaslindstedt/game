// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// game-spec:allow-large-file: twenty satellites' paint recipes as ONE table
// with one baker over it. Each row is a palette plus a list of named-feature
// layers; splitting the table would separate a moon's colours from the only
// code that reads them, and the baker is forty lines.
//
// THE SATELLITE SKINS — the same contract as `planet-skins.ts`, written as data.
//
// A planet earns a hand-written baker: nine of them, each with its own biomes,
// its own weather, its own argument about what colour it really is. There are
// twenty satellites, and most of them are the same sentence with the numbers
// changed — cratered ice, this bright, this grey, with one enormous scar. So
// they are a RECIPE TABLE: a ground colour, a crater scatter, and a stack of
// layers that paint the named features from `moon-maps.ts` over the top.
//
// THE COLOURS ARE THE MEASURED ONES. Their geometric albedos span a factor of
// twenty — Enceladus at 0.96 is the most reflective surface in the solar system
// and Phobos at 0.071 among the least — and that spread is the single most
// informative thing about this set, so it is painted rather than evened out.
// The catch is that albedo is not brightness on screen: the shader lights every
// body from the real sun direction, so these are UNLIT albedo values and a dark
// moon must be authored dark, not dimmed later.
//
// AND ALMOST NONE OF THEM WILL EVER BE SEEN AT THIS FIDELITY, which is a
// deliberate trade rather than an oversight. Sized true against their planets
// (see `title-moons.ts`), the largest satellite in the sky is about seven CSS
// pixels on a desktop and two on a phone, and below four it is drawn as a point
// of light with no globe at all. The textures exist because the alternative is
// a lie that grows: a made-up surface gets copied into the previews, into the
// library, and into the next regeneration. Look at them with
// `node pwa/scripts/planet-maps.mjs`, which renders every world's sheet.

import {
  blurField,
  stampBlobs,
  stampOutlinesF,
  type Blob,
  type Outline,
} from "./planet-maps.ts";
import {
  ARIEL_CHASMATA,
  CALLISTO_RINGS,
  ENCELADUS_STRIPES,
  EUROPA_CHAOS,
  EUROPA_LINEAE,
  GANYMEDE_DARK,
  GANYMEDE_GROOVES,
  GANYMEDE_RAYS,
  IAPETUS_DARK,
  IAPETUS_RIDGE,
  IO_PATERAE,
  IO_PLUMES,
  MIMAS_HERSCHEL,
  MIRANDA_CORONAE,
  OBERON_FEATURES,
  PHOBOS_FEATURES,
  TETHYS_FEATURES,
  TITAN_BRIGHT,
  TITAN_DUNES,
  TITAN_SEAS,
  TITANIA_FEATURES,
  TRITON_CANTALOUPE,
  TRITON_CAP,
  TRITON_PLUMES,
  UMBRIEL_WUNDA,
  WISPY_CLIFFS,
} from "./moon-maps.ts";
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

/** Every satellite the title sky can draw — the twenty that are either round
 * (in hydrostatic equilibrium) or famous enough that leaving them out would be
 * the odd choice. The rest of the solar system's three hundred moons are
 * captured rubble a kilometre or two across, and none of them is a body so
 * much as a rock with a number. */
export type SatelliteKind =
  | "phobos"
  | "deimos"
  | "io"
  | "europa"
  | "ganymede"
  | "callisto"
  | "mimas"
  | "enceladus"
  | "tethys"
  | "dione"
  | "rhea"
  | "titan"
  | "iapetus"
  | "miranda"
  | "ariel"
  | "umbriel"
  | "titania"
  | "oberon"
  | "proteus"
  | "triton";

/** Which planet each one belongs to. Read by `planet-globe.ts` to give a
 * satellite its parent's SPIN AXIS — see the note on `SATELLITE_AIR`. */
export const SATELLITE_PARENT: Record<SatelliteKind, string> = {
  phobos: "mars",
  deimos: "mars",
  io: "jupiter",
  europa: "jupiter",
  ganymede: "jupiter",
  callisto: "jupiter",
  mimas: "saturn",
  enceladus: "saturn",
  tethys: "saturn",
  dione: "saturn",
  rhea: "saturn",
  titan: "saturn",
  iapetus: "saturn",
  miranda: "uranus",
  ariel: "uranus",
  umbriel: "uranus",
  titania: "uranus",
  oberon: "uranus",
  proteus: "neptune",
  triton: "neptune",
};

/**
 * The two satellites with an atmosphere, and what it does to the limb.
 *
 * Everything else out here is AIRLESS and must stay that way: a knife-edge
 * terminator and a hard limb are what make a moon read as a moon, and hazing
 * either is the quickest way to lose it (the same rule Mercury and our own Moon
 * are held to in `planet-globe.ts`).
 *
 *   • TITAN is the exception that proves it — the only moon anywhere with a
 *     substantial atmosphere, half again as dense at the surface as Earth's,
 *     and so hazy that the surface below is invisible in visible light.
 *   • TRITON has one too, but at fourteen microbars it is a whisper: enough
 *     for wind streaks and a thin haze layer Voyager photographed on the limb,
 *     nowhere near enough to soften the terminator.
 */
export const SATELLITE_AIR: Partial<
  Record<SatelliteKind, { soft: number; rim: number; rimColor: Rgb }>
> = {
  titan: { soft: 0.3, rim: 0.95, rimColor: [255, 196, 110] },
  triton: { soft: 0.05, rim: 0.18, rimColor: [214, 226, 238] },
};

/** One painted layer: a set of features, the colour they are, and how strongly
 * it lands. `blur` softens the mask first, for anything with no real edge. */
type Layer = {
  blobs?: readonly Blob[];
  outlines?: readonly Outline[];
  color: Rgb;
  amount: number;
  /** Blur radius as a fraction of the texture width — so a recipe reads the
   * same whatever resolution it is baked at. */
  blur?: number;
};

/** One satellite's whole recipe. */
type MoonMix = {
  /** The ground, at the dark and bright ends of its own roughness noise. */
  ground: Rgb;
  high: Rgb;
  /** How fine that roughness is. */
  grain: number;
  /** Impact history: [seed, how many, biggest]. Omitted only for Io, which has
   * no craters at all — it repaves itself faster than they can accumulate. */
  craters?: [number, number, number];
  /** What a crater rim catches, and what its floor holds. */
  rim?: Rgb;
  floor?: Rgb;
  layers?: readonly Layer[];
};

const MIXES: Record<SatelliteKind, MoonMix> = {
  // --- Mars: two captured rocks, the darkest things in the inner system. ---
  phobos: {
    ground: [56, 50, 46],
    high: [78, 70, 63],
    grain: 7,
    craters: [7001, 160, 9],
    rim: [96, 87, 78],
    floor: [38, 34, 31],
    layers: [{ blobs: PHOBOS_FEATURES, color: [40, 35, 32], amount: 0.55 }],
  },
  deimos: {
    // Smoother than Phobos: its craters are half-buried in regolith, so the
    // whole body reads as a filled-in version of the same rock.
    ground: [66, 58, 51],
    high: [88, 79, 70],
    grain: 6,
    craters: [7002, 70, 7],
    rim: [102, 92, 82],
  },

  // --- Jupiter: the four Galileo saw, and the only ones he needed. ---
  io: {
    // Sulfur and SO₂ frost over silicate: white, yellow and green-yellow, with
    // no crater anywhere on it. The most volcanically active body known.
    ground: [214, 196, 126],
    high: [244, 236, 196],
    grain: 4.5,
    layers: [
      { blobs: IO_PLUMES, color: [186, 84, 62], amount: 0.55, blur: 0.02 },
      { blobs: IO_PATERAE, color: [64, 52, 40], amount: 0.95 },
    ],
  },
  europa: {
    ground: [222, 216, 206],
    high: [246, 244, 240],
    grain: 5,
    // Almost none: the shell resurfaces itself, and fewer than thirty craters
    // are known on the whole moon.
    craters: [7003, 14, 2.2],
    rim: [252, 252, 250],
    layers: [
      { blobs: EUROPA_CHAOS, color: [198, 182, 162], amount: 0.6, blur: 0.01 },
      { blobs: EUROPA_LINEAE, color: [162, 112, 84], amount: 0.85 },
    ],
  },
  ganymede: {
    ground: [138, 132, 124],
    high: [178, 174, 168],
    grain: 5.5,
    craters: [7004, 150, 3.4],
    rim: [196, 194, 190],
    floor: [104, 100, 95],
    layers: [
      { blobs: GANYMEDE_DARK, color: [84, 78, 72], amount: 0.9, blur: 0.015 },
      { blobs: GANYMEDE_GROOVES, color: [184, 182, 178], amount: 0.75 },
      { blobs: GANYMEDE_RAYS, color: [226, 224, 220], amount: 0.8 },
    ],
  },
  callisto: {
    // The most heavily cratered surface known — saturated, meaning every new
    // impact lands on an old one — under a coat of dark dust.
    ground: [88, 80, 71],
    high: [116, 106, 94],
    grain: 6.5,
    craters: [7005, 420, 3.2],
    rim: [172, 164, 152],
    floor: [64, 58, 52],
    layers: [{ blobs: CALLISTO_RINGS, color: [196, 190, 180], amount: 0.75 }],
  },

  // --- Saturn: seven, and no two of them alike. ---
  mimas: {
    ground: [186, 186, 190],
    high: [214, 214, 218],
    grain: 6,
    craters: [7006, 260, 4],
    rim: [230, 230, 234],
    floor: [148, 148, 154],
    layers: [{ blobs: MIMAS_HERSCHEL, color: [132, 132, 140], amount: 0.7 }],
  },
  enceladus: {
    // Geometric albedo 0.96 — fresh snow, constantly resurfaced by the plumes
    // venting from the south pole. Nothing else in the solar system is this
    // bright, and painting it anything but near-white loses the one fact.
    ground: [236, 238, 243],
    high: [252, 253, 255],
    grain: 5,
    craters: [7007, 60, 2.6],
    rim: [255, 255, 255],
    layers: [{ blobs: ENCELADUS_STRIPES, color: [198, 216, 232], amount: 0.7 }],
  },
  tethys: {
    ground: [204, 202, 198],
    high: [228, 226, 222],
    grain: 5.5,
    craters: [7008, 180, 3.2],
    rim: [242, 242, 240],
    floor: [172, 170, 168],
    layers: [{ blobs: TETHYS_FEATURES, color: [176, 176, 180], amount: 0.6 }],
  },
  dione: {
    ground: [194, 192, 188],
    high: [218, 216, 212],
    grain: 5.5,
    craters: [7009, 200, 3],
    rim: [236, 236, 234],
    floor: [162, 160, 158],
    layers: [{ blobs: WISPY_CLIFFS, color: [244, 244, 246], amount: 0.75 }],
  },
  rhea: {
    ground: [188, 186, 182],
    high: [214, 212, 208],
    grain: 5.5,
    craters: [7010, 300, 3.4],
    rim: [234, 234, 232],
    floor: [156, 154, 152],
    layers: [{ blobs: WISPY_CLIFFS, color: [238, 238, 240], amount: 0.55 }],
  },
  titan: {
    // What the radar found under the haze. Nobody has ever seen this with
    // their eyes — see `bakeSatelliteCloud`, which paints what they would.
    ground: [178, 140, 92],
    high: [204, 168, 118],
    grain: 4,
    layers: [
      {
        outlines: TITAN_BRIGHT,
        color: [216, 186, 138],
        amount: 0.9,
        blur: 0.02,
      },
      { outlines: TITAN_DUNES, color: [116, 86, 56], amount: 0.85, blur: 0.02 },
      { blobs: TITAN_SEAS, color: [52, 46, 44], amount: 0.95, blur: 0.006 },
    ],
  },
  iapetus: {
    // Two moons in one: a leading face darker than coal and a trailing face of
    // clean ice, with better than ten to one between them.
    ground: [200, 196, 188],
    high: [224, 220, 212],
    grain: 5.5,
    craters: [7011, 240, 3.6],
    rim: [240, 238, 232],
    floor: [168, 164, 158],
    layers: [
      { blobs: IAPETUS_DARK, color: [42, 35, 30], amount: 0.97, blur: 0.012 },
      { blobs: IAPETUS_RIDGE, color: [150, 144, 136], amount: 0.5 },
    ],
  },

  // --- Uranus: five, all ice and rock, all seen once by one spacecraft. ---
  miranda: {
    ground: [168, 166, 164],
    high: [198, 196, 194],
    grain: 6,
    craters: [7012, 120, 3],
    rim: [220, 220, 218],
    floor: [138, 136, 136],
    layers: [{ blobs: MIRANDA_CORONAE, color: [212, 212, 210], amount: 0.6 }],
  },
  ariel: {
    ground: [186, 186, 188],
    high: [212, 212, 214],
    grain: 5.5,
    craters: [7013, 90, 2.6],
    rim: [232, 232, 234],
    layers: [{ blobs: ARIEL_CHASMATA, color: [230, 230, 232], amount: 0.6 }],
  },
  umbriel: {
    // The darkest of the five and the flattest-looking — one uniform grey, and
    // then a bright ring on the equator nobody has explained.
    ground: [104, 102, 102],
    high: [128, 126, 126],
    grain: 6,
    craters: [7014, 220, 3.4],
    rim: [146, 144, 144],
    floor: [86, 84, 84],
    layers: [{ blobs: UMBRIEL_WUNDA, color: [216, 216, 218], amount: 0.85 }],
  },
  titania: {
    ground: [152, 146, 142],
    high: [180, 174, 168],
    grain: 5.5,
    craters: [7015, 160, 3],
    rim: [198, 194, 188],
    floor: [126, 122, 118],
    layers: [{ blobs: TITANIA_FEATURES, color: [192, 188, 182], amount: 0.55 }],
  },
  oberon: {
    // Reddest of the five, and its big craters hold something very dark on
    // their floors — erupted, most likely, and never explained either.
    ground: [146, 136, 128],
    high: [172, 162, 152],
    grain: 5.5,
    craters: [7016, 190, 3.2],
    rim: [190, 180, 170],
    floor: [116, 108, 102],
    layers: [{ blobs: OBERON_FEATURES, color: [68, 60, 56], amount: 0.8 }],
  },

  // --- Neptune: a captured world, and the rubble that survived it. ---
  proteus: {
    // As dark as soot, and shaped like a box: the largest irregular body in the
    // solar system, right at the size where gravity would have rounded it.
    ground: [66, 64, 64],
    high: [88, 86, 86],
    grain: 6.5,
    craters: [7017, 150, 6],
    rim: [104, 102, 102],
    floor: [50, 48, 48],
  },
  triton: {
    ground: [214, 200, 190],
    high: [238, 230, 224],
    grain: 5,
    // Almost none on the visible half: Voyager counted about a dozen, which is
    // how we know the surface is younger than a hundred million years.
    craters: [7018, 16, 2.2],
    rim: [246, 242, 238],
    layers: [
      { blobs: TRITON_CANTALOUPE, color: [196, 184, 176], amount: 0.55 },
      { blobs: TRITON_CAP, color: [242, 218, 210], amount: 0.9, blur: 0.02 },
      { blobs: TRITON_PLUMES, color: [116, 100, 92], amount: 0.75 },
    ],
  },
};

/**
 * Texture resolution per satellite. Far smaller than a planet's, because these
 * are drawn at single-digit pixels: the four with named geography anybody could
 * point at get 128 columns, the rest 96, and even that is generous. A 256-wide
 * sheet here would be 250 columns nobody ever sees.
 */
export const SATELLITE_SKIN_SIZE: Record<SatelliteKind, [number, number]> = {
  phobos: [96, 48],
  deimos: [96, 48],
  io: [128, 64],
  europa: [128, 64],
  ganymede: [128, 64],
  callisto: [128, 64],
  mimas: [96, 48],
  enceladus: [96, 48],
  tethys: [96, 48],
  dione: [96, 48],
  rhea: [96, 48],
  titan: [128, 64],
  iapetus: [128, 64],
  miranda: [96, 48],
  ariel: [96, 48],
  umbriel: [96, 48],
  titania: [96, 48],
  oberon: [96, 48],
  proteus: [96, 48],
  triton: [128, 64],
};

/** Every satellite, read off the size table so it cannot fall behind the type. */
export const SATELLITE_KINDS = Object.keys(
  SATELLITE_SKIN_SIZE,
) as SatelliteKind[];

/** Rasterise one layer's features into a mask, blurred if it asked to be. */
function layerMask(layer: Layer, w: number, h: number): Float32Array {
  const field = new Float32Array(w * h);
  if (layer.outlines) stampOutlinesF(field, w, h, layer.outlines);
  if (layer.blobs) stampBlobs(field, w, h, layer.blobs);
  if (layer.blur)
    blurField(field, w, h, Math.max(1, Math.round(w * layer.blur)), 2);
  return field;
}

/**
 * Bake one satellite's unlit surface albedo: the ground under its own
 * roughness, then its impact history, then its named features in the order the
 * recipe lists them — which is chronological wherever it matters (Ganymede's
 * grooves cut the dark terrain, and its rays lie over both).
 */
export function bakeSatellite(kind: SatelliteKind, w: number, h: number): Skin {
  const m = MIXES[kind];
  const n = w * h;
  const rgb = new Uint8ClampedArray(n * 3);

  const craters = new Float32Array(n);
  if (m.craters) {
    const [seed, count, maxR] = m.craters;
    stampBlobs(craters, w, h, craterField(seed, count, maxR));
  }
  const masks = (m.layers ?? []).map((l) => layerMask(l, w, h));

  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      const [sx, sy, sz] = spherePoint(i, j, w, h);
      const rough = fbm3(
        sx * m.grain,
        sy * m.grain,
        sz * m.grain,
        4,
        (kind.charCodeAt(0) * 7) % 97,
      );
      let col = mix(m.ground, m.high, clamp01(rough * 1.4));
      // Craters: the rim catches the light, the floor holds the shadow, and on
      // an airless body four billion years old the contrast between those two
      // is most of what the surface IS.
      const c = clamp01(craters[k] as number);
      if (m.rim) col = mix(col, m.rim, c * 0.6);
      if (m.floor) col = mix(col, m.floor, clamp01(c * 1.7 - 0.9) * 0.55);
      for (let l = 0; l < masks.length; l++) {
        const layer = (m.layers as Layer[])[l] as Layer;
        const mask = masks[l] as Float32Array;
        col = mix(col, layer.color, clamp01(mask[k] as number) * layer.amount);
      }
      const o = k * 3;
      rgb[o] = col[0];
      rgb[o + 1] = col[1];
      rgb[o + 2] = col[2];
    }
  }
  return { w, h, rgb };
}

/**
 * Titan's haze, and nothing else's.
 *
 * It is the one satellite deck in the sky and it is effectively OPAQUE: a
 * photochemical smog of nitrogen and methane so thick that Pioneer, Voyager and
 * every telescope before Cassini saw nothing but a featureless orange ball, and
 * the surface baked above went unseen for three hundred years. What little
 * structure there is sits at the poles — a detached haze layer at the limb and
 * a dark winter hood over whichever pole is in shadow, which takes fifteen
 * years to swap ends.
 *
 * Returning `undefined` for every other satellite is what keeps the airless
 * ones airless: `cloudSkin` hands this straight to the globe shader.
 */
export function bakeSatelliteCloud(kind: SatelliteKind): CloudSkin | undefined {
  if (kind !== "titan") return undefined;
  const w = 96;
  const h = 48;
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let j = 0; j < h; j++) {
    const lat = rowLat(j, h);
    for (let i = 0; i < w; i++) {
      const [sx, sy, sz] = spherePoint(i, j, w, h);
      // Barely any structure: a slow north-south gradient (the north was the
      // brighter hemisphere through the Cassini years) and a whisper of band.
      const band = fbm3(sx * 1.2, sy * 5, sz * 1.2, 3, 61.3) - 0.5;
      const hood = smoothstep(55, 85, -lat) * 0.28;
      const shade = clamp01(0.6 + band * 0.14 - hood + lat / 900);
      const o = (j * w + i) * 4;
      rgba[o] = 196 + shade * 52;
      rgba[o + 1] = 142 + shade * 56;
      rgba[o + 2] = 74 + shade * 48;
      // Not quite 255: a hair of the ground below keeps the deck reading as a
      // layer with depth rather than as the moon's own paint.
      rgba[o + 3] = 248;
    }
  }
  return { w, h, rgba };
}
