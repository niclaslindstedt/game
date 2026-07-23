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
//   • supplies.ts   — loot/consumable/repair/arrow reads + bravery
//   • arsenal.ts    — aiming, the powerup dock, spellcasting
//   • fight.ts      — the strategy bodies (survive/pushBoss/hops)
//   • economy.ts    — bag/merchant play, invoked by the HARNESSES
//   • thoughts.ts   — the BOT VIEW thought resolver
//   • tuning.ts     — the BotTuning schema + shipped defaults (bot.yaml)

import { distance } from "@game/lib/vec.ts";
import { BUILD_ROTATION, metaLane } from "../builds.ts";
import {
  bestAimTarget,
  MANA_TOPUP_FRAC,
  pickPowerupBurn,
  pickPowerupMoment,
  pickSpellToCast,
  powerupDropForUpgrade,
  powerupSortMove,
} from "./arsenal.ts";
import { trackContentAbandon, trackExploreStall } from "./content.ts";
import {
  dodgeAsteroid,
  dodgeHayBall,
  dodgeSandstorm,
  dodgeStampede,
  dodgeTelegraph,
  dodgeWell,
} from "./dodges.ts";
import { pushBoss, survive } from "./fight.ts";
import { trackEngagement, unstuckInput } from "./macro.ts";
import { holdOff, navSteer, steer } from "./nav.ts";
import { nearestEnemy, THREAT_RADIUS, threatsWithin } from "./perception.ts";
import { botTuningFor, idleInput, think, trackWaypoint } from "./state.ts";
import type { Bot } from "./state.ts";
import {
  dingArrowNearby,
  hasWear,
  HEAL_HP_FRAC,
  needsRepair,
  reserveFloorFrac,
  STAMINA_TOPUP_FRAC,
  topOffReach,
  trackArrowXp,
  trackBravery,
} from "./supplies.ts";
import { createThoughtMemory, resolveThought } from "./thoughts.ts";
import { CONSUMABLES, STAMINA } from "../config/index.ts";
import {
  bestMedkitTier,
  committedLane,
  heroSpellStat,
  medkitTierIndex,
  weaponRangeFor,
} from "../items/index.ts";
import type {
  GameInput,
  GameState,
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

/** How near (world px) a DINGING golden arrow must be to stand in for a
 * medkit — close enough that "grab the arrow instead" is the same fight, not
 * a trek across the field while bleeding. */
const ARROW_SAVE_REACH = 150;
/** Below this hp fraction the medkit is popped even with a dinging arrow in
 * reach — nearly dead is no time to gamble on making the pickup. */
const ARROW_MEDKIT_HOLD_HP_FRAC = 0.3;
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
    // A gravity well's drag works on a clear field too — a swallow is instant
    // death, so bolting clear outranks every other sidestep.
    const wellBolt = dodgeWell(state);
    if (wellBolt) {
      think(bot, "WELL");
      return wellBolt;
    }
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
  // LAND the committed hop: back on the ground (and not on the takeoff tick
  // itself), the jump's purpose is spent — clear the plan so the normal read
  // resumes. Also self-heals a takeoff the engine refused (z never left 0).
  if (
    bot.hopPlan &&
    state.player.z === 0 &&
    bot.hopPlan.sinceMs !== state.stats.timeMs
  )
    bot.hopPlan = null;
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
    // Bolt clear of a gravity well's pull before it drags him into the core —
    // a swallow is INSTANT DEATH, so this preempts even the set-piece dodge:
    // kiting a fight is exactly how the hero backs blind into a hole.
    const wellBolt = dodgeWell(state);
    if (wellBolt) {
      think(bot, "WELL");
      return wellBolt;
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
    if (state.player.z > 0 && bot.hopPlan) {
      think(bot, bot.hopPlan.flee ? "HOP OUT" : "HOP OVER");
      return navSteer(bot, state, bot.hopPlan.target);
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
  // castable power at the fight — survival first (a heal when bleeding with no
  // kit), then the fight-opening buff, then whichever damage cast converts the
  // most mana to landed damage, with the situational ward/slow behind. Only a
  // hero with a CLASS (a dominant STR/DEX/INT that unlocks a spell list) casts.
  // The spell bar is filled by the harness/app (economy.ts's
  // `botAssignSpellBar` keeps it carrying the strongest unlocked powers); the
  // bot reads it and stays pure (input only, no state mutation).
  if (heroSpellStat(state) !== null) {
    decided.useManaPotion =
      player.manaPotions > 0 && player.mana < player.maxMana * MANA_TOPUP_FRAC;
    const slot = pickSpellToCast(state, threatNear, tune);
    if (slot >= 0) {
      decided.castSpell = true;
      decided.castSpellIndex = slot;
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
