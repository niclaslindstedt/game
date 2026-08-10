// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE AUTOPILOT AT HOME — what the bot does on a HUB level (`objective.type ===
// "hub"`: the garage, or a mod's own town), where there is nothing to fight and
// everything to do.
//
// **THE HUB IS THE ONE VENUE WHOSE WHOLE CONTENT IS PEOPLE AND DOORS.** Every
// other level answers "what now?" with a horde, a cache, a fog frontier or a
// boss, and `macro.ts` reads all four. Home has none of them — no knot is ever
// placed (`horde: 0` on every area), nothing is loot, the floor starts
// `revealed` and the objective never clears — so the ladder ran off the end of
// itself and `botAct`'s empty-field branch stood the hero still. Turning the
// AUTO PILOT on in the garage did NOTHING, which is the bug this module is.
//
// What a player does at home is a short, ordered list, and this module owns the
// last two rungs of it:
//
//   1. THE PEOPLE — whoever has a `!` or a `?` over their head. NOT this
//      module's any more: the bot works a slate on every map now, so the
//      giver rung lives in `errands.ts` and outranks everything here.
//   2. THE COUNTER — sell the haul, mend the kit, top the pouch back up. The
//      trade itself is `economy.ts`'s (`tradeAtMerchant`); the hub only widens
//      WHEN a visit pays, because at home the stall is on the way out.
//   3. THE CAR — climb in, drive out through the roll-up and onto the road,
//      which is where the level lets go (`vehicles.ts` books the trip).
//
// The split every bot module keeps holds here too: this file DECIDES (pure
// reads of the state — no mutation, no `state.rng`, so a botted run stays
// deterministic) and the verbs it names are run commands the hosts send
// (`bot/intent.ts`). Nothing here talks to the app.
//
// **WHETHER THE COUNTER PAYS ARRIVES AS AN ARGUMENT**, rather than being read
// here: `economy.ts` owns that question and reads {@link atHub} to answer it,
// so asking it back would be a cycle. The callers already have it in hand.

import { distance } from "@game/lib/vec.ts";
import type { Vec2 } from "@game/lib/vec.ts";

import { CAR, carIsWayOut } from "../vehicles.ts";
import { runLevelDef } from "../defs/levels/index.ts";
import { giverTopics } from "../quests/index.ts";
import { talkChoices } from "../conversation.ts";
import { anyZoneContains, type Zone } from "../zones.ts";
import { MERCHANT } from "../config/index.ts";
import { routeSteer } from "./nav.ts";
import { idleInput } from "./state.ts";
import type { Bot } from "./state.ts";
import type {
  CarVehicle,
  GameInput,
  GameState,
  Player,
} from "../types/index.ts";

/** Is this run being played on the campaign's HOME venue? Asked of the CARVED
 * def like every other in-run level read, so a mod's own hub answers yes the
 * way the garage does. Pure. */
export function atHub(state: GameState): boolean {
  return runLevelDef(state).objective.type === "hub";
}

/** A hub destination: where to walk, and the BOT VIEW label that names why.
 * The PEOPLE are no longer one of them — a slate is worked on every map now
 * (`errands.ts`), from a rung that outranks this one. */
export type HubGoal = {
  pos: Vec2;
  thought: "TO SHOP" | "TO CAR";
};

/**
 * THE HUB'S CAR — the campaign's earthbound door, and the one door whose trip
 * the engine can book on its own: the rocket and the rift seam are gated on
 * campaign progress that lives on the CHARACTER and never reaches a run (see
 * `LevelDef.travelDoors`), so the bot cannot know where either of them may go.
 *
 * Null on a hub with no car, one already departing, one somebody is at the
 * wheel of, or one whose door the level never named a destination for —
 * climbing into that last is how a ride strands itself in its own driveway.
 */
export function hubCar(state: GameState): CarVehicle | null {
  const door = runLevelDef(state).travelDoors?.find((d) => d.id === "car");
  if (!door || door.to.length === 0) return null;
  for (const vehicle of state.vehicles) {
    if (vehicle.kind !== "car" || vehicle.departed) continue;
    if (vehicle.driver !== null) continue;
    return vehicle;
  }
  return null;
}

/**
 * THE WAGON, WHEN IT IS THE WAY OFF A VENUE THAT IS NOT HOME — GOODCO's staff
 * lot once PAYLOAD-1 is down (`LevelDef.exitByCar`, and `carIsWayOut` is the
 * shared predicate the mark over the roof and the boarding verb both read).
 *
 * A SEPARATE RUNG FROM {@link hubGoal} RATHER THAN A WIDER GATE ON IT, and the
 * difference is where it sits in the travel ladder. At home the car is the top
 * of a short ordered list, because a hub has no horde, no cache and no fog to
 * lose to. On a venue that has just been CLEARED there is a boss's drop on the
 * floor, chests nobody opened and the last of a horde still walking, and a
 * ladder that put the car above those would march the ride out of the building
 * over the top of the loot it came for.
 *
 * Null on every other level and on every other tick, which leaves the ladder
 * exactly as it was. Pure.
 */
export function exitCar(state: GameState): CarVehicle | null {
  if (atHub(state)) return null;
  if (!runLevelDef(state).exitByCar) return null;
  return carIsWayOut(state) ? hubCar(state) : null;
}

/** The car this hero is at the wheel of, or null when he is on his own feet. */
export function heroCar(state: GameState, hero: Player): CarVehicle | null {
  const seat = state.players.indexOf(hero);
  if (seat < 0) return null;
  for (const vehicle of state.vehicles) {
    if (vehicle.kind === "car" && vehicle.driver === seat) return vehicle;
  }
  return null;
}

/**
 * THE SHOP ERRAND'S DEAD-MAN SWITCH: how long (sim ms) the bot may stand AT the
 * counter still wanting a trade before the errand is written off for this
 * visit.
 *
 * `wantsMerchantVisit` promises every clause clears itself after a
 * `tradeAtMerchant`, and out in the field a clause that did not merely cost a
 * detour. At home it costs the whole ride: the counter sits ABOVE the car, so a
 * want the trade cannot satisfy — a second affordable upgrade the routine only
 * buys one of, a shelf a host's own cooldown keeps refusing — parks an
 * unattended AUTO PILOT in its own driveway burning coins at the meter. Long
 * enough that a real trade (and the app's 15 s counter cooldown) has every
 * chance to happen first.
 */
const HUB_SHOP_GIVEUP_MS = 45_000;

/**
 * Run the hub bookkeeping once per tick: gauge how long the hero has stood at
 * the counter with the shop errand still on, and LATCH it written off past
 * {@link HUB_SHOP_GIVEUP_MS}. Called from `decideAct`; mutates only the bot's
 * own memory (and re-arms on a level change), so determinism holds.
 */
export function trackHubShop(
  bot: Bot,
  state: GameState,
  hero: Player,
  shopWanted: boolean,
): void {
  const now = state.stats.timeMs;
  if (!bot.hub || bot.hub.levelId !== state.level.id) {
    bot.hub = { levelId: state.level.id, stallSinceMs: now, shopDone: false };
    return;
  }
  const hub = bot.hub;
  const atCounter =
    shopWanted &&
    distance(hero.pos, state.merchant.pos) <= MERCHANT.tradeRadius;
  // Away from the counter (or with nothing left to trade) the clock re-arms:
  // this measures standing THERE unable to finish, never the walk over.
  if (!atCounter) {
    hub.stallSinceMs = now;
    return;
  }
  if (now - hub.stallSinceMs > HUB_SHOP_GIVEUP_MS) hub.shopDone = true;
}

/**
 * THE HUB'S TRAVEL PLAN — where the bot goes at home once the SLATE is worked:
 * the counter, then the car. Null when this is not a hub (every other level
 * keeps the ordinary macro ladder untouched) or when there is genuinely
 * nothing left to do here.
 *
 * The PEOPLE used to be this function's first rung and are not any more: a
 * giver is a destination on every map now (`errands.ts` `errandGiver`), from a
 * rung of the ladder that sits ABOVE this one — so the ordering a player works
 * the room in survives, with the "who has a mark" half no longer written twice.
 *
 * `shopWanted` is `economy.ts`'s `wantsMerchantVisit` — see the module header
 * on why it arrives rather than being read.
 *
 * Read by `macro.ts` as a rung of the travel ladder, so the hero walks it
 * whether or not anything is on the board to fight. Pure (it only READS the
 * written-off latch {@link trackHubShop} keeps).
 */
export function hubGoal(
  bot: Bot,
  state: GameState,
  hero: Player,
  shopWanted: boolean,
): HubGoal | null {
  if (!atHub(state)) return null;
  if (shopWanted && !hubShopWrittenOff(bot, state)) {
    return { pos: state.merchant.pos, thought: "TO SHOP" };
  }
  const car = hubCar(state);
  if (car) return { pos: car.pos, thought: "TO CAR" };
  return null;
}

/** Has the shop errand been written off for this visit (see
 * {@link trackHubShop})? Pure. */
export function hubShopWrittenOff(bot: Bot, state: GameState): boolean {
  return bot.hub?.levelId === state.level.id && bot.hub.shopDone;
}

/** A verb the hub play wants pressed, in the shape `bot/intent.ts` turns into
 * a run command (a name from the closed list, and scalars). */
export type HubCommand = {
  readonly name:
    | "talkToQuestGiver"
    | "enterCar"
    | "pickQuestTopic"
    | "acceptQuest"
    | "turnInQuest"
    | "closeQuestDialogue"
    | "pickTalkChoice"
    | "advanceTalk";
  readonly args: readonly (string | number)[];
};

/**
 * WHAT THE BOT PRESSES at home, as a verb the hosts send — the action half of
 * {@link hubGoal}, decided from the same state and never applied here: standing
 * at the car with the room worked and the shopping done, `enterCar`, which
 * starts the engine on the spot.
 *
 * The giver's own press is `errands.ts` `giverTapCommand` (it happens on every
 * map), and working a conversation once it is OPEN is {@link botScreenCommand}'s
 * job — neither is a hub thing any more.
 *
 * Null whenever there is nothing in reach, which is most ticks. Pure.
 */
export function hubTapCommand(
  bot: Bot,
  state: GameState,
  hero: Player,
  shopWanted: boolean,
): HubCommand | null {
  if (state.phase !== "playing") return null;
  // A hero with a screen up is reading something; a hero at the wheel has
  // already pressed the only button home has left for him.
  if (hero.screen !== undefined || heroCar(state, hero)) return null;
  // THE WAY HOME OFF A CLEARED VENUE ({@link exitCar}) — the same press for the
  // same reason, and it is not a hub thing so it is asked first. Reach-gated
  // like the hub's, so it only fires standing at the wagon: the walk itself is
  // the macro ladder's, which is where the ordering against the loot lives.
  const ride = exitCar(state);
  if (ride) {
    return distance(hero.pos, ride.pos) <= CAR.boardRadius
      ? { name: "enterCar", args: [] }
      : null;
  }
  // THE PRESS IS THE ERRAND THE WALK IS ON, never merely what happens to be
  // within arm's reach — and the difference is the whole hub. The hero SPAWNS
  // sitting on the car (the carve puts his landing and the bay's parking spot
  // in the same place), so a ladder that boarded whatever was in reach drove
  // out on the first tick of every visit, past a mother with a `!` over her
  // head and a counter full of unsold loot. Asking `hubGoal` what he is doing
  // keeps the two in step by construction — and the giver rung above it in the
  // macro ladder is what keeps `hubGoal` silent while somebody is still owed a
  // conversation.
  const goal = hubGoal(bot, state, hero, shopWanted);
  if (!goal) return null;
  if (goal.thought === "TO CAR") {
    const car = hubCar(state);
    return car && distance(hero.pos, car.pos) <= CAR.boardRadius
      ? { name: "enterCar", args: [] }
      : null;
  }
  // TO SHOP has no press: the counter routine (`economy.ts tradeAtMerchant`) is
  // a whole stage of sells and buys the hosts run for themselves, and it is
  // proximity-gated exactly like this reach test would be.
  return null;
}

/**
 * WORK THE SCREEN THAT IS OPEN — the conversation verbs, as one decision.
 *
 * Deliberately NOT hub-gated: a giver stands on most maps, and a player who
 * taps one and then hands the run to the AUTO PILOT has left a modal in front
 * of an unattended hero. The rule is the same everywhere — read nothing, take
 * everything, hand in everything — because the ride is paying for exactly the
 * xp, coins and loot an errand hands over.
 *
 *   • the giver's PICK LIST → take its first row (`giverTopics` already orders
 *     it finished-work-first, then fresh work);
 *   • an OFFER → accept it;
 *   • a FINISHED errand → hand it in;
 *   • the "not yet" nag, or anything else → close it;
 *   • a CONVERSATION TREE (the meeting a person owes before their slate opens,
 *     `QuestGiverDef.intro`) → take its first row, or tap through a node that
 *     offers none.
 *
 * One verb per tick, decided from the run as this tick found it: each of these
 * moves the screen on, so the next tick reads the next box. Pure.
 */
export function botScreenCommand(
  state: GameState,
  hero: Player,
): HubCommand | null {
  if (hero.screen === "quest") {
    const offer = state.questOffer;
    if (!offer) return { name: "closeQuestDialogue", args: [] };
    if (offer.kind === "list") {
      const first = giverTopics(state, offer.giverId)[0];
      return first
        ? { name: "pickQuestTopic", args: [first.questId] }
        : { name: "closeQuestDialogue", args: [] };
    }
    if (offer.kind === "offer") return { name: "acceptQuest", args: [] };
    if (offer.kind === "complete") return { name: "turnInQuest", args: [] };
    return { name: "closeQuestDialogue", args: [] };
  }
  if (hero.screen === "talk") {
    // A node with rows wants one PICKED (paging past it would eat the choice
    // it exists for); a node without them is a speech, and the tap closes it.
    // Row 0 is the honest default: a tree's first row is the one that moves it
    // on, and a bot has no opinion about the others.
    return talkChoices(state).length > 0
      ? { name: "pickTalkChoice", args: [0] }
      : { name: "advanceTalk", args: [] };
  }
  return null;
}

/**
 * WHERE A DRIVEN CAR IS AIMED: the nearest ground of the level's ROAD OUT
 * (`LevelDef.driveOut`), or — on a hub whose departure is a garage door's
 * threshold instead — the door itself. Null when the level names neither, in
 * which case simply driving `CAR.departDistance` clear of the parking spot is
 * the latch (see `vehicles.ts`).
 *
 * The point is deliberately the nearest one INSIDE the strip rather than its
 * far end: the departure books on the bumper touching the tarmac at all, and
 * aiming further down the road only bends the approach. From there the
 * handover takes the wheel and the picture dims (`stepDeparture`). Pure.
 */
export function driveOutTarget(state: GameState, car: CarVehicle): Vec2 | null {
  const road = runLevelDef(state).driveOut;
  if (road && road.length > 0) return nearestZonePoint(road, car.pos);
  const door = state.doors.find((d) => d.approach);
  return door ? { x: door.center.x, y: door.center.y } : null;
}

/** The point of `zones` nearest `from` — a rect clamps a step inside its edge,
 * a circle projects onto its rim a hair inside, so the containment test the
 * departure runs answers yes on arrival rather than on the boundary. */
function nearestZonePoint(zones: readonly Zone[], from: Vec2): Vec2 {
  let best = { x: from.x, y: from.y };
  let bestD = Infinity;
  for (const zone of zones) {
    let point: Vec2;
    if (zone.shape === "circle") {
      const dx = from.x - zone.pos.x;
      const dy = from.y - zone.pos.y;
      const len = Math.hypot(dx, dy);
      point =
        len <= zone.radius || len < 1e-6
          ? { x: zone.pos.x, y: zone.pos.y }
          : {
              x: zone.pos.x + (dx / len) * zone.radius * 0.9,
              y: zone.pos.y + (dy / len) * zone.radius * 0.9,
            };
    } else {
      const r = zone.rect;
      point = {
        x: Math.min(Math.max(from.x, r.x + 1), r.x + r.width - 1),
        y: Math.min(Math.max(from.y, r.y + 1), r.y + r.height - 1),
      };
    }
    const d = distance(from, point);
    if (d < bestD) {
      bestD = d;
      best = point;
    }
  }
  return best;
}

/** Is the car already standing on the ground that ends the level? From here
 * the departure has fired and the car's controls are released for the dim, so
 * the bot stops steering rather than talking to a car nobody is driving. Pure.
 */
export function carHasArrived(state: GameState, car: CarVehicle): boolean {
  const road = runLevelDef(state).driveOut;
  return road !== undefined && anyZoneContains(road, car.pos);
}

/**
 * DRIVING OUT — the tick's input for a hero who is at the wheel, or null when
 * he is on his own feet.
 *
 * A driven car reads the SAME held-pointer input a walking hero does
 * (`stepVehicles` hands the seat's `GameInput` to `driveCar`, which turns the
 * bearing into throttle, brake and rack), so the autopilot drives by steering
 * at where it wants the nose to go — no second movement path, no vehicle
 * strategy. The target comes off the ordinary A* ROUTE, because the way out of
 * a garage is through its doorway and a beeline at the road is a beeline at the
 * bay's east wall; the roll-up opens for the approaching car on its own
 * (`CAR.doorReach`, well before the bumper).
 *
 * Two ticks it deliberately does nothing on: once the tarmac is under the
 * wheels (the departure has booked and the car is coasting through the dim,
 * see `stepDeparture`), and on a level that names no way out at all — where holding
 * the throttle down would only drive the hero's own car into his own wall.
 */
export function driveOutInput(
  bot: Bot,
  state: GameState,
  hero: Player,
): GameInput | null {
  const car = heroCar(state, hero);
  if (!car) return null;
  if (state.departure || carHasArrived(state, car)) return idleInput();
  const goal = driveOutTarget(state, car);
  if (!goal) return idleInput();
  return routeSteer(bot, state, hero, goal);
}
