// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE HERO'S XP BAR as the character sheet reads it
// (pwa/src/game/hero-xp-bar.ts), staged against a real run so the test is a
// statement about the ENGINE's convention rather than about the helper's own
// arithmetic:
//
//  - `Player.xp` is progress INTO the level and `Player.xpToNext` is the whole
//    cost of it — so a hero who has banked nothing shows an empty bar, and one
//    a hair short of a ding shows a nearly full one. Reading `xpToNext` as the
//    REMAINDER (what its name suggests) pins the bar at 0 on every hero at
//    every level, which is exactly the bug this file exists to keep out;
//  - a ding rewinds the bar rather than leaving it full, and the new level's
//    cost is what the sheet then prints.

import { describe, expect, it } from "vitest";

import { grantXp, xpToLevelUp } from "@game/core";

import { heroXpBar } from "../pwa/src/game/hero-xp-bar.ts";
import { startGame } from "./helpers.ts";

describe("the character sheet's XP bar", () => {
  it("is empty on a hero who has banked nothing", () => {
    const state = startGame();
    const hero = state.players[0];
    hero.xp = 0;

    const bar = heroXpBar(hero);
    expect(bar.into).toBe(0);
    expect(bar.toNext).toBe(hero.xpToNext);
    expect(bar.frac).toBe(0);
  });

  it("fills with the XP banked into the current level", () => {
    const state = startGame();
    const hero = state.players[0];
    hero.xp = 0;
    const cost = hero.xpToNext;

    grantXp(state, hero, Math.floor(cost / 4));

    // `grantXp` scales the award by the map's XP cap before banking it, so the
    // bar is pinned to what the hero actually holds rather than to what was
    // handed over — a partly-filled bar, never an empty or a full one.
    expect(hero.level).toBe(1);
    const bar = heroXpBar(hero);
    expect(bar.into).toBe(hero.xp);
    expect(bar.toNext).toBe(cost);
    expect(bar.frac).toBeGreaterThan(0);
    expect(bar.frac).toBeLessThan(1);
  });

  it("shows a hero one XP short of a ding as nearly full", () => {
    const state = startGame();
    const hero = state.players[0];
    hero.xp = hero.xpToNext - 1;

    expect(heroXpBar(hero).frac).toBeGreaterThan(0.99);
  });

  it("rewinds onto the next level's cost when the hero dings", () => {
    const state = startGame();
    const hero = state.players[0];
    const from = hero.level;
    hero.xp = 0;

    grantXp(state, hero, hero.xpToNext);

    expect(hero.level).toBe(from + 1);
    const bar = heroXpBar(hero);
    expect(bar.toNext).toBe(xpToLevelUp(hero.level, state.difficulty));
    expect(bar.frac).toBeLessThan(0.5);
  });
});
