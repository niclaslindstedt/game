// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// game-spec:allow-large-file: a coordinate catalogue — the solar system's real
// surface geography (coastlines, albedo features, maria, cloud belts) written
// out as lat/lon outlines. It is dense DATA with one small rasteriser at the
// top; splitting it would only scatter the same table across files.
//
// WHERE THE WORLDS' FACES COME FROM
//
// Every body in the title sky wears its real surface, not a noise field that
// merely looks planet-ish. This module is the source of that: outlines traced
// from the real maps, in degrees — longitude east-positive, latitude
// north-positive — plus a scanline rasteriser that stamps them into an
// equirectangular mask the skin bakers (planet-skins.ts) then colour.
//
// Three rules make the data cheap to write and cheap to ship:
//
//   • A polygon is a STRING of "lon,lat" pairs. Compact in source, compact
//     after gzip (the title screen is on the 170 KB critical path), and
//     editable by hand — which matters, because these were iterated against
//     rendered maps until each continent read right.
//   • LAND polygons may be drawn GENEROUSLY and the enclosed seas punched back
//     out as WATER polygons. Tracing Eurasia's true coast means threading the
//     Baltic, the Black Sea and the Gulf of Bothnia; drawing one coarse blob
//     and subtracting the Mediterranean is the same picture for a fraction of
//     the points.
//   • Longitude may run PAST ±180 (Eurasia reaches 190°E, Alaska starts at
//     −170°). The rasteriser wraps columns, so a body that straddles the
//     antimeridian is one polygon rather than two halves that never quite meet.

/** A polygon: "lon,lat lon,lat …" in degrees, implicitly closed. */
export type Outline = string;

/** Parse an outline into a flat [lon, lat, lon, lat, …] array. */
function parseOutline(s: Outline): Float64Array {
  const parts = s.trim().split(/\s+/);
  const out = new Float64Array(parts.length * 2);
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i] as string;
    const comma = p.indexOf(",");
    out[i * 2] = Number(p.slice(0, comma));
    out[i * 2 + 1] = Number(p.slice(comma + 1));
  }
  return out;
}

/**
 * Stamp polygons into an equirectangular mask (`w × h`, row 0 = the north
 * pole), writing `value` inside them. Even-odd scanline fill: for each row,
 * intersect the row's latitude with every edge, sort the crossings and fill
 * between pairs. Columns wrap, so a polygon may run past ±180°.
 */
export function stampOutlines(
  mask: Uint8Array,
  w: number,
  h: number,
  outlines: readonly Outline[],
  value: number,
): void {
  const xs: number[] = [];
  for (const outline of outlines) {
    const pts = parseOutline(outline);
    const n = pts.length / 2;
    for (let j = 0; j < h; j++) {
      const lat = 90 - ((j + 0.5) * 180) / h;
      xs.length = 0;
      for (let k = 0; k < n; k++) {
        const ax = pts[k * 2] as number;
        const ay = pts[k * 2 + 1] as number;
        const l = (k + 1) % n;
        const bx = pts[l * 2] as number;
        const by = pts[l * 2 + 1] as number;
        // Half-open in latitude so a vertex exactly on the row counts once.
        if (ay <= lat === by <= lat) continue;
        xs.push(ax + ((lat - ay) / (by - ay)) * (bx - ax));
      }
      if (xs.length < 2) continue;
      xs.sort((a, b) => a - b);
      for (let s = 0; s + 1 < xs.length; s += 2) {
        const from = Math.ceil((((xs[s] as number) + 180) / 360) * w - 0.5);
        const to = Math.floor((((xs[s + 1] as number) + 180) / 360) * w - 0.5);
        for (let i = from; i <= to; i++) {
          mask[j * w + (((i % w) + w) % w)] = value;
        }
      }
    }
  }
}

/** A round feature — a crater, a basin, a spot — as a lat/lon ellipse. */
export type Blob = {
  /** Centre longitude (deg, east-positive) and latitude (deg). */
  lon: number;
  lat: number;
  /** Angular radii (deg) along the surface: `r` north-south, `rx` east-west
   * (defaults to `r`, before the cos(lat) stretch the projection needs). */
  r: number;
  rx?: number;
  /** Strength at the centre, falling to 0 at the rim. */
  amount?: number;
  /** Edge hardness: 0 = a soft smudge, 1 = a hard-rimmed disc. */
  hard?: number;
};

/**
 * Accumulate elliptical blobs into a float field (`w × h`, values added and
 * clamped at 1). Longitude distance wraps, and is scaled by cos(lat) so a
 * crater stays round instead of smearing toward the poles.
 */
export function stampBlobs(
  field: Float32Array,
  w: number,
  h: number,
  blobs: readonly Blob[],
): void {
  for (const b of blobs) {
    const amount = b.amount ?? 1;
    const hard = b.hard ?? 0.35;
    const rx = b.rx ?? b.r;
    // Only the rows the blob can reach.
    const jFrom = Math.max(0, Math.floor((((90 - b.lat - b.r) / 180) * h) | 0));
    const jTo = Math.min(h - 1, Math.ceil(((90 - b.lat + b.r) / 180) * h));
    for (let j = jFrom; j <= jTo; j++) {
      const lat = 90 - ((j + 0.5) * 180) / h;
      const dlat = (lat - b.lat) / b.r;
      if (dlat * dlat >= 1) continue;
      const cosLat = Math.max(0.08, Math.cos((lat * Math.PI) / 180));
      for (let i = 0; i < w; i++) {
        const lon = ((i + 0.5) * 360) / w - 180;
        let dlon = lon - b.lon;
        dlon -= Math.round(dlon / 360) * 360;
        const dx = (dlon * cosLat) / rx;
        const d2 = dx * dx + dlat * dlat;
        if (d2 >= 1) continue;
        // A cosine falloff, sharpened toward a disc by `hard`.
        const t = 1 - Math.sqrt(d2);
        const k = hard + (1 - hard) * t;
        const v =
          (field[j * w + i] as number) + amount * Math.min(1, k * t * 2);
        field[j * w + i] = v > 1 ? 1 : v;
      }
    }
  }
}

/** Stamp outlines into a float field (1 inside), for blurring into gradients. */
export function stampOutlinesF(
  field: Float32Array,
  w: number,
  h: number,
  outlines: readonly Outline[],
  value = 1,
): void {
  const mask = new Uint8Array(w * h);
  stampOutlines(mask, w, h, outlines, 1);
  for (let i = 0; i < w * h; i++) if (mask[i]) field[i] = value;
}

/**
 * Separable box blur over a wrapping equirectangular field, in place. Used to
 * turn a hard mask into a distance-ish gradient — the continental shelf around
 * a coast, the soft edge of a desert, the haze around a basin.
 */
export function blurField(
  field: Float32Array,
  w: number,
  h: number,
  radius: number,
  passes = 2,
): void {
  if (radius < 1) return;
  const tmp = new Float32Array(w * h);
  const span = radius * 2 + 1;
  for (let p = 0; p < passes; p++) {
    // Horizontal (wraps).
    for (let j = 0; j < h; j++) {
      const row = j * w;
      let sum = 0;
      for (let k = -radius; k <= radius; k++) {
        sum += field[row + (((k % w) + w) % w)] as number;
      }
      for (let i = 0; i < w; i++) {
        tmp[row + i] = sum / span;
        const out = (((i - radius) % w) + w) % w;
        const inn = (((i + radius + 1) % w) + w) % w;
        sum += (field[row + inn] as number) - (field[row + out] as number);
      }
    }
    // Vertical (clamps at the poles).
    for (let i = 0; i < w; i++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) {
        sum += tmp[Math.min(h - 1, Math.max(0, k)) * w + i] as number;
      }
      for (let j = 0; j < h; j++) {
        field[j * w + i] = sum / span;
        const out = Math.min(h - 1, Math.max(0, j - radius));
        const inn = Math.min(h - 1, Math.max(0, j + radius + 1));
        sum += (tmp[inn * w + i] as number) - (tmp[out * w + i] as number);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// EARTH — the coastlines, and the biomes that colour them.
// ---------------------------------------------------------------------------
//
// Traced continent by continent at roughly half-degree fidelity where the
// silhouette carries recognition (the Horn of Africa, the Indian subcontinent,
// Kamchatka, Florida, the Antarctic Peninsula) and coarsely where it does not.
// The enclosed seas below are subtracted afterwards.

/** Continents and the islands big enough to read on a 100-px globe. */
export const EARTH_LAND: readonly Outline[] = [
  // Africa, from Gibraltar down the Atlantic coast, round the Cape, up the
  // Indian Ocean, out to Cape Guardafui and back along the Mediterranean.
  "-5.6,36 -9,33 -13,28 -17,21 -17.5,15 -16,12 -13,9 -11,7 -7.5,4.4 -3,5 1,5.8 4,6.4 8.5,4.3 9.5,4 9.5,0 11.8,-3 12.3,-6 13.8,-11 12,-17 14.5,-22.5 16.5,-28.6 17.9,-32.7 18.4,-34.4 22,-34.2 27,-33.5 31,-29.8 32.9,-26 35,-22 35.5,-19.5 40.5,-16 40.6,-10.5 39.5,-7 39.8,-4 42.5,-0.5 45.3,2 48.5,5 51.3,11.8 48,11.5 43.3,12.6 39.5,15.6 37.2,19.6 34.5,28 32.5,29.9 32.3,31.2 29.9,31.2 23.9,32.1 20.1,32.1 18.8,30.3 13.2,32.9 11,33.5 10.2,36.8 7.8,36.9 3,36.8 -2,35.3",
  // Eurasia. Drawn generously across the enclosed seas (Mediterranean, Black,
  // Caspian, Baltic, North Sea, Red Sea, the Gulf) — every one of them is
  // punched back out below — but the ocean coasts are traced: Norway, the
  // Siberian Arctic, Chukotka past the antimeridian, Kamchatka, Korea, the
  // South China Sea, the Malay peninsula, India and Arabia.
  "-9.5,37 -9.5,43.4 -4,43.4 -1.8,43.4 -1.2,46 -2.2,47.3 -4.8,48.4 -1.6,49.7 1.6,50.9 4.3,52 5.5,53.4 8.5,53.8 8.6,55.5 8.1,57 10.6,57.7 11.2,58.9 10.6,59.9 5.7,58.9 5.3,60.4 7.7,63.1 10.4,63.4 14.4,68 18.9,69.7 25.8,71.1 30.3,69.8 40,68.5 48,68.5 54,68.8 58,69.5 68,68.4 71,71.5 73.5,71 74,68 79,72 86,76 100,77 106,77.7 112,74 120,73.5 126,73.5 136,71.5 142,72.5 150,72 156,70.5 162,70 172,69.7 180,68.9 190.4,66.1 187,64.5 177.5,64.7 170,60 163,60 163,58 160,54 156.7,50.9 155.5,55 156,59 161,60.5 153,59 142,59 138.5,54.5 141.5,53 140.5,48.5 137,45 131.9,43.1 130.7,42.3 129.4,37 129.4,35.5 126.5,34.3 126.5,37 125,39.5 124.4,40 122,39.5 121,40.9 118,39 117.7,39.1 119,37.5 121.5,37.5 120,36 121.8,31.4 120,30 121.5,28 119.5,26 117,23.7 113.5,22.2 110.5,21.5 108.5,21.5 106.8,20.6 106.5,19 107.5,17 108.5,15.5 109.4,13 109.2,11 107,10.5 105,9.5 104.5,10.5 103.5,11 102.5,12.5 100.9,13.5 99.9,12 99,9 102.5,6 103.5,4 104,1.4 100.4,6.5 98.5,8.5 98.5,12 97,16.5 94.5,18 92,21 90.5,22.5 88,21.5 86.5,20.5 84,18.5 82,16.7 80.3,13.1 79.8,10 79.8,9.2 77.5,8.1 76,10 74.8,13 73.8,15.5 72.8,19 72.6,21.5 70,20.9 68.9,22.5 67,24.8 61.5,25.2 57.8,25.6 56.4,26.4 58.6,23.6 59.8,22.5 57,20 55,17.5 52.2,15.6 48,14 45,12.8 43.3,12.6 39,21 34.5,31.5 36,36.5 30,36.5 26,38 20,36 12,37 5,36.5 -2,36 -5.6,36",
  // North America, Panama to Alaska: the Gulf coast, Florida, the Atlantic
  // seaboard, Labrador, the Arctic mainland, the Bering coast, the Pacific
  // northwest and Baja. Hudson Bay is swallowed here and cut back out below.
  "-79,9.5 -83.5,15 -88,18.5 -87,21.5 -90.5,21 -92,18.5 -95,18.5 -97,21 -97.5,26 -94,29.5 -89,29 -84.5,29.8 -83,29 -82,26 -80,25.2 -81,31.5 -76,35 -75.5,37 -74,40.5 -71,41.5 -70.5,43.2 -66,45.2 -64.5,47.5 -66.5,49.5 -64,50 -56.5,51.5 -60.5,55 -64,58.5 -64.5,60.3 -70,61.5 -77.5,62 -78.5,56 -79.5,51.5 -82,55.2 -88,56 -94.5,59 -88,64 -92,66 -95,68.5 -100,68.5 -107,68.5 -115,68.5 -124.5,69.5 -128,70.2 -135,69.5 -145,70.1 -156.5,71.4 -163,70.2 -166.5,68.3 -168,65.7 -165,64.5 -162,63 -165,60.5 -162,58.5 -165,54.5 -161,55.5 -158,56 -153,57.5 -150,59 -145,60 -137,59 -133,57 -131,55 -124,48.4 -124.6,46.3 -124,43.5 -124.2,40.4 -122,37 -120.5,34.5 -117.1,32.5 -116,29 -114.5,27.5 -112.2,24.3 -109.9,22.9 -110,24 -111.5,26.5 -113.5,29.5 -114.7,31.7 -112.5,30 -109.5,27 -108.5,25.5 -105.5,20.5 -101,17 -96,16 -92,15 -87,13 -83,10 -79,8",
  // South America: the Caribbean coast, the Brazilian bulge, the Plata,
  // Patagonia, Tierra del Fuego, the Chilean fjords, Peru's elbow.
  "-77.5,8 -75.5,10.4 -71.5,12.4 -68,10.5 -62,10.7 -60,8.6 -58,6.8 -54,5.5 -51,4 -48.5,-1 -44.5,-2.5 -38.5,-3.7 -35,-5.5 -37.5,-11 -39,-13.5 -39.8,-18 -41,-22 -43.2,-23 -48,-25.5 -48.5,-28.5 -52,-32 -56,-35 -57.5,-38 -62,-39 -62.5,-42 -65,-45 -67.5,-46 -68,-50 -68.5,-52.5 -67,-55.9 -70,-55 -74,-52 -75.5,-48 -75,-45 -73.5,-42 -73.5,-37 -71.6,-33 -70.5,-25 -70.4,-23.6 -70.2,-18.5 -77,-12 -80.5,-5 -81.3,-4.7 -80.9,-2.2 -80,-1 -79.9,0.5 -78.5,1.5 -77.1,3.9 -77.5,7",
  // Australia, from Cape York clockwise; the Gulf of Carpentaria closes it.
  "142.5,-10.7 145.5,-15 146.5,-19 149.5,-22 153,-25.5 153.6,-28.5 152.5,-32.5 150.9,-35.5 148,-37.5 146,-38.8 144.5,-38.2 140.5,-38 138.5,-35.5 137.5,-33 136.5,-35 135,-34.7 132,-32 128,-32 125,-32.5 119,-34 115.5,-34.5 115,-32 114,-28 113.5,-26 114,-22 117.5,-20.5 121,-19.5 123,-16.5 126,-14 129.5,-14.8 132,-12 136.5,-12 136.5,-15.5 140,-17.5 141.5,-15 142,-12",
  // Antarctica: a ring closed across the pole, with the Peninsula reaching
  // north to −63° and the Ross and Weddell embayments cut in.
  "-180,-78.5 -160,-78.5 -150,-75.5 -130,-73.5 -110,-73.5 -100,-73 -90,-72.5 -80,-72 -70,-70 -65,-67 -60,-64 -57,-63.2 -55,-66 -50,-70 -45,-75 -35,-77.5 -25,-76 -15,-71.5 -5,-70.5 5,-70 15,-70 25,-70 35,-69.5 45,-68 55,-67 65,-67.5 75,-68.5 85,-66.5 95,-66 105,-66.5 115,-66.5 125,-66.5 135,-66 145,-67 155,-69 165,-72.5 170,-75 175,-78 180,-78.5 180,-90 -180,-90",
  // Greenland.
  "-73,78 -68,76 -60,76 -55,69 -53,66 -50,62 -43,60 -42,63 -38,65.5 -32,68 -25,70.5 -21,72 -22,75 -18,76.5 -17,80.5 -25,82 -38,83.5 -50,82.5 -62,81.5 -70,80",
  // The Canadian Arctic: Baffin, Ellesmere, Victoria, Banks.
  "-61,66.5 -64,63 -70,62.5 -78,70 -80,73 -73,73.5 -68,70 -63,68",
  "-80,76 -87,77 -85,80 -75,83 -65,82.5 -62,80 -68,77.5",
  "-118,74 -114,69 -105,68.8 -100,71.5 -104,73.5 -112,74.5",
  "-125,74 -121,71.5 -117,70 -113,73 -119,75",
  // Newfoundland, Iceland, Britain, Ireland, Svalbard, Novaya Zemlya, Sakhalin.
  "-59.5,47.6 -55,46.7 -52.7,47.5 -55.5,51.5 -58,50",
  "-24.5,65.5 -22,63.9 -18,63.4 -14,64.3 -13.5,66.5 -18,66.5 -22.5,66.5",
  "-5.2,50 -3,51.5 1.4,51.4 0.5,53 -0.2,54.6 -2,56 -3,58.6 -5,58.5 -5.7,56.5 -4.8,54.8 -3.2,54 -5.3,51.8",
  "-10.2,51.5 -6.2,52.2 -6,54.1 -7.3,55.3 -10,54.3 -9.9,53",
  "10,77 18,76.5 21,78.2 17,80.1 11,79.8",
  "52,71 57,70.7 60,72.5 68,73.5 69,76.5 61,77 55,74.5",
  "142,54.3 143.5,51.5 143,46.5 142,45.9 141.7,49 141.5,52.5",
  // Japan (Honshu with the Kansai bend, Hokkaido, Kyushu/Shikoku), Taiwan.
  "141,41.5 140.5,38.5 141,36.5 139.8,35 137,37 136,36.5 135,33.6 132.5,34 131,33.5 130,32 129.5,33.3 131,34.8 133,35.5 136,37.5 138,37.5 140,40.5",
  "140,41.8 143,42.2 145.5,43.4 145,45.5 141.6,45.4 140.3,43.3",
  "121.9,25.3 121.5,22.5 120.2,22.6 120.2,25.2",
  // Indonesia and the Philippines: Sumatra, Java, Borneo, Sulawesi, New Guinea,
  // Luzon, Mindanao.
  "95.3,5.6 98,3.5 101,2.3 104,-1.5 105.8,-5.9 103,-5.3 100,-2 97,1 95,4",
  "105.2,-6.4 110,-6.9 114.5,-8.2 114,-8.7 110,-8.2 105.5,-7.4",
  "109,1.8 110,-1 114,-3.5 117,-4.1 118.5,-3.5 117.5,-0.8 118.8,1 117,4.3 114,4.7 109.5,2.8",
  "119.8,-5.6 120.5,-2.5 122,-1 124,1.5 125.2,1.5 123.5,-0.6 121.5,-2 123.3,-4.5 121,-5.5",
  "131,-1.3 135,-2 138,-1.6 141,-2.6 145,-4.5 147.5,-6 150,-9.5 146,-8 143,-9 140.5,-8.4 137,-8.3 133.5,-4.5 130.8,-3.8",
  "120.6,18.5 122,18 122.3,15 121.5,13.5 122,12.5 120.8,13.8 119.8,16.4",
  "126,7.3 126.5,6 125,5.6 124,7 122,7.5 124.3,9.8 125.5,9.6",
  // New Zealand, Tasmania, Sri Lanka, Madagascar, Cuba, Hispaniola.
  "172.7,-34.4 175,-37 177,-37.5 178.5,-37.6 177,-39.3 174.9,-41.3 172.6,-40.5 174,-38.7",
  "172,-40.6 174,-41.7 171,-44.2 168,-46.6 166.5,-45.9 170.5,-43",
  "144.7,-40.7 148,-40.8 148,-43.2 146.5,-43.6 145,-42.5",
  "80,9.6 81.9,7.5 81.7,6.1 80,6 79.7,8.2",
  "49.4,-12.3 50.5,-15.5 50.2,-18 47.5,-24.5 45.2,-25.6 43.3,-22 43.5,-19 46.3,-15.7 48.5,-13.4",
  "-84.9,21.9 -80,22.9 -75.7,20.3 -77.5,19.9 -80.5,21.8 -84.5,21.5",
  "-74.5,20 -68.3,19.9 -68.5,18.2 -71.7,18.2 -74.4,18.5",
  // Sicily and Sardinia, so the Mediterranean isn't an empty pool.
  "12.4,38.1 15.6,38.2 15.1,36.7 12.5,37.6",
  "8.2,41.2 9.6,41 9.7,39 8.4,38.9",
];

/** Enclosed seas, gulfs and great lakes — subtracted from the land above. */
export const EARTH_WATER: readonly Outline[] = [
  // The Mediterranean, cut so Iberia, Italy, the Balkans and Anatolia emerge:
  // the Alboran, the Tyrrhenian, the Adriatic, the Aegean and the Levantine.
  "-5.4,35.9 -2,36.5 0,38.8 3,41.8 6,43.2 8,43.5 10,42.5 12,41.2 13,40.8 15.5,40 16,41.8 18.5,40 19,41.9 20,39.5 22.5,40 23,37.5 24,40.5 26.5,40.5 29,41 33,36.5 36,36.6 35,34.5 33,31.4 25,31.5 20,30.2 15,33 10,37.2 4,36.8 -1,35.2",
  // The Black Sea and the Sea of Azov.
  "28,41.2 32,42 36,44.5 38,46.3 40,43.5 41.5,41.5 36,41 30,41",
  // The Caspian and the Aral.
  "48,47 52,46.5 54,43 53.5,39 51.5,36.7 49.5,37.5 48.5,40.5 47,44",
  "58.5,46.5 61,46.5 61,44.5 58.5,44.7",
  // The Baltic, its gulfs, and the Gulf of Bothnia up to Lapland.
  "10.5,54.6 14,54.4 19,54.5 21,55.5 24,56.4 21,57.6 21.5,59 24,59.6 28,60 26,61 21.5,63.3 24.2,65.6 20.5,64.5 18,61.5 17,58.5 14,55.4 11,55.2",
  // The North Sea, the Channel, the Irish Sea and the Bay of Biscay.
  "-4,50 -1,50.2 2,51.2 4,53 6,54 8,57 6,58.5 2,58.8 -2,58 -3,55.5 -5,53.5 -6.5,54.5 -8,52 -6,50.5 -1.5,48.5 -4,45 -2,43.6 -8,43.7 -10,45 -8,48.5",
  // The Red Sea and the Gulf of Aqaba/Suez.
  "43.4,12.6 39.5,15.5 37,19.5 34.6,28 32.6,29.5 33.5,27.8 35.5,23.5 38.5,18 41.5,15 43,12.2",
  // The Persian Gulf and the Gulf of Oman.
  "56.5,26.5 54,25 51,24.5 48,29 48.5,30.5 50,30 53,27 57,25.3",
  // The White Sea, Hudson Bay's core (the coarse outline above swallowed it),
  // James Bay, and the Great Lakes.
  "33,66.5 38,66.2 40,64.5 44,65 45,67 41,68.5 36,68",
  "-95,60 -88,57 -82,55.5 -79.5,52 -79,55 -78,60 -80,63 -87,64 -93,63.5",
  "-82,53 -79.5,52 -79.5,55.2 -81.5,55",
  "-92,47 -85,47 -82,45.5 -79,44 -76.5,44.3 -79.5,43 -83,42 -87,44.5 -90,46.3",
];

/** Ice sheets and permanent pack ice. */
export const EARTH_ICE: readonly Outline[] = [
  // Greenland's ice sheet — the whole island bar a coastal fringe.
  "-70,79 -62,80.5 -45,82 -30,80 -22,74 -25,70 -33,68.5 -42,62 -48,63 -52,67 -56,70 -63,75",
  // The Arctic pack. It starts north of Greenland's coast on purpose: let the
  // pack reach down to 80° and the island stops reading as an island.
  "-180,83 180,83 180,90 -180,90",
  // The Antarctic ice sheet — the whole continent, which is why the south
  // polar cap reads twice the size of the north's from space.
  "-180,-76 -150,-74 -120,-72 -90,-71 -70,-69 -62,-65 -58,-64 -55,-67 -45,-74 -30,-76 -15,-70 0,-69 30,-69 60,-66.5 90,-65.5 120,-66 150,-66.5 170,-73 180,-77 180,-90 -180,-90",
];

/** Deserts — sand, rock and salt, the brightest ground on the planet. */
export const EARTH_DESERT: readonly Outline[] = [
  // The Sahara, from the Atlantic to the Red Sea, plus Arabia and Iran.
  "-14,26 -5,25 5,23 15,24 25,25 32,26 34,29 30,31 20,31 10,31 0,29 -8,29 -13,28 -16,22 -14,18 -6,17 5,15 15,15 22,16 30,18 34,21 32,24 20,22 8,20 -4,21",
  "35,29 42,30 50,29 56,25 58,22 52,18 46,15 42,17 38,22 34,26",
  "58,33 62,33 64,29 61,26 56,28 55,31",
  "68,28 73,28 72,25 69,24",
  // The Taklamakan and the Gobi.
  "76,40 86,41 90,39 84,37 78,37",
  "95,44 108,45 112,42 104,40 97,41",
  // The Kalahari and Namib.
  "14,-20 22,-20 25,-24 22,-28 16,-28 12,-24",
  // Atacama and the Peruvian coast.
  "-70.5,-18 -68.5,-22 -69,-27 -71,-28 -71,-22",
  // The North American southwest: the Great Basin, Sonora and Chihuahua.
  "-120,40 -114,41 -110,35 -105,29 -103,25 -108,24 -114,29 -117,33 -120,36",
  // Patagonia's steppe.
  "-71,-40 -66,-40 -66,-50 -70,-51 -72,-46",
  // The Australian interior.
  "116,-22 126,-20 135,-21 141,-24 142,-30 137,-33 128,-31 120,-30 115,-26",
];

/** Rainforest and dense tropical canopy — the darkest green. */
export const EARTH_FOREST: readonly Outline[] = [
  // Amazonia.
  "-73,-1 -66,2 -58,3 -51,-1 -48,-5 -52,-10 -60,-12 -68,-10 -73,-6",
  // The Congo basin.
  "9,2 18,4 27,3 29,-2 26,-7 18,-7 12,-4 9,-1",
  // West Africa's coast, the Guinea forest.
  "-13,7 -5,7 3,7 8,5 4,4 -4,4.5 -11,5",
  // Indonesia, New Guinea and the Malay peninsula.
  "96,4 104,1 110,-2 117,-3 119,1 113,3 105,4",
  "105,-6 114,-8 118,-3 112,-1 106,-3",
  "132,-2 145,-5 149,-9 141,-8 134,-5",
  "99,3 103,3 104,1 101,1",
  // Central America and the Chocó.
  "-92,17 -85,13 -79,9 -77,4 -79,2 -84,11 -90,15",
  // India's Western Ghats and the Southeast Asian monsoon belt.
  "95,22 103,15 107,12 104,10 98,15 94,19",
];

/** The boreal forest belt — the taiga ring across Canada and Siberia. */
export const EARTH_BOREAL: readonly Outline[] = [
  "-140,66 -110,62 -80,52 -60,50 -55,54 -75,58 -100,62 -130,68",
  "-140,60 -120,55 -95,50 -75,46 -60,48 -85,52 -115,56 -138,63",
  "10,63 30,62 60,60 90,58 120,56 140,58 160,62 140,66 110,64 70,66 30,66 12,67",
  "20,56 40,55 70,54 100,52 125,52 140,54 120,58 90,58 55,60 25,60",
];

/** Mountain snow and high rock. */
export const EARTH_MOUNTAIN: readonly Blob[] = [
  { lon: 85, lat: 30, r: 2.6, rx: 12, amount: 0.85, hard: 0.2 }, // Himalaya
  { lon: 76, lat: 36, r: 2.6, rx: 6, amount: 0.75, hard: 0.2 }, // Karakoram
  { lon: 92, lat: 33, r: 5, rx: 10, amount: 0.6, hard: 0.15 }, // Tibet
  { lon: -70, lat: -20, r: 14, rx: 2.5, amount: 0.75, hard: 0.2 }, // Andes
  { lon: -72, lat: -42, r: 10, rx: 2, amount: 0.6, hard: 0.2 },
  { lon: -76, lat: 2, r: 6, rx: 2, amount: 0.6, hard: 0.2 },
  { lon: -113, lat: 44, r: 8, rx: 5, amount: 0.5, hard: 0.15 }, // Rockies
  { lon: -122, lat: 48, r: 4, rx: 2.5, amount: 0.5, hard: 0.2 }, // Cascades
  { lon: 10, lat: 46.5, r: 2, rx: 5, amount: 0.7, hard: 0.25 }, // Alps
  { lon: 43, lat: 42.5, r: 1.2, rx: 4, amount: 0.45, hard: 0.25 }, // Caucasus
  { lon: 37, lat: -3, r: 1.2, rx: 1.2, amount: 0.7, hard: 0.4 }, // Kilimanjaro
  { lon: 138, lat: 36, r: 1.6, rx: 2.5, amount: 0.5, hard: 0.3 }, // Japan Alps
];

// ---------------------------------------------------------------------------
// MARS — the albedo map the telescopes drew before the probes went.
// ---------------------------------------------------------------------------
//
// The dark markings are not seas but dust-free basalt swept bare by the wind,
// and they are the features every Mars picture is recognised by: the dark
// wedge of Syrtis Major, the bright ochre bowl of Hellas beside it, the
// Tharsis volcanoes and the 4 000-km gash of Valles Marineris. Longitudes are
// east-positive planetocentric, as the USGS maps use them.

/** Dark, dust-free basaltic terrain (classical albedo features). */
// NOTE ON LONGITUDES: a polygon's points must run CONTINUOUSLY — a shape that
// crosses the prime meridian is written −10 → 5, never 350 → 5, or the fill
// spans the long way round the planet. (Values past 360 are fine; the raster
// wraps columns.) Every wrap bug in this file has been that one.
export const MARS_DARK: readonly Outline[] = [
  // Syrtis Major Planum — the great triangular wedge, 8°N 70°E.
  "62,17 76,18 79,8 75,-3 68,-5 64,4",
  // Mare Acidalium / Acidalia Planitia, the northern dark plain.
  "-30,35 -10,38 10,42 20,55 0,62 -20,58 -35,45",
  // Utopia and Elysium's dark surrounds.
  "100,38 130,42 150,45 155,32 130,28 105,28",
  // Mare Erythraeum, Margaritifer, Solis Lacus (the "eye of Mars").
  "300,-20 320,-18 340,-22 345,-32 320,-40 300,-38 290,-28",
  // Solis Lacus — the "eye of Mars", a dark oval inside Solis Planum.
  "265,-22 275,-30 285,-27 283,-18 272,-16",
  // Sinus Meridiani and Sinus Sabaeus — the prime meridian's dark band.
  "-10,-2 5,-3 20,-6 35,-8 30,-14 10,-12 -8,-8",
  // Mare Cimmerium and Mare Sirenum, the long southern dark belt.
  "180,-18 210,-20 235,-24 240,-34 210,-38 180,-32 165,-25",
  "130,-18 160,-20 168,-30 145,-34 128,-28",
  // Mare Tyrrhenum, east of Syrtis.
  "80,-12 105,-14 115,-22 95,-28 78,-22",
  // Olympia Undae — the dark dune sea that collars the north polar cap.
  "-180,74 180,74 180,80 -180,80",
];

/** Bright dust-covered terrain — Arabia, Hellas, Argyre, the Tharsis plateau. */
export const MARS_BRIGHT: readonly Outline[] = [
  // Arabia Terra.
  "-50,10 -20,18 10,25 35,20 40,5 20,0 -10,2 -40,0",
  // Hellas Planitia — the 2 300-km impact basin, 42°S 70°E.
  "50,-35 70,-30 90,-38 88,-52 68,-58 50,-50",
  // Argyre Planitia.
  "305,-45 325,-42 330,-55 312,-58 300,-52",
  // Tharsis rise and Amazonis Planitia.
  "220,20 250,25 265,10 260,-8 235,-12 215,0",
  "170,25 200,28 205,10 180,5 165,12",
  // Elysium Planitia.
  "135,15 160,18 165,5 140,2",
];

/** Volcanoes, craters and the canyon system, as raised/incised marks. */
export const MARS_FEATURES: readonly Blob[] = [
  { lon: 226.2, lat: 18.65, r: 5, amount: 1, hard: 0.55 }, // Olympus Mons, 600 km
  { lon: 239, lat: -8.4, r: 2.2, amount: 0.9, hard: 0.5 }, // Arsia Mons
  { lon: 247, lat: 0.8, r: 2, amount: 0.9, hard: 0.5 }, // Pavonis Mons
  { lon: 255, lat: 11.8, r: 2.2, amount: 0.9, hard: 0.5 }, // Ascraeus Mons
  { lon: 147, lat: 25, r: 2.4, amount: 0.8, hard: 0.5 }, // Elysium Mons
];

/** Valles Marineris — traced as a chain rather than a polygon so it keeps the
 * canyon's east-west taper from Noctis Labyrinthus out into Chryse. */
export const MARS_CANYON: readonly Blob[] = [
  { lon: 265, lat: -7, r: 3.4, rx: 3.4, amount: 0.7, hard: 0.4 }, // Noctis
  { lon: 271, lat: -8.5, r: 2.2, rx: 5, amount: 0.85, hard: 0.6 }, // Tithonium
  { lon: 277, lat: -9.5, r: 2.6, rx: 5, amount: 0.95, hard: 0.7 }, // Ius
  { lon: 283, lat: -10.5, r: 2.8, rx: 5, amount: 1, hard: 0.75 }, // Melas
  { lon: 289, lat: -11.5, r: 3, rx: 5, amount: 1, hard: 0.75 }, // Candor
  { lon: 295, lat: -12.5, r: 3, rx: 5, amount: 1, hard: 0.75 }, // Ophir
  { lon: 301, lat: -13.5, r: 2.8, rx: 5, amount: 1, hard: 0.75 }, // Coprates
  { lon: 307, lat: -14, r: 2.6, rx: 5, amount: 1, hard: 0.75 },
  { lon: 313, lat: -13.5, r: 2.4, rx: 5, amount: 0.9, hard: 0.7 }, // Eos
  { lon: 319, lat: -12, r: 2, rx: 5, amount: 0.8, hard: 0.6 }, // Capri
  { lon: 325, lat: -10, r: 1.7, rx: 4.5, amount: 0.6, hard: 0.5 },
  { lon: 331, lat: -8.5, r: 1.4, rx: 4, amount: 0.45, hard: 0.45 }, // Chryse
];

// ---------------------------------------------------------------------------
// THE MOON — the maria, and why the near side looks nothing like the far side.
// ---------------------------------------------------------------------------
//
// The dark maria are flood basalt, and they are almost all on the near side:
// the face the Earth has always seen is a third mare, the far side barely a
// twentieth. Longitude 0 is the middle of the near side, so the near-side
// features cluster around it and the far side (±180) stays bright, cratered
// highland — which is exactly what the globe shows as it turns.

// Centres and diameters are the catalogued ones (IAU / "List of maria on the
// Moon"), converted to angular radii at 30.3 km per degree — the Moon is small
// enough that a 500-km mare is a 10° blot, which is why so few of them fit.
export const MOON_MARIA: readonly Blob[] = [
  // Oceanus Procellarum, 20.7°N 56.7°W — 2 600 km across, a fifth of the near
  // side on its own, and the reason the western limb is dark end to end.
  { lon: -52, lat: 17, r: 31, rx: 23, amount: 1, hard: 0.5 },
  { lon: -14.9, lat: 34.7, r: 18.9, rx: 19, amount: 1, hard: 0.5 }, // Imbrium
  { lon: 18.4, lat: 27.3, r: 11.1, rx: 11.1, amount: 1, hard: 0.6 }, // Serenitatis
  { lon: 30.8, lat: 8.4, r: 14.5, rx: 14.5, amount: 1, hard: 0.5 }, // Tranquillitatis
  { lon: 53.7, lat: -7.8, r: 13.9, rx: 10, amount: 0.95, hard: 0.5 }, // Fecunditatis
  { lon: 59.1, lat: 16.2, r: 9.2, rx: 9.2, amount: 1, hard: 0.7 }, // Crisium
  { lon: 34.6, lat: -15.2, r: 5.6, rx: 5.6, amount: 0.9, hard: 0.6 }, // Nectaris
  { lon: -38.6, lat: -24.5, r: 6.9, rx: 6.9, amount: 0.9, hard: 0.6 }, // Humorum
  { lon: -17.3, lat: -20.6, r: 8, rx: 11.8, amount: 0.85, hard: 0.45 }, // Nubium
  { lon: -22, lat: -10, r: 6, rx: 8, amount: 0.8, hard: 0.4 }, // Cognitum
  { lon: 4.1, lat: 13.2, r: 4, rx: 4.5, amount: 0.8, hard: 0.5 }, // Vaporum
  // Frigoris is an ARC, not a disc: 1 450 km of it strung along 57°N.
  { lon: -28, lat: 57.6, r: 4, rx: 24, amount: 0.7, hard: 0.35 },
  { lon: 18, lat: 57.6, r: 3.5, rx: 16, amount: 0.6, hard: 0.35 },
  { lon: -68, lat: 8, r: 9, rx: 7, amount: 0.6, hard: 0.35 }, // Orientale rim
  // The far side's few: Moscoviense, Ingenii, and the South Pole–Aitken floor.
  { lon: 148.1, lat: 27.3, r: 4.6, rx: 4.6, amount: 0.8, hard: 0.6 },
  { lon: 164.8, lat: -33.3, r: 4.7, rx: 4.7, amount: 0.6, hard: 0.5 },
  { lon: 180, lat: -53, r: 20, rx: 30, amount: 0.35, hard: 0.2 },
];

/** Bright ray craters — Tycho's system reaches a third of the way round. */
export const MOON_RAYS: readonly Blob[] = [
  { lon: -11.4, lat: -43.3, r: 26, rx: 26, amount: 0.5, hard: 0.05 }, // Tycho rays
  { lon: -11.4, lat: -43.3, r: 1.5, rx: 1.5, amount: 1, hard: 0.85 }, // Tycho
  { lon: -20.1, lat: 9.6, r: 10, rx: 10, amount: 0.35, hard: 0.05 }, // Copernicus
  { lon: -20.1, lat: 9.6, r: 1.5, rx: 1.5, amount: 0.9, hard: 0.85 },
  { lon: -47.4, lat: 23.7, r: 8, rx: 8, amount: 0.3, hard: 0.05 }, // Aristarchus
  { lon: -47.4, lat: 23.7, r: 1.8, rx: 1.8, amount: 1, hard: 0.9 },
  { lon: 60, lat: -26, r: 8, rx: 8, amount: 0.3, hard: 0.05 }, // Langrenus
  { lon: 129, lat: -20, r: 3, rx: 3, amount: 0.5, hard: 0.7 }, // Tsiolkovskiy
];

// ---------------------------------------------------------------------------
// MERCURY — smooth plains, one enormous basin, and rays over everything.
// ---------------------------------------------------------------------------

/** Caloris and the northern volcanic plains — smoother and slightly paler. */
export const MERCURY_PLAINS: readonly Blob[] = [
  { lon: 161.2, lat: 30.5, r: 18.2, rx: 18.2, amount: 0.75, hard: 0.4 }, // Caloris
  { lon: 30, lat: 68, r: 20, rx: 60, amount: 0.5, hard: 0.2 }, // Borealis
  { lon: -160, lat: -22, r: 12, rx: 14, amount: 0.4, hard: 0.25 }, // antipode
  { lon: 100, lat: -20, r: 9, rx: 10, amount: 0.35, hard: 0.3 }, // Rembrandt
];

/** The bright ray craters — Mercury's freshest, brightest marks. */
export const MERCURY_RAYS: readonly Blob[] = [
  { lon: -31, lat: -11, r: 12, rx: 12, amount: 0.45, hard: 0.05 }, // Kuiper
  { lon: -31, lat: -11, r: 2, rx: 2, amount: 0.9, hard: 0.85 },
  { lon: -34, lat: -34, r: 14, rx: 14, amount: 0.4, hard: 0.05 }, // Debussy
  { lon: -34, lat: -34, r: 2.4, rx: 2.4, amount: 0.9, hard: 0.85 },
  { lon: 121, lat: 58, r: 10, rx: 12, amount: 0.35, hard: 0.05 }, // Hokusai
  { lon: 121, lat: 58, r: 2, rx: 2.4, amount: 0.9, hard: 0.85 },
];

// ---------------------------------------------------------------------------
// THE GAS AND ICE GIANTS — latitude bands, not geography.
// ---------------------------------------------------------------------------
//
// A giant has no surface to map. What it has is zones (rising, bright ammonia
// cloud) and belts (sinking, darker and warmer), striped by latitude and
// smeared by winds that run in opposite directions on either side of each
// boundary. Each entry is one band: where it sits, how wide it is, and how
// far its colour departs from the planet's base.

/** A latitude band: centre and half-width in degrees, and a signed shade —
 * positive toward the belt colour, negative toward the zone colour. */
export type Band = { lat: number; width: number; shade: number };

/** Jupiter: the equatorial zone, the two great belts, and the polar hoods. */
export const JUPITER_BANDS: readonly Band[] = [
  { lat: 0, width: 7, shade: -0.55 }, // Equatorial Zone
  { lat: 10, width: 6, shade: 0.95 }, // North Equatorial Belt
  { lat: -12, width: 8, shade: 0.9 }, // South Equatorial Belt
  { lat: 20, width: 4, shade: -0.5 }, // North Tropical Zone
  { lat: -22, width: 4, shade: -0.45 },
  { lat: 27, width: 4, shade: 0.6 }, // North Temperate Belt
  { lat: -30, width: 4, shade: 0.55 },
  { lat: 36, width: 4, shade: -0.35 },
  { lat: -38, width: 4, shade: -0.35 },
  { lat: 45, width: 5, shade: 0.35 },
  { lat: -46, width: 5, shade: 0.3 },
  { lat: 58, width: 8, shade: 0.15 },
  { lat: -58, width: 8, shade: 0.15 },
  { lat: 78, width: 14, shade: 0.45 }, // polar hoods, greyer
  { lat: -78, width: 14, shade: 0.45 },
];

/** Saturn: the same architecture, muted by a deep high haze. */
export const SATURN_BANDS: readonly Band[] = [
  { lat: 0, width: 10, shade: -0.5 },
  { lat: 14, width: 6, shade: 0.4 },
  { lat: -14, width: 6, shade: 0.35 },
  { lat: 25, width: 6, shade: -0.3 },
  { lat: -25, width: 6, shade: -0.25 },
  { lat: 36, width: 6, shade: 0.3 },
  { lat: -36, width: 6, shade: 0.25 },
  { lat: 48, width: 7, shade: -0.2 },
  { lat: -48, width: 7, shade: -0.15 },
  { lat: 62, width: 8, shade: 0.25 },
  { lat: -62, width: 8, shade: 0.2 },
  { lat: 80, width: 12, shade: 0.5 }, // the north polar hexagon's bluish cap
];

/** Neptune: a near-blank disc with two faint bands and a bright south. */
export const NEPTUNE_BANDS: readonly Band[] = [
  { lat: 0, width: 12, shade: 0.25 },
  { lat: 30, width: 10, shade: -0.3 },
  { lat: -32, width: 10, shade: -0.35 },
  { lat: -70, width: 14, shade: -0.4 },
];

/** Uranus: effectively featureless — a whisper of a band and a bright pole. */
export const URANUS_BANDS: readonly Band[] = [
  { lat: 0, width: 25, shade: 0.1 },
  { lat: 60, width: 20, shade: -0.15 },
];

/** Jupiter's Great Red Spot and the white ovals that trail it. */
export const JUPITER_SPOTS: readonly Blob[] = [
  { lon: 60, lat: -22, r: 5, rx: 7, amount: 1, hard: 0.45 },
  { lon: 130, lat: -41, r: 2.5, rx: 4, amount: -0.6, hard: 0.4 },
  { lon: 160, lat: -41, r: 2.2, rx: 3.5, amount: -0.55, hard: 0.4 },
  { lon: -40, lat: 18, r: 3, rx: 7, amount: 0.4, hard: 0.3 },
];

/** Neptune's dark spots — transient, but the planet's one landmark. */
export const NEPTUNE_SPOTS: readonly Blob[] = [
  // Soft-edged on purpose: a dark spot on an ice giant is a hole in the cloud
  // deck, not a painted oval, and it fades out at its rim.
  { lon: -30, lat: -22, r: 6, rx: 11, amount: 1, hard: 0.12 },
  { lon: 20, lat: -42, r: 3, rx: 5, amount: -0.8, hard: 0.2 },
];

/** Saturn's rings, inner and outer edge in planet radii, with the gaps that
 * separate them. Real radii: the C ring starts at 1.24 R, the B ring's bright
 * body runs to 1.95, the Cassini division cuts to 2.02, and the A ring ends at
 * 2.27 R with the Encke gap near its outer edge. */
export const SATURN_RINGS: readonly {
  from: number;
  to: number;
  alpha: number;
  tint: number;
}[] = [
  { from: 1.11, to: 1.269, alpha: 0.08, tint: 0.4 }, // D ring, barely there
  { from: 1.238, to: 1.526, alpha: 0.34, tint: 0.55 }, // C ring, dusky
  { from: 1.526, to: 1.95, alpha: 0.95, tint: 1 }, // B ring, the bright body
  { from: 1.95, to: 2.026, alpha: 0.1, tint: 0.5 }, // Cassini division
  { from: 2.026, to: 2.212, alpha: 0.62, tint: 0.85 }, // A ring
  { from: 2.212, to: 2.218, alpha: 0.12, tint: 0.6 }, // Encke gap
  { from: 2.218, to: 2.268, alpha: 0.55, tint: 0.8 }, // A ring, outer
];
