// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE AUTOPILOT'S WHOLE OUTPUT IS AN INTENT — a decision that travels, never
// a direct mutation of the run.
//
// **THE HALF THAT WAS ALREADY DONE.** `botAct` never touched the run — it
// RETURNS a `GameInput`, which is the very shape `FRAME.input` carries. So
// steering has always been an intent and needed nothing designed: the caller
// decides what it means. `step(state, input, dt)` in the simulator, the run loop
// in a local game, `transport.send(encodeFrame(FRAME.input, …))` in a client.
//
// **THE HALF THIS MODULE IS.** Five HOUSEKEEPING calls reached in and MUTATED —
// the pocket arsenal's draw, the companion's care, the auto-equip sweep, the
// loot cull and the bag sort. Those cannot cross a wire: on a client a direct
// write lands on a replicated state and the NEXT SNAPSHOT ERASES IT, so the
// bot's swap, its shed or its tidy silently does not happen. The fix is not to
// move the bot but to make its whole output an intent — a NAME plus SCALAR
// ARGUMENTS drawn from the closed list the command channel already polices
// (`src/game/commands.ts`).
//
// **EVERY ONE IS A DECISION PLUS A VERB, AND THE SPLIT IS THE WHOLE JOB.** In
// each case the DECISION is the autopilot's opinion and the ACTION is the
// hero's, so the opinion stays under `bot/` and the action lives with the thing
// it acts on — which is why `swapHand`, `sortInventory` and `bankSpareItem` sit
// in `items/inventory.ts` rather than here. A run command that reached into the
// autopilot for its implementation would put the bot on the server's critical
// path, which is exactly backwards.
//
//   the draw   → `botWeaponSwapTarget`  → swapHand(cell)
//   the care   → `botReviveCell`        → spendReviveItem(cell)
//                `botCompanionToHeal`   → healCompanionWithMedkit(id)
//   the wear   → `botWantsGearSweep`    → autoEquipGear()
//   the shed   → `botCullPlan`          → bankSpareItem(cell)
//   the tidy   → `inventoryNeedsSort`   → sortInventory()
//   the room   → `botScreenCommand`     → pickQuestTopic / acceptQuest /
//                                         turnInQuest / closeQuestDialogue /
//                                         pickTalkChoice / advanceTalk
//                `giverTapCommand`      → talkToQuestGiver(id)
//                `hubTapCommand`        → enterCar()
//
// THE ROOM is a THIRD half, and it has to be: the other two are gated on the
// hero being on the FIELD, and the whole point of a screen verb is a hero who
// is not (see {@link driveBotErrands}).
//
// **THE TICK HAS TWO HALVES AND THAT IS NOT AN ACCIDENT.** The draw and the
// care are decided BEFORE the step — the hand the bot steers with is the hand it
// just drew — and the bag discipline AFTER it, once this step's pickups have
// landed. Culling before the step only reopens a cell the same step's pickup
// refills, which is the bug that made a watched AUTO PILOT run ride a full bag.
// So there are two entry points rather than one, and hosts call them where the
// step is.
//
// **THE THREE HOSTS, AND THE ONE WAY THEY DIFFER.**
//
//   IN-PROCESS (the simulator, a local run) — {@link runBotActions} /
//   {@link runBotUpkeep} decide and apply through `applyRunCommand`, the same
//   dispatch the server runs, so a verb cannot behave one way under the bot and
//   another in a session. The run is right here to be read again between verbs,
//   so a whole stage settles inside one tick exactly as the direct calls did.
//
//   THE APP — {@link driveBotActions} / {@link driveBotUpkeep} take a SINK, so
//   an AUTO PILOT ride inside a Steam session sends its housekeeping down the
//   command channel instead of writing to a replica the next snapshot wipes.
//
//   A BOT CLIENT — {@link botIntent} answers a whole tick from one snapshot:
//   the steer plus at most one verb per half. It cannot read the run back
//   between verbs (there is no run here to read), so a stage that wants several
//   verbs takes several ticks and converges as the snapshots arrive. That is
//   inherent to playing off a replica and is the honest shape, not a shortcut.

import { applyRunCommand } from "../commands.ts";
import type { CommandArg, RunCommandName } from "../commands.ts";
import { inventoryNeedsSort } from "../items/inventory.ts";
import type { GameInput, GameState, Player } from "../types/index.ts";
import {
  botCompanionToHeal,
  botCullPlan,
  botReviveCell,
  botWantsGearSweep,
  wantsMerchantVisit,
} from "./economy.ts";
import { giverTapCommand } from "./errands.ts";
import { botScreenCommand, hubTapCommand } from "./hub.ts";
import { macroTarget } from "./macro.ts";
import { botTuningFor } from "./state.ts";
import { botAct } from "./index.ts";
import type { Bot } from "./state.ts";
import { botWeaponSwapTarget } from "./weapon-swap.ts";

/**
 * One thing the autopilot wants done to the run: a verb from the closed list,
 * and the scalars it takes. Deliberately the same pair `applyRunCommand` and
 * the wire's `COMMAND` message carry, so an intent needs no translation on
 * either path.
 */
export type BotCommand = {
  readonly name: RunCommandName;
  readonly args: readonly CommandArg[];
};

/**
 * A whole tick of autopilot: the steer, and the verbs. What a bot CLIENT sends
 * — `input` becomes the frame's, `commands` become COMMAND messages.
 */
export type BotIntent = {
  readonly input: GameInput;
  readonly commands: readonly BotCommand[];
};

/** Where an intent goes. Answers whatever the verb answered (a hint only — see
 * `pwa/src/game/run-commands.ts` on why a travelled command's answer is never a
 * fact). */
export type BotCommandSink = (command: BotCommand) => unknown;

// ---- The five decisions, one command each -------------------------------------

/**
 * THE POCKET ARSENAL'S DRAW: the banked weapon this moment wants in the hand,
 * or null to keep the one that is there.
 */
export function botDrawCommand(
  state: GameState,
  hero: Player,
): BotCommand | null {
  const cell = botWeaponSwapTarget(state, hero);
  return cell < 0 ? null : { name: "swapHand", args: [cell] };
}

/**
 * KEEP THE FRIEND ON ITS FEET: crack a bought bottle of SMELLING SALTS over a
 * downed companion, or spend a spare medkit on a badly hurt one — at most one
 * per tick, the bottle first.
 *
 * The bot plays the companion rules at all because nothing mends a companion on
 * its own any more: a run that never did this would play every level after the
 * first loss a party member short, and report that as balance rather than as the
 * bot not knowing the rules.
 */
export function botCareCommand(
  state: GameState,
  hero: Player,
): BotCommand | null {
  const bottle = botReviveCell(state, hero);
  if (bottle >= 0) return { name: "spendReviveItem", args: [bottle] };
  const patient = botCompanionToHeal(state, hero);
  if (patient >= 0) {
    return { name: "healCompanionWithMedkit", args: [patient] };
  }
  return null;
}

/** WEAR THE UPGRADES this step's pickups brought — gear only, because the hand
 * belongs to the draw above. */
export function botSweepCommand(
  state: GameState,
  hero: Player,
): BotCommand | null {
  return botWantsGearSweep(state, hero)
    ? { name: "autoEquipGear", args: [] }
    : null;
}

/** SHED what the bag can spare, so the next find always has a home. Usually
 * empty (a cell is already open) or a single cell. */
export function botCullCommands(state: GameState, hero: Player): BotCommand[] {
  return botCullPlan(state, hero).map((cell) => ({
    name: "bankSpareItem" as const,
    args: [cell],
  }));
}

/**
 * WORK THE ROOM — whatever conversation is open, the person the walk is on,
 * and (at home) the car — as one verb, in that order.
 *
 * The open CONVERSATION comes first because a modal left in front of an
 * unattended hero is the one thing a ride must never park behind; the TAP comes
 * next, and only where the macro plan is already walking to that person
 * (`errands.ts` `giverTapCommand` checks the press against the goal, so a hero
 * passing a giver on his way to the boss doesn't stop to chat in a flood);
 * the CAR last, since a hub only offers it once everything else is settled.
 *
 * Null on every other tick, which is nearly all of them.
 */
export function botErrandCommand(
  bot: Bot,
  state: GameState,
  hero: Player,
): BotCommand | null {
  const screen = botScreenCommand(state, hero);
  if (screen) return screen;
  const tune = botTuningFor(state.level.id);
  const tap = giverTapCommand(
    bot,
    state,
    hero,
    macroTarget(bot, state, hero, tune),
  );
  if (tap) return tap;
  return hubTapCommand(bot, state, hero, wantsMerchantVisit(state, hero));
}

/**
 * The ROOM half of a tick, pushed at `send`. Its own entry point rather than a
 * line in {@link driveBotActions}, for the reason the SCREEN is the point: a
 * host gates the pre-step half on the hero being ON THE FIELD (the app's
 * `fieldLive`), and a hero reading a quest box is by definition not — so
 * folding this in there would mean the only tick that can close the box is one
 * where the box is shut. Call it unconditionally, before the field work.
 *
 * Returns whether the run answered yes, so a host can bump its HUD.
 */
export function driveBotErrands(
  bot: Bot,
  state: GameState,
  hero: Player,
  send: BotCommandSink,
): boolean {
  const command = botErrandCommand(bot, state, hero);
  return command ? Boolean(send(command)) : false;
}

/** TIDY the bag the way the powerup dock sorts its slots. */
export function botSortCommand(
  state: GameState,
  hero: Player,
): BotCommand | null {
  return inventoryNeedsSort(state, hero)
    ? { name: "sortInventory", args: [] }
    : null;
}

// ---- The two halves of a tick -------------------------------------------------

/**
 * The pre-step half — the draw, then the care — pushed at `send` in that order.
 * Returns whether the run answered yes to any of them.
 */
export function driveBotActions(
  state: GameState,
  hero: Player,
  send: BotCommandSink,
): boolean {
  let changed = false;
  const draw = botDrawCommand(state, hero);
  if (draw && send(draw)) changed = true;
  // Asked AFTER the draw has been sent, deliberately: both are decided from the
  // run as this tick found it, and in-process the draw has already landed by the
  // time the care is read — the order the simulator has always used.
  const care = botCareCommand(state, hero);
  if (care && send(care)) changed = true;
  return changed;
}

/**
 * The post-step half — BAG DISCIPLINE: wear, shed, tidy, in that order.
 *
 * The order is load-bearing rather than alphabetical. The sweep runs FIRST so
 * the pieces it displaces are on the table for the cull, and so cells an upgrade
 * freed count toward the open-slot rule; the tidy runs LAST so it arranges what
 * the other two left behind.
 */
export function driveBotUpkeep(
  state: GameState,
  hero: Player,
  send: BotCommandSink,
): boolean {
  let changed = false;
  const sweep = botSweepCommand(state, hero);
  if (sweep && send(sweep)) changed = true;
  for (const cull of botCullCommands(state, hero)) {
    if (send(cull)) changed = true;
  }
  const sort = botSortCommand(state, hero);
  if (sort && send(sort)) changed = true;
  return changed;
}

// ---- The in-process host -------------------------------------------------------

/**
 * Apply one intent to a run in THIS process, through the same dispatch the
 * session server runs. `hero` is the ACTING HERO — a bag, a purse and a pouch
 * are private, so every one of these verbs is about exactly one seat.
 */
export function applyBotCommand(
  state: GameState,
  hero: Player,
  command: BotCommand,
): unknown {
  return applyRunCommand(state, command.name, command.args, hero);
}

/** {@link driveBotActions}, applied here. What the simulator runs before its
 * `step()`. */
export function runBotActions(state: GameState, hero: Player): boolean {
  return driveBotActions(state, hero, (command) =>
    applyBotCommand(state, hero, command),
  );
}

/** {@link driveBotUpkeep}, applied here. What the simulator runs after its
 * `step()`. */
export function runBotUpkeep(state: GameState, hero: Player): boolean {
  return driveBotUpkeep(state, hero, (command) =>
    applyBotCommand(state, hero, command),
  );
}

/** {@link driveBotErrands}, applied here — the open-conversation verb, the
 * giver's tap and the car, before the pre-step half. */
export function runBotErrands(
  bot: Bot,
  state: GameState,
  hero: Player,
): boolean {
  return driveBotErrands(bot, state, hero, (command) =>
    applyBotCommand(state, hero, command),
  );
}

// ---- The client ----------------------------------------------------------------

/**
 * A WHOLE TICK, decided from one snapshot and touching nothing — what a bot
 * client sends: the steer, plus at most one verb from each half.
 *
 * ONE PER HALF, because a client cannot read the run back between verbs: the
 * shed it would pick second depends on the sweep it asked for first having
 * landed, and the only honest answer from a replica is to ask for what this
 * snapshot supports and let the next one carry the rest. The stages that can
 * repeat are cheap to repeat — a second `swapHand` inside the anti-juggle gap is
 * refused, a `bankSpareItem` on an emptied cell is refused — and the two that
 * would be wasteful (the sweep and the tidy) mark the loadout they were decided
 * against, so neither is asked twice for the same bag.
 *
 * The steer is decided from the SAME snapshot as the verbs rather than after
 * them, which is the one place a client differs from a local run: in-process the
 * draw lands before `botAct` reads the hand. Over a wire it lands a round trip
 * later, which is the ordinary state of everything a client asks for.
 */
export function botIntent(bot: Bot, state: GameState, hero: Player): BotIntent {
  const commands: BotCommand[] = [];
  // The ROOM press rides in the pre-step half's slot, ahead of the draw: a
  // hero with a quest box open is not swapping weapons, and the box is the one
  // thing that has to be cleared before anything else can happen at all.
  const action =
    botErrandCommand(bot, state, hero) ??
    botDrawCommand(state, hero) ??
    botCareCommand(state, hero);
  if (action) commands.push(action);
  const upkeep =
    botSweepCommand(state, hero) ??
    botCullCommands(state, hero)[0] ??
    botSortCommand(state, hero);
  if (upkeep) commands.push(upkeep);
  return { input: botAct(bot, state, hero), commands };
}
