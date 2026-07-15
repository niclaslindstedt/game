// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// COMPANION LEVELING and signature POWERS (companion-stats.ts + the kill-credit
// rail in loot.ts): a companion earns its OWN levels from its OWN kills,
// decoupled from the hero; its hp/damage and its signature power (more pellets,
// chain arcs, a wider frost nova, a swelling luck aura) grow with that level;
// the level/xp ride the loadout so it persists across levels and difficulties;
// a companion beaten down in a swarm STAYS down until the field clears or the
// hero speaks to a merchant, who stands the whole party back up.

import { describe, expect, it } from "vitest";

import {
  companionAuraMagicFind,
  companionDef,
  companionMaxHp,
  companionNovaRadius,
  companionPowerRank,
  companionProjectileBonus,
  companionXpToLevelUp,
  createGame,
  extractLoadout,
  magicFindBonus,
  recruitCompanion,
  reviveDownedCompanions,
  step,
} from "@game/core";
import type { Companion, GameEvent, GameState } from "@game/core";
import { clearStage, DT, idle, makeEnemy, run, startGame } from "./helpers.ts";

const SEED_NEXT = 4242;

/** Recruit `defId` beside the hero on a cleared stage, event log reset. */
function withCompanion(state: GameState, defId = "test_companion"): Companion {
  clearStage(state);
  const companion = recruitCompanion(state, defId, {
    x: state.player.pos.x + 60,
    y: state.player.pos.y,
  });
  state.events = [];
  return companion;
}

/** A wounded, one-hit-killable minion in the companion's weapon reach (low hp
 * under a tall maxHp so the kill pays real XP without an overkill toll). */
function mobInReach(state: GameState, companion: Companion, id: number) {
  const enemy = makeEnemy(
    {
      id,
      pos: { x: companion.pos.x + 16, y: companion.pos.y },
      hp: 4,
      maxHp: 60,
    },
    "test_minion",
  );
  state.enemies.push(enemy);
  return enemy;
}

describe("companion power math (pure)", () => {
  it("ranks up every `everyLevels` levels", () => {
    const def = companionDef("test_gunner"); // everyLevels: 2
    expect(companionPowerRank(def, 1)).toBe(0);
    expect(companionPowerRank(def, 2)).toBe(0);
    expect(companionPowerRank(def, 3)).toBe(1);
    expect(companionPowerRank(def, 5)).toBe(2);
  });

  it("grows the projectile volley: pellets and chain arcs per rank", () => {
    const def = companionDef("test_gunner"); // +1 pellet, +1 chain per rank
    expect(companionProjectileBonus(def, 1)).toEqual({
      pellets: 0,
      chain: 0,
      pierce: 0,
    });
    // Rank 1 at level 3, rank 2 at level 5.
    expect(companionProjectileBonus(def, 3)).toEqual({
      pellets: 1,
      chain: 1,
      pierce: 0,
    });
    expect(companionProjectileBonus(def, 5)).toEqual({
      pellets: 2,
      chain: 2,
      pierce: 0,
    });
  });

  it("swells the magic-find aura per rank on top of the base", () => {
    const def = companionDef("test_companion"); // base 0.5, +0.25/rank @ every 2
    expect(companionAuraMagicFind(def, 1)).toBeCloseTo(0.5);
    expect(companionAuraMagicFind(def, 3)).toBeCloseTo(0.75);
    expect(companionAuraMagicFind(def, 5)).toBeCloseTo(1.0);
  });

  it("widens the frost nova radius per rank", () => {
    const def = companionDef("test_frost"); // base 60, +10/rank @ every 3
    expect(companionNovaRadius(def, 1)).toBe(60);
    expect(companionNovaRadius(def, 4)).toBe(70);
    expect(companionNovaRadius(def, 7)).toBe(80);
  });

  it("the level curve rises monotonically and is authored in kills", () => {
    expect(companionXpToLevelUp(2)).toBeGreaterThan(companionXpToLevelUp(1));
    expect(companionXpToLevelUp(10)).toBeGreaterThan(companionXpToLevelUp(5));
  });
});

describe("companions earn their own levels", () => {
  it("a kill banks XP toward the companion's own bar", () => {
    const state = startGame();
    const companion = withCompanion(state, "test_gunner");
    mobInReach(state, companion, 7001);
    const before = companion.xp;
    for (let i = 0; i < 60 && state.enemies.some((e) => e.id === 7001); i++) {
      step(state, idle, DT);
    }
    expect(state.enemies.some((e) => e.id === 7001)).toBe(false);
    expect(companion.xp).toBeGreaterThan(before);
  });

  it("crossing the threshold levels it up: hp re-scales, cue fires", () => {
    const state = startGame();
    const companion = withCompanion(state, "test_gunner");
    // Park the bar one kill short of level 2.
    companion.level = 1;
    companion.xpToNext = companionXpToLevelUp(1);
    companion.xp = companion.xpToNext - 1;
    const maxHpBefore = companion.maxHp;
    mobInReach(state, companion, 7002);
    const events: GameEvent[] = [];
    for (let i = 0; i < 60 && companion.level < 2; i++) {
      step(state, idle, DT);
      events.push(...state.events);
    }
    expect(companion.level).toBe(2);
    // The ding re-scaled hp to the new level and healed to full.
    expect(companion.maxHp).toBe(
      companionMaxHp(companionDef("test_gunner"), 2),
    );
    expect(companion.maxHp).toBeGreaterThan(maxHpBefore);
    expect(companion.hp).toBe(companion.maxHp);
    const ding = events.find((e) => e.type === "companionLeveledUp");
    expect(ding).toBeDefined();
    expect(ding && ding.type === "companionLeveledUp" && ding.level).toBe(2);
  });

  it("a leveled gunner fires the extra pellets its power granted", () => {
    const state = startGame();
    const companion = withCompanion(state, "test_gunner");
    companion.level = 3; // rank 1 → +1 pellet, +1 chain
    // A foe square in pistol reach, hero stationary so the party holds and fires.
    state.enemies.push(
      makeEnemy(
        {
          id: 7003,
          pos: { x: companion.pos.x + 40, y: companion.pos.y },
          hp: 5000,
          maxHp: 5000,
        },
        "test_minion",
      ),
    );
    for (let i = 0; i < 30 && state.projectiles.length === 0; i++) {
      step(state, idle, DT);
    }
    const pellets = state.projectiles.filter(
      (p) => p.companionId === companion.id,
    );
    // Base pistol is a single shot; the power added a second pellet.
    expect(pellets.length).toBeGreaterThanOrEqual(2);
    expect(pellets.every((p) => (p.chain ?? 0) >= 1)).toBe(true);
  });
});

describe("the level and XP ride the loadout across runs", () => {
  it("extract → apply carries the earned level and XP", () => {
    const state = startGame();
    const companion = withCompanion(state, "test_gunner");
    companion.level = 6;
    companion.xp = 123;
    companion.maxHp = companionMaxHp(companionDef("test_gunner"), 6);

    const next = createGame(
      SEED_NEXT,
      "test_level_2",
      "medium",
      extractLoadout(state),
    );
    const carried = next.companions[0]!;
    expect(carried.level).toBe(6);
    expect(carried.xp).toBe(123);
    // Rested at its OWN level, not the hero's.
    expect(carried.maxHp).toBe(companionMaxHp(companionDef("test_gunner"), 6));
    expect(carried.hp).toBe(carried.maxHp);
    expect(carried.xpToNext).toBe(companionXpToLevelUp(6));
  });

  it("a pre-leveling loadout loads at the hero's level with a fresh bar", () => {
    const state = startGame();
    withCompanion(state, "test_gunner");
    const loadout = extractLoadout(state);
    // Strip the new fields, as a loadout banked before companion leveling would.
    for (const c of loadout.companions ?? []) {
      delete (c as { level?: number }).level;
      delete (c as { xp?: number }).xp;
    }
    const next = createGame(SEED_NEXT, "test_level_2", "medium", loadout);
    const carried = next.companions[0]!;
    expect(carried.level).toBe(Math.max(1, next.player.level));
    expect(carried.xp).toBe(0);
  });
});

describe("a merchant revives the party", () => {
  it("reviveDownedCompanions stands a downed companion up at full hp", () => {
    const state = startGame();
    const companion = withCompanion(state);
    companion.downedMs = 5_000;
    companion.hp = 0;
    expect(magicFindBonus(state)).toBe(0); // aura silent while down

    const revived = reviveDownedCompanions(state);
    expect(revived).toBe(1);
    expect(companion.downedMs).toBeUndefined();
    expect(companion.hp).toBe(companion.maxHp);
    expect(state.events.some((e) => e.type === "companionRevived")).toBe(true);
    expect(magicFindBonus(state)).toBeCloseTo(0.5); // aura back up
  });

  it("meeting the wandering merchant stands the party back up", () => {
    const state = startGame();
    const companion = withCompanion(state);
    companion.downedMs = 8_000;
    companion.hp = 0;
    // Plant the (undiscovered) merchant right on top of the hero so the next
    // step discovers him.
    state.merchant.discovered = false;
    state.merchant.pos = { x: state.player.pos.x + 6, y: state.player.pos.y };
    const events: GameEvent[] = [];
    for (let i = 0; i < 20 && !state.merchant.discovered; i++) {
      step(state, idle, DT);
      events.push(...state.events);
    }
    expect(state.merchant.discovered).toBe(true);
    expect(companion.downedMs).toBeUndefined();
    expect(companion.hp).toBe(companion.maxHp);
  });
});

describe("downed in a swarm: the count freezes until the field clears", () => {
  it("a foe nearby holds a downed companion down; clearing it lets it rise", () => {
    const state = startGame();
    const companion = withCompanion(state);
    companion.downedMs = 200; // a sliver left on the count
    companion.hp = 0;
    // A live foe right beside the fallen companion freezes its revive count.
    const foe = makeEnemy(
      { id: 7100, pos: { x: companion.pos.x + 10, y: companion.pos.y } },
      "test_minion",
    );
    state.enemies.push(foe);
    run(state, idle, 60); // well past the 200ms count
    expect(companion.downedMs).toBe(200); // never ticked — a foe is on it
    expect(companion.hp).toBe(0);

    // Clear the field: the count runs out and it stands back up on its own.
    state.enemies = state.enemies.filter((e) => e.id !== 7100);
    run(state, idle, 40);
    expect(companion.downedMs).toBeUndefined();
    expect(companion.hp).toBeGreaterThan(0);
  });
});
