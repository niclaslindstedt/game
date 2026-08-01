// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// GROUPED GOLD FLOATS (pwa/src/game/game-screen/gold-float.ts): money arrives in
// piles — a boss sheds six at once and a cleared floor leaves a trail — so what
// matters here is that piles taken within a breath of each other ADD UP into one
// "+N" float and one feed line, that a quiet moment closes the group so the next
// handful starts its own, and that a hero who never stops collecting is still
// told what he is earning.

import { describe, expect, it } from "vitest";

import type { GameState } from "@game/core";

import {
  collectGoldPickup,
  flushGoldPickups,
  GOLD_GROUP_GAP_MS,
  GOLD_GROUP_MAX_MS,
} from "../pwa/src/game/game-screen/gold-float.ts";
import { createLoopShared } from "../pwa/src/game/game-screen/loop-shared.ts";

import { startGame } from "./helpers.ts";

/** A run and its per-run scratch, plus the feed lines the flush writes. */
function stage() {
  const state = startGame();
  const shared = createLoopShared();
  const feed: string[] = [];
  const push = (text: string) => void feed.push(text);
  return {
    state,
    shared,
    feed,
    /** Bank a pile at `atMs` on the sim clock. */
    take(coins: number, atMs: number) {
      state.stats.timeMs = atMs;
      collectGoldPickup(shared, state, coins, push);
    },
    /** Run the per-step flush at `atMs` on the sim clock. */
    tick(atMs: number) {
      state.stats.timeMs = atMs;
      flushGoldPickups(shared, state, push);
    },
    /** Every "+N" float pushed so far, in order. */
    floats(): string[] {
      return shared.effects
        .filter((e) => e.kind === "text" && e.text?.startsWith("+"))
        .map((e) => e.text ?? "");
    },
  };
}

describe("grouped gold pickups", () => {
  it("adds up a boss's fountain into one float and one feed line", () => {
    const s = stage();
    // Six piles on the same tick — `dropGold` splits a boss's purse six ways.
    for (let i = 0; i < 6; i++) s.take(50, 1000);
    // Still collecting: nothing has floated yet.
    expect(s.floats()).toEqual([]);
    s.tick(1000 + GOLD_GROUP_GAP_MS);
    expect(s.floats()).toEqual(["+300"]);
    expect(s.feed).toEqual(["300 GOLD"]);
  });

  it("keeps one group alive across a trail the hero walks up", () => {
    const s = stage();
    // A pile every half-gap: each one refreshes the quiet the group waits for.
    for (let i = 0; i < 5; i++) s.take(20, 1000 + i * (GOLD_GROUP_GAP_MS / 2));
    const lastMs = 1000 + 4 * (GOLD_GROUP_GAP_MS / 2);
    s.tick(lastMs + GOLD_GROUP_GAP_MS - 1);
    expect(s.floats()).toEqual([]);
    s.tick(lastMs + GOLD_GROUP_GAP_MS);
    expect(s.floats()).toEqual(["+100"]);
  });

  it("starts a fresh group once the money stops arriving", () => {
    const s = stage();
    s.take(40, 1000);
    // A pile past the gap is a different handful: it floats the first group on
    // the way in rather than merging into a total that has gone stale.
    s.take(10, 1000 + GOLD_GROUP_GAP_MS);
    expect(s.floats()).toEqual(["+40"]);
    s.tick(1000 + 2 * GOLD_GROUP_GAP_MS);
    expect(s.floats()).toEqual(["+40", "+10"]);
    expect(s.feed).toEqual(["40 GOLD", "10 GOLD"]);
  });

  it("floats anyway when a sweep never lets the group go quiet", () => {
    const s = stage();
    for (let ms = 0; ms <= GOLD_GROUP_MAX_MS; ms += 50) s.take(10, 1000 + ms);
    s.tick(1000 + GOLD_GROUP_MAX_MS);
    expect(s.floats()).toHaveLength(1);
    expect(s.floats()[0]).toMatch(/^\+\d/);
  });

  it("sizes the float off the GROUP's total, not one pile", () => {
    const s = stage();
    // Ten piles of 150 — no single pile is loud, the handful is.
    for (let i = 0; i < 10; i++) s.take(150, 1000);
    s.tick(1000 + GOLD_GROUP_GAP_MS);
    const float = s.shared.effects.find((e) => e.kind === "text");
    expect(float?.text).toBe("+1,500");
    expect(float?.scale).toBe(2);
  });

  it("floats the group over the hero, where the money was banked", () => {
    const s = stage();
    const hero = (s.state as GameState).players[0]!;
    s.take(25, 1000);
    s.tick(1000 + GOLD_GROUP_GAP_MS);
    const float = s.shared.effects.find((e) => e.kind === "text");
    expect(float?.pos.x).toBe(hero.pos.x);
    expect(float?.pos.y).toBeLessThan(hero.pos.y);
  });

  it("closes a group whose clock restarted under it (the next level)", () => {
    const s = stage();
    s.take(75, 5000);
    // A fresh level restarts the sim clock at zero; the group must still land
    // rather than sit forever waiting for a quiet that can never be measured.
    s.tick(0);
    expect(s.floats()).toEqual(["+75"]);
  });

  it("ignores an empty purse", () => {
    const s = stage();
    s.take(0, 1000);
    s.tick(1000 + GOLD_GROUP_GAP_MS);
    expect(s.floats()).toEqual([]);
    expect(s.feed).toEqual([]);
  });
});
