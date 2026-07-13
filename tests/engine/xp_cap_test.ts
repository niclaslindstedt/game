// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Per-map XP caps (config XP_CAP, `xpLevelCap`/`xpCapMultiplier` in
// leveling.ts): every (level × difficulty) pair has a SOFT hero-level cap — XP
// diminishes across the approach, then keeps decaying (reverse-exponential)
// past the cap down to a never-zero ~1/100 floor trickle it bottoms out at a
// couple of levels over the cap, so a hero can crawl a little further on an
// outgrown map but the pace goes glacial — no hard wall, only the global
// maxLevel. The fixture catalog ships two story levels, so the rung's
// first/last band lands whole on them.

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

describe("xpCapMultiplier — the reverse-exponential soft cap", () => {
  it("pays full XP until the fade band, then decays each level toward the cap", () => {
    const cap = 20;
    const fadeFrom = cap - XP_CAP.fadeLevels;
    expect(xpCapMultiplier(1, cap)).toBe(1);
    expect(xpCapMultiplier(fadeFrom, cap)).toBe(1);
    expect(xpCapMultiplier(fadeFrom + 1, cap)).toBeCloseTo(XP_CAP.softCapDecay);
    expect(xpCapMultiplier(fadeFrom + 2, cap)).toBeCloseTo(
      Math.pow(XP_CAP.softCapDecay, 2),
    );
    // At the cap the fade has reached softCapDecay^fadeLevels — diminished,
    // not zero: the climb over the cap can still (slowly) happen.
    expect(xpCapMultiplier(cap, cap)).toBeCloseTo(
      Math.pow(XP_CAP.softCapDecay, XP_CAP.fadeLevels),
    );
  });

  it("slows to the ~1/100 floor about two levels past the cap", () => {
    const cap = 20;
    // Each level over the cap banks a smaller fraction than the one below it —
    // the grind gets slower and slower, never faster...
    for (let l = cap - XP_CAP.fadeLevels; l < cap + 2; l++) {
      expect(xpCapMultiplier(l + 1, cap)).toBeLessThanOrEqual(
        xpCapMultiplier(l, cap),
      );
    }
    // ...until a couple of levels past the cap it has reached the glacial floor.
    expect(xpCapMultiplier(cap + 2, cap)).toBeLessThan(0.02);
    expect(xpCapMultiplier(cap + 2, cap)).toBeGreaterThan(0);
  });

  it("never zeroes — deep past the cap it holds the floor trickle", () => {
    const cap = 20;
    // Far past the cap the decay would underflow the floor, so the floor holds:
    // the grind still creeps forward at ~1/100, it never slams shut.
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

  it("crawls but never walls — enough XP still eventually dings past the cap", () => {
    const state = startGame();
    clearStage(state);
    const cap = xpLevelCap("test_level", "medium");
    state.player.level = cap + 5; // well past the cap, on the floor trickle
    state.player.xpToNext = xpToLevelUp(state.player.level);
    // A firehose of XP: at the ~1/100 floor it lands slowly, but it DOES land —
    // the hero still climbs, there is no hard stop short of the global max.
    const before = state.player.level;
    for (let i = 0; i < 200; i++) grantXp(state, 1_000_000);
    expect(state.player.level).toBeGreaterThan(before);
    expect(state.player.level).toBeLessThan(LEVELING.maxLevel);
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
