// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE AUTO PILOT MARK — `Character.autopiloted`, the latch a hero carries for
// good once a bot has held their controls, and the two things it costs them:
// every session, and the trophy shelf.
//
// Four halves are worth pinning here, and every one of them fails SILENTLY in
// the running game — a mark that did not stick, or a ledger that kept counting,
// looks exactly like a mark that was never meant to do anything.
//
//   • THE LATCH IS ONE-WAY AND CHEAP TO ASK ABOUT. The achievement ledger asks
//     on every sim tick, so the answer is memoised against a roster counter;
//     a memo that did not invalidate would keep answering for the hero before
//     last.
//   • THE LEDGER SHUTS THE COUNTERS, NOT ONLY THE BADGES. The lifetime totals
//     are ACCOUNT-wide, so a stained hero whose kills still counted would be a
//     farm: fly one hero, mint a clean one, collect.
//   • THE MARK SURVIVES A ROUND TRIP — an export/import, and a cloud merge the
//     other device wins on `updatedAt`. Both are otherwise a laundry service.
//   • …AND THE DEMO CANNOT STAIN ANYBODY. It flies a throwaway shell nobody's
//     roster holds, and writing the mark onto one must persist nothing.
//
// The merge's own half is next door in `cloud_save_test.ts`, which owns the
// merge rules; this file owns everything else about the mark.

import { beforeEach, describe, expect, it } from "vitest";

import { LEVEL_ORDER, type GameEvent, type GameStats } from "@game/core";

import {
  activeCharacterAutopiloted,
  createCharacter,
  getActiveCharacter,
  loadCharacters,
  markCharacterAutopiloted,
  normalizeCharacter,
  serializeCharacter,
  setActiveCharacterId,
  type Character,
} from "../pwa/src/game/characters.ts";
import {
  getAchievements,
  recordAchievementEvents,
  recordKillRate,
  recordRunStarted,
  recordWornEquipment,
  resetAchievementsForTest,
} from "../pwa/src/game/achievements.ts";

/** One device's `localStorage` — plain Node has none, and characters.ts and
 * the achievement ledger both persist through it. */
let stored = new Map<string, string>();

function asFreshDevice(): void {
  stored = new Map();
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => void stored.set(key, value),
      removeItem: (key: string) => void stored.delete(key),
    },
  };
  // Swapping the map behind the module is not something the app can do, so
  // nothing bumped the roster counter the stain memo rides. Clearing the active
  // hero does bump it, and is also the state a fresh device is in.
  setActiveCharacterId(null);
}

function stats(): GameStats {
  return {
    kills: 0,
    totalEnemies: 0,
    shotsFired: 0,
    jumps: 0,
    damageDealt: 0,
    damageTaken: 0,
    itemsCollected: 0,
    goldCollected: 0,
    coinsSold: 0,
    xpGained: 0,
    xpLost: 0,
    timeMs: 0,
    combatMs: 0,
    peakMenace: 0,
  };
}

const CTX = { levelId: LEVEL_ORDER[0]!, difficulty: "easy", stats: stats() };

const KILL: GameEvent = {
  type: "enemyKilled",
  pos: { x: 0, y: 0 },
  defId: "test_minion",
  damage: 1,
  maxHp: 1,
  hpBefore: 1,
  crit: false,
  xp: 1,
};

/** The hero on the roster, re-read from storage rather than from the copy the
 * caller happens to hold. */
function stored_(id: string): Character | undefined {
  return loadCharacters().find((c) => c.id === id);
}

describe("the mark itself", () => {
  beforeEach(() => {
    asFreshDevice();
    resetAchievementsForTest();
  });

  it("is absent on a hero nobody has handed to a bot", () => {
    const hero = createCharacter("NIC", false);
    expect(hero.autopiloted).toBeUndefined();
    expect(activeCharacterAutopiloted()).toBe(false);
  });

  it("latches on the roster, and the live copy agrees", () => {
    const hero = createCharacter("NIC", false);
    const marked = markCharacterAutopiloted(hero);
    expect(marked.autopiloted).toBe(true);
    expect(stored_(hero.id)?.autopiloted).toBe(true);
  });

  it("is idempotent — the tick loop calls it every frame", () => {
    const hero = createCharacter("NIC", false);
    const once = markCharacterAutopiloted(hero);
    const twice = markCharacterAutopiloted(once);
    // The same object back, rather than a fresh one written through the roster
    // sixty times a second.
    expect(twice).toBe(once);
  });

  it("never clears — a stopped ride is still a ride that happened", () => {
    // There is deliberately no unmark: the hero was flown to wherever they are,
    // and disengaging does not give the levels back. Nothing in the app's
    // surface can turn it off again.
    const hero = markCharacterAutopiloted(createCharacter("NIC", false));
    expect(Object.keys(hero)).toContain("autopiloted");
    const roundTripped = normalizeCharacter(
      JSON.parse(serializeCharacter(hero)),
    );
    expect(roundTripped.autopiloted).toBe(true);
  });

  it("persists nothing for a hero the roster does not hold", () => {
    // The HOW TO PLAY demo's throwaway shell. It gets a marked copy back so its
    // own in-memory hero agrees, and the roster is untouched.
    const shell: Character = {
      id: "demo-shell",
      name: "DEMO",
      hardcore: false,
      createdAt: 0,
      dead: false,
      loadout: null,
      clears: [],
      beaten: [],
      storySeen: [],
      merchantsMet: [],
    };
    const marked = markCharacterAutopiloted(shell);
    expect(marked.autopiloted).toBe(true);
    expect(loadCharacters()).toEqual([]);
  });

  it("comes across an export/import rather than being washed off by one", () => {
    const hero = markCharacterAutopiloted(createCharacter("NIC", false));
    const imported = normalizeCharacter(
      JSON.parse(serializeCharacter(hero)) as unknown,
    );
    expect(imported.autopiloted).toBe(true);
  });

  it("is left off a clean hero's JSON rather than written as false", () => {
    // Same rule as every other optional field here: absent means clean, and a
    // roster stored before this shipped reads correctly without a migration.
    const clean = normalizeCharacter(
      JSON.parse(serializeCharacter(createCharacter("NIC", false))) as unknown,
    );
    expect("autopiloted" in clean).toBe(false);
  });
});

describe("reading the mark cheaply", () => {
  beforeEach(() => {
    asFreshDevice();
    resetAchievementsForTest();
  });

  it("answers for the ACTIVE hero, and follows a change of hero", () => {
    const clean = createCharacter("CLEAN", false);
    const flown = markCharacterAutopiloted(createCharacter("FLOWN", false));
    // `createCharacter` makes the new hero active, so FLOWN is the one on the
    // controls right now.
    expect(getActiveCharacter()?.id).toBe(flown.id);
    expect(activeCharacterAutopiloted()).toBe(true);
    setActiveCharacterId(clean.id);
    expect(activeCharacterAutopiloted()).toBe(false);
  });

  it("notices a hero stained under it, without a change of hero", () => {
    // The memo rides a roster counter rather than a timeout, and this is the
    // case that a cache keyed on the hero's ID alone would answer wrong
    // forever: the paid ride is hired mid-run, so the hero does not change —
    // only what is true about them.
    const hero = createCharacter("NIC", false);
    expect(activeCharacterAutopiloted()).toBe(false);
    markCharacterAutopiloted(hero);
    expect(activeCharacterAutopiloted()).toBe(true);
  });

  it("says no with no hero picked at all", () => {
    expect(activeCharacterAutopiloted()).toBe(false);
  });
});

describe("the trophy shelf, shut", () => {
  beforeEach(() => {
    asFreshDevice();
    resetAchievementsForTest();
  });

  it("books a clean hero's kill, badge and counter alike", () => {
    createCharacter("CLEAN", false);
    const fresh = recordAchievementEvents([KILL], CTX);
    expect(fresh).toContain("kills_1");
    expect(getAchievements().totals.kills).toBe(1);
  });

  it("books NOTHING for a stained hero — not the badge, not the counter", () => {
    // The counter is the half that matters: the totals are ACCOUNT-wide, so a
    // stained hero who still moved them would be a farm for the next hero.
    markCharacterAutopiloted(createCharacter("FLOWN", false));
    expect(recordAchievementEvents([KILL], CTX)).toEqual([]);
    expect(getAchievements().totals.kills).toBe(0);
    expect(getAchievements().unlocked).toEqual({});
  });

  it("shuts every door into the ledger, not only the event one", () => {
    markCharacterAutopiloted(createCharacter("FLOWN", false));
    expect(recordRunStarted(LEVEL_ORDER[0]!)).toEqual([]);
    expect(
      recordWornEquipment([{ slot: "weapon", tier: "regular", defId: "x" }]),
    ).toEqual([]);
    recordKillRate(999, false);
    const { totals, unlocked } = getAchievements();
    expect(totals.totalRuns).toBe(0);
    expect(totals.bestKillRate).toBe(0);
    expect(unlocked).toEqual({});
  });

  it("opens again for a clean hero on the same account", () => {
    // The mark is on the CHARACTER and never on the account — which is what
    // makes "make another hero" an honest thing for the locked menu row to say.
    const clean = createCharacter("CLEAN", false);
    const flown = markCharacterAutopiloted(createCharacter("FLOWN", false));
    expect(recordAchievementEvents([KILL], CTX)).toEqual([]);
    setActiveCharacterId(clean.id);
    expect(recordAchievementEvents([KILL], CTX)).toContain("kills_1");
    expect(flown.autopiloted).toBe(true);
  });

  it("keeps badges a hero earned BEFORE they were flown", () => {
    // The mark stops the ledger; it does not roll it back. What was earned
    // honestly stays earned — the shelf is the account's history, not a score.
    const hero = createCharacter("NIC", false);
    recordAchievementEvents([KILL], CTX);
    expect(getAchievements().unlocked["kills_1"]).toBeDefined();
    markCharacterAutopiloted(hero);
    expect(getAchievements().unlocked["kills_1"]).toBeDefined();
  });
});
