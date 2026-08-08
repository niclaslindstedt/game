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
//
// This module is the ORCHESTRATOR and the public API: `botAct` decides each
// tick's input by composing the sibling modules in this folder, and `botAllocate`
// spends the level-up points. The subsystems live beside it, one concern per
// module:
//   • state.ts      — the Bot type/memory, strategy & profile catalogs
//   • perception.ts — pure field reads (threats, boss, axis, escape fan)
//   • nav.ts        — steering primitives (local wall sense, A* routes)
//   • dodges.ts     — the reflex dodges (telegraphs, hazards, herds)
//   • content.ts    — chest/elite engagement + the fog-coverage sweep
//   • macro.ts      — the macro travel plan, anti-loiter hunt, unstuck
//   • supplies.ts   — loot/consumable/repair/scroll reads + bravery
//   • arsenal.ts    — aiming and the powerup dock
//   • fight.ts      — the strategy bodies (survive/pushBoss/hops)
//   • economy.ts    — bag/merchant play, invoked by the HARNESSES
//   • thoughts.ts   — the BOT VIEW thought resolver
//   • tuning.ts     — the BotTuning schema + shipped defaults (bot.yaml)

import { distance } from "@game/lib/vec.ts";
import { BUILD_ROTATION, BUILD_TALENTS, metaLane } from "../builds.ts";
import type { StatBuild } from "../builds.ts";
import {
  TALENT_STAT_CLASS,
  talentDefs,
  talentsForTree,
} from "../defs/talents/index.ts";
import { talentRank } from "../talent-effects.ts";
import { runLevelDef } from "../defs/levels/index.ts";
import {
  bestAimTarget,
  pickPowerupBurn,
  pickPowerupMoment,
  powerupDropForUpgrade,
  powerupSortMove,
} from "./arsenal.ts";
import { trackContentAbandon, trackExploreStall } from "./content.ts";
import {
  dodgeAsteroid,
  dodgeBait,
  dodgeHayBall,
  dodgeScorch,
  dodgeSandstorm,
  dodgeStampede,
  dodgeTelegraph,
  dodgeWell,
} from "./dodges.ts";
import { pushBoss, survive } from "./fight.ts";
import { wantsMerchantVisit } from "./economy.ts";
import { errandGiver, trackErrandAbandon } from "./errands.ts";
import { atHub, driveOutInput, hubGoal, trackHubShop } from "./hub.ts";
import { entranceGoal } from "./entrance.ts";
import { macroSteer, trackEngagement, unstuckInput } from "./macro.ts";
import { applyPartySpacing } from "./party-play.ts";
import { holdOff, limitTurnRate, navSteer, routeSteer, steer } from "./nav.ts";
import {
  contactEtaSec,
  firingReach,
  nearestEnemy,
  THREAT_RADIUS,
  threatCountWithin,
} from "./perception.ts";
import {
  botTuningFor,
  idleInput,
  sprint,
  think,
  trackWaypoint,
} from "./state.ts";
import type { Bot } from "./state.ts";
import {
  hasWear,
  HEAL_HP_FRAC,
  needsRepair,
  STAMINA_TOPUP_FRAC,
  topOffReach,
  trackBravery,
} from "./supplies.ts";
import { createThoughtMemory, resolveThought } from "./thoughts.ts";
import type { BotTuning } from "./tuning.ts";
import { CONSUMABLES, STAMINA } from "../config/index.ts";
import {
  bestMedkitTier,
  committedLane,
  medkitTierIndex,
} from "../items/index.ts";
import type {
  GameInput,
  GameState,
  Player,
  StatName,
  WeaponClass,
} from "../types/index.ts";

// The public bot API: the instance type, the catalogs, and the setup calls.
// Everything the engine's consumers (src/index.ts, the sim, the harnesses)
// need lives here, so the internal module split stays invisible to them.
export {
  BOT_POSTURES,
  BOT_PROFILES,
  BOT_STRATEGIES,
  botTuningFor,
  createBot,
  setBotWaypoint,
} from "./state.ts";
export type { Bot, BotProfile, BotStrategy } from "./state.ts";

/** Spend-to-refill a MEDKIT only when hp sits below this fraction of max —
 * "not full" with a real gap, so the heal isn't wasted on a scratch. */
const TOP_OFF_HP_FRAC = 0.9;
/** Spend-to-refill a STAMINA POTION only when the pool sits below this
 * fraction — standing still refills stamina for free, so only a genuinely
 * drained pool makes the swap worth a potion. */
const TOP_OFF_STAMINA_FRAC = 0.75;

/**
 * Decide this tick's input and annotate the bot with the STABLE debug thought.
 * Pure w.r.t. `state` (reads it, never mutates it); only mutates the bot's own
 * memory (`nav`/`route`/… and the thought resolver). {@link decideAct} settles
 * the raw per-tick branch label into `bot.lastThought`; the resolver then folds
 * it — over a short window — into the overarching thought BOT VIEW draws, so a
 * hero strafing a pack's edge reads as one "SKIRMISH" instead of flickering
 * between "KITE" and "GIVE GROUND", and a reflex (a dodge, a bail) preempts.
 *
 * **`hero` IS WHICH HERO THIS BOT STEERS, and it is a PARAMETER rather than a
 * lookup.** Every read under `src/game/bot/` used to
 * spell `state.players[0]` — 164 of them — which is why the headless simulator
 * could fly exactly one hero and why the first co-op tuning pass shipped as
 * structure rather than as measured numbers. The bot's own memory was never the
 * obstacle:
 * `Bot` already owns all of it (the stall detector, the wall trace, the A*
 * route, the pinned waypoint, the thought resolver), so N bots are N instances
 * with no shared scratch, and `step()` has always taken a `PartyInput` array
 * index-aligned with the party.
 *
 * Nothing here reads the party. A caller that wants seat 0 passes seat 0; the
 * app passes `localHero(state)`; the simulator passes the seat each of its bots
 * was given. That is the same rule every private engine read follows: a
 * bag, a purse and a build are about ONE hero, so they arrive as an argument.
 */
export function botAct(bot: Bot, state: GameState, hero: Player): GameInput {
  const input = decideAct(bot, state, hero);
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
function decideAct(bot: Bot, state: GameState, hero: Player): GameInput {
  if (bot.strategy === "idle") {
    think(bot, "IDLE");
    return idleInput();
  }
  // The effective positioning knobs for this level (bot.yaml overrides resolved
  // over the shipped defaults) — resolved once per tick and threaded into every
  // branch below. Pure, so determinism holds.
  const tune = botTuningFor(state.level.id);
  // AT THE WHEEL, EVERYTHING ELSE IS SOMEBODY ELSE'S PROBLEM. A hero driving
  // the hub's car is not walking, dodging, aiming or picking anything up — his
  // held pointer is steering the CAR this tick (step/index.ts hands it to
  // `stepVehicles`, and every on-foot pass sits out). So the drive is decided
  // ahead of the whole ladder and returned raw: no preempt reflex applies to a
  // man in a car, and the TURN RATE LIMIT below emphatically must not, since
  // "stand still for half a second" reads to `driveCar` as the wheel being let
  // go — the car coasts to a halt in the middle of its own driveway.
  const drive = driveOutInput(bot, state, hero);
  if (drive) {
    think(bot, "DRIVE OUT");
    return drive;
  }
  // THE ERRAND BOOKKEEPING (errands.ts): gauge headway toward the person the
  // bot committed to walking over to, and write them off if the march makes
  // none — the errand rung sits high enough that a giver a carve walled off
  // would pin the run rather than cost a detour. Above the empty-field branch
  // (which returns) because a cleared floor is exactly when a slate gets
  // worked.
  trackErrandAbandon(bot, state, hero);
  // The hub's own bookkeeping (hub.ts): gauge how long the hero has stood at
  // the counter with the shop errand still unfinished, so a want no trade can
  // satisfy can't park the ride in its own driveway. Same reason for the
  // placement.
  const homeShop = atHub(state) && wantsMerchantVisit(state, hero);
  if (atHub(state)) trackHubShop(bot, state, hero, homeShop);
  // A clear field: nothing to fight, so the loop below would just idle — but a
  // sand storm (mars) or a falling meteor (the moon/rift) can still catch him
  // unopposed, and idling into a knockout or a blast is the worst place to be
  // caught. Sidestep those first; else stand easy.
  if (state.enemies.length === 0) {
    // A stampede trample (a hop clears it), a falling meteor, or a sand storm
    // can all catch an idle hero on a clear field — a knockdown/blast alone is
    // the worst way to be caught, so hop the herd / dodge the rock / sidestep
    // the gust before standing easy.
    // A gravity well's drag works on a clear field too — a swallow is instant
    // death, so bolting clear outranks every other sidestep.
    const wellBolt = dodgeWell(state, hero);
    if (wellBolt) {
      think(bot, "WELL");
      return sprint(wellBolt);
    }
    const herdHop = dodgeStampede(state, hero, tune);
    if (herdHop) {
      think(bot, "HERD");
      return sprint(herdHop);
    }
    const rockDodge = dodgeAsteroid(state, hero);
    if (rockDodge) {
      think(bot, "METEOR");
      return sprint(rockDodge);
    }
    const stormDodge = dodgeSandstorm(state, hero, tune);
    if (stormDodge) {
      think(bot, "STORM");
      return sprint(stormDodge);
    }
    // …EXCEPT WHERE AN EMPTY FIELD STILL LEAVES SOMETHING TO DO. A hub never
    // places a knot (`horde: 0` on every area), so "nothing to fight" is not a
    // lull the bot should stand easy through — it is the garage, and there is a
    // counter to clear and a car to take (`hub.ts`). And a PERSON with a mark
    // over their head is worth walking to on any map, cleared or not: an
    // errand handed in on swept ground is the level's last payout
    // (`errands.ts`). Standing easy is what is left when neither answers.
    if (errandGiver(bot, state, hero) || hubGoal(bot, state, hero, homeShop)) {
      return macroSteer(bot, state, hero, tune);
    }
    think(bot, "IDLE");
    return idleInput();
  }
  // Gauge headway toward the committed content target once per tick, so a cache
  // the sweep can't reach gets abandoned rather than deadlocking the run.
  trackContentAbandon(bot, state, hero);
  // Gauge map-coverage headway too, so a bogged run that can't reach boss-level
  // parity gives up exploring and commits to the boss instead of looping on fog.
  trackExploreStall(bot, state);
  // Track when the hero last had a real fight on his hands, and latch the
  // ANTI-LOITER hunt once he's idled past the knob — so a lull turns into a
  // march on the nearest enemy, never into pottering about (see seekTarget).
  trackEngagement(bot, state, hero, tune);
  // Consume an arrived-at GPS nudge (see Bot.waypoint).
  trackWaypoint(bot, state, hero);
  // LAND the committed hop: back on the ground (and not on the takeoff tick
  // itself), the jump's purpose is spent — clear the plan so the normal read
  // resumes. Also self-heals a takeoff the engine refused (z never left 0).
  if (bot.hopPlan && hero.z === 0 && bot.hopPlan.sinceMs !== state.stats.timeMs)
    bot.hopPlan = null;
  // THE PREEMPT LADDER: the branches that outrank the strategy entirely — the
  // reflex dodges, the scripted disarmed opening, the anti-wedge escape, and a
  // committed hop in flight. They are also the ones the TURN RATE LIMIT below
  // must never hold back: an evasion is worthless a beat late, and a hop is
  // already committed. Null when nothing preempts — then the strategy decides.
  const preempt = preemptInput(bot, state, hero, tune);
  const decided = preempt ?? strategyInput(bot, state, hero, tune);
  // PERSONAL SPACING (party-play.ts): a steering ADJUSTMENT away from a
  // teammate standing inside the personal envelope, applied where the
  // strategy's steering is finalized so it composes with the whole ladder —
  // and never to a preempt (a dodge lands exactly where it aimed). Ahead of
  // the turn limiter, so the limiter judges the heading the hero will
  // actually walk. Strict no-op solo.
  if (!preempt) applyPartySpacing(state, hero, decided);
  const player = hero;
  // TURN RATE LIMIT — no turning around more than twice a second (nav.ts
  // `limitTurnRate`). The autopilot re-decides every tick, so two branches that
  // disagree used to trade the tick and leave the hero strobing
  // left/right/up/down, moving a few px each way and going nowhere — the jitter
  // that reads as a robot rather than a player. Choosing a direction now starts a
  // clock, and until it runs out he may correct, turn, or stop freely but NOT
  // about-face: he STANDS for the wait instead, which loses no ground (the two
  // half-steps were cancelling out) and is the only pace that really refills the
  // sprint pool. The preempt ladder above skips the limit entirely.
  if (!preempt && limitTurnRate(bot, state, hero, decided, tune) === "stand") {
    // Overrides the branch's label — a parked hero with a moving thought reads
    // as a wedge in BOT VIEW. The nav stall gauge is deliberately NOT reset
    // (unlike the stamina stands): a flicker that pins him on a quiet field IS
    // a wedge, and the unstuck sweep — which preempts, so it turns freely — is
    // exactly the right escape from it. The stand lasts at most the rest of the
    // clock (~half a second), so it can never become a lock-up of its own.
    think(bot, "STEADY");
    decided.steering = false;
    decided.target = { x: player.pos.x, y: player.pos.y };
    decided.jump = false;
  }
  return postDecision(bot, state, hero, tune, decided, preempt !== null);
}

/** The PREEMPT LADDER (see {@link decideAct}): the reflex/committed branches that
 * outrank every strategy — and bypass the turn rate limit. Null when the field
 * leaves the decision to the strategy. */
function preemptInput(
  bot: Bot,
  state: GameState,
  hero: Player,
  tune: BotTuning,
): GameInput | null {
  // HOP an incoming employee stampede FIRST — before every strategy branch,
  // even while disarmed: a herd charges fast and a jump sails clean over the
  // whole wall, and a ~20% bite + a 2-second knockdown is the worst thing to
  // eat mid-arm-up. A reflex that preempts even the opening-strike approach.
  const herdHopReflex = dodgeStampede(state, hero, tune);
  if (herdHopReflex) {
    think(bot, "HERD");
    return sprint(herdHopReflex);
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
  // objective would strand him unarmed for the whole run. A SCRIPTED beat, so
  // it preempts (and skips the turn limit) like the reflexes.
  if (hero.disarmed) {
    think(bot, "ARM UP");
    // …EXCEPT THAT THE BEAT MAY BE BEHIND A DOOR HE CANNOT OPEN. On GOODCO's
    // staff lot the whole scene — the crowd, the rusher, the blade — is inside
    // a building whose entrance opens for a badge and nothing else, so the read
    // above is answered by `entrance.ts`: fall in behind somebody who has one.
    const waiting = entranceGoal(state, hero);
    if (waiting) {
      think(bot, waiting.thought);
      return routeSteer(bot, state, hero, waiting.pos);
    }
    // THE BEAT HAS A PLACE, AND HE HAS TO BE STANDING IN IT. The level pins the
    // rusher and the crowd it breaks from at one spot (`openingStrike.at`), and
    // reading only the NEAREST foe was an approximation that held exactly while
    // that spot was a few steps from the landing: it stopped holding the moment
    // the scene moved indoors, because the first bodies out of the door reach
    // him first, plant him on the tarmac at their own standoff, and then STAND
    // BETWEEN HIM AND THE RUSHER — which the mob separation grid keeps them
    // doing, a body's width outside the strike radius, for the rest of the run.
    // (Measured: holstered for the entire clock on the campaign's first level.)
    // So he marches on the post itself, on a real route, and only settles into
    // the standoff read once he is standing in the scene.
    const post = runLevelDef(state).openingStrike?.at;
    if (post && distance(hero.pos, post) > tune.armApproachStandoff) {
      return routeSteer(bot, state, hero, post);
    }
    const foe = nearestEnemy(state, hero);
    if (!foe) return idleInput();
    // Outside the standoff → close in (trip the sight beat, draw the rusher
    // into contact). At or inside it → plant and take the harmless scripted
    // hit rather than retreating the pack across the map.
    return distance(hero.pos, foe.pos) > tune.armApproachStandoff
      ? steer(state, hero, foe.pos)
      : idleInput();
  }
  // LAST-RESORT UNSTUCK: if he's made no progress for a while and has nothing
  // he can reach to fight, the strategy has wedged him — override it with the
  // deterministic escape sweep until he's moving again. (Also keeps the
  // progress bookkeeping, so it must run before every strategy branch.)
  const escape = unstuckInput(bot, state, hero, tune);
  if (escape) {
    think(bot, "UNSTICK");
    return sprint(escape);
  }
  // Bolt clear of a gravity well's pull before it drags him into the core —
  // a swallow is INSTANT DEATH, so this preempts even the set-piece dodge:
  // kiting a fight is exactly how the hero backs blind into a hole.
  const wellBolt = dodgeWell(state, hero);
  if (wellBolt) {
    think(bot, "WELL");
    return sprint(wellBolt);
  }
  // Dodge a telegraphed set-piece move (a rushing charge, a ground slam) the
  // instant one threatens — stepping off the line beats whatever the strategy
  // below would do, so the hero doesn't eat a boss's rush while planted on it.
  const dodge = dodgeTelegraph(state, hero);
  if (dodge) {
    think(bot, "DODGE");
    return sprint(dodge);
  }
  // Clear a falling meteor's impact mark before it detonates on him
  // (`state.asteroids`). Reading the telegraph and walking off the blast is
  // pure survival — it outranks the fight and the hay-ball sidestep, right
  // beside the set-piece dodge.
  const rock = dodgeAsteroid(state, hero);
  if (rock) {
    think(bot, "METEOR");
    return sprint(rock);
  }
  // Keep clear of ARMED BAIT (`state.baits`). Above the burning floor because
  // bait is a one-shot bang rather than a tick, and — unlike fire — the hero is
  // actively DRAWN to it: loot-shaped things are what the autopilot exists to
  // run at, so without this it would clear a boss's whole scatter by hand.
  const bait = dodgeBait(state, hero);
  if (bait) {
    think(bot, "BAIT");
    return sprint(bait);
  }
  // Get off BURNING FLOOR (`state.scorches`) — a boss's beam leaves the ground
  // alight, and a bot that held its firing position inside a fire would neither
  // play like a human nor produce a balance measurement worth having. Below the
  // real dodges: the burn is a slow tick, so clearing a slam still comes first.
  const fire = dodgeScorch(state, hero);
  if (fire) {
    think(bot, "FIRE");
    return sprint(fire);
  }
  // Step out of a rolling hay ball's lane before it shoves him back down the
  // street (Boot Hill's `state.hayBalls`). A quick sidestep, like a human
  // giving a rolling bale room — below the boss-move dodge, above the fight.
  const hay = dodgeHayBall(state, hero, tune);
  if (hay) {
    think(bot, "HAY");
    return sprint(hay);
  }
  // Sidestep an incoming sand storm (mars) before it sweeps over him — a
  // knockout in the horde is deadlier than most single hits, so getting off
  // its line preempts the strategy below.
  const stormDodge = dodgeSandstorm(state, hero, tune);
  if (stormDodge) {
    think(bot, "STORM");
    return sprint(stormDodge);
  }
  // RIDE OUT THE COMMITTED HOP. Airborne on a purposeful jump, keep steering
  // at the ground it was committed to (Bot.hopPlan) — the jump was DECIDED
  // (flee the pack / reposition over the contact) and the bot sticks to that
  // decision for the whole flight. Without this, the takeoff restarts the
  // hop cooldown, the very next airborne tick re-decides into a calmer
  // branch (HOLD plants him mid-air), and the jump degenerates into a
  // straight-up bounce that spent the stamina and repositioned nothing. The
  // reflex dodges above still preempt (an airborne hero can steer), and a
  // mechanic hop (stampede/bale) never latches a plan — hopping in place IS
  // that dodge.
  if (hero.z > 0 && bot.hopPlan) {
    think(bot, bot.hopPlan.flee ? "HOP OUT" : "HOP OVER");
    return sprint(navSteer(bot, state, hero, bot.hopPlan.target));
  }
  return null;
}

/** The STRATEGY's own read (nothing preempted): the posture bodies in fight.ts,
 * plus the simple single-purpose strategies. Subject to the turn rate limit —
 * this is the code whose per-tick re-decisions the limiter steadies. */
function strategyInput(
  bot: Bot,
  state: GameState,
  hero: Player,
  tune: BotTuning,
): GameInput {
  // With only untouchable apparitions left on the board there is no foe
  // to fight — push for the objective instead of chasing a hallucination.
  const foe = nearestEnemy(state, hero);
  switch (bot.strategy) {
    case "rush":
      think(bot, foe ? "RUSH" : "RUSH BOSS");
      return foe
        ? steer(state, hero, foe.pos)
        : pushBoss(bot, state, hero, tune);
    case "kite": {
      if (!foe) {
        think(bot, "PUSH BOSS");
        return pushBoss(bot, state, hero, tune);
      }
      // Hold inside weapon range, outside the pack's grasp. A lone chaser is
      // back-pedalled straight (holdOff) — circling one that out-runs you only
      // lets it cut the chord; the orbit is for a boss/set-piece the hero is
      // committed to DPSing (pushBoss / the survive boss-lock).
      think(bot, "KITE");
      const reach = firingReach(state, hero, foe.pos);
      return steer(state, hero, holdOff(state, hero, foe.pos, reach * 0.7));
    }
    case "boss":
      think(bot, "TO BOSS");
      return pushBoss(bot, state, hero, tune);
    case "aggro":
      return survive(bot, state, hero, "aggro", tune);
    case "flee":
      return survive(bot, state, hero, "flee", tune);
    case "survivor":
    case "balanced":
      return survive(bot, state, hero, "balanced", tune);
    default:
      think(bot, "IDLE");
      return idleInput();
  }
}

/**
 * Plant the hero where he stands for a DELIBERATE stand: kill the steering, aim
 * the target at his own feet, and refuse the hop. The unstuck stall gauge is
 * cleared with it — a breather is a decision, not a wedge, and the sim's stuck
 * read must not book it as one (the pre-fight BREATHER does the same).
 */
function plantBreather(
  bot: Bot,
  state: GameState,
  hero: Player,
  decided: GameInput,
): void {
  const player = hero;
  decided.steering = false;
  decided.target = { x: player.pos.x, y: player.pos.y };
  decided.jump = false;
  if (bot.nav) {
    bot.nav.stuckMs = 0;
    bot.nav.lastPos = { x: player.pos.x, y: player.pos.y };
    bot.nav.lastTimeMs = state.stats.timeMs;
  }
}

/**
 * THE BONE-DRY DIG-IN: should the hero plant and pay off the empty-pool regen
 * lockout right now?
 *
 * Emptying the pool freezes regen until he has stood DEAD STILL for
 * `STAMINA.emptyRegenLockMs` (2 s) uninterrupted — a single step re-arms the
 * whole window — so a spent hero who keeps shuffling never gets one point back
 * and stays capped at the half-speed winded jog for the rest of the level. That
 * makes the lockout a RACE worth doing arithmetic on: standing costs the
 * remaining debt (plus `digInMarginSec` for the tick spent stopping), and
 * {@link contactEtaSec} says how long he actually has. Clear the window and he
 * plants; short of it, standing would be interrupted and buy nothing, so he
 * keeps moving and pays later.
 *
 * The plant is LATCHED (`Bot.digIn`) for exactly that reason — a stand
 * abandoned at 1.9 s is 1.9 s thrown away — and released the moment the debt is
 * paid, the tick stops being `eligible` (a reflex took the wheel, a body crowded
 * in), or a potion refills the pool (nothing frozen left to thaw). Pure but for
 * the bot's own latch.
 */
function digInForLockout(
  bot: Bot,
  state: GameState,
  hero: Player,
  tune: BotTuning,
  eligible: boolean,
  window: number,
): boolean {
  const player = hero;
  const owed = state.staminaRegenLockMs;
  if (!eligible || tune.digInMarginSec < 0 || owed <= 0 || player.stamina > 0) {
    bot.digIn = false;
    return false;
  }
  // The debt is paid in STANDSTILL ms, so the stand has to outlast what's left
  // of it. Committed once entered: only the releases above break it.
  if (!bot.digIn && window < owed / 1000 + tune.digInMarginSec) return false;
  bot.digIn = true;
  return true;
}

/**
 * The POST-DECISION modifiers, applied to whatever branch won: the stamina
 * pacing, the strategic aim, the powerup dock, the consumables, and the
 * pass-over top-off. None of them changes WHERE the hero goes (nor the branch's
 * thought label, bar the deliberate stamina stand) — they decide how hard he
 * pushes and what he spends on the way.
 */
function postDecision(
  bot: Bot,
  state: GameState,
  hero: Player,
  tune: BotTuning,
  decided: GameInput,
  reflex: boolean,
): GameInput {
  const player = hero;
  // STAMINA PACING — a post-decision pace modifier (like the aim/consumable
  // tweaks below; the branch's thought label stands, bar the deliberate
  // stands). The rule is absolute and simple: the hero RUNS only under
  // URGENCY or with the pool above the run threshold (`walkStaminaFrac`,
  // ~70%); below it every non-urgent reposition is WALKED (the engine's walk
  // pace regains a trickle on the move), and where standing is SAFE he PLANTS
  // outright — standing is the only real refill, ten times the walk's
  // trickle. Safety is read as a CLOCK, not a ring: `contactEtaSec` says how
  // many seconds before the first body could be on him, so a slow mob 200px
  // out no longer keeps the hero burning while a charger at the same range
  // still does. Urgency is (a) a body inside the crowded floor
  // (`standClearDist`) or arriving within `restMinSec`, (b) a branch that set
  // its own throttle (the reflex dodges and emergency bails sprint
  // explicitly — see `sprint`), or (c) a hop the pool can still PAY for (hops
  // are emergencies; below the takeoff cost the engine refuses the jump
  // anyway). One exception outranks even urgency: the BONE-DRY DIG-IN
  // (`digInForLockout`) — with the pool at zero and regen frozen behind the
  // 2 s standstill lockout, a window long enough to pay it off is worth
  // standing through, because no amount of running fixes an empty pool.
  // Arriving at fights RESTED is the pre-fight top-up's job
  // (topUpBeforeFight), not this threshold's. (trackBravery still feeds the
  // top-up's rested bar — see braveryScore.)
  trackBravery(bot, state);
  const foe = nearestEnemy(state, hero);
  const foeDist = foe ? distance(player.pos, foe.pos) : Infinity;
  // A GENUINELY CLEAR field — nothing even at the horizon of the fight, so the
  // pool has nothing to be spent on and everything to gain from a stand.
  const quiet = tune.restClearDist > 0 && foeDist > tune.restClearDist;
  if (tune.walkStaminaFrac > 0) {
    // RECOVERY WALK latch: below the run threshold drop to the walk; resume
    // the run only once the pool clears the hysteresis band above it.
    const resumeFrac = Math.max(tune.walkStaminaFrac, tune.walkResumeFrac);
    if (player.stamina <= player.maxStamina * tune.walkStaminaFrac) {
      bot.recovering = true;
    } else if (player.stamina >= player.maxStamina * resumeFrac) {
      bot.recovering = false;
    }
    // The WINDED STAND latches at the stand floor — BEFORE the pool runs
    // bone-dry, never after — and releases at the run threshold, where the
    // pool counts as recovered. Standing regains ten times the walk's
    // trickle (and is the only pace that pays down the empty-pool standstill
    // lockout), so the phases chain stand → run, with the walk carrying only
    // the urgency-interrupted middle ground.
    if (player.stamina <= player.maxStamina * tune.standStaminaFrac) {
      bot.winded = true;
    } else if (player.stamina >= player.maxStamina * tune.walkStaminaFrac) {
      bot.winded = false;
    }
    // The QUIET-FIELD BREATHER latch: with the field clear there is nothing to
    // spend the pool on, so a LOW pool (`restStaminaFrac` — well under the run
    // threshold, the state a fight leaves him in) is stood back up instead of
    // crawled back at the walk's trickle. It holds to a FULL pool — releasing
    // at the run threshold would stutter (stand a third of a second, run a
    // third of a second, repeat), while one long stand ends with the hero
    // rested for whatever the march walks into. A body wandering inside
    // `restClearDist` ends it: from there the fight reads (and the pre-fight
    // top-up) own the pacing. Deliberately NOT armed at the run threshold
    // itself: a hero merely off full has nothing to gain from parking, and
    // measurably loses ground doing it.
    const restBar =
      player.maxStamina * Math.min(tune.restStaminaFrac, tune.walkStaminaFrac);
    if (quiet && player.stamina <= restBar) {
      bot.resting = true;
    } else if (!quiet || player.stamina >= player.maxStamina) {
      bot.resting = false;
    }
  } else {
    bot.recovering = false;
    bot.winded = false;
    bot.resting = false;
  }
  const affordableHop =
    decided.jump && player.stamina >= STAMINA.jumpCost * player.maxStamina;
  // Book the takeoff for the discretionary-hop cooldown (`hopCooldownMs`): any
  // grounded, payable jump request — reflex dodges included — restarts the
  // clock, so hops stay spaced out no matter which branch asked for one.
  if (affordableHop && player.z === 0) bot.lastHopMs = state.stats.timeMs;
  // A body THIS close is on him already — no arithmetic makes standing there a
  // breather, so the crowded floor vetoes every deliberate stand.
  const crowded = foeDist <= tune.standClearDist;
  // The stand CLOCK: worst-case seconds before the first body arrives. It
  // gates every deliberate STAND — a slow mob 300px out can't punish a
  // two-second plant, a charger at the same range can, and the ring alone
  // can't tell them apart. It deliberately does NOT govern the recovery WALK:
  // measured over five seeds, pacing the approach by the clock cost ~9% of the
  // kills per minute (the hero walked at half speed toward everything slow),
  // so the walk keeps its plain ring — a body inside `walkThreatDist` means
  // full pace, as it always has.
  const window = contactEtaSec(state, hero);
  const standSafe = !crowded && window >= tune.restMinSec;
  // URGENT — no time to pace: spend what's left of the pool at full speed. A
  // hero with a pool to spend reads that off the plain RING (see above). A
  // WINDED one reads it off the CLOCK instead, because he has nothing left to
  // spend: a sprint at the stand floor buys half a second of full speed and
  // hands back the winded jog — at half the top speed and regaining NOTHING —
  // for the rest of the level. Sprinting from a body that is genuinely closing
  // is still worth that; sprinting from one plodding in from 200px is how a
  // hero ends up permanently spent, running his own recovery into the ground.
  const urgent = bot.winded ? !standSafe : foeDist <= tune.walkThreatDist;
  // DIG IN — the pool is bone-dry and regen is FROZEN until the hero has stood
  // dead still for the rest of `STAMINA.emptyRegenLockMs` (any step re-arms the
  // full 2 s). Nothing can reach him inside that window, so he plants and pays
  // the debt off in one piece instead of shuffling on at the half-speed winded
  // jog forever, never regaining a point. Once it's paid the ordinary pacing
  // takes over — the recovery WALK below with something still coming, a full
  // CATCH BREATH once the field is clear. Unlike the pacing this OUTRANKS a
  // branch's own sprint (`sprint()`): running is exactly what an empty pool
  // can't do, so a strategy that asked for full throttle gets the stand
  // instead. Only the REFLEXES — the dodges, the anti-wedge escape, a hop
  // already in flight — are left alone; they answer to a threat this tick.
  if (
    digInForLockout(
      bot,
      state,
      hero,
      tune,
      decided.steering === true && !reflex && !affordableHop && !crowded,
      window,
    )
  ) {
    think(bot, "DIG IN");
    plantBreather(bot, state, hero, decided);
    decided.throttle = undefined;
  } else if (
    decided.steering &&
    !affordableHop &&
    !urgent &&
    // A branch that set its OWN throttle has opted out of pacing — it sprints
    // because the moment demands it (`sprint()`: the gauntlet run, the boss
    // orbit). That licence ends at the stand floor: with the pool that low the
    // sprint buys a second of full speed and then hands back the winded jog for
    // the rest of the level, so a WINDED hero is paced anyway. Reflexes keep
    // the licence outright — a dodge is worth the last drop.
    (decided.throttle === undefined || (bot.winded && !reflex))
  ) {
    // CATCH BREATH — the deliberate stand, on either of two reads: the stand
    // floor (`winded`) with the walk-threat ring clear, or the QUIET-FIELD
    // breather (`resting`), where the low pool a fight leaves behind is topped
    // all the way back up because there is nothing to spend it on. Both need
    // the CLOCK long enough to make the plant worth taking. Standing regains
    // ten times the walk's trickle, so a few seconds parked on empty ground is
    // the cheapest full pool the hero will ever get. Overrides the branch's
    // thought — a parked hero with no label reads as a wedge in BOT VIEW.
    if (
      standSafe &&
      ((bot.winded && foeDist > tune.walkThreatDist) || bot.resting)
    ) {
      think(bot, "CATCH BREATH");
      plantBreather(bot, state, hero, decided);
    } else if (bot.recovering) {
      // The recovery WALK: the pool is down but something is close enough that
      // parking is unwise — walk it back at a trickle while covering ground
      // (running would burn the full drain at any pace).
      decided.throttle = STAMINA.walkThrottle;
    }
  }
  // STRATEGIC AIM: point the auto-weapon at the foe worth hitting, not merely
  // the nearest — the cluster a cone/spread/pierce covers best, or the wounded
  // body a single shot finishes (see {@link bestAimTarget}). The engine's
  // targeting reads `aim` exactly like a desktop mouse, so the bot steers its
  // fire the way a human does. Left unset with nothing worth diverting to,
  // which keeps the plain nearest-foe pick.
  if (!player.disarmed) {
    const aim = bestAimTarget(state, hero);
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
  const moment = pickPowerupMoment(state, hero);
  const drop = moment < 0 ? powerupDropForUpgrade(state, hero) : -1;
  const burn = moment < 0 && drop < 0 ? pickPowerupBurn(state, hero) : -1;
  const spend = moment >= 0 ? moment : burn;
  if (spend >= 0) {
    decided.useItem = true;
    decided.useItemIndex = spend;
  } else if (drop >= 0) {
    decided.dropItemIndex = drop;
  } else {
    const move = powerupSortMove(state, hero);
    if (move) decided.moveItem = move;
  }
  // Heal below the threshold (biggest-heal-first — consumeMedkit no-ops at full
  // so a mistap is free). Refill stamina ONLY with a threat near and the pool
  // low/empty — a winded hero is capped to a jog and gets run down. On a quiet
  // march the potion stays corked: the jog cap is merely slow, and standing
  // still refills the pool for free — supplies are for fights, not travel.
  decided.useMedkit =
    player.hp < player.maxHp * HEAL_HP_FRAC &&
    bestMedkitTier(state, player) >= 0;
  const threatNear = threatCountWithin(state, hero, THREAT_RADIUS) > 0;
  decided.useStaminaPotion =
    player.staminaPotions > 0 &&
    threatNear &&
    player.stamina < player.maxStamina * STAMINA_TOPUP_FRAC;
  // Spend a repair kit once a weapon has actually broken out of the hand (a
  // durability-0 spare sits in the bag) or the held blade is nearly spent — it
  // mends the whole kit and restores the shed weapon (useRepairKit no-ops with
  // nothing to mend, so a mistap is free).
  decided.useRepairKit = player.repairKits > 0 && needsRepair(state, hero);
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
    const reach = topOffReach(state, hero);
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
          tier === bestMedkitTier(state, player) &&
          player.hp < player.maxHp * TOP_OFF_HP_FRAC;
        if (fired) decided.useMedkit = true;
      } else if (item.kind === "drink") {
        fired =
          player.staminaPotions >= CONSUMABLES.stackCap &&
          player.stamina < player.maxStamina * TOP_OFF_STAMINA_FRAC;
        if (fired) decided.useStaminaPotion = true;
      } else if (item.kind === "repair") {
        fired =
          player.repairKits >= CONSUMABLES.stackCap && hasWear(state, hero);
        if (fired) decided.useRepairKit = true;
      }
      if (fired) {
        bot.lastTopOffMs = state.stats.timeMs;
        break;
      }
    }
  }
  return decided;
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
export function botAllocate(
  bot: Bot,
  state: GameState,
  hero: Player,
): StatName {
  const build = BUILD_ROTATION[botBuild(bot, state, hero)];
  const spent = Object.values(hero.spentStats).reduce((a, b) => a + b, 0);
  return build[spent % build.length]!;
}

/**
 * The build lane the bot is committed to — shared by `botAllocate` (stat
 * points) and `botPickTalent` (talent points) so the two spend on the same
 * strategy. `auto` follows the emergent lane, `meta` the frozen starting-level
 * lane, and a fixed profile is its own build.
 */
function botBuild(bot: Bot, state: GameState, hero: Player): StatBuild {
  if (bot.profile === "auto") return botLane(state, hero);
  if (bot.profile === "meta") {
    bot.metaLaneChoice ??= metaLane(hero.level);
    return bot.metaLaneChoice;
  }
  return bot.profile;
}

/**
 * Which talent the bot spends its next point on — the highest-priority talent
 * in the earning tree (the front of the HERO's own `pendingTalentPoints`)
 * that isn't maxed, per the build's `BUILD_TALENTS` order. Returns null only
 * if the tree is somehow full (the picker queue is capacity-clamped, so in
 * practice there is always a pick). Called whenever `pendingTalentPoints` is
 * non-empty; the driver spends the returned id via `spendTalentPoint`.
 */
export function botPickTalent(
  bot: Bot,
  state: GameState,
  hero: Player,
): string | null {
  const stat = hero.pendingTalentPoints[0];
  if (!stat) return null;
  const tree = TALENT_STAT_CLASS[stat];
  if (!tree) return null;
  const priority = BUILD_TALENTS[botBuild(bot, state, hero)];
  for (const id of priority) {
    const def = talentDefs()[id];
    if (def?.tree === tree && talentRank(state, hero, id) < def.maxRank)
      return id;
  }
  // Fallback: any not-maxed talent in the tree, in catalog order — keeps the
  // point spendable even if a build's priority list misses a talent.
  for (const def of talentsForTree(tree)) {
    if (talentRank(state, hero, def.id) < def.maxRank) return def.id;
  }
  return null;
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
function botLane(state: GameState, hero: Player): WeaponClass {
  // Shared with the auto-equip's on-lane preference (`weaponScore`), so the
  // lane the bot spends points on and the lane its gear favours are ONE rule.
  return committedLane(state, hero);
}
