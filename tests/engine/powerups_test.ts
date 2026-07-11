// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The new pickups: golden XP arrows that scale with the level curve (and
// the full heal a level-up brings), the rare screen nuke, and the item
// magnet whose reach grows with INTELLIGENCE.

import { describe, expect, it } from "vitest";

import {
  abilityDef,
  arrowColdXp,
  arrowXpShareAt,
  createGame,
  dismissIntro,
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
  SEED,
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

  it("go COLD once the hero passes the map/difficulty cap", () => {
    // `test_level` caps EASY golden arrows at level 3: a catch-up faucet that
    // pays the level-bar share while the hero is under-levelled, then drops to
    // a flat few mob kills (`arrowColdXp`) once he has out-grown the content.
    const share = (): GameState => {
      const s = createGame(SEED, "test_level", "easy");
      dismissIntro(s);
      clearStage(s);
      s.player.xpToNext = 4000;
      s.player.xp = 0;
      return s;
    };

    // Below the cap (L2): the usual tapered share of the current bar.
    const under = share();
    under.player.level = 2;
    under.items = [dropArrow(under, 1)];
    step(under, idle, DT);
    expect(under.player.xp).toBe(Math.round(4000 * arrowXpShareAt(2)));

    // At the cap (L3) it goes cold: a flat `arrowColdXp`, far under the share
    // it would have paid — grinding old content can't arrow-boost the hero on.
    const capped = share();
    capped.player.level = 3;
    capped.items = [dropArrow(capped, 1)];
    step(capped, idle, DT);
    expect(capped.player.xp).toBe(arrowColdXp(3));
    expect(capped.player.xp).toBeLessThan(Math.round(4000 * arrowXpShareAt(3)));
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
    // Park a boss and an elite inside the blast to prove their immunity — the
    // set-piece fights still have to be fought, nuke or not.
    boss.pos = { x: state.player.pos.x + 80, y: state.player.pos.y };
    boss.home = { ...boss.pos };
    const elite = makeEnemy(
      { id: 9003, pos: { x: state.player.pos.x + 90, y: state.player.pos.y } },
      "test_elite",
    );
    state.enemies.push(near, far, elite);

    const xpBefore = state.stats.xpGained;
    step(state, useItem, DT);
    expect(state.player.heldAbilities).toHaveLength(0);
    expect(state.enemies).toContain(boss); // bosses shrug it off
    expect(state.enemies).toContain(elite); // so do elites
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

describe("a bomb's kills never drop another bomb", () => {
  // EASY is the rung with the highest crowd-bomb mercy cap, so it is where a
  // nuke blast would most readily chain into another bomb without the rule.
  const startOnEasy = (): GameState => {
    const state = createGame(SEED, "test_level", "easy");
    dismissIntro(state);
    return state;
  };

  // A scripted rng: the listed values are consumed in order, then the
  // fallback keeps every later roll (crits, scatter, tier) out of the way.
  const scriptRng = (state: GameState, values: number[], fallback = 0.99) => {
    let i = 0;
    state.rng = () => (i < values.length ? (values[i++] as number) : fallback);
  };

  // Bank a nuke and park one victim just off the player, with a clear floor
  // so the blast's line of sight can't be blocked by seeded level obstacles.
  const armNuke = (state: GameState): void => {
    clearStage(state);
    state.obstacles = [];
    state.player.heldAbilities = ["test_nuke"];
    state.enemies.push(
      makeEnemy({
        id: 9000,
        pos: { x: state.player.pos.x + 50, y: state.player.pos.y },
      }),
    );
  };

  const droppedBomb = (state: GameState): boolean =>
    state.items.some(
      (i) =>
        i.kind === "ability" &&
        (i.defId === "screen_nuke" || i.defId === "test_nuke"),
    );

  it("skips the crowd-bomb mercy roll on a nuke kill", () => {
    const state = startOnEasy();
    armNuke(state);
    // A packed field just OUTSIDE the blast radius but inside the on-screen
    // one (ENEMY_AI.nearRadius): the crowd survives the nuke, so the victim's
    // drop roll happens with the crowd-bomb chance fully ramped — exactly
    // where a bomb would pay out another bomb without the rule.
    const p = state.player.pos;
    for (let i = 0; i < 40; i++) {
      state.enemies.push(
        makeEnemy({
          id: 10_000 + i,
          pos: { x: p.x + 300, y: p.y - 120 + i * 6 },
        }),
      );
    }
    // rolls: [crit no, 0.0] — without the rule the 0.0 would be the crowd-bomb
    // roll (well under easy's ramped 4% chance) and a bomb would fall; with it
    // the mercy slice never draws and the 0.0 lands on the ordinary drop gate.
    scriptRng(state, [0.9, 0.0]);
    step(state, useItem, DT);
    expect(state.enemies.find((e) => e.id === 9000)).toBeUndefined();
    expect(droppedBomb(state)).toBe(false);
  });

  it("skips the rare nuke slice on a nuke kill (the rain still pays out)", () => {
    const state = startOnEasy();
    armNuke(state);
    // Four far minions keep the equipment pity rule quiet (owed <= remaining).
    const p = state.player.pos;
    for (let i = 0; i < 4; i++) {
      state.enemies.push(
        makeEnemy({ id: 9100 + i, pos: { x: p.x + 5000, y: p.y + i * 30 } }),
      );
    }
    // rolls: [crit no, drop gate 0.0, 0.0] — without the rule the trailing 0.0
    // would be the LOOT.nukeShare draw (a bomb); with it the slice never draws
    // and the 0.0 lands on the ladder as a plain equipment drop instead.
    scriptRng(state, [0.9, 0.0, 0.0]);
    step(state, useItem, DT);
    expect(state.enemies.find((e) => e.id === 9000)).toBeUndefined();
    expect(droppedBomb(state)).toBe(false);
    expect(state.items.some((i) => i.kind === "equipment")).toBe(true);
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
