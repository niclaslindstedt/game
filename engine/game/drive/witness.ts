// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// SOMEBODY SAW THAT — the one thing on this road that reacts to what the hero
// is doing, and the only voice out here that is about HIM.
//
// WHY THE ROAD NEEDED A THIRD VOICE. It had two and neither of them could look
// at a collision. A thought (`CROWD_THOUGHTS`) has never heard of the car, by
// design — that is the whole beat, and giving one of them an opinion about the
// bumper would undo it. THE GLUED shout at a driver, but they are a set piece:
// laid down before the trip starts, saying what they came to say, whatever
// happens. So a man could put a woman over the roof of a hatchback in front of
// two hundred people and the road would carry on thinking about the rent — and
// what that picture said was "nobody out here is a person", when the thing
// actually meant is "he does not notice". A joke about a man who does not
// notice needs somebody NOTICING.
//
// WHAT IT IS NOT. It is not a punishment, a score, a heat meter or a chase: the
// wagon is never told, nothing is unlocked, and the hero says nothing back on
// this leg or on the way home. A person on the pavement shouts at the road for
// two seconds and the road is gone. That is the whole feature, and keeping it
// that small is what stops it becoming an argument the minigame is not making.
//
// THREE RULES HOLD IT AND EACH ONE IS LOAD-BEARING:
//
//   IT NAMES A SCENE, NEVER A LINE. The engine says WHAT happened
//   (`WitnessScene`) and the app says what a bystander shouts about it. Because
//   a scene is a NAME rather than an index into a list, the app's table is a
//   `Record<WitnessScene, …>` and the compiler refuses a case nobody wrote for
//   — which is strictly better than the count-and-list pair the crowd's two
//   older voices are held together by, where a short list silently stops using
//   its tail.
//
//   IT SPENDS NOTHING OFF `state.rng`. Which of a scene's lines is shouted, and
//   whether a body scene becomes `fleeing`, are HASHED off the incident. The
//   road's bodies, their variants and their wander phases all come off the
//   seeded stream in a fixed order, so a draw spent on a WORD would lay a
//   different road for the same seed and break a restart after a breakdown —
//   the same reason the crossings, the thought deck and the blockade's seating
//   are hashed.
//
//   IT ONLY EVER PICKS SOMEBODY THE PICTURE CAN DRAW. The camera shows about
//   308 world px past the bumper and the app's floating text gives up at 260
//   (`PLACARD_READ_PX`), so a witness further out than `DRIVE.witness.reachPx`
//   is a line that fades up already clipped off the right edge. Picking one is
//   worse than picking nobody: the incident passes in silence and the reaction
//   is spent on a shout nobody ever saw.

import { DRIVE } from "./config.ts";
import type {
  DriveEvent,
  DrivePedestrian,
  DriveState,
  WitnessScene,
} from "./types.ts";

/**
 * A stable 0→1 off two whole numbers — the same hash the crowd's crossings and
 * its thought deck are dealt with, and here for the same reason: the words are
 * PRESENTATION and must not move the seeded stream.
 */
function hash(a: number, b: number): number {
  let h = Math.imul(
    (Math.round(a) ^ 0x9e3779b9) + Math.imul(b | 0, 0x27d4eb2f),
    0x85ebca6b,
  );
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * WHICH WALKERS ARE WORTH NAMING — the handful of the eighteen a bystander
 * would describe rather than just point at.
 *
 * INDEXES INTO `CROWD_MASS_MULTS` / `CROWD_SPRITES` (crowd.ts, and the app's
 * sprite table in that same order), so what is shouted and what the player is
 * looking at are one thing. Everything not in here is `person`, which is most
 * of the road on purpose: a crowd where every single body has a label is a
 * crowd of labels.
 *
 * THE PRAM (variant 7) IS DELIBERATELY ABSENT. See `WitnessScene`.
 */
const NAMED_WALKERS: Readonly<Record<number, WitnessScene>> = {
  0: "elder", // an old man, and not much of one
  1: "woman", // an old woman
  3: "woman", // a young woman
  8: "dog", // somebody walking a dog
  9: "elder", // crutches
  10: "elder", // a walking frame
  16: "cyclist", // a cyclist, and the bike under them
  17: "wheelchair", // a wheelchair
};

/**
 * HOW LOUD EACH SCENE IS — which one wins when a single tick raises several.
 *
 * ONE COLLISION IS ROUTINELY FOUR EVENTS. A body met at the top end raises
 * `pedestrianHit`, then `bodySplit`, then `bodyCaught` as what is left goes
 * under the floorpan; a car met square raises `trafficHit`, `glassSmashed`,
 * `trafficWrecked`, `trafficRolled` and an `occupantThrown` or two. A bystander
 * shouts about ONE of those, and it is not the first one in the list — it is
 * the worst thing they can see. So the tick's events are ranked rather than
 * drained in order, which is also why this is a table and not a chain of `if`s:
 * a new event kind is a row, and the ordering stays readable as an ordering.
 *
 * `fleeing` is not in here. It is not a thing that happened — it is a thing the
 * DRIVER is doing — so it is chosen after the scene, on top of a body scene
 * (see `stepWitness`).
 */
const LOUDNESS: Readonly<Record<WitnessScene, number>> = {
  torn: 100,
  glued: 95,
  wheelchair: 92,
  elder: 90,
  dog: 88,
  cyclist: 86,
  woman: 84,
  person: 80,
  // …and everything that happened to a machine rather than to a person. It
  // ranks BELOW every body: a bystander watching somebody go under a bumper
  // does not remark on the headlight that broke doing it.
  //
  // THE FOUR AT THE TOP OF THIS HALF ARE THE ONES THAT ARRIVE AS ONE MOMENT.
  // A tank going up raises `trafficExploded`, a `trafficFire` on whatever it
  // set alight, a `trafficHit` or two off the shove and a string of `lampBlown`
  // as the front passes — all in the same second, and a bystander shouts about
  // the bang rather than about the lamp. So: the person who came out of it,
  // then the blast, then the wave it threw, then what is burning, and only then
  // the collision that started it.
  thrown: 70,
  blast: 68,
  shockwave: 67,
  fire: 66,
  headOn: 64,
  rolled: 62,
  heavy: 58,
  bike: 54,
  car: 50,
  lamp: 40,
  fleeing: 0,
};

/** Is this scene about a PERSON — the only kind `fleeing` may replace, because
 * "he is not stopping" is a remark about a hit-and-run rather than about a
 * kerbed street light. */
function aboutABody(scene: WitnessScene): boolean {
  return LOUDNESS[scene] >= LOUDNESS.person;
}

/**
 * WHAT ONE EVENT LOOKS LIKE FROM THE PAVEMENT, or null for the great many that
 * look like nothing at all.
 *
 * The silent ones are silent on purpose rather than by omission: a panel
 * bending, a part working free, a rung climbing on somebody else's wing and the
 * hero's own breakdown are all things happening to a CAR's paperwork, and
 * nobody standing on a kerb shouts about paperwork. What is left is the list
 * below, which is everything a person across the road could actually point at.
 */
function sceneOf(event: DriveEvent): WitnessScene | null {
  switch (event.type) {
    case "pedestrianHit":
      if (event.kind === "glued") return "glued";
      // A rider thrown off a moped, and somebody who came through a windscreen
      // a moment ago, are both already-airborne bodies being hit AGAIN. The
      // first still has their bike; the second is just a person.
      if (event.kind === "rider") return "cyclist";
      if (event.kind === "driver") return "person";
      return NAMED_WALKERS[event.variant] ?? "person";
    case "bodySplit":
    case "bodyCaught":
    case "bodyCrushed":
      return "torn";
    case "trafficHit":
      // NOSE TO NOSE FIRST, whatever was in it. A head-on is the SHAPE of the
      // crash and it is the thing a bystander names; that it happened to be a
      // bus is the next sentence, and there is only ever one sentence.
      if (event.headOn) return "headOn";
      // …otherwise WHAT it was, which is the whole reason that field is on the
      // event: a bus going over and a hatchback being clipped are not the same
      // sight.
      return event.class === "heavy"
        ? "heavy"
        : event.class === "open"
          ? "bike"
          : "car";
    case "machineDown":
    case "machineSnapped":
      return "bike";
    case "trafficRolled":
      return "rolled";
    case "trafficFire":
      return "fire";
    case "trafficExploded":
      // THE BIG ONE IS A DIFFERENT SIGHT FROM THE ORDINARY ONE, and the road
      // already knows which it is: `big` is the tank that throws a pressure ring
      // across the whole frame with the boom arriving behind it, where the
      // ordinary one is a fireball where a car used to be. So the rare tenth
      // gets the lines about being FELT and the rest get the lines about being
      // watched — which is exactly the difference the flag was minted for.
      return event.big ? "shockwave" : "blast";
    // …AND THE STREET LIGHTING GOING OUT AS THAT FRONT PASSES. The one
    // consequence on this road that reaches the crowd AFTER the thing that
    // caused it — the lamps blow over the wave's own 1.1 seconds
    // (`DRIVE.wreckage.shockwave`), so this is the line that lands when the
    // blast's own reaction was blocked by the gap or had nobody near enough to
    // see it.
    case "lampBlown":
      return "shockwave";
    case "occupantThrown":
    case "windscreenOut":
      return "thrown";
    case "trafficWrecked":
      return "car";
    case "lampFelled":
      return "lamp";
    default:
      return null;
  }
}

/** Could this body have turned and watched — is it a person, still on its feet,
 * and near enough to the incident to have seen it? */
function couldSee(ped: DrivePedestrian, atX: number, atY: number): boolean {
  if (ped.mode !== "afoot") return false;
  return Math.hypot(ped.pos.x - atX, ped.pos.y - atY) <= DRIVE.witness.sawPx;
}

/**
 * ONE TICK OF THE ROAD WATCHING ITSELF — retire a shout that is done, and raise
 * a new one for the loudest thing that happened this tick.
 *
 * CALLED AFTER BOTH COLLISION PASSES AND AFTER THE WHEELS, because that is when
 * `drive.events` is complete: a body found by an axle (`crushRemains`) is the
 * loudest scene on this road and it is raised last of all.
 *
 * NOT CALLED ON THE APPROACH, and it is not an omission: the crowd starts at
 * the town's gate (`spawnCrowd`), so out on the outskirts there is nobody to do
 * the seeing — and the wagon is being HELD out there anyway, so what a bystander
 * would be shouting about is a collision the player had no pedal to avoid.
 */
export function stepWitness(drive: DriveState): void {
  // ── IS THE OLD ONE DONE ───────────────────────────────────────────────────
  // Three ways for a shout to end, and only one of them is the clock. The
  // speaker is passed (the car is doing 900 px/s and the reading window is 250
  // of them), or the speaker has stopped being somebody who is shouting — hit,
  // and now tumbling down the road, which is the one case where leaving the
  // line up would be the game making a remark about what just happened.
  const live = drive.witness;
  if (live) {
    const held = drive.ms < live.untilMs && stillShouting(drive, live.ped);
    if (!held) drive.witness = null;
  }

  // ── AND IS THERE A NEW ONE ────────────────────────────────────────────────
  if (drive.ms < drive.nextWitnessMs) return;

  let loudest: DriveEvent | null = null;
  let scene: WitnessScene | null = null;
  for (const event of drive.events) {
    const at = sceneOf(event);
    if (!at) continue;
    if (scene && LOUDNESS[at] <= LOUDNESS[scene]) continue;
    scene = at;
    loudest = event;
  }
  if (!scene || !loudest) return;
  // Only the beats that HAPPEN somewhere can be witnessed, which is every one
  // `sceneOf` answers for — the placeless beats (`monologue`, `arrived`) are
  // all silent up there. Belt and braces, because a `pos`-less event would put
  // the shout at the origin.
  if (!("pos" in loudest)) return;
  const { x, y } = loudest.pos;

  const speaker = pickWitness(drive, x, y);
  if (!speaker) return;

  const { fleeingShare, holdMs, gapMs } = DRIVE.witness;
  // …AND WHETHER THIS ONE IS ABOUT HIM RATHER THAN ABOUT THE BLOW. Only over a
  // body, only once the crowd has watched him do it before, and only a third of
  // the time — see `DRIVE.witness.fleeingShare`.
  const roll = hash(x * 8 + y, speaker.id * 31 + drive.bodies);
  const fleeing =
    aboutABody(scene) &&
    drive.bodies >= 2 &&
    hash(speaker.id, Math.round(drive.ms)) < fleeingShare;

  drive.witness = {
    ped: speaker.id,
    scene: fleeing ? "fleeing" : scene,
    roll,
    untilMs: drive.ms + holdMs,
  };
  drive.nextWitnessMs = drive.ms + gapMs;
}

/** Is the body this shout belongs to still on the road and still on its feet? */
function stillShouting(drive: DriveState, id: number): boolean {
  for (const ped of drive.pedestrians) {
    if (ped.id === id) return ped.mode === "afoot";
  }
  return false;
}

/**
 * WHO TURNS AND SHOUTS — the FURTHEST body that is still inside the picture's
 * reading window, saw the thing, and is on its feet.
 *
 * FURTHEST, WHICH IS THE OPPOSITE OF THE OBVIOUS ANSWER and was arrived at by
 * arithmetic rather than taste. The car is doing up to 905 px/s, so a witness
 * picked 80 px ahead is under the bumper in a tenth of a second and their line
 * is a flicker; one picked at the far edge of the window has nearly three
 * tenths, and the app fades the glyphs UP over that distance, so the line
 * surfaces out of the traffic instead of appearing. Nearest-first is right for
 * a picket line, where the point is a SEQUENCE of placards being passed
 * (`MAX_PLACARDS`); it is wrong here, where there is one thing to say and the
 * only question is whether it can be read at all.
 *
 * THE GLUED ARE ELIGIBLE and that is deliberate: they are sitting in the road
 * watching the wagon come through their own people, and the reaction outranks
 * the placard they came with. A body being hit right now is not — it is
 * `tumbling` by the time this runs, so it cannot shout about itself.
 */
function pickWitness(
  drive: DriveState,
  atX: number,
  atY: number,
): DrivePedestrian | null {
  const dir = drive.params.direction;
  const { reachPx, nearPx } = DRIVE.witness;
  let best: DrivePedestrian | null = null;
  let bestAway = 0;
  for (const ped of drive.pedestrians) {
    const away = (ped.pos.x - drive.car.pos.x) * dir;
    if (away < nearPx || away > reachPx) continue;
    if (away <= bestAway) continue;
    if (!couldSee(ped, atX, atY)) continue;
    best = ped;
    bestAway = away;
  }
  return best;
}
