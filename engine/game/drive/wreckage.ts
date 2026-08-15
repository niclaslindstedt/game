// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT IS LEFT OF THE CAR YOU HIT — the end that went in, the wheel that left,
// and the fire that found the fuel.
//
// WHY IT IS ITS OWN FILE. `crush.ts` answers what a blow does to a vehicle's
// SHAPE, in the instant of the blow: it folds, its glass goes, it spins, it goes
// over. Everything here happens on a different clock. An end being stove in is a
// LATCH the picture reads for the rest of the leg; a wheel leaving is a body the
// road then carries on its own physics; and a fire is a process — it catches, it
// takes hold, and a few seconds later the tank decides. None of those is
// expressible as "what this collision was worth", which is the whole of what
// `crush.ts` is for.
//
// THREE THINGS, AND THE ORDER THEY HAPPEN IN IS THE POINT:
//
//   THE END GOES IN   past a share of what that end could fold at all, it stops
//                     being a dented car and becomes a wrecked one — and the app
//                     swaps in the authored crash art for that END rather than a
//                     dent rung over the whole body (`smashEnd`).
//   THE WHEEL LEAVES  almost always, because that is what a front-end collision
//                     does to a wheel, and because a wheel bouncing away down the
//                     road is the one piece of a crash that keeps going after the
//                     noise has stopped (`shedEndWheel`).
//   THE FUEL FINDS IT sometimes. A ruptured line under a folded wing, lit by the
//                     sparks the fold threw; then it takes hold, and then the
//                     tank has an opinion (`stepFires`).
//
// NOTHING HERE SPENDS A DRAW OF `state.rng()`, the same rule the crush, the gore
// and the loot toss obey and for the same reason: the road's seeded stream lays
// the crowd and the traffic down, so a cosmetic hop that consumed one would move
// every body and every car after it. Every roll below is hashed off the
// vehicle's own id — and, where it has to change over time, off its own burn
// clock as well.

import { driveHeld, DRIVE, DRIVE_OUTCOME, DRIVE_UNITS } from "./config.ts";
import { vehicleDef } from "./fleet.ts";
import { wreckForce } from "./eject.ts";
import type { Impact } from "./impact.ts";
import type { DriveState, DriveTraffic } from "./types.ts";

/** A stable 0→1 off two integers — this road's own cosmetic dice. */
function hash(a: number, b: number): number {
  let h = Math.imul((a ^ 0x9e3779b9) + Math.imul(b, 0x27d4eb2f), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * IS THIS END STOVE IN YET — the threshold the whole picture hangs off.
 *
 * Measured against what that end could fold AT ALL rather than against a fixed
 * depth, so it means the same thing on a moped and on a bus: a third of the way
 * to structurally finished. A bus's third is a great deal more absorbed energy
 * than a hatchback's, which is correct and is the fleet's own mass doing it.
 */
function smashedYet(other: DriveTraffic, depth: number): boolean {
  const def = vehicleDef(other.variant);
  const cap = def.halfLengthPx * DRIVE.crush.maxShare;
  return depth >= cap * DRIVE.wreckage.smashShare;
}

/**
 * WHICH END TOOK IT, AND WHAT THAT COSTS — called once per blow, after the fold
 * has been solved.
 *
 * `fromX` is where the blow came from, and which END that is depends on which
 * way the vehicle is pointing — the identical reasoning `crushVehicle` and
 * `breakTrafficLamps` already use, and for the identical reason: the road runs
 * both ways, so a hit "on the left" is a nose for half the traffic and a tail
 * for the other half.
 */
export function smashEnd(
  drive: DriveState,
  other: DriveTraffic,
  hit: Impact,
  fromX: number,
  /**
   * TAKE IT WHATEVER THE DEPTH SAYS — for the one caller that already knows the
   * answer, which is a vehicle being WRITTEN OFF.
   *
   * WEAR AND CRUSH DEPTH ARE DIFFERENT CURRENCIES, and that is what this exists
   * for. `wear` is absorbed energy over the whole vehicle and drives the damage
   * ladder; `crushNose`/`crushTail` are LENGTHS at one end. A car that has been
   * sideswiped down its whole flank, or clipped a dozen times on alternate
   * corners, reaches `wrecked` with neither end anywhere near the fold line — so
   * it stood dead in a live lane, plainly a total loss, wearing straight ends
   * and both its wheels. That is precisely the picture the crash art was drawn
   * to replace, and it was the commonest wreck on the road.
   */
  forced = false,
  /** Tear the complete axle out rather than allowing the ordinary cosmetic
   * keep roll. This is the hard, square rear-ending path. */
  tearAxle = false,
  /** When supplied, bypass the write-off's "worse end" choice and stove in
   * the end this collision is specifically about. */
  forcedNose?: boolean,
): void {
  const hitLeft = fromX < other.pos.x;
  // WHICH END. The blow's own, normally; for a write-off it is whichever end has
  // actually taken the most, because the last hit is not necessarily the one
  // that did the damage.
  const nose =
    forcedNose ??
    (forced ? other.crushNose >= other.crushTail : hitLeft === other.faceLeft);
  const depth = nose ? other.crushNose : other.crushTail;
  if (!forced && !smashedYet(other, depth)) return;
  if (nose ? other.smashNose : other.smashTail) {
    // A write-off may have latched the crash art a few lines before the
    // physical collision pass discovers that this particular rear hit tore the
    // axle out. The picture is already right; the two wheels are still owed.
    if (tearAxle) shedEndWheel(drive, other, nose, hit, true);
    return;
  }
  if (nose) other.smashNose = true;
  else other.smashTail = true;
  drive.events.push({
    type: "endSmashed",
    pos: { x: hit.contact.x, y: hit.contact.y },
    joules: hit.joules,
  });
  shedEndWheel(drive, other, nose, hit, tearAxle);
  igniteFrom(drive, other, hit);
}

/**
 * THROW THE WHEEL UNDER THE END THAT WENT IN.
 *
 * WHERE IT GOES IS THE COLLISION'S OWN ANSWER, not a scatter. A wheel is torn
 * off by a load that arrived along the road, so it leaves along the road: it
 * keeps most of what the car it was bolted to was doing, takes the along-road
 * share of the blow on top, and is kicked ACROSS by whatever lateral Δv the same
 * blow had. That is why a wheel off a car met head-on comes back over the
 * wagon's roof while one off a car clipped on the corner skitters into the
 * gutter — two quite different sights out of one sum, with no rule for either.
 *
 * It rolls, so it is handed to the run's own `WheelDebris` physics (bounce,
 * roll-out, friction, settle) exactly as one off the hero's own axle is. The
 * road already draws that list; nothing new had to learn what a wheel is.
 */
export function shedEndWheel(
  drive: DriveState,
  other: DriveTraffic,
  nose: boolean,
  hit: Impact,
  forceAxle = false,
): void {
  const bit = nose ? 1 : 2;
  if ((other.wheelsOff & bit) !== 0) return;
  // ALMOST ALWAYS — and the "almost" is what stops a lane of wrecks reading as
  // one repeated event. Hashed off the vehicle's own id and which end it is, so
  // it is settled the same way on a replay of the same seed.
  if (!forceAxle && hash(other.id, nose ? 17 : 29) < DRIVE.wreckage.wheelKeep) {
    return;
  }
  other.wheelsOff |= bit;

  const def = vehicleDef(other.variant);
  // WHERE THAT WHEEL ACTUALLY IS. The axle sits about two thirds of the way out
  // from the middle, and which way "out" is depends on the facing — the same
  // body-ends-not-screen-ends rule the crush and the lamps keep.
  const toNose = other.faceLeft ? -1 : 1;
  const along = def.halfLengthPx * 0.62 * (nose ? toNose : -toNose);
  const { wheelThrowPx, wheelLiftPx, wheelTrackHalfPx } = DRIVE.wreckage;
  const force = Math.min(2, wreckForce(other, hit.joules));
  // A ROOFED VEHICLE HAS AN AXLE, NOT A PROFILE DISC. The side-on art can only
  // show its near wheel, but the road holds both physical wheels: the far one
  // starts at the smaller y and therefore sorts BEHIND the body, while the near
  // one starts at the larger y and passes in front. Open machines retain their
  // single visible wheel because they are taken apart by their own path.
  const wheels = def.class === "open" ? 1 : 2;
  for (let i = 0; i < wheels; i++) {
    const far = i === 0;
    const salt = (nose ? 31 : 37) + i * 19;
    const spin = hash(other.id, salt);
    const side = far ? -1 : 1;
    const y = other.pos.y + side * wheelTrackHalfPx;
    drive.wheelDebris.push({
      pos: { x: other.pos.x + along, y },
      vel: {
        // THE CAR STOPS; THE WHEELS DO NOT. They leave with the vehicle's
        // PRE-impact road speed and only a small share of the shove, so the
        // shell drops behind them instead of towing them along invisibly.
        x: other.speed + hit.dv.x * 0.15,
        // The two sides part from each other even on a dead-square hit. A hard
        // blow adds lift and reach; a modest one lets them roll away low.
        y:
          hit.dv.y * 0.45 +
          side * wheelThrowPx * (0.25 + force * 0.38) * (0.75 + spin * 0.5),
      },
      z: 4,
      vz:
        wheelLiftPx *
        (0.28 + 0.5 * hash(other.id, salt + 10)) *
        (0.45 + force * 0.55),
      angle: spin * Math.PI * 2,
      wheelState: force > 0.6 ? 1 : 0,
      settled: false,
    });
    drive.events.push({
      type: "wheelTorn",
      pos: { x: other.pos.x + along, y },
      joules: hit.joules,
    });
  }
}

/**
 * DID THE FUEL FIND THE SPARKS — asked once, on the blow that stove the end in.
 *
 * ASKED THERE AND NOWHERE ELSE, on purpose. A fire wants a ruptured line and an
 * ignition source in the same place, and the moment a structure folds far enough
 * to matter is the only moment on this road where both are guaranteed. The
 * outcome is rolled once from the vehicle id, so it replays exactly without
 * spending the road's layout stream.
 */
export type CollisionCombustion = "none" | "small" | "large" | "explosion";

/**
 * DOES THIS ONE GO UP BIG — the rare tank that takes the whole street with it.
 *
 * ITS OWN ROLL RATHER THAN A FOURTH RUNG ON `collisionCombustion`, and the
 * difference is what each of them decides. That ladder is about what the FIRE
 * does — none, a flicker under a wing, an engine bay, the tank — and every rung
 * of it changes the road: whether the thing burns, whether the fire chains to
 * its neighbour, what standing beside it costs. This decides nothing at all
 * about the blast. It is the same explosion with the same reach, the same shove
 * and the same wear, and the only thing it changes is how much of it the player
 * is SHOWN (`DriveEvent.trafficExploded.big`).
 *
 * Hashed off the vehicle's own id on a salt of its own, like every other
 * cosmetic answer out here, so it costs the road's seeded stream nothing and a
 * replayed seed blows the same car up the same way.
 */
export function blowsBig(id: number): boolean {
  return hash(id, 83) < DRIVE.wreckage.bigBlastChance;
}

/** One nested roll gives the promised cumulative 70/50/30 collision odds. */
export function collisionCombustion(id: number): CollisionCombustion {
  const roll = hash(id, 53);
  if (roll < DRIVE.wreckage.explodeChance) return "explosion";
  if (roll < DRIVE.wreckage.largeFireChance) return "large";
  if (roll < DRIVE.wreckage.smallFireChance) return "small";
  return "none";
}

function igniteFrom(drive: DriveState, other: DriveTraffic, hit: Impact): void {
  if (other.fire > 0 || other.blown) return;
  // NOTHING BURNS THAT HAS NOTHING TO BURN. A stove-in end runs this lottery on
  // whatever it is attached to, and the fleet has a pushbike and a skateboard in
  // it — so the def is asked (`DriveVehicleDef.burns`) rather than assumed.
  if (!vehicleDef(other.variant).burns) return;
  const outcome = collisionCombustion(other.id);
  if (outcome === "explosion") {
    explodeVehicle(drive, other);
  } else if (outcome !== "none") {
    catchFire(drive, other, hit.contact, outcome);
  }
}

/**
 * DID THAT BLOW REVERSE IT — the whole trigger, in one line and with no
 * threshold in it.
 *
 * Asked of the vehicle's road speed either side of the punt, and it has to be
 * asked THERE rather than derived from the impact: `Impact.approach` says the
 * two were closing, which a rear-ending also does, and the sum's own answer says
 * how hard — but whether the thing actually ended up going the other way is a
 * comparison the collision destroys the moment it makes it.
 *
 * A car merely STOPPED does not qualify, and should not: coming to rest is what
 * a hard shove into a heavy vehicle does, and the road already has a whole
 * ladder for that. Only a sign change counts.
 */
export function turnedRound(was: number, now: number): boolean {
  return was !== 0 && was * now < 0;
}

/**
 * THE BLOW THAT TURNED IT ROUND — everything a vehicle has, spent at once.
 *
 * THE RULE IT SERVES, stated once: **a collision that reverses the other
 * vehicle's direction of travel is the maximum this road can do to it.** Nothing
 * about that is a threshold to tune. A car doing forty the other way that leaves
 * the contact doing anything at all back down its own lane has been hit by
 * something that took every scrap of its momentum and then some, and there is no
 * version of that a car drives away from — so the combustion lottery
 * (`collisionCombustion`, which quietly let three in ten of them off) does not
 * get a say, both ends go in, both axles go, and the tank goes.
 *
 * IT IS THE ANSWER TO "some cars in the opposing lane survive a collision".
 * They were surviving three ways at once — the contact missing on a lateral
 * offset (`impact.bodyBandFrac`), the blow reading as a graze
 * (`REAR_END_BAND`), and, having got past both, a 30% roll deciding the wreck
 * was not worth a fire. This closes the third, and it closes it on the one fact
 * about a collision that cannot be argued with.
 *
 * ROOFED VEHICLES ONLY, by its callers: an `open` machine reversed by a bumper
 * is already on the tightest rung of a ladder of its own — down, snapped in
 * half, obliterated — and a bicycle with a fuel tank would be the one lie on
 * this road.
 */
export function wreckTotally(
  drive: DriveState,
  other: DriveTraffic,
  hit: Impact,
  fromX: number,
): void {
  if (other.blown) return;
  // THE TANK FIRST, and the order is deliberate rather than dramatic: `smashEnd`
  // runs its own ignition roll, and a small fire booked a line before the
  // explosion would be a `trafficFire` and a `trafficExploded` in the same tick
  // — two sounds for one event. Blown, that roll is already a no-op.
  explodeVehicle(drive, other);
  const def = vehicleDef(other.variant);
  const cap = def.halfLengthPx * DRIVE.crush.maxShare;
  other.crushNose = cap;
  other.crushTail = cap;
  other.wear = Math.max(1, other.wear);
  other.rung = Math.max(other.rung, DRIVE.traffic.rungs.length);
  // BOTH ENDS, BOTH AXLES. A head-on hard enough to turn a car round has folded
  // the front into the engine AND slammed the back end down on the road behind
  // it; a write-off wearing one straight end is the picture this exists to stop.
  smashEnd(drive, other, hit, fromX, true, true, true);
  smashEnd(drive, other, hit, fromX, true, true, false);
}

/**
 * LIGHT ONE — the one door into the burn, so a fire started by a blow and a fire
 * started by the car next to it going up are the same thing.
 */
export function catchFire(
  drive: DriveState,
  other: DriveTraffic,
  at: { x: number; y: number },
  size: "small" | "large" = "large",
): void {
  if (other.fire > 0 || other.blown) return;
  const large = size === "large";
  other.fire = large ? DRIVE.wreckage.largeFireStart : 0.18;
  other.fireCap = large ? 1 : DRIVE.wreckage.smallFireCap;
  drive.events.push({
    type: "trafficFire",
    pos: { x: at.x, y: at.y },
    joules: 0,
  });
}

/**
 * …AND LIGHT ONE THAT IS LYING DOWN — a machine on its side, leaking, grinding
 * its own tank along the tarmac and throwing the sparks to light it with.
 *
 * IT IS A SEPARATE DOOR FROM `igniteFrom` BECAUSE IT IS A DIFFERENT EVENT, and
 * the difference is worth the function. A stove-in end is a fold: the roll it
 * runs may take a car's tank out entirely, which is right for a car and absurd
 * for a scooter — five litres of petrol under a seat does not remove a street.
 * So a downed machine BURNS and never blows, and how big the fire starts is the
 * force that put it down rather than a second lottery.
 *
 * ROLLED RATHER THAN CERTAIN, because a moped alight every single time is a
 * texture rather than an event — and rolled off the machine's own id on a salt
 * of its own, so it costs the road's seeded stream nothing and a replayed seed
 * lights the same one.
 */
export function igniteDowned(
  drive: DriveState,
  other: DriveTraffic,
  at: { x: number; y: number },
  force: number,
): void {
  const { wreckage } = DRIVE;
  if (other.fire > 0 || other.blown) return;
  if (!vehicleDef(other.variant).burns) return;
  if (hash(other.id, 61) >= wreckage.downFireChance) return;
  catchFire(
    drive,
    other,
    at,
    force >= wreckage.downFireForce ? "large" : "small",
  );
}

/**
 * ONE TICK OF EVERY FIRE ON THE ROAD — it takes hold up to its promised size.
 *
 * A WALK OF THE ROAD RATHER THAN AN ANSWER TO AN EVENT, for the reason the
 * wreck smoke is one: a fire is not an instant. It catches on the tick of a
 * collision and then does its own thing for the next several seconds while the
 * player drives away from it, and the only place that can live is a pass over
 * the state on the fixed step.
 */
export function stepFires(drive: DriveState, dt: number): void {
  const { wreckage } = DRIVE;
  for (const other of drive.traffic) {
    if (other.fire <= 0) continue;
    if (other.blown) {
      // Past the bang it burns itself out rather than staying lit for the leg —
      // there is nothing left in it to burn.
      other.fire = Math.max(0, other.fire - dt * 0.22);
      continue;
    }
    other.fire = Math.min(
      other.fireCap,
      other.fire + dt * wreckage.fireGrowPerSec,
    );
  }
}

/**
 * ONE TICK OF EVERY PRESSURE FRONT ON THE ROAD — and the street lighting going
 * out as each one passes.
 *
 * WHY THE SIM OWNS THIS AT ALL, when the ring itself is drawn app-side with the
 * sparks and the smoke: a blown lamp is not a picture, it is world state. The
 * post stands there dark for the rest of the leg, the beam and the pool it was
 * throwing are gone, and everything downstream — the renderer, a screenshot, the
 * next thing the player can or cannot see coming — reads it. So the FRONT has to
 * travel on the fixed step, where a dropped frame cannot leave half a street
 * lit, and the drawing follows it rather than the other way round
 * (`DRIVE.wreckage.shockwave`, read by both).
 *
 * WHAT IT DOES NOT DO IS ANY PHYSICS. It moves nothing, hurts nobody and costs
 * the wagon not one point of wear — the blast's own reach already settled all of
 * that on the tick it went up (`explodeVehicle`). This is a wave of pressure
 * crossing a street at night, and the only thing on that street made of glass is
 * the lighting.
 *
 * A POST IS PASSED ONCE. `dark` is the latch, so a second blast down the same
 * stretch finds the lamps it wants already out and says nothing — which is right:
 * they cannot go out twice, and a repeated tinkle for a light that has been dead
 * for half a minute is a sound with nothing under it.
 */
export function stepShockwaves(drive: DriveState, dt: number): void {
  if (drive.shockwaves.length === 0) return;
  const { reachPx, ms } = DRIVE.wreckage.shockwave;
  for (const wave of drive.shockwaves) {
    const was = frontPx(wave.ms, reachPx, ms);
    wave.ms += dt * 1000;
    const now = frontPx(wave.ms, reachPx, ms);
    if (now <= was) continue;
    for (const prop of drive.props) {
      if (prop.kind !== "lamp_post") continue;
      if (prop.dark || prop.felled) continue;
      // THE FRONT HAS TO HAVE REACHED IT THIS TICK rather than merely be past
      // it, so the street goes out in the order the wave arrives — which is the
      // whole sight. A plain "inside the radius" test would blow every lamp in
      // reach on the first frame and the ring would then travel over a street
      // that was already dark.
      const away = Math.hypot(prop.pos.x - wave.x, prop.pos.y - wave.y);
      if (away > now || away <= was) continue;
      prop.dark = true;
      drive.events.push({
        type: "lampBlown",
        pos: { x: prop.pos.x, y: prop.pos.y },
      });
    }
  }
  drive.shockwaves = drive.shockwaves.filter((wave) => wave.ms < ms);
}

/**
 * HOW FAR THE FRONT HAS GOT (world px) — the same ease-out the ring is drawn on.
 *
 * A blast front leaves at its fastest and is spent slowing down, so it is
 * `t * (2 - t)` rather than a straight line: most of the street is crossed in
 * the first third. The drawing runs the identical curve
 * (`drive-screen/drive-fx.ts`), which is the point of both of them reading
 * `DRIVE.wreckage.shockwave`.
 */
function frontPx(elapsedMs: number, reachPx: number, lifeMs: number): number {
  const t = Math.min(1, Math.max(0, elapsedMs / lifeMs));
  return reachPx * t * (2 - t);
}

/**
 * THE TANK GOES — the biggest single thing that happens on this road, and the
 * only one that reaches the hero without him touching anything.
 *
 * FOUR THINGS AT ONCE, and they are four because an explosion is not a bigger
 * collision: the vehicle is finished, whatever is standing in the fireball is
 * shoved, whatever is standing in it may CATCH (which is how a pile-up becomes a
 * chain), and the hero wears a share of it as wear on his own car. The last one
 * is the reason a burning wreck is a thing to drive away from rather than a
 * thing to watch.
 *
 * EXPORTED FOR `wreckTotally`, which is the one caller that already knows the
 * answer — a blow that reversed the thing's direction of travel does not get to
 * ask a lottery whether it was serious.
 */
export function explodeVehicle(drive: DriveState, other: DriveTraffic): void {
  const { wreckage } = DRIVE;
  const big = blowsBig(other.id);
  other.blown = true;
  other.fire = 1;
  other.fireCap = 1;
  if (!other.glassOut) {
    drive.events.push({
      type: "glassSmashed",
      pos: { x: other.pos.x, y: other.pos.y },
      joules: DRIVE.impact.wearJoules * wreckage.blastWear,
    });
  }
  other.glassOut = true;
  other.wrecked = true;
  other.downed = true;
  other.z = Math.max(1, other.z);
  other.vz = Math.max(other.vz, wreckage.blastLiftPx);
  other.spin += (hash(other.id, 71) < 0.5 ? -1 : 1) * wreckage.blastSpin;
  drive.events.push({
    type: "trafficExploded",
    pos: { x: other.pos.x, y: other.pos.y },
    joules: DRIVE.impact.wearJoules * wreckage.blastWear,
    // …AND WHETHER THIS IS THE RARE ONE. A tag on the blast rather than a
    // second event: it is the same tank going up, and the app draws a bigger
    // picture of it. See `blowsBig` and `DriveEvent`'s own note.
    big,
  });
  // …AND IF IT IS, A FRONT LEAVES IT. The ring is drawn app-side; what travels
  // here is the thing that ARRIVES somewhere — see `stepShockwaves`.
  if (big) drive.shockwaves.push({ x: other.pos.x, y: other.pos.y, ms: 0 });

  // ── WHAT IS STANDING IN IT ────────────────────────────────────────────────
  for (const near of drive.traffic) {
    if (near.id === other.id) continue;
    const dx = near.pos.x - other.pos.x;
    const dy = near.pos.y - other.pos.y;
    const dist = Math.hypot(dx, dy);
    if (dist > wreckage.blastReachPx) continue;
    const share = 1 - dist / wreckage.blastReachPx;
    const def = vehicleDef(near.variant);
    // Over its own mass, like everything else out here — a blast that moved a
    // bus and a bicycle equally would be the one sum on this road that had
    // forgotten what the fleet is for.
    const shove =
      (wreckage.blastShovePx * share * DRIVE_UNITS.trafficMassKg) /
      Math.max(1, def.massKg);
    near.slew += (dy >= 0 ? 1 : -1) * shove;
    near.speed += (dx >= 0 ? 1 : -1) * shove * 0.4;
    near.vz = Math.max(near.vz, shove * 0.35);
    // …AND THE CHAIN. A car sitting in somebody else's fireball is a car with
    // fuel in it and a fire around it; nothing else on this road can light one,
    // which is exactly why a row of wrecks going up one after another is worth
    // the trip back.
    if (share > 0.45) catchFire(drive, near, near.pos, "large");
  }

  // ── AND WHAT IT COSTS THE HERO ────────────────────────────────────────────
  // …EXCEPT ON THE APPROACH, where it costs him nothing. This is the ONE way
  // the road reaches the wagon without going through the collision pass, so the
  // exemption `collide`'s `heroSafe` grants has to be repeated here or a tank
  // going up under the nose of a car the player is not yet driving would mark it
  // anyway — which is the whole thing the held opening exists to prevent.
  if (driveHeld(drive)) return;
  const { car } = drive;
  const reach = Math.hypot(car.pos.x - other.pos.x, car.pos.y - other.pos.y);
  if (reach > wreckage.blastReachPx) return;
  const share = 1 - reach / wreckage.blastReachPx;
  const before = car.wear;
  car.wear = Math.min(1, car.wear + wreckage.blastWear * share);
  if (before < DRIVE.breakdownWear && car.wear >= DRIVE.breakdownWear) {
    drive.outcome = DRIVE_OUTCOME.broken;
    drive.outcomeMs = 0;
    drive.events.push({
      type: "breakdown",
      pos: { x: car.pos.x, y: car.pos.y },
    });
  }
}
