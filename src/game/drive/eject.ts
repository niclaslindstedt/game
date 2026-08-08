// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// PEOPLE LEAVING VEHICLES, AND VEHICLES LEAVING THEMSELVES.
//
// The road already knew how to take a PEDESTRIAN apart (`remains.ts`): a person
// standing on tarmac is met by a bumper, and what happens next is a sequence of
// facts about where the pieces are. This file is the other two populations,
// which the road had no vocabulary for at all until the fleet grew a rider on
// it:
//
//   A RIDER   sits in the open on a machine that weighs less than they do.
//             Nothing holds them on. Any real contact takes them off it, and
//             the only question the model has to answer is how FAR they go —
//             which is a long way, because they leave carrying the closing
//             speed of two vehicles and nothing has slowed them down.
//
//   AN OCCUPANT sits inside a steel box, and there is exactly one way out of
//             one: forward, through the screen. So it takes a SQUARE blow
//             rather than merely a hard one — and that single condition is what
//             makes the sight legible instead of random. A player works out
//             inside three collisions that hitting a car head-on empties it and
//             that clipping the same car does not, and nobody had to write a
//             word of UI for him to learn it.
//
//   A MACHINE  is neither. It is the half of a two-wheeler that was never
//             alive, and what comes off it is steel: it sparks rather than
//             bleeds, it bounces harder than meat does, and it is cut out of the
//             VEHICLE's art. Same list, same physics, different material — which
//             is the same fence every other piece on this road is drawn along.
//
// WHAT IS DELIBERATELY REUSED. A thrown person becomes a `DrivePedestrian` in
// `tumbling` mode, and a hard enough throw is handed straight to `burstBody`.
// That is not an economy: it means an ejected rider is caught by the wheels, is
// counted on the tally, bleeds onto the tarmac, is cut out of their own art and
// is dragged under the floorpan exactly as anybody else is, without a single one
// of those systems learning that riders exist.
//
// NOTHING HERE SPENDS A DRAW OF THE ROAD'S RNG, for the reason the whole gore
// system does not: the seeded stream lays the crowd and the traffic down, so a
// cosmetic hop that consumed one would shift every roll after it. Every roll
// below is hashed off the victim's own id and position.

import { DRIVE, DRIVE_UNITS } from "./config.ts";
import { DRIVER_VARIANTS, vehicleDef } from "./fleet.ts";
import type { Impact } from "./impact.ts";
import { burstBody, remainForce, splitsBody } from "./remains.ts";
import type {
  DrivePedestrian,
  DriveRemain,
  DriveState,
  DriveTraffic,
} from "./types.ts";

/** A stable 0→1 off a seed and a salt. */
function hash(seed: number, salt: number): number {
  let h = Math.imul(
    (seed ^ 0x9e3779b9) + Math.imul(salt, 0x27d4eb2f),
    0x85ebca6b,
  );
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * HOW HARD THIS WAS, IN WRECKS — the collision's absorbed energy over what it
 * takes to finish this particular vehicle.
 *
 * Scaled by the vehicle's own mass against a mid-size saloon, so the SAME blow
 * is a write-off to a moped, a bad day to a hatchback and a scratch to a bus.
 * One number, and every ladder in this file and in the damage rungs reads off
 * it, which is why "hit it hard enough" means the same thing everywhere.
 */
export function wreckForce(other: DriveTraffic, joules: number): number {
  const def = vehicleDef(other.variant);
  const force =
    joules /
    (DRIVE.traffic.wreckJoules * (def.massKg / DRIVE_UNITS.trafficMassKg));
  // CLAMPED, because the fleet now contains a three-kilo skateboard. Divided by
  // its own mass, a board met at any speed at all comes out in the hundreds —
  // which is the correct answer to "is it destroyed" (it is, absolutely, every
  // time) and a ruinous one to every LADDER that reads the same number: the
  // debris count, the spin and the throw all scale on it, and unclamped a
  // skater left the road spinning at four hundred radians a second. The cap is
  // well past every threshold in the file, so nothing that should happen stops
  // happening — it only stops the ladders running off the end.
  return Math.min(12, force);
}

/** Whether a hit this square and this hard puts somebody through a screen.
 * BOTH conditions, never either: a hard sideswipe leaves everybody seated,
 * which is what a hard sideswipe does. */
function ejects(other: DriveTraffic, hit: Impact, force: number): boolean {
  const { eject } = DRIVE;
  const def = vehicleDef(other.variant);
  // The convertible has no screen to go through, so it needs far less of both
  // — the model gets the sight the whole feature was built for for free, on the
  // one car that most deserves it.
  const open = def.id === "traffic_convertible";
  const scale = open ? eject.openScale : 1;
  return (
    hit.squareness >= eject.squareness * scale && force >= eject.joules * scale
  );
}

/**
 * …AND WHETHER THIS WAS A HEAD-ON — nose to nose, against something coming the
 * other way, which is the one collision on this road with a guaranteed picture.
 *
 * TWO FACTS AND BOTH ARE REQUIRED (`DRIVE.eject.headOn`). The blow is SQUARE,
 * well above the ordinary eject's bar — this is a nose meeting a nose rather
 * than a wing catching one — and the other vehicle is TRAVELLING AT YOU, which
 * is the half that makes it a head-on rather than a rear-ending. A parked car
 * answers the first and never the second, and that is correct: furniture met
 * square is a shunt, however hard it was met.
 *
 * The direction test is the whole of "in the opposing lane" and it is a fact
 * about the VEHICLE rather than about the lane it is sitting in — a car that has
 * been spun round and is rolling backwards up the carriageway is oncoming too,
 * and the geometry does not care which paint it is between.
 */
function headOn(drive: DriveState, other: DriveTraffic, hit: Impact): boolean {
  const { headOn: rule } = DRIVE.eject;
  if (hit.squareness < rule.squareness) return false;
  if (hit.joules < DRIVE.traffic.wreckJoules * rule.joules) return false;
  // `DriveTraffic.speed` is signed in world +x and `direction` is the hero's
  // heading in the same frame, so a negative product is a closing pair.
  return other.speed * drive.params.direction < -rule.closingPx;
}

/**
 * Mint a thrown body and put it in the road — the one shape both a rider and a
 * passenger leave a vehicle in.
 *
 * `from` is the point they left, `force` how hard it was in wrecks. Returns the
 * pieces to push onto the road (empty unless they came apart on the way out),
 * having already added the body itself.
 */
function throwBody(
  drive: DriveState,
  other: DriveTraffic,
  hit: Impact,
  /**
   * WHOSE ART LEAVES THE VEHICLE — a `rider` off a two-wheeler, or a `driver`
   * out through a windscreen. It is the ONE thing that differs between the two
   * populations by the time they are in the air, and it travels rather than
   * being guessed at the far end: everything downstream (the tumble, the tally,
   * the wheels, the cut) is identical.
   */
  kind: "rider" | "driver",
  variant: number,
  force: number,
  atX: number,
  /**
   * MET NOSE TO NOSE. Two things change and they are the two the sight is made
   * of: whoever was in the seat comes apart WHATEVER the force ladder says, and
   * everything that leaves does so flat and fast rather than being lobbed
   * (`DRIVE.eject.headOn`).
   */
  square = false,
): DriveRemain[] {
  const { eject } = DRIVE;
  const dir = drive.params.direction;
  const seed =
    Math.abs(Math.round(other.pos.x * 7 + other.pos.y * 13)) + other.id;
  const over = Math.max(0, force - eject.joules);

  // THEY LEAVE FASTER THAN THE CAR THAT HIT THEM. A body that left at the
  // wagon's own speed would hang exactly in front of the bumper for the whole
  // of its flight and be run over on landing — a much duller picture than the
  // one that clears the roof and goes up the road.
  const carVx = dir * drive.car.speed;
  const lift =
    Math.min(
      eject.maxLiftPx,
      eject.liftPx.base + eject.liftPx.perForce * over,
    ) * (square ? eject.headOn.liftScale : 1);
  const ped: DrivePedestrian = {
    id: drive.nextId++,
    pos: { x: atX, y: other.pos.y },
    vel: {
      x: carVx * eject.carry * (square ? eject.headOn.carryScale : 1),
      // Out of the side the blow came from, so a body leaves a car the way the
      // car was pushed rather than in a direction nobody can account for.
      y: hit.launch.y * 0.5 + (hash(seed, 7) - 0.5) * 40,
    },
    mode: "tumbling",
    kind,
    variant,
    bark: -1,
    phase: hash(seed, 11) * Math.PI * 2,
    z: 3,
    vz: lift,
    counted: false,
    crushed: false,
  };

  drive.events.push({
    type: "occupantThrown",
    pos: { x: ped.pos.x, y: ped.pos.y },
    joules: hit.joules,
  });
  drive.bodies++;
  ped.counted = true;

  // …AND PAST A LINE THEY DO NOT LAND IN ONE PIECE. The ladder the road now
  // has is: knocked off, thrown a long way, and — past `gibForce` — thrown a
  // long way in several directions at once.
  //
  // A HEAD-ON SKIPS THE LADDER AND TAKES THE TOP RUNG EVERY TIME, which is the
  // whole of the rule: the biggest thing a player can deliberately do out here
  // has to look the same each time he does it, or it is not something he can
  // decide to do. What comes out of the screen is the driver's upper half and
  // whatever was inside him, on every single one.
  const { gib, split } = drive.params;
  if ((gib || split) && (square || force >= eject.gibForce)) {
    drive.strikes.push({
      id: ped.id,
      pos: { x: ped.pos.x, y: ped.pos.y },
      vel: { x: ped.vel.x, y: ped.vel.y },
      vz: ped.vz,
      joules: hit.joules,
      kind,
      variant,
      panel: hit.panel,
      split: split && splitsBody(hit.joules),
    });
    const pieces = burstBody(drive, ped, hit, split, gib, {
      boost: DRIVE.eject.gibBoost,
      airborne: true,
      liftScale: square ? eject.headOn.liftScale : 1,
    });
    return pieces;
  }
  drive.pedestrians.push(ped);
  return [];
}

/**
 * TAKE THE RIDER OFF — called the instant a two-wheeler is touched by anything.
 *
 * There is no threshold worth speaking of (`eject.riderScale`), because there is
 * no threshold in life either: a car brushing a bicycle ends with the cyclist
 * on the ground. What the force decides is how far they go and whether they
 * arrive whole.
 */
export function ejectRider(
  drive: DriveState,
  other: DriveTraffic,
  hit: Impact,
): DriveRemain[] {
  if (!other.rider) return [];
  const def = vehicleDef(other.variant);
  if (def.rider === null) return [];
  const force = wreckForce(other, hit.joules);
  if (force < DRIVE.eject.joules * DRIVE.eject.riderScale) return [];
  other.rider = false;
  return throwBody(drive, other, hit, "rider", def.rider, force, other.pos.x);
}

/**
 * …AND EMPTY A CAR — through its own windscreen, or into its own upholstery.
 *
 * WHICH END THEY GO OUT OF is the same question `breakTrafficLamps` already
 * answers, and for the same reason. A struck car ACCELERATES; an unbelted
 * occupant does not, so relative to the car they travel TOWARD the impact and
 * leave through the end that was hit. Meet one head-on and that is the
 * windscreen — which is the sight worth having — and rear-end one and it is the
 * back window, which is also correct and which nobody had to write a second
 * rule for.
 *
 * AND THE ONES WHO DO NOT GO OUT DO NOT WALK AWAY. That is the half this had
 * missing, and it made the road tell a strange lie: a car could be folded in
 * half, rolled, and left dead in a lane with its passengers sitting neatly
 * inside it because the geometry of the blow was two degrees off. Squareness
 * decides HOW somebody leaves the car; the force decides WHETHER they survived
 * it (`eject.killForce`), and those are two different questions that were being
 * answered by one number. A seat that is killed rather than thrown raises
 * `occupantKilled` and puts blood on the glass — which is the only way the road
 * can show a death nobody saw happen.
 *
 * AND ONE COLLISION IS NOT ON THE LADDER AT ALL. Meet a car NOSE TO NOSE in the
 * opposing lane and the whole sequence is guaranteed rather than rolled: the
 * driver's upper half comes out through the screen, what was inside him comes
 * out with it, and the car wears the rest down its own glass. That is the most
 * deliberate act available on this road and it has to look the same every time,
 * or it is not something a player can decide to do. See `headOn`.
 *
 * `forced` is passed by the write-off (`hurtTraffic`): a car whose structure has
 * given up entirely is not keeping anybody, whatever the last blow's angle was.
 */
export function ejectOccupants(
  drive: DriveState,
  other: DriveTraffic,
  hit: Impact,
  fromX: number,
  forced = false,
): DriveRemain[] {
  if (other.occupants <= 0) return [];
  const force = wreckForce(other, hit.joules);
  // MET NOSE TO NOSE. It is settled before the ordinary bar is even asked,
  // because "always" is the whole content of the rule — see `headOn`.
  const square = headOn(drive, other, hit);
  const out = forced || square || ejects(other, hit, force);
  if (!out) {
    // NOT OPEN, BUT FATAL. Nobody comes through the glass — the blow was down
    // the flank, or the car folded rather than opened — and everybody in it is
    // still dead. It is the same body count either way; only the picture
    // differs, and this is the picture.
    if (force >= DRIVE.eject.killForce) killInside(drive, other, hit);
    return [];
  }
  const def = vehicleDef(other.variant);
  // The end that was struck, in world x — where the glass is.
  const side = fromX < other.pos.x ? -1 : 1;
  const exitX = other.pos.x + side * def.halfLengthPx;

  drive.events.push({
    type: "windscreenOut",
    pos: { x: exitX, y: other.pos.y },
    joules: hit.joules,
  });
  // The screen is the front of the car, so its glass goes with the front of the
  // car's damage — the same agreement the hero's own glass keeps with his hood.
  other.rung = Math.max(other.rung, 1);
  // …AND A HEAD-ON PAINTS THE INSIDE OF IT ON THE WAY PAST. Somebody left this
  // car through its own screen at the sum of two speeds, and the car keeps the
  // record of it: `DriveTraffic.gore` is the wash down the glass and the
  // bodywork under it, the same mark a death in the seat leaves, arrived at from
  // the opposite direction. Gated at the DECISION with everything else — with
  // the run's dismemberment switches off the driver still goes through the
  // windscreen, the car simply does not wear him.
  if (square && (drive.params.gib || drive.params.split)) {
    other.gore = 1;
    other.glassOut = true;
    // …AND IT DOES NOT ALL STAY ON THE CAR. The glass going out is one event and
    // what comes THROUGH it is another: the app answers this one with the spray.
    drive.events.push({
      type: "windscreenGore",
      pos: { x: exitX, y: other.pos.y },
      joules: hit.joules,
    });
  }

  const pieces: DriveRemain[] = [];
  // At most two go out. A third body through the same hole in the same instant
  // reads as a clown car rather than as a collision, and the seats behind the
  // front pair are not in front of the screen anyway.
  const going = Math.min(2, other.occupants);
  for (let i = 0; i < going; i++) {
    other.occupants--;
    // The passenger goes out a beat wider than the driver, so two bodies leaving
    // one car are two bodies rather than one drawn twice.
    const spread = i === 0 ? 0 : (hash(other.id + i, 23) - 0.5) * 26;
    pieces.push(
      ...throwBody(
        drive,
        other,
        hit,
        "driver",
        occupantVariant(other, i),
        force,
        exitX + spread * 0.2,
        square,
      ),
    );
  }
  // …AND WHOEVER WAS IN THE BACK. The screen takes the front pair and the seats
  // behind them are not in front of it, so a minivan does not empty itself
  // through one hole — the rest of it is killed where it sits, by the same blow,
  // on the same tally.
  if (other.occupants > 0 && force >= DRIVE.eject.killForce) {
    killInside(drive, other, hit);
  }
  return pieces;
}

/**
 * KILL WHOEVER IS LEFT IN THE CAR — the death this road could not previously
 * show, because it happens behind glass and nothing comes out.
 *
 * SO THE GLASS IS WHAT SHOWS IT. `DriveTraffic.gore` is raised to full on the
 * spot rather than laddered by how many died: one is enough to cover the inside
 * of a windscreen, and a scale of redness that counted bodies would be a number
 * the player cannot read off the picture anyway.
 *
 * GATED AT THE DECISION, NEVER AT THE DRAW — the umbrella rule the whole gore
 * system obeys. With the run's dismemberment switches off the people in the car
 * are just as dead and are counted just the same; the windows simply do not say
 * so, exactly as a body outside the car is knocked down rather than opened.
 */
function killInside(drive: DriveState, other: DriveTraffic, hit: Impact): void {
  if (other.occupants <= 0) return;
  drive.bodies += other.occupants;
  other.occupants = 0;
  if (drive.params.gib || drive.params.split) {
    other.gore = 1;
    // Blood on the INSIDE of a window nobody can see through is not a picture.
    // The glass goes with them.
    other.glassOut = true;
  }
  drive.events.push({
    type: "occupantKilled",
    pos: { x: other.pos.x, y: other.pos.y },
    joules: hit.joules,
  });
}

/**
 * WHICH BODY A CAR'S OCCUPANT WEARS — one of the five DRIVERS, picked off the
 * car's own id so the same car always empties the same people.
 *
 * IT USED TO BE THE RIDER TABLE, on the argument that a rider is the only art
 * on this road of a person in a seated posture and that is what somebody who
 * has just left a driving seat looks like. True of the POSTURE and false of
 * everything else: it put crash helmets and hot-box jackets in the front of
 * saloons, and — because only two of the six read as ordinary people in coats —
 * it meant the biggest sight on this road threw one of TWO torsos. Five drivers
 * with five different heads is the whole of the fix, and the cut lands high
 * enough (`DRIVE.gore.cutBand`) that the head is most of what flies.
 */
function occupantVariant(other: DriveTraffic, seat: number): number {
  return (
    Math.floor(hash(other.id, 31 + seat) * DRIVER_VARIANTS) % DRIVER_VARIANTS
  );
}

/**
 * WHAT COMES OFF THE MACHINE — the steel half of taking a two-wheeler apart.
 *
 * These are the pieces the request asked for by name: a moped is half a person
 * and half a machine, and until now the road could only make one of those. They
 * go into the same `remains` list the flesh does, carrying the VEHICLE's variant
 * rather than a body's, and the app answers what they are made of.
 */
export function tearMachine(
  drive: DriveState,
  other: DriveTraffic,
  hit: Impact,
  force: number,
  /**
   * How many pieces, when the caller has already worked it out.
   *
   * A CAR sheds on its own ladder (`shedCount`, crush.ts — it only starts once
   * the body has genuinely folded), and an OBLITERATED machine sheds on a
   * multiple of the ordinary one. Left off, the ladder here is the two-wheeler's
   * own, which is what every existing caller wants.
   */
  pieceCount?: number,
  /** …and how much further and higher they go than an ordinary tear's. */
  throwScale = 1,
): DriveRemain[] {
  const { debris, debrisReachPx, debrisLiftPx } = DRIVE.traffic;
  const dir = drive.params.direction;
  const carVx = dir * drive.car.speed;
  const seed =
    Math.abs(Math.round(other.pos.x * 11 + other.pos.y * 5)) + other.id;
  const count =
    pieceCount ??
    Math.min(
      debris.max,
      Math.round(debris.base + debris.perForce * Math.max(0, force)),
    );
  const pieces: DriveRemain[] = [];
  for (let i = 0; i < count; i++) {
    const spread = (hash(seed, 17 + i) - 0.5) * 2.4;
    const reach =
      (debrisReachPx.base + debrisReachPx.perForce * force) *
      (0.4 + 0.6 * hash(seed, 29 + i)) *
      throwScale;
    pieces.push({
      id: drive.nextId++,
      kind: "rider",
      variant: other.variant,
      part: "machine",
      cut: 0,
      pos: { x: other.pos.x, y: other.pos.y },
      vel: {
        x:
          carVx * DRIVE.impact.carryFraction * (0.4 + 0.6 * hash(seed, 41 + i)),
        y: Math.sin(spread) * reach,
      },
      z: 3,
      vz:
        (debrisLiftPx.base + debrisLiftPx.perForce * force) *
        (0.35 + 0.65 * hash(seed, 53 + i)) *
        throwScale,
      angle: hash(seed, 59 + i) * Math.PI * 2,
      spin: (hash(seed, 61 + i) < 0.5 ? -1 : 1) * (5 + force * 3),
      dragMs: 0,
      dragAlong: 0,
      dragAcross: 0,
      crushed: false,
      settled: false,
      seed: seed + i * 37,
    });
  }
  return pieces;
}

/**
 * BREAK A MACHINE IN HALF — what happens to something with a spine and a wheel
 * at each end when a car arrives in the middle of it.
 *
 * IT IS NOT MORE DEBRIS, and that is the whole reason it is its own function. A
 * shower of small pieces reads as a thing that has been scuffed; two LARGE
 * halves, each the shape of half the machine the player was looking at a moment
 * ago, read as a thing that has stopped existing. It is the same distinction the
 * body's own `upper`/`lower` draw against its chunks, and the same trick: the
 * halves are cut out of the vehicle's own art, so a mod's bicycle breaks into
 * two halves of that bicycle with nothing authored for it.
 *
 * THE TWO ENDS HAVE DIFFERENT AFTERNOONS. The front is what the bumper is
 * actually pushing, so it is punted up the road ahead of the car; the back end
 * is left behind and cartwheels. A pair of pieces thrown identically would read
 * as one object that had been duplicated.
 */
export function snapMachine(
  drive: DriveState,
  other: DriveTraffic,
  hit: Impact,
  force: number,
): DriveRemain[] {
  const { snapCarry, snapSpreadPx, snapLiftPx } = DRIVE.traffic;
  const dir = drive.params.direction;
  const carVx = dir * drive.car.speed;
  const seed =
    Math.abs(Math.round(other.pos.x * 3 + other.pos.y * 17)) + other.id;
  // WHERE IT BROKE, as a fraction along the machine. Rolled inside a band about
  // the middle rather than fixed, because the weak spot is the middle and not a
  // point — and two machines that always broke at exactly 50% would read as a
  // sprite being cut rather than as a thing failing.
  const cut = 0.42 + 0.16 * hash(seed, 3);
  const half = (
    part: "machine_front" | "machine_rear",
    carry: number,
    side: number,
  ): DriveRemain => ({
    id: drive.nextId++,
    kind: "rider",
    variant: other.variant,
    part,
    cut,
    pos: { x: other.pos.x, y: other.pos.y },
    vel: {
      x: carVx * carry,
      y: hit.launch.y * 0.3 + side * snapSpreadPx * (0.5 + 0.5 * hash(seed, 7)),
    },
    z: 3,
    vz: snapLiftPx * (0.6 + 0.5 * hash(seed, 11)),
    angle: other.angle,
    spin: side * (4 + Math.min(6, force)),
    dragMs: 0,
    dragAlong: 0,
    dragAcross: 0,
    crushed: false,
    settled: false,
    seed: seed ^ (part === "machine_front" ? 0x5f : 0xa7),
  });

  drive.events.push({
    type: "machineSnapped",
    pos: { x: other.pos.x, y: other.pos.y },
    joules: hit.joules,
  });
  return [
    half("machine_front", snapCarry.front, 1),
    half("machine_rear", snapCarry.rear, -1),
  ];
}

/** Re-exported so the collision can price a hit in the same currency this file
 * does without importing two modules to do it. */
export { remainForce };
