// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The wandering merchant and his coin economy: spawn placement, wandering on
// his own rng stream, the discovery latch (rooted + mapped + greeted), the
// mob-repelling ward, the sell valuation (ilvl × tier × material), the shop
// phase, the buy/sell mutators, and the purse's loadout carry-over.

import { describe, expect, it } from "vitest";

import {
  ABILITY_DEFAULT_RARITY,
  abilityRarity,
  advanceDialogue,
  applyLoadout,
  buyStock,
  canBuyStock,
  closeShop,
  CONSUMABLES,
  createGame,
  dialogueContent,
  dismissIntro,
  ECONOMY,
  equipmentMaxDurability,
  extractLoadout,
  HELD_ITEMS,
  medkitTierIndex,
  MERCHANT,
  openShop,
  repairAllCost,
  repairCost,
  repairGear,
  sellItem,
  sellValue,
  skipCutscene,
  type Equipment,
  type GameState,
  type MerchantStock,
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

import { distance as dist } from "@game/lib/vec.ts";

/** Park the hero in the corner farthest from the merchant, so a wandering
 * test can never accidentally turn into a meeting. */
function parkFarAway(state: GameState): void {
  const m = state.merchant.pos;
  state.players[0].pos = {
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
  state.players[0].pos = {
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
    expect(sellValue(piece("test_charm", "regular", 3, "trinket"))).toBe(
      base * ECONOMY.preciousMult,
    );
  });
});

describe("the shop", () => {
  it("only opens mid-run, discovered, and at the counter", () => {
    const state = startGame();
    expect(openShop(state)).toBe(false); // not discovered yet
    meet(state);
    state.players[0].pos = {
      x: state.merchant.pos.x + MERCHANT.tradeRadius * 3,
      y: state.merchant.pos.y,
    };
    expect(openShop(state)).toBe(false); // too far from the stall
    state.players[0].pos = { ...state.merchant.pos };
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
    state.players[0].pos = { ...state.merchant.pos };
    const loot = piece("test_wand", "magic", 4);
    state.players[0].inventory[0] = loot;
    openShop(state);
    const paid = sellItem(state, 0);
    expect(paid).toBe(sellValue(loot));
    expect(state.players[0].coins).toBe(paid);
    expect(state.players[0].inventory[0]).toBeNull();
    expect(sellItem(state, 0)).toBeNull(); // empty cell: no-op
  });

  it("stocks powerups and weapons priced off the economy", () => {
    const state = startGame();
    meet(state);
    const abilities = state.merchant.stock.filter((s) => s.kind === "ability");
    // `kind: "weapon"` is the stall's EQUIPMENT row, not necessarily an arm —
    // a stocked unique may be armor, and the SMELLING SALTS shelf is a trinket
    // — so the rolled-weapon assertions below filter on the piece's own slot.
    const weapons = state.merchant.stock.filter(
      (s) => s.kind === "weapon" && s.equipment.slot === "weapon",
    );
    expect(abilities.length).toBeGreaterThan(0);
    expect(weapons).toHaveLength(MERCHANT.stockWeapons);
    for (const entry of abilities) {
      if (entry.kind !== "ability") continue;
      // The base price, marked up by how rare the power is — the fixture pool's
      // powers carry no authored `rarity`, so each sits at exactly 1×.
      expect(abilityRarity(entry.defId)).toBe(ABILITY_DEFAULT_RARITY);
      expect(entry.price).toBe(
        ECONOMY.abilityBase + ECONOMY.abilityPerLevel * state.players[0].level,
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
    state.players[0].pos = { ...state.merchant.pos };
    openShop(state);
    const entry = state.merchant.stock.find((s) => s.kind === "ability")!;
    expect(buyStock(state, entry.id)).toBe(false); // too poor
    state.players[0].coins = entry.price * 10;
    expect(canBuyStock(state, state.players[0], entry)).toBe(true);
    expect(buyStock(state, entry.id)).toBe(true);
    expect(state.players[0].heldAbilities).toContain(
      entry.kind === "ability" ? entry.defId : "",
    );
    expect(state.players[0].coins).toBe(entry.price * 9);
    // WHAT HE SELLS IS WHAT HE SELLS: the powerup slot held one unit, so the
    // entry is spent and a second purchase is refused however deep the purse
    // and however much room the dock still has.
    expect(entry.qty).toBe(0);
    expect(state.players[0].heldAbilities.length).toBeLessThan(HELD_ITEMS.cap);
    expect(canBuyStock(state, state.players[0], entry)).toBe(false);
    expect(buyStock(state, entry.id)).toBe(false);
    expect(state.players[0].coins).toBe(entry.price * 9); // no coins moved
  });

  it("stocks the three consumables and banks each into its own dock stack", () => {
    const state = startGame();
    meet(state);
    state.players[0].pos = { ...state.merchant.pos };
    openShop(state);
    const shelf = state.merchant.stock.filter((s) => s.kind === "consumable");
    expect(shelf.map((s) => (s.kind === "consumable" ? s.item : null))).toEqual(
      ["medkit", "repair", "drink"],
    );
    // Hurt and winded, so the medkit and the drink have something to do — a
    // bank refuses nothing here, but the SPEND side of the dock would.
    state.players[0].hp = 1;
    state.players[0].stamina = 0;
    state.players[0].coins = 100_000;
    for (const entry of shelf) {
      if (entry.kind !== "consumable") continue;
      const depth = entry.qty;
      expect(depth).toBeGreaterThan(0);
      // Never deeper than the dock's own stack — a shelf that outran the cap
      // would sell units the bank then refuses.
      expect(depth).toBeLessThanOrEqual(CONSUMABLES.stackCap);
      for (let i = 0; i < depth; i++) {
        expect(buyStock(state, entry.id)).toBe(true);
      }
      expect(entry.qty).toBe(0);
      expect(buyStock(state, entry.id)).toBe(false); // sold out, not restocked
      const banked =
        entry.item === "medkit"
          ? (state.players[0].medkits[medkitTierIndex(entry.tier)] ?? 0)
          : entry.item === "repair"
            ? state.players[0].repairKits
            : state.players[0].staminaPotions;
      expect(banked).toBe(depth);
    }
  });

  it("refuses a consumable whose dock stack is already full", () => {
    const state = startGame();
    meet(state);
    state.players[0].pos = { ...state.merchant.pos };
    openShop(state);
    const entry = state.merchant.stock.find(
      (s) => s.kind === "consumable" && s.item === "drink",
    )!;
    state.players[0].coins = 100_000;
    state.players[0].staminaPotions = CONSUMABLES.stackCap;
    expect(canBuyStock(state, state.players[0], entry)).toBe(false);
    expect(buyStock(state, entry.id)).toBe(false);
    // Refused with nothing spent: neither the purse nor the shelf moved.
    expect(state.players[0].coins).toBe(100_000);
    expect(entry.qty).toBeGreaterThan(0);
  });

  it("won't sell a uniqueHeld powerup while one is already docked", () => {
    const state = startGame();
    meet(state);
    state.players[0].pos = { ...state.merchant.pos };
    openShop(state);
    // A hand-stocked bomb on the stall (no level pools a nuke, so the entry
    // is planted): the first sale docks it, the second is refused while it
    // sits there — same gate as the ground pickup (canBankAbility). Stocked two
    // deep so it is the DOCK refusing the second sale, not a spent shelf.
    state.merchant.stock.push({
      id: 990,
      kind: "ability",
      defId: "test_nuke",
      price: 5,
      qty: 2,
    });
    const entry = state.merchant.stock.find((s) => s.id === 990)!;
    state.players[0].coins = 100;
    expect(canBuyStock(state, state.players[0], entry)).toBe(true);
    expect(buyStock(state, 990)).toBe(true);
    expect(canBuyStock(state, state.players[0], entry)).toBe(false);
    expect(buyStock(state, 990)).toBe(false); // refused, coins untouched
    expect(state.players[0].coins).toBe(95);
    expect(
      state.players[0].heldAbilities.filter((d) => d === "test_nuke"),
    ).toHaveLength(1);
  });

  it("a stall weapon is a one-off that lands in the bag", () => {
    const state = startGame();
    meet(state);
    state.players[0].pos = { ...state.merchant.pos };
    openShop(state);
    const entry = state.merchant.stock.find(
      (s) => s.kind === "weapon" && s.equipment.slot === "weapon",
    ) as Extract<MerchantStock, { kind: "weapon" }>;
    state.players[0].coins = entry.price * 2;
    expect(buyStock(state, entry.id)).toBe(true);
    // The piece that lands is the row's own roll, handed over as a FRESH
    // instance: a row may hold several units (the salts shelf), so the same
    // object must never end up in two bag cells sharing an id.
    const bought = state.players[0].inventory.find(
      (i) => i?.defId === entry.equipment.defId,
    );
    expect(bought).toBeDefined();
    expect(bought!.id).not.toBe(entry.equipment.id);
    expect(state.players[0].coins).toBe(entry.price);
    // Sold out: the entry refuses a second purchase.
    expect(buyStock(state, entry.id)).toBe(false);
    expect(canBuyStock(state, state.players[0], entry)).toBe(false);
  });
});

describe("the purse", () => {
  it("carries over through the loadout, defaulting old saves to empty", () => {
    const state = startGame();
    state.players[0].coins = 321;
    const loadout = extractLoadout(state, state.players[0]);
    expect(loadout.coins).toBe(321);
    const next = startGame(43);
    applyLoadout(next, next.players[0], loadout);
    expect(next.players[0].coins).toBe(321);
    // A loadout banked before the economy shipped has no purse field.
    delete loadout.coins;
    const legacy = startGame(44);
    applyLoadout(legacy, legacy.players[0], loadout);
    expect(legacy.players[0].coins).toBe(0);
  });
});

describe("repair", () => {
  /** A breakable weapon instance worn down to almost nothing. */
  const worn = (tier: Tier = "regular"): Equipment => ({
    ...piece("test_pipe", tier, 5),
    id: 7,
    durability: 1,
  });

  it("costs nothing for a whole or unbreakable piece, more for rarer gear", () => {
    const max = equipmentMaxDurability(worn());
    expect(repairCost({ ...worn(), durability: max })).toBe(0); // already whole
    expect(repairCost(piece("test_pipe", "regular", 5))).toBe(0); // unbreakable
    // A worn piece costs coins — and a rarer one costs MORE to keep whole.
    expect(repairCost(worn("regular"))).toBeGreaterThan(0);
    expect(repairCost(worn("rare"))).toBeGreaterThan(
      repairCost(worn("regular")),
    );
  });

  it("mends the whole kit at the counter, charging the quote and chiming", () => {
    const state = startGame();
    meet(state);
    state.players[0].pos = { ...state.merchant.pos };
    state.players[0].inventory[0] = worn();
    state.players[0].coins = 100_000;
    openShop(state);
    const quote = repairAllCost(state, state.players[0]);
    expect(quote).toBeGreaterThan(0);
    const before = state.players[0].coins;
    const paid = repairGear(state);
    expect(paid).toBe(quote);
    expect(state.players[0].coins).toBe(before - quote);
    expect(state.players[0].inventory[0]?.durability).toBe(
      equipmentMaxDurability(worn()),
    );
    expect(state.events).toContainEqual(
      expect.objectContaining({ type: "gearRepaired", paid: quote }),
    );
    // Nothing left to mend — a second repair is a no-op.
    expect(repairGear(state)).toBeNull();
  });

  it("refuses with the shop shut or the purse short — kit untouched", () => {
    const state = startGame();
    meet(state);
    state.players[0].pos = { ...state.merchant.pos };
    state.players[0].inventory[0] = worn();
    // Shop shut.
    expect(repairGear(state)).toBeNull();
    // Open, but broke.
    state.players[0].coins = 0;
    openShop(state);
    expect(repairAllCost(state, state.players[0])).toBeGreaterThan(0);
    expect(repairGear(state)).toBeNull();
    expect(state.players[0].inventory[0]?.durability).toBe(1); // untouched
  });
});

describe("return visit — met here before", () => {
  /** Build a run where the hero has ALREADY met this level's merchant. */
  const revisit = (difficulty: "easy" | "jesus" = "easy"): GameState =>
    createGame(
      42,
      "test_merchant_level",
      difficulty,
      undefined,
      false,
      [],
      true,
    );

  it("sets the trader up at the door: revealed, stocked, ungreeted, near spawn", () => {
    const state = revisit();
    expect(state.merchant.discovered).toBe(true);
    expect(state.merchant.stock.length).toBeGreaterThan(0);
    expect(state.merchant.greetedReturn).toBe(false);
    expect(state.mapMarkers).toContainEqual(
      expect.objectContaining({ kind: "merchant" }),
    );
    // Reachable at once — not flung to the far minSpawnDistance.
    expect(dist(state.merchant.pos, state.playerSpawn)).toBeLessThan(
      MERCHANT.minSpawnDistance,
    );
  });

  /** Dismiss any opening and walk the hero up to the revealed merchant. */
  const walkUp = (state: GameState): void => {
    skipCutscene(state);
    dismissIntro(state);
    clearStage(state);
    state.obstacles = [];
    state.players[0].pos = {
      x: state.merchant.pos.x + MERCHANT.tradeRadius / 2,
      y: state.merchant.pos.y,
    };
    run(state, idle, 1);
  };

  it("gives the welcome-back line on approach: warmth + difficulty send-off", () => {
    const state = revisit("easy");
    walkUp(state);
    expect(state.phase).toBe("dialogue");
    const content = dialogueContent(state.dialogue!);
    // One page — the per-level welcome plus the difficulty's send-off line.
    expect(content.pages).toHaveLength(1);
    expect(content.pages[0]).toContain("TEST WELCOME BACK.");
    expect(content.pages[0]).toHaveLength(2);
    expect(state.merchant.greetedReturn).toBe(true);
    // Delivered once — no second scene on the next approach.
    advanceDialogue(state);
    run(state, idle, 1);
    expect(state.phase).not.toBe("dialogue");
  });

  it("varies the send-off by difficulty", () => {
    const easy = revisit("easy");
    walkUp(easy);
    const jesus = revisit("jesus");
    walkUp(jesus);
    expect(dialogueContent(easy.dialogue!).pages[0]).not.toEqual(
      dialogueContent(jesus.dialogue!).pages[0],
    );
  });
});
