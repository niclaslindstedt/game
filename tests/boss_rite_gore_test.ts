// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE MATURE-CONTENT GATE ON A BOSS'S DEATH RITE
// (pwa/src/game/game-screen/boss-rite.ts).
//
// The rite itself is never gated — the hero still leaps, the boss still dies,
// the beats run the same length — and it is only the WRECKAGE that is graphic.
// So the engine states an INTENT on `bossRiteStruck` and this leaf decides what
// actually happens, asking the very same two-axis gate the kill path asks
// (`gore-gate.ts`): may a body of this KIND make a mess (`goreAmount`), and may
// a body come apart THIS WAY at all (`dismemberAllowed`).
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
  updateSettings({
    blood: 1,
    goreBlood: "on",
    goreEcto: "on",
    goreSparks: "on",
    goreCosmic: "on",
    goreCleaves: "on",
    goreGibs: "on",
  });
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

  it("obeys the FAMILY's own gore row under the device switch", () => {
    updateSettings({ goreBlood: "off" });
    expect(struck().gore).toBeNull();
    expect(struck().corpse).toBe(true);
    updateSettings({ goreBlood: "on" });
    expect(struck().gore).not.toBeNull();
  });

  it("obeys the KIND's row too, across every family", () => {
    // The two axes answer different questions and both have to say yes: a
    // machine cut in two is still a body cut in two, so turning CLEAVES off has
    // to stop it whatever the boss is made of — and turning ROBOTIC GORE off
    // has to stop a rover bursting even with GIBS still on.
    updateSettings({ goreCleaves: "off" });
    expect(struck({ remains: "cleave" }).gore).toBeNull();
    expect(struck({ remains: "gib" }).gore).not.toBeNull();
    updateSettings({ goreCleaves: "on", goreGibs: "off" });
    expect(struck({ remains: "gib" }).gore).toBeNull();
    expect(struck({ remains: "cleave" }).gore).not.toBeNull();
    updateSettings({ goreGibs: "on", goreSparks: "off" });
    expect(struck({ remains: "gib", family: "sparks" }).gore).toBeNull();
    expect(struck({ remains: "gib", family: "blood" }).gore).not.toBeNull();
  });

  it("obeys the developer BLOOD amount at zero", () => {
    updateSettings({ blood: 0 });
    expect(struck().gore).toBeNull();
    updateSettings({ blood: 1 });
    expect(struck().gore).not.toBeNull();
  });
});
