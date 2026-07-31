// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE MATURE-CONTENT GATE ON A BOSS'S DEATH RITE
// (pwa/src/game/game-screen/boss-rite.ts).
//
// The rite itself is never gated — the hero still leaps, the boss still dies,
// the beats run the same length — and it is only the WRECKAGE that is graphic.
// So the engine states an INTENT on `bossRiteStruck` and this leaf decides what
// actually happens, asking the very same `bloodAmount()` the blood and the gore
// ladder ask: the device's MATURE CONTENT switch, the player's EXTRA GORE row,
// and the developer BLOOD amount.
//
// What a refusal falls back to is the point of the suite. A censored boss whose
// body ceases to exist reads as a BUG, not as a gentler game — the same failure
// `tests/gore_dismemberment_test.ts` and `tests/nuke_incineration_test.ts` pin
// for the ordinary kill and the nuke.

import { beforeEach, describe, expect, it } from "vitest";

import { setDevicePolicyForTest } from "../pwa/src/app/device-policy.ts";
import {
  bossRitePresentation,
  type BossRiteBlow,
} from "../pwa/src/game/game-screen/boss-rite.ts";
import { updateSettings } from "../pwa/src/game/settings.ts";

function struck(over: Partial<BossRiteBlow> = {}) {
  return bossRitePresentation({
    remains: "cleave",
    heading: 0,
    force: 6,
    anatomy: "humanoid",
    seed: 11,
    ...over,
  });
}

beforeEach(() => {
  setDevicePolicyForTest(null); // unmanaged: everything allowed
  updateSettings({ extraGore: "on", blood: 1 });
});

describe("what a finisher leaves", () => {
  it("cuts the boss in two when the rite says so", () => {
    const left = struck({ remains: "cleave" });
    expect(left.gore?.kind).toBe("cleave");
    expect(left.corpse).toBe(false);
  });

  it("bursts it when the rite says so", () => {
    const left = struck({ remains: "gib" });
    expect(left.gore?.kind).toBe("gib");
    expect(left.gore!.pieces.length).toBeGreaterThan(0);
  });

  it("leaves a whole body when the rite asks for one", () => {
    // THE UNMAKING wants the empty suit to fall, not a pile — a rite may ask
    // for an intact corpse and it is not a censored one.
    const left = struck({ remains: "corpse" });
    expect(left.gore).toBeNull();
    expect(left.corpse).toBe(true);
  });

  it("comes apart into what the boss is MADE of, not into meat", () => {
    // A machine has no ribcage. The family is the def's (`EnemyDef.gore`), and
    // the rite does not get a say — which is what makes one catalog serve a
    // body, a machine, a haunting and a rift-thing.
    const machine = struck({ remains: "gib", family: "sparks" });
    expect(machine.gore?.family).toBe("sparks");
    const ghost = struck({ remains: "gib", family: "ecto" });
    expect(ghost.gore?.family).toBe("ecto");
  });
});

describe("the mature-content gate on it", () => {
  it("refuses the wreckage when the device says no", () => {
    setDevicePolicyForTest({ nsfw: false, store: true });
    expect(struck({ remains: "cleave" }).gore).toBeNull();
    expect(struck({ remains: "gib" }).gore).toBeNull();
  });

  it("falls back to a WHOLE BODY rather than to nothing", () => {
    // The one that matters: the player who turned blood off still has to see
    // the boss die, and the level still needs its landmark of the fight.
    setDevicePolicyForTest({ nsfw: false, store: true });
    const censored = struck({ remains: "gib" });
    expect(censored.gore).toBeNull();
    expect(censored.corpse).toBe(true);
  });

  it("obeys the player's own EXTRA GORE row under the device switch", () => {
    updateSettings({ extraGore: "off" });
    expect(struck().gore).toBeNull();
    expect(struck().corpse).toBe(true);
    updateSettings({ extraGore: "on" });
    expect(struck().gore).not.toBeNull();
  });

  it("obeys the developer BLOOD amount at zero", () => {
    updateSettings({ blood: 0 });
    expect(struck().gore).toBeNull();
    updateSettings({ blood: 1 });
    expect(struck().gore).not.toBeNull();
  });
});
