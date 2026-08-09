// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// AREA TYPES — the rule engine that decides what each carved cell IS.
//
// A grid of identical walled boxes is a spreadsheet, not a place. What makes a
// generated map read as somewhere is that its cells are DIFFERENT KINDS of
// ground: open plain, fenced yard, sealed compound. So a blueprint declares an
// AREA PALETTE (`areas` in `content/maps/<id>.yaml`) and every carved cell is
// assigned one, which then decides three things:
//
//   ENCLOSURE  how the cell meets its neighbours — the walls are DERIVED from the
//              pair of areas either side of a border, never authored. Two open
//              plains simply flow into each other with no wall at all; a compound
//              beside anything gets a solid wall with a doorway; a yard gets a
//              wide archway. That is the whole reason a generated map stops
//              looking like a maze of stubs: a wall exists because the two cells
//              it separates are different kinds of place.
//   CONTENT    which scatter props belong here, which structures may stand here,
//              and how thick the horde is (`props` / `buildings` / `horde`).
//   ROLE       whether the cell may hold the boss or the hero's landing
//              (`boss` / `spawn`) — so "the boss is always found inside a
//              compound, never out on the open plain" is one flag, not code.
//
// Assignment CLUSTERS on purpose (`layout.cluster`): a cell usually takes a type
// one of its already-assigned neighbours has, and only sometimes rolls a fresh
// one. Without that the palette comes out as a checkerboard — a town cell, a
// desert cell, a town cell — and nothing reads as a district. With it, the same
// weights grow a town of four cells with desert around it.

import type { Rng } from "@game/lib/rng.ts";
import { regionContains, regionRect, type RegionRect } from "./regions.ts";
import type { Chamber } from "./rooms.ts";

/**
 * How a cell meets its neighbours, weakest to strongest. The border between two
 * cells takes the STRONGER of the two (see {@link borderEnclosure}), so a
 * compound is sealed by its own nature wherever it happens to land, and open
 * ground never fences itself in.
 *
 *   none  no wall at all — the two cells are one continuous piece of ground
 *   soft  a wall with a WIDE opening: a fence, a rubble ridge, a broken hull
 *   hard  a solid wall with a single DOORWAY, punched only where the map needs
 *         the connection
 */
export type Enclosure = "none" | "soft" | "hard";

const STRENGTH: Record<Enclosure, number> = { none: 0, soft: 1, hard: 2 };

/**
 * INSIDE OR OUTSIDE — which side of a building's wall this kind of place is on.
 *
 * It is the one fact about a district that nothing else can be derived from and
 * that half the map's content depends on. An enclosure says how a cell meets its
 * NEIGHBOURS, which is a different question: a fenced yard and a server room are
 * both `hard`, and only one of them has a ceiling. Once a map says which is
 * which, three things follow that used to be an author's discipline:
 *
 *   PROPS      a prop is authored `inside` or `outside` ON ITS SPRITE (a cactus
 *              is an outdoor thing wherever it turns up), and the build refuses
 *              a palette entry that could scatter it into the wrong half — see
 *              `MapObject.space`.
 *   ROOMS      only an interior district is cut into ROOMS (`roomSize`): a
 *              building is a warren of small spaces, open country is not.
 *   DOORS      an interior district hangs real doors in its doorways
 *              (`MapArea.doors`), which outdoors would be a door standing in a
 *              field.
 *
 * `outside` is the default, because every map in the game was open country
 * before any of this existed and a blueprint that says nothing must keep the
 * map it always carved.
 */
export type MapSpace = "inside" | "outside";

/** Which side of the wall an area is on — the default is open country. */
export function spaceOf(area: MapArea): MapSpace {
  return area.space ?? "outside";
}

/**
 * ONE RUNG OF A LADDER THE VENUE CLIMBS AS THE CAMPAIGN GOES BY — a district's
 * floor or a scattered prop's sprite, swapped for what the run's own memory
 * says the place should look like by now.
 *
 * A blueprint describes a venue in the abstract, and almost every venue in the
 * game is the same place whenever the hero walks into it. THE HUB IS NOT: it is
 * his home, he keeps setting fire to the lawn behind it, and a home that looks
 * identical on the way out to Mars as it did before he had ever left the ground
 * is a home nothing has happened to.
 *
 * `needs` / `until` are the SAME PAIR a cutscene prop carries
 * (`@game/lib/cutscene`, `CutsceneProp.needs`) matched against the SAME TAGS
 * (`cleared:<levelId>`, minted in `create.ts`), and that is the whole design:
 * the launch's house and the lawn it stands on are one picture the player sees
 * two ways, so they must not be two vocabularies. A scene names a condition; it
 * never works one out.
 *
 * **THE LADDER IS ORDERED AND THE LAST MATCH WINS.** So the ordinary authoring
 * is a plain list of `needs:` rungs, worst last, with the un-staged fields on
 * the area or object itself standing as rung zero. `until:` is there for the
 * rung that has to STOP applying, exactly as it is on a prop.
 *
 * **AND A RUNG MAY ONLY REDRESS, NEVER RESHAPE.** Ground, patch and sprite —
 * nothing that moves a wall, changes a density or takes an rng draw, because
 * the carve is one map that has to be the same map on every rung: a lawn whose
 * trees stood somewhere else after the moon would read as a different lot, not
 * as a burnt one, and in a session the host and a joiner deriving different
 * tags would be carving different worlds rather than dressing one.
 */
export type MapStage = {
  /** This rung applies only when the run carries this tag. */
  needs?: string;
  /** …and its mirror: only while the run does NOT carry it. */
  until?: string;
  /** `area`: the floor this rung lays instead. */
  ground?: { common: string; rare: string; rareEvery: number };
  /** `area`: and its patch pair. */
  patch?: { a: string; b: string; every: number };
  /** `object`: the sprite this rung draws instead. */
  sprite?: string;
};

/** Whether a stage's condition holds for a run carrying `tags` — the same two
 * questions `propOnStage` asks of a cutscene prop, and deliberately no others. */
export function stageApplies(
  stage: MapStage,
  tags: readonly string[],
): boolean {
  if (stage.needs !== undefined && !tags.includes(stage.needs)) return false;
  if (stage.until !== undefined && tags.includes(stage.until)) return false;
  return true;
}

/** One entry of a blueprint's area palette. */
export type MapArea = {
  /** Palette key, referenced by an object's `areas` list. */
  id: string;
  enclosure: Enclosure;
  /** Which side of the wall this is (see {@link MapSpace}). Default `outside`. */
  space?: MapSpace;
  /**
   * Relative share of the districts. `0` means this area is NEVER seeded on its
   * own — it exists only as another area's shell (see {@link shellOf}), or as an
   * {@link MapAnnex} the elevator rides to.
   */
  weight: number;
  /**
   * THERE IS EXACTLY ONE OF THESE. Seeded once, never rolled again — so the map
   * has A town rather than town blocks.
   *
   * The distinction is the whole difference between a frontier and a suburb.
   * Weights alone cannot express it: a weight low enough that towns are rare
   * gives runs with none at all, and one high enough to guarantee a town gives
   * runs with five. A player asked to find something needs it to BE somewhere —
   * one place, in a rolled corner of a big empty map, that he either has walked
   * into or has not.
   *
   * The `weight` still applies, as the odds this district gets one of the map's
   * seeds at all; a `once` area with a weight it never wins simply does not
   * appear on that run.
   */
  once?: boolean;
  /**
   * A KEYED ROOM: this district may be SEALED, its doorways carrying a locked
   * door that only its own keycard opens (`LevelDef.doors`, the engine's
   * story-item keys).
   *
   * It is a permission rather than an instruction: the carve locks a cell of
   * this kind only while the blueprint still has an unspent door id in its
   * `locks` list, so a map with one key has one vault however many cells of the
   * kind it grew. What is behind the door is the payoff — a cache and whatever
   * stands guard over it — and what is NEVER behind it is anything the run
   * requires: no boss, no landing, no set piece, no story pickup. A key locked
   * inside the room it opens is a run that cannot be finished, and it would be
   * rolled rather than authored, which is the worst kind of bug to ship.
   *
   * Only a `hard` district can be locked (the build refuses otherwise): a door
   * across a border that was already open or gated is a door with a way round.
   */
  lock?: boolean;
  /**
   * STREET BLOCKS: lay this area's `building` structures out along a street
   * instead of scattering them (see `buildBuildings`). The number is the street's
   * width in world px.
   *
   * A scatter of houses is a hamlet at best and a rash at worst, because the thing
   * that makes a town read as a town is not its density, it is its ALIGNMENT: two
   * rows of frontages facing each other across a lane the eye can run down. That
   * is also the read the mission wants — a main street is a corridor, and a
   * corridor is where a western gunfight happens.
   */
  blocks?: number;
  /**
   * Multiplies this area's chamber knot count — how thick the horde stands here.
   * 0 makes the area ambient-free (a genuinely empty quarter). Default 1.
   */
  horde?: number;
  /** May the BOSS's cell be one of these? Default true. */
  boss?: boolean;
  /** May the hero LAND here? Default true. */
  spawn?: boolean;
  /**
   * THE ARRIVAL. The hero does not merely MAY land here, he DOES — the landing
   * pick is confined to this district's cells and the "long walk" fallback that
   * reopens the whole map is refused.
   *
   * `spawn` is a permission and that is usually the right shape: a carve can
   * come out with barely any of the district a mission would rather open on, and
   * a run that starts somewhere second-best beats a run that starts in the
   * boss's neighbourhood. But an arrival that is part of the STORY is not a
   * preference — GOODCO's hero parks in the lot and walks in through the front
   * of the building, and a seed that badges him in halfway down a corridor has
   * skipped the scene, not relocated it. So a blueprint may say so outright,
   * exactly as `plan` does for a drawn venue.
   */
  landing?: boolean;
  /**
   * WHERE ON THE MAP this district may grow: a list of candidate compass regions
   * (see `MapRegion`), ONE of which is rolled per run. The district is then
   * confined to it — both the seed it starts from and every cell it spreads into.
   *
   * It is the difference between "there is a car park" and "there is a car park
   * on one side of the campus". A district with no regions is grown wherever the
   * seeds fall, which is right for a biome and wrong for anything the map's
   * geography is supposed to mean: an arrival should be at an EDGE, so walking
   * in is walking inward, and the building should be the thing you walk into
   * rather than something wrapped around the lot you parked in.
   *
   * Rolled rather than fixed for the usual reason: a player who learned which
   * side the doors were on last run has learned nothing about this one.
   */
  regions?: string[];
  /**
   * The most CELLS this district may grow to. Omitted = as far as the
   * simultaneous spread carries it.
   *
   * `regions` bounds a district by geography and that is not the same as
   * bounding its SIZE, because the confinement is tested per cell CENTRE: a
   * carve's cells are district-sized, so a cell whose middle sits in the
   * southern third can easily reach halfway up the map, and three of them in a
   * row is half the level. Measured on a small goodco carve, a car park meant to
   * be the corner the hero parks in came out as the entire southern half —
   * thinly populated by design, so the mission read as a lot of empty tarmac
   * with a building at one end.
   *
   * A cap is the honest fix rather than a smaller region: what the blueprint
   * means is "a couple of cells", and saying so survives the carve growing its
   * cells with the map.
   */
  maxCells?: number;
  /**
   * THE ROAD OUT: a DRIVEN car that reaches this district has left — the trip
   * its travel door names is booked from here rather than from the garage
   * door's own threshold.
   *
   * A departure wants somewhere to depart TO. Booking the trip at the roll-up
   * meant the drive ended the moment the bumper cleared the door: the car was
   * still in its own driveway, nose barely straight, and the screen cut. A
   * strip of public road along the map's edge gives the beat its second half —
   * out of the bay, across the drive, onto the road — and the road is where the
   * level lets go. Compiled into `LevelDef.driveOut`; see `vehicles.ts`.
   */
  driveOut?: boolean;
  /**
   * THE TRADER'S BEAT: a merchant who WORKS A PITCH (`LevelDef.merchant.beat`)
   * paces this district end to end instead of standing at a counter. Flag the
   * strip he belongs on — the hub's road, a market row — and the carve
   * compiles every cell of it into `LevelDef.merchantBeat`; see `merchant.ts`.
   *
   * The beat is read as ONE strip along its long axis, so a district flagged
   * here should BE one: a lane, a row, a stretch of pavement. Flagging a
   * plaza gives a trader who crosses it diagonally forever.
   */
  beat?: boolean;
  /**
   * THE STAFF LOT: people turn up for a shift on this district — a car every so
   * often, and somebody getting out of it and walking to the way in (see
   * `LevelDef.arrivals`, `arrivals.ts`).
   *
   * It is flagged on the district rather than derived from "the outdoor one",
   * because the two are not the same question: a map may be all outdoors, and
   * the one that matters is where the ROAD reaches. Every cell of it is compiled
   * into `LevelDef.arrivalLot`, and every opening between one of these cells and
   * the building gets the ENTRANCE hung across it (an object `at: entrance`).
   *
   * A lot wants to be a CORNER of the map: cars roll in over the map's own edge,
   * so a district in from both x edges leaves them arriving out of nowhere.
   */
  arrivals?: boolean;
  /**
   * ROOMS INSIDE THE DISTRICT: cut every cell of this area into rooms of at
   * least this edge (world px), each pair of them walled and doored by the same
   * derivation every other border goes through.
   *
   * A carve's cells are DISTRICT-sized — a fight's worth of floor — which is the
   * right unit outdoors, where a "room" is a stretch of country. Indoors it is
   * the wrong unit by a factor of three: a corporate floor is not four halls, it
   * is thirty rooms off a handful of corridors, and a map that grows the halls
   * and calls them offices reads as a warehouse with a carpet in it. So an
   * interior district is carved twice — once into districts, then each district
   * into rooms — and because the second carve is the same largest-first split
   * the first one is, the rooms come out even rather than as one hall and a row
   * of closets.
   *
   * The rooms all wear the SAME area, so everything downstream (the floor, the
   * scatter, the horde multiplier, the label) is unchanged; what changes is that
   * there are walls and doorways between them. Only an enclosed district can
   * take it — rooms with no walls between them are one room.
   */
  roomSize?: number;
  /**
   * The opening punched through THIS district's walls (world px). Omitted = the
   * blueprint's `layout.doorWidth`.
   *
   * A door's width is a property of the wall it is cut into, not of the map: the
   * roll-up on an assembly bay and the door on a broom cupboard are not the same
   * hole, and one number for both means either barn doors on the cupboard or a
   * cat flap on the bay. It follows the same ownership rule the wall MATERIAL
   * does — whichever of the two areas decided there is a wall there decides how
   * wide its doorway is (see {@link borderOwner}).
   */
  doorWidth?: number;
  /**
   * HANG A DOOR IN EVERY DOORWAY of this district: the id of a `door` object,
   * which is then built across each opening as a real, solid, openable door
   * (`LevelDef.doors`) rather than left as a hole in the wall.
   *
   * A doorway is a gap; a DOOR is a thing that was shut and is now open, with a
   * sound and a moment. That moment is most of what makes an interior read as a
   * building the hero is moving through rather than as a floor plan he is
   * walking over — and it is free of any lock: these open for anybody who comes
   * up to them (see `LevelDef.doors[].opens`). The keyed rooms are a separate
   * feature that hangs its own doors (see {@link MapArea.lock}).
   */
  doors?: string;
  /**
   * THIS DISTRICT IS LIT — how much of the venue's NIGHT its own lights hold
   * off, 0 (none: outdoor ground, dark after dusk) to 1 (as bright as noon).
   * Read only on a venue whose mission names a `sky`; everywhere else it is
   * inert, because everywhere else is never dark to begin with.
   *
   * It is a DISTRICT rather than a lamp because a roofed room is lit as a room:
   * the garage bay has strip lights on, and the honest picture of that is the
   * whole floor up to the walls, not a circle in the middle of it with the
   * corners in shadow. The carve emits each such chamber as a rect
   * (`LevelDef.litZones`), so the light stops exactly where the wall does — a
   * radial pool cannot do that, and pools big enough to fill a room leak
   * straight through it onto the lawn.
   *
   * Author it on ROOFED districts only (`enclosure: hard`). On open ground it
   * is a rectangle of daylight sitting in the middle of a night, and the shape
   * of it is unmissable.
   */
  lit?: number;
  /**
   * The area's OWN GROUND, as a `TileSpec` ground pair (and optional patch pair)
   * of sprite names. This is what makes a district legible: without it every cell
   * is the same floor and the wall around a compound reads as a stub of rock in
   * an empty plain, because nothing shows where the compound starts. With it, the
   * ground itself changes underfoot — regolith giving way to deck plating — and
   * the wall is obviously the edge of somewhere. Compiled into the level's
   * `tiles.zones`, the regional-override mechanism the hand-authored maps already
   * use for exactly this. Omitted = the mission's own level-wide ground.
   */
  ground?: { common: string; rare: string; rareEvery: number };
  patch?: { a: string; b: string; every: number };
  /**
   * HOW FAR THROUGH THE CAMPAIGN THIS DISTRICT'S FLOOR HAS GOT — the ladder of
   * grounds it wears as the run's own memory grows (see {@link MapStage}).
   *
   * The lawn behind the garage is what it is for: green the first time the hero
   * walks out to his ship, charred once he has lit it, burnt past charring by
   * the time Mars is behind him. Omitted — which is every other district in the
   * game — the floor above is the floor forever.
   */
  stages?: MapStage[];
  /**
   * Is this district's floor laid as a RAGGED patch or as a clean rectangle?
   * Defaults to ragged for open ground and rectangular for anything enclosed.
   *
   * The default is right almost always — a ruled line across open country reads
   * as a rug thrown on the floor, and a straight wall over a ragged floor reads
   * as a mistake (see `raggedRects`). What it gets wrong is a BUILT open
   * surface: a car park is unwalled and its edge is still a kerb, laid to the
   * inch, and left ragged its tarmac stops short of the building it serves with
   * a stripe of the mission's own ground showing along the wall.
   */
  ragged?: boolean;
  /**
   * SHELL: this area is not a district of its own but a BAND laid just inside the
   * outer boundary of the named area's districts — an outer dome wrapped around an
   * inner one.
   *
   * The obvious alternative was to make the shell its own district and demote the
   * rim CELLS of the inner one into it. That fails at the only scale that matters:
   * a district is three or four cells, every one of them is on the rim, and the
   * garden it was supposed to wrap disappears entirely. A band is measured in
   * pixels instead of cells, so it is the same handspan of concrete whether the
   * dome is one cell or nine, and the garden inside it always survives.
   *
   * The band is a REGION, not geometry: it supplies its own ground (and its own
   * `wall` where it meets the outside), and props may target it by naming this
   * area, but it consumes no cells and changes no walls of its own.
   */
  shellOf?: string;
  /** Shell band width in world px (default 120). */
  shellWidth?: number;
  /**
   * ENTRANCE APRON: the ground laid immediately inside every doorway into this
   * area. A dome's floor is lawn and timber, but nobody walks off an airlock onto
   * a lawn — there is concrete at the door. Compiled into `tiles.zones` alongside
   * the area's own ground, and drawn AFTER it so it sits on top.
   */
  apron?: {
    ground: { common: string; rare: string; rareEvery: number };
    /** Half-extent of the apron square in world px (default 90). */
    radius?: number;
  };
  /**
   * The `wall`-type object this area's own barriers are cut from — used on every
   * border where THIS area is the one that decided there is a wall at all (see
   * {@link borderEnclosure}). Omitted = the blueprint's `layout.wall`.
   *
   * This is what lets one map own two kinds of barrier honestly. A rubble spine is
   * right between two stretches of open ground and wrong around a pressurized
   * dome: a colony is a built thing, and its wall has to be a built thing, or the
   * map says the settlers piled rocks up and called it an atmosphere.
   */
  wall?: string;
  /** Name the map tooling and the design zones print over the region. */
  label?: string;
};

/** The stronger of two enclosures — the rule every wall in a generated map
 * comes from. */
export function borderEnclosure(a: Enclosure, b: Enclosure): Enclosure {
  return STRENGTH[a] >= STRENGTH[b] ? a : b;
}

/**
 * Which of two areas OWNS the border between them — the one whose enclosure
 * decided there is a wall there, and therefore whose material it is built from.
 *
 * Ties go to whichever is declared FIRST in the palette, so a blueprint that puts
 * two equally-sealed districts beside each other decides the seam's material by
 * authoring order rather than by whichever cell the carve happened to number
 * lower.
 */
export function borderOwner(a: MapArea, b: MapArea, order: MapArea[]): MapArea {
  if (STRENGTH[a.enclosure] !== STRENGTH[b.enclosure])
    return STRENGTH[a.enclosure] > STRENGTH[b.enclosure] ? a : b;
  return order.indexOf(a) <= order.indexOf(b) ? a : b;
}

/** Look an area up by id; throws on a palette reference the compile step should
 * already have rejected. */
export function areaById(areas: MapArea[], id: string): MapArea {
  const found = areas.find((a) => a.id === id);
  if (!found) throw new Error(`unknown map area "${id}"`);
  return found;
}

/**
 * Roll ONE compass region for every area that names candidates, so a run's
 * geography is decided once and every seed and every spread step of that
 * district answers to the same rectangle.
 *
 * Rolled here rather than per cell for the obvious reason: a district that
 * re-rolled its region as it grew would not be a district, it would be freckles
 * in three corners. Areas with no `regions` draw nothing at all, so a blueprint
 * that uses none of this carves exactly the map it always carved.
 */
export function confineAreas(
  areas: MapArea[],
  width: number,
  height: number,
  rng: Rng,
): Map<string, RegionRect> {
  const out = new Map<string, RegionRect>();
  for (const area of areas) {
    if (!area.regions || area.regions.length === 0) continue;
    const name = area.regions[
      Math.floor(rng() * area.regions.length)
    ] as string;
    out.set(area.id, regionRect(name, width, height));
  }
  return out;
}

/** Weighted pick over the palette. */
function rollArea(areas: MapArea[], rng: Rng): MapArea {
  const total = areas.reduce((sum, a) => sum + a.weight, 0);
  let at = rng() * total;
  for (const area of areas) {
    at -= area.weight;
    if (at <= 0) return area;
  }
  return areas[areas.length - 1] as MapArea;
}

/**
 * Assign an area type to every carved cell by GROWING DISTRICTS from seeds.
 *
 * A handful of cells are picked as seeds, each rolls the palette once, and the
 * rest of the map is filled by a simultaneous breadth-first spread from all seeds
 * at once — so every district is a contiguous blob of cells and the mix of
 * districts follows the authored weights.
 *
 * Seeding it this way rather than "each cell inherits a neighbour's type with
 * probability `cluster`" is deliberate, and the difference is not subtle: an
 * inherit-from-neighbour walk COMPOUNDS. Each cell that copies its neighbour
 * makes the copied type more available to the next cell, so whichever type the
 * walk rolled first swallows the map, and at a cluster of 0.6 a palette weighted
 * 4:3:2 comes out as one biome with a couple of freckles. Seeding decouples the
 * two knobs cleanly: `cluster` controls how BIG a district is (how many seeds
 * there are), the weights control WHICH districts appear, and neither distorts
 * the other.
 *
 * @param chambers  the carved cells
 * @param adjacent  cell id → the cells it shares any border with
 * @param areas     the blueprint's area palette
 * @param cluster   0..1 — bigger districts (fewer seeds) as it climbs
 * @param promised  area ids the map is PROMISED — one seed each, taken before
 *                  the weighted roll, so a district something else depends on
 *                  cannot fail to appear. The keyed rooms use it: a map with
 *                  three keycards on three elites has to have three rooms, or a
 *                  card the player fought for opens nothing on that seed.
 * @param confine   area id → the rolled region it may not grow outside of (see
 *                  {@link confineAreas}); areas absent from it grow anywhere
 * @returns one area id per cell, indexed by cell id
 */
export function assignAreas(
  chambers: Chamber[],
  adjacent: number[][],
  areas: MapArea[],
  cluster: number,
  rng: Rng,
  promised: string[] = [],
  confine: Map<string, RegionRect> = new Map(),
): string[] {
  if (chambers.length === 0) return [];
  const clamped = Math.max(0, Math.min(0.95, cluster));
  // How many districts to grow: every cell its own at cluster 0, a handful of
  // large ones as it approaches 1. At least two, or "districts" means nothing.
  const seedCount = Math.max(
    Math.min(2, chambers.length),
    Math.round(chambers.length * (1 - clamped)),
  );
  // Seeds are spread by taking every k-th cell of a shuffled order, which on the
  // carve's row-major-ish cell list keeps them from all landing in one corner.
  const order = chambers.map((c) => c.id);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j] as number, order[i] as number];
  }
  const assigned: (string | null)[] = chambers.map(() => null);
  const queue: number[] = [];
  const pool = seedable(areas);
  // A `once` area is drawn from the palette on its FIRST win and then withdrawn,
  // so the map grows exactly one of it. Rolling it out of the pool (rather than
  // filtering after the fact) keeps the remaining weights meaningful: the seeds a
  // one-off district did not win are still distributed by the authored ratio.
  let live = pool;
  // May this area hold this cell at all? A district with a rolled region may
  // not put a single cell outside it — seed or spread — which is what makes the
  // region a place rather than a preference.
  const fits = (area: MapArea, cell: number): boolean => {
    const rect = confine.get(area.id);
    if (!rect) return true;
    const c = chambers[cell] as Chamber;
    return regionContains(rect, c.x + c.w / 2, c.y + c.h / 2);
  };
  // How many cells each district has taken, for the areas that cap it.
  const grown = new Map<string, number>();
  const room = (area: MapArea): boolean =>
    area.maxCells === undefined || (grown.get(area.id) ?? 0) < area.maxCells;
  const take = (id: number, area: MapArea): void => {
    assigned[id] = area.id;
    grown.set(area.id, (grown.get(area.id) ?? 0) + 1);
    if (area.once) live = live.filter((a) => a !== area);
    // Withdrawing the last entry would leave nothing to roll; the map falls back
    // to the full palette rather than crashing on an empty pool.
    if (live.length === 0) live = pool;
    queue.push(id);
  };
  // The PROMISED districts take their seeds first, and are then out of the
  // running: they are the ones something else in the mission depends on
  // existing, so they cannot be left to the odds. Each takes the first cell of
  // the shuffled order it is ALLOWED to sit in, which for an unconfined area is
  // simply the first free one — so a map that promises nothing regional seeds
  // exactly as it always did.
  for (const owed of promised) {
    if (queue.length >= seedCount) break;
    const area = pool.find((a) => a.id === owed);
    if (!area) continue;
    const cell = order.find((id) => assigned[id] === null && fits(area, id));
    if (cell === undefined) continue;
    take(cell, area);
  }
  // …and the rest of the seeds are the ordinary weighted roll, over whichever of
  // the live palette may stand on the cell in hand.
  for (const id of order) {
    if (queue.length >= seedCount) break;
    if (assigned[id] !== null) continue;
    // Nothing live may stand here (every remaining district is confined
    // elsewhere): the cell falls back to the UNCONFINED part of the palette
    // rather than to the whole of it, because a region is a promise about where
    // a district is NOT as much as about where it is.
    const here = live.filter((a) => fits(a, id));
    const loose = live.filter((a) => !confine.has(a.id));
    take(
      id,
      rollArea(here.length > 0 ? here : loose.length > 0 ? loose : pool, rng),
    );
  }
  // Simultaneous spread: every district advances one ring per pass, so two
  // neighbouring districts meet halfway instead of one overrunning the other.
  //
  // A LOCKABLE district does not spread at all, and that is what keeps it a
  // ROOM. It is seeded first (it is promised), so in a simultaneous spread it
  // has the head start and grows fastest — measured, one keyed seed took four of
  // Mars's six cells and the "vault" became most of the map with the mission
  // inside it. A keyed room is a room: one cell, or the couple that happen to
  // adjoin when two keys seed side by side.
  for (let head = 0; head < queue.length; head++) {
    const at = queue[head] as number;
    const area = areaById(areas, assigned[at] as string);
    if (area.lock === true) continue;
    // …and one that has grown to its cap stops growing at all.
    if (!room(area)) continue;
    for (const next of adjacent[at] as number[]) {
      if (assigned[next] !== null) continue;
      // …and a CONFINED district stops at the edge of its rolled region. The
      // cell it did not take is simply left for another district's ring to
      // reach, which is what keeps a car park a car park rather than a strip
      // that grew across the whole campus.
      if (!fits(area, next)) continue;
      if (!room(area)) break;
      assigned[next] = area.id;
      grown.set(area.id, (grown.get(area.id) ?? 0) + 1);
      queue.push(next);
    }
  }
  // A cell the spread never reached (one with no adjacency at all, or one every
  // neighbouring district was confined out of) still needs a type. It takes an
  // ordinary district, never a `once` one — the map already grew its single
  // town, and a stray second one is exactly what `once` is for — and never a
  // confined one, whose whole point is to be somewhere in particular.
  const leftovers = pool.filter(
    (a) => !a.once && a.lock !== true && !confine.has(a.id),
  );
  const fallback = leftovers.length > 0 ? leftovers : pool;
  return assigned.map((t) => t ?? rollArea(fallback, rng).id);
}

/** The areas a district may be seeded as — everything except the pure shells,
 * which only ever appear wrapped around something else. */
export function seedable(areas: MapArea[]): MapArea[] {
  const open = areas.filter((a) => !a.shellOf && a.weight > 0);
  return open.length > 0 ? open : areas;
}
