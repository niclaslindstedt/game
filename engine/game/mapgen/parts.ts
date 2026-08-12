// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE STATIC PARTS GENERATOR — a floor plan SEWN from hand-drawn rooms instead
// of carved by the BSP.
//
// A carved map is different every run and pays for it in recognizability:
// nothing on it is anywhere for a reason, so ten runs in the player cannot say
// one true sentence about the building. A parts map inverts the trade. Every
// room is AUTHORED — the kitchen is the kitchen, furniture and all — and the
// run's variety is WHICH rooms are dealt and HOW they are sewn together at
// their door sockets. The result reads as a place somebody built, because
// somebody did.
//
// The whole trick is WHAT THIS MODULE EMITS: the same `ChamberGrid` the carve
// emits. Every pass downstream — the walls, the district floors, the scatter,
// the depth axis, the caches, the vaults, the trader, the quest reachability —
// reads chambers and borders and cannot tell a sewn grid from a carved one.
// What the parts path replaces beyond the geometry is the HORDE: a parts map
// populates itself with one-mob spawn markers (`LevelDef.mobSpawns`, the WoW
// model) instead of knot spawn points, which generate.ts reads off the
// assembly this module returns.
//
// THE DEAL. The `start` part goes down first (the hero lands in it). Parts are
// then dealt one at a time: pick an open door socket, pick a part that still
// has instances to give (weighted, required-first), mirror it if its author
// allowed (`flip`), and sew one of its opposite-edge sockets onto the open one
// — rejecting any placement that overlaps a dealt room or grows the plan past
// the blueprint's `size`. The BOSS part is sewn LAST, onto the open socket
// farthest from the landing by door count, so the search stays as long as the
// deal allows. A deal that cannot satisfy its requirements is thrown away and
// redealt (the stream keeps moving, so the retry is a different deal), which
// keeps a rare cramped deal from shipping without its throne room.

import type { Rng } from "@game/lib/rng.ts";
import { vec, type Vec2 } from "@game/lib/vec.ts";
import type { LevelDef } from "../defs/levels/types.ts";
import {
  areaById,
  borderEnclosure,
  borderOwner,
  type MapArea,
} from "./areas.ts";
import type {
  Border,
  BorderLink,
  Chamber,
  ChamberGrid,
  WallRun,
} from "./rooms.ts";
import type {
  MapBlueprint,
  MapPart,
  MapParts,
  PartDoor,
  PartSpawn,
} from "./types.ts";

/** One dealt room: which part, where it landed, and how it was mirrored. */
export type PartPlacement = {
  part: MapPart;
  /** The chamber this placement became (index into `grid.chambers`). */
  cell: number;
  x: number;
  y: number;
  flipX: boolean;
  flipY: boolean;
};

/** What the deal came to — the grid plus everything only the deal knows. */
export type PartsAssembly = {
  grid: ChamberGrid;
  placements: PartPlacement[];
  /** The assembled extents (world px), margins included. */
  width: number;
  height: number;
  /** The OUTER walls: every stretch of a dealt room's edge that no neighbour
   * covers, so the plan is sealed against the void around it. */
  perimeter: WallRun[];
  /** The landing part's chamber. */
  startCell: number;
  /** Where the boss stands (world px) and whose chamber holds him — rolled
   * among the dealt boss anchors when there is more than one. Absent when the
   * deck has no boss part (a `reachExit` venue, or one that ends in an annex). */
  boss?: { at: Vec2; cell: number };
};

/** Dead ground kept between the plan and the map's edge, so the outer wall
 * chains are never clipped by the boundary. A multiple of the 16px ground tile
 * so district floor zones keep snapping cleanly. */
const MAP_MARGIN = 48;

/** How many fresh deals a cramped seed gets before the assembly gives up. */
const DEAL_ATTEMPTS = 24;

/**
 * THE SEARCH FLOOR (world px): how far the hero's WORST possible landing spot
 * must be from the boss's anchor before a deal is accepted. The whole point of
 * a boss room sewn last is the walk to it — a deal that folds back on itself
 * and parks the throne two rooms from the landing is a commute, so it is
 * thrown away and redealt while attempts remain (the best deal seen stands in
 * if none clears the bar, because half a search still beats no venue at all).
 * Comfortably above the campaign-wide "never visible from the landing" test
 * floor (1200), measured against the landing part's own farthest corner.
 */
const BOSS_WALK_MIN = 1250;

/** Two unconsumed sockets on facing edges are joined as a LOOP when their
 * centers sit within this of each other (world px) — the free way the plan
 * stops being a pure tree. */
const LOOP_TOLERANCE = 32;

const OPPOSITE: Record<PartDoor["edge"], PartDoor["edge"]> = {
  n: "s",
  s: "n",
  e: "w",
  w: "e",
};

/** A door socket in a placement's own oriented frame. */
type Socket = {
  edge: PartDoor["edge"];
  /** Center along the edge, oriented (world-frame direction). */
  at: number;
  width?: number;
};

/** A room mid-deal, before chambers exist. */
type Placed = {
  part: MapPart;
  x: number;
  y: number;
  flipX: boolean;
  flipY: boolean;
  sockets: Socket[];
  /** Which sockets were sewn (index into `sockets`). */
  used: Set<number>;
  /** Door count from the landing, for the boss attach. */
  dist: number;
};

/** A part's sockets under a mirror: edges swap sides and offsets reflect. */
function orientSockets(
  part: MapPart,
  flipX: boolean,
  flipY: boolean,
): Socket[] {
  return part.doors.map((d) => {
    let edge = d.edge;
    let at = d.at;
    if (flipX) {
      if (edge === "e") edge = "w";
      else if (edge === "w") edge = "e";
      else at = part.width - at;
    }
    if (flipY) {
      if (edge === "n") edge = "s";
      else if (edge === "s") edge = "n";
      else at = part.height - at;
    }
    return d.width !== undefined ? { edge, at, width: d.width } : { edge, at };
  });
}

/** A part-local point under a placement's mirror, in world coordinates. */
export function partPoint(p: PartPlacement, lx: number, ly: number): Vec2 {
  return vec(
    Math.round(p.x + (p.flipX ? p.part.width - lx : lx)),
    Math.round(p.y + (p.flipY ? p.part.height - ly : ly)),
  );
}

/** A socket's center in world coordinates. */
function socketPos(room: Placed, s: Socket): Vec2 {
  const w = room.part.width;
  const h = room.part.height;
  if (s.edge === "n") return vec(room.x + s.at, room.y);
  if (s.edge === "s") return vec(room.x + s.at, room.y + h);
  if (s.edge === "w") return vec(room.x, room.y + s.at);
  return vec(room.x + w, room.y + s.at);
}

/** Strict-interior rectangle overlap — touching edges is how rooms meet. */
function overlaps(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return (
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  );
}

/** The effective opening a socket punches — its own width, else its area's,
 * else the blueprint's. */
function socketWidth(
  s: Socket,
  part: MapPart,
  areas: MapArea[],
  fallback: number,
): number {
  return s.width ?? areaById(areas, part.area).doorWidth ?? fallback;
}

/** One sewn connection between two dealt rooms. */
type Seam = {
  a: number;
  b: number;
  /** The opening's center along the shared border. */
  at: number;
  width: number;
};

type Deal = {
  rooms: Placed[];
  seams: Seam[];
};

/** Weighted pick over the still-dealable parts; required-first. */
function pickPart(
  deck: MapParts,
  counts: Map<string, number>,
  bossPart: MapPart | undefined,
  rng: Rng,
): MapPart | null {
  const dealable = (p: MapPart): boolean =>
    (counts.get(p.id) ?? 0) < (p.max ?? 1) &&
    p !== bossPart &&
    p.start !== true;
  // A part still owed its minimum outranks the whole deck: the deal exists to
  // satisfy the requirements, and the weights only govern the slack.
  const owed = deck.list.filter(
    (p) => dealable(p) && (counts.get(p.id) ?? 0) < (p.min ?? 0),
  );
  const pool = owed.length > 0 ? owed : deck.list.filter(dealable);
  if (pool.length === 0) return null;
  const total = pool.reduce((sum, p) => sum + (p.weight ?? 1), 0);
  let roll = rng() * total;
  for (const p of pool) {
    roll -= p.weight ?? 1;
    if (roll <= 0) return p;
  }
  return pool[pool.length - 1] as MapPart;
}

/**
 * Try to sew `part` onto the open socket `s` of `room`. Returns the placement
 * (not yet committed) or null when nothing fits — every orientation and every
 * opposite-edge socket is tried, in a shuffled order so the same two rooms do
 * not always meet the same way.
 */
function trySew(
  rooms: Placed[],
  room: Placed,
  s: Socket,
  part: MapPart,
  bounds: { width: number; height: number },
  rng: Rng,
): Placed | null {
  const flips: [boolean, boolean][] =
    part.flip === true
      ? [
          [false, false],
          [true, false],
          [false, true],
          [true, true],
        ]
      : [[false, false]];
  // Shuffle orientations and sockets off the stream so repeats vary.
  for (let i = flips.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [flips[i], flips[j]] = [
      flips[j] as [boolean, boolean],
      flips[i] as [boolean, boolean],
    ];
  }
  const want = OPPOSITE[s.edge];
  const anchor = socketPos(room, s);
  for (const [flipX, flipY] of flips) {
    const sockets = orientSockets(part, flipX, flipY);
    const candidates = sockets
      .map((sock, idx) => ({ sock, idx }))
      .filter((c) => c.sock.edge === want);
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [candidates[i], candidates[j]] = [
        candidates[j] as (typeof candidates)[number],
        candidates[i] as (typeof candidates)[number],
      ];
    }
    for (const { sock } of candidates) {
      // Align the two socket centers; the shared border falls out of it.
      let x: number;
      let y: number;
      if (want === "w") {
        x = anchor.x;
        y = anchor.y - sock.at;
      } else if (want === "e") {
        x = anchor.x - part.width;
        y = anchor.y - sock.at;
      } else if (want === "n") {
        x = anchor.x - sock.at;
        y = anchor.y;
      } else {
        x = anchor.x - sock.at;
        y = anchor.y - part.height;
      }
      const rect = { x, y, w: part.width, h: part.height };
      if (
        rooms.some((r) =>
          overlaps(rect, { x: r.x, y: r.y, w: r.part.width, h: r.part.height }),
        )
      )
        continue;
      // The deal must stay inside the blueprint's priced extents.
      let minX = rect.x;
      let minY = rect.y;
      let maxX = rect.x + rect.w;
      let maxY = rect.y + rect.h;
      for (const r of rooms) {
        minX = Math.min(minX, r.x);
        minY = Math.min(minY, r.y);
        maxX = Math.max(maxX, r.x + r.part.width);
        maxY = Math.max(maxY, r.y + r.part.height);
      }
      if (maxX - minX > bounds.width || maxY - minY > bounds.height) continue;
      return {
        part,
        x,
        y,
        flipX,
        flipY,
        sockets,
        used: new Set(),
        dist: room.dist + 1,
      };
    }
  }
  return null;
}

/** Every open (unsewn) socket in the deal, as (room index, socket index). */
function openSockets(rooms: Placed[]): { room: number; socket: number }[] {
  const out: { room: number; socket: number }[] = [];
  rooms.forEach((r, ri) => {
    r.sockets.forEach((_, si) => {
      if (!r.used.has(si)) out.push({ room: ri, socket: si });
    });
  });
  return out;
}

/** Sew `next` onto `rooms[at.room]`'s socket, recording the seam. */
function commit(
  deal: Deal,
  at: { room: number; socket: number },
  next: Placed,
  areas: MapArea[],
  doorWidth: number,
): void {
  const room = deal.rooms[at.room] as Placed;
  const s = room.sockets[at.socket] as Socket;
  room.used.add(at.socket);
  const pos = socketPos(room, s);
  // The sewn socket on the new room is the one whose center coincides.
  const bi = next.sockets.findIndex((sock, idx) => {
    if (next.used.has(idx) || sock.edge !== OPPOSITE[s.edge]) return false;
    const p = socketPos(next, sock);
    return p.x === pos.x && p.y === pos.y;
  });
  if (bi >= 0) next.used.add(bi);
  const other = bi >= 0 ? (next.sockets[bi] as Socket) : s;
  // A hangar-to-cupboard door is a cupboard door: the opening is the SMALLER
  // of the two sockets' widths, the same rule the carve applies to areas.
  const width = Math.min(
    socketWidth(s, room.part, areas, doorWidth),
    socketWidth(other, next.part, areas, doorWidth),
  );
  deal.rooms.push(next);
  deal.seams.push({
    a: at.room,
    b: deal.rooms.length - 1,
    at: s.edge === "n" || s.edge === "s" ? pos.x : pos.y,
    width,
  });
}

/**
 * One complete deal: start part down, the deck dealt socket by socket, the boss
 * part sewn last and farthest. Returns null when the deal could not satisfy the
 * blueprint's requirements — the caller redeals.
 */
function deal(
  deck: MapParts,
  areas: MapArea[],
  doorWidth: number,
  bounds: { width: number; height: number },
  rng: Rng,
): Deal | null {
  const start = deck.list.find((p) => p.start === true);
  if (!start) return null;
  const bossPart = deck.list.find(
    (p) => p.boss !== undefined && p.start !== true,
  );
  const rooms: Placed[] = [
    {
      part: start,
      x: 0,
      y: 0,
      flipX: false,
      flipY: false,
      sockets: orientSockets(start, false, false),
      used: new Set(),
      dist: 0,
    },
  ];
  const out: Deal = { rooms, seams: [] };
  const counts = new Map<string, number>([[start.id, 1]]);
  const span = deck.count[1] - deck.count[0];
  const target =
    1 + deck.count[0] + Math.floor(rng() * (span + 1)) + (bossPart ? 1 : 0);
  // Deal the middle of the map: everything but the boss room.
  let stuck = 0;
  while (rooms.length < (bossPart ? target - 1 : target)) {
    const open = openSockets(rooms);
    if (open.length === 0) break;
    const part = pickPart(deck, counts, bossPart, rng);
    if (!part) break;
    const socket = open[Math.floor(rng() * open.length)] as {
      room: number;
      socket: number;
    };
    const room = rooms[socket.room] as Placed;
    const next = trySew(
      rooms,
      room,
      room.sockets[socket.socket] as Socket,
      part,
      bounds,
      rng,
    );
    if (!next) {
      // This part did not fit this socket; try again elsewhere. A deal that
      // keeps missing is out of room — stop before the stream is bled dry.
      if (++stuck > 60) break;
      continue;
    }
    stuck = 0;
    commit(out, socket, next, areas, doorWidth);
    counts.set(part.id, (counts.get(part.id) ?? 0) + 1);
  }
  // The BOSS room goes down LAST, on the open socket farthest from the landing
  // by door count — the deal's own longest walk.
  if (bossPart) {
    const open = openSockets(rooms).sort(
      (a, b) => (rooms[b.room] as Placed).dist - (rooms[a.room] as Placed).dist,
    );
    let placed = false;
    for (const socket of open) {
      const room = rooms[socket.room] as Placed;
      const next = trySew(
        rooms,
        room,
        room.sockets[socket.socket] as Socket,
        bossPart,
        bounds,
        rng,
      );
      if (!next) continue;
      commit(out, socket, next, areas, doorWidth);
      counts.set(bossPart.id, (counts.get(bossPart.id) ?? 0) + 1);
      placed = true;
      break;
    }
    if (!placed) return null;
  }
  // Every `min` honoured, or the deal is thrown away.
  for (const p of deck.list) {
    if ((counts.get(p.id) ?? 0) < (p.min ?? 0)) return null;
  }
  return out;
}

/** How far the WORST landing spot in the start part is from the dealt boss
 * anchor — the searched-for walk a deal is judged by. Infinity when the deck
 * has no boss part (nothing to judge). */
function bossWalk(deal: Deal): number {
  const start = deal.rooms.find((r) => r.part.start === true);
  const throne = deal.rooms.find(
    (r) => r.part.boss !== undefined && r.part.start !== true,
  );
  if (!start || !throne) return Infinity;
  const anchor = (throne.part.boss as { at: [number, number] }).at;
  const at = {
    x: throne.x + (throne.flipX ? throne.part.width - anchor[0] : anchor[0]),
    y: throne.y + (throne.flipY ? throne.part.height - anchor[1] : anchor[1]),
  };
  const cx = start.x + start.part.width / 2;
  const cy = start.y + start.part.height / 2;
  return (
    Math.hypot(at.x - cx, at.y - cy) -
    Math.hypot(start.part.width, start.part.height) / 2
  );
}

/** LOOPS FOR FREE: two dealt rooms that ended up adjacent, each with an unsewn
 * socket on the facing edge at (nearly) the same spot, are joined — the plan
 * stops being a pure tree wherever its author lined the sockets up. */
function sewLoops(out: Deal, areas: MapArea[], doorWidth: number): void {
  const rooms = out.rooms;
  for (let ai = 0; ai < rooms.length; ai++) {
    const a = rooms[ai] as Placed;
    for (let asi = 0; asi < a.sockets.length; asi++) {
      if (a.used.has(asi)) continue;
      const as = a.sockets[asi] as Socket;
      const ap = socketPos(a, as);
      for (let bi = ai + 1; bi < rooms.length; bi++) {
        const b = rooms[bi] as Placed;
        for (let bsi = 0; bsi < b.sockets.length; bsi++) {
          if (b.used.has(bsi)) continue;
          const bs = b.sockets[bsi] as Socket;
          if (bs.edge !== OPPOSITE[as.edge]) continue;
          const bp = socketPos(b, bs);
          if (ap.x !== bp.x && ap.y !== bp.y) {
            // Facing sockets share a border line only when the touching
            // coordinate matches exactly; the along-edge offset may differ.
            continue;
          }
          const along =
            as.edge === "n" || as.edge === "s"
              ? Math.abs(ap.x - bp.x)
              : Math.abs(ap.y - bp.y);
          const touch =
            as.edge === "n" || as.edge === "s" ? ap.y === bp.y : ap.x === bp.x;
          if (!touch || along > LOOP_TOLERANCE) continue;
          a.used.add(asi);
          b.used.add(bsi);
          out.seams.push({
            a: ai,
            b: bi,
            at:
              as.edge === "n" || as.edge === "s"
                ? Math.round((ap.x + bp.x) / 2)
                : Math.round((ap.y + bp.y) / 2),
            width: Math.min(
              socketWidth(as, a.part, areas, doorWidth),
              socketWidth(bs, b.part, areas, doorWidth),
            ),
          });
        }
      }
    }
  }
}

/** The exact border geometry two touching rooms share, if any. */
function sharedBorder(
  a: Placed,
  b: Placed,
): { axis: "v" | "h"; coord: number; from: number; to: number } | null {
  const ax2 = a.x + a.part.width;
  const bx2 = b.x + b.part.width;
  const ay2 = a.y + a.part.height;
  const by2 = b.y + b.part.height;
  const vertical = ax2 === b.x ? ax2 : bx2 === a.x ? a.x : null;
  if (vertical !== null) {
    const from = Math.max(a.y, b.y);
    const to = Math.min(ay2, by2);
    return to > from ? { axis: "v", coord: vertical, from, to } : null;
  }
  const horizontal = ay2 === b.y ? ay2 : by2 === a.y ? a.y : null;
  if (horizontal !== null) {
    const from = Math.max(a.x, b.x);
    const to = Math.min(ax2, bx2);
    return to > from ? { axis: "h", coord: horizontal, from, to } : null;
  }
  return null;
}

/**
 * Sew a blueprint's parts into a chamber grid.
 *
 * Deterministic on the stream it is handed: the same seed deals the same map.
 * Throws when no deal can satisfy the deck's requirements after
 * `DEAL_ATTEMPTS` — a blueprint whose parts cannot assemble is an authoring
 * error the schema could not see, and shipping half a venue silently would be
 * worse than saying so.
 */
export function assembleParts(bp: MapBlueprint, rng: Rng): PartsAssembly {
  const deck = bp.parts as MapParts;
  const doorWidth = bp.layout.doorWidth;
  const bounds = {
    width: bp.size.width - MAP_MARGIN * 2,
    height: bp.size.height - MAP_MARGIN * 2,
  };
  // Deal until one clears the SEARCH FLOOR (see `BOSS_WALK_MIN`); keep the
  // longest walk seen as the stand-in when the deck simply cannot reach it.
  let dealt: Deal | null = null;
  let bestWalk = -Infinity;
  for (let attempt = 0; attempt < DEAL_ATTEMPTS; attempt++) {
    const candidate = deal(deck, bp.areas, doorWidth, bounds, rng);
    if (!candidate) continue;
    const walk = bossWalk(candidate);
    if (walk > bestWalk) {
      bestWalk = walk;
      dealt = candidate;
    }
    if (walk >= BOSS_WALK_MIN) break;
  }
  if (!dealt) {
    throw new Error(
      `map "${bp.id}": the parts deck could not be assembled — no deal placed ` +
        `every required part inside ${bp.size.width}x${bp.size.height}`,
    );
  }
  sewLoops(dealt, bp.areas, doorWidth);

  // Translate the whole plan into positive space, margins on, snapped to the
  // ground tile grid so district floors keep landing on tile origins.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of dealt.rooms) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.part.width);
    maxY = Math.max(maxY, r.y + r.part.height);
  }
  const dx = MAP_MARGIN - Math.floor(minX / 16) * 16;
  const dy = MAP_MARGIN - Math.floor(minY / 16) * 16;
  for (const r of dealt.rooms) {
    r.x += dx;
    r.y += dy;
  }
  const width = Math.ceil((maxX + dx + MAP_MARGIN) / 16) * 16;
  const height = Math.ceil((maxY + dy + MAP_MARGIN) / 16) * 16;

  // --- The grid ---------------------------------------------------------------
  const chambers: Chamber[] = dealt.rooms.map((r, id) => ({
    id,
    x: r.x,
    y: r.y,
    w: r.part.width,
    h: r.part.height,
    area: r.part.area,
    // A dealt room is its own district: the deck's author already drew every
    // room they wanted, exactly as an authored plan does.
    district: id,
  }));
  const areaOf = (id: number): MapArea =>
    areaById(bp.areas, (chambers[id] as Chamber).area);
  const seamAt = new Map<string, Seam>();
  for (const s of dealt.seams) {
    seamAt.set(`${Math.min(s.a, s.b)}:${Math.max(s.a, s.b)}`, s);
  }
  const borders: Border[] = [];
  for (let ai = 0; ai < dealt.rooms.length; ai++) {
    for (let bi = ai + 1; bi < dealt.rooms.length; bi++) {
      const geom = sharedBorder(
        dealt.rooms[ai] as Placed,
        dealt.rooms[bi] as Placed,
      );
      if (!geom) continue;
      const seam = seamAt.get(`${ai}:${bi}`);
      const strength = borderEnclosure(
        areaOf(ai).enclosure,
        areaOf(bi).enclosure,
      );
      // A sewn seam is a way through, worded by the pair of areas exactly as
      // the carve words its borders: two open grounds simply flow together, a
      // soft pair gets an archway, a hard pair a doorway. An adjacency the
      // deal did NOT sew is a wall — including between two open areas, because
      // "not connected" has to MEAN not walkable or the whole depth axis lies.
      const link: BorderLink = !seam
        ? "closed"
        : strength === "none"
          ? "open"
          : strength === "soft"
            ? "arch"
            : "door";
      const owner = borderOwner(areaOf(ai), areaOf(bi), bp.areas);
      // The rooms were translated IN PLACE above, so the border geometry read
      // off them is already in map coordinates; only the seams — recorded
      // mid-deal, before the translation — still need the shift.
      const border: Border = {
        a: ai,
        b: bi,
        axis: geom.axis,
        coord: geom.coord,
        from: geom.from,
        to: geom.to,
        link,
        material: owner.wall ?? bp.layout.wall,
        owner: owner.id,
        door: seam ? seam.width : (owner.doorWidth ?? doorWidth),
      };
      if (seam) border.doorAt = seam.at + (geom.axis === "v" ? dy : dx);
      borders.push(border);
    }
  }
  const neighbors: number[][] = chambers.map(() => []);
  for (const b of borders) {
    if (b.link === "closed") continue;
    (neighbors[b.a] as number[]).push(b.b);
    (neighbors[b.b] as number[]).push(b.a);
  }
  const grid: ChamberGrid = { chambers, borders, neighbors, prefabs: [] };

  // --- The perimeter ----------------------------------------------------------
  // Every stretch of a room's edge no neighbour covers is an OUTER wall: unlike
  // a carve, a sewn plan does not tile its rectangle, and the void between its
  // arms would otherwise be open floor every wall pass ignores.
  const perimeter: WallRun[] = [];
  const pushRuns = (
    axis: "v" | "h",
    coord: number,
    from: number,
    to: number,
    covered: [number, number][],
    material: string,
  ): void => {
    const spans: [number, number][] = [[from, to]];
    for (const [cf, ct] of covered) {
      for (let i = spans.length - 1; i >= 0; i--) {
        const [sf, st] = spans[i] as [number, number];
        if (ct <= sf || cf >= st) continue;
        spans.splice(i, 1);
        if (cf > sf) spans.push([sf, cf]);
        if (ct < st) spans.push([ct, st]);
      }
    }
    for (const [sf, st] of spans) {
      if (st - sf < 1) continue;
      perimeter.push({ axis, coord, from: sf, to: st, material });
    }
  };
  for (let i = 0; i < chambers.length; i++) {
    const c = chambers[i] as Chamber;
    const material = areaOf(i).wall ?? bp.layout.wall;
    const touching = (
      axis: "v" | "h",
      coord: number,
      from: number,
      to: number,
    ): [number, number][] =>
      chambers
        .filter((o) => o.id !== c.id)
        .filter((o) =>
          axis === "v"
            ? o.x === coord || o.x + o.w === coord
            : o.y === coord || o.y + o.h === coord,
        )
        .map((o): [number, number] =>
          axis === "v"
            ? [Math.max(from, o.y), Math.min(to, o.y + o.h)]
            : [Math.max(from, o.x), Math.min(to, o.x + o.w)],
        )
        .filter(([f, t]) => t > f);
    pushRuns(
      "h",
      c.y,
      c.x,
      c.x + c.w,
      touching("h", c.y, c.x, c.x + c.w),
      material,
    );
    pushRuns(
      "h",
      c.y + c.h,
      c.x,
      c.x + c.w,
      touching("h", c.y + c.h, c.x, c.x + c.w),
      material,
    );
    pushRuns(
      "v",
      c.x,
      c.y,
      c.y + c.h,
      touching("v", c.x, c.y, c.y + c.h),
      material,
    );
    pushRuns(
      "v",
      c.x + c.w,
      c.y,
      c.y + c.h,
      touching("v", c.x + c.w, c.y, c.y + c.h),
      material,
    );
  }

  // --- The cast ---------------------------------------------------------------
  const placements: PartPlacement[] = dealt.rooms.map((r, cell) => ({
    part: r.part,
    cell,
    x: r.x,
    y: r.y,
    flipX: r.flipX,
    flipY: r.flipY,
  }));
  const startIdx = dealt.rooms.findIndex((r) => r.part.start === true);
  const out: PartsAssembly = {
    grid,
    placements,
    width,
    height,
    perimeter,
    startCell: startIdx,
  };
  // WHERE THE BOSS STANDS: rolled among the dealt boss anchors, so a deck that
  // dares to deal its throne twice keeps the player guessing which one is held.
  const thrones = placements.filter((p) => p.part.boss !== undefined);
  if (thrones.length > 0) {
    const throne = thrones[Math.floor(rng() * thrones.length)] as PartPlacement;
    const anchor = (throne.part.boss as { at: [number, number] }).at;
    out.boss = {
      at: partPoint(throne, anchor[0], anchor[1]),
      cell: throne.cell,
    };
  }
  return out;
}

/** A part's fixed furniture as one-prop lines — the same deterministic
 * placement a prefab's contents ride (see `buildPrefabProps`), mirrored with
 * the room. A prop whose offset leaves its own room is dropped rather than
 * clamped, for the prefabs' reason: a piece silently slid back inside would
 * hide the authoring mistake while leaving the room wrong. */
export function partProps(
  bp: MapBlueprint,
  assembly: PartsAssembly,
): NonNullable<LevelDef["propLines"]> {
  const out: NonNullable<LevelDef["propLines"]> = [];
  for (const placement of assembly.placements) {
    for (const prop of placement.part.props ?? []) {
      const obj = bp.objects.find((o) => o.id === prop.object);
      if (!obj) continue;
      const pos = partPoint(placement, prop.at[0], prop.at[1]);
      if (
        pos.x < placement.x ||
        pos.x > placement.x + placement.part.width ||
        pos.y < placement.y ||
        pos.y > placement.y + placement.part.height
      )
        continue;
      const line: (typeof out)[number] = {
        sprite: obj.sprite ?? obj.kind ?? obj.id,
        from: pos,
        // A COPY, never the same vector twice: two fields of one def sharing a
        // mutable point is a trap waiting for the first thing that writes to it.
        to: vec(pos.x, pos.y),
        spacing: 1,
      };
      if (obj.type !== "decor") {
        line.collide = true;
        if (obj.half) line.half = vec(obj.half.x, obj.half.y);
        else line.radius = obj.radius ?? 8;
        if (obj.jumpable) line.jumpable = true;
      }
      out.push(line);
    }
  }
  return out;
}

/** One dealt spawn marker, in world coordinates. */
export type PlacedSpawn = {
  at: Vec2;
  cell: number;
  spawn: PartSpawn;
};

/** Every spawn marker the deal put on the floor, mirrored with its room. */
export function partSpawns(assembly: PartsAssembly): PlacedSpawn[] {
  const out: PlacedSpawn[] = [];
  for (const placement of assembly.placements) {
    for (const spawn of placement.part.spawns ?? []) {
      out.push({
        at: partPoint(placement, spawn.at[0], spawn.at[1]),
        cell: placement.cell,
        spawn,
      });
    }
  }
  return out;
}
