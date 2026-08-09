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
  haltTraffic,
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
function plant(state: DriveState, variant: number, share = 0.95): DriveTraffic {
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
  state.traffic.push(one);
  state.car.speed = DRIVE.topSpeedPx * share;
  hold(state, 16);
  state.car.pos.y = one.pos.y;
  one.pos.x = state.car.pos.x + 26;
  one.hitCooldownMs = 0;
  one.speed = 0;
  return one;
}

/** …and ram it again, for the ladder tests that need more than one blow. */
function ramAgain(state: DriveState, one: DriveTraffic, share = 0.95): void {
  one.hitCooldownMs = 0;
  one.pos.x = state.car.pos.x + 26;
  one.pos.y = state.car.pos.y;
  one.speed = 0;
  state.car.speed = DRIVE.topSpeedPx * share;
  hold(state, 64);
}

/**
 * THE SPEED A LADDER TEST IS STAGED AT, as a share of the dial.
 *
 * A LADDER NEEDS RUNGS UNDER IT, and every rung on this road is bought with the
 * SQUARE of the closing speed — so a stage that reads "nearly flat out" is a
 * stage where the top rung is reached on the first blow and there is no ladder
 * left to watch. That is not a claim about the model, it is a fact about where
 * on the dial these tests have to stand: the wagon does 174 mph now, and a car
 * met at 165 of them is not damaged, it is deleted.
 *
 * So the ladder tests stage at half the dial — about eighty-seven miles an hour,
 * which is a fast road rather than a runway, and which takes seven blows to walk
 * a hatchback from clean to written off.
 */
const LADDER_SHARE = 0.5;

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
    const car = plant(state, indexOf("traffic_hatch"), LADDER_SHARE);
    const rungs: number[] = [];
    for (let i = 0; i < 8 && !car.wrecked; i++) {
      ramAgain(state, car, LADDER_SHARE);
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
    hold(state, 4000);
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
    const seats = vehicleDef(indexOf("traffic_sedan")).occupants;
    expect(seats).toBeGreaterThan(0);
    const head = plant(square, indexOf("traffic_sedan"));
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
    floorIt(clipped, 100);
    expect(beside.occupants).toBe(vehicleDef(beside.variant).occupants);
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
    const seats = vehicleDef(indexOf("traffic_sedan")).occupants;
    const coming = createTraffic(
      state.nextId++,
      indexOf("traffic_sedan"),
      { x: state.car.pos.x + 60, y: state.car.pos.y },
      // Signed in world +x, and the hero is heading +x: this one is coming AT
      // him, which is the half of the rule that says "in the opposing lane".
      -300,
    );
    state.traffic.push(coming);
    state.car.speed = DRIVE.topSpeedPx * 0.3;
    floorIt(state, 300);

    expect(saidBy(state)).toContain("windscreenOut");
    expect(coming.occupants).toBeLessThan(seats);
    // HIS UPPER HALF, and what was inside him — never a whole body lobbed over
    // the roof, which is what the force ladder alone would have given at this
    // speed.
    expect(state.remains.some((piece) => piece.part === "upper")).toBe(true);
    expect(state.remains.some((piece) => piece.part === "chunk")).toBe(true);
    // …and the car wears the rest of him down its own glass.
    expect(coming.gore).toBe(1);
    expect(coming.glassOut).toBe(true);
    // AND IT IS OVER QUICKLY. A head-on throws things flat and fast rather than
    // lobbing them, so nothing leaves with the lift an ordinary eject would.
    const lift = Math.max(...state.remains.map((piece) => piece.vz));
    expect(lift).toBeLessThan(DRIVE.gore.maxLiftPx);
  });

  it("counts a head-on that does NOT write the car off — the shunt runs first", () => {
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
    // Staged deliberately UNDER the write-off line, which is the case that was
    // broken and the case a player actually meets.
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

    // It survived as a vehicle — this is not the write-off path…
    expect(coming.wrecked).toBe(false);
    // …and it still emptied itself over the road.
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

  it("never empties the bus, because nobody is on it", () => {
    const state = drive();
    floorIt(state, 5000);
    const bus = plant(state, indexOf("traffic_bus"));
    hold(state, 100);
    expect(bus.occupants).toBe(0);
    expect(saidBy(state)).not.toContain("windscreenOut");
  });

  it("kills the ones the geometry will not let out, and bloodies the glass", () => {
    // THE HALF THE ROAD USED TO GET WRONG. Squareness decides HOW somebody
    // leaves a car; it has no business deciding WHETHER they survived it. A
    // minivan folded up by a blow two degrees off square used to drive on with
    // three people sitting neatly inside it.
    const state = drive();
    floorIt(state, 5000);
    const seats = vehicleDef(indexOf("traffic_minivan")).occupants;
    // Three rows: more people than the screen can post out in one instant, so
    // the ones the front pair leaves behind are the whole point of the case.
    expect(seats).toBeGreaterThan(2);
    const van = plant(state, indexOf("traffic_minivan"));
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

describe("breaking a car, physically", () => {
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
      state.car.speed = DRIVE.topSpeedPx * 0.95;
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
    expect(hatch).toBeGreaterThan(80);
    // …and twelve tonnes takes the same blow and barely notices it.
    expect(hatch).toBeGreaterThan(bus * 4);
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
