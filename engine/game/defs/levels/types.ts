// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The shape of one level. A level is pure data: geometry, gravity, biome, the
// story intro, landmark props, spawn bands, the objective, decor counts, and
// the loot table. `createGame(seed, levelId)` builds a run from an entry —
// shipping a new level means adding a `content/levels/<id>.yaml` file (plus
// its sprites), not touching the simulation. `make levels` compiles the YAML
// into `engine/generated/levels.ts`, which ./index.ts re-exposes.
//
// TWO TYPES LIVE HERE, and which one you have is the whole question. `LevelDef`
// is the RUN's level — every wall, prop, knot and pickup of it, the thing the
// simulation reads. `MissionDef` (at the foot of this file) is what a mission
// AUTHORS: the same def minus the geometry, because the geometry is carved
// fresh from `content/maps/<id>.yaml` every run. The catalog holds missions;
// only a run holds a level.

import type { Difficulty, TileSpec } from "../../types/index.ts";
import type { Zone } from "../../zones.ts";
import type { Vec2 } from "@game/lib/vec.ts";

/**
 * A HARD-CODED monster level for one difficulty: either an exact level
 * (`5`), or a `[min, max]` range rolled uniformly per spawn (`[3, 4]`). Used
 * in a {@link DifficultyMobLevels} tuple.
 */
export type MobLevelBand = number | readonly [number, number];

/**
 * A level's HARD-CODED mob levels, one entry per non-JESUS difficulty in ladder
 * order: `[easy, medium, hard, nightmare]`. Each entry is a {@link MobLevelBand}
 * (exact level or a rolled range). This REPLACES the player-relative
 * `playerLevel + mobLevelOffset` scaling for those four rungs — the level spec
 * owns exactly how tough its mobs are, so a map can be tuned per difficulty
 * without touching global config. JESUS is deliberately excluded: it keeps the
 * relative scaling (a JESUS hero has out-levelled every hand-authored number).
 * Required on every level for the four rungs (enforced by the level checker);
 * a spawn point may OVERRIDE it with its own tuple for a within-map ramp.
 */
export type DifficultyMobLevels = readonly [
  MobLevelBand,
  MobLevelBand,
  MobLevelBand,
  MobLevelBand,
];

/**
 * A per-difficulty HP tuple for a pinned elite/boss, in ladder order
 * `[easy, medium, hard, nightmare]`. Each is the mob's BASE max HP on that rung
 * — the authored healthbar — which the live menace/relative power-match then
 * multiplies on top (a deep-run set piece still runs hotter than its number).
 * JESUS is excluded (relative scaling off the def, as before).
 */
export type DifficultyHp = readonly [number, number, number, number];

/** A monster placement: banded by difficulty distance, or pinned to a spot. */
export type SpawnSpec =
  | {
      /** Key into ENEMY_DEFS. */
      enemy: string;
      count: number;
      /**
       * Distance band from the player spawn, as fractions of the spawn→
       * objective distance. Bigger fractions = further out = harder.
       */
      band: [number, number];
      /**
       * Difficulty-gated content: this line only appears from this rung of
       * the ladder up (see meetsMinDifficulty). Omitted = every difficulty.
       * This is how a difficulty-exclusive mob lives with the level that uses
       * it instead of in the difficulty catalog.
       */
      minDifficulty?: Difficulty;
    }
  | {
      enemy: string;
      /** Fixed position (bosses guarding a landmark). */
      at: Vec2;
      /** Difficulty gate — same rule as the banded form. */
      minDifficulty?: Difficulty;
      /**
       * HARD-CODED per-difficulty level for this pinned elite/boss (ladder
       * order `[easy, medium, hard, nightmare]`; JESUS stays relative). Sets
       * the mob's `mlvl` — its loot tier and contact scaling — instead of the
       * player-relative `currentMobLevel + levelBonus`. REQUIRED on every
       * pinned elite/boss for the four rungs (the level checker enforces it).
       */
      level?: DifficultyMobLevels;
      /**
       * HARD-CODED per-difficulty BASE HP for this pinned elite/boss (ladder
       * order; JESUS relative). The authored healthbar, which the live
       * menace/relative power-match multiplies on top. REQUIRED alongside
       * `level` on every pinned elite/boss.
       */
      hp?: DifficultyHp;
      /**
       * PATROL ROUTE (WoW-style): waypoints this mob WALKS while dormant —
       * the roaming SUCCESSOR unit sweeping a build bay, the manager pacing
       * his floor. The route is `at → patrol[0] → … → last`, walked back and
       * forth (ping-pong) at `ENEMY_AI.patrol.speedFactor` of its speed;
       * author every leg through open floor (the walker follows straight
       * lines — a leg through a wall just wedges and skips ahead). Waking
       * (aggro + line of sight, wounds) is untouched, and a broken chase
       * resumes the route. Overrides the def's `ai.idle` stroll. Minions and
       * elites; never bosses (they guard their post).
       */
      patrol?: Vec2[];
      /**
       * ALARM LINK: the id of one of this level's `spawners`. The moment
       * this mob WAKES (aggro or wound) it RAISES THE ALARM — the named
       * point activates at once (range, sight, chain gate, and the active
       * cap notwithstanding) and pours its summons at the hero for
       * `SPAWNERS.alarmWindowMs`, then falls back to dormant if he never
       * arrived (see `raiseAlarm` in spawners.ts). The patrolling sentry
       * that pulls the whole camp. Point un-chained spawners at it — an
       * alarm bypasses the `after` gate by design.
       */
      alarms?: string;
    };

/** One line of a level's wave budget: `count` monsters streamed in over a
 * time window (fractions of `rampDurationMs`). Spawning eases in
 * quadratically, so each line starts as a trickle and ends as a flood. */
export type WaveBudget = {
  /** Key into ENEMY_DEFS. */
  enemy: string;
  count: number;
  window: [number, number];
  /**
   * Difficulty-gated content: this budget line only streams in from this
   * rung of the ladder up (see meetsMinDifficulty). Omitted = every
   * difficulty.
   */
  minDifficulty?: Difficulty;
};

/**
 * One member line of a PLACED PACK: a monster kind and how many of it the
 * pack contains. A plain number is a BASE count auto-scaled per difficulty by
 * the rung's `mobCountMult`, like the wave budget — the simple default. A
 * per-difficulty record instead hand-authors each rung VERBATIM for exact
 * control (a rung it omits falls back to the nearest DEFINED rung — see
 * `resolvePackCount` — so `{ easy: 2, hard: 5 }` gives medium 2 and JESUS 5,
 * and a single-entry record is a flat count everywhere).
 */
export type PackMember = {
  /** Key into ENEMY_DEFS. */
  enemy: string;
  /** How many, per difficulty (see the type doc). */
  count: number | Partial<Record<Difficulty, number>>;
};

/**
 * A PLACED PACK — a fixed cluster of monsters pinned to a spot on the map
 * that stays DORMANT until the player walks near it (config PACKS /
 * stepPacks). Closing to `triggerRadius` of `at` wakes the pack: its members
 * spawn scattered within `spawnRadius` of the anchor and give chase at once,
 * and killing every one of them CLEARS that patch of ground. Packs are the
 * level-design lever that rewards MOVEMENT — a map built from packs is cleared
 * by walking it, encounter by encounter, instead of farmed from a standstill
 * like the survivors-style wave horde. They compose with `waves` (ambient
 * pressure) and `spawns` (the opening few); a level can use any mix.
 */
export type PackSpec = {
  /** Where the pack sleeps on the map (world px) — the anchor it spawns
   * around and the point the player must approach to wake it. */
  at: Vec2;
  /** The pack's monsters — one line per kind, counts per difficulty. */
  members: PackMember[];
  /** Proximity (world px) that wakes the pack; defaults to
   * `PACKS.triggerRadius`. */
  triggerRadius?: number;
  /** Radius (world px) the members scatter within when woken; defaults to
   * `PACKS.spawnRadius`. */
  spawnRadius?: number;
};

/** One mob line of a SPAWN POINT: a kind and how many of it the point emits
 * over its lifetime (a flat count, scaled by difficulty like every other spawn
 * count — see `scaledMobCount`). */
export type SpawnerMember = {
  /** Key into ENEMY_DEFS. */
  enemy: string;
  /** How many this spawner emits (difficulty-scaled). */
  count: number;
  /**
   * Difficulty-gated MEMBER: this line joins the point's mix only from this
   * rung up (see meetsMinDifficulty), leaving the rest of the point intact.
   * The point-wide `SpawnerSpec.minDifficulty` gates the whole thing; this
   * gates ONE kind inside it — how a HELLGATE fields a second, worse breed on
   * JESUS than the one nightmare meets. Omitted = every rung the point runs on.
   */
  minDifficulty?: Difficulty;
};

/**
 * A SPAWN POINT (config SPAWNERS / spawners.ts) — the finite, local horde model
 * that replaces the endless `waves` stream. It sleeps at `at` until the hero
 * closes to `triggerRadius`, then EMITS its `members` a few (`perEmit`) at a
 * time every `intervalMs` until it DRAINS empty: one readable wave the hero can
 * clear and move on from. Set `id` + `after` to CHAIN one off another — the
 * chained point arms `afterDelayMs` after its predecessor drains, but only while
 * the hero is still in its trigger range, so pressure follows him without a
 * bottomless refill. A map built from spawn points can actually be CLEARED (and,
 * in a maze, traversed). Difficulty scales the counts; `minDifficulty` gates the
 * whole point out below a rung.
 */
export type SpawnerSpec = {
  /** Optional id so another spawner can chain `after` this one. */
  id?: string;
  /** Where the point sits on the map (world px). */
  at: Vec2;
  /** The mobs it emits — one line per kind. */
  members: SpawnerMember[];
  /**
   * OVERRIDE the level's default {@link DifficultyMobLevels} for THIS point —
   * the within-map difficulty ramp (a light opener at level 1, the boss bay a
   * few levels hotter). Omitted = the point uses the level's `mobLevels`.
   */
  mobLevels?: DifficultyMobLevels;
  /**
   * How many of the point's mobs are PRE-PLACED, scattered around it at level
   * creation — a cluster already lingering there (dormant, waking on approach
   * like a pack) rather than streamed in. Drawn from the front of the `members`
   * mix and counted against their totals; the rest stream in when the point
   * arms. Difficulty-scaled. Omitted/0 = the point is empty until it arms.
   */
  lingering?: number;
  /** Proximity (world px) that arms it; defaults to `SPAWNERS.triggerRadius`. */
  triggerRadius?: number;
  /** Radius (world px) emitted mobs scatter within; default `SPAWNERS.spawnRadius`. */
  spawnRadius?: number;
  /** Time (ms) between emission ticks; default `SPAWNERS.intervalMs`. */
  intervalMs?: number;
  /**
   * BASE post-kill respawn delay (ms) for THIS point — the wait, once at the
   * alive cap, before a killed member is replaced (default
   * `SPAWNERS.respawnDelayMs`). The resolved delay is this base SCALED by
   * difficulty, proximity to the level's boss, and campaign progress (see
   * create.ts), so a harder rung / a boss-bay point / a later map all refill
   * faster regardless of the authored base.
   */
  respawnDelayMs?: number;
  /** Mobs released per tick; default `SPAWNERS.perEmit`. */
  perEmit?: number;
  /**
   * CONCURRENT-ALIVE CAP for this point (default `SPAWNERS.maxAlive`): the most
   * of its own live members it lets stand in its zone (`triggerRadius`) at once.
   * At the cap the point PAUSES and drips a fresh batch only to REPLACE each
   * kill — steady local pressure rather than one big dump — and it also holds
   * while the hero is out of range. A member that DRIFTS out of the zone (chases
   * the hero off) is counted as gone and replaced, so the fight stays populated
   * where the hero is. The queue still drains as he grinds the cap down, so the
   * point (and its chain) still finishes.
   */
  maxAlive?: number;
  /** Arm only AFTER the spawner with this id drains. */
  after?: string;
  /** Delay (ms) after the `after` spawner drains before arming (counted only
   * while the hero is in range); default `SPAWNERS.chainDelayMs`. */
  afterDelayMs?: number;
  /** Difficulty floor: the point sits out rungs below this. */
  minDifficulty?: Difficulty;
  /**
   * A HELLGATE (config HELLGATES): a spawn point that stays SHUT until the
   * hero's RAMPAGE reaches `openStage`, then tears open and pours `hellborn`
   * mobs at him — harder and faster the deeper the meter runs, and never
   * running dry while it holds (see spawners.ts). Pair it with
   * `minDifficulty: nightmare` (the rungs the gates are content for) and a
   * `minDifficulty: jesus` member line for the worse breed only JESUS meets.
   * A hellgate carries its own trigger radius, emission cadence and
   * simultaneous-gate budget from config, so it never competes with the
   * ordinary horde's pacing; the authored `triggerRadius` / `perEmit` /
   * `intervalMs` / `maxAlive` / `respawnDelayMs` fields are IGNORED on one.
   */
  hellgate?: boolean;
  /**
   * Hellgates only: the rampage stage this gate opens at, overriding
   * `HELLGATES.openStage`. Ignored on an ordinary point.
   */
  openStage?: number;
};

/** The continuous spawner that turns a level into a survivors-style horde. */
export type WaveSpec = {
  /** Time to full pressure; every window is a fraction of this. */
  rampDurationMs: number;
  /** Live-minion cap — spawning defers (never cancels) above it. */
  maxAlive: number;
  /**
   * Live-minion floor: whenever fewer minions than this are alive (and the
   * budget isn't spent), spawns are pulled forward so the screen is never
   * quiet.
   */
  minAlive: number;
  /**
   * Every this-many world px the player walks pulls one extra spawn forward
   * — exploring stirs the horde awake.
   */
  moveSpawnEvery: number;
  budget: WaveBudget[];
};

/**
 * The SKY a venue stands under — the levels whose light follows the clock (see
 * `engine/game/daylight.ts`, which owns the curve and the reasoning).
 *
 * One kind today, and a named kind rather than a boolean because the question a
 * second one would ask is a real one: a venue lit by something other than
 * Earth's sun wants its own curve and its own colour, and `sky: earth` is
 * already the honest answer for the garage rather than `outdoors: true`.
 */
export type SkyKind = "earth";

/**
 * ONE LAMP on a carved map — a pool of light lying on the ground plane, drawn
 * only into the dark (see {@link LevelDef.lights}).
 *
 * It is described in world units and plain colours because the renderer is the
 * only thing that ever reads one: the engine carries lamps the way it carries
 * `biome` and `sprite` names, without knowing what light is.
 */
/**
 * A DISTRICT THAT IS LIT FROM WITHIN — a roofed room whose own lights are on,
 * so the venue's night stops at its walls (see {@link LevelDef.litZones}).
 *
 * A rect rather than a pool, because that is the difference it exists to make:
 * a room is lit up to its walls and not one pixel past them, which no radial
 * lamp can express. Carved from a blueprint area's `lit`.
 */
export type LevelLitZone = {
  /** The floor it covers (world px) — a carved chamber's own rect. */
  rect: { x: number; y: number; width: number; height: number };
  /** How much of the night it holds off, 0–1 (1 = as bright as noon). */
  amount: number;
};

export type LevelLight = {
  /** Where it falls on the floor (world px). */
  pos: Vec2;
  /**
   * THE FIXTURE — the sprite of the thing throwing it (a barn light on a wall,
   * a post on a lawn), drawn at `pos` with its foot on the ground.
   *
   * It rides the LIGHT rather than being a landmark, and that is not a
   * bookkeeping choice: a landmark is painted before the level's obstacles are,
   * so a lamp bolted to a wall came out with its top half cut off by the stone
   * in front of it. The renderer draws these in their own pass AFTER the walls
   * (`drawLamps`), which is what lets a fitting sit ON the wall it is bolted to
   * instead of standing shyly clear of it in the driveway. It also keeps
   * `landmarks` meaning what it means — a story prop the scatter avoids and the
   * app hit-tests.
   *
   * Omitted where the fitting genuinely is not on the ground plane (a gantry
   * light) or where something already drawn is obviously the source (the
   * trader's back-lit machine).
   */
  sprite?: string;
  /**
   * HOW HIGH THE FIXTURE IS BOLTED above the ground it stands on (world px,
   * default 0) — a MOUNTING HEIGHT, and it moves the `sprite` alone.
   *
   * The pool is where the light lands and `pos` is where it lands, so nothing
   * about the night changes; the fitting is simply drawn that far up the wall
   * it is screwed to. It exists because the alternative — moving `pos` — moves
   * the pool with it and, on a door's own pair, walks a lamp into the opening.
   *
   * Only a fitting on a WALL has any use for it. A post on a lawn stands on the
   * ground and is drawn from its foot, which is what 0 means.
   */
  lift?: number;
  /** How far the pool reaches (world px) — the radius its light fades to
   * nothing at. */
  radius: number;
  /**
   * The colour it burns, as a CSS colour the renderer tints its glow with.
   * Omitted = the warm tungsten a porch light throws.
   */
  color?: string;
  /**
   * How hard it burns, 0–1 (default 1): how much of the night it lifts at its
   * centre. Below 1 the pool never quite reaches full daylight, which is what a
   * lamp in a big dark yard actually looks like.
   */
  intensity?: number;
  /**
   * How much it FLICKERS, 0–1 (default 0 — a steady lamp). A tired fluorescent
   * tube over a workbench wavers; a sodium flood outside does not. The waver is
   * drawn off the render clock and the lamp's own position, never off a run's
   * rng: a cosmetic draw taken from `state.rng()` would shift every loot roll
   * after it (see AGENTS.md).
   */
  flicker?: number;
};

export type LevelDef = {
  /** Registry key. */
  id: string;
  /** Story order (1 = earth, 2 = the moon, …). */
  index: number;
  name: string;
  /**
   * The hero's opening monologue: why he came here, in his own voice. Shown
   * as a black-screen dialogue with the hero standing above the box, one page
   * at a time. Each entry is a page; each page is its own array of lines
   * ("" is a blank spacer line). Turning past the last page flashes the level
   * name and drops into the run.
   */
  intro: readonly (readonly string[])[];
  /**
   * The level's post-victory EPILOGUE — the intro's mirror: black-screen
   * pages shown when the victory countdown runs out, before the splash.
   * Same shape as `intro`. A level that ships one also gets the VICTORY
   * QUAKE: the world shakes through the whole loot-grab window (see
   * `GameState.quakeMs`) — the going-out-with-a-bang beat. Omitted = the
   * splash comes up directly, as on every earlier level.
   */
  outro?: readonly (readonly string[])[];
  /**
   * THE LEVEL'S SEND-OFF — a cutscene, or a chain of them, played when the
   * objective falls, before the epilogue pages and the splash. The prelude's
   * mirror at the other end of the run (`prelude`), and it exists because a
   * departure belongs to the place being LEFT rather than to the place next.
   *
   * The moon is why. Its landing site is where THE FLAGBEARER, beaten and
   * satisfied, sees the hero off — and that scene used to open MARS, which is
   * a level the hero flies to from his own lawn. So a player who came home,
   * walked his garage and boarded the ship there was shown himself standing on
   * the moon, saying goodbye to a ghost, in a spacesuit. Hung here instead it
   * plays where it happens: the fight ends, the ghost says his piece, and the
   * chapter closes.
   *
   * Skipped wholesale by a DIALOGUE-muted run, exactly as the prelude and the
   * epilogue are.
   */
  farewell?: string | readonly string[];
  width: number;
  height: number;
  /** Downward acceleration in world px/s². Lower floats jumps higher. */
  gravity: number;
  /** Tileset/mood key for the renderer. */
  biome: string;
  /**
   * THE SKY THIS VENUE STANDS UNDER — present, its light follows the clock
   * (`engine/game/daylight.ts`): the run is handed a `daylight` level as a session
   * parameter and the renderer washes the field down toward night, with the
   * map's own {@link LevelDef.lights} burning in it.
   *
   * Omitted is the answer for almost everything the game ships: an airless
   * regolith, a rift, a sealed corridor and a lit warehouse floor look the same
   * at midnight as at noon, and a venue that never opted in is never dimmed.
   * The GARAGE opted in because the story starts there at night and because
   * home is the one place the player comes back to often enough to notice that
   * it is evening.
   */
  sky?: SkyKind;
  /**
   * THE LAMPS BURNING ON THIS MAP — pools of light on the ground plane, drawn
   * only once the venue's `sky` has gone dark (a lamp at noon is a lamp nobody
   * can see). Carved from the blueprint's `light` objects and the `light:` block
   * on its approach door, so a mission never authors one itself.
   *
   * Purely presentational, like the night they burn in: a lamp reveals no fog,
   * lights no target and changes no reach. It is a place the player can see
   * what he is doing.
   */
  lights?: LevelLight[];
  /**
   * THE ROOMS WHOSE OWN LIGHTS ARE ON — carved from the blueprint areas that
   * carry a `lit`, and read only once the venue's `sky` has gone dark. The
   * garage BAY is one: it is a garage, the strip lights are on, and the night
   * outside stops at its wall.
   *
   * Presentational like {@link LevelDef.lights}, and the two are different
   * instruments on purpose: a lamp is a POOL with a soft edge that spills where
   * it likes, a lit zone is a ROOM with hard edges that are its walls.
   */
  litZones?: LevelLitZone[];
  /**
   * Music track id for this level (a key into the app's music registry, like
   * `biome` and `sprite` — the engine stays audio-free and never plays it).
   * Omitted = the app's default level theme.
   */
  music?: string;
  /** How the renderer paints this level's ground (sprite names + frequencies). */
  tiles: TileSpec;
  /**
   * Whether the hero already wears the EVA suit when the level opens. The
   * story starts him in plain clothes at GOODCO HQ (`false`) — he only
   * becomes the astronaut once he loots the space suit — the space levels
   * pick up mid-mission with the suit on, and a habitable venue (Boot Hill's
   * theme park) stows it again. Omitted = suited.
   */
  heroSuited?: boolean;
  /**
   * The map starts FULLY EXPLORED — no fog of war, ever. For venues the hero
   * knows by heart (his own garage): the whole floor is lit from the first
   * frame and the minimap draws complete. Omitted = the usual creeping fog.
   */
  revealed?: boolean;
  /** What the HUD calls this level's hostiles ("GHOSTS", "STAFF"). */
  foes: string;
  /**
   * Cutscene(s) played before the intro text box (keys into CUTSCENE_DEFS).
   * A list plays back-to-back — one stage per scene (the launch, then the
   * flight), each behind its own fades. Tap advances a beat; the SKIP
   * button ends the WHOLE chain — a rerun costs one tap.
   */
  prelude?: string | readonly string[];
  playerSpawn: Vec2;
  /**
   * Story props the renderer draws (and decor keeps clear of). `sprite`
   * defaults to `kind`; `anchor` defaults to `center` (`base` pins a standing
   * prop's foot to its pos).
   */
  landmarks: {
    kind: string;
    pos: Vec2;
    sprite?: string;
    anchor?: "base" | "center";
  }[];
  /**
   * What ends the level. `killBoss` also anchors the difficulty axis: bands
   * scale from the player spawn toward the boss. `reachExit` is the bossless
   * form (farm levels): standing within `radius` (default GATES.exitRadius)
   * of `at` clears the objective — the exit door anchors the axis instead.
   */
  objective: Objective;
  /**
   * THE INTENDED PATH: an ordered polyline of waypoints (world px) tracing the
   * route the designer means the hero to walk from `playerSpawn` toward the
   * objective, threaded through the level's corridors. Purely a navigation aid,
   * it changes no simulation rule — but two systems read it:
   *   • the autopilot (`bot/`) FOLLOWS it as its macro-travel target so a
   *     no-pathfinding runner rounds walls instead of wedging on them, and
   *   • the app draws a "go this way" guidance arrow toward the next waypoint
   *     when the local area is clear.
   * Author it in navigable open floor (each leg in line-of-sight of the next);
   * omit it on open maps that need no steering. The engine helper
   * `pathHeading`/`nextPathWaypoint` (`path.ts`) resolves the current target.
   */
  path?: Vec2[];
  /**
   * Latent travel gates: doorways to ANOTHER LEVEL that do not exist on the
   * board until the player USES the matching bag trinket (`opensWith`, a
   * GEAR_DEFS id) while standing on this level — the Diablo cow-level ritual.
   * Using the key consumes it, tears the gate open beside the hero
   * (`spendGateKey` in items/inventory.ts), and stepping into it books a `gateEntered`
   * event; the APP owns the actual travel, carrying the hero's build into a
   * run of `to`. Deliberately undocumented in-game: the key item's USE
   * affordance is the only clue.
   */
  gates?: {
    id: string;
    /** Destination level id. */
    to: string;
    /** GEAR_DEFS id of the trinket that, used on this level, opens it. */
    opensWith: string;
    /** Sprite the renderer draws once open; defaults to `id`. */
    sprite?: string;
  }[];
  /**
   * STANDING travel doors — the hub's rocket and rift portal. Unlike `gates`
   * (latent until a key trinket is used), a travel door is on the board from
   * the first tick: the carve pins a LANDMARK whose object id equals the
   * door's `id`, and the app hit-tests that landmark like the merchant's
   * stall. One door lists SEVERAL destinations (the rocket flies to the moon
   * AND Mars), each gated by campaign progress on the app's side — the
   * engine only says where the door stands and where it can lead. The APP
   * owns the actual travel, exactly as it does for a `gateEntered` crossing.
   */
  travelDoors?: {
    /** Door id — MUST match a landmark object id in the level's blueprint,
     * or the door stands nowhere and the content test says so. */
    id: string;
    /** What the door is called on the picker (THE ROCKET, THE RIFT DOOR). */
    name: string;
    /** Destination level ids, in the order the picker lists them. */
    to: string[];
    /**
     * A story-item id that must be banked on the CHARACTER (a `keepsake:`
     * item — see StoryItemDef) before this door works at all: the RIFT SEAM
     * stays sealed until THE FOUNDER's RIFT CREATOR comes home. Omitted =
     * the door only gates per destination, on campaign progress.
     */
    requires?: string;
    /**
     * A PORTAL WITH A SET DESTINATION — no picker: the tap simply takes it.
     *
     * The tears a fleeing boss rips open are these, and it is what separates
     * them from the garage's seam. THE FOUNDER's exit goes exactly one place —
     * wherever he went — and asking the player to confirm that in a panel is a
     * dialogue with one row in it. The SEAM is the one portal with a question
     * worth putting, because the RIFT CREATOR is the thing that can choose.
     *
     * A `direct` door with more than one destination is a content error the
     * schema refuses: "set destination" has to mean one.
     */
    direct?: boolean;
    /**
     * A DOOR THAT ONLY REACHES WHERE THE HERO HAS ALREADY BEEN — the garage's
     * rift seam, and the reason the RIFT CREATOR reads the way its own lore
     * says it does ("tears a seam to anywhere it has already been").
     *
     * Its rows are the destinations this character has ARRIVED AT through a
     * rift portal (`Character.riftRoads`), not the campaign's unlock ladder: a
     * road is offered here because the hero walked it the long way once, so the
     * seam grows a row each time a portal out in the world is used. Omitted =
     * the ordinary rule, campaign progress per destination.
     */
    reached?: boolean;
    /**
     * WHAT HE THINKS WHEN THE DOOR CAN TAKE HIM NOWHERE YET — a thought id
     * (`content/thoughts.yaml`) played INSTEAD of the picker on a tap that
     * finds every one of `to` still locked.
     *
     * The rocket is the case it exists for. A picker listing THE MOON and
     * MARS greyed out answers a question the player has not been asked yet:
     * the ship is one part short, and the hero knows exactly why it isn't
     * going anywhere. So he says so, and the roads he has not earned stay
     * unnamed until one of them opens. Omitted = the old behaviour, a picker
     * whose locked rows read as "come back later" (which is right for a door
     * that already has an open road beside the shut ones).
     *
     * WHICH ROADS ARE OPEN IS THE APP'S ANSWER, not the engine's: it is
     * campaign progress on the CHARACTER (`isLevelUnlocked`), which no run
     * carries. The engine only owns the line and the reach test behind it
     * (`tapTravelDoor` in story.ts).
     */
    unready?: string;
  }[];
  /**
   * Where the exit of a `reachExit` level leads: the victory splash swaps
   * NEXT LEVEL for a "BACK TO <name>" button that starts a run of this level.
   * The farm-loop return door; omitted = the campaign's NEXT LEVEL rules.
   */
  exitTo?: string;
  /**
   * THE WAY ONWARD FROM HERE IS A RIFT PORTAL — so crossing it teaches the
   * garage's seam the road (`Character.riftRoads`, read by a `reached` travel
   * door). Authored on the two venues whose exit is a tear: MARS, where THE
   * FOUNDER rips one open and bolts through it, and THE RIFT, whose far door
   * opens on the western.
   *
   * IT IS A PROPERTY OF THE CROSSING, NOT A DOOR, and it has to be — both of
   * those bosses FLEE, and a fled boss ends the level the instant it goes
   * (`objectiveCleared`). The tear is therefore torn open at the exact moment
   * the field stops being playable, so there is never a live run in which the
   * hero could walk over and tap it. What the player actually does is take the
   * crossing the victory splash offers, and the prelude on the far side is the
   * scene of him stepping through — which is the portal being used, told the
   * way this game tells it.
   */
  riftExit?: boolean;
  /**
   * HARD-CODED per-difficulty mob levels (see {@link DifficultyMobLevels}) —
   * the level default every regular spawn (spawn points, packs, waves, the
   * opening scatter) reads for easy/medium/hard/nightmare instead of the
   * player-relative `mobLevelOffset`. A spawn point may override it per point.
   * REQUIRED on every level (the checker rejects a level missing it); JESUS
   * ignores it and keeps the relative scaling.
   */
  mobLevels?: DifficultyMobLevels;
  /**
   * The INTENDED hero character level while playing this map, per non-JESUS
   * difficulty in ladder order `[easy, medium, hard, nightmare]` — the leveling
   * curve's expected player level here (a single representative point of the
   * arrives→leaves band). NOT read by the simulation: it is the design-intent
   * anchor the `map-layout` tool colours spawner CON against (each spawn point's
   * mob level vs this number), so an over/under-tuned difficulty ramp is visible
   * at a glance. JESUS is excluded (the hero has out-levelled every number).
   */
  intendedLevel?: readonly [number, number, number, number];
  /** Monsters placed at level creation — the "few on screen" at the start. */
  spawns: SpawnSpec[];
  /**
   * The level's RARE & UNIQUE encounters (see config RARE_MOBS): candidate
   * `EnemyDef.rarity` mob ids, rolled once per run at level creation. Each
   * tier rolls independently — `rare` exists on most runs (one candidate
   * picked, spawning its def's `pack` count at a banded spot), `unique` on
   * about one run in five (always a single mob). Candidates must be
   * minion-role defs carrying the matching `rarity`.
   */
  rareSpawns?: {
    rare?: string[];
    unique?: string[];
  };
  /** The horde: thousands more streamed in around the player over time. */
  waves?: WaveSpec;
  /**
   * SPAWN POINTS: the finite, local horde model (see `SpawnerSpec`) — the
   * alternative to the endless `waves` stream. Placed points that arm on
   * approach, emit their mob count over time, drain empty, and can chain — so
   * the map reads as clearable waves and can be traversed without a bottomless
   * bog. A level uses `spawners` OR `waves` for its ambient horde, not both.
   */
  spawners?: SpawnerSpec[];
  /**
   * PLACED PACKS: fixed clusters of monsters pinned around the map that sleep
   * until the player nears them, then boil up and give chase (see `PackSpec`
   * and stepPacks). The level-design tool for maps cleared by MOVING through
   * them rather than farmed from a standstill. On a `clearAll` level every
   * pack must be cleared to win (dormant members count as unspawned foes);
   * on a `killBoss` level they are optional pressure along the way.
   */
  packs?: PackSpec[];
  /**
   * SAFE ZONES (see `engine/game/zones.ts`): regions — rects or circles — where NO
   * monster spawns and the wandering horde is gently repelled OUT, so the pocket
   * stays clear even of chasers. The design lever for a genuine breather: a rest
   * spot, a merchant nook, the calm strip before the boss door. Set pieces
   * (pinned elites/bosses) are NOT repelled — author safe zones clear of them.
   */
  safeZones?: Zone[];
  /**
   * THE ROAD OUT (see `engine/game/vehicles.ts`): the ground a DRIVEN car leaves
   * the level by. Reaching any of these books the trip the `car` travel door
   * names — and books it as a SCENE (`GameState.departure`) rather than a cut,
   * so the wheel is taken out of the player's hands, the car drives on down the
   * road, and the picture goes to black before the next level is built.
   *
   * Present, it REPLACES the garage door's own threshold as the commit: a hub
   * with a road has somewhere to drive TO, and ending the beat at the roll-up
   * left the car standing in its own driveway. A level with no road out keeps
   * the threshold latch, and one with neither keeps the radial one.
   */
  driveOut?: Zone[];
  /**
   * THE TRADER'S BEAT (see `engine/game/merchant.ts`): the ground a trader who
   * WORKS A PITCH paces, carved from the map districts flagged `beat: true`.
   * Present, it turns the level's merchant from a wanderer met once and rooted
   * for good into somebody walking a strip end to end all run — the hub's
   * street dealer, out on the road with the traffic.
   *
   * Read as ONE strip: the wander picks its legs along the bounding box's LONG
   * axis and holds the cross axis inside the box, which is what makes a lane
   * of tarmac read as a beat rather than as a wander that happens to be
   * fenced. Author it on a strip, not on a plaza.
   */
  merchantBeat?: Zone[];
  /**
   * THE STAFF LOT'S OWN LIFE (see `engine/game/arrivals.ts`): people turning up
   * for a shift, in cars, and walking in through a door they have the badge
   * for. Present, it turns the level's arrival district from a car park with a
   * horde standing in it into a car park with a WAY IN somewhere along its
   * wall — and following somebody who knows where that is, is the mission's
   * opening puzzle rather than a corridor to walk down.
   *
   * The MISSION owns everything here; the CARVE owns where it happens
   * ({@link LevelDef.arrivalLot} and the `entrance` door it hangs).
   */
  arrivals?: ArrivalsSpec;
  /**
   * WHERE THE CARS ROLL IN (carve-owned — the districts flagged
   * `arrivals: true` on the blueprint, as plain rects). The whole cell, like
   * the road out above: the lot IS the ground the arrivals happen on, so a
   * circle inside it would leave half the tarmac out of the beat.
   *
   * Absent on a mission — a mission has no map to put a car park on.
   */
  arrivalLot?: Zone[];
  /**
   * QUIET ZONES / DEAD AREAS (see `engine/game/zones.ts`): regions where the
   * ambient wave/pack horde does NOT spawn — a lull in the pressure — but
   * authored content still lives: a `chest` to find, a lone rare/unique mob
   * guarding it, hand-placed pickups. The reward for exploring off the main
   * line. Unlike a safe zone the horde is not repelled, so a mob you walk in
   * with (or a pinned guardian) still fights.
   */
  quietZones?: Zone[];
  /**
   * TEMPO CURVE: keyframes `{ at, intensity }` over the run's timeline (`at` is
   * a fraction of `waves.rampDurationMs`, ascending) that scale the wave
   * pressure envelope (the live cap and floor) — a map builds and releases
   * pressure instead of ramping flat. `intensity` 1 is baseline; >1 crowds the
   * field, <1 thins it. Interpolated linearly and clamped (config `TEMPO`).
   * Omitted = flat baseline (today's behavior). Composes with `quietZones`
   * (spatial lulls) — tempo is the temporal arc, quiet zones the local pockets.
   */
  tempo?: TempoPoint[];
  /**
   * SPECIAL CHESTS: hand-placed reward containers (distinct from scattered
   * breakable `crate` obstacles). The hero's weapon smashes one open like a
   * crate, but it spills a RICHER, guaranteed haul (config `CHESTS`) — the
   * payoff that makes a `quietZone` dead area worth the detour. Author them
   * where the map wants a destination.
   */
  chests?: ChestSpec[];
  /**
   * MERCHANT SPAWN POINTS: authored spots the wandering trader may first appear
   * at (world px). When present, the merchant starts at one of these (rolled on
   * his own stream) instead of a random search across the map — so the shop
   * lands somewhere designed (a safe nook, a crossroads). Omitted = the default
   * random placement. Ignored when the trader is pre-placed at the door (a
   * met-before restart).
   */
  merchantSpawns?: Vec2[];
  /**
   * Solid features scattered at level creation. Nothing moves through one;
   * `jumpable` ones can be hopped over — monsters never jump, so low rocks
   * are walls to the horde and shortcuts to the player.
   */
  obstacles: {
    kind: string;
    /** Sprite name; defaults to `kind`. */
    sprite?: string;
    count: number;
    radius: number;
    jumpable: boolean;
    /**
     * BREAKABLE loot crates (see crates.ts): the hero's weapon smashes these
     * for guaranteed loot. Marked ones are minted with break hp (scaled to the
     * run's level, config `CRATES`) and drop on death; unmarked features never
     * take damage. Pair with `jumpable: true` — a crate is hoppable cover you
     * can also smash.
     */
    breakable?: boolean;
    /**
     * CHANCE-BASED SPILL for a breakable PROP — a vending machine, a wine
     * rack, street junk — rather than a supply crate. `chance` (0..1) is the
     * probability the break drops anything at all (absent = 1, a crate's
     * guaranteed spill); `drop` overrides the primary drop's category weights
     * (absent = config `CRATES.drop`) so a themed prop pays themed loot — a
     * vending machine leans stamina drinks, a wine rack healing, a WEAPONS
     * LOCKER almost nothing but rounds and guns. Ignored without `breakable`.
     */
    loot?: {
      chance?: number;
      drop?: {
        health?: number;
        stamina?: number;
        gear?: number;
        ammo?: number;
      };
    };
    /**
     * Rectangular rocks: each placement rolls one footprint from this list,
     * sized `[wCells, hCells]` at `cell` world px per cell. The rock collides
     * as that box (blocking sight, shots and blasts) and is drawn with the
     * per-size sprite `<sprite|kind>_<w>x<h>`. Omitted = the plain circular
     * obstacle of `radius`.
     */
    rockSizes?: [number, number][];
    /** World px per grid cell for `rockSizes` (footprint = size × cell). */
    cell?: number;
    /**
     * DISTRICT RESTRICTION: regions this line's props may land in. Omitted = the
     * whole map (the scatter's default). A restricted line still places its
     * `count` — the sampler just retries until a candidate lands inside one of
     * the regions — so a map can dress its halves differently: the cactus and
     * dry shrub over the desert, the crates and hardware over the compound.
     * Purely a placement filter (`anyZoneContains`), sharing the `Zone` geometry
     * the design zones use. Chiefly what the generated maps' AREA TYPES emit
     * (see `game/mapgen/`), and available to a hand-authored map for the same
     * reason.
     */
    within?: Zone[];
    /**
     * WALL-HUGGING placement: candidates are drawn along the borders of the
     * line's `within` rects (inset by the prop's radius plus the wall's own)
     * instead of anywhere on their floor. Furniture stands against walls —
     * a workbench in the middle of the garage floor is a scatter artifact,
     * one against the back wall is a garage. Requires `within` rect zones;
     * ignored without them.
     */
    edge?: boolean;
  }[];
  /**
   * Deliberate architecture: each segment is expanded into a chain of solid
   * circles from `from` to `to` at level creation, so a straight run of
   * `wall` obstacles reads (and collides) as one wall. Leave door-sized gaps
   * between segments — walls skip the scatter clearance rules on purpose.
   */
  walls?: {
    kind: string;
    /** Sprite name; defaults to `kind`. */
    sprite?: string;
    /**
     * A SPRITE POOL for the chain: each stone picks one (off the level's own wall
     * stream, so the pick is deterministic and costs the main rng nothing). A
     * long wall drawn from ONE sprite reads as a manufactured lattice — the same
     * stone stamped forty times in a row — which is exactly what a natural ridge
     * is not. Wins over `sprite` when both are given.
     */
    sprites?: string[];
    /**
     * MEANDER: how far (world px) the chain may wander off the straight line
     * between `from` and `to`, so a rubble ridge snakes instead of ruling a
     * pencil line across the map. The drift is a bounded RANDOM WALK — each
     * stone steps a little off its neighbour rather than jumping independently —
     * so consecutive stones always still overlap and the wall remains a SEAL: no
     * body slips through a meandering ridge any more than a straight one. It is
     * TAPERED to zero at both ends, so junctions with other walls and the edges
     * of a doorway stay exactly where the level put them. Omitted/0 = the
     * straight chain.
     */
    wander?: number;
    from: Vec2;
    to: Vec2;
    radius: number;
    jumpable: boolean;
  }[];
  /**
   * Hand-placed BUILDINGS: a deterministic town structure drawn from its
   * `sprite` and colliding as an axis-aligned BOX of `w`×`h` world px centred on
   * `pos` (the sprite's footprint), so a frontier town can be composed
   * building-by-building instead of scattered. Unlike `obstacles` (random
   * scatter) each building sits exactly where the level author puts it; unlike a
   * `wall` (a chain of circles) it collides — and blocks sight and shots — as
   * the rectangle it looks like, so the streets between buildings read as clean
   * lanes. Placed before the scatter so decor keeps its distance.
   */
  buildings?: {
    /** Sprite name the renderer blits (a town building sprite). */
    sprite: string;
    /** Centre of the building's footprint (world px). */
    pos: Vec2;
    /** Footprint width in world px — the collision box's full width. */
    w: number;
    /** Footprint height in world px — the collision box's full height. */
    h: number;
    /** A jumping hero sails over it (default false — buildings are tall). */
    jumpable?: boolean;
  }[];
  /**
   * PROP LINES: a sprite stamped at a fixed `spacing` (world px) along the
   * segment `from`→`to`, so a level can be composed as STRUCTURED ROWS — a
   * conveyor run down a bay, a line of workstations, a painted lane edge —
   * instead of the random `obstacles`/`decor` scatter. Placed deterministically
   * (no rng), exactly where the author draws them, and laid down BEFORE the
   * scatter so decor keeps its distance.
   *
   * A `collide` line becomes box `Obstacle`s (sized by `half`, or a circle of
   * `radius`) that block movement/sight/shots like a `building`; a flat line
   * (the default) becomes `Decor` the hero walks over. Use dense spacing to read
   * as a continuous belt/rail, wider spacing for spaced stations.
   */
  propLines?: {
    /** Sprite name the renderer blits at each step (a decor/obstacle sprite). */
    sprite: string;
    /** Segment start (world px) — the first prop sits exactly here. */
    from: Vec2;
    /** Segment end (world px). */
    to: Vec2;
    /** Distance in world px between successive props along the segment. */
    spacing: number;
    /** True → colliding box/circle obstacles; false/omitted → flat decor. */
    collide?: boolean;
    /** Colliding: rectangular half-extents (world px). Wins over `radius`. */
    half?: Vec2;
    /** Colliding: circle radius when no `half` is given (default 8). */
    radius?: number;
    /** Colliding: a jumping hero clears it (default false). */
    jumpable?: boolean;
  }[];
  /**
   * Black holes: static gravity wells that drag the grounded player,
   * enemies and loose loot toward their core — minions and the grounded
   * player are devoured there (instant death for the hero), while loot piles
   * up on the rim. Loot is pulled from a wider `lootRadius` (about a screen
   * away) than the player. A jump no longer clears the pull: airborne the
   * hero still drifts toward the core and the hole's gravity fights his hop
   * (he jumps less high near the horizon), though he floats above the core.
   * Omitted numbers fall back to the config WELLS defaults; see GravityWell
   * for what each means.
   */
  wells?: GravityWellSpec[];
  /**
   * Meteor strikes: presence turns the asteroid spawner on. Every `everyMs`
   * (rolled per rock) one falls out of the sky onto a patch near the hero,
   * telegraphed by a firming ground shadow, and DETONATES — vaporizing minions
   * at the lethal core and flinging everything else (the hero included) to the
   * sides. A blast that catches the grounded hero takes a difficulty-scaled
   * bite of his max hp scaled by how near the centre he stood
   * (DifficultyDef.asteroidDamageFrac); the shared tuning lives in config
   * ASTEROIDS. `craterSprites` names the scar sprites this level's surface
   * leaves behind (omit on a floorless biome to skip persistent craters).
   * `struckThought` (a THOUGHT_DEFS id) fires a one-time inner monologue the
   * first time a blast catches the hero this run — the "watch out for these"
   * beat, tracked in the same `thoughtsSeen` ledger as the kill/sight pins.
   */
  asteroids?: {
    everyMs: [number, number];
    craterSprites?: string[];
    struckThought?: string;
  };
  /**
   * Spinning hay balls: presence rolls the bale hazard on (config HAY_BALLS).
   * Every `everyMs` (rolled per bale) one mints just past the right screen edge
   * in its own lane and rolls straight to the LEFT across the hero's
   * surroundings, spinning and bouncing. A bale caught on the grounded hero
   * costs a very slight flat hp (once per bale) and SHOVES him left every tick
   * it overlaps — he must step out of the lane (or jump it) to stop being
   * pushed back down the street. Boot Hill's western prop hazard.
   */
  hayBalls?: { everyMs: [number, number] };
  /**
   * Sand storms: presence turns the squall spawner on. Every `everyMs` (rolled
   * per storm) one small dust gust drifts across the player's surroundings —
   * SLOW enough to walk clear of, which is the whole defence. A storm that
   * catches the grounded hero takes a difficulty-scaled bite of his max hp
   * (DifficultyDef.sandstormDamageFrac) AND knocks him out — he drops prone and
   * helpless for SANDSTORMS.knockoutMs while the storm passes over him and
   * fades. Shared tuning lives in config SANDSTORMS. `struckThought` (a
   * THOUGHT_DEFS id) fires a one-time inner monologue the first time a storm
   * downs the hero this run, tracked in the same `thoughtsSeen` ledger.
   */
  sandstorms?: { everyMs: [number, number]; struckThought?: string };
  /**
   * Employee stampedes: presence turns the herd hazard on (config STAMPEDES).
   * Every `everyMs` (rolled per herd) a wall of five panicked staffers charges
   * in from the right screen edge and thunders straight LEFT at great speed,
   * a dust cloud boiling off its back. The herd tramples minions in its lane
   * (flung aside AND killed — no farm) and shoves elites/bosses; a grounded
   * hero it catches takes a difficulty-scaled bite of his max hp
   * (DifficultyDef.stampedeDamageFrac) AND a knockdown (prone for
   * STAMPEDES.knockdownMs). Jumping sails clean over it,
   * and stepping out of the lane clears it. GOODCO HQ's "asteroid" beat.
   * `struckThought` (a THOUGHT_DEFS id) fires a one-time inner monologue the
   * first time a herd downs the hero this run, tracked in the same
   * `thoughtsSeen` ledger.
   *
   * `afterProgress` (0..1) holds the whole hazard back until the hero has
   * crossed that fraction of the spawn→boss run — the herds are the SECOND-HALF
   * beat of the floor, so an onboarding map keeps the opening aisles calm and
   * only lets the stampedes roll once the player is well into the level. The
   * countdown is FROZEN below the gate (so the first herd arrives a full
   * interval after the crossing, not the instant it is reached), and the
   * approach rumble stays silent until then. Omitted/0 = on from the first
   * second (the shipped behavior).
   */
  stampedes?: {
    everyMs: [number, number];
    struckThought?: string;
    afterProgress?: number;
  };
  /**
   * Locked doors: built exactly like walls (chains of solid `door_locked`
   * circles) but tracked in `state.doors` — carrying the story-item key
   * whose `unlocks` names the door's `id` up to it slides it open. Pair
   * each with wall segments that enclose the room it guards.
   */
  doors?: {
    id: string;
    from: Vec2;
    to: Vec2;
    radius: number;
    /** The obstacle-chain sprite; defaults to `door_locked`. The garage's
     * roll-up slats wear `garage_door`. */
    sprite?: string;
    /**
     * The same door STANDING OPEN — drawn in the jambs once the leaves have slid
     * aside, so a doorway that has been used keeps a door in it instead of
     * reverting to a hole in the wall.
     *
     * It is drawn as flat scenery (`state.decor`), never as an obstacle: the
     * whole meaning of an open door is that the hero can walk through it. Omit
     * it for a door with nothing left to draw — the garage's roll-up rolls UP.
     */
    openSprite?: string;
    /**
     * How it opens: `key` (the default — a story item whose `unlocks` names
     * this door, carried up to it) or `approach` — it slides open for anybody
     * who simply walks or drives up (the interior doors of a building, and the
     * garage door; no key exists for either).
     */
    opens?: "key" | "approach";
    /**
     * THE ROLL-UP: this one goes up rather than aside, so its opening fires
     * `garageDoorOpened` (the app's roll-up animation and its chain-drive
     * sound) instead of the plain `doorOpened` slide.
     *
     * It is a fact about the DOOR, not about its lock, and keeping the two
     * apart is what lets a building's interior doors open for anybody who walks
     * up to them without every one of them sounding like a loading bay.
     */
    rollUp?: boolean;
  }[];
  /**
   * LAIRS: a named monster lives in this house, and comes OUT of it.
   *
   * The alternative — the elite standing in the open where the hero can see him
   * from two rooms away — is how every other set piece on a generated map works,
   * and it is why they all feel the same. A duel that starts with a door banging
   * open is an EVENT: the hero was walking down a street, a house he had already
   * walked past opened, and the thing inside came out to meet him.
   *
   * Modelled on `packs` — dormant until the hero closes, then it wakes once and
   * for good — with the two differences that make it a scene rather than an
   * ambush: the occupant is a SET PIECE (an authored elite at an authored level),
   * and the door is a real prop that swaps from `sprite` to `openSprite` as it
   * comes through. The elite's own `dialogue` then takes the stage the way it
   * always does, which is what makes it a GREETING before it is a fight.
   */
  lairs?: {
    id: string;
    /** The doorway — where the door prop is drawn and where the occupant steps
     * out. Put it on the building's near face, not its centre. */
    pos: Vec2;
    enemy: string;
    level?: DifficultyMobLevels;
    hp?: DifficultyHp;
    /** Closed-door sprite. */
    sprite: string;
    /** The same door standing open — swapped in as the occupant comes through,
     * and left that way. */
    openSprite: string;
    /** How close the hero must come to be greeted (world px). */
    triggerRadius?: number;
    /** Guards that come out behind him. */
    escort?: {
      enemy: string;
      count: number;
      level?: DifficultyMobLevels;
      hp?: DifficultyHp;
    }[];
  }[];
  /**
   * ELEVATORS: pads that carry the hero somewhere the map does not connect to.
   *
   * A door is a hole in a wall — whatever is behind it is still part of the map,
   * and the fog-of-war minimap shows the shape of it long before the hero gets
   * there. An elevator is not that. The car goes somewhere the floor plan does
   * not reach, so the destination cannot be seen, guessed at, or approached: it
   * exists on the minimap as nothing at all until the hero rides down. That is
   * what makes it the right ending for a search — the last thing to find on the
   * map is not the boss, it is the way to him.
   *
   * Each pad names where it goes (`to`) and rides on CONTACT: the hero walks
   * onto it and the car takes him. Pairing two pads that name each other's
   * positions makes it a two-way lift; a single pad is a one-way drop.
   *
   * The engine moves the hero, wakes the fog at the far end and books the event;
   * the app plays the ride. Nothing else travels — the horde does not use the
   * lift, so what is down there is what was already down there.
   */
  elevators?: {
    id: string;
    /** Where the pad stands. */
    pos: Vec2;
    /** Where the car puts the hero down. */
    to: Vec2;
    /** Sprite drawn under the hero on the pad; defaults to `elevator_pad`. */
    sprite?: string;
    /** Contact radius in world px (default ELEVATOR.rideRadius). */
    radius?: number;
    /** Short label the app prints over the pad (e.g. `TO CONTROL ROOM`). */
    label?: string;
    /**
     * A KEYED CAR: the door id (a story item's `unlocks`) the hero must be
     * carrying before this pad will take him.
     *
     * It is the same lock a keyed ROOM uses, hung on the one link a wall cannot
     * carry. Where a mission ends past a lift — the compound at the end of the
     * park, the vault under the bunker — the last door is the car, so gating
     * the run's finale on a keycard means gating the RIDE. The pad still draws
     * and still says where it goes: a lift you can see and cannot call is what
     * makes the pass worth taking off the man who has it.
     *
     * Never put it on a car whose key is on the far side of it.
     */
    opensWith?: string;
  }[];
  /**
   * Hand-placed pickups (the loot inside locked rooms, plot pieces on
   * pedestals). Equipment is minted from its def id; story items key into
   * STORY_ITEM_DEFS.
   */
  placedItems?: PlacedItem[];
  decor: {
    kind: string;
    sprite?: string;
    count: number;
    /** DISTRICT RESTRICTION — see the obstacle field of the same name. */
    within?: Zone[];
  }[];
  /**
   * THE CANOPY: scenery floating BETWEEN the camera and the ground — drawn OVER
   * the hero and the horde, out of focus, sliding faster than the ground does.
   *
   * It is a depth cue, and on a level that is mostly empty floor it is the
   * difference between a space and a rug: the rift is a tear between universes,
   * and lost junk drifting overhead says there is somewhere above the hero's head
   * for it to drift in. Purely presentational — nothing collides with it and the
   * simulation never steps it; the drift is derived from the render clock, so a
   * canopy costs a run nothing and cannot desync a replay.
   *
   * Keep it SPARSE and FAINT. Anything up there is between the player and the
   * thing trying to kill him, so a canopy that competes for attention is a
   * canopy that gets somebody killed.
   */
  canopy?: {
    kind: string;
    /** Sprite name; defaults to `kind`. */
    sprite?: string;
    count: number;
    /** Drift speed range in world px/s (`[min, max]`, rolled per piece). */
    drift?: [number, number];
    /** How much faster than the ground it slides (>1 = nearer the eye). */
    parallax?: number;
    /** Blur radius in px — the depth-of-field tell. */
    blur?: number;
    /** Opacity 0..1. */
    alpha?: number;
    /** Scale range (`[min, max]`, rolled per piece), so one sprite passes both
     * close and far. */
    scale?: [number, number];
  }[];
  /**
   * THE FAUNA: living scenery on the GROUND plane — cattle grazing the range,
   * chickens in a yard, a jackrabbit bolting across the dust.
   *
   * The canopy's twin, and it answers the same complaint from the other side. A
   * level whose only moving things are trying to kill the hero reads as an arena
   * with a texture on it; a field with cows in it was a field before he arrived.
   * On a map built around SEARCHING, that matters more than usual — the player is
   * looking at a lot of ground he has no fight in, and it has to be worth looking
   * at.
   *
   * Presentational, like the canopy: the wander is a closed-form function of the
   * render clock, so nothing is stepped, nothing desyncs, and a critter is not an
   * actor — it cannot be hurt, does not collide, and never blocks a shot.
   */
  fauna?: {
    kind: string;
    /** Sprite name; defaults to `kind`. With `animated`, the base name of a
     * two-frame walk (`<sprite>_0` / `<sprite>_1`). */
    sprite?: string;
    /** Whether `sprite` names a two-frame walk cycle. Default false. */
    animated?: boolean;
    count: number;
    /** How far from its home point it strays, world px (`[min, max]`). */
    range?: [number, number];
    /** Wander speed, world px/s (`[min, max]`). */
    speed?: [number, number];
    /** Scale range, so a herd has calves in it. */
    scale?: [number, number];
    /** DISTRICT RESTRICTION — see the obstacle field of the same name. Cattle
     * belong on the grass, chickens in the yard. */
    within?: Zone[];
  }[];
  /** Keep decor at least this far from landmarks. */
  decorClearance: number;
  /**
   * One-time inner monologues: the first time the hero kills `enemy` on this
   * level, the run pauses into a `playerThought` dialogue that plays the
   * THOUGHT_DEFS entry named by `thought`. A story beat pinned to a kill
   * rather than to a speaker rushing into view.
   */
  firstKillThoughts?: ThoughtTrigger[];
  /**
   * Like `firstKillThoughts`, but pinned to a sighting: the first time an
   * `enemy` comes within DIALOGUE.sightRadius of the hero on this level, the
   * run pauses into the `playerThought` dialogue — before a single blow. For
   * beats that are a reaction to seeing something, not to killing it.
   */
  firstSightThoughts?: ThoughtTrigger[];
  /**
   * THE PLACE-PINNED BEATS — inner monologues pinned to WHERE the hero is
   * rather than to a monster, in the order they should be read.
   *
   * The third trigger beside the two above, and the one a venue with no horde
   * needs: `intro` is the doorstep cutscene (it plays before the level is
   * walkable, once per difficulty, and it is the establishing SHOT rather than
   * a to-do), while both `first*Thoughts` hang off a mob. The HUB has neither a
   * mob nor a reason to keep quiet about where the car goes — so the two things
   * it wants to say are "the part is at GOODCO and the car is right there" on
   * arrival, and "you are walking, and it is not walking distance" when the
   * hero strolls out of the bay on his own feet instead.
   *
   * Each fires once, tracked in `state.thoughtsSeen` like every other pinned
   * beat (so the app's per-difficulty ledger skips them on every return home),
   * and each yields to whatever is already on stage rather than cutting it off.
   */
  placeThoughts?: PlaceThoughtTrigger[];
  /**
   * This level's WANDERING MERCHANT persona (see merchant.ts / config
   * MERCHANT). The trader roams every level; this names how he dresses for
   * THIS one (`sprite`, walk frames `<sprite>_0/_1`), what the dialogue box
   * calls him, and his meeting scene — the once-only `greeting` played when
   * the hero first discovers him, in his own voice: why he is here, and that
   * he'd like to do business. Omitted = the default hooded look, no scene.
   */
  merchant?: {
    /** Sprite family; defaults to `merchant`. */
    sprite?: string;
    /** Dialogue-box name; defaults to THE MERCHANT. */
    name?: string;
    /**
     * PARKED AT A COUNTER — the hub mode. He stands at the carve's stall
     * spot from the first tick, revealed (rooted, stocked, pinned on the
     * map) with no walk-up meeting and no scene, and he never wanders. The
     * answer to "whom does he follow?" in co-op: nobody — everyone knows
     * where the counter is. Omitted = the wandering trader, as everywhere.
     */
    parked?: boolean;
    /**
     * WORKS A PITCH — the other resident mode, and the hub's. He is open for
     * business from the first tick exactly like a `parked` trader (revealed,
     * stocked, pinned, no meeting scene), and then he WALKS: end to end along
     * the beat the map carves for him (`LevelDef.merchantBeat`, districts
     * flagged `beat: true`), all run. A tap roots him where he stands so the
     * hero can walk up to a counter that isn't moving (`hailMerchant`), and
     * closing the shop puts him back on the pavement.
     *
     * Needs a beat to walk: a level that says `beat: true` on a map with no
     * flagged district gets a trader standing where he spawned, which the map
     * schema refuses rather than shipping.
     */
    beat?: boolean;
    /**
     * THE COUNTER LINE — the one thing he says every time the shop opens,
     * shown across his counter rather than through the dialogue box (it is a
     * greeting, not a scene, and a scene on every visit would be a toll
     * booth). One sentence, in his own voice. Dialogue text — mirror into
     * `docs/manuscript.md`. Omitted = the counter shows no line.
     */
    line?: string;
    /** Pages of the meeting scene (same shape as an elite's `dialogue`). */
    greeting?: string[][];
    /**
     * The "welcome back" line, spoken when the hero re-enters a map where he
     * has ALREADY met this trader (persisted per level+difficulty — the
     * merchant is set up at the door on the new run, see `revealMerchant`).
     * Lines of ONE page, in the trader's voice; the difficulty's send-off
     * (`MERCHANT_RETURN_SENDOFF`) is appended so each level+difficulty reads a
     * touch different. Dialogue text — mirror into `docs/manuscript.md`.
     */
    returnGreeting?: string[];
    /**
     * Named UNIQUES (`defs/uniques.ts` ids) this level's stall MAY carry on
     * top of the rolled weapons. Each is ROLLED at stall-stocking time at
     * the standing boss-unique odds (`UNIQUE.dropChance × mlvl/ilvl`, the
     * hero's level as the mlvl) — the same rarity as a boss's unique drop,
     * landing on the counter instead of a corpse, priced at sell value ×
     * the vendor markup. How a trader ends up fencing a dead oligarch's
     * wardrobe, and why the oligarch's own valuables are the intended purse.
     */
    stockUniques?: string[];
  };
  /**
   * A scripted opening beat that draws the hero's weapon. When present, the
   * hero starts the level DISARMED — his weapon won't attack — and a lone
   * "vanguard" monster is placed at `at`, way ahead of the pack, to rush him
   * and land a harmless first swing. That swing (no HP lost) fires the
   * `thought` and arms the weapon; combat is normal from then on. The `after`
   * gate holds the arming until its thought has played, so the "look at this
   * place" read always lands before the "good thing I came armed"
   * reaction. Omitted = the hero opens armed, as on every later level.
   */
  openingStrike?: OpeningStrike;
  loot: {
    /**
     * WEAPON_DEFS ids this level's drops draw from — the bases this level
     * INTRODUCES, thematically (office arms on earth, 70s hardware on the
     * moon, …). Within the pool, each base's own `levelReq` decides when it
     * actually starts dropping (a mob below the requirement never drops it),
     * and tier availability is the global monster-level gate
     * (config LOOT.tierUnlockMlvl) — not per-level data anymore.
     */
    weaponPool: string[];
    /** GEAR_DEFS ids this level's drops draw from. */
    gearPool: string[];
    /** ABILITY_DEFS ids this level's drops draw from. */
    abilityPool: string[];
    /**
     * LEVEL-LOCKED world-drop uniques (see `defs/uniques.ts` WORLD_UNIQUES),
     * keyed by difficulty rung: the named relics that ANY enemy on this level
     * can drop on that rung, at role-scaled odds (config WORLD_DROP). This is
     * how a Moon-themed relic drops only on the Moon — and only once the hero
     * out-levels a first campaign pass (`WORLD_DROP.minPlayerLevel[difficulty]`,
     * a per-rung gate), so the
     * relics are farmed by returning for boss runs. Distinct from the boss-only
     * `EnemyDef.uniquesByDifficulty` tables. Rolled in `maybeDropWorldUnique`.
     */
    worldUniques?: Partial<Record<Difficulty, string[]>>;
    /**
     * The FARM-VENUE multiplier (default 1): this level drops HAND-AUTHORED
     * NAMED items at N× the per-kill rate — BOTH the world-locked unique
     * relics (`maybeDropWorldUnique`) AND the global legendary/artifact rarity
     * roll (`rollTier`). The bunker (the cow level) sets 2×, so its long runs
     * are the game's best named-item farm; ordinary levels leave it 1.
     */
    namedDropMult?: number;
    /**
     * The player level a normal single run of this level at each difficulty
     * leaves the hero at — the map's PACING YARDSTICK. Derived from the
     * campaign model (`scripts/leveling-curve.mjs --by-level`, the level each
     * map/difficulty clear reaches); read by the campaign simulator's
     * realistic pacing (a run "clears" when the hero reaches it) and its
     * boss-level verdicts. It is a YARDSTICK, never an XP faucet's gate — no
     * payout is priced off it (the XP scroll multiplies rather than pays), so
     * moving it re-paces a map's runs and changes nothing about what drops.
     */
    intendedLevelByDifficulty?: Partial<Record<Difficulty, number>>;
    /**
     * Trophy weapon def dropped by the last regular monster standing —
     * clearing every mob on the level always earns it.
     */
    allClearWeapon?: string;
    /**
     * A scripted opening loot cadence, authored in ascending `atKills` order.
     * Where the probabilistic drop rain can leave an unlucky player
     * empty-handed for the first minute, this hands over the weapon → powerup
     * → item loop on a schedule, so every run teaches the drop loop up front.
     * Author the first weapon before the first level-up (a handful of kills)
     * so the opening stat choice is informed by a weapon already in hand.
     */
    earlyDrops?: EarlyDrop[];
  };
};

/**
 * One keyframe of a level's `tempo` curve: at fraction `at` of the wave ramp
 * (0 = level start, 1 = full ramp), the wave pressure envelope is scaled by
 * `intensity` (1 = baseline). Points are authored in ascending `at` order and
 * interpolated linearly between (see `tempoIntensity` in step/).
 */
export type TempoPoint = {
  /** Fraction of `waves.rampDurationMs` (0..1). */
  at: number;
  /** Pressure multiplier at this point (1 = baseline; clamped by config TEMPO). */
  intensity: number;
};

/**
 * One special CHEST (`LevelDef.chests`): a placed breakable container that
 * spills a richer, guaranteed haul than a scattered crate (config `CHESTS`).
 */
export type ChestSpec = {
  /** Where the chest sits (world px). */
  at: Vec2;
  /** Sprite the renderer blits; defaults to `chest`. */
  sprite?: string;
};

/**
 * One pinned inner monologue (`firstKillThoughts` / `firstSightThoughts`):
 * the first qualifying kill/sighting of `enemy` plays the THOUGHT_DEFS entry
 * named by `thought`, once per run.
 */
export type ThoughtTrigger = {
  /** Key into ENEMY_DEFS. */
  enemy: string;
  /** Key into THOUGHT_DEFS. */
  thought: string;
  /**
   * Ordering gate: this beat holds until the thought named here has played.
   * A held trigger isn't spent — it retries on the next qualifying
   * kill/sighting — so a two-part beat (see the wisp, then down one) always
   * reads in order, even when a long-ranged weapon downs the first mob from
   * beyond sight range.
   */
  after?: string;
  /**
   * `firstSightThoughts` only: how close (world px) the pinned mob must get
   * before the sighting fires. Omitted falls back to `DIALOGUE.sightRadius`
   * (the conservative phone-half-view read). A drop-in "look at this place"
   * beat wants a WIDER radius so it fires the instant the crowd is on screen —
   * the horde already fills the view, so waiting for one to crawl to 96 px
   * lets a faster scripted rusher win the race and land its strike first.
   * Ignored by `firstKillThoughts`.
   */
  radius?: number;
  /**
   * `firstSightThoughts` only: HOLD THIS BEAT UNTIL THE HERO IS PAST THE GATE —
   * inside the building, on the far side of the level's arrival entrance
   * (`LevelDef.arrivals`, `anyHeroPastEntrance`).
   *
   * IT IS NOT A SMALLER RADIUS, and the difference is the whole reason it
   * exists. A sighting is measured as plain distance, and the crowd the beat is
   * about stands a step INSIDE the doorway — so the moment a badge opens the
   * gate, a hero standing out on the tarmac is well within any radius wide
   * enough for the beat to fire at all, and reads out "every desk's manned,
   * every lab lit" while looking at parked cars. Narrowing the radius instead
   * only moves the problem: the beat has to fire on the crowd being THERE, and
   * the crowd is there before he is.
   *
   * Vacuously true on a level with no arrival lot, so it is a no-op rather than
   * a beat that never plays.
   */
  inside?: boolean;
};

/**
 * WHERE a place-pinned beat fires (`PlaceThoughtTrigger.where`).
 *
 * Both are geometric facts the ENGINE can answer on any map, which is what
 * keeps this a trigger vocabulary rather than a list of hard-coded garage
 * beats — a mod's own hub gets the same two for free:
 *
 *   `arrival`  — the hero is standing on this level with the run actually
 *                live. Nothing else: the first playing tick that has no scene
 *                on stage.
 *   `pastDoor` — a hero ON HIS OWN FEET has crossed one of the level's
 *                APPROACH doors (`LevelDef.doors[].opens === "approach"` — the
 *                roll-up that opens for anybody who walks up to it) and now
 *                stands on the far side of it from the level's own
 *                `playerSpawn`. He has walked OUT. A hero at a wheel does not
 *                count, which is the whole point of the garage's beat: the
 *                car crossing the same threshold is not somebody who forgot
 *                to take it.
 */
export type PlaceThoughtWhere = "arrival" | "pastDoor";

/**
 * One place-pinned inner monologue (`LevelDef.placeThoughts`): being in the
 * place `where` names plays the THOUGHT_DEFS entry named by `thought`, once,
 * tracked in `state.thoughtsSeen` like every other pinned beat.
 */
export type PlaceThoughtTrigger = {
  /** Key into THOUGHT_DEFS. */
  thought: string;
  /** What being "there" means — see {@link PlaceThoughtWhere}. */
  where: PlaceThoughtWhere;
  /**
   * Ordering gate: this beat holds until the thought named here has been read.
   * A held trigger isn't spent — it simply retries on a later tick — so the
   * hub's "take the car" always lands before its "you are walking".
   */
  after?: string;
};

/**
 * THE STAFF TURNING UP FOR A SHIFT (`LevelDef.arrivals`, `engine/game/arrivals.ts`).
 *
 * A car rolls onto the lot every so often, parks in the rank, and whoever was
 * driving it gets out and walks to a door in the building's wall — and BADGES
 * IN. That door (`door`, hung by the carve across every opening between the lot
 * and the building) is a KEYED door no story item in the game unlocks, so it is
 * the one way in that the hero cannot simply walk up to: he has to see somebody
 * else use it, and go through with them.
 *
 * THE POINT OF IT IS THE SEARCH, NOT THE LOCK. The lot is fogged like anything
 * else, so a player who lands beside his own car has no idea which stretch of
 * that wall has a door in it. Somebody arriving is a POINTER — the one thing on
 * the tarmac that knows where it is going — and following one is the mission's
 * first move. `thought` is the read that says so, out loud, the first time one
 * of them steps out of a car.
 *
 * EVERYBODY NAMED HERE IS A NEUTRAL (the schema refuses a hostile def), which
 * is what makes the lot a place the hero has not been noticed in yet rather
 * than a fight he walks into holstered.
 */
export type ArrivalsSpec = {
  /**
   * Who turns up — ENEMY_DEFS ids, one rolled per car. A list rather than one
   * id because a car park with the same person getting out of every car is a
   * loop rather than a night shift.
   */
  staff: string[];
  /**
   * THE LOT'S OWN STANDING POPULATION: the people who are already there when
   * the hero lands, minted once at level creation and spread over the tarmac.
   * They are the whole of the lot's cast — the ambient horde is off out here
   * (`MapArea.horde: 0`), because a car park full of staff to fight is the
   * building's beat playing outside the building.
   */
  guards?: {
    /** ENEMY_DEFS id — neutral, like everybody else on the lot. */
    enemy: string;
    count: number;
  };
  /** Ms before the FIRST car rolls in. Short: the beat it teaches is the one
   * the player needs before he can do anything else. */
  firstMs?: number;
  /** Ms between the ones after it, rolled uniformly in the band. */
  everyMs: [number, number];
  /**
   * How many cars may stand on the lot at once — the rank's length. Reached,
   * the arrivals stop: a car park that keeps filling forever is a queue.
   */
  maxCars?: number;
  /**
   * THE GATEHOUSE — the lit box beside the doorway with somebody sitting in it,
   * stood up once at level creation on whichever side of the entrance the carve
   * left room for.
   *
   * IT IS WHAT MAKES THE ENTRANCE READ AS A GATE. Without it the way in is a
   * slab of wall that occasionally slides aside: the player has no way to know
   * the door is CONTROLLED rather than merely stuck, so the badge beat lands as
   * a quirk of the level instead of as the rule the whole mission turns on. A
   * kiosk with a guard behind the glass says "somebody decides who comes
   * through here" in one frame, from across the tarmac, with no line of
   * dialogue spent on it.
   *
   * IT IS ONE PIECE, AND THE GUARD IS PAINTED INTO IT. The man behind the glass
   * is part of the sprite rather than a body on the field, which is not a
   * shortcut but the point: a real neutral standing there would wander, could
   * be shoved, could be killed, and would have to have something to say. This
   * one sits, all night, and never notices anybody — which is exactly the
   * relationship the hero has with this building now.
   *
   * Omitted = a bare doorway, as on any venue that wants one.
   */
  gatehouse?: {
    /** Sprite the kiosk is drawn with — a solid obstacle, like any furniture. */
    sprite: string;
    /** Collision radius (world px); a sensible kiosk-sized default otherwise. */
    radius?: number;
  };
  /** THOUGHT_DEFS id fired once, when the first of them steps out of a car. */
  thought?: string;
  /**
   * The door the badge opens (`LevelDef.doors[].id`). Defaults to `entrance`,
   * which is what the carve hangs across the lot's own openings.
   */
  door?: string;
};

/**
 * The scripted "draw your weapon" beat (`LevelDef.openingStrike`): the level
 * opens with the hero disarmed and a lone vanguard placed to rush him, and the
 * vanguard closing to within `radius` (a proximity trigger, not a contact one)
 * arms him and plays a thought.
 */
export type OpeningStrike = {
  /** ENEMY_DEFS id of the vanguard placed way ahead of the pack. */
  enemy: string;
  /** Where the vanguard is placed (near the spawn, ahead toward the goal). */
  at: Vec2;
  /** THOUGHT_DEFS id fired when the vanguard closes in and draws the blade. */
  thought: string;
  /**
   * THE BLOWS HE TAKES BEFORE HE ANSWERS ONE — the beats played, in order, by
   * the strikes that land BEFORE the arming one. Each entry is a THOUGHT_DEFS
   * id; the blow that lands with every one of them read is the blow that draws
   * the weapon and plays `thought`.
   *
   * This is what turns a shove into a SCENE. One strike and an armed hero says
   * "the night shift bites now" and gets on with it, which reads as a man who
   * came here to fight; the horde is his old colleagues, and stepping over
   * that in a single tick is the coldest thing the campaign could do with it.
   * Each warning is a refusal — he names them, tells them to stand down, says
   * he does not want this — and they hit him again anyway, so the answer he
   * finally throws is the last option rather than the first.
   *
   * MECHANICALLY IT IS ONE RULE: the read ledger IS the counter. A warning is
   * pushed to `thoughtsSeen` as it plays, so the beat needs no run state of
   * its own, survives a save/resume for free, and a REPLAY (or BOT VIEW, which
   * seeds the whole ledger through `markThoughtsSeen`) finds every warning
   * already read and arms on the first blow — which is exactly right, since a
   * player who has watched the scene should not sit through it again.
   *
   * Omitted (or empty) keeps the original single-blow beat.
   */
  warnings?: string[];
  /**
   * How close (world px) the vanguard must get before the blade comes out.
   * Omitted falls back to `DIALOGUE.strikeRadius` — the phone-half-view default,
   * so the rusher is on screen and bearing down when the hero reacts.
   */
  radius?: number;
  /**
   * Ordering gate: the arming holds until this thought has played, so the
   * hero's first read on the level lands before the "good thing I came
   * armed" reaction. Same semantics as ThoughtTrigger.after.
   */
  after?: string;
};

/**
 * One entry in a level's scripted opening loot cadence (`loot.earlyDrops`):
 * a guaranteed drop handed over once the kill count reaches `atKills`. The
 * payload picks exactly one of a specific weapon, a piece of gear (a charm or
 * armor — e.g. an onboarding +INT trinket to widen the starter's AoE), an
 * ability powerup, or a plain consumable/XP pickup.
 */
export type EarlyDrop = {
  /**
   * Kill count at or past which this entry drops. A number is an exact
   * threshold (deterministic onboarding); a `[min, max]` pair is rolled
   * uniformly at level creation, so the drop lands at a kill discovered in
   * play. Entries are authored in ascending order (by the low bound).
   */
  atKills: number | [number, number];
} & (
  | { weapon: string }
  | { ability: string }
  | { gear: string }
  | { item: "medkit" | "repair" | "xp" }
);

/**
 * What ends the level. `killBoss` also anchors the difficulty axis: bands
 * scale from the player spawn toward the boss. `reachExit` is the bossless
 * form (farm levels): standing within `radius` (default GATES.exitRadius) of
 * `at` clears the objective — the exit door anchors the axis instead.
 *
 * `hub` is the objective that NEVER clears: a home base (the garage) raises
 * no victory, no outro and no bank, so a player can stand in it indefinitely
 * and the run only ends by leaving through a door. A hub is the one place a
 * "harmless" objective bug becomes unbearable, which is why it is its own
 * kind rather than an abuse of `reachExit` — see `objectiveCleared`.
 */
export type Objective =
  | { type: "killBoss" }
  | { type: "clearAll" }
  | { type: "reachExit"; at: Vec2; radius?: number }
  | { type: "hub" };

/**
 * A hand-placed pickup on the carved map (the loot inside a sealed room, a plot
 * piece on a pedestal). Equipment is minted from its def id; story items key
 * into STORY_ITEM_DEFS.
 */
export type PlacedItem =
  | { kind: "story" | "equipment"; defId: string; pos: Vec2 }
  | { kind: "medkit" | "xp" | "repair"; pos: Vec2 };

/** A black hole on the carved map — see the `wells` field of {@link LevelDef}. */
export type GravityWellSpec = {
  pos: Vec2;
  pullRadius?: number;
  coreRadius?: number;
  pullSpeed?: number;
  lootRadius?: number;
};

/**
 * The fields THE CARVE OWNS — the ones a `content/maps/<id>.yaml` blueprint
 * decides fresh every run, and which a mission therefore no longer authors.
 *
 * They are the whole difference between the two types below. Everything else on
 * a level — its name, story, ladder, loot pools, hazards, merchant, thought
 * pins, travel gates — is the MISSION's, and is inherited by the carve
 * untouched.
 */
type CarvedField =
  | "width"
  | "height"
  | "playerSpawn"
  | "landmarks"
  | "spawns"
  | "obstacles"
  | "decor";

/**
 * A MISSION as it is AUTHORED — `content/levels/<id>.yaml`, the catalog
 * `levelDef()` answers with.
 *
 * A mission is no longer a map: it is the recipe's other half. The geometry is
 * carved per run from `content/maps/<id>.yaml` (see `game/mapgen/`), so
 * everything positional is the carve's to decide and is OPTIONAL here —
 * present only on the synthetic catalogs the engine tests install through
 * `registerDefs`, which have no blueprint to carve from and hand-place their
 * few props instead.
 *
 * The rule that falls out of the split is the one worth keeping: **a mission is
 * not a level.** Anything reading geometry wants {@link LevelDef} — inside a
 * run that is `runLevelDef(state)`, and nowhere else is there one at all.
 */
export type MissionDef = Omit<
  LevelDef,
  CarvedField | "objective" | "placedItems" | "wells"
> &
  Partial<Pick<LevelDef, CarvedField>> & {
    /** The exit of a `reachExit` mission stands wherever the carve put the
     * goal cell, so the authored form names no spot. */
    objective:
      | { type: "killBoss" }
      | { type: "clearAll" }
      | { type: "reachExit"; at?: Vec2; radius?: number }
      | { type: "hub" };
    /** WHAT the mission leaves lying around; the carve decides WHERE (it
     * strings the story pieces along its own depth axis — see
     * `mapgen/place.ts`). */
    placedItems?: (
      | { kind: "story" | "equipment"; defId: string; pos?: Vec2 }
      | { kind: "medkit" | "xp" | "repair"; pos?: Vec2 }
    )[];
    /** The wells a mission has, with their authored pull geometry; the carve
     * re-anchors each into a cell of its own. */
    wells?: (Omit<GravityWellSpec, "pos"> & { pos?: Vec2 })[];
  };
