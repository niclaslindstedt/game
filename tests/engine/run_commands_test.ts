// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE RUN'S VERBS — that the two closed lists agree, that every verb reaches a
// real engine function, and that a stranger's arguments are refused before
// anything is dispatched.
//
// The list exists TWICE on purpose (see `src/game/commands.ts`): the engine
// owns what each verb does, and `server/wire/protocol.ts` keeps a literal copy
// of the NAMES because the page reads that leaf from screens on the app's
// startup path, where the 170 KB critical-path budget forbids reaching
// `@game/core`. A copy nobody checks is a copy that drifts, so this file is the
// check — the same shape `mod/catalog.json` and the Game Center manifests use.
//
// The argument suite is not paperwork. These arguments arrive from an open UDP
// port from phase 2 on: an index that is really an object, a stat called "luckk",
// a `NaN` speed and a missing argument are all things a stranger may send, and
// every one of them has to be a refusal rather than a host-side throw.

import { describe, expect, it } from "vitest";

import {
  applyRunCommand,
  checkRunCommandArgs,
  createGame,
  isRunCommand,
  RUN_COMMAND_ARGS,
  RUN_COMMAND_NAMES,
  type GameState,
  type RunCommandName,
} from "@game/core";
import { COMMANDS, isCommand } from "@game/wire/protocol.ts";

import { installFixtures } from "./fixtures.ts";

installFixtures();

function freshRun(): GameState {
  return createGame(31337, "test_level", "medium");
}

describe("the two closed lists", () => {
  it("name exactly the same verbs, in the same order", () => {
    // The ORDER is compared as well as the membership, deliberately: a list
    // read top to bottom by a human reviewing what a client may do is a list
    // whose grouping carries meaning, and two orderings drift into two ways of
    // thinking about the same channel.
    expect([...COMMANDS]).toEqual(RUN_COMMAND_NAMES);
  });

  it("agree about what is NOT a command", () => {
    for (const name of ["grantXp", "mintUnique", "killEnemy", "step", ""]) {
      expect(isRunCommand(name)).toBe(false);
      expect(isCommand(name)).toBe(false);
    }
  });

  it("refuse a name that is not a string at all", () => {
    for (const value of [null, undefined, 7, {}, ["advanceIntro"]]) {
      expect(isRunCommand(value)).toBe(false);
    }
  });

  it("do not answer to a prototype's members", () => {
    // `isRunCommand` reads a plain object literal, so "constructor",
    // "toString" and "__proto__" are all inherited names that would pass a
    // naive `name in table` check and reach a dispatch with a function on the
    // other end.
    for (const name of ["constructor", "toString", "__proto__", "valueOf"]) {
      expect(isRunCommand(name)).toBe(false);
    }
  });
});

describe("every verb", () => {
  it("declares its arguments", () => {
    for (const name of RUN_COMMAND_NAMES) {
      expect(Array.isArray(RUN_COMMAND_ARGS[name])).toBe(true);
    }
  });

  it("runs against a real run without throwing, on its own declared shape", () => {
    // The point is not that each verb DOES something here — most are refused
    // by a run sitting on its prelude, which is correct — but that every name
    // reaches a function rather than falling off the end of the switch, and
    // that none of them throws on a state that is not ready for it. A client
    // sends what its screen offers; the run decides whether it applies.
    for (const name of RUN_COMMAND_NAMES) {
      const state = freshRun();
      expect(() =>
        applyRunCommand(state, name, sampleArgs(name)),
      ).not.toThrow();
    }
  });

  it("is refused when an argument is missing or surplus", () => {
    for (const name of RUN_COMMAND_NAMES) {
      const wanted = RUN_COMMAND_ARGS[name];
      const sample = sampleArgs(name);
      expect(checkRunCommandArgs(name, [...sample, 1])).toBe(false);
      if (wanted.length > 0) {
        expect(checkRunCommandArgs(name, sample.slice(0, -1))).toBe(false);
      }
    }
  });
});

describe("arguments a stranger may send", () => {
  it("refuse a structure where a scalar belongs", () => {
    expect(checkRunCommandArgs("equipFromInventory", [{}])).toBe(false);
    expect(checkRunCommandArgs("equipFromInventory", [[1]])).toBe(false);
    expect(checkRunCommandArgs("spendTalentPoint", [null])).toBe(false);
  });

  it("refuse an index that is not a whole, non-negative number", () => {
    for (const bad of [-1, 1.5, NaN, Infinity, "3", true]) {
      expect(checkRunCommandArgs("equipFromInventory", [bad])).toBe(false);
    }
    expect(checkRunCommandArgs("equipFromInventory", [0])).toBe(true);
    expect(checkRunCommandArgs("equipFromInventory", [7])).toBe(true);
  });

  it("refuse a number that is not finite where one is wanted", () => {
    for (const bad of [NaN, Infinity, -Infinity, "8"]) {
      expect(checkRunCommandArgs("startAutopilot", [bad])).toBe(false);
    }
    // A speed is a plain number rather than an index: the engine snaps it to
    // an offered rung, so a fractional one is a legitimate thing to send.
    expect(checkRunCommandArgs("startAutopilot", [2.5])).toBe(true);
  });

  it("refuse a string that is not a member of the union it names", () => {
    expect(checkRunCommandArgs("allocateStat", ["luckk"])).toBe(false);
    expect(checkRunCommandArgs("allocateStat", ["__proto__"])).toBe(false);
    expect(checkRunCommandArgs("allocateStat", ["luck"])).toBe(true);
    expect(checkRunCommandArgs("unequipToInventory", ["pockets"])).toBe(false);
    expect(checkRunCommandArgs("unequipToInventory", ["weapon"])).toBe(true);
    expect(
      checkRunCommandArgs("unequipCompanionToInventory", [1, "legs"]),
    ).toBe(false);
    expect(
      checkRunCommandArgs("unequipCompanionToInventory", [1, "chest"]),
    ).toBe(true);
  });

  it("never reach the verb when the shape is wrong", () => {
    // The proof, rather than the promise: a stat allocation with a bad name
    // must leave the hero's points exactly where they were.
    const state = freshRun();
    state.players[0].pendingStatPoints = 3;
    applyRunCommand(state, "allocateStat", ["luckk"]);
    applyRunCommand(state, "allocateStat", []);
    applyRunCommand(state, "allocateStat", ["luck", "luck"]);
    expect(state.players[0].pendingStatPoints).toBe(3);
    applyRunCommand(state, "allocateStat", ["luck"]);
    expect(state.players[0].pendingStatPoints).toBe(2);
  });
});

describe("the verbs actually do the thing", () => {
  it("turns the opening into play, and raises the actor's screens", () => {
    // The screens are per-player (plan §3.2): the phase stays `playing` and
    // each verb toggles the ACTING hero's own `screen` — seat 0 by default.
    const state = freshRun();
    const hero = state.players[0];
    // The story skip lands on the level-name card; dismissing the card is
    // what drops into play — the same two beats the app's replay path takes.
    applyRunCommand(state, "skipStoryOpening");
    expect(state.phase).toBe("title");
    applyRunCommand(state, "dismissIntro");
    expect(state.phase).toBe("playing");
    applyRunCommand(state, "openInventory");
    expect(hero.screen).toBe("inventory");
    applyRunCommand(state, "closeInventory");
    expect(hero.screen).toBeUndefined();
    applyRunCommand(state, "openMap");
    expect(hero.screen).toBe("map");
    applyRunCommand(state, "closeMap");
    expect(hero.screen).toBeUndefined();
    applyRunCommand(state, "pauseGame");
    expect(hero.screen).toBe("paused");
    applyRunCommand(state, "resumeGame");
    expect(hero.screen).toBeUndefined();
    expect(state.phase).toBe("playing");
  });

  it("moves a piece around the bag by index", () => {
    const state = freshRun();
    applyRunCommand(state, "skipStoryOpening");
    applyRunCommand(state, "dismissIntro");
    const bag = state.players[0].inventory;
    const from = bag.findIndex((cell) => cell !== null);
    if (from < 0) return; // a fixture hero with an empty bag has nothing to prove
    const to = bag.findIndex((cell) => cell === null);
    const piece = bag[from];
    applyRunCommand(state, "moveInventoryItem", [from, to]);
    expect(state.players[0].inventory[to]).toBe(piece);
  });
});

/**
 * One legal argument list per verb.
 *
 * Values a fresh run will mostly REFUSE (there is no bag cell 0 to equip, no
 * merchant row 0 to buy) — which is the point: what is being proved is that
 * the shape is accepted and the verb is reached, not that the run says yes.
 */
function sampleArgs(name: RunCommandName): (number | string | boolean)[] {
  return RUN_COMMAND_ARGS[name].map((kind) => {
    switch (kind) {
      case "int":
        return 0;
      case "num":
        return 1;
      case "str":
        return "nothing_by_this_name";
      case "bool":
        return true;
      case "stat":
        return "luck";
      case "equipSlot":
        return "weapon";
      case "companionSlot":
        return "chest";
    }
  });
}
