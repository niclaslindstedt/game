// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// EVERYTHING THE AUTOPILOT DOES IS AN INTENT (see `docs/multiplayer.md` →
// The autopilot is an intent).
//
// **THE PROPERTY, STATED ONCE.** `botAct` never touched the run — it RETURNS a
// `GameInput`, which is the very shape `FRAME.input` carries, so steering has
// always been an intent and needed nothing designed. The gap was five
// HOUSEKEEPING calls that reached in and mutated: the weapon swap, the bag sort,
// the auto-equip, the loot cull and the companion's care. Those cannot cross a
// wire — on a client a direct write is erased by the next snapshot, so the bot's
// swap, repair or stat spend silently does not happen — and the fix is not to
// move the bot but to make its whole output an intent, drawn from the closed
// list the command channel already polices.
//
// This suite is the guard on that. It does not test what the bot DECIDES; it
// tests that every decision it can reach for has a way to travel. A sixth
// mutator added under `src/game/bot/` with no verb behind it is a bot that plays
// correctly in the renderer and silently does nothing as a client — which is
// exactly the failure that fails no other test in the repo.
//
// **AND IT CHECKS THE MAPPING RATHER THAN ONLY THE NAMES**, which is the lesson
// of the version of this file that shipped first. That one asserted only that
// the verbs it named EXIST, and two of the five names it gave were the wrong
// verbs entirely: `autoEquipBest` re-draws the hand the pocket arsenal owns, and
// `scrapInferiorLoot` destroys every outgrown cell — including the banked
// shooters a blade hero carries on purpose, and without banking anything in the
// LOST & FOUND. Both existed, so the test passed, and an adapter built from its
// table would have quietly changed how the bot plays. So the table below names
// the verb each decision ACTUALLY emits, and the last block drives the decisions
// and reads the emission back.

import { describe, expect, it } from "vitest";

import {
  botCareCommand,
  botCullCommands,
  botDrawCommand,
  botIntent,
  botSortCommand,
  botSweepCommand,
  checkRunCommandArgs,
  createBot,
  isRunCommand,
  RUN_COMMAND_ARGS,
  type BotCommand,
  type Equipment,
  type GameState,
} from "@game/core";
import { COMMANDS } from "../../server/wire/frames.ts";
import { clearStage, startGame } from "./helpers.ts";

/**
 * The autopilot's housekeeping, and the verb each one travels as.
 *
 * Written out by hand on purpose. A test that derived this list from the code
 * would agree with whatever the code happened to do, which is the one thing a
 * guard must not do — the list is the CLAIM, and the code is what is checked
 * against it.
 */
const HOUSEKEEPING: readonly { call: string; verb: string }[] = [
  // The pocket arsenal's draw. The one that forced the intent rule: it carried the
  // bot's own anti-juggle memory, so the memory moved onto the run
  // (`Player.lastSwapMs`) and the draw became a hero action.
  { call: "botWeaponSwapTarget", verb: "swapHand" },
  // The bag's order — a pure function of the loadout, so the only bot-shaped
  // thing about it was the decision to tidy.
  { call: "inventoryNeedsSort", verb: "sortInventory" },
  // The sweep, MINUS THE HAND. Not `autoEquipBest`, which is the player's own
  // OPTIMIZE button and takes the weapon slot with it — the pocket arsenal owns
  // that slot and a sweep re-drawing the strongest weapon every tick would flap
  // against it.
  { call: "botWantsGearSweep", verb: "autoEquipGear" },
  // The shed, ONE CELL AT A TIME, into the LOST & FOUND. Not
  // `scrapInferiorLoot`, which empties every outgrown cell at once and banks
  // none of them: it would destroy the pocket arsenal the bot is deliberately
  // carrying and throw away the uniques the vault exists to catch.
  { call: "botCullPlan", verb: "bankSpareItem" },
  // The companion's care is TWO verbs rather than one — a bottle of salts over
  // a downed friend, a spare medkit into a badly hurt one — and both were
  // already on the list.
  { call: "botReviveCell", verb: "spendReviveItem" },
  { call: "botCompanionToHeal", verb: "healCompanionWithMedkit" },
];

describe("the autopilot's housekeeping can all travel", () => {
  it("has a run command behind every mutator", () => {
    const missing = HOUSEKEEPING.filter(
      ({ verb }) => !(verb in RUN_COMMAND_ARGS),
    );
    expect(missing).toEqual([]);
  });

  it("has each of those verbs on the WIRE's own copy of the list", () => {
    // The allow-list is duplicated on purpose — `server/wire/protocol.ts` is
    // read from the startup path, where the 200 KB budget forbids reaching
    // `@game/core` — so a verb that exists in the engine and not on the wire is
    // a verb a client may never send. The drift test covers the pair in general;
    // this covers the six the intent rule depends on.
    const wire = new Set<string>(COMMANDS);
    const missing = HOUSEKEEPING.filter(({ verb }) => !wire.has(verb));
    expect(missing).toEqual([]);
  });

  it("keeps every argument a SCALAR, so an intent can be encoded", () => {
    // The channel's own rule, checked where it bites: a bot's intent is only
    // sendable if the verbs it reaches for take arguments the codec can carry.
    // A structure here would be a payload a stranger gets to shape.
    const scalars = new Set(["int", "num", "str", "bool", "equipSlot", "stat"]);
    for (const { verb } of HOUSEKEEPING) {
      for (const arg of RUN_COMMAND_ARGS[
        verb as keyof typeof RUN_COMMAND_ARGS
      ] ?? []) {
        expect(scalars.has(arg as string)).toBe(true);
      }
    }
  });

  it("never reaches for the PLAYER's two lookalike verbs", () => {
    // The correction this file's header describes, pinned so it cannot come
    // back: these two are real verbs a player's own screens send, and neither
    // is the bot's. Naming them here would pass every check above.
    const named = new Set(HOUSEKEEPING.map(({ verb }) => verb));
    expect(named.has("autoEquipBest")).toBe(false);
    expect(named.has("scrapInferiorLoot")).toBe(false);
  });
});

// ---- The emission itself -------------------------------------------------------

/** Mint a plain instance from a fixture def. */
function piece(
  state: GameState,
  defId: string,
  slot: Equipment["slot"],
  tier: Equipment["tier"] = "regular",
  ilvl = 5,
): Equipment {
  return { id: state.nextId++, defId, slot, tier, ilvl, affixes: [] };
}

describe("the decisions EMIT the verbs the table names", () => {
  it("wears a banked upgrade as `autoEquipGear`, never as the player's sweep", () => {
    const state = startGame();
    clearStage(state);
    state.players[0].inventory[0] = piece(state, "test_vest", "chest");
    expect(botSweepCommand(state, state.players[0])).toEqual({
      name: "autoEquipGear",
      args: [],
    });
  });

  it("sheds a spare cell as `bankSpareItem`, one cell per command", () => {
    const state = startGame();
    clearStage(state);
    const hero = state.players[0];
    // A bag with no free cell at all: the discipline wants exactly one back.
    for (let i = 0; i < hero.inventory.length; i++) {
      hero.inventory[i] = piece(state, "test_vest", "chest");
    }
    const shed = botCullCommands(state, hero);
    expect(shed.length).toBe(1);
    expect(shed[0]?.name).toBe("bankSpareItem");
    expect(typeof shed[0]?.args[0]).toBe("number");
  });

  it("tidies as `sortInventory`, and only while the bag is out of order", () => {
    const state = startGame();
    clearStage(state);
    const hero = state.players[0];
    hero.inventory[0] = piece(state, "test_vest", "chest", "magic");
    hero.inventory[1] = piece(state, "test_helmet", "head", "unique");
    const sort = botSortCommand(state, hero);
    // The unique outranks the vest, so the bag is out of order and wants one.
    expect(sort).toEqual({ name: "sortInventory", args: [] });
  });

  it("asks for nothing at all when there is nothing to do", () => {
    const state = startGame();
    clearStage(state);
    const hero = state.players[0];
    expect(botDrawCommand(state, hero)).toBeNull();
    expect(botCareCommand(state, hero)).toBeNull();
    expect(botCullCommands(state, hero)).toEqual([]);
  });

  it("answers a whole tick with a steer and only sendable verbs", () => {
    const state = startGame();
    clearStage(state);
    const hero = state.players[0];
    hero.inventory[0] = piece(state, "test_vest", "chest");
    const intent = botIntent(createBot("balanced", "meta"), state, hero);
    // The steer is the ordinary `GameInput` a frame carries.
    expect(intent.input).toBeTruthy();
    expect(typeof intent.input.steering).toBe("boolean");
    expect(typeof intent.input.target.x).toBe("number");
    // Every verb it asks for is one the channel would actually admit — the name
    // on the closed list, the arguments the right shapes. This is the check a
    // bot client's send path performs, run here so a decision that emits an
    // unsendable command fails in CI rather than on a wire.
    for (const command of intent.commands as BotCommand[]) {
      expect(isRunCommand(command.name)).toBe(true);
      expect(checkRunCommandArgs(command.name, command.args)).toBe(true);
    }
    // And it is at most one per half — a client cannot read the run back
    // between verbs, so a stage wanting several takes several ticks.
    expect(intent.commands.length).toBeLessThanOrEqual(2);
  });
});
