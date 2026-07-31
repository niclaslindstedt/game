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
// `mintUnique` and `killEnemy` the moment PR 2's UDP port opened, and no amount
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
// their bag can still be killed — is PR 3's design exercise (§3.2 of the plan).
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
  openCompanionPanel,
  resolveChoice,
  unequipCompanionToInventory,
} from "./companions.ts";
import {
  advanceTalk,
  closeTalk,
  pickTalkChoice,
  talkToEnemy,
} from "./conversation.ts";
import { STAT_NAMES } from "./defs/equipment.ts";
import { autoEquipBest, scrapInferiorLoot } from "./items/auto-equip.ts";
import {
  discardEquipped,
  discardFromInventory,
  equipFromInventory,
  equipFromInventoryInto,
  moveInventoryItem,
  spendGateKey,
  unequipToInventory,
} from "./items/inventory.ts";
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
import { closeMap, openMap } from "./map.ts";
import {
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
  pickQuestTopic,
  talkToQuestGiver,
  turnInQuest,
} from "./quests/index.ts";
import { skipDeathScene } from "./death-scene.ts";
import { advanceDialogue, muteDialogue, unmuteDialogue } from "./story.ts";
import { spendTalentPoint } from "./talents.ts";
import type {
  CompanionSlot,
  EquipSlot,
  GameState,
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
  // ending the death tableau. The nine PR 1 shipped.
  advanceIntro: [],
  skipIntro: [],
  dismissIntro: [],
  advanceOutro: [],
  skipOutro: [],
  skipCutscene: [],
  tapCutscene: [],
  skipStoryOpening: [],
  skipDeathScene: [],
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
  equipFromInventoryInto: ["int", "equipSlot"],
  unequipToInventory: ["equipSlot"],
  moveInventoryItem: ["int", "int"],
  discardFromInventory: ["int"],
  discardEquipped: ["equipSlot"],
  spendGateKey: ["int"],
  autoEquipBest: [],
  scrapInferiorLoot: [],
  discardHeldAbility: ["int"],

  // THE COUNTER.
  buyStock: ["int"],
  sellItem: ["int"],
  repairGear: [],
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
  resolveChoice: ["bool"],

  // THE ERRANDS.
  talkToQuestGiver: ["str"],
  pickQuestTopic: ["str"],
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

  // THE LOST & FOUND.
  reclaimVaultItem: ["int"],
  clearVault: [],

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
): unknown {
  if (!checkRunCommandArgs(name, args)) return undefined;
  const a = args as CommandArg[];
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
      return openShop(state);
    case "closeShop":
      return closeShop(state);
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
      return promptPendingPoints(state);

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
      return equipFromInventory(state, num(a, 0));
    case "equipFromInventoryInto":
      return equipFromInventoryInto(state, num(a, 0), str(a, 1) as EquipSlot);
    case "unequipToInventory":
      return unequipToInventory(state, str(a, 0) as EquipSlot);
    case "moveInventoryItem":
      return moveInventoryItem(state, num(a, 0), num(a, 1));
    case "discardFromInventory":
      return discardFromInventory(state, num(a, 0));
    case "discardEquipped":
      return discardEquipped(state, str(a, 0) as EquipSlot);
    case "spendGateKey":
      return spendGateKey(state, num(a, 0));
    case "autoEquipBest":
      return autoEquipBest(state);
    case "scrapInferiorLoot":
      return scrapInferiorLoot(state);
    case "discardHeldAbility":
      return discardHeldAbility(state, num(a, 0));

    // THE COUNTER
    case "buyStock":
      return buyStock(state, num(a, 0));
    case "sellItem":
      return sellItem(state, num(a, 0));
    case "repairGear":
      return repairGear(state);
    case "buyQuestPiece":
      return buyQuestPiece(state, str(a, 0), str(a, 1));
    case "sellQuestPiece":
      return sellQuestPiece(state, str(a, 0), str(a, 1));

    // THE BUILD
    case "allocateStat":
      return allocateStat(state, str(a, 0) as StatName);
    case "deallocateStat":
      return deallocateStat(state, str(a, 0) as StatName);
    case "spendTalentPoint":
      return spendTalentPoint(state, str(a, 0));
    case "beginRespec":
      return beginRespec(state);
    case "confirmRespec":
      return confirmRespec(state);
    case "spendCleanSlate":
      return spendCleanSlate(state);

    // THE PARTY
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
    case "reclaimVaultItem":
      return reclaimVaultItem(state, num(a, 0));
    case "clearVault":
      return clearVault(state);

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
      return refundAutopilotBuild(state);
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
