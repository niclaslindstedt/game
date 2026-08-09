// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// game-spec:allow-large-file: a coordinate catalogue — twenty satellites' real
// named features (basins, volcanoes, lineae, ridges, coated hemispheres) as
// lat/lon data, with two small primitives at the top. It is DATA, and splitting
// it would only scatter the same table across files.
//
// WHERE THE SATELLITES' FACES COME FROM
//
// Same contract as `planet-maps.ts`: outlines and blobs in degrees, longitude
// EAST-POSITIVE, latitude north-positive, rasterised by that module's own
// `stampOutlines` / `stampBlobs`. Only the subjects are new.
//
// TWO CONVENTIONS BITE HERE AND NOWHERE ELSE IN THE SKY:
//
//   • THE MAPS ARE PUBLISHED IN WEST LONGITUDE. Planetary cartography uses
//     west longitude for a synchronously-rotating satellite, so every catalogue
//     coordinate for these bodies (Pele at 255°W, Herschel at 98°W, Stickney at
//     49°W) is the mirror of what this rasteriser wants. `fromWest` does the
//     one conversion, ONCE, at the point of authoring — never quietly inside a
//     baker, where the next reader cannot see it.
//   • LONGITUDE 0 IS THE FACE THAT LOOKS AT THE PLANET. Every one of these
//     bodies is tidally locked, so its prime meridian is not a survey artefact
//     but a physical place: the sub-planet point. That is what makes "leading
//     hemisphere" (centred 90°W) and "trailing hemisphere" (90°E) meaningful,
//     and those two are the single most important fact about several of these
//     surfaces — Iapetus's two-tone paint job, Dione's and Rhea's wispy ice
//     cliffs, the dust that darkens Callisto. A feature placed on the wrong
//     hemisphere here is not a rounding error, it is the wrong moon.

import type { Blob, Outline } from "./planet-maps.ts";

/** Convert a published WEST longitude to the east-positive one this
 * rasteriser works in. See the note above — every satellite catalogue in
 * print uses west, and this is the only place that fact is handled. */
export function fromWest(lonWest: number): number {
  const e = -lonWest;
  return e <= -180 ? e + 360 : e > 180 ? e - 360 : e;
}

/**
 * Stamp a CHAIN of blobs along the great-circle-ish path from one lat/lon to
 * another — the primitive the planets never needed and half the satellites
 * cannot be drawn without.
 *
 * Europa's lineae, Enceladus's tiger stripes, Tethys's Ithaca Chasma, Miranda's
 * chevron, Iapetus's equatorial ridge and Triton's cantaloupe rilles are all
 * LINES, and a line is exactly what `stampBlobs` cannot make: its blobs are
 * ellipses aligned to the lat/lon axes, so anything diagonal comes out as a
 * staircase of lozenges. Walking the path and dropping a small round blob every
 * step gives a stroke that runs in any direction, and the interpolation is
 * linear in lat/lon rather than a true great circle because at these lengths
 * the difference is under a pixel and a real slerp would need the caller to
 * think in vectors.
 */
export function streak(
  from: [number, number],
  to: [number, number],
  width: number,
  opts: { amount?: number; hard?: number; steps?: number } = {},
): Blob[] {
  const [lon0, lat0] = from;
  const [lon1, lat1] = to;
  // Shortest way round: a stroke from 170° to −170° crosses the antimeridian
  // rather than running the long way back across the whole map.
  let dlon = lon1 - lon0;
  dlon -= Math.round(dlon / 360) * 360;
  const dlat = lat1 - lat0;
  const span = Math.hypot(dlon, dlat);
  // One blob every half-width keeps the stroke solid without over-stamping.
  const steps = opts.steps ?? Math.max(2, Math.ceil(span / (width * 0.5)));
  const out: Blob[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    out.push({
      lon: lon0 + dlon * t,
      lat: lat0 + dlat * t,
      r: width,
      amount: opts.amount ?? 1,
      hard: opts.hard ?? 0.5,
    });
  }
  return out;
}

/** A hemisphere cap centred on a longitude — the shape a satellite's LEADING
 * or TRAILING face is, and the only way to say "this side is painted and that
 * side is not". `r: 90` is exactly half the body. */
export function hemisphere(lonCentre: number, r = 90, amount = 1): Blob {
  // HARD, and that is the point of the shape. A soft blob this wide is a
  // gradient across the whole body, which is what a coated hemisphere is NOT:
  // Iapetus's boundary is walkable in an afternoon, and the fact anybody cares
  // about is that one side is black and the other is white.
  return { lon: lonCentre, lat: 0, r, rx: r, amount, hard: 0.92 };
}

// ---------------------------------------------------------------------------
// IO — the only body out here with no ice on it at all.
// ---------------------------------------------------------------------------
//
// Sulfur and sulfur dioxide frost over silicate rock, repaved by four hundred
// active volcanoes faster than impacts can crater it: Io is the one surface in
// the solar system with NO craters on it, which is why nothing below is a
// crater field. The colour is the story — white and yellow SO₂ frost plains,
// green-yellow sulfur flows, and dark paterae (volcanic calderas) with red
// rings of short-chain sulfur where a plume has fallen back out.

/** The great paterae: dark, flat-floored volcanic calderas. */
export const IO_PATERAE: readonly Blob[] = [
  // Pele — 18.7°S 255.3°W. Its plume deposit is a 1 200-km red ring, the
  // largest single marking on the body and the one Galileo pictures are known
  // by; the ring is painted separately below.
  { lon: fromWest(255.3), lat: -18.7, r: 4.5, amount: 1, hard: 0.6 },
  // Loki Patera — 13°N 308.8°W, 200 km across, the most powerful volcano in
  // the solar system and dark as a lava lake should be.
  { lon: fromWest(308.8), lat: 13, r: 5.5, rx: 6, amount: 1, hard: 0.7 },
  { lon: fromWest(153.9), lat: -1.5, r: 2.4, amount: 0.85, hard: 0.6 }, // Prometheus
  { lon: fromWest(112), lat: -19, r: 2.6, amount: 0.85, hard: 0.6 }, // Amirani
  { lon: fromWest(15), lat: -49, r: 3.2, amount: 0.9, hard: 0.6 }, // Babbar
  { lon: fromWest(340), lat: 27, r: 2.8, amount: 0.8, hard: 0.6 }, // Zamama
  { lon: fromWest(80), lat: 45, r: 2.6, amount: 0.8, hard: 0.6 }, // Surt
  { lon: fromWest(200), lat: 38, r: 2.4, amount: 0.75, hard: 0.6 }, // Marduk
];

/** Pele's plume ring, and the smaller red haloes around the active vents —
 * short-chain sulfur, which is scarlet when fresh and fades to yellow. */
export const IO_PLUMES: readonly Blob[] = [
  { lon: fromWest(255.3), lat: -18.7, r: 20, amount: 0.85, hard: 0.05 },
  { lon: fromWest(153.9), lat: -1.5, r: 9, amount: 0.5, hard: 0.05 },
  { lon: fromWest(308.8), lat: 13, r: 10, amount: 0.4, hard: 0.05 },
  { lon: fromWest(15), lat: -49, r: 9, amount: 0.45, hard: 0.05 },
];

// ---------------------------------------------------------------------------
// EUROPA — the smoothest object in the solar system, and cracked all over.
// ---------------------------------------------------------------------------
//
// A shell of water ice a few kilometres thick over a global ocean, with no
// relief worth the name: the whole moon varies by a couple of hundred metres.
// What it has instead is LINEAE — cracks thousands of kilometres long, filled
// from below with something reddish-brown (irradiated salts, most likely),
// crossing and re-crossing in a lattice that is the entire look of the body.

/** The great lineae, as strokes. Real ones run for a third of the moon and
 * cross each other at every angle — which is why they are drawn as paths
 * rather than as a texture. */
export const EUROPA_LINEAE: readonly Blob[] = [
  // Two of the named triple bands, then a lattice in the same idiom.
  ...streak([fromWest(220), 40], [fromWest(160), -30], 1.5, { amount: 0.9 }), // Belus-ish
  ...streak([fromWest(60), 55], [fromWest(20), -50], 1.7, { amount: 1 }), // Agenor-ish
  ...streak([fromWest(300), 20], [fromWest(200), -10], 1.4, { amount: 0.85 }),
  ...streak([fromWest(120), 60], [fromWest(190), -5], 1.3, { amount: 0.8 }),
  ...streak([fromWest(350), -20], [fromWest(250), -60], 1.4, { amount: 0.8 }),
  ...streak([fromWest(90), -10], [fromWest(170), 45], 1.2, { amount: 0.75 }),
  ...streak([fromWest(30), 10], [fromWest(140), 20], 1.1, { amount: 0.7 }),
  ...streak([fromWest(260), 65], [fromWest(300), -35], 1.2, { amount: 0.75 }),
  ...streak([fromWest(200), -45], [fromWest(80), -30], 1.3, { amount: 0.8 }),
  ...streak([fromWest(10), 60], [fromWest(120), 70], 1, { amount: 0.6 }),
  ...streak([fromWest(160), 10], [fromWest(20), -15], 1, { amount: 0.65 }),
  ...streak([fromWest(240), -5], [fromWest(330), 55], 1.1, { amount: 0.7 }),
];

/** Chaos terrain — Conamara and its kin: rafts of crust broken up and refrozen,
 * the one place Europa is rough. */
export const EUROPA_CHAOS: readonly Blob[] = [
  { lon: fromWest(273), lat: 9, r: 5, rx: 6, amount: 0.8, hard: 0.25 }, // Conamara
  { lon: fromWest(180), lat: -15, r: 6, rx: 8, amount: 0.6, hard: 0.2 },
  { lon: fromWest(80), lat: 25, r: 5, rx: 7, amount: 0.55, hard: 0.2 },
  { lon: fromWest(20), lat: -40, r: 4, rx: 6, amount: 0.5, hard: 0.2 },
];

// ---------------------------------------------------------------------------
// GANYMEDE — two terrains, and the boundary between them is the whole face.
// ---------------------------------------------------------------------------
//
// The largest moon in the solar system, and the only one with a magnetic field
// of its own. A third of it is ancient DARK terrain, heavily cratered and
// dusty; the rest is younger GROOVED terrain, pale and ridged, which tore
// through the dark in long lanes. Galileo Regio is the big dark one — 3 200 km
// across, plainly visible from a good telescope.

/** The dark, ancient regiones. */
export const GANYMEDE_DARK: readonly Blob[] = [
  { lon: fromWest(125), lat: 35, r: 34, rx: 32, amount: 1, hard: 0.3 }, // Galileo Regio
  { lon: fromWest(200), lat: -20, r: 26, rx: 30, amount: 0.9, hard: 0.25 }, // Perrine-ish
  { lon: fromWest(20), lat: -45, r: 22, rx: 26, amount: 0.85, hard: 0.25 }, // Nicholson
  { lon: fromWest(320), lat: 20, r: 18, rx: 20, amount: 0.8, hard: 0.25 }, // Marius
  { lon: fromWest(75), lat: -5, r: 14, rx: 16, amount: 0.7, hard: 0.25 },
];

/** The grooved lanes — sulci, cutting the dark terrain into islands. */
export const GANYMEDE_GROOVES: readonly Blob[] = [
  ...streak([fromWest(160), 60], [fromWest(150), -60], 4, { amount: 0.9 }), // Uruk-ish
  ...streak([fromWest(60), 50], [fromWest(80), -55], 3.5, { amount: 0.85 }),
  ...streak([fromWest(250), 45], [fromWest(280), -40], 3.5, { amount: 0.85 }),
  ...streak([fromWest(0), 30], [fromWest(100), 25], 3, { amount: 0.8 }),
  ...streak([fromWest(190), 15], [fromWest(300), 5], 3, { amount: 0.75 }),
  ...streak([fromWest(120), -30], [fromWest(230), -50], 3, { amount: 0.75 }),
];

/** The bright ray craters — Tros and Osiris, young enough to still be white. */
export const GANYMEDE_RAYS: readonly Blob[] = [
  { lon: fromWest(27), lat: 11, r: 8, amount: 0.45, hard: 0.05 }, // Tros rays
  { lon: fromWest(27), lat: 11, r: 1.6, amount: 0.9, hard: 0.85 },
  { lon: fromWest(166), lat: -39, r: 9, amount: 0.4, hard: 0.05 }, // Osiris
  { lon: fromWest(166), lat: -39, r: 1.6, amount: 0.9, hard: 0.85 },
];

// ---------------------------------------------------------------------------
// CALLISTO — the most cratered surface known, and the least changed.
// ---------------------------------------------------------------------------
//
// Nothing has happened to Callisto since the heavy bombardment: no tides worth
// the name, no resurfacing, no grooves. It is saturated with craters — every
// new one lands on an old one — and coated in dark dust with bright ice
// showing through where an impact has dug it up. Valhalla is the landmark: a
// bright central patch with concentric rings reaching 1 900 km out.

/** Valhalla's rings, and Asgard's, as concentric strokes of bright ice. */
export const CALLISTO_RINGS: readonly Blob[] = [
  { lon: fromWest(56), lat: 16, r: 6, amount: 1, hard: 0.5 }, // Valhalla, bright core
  { lon: fromWest(56), lat: 16, r: 13, amount: 0.3, hard: 0.02 },
  { lon: fromWest(56), lat: 16, r: 21, amount: 0.22, hard: 0.02 },
  { lon: fromWest(56), lat: 16, r: 30, amount: 0.16, hard: 0.02 },
  { lon: fromWest(140), lat: 30, r: 4.5, amount: 0.9, hard: 0.5 }, // Asgard
  { lon: fromWest(140), lat: 30, r: 11, amount: 0.24, hard: 0.02 },
  { lon: fromWest(140), lat: 30, r: 17, amount: 0.16, hard: 0.02 },
];

// ---------------------------------------------------------------------------
// TITAN — a surface nobody saw for three hundred years, under an orange sky.
// ---------------------------------------------------------------------------
//
// The only moon with a real atmosphere: half again as dense as Earth's at the
// ground, and so full of photochemical haze that in visible light Titan is a
// featureless orange ball. Everything below is what Cassini's radar and
// infrared found UNDERNEATH — and the deck above it is painted opaque, because
// that is honestly what anybody looking at Titan sees.

/** The bright highland Xanadu, and the dark equatorial dune seas beside it. */
export const TITAN_BRIGHT: readonly Outline[] = [
  // Xanadu — an Australia-sized bright region on the leading hemisphere,
  // centred near 10°S 100°W, the first feature ever resolved on Titan.
  "-140,10 -110,14 -80,10 -60,-2 -70,-22 -100,-30 -130,-24 -150,-8",
];

/** Shangri-La, Fensal and the other dark dune fields — longitudinal dunes of
 * hydrocarbon sand, hundreds of kilometres long, wrapped round the equator. */
export const TITAN_DUNES: readonly Outline[] = [
  "-180,-8 -150,-4 -150,-26 -180,-30",
  "-40,6 10,10 40,4 40,-20 0,-26 -40,-18",
  "60,12 120,14 160,8 160,-18 100,-24 60,-14",
];

/** The northern lakes and seas — Kraken, Ligeia and Punga Mare: liquid methane
 * and ethane, and the only standing bodies of liquid on any surface but
 * Earth's. Nearly all of them are in the north, which is the odd fact about
 * Titan nobody has fully explained. */
export const TITAN_SEAS: readonly Blob[] = [
  { lon: fromWest(310), lat: 68, r: 9, rx: 14, amount: 1, hard: 0.6 }, // Kraken
  { lon: fromWest(250), lat: 79, r: 6, rx: 16, amount: 1, hard: 0.6 }, // Ligeia
  { lon: fromWest(340), lat: 85, r: 4, rx: 20, amount: 0.9, hard: 0.6 }, // Punga
  { lon: fromWest(120), lat: -78, r: 3, rx: 8, amount: 0.7, hard: 0.5 }, // Ontario Lacus
];

// ---------------------------------------------------------------------------
// THE SATURNIAN ICE MOONS — one enormous scar each, and wisps.
// ---------------------------------------------------------------------------

/** Mimas: Herschel, 139 km across on a 396-km moon. A crater a third of the
 * body's diameter, with a central peak, and the reason every photograph of
 * Mimas gets the same joke. 0.4°N 98.2°W. */
export const MIMAS_HERSCHEL: readonly Blob[] = [
  { lon: fromWest(98.2), lat: 0.4, r: 20, amount: 1, hard: 0.75 },
  { lon: fromWest(98.2), lat: 0.4, r: 4, amount: 0.6, hard: 0.85 }, // central peak
];

/** Enceladus: the tiger stripes — four near-parallel fractures across the
 * south pole, ~130 km apart, venting water ice into space hard enough to
 * supply Saturn's E ring. They are the youngest terrain in the solar system,
 * and the reason this moon is the brightest object in it. */
export const ENCELADUS_STRIPES: readonly Blob[] = [
  ...streak([-40, -70], [40, -78], 2.6, { amount: 1, hard: 0.4 }), // Damascus
  ...streak([-10, -62], [70, -72], 2.4, { amount: 0.95, hard: 0.4 }), // Baghdad
  ...streak([-80, -66], [-10, -80], 2.4, { amount: 0.95, hard: 0.4 }), // Cairo
  ...streak([-120, -60], [-60, -74], 2.2, { amount: 0.9, hard: 0.4 }), // Alexandria
];

/** Tethys: Odysseus (450 km, two-fifths of the moon) and Ithaca Chasma, a
 * canyon 100 km wide running three quarters of the way round it. */
export const TETHYS_FEATURES: readonly Blob[] = [
  { lon: fromWest(128.9), lat: 32.8, r: 22, amount: 1, hard: 0.55 }, // Odysseus
  ...streak([fromWest(30), 60], [fromWest(20), -50], 3, {
    amount: 0.8,
    hard: 0.4,
  }),
  ...streak([fromWest(20), -50], [fromWest(200), -70], 3, {
    amount: 0.7,
    hard: 0.4,
  }),
];

/** Dione and Rhea: the WISPY TERRAIN. For twenty years these pale streaks on
 * the trailing hemisphere were thought to be frost; Cassini flew close and
 * found ice CLIFFS, hundreds of metres high, fresh faces catching the light. */
export const WISPY_CLIFFS: readonly Blob[] = [
  ...streak([100, 40], [130, -30], 1.2, { amount: 0.9, hard: 0.45 }),
  ...streak([120, 35], [95, -40], 1, { amount: 0.8, hard: 0.45 }),
  ...streak([70, 20], [110, -20], 0.9, { amount: 0.75, hard: 0.45 }),
  ...streak([140, 25], [125, -45], 1, { amount: 0.8, hard: 0.45 }),
  ...streak([85, 55], [140, 10], 0.8, { amount: 0.65, hard: 0.45 }),
];

/** Iapetus: the two-tone moon. Its LEADING hemisphere (centred 90°W) is coated
 * in something as dark as coal — dust swept up from Phoebe, then locked in by
 * runaway thermal segregation — while the trailing side is clean bright ice.
 * The albedo ratio is better than ten to one, and Cassini (the man) worked it
 * out in 1671 from the fact that he could only see the moon on one side of
 * Saturn. Plus the equatorial ridge: 13 km high, 1 300 km long, dead on the
 * equator, and still unexplained. */
export const IAPETUS_DARK: readonly Blob[] = [hemisphere(fromWest(90), 82, 1)];

export const IAPETUS_RIDGE: readonly Blob[] = [
  ...streak([fromWest(160), 0], [fromWest(20), 0], 2, {
    amount: 0.9,
    hard: 0.6,
  }),
];

// ---------------------------------------------------------------------------
// THE URANIAN MOONS — ice, rift valleys, and one that was smashed.
// ---------------------------------------------------------------------------

/** Miranda: the strangest surface in the system. Three CORONAE — Arden,
 * Elsinore and Inverness, the last of them a 200-km chevron — sit in ancient
 * cratered terrain like patches on a quilt, and Verona Rupes is a cliff twenty
 * kilometres tall, the highest known anywhere. */
export const MIRANDA_CORONAE: readonly Blob[] = [
  // Inverness Corona — the chevron, drawn as two strokes meeting at a point.
  ...streak([fromWest(325), -40], [fromWest(342), -25], 3, { amount: 0.9 }),
  ...streak([fromWest(342), -25], [fromWest(320), -12], 3, { amount: 0.9 }),
  { lon: fromWest(45), lat: -30, r: 16, rx: 18, amount: 0.7, hard: 0.3 }, // Arden
  { lon: fromWest(255), lat: -25, r: 14, rx: 16, amount: 0.65, hard: 0.3 }, // Elsinore
  ...streak([fromWest(347), -18], [fromWest(347), -50], 2, {
    amount: 1,
    hard: 0.7,
  }), // Verona Rupes
];

/** Ariel: the brightest and youngest of the five, cut end to end by rift
 * valleys with smooth floors — something flooded them from below. */
export const ARIEL_CHASMATA: readonly Blob[] = [
  ...streak([fromWest(20), 30], [fromWest(80), -40], 2.4, {
    amount: 0.9,
    hard: 0.45,
  }),
  ...streak([fromWest(110), 20], [fromWest(160), -35], 2.2, {
    amount: 0.85,
    hard: 0.45,
  }),
  ...streak([fromWest(230), 35], [fromWest(300), -20], 2.2, {
    amount: 0.8,
    hard: 0.45,
  }),
  ...streak([fromWest(300), 10], [fromWest(340), -45], 2, {
    amount: 0.75,
    hard: 0.45,
  }),
];

/** Umbriel: the darkest of them, and almost featureless — except for Wunda, a
 * bright ring 130 km across sitting right on the equator, which nobody has
 * explained either. */
export const UMBRIEL_WUNDA: readonly Blob[] = [
  { lon: fromWest(273.6), lat: 7.9, r: 9, amount: 1, hard: 0.2 },
];

/** Titania: Messina Chasmata, a rift system 1 500 km long, and the big craters
 * Gertrude and Ursula. */
export const TITANIA_FEATURES: readonly Blob[] = [
  ...streak([fromWest(335), 34], [fromWest(325), -34], 2.4, {
    amount: 0.85,
    hard: 0.45,
  }),
  ...streak([fromWest(20), 20], [fromWest(50), -30], 2, {
    amount: 0.7,
    hard: 0.45,
  }),
  { lon: fromWest(287), lat: -15.8, r: 7, amount: 0.7, hard: 0.5 }, // Ursula
];

/** Oberon: outermost, reddest, and pocked with craters whose floors hold
 * something very dark — plus Mommur Chasma and a 6-km mountain on the limb of
 * the only picture Voyager took. */
export const OBERON_FEATURES: readonly Blob[] = [
  { lon: fromWest(44), lat: -46, r: 6, amount: 1, hard: 0.7 }, // Hamlet's dark floor
  { lon: fromWest(4), lat: -26, r: 4.5, amount: 0.9, hard: 0.7 }, // Othello
  { lon: fromWest(343), lat: -15, r: 4, amount: 0.8, hard: 0.7 }, // Macbeth
  ...streak([fromWest(350), 20], [fromWest(320), -20], 1.8, {
    amount: 0.6,
    hard: 0.45,
  }),
];

// ---------------------------------------------------------------------------
// TRITON — captured, retrograde, and still geologically alive.
// ---------------------------------------------------------------------------
//
// A Kuiper belt object Neptune caught, going the wrong way round: the only
// large satellite in the solar system with a retrograde orbit, and one of the
// few worlds anywhere with active geysers. Its southern hemisphere wears a
// bright cap of nitrogen and methane ice with a pink cast — methane turned to
// tholins by ultraviolet — and its western half is CANTALOUPE TERRAIN, a rind
// of dimples and ridges named for exactly what it looks like.

/** The south polar cap, and the dark plume streaks the geysers have laid
 * downwind across it — every one of them pointing the same way, which is how
 * Voyager knew there was a wind. */
export const TRITON_CAP: readonly Blob[] = [
  { lon: 0, lat: -90, r: 55, rx: 200, amount: 1, hard: 0.25 },
];

export const TRITON_PLUMES: readonly Blob[] = [
  ...streak([fromWest(30), -55], [fromWest(20), -48], 1.4, {
    amount: 0.9,
    hard: 0.5,
  }),
  ...streak([fromWest(90), -60], [fromWest(78), -52], 1.4, {
    amount: 0.9,
    hard: 0.5,
  }),
  ...streak([fromWest(150), -50], [fromWest(140), -43], 1.2, {
    amount: 0.8,
    hard: 0.5,
  }),
  ...streak([fromWest(300), -58], [fromWest(288), -50], 1.3, {
    amount: 0.85,
    hard: 0.5,
  }),
];

/** Cantaloupe terrain: dimples ~30 km across, packed edge to edge over the
 * western (leading) hemisphere. Drawn as a lattice of soft round cells rather
 * than as craters, because that is what they are NOT — they have no rims. */
export const TRITON_CANTALOUPE: readonly Blob[] = (() => {
  const out: Blob[] = [];
  for (let lat = -30; lat <= 45; lat += 11) {
    for (let lon = 150; lon <= 320; lon += 12) {
      // Offset alternate rows so the cells pack rather than grid up.
      const jitter = ((lat / 11) & 1) === 0 ? 0 : 6;
      out.push({
        lon: fromWest(lon + jitter),
        lat,
        r: 4.2,
        amount: 0.5,
        hard: 0.1,
      });
    }
  }
  return out;
})();

// ---------------------------------------------------------------------------
// PHOBOS and DEIMOS — two captured rocks, and one enormous hole.
// ---------------------------------------------------------------------------
//
// Neither is round: Phobos is 27×22×18 km and Deimos smaller still, both far
// too small for gravity to pull them into a sphere. The globe shader can only
// draw spheres, so what these two get from this catalogue is their SURFACE —
// the darkest, reddest carbonaceous dust in the inner system, Phobos's crater
// Stickney (9 km across on a 22-km moon; the impact nearly broke it apart) and
// the grooves radiating from it.

export const PHOBOS_FEATURES: readonly Blob[] = [
  { lon: fromWest(49), lat: 1, r: 34, amount: 1, hard: 0.55 }, // Stickney
  ...streak([fromWest(20), 20], [fromWest(300), 40], 4, {
    amount: 0.6,
    hard: 0.3,
  }),
  ...streak([fromWest(10), -10], [fromWest(290), 10], 3.5, {
    amount: 0.55,
    hard: 0.3,
  }),
  ...streak([fromWest(30), 45], [fromWest(310), 65], 3.5, {
    amount: 0.5,
    hard: 0.3,
  }),
];
