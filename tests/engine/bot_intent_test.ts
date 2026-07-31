// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// EVERYTHING THE AUTOPILOT DOES IS AN INTENT (multiplayer plan §7.2.5, and the
// other half of decision 3b).
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

import { describe, expect, it } from "vitest";

import { RUN_COMMAND_ARGS } from "../../src/game/commands.ts";
import { COMMANDS } from "../../server/wire/protocol.ts";

/**
 * The autopilot's housekeeping, and the verb each one travels as.
 *
 * Written out by hand on purpose. A test that derived this list from the code
 * would agree with whatever the code happened to do, which is the one thing a
 * guard must not do — the list is the CLAIM, and the code is what is checked
 * against it.
 */
const HOUSEKEEPING: readonly { call: string; verb: string }[] = [
  // The pocket arsenal's draw. The one that forced decision 3b: it carried the
  // bot's own anti-juggle memory, so the memory moved onto the run
  // (`Player.lastSwapMs`) and the draw became a hero action.
  { call: "stepBotWeaponSwap", verb: "swapHand" },
  // The bag's order — a pure function of the loadout, so the only bot-shaped
  // thing about it was the decision to tidy.
  { call: "sortBotInventory", verb: "sortInventory" },
  // These two were already plain verbs and could have travelled all along.
  { call: "botAutoEquip", verb: "autoEquipBest" },
  { call: "cullWorstLoot", verb: "scrapInferiorLoot" },
  // The companion's care is TWO verbs rather than one — a bottle of salts over
  // a downed friend, a spare medkit into a badly hurt one — and both were
  // already on the list.
  { call: "careForCompanion", verb: "spendReviveItem" },
  { call: "careForCompanion", verb: "healCompanionWithMedkit" },
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
    // read from the startup path, where the 170 KB budget forbids reaching
    // `@game/core` — so a verb that exists in the engine and not on the wire is
    // a verb a client may never send. The drift test covers the pair in general;
    // this covers the six that decision 3b depends on.
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
});
