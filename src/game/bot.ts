// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The autopilot: strategies that turn the live GameState into per-tick
// GameInput — the same hold-to-steer/tap-to-jump input a human produces, so
// a bot slots in anywhere a player does. Today it drives the headless engine
// tests and the app's `?bot=` autoplay mode (see the playtest skill); the
// same interface is the seed for an AI-controlled second player later.
//
// Bots are PURE consumers of the state: they never mutate it and never draw
// from state.rng, so a botted run is exactly as deterministic as a recorded
// human run with the same seed.

import {
  clamp,
  direction,
  distance,
  segmentDistanceSq,
} from "@game/lib/vec.ts";
import type { Vec2 } from "@game/lib/vec.ts";
import { BUILD_ROTATION, metaLane, STAT_BUILDS } from "./builds.ts";
import type { StatBuild } from "./builds.ts";
import { resolveBotTuning } from "./bot-tuning.ts";
import type { BotTuning } from "./bot-tuning.ts";
import { createThoughtMemory, resolveThought } from "./bot-thoughts.ts";
import type { ThoughtMemory } from "./bot-thoughts.ts";
import { BOT_TUNING_OVERRIDES } from "../generated/botTuning.ts";
import {
  CONSUMABLES,
  HELD_ITEMS,
  MAP,
  PLAYER,
  STAMINA,
  STAMPEDES,
} from "./config.ts";
import { mapCols, mapRows } from "./map.ts";
import { onPathLevel } from "./path.ts";
import { buildNavGrid, findPath } from "./pathfind.ts";
import type { NavGrid } from "./pathfind.ts";
import { blockedByObstacle, insideObstacle, lineOfSight } from "./obstacles.ts";
import {
  abilityValue,
  wantsMerchantVisit,
  weaponStarved,
} from "./bot-economy.ts";
import { canBankAbility, isSlotActive, magnetRadius } from "./abilities.ts";
import { abilityDef } from "./defs/abilities.ts";
import type { AbilityDef } from "./defs/abilities.ts";
import { enemyDef } from "./defs/enemies/index.ts";
import { weaponDef } from "./defs/equipment.ts";
import { levelDef } from "./defs/levels/index.ts";
import { spellDef } from "./defs/spells.ts";
import {
  bestMedkitTier,
  canCollectEquipment,
  committedLane,
  effectiveStat,
  equipmentMaxDurability,
  heroSpellStat,
  isSpellAvailable,
  isWeaponBroken,
  maxMeleeTargets,
  medkitTierIndex,
  weaponDamageFor,
  weaponRangeFor,
  weaponSweepHalfAngle,
} from "./items.ts";
import type {
  Asteroid,
  Enemy,
  Equipment,
  GameInput,
  GameState,
  Item,
  Obstacle,
  StatName,
  WeaponClass,
} from "./types.ts";

export type BotStrategy =
  | "idle"
  | "rush"
  | "kite"
  | "boss"
  | "survivor"
  // The three POSTURES — the horde-survival read at three aggression levels.
  // `balanced` is exactly the old `survivor` (kept as an alias); `aggro` trades
  // safety for kills (closes and holds tight, tolerates more bodies before it
  // punches out); `flee` trades kills for safety (holds far, disengages early,
  // widens the gap on every edge tick).
  | "aggro"
  | "flee"
  | "balanced";

/** Every strategy, for UIs and harnesses that validate a requested name. */
export const BOT_STRATEGIES: BotStrategy[] = [
  "idle",
  "rush",
  "kite",
  "boss",
  "survivor",
  "aggro",
  "flee",
  "balanced",
];

/** The three POSTURES a `simulate` matrix sweeps ("all strategies"): the
 * playstyle axis, orthogonal to the weapon-lane {@link BotProfile}. */
export const BOT_POSTURES: BotStrategy[] = ["aggro", "balanced", "flee"];

/**
 * A bot's COMBAT PROFILE: the stat-distribution build it spends level-up points
 * on, orthogonal to the positioning {@link BotStrategy}. A fixed {@link StatBuild}
 * (`melee`/`ranged`/`magic`) steers allocation into that weapon lane's
 * attributes so the stat-aware auto-equip (`weaponScore`) naturally prefers that
 * class of weapon — a `magic` bot ends up casting, a `melee` bot swinging —
 * without the bot ever touching equipment directly; `balanced` spreads the
 * points across every stat and lets the auto-equip pick emergently. `auto` keeps
 * the old emergent behavior: the lane is whichever class the hero has invested
 * the most in, falling back to the held weapon. `meta` (the DEFAULT) is the
 * level-band STRATEGY — melee early, magic mid–high, melee at the endgame (see
 * {@link metaLane}) — so an un-parameterised bot commits to the strongest lane
 * for its current level instead of spreading thin.
 */
export type BotProfile = StatBuild | "auto" | "meta";

/** Every profile, for UIs and harnesses that validate a requested name. The
 * four fixed profiles are the {@link StatBuild} distributions; `auto` keeps the
 * emergent (whichever lane the hero has invested most in) behaviour; `meta` is
 * the level-band default (melee → magic → melee). */
export const BOT_PROFILES: BotProfile[] = ["auto", "meta", ...STAT_BUILDS];

/**
 * A bot instance: the positioning `strategy` and the weapon-lane `profile`.
 * Per-bot memory (wander targets, reaction delays, a second player's
 * personality) hangs off this later.
 */
export type Bot = {
  strategy: BotStrategy;
  profile: BotProfile;
  /**
   * Anti-wedge memory for the {@link unstuckInput} stall detector. Mutated by
   * `botAct` each tick — it lives on the BOT, never on `GameState`, so a botted
   * run stays exactly as deterministic as a recorded human one (same seed +
   * fresh bot → same memory evolution). Lazily created on the first tick.
   */
  nav?: {
    /** Hero position at the last progress check. */
    lastPos: Vec2;
    /** `state.stats.timeMs` at the last progress check. */
    lastTimeMs: number;
    /** How long (ms) the hero has been all-but-frozen while unable to fight. */
    stuckMs: number;
    /** True while COMMITTED to the escape sweep — held (with hysteresis) until he
     * has physically moved clear of the wedge, so a full sweep can round a wall
     * instead of aborting the instant he twitches and flees back in. */
    escaping: boolean;
    /** `timeMs` the current escape began (drives which heading is swept). */
    escapeStartMs: number;
    /** Where the escape began — the exit baseline (moved far enough → free). */
    escapeStartPos: Vec2;
    /** The COMMITTED escape heading (radians), or null when none is open — the
     * contour-trace memory: a human tracing a wall holds one direction until
     * the wall turns it, rather than re-deciding every burst. Kept while its
     * body-width probe stays open; when it blocks, the re-probe prefers the
     * headings NEAREST it, so the trace bends around the contour instead of
     * flipping back into the pocket. */
    escapeHeading: number | null;
  };
  /**
   * GLOBAL PATHFINDING memory (see pathfind.ts). The nav grid is STATIC per level
   * so it's built once and cached; the route is the current A* plan the bot is
   * following toward its macro goal, replanned only when the goal moves, the hero
   * is shoved off the route, or he reaches the end. Like `nav`, it's per-bot
   * mutable memory keyed off pure state — a fresh bot on the same seed evolves it
   * identically, so a botted run stays deterministic. Lazily created.
   */
  route?: {
    /** The level the cached grid/route belong to (rebuilt on a level change). */
    levelId: string;
    /** The static walkability grid for this level (built once). */
    grid: NavGrid;
    /** The world goal the current `path` was planned to reach. */
    goal: Vec2;
    /** A* waypoints from the plan origin to the goal (turning points). */
    path: Vec2[];
    /** Index of the next unreached waypoint in `path`. */
    index: number;
  };
  /**
   * The committed CONTENT target (a chest to loot or an elite to engage) the bot
   * is sweeping toward — the automatic "discover everything before the boss"
   * memory. Recomputed (nearest A*-reachable piece) only when the content
   * inventory changes (`sig`), so the bot commits to one piece until it's
   * consumed rather than dithering between two each tick. Per-bot, pure — same
   * determinism guarantee as `route`.
   */
  content?: {
    levelId: string;
    /** A cheap signature of the remaining content — recompute when it changes. */
    sig: number;
    /** The chosen nearest reachable content position, or null if none remain. */
    target: Vec2 | null;
    /** What the committed target is — an ELITE to hunt down or a chest to loot
     * — so the thought bubble can name the errand. Null with no target. */
    kind: "elite" | "chest" | null;
    /** The hunted elite's enemy id (kind `elite` only) — the identity the
     * abandon safety skips by (an elite MOVES, so a cell key wouldn't stick). */
    enemyId?: number;
    /** The LOWEST hp seen on the committed piece — an elite's health bar, a
     * chest's break hp. NEAR the piece, "headway" means that bar making NEW
     * LOWS: an elite stalemate the hero keeps resetting (bleed → retreat → it
     * leashes home and regens), or a chest the flood never lets him crack,
     * must keep the abandon clock running or it pins the whole run. */
    minHp?: number;
    /** Closest the hero has come to `target` (world px²) and when — the progress
     * gauge that ABANDONS a target he can't make headway on. */
    bestDistSq: number;
    bestTimeMs: number;
  };
  /**
   * Content targets the bot has GIVEN UP on — A*-reachable but ones it couldn't
   * make headway toward within the abandon window (a cache walled behind a fight
   * it keeps getting shoved out of). Skipped on re-pick so the sweep moves on to
   * the next piece (and ultimately the boss) instead of deadlocking. Keyed per
   * level; a fresh bot on the same seed abandons identically, so determinism
   * holds. Abandoned CHESTS get ONE second chance: once the rest of the content
   * pool is consumed, the chest keys are cleared (`retriedChests` latches so it
   * happens once per level) and the sweep marches back — a locker abandoned
   * mid-scuffle early on is usually a walkover for the leveled hero, and a
   * level should end with every chest cracked. Elite skips stay skipped.
   */
  contentSkip?: { levelId: string; keys: string[]; retriedChests?: boolean };
  /**
   * EXPLORATION-STALL memory: the "am I still discovering ground" gauge that
   * releases the bot to the boss when it stops making COVERAGE headway — the
   * safety that keeps a hero who can't reach boss-level parity (a combat-bogged
   * run that neither levels up nor uncovers more map) from looping on fog forever
   * instead of committing. `mark`/`markMs` are the last coverage the sweep counted
   * as real progress and when; `done` latches once it has stalled, so the bot
   * heads for the boss for the rest of the level. Per-level, pure — same
   * determinism guarantee as `content`.
   */
  explore?: { levelId: string; mark: number; markMs: number; done: boolean };
  /**
   * WINDED-PACING latch: true while the bot has committed to the recovery
   * WALK on a quiet field (pool dipped below the bravery-slid reserve floor)
   * and hasn't yet refilled past the resume band. The hysteresis that keeps
   * the march reading walk-to-recover / run-when-rested instead of flapping
   * at the threshold. Pure per-bot memory off pure state — determinism holds.
   */
  recovering?: boolean;
  /**
   * WINDED-STAND latch: true while the bot has committed to CATCHING ITS
   * BREATH — the pool ran BONE-DRY, so with no foe inside the walk-threat
   * ring he plants outright until the pool climbs back to the reserve floor.
   * Standing is the only pace that both runs down the empty-pool regen
   * lockout (`STAMINA.emptyRegenLockMs`) and then refills at the FULL
   * breather rate; a dry hero who keeps pushing at full throttle re-arms the
   * lockout every frame and jogs at half speed forever. Releases into the
   * recovery WALK (`recovering`), which carries the pool on to the resume
   * band. Pure per-bot memory off pure state — determinism holds.
   */
  winded?: boolean;
  /**
   * BRAVERY memory: a sparse trail of (timeMs, cumulative damageDealt)
   * samples covering the last ~minute, so {@link braveryScore} can read how
   * fast the hero has RECENTLY been shredding the local health bars. Pure
   * per-bot memory off pure state — determinism holds.
   */
  bravery?: { samples: { t: number; dmg: number }[] };
  /**
   * ANTI-LOITER memory: when the hero last counted as IN A FIGHT (a live foe
   * inside the local threat ring, a hit taken, or the scripted disarmed
   * opening), plus the enemy id of a latched HUNT. Once the fightless gap
   * exceeds the level's `seekFightAfterMs` the bot latches the nearest enemy
   * and marches on it — held until that foe is down or a real fight finds him
   * (see {@link trackEngagement} / {@link seekTarget}), so he never just
   * loiters on cleared ground. Per-level, pure — same determinism guarantee as
   * `content`.
   */
  seek?: {
    levelId: string;
    lastEngagedMs: number;
    targetId: number | null;
    /** Closest the hero has come to the hunted foe (world px) and when — the
     * progress gauge that ABANDONS a hunt he can't make headway on. */
    bestD: number;
    bestMs: number;
  };
  /**
   * The GPS NUDGE: an externally-pinned world coordinate the bot should tend
   * toward. While set, it becomes the macro destination (only the urgent
   * weapon-starved shop run outranks it), routed by A* like every other goal
   * and pulled toward through combat via the GPS heading — so a harness, a
   * test, or a scenario can point the bot at an area and he works his way
   * there. Cleared automatically once the hero arrives within
   * {@link WAYPOINT_REACH} (see {@link trackWaypoint}). Set it with
   * {@link setBotWaypoint}; plain per-bot memory, so determinism holds as long
   * as the caller sets it deterministically.
   */
  waypoint?: Vec2 | null;
  /**
   * When the last GROUNDED, affordable JUMP was requested (sim ms,
   * `state.stats.timeMs`) — the memory behind the discretionary-hop COOLDOWN
   * ({@link BotTuning.hopCooldownMs}): a takeoff spends 10% of a pool only
   * standing still refills, so even in sustained trouble the bot spaces its
   * hops out instead of bunny-hopping itself winded. Mechanic dodges a jump is
   * the ONLY escape for (stampede, bale on top) ignore the cooldown but still
   * refresh it. Per-bot memory keyed off pure state — determinism holds.
   */
  lastHopMs?: number;
  /**
   * When the last PASS-OVER TOP-OFF fired (sim ms) — the cooldown memory for
   * the spend-and-refill switch on capped consumables
   * ({@link BotTuning.topOffCooldownMs}): with a stack full and the same kind
   * lying underfoot, the bot drinks/mends/heals ONE and the walked-over pickup
   * refills the stack. Rate-limited so a field littered with kits after one
   * scuffle doesn't turn the march into a top-off crawl. Per-bot memory keyed
   * off pure state — determinism holds.
   */
  lastTopOffMs?: number;
  /**
   * What a GOLDEN ARROW is WORTH, learned from experience: the share of the
   * XP bar the last collected arrow actually paid, remembered in 5%
   * increments (a human who grabs arrows all run knows roughly what one gives
   * — this game taps the same feel, never the engine's hidden formula). Read
   * by the strategic-arrow heuristics ({@link dingArrowNearby}): an arrow
   * that would DING is a free FULL HEAL (a level-up restores hp and stamina),
   * so a nearby one substitutes for a medkit and buys bravery. Cold arrows
   * teach ~0%, which naturally disables the reads. Per-bot memory keyed off
   * pure state (the collection events) — determinism holds.
   */
  arrowXp?: { pct: number; level: number };
  /**
   * CIRCLE-STRAFE direction (+1 / −1) the hero is currently orbiting a held
   * target in — the committed sense of a human's circle-strafe, held until the
   * next arc would run into a wall or the map edge, then reversed (see
   * {@link orbitHold}). Per-bot mutable memory keyed off pure state, so a fresh
   * bot on the same seed strafes identically and determinism holds. Lazily set.
   */
  orbitSign?: number;
  /**
   * The META profile's COMMITTED weapon lane — frozen the first time the bot
   * allocates a point, off the hero's level THEN (its construction/starting
   * level), and held for the rest of the run. A hero can't reallocate spent
   * points, so the lane is decided once at spin-up (melee early, magic from the
   * nightmare-armored mid-game, melee at the artifact cap — see {@link metaLane})
   * rather than thrashed per level. Per-bot memory keyed off pure state, so a
   * fresh bot on the same seed freezes the same lane — determinism holds. Unused
   * by the fixed/`auto` profiles.
   */
  metaLaneChoice?: WeaponClass;
  /**
   * The thought surfaced over the hero's head by the BOT VIEW debug overlay —
   * the STABLE, overarching read (`bot-thoughts.ts` `resolveThought`), NOT the
   * raw per-tick branch. `think` records the raw label here each tick; the
   * `botAct` wrapper then folds it through the resolver and overwrites this with
   * the settled thought (an incoming meteor preempts, a strafe reads as one
   * "SKIRMISH"). Like `nav`, it's a pure per-bot annotation the sim never reads
   * back, so determinism is untouched.
   */
  lastThought?: string;
  /**
   * Resolver memory for {@link lastThought} — the rolling window of raw decisions
   * and the currently-shown thought (see `bot-thoughts.ts`). Per-bot, keyed off a
   * pure clock, so a fresh bot on the same seed evolves it identically. Lazily
   * created on the first tick.
   */
  thoughts?: ThoughtMemory;
};

export function createBot(
  strategy: BotStrategy,
  profile: BotProfile = "meta",
): Bot {
  return { strategy, profile };
}

/** The hero has ARRIVED at a pinned {@link Bot.waypoint} once he's this close
 * (world px) — the nudge is then consumed and the normal plan resumes. */
const WAYPOINT_REACH = 120;

/**
 * Pin (or clear, with `null`) the bot's GPS NUDGE — a world coordinate the
 * autopilot will route to and tend toward until he arrives (see
 * {@link Bot.waypoint}). The nudge is consumed on arrival.
 */
export function setBotWaypoint(bot: Bot, target: Vec2 | null): void {
  bot.waypoint = target === null ? null : { x: target.x, y: target.y };
}

/** Consume a pinned waypoint once the hero has arrived. Called once per tick
 * from {@link decideAct}; mutates only bot memory, so determinism holds. */
function trackWaypoint(bot: Bot, state: GameState): void {
  if (!bot.waypoint) return;
  if (distance(state.player.pos, bot.waypoint) <= WAYPOINT_REACH)
    bot.waypoint = null;
}

/** Record the autopilot's RAW decision this tick as a short label — the input to
 * the BOT VIEW thought resolver ({@link botAct} folds it into the stable
 * `bot.lastThought` the overlay draws). A pure annotation on the bot — never read
 * back into the sim — so it can't affect determinism. Labels stay within the
 * pixel font's glyph set (caps, digits, `. , : - ( )` …) and, to preempt or
 * merge in the resolver, want a matching entry in `bot-thoughts.ts` `THOUGHTS`. */
function think(bot: Bot, label: string): void {
  bot.lastThought = label;
}

/**
 * The effective {@link BotTuning} for a level — the hand-authored `bot.yaml`
 * overrides (compiled to `src/generated/botTuning.ts`) resolved over the shipped
 * defaults. Called once per tick with `state.level.id`. Pure (a function of its
 * argument + the static generated table), so a botted run stays deterministic.
 */
export function botTuningFor(levelId: string): BotTuning {
  return resolveBotTuning(BOT_TUNING_OVERRIDES, levelId);
}

/** "Local pack" radius the survivor reasons about (threat, escape, powerups). */
const THREAT_RADIUS = 320;
/** A foe this close is about to bite — hop to dodge its blow (airborne is
 * untouchable above JUMP.dodgeHeight, see step.ts). */
const CONTACT_DODGE_RADIUS = 46;

/** How hard the intended-path heading biases the survivor's retreat bearing (a
 * fraction of the unit away-from-pack vector). High enough that backing off the
 * pack drifts the hero down the corridor toward the next waypoint, low enough
 * that dodging the horde still wins when the waypoint lies straight through it. */
const PATH_RETREAT_BIAS = 0.9;

/** On a path level, how close (world px) the hero must be to the boss to LOCK
 * onto it and fight it down rather than kite its adds — a boss-room-sized ring,
 * so he commits the moment he's in the arena even if a straggler waypoint went
 * untagged. */
const BOSS_LOCK_RANGE = 300;

/** A spawn point still owing mobs within this range keeps the hero CLEARING this
 * patch before the path lets him advance (the level's "clear the area, then move
 * on" contract) — so he levels up on the way instead of rushing under-levelled. */
const SPAWNER_CLEAR_RANGE = 540;

/** Enemies within this ring count toward being SURROUNDED. */
const SURROUND_RADIUS = 150;
/** HP fraction below which the fight counts as GOING BADLY (OVERWHELMED) —
 * what arms the defensive reads: the escape-route guard and the kite-backward
 * retreat drift. Above the posture `fleeHp` (the emergency bail), so caution
 * starts while there is still a bar left to protect; below full, so a healthy
 * hero keeps the forward-pressing game that actually clears maps. */
const OVERWHELMED_HP_FRAC = 0.7;
/** Bots pop a medkit once health falls below this fraction of the bar. */
const HEAL_HP_FRAC = 0.55;
/** Top up stamina when the pool dips below this AND a threat is near — a winded
 * hero (empty pool) is capped to a jog and gets run down. */
const STAMINA_TOPUP_FRAC = 0.3;
/** Spend the NUKE only into an OVERWHELMING flood — this many foes inside the
 * blast itself (which covers roughly the visible screen). A pack any thinner
 * is left to the guns; the wipe is the break-glass button. */
const NUKE_PACK = 20;
/** Spend a combat power (storm/orbit) once a fight this size is packed close —
 * good value against a few bodies, no need to wait for a horde. */
const POWERUP_FIGHT_PACK = 3;
/** STASIS is the cornered-escape: fired when the hero CAN'T RUN (sprint pool
 * below the top-up line), is BLEEDING (hp under {@link STASIS_HP_FRAC}), and at
 * least this many foes are hunting inside the local threat ring — freezing the
 * chase buys the ground a healthy pair of legs would just outrun. */
const STASIS_HUNT_PACK = 5;
/** The hp fraction under which the cornered-escape stasis arms. */
const STASIS_HP_FRAC = 0.5;
/** Ground drops inside the magnet's pull that make popping it worthwhile. */
const MAGNET_LOOT_MIN = 3;
/** How far the escape steer aims down the openest lane. */
const ESCAPE_DISTANCE = 340;
/** How near a pickup must be to be worth a detour. */
const ITEM_REACH = 240;
/** PASS-OVER TOP-OFF reach (world px): a capped consumable is spent-to-refill
 * only when the same kind lies basically underfoot — the switch happens in
 * passing, never as a detour (capped supplies are very low priority). A
 * running MAGNET widens this to its pull radius: everything inside is coming
 * to the hero anyway (see {@link topOffReach}). */
const TOP_OFF_REACH = 56;
/** Spend-to-refill a MEDKIT only when hp sits below this fraction of max —
 * "not full" with a real gap, so the heal isn't wasted on a scratch. */
const TOP_OFF_HP_FRAC = 0.9;
/** Spend-to-refill a STAMINA POTION only when the pool sits below this
 * fraction — standing still refills stamina for free, so only a genuinely
 * drained pool makes the swap worth a potion. */
const TOP_OFF_STAMINA_FRAC = 0.75;
/** How near (world px) a DINGING golden arrow must be to stand in for a
 * medkit — close enough that "grab the arrow instead" is the same fight, not
 * a trek across the field while bleeding. */
const ARROW_SAVE_REACH = 150;
/** Below this hp fraction the medkit is popped even with a dinging arrow in
 * reach — nearly dead is no time to gamble on making the pickup. */
const ARROW_MEDKIT_HOLD_HP_FRAC = 0.3;

/** The pass-over top-off's live reach: the underfoot {@link TOP_OFF_REACH},
 * widened to a running MAGNET's INT-scaled pull radius — everything inside
 * the ring is being reeled in, so the stack can be opened for each item the
 * pull is about to land. Pure read of the running abilities. */
function topOffReach(state: GameState): number {
  let reach = TOP_OFF_REACH;
  for (const ability of state.player.abilities) {
    const def = abilityDef(ability.defId);
    if (def.magnet) reach = Math.max(reach, magnetRadius(state, def));
  }
  return reach;
}

// === BRAVERY — how boldly the pool gets spent ===

/** The recent-performance window the bravery read looks back over (ms). */
const BRAVERY_WINDOW_MS = 60_000;
/** Cadence of the bravery damage samples (ms) — sparse, so the trail stays
 * ~30 entries deep over the whole window. */
const BRAVERY_SAMPLE_MS = 2_000;
/** A single blow stripping this fraction of the average local health bar
 * reads as FULLY brave on the weapon axis. */
const BRAVE_BLOW_BAR_FRAC = 0.5;
/** Shredding this many average health bars per second over the recent window
 * reads as FULLY brave on the performance axis. */
const BRAVE_BARS_PER_SEC = 1;
/** Medkits in the pockets that read as a full safety net. */
const BRAVE_MEDKITS = 3;
/** Stamina potions in the pockets that read as a full sprint reserve. */
const BRAVE_STAMINA_POTS = 3;
/** Banked powerup VALUE ({@link abilityValue} summed) that reads as a full
 * emergency arsenal — a nuke (4) plus a storm (3) covers it. */
const BRAVE_POWERUP_VALUE = 6;
/** At FULL bravery the pre-fight top-up settles for this fraction of the pool
 * instead of demanding 100% — a shredder doesn't idle for the last drops. */
const TOPUP_BRAVE_MIN_FRAC = 0.7;

/**
 * Keep the bravery damage trail fresh: a sparse (timeMs, damageDealt) sample
 * every {@link BRAVERY_SAMPLE_MS}, pruned to {@link BRAVERY_WINDOW_MS} — the
 * "how hard have I been hitting lately" memory {@link braveryScore} reads.
 */
function trackBravery(bot: Bot, state: GameState): void {
  bot.bravery ??= { samples: [] };
  const samples = bot.bravery.samples;
  const t = state.stats.timeMs;
  const last = samples[samples.length - 1];
  if (!last || t - last.t >= BRAVERY_SAMPLE_MS) {
    samples.push({ t, dmg: state.stats.damageDealt });
  }
  while (samples.length > 0 && t - samples[0]!.t > BRAVERY_WINDOW_MS) {
    samples.shift();
  }
}

/**
 * How BRAVE the hero can afford to be right now, 0 (naked rookie on a starter
 * blade) to 1 (kitted shredder) — the read that slides the stamina reserve
 * floor and relaxes the pre-fight top-up. A human spends the pool freely when
 * the run is going well and hoards it when it isn't, judged off:
 *   • KILL POWER (half the score): the better of (a) how much of the average
 *     LOCAL health bar one blow of the held weapon strips
 *     ({@link BRAVE_BLOW_BAR_FRAC}) and (b) how many bars per second he has
 *     ACTUALLY shredded over the last minute ({@link BRAVE_BARS_PER_SEC},
 *     off the {@link trackBravery} trail) — so a proven massacre reads brave
 *     even on a modest weapon, and a fresh monster of a weapon reads brave
 *     before its first swing. An empty field reads fully brave (nothing to
 *     fear).
 *   • SUPPLIES (the other half): medkits, stamina potions, and banked
 *     powerup value — the deeper the pockets, the deeper the pool can dip,
 *     since a mistake can be paid for.
 * Pure (state + the bot's own trail), so determinism holds.
 */
function braveryScore(bot: Bot, state: GameState): number {
  const player = state.player;
  let barSum = 0;
  let barN = 0;
  for (const enemy of state.enemies) {
    if (enemyDef(enemy.defId).apparition) continue;
    barSum += enemy.maxHp;
    barN++;
  }
  const meanBar = barN > 0 ? barSum / barN : 0;
  let killPower = 1; // an empty field — nothing to fear
  if (meanBar > 0) {
    const blow = weaponDamageFor(state, player.equipment.weapon);
    const blowPower = clamp(blow / (meanBar * BRAVE_BLOW_BAR_FRAC), 0, 1);
    let recentPower = 0;
    const samples = bot.bravery?.samples ?? [];
    const first = samples[0];
    const last = samples[samples.length - 1];
    if (first && last && last.t - first.t >= 5_000) {
      const dps = (last.dmg - first.dmg) / ((last.t - first.t) / 1000);
      recentPower = clamp(dps / (meanBar * BRAVE_BARS_PER_SEC), 0, 1);
    }
    killPower = Math.max(blowPower, recentPower);
  }
  const medkits = player.medkits.reduce((sum, n) => sum + n, 0);
  // A DINGING golden arrow in the local ring is a banked full heal (the
  // level-up restores hp and stamina — see Bot.arrowXp): with one close by
  // the hero can afford to fight braver, so it credits the safety net like a
  // couple of pocketed kits.
  const arrowHeals = dingArrowNearby(bot, state, THREAT_RADIUS) ? 2 : 0;
  const powerupValue = player.heldAbilities.reduce(
    (sum, id) => sum + abilityValue(id),
    0,
  );
  return clamp(
    0.5 * killPower +
      0.2 * Math.min(1, (medkits + arrowHeals) / BRAVE_MEDKITS) +
      0.15 * Math.min(1, player.staminaPotions / BRAVE_STAMINA_POTS) +
      0.15 * Math.min(1, powerupValue / BRAVE_POWERUP_VALUE),
    0,
    1,
  );
}

/** The bravery-slid stamina reserve floor: the timid `walkStaminaFrac` at
 * bravery 0, `walkBraveFloorFrac` at bravery 1. */
function reserveFloorFrac(bot: Bot, state: GameState, tune: BotTuning): number {
  const bravery = braveryScore(bot, state);
  return (
    tune.walkBraveFloorFrac +
    (tune.walkStaminaFrac - tune.walkBraveFloorFrac) * (1 - bravery)
  );
}

/** The three survival POSTURES — the playstyle axis `survive()` reads. Their
 * per-row tuning (standoffMul/fleeHp/surround/edgeDrift) lives in the resolved
 * {@link BotTuning} `postures` table (bot-tuning.ts + bot.yaml), so a level can
 * bend a posture the same way it bends any other knob. `balanced` reproduces
 * the classic survivor exactly. */
type Posture = "aggro" | "balanced" | "flee";

const idleInput = (): GameInput => ({
  steering: false,
  target: { x: 0, y: 0 },
  jump: false,
});

/**
 * Decide this tick's input and annotate the bot with the STABLE debug thought.
 * Pure w.r.t. `state` (reads it, never mutates it); only mutates the bot's own
 * memory (`nav`/`route`/… and the thought resolver). {@link decideAct} settles
 * the raw per-tick branch label into `bot.lastThought`; the resolver then folds
 * it — over a short window — into the overarching thought BOT VIEW draws, so a
 * hero strafing a pack's edge reads as one "SKIRMISH" instead of flickering
 * between "KITE" and "GIVE GROUND", and a reflex (a dodge, a bail) preempts.
 */
export function botAct(bot: Bot, state: GameState): GameInput {
  const input = decideAct(bot, state);
  bot.thoughts ??= createThoughtMemory();
  bot.lastThought = resolveThought(
    bot.thoughts,
    bot.lastThought ?? "IDLE",
    state.stats.timeMs,
  );
  return input;
}

/** Decide this tick's input, recording the raw branch label via {@link think}.
 * The resolver-facing half of {@link botAct}. */
function decideAct(bot: Bot, state: GameState): GameInput {
  if (bot.strategy === "idle") {
    think(bot, "IDLE");
    return idleInput();
  }
  // The effective positioning knobs for this level (bot.yaml overrides resolved
  // over the shipped defaults) — resolved once per tick and threaded into every
  // branch below. Pure, so determinism holds.
  const tune = botTuningFor(state.level.id);
  // A clear field: nothing to fight, so the loop below would just idle — but a
  // sand storm (mars) or a falling meteor (the moon/rift) can still catch him
  // unopposed, and idling into a knockout or a blast is the worst place to be
  // caught. Sidestep those first; else stand easy.
  if (state.enemies.length === 0) {
    // A stampede trample (a hop clears it), a falling meteor, or a sand storm
    // can all catch an idle hero on a clear field — a knockdown/blast alone is
    // the worst way to be caught, so hop the herd / dodge the rock / sidestep
    // the gust before standing easy.
    const herdHop = dodgeStampede(state, tune);
    if (herdHop) {
      think(bot, "HERD");
      return herdHop;
    }
    const rockDodge = dodgeAsteroid(state);
    if (rockDodge) {
      think(bot, "METEOR");
      return rockDodge;
    }
    const stormDodge = dodgeSandstorm(state, tune);
    if (stormDodge) {
      think(bot, "STORM");
      return stormDodge;
    }
    think(bot, "IDLE");
    return idleInput();
  }
  // Gauge headway toward the committed content target once per tick, so a cache
  // the sweep can't reach gets abandoned rather than deadlocking the run.
  trackContentAbandon(bot, state);
  // Gauge map-coverage headway too, so a bogged run that can't reach boss-level
  // parity gives up exploring and commits to the boss instead of looping on fog.
  trackExploreStall(bot, state);
  // Track when the hero last had a real fight on his hands, and latch the
  // ANTI-LOITER hunt once he's idled past the knob — so a lull turns into a
  // march on the nearest enemy, never into pottering about (see seekTarget).
  trackEngagement(bot, state, tune);
  // Consume an arrived-at GPS nudge (see Bot.waypoint).
  trackWaypoint(bot, state);
  // Learn what a GOLDEN ARROW pays from this tick's collection events (the
  // 5%-increment memory the strategic-arrow reads consult — see Bot.arrowXp).
  trackArrowXp(bot, state);
  const decided = ((): GameInput => {
    // With only untouchable apparitions left on the board there is no foe
    // to fight — push for the objective instead of chasing a hallucination.
    const foe = nearestEnemy(state);
    // HOP an incoming employee stampede FIRST — before every strategy branch,
    // even while disarmed: a herd charges fast and a jump sails clean over the
    // whole wall, and a ~20% bite + a 2-second knockdown is the worst thing to
    // eat mid-arm-up. A reflex that preempts even the opening-strike approach.
    const herdHopReflex = dodgeStampede(state, tune);
    if (herdHopReflex) {
      think(bot, "HERD");
      return herdHopReflex;
    }
    // DISARMED (the scripted opening strike hasn't put the weapon in his hand
    // yet): the blade is drawn by a scripted VANGUARD rushing him (story.ts
    // `stepOpeningStrike`), and while holstered the hero takes NO contact damage
    // (mechanics.ts pre-combat grace). So the right play is a SCRIPTED-SEQUENCE
    // read: close to a standoff short of the nearest foe — inside the level's
    // first-sight trigger range (which gates the strike), outside the swarm —
    // then STAND HIS GROUND and let the rusher come the last step and arm him.
    // He must NOT kite it: the vanguard only barely outruns his walk, so backing
    // off drags the whole pack across the floor for ~7s (he retreats into the
    // far wall) before the touch ever lands — and holding position lets the pack
    // close, which trips the sight gate SOONER. Path-marching off toward the
    // objective would strand him unarmed for the whole run.
    if (state.player.disarmed) {
      think(bot, "ARM UP");
      if (!foe) return idleInput();
      // Outside the standoff → close in (trip the sight beat, draw the rusher
      // into contact). At or inside it → plant and take the harmless scripted
      // hit rather than retreating the pack across the map.
      return distance(state.player.pos, foe.pos) > tune.armApproachStandoff
        ? steer(state, foe.pos)
        : idleInput();
    }
    // LAST-RESORT UNSTUCK: if he's made no progress for a while and has nothing
    // he can reach to fight, the strategy has wedged him — override it with the
    // deterministic escape sweep until he's moving again. (Also keeps the
    // progress bookkeeping, so it must run before every strategy branch.)
    const escape = unstuckInput(bot, state, tune);
    if (escape) {
      think(bot, "UNSTICK");
      return escape;
    }
    // Dodge a telegraphed set-piece move (a rushing charge, a ground slam) the
    // instant one threatens — stepping off the line beats whatever the strategy
    // below would do, so the hero doesn't eat a boss's rush while planted on it.
    const dodge = dodgeTelegraph(state);
    if (dodge) {
      think(bot, "DODGE");
      return dodge;
    }
    // Clear a falling meteor's impact mark before it detonates on him
    // (`state.asteroids`). Reading the telegraph and walking off the blast is
    // pure survival — it outranks the fight and the hay-ball sidestep, right
    // beside the set-piece dodge.
    const rock = dodgeAsteroid(state);
    if (rock) {
      think(bot, "METEOR");
      return rock;
    }
    // Step out of a rolling hay ball's lane before it shoves him back down the
    // street (Eastworld's `state.hayBalls`). A quick sidestep, like a human
    // giving a rolling bale room — below the boss-move dodge, above the fight.
    const hay = dodgeHayBall(state, tune);
    if (hay) {
      think(bot, "HAY");
      return hay;
    }
    // Sidestep an incoming sand storm (mars) before it sweeps over him — a
    // knockout in the horde is deadlier than most single hits, so getting off
    // its line preempts the strategy below.
    const stormDodge = dodgeSandstorm(state, tune);
    if (stormDodge) {
      think(bot, "STORM");
      return stormDodge;
    }
    switch (bot.strategy) {
      case "rush":
        think(bot, foe ? "RUSH" : "RUSH BOSS");
        return foe ? steer(state, foe.pos) : pushBoss(bot, state, tune);
      case "kite": {
        if (!foe) {
          think(bot, "PUSH BOSS");
          return pushBoss(bot, state, tune);
        }
        // Hold inside weapon range, outside the pack's grasp. A lone chaser is
        // back-pedalled straight (holdOff) — circling one that out-runs you only
        // lets it cut the chord; the orbit is for a boss/set-piece the hero is
        // committed to DPSing (pushBoss / the survive boss-lock).
        think(bot, "KITE");
        const reach = weaponRangeFor(state, state.player.equipment.weapon);
        return steer(state, holdOff(state, foe.pos, reach * 0.7));
      }
      case "boss":
        think(bot, "TO BOSS");
        return pushBoss(bot, state, tune);
      case "aggro":
        return survive(bot, state, "aggro", tune);
      case "flee":
        return survive(bot, state, "flee", tune);
      case "survivor":
      case "balanced":
        return survive(bot, state, "balanced", tune);
      default:
        think(bot, "IDLE");
        return idleInput();
    }
  })();
  const player = state.player;
  // RESERVE-FLOOR PACING — a post-decision pace modifier (like the aim/
  // consumable tweaks below; the branch's thought label stands). In the open
  // the bot spends the pool FREELY — sprint is cheap ground covered — but the
  // pool dipping to the reserve floor latches the RECOVERY WALK
  // (`bot.recovering`): the engine's walk pace regains stamina on the move,
  // and the walk holds until the pool climbs a full band clear of the floor
  // so the pace never flaps. The floor itself SLIDES with BRAVERY
  // ({@link braveryScore}): a naked rookie paces at the timid
  // `walkStaminaFrac`, a kitted shredder dips to `walkBraveFloorFrac`.
  // Arriving at fights RESTED is the pre-fight top-up's job
  // (topUpBeforeFight), not this floor's. A foe already really close
  // overrides the throttle (spend what's left outrunning the body about to
  // bite), and so does a hop the pool can still PAY for (hops are
  // emergencies; below the takeoff cost the engine refuses the jump anyway).
  trackBravery(bot, state);
  if (tune.walkStaminaFrac > 0) {
    const floor = reserveFloorFrac(bot, state, tune);
    const band = Math.max(0, tune.walkResumeFrac - tune.walkStaminaFrac);
    const resumeFrac = Math.min(1, floor + band);
    if (player.stamina <= player.maxStamina * floor) {
      bot.recovering = true;
    } else if (player.stamina >= player.maxStamina * resumeFrac) {
      bot.recovering = false;
    }
    // The WINDED STAND latches at a BONE-DRY pool and releases at the reserve
    // floor — where the recovery walk is already latched, so the phases chain
    // stand → walk → run as the pool climbs.
    if (player.stamina <= 0) {
      bot.winded = true;
    } else if (player.stamina >= player.maxStamina * floor) {
      bot.winded = false;
    }
  } else {
    bot.recovering = false;
    bot.winded = false;
  }
  const affordableHop =
    decided.jump && player.stamina >= STAMINA.jumpCost * player.maxStamina;
  // Book the takeoff for the discretionary-hop cooldown (`hopCooldownMs`): any
  // grounded, payable jump request — reflex dodges included — restarts the
  // clock, so hops stay spaced out no matter which branch asked for one.
  if (affordableHop && player.z === 0) bot.lastHopMs = state.stats.timeMs;
  if (decided.steering && !affordableHop) {
    const foe = nearestEnemy(state);
    if (!foe || distance(player.pos, foe.pos) > tune.walkThreatDist) {
      if (bot.winded) {
        // CATCH BREATH — the pool ran bone-dry, so with nothing inside the
        // walk-threat ring he STOPS and breathes. Standing is the only pace
        // that both runs down the empty-pool regen lockout
        // (`STAMINA.emptyRegenLockMs`, the "stand for two seconds") and then
        // refills at the full breather rate; pushing on at full throttle
        // re-arms the lockout every frame and jogs at half speed forever,
        // and even the recovery walk crawls at a quarter speed while the
        // empty pool caps him. Overrides the branch's thought — a parked
        // hero with no label reads as a wedge in BOT VIEW.
        think(bot, "CATCH BREATH");
        decided.steering = false;
        decided.target = { x: player.pos.x, y: player.pos.y };
        decided.jump = false;
        // Deliberate stand — clear the unstuck stall gauge (and the sim's
        // wedge read) the same way the pre-fight BREATHER does.
        if (bot.nav) {
          bot.nav.stuckMs = 0;
          bot.nav.lastPos = { x: player.pos.x, y: player.pos.y };
          bot.nav.lastTimeMs = state.stats.timeMs;
        }
      } else if (bot.recovering) {
        decided.throttle = STAMINA.walkThrottle;
      }
    }
  }
  // STRATEGIC AIM: point the auto-weapon at the foe worth hitting, not merely
  // the nearest — the cluster a cone/spread/pierce covers best, or the wounded
  // body a single shot finishes (see {@link bestAimTarget}). The engine's
  // targeting reads `aim` exactly like a desktop mouse, so the bot steers its
  // fire the way a human does. Left unset with nothing worth diverting to,
  // which keeps the plain nearest-foe pick.
  if (!player.disarmed) {
    const aim = bestAimTarget(state);
    if (aim) decided.aim = aim;
  }
  // POWERUPS, played by VALUE — one dock action per tick, in priority order:
  //   1. the SPEND whose moment is now ({@link pickPowerupMoment}: the nuke
  //      into a flood, a combat power into a fight, the stasis when cornered,
  //      the magnet over a spill);
  //   2. a DROP that instantly makes room for a better find on the ground
  //      ({@link powerupDropForUpgrade} — beats a burn, whose slot only frees
  //      when the power lapses);
  //   3. a shelf-space BURN that keeps a slot cycling free
  //      ({@link pickPowerupBurn});
  //   4. one SORT step walking the dock into the bot's own priority order
  //      ({@link powerupSortMove}) — so the row on screen reads exactly how
  //      the bot ranks what it carries.
  const moment = pickPowerupMoment(state);
  const drop = moment < 0 ? powerupDropForUpgrade(state) : -1;
  const burn = moment < 0 && drop < 0 ? pickPowerupBurn(state) : -1;
  const spend = moment >= 0 ? moment : burn;
  if (spend >= 0) {
    decided.useItem = true;
    decided.useItemIndex = spend;
  } else if (drop >= 0) {
    decided.dropItemIndex = drop;
  } else {
    const move = powerupSortMove(state);
    if (move) decided.moveItem = move;
  }
  // Heal below the threshold (biggest-heal-first — consumeMedkit no-ops at full
  // so a mistap is free). Refill stamina ONLY with a threat near and the pool
  // low/empty — a winded hero is capped to a jog and gets run down. On a quiet
  // march the potion stays corked: the jog cap is merely slow, and standing
  // still refills the pool for free — supplies are for fights, not travel.
  //
  // SAVE THE MEDKIT when a DING is in reach: a golden arrow that would level
  // him up is a free FULL HEAL (grantXp tops hp and stamina off on the ding),
  // so with one lying close by — by the bot's LEARNED read of what an arrow
  // pays (Bot.arrowXp) — the kit stays pocketed and the arrow is the heal.
  // Only above the emergency floor: nearly dead, he pops the kit rather than
  // gamble the last of the bar on reaching the arrow.
  const dingHeal =
    player.hp >= player.maxHp * ARROW_MEDKIT_HOLD_HP_FRAC &&
    dingArrowNearby(bot, state, ARROW_SAVE_REACH) !== undefined;
  decided.useMedkit =
    player.hp < player.maxHp * HEAL_HP_FRAC &&
    bestMedkitTier(state) >= 0 &&
    !dingHeal;
  const threatNear = threatsWithin(state, THREAT_RADIUS).length > 0;
  decided.useStaminaPotion =
    player.staminaPotions > 0 &&
    threatNear &&
    player.stamina < player.maxStamina * STAMINA_TOPUP_FRAC;
  // Spend a repair kit once a weapon has actually broken out of the hand (a
  // durability-0 spare sits in the bag) or the held blade is nearly spent — it
  // mends the whole kit and restores the shed weapon (useRepairKit no-ops with
  // nothing to mend, so a mistap is free).
  decided.useRepairKit = player.repairKits > 0 && needsRepair(state);
  // PASS-OVER TOP-OFF: a stack at its cap turns the ground pickup away, so
  // walking over one with full pockets normally wastes it. When the bar that
  // kind feeds has real room — hp down for a medkit, the sprint pool down for
  // a drink, wear anywhere in the loadout for a repair kit — the bot spends
  // ONE from the full stack as he passes (or as a running MAGNET reels the
  // item in), and the now-bankable pickup refills the stack: a free bar
  // top-up. Deliberately LOW priority: it never steers (the item must already
  // be underfoot / inside the pull), and the `topOffCooldownMs` cooldown keeps
  // a kit-littered field from turning the march into a top-off crawl —
  // clearing the level always comes first.
  const topOffReady =
    tune.topOffCooldownMs > 0 &&
    (bot.lastTopOffMs === undefined ||
      state.stats.timeMs - bot.lastTopOffMs >= tune.topOffCooldownMs);
  if (topOffReady) {
    const reach = topOffReach(state);
    for (const item of state.items) {
      if (item.deliverMs !== undefined && item.deliverMs > 0) continue;
      if (distance(item.pos, player.pos) > reach) continue;
      let fired = false;
      if (item.kind === "medkit") {
        // Only when the ground kit's OWN stack is full and it is the tier the
        // spend would draw from (consumeMedkit spends best-quality first) —
        // so the freed slot is exactly the one the pickup refills.
        const tier = medkitTierIndex(item.tier);
        fired =
          (player.medkits[tier] ?? 0) >= CONSUMABLES.stackCap &&
          tier === bestMedkitTier(state) &&
          player.hp < player.maxHp * TOP_OFF_HP_FRAC;
        if (fired) decided.useMedkit = true;
      } else if (item.kind === "drink") {
        fired =
          player.staminaPotions >= CONSUMABLES.stackCap &&
          player.stamina < player.maxStamina * TOP_OFF_STAMINA_FRAC;
        if (fired) decided.useStaminaPotion = true;
      } else if (item.kind === "repair") {
        fired = player.repairKits >= CONSUMABLES.stackCap && hasWear(state);
        if (fired) decided.useRepairKit = true;
      }
      if (fired) {
        bot.lastTopOffMs = state.stats.timeMs;
        break;
      }
    }
  }
  // CLASS play: drink a mana potion when the pool runs low, and fire the best
  // castable power at the fight — a heal when hurt, an AOE into a crowd, a bolt
  // at a lone foe, a buff under pressure, a ward/slow to control. Only a hero
  // with a CLASS (a dominant STR/DEX/INT that unlocks a spell list) casts. The
  // spell bar is filled by the harness/app; the bot reads it and stays pure
  // (input only, no state mutation).
  if (heroSpellStat(state) !== null) {
    decided.useManaPotion =
      player.manaPotions > 0 && player.mana < player.maxMana * MANA_TOPUP_FRAC;
    const slot = pickSpellToCast(state, threatNear);
    if (slot >= 0) {
      decided.castSpell = true;
      decided.castSpellIndex = slot;
    }
  }
  return decided;
}

/** Drink a mana potion once the pool dips below this fraction of its max. */
const MANA_TOPUP_FRAC = 0.25;

/**
 * The spell-bar slot the bot should cast this tick, or -1 for none. Scores each
 * castable slot (unlocked, off cooldown, affordable) by how well its school
 * fits the moment — a heal when hurt outranks everything, then an AOE into a
 * packed crowd, then a lone-target bolt, then a defensive ward/slow under
 * pressure — and returns the best. Pure: reads state only.
 */
function pickSpellToCast(state: GameState, threatNear: boolean): number {
  const p = state.player;
  const hurt = p.hp < p.maxHp * HEAL_HP_FRAC;
  const buffed = p.buffMs > 0;
  let best = -1;
  let bestScore = 0;
  for (let i = 0; i < p.spellSlots.length; i++) {
    const id = p.spellSlots[i];
    if (!id) continue;
    const def = spellDef(id);
    if (!isSpellAvailable(state, def)) continue;
    if ((p.spellCooldowns[id] ?? 0) > 0) continue;
    if (p.mana < def.manaCost) continue;
    const e = def.effect;
    // Only cast where the power would actually connect — an attack bolt needs a
    // foe in RANGE, an AOE/rain/slow needs a crowd in reach — so the bot never
    // spams a whiffing cast (a wasted nova, a targetless fizzle).
    let score = 0;
    if (e.kind === "heal") score = hurt ? 5 : 0;
    else if (e.kind === "nova") {
      const n = foesWithin(state, e.radius);
      score = n >= 2 ? 4 : n >= 1 ? 2 : 0;
    } else if (e.kind === "rain") {
      const n = foesWithin(state, e.castRange);
      score = n >= 2 ? 4 : n >= 1 ? 2 : 0;
    } else if (e.kind === "bolt")
      score = foesWithin(state, e.range) >= 1 ? 3 : 0;
    else if (e.kind === "slow")
      score = foesWithin(state, e.radius) >= 3 ? 3 : 0;
    else if (e.kind === "shield") score = hurt || threatNear ? 2 : 0;
    // A self-buff: pop it when there's a fight on and one isn't already running,
    // so the amp isn't wasted on an empty field or double-cast.
    else if (e.kind === "buff")
      score = !buffed && foesWithin(state, 260) >= 1 ? 3 : 0;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

/** Count of live, targetable foes within `radius` of the hero (bot heuristics). */
function foesWithin(state: GameState, radius: number): number {
  let n = 0;
  for (const enemy of state.enemies) {
    if (enemyDef(enemy.defId).apparition) continue;
    if (distance(state.player.pos, enemy.pos) <= radius) n++;
  }
  return n;
}

/** Is a NUKE banked in the powerup dock? With one in his pocket the bot can
 * afford to be DARING: it keeps kiting forward and skips the escape-route
 * guard — worst case, the button clears the screen. Pure. */
function hasNukeBanked(state: GameState): boolean {
  return state.player.heldAbilities.some(
    (id) => abilityDef(id).kind === "nuke",
  );
}

/**
 * The BANKED dock slots — not running, not blocked by a running copy of a
 * non-stackable power (the engine would refuse the spend and waste the edge)
 * — most precious first ({@link abilityValue}): the moment pass hands the
 * crowd to the best power, the burn pass walks the list backwards for the
 * cheapest.
 */
function bankedPowerups(
  state: GameState,
): { defId: string; slot: number; def: AbilityDef }[] {
  const player = state.player;
  return player.heldAbilities
    .map((defId, slot) => ({ defId, slot, def: abilityDef(defId) }))
    .filter(({ slot }) => !isSlotActive(state, slot))
    .filter(
      ({ def, defId }) =>
        def.stackable || !player.abilities.some((a) => a.defId === defId),
    )
    .sort((a, b) => abilityValue(b.defId) - abilityValue(a.defId));
}

/**
 * The dock slot whose MOMENT is now — the spend worth making this tick, or -1.
 * The bot knows the whole catalog by VALUE ({@link abilityValue}: nuke >
 * storm > orbit > stasis > magnet) and times each power for what it's worth:
 * the NUKE only into an OVERWHELMING flood (`NUKE_PACK` foes inside the blast
 * itself), a combat power on a decent fight (`POWERUP_FIGHT_PACK`), the
 * STASIS when he's CORNERED — too winded to run, bleeding under half, a pack
 * hunting him (`STASIS_HUNT_PACK`) — and the MAGNET the moment a lootable
 * spill sits inside its pull. Checked best-first, so a flood eats the nuke,
 * never the stasis. Pure (state only), so determinism holds.
 */
function pickPowerupMoment(state: GameState): number {
  const player = state.player;
  const banked = bankedPowerups(state);
  if (banked.length === 0) return -1;
  const packedClose = threatsWithin(state, SURROUND_RADIUS).length;
  // CORNERED — the stasis moment: too winded to outrun the hunt, bleeding
  // under half, and a real pack on his heels inside the threat ring.
  const cornered =
    player.stamina < player.maxStamina * STAMINA_TOPUP_FRAC &&
    player.hp < player.maxHp * STASIS_HP_FRAC &&
    threatsWithin(state, THREAT_RADIUS).length >= STASIS_HUNT_PACK;
  for (const { def, slot } of banked) {
    switch (def.kind) {
      case "nuke":
        // Counted inside the blast itself, so "overwhelming" means what the
        // wipe would actually erase — not a wide tail of distant stragglers.
        if (foesWithin(state, def.nuke?.radius ?? SURROUND_RADIUS) >= NUKE_PACK)
          return slot;
        break;
      case "storm":
      case "orbit":
        if (packedClose >= POWERUP_FIGHT_PACK) return slot;
        break;
      case "stasis":
        if (cornered) return slot;
        break;
      case "magnet":
        if (magnetLootClose(state, def)) return slot;
        break;
    }
  }
  return -1;
}

/**
 * The dock slot worth BURNING for shelf space this tick, or -1 — the pressure
 * valve that keeps a slot cycling free for the next strong pickup. The MAGNET
 * (pure convenience) burns as soon as the dock is down to its last open slot;
 * with the dock FULL the cheapest banked power burns too — the STASIS freely
 * (low value, and a fresh drop can re-stock the escape), a combat power only
 * with a foe near enough to actually hit. The NUKE is never burned for shelf
 * space: it's the emergency button (and the DARING read, {@link
 * hasNukeBanked}). Runs AFTER {@link powerupDropForUpgrade} in the decision
 * chain — an instant drop beats a burn whose slot only frees when the power
 * lapses. Pure.
 */
function pickPowerupBurn(state: GameState): number {
  const banked = bankedPowerups(state);
  if (banked.length === 0) return -1;
  const openSlots = HELD_ITEMS.cap - state.player.heldAbilities.length;
  const anyFoeNear = threatsWithin(state, THREAT_RADIUS).length > 0;
  for (let i = banked.length - 1; i >= 0; i--) {
    const { def, slot } = banked[i]!;
    if (def.kind === "nuke") continue; // never burn the wipe for shelf space
    if (def.kind === "magnet" && openSlots <= 1) return slot;
    if (openSlots <= 0) {
      if (def.kind === "magnet" || def.kind === "stasis") return slot;
      if (anyFoeNear) return slot;
    }
  }
  return -1;
}

/** Enough ground drops inside the magnet's pull to be worth popping it —
 * counts what the field would actually reel in (a mercy drop still riding its
 * angel down is out of the magnet's reach, see stepAbilities). */
function magnetLootClose(state: GameState, def: AbilityDef): boolean {
  const reach = magnetRadius(state, def);
  let count = 0;
  for (const item of state.items) {
    if (item.deliverMs !== undefined && item.deliverMs > 0) continue;
    if (distance(state.player.pos, item.pos) > reach) continue;
    count++;
    if (count >= MAGNET_LOOT_MIN) return true;
  }
  return false;
}

/**
 * The single dock reorder (`GameInput.moveItem`) that walks the powerup row
 * one step closer to the bot's own priority order — best first ({@link
 * abilityValue}, ties keeping their current order) — or null once sorted. The
 * bot issues one move per tick until the dock reads as its ranking, so a
 * viewer can literally see how it values what it carries (the nuke parked at
 * the head of the row, the magnet at the tail). Running slots shuffle along
 * with their countdowns (`moveHeldSlot` keeps the links). Pure.
 */
function powerupSortMove(
  state: GameState,
): { from: number; to: number } | null {
  const held = state.player.heldAbilities;
  if (held.length < 2) return null;
  const order = held
    .map((defId, i) => ({ i, v: abilityValue(defId) }))
    .sort((a, b) => b.v - a.v || a.i - b.i);
  for (let to = 0; to < order.length; to++) {
    const from = order[to]!.i;
    if (from !== to) return { from, to };
  }
  return null;
}

/**
 * The dock slot to DROP (`GameInput.dropItemIndex`) so a better powerup lying
 * on the ground can be picked up — or -1 to keep the shelf. Only fires with
 * the dock FULL and a grabbable ability item within {@link ITEM_REACH} (clear
 * straight sweep, not a uniqueHeld double the dock would refuse anyway). What
 * gets tossed, in order of preference:
 *   • a RUNNING (non-nuke) slot — the pickup is already spent, so freeing its
 *     shelf space costs nothing and ANY bankable find is a net gain;
 *   • else the cheapest BANKED (non-nuke) slot, and only for a ground find of
 *     strictly higher value — trading a magnet away for a nuke, never a storm
 *     for a stasis.
 * The NUKE is never tossed. Pure; the actual grab happens as the hero walks
 * over the item (nearestWantedItem already steers at ground abilities).
 */
function powerupDropForUpgrade(state: GameState): number {
  const player = state.player;
  const held = player.heldAbilities;
  if (held.length < HELD_ITEMS.cap) return -1; // room already
  // The best grabbable powerup find in reach.
  let bestGround = -1;
  for (const item of state.items) {
    if (item.kind !== "ability") continue;
    if (item.deliverMs !== undefined && item.deliverMs > 0) continue;
    if (abilityDef(item.defId).uniqueHeld && held.includes(item.defId)) {
      continue; // a second nuke can't bank no matter what's dropped
    }
    if (distance(player.pos, item.pos) > ITEM_REACH) continue;
    if (blockedByObstacle(state, player.pos, item.pos, PLAYER.radius)) {
      continue;
    }
    bestGround = Math.max(bestGround, abilityValue(item.defId));
  }
  if (bestGround < 0) return -1;
  // The slot to toss: a spent (running) one for free, else the cheapest
  // banked one — never the nuke.
  let drop = -1;
  let dropValue = Infinity;
  let dropRunning = false;
  for (let i = 0; i < held.length; i++) {
    const defId = held[i]!;
    if (abilityDef(defId).kind === "nuke") continue;
    const running = isSlotActive(state, i);
    const value = abilityValue(defId);
    const better =
      running !== dropRunning ? running : value < dropValue || drop < 0;
    if (better) {
      drop = i;
      dropValue = value;
      dropRunning = running;
    }
  }
  if (drop < 0) return -1;
  return dropRunning || bestGround > dropValue ? drop : -1;
}

/** Nearest-foe distance under which the bot stops picking clever aim targets
 * and shoots the body about to bite it — killing the immediate threat IS the
 * most damage that matters. */
const AIM_PANIC_RANGE = 90;

/** Half-angle (radians) used to judge how many bodies a PIERCING/CHAINING
 * round's line threads — a narrow corridor read on the same cone math. */
const AIM_LINE_HALF_ANGLE = 0.18;

/**
 * The world point the auto-weapon should be AIMED at this tick — the target
 * that turns the swing/volley into the most damage — or undefined to keep the
 * engine's plain nearest-foe pick. The engine reads `GameInput.aim` exactly
 * like a desktop mouse bearing (`nearestEnemy`'s alignment bias), so pointing
 * it at a foe makes the weapon fight THROUGH that foe:
 *   • A CONE/SPREAD weapon (melee sweep, shotgun fan) aims at the foe whose
 *     direction covers the most bodies inside the arc — the densest cluster.
 *   • A PIERCING/CHAINING round aims down the line that threads the most foes.
 *   • A plain single shot finishes the most WOUNDED foe in range (thinning the
 *     pack beats poking the freshest body), tie-broken nearest.
 * A body already at biting range preempts all of it — the immediate threat is
 * shot first. Candidates need line of sight, so a cluster behind a wall never
 * wins over a hittable foe. Pure (state only), so determinism holds.
 */
function bestAimTarget(state: GameState): Vec2 | undefined {
  const player = state.player;
  const equipped = player.equipment.weapon;
  const range = weaponRangeFor(state, equipped);
  // Candidates: live, targetable, in range, in sight — the foes a swing or a
  // shot could actually reach this tick.
  const foes: { enemy: Enemy; d: number }[] = [];
  for (const enemy of state.enemies) {
    if (enemyDef(enemy.defId).apparition) continue;
    const d = distance(player.pos, enemy.pos);
    if (d > range) continue;
    if (!lineOfSight(state, player.pos, enemy.pos)) continue;
    foes.push({ enemy, d });
  }
  if (foes.length === 0) return undefined;
  foes.sort((a, b) => a.d - b.d);
  const nearest = foes[0]!;
  // A body about to bite is the target, full stop.
  if (nearest.d < AIM_PANIC_RANGE) {
    return { x: nearest.enemy.pos.x, y: nearest.enemy.pos.y };
  }
  const def = weaponDef(equipped.defId);
  const spec = def.projectile;
  // The weapon's damage FOOTPRINT around its aim: a melee sweep's cone, a
  // spread volley's fan, or a piercing round's narrow corridor. 0 = a plain
  // single-target shot.
  let half = 0;
  if (!spec) half = weaponSweepHalfAngle(state, equipped);
  else if ((spec.count ?? 1) > 1 || (spec.spreadDeg ?? 0) > 0) {
    half = Math.max((((spec.spreadDeg ?? 0) / 2) * Math.PI) / 180, 0.12);
  } else if (spec.pierce !== undefined || spec.chain !== undefined) {
    half = AIM_LINE_HALF_ANGLE;
  }
  if (half > 0) {
    // Aim at the foe whose bearing catches the most bodies in the footprint —
    // capped at what INT lets a melee sweep actually cleave, so a wall of
    // twelve doesn't out-score what the blade can really bill.
    const cap = spec ? Infinity : maxMeleeTargets(state);
    const cosHalf = Math.cos(half);
    let best = nearest;
    let bestCovered = 0;
    for (const c of foes) {
      const dx = c.enemy.pos.x - player.pos.x;
      const dy = c.enemy.pos.y - player.pos.y;
      const dm = Math.hypot(dx, dy);
      if (dm < 1) return { x: c.enemy.pos.x, y: c.enemy.pos.y }; // on top of him
      const ax = dx / dm;
      const ay = dy / dm;
      let covered = 0;
      for (const o of foes) {
        const ox = o.enemy.pos.x - player.pos.x;
        const oy = o.enemy.pos.y - player.pos.y;
        const om = Math.hypot(ox, oy) || 1;
        if ((ox / om) * ax + (oy / om) * ay >= cosHalf) covered++;
      }
      covered = Math.min(covered, cap);
      // More bodies wins; a tie goes to the nearer aim (connects sooner).
      if (covered > bestCovered || (covered === bestCovered && c.d < best.d)) {
        bestCovered = covered;
        best = c;
      }
    }
    // With no multi-body line anywhere, fall through to the finisher pick.
    if (bestCovered > 1) return { x: best.enemy.pos.x, y: best.enemy.pos.y };
  }
  // Single-target (or no cluster to catch): FINISH the most wounded foe in
  // range — every body dropped is one less set of teeth — tie-broken nearest.
  let pick = nearest;
  for (const c of foes) {
    if (
      c.enemy.hp < pick.enemy.hp ||
      (c.enemy.hp === pick.enemy.hp && c.d < pick.d)
    ) {
      pick = c;
    }
  }
  return { x: pick.enemy.pos.x, y: pick.enemy.pos.y };
}

/** Below this fraction of its max durability the held weapon is "nearly spent"
 * — worth SPENDING a held repair kit before it breaks mid-fight. */
const REPAIR_DURABILITY_FRAC = 0.2;

/** Below this (looser) fraction the held weapon is "wearing thin" — worth going
 * out of the way to SCOOP a repair kit off the ground now, so one is in hand
 * before the blade actually gives out. Higher than the spend threshold so the
 * hero stocks the kit early, then spends it late (`REPAIR_DURABILITY_FRAC`). */
const REPAIR_SEEK_FRAC = 0.45;

/** Is a spent weapon (durability 0) sitting in the bag, shed there when it broke
 * out of the hand — waiting on a repair kit to wake it? */
function hasBrokenBagWeapon(state: GameState): boolean {
  return state.player.inventory.some(
    (cell) => cell !== null && isWeaponBroken(cell),
  );
}

/** The held weapon's remaining wear as a fraction of its full budget (1 = fresh,
 * 0 = about to break), or 1 for the unbreakable sidearm — the "how spent is my
 * blade" gauge the repair heuristics read. */
function weaponWearFrac(state: GameState): number {
  const weapon = state.player.equipment.weapon;
  if (weapon.durability === undefined) return 1; // unbreakable sidearm
  const max = equipmentMaxDurability(weapon);
  return max > 0 ? weapon.durability / max : 1;
}

/** Is there anything a repair kit would meaningfully mend right now — a broken
 * weapon shed into the bag, or a held weapon worn down near breaking? */
function needsRepair(state: GameState): boolean {
  if (hasBrokenBagWeapon(state)) return true;
  return weaponWearFrac(state) <= REPAIR_DURABILITY_FRAC;
}

/** Is there ANY wear a repair kit would mend — a worn or broken piece anywhere
 * in the loadout (held weapon, worn armor, bag spares)? Looser than
 * {@link needsRepair} (which waits for a weapon near breaking): this is the
 * pass-over TOP-OFF's gate, where a free refill is on the ground and even
 * light wear makes the spend worthwhile. Mirrors what `repairAll` touches. */
function hasWear(state: GameState): boolean {
  const p = state.player;
  const worn = (piece: Equipment | null): boolean => {
    if (!piece || piece.durability === undefined) return false;
    const max = equipmentMaxDurability(piece);
    return max > 0 && piece.durability < max;
  };
  if (worn(p.equipment.weapon)) return true;
  if (
    worn(p.equipment.head) ||
    worn(p.equipment.chest) ||
    worn(p.equipment.legs) ||
    worn(p.equipment.feet)
  )
    return true;
  return p.inventory.some((cell) => worn(cell));
}

/** Should the bot go pick up a repair kit? Only when it holds NONE (a kit on
 * hand is spent via {@link needsRepair}, not hoarded) AND its weapon is wearing
 * thin or a broken spare waits in the bag — the "stock a kit before the blade
 * gives out" read that makes the downgrade → repair → re-equip cycle work. */
function wantsRepairKitPickup(state: GameState): boolean {
  if (state.player.repairKits > 0) return false;
  return hasBrokenBagWeapon(state) || weaponWearFrac(state) <= REPAIR_SEEK_FRAC;
}

/** The nearest grounded REPAIR-KIT pickup, or undefined when none is on the
 * field — the detour target for {@link wantsRepairKitPickup}. */
function nearestRepairKit(state: GameState): Item | undefined {
  let best: Item | undefined;
  let bestD = Infinity;
  for (const item of state.items) {
    if (item.kind !== "repair") continue;
    const d = distance(item.pos, state.player.pos);
    if (d < bestD) {
      best = item;
      bestD = d;
    }
  }
  return best;
}

/**
 * Which stat the bot spends its next point on. The rotation each build walks —
 * the lane-biased builds and the balanced spread — lives in the shared
 * {@link BUILD_ROTATION} catalog (src/game/builds.ts), so the autopilot and the
 * analytic paper sim spend points the same way from one definition. A fixed
 * profile (`melee`/`ranged`/`magic`/`balanced`) walks that build's rotation
 * outright; `auto` walks the EMERGENT lane's rotation (see {@link botLane}); the
 * default `meta` walks the lane {@link metaLane} picks for the level the bot was
 * SPUN UP at — frozen on the bot the first time it allocates and held for the
 * run (melee early, magic from the nightmare-armored mid-game, melee at the
 * artifact cap), so the lane is chosen once at construction rather than thrashed
 * as the hero levels (spent points can't be reallocated).
 *
 * Keyed off total points already spent (not the level), so each individual
 * point rotates through the cycle rather than a whole level-up dumping into one
 * stat. Called whenever `pendingStatPoints > 0`.
 */
export function botAllocate(bot: Bot, state: GameState): StatName {
  let build: StatName[];
  if (bot.profile === "auto") {
    build = BUILD_ROTATION[botLane(state)];
  } else if (bot.profile === "meta") {
    // Freeze the lane at the level the bot first allocates at (its starting
    // level) and commit to it — see `Bot.metaLaneChoice`.
    bot.metaLaneChoice ??= metaLane(state.player.level);
    build = BUILD_ROTATION[bot.metaLaneChoice];
  } else {
    build = BUILD_ROTATION[bot.profile];
  }
  const spent = Object.values(state.player.spentStats).reduce(
    (a, b) => a + b,
    0,
  );
  return build[spent % build.length]!;
}

/**
 * The weapon class the EMERGENT (`auto`) profile has committed to: the class
 * whose REQUIRED attribute the hero has poured the most CHOSEN points into, with
 * a tie (a brand-new hero with nothing invested included) falling back to the
 * class of the weapon in hand — so the first allocations follow the difficulty's
 * starter and every one after reinforces the deepest lane. The fixed profiles
 * (`melee`/`ranged`/`magic`/`balanced`) bypass this and index
 * {@link BUILD_ROTATION} directly, so the whole build — stat allocation, and
 * through the stat-aware auto-equip the weapon itself — bends that way from
 * level 1.
 */
function botLane(state: GameState): WeaponClass {
  // Shared with the auto-equip's on-lane preference (`weaponScore`), so the
  // lane the bot spends points on and the lane its gear favours are ONE rule.
  return committedLane(state);
}

// ---- Strategy bodies -------------------------------------------------------

/**
 * Beeline for the boss (or his landmark), then hold at the equipped weapon's
 * reach and fight him from there. Deriving the hold distance from the weapon
 * (rather than a fixed 180) is what lets a MELEE loadout — the default crude
 * sword included — actually close to swinging range instead of kiting a boss
 * it can never touch; a ranged loadout still keeps its distance.
 */
function pushBoss(bot: Bot, state: GameState, tune: BotTuning): GameInput {
  const boss = state.enemies.find((e) => enemyDef(e.defId).role === "boss");
  const target = boss?.pos ?? furthestLandmark(state);
  if (!target) {
    think(bot, "IDLE");
    return idleInput();
  }
  const d = distance(state.player.pos, target);
  const hold = weaponRangeFor(state, state.player.equipment.weapon) * 0.7;
  // Far from the boss → follow a global A* route to him, so the runner rounds
  // every wall on the way instead of beelining through them. Close enough →
  // circle-strafe at weapon range and fight (a moving orbit slips his fire).
  if (d > hold + 60) {
    think(bot, "APPROACH BOSS");
    return routeSteer(bot, state, target);
  }
  think(bot, "FIGHT BOSS");
  return steer(state, orbitHold(bot, state, target, hold, tune.orbitStep));
}

/**
 * PRE-FIGHT TOP-UP — engage a spotted pack RESTED. Fires on a clear fight
 * ring (no foe inside THREAT_RADIUS) when the nearest foe sits within
 * `topUpSpotDist` and the pool is below the rested bar — 100% for a timid
 * rookie, easing to ~70% at full BRAVERY ({@link braveryScore}): the sprint
 * pool is FIGHT fuel, so the approach is where it gets refilled, not the
 * brawl. The "where do we meet" arithmetic picks the pace:
 *   • WALK AT THEM when the walk-pace regen still refills the pool before
 *     contact (deficit ÷ walk regen vs distance ÷ (their speed + his walk)) —
 *     ground covered AND breath caught.
 *   • Otherwise PLANT ("BREATHER"): standing still regens twice as fast AND
 *     makes the pack cover the whole gap itself, so the pool races their
 *     approach with the best possible odds. A deliberate stand, not a wedge —
 *     the unstuck stall gauge is reset while it holds.
 * Returns null when there's nothing spotted, the pool is already full, or the
 * knob is off — the macro march then proceeds at its open-field pace. Pure
 * aside from the bot's own nav-gauge reset.
 */
function topUpBeforeFight(
  bot: Bot,
  state: GameState,
  tune: BotTuning,
): GameInput | null {
  if (tune.topUpSpotDist <= 0) return null;
  const player = state.player;
  // The rested bar slides with BRAVERY: a timid rookie tops to 100% before
  // engaging, a kitted shredder settles for ~70% (TOPUP_BRAVE_MIN_FRAC) —
  // idling for the last drops before an easy fight is its own waste.
  const target =
    player.maxStamina *
    (1 - (1 - TOPUP_BRAVE_MIN_FRAC) * braveryScore(bot, state));
  if (player.stamina >= target) return null; // rested — engage
  const foe = nearestEnemy(state);
  if (!foe) return null;
  const d = distance(player.pos, foe.pos);
  if (d > tune.topUpSpotDist) return null; // nothing spotted — open field
  const staminaStat = effectiveStat(state, "stamina");
  const regen = STAMINA.regenPerSec * (1 + staminaStat * STAMINA.regenPerPoint);
  const walkRefillS =
    (target - player.stamina) / (regen * STAMINA.walkRegenFactor);
  // Closing speed if he walks at them: their pace plus his walk. An
  // approximation off the base player speed is plenty — the read only has to
  // land on the right side of walk-vs-plant, not predict the frame of contact.
  const walkSpeed = PLAYER.speed * STAMINA.walkThrottle;
  const walkContactS = d / Math.max(1, foe.speed + walkSpeed);
  if (walkRefillS <= walkContactS) {
    // The walk refills in time — keep marching, at the breather pace.
    const input = macroSteer(bot, state, tune);
    input.throttle = STAMINA.walkThrottle;
    return input;
  }
  // Walking won't make it: plant and let them cover the ground while the
  // faster standstill regen races their approach. Deliberate — clear the
  // unstuck stall gauge so a long breather never reads as a wedge.
  if (bot.nav) {
    bot.nav.stuckMs = 0;
    bot.nav.lastPos = { x: player.pos.x, y: player.pos.y };
    bot.nav.lastTimeMs = state.stats.timeMs;
  }
  think(bot, "BREATHER");
  return {
    steering: false,
    target: { x: player.pos.x, y: player.pos.y },
    jump: false,
  };
}

/**
 * Competent horde survival — the read the JESUS floors actually need. In
 * priority order:
 *   1. Nothing near → scoop a nearby pickup, else push the objective.
 *   2. Bleeding or hemmed in (low HP, or a pack pressing close) → BREAK CONTACT:
 *      punch down the openest lane out of the crowd while HOPPING the whole way,
 *      so the untouchable airborne frames carry him clean over the bodies.
 *   3. Otherwise HUG THE PACK'S EDGE: hold just outside the nearest body's grasp
 *      so the auto-weapon mows the front line while he stays out of reach —
 *      orbiting the edge, backing off exactly as the pack closes, NOT fleeing to
 *      the far corner (a ranged loadout holds at the grasp standoff; a melee one
 *      holds at its own range and leans on the hop).
 * Advancing on the boss is folded into the edge-hug: when the field near the
 * hero is thin he drifts toward the objective, so he clears without ever
 * standing still in the flood.
 */
function survive(
  bot: Bot,
  state: GameState,
  posture: Posture,
  tune: BotTuning,
): GameInput {
  const player = state.player;
  let pt = tune.postures[posture];
  // RUSH THE OBJECTIVE: leveled for this map's named foes (readyForBoss — the
  // bossEngageMargin knob, e.g. committed from one level below) and marching
  // on one (the elite hunt / the boss push). A rushing BALANCED posture leans
  // into its AGGRO row — tighter hold, later bail, denser tolerated ring —
  // and a healthy rush runs the gauntlet outright (step 2.9). Once
  // sufficiently leveled, sticking around is loitering: the hero pushes
  // through the flood to the fight that progresses the map instead of peeling
  // off at every scuffle on the way. `flee` keeps its deliberate cowardice.
  const rushing =
    posture !== "flee" &&
    readyForBoss(state, tune) &&
    marchingOnFoe(bot, state, tune);
  if (posture === "balanced" && rushing) pt = tune.postures.aggro;
  const near = threatsWithin(state, THREAT_RADIUS);

  // 1. Breathing room: grab a pickup within reach; else follow the MACRO TRAVEL
  //    plan — farm this patch's spawner, sweep to the nearest reachable
  //    chest/elite, uncover remaining fog, and only then push the boss — routed
  //    globally (A*) so the runner threads the whole map to whatever's next.
  if (near.length === 0) {
    const item = wantedItemNearby(bot, state, tune);
    if (item) {
      think(bot, "GRAB ITEM");
      // Wall-aware: the drop was sweep-clear when picked, but the walk can
      // still clip a shelf edge — round it instead of grinding on it.
      return navSteer(state, item.pos);
    }
    // CRACK A CHEST ON THE WAY: an un-looted locker within reach on a quiet
    // field is never walked past — close to weapon range and PLANT; with no
    // foe in reach the auto-attack turns on the nearest breakable box
    // (stepWeapon) and smashes it open, and standing still tops the pool up
    // while it does. The macro content sweep still routes to the far ones.
    const chest = nearestChestNearby(state, tune);
    if (chest) {
      think(bot, "CRACK CHEST");
      const reach = weaponRangeFor(state, player.equipment.weapon);
      const d = distance(player.pos, chest.pos);
      // Close enough that the weapon connects (or the body is right up against
      // the box — a short blade smashes from arm's length): stand and smash.
      const touch = chest.radius + PLAYER.radius + 8;
      if (d <= Math.max(reach * 0.9, touch)) {
        return {
          steering: false,
          target: { x: player.pos.x, y: player.pos.y },
          jump: false,
        };
      }
      return navSteer(state, chest.pos);
    }
    // PRE-FIGHT TOP-UP: a pack spotted ahead is engaged at a FULL pool — the
    // where-do-we-meet read either walks the approach or plants a BREATHER
    // (see topUpBeforeFight).
    const topUp = topUpBeforeFight(bot, state, tune);
    if (topUp) return topUp;
    // On FOOT, never hopping: a jump on open ground buys nothing (the
    // untouchable frames matter only with a body about to bite) and each
    // takeoff spends `STAMINA.jumpCost` of a pool that walking merely trickles
    // back — the old travel-hop ground the pool to zero crossing a quiet
    // field. Jumps stay reserved for the reflexes (stampede) and the
    // surround/bleeding break-outs below.
    return macroSteer(bot, state, tune);
  }

  const grounded = player.z === 0;
  const nearest = near[0]!; // threatsWithin returns nearest-first
  const nearestD = distance(player.pos, nearest.pos);
  // A NUKE in the dock buys DARING: the bot keeps the classic forward kite and
  // skips the escape-route guard — worst case, the button clears the screen.
  const daring = hasNukeBanked(state);
  // OVERWHELMED — the fight is actually going badly: the bar has been chewed
  // below the caution line. This is what arms the DEFENSIVE reads (the
  // escape-route guard, the kite-backward drift): a healthy hero holds the
  // classic forward-pressing game (preemptive caution measured out: it costs
  // the boss on a wave level, where a close pack is the steady state), while a
  // bleeding one starts protecting his exits and giving ground toward cleared
  // ground BEFORE the emergency bail at `fleeHp` fires.
  const overwhelmed = player.hp < player.maxHp * OVERWHELMED_HP_FRAC;

  // 2. Emergency — only when there's no clean way to just back off: low on HP,
  //    or ENCIRCLED (a tight pack AND the retreat lane behind him is blocked, so
  //    edge-hugging can't open the gap). Then punch out, HOPPING THE WHOLE WAY:
  //    every airborne frame above JUMP.dodgeHeight is untouchable, so continuous
  //    jumps carry the hero clean OVER the bodies to open ground. A dense pack
  //    on ONE side isn't an emergency — that's the edge he hugs (step 3). The
  //    posture sets the trip wires: `flee` bails early and at a looser ring,
  //    `aggro` holds on through a low bar and a denser ring.
  const packed = near.filter(
    (e) => distance(e.pos, player.pos) < SURROUND_RADIUS,
  );
  const lowHp = player.hp < player.maxHp * pt.fleeHp;
  // SURROUNDED — a tight pack that ALSO hems the retreat lane (the emergency
  // trip wire below). This is the ONLY state that warrants a hop: jumping is
  // expensive (a takeoff spends `STAMINA.jumpCost` of the pool, and a winded
  // hero is capped to a jog — the worst state to be caught in near a pack), so
  // it's reserved for when the untouchable airborne frames are the only way OVER
  // the bodies. A pack on ONE side is NOT surrounded — the hero just RUNS clear
  // of it, keeping the pool full so he outpaces it rather than hopping the whole
  // way and winding himself. `hasHopStamina` is the pool floor a hop needs, so
  // the bot never asks for a takeoff the engine would refuse.
  const surrounded = packed.length >= pt.surround && isEncircled(state, packed);
  // The pool floor a discretionary hop needs: enough for the takeoff the engine
  // would otherwise refuse (`STAMINA.jumpCost`) AND a RESERVE on top
  // (`hopStaminaReserve`) so a break-out never taps the pool to the bottom and
  // leaves the hero winded (jog-capped) right when the ring closes. Below it he
  // breaks contact on FOOT and lets the pool refill.
  const hasHopStamina =
    player.stamina >=
    Math.max(STAMINA.jumpCost, tune.hopStaminaReserve) * player.maxStamina;
  // A body is inside CONTACT range — about to bite THIS tick, so the untouchable
  // airborne frames of a hop actually buy something (a hop between bites is pure
  // waste that just winds him out). The break-out hops only when one is this
  // close; otherwise he sprints the gap open on foot.
  const bodyAtContact = nearestD < CONTACT_DODGE_RADIUS;
  // Just took a hit: flinch back a few extra px so a trade doesn't turn into a
  // pile-on — taking damage is itself a signal to give ground. A short flinch;
  // `hurtFlashMs` clears ~250ms after the last bite.
  const recentlyHurt = player.hurtFlashMs > 0;
  // BLEEDING — hp at/below the hop threshold (~half) AND actually bitten within
  // the last beat (`recentlyHurt`). A LANDED hit while low is the human cue to
  // spend the untouchable airborne frames on an escape — mere proximity while
  // wounded is not: without the landed-hit gate the bleeding hero re-hopped on
  // every cooldown for as long as a body stayed at contact range, and a mauled
  // run read as constant bunny-hopping (measured: 18 hops/min on moon).
  const hurtBadly = player.hp <= player.maxHp * tune.hopHpFrac && recentlyHurt;
  // The discretionary-hop COOLDOWN: even with trouble persisting, hops come no
  // closer together than `hopCooldownMs` — one escape hop, then feet until the
  // next is EARNED. Jumps are expensive and rare by design; a run that reads as
  // constant hopping is a bug, not vigor. (0 disables; the mechanic dodges that
  // only a jump escapes still bypass this.)
  const hopReady =
    tune.hopCooldownMs <= 0 ||
    bot.lastHopMs === undefined ||
    state.stats.timeMs - bot.lastHopMs >= tune.hopCooldownMs;
  // A discretionary JUMP fires only off cooldown, with the pool in reserve, a
  // body about to bite, AND real trouble to escape — a genuine SURROUND he
  // can't run out of, or BLEEDING and just bitten. Otherwise he opens the gap
  // on FOOT (banking stamina).
  const wantHop =
    grounded &&
    hopReady &&
    hasHopStamina &&
    bodyAtContact &&
    (surrounded || hurtBadly);
  // BOSS LOCK. Lock onto the BOSS and fight it DOWN once he's actually in the
  // arena — the hero has closed to within `BOSS_LOCK_RANGE` or the boss has woken
  // — rather than kiting his adds. Getting THERE is the macro plan's job
  // (`shouldCommitBoss` steers the sweep at the boss only once every reachable
  // chest/elite is engaged), so this proximity lock just seals the set-piece.
  // The horde crawls during it (`mobPursuitNearElite`, 10% on easy), so he can
  // plant and DPS rather than kite.
  const bossEnemy = state.enemies.find(
    (e) => enemyDef(e.defId).role === "boss",
  );
  // A LIVE CONTENT ERRAND (a committed chest or elite) defers the proximity
  // boss lock: killing the boss ENDS the level, so every errand must finish
  // BEFORE the set piece is sealed — the macro plan already orders content
  // before the boss, and a march that merely STRAYS near the arena must not
  // hijack that ordering (measured: the lock caught the stock-room walk and
  // the run went to victory with the chest shut). A deferred boss that chases
  // is just another near body — the edge-fight below handles it until the
  // errand resolves and the lock resumes. A SCRIPTED-awake boss still locks.
  const contentErrand = bot.content?.target != null;
  const lockTarget =
    bossEnemy !== undefined &&
    readyForBoss(state, tune) &&
    (bossEnemy.awake === true ||
      (!contentErrand && distance(player.pos, bossEnemy.pos) < BOSS_LOCK_RANGE))
      ? bossEnemy
      : undefined;
  // Emergency bail: low on HP (heal), or ENCIRCLED with no clean lane out. A
  // hero locked on the boss does NOT bail on encirclement — the crawling horde
  // always rings him, so fleeing every ring would forfeit the kill; he holds and
  // only breaks to HEAL when actually bleeding, then re-commits.
  if (lowHp || (!lockTarget && surrounded)) {
    // HOP the break-out only when a body is about to bite AND he's in real
    // trouble — a genuine surround, or bleeding below half (`wantHop`) — so the
    // airborne frames buy an actual escape. Between bites (and on a low-HP
    // fall-back with an open lane) he RUNS to the medkit / open ground on foot,
    // banking stamina instead of hopping the whole way and winding himself; the
    // reserve floor keeps the pool from ever bottoming out.
    const breakoutHop = wantHop;
    if (lowHp) {
      // A DINGING golden arrow beats any medkit: the level-up it tips is a
      // free FULL heal + stamina refill (see Bot.arrowXp — the bot knows what
      // an arrow pays from experience), and the medkit stays pocketed.
      const arrow = dingArrowNearby(bot, state, ITEM_REACH);
      if (arrow) {
        think(bot, "GRAB ARROW");
        return navSteer(state, arrow.pos, breakoutHop);
      }
      // Else a medkit within reach is worth the detour when we're bleeding.
      const item = nearestWantedItem(state);
      if (
        item &&
        item.kind === "medkit" &&
        distance(player.pos, item.pos) < ITEM_REACH
      ) {
        think(bot, "GRAB MEDKIT");
        return navSteer(state, item.pos, breakoutHop);
      }
    }
    think(bot, lowHp ? "FALL BACK" : "PUNCH OUT");
    // The break-out lane avoids FORWARD (the fresh spawns live up the axis)
    // unless a banked nuke makes the bot daring.
    return navSteer(state, bestEscapeTarget(state, near, !daring), breakoutHop);
  }

  // 2.4. Fight the locked set piece down — hold at weapon range and press it,
  //    hopping through contact with a ranged loadout — instead of kiting past.
  if (lockTarget) {
    const w = weaponDef(player.equipment.weapon.defId);
    const lockHop =
      w.projectile !== undefined &&
      grounded &&
      hopReady &&
      hasHopStamina &&
      nearestD < CONTACT_DODGE_RADIUS;
    think(bot, "FIGHT BOSS");
    // Circle-strafe the boss at the hero's ACTUAL reach rather than planting on
    // the hold point — a moving target slips his shots between the telegraphs the
    // dedicated dodge already reads.
    const reach = weaponRangeFor(state, player.equipment.weapon);
    return steer(
      state,
      orbitHold(bot, state, lockTarget.pos, reach * 0.7, tune.orbitStep),
      lockHop,
    );
  }

  // 2.6. STOCK A REPAIR KIT. The held weapon is wearing thin (or a broken spare
  //    waits in the bag) and the hero holds no kit — detour to a repair kit lying
  //    within reach so it's in hand before the blade gives out. The engine swaps
  //    to the next-best spare the instant a weapon breaks, and spending the kit
  //    (`needsRepair`, above in botAct) mends the whole loadout and RE-EQUIPS the
  //    shed weapon (`repairAll`), so a stocked kit is what makes the whole
  //    downgrade → repair → re-arm cycle close. Only when not pressed (nearest
  //    body beyond the danger bubble), so scooping loot never walks into a bite.
  const dangerHold = tune.graspStandoff * pt.standoffMul;
  if (wantsRepairKitPickup(state) && nearestD > dangerHold) {
    const kit = nearestRepairKit(state);
    if (kit && distance(player.pos, kit.pos) < ITEM_REACH) {
      think(bot, "GET REPAIR");
      // On foot — a supply detour is no place to spend jump stamina (the old
      // `grounded` flag here hopped the whole walk to the kit).
      return navSteer(state, kit.pos);
    }
  }

  // 2.7. SCOOP LOOT ON THE SAFE SIDE. Ground loot lying NEARER than the nearest
  //    body is a free grab — a human sweeps it up mid-fight without giving the
  //    pack a bite. Only when nothing has breached the danger bubble, only for
  //    pieces worth carrying (`nearestWantedItem` skips equipment the bag
  //    couldn't keep and rescues still being flown in), and GPS-disciplined
  //    (`wantedItemNearby` refuses a far scoop that drags him backward off the
  //    route), so the detour never walks into the horde, ends at a refused
  //    pickup, or yanks the march around in circles on a loot-rich field.
  if (nearestD > dangerHold) {
    const loot = wantedItemNearby(bot, state, tune);
    if (loot && distance(player.pos, loot.pos) < nearestD) {
      think(bot, "GRAB ITEM");
      return navSteer(state, loot.pos);
    }
  }

  // 2.75. CRACK A CHEST ON THE SAFE SIDE. Same discipline as the loot scoop: a
  //    locker lying NEARER than the nearest body is worked mid-fight — walk
  //    into weapon range and PLANT; the auto-attack smashes it in every lull
  //    (foes always win the weapon's pick, so the fight is never diverted),
  //    a melee sweep chews it as collateral, and the moment a body closes
  //    nearer than the chest this read yields and the edge-fight below takes
  //    over. On a wave map "no threats anywhere" never happens, so waiting
  //    for a silent field meant never cracking anything (measured: 0/2
  //    chests on every seed). The COMMITTED chest presses on even with a foe
  //    nearer than it — its doorway is a flooded chokepoint, and demanding
  //    chest-closer-than-foe there parks the hero outside trading blows until
  //    the errand is abandoned; the danger-bubble gate still yields to any
  //    body that actually breaches.
  if (nearestD > dangerHold) {
    const chest = nearestChestNearby(state, tune);
    if (chest) {
      const chestD = distance(player.pos, chest.pos);
      const committed =
        bot.content?.kind === "chest" &&
        bot.content.target !== null &&
        bot.content.target.x === chest.pos.x &&
        bot.content.target.y === chest.pos.y;
      if (chestD < nearestD || committed) {
        think(bot, "CRACK CHEST");
        const smashReach = weaponRangeFor(state, player.equipment.weapon);
        const touch = chest.radius + PLAYER.radius + 8;
        if (chestD <= Math.max(smashReach * 0.9, touch)) {
          return {
            steering: false,
            target: { x: player.pos.x, y: player.pos.y },
            jump: false,
          };
        }
        return navSteer(state, chest.pos);
      }
    }
  }

  // 2.8. KEEP AN ESCAPE ROUTE. OVERWHELMED (the bar chewed below the caution
  //    line) and fighting a real pack, the hero watches his exits: when the
  //    horde's envelopment squeezes the OPEN lanes of the escape fan below
  //    `escapeLaneMin` he stops holding and repositions down the best lane
  //    left — BEFORE the ring closes (the encircled punch-out in step 2 is the
  //    late case; this is the early one). A healthy hero skips the caution (it
  //    bleeds map progress on a wave level), boss-locked he holds (the
  //    crawling horde always rings him there), and a banked nuke waives it
  //    too. Shares the emergency escape's lane fan, so "open" means the same
  //    thing in both reads.
  if (!daring && overwhelmed && tune.escapeLaneMin > 0 && packed.length >= 3) {
    // Openness is judged on RAW pressure + walls only (no forward tiebreak) —
    // an exit is an exit; the spawn-side preference only decides which one to
    // take once the guard trips.
    const lanes = escapeLaneScores(state, near, false);
    let open = 0;
    for (const s of lanes) {
      if (s < OPEN_LANE_SCORE) open++;
    }
    if (open < tune.escapeLaneMin) {
      think(bot, "KEEP EXIT");
      return navSteer(
        state,
        bestLanePoint(state, escapeLaneScores(state, near, true)),
        wantHop,
      );
    }
  }

  // 2.9. RUN THE GAUNTLET. Boss-ready and marching on a named foe (the elite
  //    hunt / the boss push) with a HEALTHY bar, the hero doesn't reset his
  //    standoff for every body on the way — he keeps pressing the march down
  //    the route, letting the auto-weapon carve whatever steps into reach, and
  //    only falls back into the normal edge-fight once he's actually been
  //    BITTEN (recentlyHurt — the flinch) or his bar is chewed (overwhelmed).
  //    Sufficiently leveled, sticking around the flood is loitering; this is
  //    what carries him THROUGH it to the fight that progresses the map. The
  //    reflex dodges (telegraphs, meteors, herds) still preempt in botAct, the
  //    emergency bails above still outrank it, and a genuine surround still
  //    hops (`wantHop`).
  if (rushing && !overwhelmed && !recentlyHurt) {
    const goal = macroTarget(bot, state, tune);
    const routeTgt = onPathLevel(state) ? routeTarget(bot, state, goal) : goal;
    let hx = routeTgt.x - player.pos.x;
    let hy = routeTgt.y - player.pos.y;
    const hm = Math.hypot(hx, hy);
    if (hm >= 1) {
      hx /= hm;
      hy /= hm;
      think(bot, "RUSH");
      return navSteer(
        state,
        { x: player.pos.x + hx * 150, y: player.pos.y + hy * 150 },
        wantHop,
      );
    }
  }

  // 3. HUG THE PACK'S EDGE. Stay just outside the nearest body's grasp so the
  //    auto-weapon mows the front line while the hero keeps out of reach —
  //    orbiting the edge, backing off toward the OPEN side (away from the pack's
  //    mass), not fleeing to the far corner. `away` points away from the local
  //    pack, closeness-weighted so the nearest bodies set the bearing and a gap
  //    in the ring pulls him toward it. Pressed (a foe inside the standoff) →
  //    give ground hard; safe on the edge → drift out just enough to hold the
  //    gap; field thin → close on the boss to finish the map. A melee loadout
  //    can't reach the grasp standoff, so it holds at its own range. Neither
  //    loadout HOPS here unless it's surrounded — a pack on one side is outrun on
  //    foot, keeping the pool full (see `surrounded` / step 2).
  const weapon = weaponDef(player.equipment.weapon.defId);
  // The hero's ACTUAL effective reach — the base range widened by STRENGTH (a
  // melee blade's depth) or INTELLIGENCE (ranged/magic), the SAME distance
  // `stepWeapon` uses (weaponRangeFor) to decide whether a swing or a shot
  // actually connects. Holding off the raw base range left a high-reach loadout —
  // and, with a wide `flee` standoff, ANY ranged one — standing BEYOND where its
  // shots land, skirmishing a pack it could never hit. Reading the real reach is
  // what makes the hold range-aware.
  const reach = weaponRangeFor(state, player.equipment.weapon);
  const ranged = weapon.projectile !== undefined;
  // TWO distances, so the hero fights from a spot he can actually HIT from:
  //  • dangerDist — a body THIS close is a real threat: give ground hard. Small,
  //    so full retreat only fires when something breaches his bubble, not merely
  //    enters weapon range.
  //  • engageDist — the reach-aware HOLD.
  // The hero ADVANCES on the objective only while the nearest threat is beyond
  // engageDist (closing IN to get within reach), HOLDS STILL and lets the auto-
  // weapon fire while a foe sits in the sweet spot, and gives ground only when one
  // breaches dangerDist.
  //
  // RANGED/MAGIC hold near max reach (`reach * engageRangeFrac`, floored at the
  // grasp) and give ground at the grasp standoff — a kill-from-distance lane.
  // MELEE is a different game: a starter blade reaches barely past arm's length
  // (`medieval_sword` base 38), so holding at the ranged `graspStandoff` (72) —
  // BEYOND where the blade lands — made the melee hero flee everything and only
  // connect when a mob ran him down, one swing, then back out. Cowards pick
  // ranged. A melee loadout instead PRESSES IN to `reach * meleeHoldFrac` and
  // grinds there, its danger bubble the tight `meleeGraspStandoff` (clamped below
  // the hold so a swinging band always survives) — so it stands in the pack and
  // the auto-swing's cone mows the front line, giving a little ground only when a
  // body crowds inside the blade. Both holds are capped at `reach *
  // maxEngageRangeFrac` so no posture standoff (flee's 1.7×) pushes the hold past
  // where the weapon connects.
  const spec = weapon.projectile;
  let engageDist: number;
  let dangerDist: number;
  // The DEADBAND half-width around engageDist inside which the hero STANDS STILL
  // and fires (see below). Ranged uses the flat `holdBand`; melee sizes it to its
  // own tiny reach so the hold band spans exactly [danger bubble → press depth].
  let band: number;
  if (ranged) {
    // An AoE/CONE ranged weapon (a shotgun's fan, a fire-hose cone — `count > 1`
    // or a `spreadDeg`) throws a FIXED number of pellets, so closing the gap
    // concentrates them onto a cluster and catches mobs 2/3/4 rather than clipping
    // just the front body at max reach. Facing a REAL pack it holds nearer
    // (`aoeEngageFrac`); a lone foe keeps the normal single-target standoff.
    const aoeWeapon =
      spec !== undefined &&
      ((spec.count ?? 1) > 1 || (spec.spreadDeg ?? 0) > 0);
    const engageFrac =
      aoeWeapon && packed.length >= 2
        ? Math.min(tune.engageRangeFrac, tune.aoeEngageFrac)
        : tune.engageRangeFrac;
    const baseEngage = Math.max(tune.graspStandoff, reach * engageFrac);
    engageDist = Math.min(
      baseEngage * pt.standoffMul,
      reach * tune.maxEngageRangeFrac,
    );
    dangerDist = dangerHold;
    band = tune.holdBand;
  } else {
    // MELEE: hold the body just OUTSIDE the nearest foe's actual CONTACT GRASP so
    // the auto-swing's cone mows the front line WITHOUT eating a contact hit on
    // every blow. The grasp is the same centre-to-centre bite line step.ts uses
    // (`(mobRadius + heroRadius) * contactReachMult`); the hero keeps
    // `meleeGraspClearance` px of air past it. Two cases:
    //  • The blade CLEARS the grasp (its reach ceiling beats the clearance line):
    //    a real standoff window exists. Hold near the blade tip — pressing in with
    //    an aggressive posture, but never inside the clearance line — and give
    //    ground the moment a body crosses it, so the whole STAND-AND-GRIND band
    //    sits clear of the bite. This is the fix for the melee hero grinding a few
    //    px INSIDE the pack and trading a hit for every swing.
    //  • The blade is too SHORT to clear the grasp (a knuckle/knife whose reach
    //    barely beats a big body's bite): no safe window, so press in and grind —
    //    arm length is arm length — giving ground only when crowded deeper. This
    //    is the old hold-and-grind, kept for the weapons that genuinely need it.
    const nearestGrasp =
      (enemyDef(nearest.defId).radius + PLAYER.radius) *
      PLAYER.contactReachMult;
    const holdCeil = reach * tune.maxEngageRangeFrac;
    const graspClear = nearestGrasp + tune.meleeGraspClearance;
    if (graspClear < holdCeil) {
      // Hold near the tip, leaned in by posture, but floored a band past the
      // clearance line so the stand-still zone never dips into the bite.
      const minHold =
        graspClear + Math.min(tune.holdBand, (holdCeil - graspClear) / 2);
      const pressEdge = clamp(
        reach * tune.meleeHoldFrac * pt.standoffMul,
        minHold,
        holdCeil,
      );
      dangerDist = graspClear;
      engageDist = (dangerDist + pressEdge) / 2;
      band = (pressEdge - dangerDist) / 2;
    } else {
      // Short blade: it can't clear the grasp, so press to the reach ceiling and
      // grind, giving ground only when a body crowds well inside.
      const pressEdge = holdCeil;
      dangerDist = Math.min(
        tune.meleeGraspStandoff * pt.standoffMul,
        pressEdge * 0.7,
      );
      engageDist = (dangerDist + pressEdge) / 2;
      band = (pressEdge - dangerDist) / 2;
    }
  }
  // Taking a hit is a signal to give ground: right after a bite widen the danger
  // bubble by `hurtBackoffPx` so the hero peels a few px off the trade instead of
  // trading blow for blow (both loadouts). A brief flinch — `hurtFlashMs` clears
  // ~250ms after the last hit — so it nudges him back without unravelling the hold.
  if (recentlyHurt) dangerDist += tune.hurtBackoffPx;
  // Which way a RETREAT drifts: OVERWHELMED (bar chewed below the caution
  // line) and facing a real pack, the hero kites BACKWARD, toward the
  // spawn-side ground he has already cleared — the fresh spawns live ahead
  // (`retreatHeading` / bot.yaml `retreatBackBias`); the away-from-pack vector
  // stays dominant either way. Healthy he keeps the classic FORWARD drift:
  // stepping off a body is a standoff reset, not a withdrawal — on a wave
  // level a close pack is the steady state, and biasing every micro
  // give-ground backward bleeds the map progress dry (measured: it costs the
  // boss). A banked NUKE keeps the daring forward drift regardless.
  const back =
    daring || !overwhelmed || packed.length < 3
      ? null
      : retreatHeading(state, tune);
  const away = back
    ? awayFromPack(state, near, back, tune.retreatBackBias)
    : awayFromPack(state, near, travelHeading(bot, state, tune));
  // The engage hold is a SWEET SPOT, not a knife-edge: the DEADBAND (`band`,
  // computed above) around engageDist inside which the hero simply STANDS AND
  // FIRES. Once a foe sits within reach and outside the danger bubble there is
  // nothing to gain by shuffling — a stable footing keeps the auto-aimed weapon on
  // the front line and tops the stamina pool up, and it stops the constant back-
  // and-forth skirmish. He only moves when he leaves that band: too CLOSE → give a
  // little ground to reopen the gap; too FAR → close IN toward the mobs.
  // Too CLOSE — a body breached the danger bubble, or merely pushed inside the
  // hold: give ground toward the OPEN side to re-establish the standoff, routed
  // through the obstacle-aware nav so the retreat rounds a rock instead of
  // grinding into it. A genuine ring is HOPPED (untouchable frames over the
  // bodies); a mere standoff reset gives ground on foot.
  if (nearestD < dangerDist || nearestD < engageDist - band) {
    // A genuine ring (or a bleeding hero taking a bite) HOPS clear; an ordinary
    // standoff reset gives ground on foot — see `wantHop`.
    const breakoutHop = wantHop;
    think(bot, "GIVE GROUND");
    return navSteer(
      state,
      { x: player.pos.x + away.x * 150, y: player.pos.y + away.y * 150 },
      breakoutHop,
    );
  }
  // Too FAR — the nearest foe is beyond the hold band. Close IN toward the macro
  // objective (the next chest/elite, then the boss, routed globally by A* so the
  // push rounds every wall), and the pack between the hero and it, letting the
  // auto-weapon carve the front as he steps into reach. This is the "move toward
  // the mobs to HIT them" step — a hero out of range walks INTO range rather than
  // standing off. Pushing a thick field waits for the front to thin
  // (packed <= pushThroughMax) so he never dives a wall of bodies. On an open
  // arena / pathless fixture there's no route, so the away vector orients him.
  if (nearestD > engageDist + band && packed.length <= tune.pushThroughMax) {
    const goal = macroTarget(bot, state, tune);
    const routeTgt = onPathLevel(state) ? routeTarget(bot, state, goal) : goal;
    let hx = routeTgt.x - player.pos.x;
    let hy = routeTgt.y - player.pos.y;
    const hm = Math.hypot(hx, hy);
    if (hm < 1) {
      hx = away.x;
      hy = away.y;
    } else {
      hx /= hm;
      hy /= hm;
    }
    think(bot, "ADVANCE");
    return navSteer(
      state,
      { x: player.pos.x + hx * 150, y: player.pos.y + hy * 150 },
      wantHop,
    );
  }
  // SWEET SPOT — a foe sits inside the hold band: STAND HIS GROUND and let the
  // auto-aimed weapon mow the front line from a distance he can actually HIT from,
  // rather than shuffling for nothing. He moves again only when a body pushes
  // inside the band (give ground) or the front thins past it (advance); the
  // telegraph / meteor / storm reflexes in `botAct` still preempt this hold, so he
  // steps off a real set-piece instead of eating it planted. He still HOPS out of
  // a genuine ring, or when bleeding and bitten (see `wantHop`).
  if (wantHop) {
    think(bot, "PUNCH OUT");
    return navSteer(
      state,
      { x: player.pos.x + away.x * 150, y: player.pos.y + away.y * 150 },
      true,
    );
  }
  think(bot, "HOLD");
  return {
    steering: false,
    target: { x: player.pos.x, y: player.pos.y },
    jump: false,
  };
}

/**
 * A dodge input when a set-piece's TELEGRAPHED move (mechanics.ts) is about to
 * land on the hero — else null. Every dangerous move roots the mob for a
 * readable windup, so a competent player (and the bot) reads it and gets clear:
 *   • SLAM — an AoE around the mob: step straight out of its `radius` ring.
 *   • CHARGE — a dash down a locked bearing at the hero: sidestep PERPENDICULAR
 *     off the dash line (handled during the windup AND while the dash is in
 *     flight). Standing planted on a rushing boss and eating the hit is what
 *     kept the finisher from ever landing. Highest priority in `botAct`.
 *
 * The escape is on FOOT — stepping off the line / out of the ring is the whole
 * dodge, and the windup gives time to walk clear. A hop here was a needless
 * stamina drain (jumps are reserved for breaking a genuine SURROUND, see
 * `survive`), and it left the hero winded for the next real pinch.
 */
function dodgeTelegraph(state: GameState): GameInput | null {
  const player = state.player;
  for (const e of state.enemies) {
    const mech = e.mech;
    if (!mech) continue;
    const def = enemyDef(e.defId);
    const slamR = def.mechanics?.slam?.radius;
    if (mech.telegraph?.kind === "slam" && slamR !== undefined) {
      const dx = player.pos.x - e.pos.x;
      const dy = player.pos.y - e.pos.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < slamR + 28) {
        return steer(state, {
          x: player.pos.x + (dx / d) * 140,
          y: player.pos.y + (dy / d) * 140,
        });
      }
    }
    // A charge's locked bearing — from the windup telegraph, or the live dash.
    const dir =
      mech.telegraph?.kind === "charge"
        ? mech.telegraph.dir
        : mech.dashMs && mech.dashMs > 0
          ? mech.dashDir
          : undefined;
    if (dir) {
      const tx = player.pos.x - e.pos.x;
      const ty = player.pos.y - e.pos.y;
      const along = tx * dir.x + ty * dir.y; // hero's projection onto the dash
      if (along > -20) {
        const perpX = tx - dir.x * along;
        const perpY = ty - dir.y * along;
        if (Math.hypot(perpX, perpY) < 46) {
          // On the dash line — step to whichever side he's already leaning.
          let px = -dir.y;
          let py = dir.x;
          if (perpX * px + perpY * py < 0) {
            px = -px;
            py = -py;
          }
          return steer(state, {
            x: player.pos.x + px * 150,
            y: player.pos.y + py * 150,
          });
        }
      }
    }
  }
  return null;
}

/**
 * A sidestep input when a bouncing HAY BALL (`state.hayBalls`, Eastworld) is
 * bearing down the hero's lane — else null. Bales roll straight LEFT at a fixed
 * `y`, so a body in the same lane gets shoved back down the street; the human
 * read is to step PERPENDICULAR (up/down) out of the lane before it arrives.
 * Considers only bales still to the hero's right (ahead of the roll) and within
 * `hayBallDodgeDist`, whose lane overlaps his within the combined radii plus
 * `hayBallLaneMargin`. Dodges toward the OPEN side (the map centre, so he never
 * sidesteps off the field), and hops if a bale is right on top of him — an
 * airborne hero clears a bale like he clears enemy contact.
 */
function dodgeHayBall(state: GameState, tune: BotTuning): GameInput | null {
  if (state.hayBalls.length === 0 || tune.hayBallDodgeDist <= 0) return null;
  const player = state.player;
  const midY = state.level.height / 2;
  let threat: (typeof state.hayBalls)[number] | null = null;
  let best = Infinity;
  for (const ball of state.hayBalls) {
    const ahead = ball.pos.x - player.pos.x; // >0 = still up-street, closing
    if (ahead < -ball.radius || ahead > tune.hayBallDodgeDist) continue;
    const laneGap = Math.abs(ball.pos.y - player.pos.y);
    const laneReach = ball.radius + PLAYER.radius + tune.hayBallLaneMargin;
    if (laneGap > laneReach) continue;
    if (ahead < best) {
      best = ahead;
      threat = ball;
    }
  }
  if (!threat) return null;
  // Step away from the bale's lane, toward the roomier side (map centre) when
  // the hero straddles its centreline, so the dodge never walks him off-field.
  let sign = player.pos.y < threat.pos.y ? -1 : 1;
  if (Math.abs(player.pos.y - threat.pos.y) < 2)
    sign = player.pos.y > midY ? -1 : 1;
  const grounded = player.z === 0;
  const jump = grounded && best <= threat.radius + PLAYER.radius;
  return steer(state, { x: player.pos.x, y: player.pos.y + sign * 90 }, jump);
}

/**
 * A dodge input when a SAND STORM (mars) is about to sweep over the grounded
 * hero — else null. A storm drifts a straight, readable line SLOW enough to
 * walk clear of, and being caught means a 2-second KNOCKOUT (Player.knockoutMs)
 * that leaves him prone and helpless in the horde — a far worse trade than one
 * hit. So the bot reads it like a charge telegraph: if he sits inside a storm's
 * swept corridor and it's closing, sidestep PERPENDICULAR off the drift line to
 * the open side and walk clear. A gust is too wide to hop, so the escape is
 * lateral, never a jump. A storm that already STRUCK is spent — it can't knock
 * him out again — so its fading drift is ignored.
 */
function dodgeSandstorm(state: GameState, tune: BotTuning): GameInput | null {
  const pos = state.player.pos;
  for (const storm of state.sandstorms) {
    if (storm.struck) continue;
    const dir = storm.dir;
    const relX = pos.x - storm.pos.x;
    const relY = pos.y - storm.pos.y;
    // How far ahead of the storm the hero sits, along its drift, and how far off
    // its centreline (the swept lane's half-width).
    const along = relX * dir.x + relY * dir.y;
    if (along < -storm.radius) continue; // behind it — it's drifting away
    const reactDist =
      storm.radius + PLAYER.radius + storm.speed * tune.sandstormReactSec;
    if (along > reactDist) continue; // still far up its path — it may drift wide
    const perpX = relX - dir.x * along;
    const perpY = relY - dir.y * along;
    const perp = Math.hypot(perpX, perpY);
    const corridor = storm.radius + PLAYER.radius + tune.sandstormClearance;
    if (perp >= corridor) continue; // outside the swept lane — no need to move
    // Step to whichever side he's already leaning (fastest out of the lane);
    // dead-centre, take the drift's left normal. Flip if that side walks him
    // into a wall.
    let px = -dir.y;
    let py = dir.x;
    if (perp > 1e-3 && perpX * px + perpY * py < 0) {
      px = -px;
      py = -py;
    }
    const stepOut = corridor + 50;
    let tx = pos.x + px * stepOut;
    let ty = pos.y + py * stepOut;
    if (insideObstacle(state, { x: tx, y: ty }, PLAYER.radius)) {
      tx = pos.x - px * stepOut;
      ty = pos.y - py * stepOut;
    }
    return steer(state, { x: tx, y: ty });
  }
  return null;
}

/**
 * A JUMP input when an employee stampede (`state.stampedes`, SpaceZ HQ) is about
 * to trample the grounded hero — else null. A herd charges a straight, fast line
 * to the LEFT, and being caught means a ~20% bite AND a 2-second knockdown in the
 * horde — but a jump sails clean over the whole wall (z above JUMP.dodgeHeight).
 * So the human read is a well-timed HOP: considers only herds still to the hero's
 * right (ahead of the charge) whose band overlaps his lane, and hops once the
 * near edge is within `stampedeDodgeDist` — close enough that he's airborne when
 * the wall reaches him, not so early he lands back down into it. A herd that
 * already STRUCK is spent (it can't knock him down again), and a hop only fires
 * from the ground, so a mid-air hero rides his existing jump over it.
 */
function dodgeStampede(state: GameState, tune: BotTuning): GameInput | null {
  if (state.stampedes.length === 0 || tune.stampedeDodgeDist <= 0) return null;
  const player = state.player;
  if (player.z > 0) return null; // already airborne — the current hop clears it
  const laneReach =
    STAMPEDES.bandHalfHeight + PLAYER.radius + tune.stampedeLaneMargin;
  const nearReach = STAMPEDES.bandHalfDepth + PLAYER.radius;
  for (const herd of state.stampedes) {
    if (herd.struck) continue;
    if (Math.abs(herd.pos.y - player.pos.y) > laneReach) continue; // not his lane
    // Gap from the herd's LEADING (left) edge to the hero, along the charge.
    const ahead = herd.pos.x - nearReach - player.pos.x;
    if (ahead < -nearReach * 2) continue; // already charged past him
    if (ahead > tune.stampedeDodgeDist) continue; // still too far to commit the hop
    // Hop in place — steer to hold his ground and clear the wall overhead.
    return steer(state, { x: player.pos.x, y: player.pos.y }, true);
  }
  return null;
}

/** Extra clearance the bot puts between itself and a meteor's blast edge when
 * it steps off an impact mark (world px) — a human leaves a margin, not a
 * hair. */
const ASTEROID_DODGE_MARGIN = 26;
/** How close to impact (ms) a strike must be before the bot bothers to clear
 * its mark — early enough to walk out, late enough not to flinch at every rock
 * that is still a second-and-a-half from landing. */
const ASTEROID_DODGE_LEAD_MS = 1100;

/**
 * A step OFF a meteor's impact mark when one is about to land on the hero
 * (`state.asteroids`) — else null. A falling rock telegraphs its blast with a
 * firming ground shadow; the human read is to walk clear of the circle before
 * it detonates. Considers only rocks near enough to impact
 * (`ASTEROID_DODGE_LEAD_MS`) whose blast would catch where the hero now stands,
 * picks the most imminent, and steers straight out past its blast edge (plus a
 * margin). Standing dead on the mark, it breaks the tie toward the map centre
 * so the dodge never walks him off the field.
 */
function dodgeAsteroid(state: GameState): GameInput | null {
  if (state.asteroids.length === 0) return null;
  const player = state.player;
  let threat: Asteroid | null = null;
  let soonest = Infinity;
  for (const rock of state.asteroids) {
    const timeToImpact = rock.fallMs - rock.ageMs;
    if (timeToImpact > ASTEROID_DODGE_LEAD_MS) continue;
    const reach = rock.blastRadius + PLAYER.radius + ASTEROID_DODGE_MARGIN;
    if (distance(rock.target, player.pos) > reach) continue;
    if (timeToImpact < soonest) {
      soonest = timeToImpact;
      threat = rock;
    }
  }
  if (!threat) return null;
  const clear = threat.blastRadius + PLAYER.radius + ASTEROID_DODGE_MARGIN;
  let away = direction(threat.target, player.pos);
  if (away.x === 0 && away.y === 0) {
    // Standing dead on the mark: bolt toward the roomier side (map centre).
    away = direction(threat.target, {
      x: state.level.width / 2,
      y: state.level.height / 2,
    });
    if (away.x === 0 && away.y === 0) away = { x: 1, y: 0 };
  }
  return steer(state, {
    x: threat.target.x + away.x * (clear + 40),
    y: threat.target.y + away.y * (clear + 40),
  });
}

/** A unit vector pointing away from the local pack, weighted so the NEAREST
 * bodies dominate the bearing (and a gap in a ring pulls the hero toward it).
 * When `prefer` is given (a unit heading toward the intended-path waypoint) the
 * retreat is BIASED toward it, so backing off the pack also walks the hero down
 * the corridor — yet `away` stays dominant, so a waypoint that lies through the
 * pack never drags him INTO it. */
function awayFromPack(
  state: GameState,
  near: Enemy[],
  prefer?: Vec2 | null,
  bias = PATH_RETREAT_BIAS,
): Vec2 {
  const pos = state.player.pos;
  let ax = 0;
  let ay = 0;
  for (const e of near) {
    const dx = pos.x - e.pos.x;
    const dy = pos.y - e.pos.y;
    const d = Math.hypot(dx, dy) || 1;
    ax += dx / (d * d); // 1/d direction × 1/d weight = nearer foes weigh more
    ay += dy / (d * d);
  }
  const m = Math.hypot(ax, ay);
  const away = m < 1e-6 ? (prefer ?? { x: 1, y: 0 }) : { x: ax / m, y: ay / m };
  if (!prefer) return away;
  const bx = away.x + prefer.x * bias;
  const by = away.y + prefer.y * bias;
  const bm = Math.hypot(bx, by) || 1;
  return { x: bx / bm, y: by / bm };
}

/** A unit heading toward SAFE ground for a retreat — BACK along the spawn→boss
 * axis (the ground behind is already cleared; the fresh spawns live ahead), or
 * toward the spawn itself on an axis-less arena. This is the "kite the pack
 * backwards, not forwards" bearing. Null when the hero is already at the back
 * of the map (nothing behind to give) or the `retreatBackBias` knob is off —
 * the caller then falls back to the classic forward (objective-ward) drift. */
function retreatHeading(state: GameState, tune: BotTuning): Vec2 | null {
  if (tune.retreatBackBias <= 0) return null;
  const axis = objectiveAxis(state);
  if (axis) {
    // Already at the spawn end — backing further only finds the wall.
    if (axisProgress(axis, state.player.pos) < 0.12) return null;
    return { x: -axis.dir.x, y: -axis.dir.y };
  }
  const dx = state.playerSpawn.x - state.player.pos.x;
  const dy = state.playerSpawn.y - state.player.pos.y;
  const d = Math.hypot(dx, dy);
  if (d < 80) return null;
  return { x: dx / d, y: dy / d };
}

/** The GPS HEADING: a unit vector from the hero toward the next A* ROUTE
 * WAYPOINT of the current macro goal (the waypoint/elite/boss the sweep is
 * bound for) — the persistent pull that keeps every combat move TENDING toward
 * the destination. Route-aware, not a beeline: the old straight-at-the-goal
 * bias pointed THROUGH walls, so a retreat "toward the objective" could grind
 * into a jig wall for minutes; steering at the next turning point instead
 * drifts the fight down the corridor the way a human keeps working toward the
 * marker on their minimap. Reads/updates the bot's cached route; pure w.r.t.
 * state + bot memory. */
function travelHeading(
  bot: Bot,
  state: GameState,
  tune: BotTuning,
): Vec2 | null {
  const goal = macroTarget(bot, state, tune);
  const dx = goal.x - state.player.pos.x;
  const dy = goal.y - state.player.pos.y;
  const d = Math.hypot(dx, dy);
  if (d < 1) return null;
  return { x: dx / d, y: dy / d };
}

/** Non-apparition enemies within `radius`, nearest first. */
function threatsWithin(state: GameState, radius: number): Enemy[] {
  return state.enemies
    .filter(
      (e) =>
        !enemyDef(e.defId).apparition &&
        distance(e.pos, state.player.pos) < radius,
    )
    .sort(
      (a, b) =>
        distance(a.pos, state.player.pos) - distance(b.pos, state.player.pos),
    );
}

/** The current boss enemy, if one is on the field. */
function bossOf(state: GameState): Enemy | undefined {
  return state.enemies.find((e) => enemyDef(e.defId).role === "boss");
}

/** The current boss's position, if one is on the field. */
function bossPos(state: GameState): Vec2 | undefined {
  return bossOf(state)?.pos;
}

/**
 * Is the hero leveled enough to STOP farming and rush the boss? True when he has
 * reached the boss's monster level minus {@link BotTuning.bossEngageMargin}
 * (default 0 — he waits for LEVEL PARITY with the boss, so he doesn't engage it
 * under-levelled) — or when the level has no boss to gate on (a reachExit map),
 * so the bot always pushes the objective there. Until then the bot keeps farming
 * the spawn-point patches to level up (see the `spawner` hold in {@link survive})
 * and discovering its side of the map. Coverage still commits the sweep to the
 * boss even short of parity ({@link macroTarget}), so this can't strand a hero
 * who tops out under the boss's level.
 */
function readyForBoss(state: GameState, tune: BotTuning): boolean {
  const boss = bossOf(state);
  if (!boss) return true;
  return state.player.level >= Math.max(1, boss.mlvl - tune.bossEngageMargin);
}

/** A fogged patch smaller than this many cells (in a ~7×7 window) is a stray
 * sliver — a rock's shadow, a wall nook — not a pocket worth a detour, so it
 * never yanks the hero around. */
const FOG_BLOB_MIN_CELLS = 8;

/** The spawn→objective AXIS the exploration bands hang off — the bot's "where did
 * I start vs where's the boss" read. Origin is the player spawn (the near, t=0
 * end); the heading points at the boss (the far, t=1 end), or, before the boss is
 * on the field, the FURTHEST LANDMARK (the objective marker), so the axis is known
 * from the first tick even while the boss sleeps off-screen. Null when there's no
 * objective to orient on (an open arena with no landmark) — the caller then falls
 * back to an undirected nearest-pocket sweep. Pure, so determinism holds. */
function objectiveAxis(
  state: GameState,
): { origin: Vec2; dir: Vec2; len: number } | null {
  const origin = state.playerSpawn;
  const goal = bossPos(state) ?? furthestLandmark(state);
  if (!goal) return null;
  const dx = goal.x - origin.x;
  const dy = goal.y - origin.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return null;
  return { origin, dir: { x: dx / len, y: dy / len }, len };
}

/** How far along the spawn→boss axis a world point sits: 0 at the spawn end, 1 at
 * the boss end — the "which slice of the map is this" the exploration priority
 * bands off. Clamped, so a point behind the spawn reads 0 and one past the boss
 * reads 1. */
function axisProgress(
  axis: { origin: Vec2; dir: Vec2; len: number },
  p: Vec2,
): number {
  const t =
    ((p.x - axis.origin.x) * axis.dir.x + (p.y - axis.origin.y) * axis.dir.y) /
    axis.len;
  return clamp(t, 0, 1);
}

/**
 * The world-space centroid of the sizable UNEXPLORED pocket the bot should uncover
 * NEXT — the directional coverage sweep that discovers the map from the hero's own
 * side outward before it ever commits to the boss (see {@link macroTarget}).
 *
 * Scans the coarse fog grid (`state.explored`, `map.ts`) for FRONTIER cells — fog
 * on the boundary of the known region (≥1 uncovered 4-neighbour) that is within
 * {@link BotTuning.exploreReach} and in clear LINE OF SIGHT — and ranks them by
 * DIRECTIONAL BAND first, nearest second: the axis (spawn→boss) is split into
 * `exploreBands` slices and the hero clears the lowest (spawn-side) slice's fog
 * before the next, so he sweeps his OWN SIDE → the MIDDLE → the boss's. The final
 * (boss-side) band is deliberately left unexplored so he commits to the boss on
 * approach rather than poking every corner beside it — reaching it uncovers that
 * band anyway. With no axis (an open arena) every cell is band 0, i.e. the old
 * undirected nearest-pocket sweep.
 *
 * Averages the fog in a small window around the winning seed into a centroid,
 * returning it only if the pocket is big enough ({@link FOG_BLOB_MIN_CELLS}). A
 * one-cell inset skips the never-quite-revealed level rim. Null when no explorable
 * frontier remains — the signal to push the boss. Pure (a function of
 * `state.explored` + geometry, no RNG/clock) so botted runs stay deterministic.
 */
function exploreTarget(state: GameState, tune: BotTuning): Vec2 | null {
  const cell = MAP.cellSize;
  const cols = mapCols(state.level);
  const rows = mapRows(state.level);
  const pos = state.player.pos;
  const reachSq = tune.exploreReach * tune.exploreReach;
  const axis = objectiveAxis(state);
  const bands = Math.max(1, Math.floor(tune.exploreBands));
  // Explorable bands: with an axis, sweep all but the FINAL (boss-side) one so the
  // hero heads for the boss once his side + the middle are uncovered; with no axis
  // (open arena) every cell is band 0, so nothing is excluded.
  const maxBand = axis ? Math.max(0, bands - 2) : 0;
  // Rank frontier by (band asc, distance asc): the lowest band anywhere in reach
  // wins, so the spawn-side fog is cleared before the hero advances toward the
  // boss's side, and within a band the nearest pocket is taken first.
  let seedTx = -1;
  let seedTy = -1;
  let bestBand = Infinity;
  let bestDistSq = Infinity;
  for (let ty = 1; ty < rows - 1; ty++) {
    for (let tx = 1; tx < cols - 1; tx++) {
      const idx = ty * cols + tx;
      if (state.explored[idx] === 1) continue;
      // FRONTIER only: a fully-fogged cell walled off deep inside the dark is not
      // a target — one whose 4-neighbourhood already touches uncovered ground is.
      if (
        state.explored[idx - 1] !== 1 &&
        state.explored[idx + 1] !== 1 &&
        state.explored[idx - cols] !== 1 &&
        state.explored[idx + cols] !== 1
      )
        continue;
      const wx = (tx + 0.5) * cell;
      const wy = (ty + 0.5) * cell;
      const dSq = (wx - pos.x) * (wx - pos.x) + (wy - pos.y) * (wy - pos.y);
      if (dSq > reachSq) continue;
      const band = axis
        ? Math.min(
            bands - 1,
            Math.floor(axisProgress(axis, { x: wx, y: wy }) * bands),
          )
        : 0;
      if (band > maxBand) continue;
      if (band > bestBand || (band === bestBand && dSq >= bestDistSq)) continue;
      if (!lineOfSight(state, pos, { x: wx, y: wy })) continue;
      bestBand = band;
      bestDistSq = dSq;
      seedTx = tx;
      seedTy = ty;
    }
  }
  if (seedTx < 0) return null;
  // Grow the pocket: average the fogged cells in a small window around the seed,
  // requiring a minimum size so a lone stray cell never becomes a detour.
  const win = 3;
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  for (let ty = seedTy - win; ty <= seedTy + win; ty++) {
    if (ty < 0 || ty >= rows) continue;
    for (let tx = seedTx - win; tx <= seedTx + win; tx++) {
      if (tx < 0 || tx >= cols) continue;
      if (state.explored[ty * cols + tx] === 1) continue;
      sumX += (tx + 0.5) * cell;
      sumY += (ty + 0.5) * cell;
      count++;
    }
  }
  if (count < FOG_BLOB_MIN_CELLS) return null;
  return { x: sumX / count, y: sumY / count };
}

/** The fraction of the fog grid the hero has uncovered so far (0..1) — the
 * COVERAGE gauge that tells the sweep when it has discovered enough (his side +
 * the middle) and should stop fanning out and head for the boss. Pure. */
function exploredFraction(state: GameState): number {
  const grid = state.explored;
  if (grid.length === 0) return 1;
  let n = 0;
  for (let i = 0; i < grid.length; i++) n += grid[i]!;
  return n / grid.length;
}

/** Coverage (fraction of the map) the sweep must gain to count as real EXPLORATION
 * HEADWAY — below it, the crawl of the reveal circle around a bogged hero doesn't
 * read as progress. */
const EXPLORE_PROGRESS_EPS = 0.03;
/** Making no {@link EXPLORE_PROGRESS_EPS} coverage headway for this long (sim ms)
 * means the sweep is STUCK — the bot gives up discovering and commits to the boss
 * (the safety that stops boss-level parity from trapping a bogged run). Generous,
 * so it's a genuine stall, not a brief scuffle. */
const EXPLORE_STALL_MS = 15_000;

/** Once per tick, gauge EXPLORATION HEADWAY by map coverage and LATCH `done` once
 * it stalls ({@link EXPLORE_STALL_MS} without an {@link EXPLORE_PROGRESS_EPS}
 * gain) — so a hero who can neither reach boss-level parity nor uncover more map
 * stops looping on fog and heads for the boss. Called from {@link botAct}; mutates
 * only bot memory, so determinism holds. */
function trackExploreStall(bot: Bot, state: GameState): void {
  const frac = exploredFraction(state);
  const now = state.stats.timeMs;
  if (!bot.explore || bot.explore.levelId !== state.level.id) {
    bot.explore = {
      levelId: state.level.id,
      mark: frac,
      markMs: now,
      done: false,
    };
    return;
  }
  const e = bot.explore;
  if (e.done) return;
  if (frac >= e.mark + EXPLORE_PROGRESS_EPS) {
    e.mark = frac;
    e.markMs = now;
  } else if (now - e.markMs > EXPLORE_STALL_MS) {
    e.done = true; // stalled for good — commit to the boss for the rest of the run
  }
}

/** Has the exploration sweep given up on this level (coverage stalled)? Then the
 * bot commits to the boss even short of parity/coverage — see {@link macroTarget}. */
function exploreStalled(bot: Bot): boolean {
  return bot.explore?.done === true;
}

/** The anchor of the nearest spawn point that still owes mobs (dormant or
 * mid-drip) within `SPAWNER_CLEAR_RANGE` of the hero, or null — the patch the
 * bot holds and clears before the path lets it advance. Null on levels that
 * author no spawners (inherently gating this behavior to spawner levels). */
function activeSpawnerNear(state: GameState): Vec2 | null {
  let best: Vec2 | null = null;
  let bestD = SPAWNER_CLEAR_RANGE;
  for (const spawner of state.spawners) {
    // Only a point that is ACTIVELY emitting holds the hero — a dormant one
    // lying ahead must not, or the next point would always pin him short of it
    // and he would never advance. It arms (→ active) as he walks into range,
    // and once it has emitted its queue (→ drained) he moves on, mopping up the
    // chasers as he goes.
    if (spawner.status !== "active" || spawner.queue.length === 0) continue;
    const d = distance(state.player.pos, spawner.at);
    if (d < bestD) {
      best = spawner.at;
      bestD = d;
    }
  }
  return best;
}

/**
 * True when simply backing off the pack won't open a gap — foes hem the hero in
 * on the RETREAT side too (behind the direction away from the pack's centroid),
 * so he must punch through rather than hug the edge. A dense pack on ONE side
 * only is NOT encircled: he can just back off along the open lane.
 */
function isEncircled(state: GameState, packed: Enemy[]): boolean {
  const pos = state.player.pos;
  const cx = packed.reduce((s, e) => s + e.pos.x, 0) / packed.length;
  const cy = packed.reduce((s, e) => s + e.pos.y, 0) / packed.length;
  let rx = pos.x - cx;
  let ry = pos.y - cy;
  const rd = Math.hypot(rx, ry);
  if (rd < 1) return true; // centroid on top of him → bodies all around
  rx /= rd;
  ry /= rd;
  // A packed foe within ~60° of the retreat direction blocks the way out.
  return packed.some((e) => {
    const ex = e.pos.x - pos.x;
    const ey = e.pos.y - pos.y;
    const d = Math.hypot(ex, ey) || 1;
    return (ex / d) * rx + (ey / d) * ry > 0.5;
  });
}

/** How many directions the escape fan samples around the hero. */
const ESCAPE_SAMPLES = 16;
/** A lane scoring below this pressure counts as OPEN — the openness gauge the
 * escape-route guard counts against `escapeLaneMin` (see escapeLaneScores). */
const OPEN_LANE_SCORE = 3;
/** Extra score charged to an escape lane pointing FORWARD along the spawn→boss
 * axis (scaled by alignment): fleeing toward the objective runs into the fresh
 * spawns, so between two comparably clear lanes the backward one wins. A
 * TIEBREAKER, deliberately smaller than what one body blocking a lane costs
 * (~5+) — when the only real gap in a ring lies forward, the hero still takes
 * it rather than punching through bodies to retreat "safely". Waived when a
 * nuke is banked (the daring read). */
const ESCAPE_FORWARD_PENALTY = 4;

/**
 * Score every lane of the escape fan: enemy pressure ahead (closer and more
 * head-on foes weigh heavier), a penalty for running into the level edge, and
 * — with `avoidForward` — a penalty for lanes pointing up the spawn→boss axis
 * (safe ground lies BEHIND; the fresh spawns live ahead). Lower is opener.
 * Deterministic (fixed sample); shared by the emergency escape pick and the
 * escape-route guard so "open" means one thing.
 */
function escapeLaneScores(
  state: GameState,
  near: Enemy[],
  avoidForward: boolean,
): number[] {
  const pos = state.player.pos;
  const axis = avoidForward ? objectiveAxis(state) : null;
  const scores: number[] = [];
  for (let i = 0; i < ESCAPE_SAMPLES; i++) {
    const angle = (i / ESCAPE_SAMPLES) * Math.PI * 2;
    const dir = { x: Math.cos(angle), y: Math.sin(angle) };
    let score = 0;
    for (const e of near) {
      const ex = e.pos.x - pos.x;
      const ey = e.pos.y - pos.y;
      const d = Math.hypot(ex, ey) || 1;
      // How much this foe blocks THIS lane: 1 dead ahead, 0 to the side/behind.
      const ahead = (ex / d) * dir.x + (ey / d) * dir.y;
      if (ahead <= 0) continue; // a foe behind us doesn't block the way ahead
      score += (ahead * ahead * THREAT_RADIUS) / d; // nearer + more head-on = worse
    }
    // Penalise a lane that runs into the level edge — no room to flee there.
    const tx = pos.x + dir.x * ESCAPE_DISTANCE;
    const ty = pos.y + dir.y * ESCAPE_DISTANCE;
    const margin = Math.min(
      tx,
      state.level.width - tx,
      ty,
      state.level.height - ty,
    );
    if (margin < 0)
      score += 1000; // off the map
    else if (margin < 80) score += (80 - margin) * 4; // hugging a wall
    // Fleeing FORWARD runs into the fresh spawns — charge the lane by how
    // squarely it points up the axis, so the retreat breaks backward/sideways.
    if (axis) {
      const fwd = dir.x * axis.dir.x + dir.y * axis.dir.y;
      if (fwd > 0) score += fwd * ESCAPE_FORWARD_PENALTY;
    }
    scores.push(score);
  }
  return scores;
}

/** The world point down the openest lane of a scored escape fan. */
function bestLanePoint(state: GameState, scores: number[]): Vec2 {
  const pos = state.player.pos;
  let bestI = 0;
  let bestScore = Infinity;
  for (let i = 0; i < scores.length; i++) {
    const s = scores[i] as number;
    if (s < bestScore) {
      bestScore = s;
      bestI = i;
    }
  }
  const angle = (bestI / ESCAPE_SAMPLES) * Math.PI * 2;
  return {
    x: pos.x + Math.cos(angle) * ESCAPE_DISTANCE,
    y: pos.y + Math.sin(angle) * ESCAPE_DISTANCE,
  };
}

/**
 * Trace the best path OUT of a pack: sample directions around the hero and pick
 * the openest — the one with the least enemy pressure ahead and clear ground to
 * run into (see {@link escapeLaneScores}). With `avoidForward`, safe ground is
 * kept BEHIND the hero: a lane up the spawn→boss axis is penalised so he breaks
 * backward toward cleared ground instead of into the fresh spawns.
 */
function bestEscapeTarget(
  state: GameState,
  near: Enemy[],
  avoidForward = false,
): Vec2 {
  return bestLanePoint(state, escapeLaneScores(state, near, avoidForward));
}

// ---- Geometry helpers ------------------------------------------------------

/** Steering input toward a world position (clamped inside the level). */
function steer(state: GameState, target: Vec2, jump = false): GameInput {
  return {
    steering: true,
    target: {
      x: clamp(target.x, 20, state.level.width - 20),
      y: clamp(target.y, 20, state.level.height - 20),
    },
    jump,
  };
}

/** How far ahead the wall-avoidance probe casts a candidate heading. */
const NAV_LOOKAHEAD = 140;
/** Candidate heading deflections (radians) fanned out from the straight bearing,
 * nearest-to-straight first so the hero deflects as little as the wall demands. */
const NAV_DEFLECTIONS = [
  0,
  0.6,
  -0.6,
  1.15,
  -1.15,
  1.7,
  -1.7,
  2.3,
  -2.3,
  Math.PI,
];

/**
 * A no-pathfinding runner's LOCAL wall avoidance: turn a raw nav goal into a
 * steering sub-target the hero can actually walk to without wedging on a shelf.
 * If his body can sweep straight to the goal, aim straight; otherwise fan
 * candidate headings out from the direct bearing and pick the openest one that
 * still makes progress — so a shelf between him and the next waypoint gets
 * ROUNDED instead of pressed into. This is what unsticks a hero the horde has
 * shoved off the corridor into a wall pocket (straight-line steering there just
 * grinds him into the wall forever). Used for the TRAVEL goals (path/boss/escape)
 * AND the fight give-ground/drift/hold-off moves, so a retreat under pressure
 * rounds a scattered rock instead of wedging on it. Gated to path levels (an open
 * map's wall-slide handles the odd ridge, and deflecting there only wanders), and
 * falls back to the raw goal when nothing is clear (better to nudge than freeze).
 */
function navTarget(state: GameState, goal: Vec2): Vec2 {
  // Wall avoidance is a MAZE tactic — it's for the authored-path levels whose
  // corridors a straight steer would wedge on. On an open map (no path) the
  // engine's wall-slide already carries a straight steer past the odd ridge, and
  // deflecting there only wanders, so keep the old behaviour.
  if (!onPathLevel(state)) return goal;
  const from = state.player.pos;
  const r = PLAYER.radius;
  // A clear body-width sweep straight to the goal → just go.
  if (!blockedByObstacle(state, from, goal, r)) return goal;
  const dx = goal.x - from.x;
  const dy = goal.y - from.y;
  const dist = Math.hypot(dx, dy) || 1;
  const probe = Math.min(dist, NAV_LOOKAHEAD);
  const base = Math.atan2(dy, dx);
  let best: Vec2 | null = null;
  let bestScore = -Infinity;
  for (const off of NAV_DEFLECTIONS) {
    const a = base + off;
    const p = {
      x: clamp(from.x + Math.cos(a) * probe, 20, state.level.width - 20),
      y: clamp(from.y + Math.sin(a) * probe, 20, state.level.height - 20),
    };
    if (insideObstacle(state, p, r)) continue;
    if (blockedByObstacle(state, from, p, r)) continue;
    // Prefer a step that (a) can then SEE the goal (rounds the corner) and (b)
    // ends closer to it, penalising a bigger turn so we deflect minimally.
    const nd = Math.hypot(goal.x - p.x, goal.y - p.y);
    const sees = blockedByObstacle(state, p, goal, r) ? 0 : 1000;
    const score = sees - nd - Math.abs(off) * 40;
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best ?? goal;
}

/** Steer toward a TRAVEL goal with local wall avoidance (see {@link navTarget}) —
 * the movement equivalent of {@link steer} for the short reactive FIGHT moves
 * (give-ground, edge-drift, punch-out) that steer a fixed distance, not toward a
 * far goal. Long-haul travel uses {@link routeSteer} (global A*) instead. */
function navSteer(state: GameState, goal: Vec2, jump = false): GameInput {
  return steer(state, navTarget(state, goal), jump);
}

// === GLOBAL PATHFINDING TRAVEL (see pathfind.ts) ===
// The macro-travel primitive: instead of only sliding along the walls it can see
// ~140px ahead (navTarget), the bot plans a real A* ROUTE across the whole level
// to any goal — a chest deep in a walled pocket, an elite two basins over, the
// boss — and follows it. This is what lets a level be validated WITHOUT hand-
// authoring a bot path: the runner finds its own way to every reachable thing.

/** Retire a route waypoint once the hero is this close (world px). */
const ROUTE_REACH = 48;
/** Replan when the goal has moved more than this from the planned goal. */
const ROUTE_REPLAN_GOAL = 80;
/** Replan when the hero has been shoved this far off the planned route. */
const ROUTE_STRAY = 170;

/** Lazily build + cache the level's static nav grid on the bot (see the `route`
 * memory). Rebuilds on a level change. Returns the route cache. */
function ensureRoute(bot: Bot, state: GameState): NonNullable<Bot["route"]> {
  if (!bot.route || bot.route.levelId !== state.level.id) {
    bot.route = {
      levelId: state.level.id,
      grid: buildNavGrid(state),
      goal: { x: 0, y: 0 },
      path: [],
      index: 0,
    };
  }
  return bot.route;
}

/** How far the hero sits from the nearest remaining route segment — the "shoved
 * off the corridor" gauge that forces a replan. */
function strayedFromRoute(rc: NonNullable<Bot["route"]>, from: Vec2): boolean {
  if (rc.index >= rc.path.length) return true;
  let bestSq = Infinity;
  let prev = from;
  for (let i = rc.index; i < rc.path.length; i++) {
    const node = rc.path[i]!;
    const dSq = segmentDistanceSq(from, prev, node);
    if (dSq < bestSq) bestSq = dSq;
    prev = node;
  }
  return bestSq > ROUTE_STRAY * ROUTE_STRAY;
}

/**
 * The immediate world sub-target to steer toward on the A* route to `goal`:
 * (re)plans a route when the cache is stale, retires reached waypoints, then
 * STRING-PULLS to the furthest waypoint still in clear line of body-sight — so
 * the hero cuts straight across open ground and only kinks at the turning points
 * the walls actually force. Falls back to the raw goal when it's unreachable
 * (let the local steering try). Pure w.r.t. state + the bot's route memory.
 */
function routeTarget(bot: Bot, state: GameState, goal: Vec2): Vec2 {
  const rc = ensureRoute(bot, state);
  const from = state.player.pos;
  // String-pull integrity: the next unretired waypoint must be REACHABLE in a
  // straight body-width sweep from where the hero actually stands. When the
  // horde shoves him into a wall pocket the corridor doesn't see, he can sit
  // WITHIN the stray band yet have a thin wall between him and the waypoint —
  // steering at it just grinds him into the wall (the measured wedge loop).
  // A blocked next waypoint means the plan's premise failed: replan from HERE,
  // so A* routes him around the wall he's actually behind.
  const nextBlocked =
    rc.index < rc.path.length &&
    blockedByObstacle(state, from, rc.path[rc.index]!, PLAYER.radius);
  const stale =
    rc.path.length === 0 ||
    distance(goal, rc.goal) > ROUTE_REPLAN_GOAL ||
    strayedFromRoute(rc, from) ||
    nextBlocked;
  if (stale) {
    const path = findPath(rc.grid, from, goal);
    rc.goal = { x: goal.x, y: goal.y };
    rc.path = path ?? [];
    rc.index = 0;
    if (!path) return goal; // walled off — nudge straight and hope
  }
  while (
    rc.index < rc.path.length &&
    distance(from, rc.path[rc.index]!) <= ROUTE_REACH
  )
    rc.index++;
  if (rc.index >= rc.path.length) return goal;
  const r = PLAYER.radius;
  let target = rc.path[rc.index]!;
  for (let i = rc.path.length - 1; i >= rc.index; i--) {
    if (!blockedByObstacle(state, from, rc.path[i]!, r)) {
      target = rc.path[i]!;
      break;
    }
  }
  return target;
}

/** Steer toward a far TRAVEL goal along a global A* route (see {@link routeTarget})
 * — the macro-travel movement primitive that rounds every wall on the way, not
 * just the one 140px ahead. */
function routeSteer(
  bot: Bot,
  state: GameState,
  goal: Vec2,
  jump = false,
): GameInput {
  return steer(state, routeTarget(bot, state, goal), jump);
}

// === AUTOMATIC CONTENT ENGAGEMENT ===
// The bot is the level's CONTROL: it proves every chest and elite the designer
// placed is reachable and the map is beatable, WITHOUT the level authoring any
// bot-specific hint. It sweeps to the nearest A*-reachable un-engaged piece —
// the map's ELITES first (its named mid-bosses are prioritized objectives),
// then the chest caches — commits until that piece is consumed, then re-picks,
// and only commits to the boss once nothing reachable is left to discover.

/** Coarse cell (world px) the bot's ROUGH IDEA of a foe's position snaps to —
 * he knows which patch of the map an elite (or a hunted enemy) holds and heads
 * that way, not its exact pixel. Coarser than `ROUTE_REPLAN_GOAL`, so a target
 * milling about its patch doesn't thrash the A* replan every tick; `findPath`
 * snaps a cell centre that lands in a wall onto open floor. */
const ROUGH_OBJECTIVE_CELL = 160;

/** `p` snapped to the centre of its {@link ROUGH_OBJECTIVE_CELL} — the "rough
 * idea of where it is" every live-foe objective is tracked at. */
function roughPos(p: Vec2): Vec2 {
  const c = ROUGH_OBJECTIVE_CELL;
  return {
    x: (Math.floor(p.x / c) + 0.5) * c,
    y: (Math.floor(p.y / c) + 0.5) * c,
  };
}

/** The world positions of every un-looted CHEST on the field (a chest is a
 * breakable obstacle flagged `chest`; looting removes it). These are the OFF-PATH
 * caches the sweep detours for — the whole point of "discover the map". */
function chestTargets(state: GameState): Vec2[] {
  return state.obstacles.filter((o) => o.chest).map((o) => o.pos);
}

/** The nearest un-looted CHEST within {@link BotTuning.chestDetourDist} the
 * body can sweep STRAIGHT to — the opportunistic "crack it while we're here"
 * read ({@link survive} step 1), so a quiet march never walks past a loot
 * locker. Chests are jumpable cover, so the chest itself never blocks the
 * sweep — only a real wall culls one. */
function nearestChestNearby(
  state: GameState,
  tune: BotTuning,
): Obstacle | undefined {
  if (tune.chestDetourDist <= 0) return undefined;
  let best: Obstacle | undefined;
  let bestD = tune.chestDetourDist;
  for (const o of state.obstacles) {
    if (!o.chest) continue;
    const d = distance(o.pos, state.player.pos);
    if (d >= bestD) continue;
    if (blockedByObstacle(state, state.player.pos, o.pos, PLAYER.radius))
      continue;
    best = o;
    bestD = d;
  }
  return best;
}

/** The ROUGH positions ({@link roughPos} cells) of every live ELITE the hero
 * should hunt — the map's named mid-bosses, first-class macro objectives
 * beside the chest caches (see {@link nearestContent}): the bot knows roughly
 * where each one holds court and marches in that direction, so no named foe is
 * ever left standing when the boss falls. The coarse cell (not the exact
 * pixel) is the deliberate "rough idea": the target stays put while the elite
 * mills about its patch.
 *
 * The pool only OPENS once the hero is boss-ready ({@link readyForBoss}) —
 * before that the normal leveling flow (spawner farm, the directional fog
 * sweep down the authored weave) already meets the route's elites at the
 * intended pace, and dedicated under-levelled cross-map marches were measured
 * to wedge the hero in the late-wave flood and cost him the boss. So the hunt
 * is the endgame GUARANTEE: any elite the sweep missed is sought out before
 * the boss is committed. A leftover elite still above even the boss-ready
 * hero's level (per {@link BotTuning.bossEngageMargin}) stays excluded, and
 * apparitions (untouchable scenery) never count. */
function eliteTargets(
  state: GameState,
  tune: BotTuning,
): { id: number; pos: Vec2 }[] {
  if (!readyForBoss(state, tune)) return [];
  const out: { id: number; pos: Vec2 }[] = [];
  for (const e of state.enemies) {
    const def = enemyDef(e.defId);
    if (def.role !== "elite" || def.apparition) continue;
    if (state.player.level < Math.max(1, e.mlvl - tune.bossEngageMargin))
      continue;
    out.push({ id: e.id, pos: roughPos(e.pos) });
  }
  return out;
}

/** The skip-list key for an abandoned ELITE hunt — keyed by the enemy's ID,
 * not its cell: an elite moves, so a positional key would stop matching and
 * the abandoned hunt would come straight back. */
function eliteKey(id: number): string {
  return `elite:${id}`;
}

/** A cheap signature of the remaining content — the un-looted chest count plus
 * the rough cells of the huntable elites. The committed content target is
 * re-picked only when this changes (a chest cracked, an elite slain or grown
 * huntable, a hunted elite drifting to a new patch), so the bot holds one
 * target instead of dithering every tick. */
function contentSig(state: GameState, tune: BotTuning): number {
  let sig = chestTargets(state).length;
  for (const e of eliteTargets(state, tune)) {
    sig = (sig * 31 + e.id + e.pos.x * 3 + e.pos.y * 7) % 2147483647;
  }
  return sig;
}

/** A stable key for a content position (rounded), so an ABANDONED target can be
 * recognised and skipped across re-picks even as the hero moves. */
function contentKey(p: Vec2): string {
  return `${Math.round(p.x)},${Math.round(p.y)}`;
}

/** How long (sim ms) the bot may fail to shorten its ROUTE to a committed content
 * target before giving up on it — a cache it's A*-reachable to but keeps getting
 * shoved away from. Generous, so it's a genuine can't-get-there, not a scuffle.
 * On a wave map every march crosses live fights, and the old 12s window
 * abandoned chest walks mid-scuffle (measured: the break-room locker was
 * skipped while the hero fought 250px from its door) — so a chest walk now
 * gets the same patience as an elite hunt. */
const CONTENT_ABANDON_MS = 20_000;
/** The remaining route must shrink by this many px² to count as headway, so
 * jitter around a wall doesn't reset the timer. */
const CONTENT_PROGRESS_EPS = 80 * 80;
/** The abandon window for an ELITE hunt — more patient than a chest walk's
 * {@link CONTENT_ABANDON_MS}: the march to a named foe crosses live
 * battlefields, and every scuffle stalls the route without meaning the elite
 * is unreachable. */
const ELITE_ABANDON_MS = 20_000;
/** Once the remaining route is this short the bot is basically ON the target
 * (engaging it) — combat/looting will consume it, so the abandon timer holds
 * off. Above it, a stalled route means he genuinely can't get there. */
const CONTENT_ENGAGE_ROUTE = 320;

/** The remaining A* route length from the hero through the cached route to its
 * goal (world px) — the TRUE "how far to actually reach it", which (unlike
 * euclidean distance) reflects the up-and-around a wall forces. */
function remainingRoute(rc: NonNullable<Bot["route"]>, from: Vec2): number {
  if (rc.index >= rc.path.length) return distance(from, rc.goal);
  let len = distance(from, rc.path[rc.index]!);
  for (let i = rc.index; i < rc.path.length - 1; i++)
    len += distance(rc.path[i]!, rc.path[i + 1]!);
  return len;
}

/** Once per tick, gauge headway toward the committed content target and
 * ABANDON it once none is made within {@link CONTENT_ABANDON_MS} — pushing its
 * key onto the per-level skip set so the next re-pick moves on (and the boss
 * finally gets committed). FAR from the piece, headway is the remaining ROUTE
 * length shrinking (route, not euclidean distance, so a hero pinned against
 * the wall of a sealed pocket still reads as "can't get there"). ON the
 * piece, headway is its BAR making NEW LOWS — an elite's hp, a chest's break
 * hp — because being parked next to it consumes nothing: an elite fight the
 * hero keeps resetting (bleed → retreat → it leashes home and regens it all
 * back) and a chest the wave flood never lets him crack are STALEMATES that
 * would otherwise pin the run for the rest of the clock. An abandoned elite
 * is skipped by its enemy id ({@link eliteKey}); a chest by its cell. Called
 * from {@link botAct}; mutates only bot memory, so determinism holds. */
function trackContentAbandon(bot: Bot, state: GameState): void {
  const c = bot.content;
  const rc = bot.route;
  if (!c || !c.target || !rc) return;
  // Only gauge while the cached route actually leads to this target.
  if (distance(rc.goal, c.target) > ROUTE_REPLAN_GOAL) return;
  const rem = remainingRoute(rc, state.player.pos);
  const remSq = rem * rem;
  let headway = false;
  if (rem <= CONTENT_ENGAGE_ROUTE) {
    // ON the piece: headway = its bar coming down past the lowest seen (an
    // elite's hp, a chest's break hp) — being parked next to it is not enough.
    const target = c.target;
    const hp =
      c.kind === "elite"
        ? state.enemies.find((e) => e.id === c.enemyId)?.hp
        : state.obstacles.find(
            (o) => o.chest && o.pos.x === target.x && o.pos.y === target.y,
          )?.hp;
    if (hp === undefined) return; // consumed — the sig change re-picks next read
    if (c.minHp === undefined || hp < c.minHp) {
      c.minHp = hp;
      headway = true;
    }
  } else if (remSq < c.bestDistSq - CONTENT_PROGRESS_EPS) {
    headway = true;
  }
  if (headway) {
    c.bestDistSq = Math.min(c.bestDistSq, remSq);
    c.bestTimeMs = state.stats.timeMs;
    return;
  }
  // An elite hunt crosses live battlefields — fights stall the march far more
  // than a chest walk, so it gets a more patient window before giving up.
  const abandonMs = c.kind === "elite" ? ELITE_ABANDON_MS : CONTENT_ABANDON_MS;
  if (state.stats.timeMs - c.bestTimeMs > abandonMs) {
    if (!bot.contentSkip || bot.contentSkip.levelId !== state.level.id)
      bot.contentSkip = { levelId: state.level.id, keys: [] };
    bot.contentSkip.keys.push(
      c.kind === "elite" && c.enemyId !== undefined
        ? eliteKey(c.enemyId)
        : contentKey(c.target),
    );
    c.target = null; // force a re-pick (excluding the skipped key) next read
  }
}

/** Total route length of an A* waypoint list from `from` (world px) — the cost
 * used to pick the NEAREST reachable content piece. */
function routeLength(from: Vec2, path: Vec2[]): number {
  let len = 0;
  let prev = from;
  for (const p of path) {
    len += distance(prev, p);
    prev = p;
  }
  return len;
}

/**
 * The nearest A*-REACHABLE un-engaged content — a huntable ELITE (at its
 * {@link eliteTargets} rough cell) or a chest cache, cheapest route first — or
 * null when every reachable piece has been consumed. Cached on the bot and
 * recomputed only when the content inventory changes — so the run commits to
 * one piece, sweeps to it (engaging it as combat takes over near it), and
 * re-picks the next once it's gone. Unreachable pieces (walled off with no
 * key) are skipped, so a genuinely sealed cache never stalls the sweep. Pure
 * w.r.t. state + the bot's memory.
 */
function nearestContent(
  bot: Bot,
  state: GameState,
  tune: BotTuning,
): Vec2 | null {
  const rc = ensureRoute(bot, state);
  const sig = contentSig(state, tune);
  const needPick =
    !bot.content ||
    bot.content.levelId !== state.level.id ||
    bot.content.sig !== sig ||
    bot.content.target === null; // abandoned → re-pick, excluding the skip set
  if (needPick) {
    const from = state.player.pos;
    const skip =
      bot.contentSkip && bot.contentSkip.levelId === state.level.id
        ? bot.contentSkip.keys
        : [];
    // STICKY elite commitment: the content inventory changed (sig) but the
    // committed elite is still alive, huntable, and un-skipped → keep hunting
    // IT — just track its current rough cell — rather than re-picking the
    // nearest. A field of drifting elites re-signs every few seconds, and
    // re-picking each time thrashed the march between two hunts for minutes
    // (measured) instead of finishing one.
    const prev = bot.content;
    if (
      prev &&
      prev.levelId === state.level.id &&
      prev.kind === "elite" &&
      prev.target !== null &&
      prev.enemyId !== undefined &&
      !skip.includes(eliteKey(prev.enemyId))
    ) {
      const held = eliteTargets(state, tune).find((t) => t.id === prev.enemyId);
      if (held) {
        // The elite drifted to a NEW cell → restart the approach gauge: the
        // ratcheted best-route-so-far belongs to the OLD cell, and holding it
        // makes a target that flaps between two cells read as "no headway"
        // and get spuriously abandoned mid-march (measured). The near-elite
        // hp gauge still catches a genuine stalemate.
        if (held.pos.x !== prev.target.x || held.pos.y !== prev.target.y) {
          prev.bestDistSq = Infinity;
          prev.bestTimeMs = state.stats.timeMs;
        }
        prev.sig = sig;
        prev.target = { x: held.pos.x, y: held.pos.y };
        return prev.target;
      }
    }
    let best: Vec2 | null = null;
    let bestKind: "elite" | "chest" | null = null;
    let bestId: number | undefined;
    // ONE nearest-first pool: the huntable elites (the named objectives the
    // sweep is now aware of) alongside the chest caches, cheapest route wins —
    // so an elite is a genuine destination, yet a cache on the way still gets
    // cracked first. (A strict elites-before-chests ordering was measured to
    // drag the hero on long cross-map marches into the late-wave flood and
    // cost him the boss.)
    const candidates: { kind: "elite" | "chest"; id?: number; pos: Vec2 }[] = [
      ...eliteTargets(state, tune).map((e) => ({
        kind: "elite" as const,
        id: e.id,
        pos: e.pos,
      })),
      ...chestTargets(state).map((pos) => ({ kind: "chest" as const, pos })),
    ];
    let bestCost = Infinity;
    for (const t of candidates) {
      const key =
        t.kind === "elite" && t.id !== undefined
          ? eliteKey(t.id)
          : contentKey(t.pos);
      if (skip.includes(key)) continue;
      const path = findPath(rc.grid, from, t.pos);
      if (!path) continue;
      const cost = routeLength(from, path);
      if (cost < bestCost) {
        bestCost = cost;
        best = { x: t.pos.x, y: t.pos.y };
        bestKind = t.kind;
        bestId = t.id;
      }
    }
    // SECOND CHANCE for abandoned chests: the pool is otherwise dry, so clear
    // the chest cells off the skip list ONCE (see `contentSkip.retriedChests`)
    // and let the next re-pick march back — an early-run abandon is usually a
    // walkover for the leveled late-run hero, and the level should end with
    // every locker cracked before the boss seals it. Elite skips stay.
    if (
      best === null &&
      bot.contentSkip &&
      bot.contentSkip.levelId === state.level.id &&
      !bot.contentSkip.retriedChests &&
      bot.contentSkip.keys.some((k) => !k.startsWith("elite:"))
    ) {
      bot.contentSkip.keys = bot.contentSkip.keys.filter((k) =>
        k.startsWith("elite:"),
      );
      bot.contentSkip.retriedChests = true;
    }
    bot.content = {
      levelId: state.level.id,
      sig,
      target: best,
      kind: bestKind,
      enemyId: bestId,
      // Seed the route-length gauge at Infinity so the first measured route
      // counts as progress and starts the abandon clock cleanly. (A held
      // elite never reaches this re-pick — the sticky path above keeps its
      // gauges alive on the same content object.)
      bestDistSq: Infinity,
      bestTimeMs: state.stats.timeMs,
    };
  }
  return bot.content?.target ?? null;
}

/** How long (sim ms) a latched anti-loiter hunt may go WITHOUT CLOSING on its
 * foe before it is ABANDONED — the safety that keeps a foe the hero can't
 * actually get to (walled off, or endlessly shoved away from) from pinning the
 * whole run to one march. Progress-gauged, not a flat clock: a long jog that
 * IS closing the gap keeps its hunt. On abandon the fight clock resets, so the
 * next hunt latches a fresh lull later. */
const SEEK_STALL_MS = 12_000;
/** The hunted gap must shrink by this many px to count as headway, so jitter
 * around a wall doesn't reset the abandon timer. */
const SEEK_PROGRESS_EPS = 40;

/**
 * Once per tick, run the ANTI-LOITER bookkeeping on `bot.seek`: refresh the
 * "last in a fight" clock while the hero is engaged (a live foe inside the
 * local threat ring, a hit just taken, or the scripted disarmed opening — near
 * a fight is not loitering), and once the fightless gap exceeds
 * {@link BotTuning.seekFightAfterMs} LATCH a hunt on the nearest enemy. The
 * latch holds until that foe is DOWN, a REAL fight finds the hero (a hit taken
 * — something else owns the tick now), or the hunt drags past the abandon
 * window. Merely brushing the threat ring — or landing the first blow — must
 * NOT end it: a stationary foe doesn't chase, so an early release would let
 * the macro plan pull the hero away mid-kill and re-open the very loiter the
 * hunt exists to close. Called from {@link decideAct}; mutates only bot
 * memory, so determinism holds.
 */
function trackEngagement(bot: Bot, state: GameState, tune: BotTuning): void {
  const now = state.stats.timeMs;
  if (!bot.seek || bot.seek.levelId !== state.level.id) {
    bot.seek = {
      levelId: state.level.id,
      lastEngagedMs: now,
      targetId: null,
      bestD: Infinity,
      bestMs: 0,
    };
    return;
  }
  const seek = bot.seek;
  const engaged =
    state.player.disarmed ||
    state.player.hurtFlashMs > 0 ||
    threatsWithin(state, THREAT_RADIUS).length > 0;
  if (engaged) seek.lastEngagedMs = now;
  if (seek.targetId !== null) {
    const foe = state.enemies.find((e) => e.id === seek.targetId);
    // Headway gauge: the hunt is healthy while the gap keeps shrinking.
    if (foe) {
      const d = distance(state.player.pos, foe.pos);
      if (d < seek.bestD - SEEK_PROGRESS_EPS) {
        seek.bestD = d;
        seek.bestMs = now;
      }
    }
    if (
      !foe ||
      state.player.hurtFlashMs > 0 ||
      now - seek.bestMs > SEEK_STALL_MS
    ) {
      seek.targetId = null;
      seek.lastEngagedMs = now; // a fresh lull gates the next hunt
    }
    return;
  }
  if (
    tune.seekFightAfterMs > 0 &&
    now - seek.lastEngagedMs > tune.seekFightAfterMs &&
    macroPreemptible(bot, state, tune)
  ) {
    const foe = nearestEnemy(state);
    if (foe) {
      seek.targetId = foe.id;
      seek.bestD = distance(state.player.pos, foe.pos);
      seek.bestMs = now;
    }
  }
}

/** May the anti-loiter hunt PREEMPT the current macro plan? Only when the plan
 * is aimless wandering — a fog sweep, a spawner hold, the no-goal fallback. A
 * committed DESTINATION is never preempted: the elite hunt and the boss push
 * already march on a foe, and the shop run / a chest cache finish something
 * the sweep needs finished — preempting those measurably turned a wave map
 * (whose mobs never run out) into an endless straggler farm: each lull's hunt
 * re-pointed the route off the errand, the errand's abandon clock never ran,
 * content never exhausted, and the boss was never committed. Pure w.r.t. state
 * + the bot's own caches. */
function macroPreemptible(
  bot: Bot,
  state: GameState,
  tune: BotTuning,
): boolean {
  const goal = macroTarget(bot, state, tune);
  const stall = state.merchant.pos;
  if (wantsMerchantVisit(state) && stall.x === goal.x && stall.y === goal.y)
    return false;
  const mark = bot.waypoint;
  if (mark && mark.x === goal.x && mark.y === goal.y) return false;
  const c = bot.content;
  if (c?.target && c.target.x === goal.x && c.target.y === goal.y) return false;
  const boss = bossPos(state);
  if (boss && boss.x === goal.x && boss.y === goal.y) return false;
  return true;
}

/** Is the macro plan MARCHING ON A NAMED OBJECTIVE — the committed elite hunt,
 * a committed CHEST errand, or the boss push? The read that flips the balanced
 * posture into its rush-the-objective aggro row and arms the gauntlet run (see
 * {@link survive}). A chest errand counts: its doorway is usually a flooded
 * chokepoint, and without the rush the edge-fight parks the hero at the door
 * trading blows until the errand is abandoned (measured: 45s at the break-room
 * gap, chest hp untouched). Pure w.r.t. state + the bot's own caches. */
function marchingOnFoe(bot: Bot, state: GameState, tune: BotTuning): boolean {
  const goal = macroTarget(bot, state, tune);
  const c = bot.content;
  if (
    c?.target &&
    (c.kind === "elite" || c.kind === "chest") &&
    c.target.x === goal.x &&
    c.target.y === goal.y
  )
    return true;
  const boss = bossPos(state);
  return boss !== undefined && boss.x === goal.x && boss.y === goal.y;
}

/** The ROUGH position of the latched anti-loiter hunt's foe, or null with no
 * hunt on. Fed into {@link macroTarget} ahead of the normal errands, so every
 * travel read — the sweep, the ADVANCE blend, the unstuck heading — marches on
 * the enemy while the hunt is live. Tracks the foe's {@link roughPos} cell, so
 * the bot heads in its direction without pixel-chasing it. */
function seekTarget(bot: Bot, state: GameState): Vec2 | null {
  const seek = bot.seek;
  if (!seek || seek.levelId !== state.level.id || seek.targetId === null)
    return null;
  const foe = state.enemies.find((e) => e.id === seek.targetId);
  if (!foe) return null; // slain — trackEngagement clears the latch next tick
  return roughPos(foe.pos);
}

/**
 * The macro destination the bot travels toward when it's free to move: the
 * latched ANTI-LOITER hunt first (idled past `seekFightAfterMs` without a
 * fight → march on the nearest enemy), else FARM the active spawner in this
 * patch (level up before advancing) while still under the boss-ready level,
 * else sweep to the nearest reachable un-engaged CONTENT — the map's huntable
 * ELITES first, then the chest caches — else DISCOVER NEW GROUND from the
 * hero's own side outward (directional fog coverage), else — with nothing left
 * to discover — the BOSS. This is the whole automatic-engagement order in one
 * place; the callers just route to whatever it returns.
 *
 * Exploration is EAGER but PARTIAL and DIRECTIONAL: while still UNDER the
 * boss-ready level the bot discovers new ground from its own side outward (spawn
 * side → middle, via {@link exploreTarget}) — but only up to
 * {@link BotTuning.exploreTargetFrac} of the map, then it stops fanning out. So
 * the leveling window is spent uncovering the hero's half rather than beelining
 * the path, the boss's side stays dark until the approach, and the sweep always
 * terminates at the boss: the moment he's boss-ready (or the coverage target is
 * hit) discovery ends and he commits — a combat-bogged run can't get stuck
 * chasing fog it will never fully clear.
 */
function macroTarget(bot: Bot, state: GameState, tune: BotTuning): Vec2 {
  // THE MERCHANT ERRAND: when a stall visit would actually resolve something —
  // bank the bag's outgrown junk, buy an upgrade the purse covers, mend a
  // spent kit (see `wantsMerchantVisit`) — the counter joins the travel plan:
  // URGENTLY when the hero is weapon-starved (farming with the sidearm is
  // slower than re-arming), otherwise as the errand between caches. The
  // harness runs the actual trade once he's at the counter (`tradeAtMerchant`),
  // which clears the want, so the errand can't loop.
  const errand = wantsMerchantVisit(state);
  if (errand && weaponStarved(state)) return state.merchant.pos;
  // A pinned GPS NUDGE outranks everything but the urgent shop run — the
  // caller pointed the bot at a coordinate, so he works his way there.
  if (bot.waypoint) return bot.waypoint;
  // The ANTI-LOITER hunt: gone too long without a fight, the bot marches on
  // the latched foe before any other errand — moving toward the enemy IS the
  // point (only the weapon-starved shop run above still outranks it).
  const hunt = seekTarget(bot, state);
  if (hunt) return hunt;
  const underLevel = !readyForBoss(state, tune);
  if (underLevel) {
    const spawner = activeSpawnerNear(state);
    if (spawner) return spawner;
  }
  const content = nearestContent(bot, state, tune);
  if (content) return content;
  if (errand) return state.merchant.pos;
  if (
    underLevel &&
    !exploreStalled(bot) &&
    exploredFraction(state) < tune.exploreTargetFrac
  ) {
    const fog = exploreTarget(state, tune);
    if (fog) return fog;
  }
  return bossPos(state) ?? furthestLandmark(state) ?? state.player.pos;
}

/** The short label for the macro goal `macroTarget` returned, for the BOT VIEW
 * thought bubble — so the overlay reads "SEEK CHEST" / "CLEAR SPAWNER" / "TO
 * BOSS" as the sweep works through the map. */
function macroThought(
  bot: Bot,
  state: GameState,
  tune: BotTuning,
  goal: Vec2,
): string {
  const stall = state.merchant.pos;
  if (wantsMerchantVisit(state) && stall.x === goal.x && stall.y === goal.y)
    return "TO SHOP";
  const mark = bot.waypoint;
  if (mark && mark.x === goal.x && mark.y === goal.y) return "TO MARK";
  const hunt = seekTarget(bot, state);
  if (hunt && hunt.x === goal.x && hunt.y === goal.y) return "SEEK FIGHT";
  if (!readyForBoss(state, tune) && activeSpawnerNear(state))
    return "CLEAR SPAWNER";
  const content = bot.content?.target;
  if (content && content.x === goal.x && content.y === goal.y)
    return bot.content?.kind === "elite" ? "HUNT ELITE" : "SEEK CHEST";
  const boss = bossPos(state);
  if (boss && boss.x === goal.x && boss.y === goal.y) return "TO BOSS";
  return "EXPLORE FOG";
}

/** Steer toward the current macro goal along its A* route, tagging the thought.
 * The unified macro-travel move — replaces the old authored-path march. */
function macroSteer(bot: Bot, state: GameState, tune: BotTuning): GameInput {
  const goal = macroTarget(bot, state, tune);
  think(bot, macroThought(bot, state, tune, goal));
  return routeSteer(bot, state, goal);
}

// === ANTI-WEDGE UNSTUCK ===
// A deterministic escape hatch for the LAST-RESORT wedge the smart nav can't
// think its way out of: the hero pinned in a concave wall pocket, or locked in
// perpetual flee at low HP with no medkit and nothing he can reach to fight, or
// oscillating on the spot. When he has made no PROGRESS for a while AND has no
// foe he could actually hit, the strategy has clearly failed — so we override it
// with a blind, deterministic sweep: drive a fixed heading for a burst, and if
// still stuck rotate the heading (goalward first, then fanning ± around it, out
// to a full circle). One of those headings is always open (short of being walled
// in on all sides), so this dislodges him from anything and hands control back
// to the normal nav the instant he's moving again.

/** Re-measure movement on this cadence (ms) — coarser than a tick so per-frame
 * jitter doesn't read as movement. */
const UNSTUCK_CHECK_MS = 400;
/** Physically moving less than this (world px) over a check window counts as
 * FROZEN. A full-speed hero clears far more per window, so only a genuine pin
 * (wall pocket, flee-lock at low HP with nothing reachable) trips it. */
const UNSTUCK_MIN_DISP = 34;
/** Frozen this long (with nothing to fight) → last-resort escape sweep. Kept
 * long so the escape is RARE — the smart nav owns ordinary threading; this only
 * breaks a true wedge the strategy can't think its way out of. */
const UNSTUCK_TRIGGER_MS = 2400;
/** Hold each swept heading this long before rotating to the next. */
const UNSTUCK_BURST_MS = 600;
/** How far ahead the escape steer aims along the swept heading. */
const UNSTUCK_REACH = 240;

/** How far the contour trace's body-width probe looks along a candidate escape
 * heading — short enough that a narrow pocket still finds its open mouth, long
 * enough that "open" means real walking room, not a pixel of slack. */
const UNSTUCK_PROBE = 90;
/** Once escaping, keep committing until the hero has physically moved THIS far
 * from where the wedge began — the hysteresis that lets a full sweep round a
 * wall instead of aborting the instant he twitches and the flee drags him back. */
const UNSTUCK_EXIT_DIST = 160;

/** Is there a foe the hero could actually strike right now — in weapon range with
 * a clear line? While there is, standing still is FIGHTING, not being wedged, so
 * the stall detector holds off (a boss/pack brawl never trips the unstuck). */
function hasReachableFoe(state: GameState): boolean {
  const range = weaponRangeFor(state, state.player.equipment.weapon);
  const r = PLAYER.radius;
  for (const enemy of state.enemies) {
    if (enemyDef(enemy.defId).apparition) continue;
    if (distance(state.player.pos, enemy.pos) > range) continue;
    if (!blockedByObstacle(state, state.player.pos, enemy.pos, r)) return true;
  }
  return false;
}

/**
 * The deterministic anti-wedge override (see the block comment above), or null
 * when the hero is making progress or legitimately fighting. Also OWNS the
 * progress bookkeeping on `bot.nav`, so it must run every tick. Deterministic:
 * the swept heading is a pure function of how long he's been stuck and where the
 * objective lies — no RNG, no wall clock.
 */
function unstuckInput(
  bot: Bot,
  state: GameState,
  tune: BotTuning,
): GameInput | null {
  // Same as the wall avoidance: the deterministic escape is a MAZE last-resort
  // (path levels). Open maps never wedged the old bot, so leave them untouched.
  if (!onPathLevel(state)) return null;
  const p = state.player.pos;
  const now = state.stats.timeMs;
  if (!bot.nav) {
    bot.nav = {
      lastPos: { x: p.x, y: p.y },
      lastTimeMs: now,
      stuckMs: 0,
      escaping: false,
      escapeStartMs: 0,
      escapeStartPos: { x: p.x, y: p.y },
      escapeHeading: null,
    };
    return null;
  }
  const nav = bot.nav;
  const elapsed = now - nav.lastTimeMs;
  if (elapsed >= UNSTUCK_CHECK_MS) {
    // FROZEN = barely moved this window AND nothing he could reach to fight (a
    // patch brawl legitimately holds him in place, so it never reads as wedged).
    const moved = distance(p, nav.lastPos);
    if (moved >= UNSTUCK_MIN_DISP || hasReachableFoe(state)) nav.stuckMs = 0;
    else nav.stuckMs += elapsed;
    nav.lastPos = { x: p.x, y: p.y };
    nav.lastTimeMs = now;
  }

  // Enter the escape only once genuinely frozen; stay committed (hysteresis)
  // until he's physically clear of the wedge, so a full sweep can round a wall
  // instead of aborting the moment he twitches and the flee drags him back in.
  if (!nav.escaping) {
    if (nav.stuckMs < UNSTUCK_TRIGGER_MS) return null;
    nav.escaping = true;
    nav.escapeStartMs = now;
    nav.escapeStartPos = { x: p.x, y: p.y };
    nav.escapeHeading = null;
  } else if (
    hasReachableFoe(state) ||
    distance(p, nav.escapeStartPos) >= UNSTUCK_EXIT_DIST
  ) {
    // Moved clear of the wedge, or reached something to fight → hand back.
    nav.escaping = false;
    nav.stuckMs = 0;
    nav.escapeHeading = null;
    return null;
  }

  // The macro goal orients the escape (goalward heading preferred first).
  const goal = macroTarget(bot, state, tune);
  const heading = goal ?? { ...state.playerSpawn };
  const base = Math.atan2(heading.y - p.y, heading.x - p.x);

  // THE CONTOUR TRACE — what a human does at an obstacle: pick a direction
  // that is actually OPEN and COMMIT to it, tracing the wall until either the
  // exit condition frees him or the wall turns the heading. Probe a body-width
  // sweep along the committed heading each tick; while it stays open, hold it.
  // When it blocks (the contour turned), re-probe a fan of candidates —
  // ordered by closeness to the PREVIOUS committed heading, so the trace BENDS
  // around the corner instead of flipping back into the pocket; with no prior
  // commitment the fan orders goalward-first. The old timed rotation survives
  // only as the fallback when every probe is blocked (walled in on all sides —
  // press and let the wall-slide work). Deterministic throughout: a pure
  // function of state + the bot's nav memory.
  const r = PLAYER.radius;
  const openAlong = (a: number): boolean => {
    const t = {
      x: clamp(p.x + Math.cos(a) * UNSTUCK_PROBE, 20, state.level.width - 20),
      y: clamp(p.y + Math.sin(a) * UNSTUCK_PROBE, 20, state.level.height - 20),
    };
    return !blockedByObstacle(state, p, t, r) && !insideObstacle(state, t, r);
  };
  let angle: number | null = null;
  if (nav.escapeHeading !== null && openAlong(nav.escapeHeading)) {
    angle = nav.escapeHeading; // the committed trace is still open — hold it
  } else {
    const prev = nav.escapeHeading;
    const candidates = [
      base,
      base + Math.PI / 4,
      base - Math.PI / 4,
      base + Math.PI / 2,
      base - Math.PI / 2,
      base + (3 * Math.PI) / 4,
      base - (3 * Math.PI) / 4,
      base + Math.PI,
    ];
    if (prev !== null) {
      // Bend, don't flip: continue nearest the direction already being traced.
      const diff = (a: number): number => {
        const d = Math.abs(a - prev) % (Math.PI * 2);
        return d > Math.PI ? Math.PI * 2 - d : d;
      };
      candidates.sort((a, b) => diff(a) - diff(b));
    }
    for (const c of candidates) {
      if (openAlong(c)) {
        angle = c;
        break;
      }
    }
    nav.escapeHeading = angle;
  }
  const allBlocked = angle === null;
  if (angle === null) {
    // Every probe blocked — the old deterministic timed sweep as a last resort.
    const phase = Math.floor((now - nav.escapeStartMs) / UNSTUCK_BURST_MS) % 8;
    const step = Math.ceil(phase / 2) * (Math.PI / 4);
    angle = base + (phase % 2 === 0 ? step : -step);
  }
  const target = {
    x: p.x + Math.cos(angle) * UNSTUCK_REACH,
    y: p.y + Math.sin(angle) * UNSTUCK_REACH,
  };
  // Hop ONLY when the takeoff can actually buy something: a BODY at contact
  // range is the pin (the untouchable airborne frames slip it), or every probe
  // is blocked (walled in — only a hop over a jumpable neighbor exits). A
  // plain geometry wedge gains nothing from a jump — the walls and scatter
  // rocks that wedge the escape aren't jumpable — and each takeoff spends
  // `STAMINA.jumpCost` of a pool the escape may badly need; the old every-tick
  // hop bounce-hopped the hero across the moon's low-g field and wound him out.
  const pinned =
    threatsWithin(state, CONTACT_DODGE_RADIUS).length > 0 || allBlocked;
  return steer(state, target, pinned && state.player.z === 0);
}

/** The point `dist` away from `from`, on the player's side of it. */
function holdOff(state: GameState, from: Vec2, dist: number): Vec2 {
  const dx = state.player.pos.x - from.x;
  const dy = state.player.pos.y - from.y;
  const d = Math.hypot(dx, dy) || 1;
  return { x: from.x + (dx / d) * dist, y: from.y + (dy / d) * dist };
}

/** Keep a circle-strafe target this far off the level edge/wall — enough that a
 * strafe never noses the hero into a corner it then has to unwedge from. */
const ORBIT_CLEARANCE = 44;

/**
 * A weapon-range hold that ORBITS the target instead of standing on it: the same
 * `dist` radius as {@link holdOff}, but advanced tangentially around `center` by
 * `step` radians in the bot's committed orbit direction, so the hero
 * circle-strafes at range. The auto-aimed weapon still tracks the nearest foe
 * (step.ts), so DPS is unchanged — but a hero who keeps sliding laterally slips
 * the enemy fire aimed at his CURRENT spot (leading is partial even on the hard
 * rungs — ranged.ts), instead of eating every shot planted on the hold point.
 *
 * The orbit sense is per-bot memory and REVERSES when the next arc would run
 * into a wall or the map edge — a human circling one way until the room ends,
 * then the other. With both ways blocked (a tight pocket) it falls back to a
 * straight radial hold. `step` ≤ 0 disables the orbit (the classic stand-still
 * hold). Pure w.r.t. state + the bot's `orbitSign`, so determinism holds.
 */
function orbitHold(
  bot: Bot,
  state: GameState,
  center: Vec2,
  dist: number,
  step: number,
): Vec2 {
  if (step <= 0) return holdOff(state, center, dist);
  const p = state.player.pos;
  const ang = Math.atan2(p.y - center.y, p.x - center.x);
  if (bot.orbitSign === undefined) bot.orbitSign = 1;
  const r = PLAYER.radius;
  for (const sign of [bot.orbitSign, -bot.orbitSign]) {
    const a = ang + step * sign;
    const pt = {
      x: center.x + Math.cos(a) * dist,
      y: center.y + Math.sin(a) * dist,
    };
    const edge = Math.min(
      pt.x,
      state.level.width - pt.x,
      pt.y,
      state.level.height - pt.y,
    );
    if (edge < ORBIT_CLEARANCE) continue; // strafing into the level edge
    if (insideObstacle(state, pt, r)) continue; // into a rock/wall
    if (blockedByObstacle(state, p, pt, r)) continue; // a wall in the way
    bot.orbitSign = sign;
    return pt;
  }
  return holdOff(state, center, dist); // hemmed in → back straight out/in
}

function nearestEnemy(state: GameState): Enemy | undefined {
  let best: Enemy | undefined;
  let bestD = Infinity;
  for (const enemy of state.enemies) {
    // Apparitions are untouchable scenery — a bot never fights or flees one.
    if (enemyDef(enemy.defId).apparition) continue;
    const d = distance(enemy.pos, state.player.pos);
    if (d < bestD) {
      best = enemy;
      bestD = d;
    }
  }
  return best;
}

/** Whether a touched pickup would actually BANK right now — the same stack-cap
 * gates the engine's pickup pass applies (step.ts). A full stack turns the
 * pickup away (it stays on the ground), so steering at one parks the hero ON
 * an item he can never collect, standing there forever (measured: the
 * full-pockets stall). A capped kind is simply not wanted until one is spent. */
function canBankPickup(state: GameState, item: Item): boolean {
  const player = state.player;
  switch (item.kind) {
    case "medkit":
      return (
        (player.medkits[medkitTierIndex(item.tier)] ?? 0) < CONSUMABLES.stackCap
      );
    case "repair":
      return player.repairKits < CONSUMABLES.stackCap;
    case "drink":
      return player.staminaPotions < CONSUMABLES.stackCap;
    case "mana":
      return player.manaPotions < CONSUMABLES.stackCap;
    case "ability":
      return canBankAbility(state, item.defId);
    default:
      return true;
  }
}

/** The nearest ground pickup WORTH walking to: skips a mercy drop still being
 * flown in (not collectable yet), equipment the hero couldn't keep (bag full
 * and no upgrade — see `canCollectEquipment`), a consumable whose stack is
 * already full (the pickup would be refused and the hero would stand on it —
 * see {@link canBankPickup}), and — crucially — anything his
 * body can't sweep STRAIGHT to (a drop scattered into/behind a wall): steering
 * at a walled-off item ground the sweep into a grab → wedge → unstick loop for
 * whole minutes (measured; it was a dominant cause of runs never reaching the
 * boss). A walled drop is simply not wanted — the route will pass it or it
 * stays where it lies. */
function nearestWantedItem(state: GameState): Item | undefined {
  let best: Item | undefined;
  let bestD = Infinity;
  for (const item of state.items) {
    if (item.deliverMs !== undefined && item.deliverMs > 0) continue;
    if (
      item.kind === "equipment" &&
      !canCollectEquipment(state, item.equipment)
    )
      continue;
    if (!canBankPickup(state, item)) continue;
    const d = distance(item.pos, state.player.pos);
    if (d >= bestD) continue;
    if (blockedByObstacle(state, state.player.pos, item.pos, PLAYER.radius))
      continue;
    best = item;
    bestD = d;
  }
  return best;
}

/** Are this map's GOLDEN ARROWS still WARM — the hero under the rung's arrow
 * XP cap (`arrowCapByDifficulty`)? A warm arrow pays a real share of the
 * current level's XP bar (the catch-up faucet), so it outranks every other
 * ground pickup; past the cap it goes cold (a sliver) and drops back to
 * ordinary loot. A rung with no cap entry never goes cold. */
function arrowsWarm(state: GameState): boolean {
  const cap = levelDef(state.level.id).loot.arrowCapByDifficulty?.[
    state.difficulty
  ];
  return cap === undefined || state.player.level < cap;
}

/** The nearest collectable GOLDEN ARROW within `reach` the body can
 * sweep straight to — the "level up now" pickup {@link wantedItemNearby} puts
 * ahead of everything else while the arrows are warm. */
function nearestXpArrow(
  state: GameState,
  reach: number = ITEM_REACH,
): Item | undefined {
  let best: Item | undefined;
  let bestD = reach;
  for (const item of state.items) {
    if (item.kind !== "xp") continue;
    if (item.deliverMs !== undefined && item.deliverMs > 0) continue;
    const d = distance(item.pos, state.player.pos);
    if (d >= bestD) continue;
    if (blockedByObstacle(state, state.player.pos, item.pos, PLAYER.radius))
      continue;
    best = item;
    bestD = d;
  }
  return best;
}

/**
 * Keep the LEARNED arrow worth fresh: whenever this tick's events carry a
 * collected GOLDEN ARROW's "+N XP" figure, remember what share of the XP bar
 * it paid, rounded to 5% increments (see {@link Bot.arrowXp}). A step whose
 * events also carry a level-up is skipped — the bar itself changed under the
 * award, so the ratio is unreadable that tick (the next arrow re-teaches it).
 * Reads only `state.events` + the bot's own memory, so determinism holds.
 */
function trackArrowXp(bot: Bot, state: GameState): void {
  let award: number | undefined;
  for (const event of state.events) {
    if (event.type === "levelUp") return; // bar replaced mid-step — unreadable
    if (event.type === "itemCollected" && event.kind === "xp") {
      award = event.xp ?? award;
    }
  }
  if (award === undefined) return;
  const share = award / Math.max(1, state.player.xpToNext);
  bot.arrowXp = {
    pct: clamp(Math.round(share * 20) / 20, 0, 1),
    level: state.player.level,
  };
}

/**
 * A GOLDEN ARROW within `reach` that would DING — push the hero over the
 * level-up line, by the bot's LEARNED read of what an arrow pays
 * ({@link Bot.arrowXp}) — or undefined. A ding is a free FULL HEAL (grantXp
 * refills hp and stamina on level-up), so a dinging arrow nearby is a
 * strategic resource: it substitutes for a medkit and buys bravery. Nothing
 * fires before the first arrow has taught its worth, and cold arrows teach
 * ~0%, which disables the read on outgrown maps.
 */
function dingArrowNearby(
  bot: Bot,
  state: GameState,
  reach: number,
): Item | undefined {
  const learned = bot.arrowXp;
  if (!learned || learned.pct <= 0) return undefined;
  if (!arrowsWarm(state)) return undefined;
  const player = state.player;
  if (player.xpToNext - player.xp > learned.pct * player.xpToNext)
    return undefined; // an arrow would not tip the bar
  return nearestXpArrow(state, reach);
}

/** An item this close (world px) is stooped for freely — drops land where the
 * fight happened, so the ring around the hero costs no real detour. */
const ITEM_CLOSE_REACH = 120;

/** A farther loot detour (out to {@link ITEM_REACH}) must not pull the hero
 * BACKWARD off the GPS heading: minimum dot of the item bearing against the
 * route heading. −0.2 allows anything up to ~100° off-route (sideways scoops
 * are fine) and refuses walking away from the destination — the discipline
 * that stops a loot-rich field from yanking the march around in circles. */
const ITEM_DETOUR_MIN_ALONG = -0.2;

/** The nearest wanted ground pickup worth a detour NOW, GPS-disciplined: a
 * WARM golden arrow first at any reach (a share of the level bar beats any
 * other pickup — see {@link arrowsWarm}), then a
 * close drop ({@link ITEM_CLOSE_REACH}) is always grabbed, and EQUIPMENT (and
 * story pieces) at any reach — a gear upgrade is worth any detour. A farther
 * CONSUMABLE only if it doesn't drag the hero backward off the current route
 * heading ({@link ITEM_DETOUR_MIN_ALONG}) — it's the endless scatter of
 * medkit/drink drops on a loot-rich field that yanks the march around in
 * circles, not the rare gear. The emergency medkit grab bypasses this and
 * uses {@link nearestWantedItem} directly — bleeding out beats making time. */
function wantedItemNearby(
  bot: Bot,
  state: GameState,
  tune: BotTuning,
): Item | undefined {
  if (arrowsWarm(state)) {
    const arrow = nearestXpArrow(state);
    if (arrow) return arrow;
  }
  const item = nearestWantedItem(state);
  if (!item) return undefined;
  const d = distance(item.pos, state.player.pos);
  if (d > ITEM_REACH) return undefined;
  if (d <= ITEM_CLOSE_REACH) return item;
  if (item.kind === "equipment" || item.kind === "story") return item;
  const heading = travelHeading(bot, state, tune);
  if (!heading) return item;
  const ax = (item.pos.x - state.player.pos.x) / d;
  const ay = (item.pos.y - state.player.pos.y) / d;
  const along = ax * heading.x + ay * heading.y;
  return along >= ITEM_DETOUR_MIN_ALONG ? item : undefined;
}

/** The landmark furthest from the player spawn — the objective's marker. */
function furthestLandmark(state: GameState): Vec2 | undefined {
  let best: Vec2 | undefined;
  let bestD = -1;
  for (const landmark of state.landmarks) {
    const d = distance(landmark.pos, state.playerSpawn);
    if (d > bestD) {
      best = landmark.pos;
      bestD = d;
    }
  }
  return best;
}
