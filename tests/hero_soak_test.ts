// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE BLOOD THE HERO WEARS (pwa/src/game/game-screen/hero-soak.ts), and the
// promises the feature makes:
//
//  - it is priced off the SAME `BloodBlow` the spray and the floor are, so the
//    hero can never disagree with the ground about how bad a hit was;
//  - it only lands at CONTACT range, which is the entire reason a bladed build
//    and a gunslinger end up looking different — with no code anywhere reading a
//    weapon's class;
//  - the FLOOR marks his boots on its own, and stops at the knees;
//  - a zone is a GEAR SLOT, so a swap cleans exactly what was swapped and
//    nothing else — the only way any of it ever gets cleaner;
//  - EXTRA GORE off means nothing is recorded AND nothing is read back, so the
//    switch can't hide a mess it hands over the moment it goes on again.

import { beforeEach, describe, expect, it } from "vitest";

import {
  bloodBlow,
  type BloodBlow,
} from "../pwa/src/game/game-screen/blood-hit.ts";
import {
  heroSoak,
  resetHeroSoak,
  soakHero,
  syncHeroGear,
  wadeHero,
} from "../pwa/src/game/game-screen/hero-soak.ts";
import {
  bodyCoat,
  coatLayer,
  weaponCoat,
  COAT_AT,
  SOAK_ZONES,
} from "../pwa/src/game/render/soak-ladder.ts";
import { updateSettings } from "../pwa/src/game/settings.ts";
import { startGame } from "./helpers.ts";

const MINION_HP = 100;

/** A blow taking `bars` of a minion's own health. */
function blow(bars = 1): BloodBlow {
  return bloodBlow(MINION_HP * bars, MINION_HP, "minion", true)!;
}

/** A fresh run with the soak wiped, and the hero parked at a known spot. */
function fresh() {
  resetHeroSoak();
  updateSettings({ extraGore: "on", blood: 1 });
  const state = startGame();
  state.player.pos = { x: 400, y: 400 };
  syncHeroGear(state);
  return state;
}

/** `count` identical blows landed `dist` px away from him. */
function land(
  state: ReturnType<typeof fresh>,
  dist: number,
  count = 1,
  bars = 1,
) {
  for (let i = 0; i < count; i++) {
    soakHero(state, blow(bars), {
      x: state.player.pos.x + dist,
      y: state.player.pos.y,
    });
  }
  // A SNAPSHOT: `heroSoak` hands back the module's live record, and the module
  // holds exactly one run — so staging a second `fresh()` would rewrite a
  // reference captured from the first.
  return { ...heroSoak(state) };
}

/** `ms` of standing in a floor `wetness` deep, snapshotted the same way. */
function wade(state: ReturnType<typeof fresh>, wetness: number, ms: number) {
  wadeHero(state, wetness, ms);
  return { ...heroSoak(state) };
}

beforeEach(() => {
  resetHeroSoak();
  updateSettings({ extraGore: "on", blood: 1 });
});

describe("soakHero", () => {
  it("marks him from contact range and not from across the room", () => {
    const near = land(fresh(), 4, 1).chest;
    const far = land(fresh(), 200, 1).chest;
    expect(near).toBeGreaterThan(0);
    expect(far).toBe(0);
  });

  it("is the whole difference between a bladed build and a gunslinger", () => {
    // Nothing here says "melee" or "ranged" — the two builds differ only in
    // where the bodies fall, which is exactly how the rule is meant to work.
    // A shipped blade reaches 24–48 px; a gun works at 160–300.
    const blade = land(fresh(), 30, 20).chest;
    const gun = land(fresh(), 220, 20).chest;
    // The blade is plainly wearing the crowd; the gun has not been touched.
    expect(blade).toBeGreaterThan(COAT_AT[0]!);
    expect(gun).toBe(0);
  });

  it("builds up over a map rather than over a pack", () => {
    // The ladder has to be climbable but not in a handful of kills: a hero
    // drenched by his fourth body has nowhere left to go for ten minutes.
    const pack = land(fresh(), 10, 5).chest;
    const map = land(fresh(), 10, 200).chest;
    expect(pack).toBeLessThan(COAT_AT[1]!);
    expect(map).toBeGreaterThan(COAT_AT[2]!);
  });

  it("paints his front before his face", () => {
    const soak = land(fresh(), 10, 12);
    expect(soak.chest).toBeGreaterThan(soak.head);
    expect(soak.chest).toBeGreaterThan(soak.legs);
  });

  it("reaches his face only from what died against him", () => {
    // The head's share falls off harder with distance than the rest of him, so
    // a body opened at arm's length goes over him and one a stride out does not.
    const contact = land(fresh(), 2, 10);
    const stride = land(fresh(), 22, 10);
    expect(contact.head / contact.chest).toBeGreaterThan(
      stride.head / stride.chest,
    );
  });

  it("bloodies the weapon hardest — it is what opened the body", () => {
    const soak = land(fresh(), 6, 10);
    expect(soak.weapon).toBeGreaterThan(soak.chest);
  });

  it("saturates — no zone can go past drenched", () => {
    const soak = land(fresh(), 2, 4000);
    for (const zone of SOAK_ZONES) expect(soak[zone]).toBeLessThanOrEqual(1);
  });

  it("scales every zone with the blow that made it", () => {
    const nick = land(fresh(), 6, 6, 0.05);
    const opened = land(fresh(), 6, 6, 1);
    for (const zone of SOAK_ZONES) {
      expect(opened[zone]).toBeGreaterThan(nick[zone]);
    }
  });
});

describe("wadeHero", () => {
  it("wets his boots and his shins, and stops at the knees", () => {
    const soak = wade(fresh(), 1, 2000);
    expect(soak.feet).toBeGreaterThan(0);
    expect(soak.legs).toBeGreaterThan(0);
    expect(soak.legs).toBeLessThan(soak.feet);
    // The floor is the one source of soak that does not care how he fights, so
    // it must never reach the parts a build is read off.
    expect(soak.chest).toBe(0);
    expect(soak.head).toBe(0);
    expect(soak.weapon).toBe(0);
  });

  it("wets faster the wetter the floor is", () => {
    const wet = wade(fresh(), 1, 1000).feet;
    const damp = wade(fresh(), 0.25, 1000).feet;
    expect(wet).toBeGreaterThan(damp);
    expect(damp).toBeGreaterThan(0);
  });

  it("cannot soak him through on one lost frame", () => {
    // A level load or a backgrounded tab hands us an enormous dt; billing it in
    // full would drench his boots in a single tick.
    expect(wade(fresh(), 1, 60_000).feet).toBeLessThan(0.1);
  });
});

describe("syncHeroGear", () => {
  it("cleans exactly the zone whose gear changed", () => {
    const state = fresh();
    land(state, 6, 12);
    wadeHero(state, 1, 3000);
    const before = { ...heroSoak(state) };
    expect(before.chest).toBeGreaterThan(0);
    expect(before.feet).toBeGreaterThan(0);
    // A different pair of boots — compared on the piece's INSTANCE id, so
    // swapping one pair for an identical pair still counts. They are clean.
    state.player.equipment.feet = {
      ...state.player.equipment.chest!,
      id: 9_999_001,
    };
    syncHeroGear(state);
    const after = heroSoak(state);
    expect(after.feet).toBe(0);
    expect(after.chest).toBe(before.chest);
    expect(after.head).toBe(before.head);
  });

  it("cleans a blade picked up off the floor", () => {
    const state = fresh();
    land(state, 6, 12);
    expect(heroSoak(state).weapon).toBeGreaterThan(0);
    state.player.equipment.weapon = {
      ...state.player.equipment.weapon,
      id: 9_999_002,
    };
    syncHeroGear(state);
    expect(heroSoak(state).weapon).toBe(0);
  });

  it("cleans an empty slot the moment something goes into it", () => {
    const state = fresh();
    state.player.equipment.head = null;
    syncHeroGear(state);
    land(state, 6, 12);
    expect(heroSoak(state).head).toBeGreaterThan(0);
    state.player.equipment.head = {
      ...state.player.equipment.chest!,
      id: 9_999_003,
    };
    syncHeroGear(state);
    expect(heroSoak(state).head).toBe(0);
  });
});

describe("the gore gate", () => {
  it("records nothing and reads back nothing with EXTRA GORE off", () => {
    const state = fresh();
    land(state, 4, 20);
    expect(heroSoak(state).chest).toBeGreaterThan(0);
    updateSettings({ extraGore: "off" });
    // Read back clean…
    expect(heroSoak(state).chest).toBe(0);
    // …and nothing accumulates while it is shut, which is what makes reading
    // the gate at the top of `heroSoak` honest rather than a hidden pile.
    const shut = fresh();
    updateSettings({ extraGore: "off" });
    soakHero(shut, bloodBlow(100, 100, "minion", true) ?? blow(), {
      x: shut.player.pos.x,
      y: shut.player.pos.y,
    });
    wadeHero(shut, 1, 5000);
    updateSettings({ extraGore: "on" });
    expect(heroSoak(shut).chest).toBe(0);
    expect(heroSoak(shut).feet).toBe(0);
  });

  it("goes dry at a BLOOD amount of zero", () => {
    const state = fresh();
    updateSettings({ blood: 0 });
    expect(bloodBlow(100, 100, "minion", true)).toBeNull();
    wadeHero(state, 1, 5000);
    expect(heroSoak(state).feet).toBe(0);
  });

  it("scales with the BLOOD amount", () => {
    const half = fresh();
    updateSettings({ blood: 0.5 });
    land(half, 6, 10);
    const full = fresh();
    updateSettings({ blood: 1 });
    land(full, 6, 10);
    expect(heroSoak(half).chest).toBeLessThan(heroSoak(full).chest);
  });
});

describe("a new run", () => {
  it("turns up clean — the object identity IS the run", () => {
    const first = fresh();
    land(first, 4, 20);
    expect(heroSoak(first).chest).toBeGreaterThan(0);
    const second = startGame();
    second.player.pos = { x: 400, y: 400 };
    for (const zone of SOAK_ZONES) expect(heroSoak(second)[zone]).toBe(0);
  });
});

describe("the coat ladder", () => {
  it("draws nothing at all below the first rung", () => {
    expect(coatLayer("chest", 0)).toBeNull();
    expect(coatLayer("chest", COAT_AT[0]! - 0.001)).toBeNull();
  });

  it("climbs a rung of authored art at a time", () => {
    const rungs = COAT_AT.map((at) => coatLayer("chest", at)!.sprite);
    expect(rungs).toEqual([
      "blood_coat_chest_0",
      "blood_coat_chest_1",
      "blood_coat_chest_2",
    ]);
  });

  it("ramps the alpha INSIDE a rung, so a zone darkens continuously", () => {
    const low = coatLayer("chest", COAT_AT[0]!)!;
    const high = coatLayer("chest", COAT_AT[1]! - 0.01)!;
    expect(low.sprite).toBe(high.sprite);
    expect(high.alpha).toBeGreaterThan(low.alpha);
  });

  it("holds the top rung under full strength", () => {
    // The coat MULTIPLIES into whatever he is wearing (render/hero-coat.ts); at
    // full strength it stops reading as blood on a suit and starts reading as a
    // red suit.
    expect(coatLayer("chest", 1)!.alpha).toBeLessThan(1);
  });

  it("keeps the weapon's coat out of the body's", () => {
    // They are drawn in different spaces — the weapon's rides its own swing
    // pivot — so mixing them would leave blood hanging where the blade was.
    const soaked = land(fresh(), 6, 20);
    const body = bodyCoat(soaked).map((c) => c.sprite);
    const held = weaponCoat(soaked).map((c) => c.sprite);
    expect(body.some((s) => s.includes("weapon"))).toBe(false);
    expect(held.every((s) => s.includes("weapon"))).toBe(true);
    expect(held.length).toBe(1);
  });

  it("gives a clean hero nothing to draw", () => {
    expect(bodyCoat(heroSoak(fresh()))).toEqual([]);
    expect(weaponCoat(heroSoak(fresh()))).toEqual([]);
  });
});
