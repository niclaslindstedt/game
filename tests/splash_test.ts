// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE STUDIO CARD's timing and its suppression rules — the two halves of
// `pwa/src/game/splash.ts` a renderer is not needed to check, and the two that
// are easiest to get wrong in a way nobody notices until a release.
//
// The timing half is a policy with three inputs and one trap: the LOAD wins
// over both clocks. A card that lifted on its auto-dismiss while the atlas was
// still decoding would hand the player exactly the half-assembled menu it was
// added to hide.
//
// The suppression half is worth a test because it is the difference between a
// screenshot harness capturing the game and a screenshot harness capturing
// three seconds of a publisher's name, with its first click eaten.

import { describe, expect, it } from "vitest";

import {
  SPLASH_AUTO_MS,
  SPLASH_MIN_MS,
  splashPhase,
  splashWanted,
} from "../pwa/src/game/splash.ts";

describe("splashPhase", () => {
  it("holds while the game is still loading, however long that takes", () => {
    expect(splashPhase(0, false)).toBe("holding");
    expect(splashPhase(SPLASH_MIN_MS, false)).toBe("holding");
    // Past the auto-dismiss and STILL not warm: the card stays. This is the
    // whole reason it exists.
    expect(splashPhase(SPLASH_AUTO_MS * 10, false)).toBe("holding");
  });

  it("holds a warm launch for the minimum, so the name is read", () => {
    expect(splashPhase(0, true)).toBe("holding");
    expect(splashPhase(SPLASH_MIN_MS - 1, true)).toBe("holding");
  });

  it("takes a press once the minimum is served", () => {
    expect(splashPhase(SPLASH_MIN_MS, true)).toBe("skippable");
    expect(splashPhase(SPLASH_AUTO_MS - 1, true)).toBe("skippable");
  });

  it("clears itself for a player who touches nothing", () => {
    expect(splashPhase(SPLASH_AUTO_MS, true)).toBe("done");
  });

  it("clears at once when the load itself outlasted the auto-dismiss", () => {
    // Warm at five seconds: the wait WAS the card, and there is no second one
    // to serve on top of it.
    expect(splashPhase(5000, true)).toBe("done");
  });

  it("leaves room to press between the two clocks", () => {
    expect(SPLASH_MIN_MS).toBeLessThan(SPLASH_AUTO_MS);
  });
});

describe("splashWanted", () => {
  it("shows the card on a plain launch — what every shell does", () => {
    expect(splashWanted("")).toBe(true);
    expect(splashWanted("?")).toBe(true);
  });

  it("stays out of the way of every harness that drives the app", () => {
    // `?debug` — every authoring script and `ui-shots.mjs`.
    expect(splashWanted("?debug")).toBe(false);
    // `?bot=` — the playtest, screenshot and town harnesses.
    expect(splashWanted("?bot=balanced&level=boot_hill")).toBe(false);
    // `?skytest` — verify-sky.mjs, which measures the backdrop itself.
    expect(splashWanted("?skytest")).toBe(false);
    // …and the explicit opt-out for anyone else.
    expect(splashWanted("?nosplash")).toBe(false);
  });

  it("comes back for `?splash`, which is how the card is screenshotted", () => {
    expect(splashWanted("?splash")).toBe(true);
    expect(splashWanted("?debug&splash")).toBe(true);
  });

  it("ignores params that mean nothing to it", () => {
    expect(splashWanted("?utm_source=somewhere&seed=7")).toBe(true);
  });
});
