// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// HOW THE TOWN IS LAID OUT — which building stands on which plot, how battered
// it is, and every loose piece hung on it. The catalog is `town.ts`; this is the
// street it makes.
//
// A HASH, NOT A DRAW. Every plot's identity comes from its own index, so the row
// is reproducible without holding a byte of state — and, unlike an rng, a plot
// can be asked about OUT OF ORDER, which is what lets the renderer populate only
// the stretch actually on screen. It is also what keeps the town out of
// `drive.rng`: that stream lays down the crowd and the traffic, and a town that
// spent draws on itself would move every body on the road the moment somebody
// added a house.
//
// AND IT IS PLANNED A BLOCK AT A TIME, which is the one structural decision
// here worth defending. Buildings vary in width, so "what is at x" cannot be
// answered by dividing — you have to know where the row it belongs to started.
// A backward scan would work and would be unbounded; anchoring the row at a
// BLOCK boundary and tiling it exactly (`planBlock`) makes the answer local, and
// caching the finished block means a frame that pans 3 px re-plans nothing at
// all. Twenty plots is 400 px, about a screen and a half on the reference
// phone — so the seam between two blocks is never twice in one frame, and a
// block is a few microseconds to lay out the once.
//
// THE GRADIENT IS THE POINT. Everything below reads `townDistrict(x)` — 0 at the
// hero's block, 1 at GOODCO's gate — and it is what picks the archetype, the
// wear rung, the door, the fence, the junk in the garden and whether a window is
// lit. The road does not change over at a line: the rosters overlap across the
// middle third and the wear ladder slides, so the neighbourhood becomes the
// business park the way it does on a real road, which is to say without ever
// announcing it.

import { crowdEdges } from "./crowd.ts";
import { DRIVE } from "./config.ts";
import {
  TOWN_ALLEY_PX,
  TOWN_ART_SIZE,
  TOWN_DECALS,
  TOWN_DOORS,
  TOWN_FRONTS,
  TOWN_GARAGE_DOORS,
  TOWN_FRONTAGE_SETBACK_PX,
  TOWN_JUNK,
  TOWN_PLOT_PX,
  TOWN_PORCHES,
  TOWN_SETBACK_PX,
  TOWN_SIGNS,
} from "./town-parts.ts";
import type { TownDecalDef, TownHoleState, TownPartDef } from "./town-parts.ts";
import {
  TOWN,
  townHeight,
  townPorchSlot,
  townSignSlot,
  townSlots,
  townWidth,
} from "./town.ts";
import type { TownBuildingDef, TownSlot } from "./town.ts";
import type { DriveDirection } from "./types.ts";

/** Which road this is, and how long — everything the district gradient needs.
 * Read off `DriveParams`, never off a `DriveState`, so the preview tools and
 * the tests can ask about a road nobody is driving. */
export type TownRoad = {
  direction: DriveDirection;
  /** The finish, in world px from the start. `DRIVE.coursePx` for every leg a
   * player drives; the attract loop's is shorter. */
  coursePx: number;
};

/** One sprite laid on a composed piece of town — sprite-local px from the
 * piece's top-left. */
export type TownLayer = { sprite: string; x: number; y: number };

/**
 * ONE STANDING PIECE OF TOWN — a building, or the frontage in front of one.
 *
 * IT IS A STACK, NOT A PICTURE. The app composes the layers onto one cached
 * canvas keyed by `key` and blits that, which is the same thing the hero's own
 * car does with its panels (`render/vehicles.ts`) and for the same reason: the
 * combinations are the point, and baking every one of them into the atlas would
 * be a few hundred grids to buy what a 40-line compositor gives away.
 */
export type TownProp = {
  /** What this stack IS — two props with the same key are the same picture, so
   * this is the compositor's cache key and nothing else. */
  key: string;
  /** World x of the piece's CENTRE, and world y of its base. */
  x: number;
  y: number;
  w: number;
  h: number;
  layers: TownLayer[];
};

// ── THE GRADIENT ─────────────────────────────────────────────────────────────

/**
 * HOW FAR ALONG THE ROAD TO GOODCO A SPOT IS — 0 at the hero's block, 1 at the
 * gate.
 *
 * BOTH LEGS ANSWER THE SAME QUESTION, which is the whole reason this is a
 * function rather than `x / coursePx`. A drive always starts its car at x = 0
 * and drives in its own `direction`, so the outbound leg runs 0 → +course with
 * home behind it and the leg home runs 0 → −course with home AHEAD. The town
 * belongs to the ROAD rather than to the trip: the same house has to be the same
 * house on the way back, or a player who noticed a burnt-out pub on the way out
 * would drive home past a business park standing where it was.
 */
export function townDistrict(x: number, road: TownRoad): number {
  const course = Math.max(1, road.coursePx);
  const t = road.direction === 1 ? x / course : 1 + x / course;
  return Math.max(0, Math.min(1, t));
}

/** The road a set of drive parameters describes. */
export function townRoad(params: {
  direction: DriveDirection;
  coursePx?: number;
}): TownRoad {
  return {
    direction: params.direction,
    coursePx: params.coursePx ?? DRIVE.coursePx,
  };
}

// ── THE DICE THAT ARE NOT DICE ───────────────────────────────────────────────

/** FNV-flavoured integer mix — a stable hash, so a plot answers the same on a
 * restart, on the leg home and on a machine three years from now. */
function hash(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** …and the same thing keyed by two numbers, for "the third window of the
 * building on plot 41". */
function hash2(a: number, b: number): number {
  return hash(Math.imul(a, 0x27d4eb2f) ^ Math.imul(b + 1, 0x165667b1));
}

/** Whether a part belongs on this stretch of road, at this much wear. */
function fits(part: TownPartDef, t: number, wear: number): boolean {
  return (
    t >= part.district[0] &&
    t <= part.district[1] &&
    wear >= part.wear[0] &&
    wear <= part.wear[1]
  );
}

/**
 * Pick one part out of a roster, weighted — ONE hash draw, whatever the roster
 * holds.
 *
 * The single draw matters for the same reason the fleet's does: these tables are
 * lists somebody is going to add to, and a pick that consumed a draw per entry
 * would re-dress every building on the road the moment a new door landed.
 */
function pick<T extends TownPartDef>(
  roster: readonly T[],
  t: number,
  wear: number,
  roll: number,
): T | null {
  let total = 0;
  for (const part of roster) if (fits(part, t, wear)) total += part.weight;
  if (total <= 0) return null;
  let r = roll * total;
  for (const part of roster) {
    if (!fits(part, t, wear)) continue;
    r -= part.weight;
    if (r <= 0) return part;
  }
  return null;
}

// ── WHAT STANDS ON A PLOT ────────────────────────────────────────────────────

/** Whether an archetype belongs on this stretch, and fits in the room left. */
function buildable(def: TownBuildingDef, t: number, room: number): boolean {
  return def.slots <= room && t >= def.district[0] && t <= def.district[1];
}

/** The archetype for a plot — one draw, and never the same one twice running.
 *
 * The re-roll is the cheapest fix for the loudest artefact this row can produce.
 * Two identical fronts side by side is the one repetition the eye finds
 * instantly at speed, and it is much more visible than the same house twice in a
 * block; one extra hash costs nothing and removes it. */
function pickBuilding(
  t: number,
  room: number,
  seed: number,
  avoid: TownBuildingDef | null,
): TownBuildingDef | null {
  const draw = (roll: number): TownBuildingDef | null => {
    let total = 0;
    for (const def of TOWN) if (buildable(def, t, room)) total += def.weight;
    if (total <= 0) return null;
    let r = roll * total;
    for (const def of TOWN) {
      if (!buildable(def, t, room)) continue;
      r -= def.weight;
      if (r <= 0) return def;
    }
    return null;
  };
  const first = draw(hash(seed));
  if (first && first === avoid) return draw(hash(seed ^ 0x5bf03635)) ?? first;
  return first;
}

/**
 * HOW BATTERED A BUILDING ON THIS SPOT IS — the 0…3 ladder, off the district.
 *
 * A SLIDE RATHER THAN A SWITCH, and jittered hard enough that the ladder never
 * shows. At the hero's end the mean sits near 3 and at GOODCO's near 0, but the
 * spread is wide enough at both that there is a kept house on the worst street
 * and a tired one on the best — which is what a real road looks like and, more
 * to the point, what stops the gradient reading as a difficulty bar.
 */
function wearAt(t: number, roll: number, def: TownBuildingDef): number {
  // THE MEAN STOPS SHORT OF THE TOP RUNG ON PURPOSE. Pinned at 3 the hero's own
  // block came out completely dead — every window boarded, nothing lit, nobody
  // in — and that is not the street the story describes. It describes shuttered
  // TRADES and boarded windows AND a lit one every third house where somebody's
  // welfare still lands. A road with nobody left on it is a ruin; a road with
  // people still in it, driven through at a hundred and twenty, is the joke.
  const mean = (1 - t) * 2.9 - 0.35;
  const jitter = (roll - 0.5) * 2.1;
  const wear = Math.round(mean + jitter);
  return Math.max(
    def.wear[0],
    Math.min(def.wear[1], Math.max(0, Math.min(3, wear))),
  );
}

/** Which of the four faces a hole wears. `occupied` is the building's own
 * answer to "does anybody still live here", asked once so a house's windows
 * agree with each other rather than each deciding alone. */
function holeState(
  wear: number,
  occupied: boolean,
  roll: number,
): TownHoleState {
  if (wear >= 3) return roll < 0.55 ? "board" : roll < 0.85 ? "broke" : "dark";
  if (wear === 2) {
    if (roll < 0.26) return "board";
    if (roll < 0.38) return "broke";
  }
  if (occupied && roll > 0.62) return "lit";
  return "dark";
}

/** The pieces of wall a decal may land on — everything but the openings, tried
 * a bounded number of times rather than solved. A wall has far more free space
 * than holes, so eight tries lands one nearly always, and the times it does not
 * are a building with one fewer stain on it. */
function freeSpot(
  def: TownBuildingDef,
  w: number,
  h: number,
  slots: readonly TownSlot[],
  size: readonly [number, number],
  band: TownDecalDef["band"],
  seed: number,
): { x: number; y: number } | null {
  // NEVER ON THE ROOF, and that is not a nicety — a pitched roof and an open
  // capping both leave their top rows TRANSPARENT, so a tag placed up there is
  // not on the building at all. It is a stripe of spray paint hanging in the
  // night sky above a house, which is exactly what the first pass drew.
  const top = def.roofPx;
  const bottom = h - 3 - size[1];
  if (bottom < top) return null;
  for (let i = 0; i < 8; i++) {
    const rx = hash2(seed, i * 2);
    const ry = hash2(seed, i * 2 + 1);
    const x = Math.round(1 + rx * Math.max(0, w - size[0] - 2));
    let lo = top;
    let hi = bottom;
    // Somebody stands on the pavement to spray a wall, ivy starts at the
    // ground, and soot comes out of a window and goes UP.
    if (band === "low") lo = Math.max(top, h - 16 - size[1]);
    if (band === "high") hi = Math.max(top, Math.min(bottom, h - 20));
    if (hi < lo) hi = lo;
    const y = Math.round(lo + ry * (hi - lo));
    const clash = slots.some(
      (s) =>
        x < s.x + s.w &&
        x + size[0] > s.x &&
        y < s.y + s.h &&
        y + size[1] > s.y,
    );
    if (!clash) return { x, y };
  }
  return null;
}

/** Dress one building — the shell, everything in a hole in it, everything hung
 * over one, and everything that has happened to the wall since. */
function dressBuilding(
  def: TownBuildingDef,
  plot: number,
  t: number,
): { layers: TownLayer[]; wear: number; key: string } {
  const wear = wearAt(t, hash2(plot, 1), def);
  const w = townWidth(def);
  const h = townHeight(def);
  const colourway = Math.floor(hash2(plot, 2) * 3);
  const shell = `${def.id}${["", "_b", "_c"][colourway] ?? ""}`;
  const layers: TownLayer[] = [{ sprite: shell, x: 0, y: 0 }];
  const marks: string[] = [shell, String(wear)];

  // IS ANYBODY STILL IN. Asked once for the whole building, because a house
  // with one lit window and one boarded one is a house that has not made up its
  // mind. The story counts this: a lit one every third house at the hero's end,
  // where somebody's welfare still lands.
  const occupied = def.lit && wear < 3 && hash2(plot, 3) < 0.46 + 0.3 * t;

  const slots = townSlots(def);
  // THE DOOR IS PICKED ONCE FOR THE BUILDING, not per doorway — a semi with a
  // security grille on one door and a screen door on the other is two houses.
  const door =
    pick(TOWN_DOORS, t, wear, hash2(plot, 4))?.id ?? TOWN_DOORS[0]!.id;
  const garage =
    pick(TOWN_GARAGE_DOORS, t, wear, hash2(plot, 5))?.id ??
    TOWN_GARAGE_DOORS[0]!.id;
  marks.push(door, garage);

  slots.forEach((slot, i) => {
    // A LIT WINDOW IS UPSTAIRS OR IT IS A SHOP. Somebody is in the back room or
    // in bed; nobody sits in a front hall with the light on. The shopfront is
    // the exception and the good one — a lit chippy on a street of boarded
    // trades is the single warmest thing on this whole road.
    const lightable = occupied && (slot.storey > 0 || slot.kind === "shop");
    const state = holeState(wear, lightable, hash2(plot, 10 + i));
    const stem =
      slot.kind === "door" ? door : slot.kind === "garage" ? garage : slot.part;
    const sprite = `town_${stem}_${state}`;
    const size = TOWN_ART_SIZE[stem] ?? [slot.w, slot.h];
    // A picked door may be WIDER than the generic doorway the slot was sized
    // for (a pair of doors on a showroom), so it is re-centred on the hole it
    // fills rather than pinned to its left edge.
    layers.push({
      sprite,
      x: Math.max(
        1,
        Math.min(w - size[0] - 1, slot.x - Math.round((size[0] - slot.w) / 2)),
      ),
      y: slot.y + (slot.h - size[1]),
    });
    marks.push(state);
  });

  // THE PORCH, over whichever door the ground floor actually has.
  const porchAt = townPorchSlot(def);
  if (porchAt && hash2(plot, 6) < 0.72) {
    const porch = pick(TOWN_PORCHES, t, wear, hash2(plot, 7));
    const size = porch ? TOWN_ART_SIZE[porch.id] : null;
    if (porch && size) {
      layers.push({
        sprite: `town_${porch.id}`,
        x: Math.max(
          0,
          Math.min(w - size[0], porchAt.x - Math.round(size[0] / 2)),
        ),
        y: Math.max(0, porchAt.y - size[1] + 1),
      });
      marks.push(porch.id);
    }
  }

  // …AND THE SIGN, which is what makes a trade a trade.
  const signAt = townSignSlot(def);
  if (signAt) {
    const sign = pick(TOWN_SIGNS, t, wear, hash2(plot, 8));
    const size = sign ? TOWN_ART_SIZE[sign.id] : null;
    if (sign && size) {
      layers.push({
        sprite: `town_${sign.id}`,
        x: Math.max(
          0,
          Math.min(w - size[0], signAt.x - Math.round(size[0] / 2)),
        ),
        y: Math.max(0, signAt.y - size[1]),
      });
      marks.push(sign.id);
    }
  }

  // WHAT HAS HAPPENED TO THE WALL SINCE. One piece per rung of wear, so a kept
  // house carries nothing and a ruin is covered — and each is placed on the
  // wall rather than over a window, which is the difference between dressing
  // and a rendering bug.
  for (let i = 0; i < wear; i++) {
    const decal = pick(TOWN_DECALS, t, wear, hash2(plot, 20 + i));
    const size = decal ? TOWN_ART_SIZE[decal.id] : null;
    if (!decal || !size) continue;
    const at = freeSpot(def, w, h, slots, size, decal.band, plot * 31 + i);
    if (!at) continue;
    layers.push({ sprite: `town_${decal.id}`, x: at.x, y: at.y });
    marks.push(`${decal.id}@${at.x},${at.y}`);
  }

  return { layers, wear, key: marks.join("|") };
}

/** …and the strip in front of it: the fence or hedge on the building line, and
 * whatever has been left standing against it. */
function dressFrontage(
  def: TownBuildingDef,
  plot: number,
  t: number,
  wear: number,
): { layers: TownLayer[]; w: number; h: number; key: string } | null {
  const fence = TOWN_FRONTS[def.front];
  const w = townWidth(def);
  const layers: TownLayer[] = [];
  const marks: string[] = [];
  // A GIVEN-UP STREET LOSES ITS FENCES. Past the second rung of wear a picket
  // or a hedge is the wrong sentence entirely — what is left at a house nobody
  // is keeping is a run of broken palings, which is its own piece of art rather
  // than a decal on the old one.
  const style = fence && wear >= 3 ? "front_broken" : fence;
  const size = style ? TOWN_ART_SIZE[style] : undefined;
  const fenceH = size ? size[1] : 0;
  let h = fenceH;
  if (style && size) {
    for (let x = 0; x < w; x += size[0]) {
      layers.push({ sprite: `town_${style}`, x, y: 0 });
    }
    marks.push(`${style}x${Math.ceil(w / size[0])}`);
  }

  // THE JUNK. It is a function of how given-up the street is, and it is the
  // fastest read on this whole road that a block has been abandoned — a sofa in
  // a front garden says more in one glance than four boarded windows.
  const junkCount = Math.min(
    3,
    Math.max(0, wear - 1 + (hash2(plot, 9) < 0.3 ? 1 : 0)),
  );
  const junk: { sprite: string; x: number; h: number }[] = [];
  for (let i = 0; i < junkCount; i++) {
    const def2 = pick(TOWN_JUNK, t, wear, hash2(plot, 40 + i));
    const js = def2 ? TOWN_ART_SIZE[def2.id] : null;
    if (!def2 || !js) continue;
    const x = Math.round(hash2(plot, 50 + i) * Math.max(0, w - js[0]));
    h = Math.max(h, js[1]);
    junk.push({ sprite: `town_${def2.id}`, x, h: js[1] });
    marks.push(`${def2.id}@${x}`);
  }
  if (!layers.length && !junk.length) return null;
  // EVERYTHING IN THE FRONT GARDEN STANDS ON THE SAME GROUND. A bin laid at the
  // top of the fence rather than beside it ends up a bin's height too high —
  // which on this road put the wheelie bins through the ground-floor windows of
  // the house they belong to. So the strip is as tall as its tallest piece and
  // every piece is dropped to its floor.
  for (const layer of layers) layer.y += h - fenceH;
  for (const piece of junk) {
    layers.push({ sprite: piece.sprite, x: piece.x, y: h - piece.h });
  }
  return { layers, w, h, key: marks.join("|") };
}

// ── THE BLOCK ────────────────────────────────────────────────────────────────

const BLOCK_PLOTS = 20;
const BLOCK_PX = BLOCK_PLOTS * TOWN_PLOT_PX;

/** Blocks already laid out, by road and index. A plan is a pure function of the
 * two, so this is a memo rather than state — and it is what keeps a frame that
 * pans three pixels from re-planning forty buildings. Capped and dropped whole
 * rather than evicted one at a time: a leg is sixty blocks, so the cap is only
 * ever reached by a session that has driven several. */
const blockCache = new Map<string, TownProp[]>();
const BLOCK_CACHE_CAP = 192;

/** Lay out one block — buildings tiled left to right, exactly filling it. */
function planBlock(block: number, road: TownRoad): TownProp[] {
  const props: TownProp[] = [];
  const walk = crowdEdges();
  const baseY = walk.top - TOWN_SETBACK_PX;
  const frontY = walk.top - TOWN_FRONTAGE_SETBACK_PX;
  let plot = 0;
  let previous: TownBuildingDef | null = null;
  while (plot < BLOCK_PLOTS) {
    const x0 = block * BLOCK_PX + plot * TOWN_PLOT_PX;
    const t = townDistrict(x0, road);
    const index = block * BLOCK_PLOTS + plot;
    const def = pickBuilding(t, BLOCK_PLOTS - plot, index, previous);
    if (!def) break;
    previous = def;
    const w = townWidth(def);
    const h = townHeight(def);
    const centre = x0 + (def.slots * TOWN_PLOT_PX - TOWN_ALLEY_PX) / 2;
    const dress = dressBuilding(def, index, t);
    props.push({
      key: dress.key,
      x: centre,
      y: baseY,
      w,
      h,
      layers: dress.layers,
    });
    const front = dressFrontage(def, index, t, dress.wear);
    if (front) {
      props.push({
        key: `f:${front.key}`,
        x: centre,
        y: frontY,
        w: front.w,
        h: front.h,
        layers: front.layers,
      });
    }
    plot += def.slots;
  }
  return props;
}

/** Every standing piece of town between two world x — the buildings on the far
 * verge and the frontage in front of them, ready to be composed and blitted. */
export function planTown(
  fromX: number,
  toX: number,
  road: TownRoad,
): TownProp[] {
  const first = Math.floor(fromX / BLOCK_PX) - 1;
  const last = Math.floor(toX / BLOCK_PX) + 1;
  const out: TownProp[] = [];
  for (let block = first; block <= last; block++) {
    const key = `${road.direction}:${road.coursePx}:${block}`;
    let plan = blockCache.get(key);
    if (!plan) {
      if (blockCache.size >= BLOCK_CACHE_CAP) blockCache.clear();
      plan = planBlock(block, road);
      blockCache.set(key, plan);
    }
    for (const prop of plan) {
      if (prop.x + prop.w / 2 < fromX || prop.x - prop.w / 2 > toX) continue;
      out.push(prop);
    }
  }
  return out;
}

/** Drop every laid-out block. Only the tests and the preview tools need it —
 * a running drive never changes its own road. */
export function resetTownPlan(): void {
  blockCache.clear();
}
