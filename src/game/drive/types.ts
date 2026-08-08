// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT A DRIVE IS — the road between the garage and GOODCO as a state object,
// and the handful of things standing on it.
//
// A DRIVE IS NOT A RUN, and the difference is the point. There is no level
// under it, no carve, no horde, no loot, no XP and no party: it is one car, one
// stretch of road, and the people on it. That is why it is its own state rather
// than a `GamePhase` on `GameState` — a minigame that borrowed the run's state
// would inherit the spawner, the menace meter, the objective check and the
// autopilot, and every one of them would have to be taught to sit this out.
//
// What it DOES borrow is the car, whole: the same `CarVehicle` the garage parks,
// the same suspension springs, the same panel and fix ladders, the same shed
// parts and bouncing wheels (`integrateCarBody`, `nudgeCar`, `shedPart`,
// `detachWheel` — src/game/vehicles.ts). A wagon that read as a different object
// the moment it reached the road would undo the whole trick.

import type { Rng } from "@game/lib/rng.ts";
import type { Vec2 } from "@game/lib/vec.ts";

import type { CarControl } from "../vehicles.ts";
import type {
  CarPanelId,
  CarVehicle,
  Difficulty,
  WheelDebris,
} from "../types/index.ts";
import type { DriveOutcome } from "./config.ts";

/**
 * WHICH WAY THIS TRIP RUNS. `1` is the outbound leg (the garage behind, GOODCO
 * ahead, the car nose-right along +x); `-1` is the way home, which is the SAME
 * road driven the other way with the side-profile art flipped — see
 * `CarVehicle.faceLeft`, which is the only thing that changes about the car.
 */
export type DriveDirection = 1 | -1;

/**
 * WHICH PIECE OF SOMEBODY THIS IS — the four things the road can leave of a
 * person, and the only vocabulary the sim has for it.
 *
 * The engine does not know what any of them LOOK like. It knows that a lump of
 * a person of roughly this size is at this spot doing this, and the app answers
 * the rest (pwa/src/game/drive-screen/drive-gore.ts) — the same fence
 * `DriveStrike` is drawn along, for the same reason.
 */
export type RemainPart =
  /** Everything above where the bumper caught them. It is the LIGHT half and it
   * is the one that goes OVER: launched with less along-road speed than the car
   * has, so the wagon passes underneath it while it is up there. */
  | "upper"
  /**
   * A PIECE OF MACHINE — a wheel, a panel, a mirror, a hot-box — torn off
   * something that was never alive.
   *
   * It is in this list rather than in a list of its own because it is the same
   * FACT: a lump of a known size is at this spot doing this, and the road has to
   * carry it, drag it, drop it and drive over it exactly as it does a lump of
   * somebody. What is different is only what it is MADE of — it throws sparks
   * rather than blood, it does not soak the tarmac, and it is drawn out of the
   * VEHICLE's art rather than the victim's (`variant` names the vehicle for a
   * piece of this part, not a person). All three of those are the app's, which
   * is the same fence every other piece on this road is drawn along.
   *
   * It is the second half of "these need new gib engines since they are half
   * human and half machine": a struck moped sheds a rider AND a wheel, and the
   * two lie in the road together answering to different physics of taste.
   */
  | "machine"
  /**
   * …AND THE TWO ENDS OF A MACHINE THAT CAME APART IN THE MIDDLE.
   *
   * A two-wheeler is a spine with a wheel bolted to each end of it, and there is
   * no version of a car meeting one at speed where the spine survives. So past
   * `DRIVE.traffic.snapForce` the machine STOPS EXISTING as a vehicle and
   * becomes these: the front end, with the forks and the wheel that were pushed
   * through it, and the back end with everything else. They are much bigger
   * pieces than `machine` debris and are drawn as the two halves of the
   * vehicle's own art, cut where `DriveRemain.cut` says it broke.
   *
   * It is the same trick the body's own `upper`/`lower` pull, and it is here for
   * the same reason: the two ends have entirely different afternoons. The front
   * is punted up the road by the bumper that hit it; the back is left behind and
   * cartwheels.
   */
  | "machine_front"
  | "machine_rear"
  /** Everything below the bumper line. The HEAVY half, and the one that goes
   * UNDER: no lift at all, straight down onto the tarmac in front of the front
   * wheels, where it is caught and dragged. */
  | "lower"
  /**
   * A body the BUMPER was not going fast enough to come through — knocked flat
   * and left lying in the road, whole.
   *
   * It is a piece with a short life and that is the point of it: the wheels
   * behind the bumper find it a moment later, and a wheel takes a body in two
   * whatever the speedometer said (`severUnderWheel`). So a `whole` piece that
   * is still whole is one nothing has driven over yet — or one on a road with
   * the SPLIT switched off, which is the only place it is a lasting state.
   */
  | "whole"
  /** A lump torn off on the way past. Scatters, bounces, and is not caught. */
  | "chunk";

/**
 * A PIECE OF SOMEBODY, OUT ON THE ROAD — where it is, what it is doing, and
 * whether the wheels have been over it yet.
 *
 * WHY THIS IS SIM AND NOT PRESENTATION, when the burst it replaced was neither.
 * A body that comes apart in the air and is gone in a second is a picture, and
 * that is what the road used to draw. What the road does now is not: a half of
 * somebody is CAUGHT under the car and travels with it, is DROPPED, SKIDS,
 * comes to rest on the tarmac, and can be run over — by these wheels, on a
 * later tick, at a place the physics decides. Every one of those is a fact
 * about where a thing is, which is the sim's business and nothing the renderer
 * could be trusted to invent, since the two would then disagree about where the
 * blood goes.
 *
 * WHAT IS STILL THE APP'S: what it is made of. There is no sprite name here, no
 * colour, no blood and no "how wet is it still" — the app keeps that beside its
 * own record, keyed on the id, and asks this list only where things ARE.
 */
export type DriveRemain = {
  /** Stable id — the app keys its per-piece presentation (which gib art it
   * wears, how much blood it still has to leave) off it. */
  id: number;
  /**
   * WHOSE ART THIS PIECE IS CUT OUT OF.
   *
   * For every flesh part it is the body that was hit — the crowd it belonged to
   * and which of that crowd's sprites it was wearing, so a half of somebody is a
   * half of the PERSON rather than of a stand-in.
   *
   * For a `machine` piece it is the VEHICLE instead: `kind` is meaningless and
   * `variant` indexes the FLEET. One pair of fields for one question ("what does
   * this lump look like"), answered against whichever table the part names.
   */
  kind: PedestrianKind;
  variant: number;
  part: RemainPart;
  /**
   * WHERE THE BUMPER CAUGHT THEM, as a fraction of the body's height measured
   * from the top of the sprite — the cut line, and the one number that makes an
   * `upper` and a `lower` two pieces of ONE person rather than two independent
   * lumps. Both halves of a split carry the same value.
   *
   * A fraction rather than pixels because the sim has never been told how tall
   * a person's art is, and should not be.
   */
  cut: number;
  pos: Vec2;
  /** Ground velocity (world px/s). */
  vel: Vec2;
  /** Height off the road (px) and its rate. */
  z: number;
  vz: number;
  /** How far it has turned over (radians) and how fast — a half of somebody
   * thrown by a car cartwheels, and one skidding along the tarmac keeps
   * turning until friction stops it. */
  angle: number;
  spin: number;
  /**
   * MS IT IS STILL CAUGHT ON THE CAR. Above zero the piece is not integrated at
   * all: it is pinned to the wagon at (`dragAlong`, `dragAcross`) and goes
   * wherever the wagon goes, which is the whole of "it drags with the car".
   *
   * It ends two ways and both matter. The clock runs out — friction has worked
   * it free — or the car slows below `DRIVE.gore.dragMinSpeedPx`, because a
   * wagon that has stopped is not dragging anything. Either way it is handed
   * the car's own travel on the way out (`dragSlip`) rather than being dropped
   * dead, so it skids out from under the back of the car instead of appearing
   * there.
   */
  dragMs: number;
  /** Where on the car it is caught: px along the nose from the body's centre
   * (negative is toward the back) and px across it. */
  dragAlong: number;
  dragAcross: number;
  /**
   * THE WHEELS HAVE BEEN OVER IT. Latched — a piece that has been run over is
   * run over, and a second crush of the same lump is the "one contact is one
   * impact" bug the traffic's cooldown exists to stop.
   *
   * It is a STATE, not a deletion: a crushed half is still drawn, lying in the
   * paste the wheel laid under it. The one thing it removes from the picture is
   * a crushed WHOLE body, whose own mark is a whole person pressed into the
   * road — and with the split switched on there is no such thing, because the
   * wheel that crushed it took it in two.
   */
  crushed: boolean;
  /** It has stopped moving for good: no more integration, no more blood. */
  settled: boolean;
  /** The piece's own seed — everything the app rolls about it (which gib art a
   * chunk wears, how it lies when it stops) comes off this rather than off the
   * road's stream, which lays the crowd down and must not be spent on gore. */
  seed: number;
};

/**
 * WHO SOMEBODY OUT HERE IS — which of the two crowds this body belongs to, and
 * therefore which set of art it wears and whether it moves at all.
 *
 * It is deliberately separate from `PedestrianMode` (what they are DOING),
 * because the two answer different questions and a body changes one without
 * changing the other: somebody glued to the tarmac who is struck stops being
 * seated and starts tumbling, and is still one of THE GLUED while they do it.
 */
export type PedestrianKind =
  /** One of the people the welfare did not reach, out on the road because a
   * road is where the cars are. Walks, mills, and lunges at a car it has seen. */
  | "walker"
  /**
   * SOMEBODY WHO WAS ON A VEHICLE A MOMENT AGO — a rider thrown off a moped, or
   * a passenger who has just come through a windscreen.
   *
   * A KIND rather than a mode, because what this type answers is "whose art is
   * this" and theirs is neither a walker's nor one of THE GLUED's: a rider is
   * drawn in a helmet and seated, and THAT is the picture the road has to cut in
   * half. Everything else about one — that they tumble, that they are counted,
   * that the wheels can find them — is exactly a pedestrian's, which is why they
   * are routed through this list rather than given a body type of their own.
   *
   * `variant` indexes the app's `RIDER_SPRITES` for one of these.
   */
  | "rider"
  /**
   * …AND SOMEBODY WHO WAS BEHIND A WINDSCREEN — the person a head-on posts out
   * through the glass.
   *
   * ITS OWN KIND RATHER THAN MORE RIDERS, for exactly the reason `rider` is its
   * own kind: what this answers is "whose art is this". They used to BE riders,
   * drawn out of the two-wheeler table on the argument that somebody who has
   * just left a driving seat looks like somebody sitting — which is true of the
   * posture and false of everything else, and it meant every torso that ever
   * came out of a windscreen was one of two pictures in a crash helmet.
   *
   * `variant` indexes the app's `DRIVER_SPRITES`: five people with no helmets,
   * seatbelts on, and five different heads — which is what the player actually
   * sees, because the cut lands high (`DRIVE.gore.cutBand`) and the top half is
   * mostly head.
   */
  | "driver"
  /**
   * ONE OF THE GLUED — a demonstrator sitting in the carriageway with their
   * hands in the resin, holding the road for the climate.
   *
   * THEY ARE THE ONE THING ON THIS ROAD THAT DOES NOT MOVE, and that is the
   * whole of them mechanically: no wander, no lunge, no stepping back. The
   * crowd is a hazard you can be quick enough for; this is a WALL, laid across
   * every lane at one point in the trip, and a wagon at 120 with a stopping
   * distance measured in hundreds of pixels arrives at it having already
   * decided. Nobody has to be told what happens next.
   */
  | "glued";

/** What somebody on the road is doing. */
export type PedestrianMode =
  /** In one piece and in play: wandering, working their way toward a car they
   * have seen, or — one of THE GLUED — sitting exactly where they sat down. */
  | "afoot"
  /**
   * Hit, and still in one piece — the GORE-OFF outcome. They are knocked off
   * their feet and tumble to the side of the road, where they stay.
   *
   * It is a genuinely different PHYSICAL result rather than the same result
   * drawn differently, which is why the sim carries it: with the gore switched
   * off, nobody comes apart, so a struck body is still a body and has to go
   * somewhere. With it on, the same collision deletes the pedestrian and hands
   * the app a strike to burst (see `DriveStrike`).
   */
  | "tumbling";

/** One person out on the road, and everything about them the sim needs. */
export type DrivePedestrian = {
  /** Stable id — the app keys its per-body presentation off it. */
  id: number;
  pos: Vec2;
  /** Ground velocity (world px/s). */
  vel: Vec2;
  mode: PedestrianMode;
  kind: PedestrianKind;
  /** Which of their own crowd's body sprites this one wears — an index into
   * the WALKERS or into THE GLUED, by `kind`. */
  variant: number;
  /**
   * WHAT THEY HAVE TO SAY, as an index into their crowd's lines, or −1 for the
   * ones saying nothing.
   *
   * Only THE GLUED ever carry one. A blockade where everybody has a bubble over
   * their head is an unreadable wall of text at 16 px, and — worse — it makes
   * twenty people into one placard; a handful of voices in a crowd of twenty is
   * what a demonstration actually looks like from a car.
   */
  bark: number;
  /**
   * The wander seed — a fixed per-body number the idle drift is derived FROM
   * rather than a per-tick draw, so the crowd mills about without spending the
   * rng once a body exists.
   */
  phase: number;
  /** Height off the road (px) and its rate — only ever above zero for a
   * tumbling body mid-flight. */
  z: number;
  vz: number;
  /** True once this body has been counted against the hero's tally. Latched, so
   * a tumbling body rolling back under the wheels is not counted twice. */
  counted: boolean;
  /**
   * THE WHEELS HAVE BEEN OVER THIS ONE. Only ever true of a `tumbling` body —
   * the GORE-OFF outcome, where a struck person is still a person lying in the
   * road and the car can quite easily go over them on the way past.
   *
   * It buys a SOUND rather than a picture, which is why it exists even with the
   * gore switched off: what the player hears when a wheel finds somebody is not
   * gore, it is a wheel finding somebody, and a road that went silent for it
   * would be the one place in the game where a collision made no noise.
   */
  crushed: boolean;
};

/** Another car on the road. */
export type DriveTraffic = {
  id: number;
  pos: Vec2;
  /** Along-road speed (world px/s), SIGNED in world +x like the hero's own. */
  speed: number;
  /**
   * …AND THE SPEED IT WAS DOING BEFORE ANYBODY HIT IT.
   *
   * A struck vehicle is now genuinely punted along the road (`shunt`), which is
   * most of what makes a collision read as having weight — and a car that was
   * punted and left there would carry on at its new speed for the rest of the
   * leg, which is a car that has been permanently converted into a projectile.
   * There is somebody in it: they lift off, or they brake, and either way the
   * thing eases back to the pace it was travelling at. This is that pace.
   *
   * A WRECK NEVER READS IT — nobody is driving a wreck, which is exactly why it
   * coasts to a halt instead.
   */
  cruise: number;
  /** Lateral speed (world px/s) — zero until something shunts it. */
  slew: number;
  /** Which of the traffic sprites it wears — an index into the FLEET
   * (`drive/fleet.ts`), which is also what says what it weighs. */
  variant: number;
  /**
   * HOW BROKEN IT IS, 0 → 1 — the energy this vehicle has personally absorbed,
   * as a fraction of what it takes to finish one off.
   *
   * THE OTHER CARS ARE DESTRUCTIBLE NOW, and this is the whole of it. A shunt
   * used to be a shove with no memory: hit the same van ten times and it was
   * the same van. What the player is owed for ten hits is a van that LOOKS like
   * it has been hit ten times, so the wear drives a damage rung
   * (`DRIVE.trafficRungs`) the renderer swaps art for, and past 1 the thing is
   * finished — dead in the road, which is the last rung and the one that
   * changes the road rather than the picture.
   */
  wear: number;
  /** …and the rung that wear has reached, latched so it only ever climbs. The
   * renderer reads it; the engine raises an event when it moves. */
  rung: number;
  /**
   * IT IS FINISHED — engine dead, rolling to a stop, and about to be a
   * stationary obstacle in a live lane.
   *
   * Worth its own flag rather than `wear >= 1` because it is a LATCH with
   * consequences: a wrecked car stops steering, stops being shunted like a live
   * one, and becomes the most dangerous thing on the road, which is a state
   * rather than a threshold.
   */
  wrecked: boolean;
  /**
   * THE PERSON IS STILL ON IT. Only ever meaningful for an `open` vehicle, whose
   * def names which rider they are — and the moment this goes false the machine
   * is lighter, riderless, and usually on its side.
   */
  rider: boolean;
  /**
   * NOBODY IS AT THE WHEEL — this vehicle was PARKED until somebody hit it.
   *
   * A parked car used to be furniture (`DriveProp`) for its whole life, and
   * being furniture is why hitting one did nothing: props have no velocity, no
   * crush, no spin and no roll, so the collision could only shove it sideways
   * by a fixed number of pixels and leave. The moment one is struck it stops
   * being furniture and becomes one of these (`unparkCar`), which is the
   * honest reading of what the kerb already said out loud — a parked car is one
   * of the FLEET with the handbrake on — and it inherits the entire breaking
   * model for free rather than growing a second copy of it.
   *
   * What the flag itself carries is the two things that are still true of it
   * afterwards: its LIGHTS are off, because nobody is sitting in it, and it
   * never gets back on a cruising speed, because nobody is driving it. Both
   * would otherwise be wrong the instant it joined the traffic list.
   */
  driverless: boolean;
  /** How many people are still INSIDE — decremented as they leave through the
   * screen. Starts at the def's `occupants`. */
  occupants: number;
  /**
   * IT HAS GONE DOWN. An `open` vehicle only: hit by a car, a bike does not slew
   * out of the lane and carry on — it falls over, slides, and comes to rest.
   *
   * Everything below is meaningless until this is true, which is why a car
   * carries the fields and never uses them: one shape for one list, rather than
   * a second list to iterate, sort, replicate and forget about.
   */
  downed: boolean;
  /** Height off the road (px) and its rate — a machine kicked into the air. */
  z: number;
  vz: number;
  /** How far it has turned over (radians) and how fast. */
  angle: number;
  spin: number;
  /**
   * THE WEAVE'S PHASE — a fixed per-vehicle number the footway drift is derived
   * FROM rather than a per-tick draw, exactly as the crowd's wander is.
   *
   * Only a pavement rider reads it. It is derived from the spawn mark rather
   * than rolled, so adding a moped to the fleet can never move a body, a car or
   * a lamp post that the seed laid down after it.
   */
  phase: number;
  /** Which way its own art faces, so an oncoming car is drawn nose-first. */
  faceLeft: boolean;
  /**
   * WHICH OF ITS OWN LAMPS THE ROAD HAS TAKEN OUT — the nose's, the tail's, or
   * by now both.
   *
   * They are the END that was struck rather than a share of some damage bar,
   * because that is what a player can actually see happening: he clips a car's
   * back corner and its brake lights die, he shunts one out of a junction nose
   * first and it drives off down the road blind. A car remembers each end
   * separately for the same reason it remembers them at all.
   *
   * NOSE and TAIL are the BODY's ends, not the screen's — an oncoming car's
   * nose is on its left (`faceLeft`), so which one a hit puts out depends on
   * which way the thing was pointing.
   */
  noseOut: boolean;
  tailOut: boolean;
  /**
   * Ms of immunity left after being hit.
   *
   * ONE CONTACT IS ONE IMPACT, and without this it is not. Two car bodies that
   * touch stay touching for as long as it takes them to separate — dozens of
   * ticks — and the collision fired on every one of them, so a single nudge
   * against a slow van booked twelve thousand shunts and scrubbed the hero to a
   * standstill against a car he had already knocked out of the way. The
   * separation below does most of the work; this closes the rest.
   */
  hitCooldownMs: number;
  /**
   * HOW FAR EACH END HAS FOLDED IN, in world px of crush depth — the vehicle's
   * own structural deformation, kept per END because that is where a collision
   * happens.
   *
   * IT IS NOT THE DAMAGE RUNG AND IT IS NOT A DUPLICATE OF IT. `wear` is the
   * energy budget and `rung` is which of the three derived pictures the art has
   * climbed to; this is a LENGTH, solved from the same energy against the
   * vehicle's own crumple stiffness (`crush.ts`), and it is what lets the
   * renderer squash the struck half of the body by the number of pixels the
   * physics says it lost. A car that has been rear-ended is short at the back
   * and straight at the front, which three dent rungs painted over the whole
   * silhouette can never say.
   *
   * NOSE and TAIL are the BODY's ends, not the screen's — which one a blow
   * folds depends on which way the thing is pointing (`faceLeft`), exactly as
   * its lamps do.
   */
  crushNose: number;
  crushTail: number;
  /**
   * ITS GLASS HAS GONE. Latched, because glass does not come back and because
   * the renderer draws an empty aperture rather than a window from here on.
   */
  glassOut: boolean;
  /**
   * …AND WHAT IS ON THE INSIDE OF IT, 0 → 1.
   *
   * The people in a car that is folded up around them do not all come out
   * through the screen: past a point the car is simply not open, and what the
   * player sees of them is what is on the windows. It is raised where somebody
   * DIED IN THEIR SEAT (`crush.ts`), never merely where a car was hit hard, so
   * the sight is a fact about the collision rather than decoration on a rung —
   * and it is gated on the run's own gore switch at the point of DECISION like
   * everything else that is not safe for kids.
   */
  gore: number;
  /**
   * IT IS UPSIDE DOWN, OR ON ITS ROOF, OR STILL GOING OVER.
   *
   * `downed` says a thing has stopped being a vehicle and is now an object
   * sliding down the tarmac, and it is true of a rolled CAR for exactly the
   * same reasons it is true of a dropped moped — same ballistics, same drag,
   * same cartwheel. This is the one extra fact a car needs and a moped does
   * not: how many times it has been over, which is what decides whether it
   * comes to rest on its wheels or on its roof.
   */
  rolls: number;
};

/** What a piece of kerbside furniture is. */
export type DrivePropKind =
  /** Somebody's car, left at the near kerb with the handbrake on. */
  | "parked_car"
  /** A street light — the one thing on this road that BREAKS rather than
   * moves. */
  | "lamp_post";

/**
 * One piece of street furniture, as the sim holds it.
 *
 * It is a LIVE OBJECT rather than a derived drawing, and that is the whole
 * change: where it stands is still derived from its slot (`street.ts`, a hash
 * of the position — no rng draw, the same street both ways), but once the road
 * has unrolled far enough to reach it, it exists, it can be hit, and what
 * happens to it afterwards is physics rather than a redraw.
 */
export type DriveProp = {
  id: number;
  kind: DrivePropKind;
  pos: Vec2;
  /** Which sprite it wears — a parked car's model. Unread for a lamp post,
   * which comes in exactly one flavour. */
  variant: number;
  /**
   * THE POST HAS COME OFF ITS BASE. Only ever true of a `lamp_post`: a car does
   * not stop being a car when it is hit, but a street light emphatically stops
   * being a street light, and everything after that moment — the flight, the
   * cartwheel, the skid, the fact it can never be hit again — hangs off this
   * one flag.
   */
  felled: boolean;
  /**
   * WHERE IT SHEARED — the foot's own place, kept after the rest of the column
   * has left it. A slip-base light does not vanish off the pavement when it is
   * hit: it snaps low and leaves its stump bolted to the concrete, and the
   * renderer needs somewhere to put that. Undefined until it is felled, and
   * never moves after.
   */
  stub?: Vec2;
  /** Ground velocity while it is on its way somewhere (world px/s). */
  vel: Vec2;
  /** Height off the road (px) and its rate. */
  z: number;
  vz: number;
  /** How far over it has turned (radians), and how fast. A standing post is
   * dead upright at 0; a felled one cartwheels. */
  angle: number;
  spin: number;
  /** Ms of immunity left after being hit — the same "one contact is one
   * impact" latch the traffic carries, and needed for the same reason: two
   * bodies that touch keep touching for dozens of ticks. */
  hitCooldownMs: number;
};

/**
 * A BODY, AT THE INSTANT IT WAS HIT — everything the app needs to burst it,
 * and nothing about how.
 *
 * The engine does not know what gore is. It knows a body was struck at a
 * position, with a velocity, carrying so many joules, and it says so; whether
 * that becomes a cloud of gibs, a red mist, or a man rolling into the gutter is
 * settled by the gore gate on the app's side of the fence
 * (pwa/src/game/game-screen/gore-gate.ts), which is where every other gore
 * decision in the game is already made.
 */
export type DriveStrike = {
  /** The struck body's id, so a strike can be matched to the body it came off
   * (which is already gone from `pedestrians` when the gore is on). */
  id: number;
  pos: Vec2;
  /** How the pieces leave — the impulse the body actually took. */
  vel: Vec2;
  /** Upward kick (px/s) — the pop over the bonnet. */
  vz: number;
  /** The collision's absorbed energy (joules) — how hard this was, for the
   * app to scale the burst, the sound and the camera by. */
  joules: number;
  /** Which crowd they belonged to and which of its bodies they were wearing, so
   * the spray comes off the person who was actually hit. */
  kind: PedestrianKind;
  variant: number;
  /**
   * WHICH PANEL WORE IT — the same `panelAt(hit.along)` the damage is booked
   * against, carried out so the app does not have to guess where on the car a
   * body actually landed.
   *
   * It is the one number that makes the wagon get BLOODY where it was hit
   * rather than uniformly: hit things square and it is the bumper every time,
   * sideswipe the crowd and it is the doors — which is exactly the record the
   * PANEL DAMAGE already keeps, and the two now agree because they are the same
   * number rather than two guesses at it.
   */
  panel: CarPanelId;
  /**
   * THEY CAME IN TWO. False for a hit that merely knocked somebody down and
   * dragged them, true for one the bumper went through — which is the same
   * question `DRIVE.gore.splitJoules` answers for the sim, asked once and
   * carried so the app never has to re-derive it and disagree.
   */
  split: boolean;
};

/** Something worth a sound or a flash, drained by the app each tick — the
 * drive's own little `state.events`, and read exactly the same way. */
export type DriveEvent =
  /** A person went under the car. */
  | { type: "pedestrianHit"; pos: Vec2; joules: number }
  /**
   * …and somebody came apart in two: the bumper went THROUGH them at speed, or
   * a WHEEL went over one already lying in the road, which takes a body in two
   * at any speed at all.
   *
   * Its own event rather than a flag on the one above, because it is its own
   * noise — the wet tear a thud does not contain — and because the two are heard
   * together on the tick a fast hit lands, which is the point of them. The two
   * causes share it deliberately: what the player is being told is that a person
   * is now in two pieces, and the sound of that does not depend on which part of
   * the car did it.
   */
  | { type: "bodySplit"; pos: Vec2; joules: number }
  /** Something is caught under the car and has started to travel with it. */
  | { type: "bodyCaught"; pos: Vec2; joules: number }
  /** A wheel has gone over a piece of somebody lying in the road. */
  | { type: "bodyCrushed"; pos: Vec2; joules: number }
  /** The car has clouted something dead and steel already lying on the tarmac —
   * a felled street light, kicked further down the road. */
  | { type: "debrisStruck"; pos: Vec2; joules: number }
  /** Traded paint with another car — moving, or parked at the kerb. */
  | { type: "trafficHit"; pos: Vec2; joules: number }
  /** …and it climbed a damage rung for it: a panel folded, a light went, glass
   * left the frame. Its own beat because a car visibly deforming is a different
   * noise from the paint trade that caused it, and one the player is meant to
   * learn to want. */
  | { type: "trafficBent"; pos: Vec2; joules: number }
  /** A vehicle has been finished — engine dead, rolling to a halt, and about to
   * be a stationary obstacle in a live lane. */
  | { type: "trafficWrecked"; pos: Vec2; joules: number }
  /** A two-wheeler has gone over: the machine is down, sliding, and shedding
   * itself down the road. */
  | { type: "machineDown"; pos: Vec2; joules: number }
  /** …and one has come apart in the middle, which is a different noise and a
   * different picture: the thing has stopped being a vehicle. */
  | { type: "machineSnapped"; pos: Vec2; joules: number }
  /**
   * A VEHICLE HAS GONE OVER — off its wheels, into the air, and turning.
   *
   * The biggest single thing that happens on this road, and its own beat
   * because it is the one collision outcome the player cannot mistake for
   * another: a shunted car is still a car, a wrecked one is a car that has
   * stopped, and a rolling one is two tonnes of somebody's estate coming down
   * the carriageway upside down.
   */
  | { type: "trafficRolled"; pos: Vec2; joules: number }
  /**
   * A CAR'S GLASS HAS LEFT IT, with nobody through it.
   *
   * Distinct from `windscreenOut`, which is the same shower WITH a body in it:
   * this is the one that fires when the blow was hard enough to blow the
   * windows out and the people inside stayed where they were — which, past a
   * point, is what happens, because the car is no longer open.
   */
  | { type: "glassSmashed"; pos: Vec2; joules: number }
  /**
   * SOMEBODY DIED IN THEIR SEAT. Not a body in the air — the opposite of one:
   * the car folded up on them and what the road gets to see is the windows.
   */
  | { type: "occupantKilled"; pos: Vec2; joules: number }
  /**
   * SOMEBODY HAS LEFT A VEHICLE THEY WERE ON OR IN — a rider off a moped, or a
   * passenger through a windscreen.
   *
   * ONE EVENT FOR BOTH, and deliberately: what the player hears is a body
   * arriving in the air out of a machine, and whether it came off a saddle or
   * through a screen is a difference the PICTURE carries, not the noise. The
   * glass that went with it is `windscreenOut`, which is its own sound and only
   * fires for the ones who were behind one.
   */
  | { type: "occupantThrown"; pos: Vec2; joules: number }
  /** …and the screen they came through. */
  | { type: "windscreenOut"; pos: Vec2; joules: number }
  /**
   * …AND THE BLOOD THAT LEAVES WITH THEM — a head-on, and only a head-on.
   *
   * ITS OWN EVENT RATHER THAN A FLAG ON THE ONE ABOVE, for two reasons that
   * both matter. It is GATED: it is raised inside the same test that paints the
   * car's own glass, so a run with the dismemberment switches off still posts
   * the driver through the screen and simply does not spray — the house rule
   * that a gate is answered where the thing is DECIDED, never at the draw. And
   * it is SPECIFIC: an occupant leaving a car that was merely folded is a
   * different sight from one leaving a car that was met nose to nose at the sum
   * of two speeds, and only the second one empties itself over the road.
   */
  | { type: "windscreenGore"; pos: Vec2; joules: number }
  /** A street light has left its base and is on its way down the road. */
  | { type: "lampFelled"; pos: Vec2; joules: number }
  /** A panel climbed a damage rung. */
  | { type: "panelBent"; pos: Vec2 }
  /** A part worked free, hung, or tore off entirely. */
  | { type: "partShed"; pos: Vec2 }
  /** The engine has died — the car is rolling to a halt. */
  | { type: "breakdown"; pos: Vec2 }
  /** The hero's inner monologue about the people he is about to meet. */
  | { type: "monologue" }
  /** The far end of the course. */
  | { type: "arrived" };

/** What a drive is built from — everything the app settles before the wheel is
 * handed over. */
export type DriveParams = {
  /** The seed the whole road is derived from. A RESTART reuses it, so the crash
   * that killed you is the same road you get to try again — which is the only
   * version of "start over" that teaches anything. */
  seed: number;
  /** Which leg this is. */
  direction: DriveDirection;
  /**
   * THE RUNG THE ROAD IS DRIVEN ON — the same difficulty the run around it is
   * played at, and the only thing that changes about the minigame between one
   * and the next.
   *
   * It is a PARAMETER rather than a lookup for the same reason the seed and the
   * gore gate are: a drive is settled whole before its first tick and then runs
   * on its own, so nothing mid-road has to ask the app which run it came from —
   * and a restart after a breakdown rebuilds the same road on the same rung.
   * What the rung actually turns is the mass of everything on the tarmac
   * (`impactMasses`), so a body costs a MEDIUM driver a fifth of his speed and
   * a JESUS driver nearly half of it.
   */
  difficulty: Difficulty;
  /** Where the car ends up: the level the drive hands on to when it arrives. */
  to: string;
  /**
   * HOW LONG THE LEG IS (world px), when it is not the whole road. Omitted for
   * every drive a player takes — the course is `DRIVE.coursePx` and always has
   * been.
   *
   * It exists for the ATTRACT LOOP. A minute of tarmac is the right length for
   * a trip to work and much too long for a title-screen demo that is trying to
   * show somebody the whole game in a couple of them, so the demo drives the
   * same road with the finish line brought forward (`DRIVE.attractCoursePx`)
   * rather than a different, shorter, quieter road nobody would ever play. Same
   * crowd, same traffic, same rung — just the first stretch of it.
   *
   * A PARAMETER rather than a knob turned mid-drive, like everything else about
   * a road: it is settled whole before the first tick, so the spawner lays the
   * crowd down against the same finish the arrival check reads.
   */
  coursePx?: number;
  /**
   * WHETHER BODIES COME APART. Decided by the app's gore gate at creation and
   * carried as a plain boolean, because the engine has no business reading a
   * settings screen — and because the answer must be fixed for the whole drive
   * rather than asked per collision, or a player toggling the switch mid-run
   * would leave half the road gibbed and half of it lying in the gutter.
   *
   * It is the GIB half of the gore page's two dismemberment switches: the
   * chunks torn off on the way past, and the shower of what was inside.
   */
  gib: boolean;
  /**
   * …AND WHETHER A FAST ENOUGH HIT TAKES THEM IN TWO — the CLEAVE half, asked
   * of the same page and carried the same way.
   *
   * Two switches rather than one because they are two sights, exactly as they
   * are inside a run: a bumper going through somebody is a body cut in two, and
   * a player who turned CLEAVES off did not mean "only when a sword does it".
   * Either one on is enough for a body to come apart at all; with both off
   * nobody does, and the road falls back to the tumble
   * (see `PedestrianMode`).
   */
  split: boolean;
};

/** The whole of a drive. */
export type DriveState = {
  /** The parameters it was built from — kept so a restart can rebuild it
   * exactly (`restartDrive`). */
  params: DriveParams;
  /** The road's own seeded stream. Never `state.rng()`: a drive is not a run
   * and must never be able to shift one's rolls. */
  rng: Rng;
  /** The wagon — the same object the garage parks, driven properly for once. */
  car: CarVehicle;
  /** How far along the course the car has come (world px, always positive
   * however the leg runs). The finish is `DRIVE.coursePx`. */
  distance: number;
  /** Wall-clock ms since the wheel was handed over. */
  ms: number;
  /** Everybody currently on the road, upright or in the gutter. */
  pedestrians: DrivePedestrian[];
  /** …and what is left of the ones who are neither. Empty on a road driven
   * with the gore switched off, where a struck body stays a body. */
  remains: DriveRemain[];
  /** Everything else with wheels. */
  traffic: DriveTraffic[];
  /** The kerbside furniture the road has unrolled so far — the lamp posts and
   * the cars somebody left out. */
  props: DriveProp[];
  /** Wheels the car has thrown, bouncing down the road behind it. Reuses the
   * run's own debris physics (`WHEEL_DEBRIS`, src/game/vehicles.ts). */
  wheelDebris: WheelDebris[];
  /** Bodies struck THIS tick, for the app to burst. Drained every tick. */
  strikes: DriveStrike[];
  /** Sounds and flashes owed to the app. Drained every tick. */
  events: DriveEvent[];
  /** How many people the car has hit. The number the hero's arrival line reads,
   * and the only score the minigame keeps. */
  bodies: number;
  /** How many other cars have been shunted — moving and parked alike. */
  shunts: number;
  /** How many street lights have been taken off their bases. */
  posts: number;
  /** The fastest the car has gone this drive (px/s) — the HUD's own bragging
   * rights, and what "the minigame will award speed" is measured on. */
  topSpeed: number;
  /**
   * Energy each panel has personally absorbed, as a fraction of
   * `DRIVE.impact.wearJoules` — the running total the panel damage rungs are
   * read off. Kept beside the car rather than on it because it is the DRIVE's
   * bookkeeping: a `CarVehicle` carries the rung it has reached, which is what
   * the renderer and every save need, and nothing else has any use for the
   * joules that got it there.
   */
  panelJoules: Record<CarPanelId, number>;
  /** Where the drive has got to. */
  outcome: DriveOutcome;
  /** Ms spent in a terminal outcome — the wreck's hold, or the arrival beat. */
  outcomeMs: number;
  /** How far along the next pedestrian and the next car are due (world px along
   * the course) — the spawner's running marks, so the crowd is laid down once
   * as the road unrolls rather than re-rolled every tick. */
  nextPedestrianAt: number;
  /**
   * …and the same for traffic, ONE MARK PER LANE — `DRIVE.laneCount` of them,
   * indexed by lane.
   *
   * A single mark with the lane rolled onto it cannot keep four lanes served:
   * the lane is a fresh draw each time, so the road comes out clumped and the
   * player is shown an empty carriageway. A mark per lane is what makes "a
   * vehicle in every lane on every screen" something the spawner can promise
   * (`spawnLane`). Set them together through `haltTraffic` / `resetTrafficMarks`
   * rather than by hand.
   */
  nextTrafficAt: number[];
  /** …and one more for the footway, which is not a lane and keeps its own rate
   * (`DRIVE.pavementPerKPx`). */
  nextPavementAt: number;
  /**
   * WHO STILL HAS SOMETHING TO THINK — the crowd's thoughts, shuffled once at
   * the top of the leg and dealt out as the road unrolls (see `CROWD_THOUGHTS`
   * and `dealThought`). A dealt one is GONE: the whole catalogue plays across a
   * trip, each line exactly once, which is what keeps a road of two hundred
   * people from repeating the same six sad little sentences at the windscreen.
   */
  thoughtDeck: number[];
  /** How far along the next of them is due (world px along the course) — the
   * thoughts have their own spacing, far wider than the crowd's own, because a
   * line over every head is a wall of text and a line every so often is a
   * person. */
  nextThoughtAt: number;
  /** The next kerb slot the street has not put its furniture down at — an
   * INDEX rather than a distance, because the furniture stands on a fixed
   * pitch in world x (so the way home passes the same posts) and it walks in
   * whichever direction this leg runs. */
  nextPropSlot: number;
  /** Latched once the hero has had his think about the people ahead. */
  monologueDone: boolean;
  /** …and once THE GLUED have been laid down. A blockade that could be laid
   * twice is a wall the player drives into and then into again. */
  blockadeDone: boolean;
  /** The id counter for everything the road mints. */
  nextId: number;
};

/**
 * What the player is asking of the car this tick.
 *
 * It is the RUN'S OWN `CarControl`, deliberately and by name (see `carControl`
 * in src/game/vehicles.ts): the PEDAL is the push read ALONG the nose, so
 * dragging the pad the way the car is pointing is the accelerator on both legs
 * of the trip — right on the way out, LEFT on the way home — and the other way
 * is the brake. The WHEEL is the push across it. Nothing held holds the speed
 * and straightens up.
 *
 * The drive and the garage share the type because they share the CONTROL: a
 * player who has learnt to pull out of his own bay has already learnt the
 * minigame, which is most of why the minigame can afford to be a minute long
 * with no tutorial in it.
 */
export type DriveInput = CarControl;

/** Nobody touching anything — the drive's `IDLE_INPUT`. */
export const IDLE_DRIVE_INPUT: DriveInput = Object.freeze({
  pedal: 0,
  wheel: 0,
});
