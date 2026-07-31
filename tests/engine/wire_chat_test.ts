// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CHAT GRAMMAR AND THE PLAYER SCALE — both pure, both testable without a
// running game, which is the whole reason they live in the wire.
//
// The parser matters more than it looks: it sits next to the command channel's
// carefully closed allow-list, and a chat box that handed the session an
// arbitrary verb would undo that list one convenience at a time.

import { describe, expect, it } from "vitest";

import {
  isSlashCommand,
  MAX_CHAT_CHARS,
  parseChat,
  SLASH_COMMANDS,
  SLASH_HELP,
} from "@game/wire/chat.ts";
import {
  MAX_PLAYER_SCALE,
  parsePlayerCount,
  playerScaling,
} from "@game/wire/players.ts";

describe("parseChat", () => {
  it("reads plain speech", () => {
    expect(parseChat("hello there")).toEqual({
      kind: "say",
      text: "hello there",
    });
  });

  it("reads a command and its argument", () => {
    expect(parseChat("/players 4")).toEqual({
      kind: "command",
      name: "players",
      arg: "4",
    });
    expect(parseChat("/WHO")).toEqual({
      kind: "command",
      name: "who",
      arg: "",
    });
  });

  it("keeps the whole argument, spaces included", () => {
    // `/kick SOME NAME` must not lose half a name to the first space.
    expect(parseChat("/kick SOME NAME")).toEqual({
      kind: "command",
      name: "kick",
      arg: "SOME NAME",
    });
  });

  it("reads /me as an emote rather than saying it out loud", () => {
    expect(parseChat("/me waves")).toEqual({ kind: "emote", text: "waves" });
  });

  it("refuses an unknown slash instead of broadcasting it", () => {
    // A player who mistypes `/palyers 8` must not have it said to seven
    // friends.
    expect(parseChat("/palyers 8")).toEqual({
      kind: "unknown",
      name: "palyers",
    });
  });

  it("treats an empty line, a bare slash and a bare /me as nothing", () => {
    expect(parseChat("   ").kind).toBe("empty");
    expect(parseChat("/me").kind).toBe("empty");
    expect(parseChat(null).kind).toBe("empty");
    // A lone "/" is a typo, not a command with an empty name.
    expect(parseChat("/")).toEqual({ kind: "unknown", name: "" });
  });

  it("strips control characters and caps the length", () => {
    const parsed = parseChat(`a\nb${"x".repeat(400)}`);
    expect(parsed.kind).toBe("say");
    expect(parsed.kind === "say" && parsed.text.startsWith("a b")).toBe(true);
    expect(parsed.kind === "say" && parsed.text.length).toBe(MAX_CHAT_CHARS);
  });

  it("lists every command it accepts", () => {
    // The failure this catches is a command that WORKS and is not in /help,
    // which reaches a player as a command that does not exist.
    for (const name of SLASH_COMMANDS) {
      expect(isSlashCommand(name)).toBe(true);
      if (name === "me") continue; // an emote, not a listed verb
      expect(SLASH_HELP[name]).toBeTruthy();
    }
    expect(Object.keys(SLASH_HELP)).toHaveLength(SLASH_COMMANDS.length - 1);
  });
});

describe("playerScaling", () => {
  it("is D2's rule", () => {
    expect(playerScaling(1)).toEqual({ mobHp: 1, xpGain: 1 });
    expect(playerScaling(8)).toEqual({ mobHp: 4.5, xpGain: 4.5 });
  });

  it("moves hp and XP TOGETHER, always", () => {
    // The trap the whole module exists for: kill XP is level-based, so a
    // hp-scaled mob is tougher and pays exactly the same XP for its level.
    // Scaling `mobHp` alone makes `/players 8` strictly punishing rather than
    // the risk/reward trade it is meant to be.
    for (let n = 1; n <= MAX_PLAYER_SCALE; n++) {
      const scale = playerScaling(n);
      expect(scale.xpGain).toBe(scale.mobHp);
    }
  });

  it("clamps rather than refusing, because the caller is a typed line", () => {
    expect(playerScaling(0)).toEqual(playerScaling(1));
    expect(playerScaling(99)).toEqual(playerScaling(MAX_PLAYER_SCALE));
    expect(playerScaling(Number.NaN)).toEqual(playerScaling(1));
  });
});

describe("parsePlayerCount", () => {
  it("tells a typo apart from a request for solo", () => {
    // Null and 1 are different answers: one is worth reporting, the other is a
    // legitimate "put it back".
    expect(parsePlayerCount("nonsense")).toBeNull();
    expect(parsePlayerCount("")).toBeNull();
    expect(parsePlayerCount("1")).toBe(1);
    expect(parsePlayerCount(" 4 ")).toBe(4);
    expect(parsePlayerCount("99")).toBe(MAX_PLAYER_SCALE);
  });
});
