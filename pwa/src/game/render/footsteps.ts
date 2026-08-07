// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// FOOTSTEPS — the first sound the engine does not know it is making.
//
// A footfall is not a `GameEvent` and must not become one. The simulation moves
// a body from A to B; it is the RENDERER that knows the body has legs, how long
// its stride is, and that a boot just came down — and a party of four walking
// would put hundreds of events a second into `state.events`, a list that is
// replicated to every client, to describe something the receiving end works out
// for itself. So this raises a CUE (`sfx/cues.ts`), which the sound catalog
// answers with `on: { cue: footstep, surface: … }`.
//
// FOUR DECISIONS, and each is the one that keeps this from becoming mud:
//
//   WHO      Heroes only. A footstep per mob is not atmosphere, it is a wash —
//            thirty bodies crossing a room is thirty overlapping boots and no
//            information at all. The hero's own steps are what tell a player
//            about the ground they are on, which is the whole point.
//   WHEN     Off DISTANCE WALKED, not off a timer: a stride is a distance, so
//            a hero slowed by mud or hasted by a power steps at the rate he
//            actually covers ground rather than at a fixed metronome.
//   WHERE    The surface under the boot, read from the level's own tile spec —
//            so a new biome brings its own footstep with no edit here.
//   HOW MANY The cue's own rate limit (`sfx/cues.ts`) is the backstop, and it
//            is deliberately NOT here: every cue needs one, and a cap each
//            caller reimplements is a cap somebody forgets.

import { heroInPlay, type GameState, type Player } from "@game/core";

import { synth } from "../audio.ts";
import { playCue } from "../sfx/index.ts";
import { groundTileName } from "./ground-tiles.ts";
import { TILE } from "./shared.ts";

/** The live floor plan's tile spec. `state.level` is the CARVE for this run
 * (never `levelDef(state.level.id)` — see AGENTS.md), so this reads the map the
 * hero is actually standing on. */
type Tiles = Parameters<typeof groundTileName>[0];

/**
 * World px between one footfall and the next.
 *
 * The same 12 the blood trail lays prints at, and deliberately the same number:
 * a boot that prints and a boot that sounds are one boot. If either moves, both
 * move — a trail whose prints and steps disagree reads as two characters.
 */
const STEP_PX = 12;

/** A jump beyond this in one frame is a teleport (an elevator, a level warp,
 * a mob re-homed by its leash), not a stride: it banks no distance and makes
 * no sound. The trail's own number, for the same reason. */
const TELEPORT_PX = 24;

/**
 * What each ground family SOUNDS like. The tile names are the level defs' own
 * (`content/levels/*.yaml` → `tiles:`), grouped down to the handful of
 * MATERIALS a boot can actually land on — six sounds a player can tell apart,
 * rather than a near-identical one per biome.
 *
 * A FAMILY WITH NO ENTRY PASSES THROUGH AS ITSELF, which is the line that keeps
 * this table from being a wall in front of mods: a conversion that lays down
 * `lava_0`/`lava_1` gets the surface `lava`, so `on: { cue: footstep, surface:
 * lava }` in its own catalog is heard. (Mapping the unknown to `dust` instead
 * would have made every mod's new ground silently sound like regolith, with no
 * way to say otherwise short of editing this file.) Anything nobody has
 * authored a sound for falls back to the generic `footstep` — see `playCue`.
 */
const SURFACES: Record<string, string> = {
  hardpan: "dust",
  mars: "dust",
  moon: "dust",
  scrub: "dust",
  cement: "stone",
  bunker: "stone",
  lab: "metal",
  rust: "metal",
  gravel: "gravel",
  carpet: "soft",
  void: "void",
  nebula: "void",
};

/** One walker's accumulator. */
type Stride = { x: number; y: number; banked: number };

/** By seat. Cleared with the run — a hero who walked a mile on the moon must
 * not arrive on the next level mid-stride. */
let strides = new Map<number, Stride>();
let owner: GameState | null = null;

/** Wipe the walk — a new run, a new level, or a hot reload. */
export function resetFootsteps(): void {
  strides = new Map();
  owner = null;
}

/**
 * Walk the party one frame and sound any boot that came down.
 *
 * Called once per frame from the render pass, like `walkGait` and
 * `stepBloodTracks` and for exactly their reason: it measures the step from the
 * last call, so a second call in one frame reads a stride of zero.
 */
export function stepFootsteps(state: GameState): void {
  // A level change re-homes every body at once, which would otherwise read as
  // one enormous stride each. The level id is the honest identity here — a
  // world is one per level (see docs/multiplayer.md) — and `state` alone is
  // not, since travelling keeps the same state object.
  if (owner !== state) {
    strides = new Map();
    owner = state;
  }

  const tiles = state.level.tiles;
  state.players.forEach((player, seat) => {
    if (!heroInPlay(player)) {
      // A departed or downed hero banks nothing: he must not "catch up" with
      // a burst of steps the moment he is revived.
      strides.delete(seat);
      return;
    }
    walk(state, player, seat, tiles);
  });
}

function walk(
  state: GameState,
  player: Player,
  seat: number,
  tiles: Tiles,
): void {
  const prev = strides.get(seat);
  if (!prev) {
    strides.set(seat, { x: player.pos.x, y: player.pos.y, banked: 0 });
    return;
  }
  const moved = Math.hypot(player.pos.x - prev.x, player.pos.y - prev.y);
  prev.x = player.pos.x;
  prev.y = player.pos.y;
  if (moved > TELEPORT_PX) {
    prev.banked = 0;
    return;
  }
  prev.banked += moved;
  if (prev.banked < STEP_PX) return;
  // Carry the remainder rather than zeroing: a hero moving 7px a frame steps
  // every 12 walked, not every other frame.
  prev.banked -= STEP_PX;

  // A hero in the air is not standing on anything. (`z` is height above the
  // ground; the jump is the one thing in this game that leaves it, and a boot
  // that sounds mid-vault is the most obvious way to get footsteps wrong.)
  if (player.z > 0) return;

  playCue(
    synth,
    "footstep",
    surfaceAt(tiles, player.pos.x, player.pos.y),
    player.pos,
    state.stats.timeMs,
  );
}

/** Which material is under this spot. */
function surfaceAt(
  tiles: Tiles,
  x: number,
  y: number,
): string {
  const name = groundTileName(
    tiles,
    Math.floor(x / TILE),
    Math.floor(y / TILE),
  );
  // The tile names are `<family>_<variant>` — the variant is which of the two
  // frames scattered here, and a boot does not care which.
  const family = name.replace(/_\d+$/, "");
  return SURFACES[family] ?? family;
}
