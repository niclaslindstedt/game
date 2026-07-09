// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The level map: fog-of-war exploration (revealAround from the hero's steps,
// spawn pre-revealed, the rest fogged), the `map` pause phase (frozen sim,
// openMap/closeMap toggles, level-up priority), and the map markers pinned by
// story finds, unique/legendary loot, and elite/boss victories.

import { describe, expect, it } from "vitest";

import {
  closeMap,
  isExplored,
  MAP,
  openMap,
  pauseGame,
  rollEquipment,
} from "@game/core";
import { hitEnemy } from "../../src/game/loot.ts";
import { clearStage, idle, makeEnemy, run, startGame } from "./helpers.ts";

describe("fog of war", () => {
  it("starts with the spawn surroundings revealed and the far field fogged", () => {
    const state = startGame();
    expect(isExplored(state, state.player.pos)).toBe(true);
    // Just inside the reveal radius: lit.
    expect(
      isExplored(state, {
        x: state.player.pos.x + MAP.revealRadius - MAP.cellSize,
        y: state.player.pos.y,
      }),
    ).toBe(true);
    // The boss's far corner: still under fog.
    expect(isExplored(state, { x: 2130, y: 260 })).toBe(false);
  });

  it("walking lifts the fog along the way, and it stays lifted", () => {
    const state = startGame();
    clearStage(state);
    const there = { x: state.player.pos.x + 600, y: state.player.pos.y };
    expect(isExplored(state, there)).toBe(false);
    // Teleport-and-step: the reveal reads the hero's live position each tick.
    state.player.pos = { ...there };
    run(state, idle, 1);
    expect(isExplored(state, there)).toBe(true);
    // Walk away again — explored ground never re-fogs.
    state.player.pos = { x: there.x - 600, y: there.y };
    run(state, idle, 1);
    expect(isExplored(state, there)).toBe(true);
  });

  it("out-of-bounds positions read as unexplored instead of wrapping", () => {
    const state = startGame();
    expect(isExplored(state, { x: -10, y: state.player.pos.y })).toBe(false);
    expect(isExplored(state, { x: state.level.width + 10, y: 10 })).toBe(false);
  });
});

describe("map phase", () => {
  it("openMap pauses the run and closeMap resumes it", () => {
    const state = startGame();
    openMap(state);
    expect(state.phase).toBe("map");
    const before = state.stats.timeMs;
    run(state, idle, 20);
    expect(state.stats.timeMs).toBe(before); // frozen like the bag
    closeMap(state);
    expect(state.phase).toBe("playing");
  });

  it("only opens mid-run and closing yields to a pending level-up", () => {
    const state = startGame();
    pauseGame(state);
    openMap(state); // not playing: a no-op
    expect(state.phase).toBe("paused");
    state.phase = "playing";
    openMap(state);
    state.player.pendingStatPoints = 1;
    closeMap(state);
    expect(state.phase).toBe("levelup");
  });
});

describe("map markers", () => {
  it("pins an elite kill where it fell", () => {
    const state = startGame();
    clearStage(state);
    const elite = makeEnemy(
      { pos: { x: 900, y: 900 }, hp: 5, maxHp: 150 },
      "test_elite",
    );
    state.enemies.push(elite);
    hitEnemy(state, elite, 999);
    const marker = state.mapMarkers.find((m) => m.kind === "elite");
    expect(marker).toMatchObject({
      kind: "elite",
      defId: "test_elite",
      pos: { x: 900, y: 900 },
    });
  });

  it("pins the boss (a fleeing unique included) where the fight ended", () => {
    const state = startGame();
    clearStage(state);
    const coward = makeEnemy(
      { pos: { x: 700, y: 700 }, hp: 1, maxHp: 100 },
      "test_coward",
    );
    state.enemies.push(coward);
    hitEnemy(state, coward, 999);
    expect(state.mapMarkers).toContainEqual({
      kind: "boss",
      defId: "test_coward",
      pos: { x: 700, y: 700 },
    });
  });

  it("pins a story item and a unique find where they were picked up", () => {
    const state = startGame();
    clearStage(state);
    const at = { x: state.player.pos.x, y: state.player.pos.y };
    state.items.push(
      { id: state.nextId++, kind: "story", pos: { ...at }, defId: "test_key" },
      {
        id: state.nextId++,
        kind: "equipment",
        pos: { ...at },
        equipment: rollEquipment(state, {
          defId: "test_hammer",
          tier: "unique",
          mlvl: 99,
        }),
      },
    );
    run(state, idle, 1);
    expect(state.mapMarkers.some((m) => m.kind === "story")).toBe(true);
    expect(
      state.mapMarkers.some(
        (m) => m.kind === "loot" && m.defId === "test_hammer",
      ),
    ).toBe(true);
  });

  it("regular-tier pickups and minion kills leave no marker", () => {
    const state = startGame();
    clearStage(state);
    const minion = makeEnemy({ pos: { x: 600, y: 600 }, hp: 1 });
    state.enemies.push(minion);
    hitEnemy(state, minion, 999);
    state.items.push({
      id: state.nextId++,
      kind: "equipment",
      pos: { ...state.player.pos },
      equipment: rollEquipment(state, {
        defId: "test_hammer",
        tier: "regular",
        mlvl: 99,
      }),
    });
    run(state, idle, 1);
    expect(state.mapMarkers).toHaveLength(0);
  });
});
