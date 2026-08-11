// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE FLEET, AND WHAT COMES OFF IT — the rules that only exist because the road
// stopped holding one idea of "another car".
//
// Everything here is an ENGINE rule (it never names a level, a mob or an item),
// but it does read the shipped fleet, because the fleet IS the rule: "a bus is
// heavier than a bicycle" is not a claim about content, it is the claim the
// whole collision model rests on, and a table that quietly went uniform would
// leave every other test in this file passing.

import { describe, expect, it } from "vitest";

import {
  createDrive,
  createTraffic,
  skipDriveOpening,
  crushDepthPx,
  DRIVE,
  DRIVE_OUTCOME,
  DRIVE_UNITS,
  haltTraffic,
  headOnPieceLaunch,
  FLEET,
  impactMasses,
  roadBandEdges,
  solveImpact,
  stepDrive,
  tipsOver,
  trafficMass,
  vehicleDef,
  wreckForce,
  type DriveParams,
  type DriveState,
  type DriveTraffic,
} from "../../engine/game/drive/index.ts";
import { CAR } from "../../engine/game/vehicles.ts";

const PARAMS: DriveParams = {
  seed: 4242,
  direction: 1,
  difficulty: "medium",
  to: "test_level",
  gib: true,
  split: true,
};

function drive(patch: Partial<DriveParams> = {}): DriveState {
  const built = createDrive({ ...PARAMS, ...patch });
  // OPENED AT THE TOWN. Every test in this file stages a collision on a road it
  // has cleared itself, and a fresh leg opens on three and a half seconds of
  // scripted arrival with the pedals disconnected followed by an outskirt with
  // no traffic on it at all — neither of which this suite is about.
  skipDriveOpening(built);
  return built;
}

/**
 * EVERY EVENT THE ROAD HAS RAISED SINCE THE DRIVE BEGAN.
 *
 * `DriveState.events` is DRAINED every tick — it is the drive's own
 * `state.events`, and the app reads it once and throws it away — so a test that
 * runs a hundred milliseconds of road and then looks at the list is reading the
 * LAST tick's events and nothing else. Every assertion about "did the road ever
 * say X" has to accumulate, and quietly not accumulating is a test that passes
 * because it never saw the thing it was looking for.
 */
const heard = new WeakMap<DriveState, string[]>();

function saidBy(state: DriveState): string[] {
  return heard.get(state) ?? [];
}

function tick(state: DriveState, pedal: number): void {
  stepDrive(state, 16, { pedal, wheel: 0 });
  const log = heard.get(state) ?? [];
  for (const event of state.events) log.push(event.type);
  heard.set(state, log);
}

/** Run the road forward with the throttle buried, for `ms` of road. */
function floorIt(state: DriveState, ms: number): void {
  for (let t = 0; t < ms; t += 16) tick(state, 1);
}

/** …and coast, for a wreck that is supposed to be rolling to a halt. */
function coast(state: DriveState, ms: number): void {
  for (let t = 0; t < ms; t += 16) tick(state, 0);
}

/**
 * ADVANCE THE ROAD WITHOUT TOUCHING THE SPEED A TEST HAS JUST STAGED.
 *
 * THE THROTTLE IS A CLAMP AS WELL AS A SHOVE (`applyCarPedal` —
 * `Math.min(topSpeed, …)`), and the top it clamps to is the RUNG's now: the
 * ladder caps the wagon at 120 mph on EASY and climbs it to the car's own 174
 * only at the top (`rungTopSpeedPx`). So a suite that writes `car.speed`
 * straight and then holds the pedal down has the number taken back off it on
 * the very next frame — which is what quietly turned every head-on staged here
 * into a slower one the moment MEDIUM stopped allowing the whole dial.
 *
 * Coasting is the fix and it costs nothing: a closed throttle at this speed is
 * the air alone, about 25 px/s², so a frame or four of it is under a px/s of
 * the staged number. Everything below is calibrated against an EXACT closing
 * speed, so preserving it is the whole point — the pedal was only ever here to
 * make the road move.
 */
function hold(state: DriveState, ms: number): void {
  coast(state, ms);
}

/**
 * Put one vehicle dead ahead of the hero, stopped, and wind the hero up to
 * nearly the top of the dial — a square head-on at the speed the ejection
 * ladder is actually written against.
 *
 * A pavement rider is given a tick to find its own line first and THEN aimed at,
 * because the footway is somewhere the hero's car cannot go: it weaves out to
 * meet him rather than the other way round.
 */
function plant(
  state: DriveState,
  variant: number,
  share = 0.95,
  /**
   * HOW MANY PEOPLE ARE IN IT — staged rather than left to the roll.
   *
   * How many a given car carries is a per-vehicle roll off its own id
   * (`rollOccupants`), biased hard toward one because nearly everybody on this
   * road is alone in the car. That is right for the road and useless to a suite
   * asking what a FULL one does, so the cases that are about the load say so.
   * Set here rather than after the call, because the tick below is a real
   * collision and has already emptied it by the time `plant` returns.
   */
  seats?: number,
): DriveTraffic {
  // A ROAD HOLDING NOTHING BUT WHAT THE TEST PLANTED, AND A LOG THAT STARTS
  // HERE.
  //
  // The seconds of road each of these tests drives first (to clear the
  // OUTSKIRTS and reach the town) are REAL road — live traffic in four lanes, a crowd walking
  // into it and the council's lamp posts down both kerbs. So a blow staged 26
  // px ahead of the bumper used to land in whatever neighbourhood the seed
  // happened to deal: the hero arrived at it already crushed, or clouted a van
  // on the same tick, or had shed somebody else's motorcycle into `remains`
  // before the planted one was touched. Every assertion below then read the
  // warm-up rather than the blow — `remains[0]` was another vehicle's, and
  // "did the drive ever say `windscreenOut`" was answered by a car three
  // hundred px back.
  //
  // That made this suite quietly an assertion about the SPAWNER's tuning, which
  // it is not meant to be and which the road is allowed to change. Clearing the
  // road is the idiom the engine already exports for exactly this
  // (`haltTraffic` — "several suites need a road holding nothing but what they
  // planted"); the log and the wreckage are wiped with it for the same reason.
  haltTraffic(state);
  state.traffic.length = 0;
  state.pedestrians.length = 0;
  state.props.length = 0;
  state.remains.length = 0;
  heard.set(state, []);
  const one = createTraffic(
    state.nextId++,
    variant,
    { x: state.car.pos.x + 30, y: state.car.pos.y },
    0,
  );
  if (seats !== undefined) one.occupants = seats;
  state.traffic.push(one);
  state.car.speed = DRIVE.topSpeedPx * share;
  hold(state, 16);
  state.car.pos.y = one.pos.y;
  one.pos.x = state.car.pos.x + 26;
  one.hitCooldownMs = 0;
  one.speed = 0;
  return one;
}

describe("the fleet's weights", () => {
  it("spreads mass over more than an order of magnitude", () => {
    // The whole reason the catalog exists. A fleet whose lightest and heaviest
    // are within a factor of two is a fleet that could have been one number,
    // and every rule below would be decoration.
    const masses = FLEET.map((def) => def.massKg);
    expect(Math.max(...masses) / Math.min(...masses)).toBeGreaterThan(50);
  });

  it("charges the same blow far more against a bus than against a moped", () => {
    const speed = DRIVE.topSpeedPx;
    const mass = impactMasses("medium");
    const at = (id: string) => {
      const def = FLEET.find((d) => d.id === id)!;
      return solveImpact(
        { x: 0, y: 0 },
        1,
        speed,
        { x: 30, y: 0 },
        { x: 0, y: 0 },
        def.radiusPx,
        def.massKg * mass.vehicleMult,
        def.halfLengthPx,
      )!;
    };
    const bus = at("traffic_bus");
    const moped = at("traffic_delivery_moped");
    expect(bus.joules).toBeGreaterThan(moped.joules * 5);
    expect(bus.speedLoss).toBeGreaterThan(moped.speedLoss * 5);
  });

  it("makes a two-wheeler lighter the moment it loses its rider", () => {
    // The machine's mass is the MACHINE. Nobody wrote "a ridden bike is
    // heavier" anywhere — it falls out of the person being on it.
    const bike = createTraffic(1, indexOf("traffic_ebike"), { x: 0, y: 0 }, 0);
    const ridden = trafficMass(bike, 78);
    bike.rider = false;
    expect(trafficMass(bike, 78)).toBeLessThan(ridden * 0.6);
  });

  it("measures a long vehicle along its own length, not as a point", () => {
    // A bus was a 12-px circle under a 48-px picture, so the hero could put his
    // nose a third of the way into one before anything happened.
    const def = FLEET.find((d) => d.id === "traffic_bus")!;
    const at = (halfLength: number) =>
      solveImpact(
        { x: 0, y: 0 },
        1,
        DRIVE.topSpeedPx,
        // Far enough ahead that only the vehicle's own extent can reach it.
        { x: 24 + def.halfLengthPx, y: 0 },
        { x: 0, y: 0 },
        def.radiusPx,
        def.massKg,
        halfLength,
      );
    expect(at(0)).toBeNull();
    expect(at(def.halfLengthPx)).not.toBeNull();
  });
});

function indexOf(id: string): number {
  return FLEET.findIndex((def) => def.id === id);
}

describe("destroying the other traffic", () => {
  it.each([5, 10])(
    "writes off a struck car from a %i mph pull-away without breaking the hero's",
    (mph) => {
      const state = drive();
      const other = plant(state, indexOf("traffic_hatch"), 0);
      other.hitCooldownMs = 0;
      other.pos.x = state.car.pos.x + 26;
      other.pos.y = state.car.pos.y;
      other.speed = 0;
      state.car.speed = (mph * 0.44704) / DRIVE_UNITS.mPerPx;

      tick(state, 0);

      expect(other.wrecked).toBe(true);
      expect(other.rung).toBe(DRIVE.traffic.rungs.length);
      expect(other.smashNose || other.smashTail).toBe(true);
      expect(saidBy(state)).toContain("trafficWrecked");
      expect(state.outcome).toBe(DRIVE_OUTCOME.driving);
    },
  );

  it("leaves a wreck standing dead in the lane it died in", () => {
    const state = drive();
    hold(state, 4000);
    const car = plant(state, indexOf("traffic_hatch"));
    expect(car.wrecked).toBe(true);
    // It coasts to a halt rather than vanishing or carrying on — which is the
    // whole payoff: an obstacle nobody placed.
    const before = Math.abs(car.speed);
    coast(state, 6000);
    expect(Math.abs(car.speed)).toBeLessThanOrEqual(before);
    expect(Math.abs(car.speed)).toBeLessThan(DRIVE.traffic.wreckRestPx);
  });

  it("prices a write-off against the vehicle's OWN mass", () => {
    // The same joules is a write-off to a moped and a scratch to a bus, and
    // that is one function rather than a durability authored per model.
    const moped = createTraffic(
      1,
      indexOf("traffic_delivery_moped"),
      { x: 0, y: 0 },
      0,
    );
    const bus = createTraffic(2, indexOf("traffic_bus"), { x: 0, y: 0 }, 0);
    const joules = DRIVE.traffic.wreckJoules;
    expect(wreckForce(moped, joules)).toBeGreaterThan(
      wreckForce(bus, joules) * 20,
    );
  });
});

describe("people leaving vehicles", () => {
  it("throws the rider off a two-wheeler and knocks the machine down", () => {
    // Staged on a ROAD-GOING two-wheeler rather than a delivery moped, for a
    // reason that is the feature rather than a convenience: a moped lives on
    // the pavement and weaves out to meet you, so it cannot be parked in the
    // hero's lane to be hit on cue. The ejection is the same code path for
    // every `open` vehicle in the fleet — what differs is only where they are.
    //
    // AND IT IS STAGED SLOW, which is the whole of the ladder. At the top of
    // the dial the heaviest machine in the fleet is torn in half (the test
    // below); a machine merely GOES DOWN when the blow is under `snapForce`,
    // and finding the speed at which that is still true is finding the bottom
    // rung of a ladder whose rungs are mass and nothing else.
    const state = drive();
    hold(state, 5000);
    const moped = plant(state, indexOf("traffic_motorcycle"), 0.24);
    hold(state, 100);
    expect(moped.rider).toBe(false);
    expect(moped.downed).toBe(true);
    // The person is out on the road as a body of their own — counted, tumbling
    // and reachable by the wheels, exactly as anybody else the car meets.
    const thrown = [
      ...state.pedestrians.filter((p) => p.kind === "rider"),
      ...state.remains.filter((p) => p.part !== "machine"),
    ];
    expect(thrown.length).toBeGreaterThan(0);
    expect(saidBy(state)).toContain("occupantThrown");
  });

  it("tears the heaviest machine in the fleet in half at the top end", () => {
    // THE COMPLAINT THIS ANSWERS, IN ONE ASSERTION. `snapForce` was 2.2 wrecks
    // and a 210 kg motorcycle met DEAD SQUARE AT THE FULL 120 comes out at
    // 1.6 — so the two most common machines on this road could not be broken by
    // the hardest blow the minigame can produce, and every one of them lay down
    // politely and slid instead.
    const state = drive();
    floorIt(state, 5000);
    const bike = plant(state, indexOf("traffic_motorcycle"));
    const id = bike.id;
    hold(state, 100);
    // It has stopped being a vehicle: it is off the road's list entirely, and
    // what is left is the two halves of it and a cloud of its own steel.
    expect(state.traffic.some((one) => one.id === id)).toBe(false);
    expect(saidBy(state)).toContain("machineSnapped");
    const halves = state.remains.filter((piece) =>
      piece.part.startsWith("machine_"),
    );
    expect(halves.length).toBe(2);
  });

  it("sheds steel off the machine as well as the person", () => {
    const state = drive();
    floorIt(state, 5000);
    plant(state, indexOf("traffic_motorcycle"));
    hold(state, 100);
    // The half of a two-wheeler that was never alive. It carries the VEHICLE's
    // variant so the app can cut its art out of the machine that shed it.
    const steel = state.remains.filter((piece) => piece.part === "machine");
    expect(steel.length).toBeGreaterThan(0);
    expect(steel[0]!.variant).toBe(indexOf("traffic_motorcycle"));
  });

  it("kills the cyclist and blows the bicycle in half, on any contact", () => {
    // FOURTEEN KILOS AGAINST SIXTEEN HUNDRED. Nothing in the code says "a
    // bicycle is destroyed by any hit" — `wreckForce` divides by the vehicle's
    // own mass, and at fourteen kilos every threshold in the file is cleared at
    // once. The board is the same argument again at three.
    for (const id of ["traffic_bicycle"]) {
      const state = drive();
      floorIt(state, 5000);
      const machine = plant(state, indexOf(id));
      hold(state, 100);
      // The vehicle is GONE — not shunted, not lying down, not there.
      expect(state.traffic).not.toContain(machine);
      // …and what is left of it is two large halves of its own picture.
      const halves = state.remains.filter((piece) =>
        piece.part.startsWith("machine_"),
      );
      expect(halves.map((piece) => piece.part).sort()).toEqual([
        "machine_front",
        "machine_rear",
      ]);
      expect(saidBy(state)).toContain("machineSnapped");
      // The rider is dead rather than merely knocked off: at this mass the
      // throw clears the gib line too, so what lands is pieces.
      expect(saidBy(state)).toContain("occupantThrown");
      const flesh = state.remains.filter(
        (piece) => !piece.part.startsWith("machine"),
      );
      expect(flesh.length).toBeGreaterThan(0);
    }
    // The skateboard is the same argument at a fifth of the mass, and it lives
    // on the PAVEMENT — where the hero's car cannot be parked to meet it on
    // cue. Its outcome is settled by the same number the bicycle's was, so what
    // is worth pinning is that number.
    const board = createTraffic(
      1,
      indexOf("traffic_skateboard"),
      { x: 0, y: 0 },
      0,
    );
    const bike = createTraffic(
      2,
      indexOf("traffic_bicycle"),
      { x: 0, y: 0 },
      0,
    );
    // Three percent of what it takes to write off a saloon — a light tap, and
    // more than enough to finish either of these.
    const gentle = DRIVE.traffic.wreckJoules * 0.03;
    expect(wreckForce(board, gentle)).toBeGreaterThanOrEqual(
      DRIVE.traffic.snapForce,
    );
    expect(wreckForce(bike, gentle)).toBeGreaterThanOrEqual(
      DRIVE.traffic.snapForce,
    );
  });

  it("cuts a thrown rider out of the RIDER art, not the crowd's", () => {
    // THE GIB ENGINE HAS TO WORK ON THESE TOO, and the whole of making it work
    // is that a thrown body carries `kind: "rider"` — everything downstream is
    // kind-agnostic and looks its art up through one table (`bodySprite`). A
    // rider tagged as a walker would be cut in half out of a stranger's coat.
    const state = drive();
    floorIt(state, 5000);
    plant(state, indexOf("traffic_bicycle"));
    hold(state, 100);
    const flesh = state.remains.filter(
      (piece) => !piece.part.startsWith("machine"),
    );
    expect(flesh.length).toBeGreaterThan(0);
    for (const piece of flesh) {
      expect(piece.kind).toBe("rider");
      expect(piece.variant).toBe(vehicleDef(indexOf("traffic_bicycle")).rider);
    }
    // …and the strike the app bursts carries the same pair, so the spray comes
    // off the person who was actually on the bike.
    expect(
      state.strikes.length + flesh.filter((p) => p.part === "chunk").length,
    ).toBeGreaterThan(0);
  });

  it("throws a body FAR — up, and a long way down the road", () => {
    const state = drive();
    floorIt(state, 5000);
    plant(state, indexOf("traffic_scooter"));
    hold(state, 100);
    const airborne = [
      ...state.pedestrians.filter((p) => p.kind === "rider"),
      ...state.remains.filter((p) => p.part !== "machine"),
    ];
    expect(airborne.length).toBeGreaterThan(0);
    // The request, as a number: they leave with real lift and carrying more
    // along-road speed than the car that hit them, so the wagon passes
    // underneath rather than driving into the landing.
    const best = Math.max(...airborne.map((p) => p.vz));
    expect(best).toBeGreaterThan(DRIVE.eject.liftPx.base * 0.8);
    const fastest = Math.max(...airborne.map((p) => Math.abs(p.vel.x)));
    expect(fastest).toBeGreaterThan(state.car.speed);
  });

  it("empties a car through the screen ONLY when the blow is square", () => {
    const square = drive();
    floorIt(square, 5000);
    // THIS car's own count, not its model's. How many people are in a given car
    // is rolled per vehicle off its own id now (`rollOccupants`) — a range on
    // the def and a bias toward one — so a suite that read the DEF would be
    // asking how many an estate can hold rather than how many this one had.
    // STAGED, NOT ROLLED. How many people are in a given car is a per-vehicle
    // roll off its own id now (`rollOccupants`), biased hard toward one — and
    // `plant` runs a tick of road before it hands the vehicle back, which on a
    // square hit is a tick that has already emptied it. Both of those make
    // "read the count and watch it fall" a race; setting it is neither.
    const seats = 2;
    const head = plant(square, indexOf("traffic_sedan"), 0.95, seats);
    hold(square, 100);
    expect(head.occupants).toBeLessThan(seats);
    expect(saidBy(square)).toContain("windscreenOut");

    // …and the same car clipped down the flank keeps everybody in their seats.
    const clipped = drive();
    floorIt(clipped, 5000);
    const beside = createTraffic(
      clipped.nextId++,
      indexOf("traffic_sedan"),
      // Abeam and a lane over: the contact normal runs across the nose, so the
      // squareness the ejection reads is near zero.
      { x: clipped.car.pos.x, y: clipped.car.pos.y + 12 },
      clipped.car.speed * 0.98,
    );
    clipped.traffic.push(beside);
    const aboard = beside.occupants;
    expect(aboard).toBeGreaterThan(0);
    floorIt(clipped, 100);
    expect(beside.occupants).toBe(aboard);
  });

  it("always empties an ONCOMING car met nose to nose, and opens the driver up", () => {
    // THE ONE COLLISION ON THIS ROAD WITH A GUARANTEED PICTURE. Everything else
    // out here is a ladder — hit it harder and more happens — and that is right
    // for the road in general and wrong for the thing a player deliberately
    // aims at, because a ladder makes the biggest act available come out
    // differently every time he commits to it.
    //
    // MET AT A MODEST SPEED ON PURPOSE, which is the whole assertion. Well under
    // half the dial, and well under the force at which an ejected body would
    // come apart on the ordinary ladder (`eject.gibForce`) — the driver's upper
    // half still leaves through the screen with his insides after it, because
    // the two of them CLOSED.
    const state = drive();
    floorIt(state, 5000);
    const coming = createTraffic(
      state.nextId++,
      indexOf("traffic_sedan"),
      { x: state.car.pos.x + 60, y: state.car.pos.y },
      // Signed in world +x, and the hero is heading +x: this one is coming AT
      // him, which is the half of the rule that says "in the opposing lane".
      -300,
    );
    state.traffic.push(coming);
    const seats = 4;
    coming.occupants = seats;
    state.car.speed = DRIVE.topSpeedPx * 0.3;
    // Stop on the impact tick so the launch cone below measures the throw,
    // before gravity has had a few tenths of a second to turn it into a fall.
    for (let t = 0; t < 300 && coming.occupants > 0; t += 16) tick(state, 1);

    expect(saidBy(state)).toContain("windscreenOut");
    expect(coming.occupants).toBe(0);
    // HIS UPPER HALF, and what was inside him — never a whole body lobbed over
    // the roof, which is what the force ladder alone would have given at this
    // speed.
    expect(state.remains.some((piece) => piece.part === "upper")).toBe(true);
    expect(state.remains.some((piece) => piece.part === "chunk")).toBe(true);
    // …and the car wears the rest of him down its own glass.
    expect(coming.gore).toBe(1);
    expect(coming.glassOut).toBe(true);
    // AND IT IS OVER QUICKLY. Nothing gets the towering lift of the ordinary
    // ladder; the pure launch contract below pins the exact angle and speed
    // before gravity and the road have their say.
    const flesh = state.remains.filter((piece) => piece.part !== "machine");
    const lift = Math.max(...flesh.map((piece) => piece.vz));
    expect(lift).toBeLessThan(DRIVE.gore.maxLiftPx);
  });

  it("throws head-on gibs at 10–45 degrees with the car's road speed", () => {
    const carVx = DRIVE.topSpeedPx * 0.72;
    for (let seed = 0; seed < 128; seed++) {
      const launch = headOnPieceLaunch(carVx, 1, seed);
      const angle = (Math.atan2(launch.z, Math.abs(launch.x)) * 180) / Math.PI;
      const speed = Math.hypot(launch.x, launch.z);
      expect(angle).toBeGreaterThanOrEqual(10);
      expect(angle).toBeLessThanOrEqual(45);
      expect(speed).toBeGreaterThanOrEqual(carVx * 0.85);
      expect(speed).toBeLessThanOrEqual(carVx);
    }
  });

  it("counts a softer head-on before the breakdown changes the car's motion", () => {
    // THE ONE THE ORIGINAL TEST WALKED STRAIGHT PAST, and the reason it did is
    // worth keeping: it staged a blow hard enough to WRITE THE CAR OFF, and a
    // write-off ejects from inside `hurtTraffic` — which runs BEFORE `breakCar`
    // gets to `shunt`. So the head-on test read a still-oncoming car and passed.
    //
    // Every softer head-on took the other path: shunt first, eject second. And a
    // head-on punt REVERSES an oncoming car, so by the time the rule looked at
    // `other.speed` the car was travelling the hero's own way and the whole
    // thing quietly never fired — no halves, no glass gore, no spray, on the one
    // collision the rule exists for.
    //
    // Staged deliberately under the old physical write-off line. Every car
    // contact now breaks the car mechanically, but the collision still has to
    // classify this as a head-on from the PRE-IMPACT approach.
    const state = drive();
    floorIt(state, 5000);
    const coming = createTraffic(
      state.nextId++,
      indexOf("traffic_suv"),
      { x: state.car.pos.x + 90, y: state.car.pos.y },
      -DRIVE.trafficSpeedPx.min,
    );
    state.traffic.push(coming);
    state.car.speed = DRIVE.topSpeedPx * 0.4;
    floorIt(state, 400);

    // It broke down, as every struck non-hero car now does…
    expect(coming.wrecked).toBe(true);
    // …and the real head-on force still emptied it over the road.
    expect(saidBy(state)).toContain("windscreenGore");
    expect(coming.gore).toBe(1);
    expect(state.remains.some((piece) => piece.part === "upper")).toBe(true);
    expect(state.remains.some((piece) => piece.part === "chunk")).toBe(true);
    // …and nobody was thrown out in one piece.
    expect(state.pedestrians.filter((p) => p.kind === "driver")).toHaveLength(
      0,
    );
  });

  it("does NOT count rear-ending somebody as a head-on", () => {
    // The other half of the rule, and the one that keeps it legible: a car
    // travelling the hero's own way is met at the DIFFERENCE of two speeds, so
    // there is no closing pair and nothing guaranteed about the outcome. It is
    // an ordinary shunt, answered on the ordinary ladder.
    const state = drive();
    floorIt(state, 5000);
    const ahead = createTraffic(
      state.nextId++,
      indexOf("traffic_sedan"),
      { x: state.car.pos.x + 60, y: state.car.pos.y },
      300,
    );
    state.traffic.push(ahead);
    state.car.speed = DRIVE.topSpeedPx * 0.3;
    floorIt(state, 300);
    expect(ahead.gore).toBe(0);
  });

  it("empties a bus by the roomful, because a bus is a roomful", () => {
    // THE BIGGEST MESS THIS MINIGAME CAN MAKE, and it is a fact about the SHAPE
    // of the thing rather than about its seat count: a long band of square
    // windows with a load of people behind it posts SEVERAL of them out at once
    // (`DriveVehicleDef.exits`), where a saloon's one windscreen posts two. The
    // rest of the seats are not spared — they die where they sit, on the same
    // tally.
    const state = drive();
    floorIt(state, 5000);
    // A BUS IS NEVER ONE PERSON, which is the whole of what makes hitting one
    // different from hitting anything else out here — its own range starts well
    // above every car's (`FLEET`). Staged rather than rolled for the reason the
    // saloon above is: `plant` runs a tick of road first, and on a square hit
    // that tick has already emptied it.
    expect(vehicleDef(indexOf("traffic_bus")).occupants.min).toBeGreaterThan(2);
    const aboard = 8;
    const bus = plant(state, indexOf("traffic_bus"), 0.95, aboard);
    const exits = vehicleDef(bus.variant).exits;
    hold(state, 100);
    // A ROOMFUL GOES THROUGH THE GLASS — as many as this non-oncoming impact's
    // screen can post at once. A genuine nose-to-nose collision opens the whole
    // cabin; this stopped bus remains on the ordinary geometry ladder.
    expect(aboard - bus.occupants).toBe(exits);
    expect(saidBy(state)).toContain("windscreenOut");
    expect(state.bodies).toBeGreaterThanOrEqual(exits);
    // …and more of them than any car on this road can manage.
    expect(exits).toBeGreaterThan(vehicleDef(indexOf("traffic_sedan")).exits);
    expect(bus.occupants).toBe(aboard - exits);
  });

  it("kills the ones the geometry will not let out, and bloodies the glass", () => {
    // THE HALF THE ROAD USED TO GET WRONG. Squareness decides HOW somebody
    // leaves a car; it has no business deciding WHETHER they survived it. A
    // minivan folded up by a blow two degrees off square used to drive on with
    // three people sitting neatly inside it.
    const state = drive();
    floorIt(state, 5000);
    // THREE ROWS, STAGED RATHER THAN HOPED FOR. More people than the screen can
    // post out in one instant is the whole point of the case, and how many are
    // actually in a given car is a per-vehicle roll now (`rollOccupants`) biased
    // hard toward ONE — because nearly everybody on this road is alone in the
    // car. A minivan CAN hold six; asking the seed for one that does would make
    // this a test about the bias.
    const seats = 3;
    const van = plant(state, indexOf("traffic_minivan"), 0.95, seats);
    expect(seats).toBeGreaterThan(vehicleDef(van.variant).exits);
    hold(state, 200);
    // Nobody is left in it: the front pair went through the screen and the row
    // behind them — who were never in front of it — died where they sat.
    expect(van.occupants).toBe(0);
    expect(saidBy(state)).toContain("occupantKilled");
    // …and what the road shows of a death nobody could see is the windows.
    expect(van.gore).toBeGreaterThan(0);
    expect(van.glassOut).toBe(true);
    // Every seat is on the tally, however they left. A body count that only
    // counted the ones who made it into the air would be the collision
    // reporting its own prettiest half.
    expect(state.bodies).toBeGreaterThanOrEqual(seats);
  });

  it("leaves the glass alone when the gore switches are off", () => {
    // The umbrella rule: gated at the DECISION, never at the draw. The people
    // in the car are just as dead and just as counted — the windows simply do
    // not say so, exactly as a body outside the car is knocked down rather than
    // opened.
    const state = drive({ gib: false, split: false });
    floorIt(state, 5000);
    const van = plant(state, indexOf("traffic_minivan"));
    hold(state, 200);
    expect(van.occupants).toBe(0);
    expect(van.gore).toBe(0);
    expect(state.bodies).toBeGreaterThan(0);
  });
});

/**
 * CATCH ONE VEHICLE ON THE CORNER at `share` of the dial and watch what its body
 * does about it — the peak angle, how long it took to come back FROM that peak,
 * and whether the blow put it over instead.
 *
 * TWO THINGS IN HERE ARE SCARS. The wagon is steered OFF it after the clip,
 * because a bumper still leaning on a car goes on adding to what is being
 * measured; and the pair are then held at the same speed, because a vehicle that
 * falls behind is DESPAWNED (`despawnBehindPx`) and every reading after that is
 * the frozen object this function is still holding — which looks exactly like an
 * angle that never settled.
 */
function clip(
  id: string,
  share: number,
): { peak: number; end: number; settledMs: number; downed: boolean } {
  const state = drive();
  floorIt(state, 5000);
  haltTraffic(state);
  state.traffic.length = 0;
  state.pedestrians.length = 0;
  state.props.length = 0;
  // Caught on the corner rather than met square — a blow with a lever arm on
  // it, which is the one that turns a car at all.
  const one = createTraffic(
    state.nextId++,
    indexOf(id),
    { x: state.car.pos.x + 34, y: state.car.pos.y - 8 },
    200,
  );
  state.traffic.push(one);
  state.car.speed = DRIVE.topSpeedPx * share;
  let peak = 0;
  let peakAt = 0;
  let settledAt = -1;
  for (let t = 0; t < 4000; t += 16) {
    tick(state, t < 400 ? 0 : 0.35);
    // …and OFF it, briskly. A wagon still leaning on the car goes on adding to
    // the very thing being measured, and a second contact restarts the clock.
    if (t > 400) state.car.pos.y -= 4;
    if (t > 600) {
      one.speed = state.car.speed;
      one.cruise = state.car.speed;
    }
    if (Math.abs(one.angle) > peak) {
      peak = Math.abs(one.angle);
      // MEASURED FROM THE FURTHEST IT GOT, not from the first contact: the
      // wagon can catch the same car twice on its way past, and a clock started
      // at the first blow would be reporting the gap between two of them.
      peakAt = t;
      settledAt = -1;
    } else if (settledAt < 0 && peak > 0 && one.spin === 0) {
      settledAt = t;
    }
  }
  return {
    peak,
    end: one.angle,
    settledMs: settledAt < 0 ? Infinity : settledAt - peakAt,
    downed: one.downed,
  };
}

describe("breaking a car, physically", () => {
  it("tears both rear wheels off a hard rear-ending and leaves them carrying on", () => {
    const state = drive();
    floorIt(state, 5000);
    state.wheelDebris.length = 0;
    const before = DRIVE.topSpeedPx * 0.95;
    const hatch = plant(state, indexOf("traffic_hatch"), 0.95, 2);

    // THE BODY CHANGES, THE AXLE LEAVES, AND THE SHELL STOPS. This is one
    // outcome rather than three thresholds a player can accidentally miss.
    expect(hatch.smashTail).toBe(true);
    expect(hatch.smashNose).toBe(false);
    expect(hatch.wheelsOff & 2).toBe(2);
    expect(hatch.wrecked).toBe(true);
    expect(Math.abs(hatch.speed)).toBeLessThan(before * 0.35);

    // The hero may shed one of his own wheels in the same terminal blow; the
    // struck car's axle pair are the two deliberately offset across its track.
    const wheels = state.wheelDebris.filter(
      (wheel) => Math.abs(wheel.pos.y - hatch.pos.y) > 1,
    );
    expect(wheels).toHaveLength(2);
    // One begins on the far side of the body (and therefore renders behind it),
    // the other on the near side. They keep going down the road while the shell
    // gives up almost all of its speed.
    expect(wheels[0]!.pos.y).toBeLessThan(hatch.pos.y);
    expect(wheels[1]!.pos.y).toBeGreaterThan(hatch.pos.y);
    expect(
      wheels.every((wheel) => wheel.vel.x > Math.abs(hatch.speed) * 2),
    ).toBe(true);
    expect(wheels.every((wheel) => wheel.vz > 0)).toBe(true);
    // The first pitch raises the struck tail; the missing axle will then settle
    // it in the opposite direction, down onto the road.
    expect(hatch.spin).toBeGreaterThan(0);
    expect(saidBy(state)).toContain("endSmashed");
    expect(saidBy(state).filter((event) => event === "wheelTorn")).toHaveLength(
      2,
    );
  });

  it("folds the end that was hit and leaves the other one straight", () => {
    // A car rear-ended is SHORT AT THE BACK. Three whole-body dent rungs can
    // never say that, which is why the crush is a length per end rather than a
    // rung — and which end folds falls out of which way the thing was pointing,
    // exactly as its lamps do.
    const state = drive();
    floorIt(state, 5000);
    const hatch = plant(state, indexOf("traffic_hatch"));
    // Planted ahead of the hero and facing the same way, so the bumper reaches
    // its TAIL.
    expect(hatch.faceLeft).toBe(false);
    hold(state, 100);
    expect(hatch.crushTail).toBeGreaterThan(0);
    expect(hatch.crushNose).toBe(0);
  });

  it("folds a moped flat and barely marks a bus with the same blow", () => {
    // THE WEIGHT IS THE WHOLE MODEL. One sum, two masses, and nothing anywhere
    // says "a bus dents less" — it resists nine times as hard because it
    // weighs nine times as much.
    const joules = DRIVE.traffic.wreckJoules;
    const moped = vehicleDef(indexOf("traffic_delivery_moped"));
    const bus = vehicleDef(indexOf("traffic_bus"));
    expect(crushDepthPx(moped.massKg, joules)).toBeGreaterThan(
      crushDepthPx(bus.massKg, joules) * 20,
    );
  });

  it("puts an ordinary car over long before it puts a low one over", () => {
    // THE ROLLOVER IS TWO FACTS AND NOTHING ELSE: the lateral Δv the momentum
    // sum handed the vehicle, and how high that vehicle carries its weight
    // (`topHeavy`). A hatchback goes over, a low sports car of near enough the
    // same mass slides, and a bus never sees a Δv within sight of the line
    // because a bus is twelve tonnes.
    //
    // ASKED AS "AT WHAT SPEED", NOT "AT THE TOP END", and that is the whole
    // difference between a test about the model and a test about the dial. Any
    // clip is a rollover if it is hard enough — at 174 mph a full-flank hit puts
    // a go-kart over — so pinning a verdict to one speed pins it to whatever
    // number `topSpeedPx` happens to hold, and re-engining the wagon quietly
    // turned a claim about SHAPE into a claim about paint. The threshold is the
    // honest measure: where the same clip STARTS tipping each vehicle.
    const mass = impactMasses("medium");
    const clipAt = (id: string, speedPx: number) => {
      const def = vehicleDef(indexOf(id));
      const hit = solveImpact(
        { x: 0, y: 0 },
        1,
        speedPx,
        // Abeam, and deep enough into its flank that the contact normal runs
        // straight across the road — which is what a sideswipe is.
        { x: 24 + def.halfLengthPx - 2, y: 12 },
        { x: 0, y: 0 },
        def.radiusPx,
        def.massKg * mass.vehicleMult,
        def.halfLengthPx,
        1,
      )!;
      return tipsOver(createTraffic(1, indexOf(id), { x: 0, y: 0 }, 0), hit);
    };
    /** The slowest full-flank clip that puts this one over, or Infinity. */
    const tipsFrom = (id: string) => {
      for (let px = 10; px <= DRIVE.topSpeedPx; px += 5) {
        if (clipAt(id, px)) return px;
      }
      return Infinity;
    };
    const hatch = tipsFrom("traffic_hatch");
    const van = tipsFrom("traffic_van");
    const sports = tipsFrom("traffic_sports");
    // The ordinary cars go over at ordinary road speeds — inside the part of
    // the dial a drive is actually spent in, rather than needing the runway.
    expect(hatch).toBeLessThan(DRIVE.topSpeedPx * 0.55);
    expect(van).toBeLessThan(DRIVE.topSpeedPx * 0.55);
    // …and the low one needs a great deal more of the same blow, because it
    // carries its weight where a car ought to.
    expect(sports).toBeGreaterThan(hatch * 1.5);
    // The heavy things are effectively immune: twelve tonnes never goes over at
    // any speed this road has, and the box truck only in the last tenth of the
    // dial — which is a speed you reach on an empty straight and not one you are
    // trading paint at.
    expect(tipsFrom("traffic_bus")).toBe(Infinity);
    expect(tipsFrom("traffic_box_truck")).toBeGreaterThan(
      DRIVE.topSpeedPx * 0.9,
    );
  });

  it("charges a sideswipe for the paint it takes off", () => {
    // THE OTHER HALF OF "NOTHING HAPPENS". The collision was a purely NORMAL
    // sum and a sideswipe's normal runs across the road, which the car is not
    // closing along — so two cars could grind down each other's whole length at
    // 120 and the model booked ZERO joules, zero damage and zero noise.
    const mass = impactMasses("medium");
    const def = vehicleDef(indexOf("traffic_sedan"));
    const clip = (scrape: number) =>
      solveImpact(
        { x: 0, y: 0 },
        1,
        DRIVE.topSpeedPx,
        { x: 24 + def.halfLengthPx - 2, y: 12 },
        { x: 0, y: 0 },
        def.radiusPx,
        def.massKg * mass.vehicleMult,
        def.halfLengthPx,
        scrape,
      )!;
    expect(clip(0).joules).toBe(0);
    expect(clip(1).joules).toBeGreaterThan(0);
    // …and it stays a great deal cheaper than centring the same car, which is
    // the ordering the whole minigame teaches.
    const square = solveImpact(
      { x: 0, y: 0 },
      1,
      DRIVE.topSpeedPx,
      { x: 24 + def.halfLengthPx - 2, y: 0 },
      { x: 0, y: 0 },
      def.radiusPx,
      def.massKg * mass.vehicleMult,
      def.halfLengthPx,
      1,
    )!;
    expect(clip(1).joules).toBeLessThan(square.joules * 0.3);
  });

  it("makes an offset meeting of two car ends a full collision", () => {
    // THE REPRO: meeting oncoming traffic slightly off-centre used the round
    // corner-to-corner normal. Most of the closing speed then disappeared into
    // the lateral axis, so the same two ends touching could be a full crash or
    // almost nothing depending on a few pixels of lane offset.
    const mass = impactMasses("medium");
    const def = vehicleDef(indexOf("traffic_sedan"));
    const heroHalfLength =
      Math.max(...CAR.footprint.offsets) + CAR.footprint.radius;
    const reach =
      (CAR.footprint.radius + def.radiusPx) * DRIVE.impact.bodyBandFrac;
    const hit = (xPastEnd: number, y: number) =>
      solveImpact(
        { x: 0, y: 0 },
        1,
        DRIVE.topSpeedPx * 0.6,
        { x: heroHalfLength + def.halfLengthPx + xPastEnd, y },
        { x: -DRIVE.trafficSpeedPx.min, y: 0 },
        def.radiusPx,
        def.massKg * mass.vehicleMult,
        def.halfLengthPx,
        1,
        DRIVE.impact.bodyBandFrac,
      )!;
    const square = hit(reach * 0.6, 0);
    const offset = hit(reach * 0.6, reach * 0.75);

    expect(offset.joules).toBeCloseTo(square.joules, 6);
    expect(offset.speedLoss).toBeCloseTo(square.speedLoss, 6);
    // Full crash does not mean dead straight: the corner contact keeps its
    // lateral impulse and throws the wreck out of the lane.
    expect(Math.abs(offset.dv.y)).toBeGreaterThan(0);

    // A true flank contact is still the different case: it grinds and pushes
    // the struck car sideways instead of pretending the two ends met.
    const side = hit(-2, reach * 0.9);
    expect(side.joules).toBeLessThan(square.joules * 0.3);
    expect(Math.abs(side.dv.y)).toBeGreaterThan(Math.abs(side.dv.x));
  });

  it("punts a light car up the road and hardly moves a heavy one", () => {
    // THE HALF THE SHUNT DID NOT HAVE: the ONE axis a car travels on was the
    // one axis the collision was not allowed to touch, so a struck car stepped
    // politely aside and that was the whole event. What it gains now is
    // `impulse / massKg` and nothing else — which is why this asserts a RATIO
    // between two vehicles rather than a number for either.
    const CRUISE = 120;
    const punt = (id: string) => {
      const state = drive();
      floorIt(state, 5000);
      // …onto a road holding nothing else, for the reason `plant` explains at
      // length: the warm-up is real road, and a shunt measured with a van in
      // the next lane and the hero's nose already folded is a measurement of
      // the spawner rather than of the sum this test is about.
      haltTraffic(state);
      state.traffic.length = 0;
      state.pedestrians.length = 0;
      state.props.length = 0;
      // Rear-ended while genuinely rolling, which is the collision this is
      // about — a stopped car is a different (and much harder) sum.
      const one = createTraffic(
        state.nextId++,
        indexOf(id),
        { x: state.car.pos.x + 34, y: state.car.pos.y },
        CRUISE,
      );
      state.traffic.push(one);
      // Below the rear-axle failure line: this case measures the shove while
      // the new terminal rear-ending case above measures what happens past it.
      state.car.speed = DRIVE.topSpeedPx * 0.65;
      let best = CRUISE;
      for (let t = 0; t < 400; t += 16) {
        tick(state, 0);
        best = Math.max(best, one.speed);
      }
      return best - CRUISE;
    };
    const hatch = punt("traffic_hatch");
    const bus = punt("traffic_bus");
    // It is shoved bodily up the road — a real change of speed, not a nudge.
    expect(hatch).toBeGreaterThan(45);
    // …and twelve tonnes takes the same blow and barely notices it.
    expect(hatch).toBeGreaterThan(bus * 4);
  });

  it("knocks a clipped car a few degrees askew and leaves the broken car there", () => {
    // A CAR ON ITS WHEELS DOES NOT TRAVEL SIDEWAYS. A clip turns it — that much
    // is right, and it is what a corner-first blow does — but it used to be
    // allowed most of a quarter turn (`yawRestRad * 4`, nearly sixty degrees)
    // AND the straightening ran on the single frame the spin died on, after
    // which the whole block stopped being entered at all. So a shoved car sat
    // permanently yawed thirty-odd degrees to the direction it was moving in
    // and slid up the road that way, which reads as a car on ice.
    //
    // What is pinned is the SHAPE of it: knocked askew by a few degrees, then
    // left there once the engine dies. A wreck has no driver correcting it.
    const clipped = clip("traffic_sedan", 0.5);
    // It was genuinely turned…
    expect(clipped.peak).toBeGreaterThan(0.05);
    // …by a few degrees rather than by a third of a turn (it stayed on its
    // wheels, so this is not the rollover's cartwheel)…
    expect(clipped.downed).toBe(false);
    expect(clipped.peak).toBeLessThanOrEqual(DRIVE.crush.maxYawRad + 1e-6);
    // …and the dead car keeps a readable trace of the collision instead of
    // steering itself straight again.
    expect(Math.abs(clipped.end)).toBeGreaterThan(0.02);
  });

  it("turns a light car far further than a heavy one with the same blow", () => {
    // THE YAW IS THE MOMENTUM SUM'S, and this is the case that says so. It was
    // not always: a decaying spin against a hard angle cap meant every blow
    // above a nudge pinned the body at the cap and held it there, so a bus met
    // at a hundred and a hatchback nudged at thirty sat at exactly the same
    // angle. Against a spring (`crush.yawSpringPerSec2`) the peak is
    // proportional to the spin the blow handed over, and that spin is
    // `Impact.dv` — the impulse over the struck vehicle's OWN mass.
    //
    // The claim is a RATIO rather than a number for either, for the reason the
    // punt's own test gives: what is being pinned is that the weight decides.
    const light = clip("traffic_hatch", 0.6);
    const heavy = clip("traffic_bus", 0.6);
    expect(light.downed).toBe(false);
    expect(heavy.downed).toBe(false);
    expect(light.peak).toBeGreaterThan(heavy.peak * 2.5);
    // …and both are inside the band the picture is allowed to use: nothing is
    // turned less than a blow you can see, or more than a car still on its
    // wheels ever is.
    expect(heavy.peak).toBeGreaterThan(0.04);
    expect(light.peak).toBeLessThanOrEqual(DRIVE.crush.maxYawRad + 1e-6);
  });

  it("sits the end down that has no wheel left under it", () => {
    // WHAT PULLS A CAR LEVEL IS THE WHEEL, so the end that has lost one keeps
    // its set while everything else straightens out — which is the picture the
    // wheels coming off has been owed since they started coming off, and the
    // reason a wreck looks broken standing still.
    //
    // THE SIGN IS A CLAIM ABOUT THE PICTURE: the renderer turns the body about
    // its seat before mirroring it, so a positive angle drops whatever is on the
    // RIGHT — the nose of a car pointing that way.
    const settle = (wheelsOff: number, faceLeft: boolean): number => {
      const state = drive();
      floorIt(state, 5000);
      haltTraffic(state);
      state.traffic.length = 0;
      state.pedestrians.length = 0;
      state.props.length = 0;
      const one = createTraffic(
        state.nextId++,
        indexOf("traffic_sedan"),
        { x: state.car.pos.x + 200, y: state.car.pos.y },
        200,
      );
      one.wheelsOff = wheelsOff;
      one.faceLeft = faceLeft;
      // Knocked well off line first, so what is measured is where it SETTLES
      // rather than where it was put.
      one.angle = -0.3;
      state.traffic.push(one);
      for (let t = 0; t < 3000; t += 16) {
        tick(state, 0);
        one.speed = state.car.speed;
        one.cruise = state.car.speed;
      }
      return one.angle;
    };
    const set = DRIVE.crush.yawSetPerWheel;
    // A couple of degrees — crooked, not spun.
    expect(set).toBeLessThan(0.05);
    // Nose wheel gone: nose down, and "down" follows the way it is pointing.
    expect(settle(1, false)).toBeCloseTo(set, 5);
    expect(settle(1, true)).toBeCloseTo(-set, 5);
    // Tail wheel gone: the other end.
    expect(settle(2, false)).toBeCloseTo(-set, 5);
    // Both gone: level again — level and lower, which the picture cannot say.
    expect(settle(3, false)).toBe(0);
    // …and a car with its wheels on ends up flat whatever hit it.
    expect(settle(0, false)).toBe(0);
  });
});

describe("the delivery trade on the pavement", () => {
  it("puts riders outside the road band, where nothing else goes", () => {
    // SAMPLED OVER SEVERAL ROADS, for the reason its sibling below is: the
    // footway carries its own thin stream (`DRIVE.pavementPerKPx`), so ONE leg
    // deals only a handful of riders and which three of the pool they are is a
    // coin flip. A single seed passing this is luck, and a single seed failing
    // it says nothing about the footway at all.
    const band = (DRIVE.laneCount * DRIVE.laneWidth) / 2;
    const seen = new Set<string>();
    const offRoad: number[] = [];
    for (const seed of [4242, 91, 7]) {
      const state = drive({ seed });
      // Far enough to have laid down a good stretch of road.
      floorIt(state, 8000);
      for (const other of state.traffic) seen.add(vehicleDef(other.variant).id);
      // …over a whole leg, run in chunks so the sample is the road rather than
      // one screenful — and STOPPING AT THE END OF IT, because the road is
      // halted the instant a leg finishes (`haltTraffic`) and chunks sampled
      // past that are a draining road reported as a populated one.
      for (let i = 0; i < 60 && state.outcome === DRIVE_OUTCOME.driving; i++) {
        floorIt(state, 1000);
        for (const other of state.traffic) {
          const def = vehicleDef(other.variant);
          seen.add(def.id);
          if (def.pavement && !other.downed)
            offRoad.push(Math.abs(other.pos.y));
        }
      }
    }
    expect(offRoad.length).toBeGreaterThan(0);
    // A delivery rider spends real time PAST the outer lane marking — which is
    // the whole change: the gutter is no longer the safe line.
    expect(Math.max(...offRoad)).toBeGreaterThan(band);
    // …and they are common enough to be a road feature rather than a curio.
    expect(seen.has("traffic_delivery_moped")).toBe(true);
  });

  it("still lets them cut in over the kerb", () => {
    // SAMPLED OVER SEVERAL ROADS RATHER THAN ONE LONG ONE, because the cut-in
    // cycles on the RIDER's own travel (`pavementRiders.weaveHz`) while what
    // bounds the sample is how long each rider stays in the hero's window — and
    // a faster wagon passes each of them sooner, so one leg now shows fewer of
    // them reaching across the kerb than it used to. The claim is a possibility
    // ("they still come over it"), so the honest sample is more roads.
    const band = (DRIVE.laneCount * DRIVE.laneWidth) / 2;
    let cutIn = false;
    for (const seed of [4242, 77, 1009, 30011]) {
      const state = drive({ seed });
      for (let i = 0; i < 60 && !cutIn; i++) {
        floorIt(state, 1000);
        for (const other of state.traffic) {
          if (!vehicleDef(other.variant).pavement || other.downed) continue;
          if (Math.abs(other.pos.y) < band) cutIn = true;
        }
      }
      if (cutIn) break;
    }
    expect(cutIn).toBe(true);
  });
});

describe("the kerb, and the way things get clear", () => {
  it("moves a struck car by SPEED rather than placing it", () => {
    // THE TELEPORT. Getting the struck car out of the wagon's way used to be a
    // positional hop — twenty-two px sideways, most of a lane, on the frame of
    // the blow — because two overlapping bodies re-collided every tick and
    // something had to separate them. The hit cooldown does that job now, so
    // the hop was pure artefact, and it was the loudest one on the road: a car
    // rear-ended DEAD SQUARE, where the physics says the whole answer is along
    // the road, still snapped most of a lane sideways for no reason the picture
    // could account for.
    //
    // The assertion is the shape of the fix rather than a number off the
    // screen: no single tick may move the struck car further sideways than its
    // own lateral speed could carry it.
    const state = drive();
    floorIt(state, 3000);
    const one = createTraffic(
      state.nextId++,
      indexOf("traffic_sedan"),
      { x: state.car.pos.x + 120, y: state.car.pos.y },
      150,
    );
    state.traffic.push(one);
    state.car.speed = DRIVE.topSpeedPx * 0.95;

    const dt = 16 / 1000;
    let previous = one.pos.y;
    let worst = 0;
    let hit = false;
    for (let t = 0; t < 1200; t += 16) {
      tick(state, 1);
      if (saidBy(state).includes("trafficHit")) hit = true;
      worst = Math.max(worst, Math.abs(one.pos.y - previous));
      previous = one.pos.y;
    }
    expect(hit).toBe(true);
    // Everything it moved sideways, it drove. The cap is the slew ceiling's own
    // travel in one tick plus a pixel of slack for the ordering inside a step.
    expect(worst).toBeLessThan(DRIVE.shuntMaxPx * dt + 1);
    // …and comfortably under what the hop used to be in a single frame.
    expect(worst).toBeLessThan(DRIVE.separationPx * dt + 1);
  });

  it("stops a parked car being furniture the moment it is hit", () => {
    // A parked car was a `DriveProp` for its whole life, and a prop has no
    // velocity, no crush, no yaw and nothing to roll — so the collision could
    // only shove it sideways and leave. It joins the TRAFFIC now and takes the
    // blow the way every other car does.
    const state = drive();
    floorIt(state, 3000);
    const kerb = roadBandEdges().bottom + DRIVE.street.kerbOffsetPx;
    state.props.length = 0;
    state.car.pos.y = kerb;
    state.props.push({
      id: state.nextId++,
      kind: "parked_car",
      pos: { x: state.car.pos.x + 60, y: kerb },
      variant: indexOf("traffic_estate"),
      felled: false,
      vel: { x: 0, y: 0 },
      z: 0,
      vz: 0,
      angle: 0,
      spin: 0,
      hitCooldownMs: 0,
    });
    // BY IDENTITY, NEVER BY COUNT. The road spawns and forgets vehicles on its
    // own the whole time this is running, so `traffic.length` before and after
    // is a moving baseline that happens to sit still at some speeds and does not
    // at others — it stopped working the moment the wagon covered more ground in
    // the same 300 ms.
    const wasTraffic = new Set(state.traffic.map((one) => one.id));
    state.car.speed = DRIVE.topSpeedPx * 0.95;
    floorIt(state, 300);

    // It has left the kerb's furniture and joined the road's vehicles.
    expect(state.props.some((prop) => prop.kind === "parked_car")).toBe(false);
    const car = state.traffic.find(
      (one) => !wasTraffic.has(one.id) && one.driverless,
    )!;
    expect(car).toBeDefined();
    // …and it took a REAL collision: it folded, and it is moving.
    expect(car.crushNose + car.crushTail).toBeGreaterThan(0);
    expect(Math.abs(car.speed) + Math.abs(car.slew)).toBeGreaterThan(0);
    // Nobody was in it and nobody is driving it — so no lights, and nothing
    // comes out through the screen.
    expect(car.driverless).toBe(true);
    expect(car.occupants).toBe(0);
    expect(saidBy(state)).not.toContain("windscreenOut");
  });
});
