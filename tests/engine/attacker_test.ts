// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ATTACKER THREAD — the kill chain reads the hero who landed the blow, not
// seat 0. Every rule here is an exact no-op in a single-player run (the one
// attacker a solo run has IS seat 0), so each test stages a second hero and
// proves the read lands on the right one: kill XP prices against the killer's
// level, the accuracy roll reads the killer's build, a projectile carries its
// shooter's seat to the impact, the spare-or-kill verdict belongs to whoever
// forced the kneel, the boss death rite is performed by the hero whose blow
// felled the boss, and the FRAG COUNT the party scoreboard ranks on is booked
// against that same hero. See docs/multiplayer.md.

import { describe, expect, it } from "vitest";

import {
  bossDeathExecutioner,
  departHero,
  enemyDef,
  enemyKillXp,
  hitEnemy,
  killEnemy,
  playerMissChance,
  recruitCompanion,
  resolveChoice,
  seatHero,
  step,
} from "@game/core";
import type { GameEvent, GameState, Player } from "@game/core";

import { clearStage, DT, idle, makeEnemy, startGame } from "./helpers.ts";

/** A cleared two-hero run with the seeded stream pinned so nothing crits,
 * misses, or rolls a probabilistic drop unless a test re-pins it. */
function party(seed = 7): { state: GameState; a: Player; b: Player } {
  const state = startGame(seed);
  clearStage(state);
  const b = seatHero(state, null);
  state.rng = () => 0.99;
  return { state, a: state.players[0] as Player, b };
}

/** Park both heroes well away from `at`, so nobody's auto-attack or the
 * horde's contact pass muddies a surgically staged blow. */
function parkAway(state: GameState, at: { x: number; y: number }): void {
  for (const hero of state.players) {
    hero.pos = { x: at.x + 900, y: at.y + 900 };
  }
}

describe("kill XP prices against the attacker", () => {
  it("enemyKillXp reads the attacker's level, falling back to seat 0", () => {
    const { state, a, b } = party();
    a.level = 10;
    b.level = 14;
    const mob = makeEnemy({ pos: { x: 500, y: 500 }, mlvl: 12 }, "test_minion");
    const def = enemyDef("test_minion");
    const forA = enemyKillXp(state, def, mob, a);
    const forB = enemyKillXp(state, def, mob, b);
    // The guard that keeps the assertions below meaningful.
    expect(forB).not.toBe(forA);
    // No attacker named = seat 0's pricing, the solo identity.
    expect(enemyKillXp(state, def, mob)).toBe(forA);
  });

  it("a kill by seat 1's projectile pays seat 1's price, not seat 0's", () => {
    const { state, a, b } = party();
    a.level = 10;
    b.level = 14;
    // Stage the kill on the spawn itself — ground guaranteed clear of the
    // carve's walls and crates, so nothing eats the staged shot — and park the
    // party elsewhere so no auto-attack muddies whose blow this is.
    const at = { ...a.pos };
    parkAway(state, at);
    const mob = makeEnemy(
      { id: state.nextId++, pos: { ...at }, hp: 45, maxHp: 45, mlvl: 12 },
      "test_minion",
    );
    state.enemies.push(mob);
    const def = enemyDef("test_minion");
    const forA = Math.max(1, Math.round(enemyKillXp(state, def, mob, a)));
    const forB = Math.max(1, Math.round(enemyKillXp(state, def, mob, b)));
    expect(forB).not.toBe(forA);
    // Seat 1's shot, parked on the mob: magic so mob armor doesn't shave the
    // blow, damage exactly the health bar so the overkill toll stays 1.
    state.projectiles.push({
      id: state.nextId++,
      pos: { ...at },
      dir: { x: 1, y: 0 },
      speed: 1,
      radius: 6,
      damage: 45,
      lifetimeMs: 1000,
      weaponClass: "magic",
      sprite: "zap",
      seat: 1,
      z: 0,
    });
    step(state, [idle, idle], DT);
    const killed = state.events.find(
      (e): e is Extract<GameEvent, { type: "enemyKilled" }> =>
        e.type === "enemyKilled" && e.enemyId === mob.id,
    );
    expect(killed).toBeDefined();
    expect(killed!.xp).toBe(forB);
  });
});

describe("the blow reads the attacker's own build", () => {
  it("rolls the miss against the attacker's DEXTERITY", () => {
    const { state, a, b } = party();
    a.stats.dexterity = 0;
    b.stats.dexterity = 100;
    const missA = playerMissChance(state, a);
    const missB = playerMissChance(state, b);
    expect(missA).toBeGreaterThan(missB);
    // Pin the stream between the two chances: the clumsy hero's blow whiffs on
    // this very draw, the sharpshooter's sails through it.
    state.rng = () => (missA + missB) / 2;
    const mob = makeEnemy(
      { id: state.nextId++, pos: { x: 500, y: 500 }, hp: 500, maxHp: 500 },
      "test_minion",
    );
    state.enemies.push(mob);
    state.events = [];
    hitEnemy(state, mob, 5, "magic", { rollAccuracy: true, attacker: a });
    expect(state.events.some((e) => e.type === "enemyMiss")).toBe(true);
    expect(mob.hp).toBe(500);
    state.events = [];
    hitEnemy(state, mob, 5, "magic", { rollAccuracy: true, attacker: b });
    expect(state.events.some((e) => e.type === "enemyMiss")).toBe(false);
    expect(mob.hp).toBeLessThan(500);
  });
});

describe("the spare-or-kill verdict belongs to the killer", () => {
  /** Beat the fixture spareable to its knees with `killer`'s blow. */
  function kneel(state: GameState, killer: Player): void {
    const mob = makeEnemy(
      {
        id: state.nextId++,
        pos: { x: 520, y: 520 },
        hp: 10,
        maxHp: 150,
        powerScaled: true,
        spoke: true,
      },
      "test_spareable",
    );
    state.enemies.push(mob);
    hitEnemy(state, mob, 50, "magic", { attacker: killer });
    expect(state.phase).toBe("choice");
  }

  it("stamps the killer's seat and refuses anyone else while they play", () => {
    const { state, a, b } = party();
    kneel(state, b);
    expect(state.choice?.killer).toBe(1);
    // The teammate may not spend somebody else's spare…
    expect(resolveChoice(state, false, a)).toBe(false);
    expect(state.phase).toBe("choice");
    // …the killer may, and the withheld blow books as a kill.
    expect(resolveChoice(state, false, b)).toBe(true);
    expect(state.stats.kills).toBe(1);
  });

  it("falls open to anyone once the killer departs — no deadlock", () => {
    const { state, a, b } = party();
    kneel(state, b);
    departHero(state, 1);
    expect(b.departed).toBe(true);
    expect(resolveChoice(state, false, a)).toBe(true);
    expect(state.phase).not.toBe("choice");
  });

  it("never refuses a caller that names no actor (the solo path)", () => {
    const { state, b } = party();
    kneel(state, b);
    expect(resolveChoice(state, true)).toBe(true);
    expect(state.companions).toHaveLength(1);
  });
});

describe("the boss death rite's executioner", () => {
  it("is performed by the hero whose blow felled the boss", () => {
    const { state, b } = party();
    const boss = state.enemies.find(
      (e) => enemyDef(e.defId).role === "boss",
    ) as ReturnType<typeof makeEnemy>;
    expect(boss).toBeDefined();
    boss.spoke = true;
    killEnemy(state, boss, 9999, false, undefined, { attacker: b });
    expect(state.phase).toBe("bossDeath");
    expect(state.bossDeath?.executioner).toBe(1);
    expect(bossDeathExecutioner(state)).toBe(b);
  });

  it("falls back to seat 0 once the executioner's seat empties", () => {
    const { state, b } = party();
    const boss = state.enemies.find(
      (e) => enemyDef(e.defId).role === "boss",
    ) as ReturnType<typeof makeEnemy>;
    boss.spoke = true;
    killEnemy(state, boss, 9999, false, undefined, { attacker: b });
    departHero(state, 1);
    expect(bossDeathExecutioner(state)).toBe(state.players[0]);
  });
});

describe("the frag count is the killer's own", () => {
  it("books the kill on the hero who landed it, not on seat 0", () => {
    const { state, a, b } = party();
    const at = { ...a.pos };
    parkAway(state, at);
    const mob = makeEnemy(
      { id: state.nextId++, pos: { ...at }, hp: 30, maxHp: 30, mlvl: 3 },
      "test_minion",
    );
    killEnemy(state, mob, 30, false, undefined, { attacker: b });
    expect(b.kills).toBe(1);
    expect(a.kills).toBe(0);
    // The run's own tally counts it exactly once whoever swung — the two
    // numbers answer different questions (see `Player.kills`).
    expect(state.stats.kills).toBe(1);
  });

  it("falls back to seat 0 when no caller names an attacker", () => {
    const { state, a, b } = party();
    const mob = makeEnemy({ pos: { ...a.pos }, mlvl: 3 }, "test_minion");
    killEnemy(state, mob, 30, false);
    expect(a.kills).toBe(1);
    expect(b.kills).toBe(0);
  });

  it("credits NOBODY's frag count for a companion's kill", () => {
    const { state, a, b } = party();
    const companion = recruitCompanion(state, "test_companion", {
      x: a.pos.x + 60,
      y: a.pos.y,
    });
    const mob = makeEnemy({ pos: { ...a.pos }, mlvl: 3 }, "test_minion");
    // A companion's blow names no attacker (loot.ts credits it by
    // `companionId`), so without the guard the seat-0 fallback above would
    // hand every recruit's kill to the host.
    killEnemy(state, mob, 30, false, undefined, { companionId: companion.id });
    expect(a.kills).toBe(0);
    expect(b.kills).toBe(0);
    expect(state.stats.kills).toBe(1);
  });

  it("starts every seated hero at zero, the run's own tally beside it", () => {
    const { state, a, b } = party();
    expect(a.kills).toBe(0);
    expect(b.kills).toBe(0);
    expect(seatHero(state, null).kills).toBe(0);
  });
});
