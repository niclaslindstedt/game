// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE RUN'S VERBS — every way the app is allowed to ACT on a run, as one
// closed list with one dispatch.
//
// The app does not merely READ the state; it acts on it. `openInventory`,
// `equipFromInventory`, `buyStock`, `sellItem`, `allocateStat`,
// `spendTalentPoint`, `pickTalkChoice`, `openShop`, `openQuestLog` and fifty
// more were direct calls on a local `GameState` — which was fine for exactly as
// long as the state lived in the same process as the code calling them.
// MULTIPLAYER moves the simulation into a session server (docs/multiplayer.md),
// so every one of them has to be something that can TRAVEL.
//
// **THE LIST IS THE SECURITY MODEL, AND SO ARE THE ARGUMENTS.** A channel that
// resolved a function name dynamically would hand a client `grantXp`,
// `mintUnique` and `killEnemy` the moment phase 2's UDP port opened, and no amount
// of later validation would put that back in the box. So a command is a NAME
// FROM A CLOSED LIST dispatched through an explicit `switch`, and its arguments
// are SCALARS whose shapes are declared beside the name and checked before the
// verb is reached (`checkRunCommandArgs`). An argument that names one of the
// engine's own string unions — a stat, an equip slot, a companion slot — is
// checked against that union's runtime list, not merely against `typeof
// "string"`: a host must not be crashable by a stranger passing "luckk".
//
// **WHY THE TABLE IS HERE AND NOT IN `server/wire/`.** The wire's vocabulary
// (`server/wire/protocol.ts`) imports NOTHING — the page reads it from screens
// on the app's startup path, where the 170 KB critical-path budget forbids
// anything that drags `@game/core` behind it. A table that calls engine
// functions plainly cannot live there. So the wire keeps a literal copy of the
// NAMES for its allow-list, this module owns what each one DOES, and
// `tests/engine/run_commands_test.ts` fails the build when the two disagree —
// the same snapshot-and-drift-test shape `mod/catalog.json` and the Game Center
// manifests already use.
//
// **THIS FILE MAKES THE VERBS TRAVEL. IT DOES NOT MAKE THEM NON-BLOCKING.** A
// command that opens the inventory still halts the simulation, because that is
// what it does today and the cutover is not allowed to change how the game
// feels. Splitting `state.phase` from a per-player screen — so a player in
// their bag can still be killed — is phase 3's design exercise (§3.2 of the plan).
// Anyone widening this list must not quietly do the second job at the same
// time.

import { discardHeldAbility } from "./abilities.ts";
import {
  advanceIntro,
  advanceOutro,
  closeInventory,
  dismissIntro,
  openInventory,
  pauseGame,
  promptPendingPoints,
  reopenVictoryChoice,
  resumeGame,
  skipCutscene,
  skipIntro,
  skipOutro,
  skipStoryOpening,
  stayOnField,
  tapCutscene,
} from "./items/flow.ts";
import {
  closeCompanionPanel,
  COMPANION_SLOTS,
  equipCompanionFromInventory,
  healCompanionWithMedkit,
  openCompanionPanel,
  resolveChoice,
  spendReviveItem,
  unequipCompanionToInventory,
} from "./companions.ts";
import {
  advanceTalk,
  closeTalk,
  pickTalkChoice,
  talkToEnemy,
} from "./conversation.ts";
import { STAT_NAMES } from "./defs/equipment.ts";
import {
  autoEquipBest,
  autoEquipGear,
  scrapInferiorLoot,
} from "./items/auto-equip.ts";
import {
  bankSpareItem,
  discardEquipped,
  discardFromInventory,
  equipFromInventory,
  equipFromInventoryInto,
  moveInventoryItem,
  sortInventory,
  spendGateKey,
  swapHand,
  unequipToInventory,
} from "./items/inventory.ts";
import { identifyItem, spendLookupTicket } from "./items/identify.ts";
import { EQUIP_SLOTS } from "./items/slots.ts";
import {
  allocateStat,
  beginRespec,
  confirmRespec,
  deallocateStat,
  refundAutopilotBuild,
  spendCleanSlate,
} from "./items/stat-points.ts";
import { clearVault, reclaimVaultItem } from "./items/vault.ts";
import {
  acceptTrade,
  cancelTrade,
  offerCoins,
  offerItem,
  openTrade,
} from "./trade.ts";
import { closeMap, openMap } from "./map.ts";
import {
  buybackItem,
  buyStock,
  closeShop,
  openShop,
  repairGear,
  sellItem,
} from "./merchant.ts";
import {
  creditAutopilotPurse,
  setAutopilotSpeed,
  startAutopilot,
  stopAutopilot,
} from "./autopilot.ts";
import { buyQuestPiece, sellQuestPiece } from "./quests/merchant.ts";
import {
  acceptQuest,
  advanceQuestDialogue,
  closeQuestDialogue,
  closeQuestLog,
  declineQuest,
  openQuestLog,
  chooseQuestReward,
  pickQuestTopic,
  talkToQuestGiver,
  turnInQuest,
} from "./quests/index.ts";
import { skipBossDeath } from "./boss-death.ts";
import { skipDeathScene } from "./death-scene.ts";
import { advanceDialogue, muteDialogue, unmuteDialogue } from "./story.ts";
import { spendTalentPoint } from "./talents.ts";
import { enterCar } from "./vehicles.ts";
import type {
  CompanionSlot,
  EquipSlot,
  GameState,
  Player,
  StatName,
} from "./types/index.ts";

/**
 * What a command argument may be.
 *
 * Scalars only, and that is the point rather than a limitation: a verb that
 * needed a structure would be a verb whose payload a stranger gets to shape,
 * and the one thing this channel exists to prevent is a client handing the host
 * something the host then walks. Everything the app actually needs to say — an
 * inventory index, a slot name, a stat, a quest id, a speed rung — is already a
 * scalar.
 */
export type CommandArg = number | string | boolean;

/**
 * The shape of one argument, as declared beside its command.
 *
 * `stat`, `equipSlot` and `companionSlot` are strings checked against the
 * engine's own runtime lists. They exist because `typeof x === "string"` is not
 * validation of a union: a bad slot name reaches a record write, and a record
 * write with an attacker's key is how a host ends up with a property nobody
 * declared.
 */
type ArgKind =
  "int" | "num" | "str" | "bool" | "stat" | "equipSlot" | "companionSlot";

/**
 * EVERY VERB THE APP MAY RUN AGAINST A RUN, and the arguments each one takes.
 *
 * The list is grouped the way a player would group it — the scene, the screens,
 * the bag, the counter, the build, the party, the errands, the vault, the ride
 * — because that is how somebody looking for the one they need will read it.
 *
 * Adding a row means adding a `case` below (the compiler insists — the switch
 * is exhaustive over this union) and adding the name to `COMMANDS` in
 * `server/wire/protocol.ts`, which the drift test enforces. It also means
 * bumping `PROTOCOL_VERSION`, because a build that has never heard of a verb
 * and a build that refuses one look identical from the far end of a wire.
 */
export const RUN_COMMAND_ARGS = {
  // THE SCENE — turning a page of the opening monologue, skipping a cutscene,
  // ending the death tableau. The nine phase 1 shipped.
  advanceIntro: [],
  skipIntro: [],
  dismissIntro: [],
  advanceOutro: [],
  skipOutro: [],
  skipCutscene: [],
  tapCutscene: [],
  skipStoryOpening: [],
  skipDeathScene: [],
  // A press past the rite's grace window gets on with it. A GROUP verb like
  // every other scene-advance: docs/multiplayer-plan.md §3.2 keeps a boss's
  // beat global and lets ANYONE advance it, so this is deliberately not gated
  // on being the executioner.
  skipBossDeath: [],
  advanceDialogue: [],
  // MUTING is a run verb rather than a setting: it latches on the state so the
  // arrival scenes, last words and thoughts never enter the stage at all. The
  // autoplay bot and the AUTO PILOT ride both turn it on, and both do it to a
  // run that may be simulating somewhere else.
  muteDialogue: [],
  unmuteDialogue: [],

  // THE SCREENS. Each of these is a PHASE change, which is exactly why they
  // have to travel rather than being drawn app-side: the run freezes because
  // the phase is not `playing`, and the phase is the server's.
  openInventory: [],
  closeInventory: [],
  openShop: [],
  closeShop: [],
  openMap: [],
  closeMap: [],
  openQuestLog: [],
  closeQuestLog: [],
  openCompanionPanel: ["int"],
  closeCompanionPanel: [],
  promptPendingPoints: [],

  // THE RUN'S OWN FLOW.
  pauseGame: [],
  resumeGame: [],
  stayOnField: [],
  reopenVictoryChoice: [],

  // THE BAG. Indices rather than items, always: an index names a cell the
  // server can check, an item would be a thing the client asserts exists.
  equipFromInventory: ["int"],
  swapHand: ["int"],
  sortInventory: [],
  equipFromInventoryInto: ["int", "equipSlot"],
  unequipToInventory: ["equipSlot"],
  moveInventoryItem: ["int", "int"],
  discardFromInventory: ["int"],
  discardEquipped: ["equipSlot"],
  spendGateKey: ["int"],
  spendReviveItem: ["int"],
  // The FIELD identify: (ticket cell, target cell) — both indices name cells
  // the server can check, exactly like every other bag verb.
  spendLookupTicket: ["int", "int"],
  autoEquipBest: [],
  autoEquipGear: [],
  scrapInferiorLoot: [],
  bankSpareItem: ["int"],
  discardHeldAbility: ["int"],

  // THE COUNTER.
  buyStock: ["int"],
  sellItem: ["int"],
  // The BUY-BACK shelf takes the ITEM's id, not a shelf index: the shelf
  // reorders itself under every sale, so an index picked off a rendered list
  // is stale the moment anything else is sold.
  buybackItem: ["int"],
  repairGear: [],
  identifyItem: ["int"],
  buyQuestPiece: ["str", "str"],
  sellQuestPiece: ["str", "str"],

  // THE BUILD — the level-up chooser, the talent picker, and the one respec.
  allocateStat: ["stat"],
  deallocateStat: ["stat"],
  spendTalentPoint: ["str"],
  beginRespec: [],
  confirmRespec: [],
  spendCleanSlate: [],

  // THE PARTY.
  equipCompanionFromInventory: ["int", "int"],
  unequipCompanionToInventory: ["int", "companionSlot"],
  healCompanionWithMedkit: ["int"],

  resolveChoice: ["bool"],

  // THE ERRANDS.
  talkToQuestGiver: ["str"],
  pickQuestTopic: ["str"],
  chooseQuestReward: ["num"],
  acceptQuest: [],
  declineQuest: [],
  turnInQuest: [],
  advanceQuestDialogue: [],
  closeQuestDialogue: [],

  // THE CONVERSATIONS a bystander is tapped into.
  talkToEnemy: ["int"],
  advanceTalk: [],
  pickTalkChoice: ["int"],
  closeTalk: [],

  // THE TABLE — trade (plan §5.1). Every one of these acts for the seat the
  // session admitted this client into, never a seat named on the frame.
  // `openTrade` names the PARTNER, because who else is on the map is a public
  // fact; whose bag is being offered FROM is the server's answer.
  openTrade: ["int"],
  cancelTrade: [],
  offerTradeItem: ["int"],
  offerTradeCoins: ["int"],
  acceptTrade: [],

  // THE LOST & FOUND.
  reclaimVaultItem: ["int"],
  clearVault: [],

  // THE DRIVEWAY — climbing into the hub's car (src/game/vehicles.ts). No
  // arguments: the car is found by standing at it, and WHO climbs in is the
  // acting hero, exactly like every counter verb.
  enterCar: [],

  // THE RIDE. `refundAutopilotBuild` takes no arguments on purpose: the build
  // the ride is measured against lives on the RUN (`state.autopilot.build`,
  // stamped by `startAutopilot`) rather than in the caller's hand, because a
  // caller-supplied snapshot is a structure and this channel carries scalars.
  startAutopilot: ["num"],
  stopAutopilot: [],
  setAutopilotSpeed: ["num"],
  creditAutopilotPurse: ["int"],
  refundAutopilotBuild: [],
} as const satisfies Record<string, readonly ArgKind[]>;

/** Every verb's name. */
export type RunCommandName = keyof typeof RUN_COMMAND_ARGS;

/** The names as a list, for the wire's drift test and for anything enumerating
 * the channel. Derived from the table so the two can never disagree. */
export const RUN_COMMAND_NAMES = Object.keys(
  RUN_COMMAND_ARGS,
) as RunCommandName[];

const STATS = new Set<string>(STAT_NAMES);
const SLOTS = new Set<string>(EQUIP_SLOTS);
const COMPANION_PARTS = new Set<string>(COMPANION_SLOTS);

/** True when `value` names a verb this build will run. */
export function isRunCommand(value: unknown): value is RunCommandName {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(RUN_COMMAND_ARGS, value)
  );
}

/**
 * True when `args` is exactly what `name` takes.
 *
 * EXACTLY: a missing argument and a surplus one are both refused, because
 * "close enough" on an open port is how a verb ends up running with
 * `undefined` where an index should be. Numbers must be finite (a `NaN` index
 * silently indexes nothing and a `NaN` speed poisons the meter), and an `int`
 * must additionally be a whole non-negative number — every one of them is a
 * position in an array or an id, and neither has a meaning at -1.5.
 */
export function checkRunCommandArgs(
  name: RunCommandName,
  args: readonly unknown[],
): args is CommandArg[] {
  const wanted: readonly ArgKind[] = RUN_COMMAND_ARGS[name];
  if (args.length !== wanted.length) return false;
  for (let i = 0; i < wanted.length; i++) {
    if (!fits(wanted[i] as ArgKind, args[i])) return false;
  }
  return true;
}

function fits(kind: ArgKind, value: unknown): boolean {
  switch (kind) {
    case "int":
      return Number.isInteger(value) && (value as number) >= 0;
    case "num":
      return typeof value === "number" && Number.isFinite(value);
    case "str":
      return typeof value === "string";
    case "bool":
      return typeof value === "boolean";
    case "stat":
      return typeof value === "string" && STATS.has(value);
    case "equipSlot":
      return typeof value === "string" && SLOTS.has(value);
    case "companionSlot":
      return typeof value === "string" && COMPANION_PARTS.has(value);
  }
}

/**
 * Run one verb against one run.
 *
 * The arguments are checked here as well as at the wire, deliberately: this is
 * the function the HOST'S OWN app calls too (single-player still applies its
 * commands locally — see `pwa/src/game/run-commands.ts`), and a validation that
 * only ever runs on the network path is a validation that is only exercised by
 * the case nobody tests.
 *
 * Returns whatever the verb returned, or `undefined` for a refusal — which is
 * what a caller on the far end of a wire will always get, and is why no app
 * behaviour may depend on the difference between "refused" and "returned
 * nothing" (see the dispatcher's own note about optimistic application).
 */
export function applyRunCommand(
  state: GameState,
  name: RunCommandName,
  args: readonly unknown[] = [],
  actor?: Player,
): unknown {
  if (!checkRunCommandArgs(name, args)) return undefined;
  const a = args as CommandArg[];
  // WHOSE VERB THIS IS. A bag, a purse, a build and a talent tree are PRIVATE
  // (the plan's §3.1), so a command that touches one has to say which hero it
  // is for — and the answer is the SERVER's, taken from the seat it admitted
  // this client into, never a claim on the frame. Passing a seat would hand a
  // stranger somebody else's inventory in one field.
  //
  // Defaulting to seat 0 keeps every single-player caller and every existing
  // test unchanged, which is the same identity case §3.1 relied on: a run with
  // one hero has exactly one answer to this question.
  const hero = actor ?? state.players[0];
  switch (name) {
    // THE SCENE
    case "advanceIntro":
      return advanceIntro(state);
    case "skipIntro":
      return skipIntro(state);
    case "dismissIntro":
      return dismissIntro(state);
    case "advanceOutro":
      return advanceOutro(state);
    case "skipOutro":
      return skipOutro(state);
    case "skipCutscene":
      return skipCutscene(state);
    case "tapCutscene":
      return tapCutscene(state);
    case "skipStoryOpening":
      return skipStoryOpening(state);
    case "skipDeathScene":
      return skipDeathScene(state);
    case "skipBossDeath":
      return skipBossDeath(state);
    case "advanceDialogue":
      return advanceDialogue(state);
    case "muteDialogue":
      return muteDialogue(state);
    case "unmuteDialogue":
      return unmuteDialogue(state);

    // THE SCREENS
    case "openInventory":
      return openInventory(state);
    case "closeInventory":
      return closeInventory(state);
    case "openShop":
      return openShop(state, hero);
    case "closeShop":
      return closeShop(state, hero);
    case "openMap":
      return openMap(state);
    case "closeMap":
      return closeMap(state);
    case "openQuestLog":
      return openQuestLog(state);
    case "closeQuestLog":
      return closeQuestLog(state);
    case "openCompanionPanel":
      return openCompanionPanel(state, num(a, 0));
    case "closeCompanionPanel":
      return closeCompanionPanel(state);
    case "promptPendingPoints":
      return promptPendingPoints(state, hero);

    // THE RUN'S OWN FLOW
    case "pauseGame":
      return pauseGame(state);
    case "resumeGame":
      return resumeGame(state);
    case "stayOnField":
      return stayOnField(state);
    case "reopenVictoryChoice":
      return reopenVictoryChoice(state);

    // THE BAG
    case "equipFromInventory":
      return equipFromInventory(state, hero, num(a, 0));
    // THE POCKET ARSENAL's own draw, and it is a SEPARATE verb from the one
    // above rather than a flag on it (multiplayer plan §7.2.5, decision 3b).
    // Two things differ and both are rules rather than details: the attack
    // clock is CARRIED ACROSS instead of zeroed, so swapping every fight can
    // never mint free shots the way a hand-picked swap deliberately does, and
    // the draw stamps `Player.lastSwapMs` so the anti-juggle gap holds for
    // whoever is holding the controller. Folding the two into one verb with a
    // boolean would put "may I have my cooldown wiped?" on the wire, which is
    // exactly the kind of thing a closed list exists to keep off it.
    case "swapHand":
      return swapHand(state, hero, num(a, 0));
    // The last of the autopilot's five housekeeping mutators to become an
    // INTENT (multiplayer plan §7.2.5, decision 3b). The bag's order is a pure
    // function of the loadout, so nothing about it is an opinion the bot holds —
    // only the decision to tidy is, and that stays the bot's.
    case "sortInventory":
      return sortInventory(state, hero);
    case "equipFromInventoryInto":
      return equipFromInventoryInto(
        state,
        hero,
        num(a, 0),
        str(a, 1) as EquipSlot,
      );
    case "unequipToInventory":
      return unequipToInventory(state, hero, str(a, 0) as EquipSlot);
    case "moveInventoryItem":
      return moveInventoryItem(state, hero, num(a, 0), num(a, 1));
    case "discardFromInventory":
      return discardFromInventory(state, hero, num(a, 0));
    case "discardEquipped":
      return discardEquipped(state, hero, str(a, 0) as EquipSlot);
    case "spendGateKey":
      return spendGateKey(state, hero, num(a, 0));
    case "spendReviveItem":
      return spendReviveItem(state, hero, num(a, 0));
    case "spendLookupTicket":
      return spendLookupTicket(state, hero, num(a, 0), num(a, 1));
    case "autoEquipBest":
      return autoEquipBest(state, hero);
    // THE SWEEP MINUS THE HAND, and it is a separate verb rather than a flag
    // for the same reason `swapHand` is (multiplayer plan §7.2.5): the
    // autopilot's POCKET ARSENAL owns the weapon slot, so a sweep that re-drew
    // the strongest weapon every tick would flap against it. The player's own
    // OPTIMIZE button is `autoEquipBest` and takes the hand with it.
    case "autoEquipGear":
      return autoEquipGear(state, hero);
    case "scrapInferiorLoot":
      return scrapInferiorLoot(state, hero);
    // BAG DISCIPLINE's shed: into the LOST & FOUND if the piece is worth
    // rescuing, over the shoulder if it is not. Distinct from
    // `discardFromInventory` (a deliberate trash, banked nowhere) and from
    // `scrapInferiorLoot` (which empties every outgrown cell at once and would
    // destroy the pocket arsenal the bot is deliberately carrying).
    case "bankSpareItem":
      return bankSpareItem(state, hero, num(a, 0));
    case "discardHeldAbility":
      return discardHeldAbility(state, hero, num(a, 0));

    // THE COUNTER — every purse, bag and pouch here is the ACTING hero's, so
    // a joiner buying spends their own coins rather than the host's.
    case "buyStock":
      return buyStock(state, hero, num(a, 0));
    case "sellItem":
      return sellItem(state, hero, num(a, 0));
    case "buybackItem":
      return buybackItem(state, hero, num(a, 0));
    case "repairGear":
      return repairGear(state, hero);
    case "identifyItem":
      return identifyItem(state, hero, num(a, 0));
    case "buyQuestPiece":
      return buyQuestPiece(state, hero, str(a, 0), str(a, 1));
    case "sellQuestPiece":
      return sellQuestPiece(state, hero, str(a, 0), str(a, 1));

    // THE BUILD
    case "allocateStat":
      return allocateStat(state, hero, str(a, 0) as StatName);
    case "deallocateStat":
      return deallocateStat(state, hero, str(a, 0) as StatName);
    case "spendTalentPoint":
      return spendTalentPoint(state, hero, str(a, 0));
    case "beginRespec":
      return beginRespec(state, hero);
    case "confirmRespec":
      return confirmRespec(state, hero);
    case "spendCleanSlate":
      return spendCleanSlate(state, hero);

    // THE PARTY
    case "healCompanionWithMedkit":
      return healCompanionWithMedkit(state, hero, num(a, 0));
    case "equipCompanionFromInventory":
      return equipCompanionFromInventory(state, num(a, 0), num(a, 1));
    case "unequipCompanionToInventory":
      return unequipCompanionToInventory(
        state,
        num(a, 0),
        str(a, 1) as CompanionSlot,
      );
    case "resolveChoice":
      return resolveChoice(state, bool(a, 0));

    // THE ERRANDS
    case "talkToQuestGiver":
      return talkToQuestGiver(state, str(a, 0));
    case "pickQuestTopic":
      return pickQuestTopic(state, str(a, 0));
    case "chooseQuestReward":
      return chooseQuestReward(state, num(a, 0));
    case "acceptQuest":
      return acceptQuest(state);
    case "declineQuest":
      return declineQuest(state);
    case "turnInQuest":
      return turnInQuest(state);
    case "advanceQuestDialogue":
      return advanceQuestDialogue(state);
    case "closeQuestDialogue":
      return closeQuestDialogue(state);

    // THE CONVERSATIONS
    case "talkToEnemy":
      return talkToEnemy(state, num(a, 0));
    case "advanceTalk":
      return advanceTalk(state);
    case "pickTalkChoice":
      return pickTalkChoice(state, num(a, 0));
    case "closeTalk":
      return closeTalk(state);

    // THE LOST & FOUND
    case "openTrade":
      return openTrade(state, hero, num(a, 0));
    case "cancelTrade":
      return cancelTrade(state, hero);
    case "offerTradeItem":
      return offerItem(state, hero, num(a, 0));
    case "offerTradeCoins":
      return offerCoins(state, hero, num(a, 0));
    case "acceptTrade":
      return acceptTrade(state, hero);
    case "reclaimVaultItem":
      return reclaimVaultItem(state, hero, num(a, 0));
    case "clearVault":
      return clearVault(state, hero);

    // THE DRIVEWAY
    case "enterCar":
      return enterCar(state, hero);

    // THE RIDE
    case "startAutopilot":
      return startAutopilot(state, num(a, 0));
    case "stopAutopilot":
      return stopAutopilot(state);
    case "setAutopilotSpeed":
      return setAutopilotSpeed(state, num(a, 0));
    case "creditAutopilotPurse":
      return creditAutopilotPurse(state, num(a, 0));
    case "refundAutopilotBuild":
      return refundAutopilotBuild(state, hero);
  }
}

// The three readers below exist because `noUncheckedIndexedAccess` types every
// element as possibly-undefined and `checkRunCommandArgs` has already proved it
// is not. They narrow rather than assert: a cast at each of the sixty call
// sites above would be sixty places for a wrong one to hide.
function num(args: CommandArg[], at: number): number {
  return args[at] as number;
}
function str(args: CommandArg[], at: number): string {
  return args[at] as string;
}
function bool(args: CommandArg[], at: number): boolean {
  return args[at] as boolean;
}
