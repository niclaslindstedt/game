// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// SOMEBODY IS DRIVING EVERY ONE OF THEM — the other traffic's own drivers.
//
// WHAT THIS FILE REPLACED. A vehicle used to be born on a lane centre with a
// speed and hold both until something hit it, which makes a four-lane road four
// conveyor belts: nothing wobbles, nothing pulls out, nothing goes round the
// hatchback somebody left half in the gutter, and — the one that actually costs
// the player — nothing ever changes its mind. A lane that was clear stayed
// clear, so the whole decision in the minigame reduced to finding the empty belt
// once and holding it for the rest of the leg.
//
// FIVE BEHAVIOURS, and every one of them is something the car in front of you
// really does:
//
//   IT WOBBLES        Nobody holds a line to the pixel.
//   IT FOLLOWS        It matches the car in front rather than driving into it —
//                     and stands on the brake when matching is not going to be
//                     enough. IMPERFECTLY, on purpose: it brakes for what it can
//                     SEE, with one set of brakes, so anything arriving inside
//                     its own stopping distance still arrives, and what happens
//                     then is `between.ts`.
//   IT PULLS OUT      Because the car in front is slower than it wants to go,
//                     which is the only honest reason anybody ever does.
//   IT GOES ROUND     A parked car, a wreck standing dead in a lane, anything
//                     stopped — a lean into the neighbouring lane and back out
//                     rather than a lane change, which is what people do.
//   IT LIFTS OFF      …for the car drawing level with it in the next lane, on
//                     the rungs that promise a way through (`laneGuardPx`).
//
// ── IT NEVER TOUCHES THE DICE ───────────────────────────────────────────────
// Not one `drive.rng()` draw, ever — the same rule the auto-driver and the gore
// scatter obey. The road's stream lays down every body, every variant and every
// temper in a fixed order, so a draw spent on a lane change would move every
// person the hero meets after it, and a seeded road would stop being one. The
// wobble rides the vehicle's own `phase`; every decision below is read off the
// state.
//
// ── AND IT IS NOT A SECOND SPAWNER ──────────────────────────────────────────
// A driver may change where its own vehicle is and how fast it is going. It may
// not mint one, retire one, or touch anybody else's — which is what keeps this
// file cheap to reason about beside a collision pass that does exactly the
// opposite.

import { clamp } from "@game/lib/vec.ts";

import { difficultyDef } from "../defs/difficulties.ts";
import { DRIVE } from "./config.ts";
import { laneAt, laneCenter, laneStraddle, roadBandHalfAt } from "./crowd.ts";
import { vehicleDef } from "./fleet.ts";
import { laneRunsWithHero } from "./traffic.ts";
import type { DriveState, DriveTraffic } from "./types.ts";

/**
 * WHO IS IN WHICH LANE THIS TICK — built once and read by every driver, because
 * the alternative is every vehicle walking the whole road.
 *
 * A lane's list is sorted along the road (ascending world x), which is what lets
 * "the vehicle in front of me" be a short walk from an insertion point rather
 * than a scan of everything on the carriageway. Rebuilt each tick: the drivers
 * move the very positions it buckets on, so anything longer-lived would be a
 * cache to invalidate, and this is one sort of a list that is nearly sorted
 * already.
 */
export type TrafficIndex = {
  /** Everything in each lane, ascending x. Pavement riders are not in it — they
   * are not in a lane. */
  lanes: DriveTraffic[][];
};

/** Bucket the road by lane. */
export function indexTraffic(state: DriveState): TrafficIndex {
  const lanes: DriveTraffic[][] = Array.from(
    { length: DRIVE.laneCount },
    () => [],
  );
  for (const other of state.traffic) {
    // A FACT ABOUT THIS VEHICLE, NOT ABOUT ITS MODEL (`DriveTraffic.footway`):
    // the outskirts put a CYCLIST on the one pavement out there, and a cyclist's
    // def rides the road.
    if (other.footway) continue;
    lanes[laneAt(other.pos.y)]!.push(other);
  }
  for (const lane of lanes) lane.sort((a, b) => a.pos.x - b.pos.x);
  return { lanes };
}

/**
 * WHICH LANE IS THE ONE NEXT DOOR, on this driver's own side of the road.
 *
 * Right-hand traffic in two pairs: {0,1} run one way and {2,3} the other
 * (`laneRunsWithHero`), so the lane a driver may legitimately move into is its
 * partner in its own pair and never the one across the centre line. A driver
 * that could reach for the oncoming carriageway would be a hazard the player
 * cannot read, because nothing on this road ever indicates.
 */
export function siblingLane(lane: number): number {
  return lane % 2 === 0 ? lane + 1 : lane - 1;
}

/** Which way this vehicle is travelling in world +x, as a sign. */
export function heading(other: DriveTraffic): 1 | -1 {
  return other.speed < 0 || (other.speed === 0 && other.faceLeft) ? -1 : 1;
}

/** A stable 0→1 off two integers — this file's own share of the cosmetic dice,
 * and the reason nothing here has to touch the road's stream (see the file's own
 * note). The same mixer `push.ts` and `fleet.ts` carry. */
function hash(a: number, b: number): number {
  let h = Math.imul((a ^ 0x9e3779b9) + Math.imul(b, 0x27d4eb2f), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * THE VEHICLE IN FRONT — the nearest one ahead of `other` in `lane`, within
 * `reachPx`, measured along the way `other` is actually pointing.
 *
 * "Ahead" is the driver's own heading rather than the road's: the two
 * carriageways run opposite ways and both are full of drivers with the same
 * question. A stopped wreck answers it too, and must — the whole reason a
 * driver looks is to find the thing it is about to arrive at.
 */
function ahead(
  index: TrafficIndex,
  other: DriveTraffic,
  lane: number,
  reachPx: number,
): DriveTraffic | null {
  const list = index.lanes[lane];
  if (!list) return null;
  const dir = heading(other);
  let best: DriveTraffic | null = null;
  let bestGap = reachPx;
  for (const it of list) {
    if (it === other) continue;
    const gap = (it.pos.x - other.pos.x) * dir;
    if (gap <= 0 || gap >= bestGap) continue;
    best = it;
    bestGap = gap;
  }
  return best;
}

/**
 * IS THERE ROOM IN THAT LANE — the check before pulling out, and the one that
 * has to look BOTH ways.
 *
 * A driver that only looked forward would pull out in front of the car that was
 * overtaking IT, which on a road where a chase comes through at seventy over the
 * traffic is most of the time. The window is asymmetric for the same reason a
 * mirror check is: what is behind you is closing far faster than what is ahead.
 */
function laneClear(
  index: TrafficIndex,
  other: DriveTraffic,
  lane: number,
  aheadPx: number,
  behindPx: number,
): boolean {
  const list = index.lanes[lane];
  if (!list) return false;
  const dir = heading(other);
  for (const it of list) {
    if (it === other) continue;
    const gap = (it.pos.x - other.pos.x) * dir;
    if (gap < -behindPx || gap > aheadPx) continue;
    return false;
  }
  return true;
}

/**
 * HOW MUCH ROAD THIS RUNG PROMISES BESIDE A VEHICLE — 0 on the rungs that
 * promise none. See `DifficultyDef.drive.laneGuardPx`.
 */
export function laneGuardPx(state: DriveState): number {
  return difficultyDef(state.params.difficulty).drive.laneGuardPx;
}

/**
 * IS SOMEBODY DRAWING LEVEL WITH ME in the next lane — the question the gentle
 * rungs answer by lifting off.
 *
 * "Level" is a stretch of road rather than an instant, because two cars whose
 * noses are exactly abreast is a state that lasts a frame and the thing the
 * player needs is a GAP: if the pair of lanes running one way are shut within a
 * guard's length of each other, there is nowhere to put the wagon.
 */
function abreast(
  index: TrafficIndex,
  other: DriveTraffic,
  lane: number,
  guardPx: number,
): DriveTraffic | null {
  const list = index.lanes[lane];
  if (!list) return null;
  for (const it of list) {
    if (it === other) continue;
    if (Math.abs(it.pos.x - other.pos.x) <= guardPx) return it;
  }
  return null;
}

/**
 * SOMETHING STOPPED, JUST OFF MY LINE — how far this driver leans to get round
 * it, in world px away from the kerb it is on (signed in world y).
 *
 * TWO POPULATIONS AND ONE ANSWER. A car somebody left at the kerb is a
 * `DriveProp` and a car that died in a live lane is a `DriveTraffic`, and from
 * the driving seat they are the identical problem: a stationary obstacle
 * overlapping the lane, which you go AROUND. So both are read here and the lean
 * is the same lean — which is also why the kerb finally reads as being on this
 * road rather than beside it.
 *
 * It is deliberately NOT a lane change. A driver going round a parked car moves
 * across a bit and comes back, so from the player's seat the car in that lane is
 * momentarily a third of a lane wider than it was — a thing to read rather than
 * a thing to be told about.
 */
function dodge(
  state: DriveState,
  index: TrafficIndex,
  other: DriveTraffic,
  def: { radiusPx: number },
  /** The road at THIS driver's own point on the leg — passed in rather than
   * asked for again, because the caller has already worked it out and this runs
   * once per vehicle per tick. */
  edges: { top: number; bottom: number },
): number {
  const { dodgeFromPx, dodgePx } = DRIVE.drivers;
  const dir = heading(other);
  // Which way there IS to lean: away from the nearer kerb, so a car in the
  // gutter lane pulls IN toward the middle of the road, which is the only
  // direction that helps.
  const away = other.pos.y > 0 ? -1 : 1;
  let worst = 0;
  const consider = (x: number, y: number, radius: number): void => {
    const gap = (x - other.pos.x) * dir;
    if (gap <= 0 || gap > dodgeFromPx) return;
    const off = y - other.pos.y;
    // Only what is on the wrong side to begin with: leaning toward a thing is
    // how a dodge becomes a collision.
    if (off * away > 0) return;
    const need = def.radiusPx + radius + 2;
    const clear = Math.abs(off);
    if (clear >= need) return;
    // Nearer means a harder lean, and the whole lean is in hand by the time it
    // is level with the thing.
    const want = Math.min(dodgePx, (need - clear) * 1.4);
    if (want > worst) worst = want;
  };
  for (const prop of state.props) {
    if (prop.kind !== "parked_car" || prop.felled) continue;
    consider(prop.pos.x, prop.pos.y, vehicleDef(prop.variant).radiusPx);
  }
  const list = index.lanes[laneAt(other.pos.y)];
  if (list) {
    for (const it of list) {
      if (it === other) continue;
      // A vehicle still under way is a following problem, not a dodging one —
      // it will not be there when you arrive. Only what has STOPPED is an
      // obstacle in the sense this function means.
      if (!it.wrecked && !it.downed && Math.abs(it.speed) > 30) continue;
      consider(it.pos.x, it.pos.y, vehicleDef(it.variant).radiusPx);
    }
  }
  const lean = away * worst;
  // …and never off the tarmac — the tarmac AT THIS POINT, which on the approach
  // is two lanes rather than four. A car that dodged into the verge would have
  // solved a collision by leaving the road.
  const target = clamp(other.pos.y + lean, edges.top, edges.bottom);
  return target - other.pos.y;
}

/**
 * HE IS SITTING ON THE WHITE LINE — the one answer this file gives that is about
 * the HERO rather than about the traffic, and the reason is that riding a lane
 * marking is not driving, it is standing in the one place on the road nothing
 * can reach (`DRIVE.drivers.lineRide` has the arithmetic).
 *
 * ASKED ONCE PER VEHICLE, as it comes into view, and answered off the vehicle's
 * own hash — never a draw, like everything else in this file. So a car either is
 * or is not the kind that moves over, the road stays a property of its seed, and
 * a player who takes the line through heavy traffic meets a third of it.
 *
 * IT IS A LANE CHANGE AND NOTHING MORE. The driver takes the other half of its
 * own pair (`siblingLane`) — the same manoeuvre, the same rate, the same
 * settling as pulling out for a dawdler — and the man parked on the marking
 * between the two is in the way of it. Nothing here steers AT him, and nothing
 * here may: a car that homed on the wagon would read as the road cheating, and
 * would follow him off the line he is being punished for holding.
 */
function lureAcross(
  state: DriveState,
  index: TrafficIndex,
  other: DriveTraffic,
  lane: number,
): boolean {
  const cfg = DRIVE.drivers;
  const { lineRide } = cfg;
  const gap = (other.pos.x - state.car.pos.x) * state.params.direction;
  // Ahead of him, and only just: a car already level with the wagon has nothing
  // left to change lanes into.
  if (gap <= 0 || gap > lineRide.fromPx) return false;
  const pair = laneStraddle(state.car.pos.y, lineRide.straddlePx);
  // NOT EVERY MARKING IS ONE OF THESE. The middle of the road is a marking too,
  // and the pair either side of it are opposite carriageways — a driver reaching
  // across THAT is not changing lanes, it is turning into the oncoming stream,
  // which is a thing this road's drivers never do (`siblingLane`).
  if (pair === null || siblingLane(pair) !== pair + 1) return false;
  if (lane !== pair && lane !== pair + 1) return false;
  // Asked, whatever the answer — one chance each.
  other.lured = true;
  if (hash(other.id, 0x11e) >= lineRide.chance) return false;
  // …AND IT STILL LOOKS FIRST. Nobody out here changes lanes into the side of
  // somebody else, and a driver that did would be hitting a stranger to reach a
  // man on a white line — which is the road cheating in the one way the player
  // would actually see.
  //
  // A TIGHTER WINDOW THAN THE OVERTAKE'S, deliberately: pulling out to get past
  // a dawdler is a manoeuvre somebody CHOSE, and it wants the generous mirror
  // check that stops them doing it in front of a chase. This is a driver moving
  // over on a gap they would otherwise leave — the room they need is the room
  // not to hit anybody, which is their own following distance either way.
  const wants = Math.max(
    cfg.stopGapPx + vehicleDef(other.variant).halfLengthPx * 2,
    Math.abs(other.speed) * cfg.followSec,
  );
  if (!laneClear(index, other, siblingLane(lane), wants, wants)) return false;
  other.lane = siblingLane(lane);
  other.laneHoldMs = DRIVE.drivers.settledMs;
  return true;
}

/**
 * ONE TICK OF ONE DRIVER — where it wants to be across the road, how fast it
 * wants to be going, and the steering and the throttle that get it there.
 *
 * Called for everything with somebody at the wheel: not the pavement trade
 * (which weaves to its own rule), not a wreck, not a machine lying on its side,
 * and not a car somebody parked and walked away from.
 */
export function steerTraffic(
  state: DriveState,
  index: TrafficIndex,
  other: DriveTraffic,
  dt: number,
): void {
  const cfg = DRIVE.drivers;
  const def = vehicleDef(other.variant);
  const dir = heading(other);
  const guard = laneGuardPx(state);
  const urgency = Math.max(1, other.urgency);
  // HOW MUCH OF THE WHEEL THIS DRIVER ACTUALLY HAS. A car crossing the road at a
  // standstill is a car being carried, not driven — the hero's own steering
  // scales the same way and for the same reason (`applyCarWheel`,
  // `DRIVE.laneRefSpeedPx`). It matters more here than it does there, because
  // this road is full of vehicles that have STOPPED: a wreck nobody has cleared,
  // a car shunted to a halt, one the spawner planted with the handbrake on. None
  // of them should be quietly wandering toward a lane centre or wobbling on the
  // spot, and without this every one of them does.
  const authority = Math.min(1, Math.abs(other.speed) / DRIVE.laneRefSpeedPx);

  // ── WHICH LANE ────────────────────────────────────────────────────────────
  // Where it ended up is where it starts from: a car that has been shunted two
  // lanes across does not fight its way back through the traffic to the lane it
  // was born in, it takes the one it is in. Held to its OWN carriageway, so a
  // shove across the centre line has it coming back rather than driving into the
  // oncoming stream.
  //
  // …BUT NOT WHILE IT IS IN THE MIDDLE OF MOVING. A lane change takes about a
  // second, and for every tick of it the car is still physically in the lane it
  // is leaving — so a correction that fired on "you are not where you said you
  // would be" talked every driver out of every change on the tick after it was
  // decided, and the road's one deliberate manoeuvre never happened at all: they
  // stepped a fraction of a px toward the next lane, changed their mind, and
  // came back. `laneHoldMs` above `decideMs` is exactly the driver having just
  // COMMITTED to something (`settledMs` is stamped by the change and by nothing
  // else that matters here), so the correction waits for the commitment to lapse
  // — which for a car that was genuinely SHUNTED across is a second or so and
  // then the lane it has ended up in, as before.
  const at = laneAt(other.pos.y);
  const mine = laneRunsWithHero(other.lane, state.params.direction);
  if (
    laneRunsWithHero(at, state.params.direction) === mine &&
    at !== other.lane &&
    other.laneHoldMs <= cfg.decideMs
  )
    other.lane = at;

  other.laneHoldMs -= dt * 1000;
  // …AND WHETHER THE MAN IN FRONT IS RIDING A LANE MARKING, which is asked once
  // per vehicle as it comes into view and is the only thing on this road that
  // reads the hero at all.
  if (!other.lured) lureAcross(state, index, other, at);
  const sibling = siblingLane(other.lane);
  // HOW FAR UP THE ROAD IT IS LOOKING, and it is not one number: what a driver
  // DECIDES on and what a driver BRAKES for are different distances. Pulling out
  // is about the car it is catching (`lookAheadPx` — four car lengths, close
  // enough that the decision reads as being about that car); not driving into
  // the back of something is about the road it would need to stop in, and at
  // this road's speeds that is several times as far. Looked up ONCE at the
  // longer reach, because `ahead` walks the lane's list and asking twice would
  // walk it twice for every vehicle on the carriageway.
  const sight =
    cfg.lookAheadPx * urgency + Math.abs(other.speed) * cfg.sightSec;
  const inFront = ahead(index, other, other.lane, sight);
  if (other.laneHoldMs <= 0) {
    other.laneHoldMs = cfg.decideMs;
    // PULL OUT FOR SOMEBODY SLOWER, and only for somebody slower. A driver that
    // changed lanes for any other reason would be noise; this one is a decision
    // the player can watch being made and, once he has seen it twice, predict.
    const blocked =
      inFront !== null &&
      (inFront.pos.x - other.pos.x) * dir <= cfg.lookAheadPx * urgency &&
      Math.abs(other.cruise) - Math.abs(inFront.speed) > cfg.overtakeGainPx;
    if (blocked) {
      const room =
        cfg.lookAheadPx * urgency * 0.8 + Math.abs(other.speed) * 0.35;
      const back = cfg.lookBehindPx + Math.abs(other.speed) * 0.2;
      // …AND NOT INTO A LANE THIS RUNG IS KEEPING OPEN. On the gentle rungs the
      // second lane is the player's way through, so a driver that pulled into it
      // to get past somebody would be shutting the very gap the rung promised.
      const wouldPair = guard > 0 && abreast(index, other, sibling, guard);
      if (!wouldPair && laneClear(index, other, sibling, room, back)) {
        other.lane = sibling;
        other.laneHoldMs = cfg.settledMs;
      }
    }
  }

  // ── WHERE ACROSS THE ROAD ─────────────────────────────────────────────────
  // The lane's centre, plus the lean round anything stopped, plus the wobble
  // nobody drives without. The wobble is derived from the vehicle's own phase
  // and where it is — never a draw (see the file's own note).
  const wobble =
    Math.sin(other.phase + other.pos.x * 0.01 * cfg.wobbleHz) *
    cfg.wobblePx *
    authority;
  // …HELD TO THE ROAD THAT IS ACTUALLY THERE, which out on the approach is not
  // the town's. The lanes open half a gap BEFORE the gate (`resetTrafficMarks`)
  // and the ONCOMING pair then drives back out of the widening, so a driver was
  // aiming at a lane centre the outskirts do not have — a car tracking a white
  // line across the grass beside the opening's empty two-lane road. Measured at
  // this driver's own point on the leg (`roadBandHalfAt`), the outer lane is
  // squeezed in as the road narrows and slides back out as it opens, which is
  // what a lane merging away looks like.
  //
  // THE TARMAC, NOT THE TARMAC PLUS ITS GUTTER (`roadEdgesAt`): the gutter is
  // where a SHOVE leaves a car, never where one steers. Out of town that ten px
  // is grass, and in town this binds on nobody — every aim below is a lane
  // centre (±39 at the outermost) plus a wobble, and a dodge only ever leans
  // AWAY from the nearer kerb.
  const half = roadBandHalfAt(
    (other.pos.x - state.car.home.x) * state.params.direction,
    state.params,
  );
  const edges = { top: -half, bottom: half };
  const aim = clamp(
    laneCenter(other.lane) + dodge(state, index, other, def, edges) + wobble,
    edges.top + def.radiusPx * 0.5,
    edges.bottom - def.radiusPx * 0.5,
  );

  // …AND THE STEERING THAT GETS IT THERE. Rate-limited and eased over the last
  // few px, so a lane change is a manoeuvre with a beginning and an end rather
  // than a jump — which is the difference between a hazard the player reads and
  // one that simply appears beside him.
  const off = aim - other.pos.y;
  const rate = cfg.steerPx * urgency * authority;
  const ease =
    Math.abs(off) < cfg.settlePx ? off / cfg.settlePx : Math.sign(off);
  const step = ease * rate * dt;
  other.pos.y += Math.abs(step) > Math.abs(off) ? off : step;

  // ── AND HOW FAST ──────────────────────────────────────────────────────────
  // SOMEBODY WENT INTO THE BACK OF THEM, and a driver standing on the brake is
  // not choosing a pace at all — so the throttle below is not consulted until
  // the foot comes up (`DRIVE.drivers.brakeMs`). It is a flat deceleration
  // rather than an ease toward zero, because a car being braked stops: an
  // exponential would leave it ambling down the carriageway at a crawl for the
  // rest of the leg, which is the same tail `wreckFrictionPx` exists to cut off.
  //
  // The wheel is still theirs on the way down — they hold their lane, they just
  // hold it slower — and `authority` takes the steering away as the car actually
  // comes to rest, which is what stops a stationary victim wandering.
  if (other.brakeMs > 0) {
    const shed = cfg.brakePx * dt;
    other.speed =
      Math.abs(other.speed) <= shed
        ? 0
        : other.speed - Math.sign(other.speed) * shed;
    return;
  }

  // THE PACE THIS DRIVER CHOSE, and then everything in the way of it.
  let target = other.cruise;

  // ── THE CAR IN FRONT ──────────────────────────────────────────────────────
  // NOBODY OUT HERE IS TRYING TO CRASH. It used to be a fixed fraction off its
  // own cruise (`brakeFrac`), which is a driver that lifts off and hits the car
  // in front anyway the moment that car is doing less than half its pace — and
  // on a road whose whole point is that the traffic runs at genuinely different
  // speeds, that is most of the traffic. A dawdling hatchback collected the bus
  // behind it as a matter of course, and the road spent the leg turning itself
  // into wreckage with nobody having driven into anything.
  //
  // It MATCHES instead: the gap it wants is SECONDS of its own travel — which is
  // how following distance really works and how it scales — and as the room runs
  // out its target slides from its own pace to the pace of the thing in front,
  // reaching it exactly as the gap does. So a car behind a slower one settles in
  // behind it and sits there, which is what traffic looks like, and a car behind
  // a STOPPED one settles at a stop.
  //
  // MEASURED BUMPER TO BUMPER, not centre to centre: a bus has eleven px of
  // itself in front of its own anchor and the thing ahead has its own, and a
  // follower that aimed at centres would park a fifth of a bus inside a taxi.
  if (inFront) {
    const frontDef = vehicleDef(inFront.variant);
    const room =
      (inFront.pos.x - other.pos.x) * dir -
      def.halfLengthPx -
      frontDef.halfLengthPx;
    const wants = Math.max(
      cfg.stopGapPx,
      (Math.abs(other.speed) * cfg.followSec) / urgency,
    );
    if (room < wants) {
      const closed = clamp(1 - room / Math.max(1, wants), 0, 1);
      target = other.cruise + (inFront.speed - other.cruise) * closed;
    }
    // …AND IF THAT IS NOT GOING TO BE ENOUGH, BOTH FEET. Matching is a throttle
    // decision and it arrives at the pace of the right foot (`recoverPerSec`),
    // which is fine for a gap that is closing gently and useless for one that
    // has already gone — a wreck appearing from behind the van in front, a car
    // pulling into the space, somebody standing on their own brakes. So the
    // room left is checked against what stopping in it would actually TAKE, and
    // past a fraction of what this driver has (`brakeFromFrac`) they stop
    // choosing a speed and start braking.
    //
    // IT IS STILL NOT A PROMISE. They only brake for what they can SEE
    // (`sight`, above — and a chase is following at a third of the distance
    // while travelling half as far again), they only have the one set of brakes
    // and no more than the rest of the road, and anything that
    // arrives inside their own stopping distance is arriving too late — which is
    // where the pile-up the player has to get through still comes from, rather
    // than from drivers who were never trying.
    const closing = (other.speed - inFront.speed) * dir;
    if (closing > 0) {
      const need =
        room > 1 ? (closing * closing) / (2 * room) : Number.POSITIVE_INFINITY;
      if (need >= cfg.brakePx * cfg.brakeFromFrac) {
        const shed = Math.min(cfg.brakePx, need * cfg.brakeUrge) * dt;
        other.speed =
          Math.abs(other.speed) <= shed
            ? 0
            : other.speed - Math.sign(other.speed) * shed;
        return;
      }
    }
  }

  // …AND THE CAR BESIDE IT, on the rungs that promise the player a way past. A
  // driver drawing level with the next lane's lifts off and tucks in behind,
  // which is the courteous thing to do and — from the driving seat — a gap that
  // keeps opening up just as it is needed.
  if (guard > 0) {
    const beside = abreast(index, other, sibling, guard);
    // Whoever is BEHIND gives way, so the pair separates instead of both of them
    // lifting off and staying exactly as abreast as they were. Ties are broken
    // by id, because two cars dead level is a real state and somebody has to go
    // first.
    if (beside) {
      const mineFirst = (other.pos.x - beside.pos.x) * dir;
      const yields = mineFirst < 0 || (mineFirst === 0 && other.id > beside.id);
      if (yields) target *= DRIVE.drivers.courtesyFrac;
    }
  }

  // Ease onto it rather than snapping — the same recovery a shunted car gets
  // back on its pace with (`DRIVE.traffic.recoverPerSec`), because it is the
  // same driver doing the same thing with the same right foot.
  const blend = Math.min(1, DRIVE.traffic.recoverPerSec * urgency * dt);
  other.speed += (target - other.speed) * blend;
  if (Math.abs(target - other.speed) < 1) other.speed = target;
}
