// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// COMPANIONS and the SPARE-or-KILL verdict (companions.ts): a spareable
// unique kneels at 0 hp instead of dying and the run pauses in the `choice`
// phase; KILL lands the withheld blow through the normal kill rails, SPARE
// recruits the figure — it thanks the hero (joinWords through the dialogue
// box), follows him, fights with its own weapon, wears helmet + chest (never
// legs/feet), radiates its aura (+magic find), floats kill-quote banter,
// goes DOWN instead of dying, and rides the loadout to the next level.

import { describe, expect, it } from "vitest";

import {
  advanceDialogue,
  allocateStat,
  closeCompanionPanel,
  COMPANIONS,
  createGame,
  dialogueContent,
  equipCompanionFromInventory,
  extractLoadout,
  magicFindBonus,
  openCompanionPanel,
  recruitCompanion,
  resolveChoice,
  rollEquipment,
  step,
  unequipCompanionToInventory,
} from "@game/core";
import type { Equipment, GameEvent, GameState } from "@game/core";
import {
  clearStage,
  DT,
  equipBlaster,
  idle,
  makeEnemy,
  run,
  startGame,
} from "./helpers.ts";

/** The staged unique, if it is still on the board. (clearStage keeps the
 * far-parked objective boss, so counts are asserted per-def, not in total.) */
function spareable(state: GameState) {
  return state.enemies.find((e) => e.defId === "test_spareable");
}

/** A run holding the kneelable unique in blaster reach (plus the parked,
 * far-away objective boss clearStage always leaves). */
function stageSpareable(state: GameState, hp = 10): void {
  clearStage(state);
  state.enemies.push(
    makeEnemy(
      {
        id: state.nextId++,
        pos: { x: state.player.pos.x + 80, y: state.player.pos.y },
        hp,
        maxHp: 150,
        // Latch the power-match so the staged hp stays exactly as written,
        // and skip the arrival scene (the fixture has none anyway).
        powerScaled: true,
        spoke: true,
      },
      "test_spareable",
    ),
  );
  equipBlaster(state);
  // Pin the stream to the always-lands value so the staged blaster bolts
  // neither miss nor crit and no probabilistic drop muddies the assertions.
  state.rng = () => 0.99;
}

/** Step until the verdict is on the table, collecting every event seen. */
function runUntilChoice(state: GameState): GameEvent[] {
  const seen: GameEvent[] = [];
  for (let i = 0; i < 500 && state.phase !== "choice"; i++) {
    step(state, idle, DT);
    seen.push(...state.events);
  }
  return seen;
}

/** A plain instance of a fixture gear/weapon def, straight into the bag. */
function bagItem(
  state: GameState,
  defId: string,
  slot: Equipment["slot"],
): number {
  const index = state.player.inventory.indexOf(null);
  state.player.inventory[index] = {
    id: state.nextId++,
    defId,
    slot,
    tier: "regular",
    ilvl: 1,
    affixes: [],
  };
  return index;
}

describe("the SPARE-or-KILL verdict", () => {
  it("kneels at 0 hp: choice phase, spareOffered, no kill booked", () => {
    const state = startGame();
    stageSpareable(state);
    const events = runUntilChoice(state);

    expect(state.phase).toBe("choice");
    expect(state.choice?.defId).toBe("test_spareable");
    expect(events.some((e) => e.type === "spareOffered")).toBe(true);
    // Kneeling, not dead: still on the board at 1 hp, nothing booked.
    expect(spareable(state)?.hp).toBe(1);
    expect(state.stats.kills).toBe(0);
    expect(events.some((e) => e.type === "enemyKilled")).toBe(false);
  });

  it("KILL lands the withheld blow: loot, last words, the kill booked", () => {
    const state = startGame();
    stageSpareable(state);
    runUntilChoice(state);

    expect(resolveChoice(state, false)).toBe(true);
    expect(spareable(state)).toBeUndefined();
    expect(state.stats.kills).toBe(1);
    expect(state.events.some((e) => e.type === "enemyKilled")).toBe(true);
    // The pinned drops fall like any elite kill — gear and plot alike.
    expect(
      state.items.some(
        (i) => i.kind === "equipment" && i.equipment.defId === "test_hammer",
      ),
    ).toBe(true);
    expect(
      state.items.some((i) => i.kind === "story" && i.defId === "test_key"),
    ).toBe(true);
    // Nobody joined, and the death scene takes the stage.
    expect(state.companions).toHaveLength(0);
    expect(state.dialogue?.source.kind).toBe("enemyDeath");
  });

  it("SPARE recruits: thanks played, story items handed over, gear kept", () => {
    const state = startGame();
    stageSpareable(state);
    runUntilChoice(state);

    expect(resolveChoice(state, true)).toBe(true);
    expect(spareable(state)).toBeUndefined();
    expect(state.stats.kills).toBe(0);
    expect(state.companions).toHaveLength(1);
    expect(state.companions[0]!.defId).toBe("test_companion");
    // Its signature weapon is in its hands, not on the floor: no equipment
    // drops — only the plot piece is handed over.
    expect(state.items.some((i) => i.kind === "equipment")).toBe(false);
    expect(
      state.items.some((i) => i.kind === "story" && i.defId === "test_key"),
    ).toBe(true);
    // The fight still pays: XP flowed either way.
    expect(state.stats.xpGained).toBeGreaterThan(0);
    // The joining scene is on stage — the thanks, in the figure's own words.
    expect(state.phase).toBe("dialogue");
    expect(state.dialogue?.source.kind).toBe("companionJoin");
    expect(dialogueContent(state.dialogue!).speaker).toBe("TEST COMPANION");
    expect(dialogueContent(state.dialogue!).pages).toEqual([
      ["TEST JOIN LINE."],
    ]);
    expect(state.events.some((e) => e.type === "companionJoined")).toBe(true);
  });

  it("a twin of an already-spared figure just dies — no second offer", () => {
    const state = startGame();
    stageSpareable(state);
    runUntilChoice(state);
    resolveChoice(state, true);
    advanceDialogue(state);
    while (state.player.pendingStatPoints > 0) allocateStat(state, "strength");

    // A second copy of the same spareable def walks in and is beaten.
    stageSpareable(state);
    state.companions[0]!.pos = { x: 30, y: 30 }; // park the party clear
    const events: GameEvent[] = [];
    for (let i = 0; i < 500 && spareable(state); i++) {
      step(state, idle, DT);
      events.push(...state.events);
    }
    expect(events.some((e) => e.type === "spareOffered")).toBe(false);
    expect(events.some((e) => e.type === "enemyKilled")).toBe(true);
    expect(state.companions).toHaveLength(1);
  });
});

describe("companions in the field", () => {
  /** A run with the fixture companion recruited and the stage cleared. */
  function withCompanion(state: GameState) {
    clearStage(state);
    const companion = recruitCompanion(state, "test_companion", {
      x: state.player.pos.x + 60,
      y: state.player.pos.y,
    });
    state.events = [];
    return companion;
  }

  it("regroups on the hero when there is nothing to fight", () => {
    const state = startGame();
    clearStage(state);
    const companion = recruitCompanion(state, "test_companion", {
      x: state.player.pos.x + 200,
      y: state.player.pos.y + 100,
    });
    run(state, idle, 200);
    const gap = Math.hypot(
      companion.pos.x - state.player.pos.x,
      companion.pos.y - state.player.pos.y,
    );
    expect(gap).toBeLessThan(80);
  });

  it("fights on its own: kills a nearby mob and may float its quote", () => {
    const state = startGame();
    const companion = withCompanion(state);
    // In wrench reach of the companion, out of the hero's sword reach.
    state.enemies.push(
      makeEnemy(
        {
          id: state.nextId++,
          pos: { x: companion.pos.x + 20, y: companion.pos.y },
          hp: 5,
          maxHp: 5,
        },
        "test_minion",
      ),
    );
    // Pin the stream low: the quote roll (< quoteChance) always passes.
    state.rng = () => 0.1;
    const events: GameEvent[] = [];
    const minion = () => state.enemies.find((e) => e.defId === "test_minion");
    for (let i = 0; i < 60 && minion(); i++) {
      step(state, idle, DT);
      events.push(...state.events);
    }
    expect(minion()).toBeUndefined();
    expect(events.some((e) => e.type === "enemyKilled")).toBe(true);
    const quote = events.find((e) => e.type === "companionQuote");
    expect(quote).toBeDefined();
    expect(quote && quote.type === "companionQuote" && quote.text).toBe(
      "TEST QUOTE.",
    );
    // The banter throttles: the cooldown is armed after one quote.
    expect(companion.quoteCooldownMs).toBeGreaterThan(0);
  });

  it("goes DOWN at 0 hp — aura silent — and stands back up on its own", () => {
    const state = startGame();
    const companion = withCompanion(state);
    expect(magicFindBonus(state)).toBeCloseTo(0.5);

    companion.hp = 1;
    state.enemies.push(
      makeEnemy(
        {
          id: state.nextId++,
          pos: { x: companion.pos.x + 10, y: companion.pos.y },
        },
        "test_brute",
      ),
    );
    const events: GameEvent[] = [];
    for (let i = 0; i < 40 && companion.downedMs === undefined; i++) {
      step(state, idle, DT);
      events.push(...state.events);
    }
    expect(events.some((e) => e.type === "companionDowned")).toBe(true);
    expect(state.companions).toHaveLength(1); // down, never dead
    expect(magicFindBonus(state)).toBe(0); // the aura kneels with him

    // Left in peace, the count runs out and he stands back up at half.
    state.enemies = state.enemies.filter((e) => e.id !== 9000);
    clearStage(state);
    const ticks = Math.ceil(COMPANIONS.reviveMs / DT) + 5;
    const revived: GameEvent[] = [];
    for (let i = 0; i < ticks; i++) {
      step(state, idle, DT);
      revived.push(...state.events);
    }
    expect(revived.some((e) => e.type === "companionRevived")).toBe(true);
    expect(companion.downedMs).toBeUndefined();
    expect(companion.hp).toBe(
      Math.round(companion.maxHp * COMPANIONS.reviveHpFraction),
    );
    expect(magicFindBonus(state)).toBeCloseTo(0.5);
  });

  it("magic find widens the tier roll: the same draw pays magic, not plain", () => {
    const state = startGame();
    clearStage(state);
    // At the magic gate (loot level 5, mlvl 3 on medium) only magic can roll.
    // 0.20 sits between the base magic chance (0.16) and the Magic-Find-widened
    // one (0.16 × 1.5 = 0.24): plain without LUCKY's kin, magic with it.
    state.rng = () => 0.2;
    const before = rollEquipment(state, { defId: "test_wrench", mlvl: 3 });
    expect(before.tier).toBe("regular");
    recruitCompanion(state, "test_companion", { x: 30, y: 30 });
    const after = rollEquipment(state, { defId: "test_wrench", mlvl: 3 });
    expect(after.tier).toBe("magic");
  });
});

describe("companion equipment", () => {
  it("dresses in weapon/helmet/chest only — legs and feet are refused", () => {
    const state = startGame();
    clearStage(state);
    const companion = recruitCompanion(state, "test_companion", {
      x: 30,
      y: 30,
    });

    const helmet = bagItem(state, "test_helmet", "head");
    expect(equipCompanionFromInventory(state, companion.id, helmet)).toBe(true);
    expect(companion.equipment.head?.defId).toBe("test_helmet");
    expect(state.player.inventory[helmet]).toBeNull();

    const greaves = bagItem(state, "test_greaves", "legs");
    expect(equipCompanionFromInventory(state, companion.id, greaves)).toBe(
      false,
    );
    expect(state.player.inventory[greaves]?.defId).toBe("test_greaves");

    // A weapon swaps: the signature wrench comes back to the bag cell.
    const pistol = bagItem(state, "test_pistol", "weapon");
    expect(equipCompanionFromInventory(state, companion.id, pistol)).toBe(true);
    expect(companion.equipment.weapon.defId).toBe("test_pistol");
    expect(state.player.inventory[pistol]?.defId).toBe("test_wrench");

    // Armor unequips back to the bag; the weapon slot never empties.
    expect(unequipCompanionToInventory(state, companion.id, "head")).toBe(true);
    expect(companion.equipment.head).toBeNull();
    expect(unequipCompanionToInventory(state, companion.id, "weapon")).toBe(
      false,
    );
  });

  it("pauses into the companion screen and resumes out of it", () => {
    const state = startGame();
    clearStage(state);
    const companion = recruitCompanion(state, "test_companion", {
      x: 30,
      y: 30,
    });
    openCompanionPanel(state, companion.id);
    expect(state.phase).toBe("companion");
    expect(state.companionFocus).toBe(companion.id);
    // Frozen like the bag: a step advances nothing.
    const before = state.stats.timeMs;
    step(state, idle, DT);
    expect(state.stats.timeMs).toBe(before);
    closeCompanionPanel(state);
    expect(state.phase).toBe("playing");
    expect(state.companionFocus).toBeNull();
  });
});

describe("the party rides the loadout", () => {
  it("extract → apply carries the companion and its kit, rested", () => {
    const state = startGame();
    clearStage(state);
    const companion = recruitCompanion(state, "test_companion", {
      x: 30,
      y: 30,
    });
    const helmet = bagItem(state, "test_helmet", "head");
    equipCompanionFromInventory(state, companion.id, helmet);
    companion.hp = 3; // beaten up — the next level greets him rested

    const loadout = extractLoadout(state);
    const next = createGame(SEED_NEXT, "test_level_2", "medium", loadout);
    expect(next.companions).toHaveLength(1);
    const carried = next.companions[0]!;
    expect(carried.defId).toBe("test_companion");
    expect(carried.hp).toBe(carried.maxHp);
    expect(carried.equipment.weapon.defId).toBe("test_wrench");
    expect(carried.equipment.head?.defId).toBe("test_helmet");
  });

  it("a loadout from before companions shipped loads an empty party", () => {
    const state = startGame();
    const loadout = extractLoadout(state);
    delete (loadout as { companions?: unknown }).companions;
    const next = createGame(SEED_NEXT, "test_level_2", "medium", loadout);
    expect(next.companions).toHaveLength(0);
  });
});

const SEED_NEXT = 1337;
