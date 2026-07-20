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
import { MAP, PLAYER, STAMINA, STAMPEDES } from "./config.ts";
import { mapCols, mapRows } from "./map.ts";
import { onPathLevel } from "./path.ts";
import { buildNavGrid, findPath } from "./pathfind.ts";
import type { NavGrid } from "./pathfind.ts";
import { blockedByObstacle, insideObstacle, lineOfSight } from "./obstacles.ts";
import { enemyDef } from "./defs/enemies/index.ts";
import { weaponDef } from "./defs/equipment.ts";
import { spellDef } from "./defs/spells.ts";
import {
  bestMedkitTier,
  committedLane,
  equipmentMaxDurability,
  heroSpellStat,
  isSpellAvailable,
  isWeaponBroken,
  weaponRangeFor,
} from "./items.ts";
import type {
  Asteroid,
  Enemy,
  GameInput,
  GameState,
  Item,
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
   * holds.
   */
  contentSkip?: { levelId: string; keys: string[] };
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
/** Bots pop a medkit once health falls below this fraction of the bar. */
const HEAL_HP_FRAC = 0.55;
/** Top up stamina when the pool dips below this AND a threat is near — a winded
 * hero (empty pool) is capped to a jog and gets run down. */
const STAMINA_TOPUP_FRAC = 0.3;
/** Spend a powerup once this many foes are packed close — a nuke/stasis/storm
 * all pay off most against a crowd, so time them for the crowd. */
const POWERUP_PACK = 5;
/** …or once abilities pile up this deep, so a hoard never goes to waste. */
const POWERUP_HOARD = 2;
/** How far the escape steer aims down the openest lane. */
const ESCAPE_DISTANCE = 340;
/** How near a pickup must be to be worth a detour. */
const ITEM_REACH = 240;

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
  // A clear field: nothing to fight, so the loop below would just idle — but a
  // sand storm (mars) or a falling meteor (the moon/rift) can still catch him
  // unopposed, and idling into a knockout or a blast is the worst place to be
  // caught. Sidestep those first; else stand easy.
  if (state.enemies.length === 0) {
    const tune = botTuningFor(state.level.id);
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
  // The effective positioning knobs for this level (bot.yaml overrides resolved
  // over the shipped defaults) — resolved once per tick and threaded into the
  // combat branches. Pure, so determinism holds.
  const tune = botTuningFor(state.level.id);
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
  // POWERUPS, timed for effect: spend when a crowd is packed close (a nuke,
  // stasis, or storm all pay off most against many bodies), or once abilities
  // pile up so a hoard never goes to waste. A slot still counting down a
  // running power isn't spendable, so gate on the BANKED (not-yet-running) ones.
  const running = player.abilities.filter((a) => a.slot !== undefined).length;
  const banked = player.heldAbilities.length - running;
  const packedClose = threatsWithin(state, SURROUND_RADIUS).length;
  decided.useItem =
    banked > 0 &&
    (packedClose >= POWERUP_PACK ||
      player.heldAbilities.length >= POWERUP_HOARD);
  // Heal below the threshold (biggest-heal-first — consumeMedkit no-ops at full
  // so a mistap is free). Refill stamina when the pool bottoms out, or dips low
  // with a threat near — a winded hero is capped to a jog and gets run down.
  decided.useMedkit =
    player.hp < player.maxHp * HEAL_HP_FRAC && bestMedkitTier(state) >= 0;
  const threatNear = threatsWithin(state, THREAT_RADIUS).length > 0;
  decided.useStaminaPotion =
    player.staminaPotions > 0 &&
    (player.stamina <= 0 ||
      (threatNear && player.stamina < player.maxStamina * STAMINA_TOPUP_FRAC));
  // Spend a repair kit once a weapon has actually broken out of the hand (a
  // durability-0 spare sits in the bag) or the held blade is nearly spent — it
  // mends the whole kit and restores the shed weapon (useRepairKit no-ops with
  // nothing to mend, so a mistap is free).
  decided.useRepairKit = player.repairKits > 0 && needsRepair(state);
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
function pushBoss(
  bot: Bot,
  state: GameState,
  tune: BotTuning,
  jumpTravel = false,
): GameInput {
  const jump = jumpTravel && state.player.z === 0;
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
    return routeSteer(bot, state, target, jump);
  }
  think(bot, "FIGHT BOSS");
  return steer(
    state,
    orbitHold(bot, state, target, hold, tune.orbitStep),
    jump,
  );
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
  const pt = tune.postures[posture];
  const near = threatsWithin(state, THREAT_RADIUS);

  // 1. Breathing room: grab a pickup within reach; else follow the MACRO TRAVEL
  //    plan — farm this patch's spawner, sweep to the nearest reachable
  //    chest/elite, uncover remaining fog, and only then push the boss — routed
  //    globally (A*) so the runner threads the whole map to whatever's next.
  if (near.length === 0) {
    const item = nearestItem(state);
    if (item && distance(player.pos, item.pos) < ITEM_REACH) {
      think(bot, "GRAB ITEM");
      return steer(state, item.pos);
    }
    return macroSteer(bot, state, tune, true);
  }

  const grounded = player.z === 0;
  const nearest = near[0]!; // threatsWithin returns nearest-first
  const nearestD = distance(player.pos, nearest.pos);

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
  const lockTarget =
    bossEnemy !== undefined &&
    readyForBoss(state, tune) &&
    (bossEnemy.awake === true ||
      distance(player.pos, bossEnemy.pos) < BOSS_LOCK_RANGE)
      ? bossEnemy
      : undefined;
  // Emergency bail: low on HP (heal), or ENCIRCLED with no clean lane out. A
  // hero locked on the boss does NOT bail on encirclement — the crawling horde
  // always rings him, so fleeing every ring would forfeit the kill; he holds and
  // only breaks to HEAL when actually bleeding, then re-commits.
  if (lowHp || (!lockTarget && surrounded)) {
    // Only HOP the break-out when genuinely surrounded AND a body is about to
    // bite — then the airborne frames are the sole way over the ring. Between
    // bites (and on a low-HP fall-back with an open lane) he RUNS to the medkit /
    // open ground on foot, banking stamina instead of hopping the whole way and
    // winding himself. The reserve floor (`hasHopStamina`) keeps the pool from
    // ever bottoming out, so he stays sprint-capable to actually clear the pack.
    const breakoutHop =
      grounded && surrounded && hasHopStamina && bodyAtContact;
    // A medkit within reach is worth the detour when we're bleeding.
    if (lowHp) {
      const item = nearestItem(state);
      if (
        item &&
        item.kind === "medkit" &&
        distance(player.pos, item.pos) < ITEM_REACH
      ) {
        think(bot, "GRAB MEDKIT");
        return steer(state, item.pos, breakoutHop);
      }
    }
    think(bot, lowHp ? "FALL BACK" : "PUNCH OUT");
    return navSteer(state, bestEscapeTarget(state, near), breakoutHop);
  }

  // 2.4. Fight the locked set piece down — hold at weapon range and press it,
  //    hopping through contact with a ranged loadout — instead of kiting past.
  if (lockTarget) {
    const w = weaponDef(player.equipment.weapon.defId);
    const lockHop =
      w.projectile !== undefined &&
      grounded &&
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
      return steer(state, kit.pos, grounded);
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
    // MELEE: press to `reach * meleeHoldFrac` (a press depth comfortably INSIDE
    // the blade's reach, so the swing lands with margin) and hold there. The hold
    // band spans from the tight danger bubble (`meleeGraspStandoff`, clamped below
    // the press depth) up to that press depth — so he ADVANCES to close whenever a
    // foe drifts beyond striking range, GIVES GROUND only when one crowds inside
    // the bite, and STANDS AND GRINDS in between. Sizing the band to reach (not
    // the flat `holdBand`, which at 28px is wider than a whole starter blade's
    // ~44px reach) is what stops the deadband from parking him BEYOND where his
    // blade lands — the coward's hold that made melee whiff.
    const pressEdge = Math.min(
      reach * tune.meleeHoldFrac * pt.standoffMul,
      reach * tune.maxEngageRangeFrac,
    );
    dangerDist = Math.min(
      tune.meleeGraspStandoff * pt.standoffMul,
      pressEdge * 0.7,
    );
    engageDist = (dangerDist + pressEdge) / 2;
    band = (pressEdge - dangerDist) / 2;
  }
  const away = awayFromPack(state, near, travelHeading(bot, state, tune));
  // HOP only when SURROUNDED — otherwise RUN. Jumping to dodge a single body, or
  // hopping the whole DPS-hug the way `flee` used to, empties the pool fast and
  // leaves the hero winded (jog-capped) for the next real pinch. When a body is
  // on one side the hero gives ground / kites on FOOT; the untouchable airborne
  // frames are spent only to break a genuine ring (and a melee hero can't swing
  // mid-air anyway, so this only ever lifts a ranged loadout). Gated on the pool
  // so the bot never asks for a takeoff the engine would refuse.
  const canHopAndFight = ranged;
  const hop = canHopAndFight && grounded && surrounded && hasHopStamina;
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
    const breakoutHop = hop && nearestD < dangerDist;
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
      hop,
    );
  }
  // SWEET SPOT — a foe sits inside the hold band: STAND HIS GROUND and let the
  // auto-aimed weapon mow the front line from a distance he can actually HIT from,
  // rather than shuffling for nothing. He moves again only when a body pushes
  // inside the band (give ground) or the front thins past it (advance); the
  // telegraph / meteor / storm reflexes in `botAct` still preempt this hold, so he
  // steps off a real set-piece instead of eating it planted. A ranged loadout
  // still HOPS out of a genuine ring (see `hop`).
  if (hop) {
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
  const bx = away.x + prefer.x * PATH_RETREAT_BIAS;
  const by = away.y + prefer.y * PATH_RETREAT_BIAS;
  const bm = Math.hypot(bx, by) || 1;
  return { x: bx / bm, y: by / bm };
}

/** A unit heading from the hero toward the current macro-travel goal (the next
 * chest/elite/boss the sweep is bound for) — the bias that drifts a retreat off
 * the pack DOWN the route rather than straight back, so backing off still makes
 * map progress. Reads the bot's cached route goal; pure. */
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

/**
 * Trace the best path OUT of a pack: sample directions around the hero and pick
 * the openest — the one with the least enemy pressure ahead and clear ground to
 * run into. Closer and more head-on foes weigh heavier; a lane that runs into a
 * wall or off the map is penalised, so the hero punches through the gap in the
 * ring instead of backing himself into a corner. Deterministic (fixed sample).
 */
function bestEscapeTarget(state: GameState, near: Enemy[]): Vec2 {
  const pos = state.player.pos;
  const SAMPLES = 16;
  let best = { x: pos.x, y: pos.y };
  let bestScore = Infinity;
  for (let i = 0; i < SAMPLES; i++) {
    const angle = (i / SAMPLES) * Math.PI * 2;
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
    if (score < bestScore) {
      bestScore = score;
      best = { x: tx, y: ty };
    }
  }
  return best;
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
  const stale =
    rc.path.length === 0 ||
    distance(goal, rc.goal) > ROUTE_REPLAN_GOAL ||
    strayedFromRoute(rc, from);
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
// bot-specific hint. It sweeps to the nearest A*-reachable un-engaged piece,
// commits until that piece is consumed, then re-picks — and only commits to the
// boss once nothing reachable is left to discover.

/** The world positions of every un-looted CHEST on the field (a chest is a
 * breakable obstacle flagged `chest`; looting removes it). These are the OFF-PATH
 * caches the sweep detours for — the whole point of "discover the map". Elites,
 * by contrast, sit ON the main route and are fought in passing (no detour), so
 * they are NOT content targets: routing back to each one only bogs the runner in
 * the horde and it never reaches the boss. */
function chestTargets(state: GameState): Vec2[] {
  return state.obstacles.filter((o) => o.chest).map((o) => o.pos);
}

/** A cheap signature of the remaining content — the un-looted chest count. The
 * committed content target is re-picked only when this changes (a chest was
 * cracked), so the bot holds one target instead of dithering every tick. */
function contentSig(state: GameState): number {
  return chestTargets(state).length;
}

/** A stable key for a content position (rounded), so an ABANDONED target can be
 * recognised and skipped across re-picks even as the hero moves. */
function contentKey(p: Vec2): string {
  return `${Math.round(p.x)},${Math.round(p.y)}`;
}

/** How long (sim ms) the bot may fail to shorten its ROUTE to a committed content
 * target before giving up on it — a cache it's A*-reachable to but keeps getting
 * shoved away from. Generous, so it's a genuine can't-get-there, not a scuffle. */
const CONTENT_ABANDON_MS = 12_000;
/** The remaining route must shrink by this many px² to count as headway, so
 * jitter around a wall doesn't reset the timer. */
const CONTENT_PROGRESS_EPS = 80 * 80;
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

/** Once per tick, gauge headway toward the committed content target by its
 * remaining ROUTE length and ABANDON it if that hasn't shrunk within
 * {@link CONTENT_ABANDON_MS} — pushing its key onto the per-level skip set so the
 * next re-pick moves on (and the boss finally gets committed). Route length, not
 * euclidean distance, so a hero pinned against the wall of a sealed pocket still
 * reads as "can't get there". Called from {@link botAct}; mutates only bot
 * memory, so determinism holds. */
function trackContentAbandon(bot: Bot, state: GameState): void {
  const c = bot.content;
  const rc = bot.route;
  if (!c || !c.target || !rc) return;
  // Only gauge while the cached route actually leads to this target.
  if (distance(rc.goal, c.target) > ROUTE_REPLAN_GOAL) return;
  const rem = remainingRoute(rc, state.player.pos);
  const remSq = rem * rem;
  // Basically there (engaging it) → hold the timer; combat/looting finishes it.
  if (
    rem <= CONTENT_ENGAGE_ROUTE ||
    remSq < c.bestDistSq - CONTENT_PROGRESS_EPS
  ) {
    c.bestDistSq = remSq;
    c.bestTimeMs = state.stats.timeMs;
    return;
  }
  if (state.stats.timeMs - c.bestTimeMs > CONTENT_ABANDON_MS) {
    if (!bot.contentSkip || bot.contentSkip.levelId !== state.level.id)
      bot.contentSkip = { levelId: state.level.id, keys: [] };
    bot.contentSkip.keys.push(contentKey(c.target));
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
 * The nearest A*-REACHABLE un-engaged content (chest or elite), or null when
 * every reachable piece has been consumed. Cached on the bot and recomputed only
 * when the content inventory changes — so the run commits to one piece, sweeps to
 * it (engaging it as combat takes over near it), and re-picks the next once it's
 * gone. Unreachable pieces (walled off with no key) are skipped, so a genuinely
 * sealed cache never stalls the sweep. Pure w.r.t. state + the bot's memory.
 */
function nearestContent(bot: Bot, state: GameState): Vec2 | null {
  const rc = ensureRoute(bot, state);
  const sig = contentSig(state);
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
    const candidates = chestTargets(state).filter(
      (c) => !skip.includes(contentKey(c)),
    );
    let best: Vec2 | null = null;
    let bestCost = Infinity;
    for (const c of candidates) {
      const path = findPath(rc.grid, from, c);
      if (!path) continue;
      const cost = routeLength(from, path);
      if (cost < bestCost) {
        bestCost = cost;
        best = { x: c.x, y: c.y };
      }
    }
    bot.content = {
      levelId: state.level.id,
      sig,
      target: best,
      // Seed the route-length gauge at Infinity so the first measured route
      // counts as progress and starts the abandon clock cleanly.
      bestDistSq: Infinity,
      bestTimeMs: state.stats.timeMs,
    };
  }
  return bot.content?.target ?? null;
}

/**
 * The macro destination the bot travels toward when it's free to move: FARM the
 * active spawner in this patch (level up before advancing) while still under the
 * boss-ready level, else sweep to the nearest reachable un-engaged CONTENT
 * (chest/elite), else DISCOVER NEW GROUND from the hero's own side outward
 * (directional fog coverage), else — with nothing left to discover — the BOSS.
 * This is the whole automatic-engagement order in one place; the callers just
 * route to whatever it returns.
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
  const underLevel = !readyForBoss(state, tune);
  if (underLevel) {
    const spawner = activeSpawnerNear(state);
    if (spawner) return spawner;
  }
  const content = nearestContent(bot, state);
  if (content) return content;
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
  if (!readyForBoss(state, tune) && activeSpawnerNear(state))
    return "CLEAR SPAWNER";
  const content = bot.content?.target;
  if (content && content.x === goal.x && content.y === goal.y)
    return "SEEK CHEST";
  const boss = bossPos(state);
  if (boss && boss.x === goal.x && boss.y === goal.y) return "TO BOSS";
  return "EXPLORE FOG";
}

/** Steer toward the current macro goal along its A* route, tagging the thought.
 * The unified macro-travel move — replaces the old authored-path march. */
function macroSteer(
  bot: Bot,
  state: GameState,
  tune: BotTuning,
  jump = false,
): GameInput {
  const goal = macroTarget(bot, state, tune);
  think(bot, macroThought(bot, state, tune, goal));
  return routeSteer(bot, state, goal, jump);
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
  } else if (
    hasReachableFoe(state) ||
    distance(p, nav.escapeStartPos) >= UNSTUCK_EXIT_DIST
  ) {
    // Moved clear of the wedge, or reached something to fight → hand back.
    nav.escaping = false;
    nav.stuckMs = 0;
    return null;
  }

  // The macro goal orients the escape sweep (goalward heading first).
  const goal = macroTarget(bot, state, tune);

  // Sweep a heading that rotates as the escape persists: goalward first, then ±
  // around it (±45, ±90, ±135), out to a full turn — deterministic, so a botted
  // run stays reproducible. A full turn without breaking free just keeps sweeping.
  const phase = Math.floor((now - nav.escapeStartMs) / UNSTUCK_BURST_MS) % 8;
  const heading = goal ?? { ...state.playerSpawn };
  const base = Math.atan2(heading.y - p.y, heading.x - p.x);
  const step = Math.ceil(phase / 2) * (Math.PI / 4);
  const angle = base + (phase % 2 === 0 ? step : -step);
  const target = {
    x: p.x + Math.cos(angle) * UNSTUCK_REACH,
    y: p.y + Math.sin(angle) * UNSTUCK_REACH,
  };
  // Hop along the way: airborne clears low hop-obstacles and buys untouchable
  // frames if the wedge was a body pinning him.
  return steer(state, target, state.player.z === 0);
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

function nearestItem(state: GameState): Item | undefined {
  let best: Item | undefined;
  let bestD = Infinity;
  for (const item of state.items) {
    const d = distance(item.pos, state.player.pos);
    if (d < bestD) {
      best = item;
      bestD = d;
    }
  }
  return best;
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
