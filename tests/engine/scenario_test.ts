// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Test-scenario support (engine/game/scenario.ts): `applyScenario` mutates a
// fresh run into an exact situation — hero position, vitals, build, gear,
// the field's population — so bug repros and performance probes start from
// a described state instead of being played into. Fed by the app's
// `?scenario=` URL param and used directly here.

import { describe, expect, it } from "vitest";

import {
  abilityDef,
  applyScenario,
  createGame,
  HELD_ITEMS,
  isExplored,
  MERCHANT,
  RUN,
  weaponDef,
  xpToLevelUp,
  type GameState,
} from "@game/core";
import { DT, idle, run, SEED, startGame } from "./helpers.ts";

import { distance as dist } from "@game/lib/vec.ts";

const boss = (state: GameState) =>
  state.enemies.find((e) => e.defId === "test_boss");

describe("scenario / opening", () => {
  it("skips the opening into the playing phase by default", () => {
    const state = createGame(SEED, "test_level");
    expect(state.phase).toBe("intro");
    applyScenario(state, {});
    expect(state.phase).toBe("playing");
    expect(state.players[0].disarmed).toBe(false);
  });

  it("skips a prelude cutscene too", () => {
    const state = createGame(SEED, "test_prelude_level");
    expect(state.phase).toBe("cutscene");
    applyScenario(state, {});
    expect(state.phase).toBe("playing");
  });

  it("keeps the authored opening with skipOpening false", () => {
    const state = createGame(SEED, "test_level");
    applyScenario(state, { skipOpening: false, hp: 5 });
    expect(state.phase).toBe("intro");
    expect(state.players[0].hp).toBe(5);
  });
});

describe("scenario / the hero", () => {
  it("sets hp last, clamped into [1, maxHp]", () => {
    const state = startGame();
    applyScenario(state, { hp: 2 });
    expect(state.players[0].hp).toBe(2);
    applyScenario(state, { hp: 99_999 });
    expect(state.players[0].hp).toBe(state.players[0].maxHp);
    applyScenario(state, { hp: -5 });
    expect(state.players[0].hp).toBe(1);
  });

  it("survives the gear-driven maxHp recompute (2 hp stays 2 hp)", () => {
    const state = startGame();
    applyScenario(state, { hp: 2, gear: { chest: "test_vest" } });
    // The vest grants +20 maxHp; the explicit hp still lands after it.
    expect(state.players[0].hp).toBe(2);
  });

  it("sets level and re-derives the xp curve", () => {
    const state = startGame();
    applyScenario(state, { level: 7 });
    expect(state.players[0].level).toBe(7);
    expect(state.players[0].xp).toBe(0);
    expect(state.players[0].xpToNext).toBe(xpToLevelUp(7));
  });

  it("sets absolute stat allocations, stamina, and coins", () => {
    const state = startGame();
    applyScenario(state, {
      stats: { strength: 4, luck: 2 },
      stamina: 0,
      coins: 123,
    });
    expect(state.players[0].stats.strength).toBe(4);
    expect(state.players[0].stats.luck).toBe(2);
    expect(state.players[0].stamina).toBe(0);
    expect(state.players[0].coins).toBe(123);
  });

  it("fills the powerup dock, capped at its size", () => {
    const state = startGame();
    applyScenario(state, {
      abilities: [
        "test_orbit",
        "test_storm",
        "test_stasis",
        "test_magnet",
        "test_nuke",
      ],
    });
    expect(state.players[0].heldAbilities.length).toBe(HELD_ITEMS.cap);
    expect(state.players[0].heldAbilities[0]).toBe("test_orbit");
  });
});

describe("scenario / equipment", () => {
  it("mints a named weapon plain at catalog durability", () => {
    const state = startGame();
    applyScenario(state, { weapon: "test_hammer" });
    const weapon = state.players[0].equipment.weapon;
    expect(weapon.defId).toBe("test_hammer");
    expect(weapon.durability).toBe(weaponDef("test_hammer").durability);
  });

  it("weapon null leaves the hero bare-handed", () => {
    const state = startGame();
    applyScenario(state, { weapon: null });
    expect(state.players[0].equipment.weapon.defId).toBe("fists");
    expect(state.players[0].equipment.weapon.durability).toBeUndefined();
  });

  it("an unknown weapon id keeps the held weapon", () => {
    const state = startGame();
    const before = state.players[0].equipment.weapon.defId;
    applyScenario(state, { weapon: "no_such_weapon" });
    expect(state.players[0].equipment.weapon.defId).toBe(before);
  });

  it("dresses and strips gear slots", () => {
    const state = startGame();
    applyScenario(state, { gear: { chest: "test_vest" } });
    expect(state.players[0].equipment.chest?.defId).toBe("test_vest");
    const dressedMax = state.players[0].maxHp;
    applyScenario(state, { gear: { chest: null } });
    expect(state.players[0].equipment.chest).toBeNull();
    expect(state.players[0].maxHp).toBe(dressedMax - 20);
  });

  it("refuses a piece minted into the wrong slot", () => {
    const state = startGame();
    applyScenario(state, { gear: { head: "test_vest" } });
    expect(state.players[0].equipment.head).toBeNull();
  });

  it("disarmed holsters the hero", () => {
    const state = startGame();
    applyScenario(state, { disarmed: true });
    expect(state.players[0].disarmed).toBe(true);
  });
});

describe("scenario / placement", () => {
  it("places the hero a stand-off from the boss, map revealed", () => {
    const state = startGame();
    applyScenario(state, { place: "boss" });
    const b = boss(state);
    expect(b).toBeDefined();
    const away = dist(state.players[0].pos, b!.pos);
    expect(away).toBeGreaterThan(60);
    expect(away).toBeLessThan(160);
    expect(isExplored(state, state.players[0].pos)).toBe(true);
  });

  it("places the hero at exact coordinates, clamped into the level", () => {
    const state = startGame();
    applyScenario(state, { place: { x: 1200, y: 800 } });
    expect(state.players[0].pos).toEqual({ x: 1200, y: 800 });
    applyScenario(state, { place: { x: -500, y: 99_999 } });
    expect(state.players[0].pos.x).toBeGreaterThan(0);
    expect(state.players[0].pos.y).toBeLessThan(state.level.height);
  });

  it("places the hero beside the merchant, outside his discovery radius", () => {
    const state = startGame();
    applyScenario(state, { place: "merchant" });
    const away = dist(state.players[0].pos, state.merchant.pos);
    expect(away).toBeGreaterThan(MERCHANT.discoverRadius);
    expect(away).toBeLessThanOrEqual(MERCHANT.discoverRadius + 12);
    // Horizontally beside the stall — a vertical stand-off this size would
    // sit just outside the phone frame's ~97 world units of half-height.
    expect(state.players[0].pos.y).toBeCloseTo(state.merchant.pos.y, 5);
    expect(state.merchant.discovered).toBe(false);
    expect(isExplored(state, state.players[0].pos)).toBe(true);
  });
});

describe("scenario / the field", () => {
  it("clearEnemies empties the field but keeps the objective boss", () => {
    const state = startGame();
    applyScenario(state, { clearEnemies: true });
    expect(state.enemies.length).toBe(1);
    expect(state.enemies[0]?.defId).toBe("test_boss");
    // The level must not read as cleared: no victory countdown after a step.
    run(state, idle, 5);
    expect(state.victoryCountdownMs).toBeNull();
  });

  it("stopWaves silences the horde spawner", () => {
    const state = startGame();
    applyScenario(state, { clearEnemies: true, stopWaves: true });
    // The HUD total collapses to what actually stands on the field.
    expect(state.stats.totalEnemies).toBe(1);
    // The wave spawner's floor (minAlive) would otherwise repopulate within
    // a few seconds of sim time.
    run(state, idle, Math.ceil(5000 / DT));
    expect(state.enemies.length).toBe(1);
  });

  it("spawns a ring of mobs at least minDistance out", () => {
    const state = startGame();
    applyScenario(state, {
      clearEnemies: true,
      stopWaves: true,
      spawns: [
        { enemy: "test_fodder", count: 60, minDistance: 100, maxDistance: 220 },
      ],
    });
    const fodder = state.enemies.filter((e) => e.defId === "test_fodder");
    expect(fodder.length).toBe(60);
    for (const mob of fodder) {
      expect(dist(mob.pos, state.players[0].pos)).toBeGreaterThanOrEqual(100);
    }
    expect(state.stats.totalEnemies).toBe(61);
  });

  it("spawns at an exact spot with `at`", () => {
    const state = startGame();
    applyScenario(state, {
      spawns: [{ enemy: "test_brute", at: { x: 500, y: 500 } }],
    });
    const brute = state.enemies.find(
      (e) => e.defId === "test_brute" && e.pos.x === 500 && e.pos.y === 500,
    );
    expect(brute).toBeDefined();
  });

  it("an unknown enemy id skips the spawn line without throwing", () => {
    const state = startGame();
    const before = state.enemies.length;
    applyScenario(state, { spawns: [{ enemy: "no_such_mob", count: 3 }] });
    expect(state.enemies.length).toBe(before);
  });

  it("spawns already wounded at the staged hp fraction", () => {
    const state = startGame();
    applyScenario(state, {
      clearEnemies: true,
      spawns: [
        { enemy: "test_brute", at: { x: 500, y: 500 }, hpFrac: 0.4 },
        { enemy: "test_fodder", at: { x: 520, y: 500 }, hpFrac: 0 },
      ],
    });
    const brute = state.enemies.find((e) => e.defId === "test_brute");
    expect(brute!.hp).toBe(Math.round(brute!.maxHp * 0.4));
    // A staged wound never kills: 0 clamps to 1 hp, not a corpse.
    const fodder = state.enemies.find((e) => e.defId === "test_fodder");
    expect(fodder!.hp).toBe(1);
  });

  it("wounds the level's own boss to the staged fraction", () => {
    const state = startGame();
    applyScenario(state, {
      clearEnemies: true,
      spawns: [{ enemy: "test_fodder", at: { x: 520, y: 500 } }],
    });
    const b = boss(state)!;
    const fodder = state.enemies.find((e) => e.defId === "test_fodder")!;

    applyScenario(state, { bossHpFrac: 0.25 });
    expect(b.hp).toBe(Math.round(b.maxHp * 0.25));
    // The horde is not a boss and is left exactly as it stood.
    expect(fodder.hp).toBe(fodder.maxHp);

    // A sliver is left standing whatever is asked for — a scenario poses a
    // boss for the kill that follows, it never lands it.
    applyScenario(state, { bossHpFrac: 0 });
    expect(b.hp).toBe(1);
  });

  it("bossHpFrac on a field with no boss left is a no-op", () => {
    const state = startGame();
    state.enemies = [];
    expect(() => applyScenario(state, { bossHpFrac: 0.1 })).not.toThrow();
    expect(state.enemies).toEqual([]);
  });

  it("is deterministic: same seed + same spec, same ring", () => {
    const build = () => {
      const state = startGame(123);
      applyScenario(state, {
        clearEnemies: true,
        spawns: [{ enemy: "test_fodder", count: 20, minDistance: 80 }],
      });
      return state.enemies.map(
        (e) => `${e.pos.x.toFixed(3)},${e.pos.y.toFixed(3)}`,
      );
    };
    expect(build()).toEqual(build());
  });
});

describe("scenario / freeze", () => {
  it("poses the field: nobody moves, nobody strikes", () => {
    const state = startGame();
    applyScenario(state, {
      clearEnemies: true,
      stopWaves: true,
      freeze: true,
      disarmed: true,
      spawns: [
        { enemy: "test_fodder", count: 5, minDistance: 25, maxDistance: 60 },
      ],
    });
    const posed = state.enemies.map((e) => `${e.pos.x},${e.pos.y}`);
    const hp = state.players[0].hp;
    run(state, idle, Math.ceil(3000 / DT));
    expect(state.enemies.map((e) => `${e.pos.x},${e.pos.y}`)).toEqual(posed);
    expect(state.players[0].hp).toBe(hp);
  });

  it("roots the merchant mid-pose", () => {
    const state = startGame();
    applyScenario(state, { place: "merchant", freeze: true });
    const parked = { ...state.merchant.pos };
    run(state, idle, Math.ceil(3000 / DT));
    expect(state.merchant.pos).toEqual(parked);
    expect(state.merchant.discovered).toBe(false);
  });

  it("thaws a frozen run with freeze false", () => {
    const state = startGame();
    applyScenario(state, {
      clearEnemies: true,
      stopWaves: true,
      freeze: true,
      spawns: [
        { enemy: "test_fodder", count: 3, minDistance: 60, maxDistance: 90 },
      ],
    });
    const posed = state.enemies.map((e) => `${e.pos.x},${e.pos.y}`);
    applyScenario(state, { freeze: false });
    run(state, idle, Math.ceil(1000 / DT));
    expect(state.enemies.map((e) => `${e.pos.x},${e.pos.y}`)).not.toEqual(
      posed,
    );
  });
});

describe("scenario / drops", () => {
  it("lays loose pickups in a ring beyond scoop reach", () => {
    const state = startGame();
    const before = state.items.length;
    applyScenario(state, { drops: [{ item: "medkit", count: 3 }] });
    const added = state.items.slice(before);
    expect(added.length).toBe(3);
    for (const item of added) {
      expect(item.kind).toBe("medkit");
      expect(dist(item.pos, state.players[0].pos)).toBeGreaterThanOrEqual(30);
    }
  });

  it("drops at an exact spot with `at`", () => {
    const state = startGame();
    const before = state.items.length;
    applyScenario(state, { drops: [{ item: "xp", at: { x: 400, y: 400 } }] });
    const added = state.items.slice(before);
    expect(added.length).toBe(1);
    expect(added[0]?.pos).toEqual({ x: 400, y: 400 });
  });

  it("mints equipment at the asked tier, quality pinned to normal", () => {
    const state = startGame();
    const before = state.items.length;
    applyScenario(state, { drops: [{ item: "test_hammer", tier: "rare" }] });
    const added = state.items.slice(before);
    expect(added.length).toBe(1);
    const item = added[0];
    if (item?.kind !== "equipment") throw new Error("expected equipment");
    expect(item.equipment.defId).toBe("test_hammer");
    expect(item.equipment.tier).toBe("rare");
    expect(item.equipment.quality).toBe("normal");
  });

  it("mints a named unique from its UNIQUE_DEFS id", () => {
    const state = startGame();
    const before = state.items.length;
    applyScenario(state, { drops: [{ item: "test_relic" }] });
    const added = state.items.slice(before);
    const item = added[0];
    if (item?.kind !== "equipment") throw new Error("expected equipment");
    expect(item.equipment.defId).toBe("test_charm");
    expect(item.equipment.tier).toBe("unique");
  });

  it("wraps ability and story defs into their pickup kinds", () => {
    const state = startGame();
    const before = state.items.length;
    applyScenario(state, {
      drops: [{ item: "test_orbit" }, { item: "test_key" }],
    });
    const added = state.items.slice(before);
    expect(added.map((i) => i.kind)).toEqual(["ability", "story"]);
  });

  it("an unknown item id skips the drop line without throwing", () => {
    const state = startGame();
    const before = state.items.length;
    applyScenario(state, { drops: [{ item: "no_such_item", count: 3 }] });
    expect(state.items.length).toBe(before);
  });
});

// The DISPLAY-CASE fields: what a scenario needs to hold a staged situation up
// for as long as it is being looked at, rather than let the run carry on and
// dismantle it. The developer EFFECTS GALLERY stands its whole diorama up out
// of these (pwa/src/game/effects-gallery/), and the screenshot/FX loops use
// them through `?scenario=`.
describe("scenario / the display case", () => {
  it("reveal lifts the fog off the whole map", () => {
    const state = startGame();
    // A far corner the hero has never walked: dark until the fog is lifted.
    const corner = {
      x: state.level.width - 20,
      y: state.level.height - 20,
    };
    expect(isExplored(state, corner)).toBe(false);
    applyScenario(state, { reveal: true });
    expect(isExplored(state, corner)).toBe(true);
    expect(isExplored(state, { x: 20, y: 20 })).toBe(true);
  });

  it("leaves the fog alone by default", () => {
    const state = startGame();
    const corner = { x: state.level.width - 20, y: state.level.height - 20 };
    applyScenario(state, { place: { x: 200, y: 200 } });
    expect(isExplored(state, corner)).toBe(false);
  });

  it("muteDialogue keeps a staged speaker's scene off the stage", () => {
    // A talker staged right next to the hero opens its arrival scene the moment
    // it wakes, which parks the run in `dialogue` — the simulation stops, and
    // with it every effect a display case is there to show.
    const stageTalker = (state: GameState) =>
      applyScenario(state, {
        clearEnemies: true,
        stopWaves: true,
        spawns: [
          { enemy: "test_talker", count: 1, minDistance: 20, maxDistance: 30 },
        ],
      });
    const loud = startGame();
    stageTalker(loud);
    run(loud, idle, Math.ceil(2000 / DT), (s) => s.phase === "dialogue");
    expect(loud.phase).toBe("dialogue");

    const muted = startGame();
    applyScenario(muted, { muteDialogue: true });
    expect(muted.dialogueMuted).toBe(true);
    stageTalker(muted);
    run(muted, idle, Math.ceil(2000 / DT));
    expect(muted.phase).toBe("playing");
    // …and the mute lifts again, so a scenario can stage the scenes themselves.
    applyScenario(muted, { muteDialogue: false });
    expect(muted.dialogueMuted).toBe(false);
  });

  it("noVictory holds a cleared field open instead of ending the level", () => {
    const state = startGame();
    // Wipe the field INCLUDING the objective boss, which is exactly the state
    // that reads as "objective cleared" and arms the countdown.
    applyScenario(state, { clearEnemies: true, stopWaves: true });
    state.enemies = [];
    applyScenario(state, { noVictory: true });
    run(state, idle, Math.ceil(RUN.victoryDelayMs / DT) + 30);
    expect(state.victoryCountdownMs).toBeNull();
    expect(state.phase).toBe("playing");
  });

  it("without noVictory the same cleared field ends the level", () => {
    const state = startGame();
    applyScenario(state, { clearEnemies: true, stopWaves: true });
    state.enemies = [];
    run(state, idle, Math.ceil(RUN.victoryDelayMs / DT) + 30);
    expect(state.phase).not.toBe("playing");
  });

  it("runAbilities starts powerups already running, not banked", () => {
    const state = startGame();
    applyScenario(state, { runAbilities: ["test_orbit", "test_stasis"] });
    expect(state.players[0].abilities.map((a) => a.defId)).toEqual([
      "test_orbit",
      "test_stasis",
    ]);
    // Running, not docked — the dock is what `abilities` fills.
    expect(state.players[0].heldAbilities).toEqual([]);
    // Each starts at its def's full duration and ticks down from there.
    const orbit = state.players[0].abilities[0];
    expect(orbit?.remainingMs).toBe(abilityDef("test_orbit").durationMs);
    run(state, idle, Math.ceil(500 / DT));
    expect(state.players[0].abilities[0]?.remainingMs).toBeLessThan(
      abilityDef("test_orbit").durationMs,
    );
  });

  it("refuses an unknown id and an instant power, without throwing", () => {
    const state = startGame();
    applyScenario(state, { runAbilities: ["no_such_power", "test_nuke"] });
    expect(state.players[0].abilities).toEqual([]);
  });
});
