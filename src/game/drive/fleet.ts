// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ROLLING STOCK — every kind of thing with wheels that is not the hero's
// wagon, and what each one weighs.
//
// WHY THIS IS A CATALOG AND NOT A NUMBER. The road used to hold ONE idea of
// "another car": a variant index picked a sprite, and every one of them weighed
// `trafficMassKg`, moved inside one speed band and shrugged a hit off the same
// way. That is fine while the fleet is ten saloons; it falls apart the moment a
// bus and a delivery moped are both on the road, because the whole minigame is
// a momentum sum and MASS is the only input it has. A twelve-tonne bus that
// answers a bumper the way a 30 kg bicycle does is not a presentation bug — it
// is the physics being told a lie, and the player feels it before he can say
// what is wrong.
//
// So a vehicle is a DEF. It carries its own mass, its own collision extent, its
// own speed band and its own share of the traffic, and everything the collision
// does with it falls out of those rather than out of a branch on its id.
//
// FOUR FACTS EACH DEF SETTLES, and each of them buys something the road could
// not do before:
//
//   WHAT IT WEIGHS      — a scooter is shoved out of the way and barely slows
//                         the wagon; a bus is a wall that ends the trip. Both
//                         come out of `massKg` with no special case anywhere.
//   HOW LONG IT IS      — `halfLengthPx`, because a 48-px bus modelled as a
//                         circle could be driven through nose-first. The
//                         collision measures against the vehicle's own extent
//                         (`solveImpact`), so a long thing is long.
//   WHO IS ON IT        — a `rider` sits OUTSIDE and is thrown off by anything
//                         at all; `occupants` sit INSIDE and only leave through
//                         the screen when the blow is square and hard enough
//                         (`drive/eject.ts`). One field each, and the two
//                         behaviours are genuinely different rather than one
//                         drawn twice.
//   HOW IT CARRIES IT   — `topHeavy`, the one thing about a body's shape that
//                         mass and width cannot say. It decides whether a
//                         sideways shove ends with the vehicle sliding or with
//                         it upside down, which is why a van goes over and a
//                         sports car of the same weight does not.
//
// THE ORDER OF THIS TABLE IS `DriveTraffic.variant`, and the app's sprite table
// (`TRAFFIC_SPRITES`, pwa/src/game/drive-screen/scenery.ts) is the same order.
// `tests/content/drive_scenery_test.ts` pins the pair.

import type { Rng } from "@game/lib/rng.ts";

/**
 * WHAT KIND OF THING THIS IS. Read for the handful of questions that are about
 * the CATEGORY rather than about the numbers — whether a hit wrecks it or
 * merely shoves it, and what noise it makes going over.
 *
 * It is deliberately NOT a mass band in disguise: `massKg` answers every
 * question about momentum on its own, and a class that also implied a weight
 * would be two sources of truth for one fact.
 */
export type DriveVehicleClass =
  /** Anything with a roof and four wheels, from a hatchback to an ambulance. */
  | "car"
  /** A rigid goods vehicle or a bus — long, heavy, and effectively a moving
   * wall. Shunting one is a mistake rather than a tactic. */
  | "heavy"
  /**
   * SOMEBODY RIDING IN THE OPEN, on a machine that weighs less than they do —
   * a motorcycle, a moped, a bicycle, a skateboard.
   *
   * NOT "two wheels", which is what this was called first and what a skateboard
   * immediately made a lie of. The class is about the RELATIONSHIP: there is
   * nothing around the person and nothing holding them on, and the machine is
   * the lighter half of the pair. Everything that follows falls out of that —
   * the rider leaves at any contact, the machine goes down rather than being
   * shunted, and past a line the machine comes apart in the middle.
   */
  | "open";

/** One kind of vehicle on the road to GOODCO. */
export type DriveVehicleDef = {
  /** The sprite stem the app draws it with — carried here so the two tables
   * cannot drift silently, and read by nothing in the engine. */
  id: string;
  class: DriveVehicleClass;
  /**
   * WHAT IT WEIGHS (kg) on MEDIUM — the one number the collision actually
   * cares about, laddered per rung by `DifficultyDef.drive.trafficMassMult`.
   *
   * For an `open` vehicle this is the MACHINE ALONE. The person on it is added
   * while they are still aboard (`trafficMass`), which is why a moped that has
   * just lost its rider is noticeably easier to shove than one that has not.
   */
  massKg: number;
  /** Its collision circle across the road (world px) — how wide it is. */
  radiusPx: number;
  /**
   * …and how far it reaches ALONG the road from its own centre (world px).
   *
   * A bus is 48 px of art and was 9 px of collision, so the hero could put his
   * nose a third of the way into one before anything happened. The impact
   * solves against this extent rather than against a point, which is what makes
   * a long vehicle actually long.
   */
  halfLengthPx: number;
  /** How fast it goes, as a multiplier on `DRIVE.trafficSpeedPx`. A bus
   * dawdles; a sports car is past you before you have decided. */
  pace: { min: number; max: number };
  /** Its share of the traffic — a weight, not a probability. Together with the
   * others it makes the mix of a real street. */
  weight: number;
  /**
   * THE PERSON ON IT, as an index into the app's `RIDER_SPRITES` — or null for
   * anything with a roof.
   *
   * A rider is not a passenger and the difference is the whole of these
   * vehicles: they are sitting in the open on a machine that weighs less than
   * they do, so ANY contact takes them off it. See `ejectRider`.
   */
  rider: number | null;
  /**
   * HOW MANY PEOPLE ARE INSIDE — the ones who go through the windscreen when
   * the blow is square and hard enough, and stay put every other time.
   *
   * Zero is a real answer and worth using: the bus is empty (which is the joke
   * its own description already makes), and a parked car has nobody in it.
   */
  occupants: number;
  /**
   * IT RIDES ON THE PAVEMENT. The delivery trade only, and it is the one
   * behaviour on this road that puts a vehicle where the PEOPLE are.
   *
   * Mechanically it is the most interesting thing in the table: everything else
   * with wheels stays inside `roadEdges`, so the gutter has always been the
   * safe line and a driver who hugs it is only ever punished by the kerb's
   * furniture. A moped weaving along the pavement means the safe line has
   * traffic on it — and that the crowd does too, because a rider cutting
   * through people is what these actually do.
   */
  pavement: boolean;
  /**
   * HOW EASILY IT GOES OVER — 1 is an ordinary saloon, above 1 tips sooner,
   * below 1 slides instead.
   *
   * It is the one fact about a vehicle's SHAPE that the collision needs and
   * cannot get from the three numbers above. Mass, width and length say nothing
   * about how high the weight is carried, and how high the weight is carried is
   * the whole of whether a sideways shove turns into a roll: a box van and a
   * sports car of identical mass answer the same clip completely differently,
   * and everybody watching knows which is which before it happens.
   *
   * It is deliberately NOT derived from `class`. The class is about how a hit
   * is ANSWERED (shunted, or knocked down); this is about the body's own
   * proportions, and the two disagree exactly where it is interesting — a bus
   * is `heavy` and desperately top-heavy, while a box truck is `heavy` and so
   * hard to budge that it will never see the Δv it would need.
   *
   * An `open` vehicle carries 0: it does not tip, it goes down, and it does
   * that at the first contact by an entirely different rule (`knockDown`).
   */
  topHeavy: number;
};

/**
 * A NOTE ON THE WEIGHTS, since they are the whole texture of the road.
 *
 * They are not a survey. They are what makes a minute of tarmac read as a
 * street rather than as a shuffled deck: ordinary cars are most of it, one bus
 * or lorry every so often is an event, and the delivery trade is EVERYWHERE —
 * mopeds and e-bikes together are about a fifth of everything on this road,
 * which is roughly how it feels to drive through a town at seven in the evening
 * and exactly as annoying.
 */
export const FLEET: readonly DriveVehicleDef[] = [
  // ── ORDINARY CARS ─────────────────────────────────────────────────────────
  {
    id: "traffic_sedan",
    class: "car",
    massKg: 1400,
    radiusPx: 9,
    halfLengthPx: 20,
    pace: { min: 0.9, max: 1.1 },
    weight: 10,
    rider: null,
    occupants: 1,
    pavement: false,
    topHeavy: 1,
  },
  {
    id: "traffic_hatch",
    class: "car",
    massKg: 1050,
    radiusPx: 8,
    halfLengthPx: 16,
    pace: { min: 0.85, max: 1.05 },
    weight: 10,
    rider: null,
    occupants: 1,
    pavement: false,
    topHeavy: 1,
  },
  {
    id: "traffic_estate",
    class: "car",
    massKg: 1600,
    radiusPx: 9,
    halfLengthPx: 21,
    pace: { min: 0.85, max: 1.05 },
    weight: 7,
    rider: null,
    occupants: 2,
    pavement: false,
    topHeavy: 1.05,
  },
  {
    id: "traffic_coupe",
    class: "car",
    massKg: 1350,
    radiusPx: 9,
    halfLengthPx: 20,
    pace: { min: 1, max: 1.2 },
    weight: 5,
    rider: null,
    occupants: 1,
    pavement: false,
    topHeavy: 0.8,
  },
  {
    id: "traffic_sports",
    class: "car",
    massKg: 1300,
    radiusPx: 9,
    halfLengthPx: 21,
    pace: { min: 1.2, max: 1.5 },
    weight: 3,
    rider: null,
    occupants: 1,
    pavement: false,
    topHeavy: 0.65,
  },
  {
    id: "traffic_convertible",
    class: "car",
    massKg: 1250,
    radiusPx: 9,
    halfLengthPx: 20,
    // THE ONE CAR WHOSE PEOPLE ARE NOT BEHIND GLASS. The roof is down, so its
    // occupants leave over the screen at half the provocation the others need
    // — which is the sight the whole ejection feature was built for, handed to
    // the model by nothing more than an unusually loose seat belt.
    pace: { min: 1, max: 1.25 },
    weight: 2,
    rider: null,
    occupants: 2,
    pavement: false,
    topHeavy: 0.75,
  },
  {
    id: "traffic_suv",
    class: "car",
    massKg: 2100,
    radiusPx: 10,
    halfLengthPx: 21,
    pace: { min: 0.85, max: 1.05 },
    weight: 8,
    rider: null,
    occupants: 2,
    pavement: false,
    topHeavy: 1.45,
  },
  {
    id: "traffic_pickup",
    class: "car",
    massKg: 2200,
    radiusPx: 10,
    halfLengthPx: 21,
    pace: { min: 0.8, max: 1 },
    weight: 6,
    rider: null,
    occupants: 1,
    pavement: false,
    topHeavy: 1.35,
  },
  {
    id: "traffic_minivan",
    class: "car",
    massKg: 1850,
    radiusPx: 10,
    halfLengthPx: 21,
    pace: { min: 0.8, max: 1 },
    weight: 6,
    rider: null,
    occupants: 3,
    pavement: false,
    topHeavy: 1.4,
  },
  {
    id: "traffic_taxi",
    class: "car",
    massKg: 1600,
    radiusPx: 9,
    halfLengthPx: 20,
    pace: { min: 0.95, max: 1.2 },
    weight: 6,
    rider: null,
    occupants: 2,
    pavement: false,
    topHeavy: 1,
  },
  {
    id: "traffic_police",
    class: "car",
    massKg: 1900,
    radiusPx: 9,
    halfLengthPx: 21,
    pace: { min: 1.05, max: 1.3 },
    weight: 2,
    rider: null,
    occupants: 2,
    pavement: false,
    topHeavy: 0.95,
  },
  {
    id: "traffic_electric",
    class: "car",
    massKg: 1800,
    radiusPx: 9,
    halfLengthPx: 20,
    pace: { min: 0.9, max: 1.15 },
    weight: 7,
    rider: null,
    occupants: 1,
    pavement: false,
    topHeavy: 0.7,
  },

  // ── THE HEAVY STUFF ───────────────────────────────────────────────────────
  {
    id: "traffic_van",
    class: "heavy",
    massKg: 2600,
    radiusPx: 10,
    halfLengthPx: 21,
    pace: { min: 0.75, max: 0.95 },
    weight: 6,
    rider: null,
    occupants: 1,
    pavement: false,
    topHeavy: 1.5,
  },
  {
    id: "traffic_ambulance",
    class: "heavy",
    massKg: 3400,
    radiusPx: 10,
    halfLengthPx: 21,
    pace: { min: 1.1, max: 1.35 },
    weight: 1,
    rider: null,
    occupants: 2,
    pavement: false,
    topHeavy: 1.6,
  },
  {
    id: "traffic_box_truck",
    class: "heavy",
    massKg: 7500,
    radiusPx: 11,
    halfLengthPx: 22,
    pace: { min: 0.65, max: 0.85 },
    weight: 3,
    rider: null,
    occupants: 1,
    pavement: false,
    topHeavy: 1.7,
  },
  {
    id: "traffic_bus",
    class: "heavy",
    massKg: 12500,
    radiusPx: 12,
    halfLengthPx: 22,
    pace: { min: 0.6, max: 0.8 },
    weight: 3,
    rider: null,
    // Empty, and the sprite's own description says so. The route was cut.
    occupants: 0,
    pavement: false,
    topHeavy: 1.75,
  },

  // ── TWO WHEELS AND SOMEBODY ON THEM ───────────────────────────────────────
  {
    id: "traffic_motorcycle",
    class: "open",
    massKg: 210,
    radiusPx: 5,
    halfLengthPx: 11,
    pace: { min: 1.3, max: 1.7 },
    weight: 5,
    rider: 0,
    occupants: 0,
    pavement: false,
    topHeavy: 0,
  },
  {
    id: "traffic_scooter",
    class: "open",
    massKg: 120,
    radiusPx: 5,
    halfLengthPx: 9,
    pace: { min: 0.8, max: 1 },
    weight: 4,
    rider: 1,
    occupants: 0,
    pavement: false,
    topHeavy: 0,
  },
  {
    id: "traffic_ebike",
    class: "open",
    massKg: 30,
    radiusPx: 4,
    halfLengthPx: 10,
    pace: { min: 0.45, max: 0.65 },
    weight: 7,
    rider: 2,
    occupants: 0,
    pavement: true,
    topHeavy: 0,
  },
  {
    id: "traffic_bicycle",
    class: "open",
    // A PUSHBIKE, AND THE NUMBER IS THE POINT. Fourteen kilos against sixteen
    // hundred is a mass ratio of about one in a hundred and fifteen — so a
    // bicycle met by a car does not get shunted, knocked down or written off in
    // any meaningful order. It is destroyed, instantly, by any contact at all,
    // and the person on it is killed by the same blow. Nothing anywhere says
    // so: `wreckForce` divides by the vehicle's own mass, and at fourteen kilos
    // every threshold in the file is cleared at once.
    massKg: 14,
    radiusPx: 4,
    halfLengthPx: 9,
    pace: { min: 0.35, max: 0.5 },
    weight: 6,
    rider: 4,
    occupants: 0,
    pavement: false,
    topHeavy: 0,
  },
  {
    id: "traffic_skateboard",
    class: "open",
    // …and the lightest thing on the road by an order of magnitude again. A
    // board is three kilos of maple with somebody standing on it, which is why
    // the class is `open` rather than "two wheels": what matters is that there
    // is nothing around the person and the machine weighs nothing.
    massKg: 3,
    radiusPx: 3,
    halfLengthPx: 6,
    pace: { min: 0.25, max: 0.4 },
    weight: 4,
    rider: 5,
    occupants: 0,
    pavement: true,
    topHeavy: 0,
  },
  {
    id: "traffic_delivery_moped",
    class: "open",
    massKg: 135,
    radiusPx: 5,
    halfLengthPx: 10,
    pace: { min: 0.9, max: 1.2 },
    // THE MOST COMMON SINGLE THING ON THIS ROAD, on purpose. Nothing else here
    // is allowed to be the most common thing — a street made mostly of any one
    // vehicle reads as a texture — but the delivery trade is the exception,
    // because being outnumbered by mopeds IS what a town evening looks like.
    weight: 14,
    rider: 3,
    occupants: 0,
    pavement: true,
    topHeavy: 0,
  },
] as const;

/** How many distinct vehicles the traffic is drawn from. The app's sprite table
 * is this long (`TRAFFIC_SPRITES`) — keep the two in step. */
export const TRAFFIC_VARIANTS = FLEET.length;

/** How many distinct RIDERS there are — the app's `RIDER_SPRITES` is this long,
 * and every def's `rider` indexes it. */
export const RIDER_VARIANTS = 6;

/** The def a variant index names. Clamped, because a saved drive or a mod may
 * hand over an index this build no longer has. */
export function vehicleDef(variant: number): DriveVehicleDef {
  const i = ((variant % FLEET.length) + FLEET.length) % FLEET.length;
  return FLEET[i]!;
}

/** Every variant index whose def rides on the pavement, and every one that does
 * not — the two pools the spawner draws from. */
const ROAD_POOL = FLEET.map((_, i) => i).filter((i) => !FLEET[i]!.pavement);
const PAVEMENT_POOL = FLEET.map((_, i) => i).filter((i) => FLEET[i]!.pavement);

function weightOf(pool: readonly number[]): number {
  let total = 0;
  for (const i of pool) total += FLEET[i]!.weight;
  return total;
}
const ROAD_WEIGHT = weightOf(ROAD_POOL);
const PAVEMENT_WEIGHT = weightOf(PAVEMENT_POOL);

/**
 * Roll one vehicle out of a pool — ONE draw of the road's stream, whatever the
 * table is holding.
 *
 * The single draw matters more than it looks: the fleet is a list somebody is
 * going to add to, and a roll that spent a draw per entry would move every
 * body, car and post laid down after it the moment a new model landed. A seeded
 * road has to survive the fleet growing.
 */
export function rollVehicle(rng: Rng, pavement: boolean): number {
  const pool = pavement ? PAVEMENT_POOL : ROAD_POOL;
  const total = pavement ? PAVEMENT_WEIGHT : ROAD_WEIGHT;
  let roll = rng() * total;
  for (const i of pool) {
    roll -= FLEET[i]!.weight;
    if (roll <= 0) return i;
  }
  return pool[pool.length - 1] ?? 0;
}

/** What share of the traffic rides the pavement rather than the road. */
export const PAVEMENT_SHARE = PAVEMENT_WEIGHT / (PAVEMENT_WEIGHT + ROAD_WEIGHT);
