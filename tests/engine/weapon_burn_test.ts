// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE BURNER (src/game/items/burn.ts) — a melee weapon made of FIRE, whose kills
// are burned up where they stood instead of leaving a body. It borrows the
// screen-nuke's own picture rather than growing a second one: the flag travels
// on the `enemyKilled` event as `incinerated`, the exact bit a bomb's kills
// already carry.
//
// Four rules are load-bearing, and three of them are ways this could quietly
// become a BALANCE change instead of a presentation one:
//
//   1. Every kill it lands carries `incinerated`, and no other weapon's does.
//   2. It is NOT the screen-nuke. The bomb's two other rules — `noNukeDrop` (a
//      bomb's kills never chain into more bombs) and `noMenace` (a bomb's output
//      is exempt from the meter) — belong to the BOMB, not to the fire. A weapon
//      kill is the hero's own work: it pays loot, it heats the meter. Wiring the
//      three together because they arrive together is the mistake this pins.
//   3. The damage, the reach, the cadence and the xp are untouched. `burn` is a
//      picture; a burner and a plain blade with the same numbers must land the
//      same blow for the same money.
//   4. It reads off the CATALOG, melee only, so a mod's weapon can carry it and
//      an id that no longer exists answers false rather than throwing.
//
// Run on the synthetic `test_burner` fixture rather than on the shipped
// flamethrower, so the RULE survives that weapon being retired or retuned.

import { describe, expect, it } from "vitest";

import {
  hitEnemy,
  step,
  weaponBurns,
  type Equipment,
  type GameState,
} from "@game/core";

import { clearStage, DT, idle, makeEnemy, startGame } from "./helpers.ts";

/** A cleared run on the reference level — `clearStage` returns void, so this
 * is the two-step every suite here writes. */
function staged(): GameState {
  const state = startGame();
  clearStage(state);
  return state;
}

/** `defId` in hand, cooled down and ready to swing. */
function wield(state: GameState, defId: string, durability = 20): Equipment {
  const weapon: Equipment = {
    id: state.nextId++,
    defId,
    slot: "weapon",
    tier: "regular",
    ilvl: 1,
    affixes: [],
    durability,
  };
  state.players[0].equipment.weapon = weapon;
  state.players[0].weaponCooldownMs = 0;
  return weapon;
}

/** A stationary body of `hp` health parked on the hero's doorstep. */
function bodyAt(state: GameState, hp: number, defId = "test_minion") {
  const enemy = makeEnemy(
    {
      pos: { x: state.players[0].pos.x + 12, y: state.players[0].pos.y },
      hp,
      maxHp: hp,
    },
    defId,
  );
  state.enemies.push(enemy);
  return enemy;
}

/** Swing until something dies (or we run out of patience), then hand back the
 * kill event the swing produced. */
function killWith(state: GameState, defId: string) {
  wield(state, defId);
  bodyAt(state, 30);
  for (let i = 0; i < 60; i++) {
    step(state, idle, DT);
    const kill = state.events.find((e) => e.type === "enemyKilled");
    if (kill?.type === "enemyKilled") return kill;
    state.players[0].weaponCooldownMs = 0;
  }
  return undefined;
}

describe("burning reads off the catalog", () => {
  it("answers true for a melee burner and false for everything else", () => {
    expect(weaponBurns("test_burner")).toBe(true);
    expect(weaponBurns("crude_sword")).toBe(false);
    expect(weaponBurns("test_executioner")).toBe(false);
    // A ranged weapon could never carry it — a burn happens where the weapon
    // IS, and the shot paths carry no weapon identity to read it off.
    expect(weaponBurns("blaster")).toBe(false);
    // An id that no longer exists (a fixture, a retired base in an old save).
    expect(weaponBurns("nothing_at_all")).toBe(false);
  });
});

describe("a burner's kills are burned up", () => {
  it("marks every kill it lands, and a plain blade marks none", () => {
    const burned = killWith(staged(), "test_burner");
    expect(burned?.type === "enemyKilled" && burned.incinerated).toBe(true);

    const plain = killWith(staged(), "crude_sword");
    // Not `false` — the flag is simply absent on every other weapon in the
    // game, which is what the app reads as "throw an ordinary corpse".
    expect(plain?.type === "enemyKilled" && plain.incinerated).toBeFalsy();
  });

  it("cleaves a whole cone of them, not just the one it aimed at", () => {
    const state = staged();
    wield(state, "test_burner");
    // How many a swing may cleave is an INTELLIGENCE investment
    // (`maxMeleeTargets`), and a fresh hero's cap is one — so without this the
    // test would be measuring the stat rather than the flag.
    state.players[0].stats.intelligence = 40;
    const hero = state.players[0].pos;
    // Three bodies abreast, all inside the fixture's 60px reach and 90° arc.
    for (const dy of [-16, 0, 16]) {
      const enemy = makeEnemy(
        { pos: { x: hero.x + 24, y: hero.y + dy }, hp: 1, maxHp: 1 },
        "test_minion",
      );
      state.enemies.push(enemy);
    }
    step(state, idle, DT);
    const kills = state.events.filter((e) => e.type === "enemyKilled");
    expect(kills.length).toBeGreaterThan(1);
    for (const kill of kills) {
      expect(kill.type === "enemyKilled" && kill.incinerated).toBe(true);
    }
  });
});

describe("a burn is a picture, not a bomb", () => {
  // The whole reason `burn` can sit outside the damage budget: it changes
  // nothing a balance pass would ever measure. A burner and a plain weapon
  // driven through the same funnel with the same damage must be identical
  // everywhere except the one flag.
  it("pays the same xp and the same damage as an unburnt blow", () => {
    const burn = staged();
    wield(burn, "test_burner");
    hitEnemy(burn, bodyAt(burn, 30), 500, "melee", { incinerated: true });

    const plain = staged();
    wield(plain, "crude_sword");
    hitEnemy(plain, bodyAt(plain, 30), 500, "melee", {});

    const a = burn.events.find((e) => e.type === "enemyKilled");
    const b = plain.events.find((e) => e.type === "enemyKilled");
    expect(a?.type === "enemyKilled" && b?.type === "enemyKilled").toBe(true);
    if (a?.type !== "enemyKilled" || b?.type !== "enemyKilled") return;
    expect(a.damage).toBe(b.damage);
    expect(a.maxHp).toBe(b.maxHp);
    expect(a.xp).toBe(b.xp);
    expect(burn.stats.kills).toBe(plain.stats.kills);
  });

  it("still heats the menace meter — `noMenace` is the BOMB's rule", () => {
    // A screen-nuke's kills are exempt from the meter because a panic button
    // must not read as an overpowered hero. A weapon kill is the hero, however
    // theatrical the corpse, so a burner must heat it exactly as a blade does.
    const burn = staged();
    wield(burn, "test_burner");
    const before = burn.menace;
    hitEnemy(burn, bodyAt(burn, 30), 500, "melee", { incinerated: true });
    const burnHeat = burn.menace - before;

    const plain = staged();
    wield(plain, "crude_sword");
    const plainBefore = plain.menace;
    hitEnemy(plain, bodyAt(plain, 30), 500, "melee", {});

    expect(burnHeat).toBe(plain.menace - plainBefore);
  });
});
