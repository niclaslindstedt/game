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

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  SPLASH_AUTO_MS,
  SPLASH_MIN_MS,
  markSplashSettled,
  splashPhase,
  splashSettled,
  splashWanted,
} from "../pwa/src/game/splash.ts";

describe("splashPhase", () => {
  it("never lifts ITSELF while the game is still loading", () => {
    // Past the auto-dismiss and still not warm: the card does not clear on its
    // own. This is the whole reason it exists — a player who has touched
    // nothing must not be handed a half-assembled menu.
    expect(splashPhase(SPLASH_AUTO_MS, false)).not.toBe("done");
    expect(splashPhase(SPLASH_AUTO_MS * 10, false)).not.toBe("done");
  });

  it("holds every launch for the minimum, so the name is read", () => {
    expect(splashPhase(0, true)).toBe("holding");
    expect(splashPhase(SPLASH_MIN_MS - 1, true)).toBe("holding");
    expect(splashPhase(0, false)).toBe("holding");
    expect(splashPhase(SPLASH_MIN_MS - 1, false)).toBe("holding");
  });

  it("takes a press once the minimum is served", () => {
    expect(splashPhase(SPLASH_MIN_MS, true)).toBe("skippable");
    expect(splashPhase(SPLASH_AUTO_MS - 1, true)).toBe("skippable");
  });

  it("takes that press whether the game is warm or not", () => {
    // The impatient player on a slow connection. Ignoring them reads as a hung
    // app; the honest answer is to get out of the way and show Loading until
    // the game catches up. The minimum is still enforced, because that one is
    // about the launch press and not about the load.
    expect(splashPhase(SPLASH_MIN_MS, false)).toBe("skippable");
    expect(splashPhase(SPLASH_AUTO_MS, false)).toBe("skippable");
    expect(splashPhase(SPLASH_AUTO_MS * 10, false)).toBe("skippable");
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

  it("stays out of the way of the developer workbenches too", () => {
    // The DEEP LINKS `App.tsx` routes to before it renders any menu: there is
    // no front door in front of these for a card to cover. They were suppressed
    // by construction until the card became the app's ENTRY (`Boot.tsx`) and
    // started sitting above every route — at which point `make gallery` began
    // paying three seconds PER EXHIBIT and `elite-abilities.mjs` three per
    // elite.
    expect(splashWanted("?effects")).toBe(false);
    expect(splashWanted("?effects=blood_spray&caster=tesla&speed=2")).toBe(
      false,
    );
    expect(splashWanted("?drive")).toBe(false);
    expect(splashWanted("?drive=home&seed=7")).toBe(false);
    expect(splashWanted("?cutscene=prelude")).toBe(false);
  });

  it("comes back for `?splash`, which is how the card is screenshotted", () => {
    expect(splashWanted("?splash")).toBe(true);
    expect(splashWanted("?debug&splash")).toBe(true);
  });

  it("ignores params that mean nothing to it", () => {
    expect(splashWanted("?utm_source=somewhere&seed=7")).toBe(true);
  });
});

// THE GUARD ON THE LIST ABOVE, and the reason it is a source scan rather than
// five more literals: the failure it exists for is a workbench added to
// `App.tsx` MONTHS from now whose author has no reason to think about a studio
// card. That is exactly how `?effects`, `?drive` and `?cutscene` each quietly
// re-earned three seconds when the card became the app's entry — no test
// failed, nothing looked wrong, and the cost only showed up as a contact sheet
// that took a minute longer than it used to.
//
// So the rule is read off the routing itself: every URL param `App.tsx`
// consults must be one the card stands out of the way of. It FAILS CLOSED — a
// param that is genuinely not a route (an argument to a workbench, like the
// gallery's `speed`) has to be named below — because the alternative is a guard
// that lets the next one through.
describe("the card and App.tsx's routing", () => {
  /** Params `App.tsx` reads that select nothing — arguments to a route it has
   * already taken, so they say nothing about whether this is a launch. */
  const NOT_ROUTES = new Set(["speed", "caster"]);

  it("never covers a screen the app deep-links to", () => {
    const app = readFileSync(
      new URL("../pwa/src/App.tsx", import.meta.url),
      "utf8",
    );
    const read = new Set<string>();
    for (const m of app.matchAll(/params\.(?:has|get)\("([^"]+)"\)/g)) {
      const name = m[1]!;
      if (!NOT_ROUTES.has(name)) read.add(name);
    }
    // The guard on the guard: a regex that matched nothing would pass forever.
    expect(read.size).toBeGreaterThan(0);
    for (const param of read) {
      expect(
        splashWanted(`?${param}=x`),
        `App.tsx routes on "${param}", so the studio card must not cover it — ` +
          `add it to HARNESS_PARAMS in pwa/src/game/splash.ts, or to ` +
          `NOT_ROUTES here if it is an argument rather than a route`,
      ).toBe(false);
    }
  });
});

// The third half of the module, and the newest: the signal the menu underneath
// waits on before spending bandwidth on anything the card is not buying. What
// hangs off it is the title theme, which no browser will sound before the
// player's first gesture anyway — so fetching a score while the card is up only
// slows down the atlas and the app shell that ARE racing it.
describe("splashSettled", () => {
  it("does not resolve before the card says so", async () => {
    const pending = Symbol("pending");
    const race = await Promise.race([
      splashSettled().then(() => "settled"),
      Promise.resolve(pending),
    ]);
    // `Promise.resolve` wins a race against a promise nobody has resolved.
    expect(race).toBe(pending);
  });

  it("resolves once the card is out of the way", async () => {
    markSplashSettled();
    await expect(splashSettled()).resolves.toBeUndefined();
  });

  it("is idempotent — a second call is not a second card", async () => {
    markSplashSettled();
    markSplashSettled();
    await expect(splashSettled()).resolves.toBeUndefined();
  });
});
