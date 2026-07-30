// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SCREEN-NUKE'S DEAD, and what the MATURE CONTENT switch does to them.
//
// A nuke kill normally burns the body up: the `incinerated` flag rides out on the
// engine's `enemyKilled` event and the app answers with the fire-and-skeleton
// effect INSTEAD of the gore splash and the plain corpse. It is the most graphic
// thing the game does, so the device's MATURE CONTENT switch takes it away — and
// what it must fall back to is the ORDINARY death, punt and topple included.
//
// That fallback is the whole point of this suite, and it is easy to get wrong in
// a way nothing else catches: suppress the incinerate EFFECT alone and a censored
// blast kills a screenful of mobs whose bodies simply cease to exist, which reads
// as a bug rather than as a gentler game. `killPresentation` instead drops the
// FLAG, which puts the kill back on the normal corpse path with its launch — so
// what is asserted below is that MATURE CONTENT off still LAUNCHES the body.
//
// Tested through the leaf rather than through `applyEventFx`: the fx pass reaches
// the sprite atlas and the pickup feed's components, and this project is the
// engine's — framework-free, `"types": []`, and typechecked on CI before the
// atlas has even been generated. That is exactly why the rule lives in a leaf.

import { beforeEach, describe, expect, it } from "vitest";

import { setDevicePolicyForTest } from "../pwa/src/app/device-policy.ts";
import {
  killPresentation,
  type KillBlow,
} from "../pwa/src/game/game-screen/kill-presentation.ts";
import { updateSettings } from "../pwa/src/game/settings.ts";

const HERO = { x: 500, y: 500 };
/** Well off to the hero's side, so the punt has a direction to throw in. */
const VICTIM = { x: 900, y: 500 };
/** A nuke hits far harder than the mob's whole bar — that overkill is what the
 * throw is sized on. */
const DAMAGE = 400;
const MAX_HP = 100;

/** One minion's death, as the fx pass resolves it. */
function death(over: Partial<KillBlow> = {}) {
  return killPresentation({
    damage: DAMAGE,
    maxHp: MAX_HP,
    heroPos: HERO,
    pos: VICTIM,
    role: "minion",
    anatomy: "humanoid",
    seed: 7,
    ...over,
  });
}

/** One NUKED minion's death. */
function nukeDeath() {
  return death({ incinerated: true });
}

beforeEach(() => {
  setDevicePolicyForTest(null); // unmanaged: everything allowed
  updateSettings({ knockback: 1 });
});

describe("a screen-nuke kill", () => {
  it("burns the body to a skeleton when mature content is allowed", () => {
    const nuked = nukeDeath();
    expect(nuked.incinerate).toBe(true);
    // Nothing to throw — the body is gone.
    expect(nuked.launch).toBeNull();
  });

  it("falls back to the ordinary corpse when mature content is off", () => {
    setDevicePolicyForTest({ nsfw: false, store: true });
    expect(nukeDeath().incinerate).toBe(false);
  });

  it("still knocks the body over like any other killing blow", () => {
    // The promise the switch makes: without mature content the bomb hits like
    // ordinary damage. A corpse with no launch would be a body deleted on the
    // spot, which is the failure this whole suite exists to catch.
    setDevicePolicyForTest({ nsfw: false, store: true });
    const launch = nukeDeath().launch;
    expect(launch).not.toBeNull();
    expect(launch!.dist).toBeGreaterThan(0);
    // Thrown AWAY from the hero, who stands to its left.
    expect(launch!.dx).toBeGreaterThan(0);
  });

  it("throws a censored nuke kill exactly as an ordinary blow would", () => {
    // The fallback is not a lesser imitation of the normal death — it IS the
    // normal death, so the same blow lands the same throw either way.
    setDevicePolicyForTest({ nsfw: false, store: true });
    const censored = nukeDeath().launch;
    expect(censored).toEqual(death().launch);
  });

  it("leaves an ordinary kill alone whichever way the switch is set", () => {
    for (const nsfw of [true, false]) {
      setDevicePolicyForTest({ nsfw, store: true });
      // A solid one-shot rather than the nuke's fourfold overkill — hard enough
      // to punt the body, short of the overpressure that would burst it (that
      // ladder is gore_dismemberment_test.ts's business, not this suite's).
      const ordinary = death({ damage: MAX_HP + 20 });
      expect(ordinary.incinerate).toBe(false);
      expect(ordinary.gore).toBeNull();
      expect(ordinary.launch).not.toBeNull();
    }
  });
});
