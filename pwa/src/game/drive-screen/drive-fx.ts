// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT A COLLISION LOOKS AND FEELS LIKE ON THE ROAD — the drive's own little
// effect layer.
//
// WHY IT IS ITS OWN LAYER AND NOT THE RUN'S. `render/effects.ts` is a fine
// effect system and this deliberately does not use it: every one of its lives
// is measured against `state.stats.timeMs`, and a drive has no `GameState` to
// read a clock off. The road's clock is `DriveState.ms` — which stops while a
// monologue is up, exactly as the sim does — so an effect here ages on that,
// and the freeze the speech box already applies to the world applies to the
// sparks over it for free.
//
// EVERYTHING IN HERE IS PRESENTATION. The engine solves the collision and says
// so (`DriveEvent`); this file decides what that looks like and nothing else. A
// drive with the effect layer torn out plays identically — which is the test to
// apply to anything added here.
//
// THE FORCE COMES FROM THE PHYSICS, never from a per-effect constant: a burst is
// sized by the collision's own absorbed energy (`DriveEvent.joules`, the same
// number the gore burst is priced off), so a body clipped at 40 mph throws a few
// grains of grit and a van met square at 120 throws the screen about. Nobody has
// to tune "a big hit" — the sum already knows.

import { DRIVE } from "@game/core";

import { spriteByName, type Sprites } from "../assets.ts";
import { bodyAnchorX, bodyAnchorY, projectOffset } from "../render/tilt.ts";
import type { Camera } from "../render/view.ts";
import { drawStarBlast, drawStarFire } from "./star-fire.ts";

/** What the road can throw. */
type DriveFxKind =
  /** Grit and road dust off a body meeting the bumper. */
  | "grit"
  /** Scraped metal — the shower a car trades with a car. */
  | "spark"
  /** A panel giving, or a part tearing off: dark shards, no light. */
  | "shard"
  /** The dead engine's smoke, rising off the bonnet. */
  | "smoke"
  /**
   * Locked tyres burning off under the handbrake — a pale, low, fast cloud
   * boiling sideways off the back axle.
   *
   * Its own kind rather than the engine's smoke tuned down, because the two are
   * different sights and only one of them is about a column: a dead engine
   * issues a slow dark plume that CLIMBS for four seconds, and burning rubber
   * dumps a wide pale mass at road level that is gone in half of one. Sharing
   * the draw would have meant one of them looking wrong for the whole of a leg.
   */
  | "tyresmoke"
  /**
   * WHAT A CRASHED CAR SITS IN — the pale billow a vehicle raises when it goes
   * over and grinds itself down the tarmac.
   *
   * IT IS A THIRD SMOKE RATHER THAN A LOUDER SECOND ONE, and the difference is
   * the shape. The dead engine's `smoke` is a COLUMN: it goes up, out of one
   * point, and says a bonnet is cooking. A locked tyre's `tyresmoke` is a
   * STREAK: it is left behind by something still travelling and falls away
   * down the road. Neither is what the request asked for, which is a cloud that
   * SURROUNDS the thing — a mass that rolls outward from under a car on its
   * roof and hangs there with the wreck inside it. So it expands from a RADIUS
   * (`DriveFx.spread`, the vehicle's own extent) rather than from a point, it
   * barely climbs, and it lives long enough to still be there when the player
   * goes past.
   */
  | "dust"
  /**
   * A STREET LIGHT'S LENS GOING — the one burst on this road thrown from up in
   * the AIR rather than off the tarmac, and the only one that was LIT a moment
   * before it existed.
   */
  | "glass"
  /**
   * WHAT COMES OUT OF A WINDSCREEN WITH THE PERSON — the one BLOOD effect this
   * road throws into the air rather than laying on the tarmac.
   *
   * Everything else the drive does with blood is a MARK: a splash where a body
   * landed, a smear where one was dragged, a paste where the wheels found it,
   * all of it in `drive-gore.ts` and all of it flat on the road. That is right
   * for a body under a bumper, which is a thing that happens ON the ground. A
   * head-on is not: it happens at windscreen height, at the sum of two speeds,
   * and it goes UP and OUT through a hole in the glass. A mark on the tarmac
   * cannot say that, and the gore burst beside it throws PIECES rather than
   * liquid — so this is the spray, and it is the only one.
   */
  | "blood"
  /**
   * A CAR BURNING — and the one effect on this road drawn out of SPRITES rather
   * than out of canvas primitives.
   *
   * EVERYTHING ELSE HERE IS PARTICLES ON PURPOSE. Grit, sparks, shards, dust and
   * smoke are things there are HUNDREDS of, each one a pixel or a disc, and the
   * mass IS the picture — authored art for any of them would be one sprite drawn
   * three hundred times a frame to make a cloud. Fire is the opposite: there is
   * ONE of it, it is the brightest thing in the frame, it has a SHAPE the eye
   * knows, and a fire built out of orange dots reads as sparks. So it is the
   * game's own flame ladder (`content/sprites/effects/flame_*.yaml` — five
   * stages of two frames), picked by how well alight the car is and laid over it
   * additively. The same art the flamethrower burns with, which is the point:
   * this game has one fire.
   */
  | "fire"
  /**
   * …AND THE SAME CAR ALIGHT WITH THE GORE SWITCHED OFF — gold stars streaming
   * off the bodywork instead of flame (`star-fire.ts`).
   *
   * ITS OWN KIND RATHER THAN A RE-HUED `fire`, because there is no re-hue that
   * gets there: the flame ladder is authored ART with a flame's silhouette in
   * it, and a yellow flame is still a flame. The mode's whole vocabulary is
   * particles, so its answer to a burn is particles too — which is also why
   * this one needs no atlas and draws in a host that has none.
   */
  | "starfire"
  /**
   * …AND THE FUEL TANK GOING.
   *
   * ITS OWN KIND RATHER THAN A BIG `fire`, because it is a different shape as
   * well as a different size. A fire SITS on a car and grows over seconds; a
   * blast LEAVES one — a ball that opens beneath the shell in three frames,
   * climbs through it, and is gone in under a second while its black column
   * keeps rising.
   */
  | "blast"
  /** …and the same tank with the gore switched off: a party popper's worth of
   * gold stars, opening under the shell and climbing through it. Paired with
   * `starfire` for the reason that one is its own kind. */
  | "starblast"
  /**
   * …AND THE PRESSURE THAT LEAVES WITH IT — the one effect on this road that is
   * bigger than the thing that made it.
   *
   * ITS OWN KIND RATHER THAN A WIDER `blast`, because it is the opposite shape.
   * The ball is a bright mass that opens where the tank was, climbs and is gone;
   * the wave is a THIN RING that leaves that point and does not stop — it
   * crosses the lane, the far pavement and the frame, and what the player reads
   * is not "there is a fire over there" but "that reached me". Nothing else out
   * here does that: every other effect is an event happening at a place, and
   * this one is the road being hit.
   *
   * IT IS ON THE GROUND, so it is an ELLIPSE and not a circle. The world is
   * drawn raked (`DEFAULT_PITCH`), so a ring of one world radius comes out
   * squashed by exactly the projection every body on this road is seated by —
   * drawn as a screen-space circle it would read as a bubble in front of the
   * street rather than as a wave across it. `projectOffset` is the honest way to
   * ask, and it keeps answering if the pitch is ever dialled.
   */
  | "shockwave";

/** One live effect on the road. */
type DriveFx = {
  kind: DriveFxKind;
  x: number;
  y: number;
  /** Drive-clock ms when it was born, and how long it lives. */
  bornMs: number;
  lifeMs: number;
  /** 0→1-ish, off the collision's own joules — how many pieces and how far. */
  force: number;
  /** Per-effect scatter seed, so two sparks in the same tick differ. */
  seed: number;
  /**
   * RIDE THE CAR instead of staying where it happened.
   *
   * Everything else here is anchored to the ROAD, which is right for every one
   * of them: grit, sparks and shards are thrown off at a point and left behind,
   * and watching them recede is most of what makes speed read. The dead engine's
   * SMOKE is the one exception, and it was wrong until this existed — a
   * breakdown does not stop the car, it kills it, and the wreck then coasts the
   * better part of a screen and a half before it comes to rest
   * (`breakdownCoastPx`). Pinned to the road, the column stood over the spot the
   * engine died and the wreck rolled silently out from under it.
   */
  follow?: boolean;
  /**
   * WHICH WAY DOWN THE ROAD IT FALLS AWAY, as a sign (+1 world east, -1 west).
   *
   * Only the tyre smoke wants one, and it is the difference between a cloud the
   * car is leaving behind and a cloud stuck to its back bumper. A constant would
   * have been right on the leg OUT and exactly backwards on the leg HOME, where
   * the same road is driven the other way — the class of bug the drive's
   * `direction` exists to stop, and the reason this is a field rather than a
   * `-1` written into the draw.
   */
  drift?: number;
  /**
   * HOW FAR OFF THE ROAD IT WAS THROWN FROM (world px).
   *
   * Everything else here happens at bumper height, which is near enough to the
   * ground that nothing had to say so. A lamp's lens is up a column — four feet
   * for a yard light and the better part of a storey for a street-lighting mast
   * — and glass raised at road level reads as something falling out from under
   * the car rather than as a light being taken off its post.
   */
  lift?: number;
  /**
   * HOW WIDE A BODY THIS EFFECT COMES OFF (world px of radius).
   *
   * Only the `dust` wants one, and it is the whole of why that cloud reads as
   * surrounding a wreck rather than as a puff beside it: everything else here
   * is thrown from a POINT (a contact, a tyre, a bonnet) and can size itself
   * off the collision's energy alone, while a cloud raised by a car grinding
   * along on its roof is as big as the car. A bus disappears into its own, a
   * bicycle raises a wisp, and nobody had to author either — it is the fleet's
   * own `halfLengthPx`.
   */
  spread?: number;
  /** Physical fragments finish their throw, then remain on the road until the
   * car has passed them and they are safely off-screen behind it. */
  linger?: boolean;
};

/**
 * WHAT ONE CRASHED VEHICLE IS STILL OWED — the bookkeeping behind the cloud.
 *
 * IT LIVES ON THE FX STATE RATHER THAN IN A SIXTH OBJECT THREADED THROUGH THE
 * LOOP, and that is a decision rather than a shortcut. A wreck's smoke produces
 * nothing but effects — no marks on the tarmac, no draw pass of its own, which
 * is exactly what makes the skids a separate module — so the only thing it
 * needs to survive between ticks is a cadence, and it must be thrown away at
 * precisely the moment every other effect is (`clearDriveFx`, a restart). Kept
 * anywhere else, a restart would leave the new leg's first wreck inheriting the
 * old leg's clock and going quiet.
 */
export type WreckSmoke = {
  /** Drive-clock ms the next puff is due at. */
  dueMs: number;
  /** …and when this vehicle first went down, so the cloud can settle. */
  sinceMs: number;
};

/** The road's live effects, its shake and its flash — one object the screen
 * keeps on a ref. */
export type DriveFxState = {
  fx: DriveFx[];
  /** Every vehicle currently smoking, keyed on its traffic id (`stepWreckSmoke`
   * in `wreck-smoke.ts` owns it — see `WreckSmoke` for why it is parked here). */
  wrecks: Map<number, WreckSmoke>;
  /**
   * …and every vehicle currently BURNING or being SHOVED, keyed the same way and
   * holding the drive-clock ms its next issue is due at (`stepBurning` in
   * `burning.ts` owns it).
   *
   * ITS OWN MAP RATHER THAN A FIELD ON THE ONE ABOVE, because the two answer
   * different questions on different cadences and a vehicle is very often in
   * exactly one of them: a car can be alight and perfectly upright (nothing for
   * the wreck cloud to do), and a car can be on its roof in a cloud of dust
   * without a flame anywhere near it.
   */
  burns: Map<number, number>;
  /** Camera shake, in world px of amplitude, decaying every step. */
  shake: number;
  /** The white bloom over a heavy hit, 0→1, decaying every step. */
  flash: number;
  /** True where the viewer has asked for less motion: no shake, no flash, and
   * the pieces stay put. The picture still says a hit happened — it says it
   * with the grit and the sparks rather than by moving the whole frame. */
  calm: boolean;
};

/**
 * How much a hit's energy counts as "force" — `wearJoules` is the collision
 * that totals the car, so `full` is the share of the car a full-force hit of
 * this KIND costs.
 *
 * IT IS A PARAMETER BECAUSE THE ROAD'S COLLISIONS SPAN THREE ORDERS OF
 * MAGNITUDE. One yardstick for a wagon meeting a bus and a wagon meeting a
 * person prices the top of that range or the bottom, never both — and it was
 * pricing the top, so every single body under the bumper landed in the bottom
 * fifteenth of the scale and came out as a puff of dust and a tenth of a pixel
 * of shudder. It is the same complaint, and the same answer, as
 * `DRIVE.impact.crowdSpeedLossScale` on the physics side of the glass.
 *
 * EXPORTED BECAUSE THE MOTOR READS THE SAME SCALE. What the phone is asked to
 * buzz for a collision is priced off this exact number (`drive-haptics.ts`), so
 * the hit that shoves the frame hardest is the one felt hardest and the two
 * cannot drift apart — the same rule the sound bank already follows.
 */
export function forceOf(joules: number, full = SMASH_FULL_SHARE): number {
  return Math.min(1, joules / (DRIVE.impact.wearJoules * full));
}

/** What a full-force hit costs the car, for the two things this road hits.
 *
 * STEEL is the collision that takes an eighth of the wagon — trading paint at
 * speed, and everything above it is off the top of the scale anyway. A BODY is
 * priced on the crowd's own worst case instead: a person met DEAD SQUARE AT THE
 * TOP OF THE DIAL on MEDIUM, which is about 6.8% of the car. So the ladder a
 * player actually sees runs the whole way from a clip at walking pace to the
 * worst thing that can happen to somebody, rather than sitting flat at nothing.
 *
 * THE BODY FIGURE MOVES WITH THE TOP SPEED and it is not optional. It was 3.6%
 * against a 120 mph dial, and absorbed energy goes as the SQUARE of the closing
 * speed — so on a 174 mph one the same number saturates barely past halfway up
 * the speedometer, and the top half of the range shakes the frame by exactly as
 * much as the middle of it. That is the scale silently going flat at precisely
 * the speeds the whole change was made for.
 */
export const SMASH_FULL_SHARE = 0.12;
export const BODY_FULL_SHARE = 0.068;

/** How hard the frame is shaken by a hit of this force (world px). Well under
 * a lane's width at its worst: the road must stay readable while it is being
 * hit, or the shake is punishing the player twice. */
const SHAKE_PER_FORCE = 3.4;
/** How fast the shake and the flash die (per second) — a couple of frames of
 * bloom, a third of a second of shudder. */
const SHAKE_DECAY = 7;
const FLASH_DECAY = 9;

export function createDriveFx(): DriveFxState {
  return {
    fx: [],
    wrecks: new Map(),
    burns: new Map(),
    shake: 0,
    flash: 0,
    calm:
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  };
}

/**
 * A body went under the car: grit off the tarmac, and a shove of the frame.
 *
 * ON THE CROWD'S OWN SCALE (`BODY_FULL_SHARE`), which is the whole of the
 * picture's answer to "they should be felt". The shove is worth more of that
 * scale than steel is worth of its own, and that is not the crowd being made
 * more important than a car — it is the two scales being different sizes. A
 * body at the top of the dial shoves the frame about three px; a wreck still
 * reaches five and a half, and nothing about the ordering has moved.
 *
 * The BLOOM stays small on purpose. A crowd is met thirty-odd times a trip and
 * a blockade several times a second, and a white flash on every one of them
 * would leave the road unreadable at exactly the moment it most needs reading.
 */
export function driveBodyHit(
  state: DriveFxState,
  x: number,
  y: number,
  joules: number,
  nowMs: number,
): void {
  const force = forceOf(joules, BODY_FULL_SHARE);
  push(state, "grit", x, y, nowMs, 520, force);
  kick(state, force * 0.9, force * 0.2);
}

/** Paint traded with another car: sparks, shards, and a much harder shove. */
export function driveTrafficHit(
  state: DriveFxState,
  x: number,
  y: number,
  joules: number,
  nowMs: number,
): void {
  const force = forceOf(joules);
  push(state, "spark", x, y, nowMs, 420, force);
  push(state, "shard", x, y, nowMs, 700, force);
  kick(state, force, force);
}

/**
 * THE BIG ONE — a car folded up, put on its roof, or destroyed outright.
 *
 * ITS OWN FUNCTION BECAUSE IT HAS ITS OWN CEILING. Every other effect on this
 * road shares one shake clamp, and it is set where it is on purpose: the road
 * has to stay readable while it is being hit, and a frame thrown about by every
 * body under the bumper is punishing the player twice. But the same clamp
 * applied to a wreck meant the largest thing that can happen out here shoved the
 * frame exactly as hard as clipping a lamp post did — which is the picture's
 * half of "the crashes feel thin". So the terminal events get a ceiling of their
 * own, a third higher, and nothing else can reach it.
 *
 * It is also three effects rather than one: sparks off the contact, shards off
 * the bodywork, and glass out of the air where the windows were.
 */
export function driveSmash(
  state: DriveFxState,
  x: number,
  y: number,
  joules: number,
  nowMs: number,
): void {
  const force = forceOf(joules);
  push(state, "spark", x, y, nowMs, 520, 1);
  push(state, "shard", x, y, nowMs, 1100, 1);
  push(state, "glass", x, y, nowMs, 900, 0.9, false, 0, WRECK_GLASS_LIFT);
  // THE AIR AND ROAD DUST THE BODY DISPLACES. The glass and steel above fly;
  // this one opens at the contact and hangs there, which is the immediate puff
  // a hard collision needs before the wreck's longer smoke cadence takes over.
  push(state, "dust", x, y, nowMs, 950, 0.72, false, 0, 1, 18);
  kick(state, 1.1 + force, 0.8, SMASH_SHAKE_MAX);
}

/** How far off the road a car carries its windows (world px) — where the
 * shards come out of when a wreck loses them. The same figure the ejection's
 * own screen burst uses, kept here because a wreck's glass and a body's exit
 * are the same pane at the same height. */
const WRECK_GLASS_LIFT = 12;

/** A panel climbed a rung, or a part worked free: shards off the car. */
export function drivePartHit(
  state: DriveFxState,
  x: number,
  y: number,
  nowMs: number,
  shed: boolean,
): void {
  push(state, "shard", x, y, nowMs, shed ? 900 : 520, shed ? 0.8 : 0.45);
  kick(state, shed ? 0.5 : 0.25, 0);
}

/** The engine has died: smoke off the bonnet for as long as the wreck rolls and
 * then sits. It RIDES the car (see `DriveFx.follow`) — a dead engine's smoke
 * belongs to the engine, not to the patch of road it gave up on. */
export function driveBreakdown(
  state: DriveFxState,
  x: number,
  y: number,
  nowMs: number,
): void {
  push(state, "smoke", x, y, nowMs, DRIVE.breakdownHoldMs, 1, true);
  kick(state, 0.7, 0.2);
}

/**
 * A LOCKED TYRE, BURNING — one puff off the back axle, raised on a cadence for
 * as long as the handbrake is dragging the car down (`stepSkids`).
 *
 * It shakes NOTHING. Every other effect on this road is a collision and shoves
 * the frame to say so; a stop is the player getting something RIGHT, and a
 * camera that punished a good handbrake exactly as it punishes hitting a van
 * would be telling him the opposite of what happened. The picture says it with
 * smoke, the rubber on the road and the nose going down.
 */
export function driveTyreSmoke(
  state: DriveFxState,
  x: number,
  y: number,
  nowMs: number,
  force: number,
  /** Which way the car is going, so the cloud falls away BEHIND it. */
  direction: 1 | -1,
): void {
  push(state, "tyresmoke", x, y, nowMs, 620, force, false, -direction);
}

/**
 * A CRASHED CAR'S OWN CLOUD — one billow, centred on the wreck and as wide as
 * the wreck is.
 *
 * It is raised on a cadence rather than once (`stepWreckSmoke`), which is what
 * makes it both things it needs to be: laid every few frames while the thing is
 * still grinding down the road, the emissions trail behind it as a wall of dust,
 * and laid at the same spot once it has stopped, they pile into a pall standing
 * over it. One effect, two readings, and neither of them needed a second kind.
 *
 * IT SHAKES NOTHING AND FLASHES NOTHING. The collision that made the wreck has
 * already shoved the frame as hard as this road ever shoves it (`driveSmash`);
 * a cloud that kicked as well would be charging the player twice for one event
 * and would keep charging him for the four seconds the dust hangs there.
 */
export function driveWreckDust(
  state: DriveFxState,
  x: number,
  y: number,
  nowMs: number,
  force: number,
  /** How wide the thing under it is (world px) — the fleet's own half-length. */
  spread: number,
): void {
  // THE ONE EFFECT ON THIS ROAD THAT IS BOUNDED, because it is the one that is
  // ISSUED RATHER THAN THROWN. Everything else here comes off a collision, and
  // there are only ever so many collisions in a frame; a cloud is raised on a
  // cadence for as long as a wreck exists, so a hero who has just ploughed a
  // lane of traffic has five of them each laying a billow every few frames and
  // every billow standing for the better part of two seconds. The cap is well
  // over what one wreck can hold up (its whole slide plus its whole settle) and
  // well under what five can, which is exactly where a safety valve belongs.
  let live = 0;
  for (const one of state.fx) if (one.kind === "dust") live++;
  if (live >= DUST_MAX) {
    const oldest = state.fx.findIndex((one) => one.kind === "dust");
    if (oldest >= 0) state.fx.splice(oldest, 1);
  }
  push(state, "dust", x, y, nowMs, DUST_LIFE_MS, force, false, 0, 0, spread);
}

/**
 * …AND THE DEAD ENGINE UNDER IT, once the wreck has come to rest: the same slow
 * dark column the hero's own breakdown raises, standing where the car stopped.
 *
 * IT DOES NOT FOLLOW, and that is the fix rather than an omission. A wrecked car
 * used to be handed `driveBreakdown`, whose column is pinned to the hero's wagon
 * (`DriveFx.follow` — right for the hero's own engine dying, and the only thing
 * `drawDriveFx` is ever given a position for). So every car the player finished
 * lit a plume on HIS OWN BONNET and left the actual wreck sitting in the road
 * perfectly clean. A stopped wreck needs no following at all: it is not going
 * anywhere, which is the whole point of it.
 */
export function driveWreckSmoke(
  state: DriveFxState,
  x: number,
  y: number,
  nowMs: number,
  lifeMs: number,
): void {
  push(state, "smoke", x, y, nowMs, lifeMs, 1);
}

/** How long one billow hangs about (ms). Long — a dust cloud outlasts every
 * other effect on this road by a factor of three, because settling is what dust
 * DOES and a cloud that vanished in half a second would read as a puff. */
const DUST_LIFE_MS = 1900;
/** …and the most that may be standing at once, over every wreck on the road —
 * see `driveWreckDust`. */
const DUST_MAX = 30;

/**
 * A STREET LIGHT HAS BEEN TAKEN OFF ITS POST: its lens, in pieces, out of the
 * air where the lamp head was.
 *
 * The force is not the collision's. A lamp is glass on the end of a lever, and
 * what shatters it is the column whipping over rather than the joules the
 * bumper spent — so a light clipped at forty comes apart much like one hit at a
 * hundred, and tying the burst to the impact made a slow nudge produce three
 * apologetic specks.
 */
export function driveLampGlass(
  state: DriveFxState,
  x: number,
  y: number,
  lift: number,
  nowMs: number,
): void {
  push(state, "glass", x, y, nowMs, 1100, 0.85, false, 0, lift);
}

/**
 * A HEAD-ON EMPTYING ITSELF THROUGH ITS OWN WINDSCREEN.
 *
 * FULL FORCE WHATEVER THE JOULES SAY, which is the same call the split sound
 * and the machine-snap burst already make and for the same reason: the engine
 * has decided this is a head-on (`windscreenGore`, raised only inside the rule),
 * and a head-on has no gentle version. Sizing it off the collision's energy
 * would make the sight the player is deliberately aiming at come out thin at
 * exactly the speeds the rule exists to guarantee it at.
 *
 * LONGER-LIVED THAN THE GLASS BESIDE IT, because liquid does not stop when the
 * shards do: the drops are still coming down while the wagon is going past.
 */
export function driveWindscreenGore(
  state: DriveFxState,
  x: number,
  y: number,
  lift: number,
  nowMs: number,
): void {
  push(state, "blood", x, y, nowMs, 1500, 1, false, 0, lift);
}

/**
 * A CAR ALIGHT — one flame, at the vehicle, sized by how far the burn has got.
 *
 * ISSUED ON A CADENCE at the vehicle's own place rather than followed, the same
 * shape `stepWreckSmoke` uses and for the same reason: `DriveFx.follow` means
 * THE HERO'S CAR, so a burning car that set it would light a fire on the
 * player's own bonnet. A fire on a car that is being pushed up the road has to
 * travel with the car, and the only honest way is to re-issue it where the car
 * now is.
 *
 * `force` is the burn itself (`DriveTraffic.fire`), which is what picks the
 * stage of the flame ladder — so the player watches a flicker under a wing
 * become an engine bay going up, rather than a fire switching on.
 *
 * THE MODE IS ANSWERED HERE, WHERE THE EFFECT IS DECIDED, never at the draw —
 * the rule the whole gore system rests on. `fairy` picks the star fountain
 * instead (`star-fire.ts`); the same `force`, the same cadence and the same
 * lift feed either, so a burn grows identically in both modes.
 */
export function driveVehicleFire(
  state: DriveFxState,
  x: number,
  y: number,
  nowMs: number,
  force: number,
  /** How far off the road it burns (world px) — a bonnet, not the tarmac. */
  lift: number,
  lifeMs: number,
  fairy = false,
): void {
  push(
    state,
    fairy ? "starfire" : "fire",
    x,
    y,
    nowMs,
    lifeMs,
    force,
    false,
    0,
    lift,
  );
}

/**
 * THE TANK GOING — and the one moment on this road allowed to be too much.
 *
 * FULL FORCE WHATEVER THE JOULES SAY, which is the same call the windscreen gore
 * and the machine snap already make: the engine has decided a fuel tank has
 * exploded, and an explosion has no gentle version. It is SIX effects at once
 * because that is what the eye needs to read it as one event — the ball, the
 * sparks thrown out of it, the shards of what used to be a car, and the pall
 * that hangs there afterwards — and it takes the frame harder than anything
 * else out here, which is the ceiling `SMASH_SHAKE_MAX` exists for.
 *
 * ONLY THE BALL CHANGES IN SFW. The sparks, the shards, the glass, the black
 * column, the pall and the pressure front are all things STEEL and AIR did, and
 * the mode has never withheld those — a blast the player could not read would
 * lose him the biggest event on the road. What is swapped is the fire itself,
 * for the popper's worth of stars that goes with the fizz the wreck then burns
 * with (`star-fire.ts`); the alternative is a golden fountain rising out of an
 * orange fireball on the same car half a second apart.
 */
export function driveBlast(
  state: DriveFxState,
  x: number,
  y: number,
  nowMs: number,
  /** THE RARE ONE — carried on the event rather than rolled here, so what the
   * player sees and what he hears are the same tank. */
  big = false,
  fairy = false,
): void {
  push(
    state,
    fairy ? "starblast" : "blast",
    x,
    y,
    nowMs,
    BLAST_MS,
    1,
    false,
    0,
    BLAST_LIFT,
  );
  push(state, "spark", x, y, nowMs, 620, 1, false, 0, BLAST_LIFT);
  push(state, "shard", x, y, nowMs, 1300, 1, false, 0, BLAST_LIFT);
  push(state, "glass", x, y, nowMs, 1000, 1, false, 0, BLAST_LIFT);
  // A black column climbs through the fireball and remains after its bright
  // petals are gone. Wide at the base, then pulled behind the launched car.
  push(state, "smoke", x, y, nowMs, 3600, 1, false, 0, 24, 24);
  // …and the smoke it leaves, wide and low, which is what is still there when
  // the player looks in his mirror.
  push(state, "dust", x, y, nowMs, DUST_LIFE_MS * 1.4, 1, false, 0, 0, 26);
  // …AND, ON THE RARE ONE, THE PRESSURE THAT REACHES THE WHOLE PICTURE. WHICH
  // tank that is comes in on the event (`DriveEvent.trafficExploded.big`), so
  // the ring, the sound and the road all agree without any of them re-rolling
  // it — see `blowsBig` in engine/game/drive/wreckage.ts.
  if (big) push(state, "shockwave", x, y, nowMs, SHOCKWAVE_MS, 1);
  kick(state, 2.6, 1.6, SMASH_SHAKE_MAX);
}

/**
 * HOW LONG THE WAVE TAKES TO CROSS THE FRAME, and how far it gets — BOTH THE
 * ENGINE'S, because the engine is what puts the street lights out as the front
 * passes them (`stepShockwaves`).
 *
 * A ring drawn on one clock over lamps blown on another is the one way this
 * effect can be actively wrong: the lights would go out ahead of the wave, or
 * behind it, and either reads as a bug rather than as a blast. So there is one
 * pair of numbers (`DRIVE.wreckage.shockwave`) and the drawing reads it.
 */
const SHOCKWAVE_MS = DRIVE.wreckage.shockwave.ms;

function shockwaveReachPx(): number {
  return DRIVE.wreckage.shockwave.reachPx;
}

/** How long the fireball itself lasts (ms) — short, because a fireball is: what
 * outlives it is the smoke and the burn underneath. */
const BLAST_MS = 820;
/** …and how far off the road its middle sits (world px). A tank is under the
 * boot, so the ball opens at about knee height rather than on the tarmac. */
const BLAST_LIFT = 10;

/**
 * STEEL BEING GROUND UP THE ROAD — the sparks under a car the wagon is pushing.
 *
 * Small and often rather than big and once: this is issued on a cadence for as
 * long as the shove lasts (`stepVehicleFires`), so what the player sees is a
 * continuous stream of sparks from under the wreck he is bullying along, which
 * is the picture's half of "you are dragging this". It shakes NOTHING — the
 * collision that started the shove already took its shake, and a frame that
 * juddered for the whole of a push would be charging him for one event twice.
 */
export function driveGrindSparks(
  state: DriveFxState,
  x: number,
  y: number,
  nowMs: number,
  force: number,
): void {
  push(state, "spark", x, y, nowMs, 300, 0.25 + force * 0.4);
}

/** Everything the road throws away when the leg restarts. */
export function clearDriveFx(state: DriveFxState): void {
  state.fx.length = 0;
  state.wrecks.clear();
  state.burns.clear();
  state.shake = 0;
  state.flash = 0;
}

function push(
  state: DriveFxState,
  kind: DriveFxKind,
  x: number,
  y: number,
  bornMs: number,
  lifeMs: number,
  force: number,
  follow = false,
  drift = 0,
  lift = 0,
  spread = 0,
): void {
  state.fx.push({
    kind,
    x,
    y,
    bornMs,
    lifeMs,
    force,
    follow,
    drift,
    lift,
    spread,
    linger: kind === "glass" || kind === "shard",
    // The seed is the spawn POSITION rather than a draw — a `Math.random` here
    // would be fine (it is spawn-time, not per-frame), but deriving it means an
    // identical road replays with an identical picture, which is what makes a
    // filmstrip of a tuning change worth comparing.
    seed: Math.abs(Math.round(x * 7 + y * 13 + bornMs)) % 1024,
  });
}

/**
 * Shove the frame and bloom it, unless the viewer asked for calm.
 *
 * `most` is the ceiling this particular event may push the shake to — the
 * ordinary one for everything, and a higher one for the handful of terminal
 * events that are allowed to be the biggest thing that has happened (see
 * `driveSmash`). It is a ceiling rather than a multiplier so a wreck landing in
 * the middle of a blockade cannot stack the two into something unreadable.
 */
function kick(
  state: DriveFxState,
  shake: number,
  flash: number,
  most = SHAKE_MAX,
): void {
  if (state.calm) return;
  state.shake = Math.min(most, state.shake + shake);
  state.flash = Math.min(0.5, state.flash + flash * 0.35);
}

/** The ordinary shake ceiling, and the one a wreck may reach. Both in the same
 * units `SHAKE_PER_FORCE` turns into world px — so the everyday worst is about
 * a fifth of a lane and a rollover is about a third of one. */
const SHAKE_MAX = 1.6;
const SMASH_SHAKE_MAX = 2.4;

/** Age everything by one step of the DRIVE's own clock. */
export function stepDriveFx(
  state: DriveFxState,
  dtMs: number,
  nowMs: number,
  carX?: number,
  direction: 1 | -1 = 1,
): void {
  const dt = dtMs / 1000;
  state.shake = Math.max(0, state.shake - state.shake * SHAKE_DECAY * dt);
  state.flash = Math.max(0, state.flash - state.flash * FLASH_DECAY * dt);
  if (state.shake < 0.01) state.shake = 0;
  if (state.flash < 0.004) state.flash = 0;
  state.fx = state.fx.filter((fx) => {
    if (nowMs - fx.bornMs < fx.lifeMs) return true;
    if (!fx.linger || carX === undefined) return false;
    return (fx.x - carX) * direction > -DRIVE.despawnBehindPx;
  });
}

/**
 * Where the camera actually stands this frame — the shake, applied to the
 * camera rather than to a `ctx.translate`, so the effects, the gore and the
 * road all move together instead of sliding against each other.
 *
 * A COLLISION IS THE ONLY THING THAT MOVES THIS CAMERA, and that is a decision
 * rather than an omission. The road used to carry a permanent SPEED TREMBLE as
 * well — a wobble rising with the square of the speed, meant to say "this wagon
 * is thirty years old and doing 120". What it actually said was that the game
 * was broken: at the top end every house, every lamp post and the car itself
 * jittered a pixel back and forth several times a second, and a picture made of
 * hard-edged pixel art has no motion blur to hide that in. It read as a bad
 * frame rate, not as a fast car — and worse, it left nothing for a real hit to
 * do, because the frame was already shaking before anything was struck. Silence
 * between the blows is what makes a blow land.
 */
export function shakeCamera(
  state: DriveFxState,
  camera: Camera,
  nowMs: number,
): Camera {
  const amount = state.calm ? 0 : state.shake;
  if (amount <= 0) return camera;
  const amp = amount * SHAKE_PER_FORCE;
  // Two incommensurate rates, so the shudder never settles into a wobble.
  return {
    x: camera.x + Math.sin(nowMs * 0.09) * amp,
    y: camera.y + Math.sin(nowMs * 0.137 + 1.7) * amp * 0.6,
  };
}

/** Deterministic scatter: the seeded hash every canvas draw in the game uses
 * instead of `Math.random`, which would reshuffle the picture every frame. */
function fract(n: number): number {
  return n - Math.floor(n);
}
function scatter(seed: number, i: number, salt: number): number {
  return fract(Math.sin(seed * 0.017 + i * 12.9898 + salt) * 43758.5453);
}

/**
 * WHICH HALF OF THE ROAD'S EFFECTS THIS CALL DRAWS.
 *
 * TWO PASSES, BECAUSE ONE OF THESE THINGS IS ON THE TARMAC. Everything the road
 * throws used to be painted over the finished picture, which is right for a
 * spark, a shard in the air, smoke and a fireball — and wrong for GLASS, which
 * comes out of a window, falls to the road and STAYS there (`DriveFx.linger`).
 * Drawn last it was laid across the cars standing on top of it: a wreck with a
 * field of bright slivers over its roof, and the wagon driving through its own
 * mess with the mess on the bonnet. The road already learned this about blood
 * (see `drawRoadMarks`'s note above the body pass) — glass is the same fact.
 *
 * So `ground` is what belongs UNDER the traffic and is drawn from inside
 * `drawDrive` between the lamp pools and the y-sorted bodies; `air` is
 * everything else and is still drawn over the finished frame, and it is the one
 * that carries the bloom. `all` is neither seam and exists for a host that draws
 * the road in one go.
 */
export type DriveFxLayer = "ground" | "air" | "all";

/** The kinds that belong on the tarmac rather than over the picture. */
function onGround(kind: DriveFxKind): boolean {
  return kind === "glass";
}

/** Draw everything the road has thrown, over the finished picture. */
export function drawDriveFx(
  ctx: CanvasRenderingContext2D,
  state: DriveFxState,
  camera: Camera,
  nowMs: number,
  viewW: number,
  viewH: number,
  /** Where the car is NOW — where a `follow` effect is drawn instead of where it
   * was born. Omitted leaves every effect on the road, which is what all but one
   * of them want. */
  carAt?: { x: number; y: number },
  /** The atlas, for the effects out here made of AUTHORED ART rather than of
   * particles — glass, the burn and the blast. Omitted (a still that has no atlas to
   * hand) leaves glass on its one-pixel fallback and draws neither fire effect:
   * they are the one pair on this road with nothing
   * to fall back to, because a fire drawn as a cloud of orange dots is sparks. */
  sprites?: Sprites,
  /** Which half to draw — see `DriveFxLayer`. Omitted draws the lot in one
   * pass, which is what a host with no body pass of its own wants. */
  layer: DriveFxLayer = "all",
): void {
  for (const fx of state.fx) {
    if (layer !== "all" && onGround(fx.kind) !== (layer === "ground")) continue;
    const t = Math.min(1, Math.max(0, (nowMs - fx.bornMs) / fx.lifeMs));
    const at = fx.follow && carAt ? carAt : fx;
    // THROUGH THE PROJECTION, like everything else with a place on this road.
    // The world is drawn raked (`applyWorldProjection`, pitch 0.75) and every
    // body is seated by `bodyAnchor*`; an effect that took the raw camera
    // offset instead would sit a lane and a half below the collision it came
    // from — invisible on a flat road, glaring the moment the pitch is dialled.
    const sx = bodyAnchorX(at.x, at.y, camera.x, camera.y);
    const sy = bodyAnchorY(at.x, at.y, camera.x, camera.y);
    if (fx.kind === "spark") drawSparks(ctx, fx, t, sx, sy);
    else if (fx.kind === "grit") drawGrit(ctx, fx, t, sx, sy);
    else if (fx.kind === "shard") drawShards(ctx, fx, t, sx, sy);
    else if (fx.kind === "tyresmoke") drawTyreSmoke(ctx, fx, t, sx, sy);
    else if (fx.kind === "dust") drawDust(ctx, fx, t, sx, sy);
    else if (fx.kind === "glass") drawGlass(ctx, fx, t, sx, sy, sprites);
    else if (fx.kind === "shockwave") drawShockwave(ctx, fx, t, sx, sy);
    else if (fx.kind === "blood") drawBlood(ctx, fx, t, sx, sy);
    // THE TWO SFW BURNS NEED NO ATLAS, which is the one practical difference
    // between them and the pair below: they are drawn out of primitives, so a
    // host with no sprites to hand still gets the whole effect rather than
    // nothing.
    else if (fx.kind === "starfire") drawStarFire(ctx, fx, t, sx, sy);
    else if (fx.kind === "starblast") drawStarBlast(ctx, fx, t, sx, sy);
    else if (fx.kind === "fire") {
      if (sprites) drawFire(ctx, sprites, fx, t, sx, sy, nowMs);
    } else if (fx.kind === "blast") {
      if (sprites) drawBlast(ctx, sprites, fx, t, sx, sy);
    } else drawSmoke(ctx, fx, t, sx, sy);
  }
  // THE BLOOM GOES LAST AND GOES ADDITIVE: a heavy hit whites the frame out
  // rather than laying a grey sheet over it. `lighter` over a dark road is a
  // flash; `source-over` would be a fog.
  //
  // …AND IT BELONGS TO THE PASS OVER THE FINISHED FRAME. A bloom laid under the
  // traffic would be a bright rectangle with cars painted on top of it, which is
  // a lit floor rather than a flash.
  if (layer !== "ground" && state.flash > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = `rgba(255, 244, 214, ${(state.flash * 0.5).toFixed(3)})`;
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.restore();
  }
}

/**
 * THE PRESSURE LEAVING THE CAR — a ring that travels outward across the whole
 * picture.
 *
 * IT IS A CIRCLE, and that is a decision rather than an oversight. Everything
 * else on this road that measures ground goes through the projection and comes
 * out squashed, which is right for a thing lying ON the tarmac — a lamp's pool,
 * a puddle of blood. A blast front is not on the tarmac: it is a sphere of air
 * leaving a fuel tank, and what the player sees of it is the part at his own
 * eye level, which is round. Drawn as a floor ellipse it read as a ripple in a
 * puddle under the wreck; drawn round it reads as the thing that reached him,
 * which is the whole point of the effect.
 *
 * THREE THINGS MAKE IT A WAVE RATHER THAN A GROWING CIRCLE, and each is a beat
 * the eye already knows:
 *
 *   IT DECELERATES. A blast front leaves at its fastest and is spent slowing
 *   down, so the radius runs on an ease-out (`t * (2 - t)`) rather than
 *   linearly — most of the ground is covered in the first third, which is what
 *   makes it feel like something LEFT rather than something inflated.
 *   IT THINS AS IT GOES. The same energy is spread around a longer and longer
 *   circumference, so the line narrows and dims with the radius. A ring of
 *   constant weight reads as a drawn shape; one that gives out reads as air.
 *   IT HAS A FRONT AND A WAKE. A hard bright leading line with a soft warm haze
 *   trailing just inside it — the compression, then the hot air behind it —
 *   which is what stops it looking like a hoop.
 *
 * ADDITIVE, because it is light and heat over a night road (`lighter`); a
 * source-over ring would be a grey line laid across the picture.
 */
function drawShockwave(
  ctx: CanvasRenderingContext2D,
  fx: DriveFx,
  t: number,
  sx: number,
  sy: number,
): void {
  const ease = t * (2 - t);
  // THE RADIUS IS THE ROAD'S OWN, run through the projection ALONG the road and
  // then used in both axes — so the ring is a true circle on the screen while
  // still travelling at the speed the engine's own front travels at
  // (`stepShockwaves`, which is what decides when each street light goes out).
  // Asking the projection rather than hardcoding a scale keeps the two in step
  // if the pitch is ever dialled.
  const r = Math.abs(projectOffset(shockwaveReachPx() * fx.force * ease, 0).x);
  if (r < 1) return;
  const rx = r;
  const ry = r;
  // WHAT IS LEFT OF IT, and it is a LINEAR give rather than a squared one. The
  // first cut faded on `(1-t)²`, which is the honest curve for a thing spending
  // its energy round a growing circumference and the wrong one for a thing that
  // has to be SEEN: by the time the front had crossed the frame it was a
  // one-pixel line at a third alpha, so the whole second half of the effect was
  // a ring nobody could point at. It gives out; it does not vanish while it is
  // still on screen.
  const spent = Math.max(0, 1 - t);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  // THE WAKE FIRST — the hot air behind the front, wide and dim, drawn under
  // the line so the line stays the brightest thing in it.
  ctx.strokeStyle = `rgba(255, 168, 92, ${(spent * 0.22).toFixed(3)})`;
  ctx.lineWidth = Math.max(1, 16 * spent);
  ctx.beginPath();
  ctx.ellipse(
    sx,
    sy,
    Math.max(1, rx * 0.88),
    Math.max(1, ry * 0.88),
    0,
    0,
    TAU,
  );
  ctx.stroke();
  // …AND THE FRONT: near white while it is still close, cooling to the same
  // orange as it goes, and thinning the whole way.
  const heat = Math.max(0, 1 - t * 1.8);
  ctx.strokeStyle = `rgba(255, ${Math.round(206 + heat * 44)}, ${Math.round(
    158 + heat * 88,
  )}, ${(spent * 0.9).toFixed(3)})`;
  ctx.lineWidth = Math.max(1, 6 * spent);
  ctx.beginPath();
  ctx.ellipse(sx, sy, rx, ry, 0, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

const TAU = Math.PI * 2;

/** Scraped metal — the one effect that is LIGHT, so it is drawn additively and
 * fades from white through the orange a steel scrape actually throws. */
function drawSparks(
  ctx: CanvasRenderingContext2D,
  fx: DriveFx,
  t: number,
  sx: number,
  sy: number,
): void {
  const count = Math.round(6 + fx.force * 22);
  const ease = t * (2 - t);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < count; i++) {
    const angle = scatter(fx.seed, i, 0) * Math.PI * 2;
    const reach = (6 + scatter(fx.seed, i, 1) * 26) * (0.4 + fx.force);
    const lift = scatter(fx.seed, i, 2) * 9;
    const px = sx + Math.cos(angle) * reach * ease;
    const py = sy + Math.sin(angle) * reach * ease * 0.45 - lift * ease;
    const heat = 1 - t;
    ctx.fillStyle = `rgba(255, ${Math.round(150 + heat * 90)}, ${Math.round(
      60 + heat * 70,
    )}, ${(heat * 0.9).toFixed(3)})`;
    ctx.fillRect(Math.round(px), Math.round(py), 1, 1);
  }
  ctx.restore();
}

/**
 * Road grit and dust off a body meeting the bumper.
 *
 * PALE, NOT DARK, and that is the whole lesson of the first cut: dust drawn in
 * its own honest colour is a dark speck on dark tarmac at night, and a dozen of
 * them are invisible. The road is lit by one pair of headlights, so what is
 * thrown up in front of a car is LIT — pale, and briefly the brightest thing
 * near the wheel. The puff also grows and thins rather than merely fading, so it
 * reads as dust rather than as pixels being turned off.
 */
function drawGrit(
  ctx: CanvasRenderingContext2D,
  fx: DriveFx,
  t: number,
  sx: number,
  sy: number,
): void {
  const count = Math.round(7 + fx.force * 16);
  const ease = t * (2 - t);
  ctx.save();
  for (let i = 0; i < count; i++) {
    const angle = scatter(fx.seed, i, 3) * Math.PI * 2;
    const reach = (5 + scatter(fx.seed, i, 4) * 20) * (0.5 + fx.force);
    const px = sx + Math.cos(angle) * reach * ease;
    const py = sy + Math.sin(angle) * reach * ease * 0.4 - ease * 4;
    const size = scatter(fx.seed, i, 9) > 0.6 ? 2 : 1;
    ctx.fillStyle = `rgba(206, 198, 178, ${((1 - t) * 0.55).toFixed(3)})`;
    ctx.fillRect(Math.round(px), Math.round(py), size, size);
  }
  ctx.restore();
}

/**
 * A LAMP'S LENS, COMING APART IN THE AIR.
 *
 * Three things separate it from the panel shards below, and each is the
 * difference between glass and steel. It starts UP (`fx.lift`) and falls the
 * whole way down under gravity rather than lobbing, so the eye follows it off
 * the post. It is PALE and lit — the pieces were burning a moment ago, so they
 * open warm and cool to a cold glitter as they drop, which is also the only way
 * a fragment reads at all against night tarmac. And it TWINKLES: each piece
 * catches the light on its own cycle, because a tumbling shard is only bright
 * when a face happens to point at you, and a field of steady dots reads as
 * confetti.
 */
function drawGlass(
  ctx: CanvasRenderingContext2D,
  fx: DriveFx,
  t: number,
  sx: number,
  sy: number,
  sprites?: Sprites,
): void {
  const count = Math.round((14 + fx.force * 18) * GLASS_DENSITY);
  const lift = fx.lift ?? 0;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < count; i++) {
    const angle = scatter(fx.seed, i, 11) * Math.PI * 2;
    const reach = (4 + scatter(fx.seed, i, 12) * 22) * (0.4 + fx.force);
    const px = sx + Math.cos(angle) * reach * t;
    // Out of the head, then down: a small upward kick spent almost at once, and
    // the whole drop from the lens to the road underneath it.
    const kick = 5 + scatter(fx.seed, i, 13) * 7;
    const fall = lift - kick * t * 2 + (lift + 20) * t * t;
    const py =
      sy + Math.sin(angle) * reach * t * 0.4 - Math.max(0, lift - fall);
    const spin = Math.sin(t * (7 + scatter(fx.seed, i, 14) * 9) * Math.PI);
    const glint =
      t >= 0.98
        ? 0.18 + scatter(fx.seed, i, 16) * 0.3
        : Math.max(0, spin) * (1 - t * 0.7);
    const warm = Math.max(0, 1 - t * 2.4);
    ctx.globalAlpha = glint * 0.85;
    const shard = sprites
      ? spriteByName(sprites, GLASS_SHARDS[i % GLASS_SHARDS.length]!)
      : undefined;
    if (shard) {
      ctx.save();
      ctx.translate(Math.round(px), Math.round(py));
      ctx.rotate(t * (5 + scatter(fx.seed, i, 15) * 8));
      ctx.drawImage(
        shard,
        -Math.round(shard.width / 2),
        -Math.round(shard.height / 2),
      );
      ctx.restore();
    } else {
      ctx.fillStyle = `rgb(255, ${Math.round(240 - warm * 24)}, ${Math.round(
        214 + warm * 20,
      )})`;
      ctx.fillRect(Math.round(px), Math.round(py), 1, 1);
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/**
 * HOW MUCH OF THE GLASS IS ACTUALLY DRAWN — 0.7, which is thirty per cent fewer
 * pieces than every emitter asks for.
 *
 * IT IS A THINNING RATHER THAN A RE-TUNE, and it is one number rather than four
 * because the three places that throw glass (`driveSmash`, `driveBlast`, a
 * lamp's lens) are the same event seen at three sizes: whatever a windscreen is
 * worth, a fireball is worth more and a street light less, and the RATIOS
 * between them are right. What was wrong was the absolute count. Glass is drawn
 * additively and LINGERS on the road (`DriveFx.linger`), so a busy stretch
 * accumulated fields of bright slivers that read as sequins on the tarmac and,
 * worse, as the brightest thing in a frame whose subject is somewhere else. At
 * seven tenths a windscreen is still a spray rather than a sprinkle and the road
 * behind it stays readable.
 *
 * It is applied in the DRAW rather than at the emitters for the same reason it
 * is one number: an emitter's `force` is what the collision was worth, and
 * nothing about the collision changed.
 */
const GLASS_DENSITY = 0.7;

/** Six authored silhouettes rather than one square particle repeated. Small
 * enough to remain shards at 1x; different enough that a windscreen becomes a
 * field of slivers, chips and corners when it crosses the headlights. */
const GLASS_SHARDS = [
  "drive_glass_shard_0",
  "drive_glass_shard_1",
  "drive_glass_shard_2",
  "drive_glass_shard_3",
  "drive_glass_shard_4",
  "drive_glass_shard_5",
] as const;

/**
 * THE SPRAY OUT OF A WINDSCREEN — a lot of it, thrown forward and down.
 *
 * THREE THINGS AT ONCE, and it needs all three to read as liquid rather than as
 * red confetti. A CLOUD of atomized colour under everything, which is what makes
 * the moment land before a single drop has travelled anywhere; the DROPS
 * themselves, thrown down the road on the closing speed and falling under
 * gravity; and the FAT ONES, drawn two px rather than one, because a spray of
 * uniform specks reads as dust and real blood comes out in gouts as well as in
 * mist.
 *
 * PLAIN ALPHA, NEVER `lighter` — the same rule the run's own blood cloud obeys.
 * Additive is the obvious choice for anything thrown into the air and it is
 * wrong here: it makes dark red over dark tarmac draw very nearly nothing, when
 * what is wanted is a wash the road is seen THROUGH.
 *
 * IT GOES FORWARD, not outward. A radial burst is what an explosion does; what
 * comes out of a windscreen at the sum of two speeds is going one way, and the
 * cone is narrow for the same reason the gore's own scatter is damped
 * (`DRIVE.gore.chunkAcross`).
 */
function drawBlood(
  ctx: CanvasRenderingContext2D,
  fx: DriveFx,
  t: number,
  sx: number,
  sy: number,
): void {
  const lift = fx.lift ?? 0;
  ctx.save();
  // THE CLOUD, first and underneath: three soft blooms that open fast and thin
  // out, so the hole in the glass is red before anything has reached the road.
  const bloom = Math.max(0, 1 - t * 1.9);
  if (bloom > 0) {
    for (let i = 0; i < 3; i++) {
      const spread = 3 + scatter(fx.seed, i, 31) * 5;
      const cx = sx + (2 + i * 4) * t * 3;
      const cy = sy - lift + (scatter(fx.seed, i, 32) - 0.5) * 6 + lift * t * t;
      const r = spread * (0.6 + t * 2.2);
      ctx.fillStyle = `rgba(122, 16, 20, ${(bloom * 0.42).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(Math.round(cx), Math.round(cy), r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // …then the drops. A LOT of them: this is the one moment on the road where
  // the picture is allowed to be too much, because it is the one the player
  // aimed at.
  const count = 46;
  for (let i = 0; i < count; i++) {
    const along = 0.25 + scatter(fx.seed, i, 21) * 1.4;
    const across = (scatter(fx.seed, i, 22) - 0.5) * 0.7;
    const reach = 26 + scatter(fx.seed, i, 23) * 44;
    const kick = 6 + scatter(fx.seed, i, 24) * 16;
    const px = sx + along * reach * t;
    // Out of the hole, then down: a short upward kick and the whole drop from
    // the screen to the tarmac under it.
    const py =
      sy - lift + across * reach * t * 0.35 - kick * t + (lift + 26) * t * t;
    const fade = Math.max(0, 1 - t * 1.15);
    const fat = scatter(fx.seed, i, 25) > 0.72;
    const dark = scatter(fx.seed, i, 26) > 0.5;
    ctx.fillStyle = dark
      ? `rgba(122, 16, 20, ${(fade * 0.95).toFixed(3)})`
      : `rgba(196, 34, 34, ${(fade * 0.9).toFixed(3)})`;
    const w = fat ? 2 : 1;
    ctx.fillRect(Math.round(px), Math.round(py), w, w);
  }
  ctx.restore();
}

/** Panel shards — bigger, darker, and they fall: what comes off a car is
 * heavier than what comes off the road. */
function drawShards(
  ctx: CanvasRenderingContext2D,
  fx: DriveFx,
  t: number,
  sx: number,
  sy: number,
): void {
  const count = Math.round(3 + fx.force * 9);
  ctx.save();
  for (let i = 0; i < count; i++) {
    const angle = scatter(fx.seed, i, 5) * Math.PI * 2;
    const reach = (8 + scatter(fx.seed, i, 6) * 30) * (0.4 + fx.force);
    // Thrown out and DOWN: the arc is a lob, so the pieces read as having
    // weight rather than as a flat expanding ring.
    const px = sx + Math.cos(angle) * reach * t;
    const hop = Math.sin(Math.min(1, t * 1.4) * Math.PI) * (6 + fx.force * 10);
    const py = sy + Math.sin(angle) * reach * t * 0.4 - hop;
    const alpha = t >= 0.98 ? 0.68 : (1 - t) * 0.85;
    ctx.fillStyle = `rgba(58, 60, 68, ${alpha.toFixed(3)})`;
    ctx.fillRect(Math.round(px), Math.round(py), 2, 1);
  }
  ctx.restore();
}

/**
 * BURNING RUBBER — a low pale cloud that boils OUT rather than up, and is gone
 * in half a second.
 *
 * Everything about it is the dead engine's smoke inverted, because a locked tyre
 * is the opposite event: it spreads wide instead of climbing (the smoke comes
 * off a contact patch on the road, not out of a bonnet), it is PALE rather than
 * grey (it is lit by the same headlights the road grit is, and dark smoke on
 * dark tarmac is nothing at all — the lesson `drawGrit` learned first), and it
 * dies fast, because a stop lasts under a second and smoke still hanging there
 * afterwards reads as a fire.
 *
 * It also DRIFTS BACKWARD along the road, which is the cheap trick that sells it
 * at speed: the car is still moving, so what it left behind is falling away
 * from it, and a cloud pinned dead over the axle would read as attached.
 */
function drawTyreSmoke(
  ctx: CanvasRenderingContext2D,
  fx: DriveFx,
  t: number,
  sx: number,
  sy: number,
): void {
  const puffs = Math.round(8 + fx.force * 10);
  const drift = fx.drift ?? -1;
  ctx.save();
  for (let i = 0; i < puffs; i++) {
    // EVERY PUFF HAS ITS OWN AGE. Aged together they are one expanding ring of
    // circles — a handful of grey balloons rather than smoke — because a dozen
    // hard-edged discs that grow and fade in lockstep read as exactly what they
    // are. Staggered, the tyre keeps ISSUING for the whole life of the effect
    // and the mass is built out of overlap, which is the same trick the road's
    // blood marks use to make a pool.
    const phase = Math.min(1, t + scatter(fx.seed, i, 10) * 0.7);
    const ease = phase * (2 - phase);
    const back = (4 + scatter(fx.seed, i, 11) * 26) * drift;
    const spread = (scatter(fx.seed, i, 12) - 0.5) * 14;
    const r = 1.5 + ease * (3 + fx.force * 3);
    ctx.fillStyle = `rgba(198, 194, 188, ${((1 - phase) * 0.19).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(
      Math.round(sx + back * ease),
      Math.round(sy - 2 - ease * 4 + spread * ease * 0.4),
      r,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.restore();
}

/**
 * A WRECK'S OWN CLOUD — the dust and smoke a crashed car sits inside.
 *
 * IT ROLLS OUT FROM A RADIUS, WHICH IS THE WHOLE TRICK. Every other cloud on
 * this road is issued from a point and therefore has a middle: it is a puff
 * BESIDE the thing that made it. A wreck's cloud has to have the wreck IN it, so
 * the puffs start distributed right around the vehicle's own extent (`spread`)
 * and expand outward from there. At the smallest force that is a wisp off a
 * bicycle; at the largest the bus is not visible through it.
 *
 * FLATTENED ACROSS THE ROAD (the 0.45 on the vertical reach), like everything
 * else this file scatters: the world is drawn raked, so a circular spread in
 * world space is an ellipse on the screen, and a cloud that ignored that would
 * stand up like a wall rather than lie on the tarmac.
 *
 * IT BARELY CLIMBS. A settling cloud is mostly going sideways and down —
 * `drawSmoke` below is the thing that goes up, and it is a different sight for a
 * different reason (a bonnet on fire, not a road being scrubbed). The small lift
 * here is only enough to stop the mass reading as a decal painted on the tarmac.
 */
function drawDust(
  ctx: CanvasRenderingContext2D,
  fx: DriveFx,
  t: number,
  sx: number,
  sy: number,
): void {
  const spread = fx.spread || 18;
  // MANY SMALL ONES RATHER THAN A FEW BIG ONES. A dozen wide discs growing
  // together is the "grey balloons" the tyre smoke warns about — the eye reads
  // the individual circles and the mass never forms. The mass has to come out
  // of OVERLAP, which means more puffs, each smaller and each fainter than the
  // cloud is meant to look.
  const puffs = Math.round(10 + fx.force * 16);
  ctx.save();
  for (let i = 0; i < puffs; i++) {
    // EVERY PUFF HAS ITS OWN AGE, the same stagger the tyre smoke uses and for
    // the same reason: aged in lockstep, a dozen hard-edged discs growing and
    // fading together read as a ring of grey balloons rather than as a mass.
    const phase = Math.min(1, t + scatter(fx.seed, i, 20) * 0.5);
    const ease = phase * (2 - phase);
    const angle = scatter(fx.seed, i, 21) * Math.PI * 2;
    // Born spread around the body and pushed outward — never from the centre,
    // or the first frames are a dot on the roof of the car.
    const from = spread * (0.25 + scatter(fx.seed, i, 22) * 0.55);
    const reach = from + spread * (0.4 + scatter(fx.seed, i, 23) * 0.8) * ease;
    const px = sx + Math.cos(angle) * reach;
    // …AND IT SITS ON THE BODY RATHER THAN ON THE WHEELS. Every effect on this
    // road is anchored at the GROUND, which is right for a spark off a bumper
    // and wrong for a cloud that is meant to have a car inside it: a wreck lying
    // on its side is drawn a good fifteen px above the point the physics holds
    // it at, so a cloud centred there wraps its wheels and leaves the body clear
    // above the smoke. Raised by a share of its own spread, so the bus's cloud
    // climbs as far up the bus as the bicycle's does up the bicycle.
    const py =
      sy + Math.sin(angle) * reach * 0.45 - 2 - spread * 0.22 - ease * 7;
    const r = 1.5 + ease * (1.8 + fx.force * 3 + spread * 0.06);
    // ROAD DUST IS PALE AND SMOKE IS NOT, and one cloud is both — so the tone
    // varies per puff rather than per cloud, which is what stops it reading as
    // a single flat colour with a hole punched in it.
    const tone = 132 + Math.round(scatter(fx.seed, i, 24) * 68);
    const alpha = (1 - phase) * 0.15 * (0.45 + fx.force * 0.55);
    ctx.fillStyle = `rgba(${tone}, ${tone - 4}, ${tone - 11}, ${alpha.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(Math.round(px), Math.round(py), r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * THE FLAME LADDER, and which rung a burn of this force is on.
 *
 * FIVE STAGES OF TWO FRAMES, authored for the flamethrower's gout
 * (`content/sprites/effects/flame_*.yaml`) and reused here without a pixel
 * changed — because a car fire and a gout of burning fuel are the same
 * MATERIAL, and this game deliberately has one of it. The stage is the burn's
 * own progress, so the picture grows with the fire rather than switching on.
 */
const FLAME_STAGES = 5;
/** How fast the two frames of a stage alternate (ms). Fast — fire is the one
 * thing on this road allowed to flicker, and a slow one reads as a flag. */
const FLAME_FRAME_MS = 90;

/**
 * A BURNING CAR — the flame ladder, laid over the vehicle additively.
 *
 * THREE TONGUES RATHER THAN ONE, spread along the body and each on its own
 * frame, because a car is four metres long and a single 14-px sprite sitting on
 * the middle of it reads as a bonfire somebody has parked next to. They are
 * offset by the effect's own seed so two burning cars never flicker in step,
 * which is the thing that would give the whole trick away.
 *
 * ADDITIVE, because fire is LIGHT: over night tarmac `source-over` would paste
 * an orange sticker on the road, and what is wanted is the road being seen
 * through the flame and everything near it lifting.
 */
function drawFire(
  ctx: CanvasRenderingContext2D,
  sprites: Sprites,
  fx: DriveFx,
  t: number,
  sx: number,
  sy: number,
  nowMs: number,
): void {
  const lift = fx.lift ?? 0;
  // The stage the burn has reached — capped one short of the top until it is
  // really going, so "well alight" still has somewhere to climb to.
  const stage = Math.min(FLAME_STAGES - 1, Math.floor(fx.force * FLAME_STAGES));
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  // It fades in and out over its own short life, so consecutive issues on the
  // cadence overlap into one continuous burn rather than popping.
  const alpha = Math.min(1, (1 - t) * 1.6) * (0.55 + fx.force * 0.45);
  for (let i = 0; i < 3; i++) {
    const step = Math.max(0, stage - (i === 0 ? 0 : 1));
    const beat = Math.floor((nowMs + i * 37 + fx.seed) / FLAME_FRAME_MS) % 2;
    const name = `flame_${step}${beat === 0 ? "a" : "b"}`;
    const sprite = spriteByName(sprites, name);
    if (!sprite) continue;
    const along = (scatter(fx.seed, i, 41) - 0.5) * 20;
    const climb = i * 3 + scatter(fx.seed, i, 42) * 4;
    ctx.globalAlpha = alpha * (i === 0 ? 1 : 0.7);
    ctx.drawImage(
      sprite,
      Math.round(sx + along - sprite.width / 2),
      Math.round(sy - lift - climb - sprite.height),
    );
  }
  ctx.restore();
}

/**
 * THE FUEL TANK GOING — a ball that opens, and the black that comes off it.
 *
 * IT OPENS UNDER THE CAR AND RISES THROUGH IT. The bright base still spreads
 * across the road, but its tongues and black column climb hard enough that the
 * shell is visibly kicked upward by the same event rather than merely sitting
 * beside a flat orange ring.
 *
 * THE CORE IS DRAWN LAST AND BRIGHTEST, and it is what makes the first two
 * frames read: an explosion is a flash with a fireball behind it, and a ring of
 * flame sprites with nothing in the middle reads as a smoke ring.
 */
function drawBlast(
  ctx: CanvasRenderingContext2D,
  sprites: Sprites,
  fx: DriveFx,
  t: number,
  sx: number,
  sy: number,
): void {
  const lift = fx.lift ?? 0;
  const ease = t * (2 - t);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  // THE BALL, as a ring of the biggest flame the ladder has, thrown outward.
  const petals = 13;
  for (let i = 0; i < petals; i++) {
    // Late in its life the ball is breaking up, so the outer tongues drop down
    // the ladder — which is what turns a fireball into a burning wreck rather
    // than switching it off.
    const step = t < 0.45 ? 4 : t < 0.75 ? 3 : 2;
    const beat = i % 2 === 0 ? "a" : "b";
    const sprite = spriteByName(sprites, `flame_${step}${beat}`);
    if (!sprite) continue;
    const angle = (i / petals) * Math.PI * 2 + fx.seed * 0.01;
    const reach = 42 * ease * (0.5 + scatter(fx.seed, i, 51) * 0.9);
    const px = sx + Math.cos(angle) * reach;
    const rise = 12 + scatter(fx.seed, i, 52) * 22;
    const py = sy - lift + Math.sin(angle) * reach * 0.35 - ease * rise;
    ctx.globalAlpha = Math.max(0, 1 - t * 1.15);
    ctx.drawImage(
      sprite,
      Math.round(px - sprite.width / 2),
      Math.round(py - sprite.height / 2),
    );
  }
  // THE FLASH IN THE MIDDLE, which is most of what the first three frames are.
  const core = Math.max(0, 1 - t * 3.2);
  if (core > 0) {
    ctx.globalAlpha = core;
    ctx.fillStyle = "rgba(255, 244, 214, 0.9)";
    ctx.beginPath();
    ctx.ellipse(
      Math.round(sx),
      Math.round(sy - lift),
      14 + ease * 34,
      9 + ease * 20,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.restore();
  // …AND THE BLACK OFF IT, which is NOT additive — smoke is matter, and drawn
  // with `lighter` it would brighten the road it is supposed to be hiding.
  const soot = Math.min(1, t * 1.4);
  if (soot <= 0) return;
  ctx.save();
  for (let i = 0; i < 16; i++) {
    const sprite = spriteByName(sprites, `flame_smoke_${i % 3}`);
    if (!sprite) continue;
    const angle = scatter(fx.seed, i, 61) * Math.PI * 2;
    const reach = 46 * ease * (0.4 + scatter(fx.seed, i, 62) * 1.1);
    ctx.globalAlpha = Math.max(0, (1 - t) * 0.55);
    ctx.drawImage(
      sprite,
      Math.round(sx + Math.cos(angle) * reach - sprite.width / 2),
      Math.round(
        sy -
          lift +
          Math.sin(angle) * reach * 0.4 -
          ease * (22 + scatter(fx.seed, i, 63) * 20) -
          sprite.height / 2,
      ),
    );
  }
  ctx.restore();
}

/** The dead engine's smoke: a slow column that widens and thins as it climbs. */
function drawSmoke(
  ctx: CanvasRenderingContext2D,
  fx: DriveFx,
  t: number,
  sx: number,
  sy: number,
): void {
  const puffs = 14;
  ctx.save();
  for (let i = 0; i < puffs; i++) {
    // Each puff has its own phase, so the column keeps issuing rather than
    // rising once and stopping.
    const phase = fract(t * 1.6 + scatter(fx.seed, i, 7));
    const lift = fx.lift ?? 0;
    const spread = fx.spread ?? 0;
    const rise = phase * (34 + lift);
    const drift =
      (scatter(fx.seed, i, 8) - 0.5) * (14 * phase + spread * (0.4 + phase));
    const r = 1.5 + phase * 5;
    ctx.fillStyle = `rgba(126, 124, 120, ${((1 - phase) * 0.34).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(
      Math.round(sx + drift),
      Math.round(sy - 6 - lift * 0.2 - rise),
      r,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.restore();
}
