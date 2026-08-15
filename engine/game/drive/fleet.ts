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
   * A RANGE, NOT A NUMBER, and the difference is the whole of how much gore a
   * crash makes. It was one figure per model, which meant every estate on the
   * road carried exactly two people and every minivan exactly three — so the
   * moment the wagon met one, two bodies came out through the same screen and
   * the tarmac took two bodies' worth of pieces, every single time. That is a
   * lot more of a mess than a car on a commute at seven in the evening contains,
   * and it was the same mess on every one of them.
   *
   * What the road actually looks like is: nearly everybody is alone in the car.
   * So the roll is BIASED HARD toward `min` (`rollOccupants`) and the top of the
   * range is a thing that happens now and then — a full estate exists, it is
   * genuinely worse when you hit it, and it is rare enough to register as a
   * particular car rather than as the model. Nothing scales the gore separately:
   * how many people leave, and therefore how much comes off them, IS how many
   * were in there.
   *
   * Zero is a real answer and worth using: a parked car has nobody in it, and
   * nothing in the `open` class has anybody INSIDE at all — the person on a
   * moped is a `rider`, and rides an entirely different rule.
   */
  occupants: { min: number; max: number };
  /**
   * HOW MANY OF THEM CAN COME OUT AT ONCE — how many bodies this body can post
   * through its own glass in one instant.
   *
   * IT IS NOT A SEAT COUNT AND IT IS NOT DERIVED FROM ONE. It is a fact about
   * the SHAPE of the thing: a saloon has one windscreen and a driver and a
   * passenger in front of it, so two is the honest answer and a third body
   * coming out of the same hole on the same frame reads as a clown car rather
   * than as a collision. A BUS is the case that made this a field — a long band
   * of square windows down a deep flank with a load of people behind it, which
   * is why a bus met square makes more of a mess than any car on this road and
   * always should have.
   *
   * Whoever is left over does not walk away: the ones the geometry will not let
   * out die where they sit (`killInside`), which is the same body count and a
   * different picture.
   */
  exits: number;
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
   * HAS IT GOT LAMPS ON IT.
   *
   * Almost everything does, which is why it is worth writing down for the one
   * or two that do not: a SKATEBOARD has no lights, no battery and nowhere to
   * put either, and until this existed it threw a saloon's headlight beam down
   * the pavement in front of it. The renderer reads it and draws nothing
   * (`drawLightCones`).
   *
   * A FACT ABOUT THE VEHICLE rather than about its class, because the class is
   * about how a hit is ANSWERED and this is about what is bolted to the thing —
   * a bicycle and a skateboard are the same class and disagree about it.
   */
  lights: boolean;
  /**
   * IS THERE ANYTHING ABOARD THAT CAN CATCH FIRE — a tank, or a pack.
   *
   * Almost everything on this road has one, which is why it is worth writing
   * down for the two that do not: a BICYCLE and a SKATEBOARD are steel, rubber
   * and maple, and the road's own comment already said so
   * (`wreckTotally`: "a bicycle with a fuel tank would be the one lie on this
   * road"). It was a comment rather than a rule, and the ignition roll a stove-
   * in end runs (`smashEnd` → `igniteFrom`) never asked anybody — so a pushbike
   * folded round a bumper could go up like a saloon. It is a rule now, and the
   * roll asks this.
   *
   * A FACT ABOUT THE VEHICLE rather than about its class, for the reason
   * `lights` is: the class says how a hit is ANSWERED, and this says what is
   * bolted to the thing. The `open` machines are exactly where the two
   * disagree — a delivery moped and a pushbike take the identical collision and
   * only one of them has five litres of petrol under the seat.
   */
  burns: boolean;
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
    occupants: { min: 1, max: 3 },
    exits: 2,
    pavement: false,
    lights: true,
    burns: true,
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
    occupants: { min: 1, max: 3 },
    exits: 2,
    pavement: false,
    lights: true,
    burns: true,
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
    occupants: { min: 1, max: 4 },
    exits: 2,
    pavement: false,
    lights: true,
    burns: true,
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
    occupants: { min: 1, max: 2 },
    exits: 2,
    pavement: false,
    lights: true,
    burns: true,
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
    occupants: { min: 1, max: 2 },
    exits: 2,
    pavement: false,
    lights: true,
    burns: true,
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
    occupants: { min: 1, max: 2 },
    exits: 2,
    pavement: false,
    lights: true,
    burns: true,
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
    occupants: { min: 1, max: 5 },
    exits: 2,
    pavement: false,
    lights: true,
    burns: true,
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
    occupants: { min: 1, max: 2 },
    exits: 2,
    pavement: false,
    lights: true,
    burns: true,
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
    occupants: { min: 1, max: 6 },
    exits: 2,
    pavement: false,
    lights: true,
    burns: true,
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
    occupants: { min: 1, max: 3 },
    exits: 2,
    pavement: false,
    lights: true,
    burns: true,
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
    occupants: { min: 1, max: 2 },
    exits: 2,
    pavement: false,
    lights: true,
    burns: true,
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
    occupants: { min: 1, max: 3 },
    exits: 2,
    pavement: false,
    lights: true,
    burns: true,
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
    occupants: { min: 1, max: 2 },
    exits: 1,
    pavement: false,
    lights: true,
    burns: true,
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
    occupants: { min: 2, max: 3 },
    exits: 2,
    pavement: false,
    lights: true,
    burns: true,
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
    occupants: { min: 1, max: 1 },
    exits: 1,
    pavement: false,
    lights: true,
    burns: true,
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
    // A BUS IS A ROOMFUL OF PEOPLE, and that is the whole of why it is the worst
    // thing on this road to meet. Everything else out here is one commuter and
    // occasionally a passenger; this is a load of them behind a long band of
    // square windows, so a bus met square is the biggest mess the minigame can
    // make — several bodies out through the glass at once and the rest of the
    // seats dead where they sat. It is also twelve tonnes, so a driver who
    // manages it has almost certainly ended his own trip doing it.
    //
    // IT USED TO BE EMPTY, on a joke about the route having been cut. The joke
    // cost more than it was worth: it made the single most dramatic collision
    // available the ONLY one on the road with nobody in it.
    occupants: { min: 5, max: 16 },
    exits: 6,
    pavement: false,
    lights: true,
    burns: true,
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
    occupants: { min: 0, max: 0 },
    exits: 0,
    pavement: false,
    lights: true,
    burns: true,
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
    occupants: { min: 0, max: 0 },
    exits: 0,
    pavement: false,
    lights: true,
    burns: true,
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
    occupants: { min: 0, max: 0 },
    exits: 0,
    pavement: true,
    lights: true,
    burns: true,
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
    occupants: { min: 0, max: 0 },
    exits: 0,
    pavement: false,
    lights: true,
    // Steel, rubber and a dynamo. There is nothing on a pushbike to light.
    burns: false,
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
    occupants: { min: 0, max: 0 },
    exits: 0,
    pavement: true,
    // NO LAMPS. A board is three kilos of maple: there is nothing on it to
    // light the road with and nowhere to put it, and this is the entry the
    // field exists for — before it, a skateboard threw a saloon's headlight
    // beam down the pavement in front of it.
    lights: false,
    // Nor anything to burn: three kilos of maple and two trucks.
    burns: false,
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
    occupants: { min: 0, max: 0 },
    exits: 0,
    pavement: true,
    lights: true,
    // Five litres under the seat and a hot exhaust beside it — which is why a
    // moped put down on the tarmac is the one `open` machine the road expects
    // to see burning (`igniteDowned`).
    burns: true,
    topHeavy: 0,
  },
] as const;

/** How many distinct vehicles the traffic is drawn from. The app's sprite table
 * is this long (`TRAFFIC_SPRITES`) — keep the two in step. */
export const TRAFFIC_VARIANTS = FLEET.length;

/** How many distinct RIDERS there are — the app's `RIDER_SPRITES` is this long,
 * and every def's `rider` indexes it. */
export const RIDER_VARIANTS = 6;

/**
 * …AND HOW MANY DRIVERS — the people behind windscreens, whom the app draws out
 * of `DRIVER_SPRITES`.
 *
 * A SEPARATE POOL FROM THE RIDERS, and the five of them are the whole reason it
 * exists. A head-on posts the driver's upper half out through the glass and the
 * gore system cuts THAT ART to do it, so the number here is, quite literally,
 * how many different torsos the road can throw. It was two — the two riders that
 * did not look absurd in a saloon — which meant the biggest sight on this road
 * repeated itself every other time it happened.
 */
export const DRIVER_VARIANTS = 5;

/**
 * HOW MANY PEOPLE ARE IN THIS PARTICULAR CAR — one vehicle's own answer to its
 * def's range, and the number every bit of the gore a crash makes comes out of.
 *
 * DERIVED, NEVER DRAWN. It rides the vehicle's own id through the same hash the
 * gore scatter and the loot toss use, for the reason written at the top of
 * `ai.ts` and in half a dozen other places on this road: the seeded stream lays
 * down every body, variant and phase in a fixed order, so a draw spent here
 * would move every person the hero meets afterwards — and adding a seat to one
 * model would re-lay the entire leg.
 *
 * BIASED HARD TOWARD ONE, because that is what a road at seven in the evening
 * looks like: nearly everybody is alone in the car. Cubing the hash puts about
 * two thirds of a 1-to-4 estate's answers on ONE and leaves the full one at
 * roughly one car in fifteen — often enough that a player meets one and notices,
 * rare enough that it reads as that car rather than as what estates are.
 *
 * AND IT IS THE ONLY GORE KNOB A COLLISION HAS. Nothing scales the mess
 * separately: how many people leave through the screen and how much comes off
 * them IS how many were in there (`ejectOccupants`), so a car that had one
 * person in it makes one person's worth and the road stops looking like every
 * saloon on it was a minibus.
 */
export function rollOccupants(def: DriveVehicleDef, id: number): number {
  const { min, max } = def.occupants;
  if (max <= min) return min;
  const h = hash(id, 61);
  return min + Math.floor(h * h * h * (max - min + 1));
}

/**
 * A stable 0..1 off two integers — the same integer hash the rest of this road
 * derives its cosmetic answers from, restated here rather than imported so the
 * fleet stays a leaf that pulls in nothing.
 */
function hash(a: number, b: number): number {
  let h = Math.imul(a * 374761393 + b * 668265263, 1274126177);
  h ^= h >>> 15;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * THE VARIANT INDEX A NAME STANDS FOR — the way back out of the table, for the
 * one or two things on this road that want a PARTICULAR vehicle rather than a
 * roll of the fleet.
 *
 * There is exactly one such caller today (a chase needs police cars, and a
 * police chase made of hatchbacks is not one), and it is worth a function rather
 * than a hard-coded index for the obvious reason: the fleet's order IS
 * `DriveTraffic.variant`, so a literal 10 written at a call site is a bug the day
 * somebody inserts an estate above it.
 */
export function variantOf(id: string): number {
  const i = FLEET.findIndex((def) => def.id === id);
  return i < 0 ? 0 : i;
}

/** The def a variant index names. Clamped, because a saved drive or a mod may
 * hand over an index this build no longer has. */
export function vehicleDef(variant: number): DriveVehicleDef {
  const i = ((variant % FLEET.length) + FLEET.length) % FLEET.length;
  return FLEET[i]!;
}

/**
 * WHICH POOL A MARK DRAWS FROM — the three streams this road runs.
 *
 * `road` and `pavement` are the town's two, split by `DriveVehicleDef.pavement`.
 * `outskirts` is the THIRD and is not a filter on the other two: it is the
 * roster of everything that is out on the road before the town starts, and it is
 * a hand-picked short list rather than a rule, for the same reason the crowd
 * stops at the gate — out here there is nothing to deliver to and nowhere to
 * commute from. What IS still out here is somebody riding home and somebody
 * carrying somebody's dinner the long way round, which is the whole of
 * `OUTSKIRT_IDS`.
 */
export type DriveTrafficPool = "road" | "pavement" | "outskirts";

/**
 * WHO IS OUT ON THE OUTSKIRTS — cyclists and the food deliveries, and nothing
 * else at all.
 *
 * Named by id rather than picked out by a flag on the def, deliberately: this is
 * a CASTING decision about one stretch of one road, and a `outskirts: true`
 * field on the fleet would be a third boolean that every future vehicle has to
 * answer and that means nothing anywhere else. A name that is no longer in the
 * fleet is simply dropped (see the pool below), so retiring a vehicle cannot
 * break the opening.
 */
const OUTSKIRT_IDS: readonly string[] = [
  "traffic_bicycle",
  "traffic_ebike",
  "traffic_delivery_moped",
];

/** Every variant index whose def rides on the pavement, and every one that does
 * not — the two pools the town's spawner draws from. */
const ROAD_POOL = FLEET.map((_, i) => i).filter((i) => !FLEET[i]!.pavement);
const PAVEMENT_POOL = FLEET.map((_, i) => i).filter((i) => FLEET[i]!.pavement);
/** …and the opening's own, in the fleet's order so the stream is spent the same
 * way whatever order the list above happens to be written in. */
const OUTSKIRT_POOL = FLEET.map((_, i) => i).filter((i) =>
  OUTSKIRT_IDS.includes(FLEET[i]!.id),
);

function weightOf(pool: readonly number[]): number {
  let total = 0;
  for (const i of pool) total += FLEET[i]!.weight;
  return total;
}
const POOLS: Record<
  DriveTrafficPool,
  { pool: readonly number[]; weight: number }
> = {
  road: { pool: ROAD_POOL, weight: weightOf(ROAD_POOL) },
  pavement: { pool: PAVEMENT_POOL, weight: weightOf(PAVEMENT_POOL) },
  outskirts: { pool: OUTSKIRT_POOL, weight: weightOf(OUTSKIRT_POOL) },
};

/**
 * Roll one vehicle out of a pool — ONE draw of the road's stream, whatever the
 * table is holding.
 *
 * The single draw matters more than it looks: the fleet is a list somebody is
 * going to add to, and a roll that spent a draw per entry would move every
 * body, car and post laid down after it the moment a new model landed. A seeded
 * road has to survive the fleet growing.
 */
export function rollVehicle(rng: Rng, from: DriveTrafficPool): number {
  const { pool, weight } = POOLS[from];
  let roll = rng() * weight;
  for (const i of pool) {
    roll -= FLEET[i]!.weight;
    if (roll <= 0) return i;
  }
  return pool[pool.length - 1] ?? 0;
}

/** What share of the town's traffic rides the pavement rather than the road. */
export const PAVEMENT_SHARE =
  POOLS.pavement.weight / (POOLS.pavement.weight + POOLS.road.weight);
