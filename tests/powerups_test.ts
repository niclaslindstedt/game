// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The new pickups: golden XP arrows that scale with the level curve (and
// the full heal a level-up brings), the rare screen nuke, and the item
// magnet whose reach grows with INTELLIGENCE.

import { describe, expect, it } from "vitest";

import {
  ABILITY_DEFS,
  grantAbility,
  LEVELING,
  magnetRadius,
  step,
} from "@game/core";
import type { GameInput, GameState, Item } from "@game/core";
import { clearStage, DT, idle, makeEnemy, startGame } from "./helpers.ts";

const useItem: GameInput = {
  steering: false,
  target: { x: 0, y: 0 },
  jump: false,
  useItem: true,
};

function dropArrow(state: GameState, id: number): Item {
  return { id, kind: "xp", pos: { ...state.player.pos } };
}

describe("xp arrows", () => {
  it("grant a share of the CURRENT level threshold", () => {
    const state = startGame();
    clearStage(state);
    state.items = [dropArrow(state, 1)];
    step(state, idle, DT);
    expect(state.player.xp).toBe(
      Math.round(state.player.xpToNext * LEVELING.arrowXpShare),
    );
    expect(state.events).toContainEqual({ type: "itemCollected", kind: "xp" });

    // At a later level the same arrow is worth more raw XP — it tracks the
    // threshold instead of fading into noise.
    const later = startGame();
    clearStage(later);
    later.player.level = 8;
    later.player.xpToNext = 4000;
    later.items = [dropArrow(later, 1)];
    step(later, idle, DT);
    expect(later.player.xp).toBe(Math.round(4000 * LEVELING.arrowXpShare));
  });

  it("enough arrows level the player up and open the chooser", () => {
    const state = startGame();
    clearStage(state);
    const needed = Math.ceil(1 / LEVELING.arrowXpShare);
    state.items = Array.from({ length: needed }, (_, i) =>
      dropArrow(state, i + 1),
    );
    step(state, idle, DT);
    expect(state.player.level).toBe(2);
    expect(state.phase).toBe("levelup");
    expect(state.events).toContainEqual({ type: "levelUp", level: 2 });
  });
});

describe("level-up heal", () => {
  it("a level-up restores full health", () => {
    const state = startGame();
    clearStage(state);
    state.player.hp = 5;
    state.player.xp = state.player.xpToNext - 1;
    state.items = [dropArrow(state, 1)];
    step(state, idle, DT);
    expect(state.player.level).toBe(2);
    expect(state.player.hp).toBe(state.player.maxHp);
  });
});

describe("the screen nuke", () => {
  it("is banked on pickup and wipes nearby minions on use", () => {
    const state = startGame();
    clearStage(state);
    const boss = state.enemies[0]!;
    state.items = [
      {
        id: 1,
        kind: "ability",
        pos: { ...state.player.pos },
        defId: "screen_nuke",
      },
    ];
    step(state, idle, DT);
    expect(state.player.heldAbilities).toContain("screen_nuke");

    const radius = ABILITY_DEFS.screen_nuke!.nuke!.radius;
    const near = makeEnemy({
      id: 9001,
      pos: { x: state.player.pos.x + 100, y: state.player.pos.y },
    });
    const far = makeEnemy({
      id: 9002,
      pos: { x: state.player.pos.x + radius + 60, y: state.player.pos.y },
    });
    // Park the boss inside the blast to prove his immunity.
    boss.pos = { x: state.player.pos.x + 80, y: state.player.pos.y };
    boss.home = { ...boss.pos };
    state.enemies.push(near, far);

    const xpBefore = state.stats.xpGained;
    step(state, useItem, DT);
    expect(state.player.heldAbilities).toHaveLength(0);
    expect(state.enemies).toContain(boss); // bosses shrug it off
    expect(state.enemies).toContain(far); // out of the blast
    expect(state.enemies).not.toContain(near);
    expect(state.events).toContainEqual(
      expect.objectContaining({ type: "nuke" }),
    );
    // The kill pays out like any other: XP flowed.
    expect(state.stats.xpGained).toBeGreaterThan(xpBefore);
  });
});

describe("the item magnet", () => {
  it("pulls only items inside its radius", () => {
    const state = startGame();
    clearStage(state); // the parked boss keeps the objective open
    grantAbility(state, "item_magnet");
    const def = ABILITY_DEFS.item_magnet!;
    const caught: Item = {
      id: 1,
      kind: "medkit",
      pos: {
        x: state.player.pos.x + def.magnet!.radius - 10,
        y: state.player.pos.y,
      },
    };
    const free: Item = {
      id: 2,
      kind: "medkit",
      pos: {
        x: state.player.pos.x + def.magnet!.radius + 40,
        y: state.player.pos.y,
      },
    };
    state.items = [caught, free];
    const caughtStart = caught.pos.x;
    const freeStart = free.pos.x;
    step(state, idle, DT);
    expect(caught.pos.x).toBeLessThan(caughtStart);
    expect(free.pos.x).toBe(freeStart);
  });

  it("INTELLIGENCE widens the pull radius", () => {
    const state = startGame();
    const def = ABILITY_DEFS.item_magnet!;
    const base = magnetRadius(state, def);
    state.player.stats.intelligence = 5;
    expect(magnetRadius(state, def)).toBe(base + 5 * def.magnet!.radiusPerInt);
  });
});
