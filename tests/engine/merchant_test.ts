// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The wandering merchant and his coin economy: spawn placement, wandering on
// his own rng stream, the discovery latch (rooted + mapped + greeted), the
// mob-repelling ward, the sell valuation (ilvl × tier × material), the shop
// phase, the buy/sell mutators, and the purse's loadout carry-over.

import { describe, expect, it } from "vitest";

import {
  advanceDialogue,
  applyLoadout,
  buyStock,
  canBuyStock,
  closeShop,
  createGame,
  dialogueContent,
  dismissIntro,
  ECONOMY,
  extractLoadout,
  HELD_ITEMS,
  MERCHANT,
  openShop,
  sellItem,
  sellValue,
  skipCutscene,
  type Equipment,
  type GameState,
  type Tier,
} from "@game/core";
import { clearStage, idle, makeEnemy, run, startGame } from "./helpers.ts";

/** A hand-minted equipment instance for valuation and sell tests. */
function piece(
  defId: string,
  tier: Tier = "regular",
  ilvl = 3,
  slot: Equipment["slot"] = "weapon",
): Equipment {
  return { id: 1, defId, slot, tier, ilvl, affixes: [] };
}

/** Distance between two points. */
function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Park the hero in the corner farthest from the merchant, so a wandering
 * test can never accidentally turn into a meeting. */
function parkFarAway(state: GameState): void {
  const m = state.merchant.pos;
  state.player.pos = {
    x: m.x < state.level.width / 2 ? state.level.width - 20 : 20,
    y: m.y < state.level.height / 2 ? state.level.height - 20 : 20,
  };
}

/**
 * Walk the hero up to the merchant and let one tick run: with a clear stage
 * and open ground the meeting latches `discovered` on that step.
 */
function meet(state: GameState): void {
  clearStage(state);
  state.obstacles = []; // nothing between them — the meeting needs sight
  state.player.pos = {
    x: state.merchant.pos.x + MERCHANT.tradeRadius / 2,
    y: state.merchant.pos.y,
  };
  run(state, idle, 1);
}

describe("spawn and wandering", () => {
  it("every level spawns one undiscovered merchant, away from the hero", () => {
    const state = startGame();
    expect(state.merchant.discovered).toBe(false);
    expect(state.merchant.stock).toEqual([]);
    // He is met out in the level, never handed over at the door.
    expect(dist(state.merchant.pos, state.playerSpawn)).toBeGreaterThan(
      MERCHANT.tradeRadius * 2,
    );
  });

  it("wanders between legs while unmet, staying inside the level", () => {
    const state = startGame();
    clearStage(state);
    // Park the hero far away so the stroll can't turn into a meeting.
    parkFarAway(state);
    const start = { ...state.merchant.pos };
    run(state, idle, 900);
    expect(dist(state.merchant.pos, start)).toBeGreaterThan(10);
    expect(state.merchant.pos.x).toBeGreaterThanOrEqual(0);
    expect(state.merchant.pos.x).toBeLessThanOrEqual(state.level.width);
    expect(state.merchant.pos.y).toBeGreaterThanOrEqual(0);
    expect(state.merchant.pos.y).toBeLessThanOrEqual(state.level.height);
    expect(state.merchant.discovered).toBe(false);
  });

  it("never draws the run's rng stream while wandering", () => {
    const state = startGame();
    clearStage(state);
    parkFarAway(state);
    let draws = 0;
    const inner = state.rng;
    state.rng = () => {
      draws++;
      return inner();
    };
    run(state, idle, 300);
    // A quiet, cleared stage draws nothing — the merchant's wander legs all
    // roll on his own stream, so adding him reshuffles no loot sequence.
    expect(draws).toBe(0);
  });
});

describe("discovery", () => {
  it("latches on the first close encounter: rooted, stocked, mapped", () => {
    const state = startGame();
    meet(state);
    expect(state.merchant.discovered).toBe(true);
    expect(state.merchant.stock.length).toBeGreaterThan(0);
    expect(state.mapMarkers).toContainEqual(
      expect.objectContaining({ kind: "merchant" }),
    );
    expect(state.events).toContainEqual(
      expect.objectContaining({ type: "merchantDiscovered" }),
    );
    // Rooted for good: the stall never wanders off the map pin.
    const post = { ...state.merchant.pos };
    run(state, idle, 300);
    expect(state.merchant.pos).toEqual(post);
  });

  it("plays the level's greeting scene once, through the dialogue box", () => {
    const state = createGame(42, "test_merchant_level");
    skipCutscene(state);
    dismissIntro(state);
    meet(state);
    expect(state.phase).toBe("dialogue");
    expect(state.dialogue).not.toBeNull();
    const content = dialogueContent(state.dialogue!);
    expect(content.speaker).toBe("TEST MERCHANT");
    expect(content.portrait).toBe("merchant_test");
    expect(content.pages).toEqual([
      ["TEST MERCHANT LINE ONE."],
      ["TEST MERCHANT LINE TWO."],
    ]);
    advanceDialogue(state);
    advanceDialogue(state);
    expect(state.phase).toBe("playing");
  });

  it("dresses for the venue: the level def names his sprite", () => {
    const state = createGame(42, "test_merchant_level");
    expect(state.merchant.sprite).toBe("merchant_test");
    expect(startGame().merchant.sprite).toBe("merchant"); // the default look
  });
});

describe("the ward", () => {
  it("pushes a minion out to the repel rim", () => {
    const state = startGame();
    clearStage(state);
    parkFarAway(state);
    state.enemies.push(
      makeEnemy({ pos: { ...state.merchant.pos } }, "test_minion"),
    );
    run(state, idle, 1);
    const shooed = state.enemies.find((e) => e.defId === "test_minion")!;
    expect(dist(shooed.pos, state.merchant.pos)).toBeGreaterThanOrEqual(
      MERCHANT.repelRadius - 0.01,
    );
  });

  it("bosses are too massive to shoo", () => {
    const state = startGame();
    clearStage(state);
    parkFarAway(state);
    const at = { x: state.merchant.pos.x + 4, y: state.merchant.pos.y };
    state.enemies.push(makeEnemy({ pos: { ...at } }, "test_boss"));
    run(state, idle, 1);
    const boss = state.enemies.find(
      (e) => e.defId === "test_boss" && e.pos.x === at.x,
    );
    expect(boss).toBeDefined();
  });
});

describe("sell valuation", () => {
  it("tiers are worth orders of magnitude", () => {
    const regular = sellValue(piece("test_wand", "regular", 3));
    expect(regular).toBe(
      ECONOMY.itemBase + ECONOMY.itemPerIlvl * 3, // no material, ×1 tier
    );
    expect(sellValue(piece("test_wand", "magic", 3))).toBe(regular * 10);
    expect(sellValue(piece("test_wand", "rare", 3))).toBe(regular * 100);
    expect(sellValue(piece("test_wand", "unique", 3))).toBe(regular * 1000);
  });

  it("a deeper find sells higher", () => {
    expect(sellValue(piece("test_wand", "magic", 12))).toBeGreaterThan(
      sellValue(piece("test_wand", "magic", 2)),
    );
  });

  it("metal melts for double, precious fetches four times", () => {
    const base = sellValue(piece("test_wand", "regular", 3));
    expect(sellValue(piece("test_pipe", "regular", 3))).toBe(
      base * ECONOMY.metalMult,
    );
    expect(sellValue(piece("test_charm", "regular", 3, "charm"))).toBe(
      base * ECONOMY.preciousMult,
    );
  });
});

describe("the shop", () => {
  it("only opens mid-run, discovered, and at the counter", () => {
    const state = startGame();
    expect(openShop(state)).toBe(false); // not discovered yet
    meet(state);
    state.player.pos = {
      x: state.merchant.pos.x + MERCHANT.tradeRadius * 3,
      y: state.merchant.pos.y,
    };
    expect(openShop(state)).toBe(false); // too far from the stall
    state.player.pos = { ...state.merchant.pos };
    expect(openShop(state)).toBe(true);
    expect(state.phase).toBe("shop");
    // Frozen like the bag.
    const before = state.stats.timeMs;
    run(state, idle, 20);
    expect(state.stats.timeMs).toBe(before);
    closeShop(state);
    expect(state.phase).toBe("playing");
  });

  it("selling pays the valuation into the purse and empties the cell", () => {
    const state = startGame();
    meet(state);
    state.player.pos = { ...state.merchant.pos };
    const loot = piece("test_wand", "magic", 4);
    state.player.inventory[0] = loot;
    openShop(state);
    const paid = sellItem(state, 0);
    expect(paid).toBe(sellValue(loot));
    expect(state.player.coins).toBe(paid);
    expect(state.player.inventory[0]).toBeNull();
    expect(sellItem(state, 0)).toBeNull(); // empty cell: no-op
  });

  it("stocks powerups and weapons priced off the economy", () => {
    const state = startGame();
    meet(state);
    const abilities = state.merchant.stock.filter((s) => s.kind === "ability");
    const weapons = state.merchant.stock.filter((s) => s.kind === "weapon");
    expect(abilities.length).toBeGreaterThan(0);
    expect(weapons).toHaveLength(MERCHANT.stockWeapons);
    for (const entry of abilities) {
      expect(entry.price).toBe(
        ECONOMY.abilityBase + ECONOMY.abilityPerLevel * state.player.level,
      );
    }
    for (const entry of weapons) {
      if (entry.kind !== "weapon") continue;
      // The Diablo 2 vendor gap: a stall weapon costs its own sell value ×10.
      expect(entry.price).toBe(
        sellValue(entry.equipment) * ECONOMY.weaponBuyMarkup,
      );
    }
  });

  it("buys a powerup into the dock, gated by coins and the carry cap", () => {
    const state = startGame();
    meet(state);
    state.player.pos = { ...state.merchant.pos };
    openShop(state);
    const entry = state.merchant.stock.find((s) => s.kind === "ability")!;
    expect(buyStock(state, entry.id)).toBe(false); // too poor
    state.player.coins = entry.price * 10;
    expect(canBuyStock(state, entry)).toBe(true);
    expect(buyStock(state, entry.id)).toBe(true);
    expect(state.player.heldAbilities).toContain(
      entry.kind === "ability" ? entry.defId : "",
    );
    expect(state.player.coins).toBe(entry.price * 9);
    // Powerups restock: the same entry sells again until the dock is full.
    while (state.player.heldAbilities.length < HELD_ITEMS.cap) {
      expect(buyStock(state, entry.id)).toBe(true);
    }
    expect(buyStock(state, entry.id)).toBe(false); // dock full
  });

  it("a stall weapon is a one-off that lands in the bag", () => {
    const state = startGame();
    meet(state);
    state.player.pos = { ...state.merchant.pos };
    openShop(state);
    const entry = state.merchant.stock.find((s) => s.kind === "weapon")!;
    state.player.coins = entry.price * 2;
    expect(buyStock(state, entry.id)).toBe(true);
    expect(
      state.player.inventory.some(
        (i) => entry.kind === "weapon" && i?.id === entry.equipment.id,
      ),
    ).toBe(true);
    expect(state.player.coins).toBe(entry.price);
    // Sold out: the entry refuses a second purchase.
    expect(buyStock(state, entry.id)).toBe(false);
    expect(canBuyStock(state, entry)).toBe(false);
  });
});

describe("the purse", () => {
  it("carries over through the loadout, defaulting old saves to empty", () => {
    const state = startGame();
    state.player.coins = 321;
    const loadout = extractLoadout(state);
    expect(loadout.coins).toBe(321);
    const next = startGame(43);
    applyLoadout(next, loadout);
    expect(next.player.coins).toBe(321);
    // A loadout banked before the economy shipped has no purse field.
    delete loadout.coins;
    const legacy = startGame(44);
    applyLoadout(legacy, loadout);
    expect(legacy.player.coins).toBe(0);
  });
});
