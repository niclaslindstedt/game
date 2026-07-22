// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The autopilot's IDENTITY and MEMORY: the strategy/profile catalogs, the
// `Bot` instance type (every per-bot memory slot the decision code mutates —
// nav gauges, route caches, latches, learned reads), and the tiny shared
// primitives every bot module leans on (`think`, `idleInput`, the GPS
// waypoint, the per-level tuning resolve). Pure data + pure helpers — the
// decision logic itself lives in bot.ts and its sibling `bot-*` modules.
//
// Bots are PURE consumers of the state: they never mutate it and never draw
// from state.rng, so a botted run is exactly as deterministic as a recorded
// human run with the same seed.

import { distance } from "@game/lib/vec.ts";
import type { Vec2 } from "@game/lib/vec.ts";
import { STAT_BUILDS } from "./builds.ts";
import type { StatBuild } from "./builds.ts";
import { resolveBotTuning } from "./bot-tuning.ts";
import type { BotTuning } from "./bot-tuning.ts";
import type { ThoughtMemory } from "./bot-thoughts.ts";
import { BOT_TUNING_OVERRIDES } from "../generated/botTuning.ts";
import type { NavGrid } from "./pathfind.ts";
import type { GameInput, GameState, WeaponClass } from "./types.ts";

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
   * WALL-TRACE memory for the wall-end sense ({@link navTarget} /
   * `visibleObstacleEnd`): the detour SIDE (+1 clockwise, -1 counter) latched
   * while the straight sweep to the current travel sub-goal stays blocked, so
   * consecutive ticks trace ONE way around a long wall instead of
   * flip-flopping between its two ends (the measured up-down oscillation at a
   * mid-map wall). Cleared the moment a straight sweep runs clear. Per-bot
   * memory keyed off pure state — determinism holds.
   */
  trace?: { side: 1 | -1 } | null;
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
   * WEAPON-SWAP clock (see bot-economy.ts `stepBotWeaponSwap`): when the
   * swap system last changed the hand (sim ms) — the anti-juggle cooldown
   * that keeps a foe dancing on the blade-reach line from making the hero
   * flap between blade and pocket gun every tick. Written by the harness's
   * swap action, not by `botAct` (bots stay pure consumers of the state);
   * per-bot memory keyed off pure state, so determinism holds.
   */
  lastSwapMs?: number;
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
   * The COMMITTED PURPOSE of the jump currently in flight — why the bot left
   * the ground, decided BEFORE the takeoff and stuck to until he lands. A
   * discretionary hop is only requested once {@link commitHop} has (a) picked
   * the landing ground (flee down the open lane, or reposition over the
   * contact toward the objective) and (b) probed that the hop can actually
   * TRANSLATE that way; the plan is then latched here and the airborne hero
   * keeps steering at `target` no matter how the per-tick branches churn —
   * without it, the takeoff restarts the hop cooldown, the very next airborne
   * tick re-decides into a calmer branch (HOLD stands still), and the "escape"
   * dissolves into a straight-up bounce that spent 10% of the pool for
   * nothing. Mechanic reflex hops (stampede, bale-on-top) never set a plan —
   * hopping in place IS their dodge. Cleared on landing. Per-bot memory keyed
   * off pure state — determinism holds.
   */
  hopPlan?: { target: Vec2; flee: boolean; sinceMs: number } | null;
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
export function trackWaypoint(bot: Bot, state: GameState): void {
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
export function think(bot: Bot, label: string): void {
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

/** The three survival POSTURES — the playstyle axis `survive()` reads. Their
 * per-row tuning (standoffMul/fleeHp/surround/edgeDrift) lives in the resolved
 * {@link BotTuning} `postures` table (bot-tuning.ts + bot.yaml), so a level can
 * bend a posture the same way it bends any other knob. `balanced` reproduces
 * the classic survivor exactly. */
export type Posture = "aggro" | "balanced" | "flee";

export const idleInput = (): GameInput => ({
  steering: false,
  target: { x: 0, y: 0 },
  jump: false,
});
