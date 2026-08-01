// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// PER-PLAYER SCREENS (multiplayer plan §3.2) — the split of `state.phase`
// into the run's own global beats and each hero's `Player.screen`. The rules
// under test are the ones the split exists for: a solo screen still freezes
// the world exactly as the old phase did; a party member's screen freezes
// nobody; a hero with a screen up steers nothing but still stands on the
// field; a departed or downed hero's abandoned screen holds nothing shut (the
// structural fix `releaseStuckLevelup` used to bolt on); and a level-up BANKS
// its points instead of pausing the run.

import { describe, expect, it } from "vitest";

import {
  allocateStat,
  applyRunCommand,
  closeLevelup,
  closeQuestDialogue,
  departHero,
  dismissIntro,
  grantXp,
  openInventory,
  openMap,
  partyBlocked,
  pauseGame,
  promptPendingPoints,
  registerDefs,
  resumeGame,
  seatHero,
  step,
  talkToQuestGiver,
  type GameState,
  type Player,
  type QuestDef,
  type QuestGiverDef,
} from "@game/core";

import { DT, idle, startGame, stopWaves } from "./helpers.ts";

// A minimal giver with one offer, so the one-conversation-at-a-time rule can
// be probed without borrowing quests_test's whole scaffolding.
const SCREEN_GIVERS: Record<string, QuestGiverDef> = {
  test_screen_giver: {
    id: "test_screen_giver",
    level: "test_level",
    name: "TEST SCREEN GIVER",
    sprite: "test_giver",
    at: { x: 400, y: 1320 },
    lore: "A synthetic fixture civilian for the per-player screen rules.",
  },
};

const SCREEN_QUESTS: Record<string, QuestDef> = {
  test_screen_errand: {
    id: "test_screen_errand",
    level: "test_level",
    giver: "test_screen_giver",
    name: "TEST SCREEN ERRAND",
    lore: "A synthetic fixture errand.",
    offer: [["A WORD."]],
    complete: [["DONE."]],
    objectives: [{ kind: "kill", enemy: "test_minion", count: 3 }],
    reward: { coins: 5 },
  },
};

/** Step once and report whether the world's clock moved. */
function worldAdvances(state: GameState): boolean {
  const before = state.stats.timeMs;
  step(state, idle, DT);
  return state.stats.timeMs > before;
}

/** Bank exactly one level's worth of points on `hero` and let the ding
 * celebration burn out, so the chooser is openable but nothing is forced. */
function bankALevel(state: GameState, hero: Player): void {
  grantXp(state, hero, hero.xpToNext);
  // The celebration window ticks down while playing; run it out.
  for (let i = 0; i < 200 && state.levelUpFxMs > 0; i++) step(state, idle, DT);
}

describe("the solo freeze is exactly what it always was", () => {
  it("an open bag halts the world; closing it resumes", () => {
    const state = startGame();
    stopWaves(state);
    expect(worldAdvances(state)).toBe(true);
    openInventory(state, state.players[0]);
    expect(state.players[0].screen).toBe("inventory");
    // The phase never left `playing` — the freeze is the party's, not the
    // run's (`partyBlocked`): every hero in play has a screen up.
    expect(state.phase).toBe("playing");
    expect(partyBlocked(state)).toBe(true);
    expect(worldAdvances(state)).toBe(false);
    applyRunCommand(state, "closeInventory");
    expect(state.players[0].screen).toBeUndefined();
    expect(worldAdvances(state)).toBe(true);
  });

  it("the pause menu is a screen and still pauses a solo run", () => {
    const state = startGame();
    stopWaves(state);
    pauseGame(state, state.players[0]);
    expect(state.players[0].screen).toBe("paused");
    expect(worldAdvances(state)).toBe(false);
    resumeGame(state.players[0]);
    expect(worldAdvances(state)).toBe(true);
  });

  it("one screen at a time: the map refuses while the bag is open", () => {
    const state = startGame();
    openInventory(state, state.players[0]);
    openMap(state, state.players[0]);
    expect(state.players[0].screen).toBe("inventory");
  });
});

describe("a party member's screen freezes nobody", () => {
  it("the world runs while one of two heroes shops their bag", () => {
    const state = startGame();
    stopWaves(state);
    seatHero(state, null);
    openInventory(state, state.players[0]);
    expect(partyBlocked(state)).toBe(false);
    expect(worldAdvances(state)).toBe(true);
  });

  it("the world halts only when EVERY hero in play has a screen up", () => {
    const state = startGame();
    stopWaves(state);
    const b = seatHero(state, null);
    openInventory(state, state.players[0]);
    openInventory(state, b);
    expect(partyBlocked(state)).toBe(true);
    expect(worldAdvances(state)).toBe(false);
  });

  it("a hero with a screen up contributes no steering", () => {
    const state = startGame();
    stopWaves(state);
    const hero = state.players[0];
    seatHero(state, null); // a second seat keeps the world running
    openInventory(state, hero);
    const before = { ...hero.pos };
    const marching = {
      steering: true,
      target: { x: hero.pos.x + 400, y: hero.pos.y },
      jump: false,
      useItem: false,
    };
    for (let i = 0; i < 30; i++) step(state, [marching, idle], DT);
    // The held pointer is aimed at a menu, not the field: he stands.
    expect(hero.pos.x).toBeCloseTo(before.x, 5);
    expect(hero.pos.y).toBeCloseTo(before.y, 5);
  });
});

describe("an abandoned screen holds nothing shut", () => {
  it("a departed hero's open chooser no longer freezes the session", () => {
    const state = startGame();
    stopWaves(state);
    const quitter = seatHero(state, null);
    bankALevel(state, quitter);
    expect(promptPendingPoints(state, quitter)).toBe(true);
    expect(quitter.screen).toBe("levelup");
    const seat = state.players.indexOf(quitter);
    expect(departHero(state, seat)).toBe(true);
    // The screen is still on the body; the world stopped answering for it.
    expect(partyBlocked(state)).toBe(false);
    expect(worldAdvances(state)).toBe(true);
    // The points are kept for a reclaim, not forfeited.
    expect(quitter.pendingStatPoints).toBeGreaterThan(0);
  });

  it("a downed hero's screen is likewise excluded", () => {
    const state = startGame();
    stopWaves(state);
    const downed = seatHero(state, null);
    openInventory(state, downed);
    downed.hp = 0;
    expect(partyBlocked(state)).toBe(false);
    expect(worldAdvances(state)).toBe(true);
  });
});

describe("a level-up banks instead of pausing (plan §3.2, decision 4)", () => {
  it("the ding neither halts the run nor opens the chooser", () => {
    const state = startGame();
    stopWaves(state);
    const hero = state.players[0];
    bankALevel(state, hero);
    expect(hero.pendingStatPoints).toBeGreaterThan(0);
    expect(hero.screen).toBeUndefined();
    expect(state.phase).toBe("playing");
    expect(worldAdvances(state)).toBe(true);
  });

  it("the chooser opens on demand, closes with points banked, and closes itself when everything is spent", () => {
    const state = startGame();
    stopWaves(state);
    const hero = state.players[0];
    bankALevel(state, hero);
    expect(promptPendingPoints(state, hero)).toBe(true);
    expect(hero.screen).toBe("levelup");
    // LATER is allowed: the chooser is non-blocking and the points keep.
    closeLevelup(hero);
    expect(hero.screen).toBeUndefined();
    expect(hero.pendingStatPoints).toBeGreaterThan(0);
    // Reopen and spend it all; the last spend lowers the screen on its own.
    expect(promptPendingPoints(state, hero)).toBe(true);
    while (hero.pendingStatPoints > 0) {
      expect(allocateStat(state, hero, "stamina")).toBe(true);
    }
    expect(hero.screen).toBeUndefined();
  });

  it("promptPendingPoints refuses a hero with nothing owed", () => {
    const state = startGame();
    expect(promptPendingPoints(state, state.players[0])).toBe(false);
    expect(state.players[0].screen).toBeUndefined();
  });

  it("dismissIntro greets an arriving pile of points with the chooser", () => {
    const state = startGame();
    const hero = state.players[0];
    hero.pendingStatPoints += 3;
    // Re-run the door: a fresh intro would do this; simulate the same gate.
    state.phase = "title";
    dismissIntro(state);
    expect(state.phase).toBe("playing");
    expect(hero.screen).toBe("levelup");
  });
});

describe("one conversation at a time, held by its opener", () => {
  it("a second hero is refused while the first holds the offer", () => {
    registerDefs({ quests: SCREEN_QUESTS, questGivers: SCREEN_GIVERS });
    const state = startGame();
    stopWaves(state);
    const a = state.players[0];
    const b = seatHero(state, null);
    const giver = state.questGivers.find((g) => g.id === "test_screen_giver");
    expect(giver).toBeDefined();
    if (!giver) return;
    giver.discovered = true;
    a.pos = { ...giver.pos };
    b.pos = { ...giver.pos };
    expect(talkToQuestGiver(state, a, giver.id)).toBe(true);
    expect(a.screen).toBe("quest");
    // The record is held: the second walker is politely refused.
    expect(talkToQuestGiver(state, b, giver.id)).toBe(false);
    expect(b.screen).toBeUndefined();
    closeQuestDialogue(state, a);
    expect(a.screen).toBeUndefined();
    expect(state.questOffer).toBeNull();
  });
});
