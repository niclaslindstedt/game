// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE DEVICE CONTENT SWITCHES — the two parental controls the player's guardian
// owns from iOS Settings, not from inside the game.
//
// What is pinned here is the promise they make, in the order the rules are
// written in AGENTS.md: the policy FAILS OPEN when nobody is answering (an absent
// switch is not a switched-off one — the trap iOS sets by never writing a
// Settings.bundle default until the page is visited), MATURE CONTENT off produces
// no blood AT ALL rather than merely hiding it, the switches OUTRANK the in-game
// setting and the developer's FORCE STORE, and a change reaches the listeners the
// menu rebuilds on.
//
// The nuke's own half of the deal — that a censored blast falls back to the
// ORDINARY corpse punt instead of its victims vanishing — is asserted in
// nuke_incineration_test.ts, where the event shape lives.

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  devicePolicy,
  initDevicePolicy,
  isPolicyManaged,
  nsfwAllowed,
  setDevicePolicyForTest,
  storeAllowed,
  subscribeDevicePolicy,
} from "../pwa/src/app/device-policy.ts";
import { bloodBlow } from "../pwa/src/game/game-screen/blood-hit.ts";
import { updateSettings } from "../pwa/src/game/settings.ts";
import { coinStoreAvailable, setStoreForced } from "../pwa/src/game/store.ts";

beforeEach(() => {
  setDevicePolicyForTest(null); // unmanaged: the browser/PWA case
  updateSettings({ extraGore: "on", blood: 1 });
  setStoreForced(false);
});

describe("the device policy fails open", () => {
  it("allows everything when nothing is managing it", () => {
    expect(isPolicyManaged()).toBe(false);
    expect(nsfwAllowed()).toBe(true);
    expect(storeAllowed()).toBe(true);
  });

  it("reads an ABSENT switch as on, not off", () => {
    // The trap this exists for: iOS does not copy a Settings.bundle's
    // DefaultValue into UserDefaults, so on a fresh install the keys are simply
    // missing. Reading missing as false would ship every new player the
    // censored game without anyone having asked for it.
    setDevicePolicyForTest({});
    expect(isPolicyManaged()).toBe(true);
    expect(nsfwAllowed()).toBe(true);
    expect(storeAllowed()).toBe(true);
  });

  it("allows everything on a malformed payload", () => {
    setDevicePolicyForTest({
      nsfw: "yes",
      store: 1,
    } as unknown as { nsfw: boolean; store: boolean });
    expect(nsfwAllowed()).toBe(true);
    expect(storeAllowed()).toBe(true);
  });

  it("only honours an explicit false", () => {
    setDevicePolicyForTest({ nsfw: false, store: false });
    expect(nsfwAllowed()).toBe(false);
    expect(storeAllowed()).toBe(false);
    expect(devicePolicy()).toEqual({ nsfw: false, store: false });
  });
});

describe("MATURE CONTENT off", () => {
  it("produces no blood at all — not merely undrawn blood", () => {
    // The gate is inside bloodBlow rather than at the draw call precisely so
    // the floor's saturation grid records nothing either; a draw-time gate
    // would fill the level up invisibly and hand the player a red battlefield
    // the moment the switch came back on.
    expect(bloodBlow(100, 100, "minion", true)).not.toBeNull();
    setDevicePolicyForTest({ nsfw: false, store: true });
    expect(bloodBlow(100, 100, "minion", true)).toBeNull();
  });

  it("outranks the in-game EXTRA GORE switch", () => {
    updateSettings({ extraGore: "on" });
    setDevicePolicyForTest({ nsfw: false, store: true });
    expect(bloodBlow(100, 100, "minion", true)).toBeNull();
  });

  it("leaves the store alone", () => {
    setDevicePolicyForTest({ nsfw: false, store: true });
    setStoreForced(true);
    expect(coinStoreAvailable()).toBe(true);
  });
});

describe("COIN STORE off", () => {
  it("takes the store away even from a build that forces it", () => {
    // FORCE STORE is a developer flag inside the game; it is not entitled to
    // overrule a control that exists so a handed-over phone can't spend money.
    setStoreForced(true);
    expect(coinStoreAvailable()).toBe(true);
    setDevicePolicyForTest({ nsfw: true, store: false });
    expect(coinStoreAvailable()).toBe(false);
  });

  it("leaves the blood alone", () => {
    setDevicePolicyForTest({ nsfw: true, store: false });
    expect(bloodBlow(100, 100, "minion", true)).not.toBeNull();
  });
});

describe("a switch flipped while the game is running", () => {
  /** Install the shell's push channel over a stubbed window, and hand back the
   * callback it registered — i.e. what the native side would call. */
  function pushChannel(): (event: unknown) => void {
    const win: Record<string, unknown> = {
      __GIS_POLICY__: { nsfw: true, store: true },
    };
    vi.stubGlobal("window", win);
    initDevicePolicy();
    return win.__gisPolicyEvent as (event: unknown) => void;
  }

  it("reaches the listeners the menu rebuilds on", () => {
    const push = pushChannel();
    const seen: boolean[] = [];
    const stop = subscribeDevicePolicy((policy) => seen.push(policy.store));
    push({ event: "policy", policy: { nsfw: true, store: false } });
    expect(seen).toEqual([false]);
    expect(storeAllowed()).toBe(false);
    stop();
    vi.unstubAllGlobals();
  });

  it("stays quiet when the pushed policy changed nothing", () => {
    // The shell re-pushes on every foreground; a re-render storm on every app
    // switch is not what that is for.
    const push = pushChannel();
    let calls = 0;
    const stop = subscribeDevicePolicy(() => calls++);
    push({ event: "policy", policy: { nsfw: true, store: true } });
    expect(calls).toBe(0);
    push({ event: "policy", policy: { nsfw: false, store: true } });
    expect(calls).toBe(1);
    stop();
    vi.unstubAllGlobals();
  });

  it("ignores anything that isn't a policy event", () => {
    const push = pushChannel();
    const stop = subscribeDevicePolicy(() => {
      throw new Error("should not fire");
    });
    push(null);
    push({ event: "something-else", policy: { nsfw: false, store: false } });
    expect(nsfwAllowed()).toBe(true);
    stop();
    vi.unstubAllGlobals();
  });
});
