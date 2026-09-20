// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// HOW LONG A PENDING HOST ARM LIVES (pwa/src/game/session-intent.ts).
//
// HOST GAME → START arms the next run and hands the player on to the ladder,
// where START opens the doors. Nothing else may inherit that decision: a run
// hosted because of a press two screens ago opens a socket nobody asked for,
// and it takes the DRIVE with it — a hosted run is a party run, and a party
// takes the straight cut to GOODCO instead of the minigame (`driveIsPlayed`).
// That second half is the one a player actually sees, and it is silent, which
// is why the lifetime is pinned here rather than left to the screen.

import { beforeEach, describe, expect, it } from "vitest";

import {
  armHosting,
  disarmHosting,
  hostingArmed,
  settleHostArm,
  takeHostIntent,
  type HostIntent,
} from "../pwa/src/game/session-intent.ts";

const INTENT: HostIntent = {
  name: "TEST'S GAME",
  password: "",
  maxPlayers: 4,
  bots: 0,
  port: 7777,
  udp: true,
  steam: false,
  loot: "free",
};

beforeEach(() => disarmHosting());

describe("a pending host arm", () => {
  it("survives the screens the host flow hands off to", () => {
    armHosting(INTENT);
    // The ladder the HOST page sends the player to, and the mission list a
    // hero who has already beaten this rung gets instead.
    settleHostArm("difficulty");
    expect(hostingArmed()).toBe(true);
    settleHostArm("levels");
    expect(hostingArmed()).toBe(true);
  });

  it("dies the moment the player is back at the front door", () => {
    armHosting(INTENT);
    settleHostArm("difficulty");
    // BACK out of the ladder lands on the main menu, where NEW GAME lives.
    settleHostArm("main");
    expect(hostingArmed()).toBe(false);
  });

  it("is consumed by the run it was made for, and only once", () => {
    armHosting(INTENT);
    settleHostArm("difficulty");
    expect(takeHostIntent()).toEqual(INTENT);
    // The NEXT run is an ordinary single-player one — which is the whole point
    // of the arm being taken rather than read.
    expect(takeHostIntent()).toBeNull();
  });
});
