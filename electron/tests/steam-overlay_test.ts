// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHEN THE STEAM OVERLAY MAY BE INJECTED.
//
// `electronEnableSteamOverlay()` is not a drawing call — it appends
// `in-process-gpu` and `disable-direct-composition` to Chromium's command line
// before readiness. On a machine Steam did not launch the game on, that is all
// cost and no overlay: the in-process GPU is the configuration Windows exercises
// least, and when it falls over it takes the browser process with it, so the
// game exits with no window and no message. The predicate is what keeps those
// switches on the launches that actually have an overlay behind them.

import { describe, expect, it } from "vitest";

import { steamOverlayWanted } from "../src/steam";

describe("steamOverlayWanted", () => {
  it("is off for a launch nothing stamped — a checkout, or a double-clicked binary", () => {
    expect(steamOverlayWanted({})).toBe(false);
  });

  it("is on when the Steam client started the process", () => {
    // Steam stamps these into the environment of every game it launches; any
    // one of them is proof enough that there is an overlay to draw.
    expect(steamOverlayWanted({ SteamAppId: "480" })).toBe(true);
    expect(steamOverlayWanted({ SteamGameId: "480" })).toBe(true);
    expect(steamOverlayWanted({ SteamClientLaunch: "1" })).toBe(true);
  });

  it("can be forced either way, so the overlay stays testable from a checkout", () => {
    expect(steamOverlayWanted({ GIS_STEAM_OVERLAY: "1" })).toBe(true);
    expect(
      steamOverlayWanted({ GIS_STEAM_OVERLAY: "0", SteamAppId: "480" }),
    ).toBe(false);
  });

  it("ignores an empty stamp rather than reading it as presence", () => {
    expect(steamOverlayWanted({ SteamAppId: "" })).toBe(false);
  });
});
