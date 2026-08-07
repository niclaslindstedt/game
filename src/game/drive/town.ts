// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE TOWN — every building on the road to GOODCO, and the street it makes.
//
// WHY THIS IS A CATALOG AND NOT A SPRITE TABLE. The road used to hold ONE idea
// of "a house": eight pictures, 40 px wide and 30 px tall to the pixel, dealt by
// a hash onto a fixed 52-px pitch. Every one of those numbers was the same
// number, and that is what made a mile of town read as wallpaper rather than as
// a place — the SKYLINE was a ruled line, the frontages were a metronome, and a
// player driving past the same eight fronts for a minute stopped seeing them at
// about the fifteen-second mark.
//
// So a building is a DEF, and what stands at the kerb is ASSEMBLED from one:
//
//   IT IS ITS OWN SIZE     — `slots` wide and `storeys` tall, so the row has a
//                            silhouette and the skyline has a shape. Widths run
//                            16–96 px and heights 18–53, against 40×30 for
//                            everything that used to stand here.
//   IT IS DRESSED PER SITE — the shell is a WALL. Its doors, windows, shopfront,
//                            awning, sign, fence and the junk in its front
//                            garden are chosen at the spot it stands on, from
//                            that spot's own hash. Two `town_semi` next to each
//                            other are the same house and not the same picture.
//   IT WEARS ITS DISTRICT  — a def stands only inside its own stretch of the
//                            road (`district`), and how battered it is comes
//                            off the same axis (`wear`). See below.
//
// THE ROAD RUNS FROM THE HERO'S BLOCK TO GOODCO, AND THE TOWN SAYS SO. The one
// number every piece of this file is hung off is `townDistrict(x)`: 0 at the
// hero's end, 1 at GOODCO's gate. At 0 it is the neighbourhood the story
// describes — shuttered trades, boarded windows, a lit one every third house
// where somebody's welfare still lands. At 1 it is what the money bought:
// render without a crack in it, glass frontages, clipped hedges and a car park.
// Nothing in between is a cut; the two rosters overlap across the middle, and
// the wear ladder slides continuously, so the change happens the way it happens
// on a real road — you cannot say where it started, only that it did.
//
// IT COSTS THE DRIVE NOTHING. A building is a pure function of the ground it
// stands on: no spawner, no state, and NOT ONE DRAW OF THE ROAD'S RNG — which
// is load-bearing rather than tidy, because that stream also lays down the
// crowd and the traffic, and a town that spent draws would move every body on
// the road the moment somebody added a house. The plan is cached per BLOCK
// (`planTown`), so the renderer populating a screenful re-walks nothing.
//
// AND NOTHING HERE IS SIMULATED. The town stands behind the far pavement where
// the wagon can never reach it — the kerb's furniture is world and lives in
// `street.ts`; this is the backdrop, and it is the honest kind: nothing can hit
// it, so nothing about it has to be true.

// The PARTS every building is dressed from — its doors, windows, porches,
// signs, stains, fences and the junk in its garden — live next door in
// `town-parts.ts`, along with how big each of them is. Only the geometry needs
// them here: a hole is cut to the size of the thing that fills it.
import { TOWN_ART_SIZE, TOWN_ALLEY_PX, TOWN_PLOT_PX } from "./town-parts.ts";

/** The rows every shell spends on the pavement it stands on. */
const BASE_PX = 2;
/** …the ground floor, which is the band the phone actually sees. */
const GROUND_PX = 12;
/** …and one floor above it. */
const STOREY_PX = 11;

// ── WHAT A BUILDING IS ───────────────────────────────────────────────────────

/** What a wall is MADE of — the texture the shell generator rules onto it. */
export type TownWall =
  | "clapboard"
  | "brick"
  | "render"
  | "panel"
  | "corrugated"
  | "concrete"
  | "curtain"
  | "tile"
  | "timber"
  | "block";

/** …and what it wears on top, which is the half that makes a skyline. */
export type TownRoof =
  | "coping"
  | "parapet"
  | "pitch"
  | "mono"
  | "sawtooth"
  | "gable"
  | "tank"
  | "plant"
  | "signbox"
  | "open";

/** Which picture goes in a hole in the wall. */
export type TownWindow = "small" | "tall" | "wide" | "strip" | "shop";

/** The strip of frontage between the building line and the pavement. */
export type TownFront =
  | "none"
  | "picket"
  | "wall"
  | "hedge"
  | "rail"
  | "chain"
  | "planter"
  | "broken";

/**
 * ONE ARCHETYPE OF BUILDING.
 *
 * `ground` is the ground floor written out, one char per bay, and it is the
 * field worth reading twice: it is the only part of a building the reference
 * phone reliably SEES. The camera looks down a road that fills the middle of
 * the frame, so on a 390-px-tall screen the town is a band at the top and what
 * is in that band is doorsteps. Everything above it — the storeys, the roof,
 * the chimney — is for the tablet, the desktop and portrait, where the sky is.
 */
export type TownBuildingDef = {
  /** Its shell's sprite stem. The colourways are `<id>`, `<id>_b`, `<id>_c`. */
  id: string;
  /** How many plots of frontage it takes. */
  slots: number;
  /** Floors of windows ABOVE the ground floor. Zero is a real answer: a lock-up,
   * a kiosk and a substation are all one storey and all read as themselves. */
  storeys: number;
  /** How many vertical bays the facade is divided into — its window rhythm. */
  bays: number;
  /** THE GROUND FLOOR, one char per bay: `d` a door, `w` a window, `s` shop
   * glazing, `g` a garage/roll shutter, `.` blank wall. Length must equal
   * `bays`. */
  ground: string;
  wall: TownWall;
  roof: TownRoof;
  /** The picture that goes in an upper-storey hole. */
  window: TownWindow;
  /** How many rows the roof gets — the shell's height falls out of this plus
   * its storeys, so this is the knob that varies the skyline. */
  roofPx: number;
  /**
   * WHERE ON THE ROAD IT MAY STAND — `[from, to]` on the 0…1 run from the
   * hero's block to GOODCO's gate.
   *
   * Bands OVERLAP, deliberately and generously. A roster that changed over at a
   * line would put a seam across the road; two rosters fading through each
   * other over a third of the trip is how a real town changes, and it means the
   * middle of the leg is the most varied stretch rather than the emptiest.
   */
  district: [number, number];
  /** Its share of the buildings inside that band — a weight, not a chance. */
  weight: number;
  /** How battered it is ALLOWED to get, `[least, most]` on the 0…3 ladder. A
   * glass tower may be tired but is never a ruin; a lock-up starts at tired. */
  wear: [number, number];
  /** What stands in its front garden. */
  front: TownFront;
  /** Whether it carries a sign over the door — a trade, rather than a home. */
  sign: boolean;
  /** Whether a porch/awning/canopy may be hung over its door. */
  porch: boolean;
  /** Whether its windows light up at night. A home does; a lock-up does not. */
  lit: boolean;
};

/**
 * THE ROSTER — 26 archetypes, and the ORDER is the road.
 *
 * Read top to bottom it is the drive: the block the hero lives on, the ordinary
 * streets past it, the trades that survived, and then the business park with
 * GOODCO at the end of it. Nothing here is named after anybody — a fried
 * chicken shop, a nail bar and a vape shop are TRADES, which is the funnier half
 * and the half that cannot be refused by a store (`docs/naming.md`).
 */
export const TOWN: readonly TownBuildingDef[] = [
  // ── THE HERO'S END: what is left of the neighbourhood ─────────────────────
  {
    id: "town_terrace",
    slots: 3,
    storeys: 1,
    bays: 3,
    ground: "wdw",
    wall: "brick",
    roof: "pitch",
    window: "small",
    roofPx: 6,
    district: [0, 0.62],
    weight: 12,
    wear: [1, 3],
    front: "wall",
    sign: false,
    porch: false,
    lit: true,
  },
  {
    id: "town_semi",
    slots: 4,
    storeys: 1,
    bays: 4,
    ground: "wdwd",
    wall: "render",
    roof: "gable",
    window: "small",
    roofPx: 8,
    district: [0, 0.7],
    weight: 10,
    wear: [1, 3],
    front: "picket",
    sign: false,
    porch: true,
    lit: true,
  },
  {
    id: "town_maisonette",
    slots: 3,
    storeys: 2,
    bays: 3,
    ground: "dww",
    wall: "panel",
    roof: "coping",
    window: "wide",
    roofPx: 4,
    district: [0, 0.5],
    weight: 8,
    wear: [1, 3],
    front: "rail",
    sign: false,
    porch: false,
    lit: true,
  },
  {
    id: "town_tenement",
    slots: 4,
    storeys: 3,
    bays: 4,
    ground: "dwww",
    wall: "brick",
    roof: "parapet",
    window: "small",
    roofPx: 5,
    district: [0, 0.42],
    weight: 7,
    wear: [1, 3],
    front: "rail",
    sign: false,
    porch: false,
    lit: true,
  },
  {
    id: "town_lockup",
    slots: 2,
    storeys: 0,
    bays: 1,
    ground: "g",
    wall: "corrugated",
    roof: "mono",
    window: "small",
    roofPx: 5,
    district: [0, 0.55],
    weight: 8,
    // Nothing about a lock-up is ever kept. It starts tired.
    wear: [2, 3],
    front: "chain",
    sign: false,
    porch: false,
    lit: false,
  },
  {
    id: "town_chippy",
    slots: 3,
    storeys: 1,
    bays: 3,
    ground: "sds",
    wall: "tile",
    roof: "signbox",
    window: "small",
    roofPx: 7,
    district: [0, 0.6],
    weight: 8,
    wear: [1, 3],
    front: "none",
    sign: true,
    porch: true,
    lit: true,
  },
  {
    id: "town_boarded_shop",
    slots: 3,
    storeys: 1,
    bays: 3,
    ground: "sdw",
    wall: "render",
    roof: "signbox",
    window: "small",
    roofPx: 6,
    district: [0, 0.45],
    weight: 9,
    // The shuttered trades the story counts. It has no good day left in it.
    wear: [2, 3],
    front: "none",
    sign: true,
    porch: false,
    lit: false,
  },
  {
    id: "town_pub",
    slots: 4,
    storeys: 1,
    bays: 4,
    ground: "wsdw",
    wall: "brick",
    roof: "gable",
    window: "tall",
    roofPx: 8,
    district: [0, 0.62],
    weight: 5,
    wear: [1, 3],
    front: "wall",
    sign: true,
    porch: true,
    lit: true,
  },
  {
    id: "town_launderette",
    slots: 2,
    storeys: 0,
    bays: 2,
    ground: "sd",
    wall: "tile",
    roof: "signbox",
    window: "shop",
    roofPx: 6,
    district: [0, 0.68],
    weight: 7,
    wear: [1, 3],
    front: "none",
    sign: true,
    porch: false,
    lit: true,
  },
  {
    id: "town_scrapyard",
    slots: 5,
    storeys: 0,
    bays: 5,
    ground: "..g..",
    wall: "corrugated",
    roof: "open",
    window: "strip",
    roofPx: 4,
    district: [0, 0.34],
    weight: 6,
    wear: [2, 3],
    front: "chain",
    sign: true,
    porch: false,
    lit: false,
  },
  {
    id: "town_chapel",
    slots: 3,
    storeys: 1,
    bays: 3,
    ground: "wdw",
    wall: "block",
    roof: "pitch",
    window: "tall",
    roofPx: 9,
    district: [0.02, 0.6],
    weight: 4,
    wear: [1, 3],
    front: "rail",
    sign: true,
    porch: false,
    lit: false,
  },
  {
    id: "town_hoarding",
    slots: 2,
    storeys: 0,
    bays: 2,
    ground: "..",
    wall: "timber",
    roof: "open",
    window: "small",
    roofPx: 4,
    district: [0, 0.55],
    weight: 6,
    wear: [2, 3],
    front: "broken",
    sign: true,
    porch: false,
    lit: false,
  },

  {
    // A GATED SIDE PASSAGE, one plot wide. It is the filler the tiler reaches
    // for when a block has a single plot left, and it earns its place twice
    // over: a real terrace has passages in it, and a row with one is a row that
    // does not look laid out.
    id: "town_alley",
    slots: 1,
    storeys: 0,
    bays: 1,
    // A GATE, not a shutter. One plot is 16 px and a roller door is 15 of
    // them — there is no room left for the reveal the shell sinks around an
    // opening, so the lintel would be drawn off the side of the sprite.
    ground: "d",
    wall: "brick",
    roof: "open",
    window: "small",
    roofPx: 4,
    district: [0, 0.72],
    weight: 4,
    wear: [1, 3],
    front: "none",
    sign: false,
    porch: false,
    lit: false,
  },

  // ── THE MIDDLE: ordinary streets, and the trades that made it ─────────────
  {
    id: "town_bungalow",
    slots: 4,
    storeys: 0,
    bays: 4,
    ground: "wdww",
    wall: "clapboard",
    roof: "pitch",
    window: "wide",
    roofPx: 8,
    district: [0.2, 0.85],
    weight: 9,
    wear: [0, 2],
    front: "hedge",
    sign: false,
    porch: true,
    lit: true,
  },
  {
    id: "town_villa",
    slots: 4,
    storeys: 1,
    bays: 4,
    ground: "wdww",
    wall: "clapboard",
    roof: "gable",
    window: "tall",
    roofPx: 9,
    district: [0.28, 1],
    weight: 9,
    wear: [0, 2],
    front: "picket",
    sign: false,
    porch: true,
    lit: true,
  },
  {
    id: "town_townhouse",
    slots: 3,
    storeys: 2,
    bays: 3,
    ground: "wdw",
    wall: "brick",
    roof: "parapet",
    window: "tall",
    roofPx: 5,
    district: [0.3, 1],
    weight: 8,
    wear: [0, 2],
    front: "rail",
    sign: false,
    porch: true,
    lit: true,
  },
  {
    id: "town_corner_shop",
    slots: 3,
    storeys: 1,
    bays: 3,
    ground: "sdw",
    wall: "render",
    roof: "signbox",
    window: "small",
    roofPx: 6,
    district: [0.18, 0.82],
    weight: 8,
    wear: [0, 2],
    front: "none",
    sign: true,
    porch: true,
    lit: true,
  },
  {
    id: "town_garage",
    slots: 4,
    storeys: 0,
    bays: 4,
    ground: "gg.d",
    wall: "panel",
    roof: "mono",
    window: "strip",
    roofPx: 5,
    district: [0.12, 0.8],
    weight: 6,
    wear: [1, 3],
    front: "none",
    sign: true,
    porch: false,
    lit: false,
  },
  {
    id: "town_depot",
    slots: 5,
    storeys: 0,
    bays: 5,
    ground: "gg..d",
    wall: "corrugated",
    roof: "sawtooth",
    window: "strip",
    roofPx: 7,
    district: [0.15, 0.78],
    weight: 5,
    wear: [1, 3],
    front: "chain",
    sign: true,
    porch: false,
    lit: false,
  },
  {
    id: "town_flats",
    slots: 4,
    storeys: 3,
    bays: 4,
    ground: "dwww",
    wall: "concrete",
    roof: "plant",
    window: "wide",
    roofPx: 6,
    district: [0.3, 0.92],
    weight: 6,
    wear: [0, 2],
    front: "hedge",
    sign: false,
    porch: false,
    lit: true,
  },
  {
    id: "town_substation",
    slots: 2,
    storeys: 0,
    bays: 2,
    ground: "d.",
    wall: "block",
    roof: "coping",
    window: "strip",
    roofPx: 4,
    district: [0.1, 1],
    weight: 5,
    wear: [1, 3],
    front: "chain",
    sign: true,
    porch: false,
    lit: false,
  },
  {
    id: "town_surgery",
    slots: 3,
    storeys: 1,
    bays: 3,
    ground: "wdw",
    wall: "render",
    roof: "coping",
    window: "wide",
    roofPx: 4,
    district: [0.35, 1],
    weight: 5,
    wear: [0, 1],
    front: "hedge",
    sign: true,
    porch: true,
    lit: true,
  },

  // ── GOODCO'S END: what the money bought ───────────────────────────────────
  {
    id: "town_showroom",
    slots: 5,
    storeys: 0,
    bays: 5,
    ground: "sssds",
    wall: "curtain",
    roof: "signbox",
    window: "shop",
    roofPx: 6,
    district: [0.55, 1],
    weight: 8,
    wear: [0, 1],
    front: "rail",
    sign: true,
    porch: false,
    lit: true,
  },
  {
    id: "town_office",
    slots: 4,
    storeys: 3,
    bays: 4,
    ground: "sdss",
    wall: "curtain",
    roof: "plant",
    window: "strip",
    roofPx: 5,
    district: [0.6, 1],
    weight: 9,
    wear: [0, 1],
    front: "hedge",
    sign: true,
    porch: true,
    lit: true,
  },
  {
    id: "town_kiosk",
    slots: 1,
    storeys: 0,
    bays: 1,
    ground: "s",
    wall: "panel",
    roof: "signbox",
    window: "shop",
    roofPx: 5,
    district: [0.32, 1],
    weight: 4,
    wear: [0, 2],
    front: "none",
    sign: true,
    porch: false,
    lit: true,
  },
  {
    id: "town_coffee_unit",
    slots: 3,
    storeys: 0,
    bays: 3,
    ground: "sds",
    wall: "panel",
    roof: "signbox",
    window: "shop",
    roofPx: 6,
    district: [0.5, 1],
    weight: 7,
    wear: [0, 1],
    front: "planter",
    sign: true,
    porch: true,
    lit: true,
  },
] as const;

/** How many archetypes the town is drawn from — the sprite pipeline generates
 * a shell per colourway for every one of them. */
export const TOWN_VARIANTS = TOWN.length;

/** The colourways every shell is generated in. The suffix is the sprite's; the
 * FIRST is the bare id, so a def's own name is always a real sprite. */
export const TOWN_COLOURWAYS = ["", "_b", "_c"] as const;

/** The def a variant index names. Clamped, because a saved drive or a mod may
 * hand over an index this build no longer has. */
export function townDef(variant: number): TownBuildingDef {
  const i = ((variant % TOWN.length) + TOWN.length) % TOWN.length;
  return TOWN[i]!;
}

/** How wide a def's shell is drawn (world px) — its plots, less the alley it
 * leaves for its neighbour. */
export function townWidth(def: TownBuildingDef): number {
  return def.slots * TOWN_PLOT_PX - TOWN_ALLEY_PX;
}

/** …and how tall. Base, ground floor, its storeys, and whatever roof it wears —
 * which is the whole of why this row has a skyline and the old one did not. */
export function townHeight(def: TownBuildingDef): number {
  return BASE_PX + GROUND_PX + def.storeys * STOREY_PX + def.roofPx;
}

// ── WHERE THE HOLES IN THE WALL ARE ──────────────────────────────────────────

/** One opening in a shell — a hole the assembly puts a part in, and the
 * generator leaves a reveal around. Sprite-local px from the top-left. */
export type TownSlot = {
  kind: "window" | "door" | "shop" | "garage";
  /** Which picture goes here: a `TownWindow` for a hole, a door style key for a
   * doorway. The assembly picks the STATE (dark, lit, boarded, smashed). */
  part: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 0 is the ground floor. */
  storey: number;
};

/** The size of a hole a `TownSlot` of this `part` opens. */
function slotSize(part: string): [number, number] {
  return TOWN_ART_SIZE[part] ?? TOWN_ART_SIZE.win_small!;
}

/** The margin the facade keeps at its own edges, so no opening is cut by the
 * corner boards. */
const BAY_MARGIN = 3;

/**
 * EVERY OPENING IN ONE ARCHETYPE, derived rather than authored.
 *
 * ONE IMPLEMENTATION, TWO READERS, and that is the point of it being a function.
 * The shell generator asks where the holes are so it can sink a reveal and a
 * lintel into the wall; the app asks the same question so it can put a window
 * in one. Two hand-kept tables would drift on the first def anybody widened,
 * and the failure is the worst kind — a window drawn a pixel off its own hole,
 * on one building, at one width.
 */
export function townSlots(def: TownBuildingDef): TownSlot[] {
  const w = townWidth(def);
  const h = townHeight(def);
  const pitch = (w - 2 * BAY_MARGIN) / def.bays;
  const slots: TownSlot[] = [];
  const put = (
    kind: TownSlot["kind"],
    part: string,
    bay: number,
    y: number,
  ) => {
    const [pw, ph] = slotSize(part);
    const cx = BAY_MARGIN + (bay + 0.5) * pitch;
    slots.push({
      kind,
      part,
      x: Math.max(1, Math.min(w - pw - 1, Math.round(cx - pw / 2))),
      y,
      w: pw,
      h: ph,
      storey: y >= h - BASE_PX - GROUND_PX ? 0 : 1,
    });
  };

  // THE GROUND FLOOR, read straight off `ground` — one char, one bay.
  const groundY = h - BASE_PX - GROUND_PX;
  for (let bay = 0; bay < def.bays; bay++) {
    const cell = def.ground[bay] ?? ".";
    if (cell === "d") put("door", "door_panel", bay, groundY + 1);
    else if (cell === "w") put("window", `win_${def.window}`, bay, groundY + 3);
    else if (cell === "s") put("shop", "win_shop", bay, groundY + 1);
    else if (cell === "g") put("garage", "garage_up", bay, groundY + 1);
  }

  // …and the storeys above it, on the same rhythm. A facade whose upper windows
  // do not line up with its ground-floor bays reads as two buildings glued
  // together, which is exactly what it would be.
  const upper = `win_${def.window}`;
  for (let s = 1; s <= def.storeys; s++) {
    const bandTop = groundY - s * STOREY_PX;
    const y =
      bandTop + Math.max(1, Math.floor((STOREY_PX - slotSize(upper)[1]) / 2));
    for (let bay = 0; bay < def.bays; bay++) put("window", upper, bay, y);
  }
  return slots;
}

/** Where a sign hangs on a shell that carries one — sprite-local, centred over
 * the ground floor's head. */
export function townSignSlot(
  def: TownBuildingDef,
): { x: number; y: number } | null {
  if (!def.sign) return null;
  const w = townWidth(def);
  const h = townHeight(def);
  // A FASCIA IS A PLACE TO PUT A NAME, so a building that has one puts its sign
  // THERE. Hung over the door instead, a shop ends up saying its trade twice —
  // once on a board and once on the empty lit box above it — which is the tell
  // that the two were designed by different passes and never looked at together.
  if (def.roof === "signbox") return { x: Math.round(w / 2), y: def.roofPx };
  return { x: Math.round(w / 2), y: h - BASE_PX - GROUND_PX - 1 };
}

/** …and where a porch or awning is hung: over the FIRST door the ground floor
 * has, because a canopy over a blank wall is a canopy over nothing. */
export function townPorchSlot(
  def: TownBuildingDef,
): { x: number; y: number } | null {
  if (!def.porch) return null;
  const door = townSlots(def).find(
    (s) => s.kind === "door" || s.kind === "shop",
  );
  if (!door) return null;
  return { x: door.x + Math.round(door.w / 2), y: door.y };
}
