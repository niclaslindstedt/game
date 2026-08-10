// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHICH SOUND A COLLISION MAKES — the road's banks, and the pick.
//
// FOUR DECISIONS LIVE HERE, and the first two are about REPETITION. A drive
// books a body every couple of seconds and thirty of them a trip, so:
//
//   HOW HARD WAS IT   picks the SHELF, off the collision's own absorbed energy
//                     (`DriveEvent.joules`) against `wearJoules` — the same
//                     number the gore burst and the car's own wear are priced
//                     off. Nothing here re-decides what a heavy hit is.
//   WHICH TAKE        picks one of that shelf's variants by HASHING WHERE IT
//                     HAPPENED. Never `drive.rng()`: the road's stream lays the
//                     crowd and the traffic down, so spending a draw on which
//                     thud to play would move every body after it — the same
//                     rule the loot toss and the gore scatter obey.
//
// …AND THE OTHER TWO ARE WHY EVERY HIT USED TO SOUND LIKE THE LAST ONE. A shelf
// and a take is a bank of six noises played four hundred times a leg, and six
// noises is not "different people, met differently" — it is one event with a
// little dither on it. So the pick is now a STACK, and the three facts a
// collision actually has are each carried by their own layer:
//
//   WHO IT WAS        picks the BANK — light, ordinary or heavy — off the
//                     body's own weight (`bodyMassMult`, the very multiplier
//                     the blow was solved with, so what the player hears and
//                     what the wheel felt cannot disagree). And what they had
//                     WITH them adds its own layer over the top: steel tube,
//                     a loose wheel, a burst bag, a helmet, the resin one of
//                     THE GLUED was holding the road with.
//   HOW FAST HE WAS   is a LAYER, not a shelf, because speed and weight are
//                     two different facts and the energy sum folds them into
//                     one number: a heavy body at a crawl and a light one at a
//                     hundred can cost identical joules and must not make an
//                     identical noise. Below `NUDGE_FRAC` a hit is a SHOVE and
//                     the bank is not reached at all; above `CRACK_FRAC` the
//                     whip-crack goes over whatever the weight chose.
//
// AND THE CAR ANSWERS EVERY ONE OF THEM (`carAnswerSound`). Something hit the
// front of a two-ton estate; the estate is the room the player is sitting in,
// and until now it said nothing at all.
//
// The ids are `content/sounds/drive_*.yaml`, played through the LIVE bank, so a
// mod that reskins the road is heard on it.

import { bodyMassMult, DRIVE, type PedestrianKind } from "@game/core";

/** The ordinary thud of a body on the bumper — an ORDINARY body's, now that
 * the bank has three of them. */
export const BODY_SOUNDS = [
  "drive_body_a",
  "drive_body_b",
  "drive_body_c",
] as const;
/** …the same blow to somebody there is less of: higher, shorter, and with
 * nothing under it. */
export const LIGHT_BODY_SOUNDS = [
  "drive_body_light_a",
  "drive_body_light_b",
  "drive_body_light_c",
] as const;
/** …and to somebody there is more of. Not a LOUDER thud — a thud with more of
 * it below the crack, which is how the ear reads mass. */
export const HEAVY_BODY_SOUNDS = [
  "drive_body_heavy_a",
  "drive_body_heavy_b",
  "drive_body_heavy_c",
] as const;
/**
 * A PERSON MET AT WALKING PACE — the bottom of the road's whole ladder, and a
 * rung it simply did not have.
 *
 * A wagon rolling through a crowd at ten books bodies exactly as one at a
 * hundred does, and it used to book them with the same thud: the joules ladder
 * starts at the ordinary shelf, so the quietest collision available was a
 * full-blooded hit. What happens at a crawl is a bumper LEANING on somebody
 * until they go over, and it has no crack in it at all.
 */
export const NUDGE_SOUNDS = [
  "drive_body_nudge_a",
  "drive_body_nudge_b",
] as const;
/** The same collision past `HARD_BODY_JOULES` — taken square, at speed. */
export const HARD_BODY_SOUNDS = [
  "drive_body_hard_a",
  "drive_body_hard_b",
  "drive_body_hard_c",
] as const;
/** …to a light body, which gets to the floor quicker and has a thinner boom. */
export const HARD_LIGHT_SOUNDS = [
  "drive_body_hard_light_a",
  "drive_body_hard_light_b",
] as const;
/** …and to a heavy one, which is the worst thing that happens to a person out
 * here without a wheel being involved. */
export const HARD_HEAVY_SOUNDS = [
  "drive_body_hard_heavy_a",
  "drive_body_hard_heavy_b",
] as const;
/**
 * WHAT SPEED SOUNDS LIKE, laid over whatever the weight picked.
 *
 * A LAYER RATHER THAN A SHELF, and that distinction is the whole reason the
 * road can now tell the player two things at once. Absorbed energy is a
 * function of mass AND closing speed, so the joules ladder has already mixed
 * them: a bagman met at forty and a slight woman met at a hundred land on the
 * same rung of it. The weight picks the body's own noise; this says how fast
 * the bumper was going when it got there.
 */
export const CRACK_SOUNDS = [
  "drive_body_crack_a",
  "drive_body_crack_b",
] as const;
/** …and the weight under a heavy one — `SUB_SOUND`'s smaller brother, kept
 * deliberately smaller: a big man is not a bus. */
export const BODY_SUB_SOUND = "drive_body_sub";
/** Paint traded down the flank. */
export const SCRAPE_SOUNDS = [
  "drive_scrape_a",
  "drive_scrape_b",
  "drive_scrape_c",
] as const;
/** A real collision with another car. */
export const CRUNCH_SOUNDS = [
  "drive_crunch_a",
  "drive_crunch_b",
  "drive_crunch_c",
] as const;
/**
 * …AND THE ONE ABOVE IT: a collision that ends somebody's car.
 *
 * THE SHELF THE ROAD DID NOT HAVE, and the whole of "the sound is way too
 * small for big crashes". The crunch bank was the top of the ladder, and it is
 * a 260 ms saw with a boom under it — perfectly good for trading paint, and the
 * same noise the game made for a head-on into a parked van at 120 that folded
 * both cars in half. Two events with an order of magnitude of energy between
 * them shared one sample, so the loudest thing that can happen out here sounded
 * like the second loudest.
 */
export const SMASH_SOUNDS = [
  "drive_smash_a",
  "drive_smash_b",
  "drive_smash_c",
] as const;
/** A car's windows leaving it. Played OVER the collision, never instead: the
 * crunch is the steel and this is the glass, and they are one event. */
export const GLASS_SOUNDS = [
  "drive_glass_a",
  "drive_glass_b",
  "drive_glass_c",
] as const;
/** A vehicle going over — the longest noise on this road, and a sequence
 * rather than an impact (see the sound's own note). */
export const ROLLOVER_SOUND = "drive_rollover";
/**
 * THE WEIGHT, laid under any of the above that has earned it.
 *
 * A bank cannot be made bigger by turning it up — the mix has a ceiling and a
 * synthesized crunch reaches it long before it sounds heavy. What the ear reads
 * as SIZE is sub-bass and a tail that outlasts the crack, and neither fits
 * inside a sound that also has to BE the crack. So the big events play their own
 * noise and this underneath it, which is how every large impact in the game is
 * built (`ui_boom`, `nuke`) and what the road was missing.
 */
export const SUB_SOUND = "drive_impact_sub";
/** A panel folding one rung further. */
export const PANEL_SOUNDS = [
  "drive_panel_a",
  "drive_panel_b",
  "drive_panel_c",
] as const;
/** A body taken in TWO — the wet tear the thud does not contain. Played OVER
 * the thud rather than instead of it: the two are one collision, and the thud is
 * the steel while this is the person. */
export const SPLIT_SOUNDS = [
  "drive_split_a",
  "drive_split_b",
  "drive_split_c",
] as const;
/** A wheel finding something already lying in the road. Three takes, because
 * this is the most repeated noise on the road by a long way — driving through a
 * blockade fires it several times a second, and two takes at that rate is a
 * stutter. */
export const CRUSH_SOUNDS = [
  "drive_crush_a",
  "drive_crush_b",
  "drive_crush_c",
] as const;
/** The three singletons — one part comes off a car exactly one way, an engine
 * only dies once a leg, and there is only one noise a body caught under a
 * floorpan makes. */
export const SHED_SOUND = "drive_part_shed";
export const BREAKDOWN_SOUND = "drive_breakdown";
export const DRAG_SOUND = "drive_body_drag";
/** …and the same thing with somebody BIG under it: longer, lower, and with the
 * floorpan in it. The one place a body's weight is heard AFTER the collision
 * rather than during it. */
export const DRAG_HEAVY_SOUND = "drive_body_drag_heavy";
/** …and one for dead steel already on the tarmac being kicked further down it. */
export const DEBRIS_SOUND = "drive_debris_clunk";

/**
 * WHAT THEY HAD WITH THEM — the layer that makes eighteen bodies eighteen
 * people rather than one body drawn eighteen ways.
 *
 * IT IS THE APP'S AND NOT THE ENGINE'S, and that is the whole reason it is a
 * table out here. The sim knows a `variant` and nothing else; that a variant is
 * a woman pushing a full trolley, or a man on crutches, or somebody on a
 * skateboard is a fact about the ART (`CROWD_SPRITES`, scenery.ts) — and what
 * that art is MADE OF is a fact about the sound. Keep this in step with that
 * list: an index missing from here is simply a person carrying nothing, which
 * is the right default and the reason a stale row is silent rather than wrong.
 *
 * MOST OF THE CROWD IS NOT IN IT, on purpose. If everybody clattered, nobody
 * would: the layer says something precisely because it is the one hit in four
 * that has anything extra in it.
 */
const KIT_BY_VARIANT: Readonly<Record<number, string>> = {
  6: "drive_kit_bags", // a full shopping trolley
  7: "drive_kit_wheels", // a pram
  9: "drive_kit_steel", // crutches
  10: "drive_kit_steel", // a walking frame
  11: "drive_kit_wheels", // a skateboard
  14: "drive_kit_bags", // everything he owns, in four bags
  16: "drive_kit_wheels", // a bike
  17: "drive_kit_steel", // a wheelchair
};

/** …and what the other three KINDS were wearing or stuck to, which `variant`
 * cannot answer because each of them indexes its own table of art. */
const KIT_BY_KIND: Readonly<Partial<Record<PedestrianKind, string>>> = {
  rider: "drive_kit_helmet",
  glued: "drive_kit_resin",
};

/** The wagon's own answer, up the same ladder the frame-shake and the buzz in
 * the hand climb — see `carAnswerSound`. */
export const CAR_BUMP_SOUND = "drive_car_bump";
export const CAR_THUMP_SOUNDS = [
  "drive_car_thump_a",
  "drive_car_thump_b",
] as const;
export const CAR_JOLT_SOUND = "drive_car_jolt";

/**
 * Where the body's thud becomes a body's crunch, as a fraction of the energy
 * that totals the car. Sits at a square hit at HALF the top end, so the heavy
 * takes are what a driver holding the throttle down hears and the light ones are
 * what a careful one does.
 *
 * MEASURED, not guessed, and it had to be: absorbed energy goes as the SQUARE of
 * the closing speed (`solveImpact`), so a threshold picked by eye is wrong by
 * the square of however far off the speed was. It was, by a factor of five — at
 * 0.045 the heavy bank could not play on EASY or MEDIUM AT ALL, because a body
 * met dead square at the full 120 on the baseline rung is worth 0.036 of
 * `wearJoules` and nothing on that road is worth more. Two rungs of players
 * heard one bank. The shares below are `solveImpact`'s own, on MEDIUM:
 *
 *   square @ 120 mph   0.0363      square @ 84 mph   0.0178
 *   square @  60 mph   0.0091      square @ 48 mph   0.0058
 *   clipped @ 120 mph  0.0005 … 0.013, by how far off the nose it caught
 *
 * So the line lands where the sentence above says it does, and it is the same
 * line on every rung — the ladder moves the ENERGY (it weights the road, see
 * `impactMasses`), which is exactly why a JESUS driver hears the heavy bank off
 * blows a MEDIUM one gets a thud for.
 */
const HARD_BODY_JOULES = 0.009;
/** …and the same line for traffic, higher because trading paint at all is
 * already the expensive mistake. */
const CRUNCH_JOULES = 0.09;
/**
 * …AND THE LINE ABOVE THAT, where a collision stops being a collision and
 * starts being the end of somebody's car.
 *
 * MEASURED like the two above it, against `solveImpact`'s own answers on MEDIUM
 * for a car met SQUARE — which is the only geometry that reaches this shelf, as
 * it should be:
 *
 *   square into a stopped saloon @ 120 mph   0.32 of `wearJoules`
 *   square into a stopped saloon @  72 mph   0.12
 *   the same saloon clipped @ 120 mph        0.04
 *
 * So 0.2 is a head-on at something over ninety, it cannot be reached by a
 * sideswipe at any speed the wagon can do, and the crunch bank keeps everything
 * underneath it — which is the ordering the whole road teaches.
 */
const SMASH_JOULES = 0.2;

/** Which variant a hit at this spot plays — deterministic, so an identical road
 * replays with identical audio. */
export function variantAt(x: number, y: number, count: number): number {
  return Math.abs(Math.round(x * 3.1 + y * 7.7)) % count;
}

function pick(bank: readonly string[], x: number, y: number): string {
  return bank[variantAt(x, y, bank.length)] ?? bank[0] ?? "";
}

/**
 * WHERE A HIT STOPS BEING A HIT AND BECOMES A SHOVE, as a fraction of the top
 * of the dial.
 *
 * A fifth, which is a shade under 25 mph on MEDIUM — the pace at which a car
 * pushing through a crowd stops throwing people and starts leaning on them.
 * SPEED rather than joules on purpose: the joules ladder cannot answer this,
 * because a heavy body leant on at a crawl reaches the ordinary shelf's energy
 * perfectly well and what happened is still a shove.
 */
const NUDGE_FRAC = 0.2;
/**
 * …AND WHERE THE WHIP-CRACK GOES OVER THE TOP OF WHATEVER THE WEIGHT PICKED.
 *
 * Just under two thirds, which is where the wagon spends most of a leg that is
 * going well — so the crack is what a driver holding his foot down hears on
 * nearly every body, and lifting off genuinely takes it away. Deliberately not
 * higher: a layer that only appears in the last tenth of the dial is one most
 * players would never once hear.
 */
const CRACK_FRAC = 0.62;

/** Where a body stops being light and starts being heavy, as a multiple of the
 * rung's own figure for a person (`bodyMassMult`). Set either side of the
 * crowd's spread so the three banks are actually used: seven of the eighteen
 * are light, five ordinary, six heavy. */
const LIGHT_UNDER = 0.92;
const HEAVY_OVER = 1.08;

/** WHICH BANK THIS PERSON COMES OFF — the sound's half of a fact the physics
 * already used (see `bodyMassMult`, engine/game/drive/crowd.ts). */
export type BodyWeight = "light" | "mid" | "heavy";

export function bodyWeight(kind: PedestrianKind, variant: number): BodyWeight {
  const mass = bodyMassMult(kind, variant);
  if (mass < LIGHT_UNDER) return "light";
  if (mass > HEAVY_OVER) return "heavy";
  return "mid";
}

/** One body collision, as the app knows it: where, how hard, who, and how fast
 * the wagon was going when it got there. */
export type BodyHit = {
  x: number;
  y: number;
  joules: number;
  kind: PedestrianKind;
  variant: number;
  /** The car's own speed as a fraction of the top of the dial, 0..1. */
  speedFrac: number;
};

/**
 * EVERYTHING ONE BODY MAKES, in the order it is played — the stack this module
 * exists for.
 *
 * A LIST RATHER THAN AN ID, because a collision out here is not one noise. It
 * is a person (the bank, picked by their weight and the blow's own energy),
 * what they were carrying (the kit layer), how fast the thing that hit them was
 * going (the crack), and — for the big ones — the mass under all of it. Four
 * short sounds that sum to one event is how the road gets hundreds of distinct
 * collisions out of a bank of thirty, and it is the same arrangement the crash
 * ladder already used for its sub.
 *
 * THE CAR'S OWN ANSWER IS NOT IN HERE (`carAnswerSound`). It is rate-limited —
 * one chassis, one ring — so it cannot be decided per event without the clock,
 * and the caller has it.
 */
export function bodyHitSounds(hit: BodyHit): string[] {
  const { x, y } = hit;
  // A SHOVE IS NOT A HIT, and it takes none of the layers: nothing cracks,
  // nothing is thrown, and whatever they were carrying stays in their hands.
  if (hit.speedFrac < NUDGE_FRAC) return [pick(NUDGE_SOUNDS, x, y)];

  const weight = bodyWeight(hit.kind, hit.variant);
  const hard = hit.joules > DRIVE.impact.wearJoules * HARD_BODY_JOULES;
  const bank = hard
    ? weight === "light"
      ? HARD_LIGHT_SOUNDS
      : weight === "heavy"
        ? HARD_HEAVY_SOUNDS
        : HARD_BODY_SOUNDS
    : weight === "light"
      ? LIGHT_BODY_SOUNDS
      : weight === "heavy"
        ? HEAVY_BODY_SOUNDS
        : BODY_SOUNDS;
  const out = [pick(bank, x, y)];

  // WHAT THEY HAD WITH THEM, over the top — and only when they were actually
  // hit hard enough to lose it.
  const kit = kitSound(hit.kind, hit.variant);
  if (kit && hard) out.push(kit);
  // HOW FAST HE WAS GOING, which the bank above cannot say on its own.
  if (hit.speedFrac >= CRACK_FRAC) out.push(pick(CRACK_SOUNDS, x, y));
  // …and the weight under the worst of them.
  if (hard && weight === "heavy") out.push(BODY_SUB_SOUND);
  return out;
}

/**
 * A BODY ARRIVING OUT OF A MACHINE — a rider off a moped, somebody through a
 * windscreen.
 *
 * THE HEAVY SHELF WHATEVER THE ARITHMETIC SAYS, which is the same exception
 * `lampHitSound` and `pickSmash` document and it is earned the same way: the
 * joules on that event are the EJECTION's, not a bumper's, and they are small —
 * so the road used to answer a person leaving a vehicle at speed with the noise
 * of a clip on the wing. There is no gentle version of coming out of a machine.
 */
export function thrownBodySound(x: number, y: number): string {
  return pick(HARD_HEAVY_SOUNDS, x, y);
}

/** What is now travelling under the floorpan — the ordinary scrape, or the
 * long low one a big body makes. */
export function dragSound(kind: PedestrianKind, variant: number): string {
  return bodyWeight(kind, variant) === "heavy" ? DRAG_HEAVY_SOUND : DRAG_SOUND;
}

/** What this person had with them, or nothing — see `KIT_BY_VARIANT`. */
export function kitSound(
  kind: PedestrianKind,
  variant: number,
): string | undefined {
  if (kind !== "walker") return KIT_BY_KIND[kind];
  return KIT_BY_VARIANT[variant];
}

/**
 * THE SOUND OF MEETING ANOTHER CAR — a scrape down the side, a crunch, or the
 * end of somebody's afternoon.
 *
 * THREE SHELVES AND A LAYER, and the layer is the part that matters. Past
 * `SMASH_JOULES` the pick returns the big bank AND asks for the sub to be laid
 * under it (`heavy`), because the difference between the second-loudest thing
 * on this road and the loudest one is not level — the mix has a ceiling — it is
 * sub-bass and a tail. See `SUB_SOUND`.
 */
export function trafficHitSound(
  x: number,
  y: number,
  joules: number,
): { id: string; sub: boolean } {
  const energy = joules / DRIVE.impact.wearJoules;
  if (energy > SMASH_JOULES) {
    return { id: pick(SMASH_SOUNDS, x, y), sub: true };
  }
  const heavy = energy > CRUNCH_JOULES;
  return { id: pick(heavy ? CRUNCH_SOUNDS : SCRAPE_SOUNDS, x, y), sub: false };
}

/** The sound of a car's glass leaving it. */
export function glassSound(x: number, y: number): string {
  return pick(GLASS_SOUNDS, x, y);
}

/**
 * The big bank, asked for BY NAME rather than by energy.
 *
 * The one place the shelves are not picked off the joules, and it is a real
 * exception rather than a shortcut: a 14 kg bicycle destroyed utterly cannot
 * put enough energy through the sum to reach `SMASH_JOULES` at any speed the
 * wagon can do, because the energy is a function of the SMALLER mass. So an
 * event that is terminal by its own nature — a machine coming apart in the
 * middle — asks for the shelf directly. What happened is total, whatever the
 * arithmetic of it came to.
 */
export function pickSmash(x: number, y: number): string {
  return pick(SMASH_SOUNDS, x, y);
}

/** The sound of a panel giving up a rung. */
export function panelSound(x: number, y: number): string {
  return pick(PANEL_SOUNDS, x, y);
}

/**
 * The sound of a street light leaving its base.
 *
 * ALWAYS THE HEAVY SHELF, and it is the one pick here that does not consult the
 * joules. Every other collision on this road can be light or hard depending on
 * how it was taken; a lamp post cannot. It is a galvanized column bolted to a
 * concrete foot, and whatever speed it is met at, what happens is a shear —
 * there is no gentle version of it to play.
 */
export function lampHitSound(x: number, y: number): string {
  return pick(CRUNCH_SOUNDS, x, y);
}

/** The sound of a bumper going through somebody. */
export function splitSound(x: number, y: number): string {
  return pick(SPLIT_SOUNDS, x, y);
}

/** The sound of a wheel going over something already down. */
export function crushSound(x: number, y: number): string {
  return pick(CRUSH_SOUNDS, x, y);
}

// ── WHAT THE CAR DOES ABOUT IT ─────────────────────────────────────────────
// THE HALF OF EVERY COLLISION THE PLAYER WAS NEVER GIVEN. Something hit the
// front of a two-ton estate and the road played the noise the THING made —
// never the noise the CAR made about it. The wagon is the room he is sitting
// in: the bumper knocks, the springs go down on their stops, the doors rattle
// and the whole shell rings, and none of that was in the mix.
//
// TWO RULES, and both are the reason this is a funnel rather than a call at
// each site:
//
//   ONE CHASSIS, ONE RING. A tick inside a blockade books six collisions and a
//   wheel over a body several times a second. Six overlapping chassis booms is
//   not six impacts, it is mud — and it is the loudest, longest layer in the
//   road's whole vocabulary, so it is the one that would do the muddying. The
//   gap is held HERE, exactly as `sfx/cues.ts` holds the footstep's and
//   `drive-haptics.ts` holds the motor's, because a limit each caller
//   reimplements is a limit somebody forgets.
//
//   IT RIDES THE SAME NUMBER THE HAND DOES. The force is `driveHitForce`'s —
//   the buzz, the frame shake and this are three answers to one question, and
//   deriving them separately is how they drift into disagreeing about which
//   collision was the big one.

/** Where the car's answer climbs a rung: a knock, a frame thump, the shell
 * bottoming out. Read against `driveHitForce`'s 0..1. */
const THUMP_AT = 0.3;
const JOLT_AT = 0.72;
/** …and under this the wagon says nothing at all: a clip that barely moved the
 * needle is a thing the car does not notice, and one that answered anyway would
 * be a chassis boom under every crushed hand in a blockade. */
const ANSWER_AT = 0.1;

/**
 * HOW OFTEN THE CAR MAY SPEAK — long, because what it plays is long.
 *
 * A fifth of a second, which is about the length of the thump itself: a shell
 * that has just rung is still ringing, so the next collision is heard THROUGH
 * that ring rather than starting a second one. The preempt step is the same
 * escape hatch the motor's limiter has, and it is here for the same case — a
 * van met head-on in the middle of a crowd must not be swallowed by the flick
 * of the body booked a frame earlier.
 */
const ANSWER_GAP_MS = 200;
const ANSWER_STEP = 0.25;

let lastAnswerMs = -Infinity;
let lastAnswerForce = 0;

/** Forget the limiter — a fresh leg, or a test. (The road heals itself anyway:
 * a restart rewinds the clock, which is caught below.) */
export function resetCarAnswer(): void {
  lastAnswerMs = -Infinity;
  lastAnswerForce = 0;
}

/**
 * WHAT THE WAGON SAYS ABOUT A BLOW OF THIS FORCE — or nothing, if it is still
 * ringing from the last one.
 *
 * @param force 0..1, `driveHitForce`'s own scale
 * @param nowMs the DRIVE's clock, passed in rather than read, so the gate
 *              freezes with the road and a test can drive it
 */
export function carAnswerSound(
  force: number,
  nowMs: number,
): string | undefined {
  if (force < ANSWER_AT) return undefined;
  // A restart lays a fresh road at ms 0, so the clock can run BACKWARDS under
  // us — which would otherwise mute the wagon for the whole new leg.
  if (nowMs < lastAnswerMs) resetCarAnswer();
  if (
    nowMs - lastAnswerMs < ANSWER_GAP_MS &&
    force < lastAnswerForce + ANSWER_STEP
  ) {
    return undefined;
  }
  lastAnswerMs = nowMs;
  lastAnswerForce = force;
  if (force >= JOLT_AT) return CAR_JOLT_SOUND;
  if (force >= THUMP_AT) {
    // The two thumps alternate rather than hashing a position: this is the
    // CAR's noise, and the car is in the same place every time.
    return CAR_THUMP_SOUNDS[
      Math.floor(nowMs / ANSWER_GAP_MS) % CAR_THUMP_SOUNDS.length
    ] as string;
  }
  return CAR_BUMP_SOUND;
}

/** Every id the road can ask the bank for — what the content test walks. */
export const DRIVE_SOUND_IDS: readonly string[] = [
  ...NUDGE_SOUNDS,
  ...BODY_SOUNDS,
  ...LIGHT_BODY_SOUNDS,
  ...HEAVY_BODY_SOUNDS,
  ...HARD_BODY_SOUNDS,
  ...HARD_LIGHT_SOUNDS,
  ...HARD_HEAVY_SOUNDS,
  ...CRACK_SOUNDS,
  BODY_SUB_SOUND,
  ...Object.values(KIT_BY_VARIANT),
  ...Object.values(KIT_BY_KIND),
  CAR_BUMP_SOUND,
  ...CAR_THUMP_SOUNDS,
  CAR_JOLT_SOUND,
  ...SPLIT_SOUNDS,
  ...CRUSH_SOUNDS,
  ...SCRAPE_SOUNDS,
  ...CRUNCH_SOUNDS,
  ...SMASH_SOUNDS,
  ...GLASS_SOUNDS,
  ...PANEL_SOUNDS,
  ROLLOVER_SOUND,
  SUB_SOUND,
  SHED_SOUND,
  BREAKDOWN_SOUND,
  DRAG_SOUND,
  DRAG_HEAVY_SOUND,
  DEBRIS_SOUND,
];
