// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE FAUNA — living scenery on the ground plane (see `Critter`): sparrows
// working a lawn, cattle on the range, a rat in a corridor. A place that only
// contains things trying to kill you reads as an arena; a lot with birds on it
// was a lot before the hero arrived.
//
// THE ENGINE DECIDES WHAT IS ALIVE AND WHERE IT CALLS HOME; the RENDERER derives
// where each animal is right now from the render clock
// (pwa/src/game/render/fauna.ts). Nothing here is stepped, so a herd of forty
// costs the simulation nothing, cannot desync a replay, and reaches no save.

import { randomRange, type Rng } from "@game/lib/rng.ts";
import { clamp, vec, type Vec2 } from "@game/lib/vec.ts";
import type { LevelDef } from "./defs/levels/types.ts";
import type { Critter } from "./types/world.ts";
import { zoneContains, type Zone } from "./zones.ts";

export const FAUNA = {
  /**
   * How far the wander sweeps UP the screen, as a fraction of how far it sweeps
   * ACROSS it (unitless).
   *
   * Seen from above, an animal grazing covers more ground across the picture
   * than up it, and an even circle reads as an orbit rather than an amble.
   *
   * BOTH SIDES OF THE SEAM READ THIS ONE NUMBER: the renderer sweeps the y axis
   * by it, and {@link fitWander} below fits the same box inside the animal's own
   * district. A second copy that drifted would put half of every lap outside the
   * ground the placement thinks it fenced.
   */
  ySweep: 0.7,
  /**
   * HOW FAR A PERCHING CRITTER WILL GO TO SIT DOWN (world px from its home).
   *
   * A bird that flew the length of the lot to reach the one tree on it would
   * read as a bird being teleported, not as a bird: the point of the beat is
   * that the tree is part of the patch it already works. Nothing perchable
   * inside this leaves the animal on the ground, which is a fine answer.
   */
  perchReach: 150,
  /**
   * THE SITTING CYCLE, in seconds: how long it sits, how long it works the
   * ground between sits, and how long the hop each way takes.
   *
   * A LOT LONGER ON THE GROUND THAN IN THE TREE. The wander is the read — an
   * animal moving is what stops a lot looking like a photograph — and a bird
   * that spends half its life motionless in a canopy is a bird the player never
   * notices is alive. The sit is the punctuation.
   */
  perchSec: 6.5,
  roamSec: 13,
  flySec: 1.1,
} as const;

/** One full sit-and-roam lap (seconds) — out, sitting, back, and the ground. */
export const PERCH_CYCLE_SEC =
  FAUNA.perchSec + FAUNA.roamSec + 2 * FAUNA.flySec;

/** How far the corner of a wander box sits from its home, as a multiple of the
 * `range` — the diagonal of a `range` × `ySweep·range` half-box. What a ROUND
 * district has to hold. */
const CORNER_REACH = Math.hypot(1, FAUNA.ySweep);

/**
 * FIT A CRITTER'S WANDER INSIDE THE DISTRICT IT LIVES IN.
 *
 * A `within` line names the districts an animal belongs to, and drawing its HOME
 * inside one is only half of that promise: the lap runs `range` px either side
 * of home, so a sparrow homed a stride from the garage's north wall spends most
 * of every lap INSIDE the bay — through the wall, across the cement, over the
 * workbench. Nothing collides with a critter, so nothing else was stopping it.
 *
 * It is the ENVELOPE that is fitted rather than the range alone: the animal is
 * pulled toward the middle of its own zone until its box fits, and only what
 * still does not fit comes off the range. A district with room to hold the
 * rolled wander keeps the whole of it; a narrow strip gets a shorter one, which
 * is what a bird working a verge actually does.
 */
export function fitWander(
  zone: Zone,
  home: Vec2,
  range: number,
): { home: Vec2; range: number } {
  if (zone.shape === "circle") {
    // How far from the middle the home may sit and still swing its whole lap
    // inside the circle. Negative room means the circle is smaller than the lap.
    const room = zone.radius - range * CORNER_REACH;
    const dx = home.x - zone.pos.x;
    const dy = home.y - zone.pos.y;
    const d = Math.hypot(dx, dy);
    if (room >= 0) {
      if (d <= room) return { home, range };
      return {
        home: vec(zone.pos.x + (dx / d) * room, zone.pos.y + (dy / d) * room),
        range,
      };
    }
    return {
      home: vec(zone.pos.x, zone.pos.y),
      range: zone.radius / CORNER_REACH,
    };
  }
  const r = zone.rect;
  // The lap's own half-box, pinched to the room the rect actually has.
  const halfW = Math.min(range, r.width / 2);
  const halfH = Math.min(range * FAUNA.ySweep, r.height / 2);
  return {
    home: vec(
      clamp(home.x, r.x + halfW, r.x + r.width - halfW),
      clamp(home.y, r.y + halfH, r.y + r.height - halfH),
    ),
    range: Math.min(range, halfW, halfH / FAUNA.ySweep),
  };
}

/** The roomiest of a line's districts — where a critter the rejection sampler
 * could not place is put by hand. */
function biggestZone(zones: readonly Zone[]): Zone | undefined {
  let best: Zone | undefined;
  let bestArea = -1;
  for (const zone of zones) {
    const area =
      zone.shape === "circle"
        ? Math.PI * zone.radius * zone.radius
        : zone.rect.width * zone.rect.height;
    if (area <= bestArea) continue;
    bestArea = area;
    best = zone;
  }
  return best;
}

/** A point drawn anywhere inside one zone. */
function pointIn(rng: Rng, zone: Zone): Vec2 {
  if (zone.shape === "circle") {
    // The square root is what keeps it EVEN: a radius drawn flat piles the herd
    // at the middle, because a ring's area grows with its radius.
    const r = zone.radius * Math.sqrt(rng());
    const a = rng() * Math.PI * 2;
    return vec(zone.pos.x + Math.cos(a) * r, zone.pos.y + Math.sin(a) * r);
  }
  const rect = zone.rect;
  return vec(
    randomRange(rng, rect.x, rect.x + rect.width),
    randomRange(rng, rect.y, rect.y + rect.height),
  );
}

/**
 * WHERE THIS ONE GOES TO SIT — the nearest perchable piece within
 * `FAUNA.perchReach` of `home`, or undefined for a patch with nothing in it.
 *
 * NEAREST rather than rolled, and that is what makes it read: a bird belongs to
 * the tree it is under. Two birds homed by the same tree share it, which is also
 * what birds do — their cycles are phased apart, so the branch is rarely crowded
 * and occasionally is.
 *
 * FENCED INTO THE ANIMAL'S OWN DISTRICT for the reason its lap is
 * ({@link fitWander}): a bird that flies to a tree is a bird crossing ground in
 * a straight line, and a perch on the wrong side of a wall is the same sparrow
 * on the same cement by a different route.
 */
function perchFor(
  home: Vec2,
  district: Zone | undefined,
  perches: readonly { pos: Vec2 }[],
): Vec2 | undefined {
  let best: Vec2 | undefined;
  let bestSq = FAUNA.perchReach * FAUNA.perchReach;
  for (const piece of perches) {
    const dx = piece.pos.x - home.x;
    const dy = piece.pos.y - home.y;
    const sq = dx * dx + dy * dy;
    if (sq > bestSq) continue;
    if (district && !zoneContains(district, piece.pos)) continue;
    bestSq = sq;
    best = vec(piece.pos.x, piece.pos.y);
  }
  return best;
}

/**
 * Scatter the level's FAUNA (see `LevelDef.fauna`).
 *
 * Each critter gets a HOME point and a wander envelope, both fenced into the
 * line's own districts by {@link fitWander}. It is NOT held off obstacles: a cow
 * that clips a fence post for a moment is a cow, and testing every home against
 * the whole obstacle field would cost more than the layer is worth.
 *
 * `perches` is the level's already-placed furniture a bird may sit in
 * (`Obstacle.perch`) — passed in rather than read off the def because the pieces
 * are only points once they have been scattered.
 */
export function scatterFauna(
  rng: Rng,
  def: LevelDef,
  perches: readonly { pos: Vec2 }[] = [],
): Critter[] {
  const out: Critter[] = [];
  for (const line of def.fauna ?? []) {
    const [rangeLo, rangeHi] = line.range ?? [40, 110];
    const [speedLo, speedHi] = line.speed ?? [6, 16];
    const [scaleLo, scaleHi] = line.scale ?? [1, 1];
    for (let i = 0; i < line.count; i++) {
      let home = vec(0, 0);
      let district: Zone | undefined;
      for (let attempts = 0; attempts < 20; attempts++) {
        home = vec(
          randomRange(rng, 40, def.width - 40),
          randomRange(rng, 40, def.height - 40),
        );
        district = line.within?.find((zone) => zoneContains(zone, home));
        if (line.within === undefined || district !== undefined) break;
      }
      // A RESTRICTED LINE THAT NEVER LANDS GOES IN BY HAND, rather than keeping
      // the last miss. Rejection sampling over the whole map is a coin weighted
      // by how much of it the district covers, and twenty tosses is not many: a
      // lawn holding a fifth of a lot fails about one animal in fifty, and every
      // one of those failures was a critter with NO district — free to wander
      // the map, which is the whole thing this fence exists to stop, arriving by
      // the one path nobody looks at. The biggest zone, because it has the most
      // room for a lap; `fitWander` below pulls it the rest of the way in.
      if (line.within !== undefined && district === undefined) {
        district = biggestZone(line.within);
        if (district) home = pointIn(rng, district);
      }
      let range = randomRange(rng, rangeLo, rangeHi);
      if (district) ({ home, range } = fitWander(district, home, range));
      const perch = line.perches
        ? perchFor(home, district, perches)
        : undefined;
      out.push({
        kind: line.kind,
        sprite: line.sprite ?? line.kind,
        animated: line.animated ?? false,
        home,
        ...(perch ? { perch } : {}),
        range,
        speed: randomRange(rng, speedLo, speedHi),
        // Two independent phases, so the x and y sweeps are out of step and the
        // path is a wandering figure rather than a diagonal.
        phase: vec(rng() * Math.PI * 2, rng() * Math.PI * 2),
        stepSec: randomRange(rng, 0.34, 0.62),
        scale: randomRange(rng, scaleLo, scaleHi),
      });
    }
  }
  return out;
}
