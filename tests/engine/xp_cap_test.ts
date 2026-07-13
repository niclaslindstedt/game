// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Per-map XP caps (config XP_CAP, `xpLevelCap`/`xpCapMultiplier` in
// leveling.ts): every (level × difficulty) pair has a hero-level ceiling —
// XP diminishes across the approach and, past the cap, drops to a never-zero
// floor trickle, so re-running an outgrown map farms loot and only creeps XP.
// The fixture catalog ships two story levels, so the rung's first/last band
// lands whole on them.

import {
  advanceDialogue,
  CAP_THOUGHT_IDS,
  DIALOGUE,
  grantXp,
  LEVELING,
  levelPosition,
  step,
  XP_CAP,
  xpCapMultiplier,
  xpLevelCap,
  xpToLevelUp,
  type GameState,
} from "@game/core";
import { describe, expect, it } from "vitest";

import {
  clearStage,
  DT,
  equipBlaster,
  idle,
  makeEnemy,
  startGame,
} from "./helpers.ts";

describe("xpLevelCap — the per-map ceiling", () => {
  it("lands the rung's first/last band on the story order", () => {
    // Fixtures ship two story indexes: test_level (first) and test_level_2
    // (last), so the band's endpoints land on them exactly.
    expect(levelPosition("test_level")).toEqual({ position: 0, total: 2 });
    expect(levelPosition("test_level_2")).toEqual({ position: 1, total: 2 });
    const band = XP_CAP.capByDifficulty.medium!;
    expect(xpLevelCap("test_level", "medium")).toBe(band.first);
    expect(xpLevelCap("test_level_2", "medium")).toBe(band.last);
  });

  it("the three bottom lanes share a cap; progression tiers cap higher", () => {
    // easy/medium/hard are PARALLEL entry points over the same level band, so
    // they share one cap band — the difference between them is help, not pace.
    expect(xpLevelCap("test_level", "easy")).toBe(
      xpLevelCap("test_level", "medium"),
    );
    expect(xpLevelCap("test_level", "medium")).toBe(
      xpLevelCap("test_level", "hard"),
    );
    // The gated tiers pick up above the bottom band.
    expect(xpLevelCap("test_level", "hard")).toBeLessThan(
      xpLevelCap("test_level", "nightmare"),
    );
    expect(xpLevelCap("test_level", "nightmare")).toBeLessThan(
      xpLevelCap("test_level", "jesus"),
    );
  });

  it("never exceeds the global level cap, and unknown rungs are uncapped", () => {
    expect(xpLevelCap("test_level_2", "jesus")).toBeLessThanOrEqual(
      LEVELING.maxLevel,
    );
    // A difficulty outside the shipped ladder (a fixture rung) is uncapped —
    // only the global maxLevel holds.
    expect(xpLevelCap("test_level", "custom_rung")).toBe(LEVELING.maxLevel);
  });
});

describe("xpCapMultiplier — the taper into the trickle", () => {
  it("pays full XP until the fade band, halves per level, then holds at the floor", () => {
    const cap = 20;
    const fadeFrom = cap - XP_CAP.fadeLevels;
    expect(xpCapMultiplier(1, cap)).toBe(1);
    expect(xpCapMultiplier(fadeFrom, cap)).toBe(1);
    expect(xpCapMultiplier(fadeFrom + 1, cap)).toBeCloseTo(0.5);
    expect(xpCapMultiplier(fadeFrom + 2, cap)).toBeCloseTo(0.25);
    // At the cap the halving still pays 0.5^fadeLevels — diminished, not zero.
    expect(xpCapMultiplier(cap, cap)).toBeCloseTo(
      Math.pow(0.5, XP_CAP.fadeLevels),
    );
  });

  it("never zeroes — deep past the cap it bottoms out at the floor trickle", () => {
    const cap = 20;
    // Far past the cap the halving would underflow the floor, so the floor
    // holds: the grind still creeps forward, it never slams shut.
    expect(xpCapMultiplier(cap + 10, cap)).toBe(XP_CAP.floor);
    expect(xpCapMultiplier(cap + 50, cap)).toBe(XP_CAP.floor);
    expect(xpCapMultiplier(cap + 50, cap)).toBeGreaterThan(0);
  });
});

describe("grantXp obeys the per-map cap", () => {
  it("a hero AT the map's cap gains a diminished trickle — never nothing", () => {
    const state = startGame(); // test_level on medium → cap = band.first
    clearStage(state);
    const cap = xpLevelCap("test_level", "medium");
    state.player.level = cap;
    state.player.xpToNext = xpToLevelUp(cap);
    grantXp(state, 100_000);
    const expected = Math.round(100_000 * xpCapMultiplier(cap, cap));
    expect(expected).toBeGreaterThan(0);
    expect(state.stats.xpGained).toBe(expected);
  });

  it("a hero well past the cap still trickles the floor share — never zero", () => {
    const state = startGame();
    clearStage(state);
    const cap = xpLevelCap("test_level", "medium");
    state.player.level = cap + 20; // deep in the trickle
    state.player.xpToNext = xpToLevelUp(state.player.level);
    grantXp(state, 100_000);
    expect(state.stats.xpGained).toBe(Math.round(100_000 * XP_CAP.floor));
    expect(state.stats.xpGained).toBeGreaterThan(0);
  });

  it("a hero inside the fade band gains a diminished grant", () => {
    const state = startGame();
    clearStage(state);
    const cap = xpLevelCap("test_level", "medium");
    const level = cap - 1; // deepest fade rung above zero
    state.player.level = level;
    state.player.xpToNext = xpToLevelUp(level);
    grantXp(state, 1000);
    expect(state.player.xp).toBe(
      Math.round(1000 * xpCapMultiplier(level, cap)),
    );
  });

  it("a hero well under the cap gains full XP", () => {
    const state = startGame();
    clearStage(state);
    grantXp(state, 50); // level 1 (cap is 12): far below the fade band
    expect(state.player.xp).toBe(50);
  });
});

/** Tap an open thought closed page by page (a helper, not an inline loop, so
 * the caller's `state.dialogue` narrowing survives the tap-through). */
function tapThrough(state: GameState): void {
  while (state.dialogue) advanceDialogue(state);
}

/** Auto-fire a fresh dying mob into the blaster and step until it dies or a
 * thought opens. Returns once the run leaves `playing` or the mob is gone. */
function killOne(state: GameState): void {
  const mob = makeEnemy(
    {
      pos: { x: state.player.pos.x + 80, y: state.player.pos.y },
      hp: 1,
      maxHp: 10,
      speed: 0,
    },
    "test_minion",
  );
  state.enemies.push(mob);
  for (let i = 0; i < 400; i++) {
    step(state, idle, DT);
    if (
      state.phase !== "playing" ||
      !state.enemies.some((e) => e.id === mob.id)
    )
      return;
  }
}

describe("maybeCapThought — the recurring cap-farm mutter", () => {
  it("fires once the hero has capped the map, and never banks to thoughtsSeen", () => {
    const state = startGame(); // test_level on medium → cap 12
    clearStage(state);
    equipBlaster(state); // down mobs at range
    state.player.level = xpLevelCap("test_level", "medium");
    state.player.xpToNext = 1_000_000; // keep an incidental level-up out of the way
    state.capThoughtMs = 0;

    killOne(state);
    expect(state.phase).toBe("dialogue");
    expect(state.dialogue?.source.kind).toBe("playerThought");
    const first = (state.dialogue!.source as { defId: string }).defId;
    expect(CAP_THOUGHT_IDS).toContain(first);
    // It must NOT be recorded as seen — that ledger is what makes the pinned
    // beats one-shot; the mutter has to be free to replay.
    expect(state.thoughtsSeen).not.toContain(first);
    // Firing re-armed the cooldown.
    expect(state.capThoughtMs).toBe(DIALOGUE.capThoughtCooldownMs);
  });

  it("stays silent while the hero is still under the cap", () => {
    const state = startGame();
    clearStage(state);
    equipBlaster(state);
    state.player.level = xpLevelCap("test_level", "medium") - 1; // one short
    state.player.xpToNext = 1_000_000; // keep an incidental level-up out of the way
    state.capThoughtMs = 0;

    killOne(state);
    expect(state.dialogue).toBeNull();
    expect(state.phase).toBe("playing");
  });

  it("holds for the cooldown, then rotates to the next variation", () => {
    const state = startGame();
    clearStage(state);
    equipBlaster(state);
    state.player.level = xpLevelCap("test_level", "medium");
    state.player.xpToNext = 1_000_000; // keep an incidental level-up out of the way
    state.capThoughtMs = 0;

    killOne(state);
    const first = (state.dialogue!.source as { defId: string }).defId;
    tapThrough(state); // tap it closed

    // Still on cooldown: the next kill mutters nothing.
    killOne(state);
    expect(state.dialogue).toBeNull();

    // Burn the cooldown down, then the next kill speaks the NEXT variation.
    state.capThoughtMs = 0;
    killOne(state);
    expect(state.dialogue?.source.kind).toBe("playerThought");
    const second = (state.dialogue!.source as { defId: string }).defId;
    expect(CAP_THOUGHT_IDS).toContain(second);
    expect(second).not.toBe(first); // round-robin advanced
  });
});
