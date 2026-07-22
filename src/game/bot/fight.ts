// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The autopilot's STRATEGY BODIES — the fight itself. `survive()` is the
// competent horde-survival read (the priority ladder from break-contact down
// to the edge-hug hold band) the three POSTURES parameterise; `pushBoss` is
// the boss beeline/orbit; `topUpBeforeFight` is the engage-rested read; and
// `commitHop` decides WHY before any discretionary jump leaves the ground.
// Pure w.r.t. the GameState — only the bot's own memory (hop plans, nav
// gauges, orbit sense) is mutated, so botted runs stay deterministic.

import { clamp, distance } from "@game/lib/vec.ts";
import type { Vec2 } from "@game/lib/vec.ts";
import { hasNukeBanked } from "./arsenal.ts";
import { nearestChestNearby } from "./content.ts";
import { hasPocketShooter } from "./economy.ts";
import {
  macroSteer,
  macroTarget,
  marchingOnFoe,
  travelHeading,
} from "./macro.ts";
import { navSteer, orbitHold, routeSteer, routeTarget, steer } from "./nav.ts";
import {
  awayFromPack,
  bestEscapeTarget,
  bestLanePoint,
  CONTACT_DODGE_RADIUS,
  escapeLaneScores,
  furthestLandmark,
  isEncircled,
  nearestEnemy,
  OPEN_LANE_SCORE,
  readyForBoss,
  retreatHeading,
  SURROUND_RADIUS,
  THREAT_RADIUS,
  threatsWithin,
} from "./perception.ts";
import { idleInput, think } from "./state.ts";
import type { Bot, Posture } from "./state.ts";
import {
  braveryScore,
  dingArrowNearby,
  ITEM_REACH,
  nearestRepairKit,
  nearestWantedItem,
  TOPUP_BRAVE_MIN_FRAC,
  wantedItemNearby,
  wantsRepairKitPickup,
} from "./supplies.ts";
import type { BotTuning } from "./tuning.ts";
import { PLAYER, STAMINA } from "../config/index.ts";
import { enemyDef } from "../defs/enemies/index.ts";
import { weaponDef } from "../defs/equipment.ts";
import { effectiveStat, weaponRangeFor } from "../items/index.ts";
import { onPathLevel } from "../path.ts";
import { blockedByObstacle } from "../obstacles.ts";
import type { GameInput, GameState } from "../types.ts";

/** On a path level, how close (world px) the hero must be to the boss to LOCK
 * onto it and fight it down rather than kite its adds — a boss-room-sized ring,
 * so he commits the moment he's in the arena even if a straggler waypoint went
 * untagged. */
const BOSS_LOCK_RANGE = 300;

/** HP fraction below which the fight counts as GOING BADLY (OVERWHELMED) —
 * what arms the defensive reads: the escape-route guard and the kite-backward
 * retreat drift. Above the posture `fleeHp` (the emergency bail), so caution
 * starts while there is still a bar left to protect; below full, so a healthy
 * hero keeps the forward-pressing game that actually clears maps. */
const OVERWHELMED_HP_FRAC = 0.7;

/**
 * Beeline for the boss (or his landmark), then hold at the equipped weapon's
 * reach and fight him from there. Deriving the hold distance from the weapon
 * (rather than a fixed 180) is what lets a MELEE loadout — the default crude
 * sword included — actually close to swinging range instead of kiting a boss
 * it can never touch; a ranged loadout still keeps its distance.
 */
export function pushBoss(
  bot: Bot,
  state: GameState,
  tune: BotTuning,
): GameInput {
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
 * Decide WHY before leaving the ground: commit a DISCRETIONARY HOP to a purpose
 * and a landing ground, or refuse it. A jump is only worth its stamina if the
 * hero can actually TRANSLATE while airborne, so this sweeps a body-width probe
 * toward the intended target (`hopCommitDist` deep) and refuses the hop when a
 * solid wall/rock blocks the lane — a jump into a wall just rises in place; the
 * move continues on FOOT and nav rounds the wall instead. When the lane is open
 * it latches {@link Bot.hopPlan} (`flee` = escaping to shed damage, else
 * repositioning over the contact), and `decideAct` keeps steering the airborne
 * hero at that committed target until he lands — so the hop carries him where
 * it was aimed instead of dissolving into a straight-up bounce the first tick a
 * calmer branch wins the re-decide. Pure function of state + bot memory —
 * determinism holds.
 */
function commitHop(
  bot: Bot,
  state: GameState,
  target: Vec2,
  flee: boolean,
  tune: BotTuning,
): boolean {
  const pos = state.player.pos;
  const dx = target.x - pos.x;
  const dy = target.y - pos.y;
  const d = Math.hypot(dx, dy);
  // No ground to gain — a hop in place is a loser move.
  if (d < 1) return false;
  const probe = Math.min(d, tune.hopCommitDist);
  const end = {
    x: clamp(pos.x + (dx / d) * probe, 20, state.level.width - 20),
    y: clamp(pos.y + (dy / d) * probe, 20, state.level.height - 20),
  };
  if (blockedByObstacle(state, pos, end, PLAYER.radius)) return false;
  bot.hopPlan = {
    target: { x: target.x, y: target.y },
    flee,
    sinceMs: state.stats.timeMs,
  };
  return true;
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
export function survive(
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
      return navSteer(bot, state, item.pos);
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
      return navSteer(bot, state, chest.pos);
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
  const weapon = weaponDef(player.equipment.weapon.defId);
  // Ranged/magic keeps FIRING mid-air; a melee blade can't land a single blow
  // above JUMP.dodgeHeight (step/ z-gates the swing), so an airborne melee
  // hero is a zero-DPS passenger. His jumps must buy ESCAPE — fleeing a pack,
  // shedding damage — never ride along a forward press.
  const ranged = weapon.projectile !== undefined;
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
    // airborne frames buy an actual escape. Every hop is COMMITTED to its
    // destination first (`commitHop`: the lane must be open, and the flight
    // then steers there until landing). Between bites (and on a low-HP
    // fall-back with an open lane) he RUNS to the medkit / open ground on foot,
    // banking stamina instead of hopping the whole way and winding himself; the
    // reserve floor keeps the pool from ever bottoming out.
    if (lowHp) {
      // A DINGING golden arrow beats any medkit: the level-up it tips is a
      // free FULL heal + stamina refill (see Bot.arrowXp — the bot knows what
      // an arrow pays from experience), and the medkit stays pocketed.
      const arrow = dingArrowNearby(bot, state, ITEM_REACH);
      if (arrow) {
        think(bot, "GRAB ARROW");
        return navSteer(
          bot,
          state,
          arrow.pos,
          wantHop && commitHop(bot, state, arrow.pos, true, tune),
        );
      }
      // Else a medkit within reach is worth the detour when we're bleeding.
      const item = nearestWantedItem(state);
      if (
        item &&
        item.kind === "medkit" &&
        distance(player.pos, item.pos) < ITEM_REACH
      ) {
        think(bot, "GRAB MEDKIT");
        return navSteer(
          bot,
          state,
          item.pos,
          wantHop && commitHop(bot, state, item.pos, true, tune),
        );
      }
    }
    think(bot, lowHp ? "FALL BACK" : "PUNCH OUT");
    // The break-out lane avoids FORWARD (the fresh spawns live up the axis)
    // unless a banked nuke makes the bot daring.
    const out = bestEscapeTarget(state, near, !daring);
    return navSteer(
      bot,
      state,
      out,
      wantHop && commitHop(bot, state, out, true, tune),
    );
  }

  // 2.4. Fight the locked set piece down — hold at weapon range and press it,
  //    hopping through contact with a ranged loadout — instead of kiting past.
  if (lockTarget) {
    think(bot, "FIGHT BOSS");
    // Circle-strafe the boss at the hero's ACTUAL reach rather than planting on
    // the hold point — a moving target slips his shots between the telegraphs the
    // dedicated dodge already reads.
    const reach = weaponRangeFor(state, player.equipment.weapon);
    const hold = orbitHold(
      bot,
      state,
      lockTarget.pos,
      reach * 0.7,
      tune.orbitStep,
    );
    // The through-contact reposition hop is RANGED-ONLY (the gun keeps firing
    // mid-air; a melee blade can't swing at all up there), and committed to
    // the orbit point like every other jump.
    const lockHop =
      ranged &&
      grounded &&
      hopReady &&
      hasHopStamina &&
      nearestD < CONTACT_DODGE_RADIUS &&
      commitHop(bot, state, hold, false, tune);
    return steer(state, hold, lockHop);
  }

  // 2.6. STOCK A REPAIR KIT. The held weapon is wearing thin (or a broken spare
  //    waits in the bag) and the hero holds no kit — detour to a repair kit lying
  //    within reach so it's in hand before the blade gives out. The engine swaps
  //    to the next-best spare the instant a weapon breaks, and spending the kit
  //    (`needsRepair`, above in botAct) mends the whole loadout and RE-EQUIPS the
  //    shed weapon (`repairAll`), so a stocked kit is what makes the whole
  //    downgrade → repair → re-equip cycle close. Only when not pressed (nearest
  //    body beyond the danger bubble), so scooping loot never walks into a bite.
  const dangerHold = tune.graspStandoff * pt.standoffMul;
  if (wantsRepairKitPickup(state) && nearestD > dangerHold) {
    const kit = nearestRepairKit(state);
    if (kit && distance(player.pos, kit.pos) < ITEM_REACH) {
      think(bot, "GET REPAIR");
      // On foot — a supply detour is no place to spend jump stamina (the old
      // `grounded` flag here hopped the whole walk to the kit).
      return navSteer(bot, state, kit.pos);
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
      return navSteer(bot, state, loot.pos);
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
        return navSteer(bot, state, chest.pos);
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
      const lane = bestLanePoint(state, escapeLaneScores(state, near, true));
      return navSteer(
        bot,
        state,
        lane,
        wantHop && commitHop(bot, state, lane, true, tune),
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
      const press = { x: player.pos.x + hx * 150, y: player.pos.y + hy * 150 };
      // A gauntlet hop is a forward REPOSITION over the contact — gated on
      // dealing damage in flight: the gun fires mid-air, and a blade hero
      // with a pocket shot banked draws it at the top of the hop (the
      // harness's stepBotWeaponSwap), so only the pocketless blade — dead
      // weight airborne — stays grounded. Committed to the press heading
      // before takeoff.
      return navSteer(
        bot,
        state,
        press,
        wantHop &&
          (ranged || hasPocketShooter(state)) &&
          commitHop(bot, state, press, false, tune),
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
  // The hero's ACTUAL effective reach — the base range widened by STRENGTH (a
  // melee blade's depth) or INTELLIGENCE (ranged/magic), the SAME distance
  // `stepWeapon` uses (weaponRangeFor) to decide whether a swing or a shot
  // actually connects. Holding off the raw base range left a high-reach loadout —
  // and, with a wide `flee` standoff, ANY ranged one — standing BEYOND where its
  // shots land, skirmishing a pack it could never hit. Reading the real reach is
  // what makes the hold range-aware.
  const reach = weaponRangeFor(state, player.equipment.weapon);
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
    // every blow. The grasp is the same centre-to-centre bite line step/ uses
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
    // standoff reset gives ground on foot — see `wantHop`. The hop commits to
    // the retreat ground first (open lane, ridden to the landing).
    think(bot, "GIVE GROUND");
    const fall = {
      x: player.pos.x + away.x * 150,
      y: player.pos.y + away.y * 150,
    };
    return navSteer(
      bot,
      state,
      fall,
      wantHop && commitHop(bot, state, fall, true, tune),
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
    const press = { x: player.pos.x + hx * 150, y: player.pos.y + hy * 150 };
    // An advance hop is a forward REPOSITION, not an escape — gated on
    // dealing damage in flight (the gun keeps firing mid-air; a blade hero
    // qualifies too once a pocket shot is banked, since the harness's
    // stepBotWeaponSwap draws it at the top of the hop — only the pocketless
    // blade, dead weight airborne, stays grounded) and committed to the press
    // heading before takeoff. A melee hero in trouble still hops — on the
    // RETREAT branches, where the jump actually sheds damage.
    return navSteer(
      bot,
      state,
      press,
      wantHop &&
        (ranged || hasPocketShooter(state)) &&
        commitHop(bot, state, press, false, tune),
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
    // Commit the escape hop to the open-side ground; a blocked lane keeps him
    // on his feet (still moving out — navSteer rounds the wall).
    const out = {
      x: player.pos.x + away.x * 150,
      y: player.pos.y + away.y * 150,
    };
    return navSteer(bot, state, out, commitHop(bot, state, out, true, tune));
  }
  think(bot, "HOLD");
  return {
    steering: false,
    target: { x: player.pos.x, y: player.pos.y },
    jump: false,
  };
}
