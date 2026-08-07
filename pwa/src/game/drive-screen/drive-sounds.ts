// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHICH SOUND A COLLISION MAKES — the road's banks, and the pick.
//
// TWO DECISIONS LIVE HERE AND BOTH ARE ABOUT REPETITION. A drive books a body
// every couple of seconds and thirty of them a trip, so:
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
// The ids are `content/sounds/drive_*.yaml`, played through the LIVE bank, so a
// mod that reskins the road is heard on it.

import { DRIVE } from "@game/core";

/** The ordinary thud of a body on the bumper. */
export const BODY_SOUNDS = [
  "drive_body_a",
  "drive_body_b",
  "drive_body_c",
] as const;
/** The same collision past `HARD_BODY_JOULES` — taken square, at speed. */
export const HARD_BODY_SOUNDS = [
  "drive_body_hard_a",
  "drive_body_hard_b",
] as const;
/** Paint traded down the flank. */
export const SCRAPE_SOUNDS = ["drive_scrape_a", "drive_scrape_b"] as const;
/** A real collision with another car. */
export const CRUNCH_SOUNDS = ["drive_crunch_a", "drive_crunch_b"] as const;
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
export const SMASH_SOUNDS = ["drive_smash_a", "drive_smash_b"] as const;
/** A car's windows leaving it. Played OVER the collision, never instead: the
 * crunch is the steel and this is the glass, and they are one event. */
export const GLASS_SOUNDS = ["drive_glass_a", "drive_glass_b"] as const;
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
export const PANEL_SOUNDS = ["drive_panel_a", "drive_panel_b"] as const;
/** A body taken in TWO — the wet tear the thud does not contain. Played OVER
 * the thud rather than instead of it: the two are one collision, and the thud is
 * the steel while this is the person. */
export const SPLIT_SOUNDS = ["drive_split_a", "drive_split_b"] as const;
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
/** …and one for dead steel already on the tarmac being kicked further down it. */
export const DEBRIS_SOUND = "drive_debris_clunk";

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

/** The sound a body going under the car makes. */
export function bodyHitSound(x: number, y: number, joules: number): string {
  const heavy = joules > DRIVE.impact.wearJoules * HARD_BODY_JOULES;
  return pick(heavy ? HARD_BODY_SOUNDS : BODY_SOUNDS, x, y);
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

/** Every id the road can ask the bank for — what the content test walks. */
export const DRIVE_SOUND_IDS: readonly string[] = [
  ...BODY_SOUNDS,
  ...HARD_BODY_SOUNDS,
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
  DEBRIS_SOUND,
];
