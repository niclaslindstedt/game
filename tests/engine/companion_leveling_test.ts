// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// COMPANION LEVELING and signature POWERS (companion-stats.ts + the kill-credit
// rail in loot.ts): a companion earns its OWN levels from its OWN kills,
// decoupled from the hero; its hp/damage and its signature power (more pellets,
// chain arcs, a wider frost nova, a swelling luck aura) grow with that level;
// the level/xp ride the loadout so it persists across levels and difficulties;
// and a companion beaten down STAYS down — the merchant no longer stands the
// party back up for free, he SELLS the bottle of smelling salts that does.

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
  buyStock,
  openShop,
  step,
} from "@game/core";
import type { Companion, GameEvent, GameState } from "@game/core";
import { clearStage, DT, idle, makeEnemy, startGame } from "./helpers.ts";

const SEED_NEXT = 4242;

/** Recruit `defId` beside the hero on a cleared stage, event log reset. */
function withCompanion(state: GameState, defId = "test_companion"): Companion {
  clearStage(state);
  const companion = recruitCompanion(state, defId, {
    x: state.players[0].pos.x + 60,
    y: state.players[0].pos.y,
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
      extractLoadout(state, state.players[0]),
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
    const loadout = extractLoadout(state, state.players[0]);
    // Strip the new fields, as a loadout banked before companion leveling would.
    for (const c of loadout.companions ?? []) {
      delete (c as { level?: number }).level;
      delete (c as { xp?: number }).xp;
    }
    const next = createGame(SEED_NEXT, "test_level_2", "medium", loadout);
    const carried = next.companions[0]!;
    expect(carried.level).toBe(Math.max(1, next.players[0].level));
    expect(carried.xp).toBe(0);
  });
});

describe("the merchant no longer revives the party — he SELLS the cure", () => {
  it("meeting him leaves a downed companion exactly where it fell", () => {
    const state = startGame();
    const companion = withCompanion(state);
    companion.downed = true;
    companion.hp = 0;
    expect(magicFindBonus(state)).toBe(0); // aura silent while down
    // Plant the (undiscovered) merchant right on top of the hero so the next
    // step discovers him.
    state.merchant.discovered = false;
    state.merchant.pos = {
      x: state.players[0].pos.x + 6,
      y: state.players[0].pos.y,
    };
    for (let i = 0; i < 20 && !state.merchant.discovered; i++) {
      step(state, idle, DT);
    }
    expect(state.merchant.discovered).toBe(true);
    // The mercy that used to be free is now a purchase: he stocked the bottle,
    // he did not hand one over.
    expect(companion.downed).toBe(true);
    expect(companion.hp).toBe(0);
    expect(magicFindBonus(state)).toBe(0);
  });

  it("opening his stall does not mend a hurt companion either", () => {
    const state = startGame();
    const companion = withCompanion(state);
    companion.hp = 1;
    state.merchant.discovered = false;
    state.merchant.pos = {
      x: state.players[0].pos.x + 6,
      y: state.players[0].pos.y,
    };
    for (let i = 0; i < 20 && !state.merchant.discovered; i++) {
      step(state, idle, DT);
    }
    openShop(state);
    expect(companion.hp).toBe(1);
  });

  it("stocks a bottle of the revive item on every stall, met or not", () => {
    const state = startGame();
    withCompanion(state);
    state.merchant.discovered = false;
    state.merchant.pos = {
      x: state.players[0].pos.x + 6,
      y: state.players[0].pos.y,
    };
    for (let i = 0; i < 20 && !state.merchant.discovered; i++) {
      step(state, idle, DT);
    }
    const bottles = state.merchant.stock.filter(
      (row) => row.kind === "weapon" && row.equipment.defId === "test_salts",
    );
    expect(bottles).toHaveLength(1);
    expect(bottles[0]!.qty).toBeGreaterThan(0);
  });

  it("hands over a DISTINCT bottle per purchase — one row, several units", () => {
    const state = startGame();
    withCompanion(state);
    state.merchant.discovered = false;
    state.merchant.pos = {
      x: state.players[0].pos.x + 6,
      y: state.players[0].pos.y,
    };
    for (let i = 0; i < 20 && !state.merchant.discovered; i++) {
      step(state, idle, DT);
    }
    const row = state.merchant.stock.find(
      (r) => r.kind === "weapon" && r.equipment.defId === "test_salts",
    )!;
    state.players[0].coins = row.price * 4;
    // Empty the bag so both purchases have somewhere to land.
    state.players[0].inventory.fill(null);
    openShop(state);
    expect(buyStock(state, row.id)).toBe(true);
    expect(buyStock(state, row.id)).toBe(true);
    const held = state.players[0].inventory.filter(
      (item) => item?.defId === "test_salts",
    );
    expect(held).toHaveLength(2);
    // Two bottles, two identities: handing the same instance out twice would
    // put one item in two cells, sharing an id and a destroy.
    expect(held[0]!.id).not.toBe(held[1]!.id);
  });
});
