// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The SpaceZ space suit: STORY gear, not equipment. The hero starts in plain
// clothes at HQ, becomes the astronaut the moment he picks the suit up off
// the CHIEF OF SECURITY (a `suitsHero` story item worn OVER his clothes and
// armor — no slot, no stats), and is suited by default on every later level.

import { describe, expect, it } from "vitest";

import {
  collectStoryItem,
  createGame,
  dismissIntro,
  ENEMY_DEFS,
  playerAppearance,
  playerSuited,
  skipCutscene,
  storyItemDef,
} from "@game/core";

import { SEED } from "../helpers.ts";

function spacez() {
  const state = createGame(SEED, "spacez_hq");
  skipCutscene(state);
  dismissIntro(state);
  return state;
}

describe("space suit", () => {
  it("leaves the hero unsuited at SpaceZ HQ until he picks it up", () => {
    const state = spacez();
    expect(playerSuited(state)).toBe(false);
    expect(playerAppearance(state)).toBe("hero"); // plain clothes

    collectStoryItem(state, "space_suit", { ...state.player.pos });
    expect(playerSuited(state)).toBe(true);
    expect(playerAppearance(state)).toBe("player"); // the astronaut
  });

  it("banks as a story item and plays its lore, never entering the bag", () => {
    const state = spacez();
    const bagBefore = state.player.inventory.filter(Boolean).length;
    collectStoryItem(state, "space_suit", { ...state.player.pos });
    expect(state.storyItems).toContain("space_suit");
    expect(state.player.inventory.filter(Boolean).length).toBe(bagBefore);
    expect(storyItemDef("space_suit").suitsHero).toBe(true);
    expect(storyItemDef("space_suit").lore.length).toBeGreaterThan(0);
  });

  it("keeps the hero suited by default on later levels", () => {
    const state = createGame(SEED, "moon");
    skipCutscene(state);
    dismissIntro(state);
    expect(playerSuited(state)).toBe(true);
  });

  it("is the Chief of Security's guaranteed story drop", () => {
    expect(ENEMY_DEFS.security_chief!.loot!.storyItems).toContain("space_suit");
  });
});
