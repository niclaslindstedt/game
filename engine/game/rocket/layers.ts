// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE LAYERS OF THE SKY — who flies at what altitude, as one authored table.
//
// THE CLIMB IS A SEQUENCE OF NEIGHBOURHOODS, and this file is the list of
// them. A rocket leaving a back garden passes the birds, then the parcel
// quads over the rooftops, then the light-aircraft lanes and somebody's
// canopy, then the airliners at their cruise, then the solar-winged drones
// nobody has to look at — and only above all of that the internet
// constellation, the military's own orbits over it, and GOODCO's shell of
// garbage on top of the lot. Each is a BAND with a floor, a ceiling and a fade
// at each end, so a neighbourhood arrives and leaves instead of switching on,
// and the player learns the sky by flying up through it.
//
// THE BANDS ARE REAL ALTITUDES, CONVERTED. `FLIGHT.metersPerPx` is the one
// exchange rate (11.9 m per world px), so every figure below is a place in the
// actual atmosphere rather than a fraction of a progress bar: airliners cruise
// where airliners cruise, and a bird is not in the stratosphere. Where reality
// runs off the top of the course — an internet constellation sits three times
// higher than this whole climb — the ORDER is kept and the distance
// compressed, because what the player has to read is which neighbourhood
// they are in, not how many kilometres it is to the next one.
//
// TWO MARKS WALK THIS TABLE, and which one a layer is on is load-bearing
// (`FlightState.nextTrafficAt` / `nextOrbitAt`, `field.ts`). Air TRAFFIC is
// dealt off the flight's own traffic stream and thickens when the ship wanders
// out of the closed corridor; everything in ORBIT is dealt off the shell's
// stream on a stride nothing the player does can move, because a restart
// replays the same sky and the hardware that killed you has to be waiting in
// the same place.

import { FLIGHT } from "./config.ts";
import type { OrbitKind } from "./types.ts";

/** World px per kilometre, at the sky's own scale — the unit every band below
 * is authored in, so a band can be checked against the real atmosphere. */
const KM = 1000 / FLIGHT.metersPerPx;

/** Which mark deals a layer — see the file header. */
export type SkyBand = "traffic" | "orbit";

/**
 * ONE NEIGHBOURHOOD OF THE SKY.
 *
 * `from`/`to` are the band's full-strength stretch and `fade` how far outside
 * each end it is still thinning out, so two neighbours OVERLAP: the last birds
 * are still about when the first light aircraft arrive, which is what keeps
 * the ladder from reading as a lift with floors.
 */
export type SkyLayer = {
  /** A stable id — the tests name layers by it. */
  id: string;
  /** What the dashboard's zone readout calls this stretch of sky. Only
   * printed when `zone` — otherwise it is documentation. */
  label: string;
  kind: OrbitKind;
  /**
   * Which art variants of that kind fly here — the sim rolls among THESE
   * rather than across the kind's whole cast, which is how one kind carries
   * two neighbourhoods: a parcel quad over the rooftops and a solar-winged
   * machine at 20 km are both `drone`, and a high-wing single and an airliner
   * are both `plane`.
   */
  variants: readonly number[];
  band: SkyBand;
  /**
   * DOES THIS LAYER NAME THE SKY IT IS IN — whether the dashboard's zone
   * readout may print its label.
   *
   * TWO KINDS OF LAYER SAY NO. One is WEATHER — the rocks are spread across
   * every orbit there is rather than being one of them, so a stretch of sky
   * is never "the rocks". The other is a layer that SHARES a neighbourhood
   * with a louder one: the parcel quads fly among the birds, and a readout
   * with two names for the same two kilometres flickers between them as the
   * ship climbs. Whoever the sky is named after, only one layer may be it.
   */
  zone: boolean;
  /** The band's full-strength stretch (world px of altitude). */
  from: number;
  to: number;
  /** How far past each end it thins to nothing (world px). */
  fade: number;
  /**
   * HOW MANY OF THESE A WHOLE CLIMB MEETS — the number this table is authored
   * in, because it is the only one anybody can judge. A band a rocket crosses
   * in three quarters of a second needs a density ten times a band it spends
   * fifteen in, and quoting both as a density made every row a sum nobody
   * could check; quoted as a count, "the airways" says three airliners and
   * three airliners is what the sky deals. `layerPerKPx` does the arithmetic.
   */
  perTrip: number;
  /**
   * WHAT IT COSTS TO WANDER — this layer's density with the ship fully off the
   * launch corridor, as a multiple. The corridor was closed for the launch and
   * the sky beside it was not, so leaving it is a thicker sky of the things
   * that fly on purpose. Orbits do not care where the pad is and answer 1.
   */
  offCourseMult: number;
  /**
   * DOES THIS LAYER READ THE RUNG'S HAZARD KNOB.
   *
   * The ladder's job is to decide how much HARDWARE is in the way
   * (`DifficultyDef.flight.hazardMult`); it is not to decide how many birds
   * there are. So everything that can hole the ship scales with the rung and
   * the soft cast is the same lived-in sky on every one of them — which is
   * what keeps EASY from reading as an empty afternoon.
   */
  hazard: boolean;
};

/**
 * THE CAST OF THE SKY, bottom to top.
 *
 * THE JUNK SHELL IS NOT IN THIS TABLE. It is the one population that is not a
 * neighbourhood at an altitude but a CEILING the whole upper climb is under,
 * laid down by its own thickening profile — see `FLIGHT.field` and `bandFrac`.
 */
export const SKY_LAYERS: readonly SkyLayer[] = [
  // ── THE FIRST FEW THOUSAND FEET — the sky over the back garden. ───────────
  {
    id: "birds",
    label: "BIRDS",
    kind: "bird",
    variants: [0, 1],
    band: "traffic",
    zone: true,
    from: 0.1 * KM,
    to: 2.4 * KM,
    fade: 1.2 * KM,
    perTrip: 6,
    offCourseMult: 1.4,
    hazard: false,
  },
  {
    // Parcel quads run the rooftops. The rules say 120 m; in an AI world with
    // nobody left to file the paperwork they say what they like.
    id: "parcel",
    label: "PARCEL LANES",
    kind: "drone",
    variants: [0, 1],
    band: "traffic",
    zone: false,
    from: 0.2 * KM,
    to: 1.8 * KM,
    fade: 0.9 * KM,
    perTrip: 3,
    offCourseMult: 2.4,
    hazard: true,
  },
  {
    id: "hobby",
    label: "HOBBY CEILING",
    kind: "paraglider",
    variants: [0, 1],
    band: "traffic",
    zone: true,
    from: 0.6 * KM,
    to: 3.2 * KM,
    fade: 1 * KM,
    perTrip: 2.5,
    offCourseMult: 2.2,
    hazard: false,
  },
  {
    // A canopy opens near 1.5 km under a jump from four.
    id: "jump",
    label: "JUMP ZONE",
    kind: "skydiver",
    variants: [0, 1],
    band: "traffic",
    zone: true,
    from: 1 * KM,
    to: 4.2 * KM,
    fade: 1.2 * KM,
    perTrip: 2.5,
    offCourseMult: 2.2,
    hazard: false,
  },
  {
    // Light aircraft: the pattern and the cross-country lanes, well under the
    // airways. Variant 2 is the high-wing single (`sky_plane_2`).
    id: "light",
    label: "LIGHT TRAFFIC",
    kind: "plane",
    variants: [2],
    band: "traffic",
    zone: true,
    from: 0.5 * KM,
    to: 4.5 * KM,
    fade: 1.4 * KM,
    perTrip: 2.5,
    offCourseMult: 2.6,
    hazard: true,
  },

  // ── THE AIRWAYS — where the big ones actually are. ────────────────────────
  {
    // Cruise is 9–13 km, and this is the one band a player recognises from a
    // window seat, so it is authored where the window seat is: under the
    // stratosphere, not in it.
    id: "airways",
    label: "THE AIRWAYS",
    kind: "plane",
    variants: [0, 1],
    band: "traffic",
    zone: true,
    from: 8.5 * KM,
    to: 13.5 * KM,
    fade: 2.5 * KM,
    perTrip: 4,
    offCourseMult: 2.6,
    hazard: true,
  },

  // ── THE CEILING NOBODY LOOKS AT — solar wings, months aloft, pointed
  //    down. It is an AI world and somebody automated the watching too.
  {
    id: "watch",
    label: "THE WATCH DECK",
    kind: "drone",
    variants: [2],
    band: "traffic",
    zone: true,
    from: 17 * KM,
    to: 30 * KM,
    fade: 5 * KM,
    perTrip: 3,
    offCourseMult: 2,
    hazard: true,
  },

  // ── ORBIT — the company's other business, and the state's. ────────────────
  {
    // The internet constellation: thousands of identical boxes, sold as
    // connectivity for everybody and paid for by the people under the shell.
    id: "constellation",
    label: "CONSTELLATION",
    kind: "satellite",
    variants: [0, 1, 2],
    band: "orbit",
    zone: true,
    from: 52 * KM,
    to: 104 * KM,
    fade: 14 * KM,
    perTrip: 15,
    offCourseMult: 1,
    hazard: true,
  },
  {
    // Higher, quieter, and pointed the other way. Nobody sells these.
    id: "milorbit",
    label: "MIL ORBITS",
    kind: "milsat",
    variants: [0, 1],
    band: "orbit",
    zone: true,
    from: 98 * KM,
    to: 134 * KM,
    fade: 16 * KM,
    perTrip: 10,
    offCourseMult: 1,
    hazard: true,
  },
  {
    // Rocks that never asked anybody — and above the air, which is the only
    // altitude a rock survives being at.
    id: "rocks",
    label: "ORBITAL DEBRIS",
    kind: "rock",
    variants: [0, 1, 2],
    band: "orbit",
    zone: false,
    from: 60 * KM,
    to: 136 * KM,
    fade: 12 * KM,
    perTrip: 9,
    offCourseMult: 1,
    hazard: true,
  },
];

/** How strongly a layer is flying at this altitude, 0–1 — full between its
 * ends, easing over `fade` outside each. */
export function layerFrac(layer: SkyLayer, alt: number): number {
  if (alt >= layer.from && alt <= layer.to) return 1;
  const away = alt < layer.from ? layer.from - alt : alt - layer.to;
  if (away >= layer.fade) return 0;
  const t = 1 - away / layer.fade;
  // Smoothstep, so a neighbourhood arrives rather than ramping linearly out of
  // nothing: the eye reads the flat middle as the band and the tails as its
  // edges.
  return t * t * (3 - 2 * t);
}

/**
 * THE DENSITY A LAYER'S COUNT WORKS OUT TO (spawns per 1000 px of climb at
 * full strength) — `perTrip` over the band's own reach.
 *
 * The reach is the full stretch plus ONE fade: a smoothstep tail integrates to
 * half its width, and there is one at each end.
 */
export function layerPerKPx(layer: SkyLayer): number {
  const reach = layer.to - layer.from + layer.fade;
  return reach > 0 ? (layer.perTrip * 1000) / reach : 0;
}

/**
 * WHAT THE DASHBOARD CALLS THIS STRETCH OF SKY — the loudest layer at this
 * altitude, the shell once the ship is inside it and past everything that
 * flies, and ALL CLEAR once it is out of the top.
 *
 * The shell wins over a layer it overlaps only once that layer has thinned
 * past half: the company's garbage is everywhere above the airways, and a dial
 * that read THE SHELL from 20 km up would never name a neighbourhood at all.
 */
export function skyZoneLabel(alt: number, coursePx: number): string {
  if (alt >= coursePx * FLIGHT.field.shellTopFrac) return "ALL CLEAR";
  let best: SkyLayer | null = null;
  let bestFrac = 0;
  let bestSpan = Number.POSITIVE_INFINITY;
  for (const layer of SKY_LAYERS) {
    if (!layer.zone) continue;
    const frac = layerFrac(layer, alt);
    if (frac <= 0) continue;
    // THE NARROWER BAND WINS A TIE, because the narrower band is the more
    // specific answer: at 1 km the birds, the parcel quads, the canopies and
    // the light aircraft are ALL fully in, and the honest name for that sky is
    // the tightest of them rather than whichever row was authored first.
    const span = layer.to - layer.from;
    if (frac > bestFrac || (frac === bestFrac && span < bestSpan)) {
      best = layer;
      bestFrac = frac;
      bestSpan = span;
    }
  }
  if (best && bestFrac >= 0.5) return best.label;
  if (alt >= FLIGHT.field.startAltPx) return "THE SHELL";
  return "OPEN SKY";
}
