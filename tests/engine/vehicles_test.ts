// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE VEHICLES — the car and the garage ship as machines (engine/game/vehicles.ts):
// minted from their landmark kinds with solid footprints, wheels that roll
// from speed (never from a timer), suspension springs that answer a shove
// and settle to dead rest, and the wear/driver/thrust fields the driving
// and flying minigames will write. Deterministic clockwork: nothing here
// may touch the run's rng.

import { afterEach, describe, expect, it } from "vitest";

import { rngState } from "@game/lib/rng.ts";
import {
  applyRunCommand,
  CAR,
  CAR_FIX,
  carSkidding,
  detachWheel,
  nudgeCar,
  setCameraYaw,
  shedPart,
  type CarVehicle,
  type GameInput,
} from "@game/core";
import { DT, idle, run, startGame, steerTo } from "./helpers.ts";

const startHub = () => startGame(42, "test_hub_level");

const carOf = (state: ReturnType<typeof startHub>): CarVehicle => {
  const car = state.vehicles.find((v) => v.kind === "car");
  if (!car || car.kind !== "car") throw new Error("no car minted");
  return car;
};

describe("minting", () => {
  it("stands a car and a ship where their landmarks are pinned", () => {
    const state = startHub();
    expect(state.vehicles.map((v) => v.kind).sort()).toEqual(["car", "ship"]);
    const car = carOf(state);
    const ship = state.vehicles.find((v) => v.kind === "ship")!;
    expect(car.pos).toEqual({ x: 700, y: 500 });
    expect(ship.pos).toEqual({ x: 1100, y: 300 });
    // Parked, cold, empty: no speed, no wear, no thrust, nobody driving.
    expect(car.speed).toBe(0);
    expect(car.wear).toBe(0);
    expect(car.driver).toBeNull();
    expect(ship.kind === "ship" && ship.thrust).toBe(0);
  });

  it("parks solid footprints — collision-only blockers, the car's hoppable", () => {
    const state = startHub();
    const prints = state.obstacles.filter((o) => o.kind === "vehicle");
    // Three circles under the car (a 48px body needs its middle held), one
    // under the ship.
    expect(prints).toHaveLength(4);
    const carPrints = prints.filter((o) => o.pos.y === 500);
    expect(carPrints).toHaveLength(3);
    for (const p of carPrints) expect(p.jumpable).toBe(true);
    const shipPrint = prints.find((o) => o.pos.y === 300)!;
    expect(shipPrint.jumpable).toBe(false);
  });

  it("mints none on a level whose carve pins no vehicle landmark", () => {
    const state = startGame();
    expect(state.vehicles).toEqual([]);
  });
});

describe("the suspension", () => {
  it("answers a shove with a bob and settles back to dead rest", () => {
    const state = startHub();
    const car = carOf(state);
    nudgeCar(car, 40, 40);
    run(state, idle, 6); // 100 ms — mid-bob
    expect(Math.max(...car.suspension)).toBeGreaterThan(0);
    run(state, idle, 180); // three seconds — the springs must be done
    expect(car.suspension).toEqual([0, 0]);
    expect(car.suspensionVel).toEqual([0, 0]);
  });

  it("never buries the body past the travel limit", () => {
    const state = startHub();
    const car = carOf(state);
    nudgeCar(car, 10_000, 10_000);
    for (let i = 0; i < 120; i++) {
      run(state, idle, 1);
      expect(Math.max(...car.suspension)).toBeLessThanOrEqual(CAR.maxCompress);
    }
  });
});

describe("the wheels", () => {
  it("roll from speed — distance over wheel radius, not a timer", () => {
    const state = startHub();
    const car = carOf(state);
    run(state, idle, 60);
    expect(car.wheelAngle).toBe(0); // parked wheels never creep
    car.speed = CAR.wheelRadius * Math.PI; // half a turn per second
    const ticks = 60;
    run(state, idle, ticks);
    // Exactly what the clockwork owes: speed / radius × simulated time.
    expect(car.wheelAngle).toBeCloseTo(
      ((Math.PI * (ticks * DT)) / 1000) % (Math.PI * 2),
      5,
    );
  });
});

// THE WHEEL IS THE ROAD'S WHEEL (`applyCarWheel`, shared verbatim with
// engine/game/drive/): it puts the BODY across, this tick and no later one, and
// the rack (`CarVehicle.steer`) is the picture of it — simulated rather than
// inferred, because the renderer warps the front wheel sprite by it.
//
// AND THE NOSE NEVER MOVES. `heading` is the axis the car was parked on, full
// stop. It used to swing inside a yaw stop, which nothing anywhere drew, so the
// only thing it could do was outlive the input: a moment of W and the car went
// on curving for as long as it rolled, with the player's hands off everything.
// That is the whole of what made the bay feel sticky beside the road.
describe("the steering", () => {
  const board = (state: ReturnType<typeof startHub>): CarVehicle => {
    const car = carOf(state);
    state.players[0]!.pos = { x: car.pos.x - 30, y: car.pos.y };
    applyRunCommand(state, "enterCar");
    return car;
  };
  /** How far off the body's facing axis the nose stands, signed. */
  const yaw = (car: CarVehicle): number =>
    Math.atan2(Math.sin(car.heading), Math.cos(car.heading));

  it("mints the wheels dead straight", () => {
    expect(carOf(startHub()).steer).toBe(0);
  });

  it("cranks the wheels of a car that is standing still — but not the car", () => {
    const state = startHub();
    const car = board(state);
    const heading = car.heading;
    // Abeam: the pure-steering band, so there is no throttle and no roll.
    run(state, steerTo(car.pos.x, car.pos.y + 400), 30);
    expect(car.steer).toBeGreaterThan(0);
    expect(car.speed).toBe(0);
    expect(car.heading).toBe(heading); // …and a parked car does not pivot
  });

  it("never cranks past the lock, however far round the target is", () => {
    const state = startHub();
    const car = board(state);
    for (let i = 0; i < 240; i++) {
      run(state, steerTo(car.pos.x, car.pos.y - 400), 1);
      expect(Math.abs(car.steer)).toBeLessThanOrEqual(CAR.steerLock + 1e-9);
    }
  });

  it("self-centres the moment the wheel is let go", () => {
    const state = startHub();
    const car = board(state);
    run(state, steerTo(car.pos.x, car.pos.y + 400), 30);
    expect(Math.abs(car.steer)).toBeGreaterThan(0.1);
    run(state, idle, 60);
    expect(car.steer).toBe(0);
  });

  it("never swings the nose, however long the wheel is held", () => {
    const state = startHub();
    const car = board(state);
    const axis = car.heading;
    // GET IT ROLLING FIRST: a push straight down the nose is all accelerator
    // and no wheel (`carControl` reads the push ALONG the nose as the pedal).
    for (let i = 0; i < 60; i++) {
      run(
        state,
        steerTo(
          car.pos.x + Math.cos(car.heading) * 300,
          car.pos.y + Math.sin(car.heading) * 300,
        ),
        1,
      );
    }
    expect(car.speed).toBeGreaterThan(0);
    // …THEN HOLD THE WHEEL HARD OVER for ten seconds: a push straight ACROSS
    // the nose is all wheel and no pedal, and a car with nothing on the pedal
    // HOLDS its speed rather than coasting down. This is the input that used to
    // wind the nose all the way round to the yaw stop and leave it there.
    for (let i = 0; i < 600; i++) {
      run(state, steerTo(car.pos.x, car.pos.y + 400), 1);
      expect(car.heading).toBe(axis);
    }
    // The body went a long way down the screen — the wheel is doing its job —
    // and the profile it is drawn with never had anything to answer for.
    expect(yaw(car)).toBe(0);
    expect(car.faceLeft).toBe(false);
  });

  it("stops steering the tick the wheel is let go", () => {
    // THE STICKY CAR, PINNED. Steer for a moment, then take everything off: the
    // car must carry on in a straight line, not keep curving away down a nose
    // nobody can see. This is the whole difference the road always had.
    const state = startHub();
    const car = board(state);
    const ahead = () =>
      steerTo(
        car.pos.x + Math.cos(car.heading) * 300,
        car.pos.y + Math.sin(car.heading) * 300,
      );
    run(state, ahead(), 90);
    run(state, steerTo(car.pos.x, car.pos.y + 400), 30);
    const y = car.pos.y;
    // Half a second of hands-off. The car is still rolling…
    run(state, idle, 30);
    expect(car.speed).toBeGreaterThan(0);
    // …and has not crossed so much as a pixel further down the screen.
    expect(Math.abs(car.pos.y - y)).toBeLessThan(0.5);
  });

  // THE WHEEL MOVES THE CAR, THIS TICK — the driving minigame's own lateral
  // (`CAR.lateralPx` / `carCrossing`), brought into the bay because the road
  // felt like driving and the bay felt like asking. The wheel used to wind a
  // rack, which turned a nose, which eventually pointed the speed somewhere
  // else: two integrators of dead time between the thumb and the body.
  it("puts the body across the moment the wheel goes over", () => {
    const state = startHub();
    const car = board(state);
    const ahead = () =>
      steerTo(
        car.pos.x + Math.cos(car.heading) * 300,
        car.pos.y + Math.sin(car.heading) * 300,
      );
    run(state, ahead(), 90);
    expect(car.speed).toBeGreaterThan(0);

    const y0 = car.pos.y;
    // A tenth of a second of wheel — six frames, the shortest input a thumb
    // makes. The nose has barely started to come round at this point, so
    // essentially all of this is the crossing.
    run(state, steerTo(car.pos.x, car.pos.y + 400), 6);
    expect(car.pos.y - y0).toBeGreaterThan(4);
  });

  it("moves the body off the WHEEL, not off the rack", () => {
    // The rack is the picture — it winds on at `steerRate` and the renderer
    // warps the front wheel sprite by it. The BODY does not wait for it: the
    // crossing answers the player's own wheel, so the car is committed while
    // the rack is still winding on.
    const state = startHub();
    const car = board(state);
    const ahead = () =>
      steerTo(
        car.pos.x + Math.cos(car.heading) * 300,
        car.pos.y + Math.sin(car.heading) * 300,
      );
    run(state, ahead(), 90);
    const y0 = car.pos.y;
    run(state, steerTo(car.pos.x, car.pos.y + 400), 6);
    // A tenth of a second in: the car has visibly moved down the screen…
    expect(car.pos.y - y0).toBeGreaterThan(4);
    // …while the rack is still short of full lock.
    expect(car.steer).toBeLessThan(CAR.steerLock);
  });

  it("does not crab a parked car sideways", () => {
    // The crossing is gated on ground speed exactly as the swing is
    // (`wheelAuthority`), so the standing car that cranks its wheels
    // (above) still does not move an inch.
    const state = startHub();
    const car = board(state);
    const at = { x: car.pos.x, y: car.pos.y };
    run(state, steerTo(car.pos.x, car.pos.y + 400), 30);
    expect(car.speed).toBe(0);
    expect(car.pos).toEqual(at);
  });

  it("steers the same way up the screen with the nose pointing left", () => {
    // WHICHEVER WAY THE NOSE POINTS: a `CarControl.wheel` is in the SCREEN's
    // frame ("W turns up the screen whichever way the nose points", pinned at
    // the door by car_controls_test.ts) and the heading's frame runs the other
    // way for a nose-left car. The engine used to read it in the heading's
    // frame, so a car that had been parked facing left steered backwards.
    const state = startHub();
    const car = board(state);
    car.faceLeft = true;
    car.heading = Math.PI;
    // Nose-left, so the accelerator is a push LEFT.
    run(state, steerTo(car.pos.x - 300, car.pos.y), 90);
    expect(car.speed).toBeGreaterThan(0);
    const y0 = car.pos.y;
    // Push UP the screen: the body must go up the screen, not down it.
    run(state, steerTo(car.pos.x, car.pos.y - 400), 30);
    expect(car.pos.y).toBeLessThan(y0);
  });

  it("carries on when the wheel is let go, instead of coasting to a stop", () => {
    // THE CONTROL MODEL IN ONE TEST. Letting go means "carry on as you are",
    // the way it does in a car — braking is something the driver ASKS for, with
    // a push against the nose. The car used to stop the instant nothing was
    // held, which made the throttle a thing you held down for a whole drive and
    // made letting go to think identical to braking.
    const state = startHub();
    const car = board(state);
    const ahead = () =>
      steerTo(
        car.pos.x + Math.cos(car.heading) * 300,
        car.pos.y + Math.sin(car.heading) * 300,
      );
    run(state, ahead(), 60);
    const cruising = car.speed;
    expect(cruising).toBeGreaterThan(0);
    // Hands off for a second: still going, near enough the same speed.
    run(state, idle, 60);
    expect(car.speed).toBeGreaterThan(cruising * 0.9);
    // …and the wheel has straightened itself out.
    expect(car.steer).toBe(0);
  });

  it("brakes to a stop when the push comes back against the nose", () => {
    const state = startHub();
    const car = board(state);
    run(
      state,
      steerTo(
        car.pos.x + Math.cos(car.heading) * 300,
        car.pos.y + Math.sin(car.heading) * 300,
      ),
      60,
    );
    expect(car.speed).toBeGreaterThan(0);
    // Push back down the car's own axis — the brake pedal.
    for (let i = 0; i < 120 && car.speed > 0; i++) {
      run(
        state,
        steerTo(
          car.pos.x - Math.cos(car.heading) * 300,
          car.pos.y - Math.sin(car.heading) * 300,
        ),
        1,
      );
    }
    expect(car.speed).toBeLessThanOrEqual(0);
  });

  it("keeps the nose on its axis through a full lap of the compass", () => {
    const state = startHub();
    const car = board(state);
    const axis = car.heading;
    // Chase a target dragged the whole way round the car: heading used to
    // follow it round and round, and the sprite stayed pointing east.
    for (let i = 0; i < 720; i++) {
      const a = (i / 720) * Math.PI * 2;
      run(
        state,
        steerTo(car.pos.x + Math.cos(a) * 300, car.pos.y + Math.sin(a) * 300),
        1,
      );
      expect(car.heading).toBe(axis);
    }
  });
});

describe("the pedals and the lever", () => {
  const board = (state: ReturnType<typeof startHub>): CarVehicle => {
    const car = carOf(state);
    state.players[0]!.pos = { x: car.pos.x - 30, y: car.pos.y };
    applyRunCommand(state, "enterCar");
    return car;
  };
  /** A push straight down the nose — the accelerator — as hard as `throttle`
   * says. A push straight BACK down it is the brake, at the same grading. */
  const along = (car: CarVehicle, way: 1 | -1, throttle = 1): GameInput => ({
    ...steerTo(
      car.pos.x + Math.cos(car.heading) * 300 * way,
      car.pos.y + Math.sin(car.heading) * 300 * way,
    ),
    throttle,
  });
  /** Get a car rolling and hand it back at cruise. */
  const rolling = (): {
    state: ReturnType<typeof startHub>;
    car: CarVehicle;
  } => {
    const state = startHub();
    const car = board(state);
    for (let i = 0; i < 90; i++) run(state, along(car, 1), 1);
    expect(car.speed).toBeGreaterThan(0);
    return { state, car };
  };

  // THE BUG THIS PINS, and it is the one that made the pad unusable. A
  // part-open throttle used to name a SPEED (`min(topSpeed * pedal, …)`), so a
  // thumb dragged a little way toward the nose — which is the gesture that
  // steers a gentle line, and the commonest one there is — dropped the car to a
  // fraction of its speed in a single tick. It braked harder than the brake
  // did, from the input that means ACCELERATE.
  it("never takes speed off for a push toward the nose, however light", () => {
    const { state, car } = rolling();
    for (let i = 0; i < 60; i++) {
      const was = car.speed;
      run(state, along(car, 1, 0.3), 1);
      expect(car.speed).toBeGreaterThanOrEqual(was);
    }
  });

  it("gathers speed gently on a light push and hard on a full one", () => {
    const gained = (throttle: number): number => {
      const state = startHub();
      const car = board(state);
      for (let i = 0; i < 20; i++) run(state, along(car, 1, throttle), 1);
      return car.speed;
    };
    const light = gained(0.3);
    expect(light).toBeGreaterThan(0);
    expect(gained(1)).toBeGreaterThan(light * 2);
  });

  // …and the other half of the same rule: the BRAKE is graded too, so a nudge
  // back against the nose trims the approach to a gap and a shove is the whole
  // of what the pads have. It used to be all-or-nothing in the other direction —
  // the faintest push against the nose braked as hard as a stamp.
  it("scrubs speed in proportion to how hard the brake is pushed", () => {
    const left = (throttle: number): number => {
      const { state, car } = rolling();
      for (let i = 0; i < 20; i++) run(state, along(car, -1, throttle), 1);
      return car.speed;
    };
    const feathered = left(0.25);
    const stamped = left(1);
    expect(stamped).toBeLessThan(feathered);
    expect(feathered).toBeGreaterThan(0);
  });

  /** How many ticks it takes to bring a rolling car to a dead stop under
   * `hold`, or the cap if it never gets there. */
  const ticksToStop = (hold: (car: CarVehicle) => GameInput): number => {
    const { state, car } = rolling();
    for (let i = 0; i < 400; i++) {
      if (car.speed <= 0) return i;
      run(state, hold(car), 1);
    }
    return 400;
  };

  it("stops the car faster on the lever than on the brake pedal", () => {
    const pedal = ticksToStop((car) => along(car, -1));
    // THE LEVER OVERRULES THE THROTTLE, which is why this one holds the
    // accelerator down while it hauls: a handbrake is not a harder brake pedal,
    // it is a different control, and a driver who grabs it with a thumb still
    // resting toward the nose is stopping rather than negotiating.
    const lever = ticksToStop((car) => ({ ...along(car, 1), handbrake: true }));
    expect(lever).toBeGreaterThan(0);
    expect(lever).toBeLessThan(pedal);
  });

  it("throws the weight onto the nose while the lever is up, then settles", () => {
    const { state, car } = rolling();
    for (let i = 0; i < 15; i++) {
      run(state, { ...along(car, 1), handbrake: true }, 1);
    }
    // The front springs are loaded and the back end is light — which is all the
    // renderer needs, because it already pitches the whole shell between the two
    // axle drops (`drawShellLayer`).
    expect(car.suspension[1]).toBeGreaterThan(0.5);
    expect(car.suspension[1]).toBeGreaterThan(car.suspension[0]);
    // Let it go and the body rings back level rather than staying nose-down.
    run(state, idle, 120);
    expect(car.suspension[1]).toBeLessThan(0.05);
    expect(car.handbrake).toBe(false);
  });

  it("does not nod a car that is already stopped", () => {
    const state = startHub();
    const car = board(state);
    expect(car.speed).toBe(0);
    for (let i = 0; i < 60; i++) {
      run(state, { ...along(car, 1, 0), handbrake: true }, 1);
    }
    expect(car.suspension).toEqual([0, 0]);
  });

  it("marks the road only while the locked wheels are still moving", () => {
    const { state, car } = rolling();
    expect(carSkidding(car)).toBe(false); // the lever is not up yet
    run(state, { ...along(car, 1), handbrake: true }, 1);
    expect(carSkidding(car)).toBe(true);
    for (let i = 0; i < 400 && car.speed > 0; i++) {
      run(state, { ...along(car, 1), handbrake: true }, 1);
    }
    // A car dragged down to a walking pace has already laid its skid.
    expect(Math.abs(car.speed)).toBeLessThanOrEqual(CAR.skidMinSpeed);
    expect(carSkidding(car)).toBe(false);
  });
});

describe("the fix ladder", () => {
  it("mints every part bolted down, nothing dangling, no debris", () => {
    const state = startHub();
    const car = carOf(state);
    expect(car.fixes).toEqual({ doors: 0, hood: 0, bumper: 0, roof: 0 });
    expect(car.dangle).toEqual({ doors: 0, hood: 0, bumper: 0, roof: 0 });
    expect(state.wheelDebris).toEqual([]);
  });

  it("rattles a LOOSE part only a tad on a bump — the clamp holds", () => {
    const state = startHub();
    const car = carOf(state);
    car.fixes.hood = CAR_FIX.loose;
    nudgeCar(car, 200, 200);
    let peak = 0;
    for (let i = 0; i < 120; i++) {
      run(state, idle, 1);
      peak = Math.max(peak, Math.abs(car.dangle.hood));
    }
    expect(peak).toBeGreaterThan(0); // it moved…
    expect(peak).toBeLessThanOrEqual(CAR.looseSwing); // …but only a tad
    run(state, idle, 400); // and settles back to dead rest
    expect(car.dangle.hood).toBe(0);
  });

  it("swings a DANGLING part through the full arc, wider than loose", () => {
    const state = startHub();
    const car = carOf(state);
    car.fixes.doors = CAR_FIX.dangling;
    nudgeCar(car, 400, 400);
    let peak = 0;
    for (let i = 0; i < 120; i++) {
      run(state, idle, 1);
      peak = Math.max(peak, Math.abs(car.dangle.doors));
    }
    expect(peak).toBeGreaterThan(CAR.looseSwing);
    expect(peak).toBeLessThanOrEqual(CAR.dangleSwing);
  });

  it("shedPart tears the part off and lays it on the floor as decor", () => {
    const state = startHub();
    const car = carOf(state);
    const before = state.decor.length;
    shedPart(state, car, "hood");
    expect(car.fixes.hood).toBe(CAR_FIX.gone);
    expect(state.decor).toHaveLength(before + 1);
    const shed = state.decor[state.decor.length - 1]!;
    expect(shed.sprite).toBe("car_shed_hood");
    // Idempotent: a part already gone sheds nothing twice.
    shedPart(state, car, "hood");
    expect(state.decor).toHaveLength(before + 1);
  });
});

describe("a wheel coming off", () => {
  it("bounces like a wheel dropped on a highway, then settles", () => {
    const state = startHub();
    const car = carOf(state);
    detachWheel(state, car, 1, { x: 60, y: 0 });
    expect(car.wheelStates[1]).toBe(3);
    // The axle slams onto the bump stop and stays there.
    expect(car.suspension[1]).toBe(CAR.maxCompress);
    const wheel = state.wheelDebris[0]!;
    expect(wheel.z).toBeGreaterThan(0);
    const start = wheel.pos.x;
    // Ride the bounce: it must leave the ground at least once more…
    let airborne = false;
    for (let i = 0; i < 400 && !wheel.settled; i++) {
      run(state, idle, 1);
      if (wheel.z > 0.5 && i > 10) airborne = true;
    }
    // …then come to rest, ahead of where it left, and stay put.
    expect(airborne).toBe(true);
    expect(wheel.settled).toBe(true);
    expect(wheel.z).toBe(0);
    expect(wheel.vel).toEqual({ x: 0, y: 0 });
    expect(wheel.pos.x).toBeGreaterThan(start);
    // Detaching again is refused — there is no second wheel on that axle.
    detachWheel(state, car, 1, { x: 60, y: 0 });
    expect(state.wheelDebris).toHaveLength(1);
  });
});

// ── THE FOOTPRINT LIES UNDER THE PICTURE ────────────────────────────────────
// A car is one side-profile assembly drawn dead straight-on at a single anchor
// (pwa/src/game/render/vehicles.ts), so the ground it visibly covers runs along
// whichever world bearing the CAMERA draws horizontal — never along its nose,
// which the picture does not show at all. Walked down the heading, the blockers
// stood off the drawn body by up to a body-length, and the hero walked through
// the bonnet and was stopped by open floor.
describe("the footprint", () => {
  /** The engine's camera is module state, so every test puts it back. */
  afterEach(() => setCameraYaw(0));

  const carPrints = (state: ReturnType<typeof startHub>) =>
    state.obstacles.filter((o) => o.kind === "vehicle" && o.jumpable);

  it("ignores the nose — the picture never turns, so neither does the chain", () => {
    const state = startHub();
    const car = carOf(state);
    state.players[0]!.pos = { x: car.pos.x - 30, y: car.pos.y };
    expect(applyRunCommand(state, "enterCar")).toBe(true);
    // A nose square off its own axis — which the steering can no longer produce
    // at all, and which the chain would have to ignore even if it could, since
    // the drawn body is exactly where it was.
    car.heading = Math.PI * 0.48;
    expect(applyRunCommand(state, "exitCar")).toBe(true);
    const prints = carPrints(state);
    expect(prints).toHaveLength(3);
    for (const print of prints) expect(print.pos.y).toBeCloseTo(car.pos.y, 6);
    expect(
      prints.map((p) => p.pos.x - car.pos.x).sort((a, b) => a - b),
    ).toEqual([...CAR.footprint.offsets].sort((a, b) => a - b));
  });

  it("turns with the CAMERA, which is the thing that turns the picture", () => {
    setCameraYaw(45);
    const state = startHub();
    const car = carOf(state);
    const prints = carPrints(state);
    expect(prints).toHaveLength(3);
    const offsets = [...CAR.footprint.offsets].sort((a, b) => a - b);
    const along = prints
      .map((p) => ({ dx: p.pos.x - car.pos.x, dy: p.pos.y - car.pos.y }))
      // A screen-horizontal chain runs NORTH-east across the floor under a
      // camera stood 45° round: the bearing is the yaw's own, backwards.
      .map(({ dx, dy }) => {
        expect(dy).toBeCloseTo(-dx, 6);
        return Math.sign(dx) * Math.hypot(dx, dy);
      })
      .sort((a, b) => a - b);
    // Same LENGTHS along the body — the bearing is unit-preserving, which is
    // what lets a blocker reuse a drawn column's number verbatim.
    along.forEach((d, i) => expect(d).toBeCloseTo(offsets[i]!, 6));
  });
});

describe("the drive-out", () => {
  it("boards on enterCar only when the hero stands AT the car", () => {
    const state = startHub();
    const car = carOf(state);
    const hero = state.players[0]!;
    hero.pos = { x: car.pos.x - 200, y: car.pos.y };
    expect(applyRunCommand(state, "enterCar")).toBe(false);
    hero.pos = { x: car.pos.x - 30, y: car.pos.y };
    state.events = [];
    expect(applyRunCommand(state, "enterCar")).toBe(true);
    expect(car.driver).toBe(0);
    // The engine turned over…
    expect(state.events.some((e) => e.type === "carStarted")).toBe(true);
    // …and the car's parked footprint came off the field (the nav grid is
    // told): only the ship's blocker remains.
    expect(state.obstacles.filter((o) => o.kind === "vehicle")).toHaveLength(1);
  });

  it("idles with an engine rumble whose cadence carries the throttle", () => {
    const state = startHub();
    const car = carOf(state);
    state.players[0]!.pos = { x: car.pos.x - 30, y: car.pos.y };
    applyRunCommand(state, "enterCar");
    const grains: number[] = [];
    for (let i = 0; i < 60; i++) {
      run(state, idle, 1);
      for (const e of state.events) {
        if (e.type === "carEngine") grains.push(e.intensity);
      }
    }
    expect(grains.length).toBeGreaterThan(2); // it putters on a cadence
    for (const g of grains) expect(g).toBe(0); // parked = idle intensity
  });

  it("steers with the held pointer and books ONE departure past the latch", () => {
    const state = startHub();
    const car = carOf(state);
    state.players[0]!.pos = { x: car.pos.x - 30, y: car.pos.y };
    applyRunCommand(state, "enterCar");
    const departs: string[] = [];
    const drive = steerTo(car.pos.x + 600, car.pos.y);
    for (let i = 0; i < 300; i++) {
      run(state, drive, 1);
      for (const e of state.events) {
        if (e.type === "carDeparted") departs.push(e.to);
      }
    }
    // The car moved, the hero rode along, the trip was booked exactly once.
    expect(car.pos.x).toBeGreaterThan(car.home.x + CAR.departDistance);
    expect(state.players[0]!.pos.x).toBe(car.pos.x);
    expect(departs).toEqual(["test_level_2"]);
    expect(car.speed).toBeGreaterThan(0);
    expect(car.wheelAngle).toBeGreaterThan(0); // the wheels rolled the trip
  });
});

// A car you can climb into and not climb out of is a trap: the seat used to be
// a one-way door out of the level. `exitCar` is the same tap read backwards.
describe("getting back out", () => {
  const board = (state: ReturnType<typeof startHub>): CarVehicle => {
    const car = carOf(state);
    state.players[0]!.pos = { x: car.pos.x - 30, y: car.pos.y };
    applyRunCommand(state, "enterCar");
    return car;
  };

  it("refuses anybody who is not at that car's wheel", () => {
    const state = startHub();
    expect(applyRunCommand(state, "exitCar")).toBe(false);
    board(state);
    expect(applyRunCommand(state, "exitCar")).toBe(true);
    // …and a second press has nothing left to get out of.
    expect(applyRunCommand(state, "exitCar")).toBe(false);
  });

  it("switches off, re-parks the body and stands the hero beside it", () => {
    const state = startHub();
    const car = board(state);
    run(state, steerTo(car.pos.x + 400, car.pos.y), 40);
    const droveTo = { x: car.pos.x, y: car.pos.y };
    const version = state.obstaclesVersion;
    state.events = [];
    expect(applyRunCommand(state, "exitCar")).toBe(true);
    expect(car.driver).toBeNull();
    expect(car.speed).toBe(0);
    expect(state.events.some((e) => e.type === "carStopped")).toBe(true);
    // The car is furniture again WHERE IT NOW STANDS, and the nav grid is told.
    const prints = state.obstacles.filter((o) => o.kind === "vehicle");
    expect(prints).toHaveLength(4); // three under the car, one under the ship
    const reach = Math.max(...CAR.footprint.offsets.map(Math.abs));
    for (const print of prints.filter((o) => o.jumpable)) {
      expect(
        Math.hypot(print.pos.x - droveTo.x, print.pos.y - droveTo.y),
      ).toBeLessThanOrEqual(reach + 0.5);
    }
    expect(state.obstaclesVersion).toBeGreaterThan(version);
    // He is standing beside it, not inside it — and no longer riding along.
    const hero = state.players[0]!;
    expect(
      Math.hypot(hero.pos.x - car.pos.x, hero.pos.y - car.pos.y),
    ).toBeGreaterThan(CAR.footprint.radius);
    run(state, steerTo(car.pos.x + 400, car.pos.y), 30);
    expect(car.pos).toEqual(droveTo); // nobody is driving it any more
  });
});

// The body is 48 px of car, not a dot at its middle, and the lot it is driven
// around is finite. Both used to be untrue.
describe("the body collides", () => {
  const board = (state: ReturnType<typeof startHub>): CarVehicle => {
    const car = carOf(state);
    state.players[0]!.pos = { x: car.pos.x - 30, y: car.pos.y };
    applyRunCommand(state, "enterCar");
    return car;
  };

  it("stops the BUMPER at a wall, not the middle of the car", () => {
    const state = startHub();
    const car = board(state);
    const wallX = car.pos.x + 120;
    // Replaced rather than pushed into: the obstacle grid caches on the
    // array's identity (obstacles.ts).
    state.obstacles = state.obstacles.concat([
      {
        id: 9001,
        kind: "wall",
        sprite: "",
        pos: { x: wallX, y: car.pos.y },
        radius: 8,
        jumpable: false,
      },
    ]);
    run(state, steerTo(wallX + 200, car.pos.y), 120);
    // The front body circle sits at `wheelOffsets`-ish along the nose; it must
    // clear the wall by both radii, so the CENTRE stops well short of where a
    // single-circle car used to bury its bonnet.
    const nose = car.pos.x + CAR.footprint.offsets[2]!;
    expect(nose).toBeLessThanOrEqual(wallX - (8 + CAR.footprint.radius) + 0.5);
  });

  it("keeps the whole car on the lot", () => {
    const state = startHub();
    const car = board(state);
    // West, hard, for long enough to have driven clean off the map twice over.
    run(state, steerTo(-4000, car.pos.y), 900);
    const rear = car.pos.x + CAR.footprint.offsets[0]!;
    expect(rear).toBeGreaterThanOrEqual(CAR.footprint.radius - 0.5);
    expect(car.pos.y).toBeGreaterThan(0);
    expect(car.pos.y).toBeLessThan(state.level.height);
  });
});

describe("determinism", () => {
  it("spends no rng — bumps, sheds, lost wheels and the drive included", () => {
    const state = startHub();
    const car = carOf(state);
    const before = rngState(state.rng);
    nudgeCar(car, 25, 10);
    car.fixes.doors = CAR_FIX.dangling;
    shedPart(state, car, "bumper");
    detachWheel(state, car, 0, { x: -50, y: 20 });
    state.players[0]!.pos = { x: car.pos.x - 30, y: car.pos.y };
    applyRunCommand(state, "enterCar");
    run(state, steerTo(car.pos.x + 400, car.pos.y), 120);
    expect(rngState(state.rng)).toBe(before);
  });
});
