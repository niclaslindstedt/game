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
  DRIVE,
  FLEET,
  impactMasses,
  solveImpact,
  stepDrive,
  trafficMass,
  vehicleDef,
  wreckForce,
  type DriveParams,
  type DriveState,
  type DriveTraffic,
} from "../../src/game/drive/index.ts";

const PARAMS: DriveParams = {
  seed: 4242,
  direction: 1,
  difficulty: "medium",
  to: "test_level",
  gib: true,
  split: true,
};

function drive(patch: Partial<DriveParams> = {}): DriveState {
  return createDrive({ ...PARAMS, ...patch });
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
 * Put one vehicle dead ahead of the hero, stopped, and wind the hero up to
 * nearly the top of the dial — a square head-on at the speed the ejection
 * ladder is actually written against.
 *
 * A pavement rider is given a tick to find its own line first and THEN aimed at,
 * because the footway is somewhere the hero's car cannot go: it weaves out to
 * meet him rather than the other way round.
 */
function plant(state: DriveState, variant: number): DriveTraffic {
  const one = createTraffic(
    state.nextId++,
    variant,
    { x: state.car.pos.x + 30, y: state.car.pos.y },
    0,
  );
  state.traffic.push(one);
  state.car.speed = DRIVE.topSpeedPx * 0.95;
  tick(state, 1);
  state.car.pos.y = one.pos.y;
  one.pos.x = state.car.pos.x + 26;
  one.hitCooldownMs = 0;
  one.speed = 0;
  return one;
}

/** …and ram it again, for the ladder tests that need more than one blow. */
function ramAgain(state: DriveState, one: DriveTraffic): void {
  one.hitCooldownMs = 0;
  one.pos.x = state.car.pos.x + 26;
  one.pos.y = state.car.pos.y;
  one.speed = 0;
  state.car.speed = DRIVE.topSpeedPx * 0.95;
  floorIt(state, 64);
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
  it("climbs a car's damage rungs and finally writes it off", () => {
    const state = drive();
    floorIt(state, 4000);
    const car = plant(state, indexOf("traffic_hatch"));
    const rungs: number[] = [];
    for (let i = 0; i < 8 && !car.wrecked; i++) {
      ramAgain(state, car);
      rungs.push(car.rung);
    }
    // It visibly deforms on the way — the rung is the picture the renderer
    // swaps in, and a car that jumped straight from clean to written off would
    // never show the player what he was doing.
    expect(Math.max(...rungs)).toBeGreaterThan(0);
    expect(car.wrecked).toBe(true);
    expect(saidBy(state)).toContain("trafficBent");
  });

  it("leaves a wreck standing dead in the lane it died in", () => {
    const state = drive();
    floorIt(state, 4000);
    const car = plant(state, indexOf("traffic_hatch"));
    car.wear = 0.99;
    for (let i = 0; i < 8 && !car.wrecked; i++) ramAgain(state, car);
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
    // …and on the HEAVIEST of them, because the ladder is a mass ladder: at
    // 95% of the dial a scooter is already past `snapForce` and a bicycle is
    // past it by an order of magnitude, so the motorcycle is the only machine
    // in the fleet that still merely GOES DOWN at this speed. That is the model
    // working, not a staging convenience.
    const state = drive();
    floorIt(state, 5000);
    const moped = plant(state, indexOf("traffic_motorcycle"));
    floorIt(state, 100);
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

  it("sheds steel off the machine as well as the person", () => {
    const state = drive();
    floorIt(state, 5000);
    plant(state, indexOf("traffic_motorcycle"));
    floorIt(state, 100);
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
      floorIt(state, 100);
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
    floorIt(state, 100);
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
    floorIt(state, 100);
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
    const seats = vehicleDef(indexOf("traffic_sedan")).occupants;
    expect(seats).toBeGreaterThan(0);
    const head = plant(square, indexOf("traffic_sedan"));
    floorIt(square, 100);
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
    floorIt(clipped, 100);
    expect(beside.occupants).toBe(vehicleDef(beside.variant).occupants);
  });

  it("never empties the bus, because nobody is on it", () => {
    const state = drive();
    floorIt(state, 5000);
    const bus = plant(state, indexOf("traffic_bus"));
    floorIt(state, 100);
    expect(bus.occupants).toBe(0);
    expect(saidBy(state)).not.toContain("windscreenOut");
  });
});

describe("the delivery trade on the pavement", () => {
  it("puts riders outside the road band, where nothing else goes", () => {
    const state = drive();
    // Far enough to have laid down a good stretch of road.
    floorIt(state, 8000);
    const band = (DRIVE.laneCount * DRIVE.laneWidth) / 2;
    const seen = new Set<string>();
    for (const other of state.traffic) seen.add(vehicleDef(other.variant).id);
    // …over a whole leg, run in chunks so the sample is the road rather than
    // one screenful.
    const offRoad: number[] = [];
    for (let i = 0; i < 60; i++) {
      floorIt(state, 1000);
      for (const other of state.traffic) {
        const def = vehicleDef(other.variant);
        seen.add(def.id);
        if (def.pavement && !other.downed) offRoad.push(Math.abs(other.pos.y));
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
    const state = drive();
    const band = (DRIVE.laneCount * DRIVE.laneWidth) / 2;
    let cutIn = false;
    for (let i = 0; i < 90; i++) {
      floorIt(state, 1000);
      for (const other of state.traffic) {
        if (!vehicleDef(other.variant).pavement || other.downed) continue;
        if (Math.abs(other.pos.y) < band) cutIn = true;
      }
    }
    expect(cutIn).toBe(true);
  });
});
