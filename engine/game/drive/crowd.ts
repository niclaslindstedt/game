// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE PEOPLE ON THE ROAD — where they come from, what they want, and what is
// left of them.
//
// WHO THEY ARE MATTERS TO HOW THEY MOVE. These are the ones the welfare did not
// reach: no money, no movie night, nothing indoors worth staying in for. They
// are out on the road because a road is where the cars are, and a car is where
// the money is. So they do not AVOID the hero — they see him coming and work
// their way into his path, because being in front of a car is the whole point
// of standing on a road you own nothing on.
//
// That is why the crowd LEADS ITS TARGET (`DRIVE.leadSeconds`): somebody
// stepping out where the car is going to be reads as a person flagging you
// down, where somebody stepping toward where it currently IS reads as a bug.
// It is also what makes the wheel worth anything — a crowd that walked at your
// present position would be dodged by driving in a straight line.
//
// AND THE JOKE ONLY WORKS IF THEY ARE UNAVOIDABLE. A road threaded clean makes
// the hero a monster for choosing to hit people; a road that cannot be threaded
// makes him a man who is not thinking about it at all, which is the funny one
// and the one the arrival lines are written against. `pedestriansPerKPx` is
// tuned to that, not to fairness.
//
// AND EVERY SO OFTEN ONE OF THEM IS THINKING SOMETHING (`CROWD_THOUGHTS`, and
// the deck the deal comes out of). That is the other half of the same joke and
// the half that costs nothing: the hero cannot be made to notice a person, so
// the crowd is given an inside instead — the rent, a daughter who still calls,
// a giveaway somebody is hoping is on again — and it is put where the player
// technically CAN read it and practically will not, half a second at a time,
// through a windscreen at a hundred and twenty. Nobody in the wagon ever
// mentions one. Nothing in the game ever refers to one again.

import { randomRange, type Rng } from "@game/lib/rng.ts";

import { cityEndPx, cityStartPx, DRIVE } from "./config.ts";
import type {
  DriveParams,
  DrivePedestrian,
  DriveState,
  PedestrianKind,
} from "./types.ts";

/**
 * How many distinct bodies the crowd is drawn from. The app's sprite table is
 * this long (`CROWD_SPRITES`, pwa/src/game/drive-screen/scenery.ts) — keep the
 * two in step, or the road quietly stops using its last body.
 *
 * EIGHTEEN, AND IT WAS TWENTY. The two that went were a boy and a girl, and
 * there is no version of this road that should have children on it. Everything
 * this minigame does is built on the hero not noticing what he is driving
 * through — the joke is that he arrives and remarks on the SUSPENSION — and
 * that reading only holds while the crowd is adults who could, in principle,
 * have got out of the way. A child under the bumper is not the same joke told
 * harder; it is a different thing entirely, and not one this game is making.
 *
 * The generator that draws the rest of them has no `child` age for the same
 * reason (`scripts/asset-tools/person.mjs`): the roster cannot ask for one, so
 * nobody has to remember not to.
 */
export const CROWD_VARIANTS = 18;

/**
 * HOW MANY THINGS THE CROWD IS THINKING — the length of the app's own list
 * (`CROWD_THOUGHTS`, pwa/src/game/drive-screen/placards.ts), which is where the
 * words live, because the engine has never been told this game has words in it.
 *
 * EVERY ONE OF THEM PLAYS ONCE A TRIP AND THEN IS DONE (`DriveState.thoughtDeck`).
 * A road of two hundred people rolling a line each would repeat itself inside
 * the first ten seconds, and a repeat is the moment the crowd stops being two
 * hundred people and becomes one person copy-pasted — which is the exact
 * feeling the whole beat exists to work against.
 */
export const CROWD_THOUGHTS = 40;

/**
 * WHAT EACH OF THEM WEIGHS, as a multiple of `DRIVE_UNITS.pedestrianMassKg` —
 * and the reason a bumper does not answer every body on this road the same way.
 *
 * NOBODY OUT HERE WEIGHS THE SAME AS ANYBODY ELSE, and the sum has always been
 * ready to say so: an inelastic collision is two masses meeting, so a person's
 * own mass is already an input to the speed the car loses, the energy the
 * crumple absorbs and the impulse the body leaves with (`solveImpact`). It was
 * simply fed the same number eighteen times. So a run of hits was eighteen
 * copies of one collision — which is what the road SOUNDED like too, because
 * every shelf the app reaches for is priced off those very joules.
 *
 * THE ORDER IS `CROWD_SPRITES`' (pwa/src/game/drive-screen/scenery.ts), the
 * same index `DrivePedestrian.variant` already carries, so what the player is
 * looking at and what the car just felt are the same person: the old woman is
 * three-quarters of a body and the man with everything he owns in four bags is
 * a third over one. A weight nobody can see is a weight nobody believes, which
 * is why the light end of this table is the frail-looking half of the roster
 * rather than a spread of noise.
 *
 * IT AVERAGES EXACTLY 1.0 across the eighteen, on purpose and by arithmetic
 * (18.00 / 18). Variants are drawn uniformly, so a leg meets the same total
 * mass of people it always did — the crowd's cost, the wear column, the
 * difficulty ladder's `pedestrianMassMult` and every measured number in
 * `drive_test.ts` are about the AVERAGE body, and this table is a spread around
 * it rather than a thumb on the scale. Keep it that way when tuning: a row that
 * goes up owes another row the same.
 */
export const CROWD_MASS_MULTS: readonly number[] = [
  0.85, // an old man, and not much of one
  0.75, // an old woman — the lightest thing on the road
  0.95, // a hoodie
  0.8, // a young woman
  1.0, // a suit, which is the yardstick
  1.1, // hi-vis: boots, a jacket with things in it
  1.2, // a full shopping trolley, and whoever is pushing it
  1.05, // a pram
  1.0, // somebody walking a dog
  0.9, // crutches
  0.85, // a walking frame
  0.85, // a skater
  1.1, // a long coat
  0.95, // a mohawk
  1.3, // the bagman — everything he owns, carried
  0.9, // headphones
  1.15, // a cyclist, and the bike under them
  1.3, // a wheelchair: steel, wheels and a person in it
];

/**
 * …AND WHAT THE OTHER THREE KINDS WEIGH, for the same sum.
 *
 * They have their own tables of art rather than the crowd's, so `variant` means
 * something else for each of them and the eighteen above cannot answer. A RIDER
 * is a helmet, leathers and boots — the heaviest ordinary body out here without
 * being a different kind of thing. A DRIVER came out of a seat, so they are
 * whoever was driving, plus a coat. One of THE GLUED is an ordinary person, and
 * deliberately: what makes a blockade a wall is the RESIN
 * (`DRIVE.blockade.massMult`), not the people in it, and folding the two into
 * one number would leave the road unable to say which of them it meant.
 */
const KIND_MASS_MULTS: Record<Exclude<PedestrianKind, "walker">, number> = {
  rider: 1.1,
  driver: 1.05,
  glued: 1,
};

/**
 * What one body on this road weighs, as a multiple of the rung's own
 * `pedestrianMassKg` — the ONE answer, read by the collision that solves the
 * blow and by the app that has to make a noise about it.
 *
 * One function rather than two tables read in two places, because the second
 * copy is where the picture and the physics start disagreeing: the app buckets
 * this into the shelf a hit sounds like (`drive-screen/drive-sounds.ts`), and a
 * body that sounded heavy while the sum treated it as light would be the road
 * lying about the only thing this minigame is made of.
 */
export function bodyMassMult(kind: PedestrianKind, variant: number): number {
  if (kind !== "walker") return KIND_MASS_MULTS[kind];
  const at = ((variant % CROWD_VARIANTS) + CROWD_VARIANTS) % CROWD_VARIANTS;
  return CROWD_MASS_MULTS[at] ?? 1;
}

/** How fast a tumbling body sheds its speed on the tarmac (1/s), and the speed
 * under which it has stopped for good. */
const TUMBLE_DRAG = 2.4;
const TUMBLE_REST = 8;
/** Gravity for a body in the air (px/s²) and what a bounce keeps. */
const TUMBLE_GRAVITY = 620;
const TUMBLE_BOUNCE = 0.28;

/**
 * THE TARMAC ITSELF — the outer lane markings, with no gutter on either side.
 *
 * The narrowest of the three bands this file knows about, and the one the KERB
 * is measured off: the pavement starts here, the street furniture stands just
 * beyond it (`street.ts`), and the renderer paints its road exactly this wide.
 * Kept here beside the other two so nothing has to re-derive `laneCount ×
 * laneWidth / 2` and quietly disagree by a pixel.
 */
export function roadBandEdges(): { top: number; bottom: number } {
  const half = (DRIVE.laneCount * DRIVE.laneWidth) / 2;
  return { top: -half, bottom: half };
}

/** The road's outer edges in world y — the tarmac plus its gutters. Everything
 * on the road is born, walks and dies between these. */
export function roadEdges(): { top: number; bottom: number } {
  const band = roadBandEdges();
  return { top: band.top - DRIVE.vergePx, bottom: band.bottom + DRIVE.vergePx };
}

/** THE APPROACH'S OWN HALF-WIDTH (world px) — the country road either side of
 * the town, before the taper opens it out to four lanes. */
function narrowRoadHalf(): number {
  return (DRIVE.opening.laneCount * DRIVE.laneWidth) / 2;
}

/**
 * HOW WIDE THE CARRIAGEWAY IS AT ONE POINT ON THE LEG (half-width, world px) —
 * the one thing about this road that is not the same all the way down it.
 *
 * THE ROAD OUT OF TOWN IS TWO LANES. The four-lane carriageway is the TOWN's:
 * out on the approach it is an ordinary country road — the middle two lanes and
 * nothing else — and it OPENS OUT to four over the last stretch before the first
 * house, which is what a road actually does on the way into somewhere and is the
 * cheapest possible way to say "you are arriving" without a sign.
 *
 * IT IS ALSO WHAT KEEPS THE CYCLISTS ALIVE. The footway sits where it sits, at
 * the full road's own kerb line (`crowdEdges`) — so a narrow carriageway leaves a
 * lane's worth of verge between the tarmac and the pavement, and the delivery
 * riders out there are genuinely out of reach rather than nominally so. Widen the
 * road and the gap closes; that is the same beat as the crowd arriving.
 *
 * AND IT HAPPENS TWICE, because the outskirts do (`cityEndPx`): the road opens
 * out on the way into the town and closes back down to two lanes on the way out
 * of it. Symmetric on purpose — the stretch one leg widens over is the stretch
 * the other leg narrows over, and a taper that existed at only one end would be
 * a road that arrives somewhere driving out and simply stops driving home.
 *
 * `travel` is how far along the leg the point is (`dir * x`, which is what
 * `DriveState.distance` measures), so both legs answer it identically.
 */
export function roadBandHalfAt(
  travel: number,
  params: { coursePx?: number; cityPx?: number },
): number {
  const full = (DRIVE.laneCount * DRIVE.laneWidth) / 2;
  const narrow = narrowRoadHalf();
  const { widenPx } = DRIVE.opening;
  const near = cityStartPx(params);
  const far = cityEndPx(params);
  // How far INTO the town this point is, measured off whichever gate is nearer
  // — negative out on either outskirt, and past the taper's width once the
  // carriageway is fully open.
  const inside = travel < near ? travel - near : far - travel;
  if (inside >= 0) return full;
  const opened = 1 + inside / widenPx;
  if (opened <= 0) return narrow;
  return narrow + (full - narrow) * opened;
}

/**
 * HAS THE ROAD BEGUN TO OPEN OUT AT THIS POINT ON THE LEG — the taper's own
 * start, read off the same arithmetic that draws it rather than restated as a
 * distance, so the mark can never drift from the widening it names.
 *
 * It is a fact about the ROAD and it is asked for a reason that is not the
 * road's: the widening is the first thing the player can SEE of the town
 * arriving, so it is the honest moment to tell him the minigame is about to
 * start (`driveReadyUp`).
 */
export function roadWideningAt(
  travel: number,
  params: { coursePx?: number; cityPx?: number },
): boolean {
  return roadBandHalfAt(travel, params) > narrowRoadHalf();
}

/** …and the same in the units the CAR is clamped to: the tarmac at this point
 * plus the gutter it may stray into. The one accessor a moving body should use —
 * `roadEdges` is the TOWN's road, and out on the approach it is a lane wider than
 * the tarmac actually is. */
export function roadEdgesAt(
  travel: number,
  params: { coursePx?: number; cityPx?: number },
): { top: number; bottom: number } {
  const half = roadBandHalfAt(travel, params);
  return { top: -half - DRIVE.vergePx, bottom: half + DRIVE.vergePx };
}

/**
 * WHERE A PERSON MAY BE — the tarmac, its gutters, AND the pavement each side.
 *
 * The crowd's band is deliberately wider than the CAR's (`roadEdges`): a street
 * whose people stop dead at the kerb line reads as a corridor with figures
 * pressed against its walls, and the moment the pavement was drawn it became
 * obvious that nobody was ever standing ON it. Widening the band is also what
 * makes a crossing mean anything — somebody waits on the kerb, then steps out.
 */
export function crowdEdges(): { top: number; bottom: number } {
  const edges = roadEdges();
  return {
    top: edges.top - DRIVE.pavementPx,
    bottom: edges.bottom + DRIVE.pavementPx,
  };
}

/** The centre of a lane in world y — lane 0 is the far side of the road (the
 * top of the screen), the last lane the near side. */
export function laneCenter(lane: number): number {
  const half = (DRIVE.laneCount * DRIVE.laneWidth) / 2;
  return -half + (lane + 0.5) * DRIVE.laneWidth;
}

/** …and the way back: which lane a world y sits in. Clamped, because the road's
 * gutters (`roadEdges`) sit outside the painted lanes and a car in one is still
 * on somebody's side of the white line. */
export function laneAt(y: number): number {
  const half = (DRIVE.laneCount * DRIVE.laneWidth) / 2;
  const lane = Math.floor((y + half) / DRIVE.laneWidth);
  return Math.max(0, Math.min(DRIVE.laneCount - 1, lane));
}

/**
 * WHERE THE CROSSINGS ARE — every painted crossing whose centre falls between
 * two world-x bounds, in ascending x.
 *
 * On world x rather than course distance so the paint sits in the same places
 * whichever way the car is pointing, and pure (no state, no draw) so the
 * renderer can ask about the stretch it is about to paint without the sim
 * having to tell it anything.
 */
export function crossingsBetween(fromX: number, toX: number): number[] {
  const pitch = DRIVE.crossingPitchPx;
  const out: number[] = [];
  for (let k = Math.floor(fromX / pitch); k <= Math.ceil(toX / pitch); k++) {
    const x = k * pitch;
    if (x >= fromX && x <= toX) out.push(x);
  }
  return out;
}

/** The first crossing the car has not passed yet, given which way it is going. */
function crossingAhead(x: number, dir: 1 | -1): number {
  const pitch = DRIVE.crossingPitchPx;
  return dir === 1
    ? Math.ceil(x / pitch) * pitch
    : Math.floor(x / pitch) * pitch;
}

/** A stable 0→1 off a spawn mark — the crossing decision, made without
 * touching the drive's seeded stream (see `DRIVE.crossingCrowdShare`). */
function markHash(at: number): number {
  let h = Math.imul(Math.round(at) ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * THE THOUGHTS, SHUFFLED — the order this trip's crowd will think them in.
 *
 * DEALT FROM A DECK RATHER THAN ROLLED PER BODY, which is the whole of the rule
 * the user of this list cares about: each line plays once a trip. A roll would
 * hand the same sentence to two people four seconds apart, and two people
 * thinking the identical thing is the one thing that would make the crowd read
 * as wallpaper.
 *
 * SHUFFLED OFF THE SEED, NOT OFF `state.rng()`, exactly as the crossings and the
 * blockade's seating are. The road's bodies, their variants and their wander
 * phases all come off the seeded stream in a fixed order; spending forty draws
 * here would have moved every person on the leg one place along, which is a
 * different road for the same seed and a broken restart-after-a-breakdown.
 *
 * The deck is POPPED from the end, so this returns it in the order the trip will
 * think it, back to front.
 */
export function resetThoughtDeck(seed: number): number[] {
  const deck = [...Array(CROWD_THOUGHTS).keys()];
  // Fisher–Yates, driven by the seed's own hash chain.
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(markHash(seed * 1013 + i * 7 + 3) * (i + 1));
    [deck[i], deck[j]] = [deck[j] as number, deck[i] as number];
  }
  return deck;
}

/**
 * WHAT THE PERSON AT THIS MARK IS THINKING, or −1 for the great majority of
 * them who are simply walking.
 *
 * The pace is `DRIVE.thoughtPitchPx` and the mark that gets the card is the
 * first one PAST it — so the thoughts keep their spacing whatever the crowd's
 * own density is set to, and a trip that runs the deck out (a long course, or a
 * slow enough drive) simply goes quiet rather than starting the set again.
 */
function dealThought(state: DriveState, at: number): number {
  if (at < state.nextThoughtAt) return -1;
  state.nextThoughtAt = at + DRIVE.thoughtPitchPx;
  return state.thoughtDeck.pop() ?? -1;
}

/** Lay down the next stretch of crowd as the road unrolls under the car.
 * Bodies are minted ONCE, at a running mark, rather than re-rolled per tick —
 * so the same seed lays the same people down however the car is driven. */
export function spawnCrowd(state: DriveState): void {
  const { rng } = state;
  const dir = state.params.direction;
  const reach = state.distance + DRIVE.spawnAheadPx;
  const edges = crowdEdges();
  while (state.nextPedestrianAt < reach) {
    const at = state.nextPedestrianAt;
    state.nextPedestrianAt += 1000 / DRIVE.pedestriansPerKPx;
    // NOBODY IS ON THE ROAD UNTIL THE TOWN IS. The outskirts are out of town —
    // no houses, no far pavement, and nobody standing in four lanes of a road
    // that has nothing on either side of it — so the crowd starts at the gate
    // and not a pixel before it (`cityStartPx`). That is also what makes the
    // hero's promise cheap: he makes it on an empty road, which is the only
    // place it costs him anything to make.
    if (at < cityStartPx(state.params)) continue;
    if (at > cityEndPx(state.params)) break;
    // ON A CROSSING, OR STREWN. Half the crowd is gathered onto the next
    // painted crossing ahead, spread across its width — which is what gives
    // the trip a rhythm to read instead of an even smear of people. The
    // decision is hashed off the mark, so the seeded stream below is untouched
    // and a road replays body for body.
    const strewnX = state.car.home.x + dir * at;
    const onCrossing = markHash(at) < DRIVE.crossingCrowdShare;
    const x = onCrossing
      ? crossingAhead(strewnX, dir) +
        (markHash(at * 3 + 11) - 0.5) * DRIVE.crossingWidthPx
      : strewnX;
    state.pedestrians.push({
      id: state.nextId++,
      pos: {
        x,
        y: randomRange(rng, edges.top, edges.bottom),
      },
      vel: { x: 0, y: 0 },
      mode: "afoot",
      kind: "walker",
      variant: Math.floor(rng() * CROWD_VARIANTS) % CROWD_VARIANTS,
      phase: rng() * Math.PI * 2,
      z: 0,
      vz: 0,
      counted: false,
      crushed: false,
      // …AND EVERY SO OFTEN, WHAT ONE OF THEM IS THINKING. Not said — nobody out
      // here is talking to the car, and a shout would make them a crowd with an
      // opinion, which is THE GLUED's job and not theirs. It is the small,
      // domestic, entirely unremarkable thing a person is turning over while
      // they walk: the rent, the boy, the soup, whether anybody has looked at
      // them today. The hero goes past it at a hundred and twenty.
      bark: dealThought(state, at),
    });
  }
}

/**
 * One tick of everybody on the road.
 *
 * An UPRIGHT body either mills about (a slow drift derived from its own fixed
 * phase, so the crowd is never still and never costs a draw) or — once the car
 * is inside `noticePx` — walks at where the car is GOING to be. A TUMBLING one
 * is pure ballistics: it flies, it lands, it skids, it stops.
 */
export function stepCrowd(state: DriveState, dt: number): void {
  const { car } = state;
  const dir = state.params.direction;
  const edges = crowdEdges();
  const seconds = state.ms / 1000;
  for (const ped of state.pedestrians) {
    if (ped.mode === "tumbling") {
      stepTumble(ped, dt);
      continue;
    }
    // THE GLUED DO NOT MOVE, and that is the whole of them (see
    // `PedestrianKind`). No wander, no lunge, no flinch as the car arrives —
    // they sat down on purpose and their hands are in the resin. It is also
    // what makes the set piece READ: everything else on this road drifts, so a
    // formation that is perfectly still is legible as a decision from a screen
    // away.
    if (ped.kind === "glued") continue;
    const ahead = (ped.pos.x - car.pos.x) * dir;
    const gap = Math.hypot(ped.pos.x - car.pos.x, ped.pos.y - car.pos.y);
    if (gap < DRIVE.noticePx && ahead > 0) {
      // THE LUNGE — at where the car will be, not where it is.
      const leadX = car.pos.x + dir * Math.abs(car.speed) * DRIVE.leadSeconds;
      const dx = leadX - ped.pos.x;
      const dy = car.pos.y - ped.pos.y;
      const len = Math.hypot(dx, dy) || 1;
      ped.vel.x = (dx / len) * DRIVE.lungePx;
      ped.vel.y = (dy / len) * DRIVE.lungePx;
    } else {
      // Milling about: a slow figure-of-eight off the body's own phase.
      ped.vel.x = Math.cos(seconds * 0.7 + ped.phase) * DRIVE.walkPx;
      ped.vel.y = Math.sin(seconds * 0.5 + ped.phase * 1.7) * DRIVE.walkPx;
    }
    ped.pos.x += ped.vel.x * dt;
    ped.pos.y += ped.vel.y * dt;
    // Nobody wanders off the street — past the pavement there is nothing out
    // there for them.
    if (ped.pos.y < edges.top) {
      ped.pos.y = edges.top;
      ped.vel.y = Math.abs(ped.vel.y);
    } else if (ped.pos.y > edges.bottom) {
      ped.pos.y = edges.bottom;
      ped.vel.y = -Math.abs(ped.vel.y);
    }
  }
  // Forget what is well behind the car — including the bodies, which is its own
  // small mercy: the hero never has to drive past his own morning.
  //
  // EXCEPT THE GLUED, WHO ARE STILL THERE. They are a SET PIECE rather than a
  // stream, and forgetting them at the crowd's own reach told a lie about it:
  // the wagon physically reaches four to six of the twenty, but the marks it
  // leaves are the app's and persist for the whole leg, so a stretch of road
  // holding fifteen people who are perfectly fine and a great deal of somebody
  // else was drawn as gore with nobody in it. Anyone looking back — a player
  // glancing in the mirror, a reviewer in the effects gallery — read a massacre
  // of the lot.
  //
  // So they are kept for as long as their own blood is (`MARK` range in
  // drive-gore.ts is the whole visible road), which is also the honest answer
  // in fiction: everybody else out here is walking somewhere and is genuinely
  // gone a second later. These people are not going anywhere. That is the whole
  // of what they are.
  state.pedestrians = state.pedestrians.filter((ped) => {
    const behind = (ped.pos.x - car.pos.x) * dir;
    return ped.kind === "glued"
      ? behind > -DRIVE.blockade.rememberPx
      : behind > -DRIVE.despawnBehindPx;
  });
}

/** A struck body that did NOT come apart (the gore-off path): it flies, lands,
 * skids into the gutter and stays there. */
function stepTumble(ped: DrivePedestrian, dt: number): void {
  if (ped.z > 0 || ped.vz > 0) {
    ped.vz -= TUMBLE_GRAVITY * dt;
    ped.z += ped.vz * dt;
    if (ped.z <= 0) {
      ped.z = 0;
      // One half-hearted bounce, then it stays down.
      ped.vz = ped.vz < -60 ? -ped.vz * TUMBLE_BOUNCE : 0;
    }
  }
  ped.pos.x += ped.vel.x * dt;
  ped.pos.y += ped.vel.y * dt;
  const drag = Math.max(0, 1 - TUMBLE_DRAG * dt);
  ped.vel.x *= drag;
  ped.vel.y *= drag;
  if (Math.hypot(ped.vel.x, ped.vel.y) < TUMBLE_REST && ped.z <= 0) {
    ped.vel.x = 0;
    ped.vel.y = 0;
  }
}

/** Mint the crowd's spawn marks for a fresh drive — the town's gate, which is
 * where the people are. */
export function resetCrowdMarks(rng: Rng, params: DriveParams): number {
  // A touch of jitter on the very first mark so two drives on neighbouring
  // seeds do not open with a body in identically the same spot.
  return cityStartPx(params) + rng() * (1000 / DRIVE.pedestriansPerKPx);
}
