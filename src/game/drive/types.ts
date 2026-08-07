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
  /** Everything below the bumper line. The HEAVY half, and the one that goes
   * UNDER: no lift at all, straight down onto the tarmac in front of the front
   * wheels, where it is caught and dragged. */
  | "lower"
  /** A body that was not going fast enough to come in two — knocked flat,
   * caught under the car whole, and run over as one piece. */
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
  /** Which crowd, and which of its bodies, it came off — so the halves are cut
   * out of the art of the person who was actually hit rather than out of a
   * stand-in. */
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
  /** THE WHEELS HAVE BEEN OVER IT. Latched — a piece that has been run over is
   * run over, and a second crush of the same lump is the "one contact is one
   * impact" bug the traffic's cooldown exists to stop. */
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
  /** Lateral speed (world px/s) — zero until something shunts it. */
  slew: number;
  /** Which of the traffic sprites it wears. */
  variant: number;
  /** Which way its own art faces, so an oncoming car is drawn nose-first. */
  faceLeft: boolean;
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
  /** …and the bumper went THROUGH them: a body taken in two at speed. Its own
   * event rather than a flag on the one above, because it is its own noise —
   * the wet tear a thud does not contain — and because the two are heard
   * together on the tick a fast hit lands, which is the point of them. */
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
  /** …and the same for traffic. */
  nextTrafficAt: number;
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
