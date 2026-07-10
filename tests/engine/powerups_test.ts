// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The new pickups: golden XP arrows that scale with the level curve (and
// the full heal a level-up brings), the rare screen nuke, and the item
// magnet whose reach grows with INTELLIGENCE.

import { describe, expect, it } from "vitest";

import {
  abilityDef,
  arrowXpShareAt,
  grantAbility,
  levelStatGains,
  magnetRadius,
  step,
} from "@game/core";
import type { GameInput, GameState, Item } from "@game/core";
import {
  clearStage,
  DT,
  idle,
  makeEnemy,
  runUntilChooser,
  startGame,
} from "./helpers.ts";

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
    // A fresh hero is level 1, where the share is the full base (no taper yet).
    expect(state.player.xp).toBe(
      Math.round(state.player.xpToNext * arrowXpShareAt(state.player.level)),
    );
    expect(state.events).toContainEqual(
      expect.objectContaining({ type: "itemCollected", kind: "xp" }),
    );

    // At a later level the same-sized bar pays LESS of a level: the share
    // tapers with level (arrowXpShareAt), so arrows recede as the run goes on.
    const later = startGame();
    clearStage(later);
    later.player.level = 8;
    later.player.xpToNext = 4000;
    later.items = [dropArrow(later, 1)];
    step(later, idle, DT);
    expect(later.player.xp).toBe(Math.round(4000 * arrowXpShareAt(8)));
    expect(arrowXpShareAt(8)).toBeLessThan(arrowXpShareAt(1));
  });

  it("enough arrows level the player up and open the chooser", () => {
    const state = startGame();
    clearStage(state);
    // How many arrows actually cross the L1 bar — derived from the rounded
    // per-arrow grant, not `1 / share`, so it stays honest when the curve
    // (xpToLevelUp) or the share changes and rounding leaves a sliver.
    const perArrow = Math.max(
      1,
      Math.round(state.player.xpToNext * arrowXpShareAt(state.player.level)),
    );
    const needed = Math.ceil(state.player.xpToNext / perArrow);
    state.items = Array.from({ length: needed }, (_, i) =>
      dropArrow(state, i + 1),
    );
    step(state, idle, DT);
    expect(state.player.level).toBe(2);
    expect(state.events).toContainEqual({
      type: "levelUp",
      level: 2,
      gains: levelStatGains(2),
    });
    // The ding celebrates for a beat first; the chooser opens after the burn.
    expect(state.phase).toBe("playing");
    runUntilChooser(state);
    expect(state.phase).toBe("levelup");
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
        defId: "test_nuke",
      },
    ];
    step(state, idle, DT);
    expect(state.player.heldAbilities).toContain("test_nuke");

    const radius = abilityDef("test_nuke").nuke!.radius;
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

  it("a rock shields the monster behind it from the blast", () => {
    const state = startGame();
    clearStage(state);
    state.player.heldAbilities = ["test_nuke"];

    // A tall rock right beside the player; a mob hides just behind it, well
    // inside the blast, and a second mob stands in the open the same distance
    // out. Same radius, opposite fates — only the sheltered one rides it out.
    const px = state.player.pos.x;
    const py = state.player.pos.y;
    state.obstacles = [
      {
        id: 8100,
        kind: "boulder",
        sprite: "boulder",
        pos: { x: px + 30, y: py },
        radius: 14,
        jumpable: false,
      },
    ];
    const sheltered = makeEnemy({ id: 9101, pos: { x: px + 60, y: py } });
    const exposed = makeEnemy({ id: 9102, pos: { x: px, y: py + 60 } });
    state.enemies.push(sheltered, exposed);

    step(state, useItem, DT);
    expect(state.enemies).toContain(sheltered); // the rock ate the blast
    expect(state.enemies).not.toContain(exposed); // no cover, no mercy
  });
});

describe("the item magnet", () => {
  it("pulls only items inside its radius", () => {
    const state = startGame();
    clearStage(state); // the parked boss keeps the objective open
    grantAbility(state, "test_magnet");
    const def = abilityDef("test_magnet");
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
    const def = abilityDef("test_magnet");
    const base = magnetRadius(state, def);
    state.player.stats.intelligence = 5;
    expect(magnetRadius(state, def)).toBe(base + 5 * def.magnet!.radiusPerInt);
  });
});
