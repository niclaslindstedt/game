// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// IDENTIFICATION — the D2 veil on magic-or-better finds (items/identify.ts):
// what mints unidentified, what a veiled piece may not do (be worn, show its
// name), the merchant's counter service, the ITEM LOOKUP TICKET spent from
// the bag (with its stack merge rules), and the stall's ticket shelf.

import { describe, expect, it } from "vitest";

import {
  addToInventory,
  applyRunCommand,
  canEquip,
  ECONOMY,
  equipmentName,
  hasStackRoom,
  identifyCost,
  identifyItem,
  isSpecialItem,
  isUnidentified,
  lookupTicketIndex,
  markIdentified,
  MERCHANT,
  mintsUnidentified,
  mintUnique,
  openShop,
  rollEquipment,
  sellValue,
  spendLookupTicket,
  stackCapOf,
  type Equipment,
  type GameState,
  type Tier,
} from "@game/core";
import { clearStage, idle, run, startGame } from "./helpers.ts";

/** A rolled drop at a forced tier, straight off the fixture level's pool. */
function roll(state: GameState, tier: Tier): Equipment {
  return rollEquipment(state, state.players[0], { tier, mlvl: 99 });
}

/** A hand-minted ticket instance (the fixture's stack cap is 3). */
function ticket(state: GameState, qty = 1): Equipment {
  return {
    id: state.nextId++,
    defId: "test_ticket",
    slot: "trinket",
    tier: "regular",
    ilvl: 1,
    affixes: [],
    ...(qty > 1 ? { qty } : {}),
  };
}

/** Walk the hero to the merchant, meet him, and open the shop. */
function shopAt(state: GameState): void {
  clearStage(state);
  state.obstacles = [];
  state.players[0].pos = { ...state.merchant.pos };
  run(state, idle, 1);
  expect(openShop(state, state.players[0])).toBe(true);
}

describe("minting", () => {
  it("magic and above drop unidentified; regular does not", () => {
    expect(mintsUnidentified("regular")).toBe(false);
    expect(mintsUnidentified("trash")).toBe(false);
    for (const tier of ["magic", "rare", "unique", "legendary"] as const) {
      expect(mintsUnidentified(tier)).toBe(true);
    }
    const state = startGame();
    expect(isUnidentified(roll(state, "magic"))).toBe(true);
    expect(isUnidentified(roll(state, "rare"))).toBe(true);
    expect(isUnidentified(roll(state, "regular"))).toBe(false);
    expect(isUnidentified(mintUnique(state, "test_relic"))).toBe(true);
  });

  it("a veiled piece names only its base and cannot be worn", () => {
    const state = startGame();
    const hero = state.players[0];
    hero.level = 99;
    const find = roll(state, "rare");
    expect(equipmentName(find).startsWith("UNIDENTIFIED ")).toBe(true);
    expect(canEquip(state, hero, find)).toBe(false);
    // A named unique's fixed name IS the reveal — veiled, it shows the base.
    const relic = mintUnique(state, "test_relic");
    expect(equipmentName(relic)).toBe("UNIDENTIFIED TEST CHARM");
    markIdentified(relic);
    expect(equipmentName(relic)).toBe("TEST RELIC");
    // Identified, the equip gates take back over.
    markIdentified(find);
    expect(canEquip(state, hero, find)).toBe(true);
  });
});

describe("the merchant's counter service", () => {
  it("identifies a bag piece for coins, once, with the shop open", () => {
    const state = startGame();
    const hero = state.players[0];
    const find = roll(state, "magic");
    hero.inventory[0] = find;
    const cost = identifyCost(find);
    expect(cost).toBe(
      Math.round(
        ECONOMY.identifyPrice.base + ECONOMY.identifyPrice.perIlvl * find.ilvl,
      ),
    );
    hero.coins = cost + 5;
    // Closed shop: refused, nothing spent.
    expect(identifyItem(state, hero, 0)).toBeNull();
    expect(isUnidentified(find)).toBe(true);
    shopAt(state);
    expect(identifyItem(state, hero, 0)).toBe(cost);
    expect(hero.coins).toBe(5);
    expect(isUnidentified(find)).toBe(false);
    expect(state.events).toContainEqual(
      expect.objectContaining({ type: "itemIdentified", itemId: find.id }),
    );
    // Already identified: a second appraisal is refused.
    expect(identifyItem(state, hero, 0)).toBeNull();
  });

  it("refuses a purse too short for the fee", () => {
    const state = startGame();
    const hero = state.players[0];
    const find = roll(state, "magic");
    hero.inventory[0] = find;
    hero.coins = identifyCost(find) - 1;
    shopAt(state);
    expect(identifyItem(state, hero, 0)).toBeNull();
    expect(isUnidentified(find)).toBe(true);
    expect(hero.coins).toBe(identifyCost(find) - 1);
  });

  it("stocks a shelf of lookup tickets, and stall finds sell identified", () => {
    const state = startGame();
    shopAt(state);
    const shelf = state.merchant.stock.find(
      (s) => s.kind === "weapon" && s.equipment.defId === "test_ticket",
    );
    expect(shelf).toBeDefined();
    expect(shelf?.qty).toBe(MERCHANT.stockLookupTickets);
    // The trader knows his own stock: nothing on the stall is veiled.
    for (const entry of state.merchant.stock) {
      if (entry.kind === "weapon") {
        expect(isUnidentified(entry.equipment)).toBe(false);
      }
    }
  });

  it("bought tickets merge into the bag's stack", () => {
    const state = startGame();
    const hero = state.players[0];
    shopAt(state);
    const shelf = state.merchant.stock.find(
      (s) => s.kind === "weapon" && s.equipment.defId === "test_ticket",
    );
    expect(shelf).toBeDefined();
    hero.coins = 100000;
    expect(applyRunCommand(state, "buyStock", [shelf?.id ?? -1])).toBe(true);
    expect(applyRunCommand(state, "buyStock", [shelf?.id ?? -1])).toBe(true);
    const cells = hero.inventory.filter((c) => c?.defId === "test_ticket");
    expect(cells.length).toBe(1);
    expect(cells[0]?.qty).toBe(2);
  });
});

describe("the lookup ticket", () => {
  it("stacks to its cap and overflows to a new cell", () => {
    const state = startGame();
    const hero = state.players[0];
    expect(stackCapOf(ticket(state))).toBe(3);
    for (let i = 0; i < 4; i++) {
      expect(addToInventory(state, hero, ticket(state))).toBe(true);
    }
    const cells = hero.inventory.filter((c) => c?.defId === "test_ticket");
    expect(cells.map((c) => c?.qty ?? 1)).toEqual([3, 1]);
    // A full bag still takes a ticket while a stack has room.
    hero.inventory = hero.inventory.map((c) => c ?? ticket(state));
    expect(hasStackRoom(hero, ticket(state))).toBe(true);
  });

  it("a stack sells whole, and the sweep never scraps the shelf", () => {
    const state = startGame();
    const one = ticket(state);
    const stack = ticket(state, 3);
    expect(sellValue(stack)).toBe(sellValue(one) * 3);
    expect(isSpecialItem(one)).toBe(true);
  });

  it("spends one unit to identify a bag find, freeing the cell at zero", () => {
    const state = startGame();
    const hero = state.players[0];
    hero.inventory[0] = ticket(state, 2);
    const find = roll(state, "rare");
    hero.inventory[1] = find;
    expect(lookupTicketIndex(hero)).toBe(0);
    expect(spendLookupTicket(state, hero, 0, 1)).toBe(true);
    expect(isUnidentified(find)).toBe(false);
    expect(hero.inventory[0]?.qty).toBe(1);
    expect(state.events).toContainEqual(
      expect.objectContaining({ type: "itemIdentified", itemId: find.id }),
    );
    // The second (and last) unit frees the cell.
    const second = roll(state, "magic");
    hero.inventory[2] = second;
    expect(spendLookupTicket(state, hero, 0, 2)).toBe(true);
    expect(hero.inventory[0]).toBeNull();
    expect(lookupTicketIndex(hero)).toBe(-1);
  });

  it("refuses a mistap: wrong ticket cell, identified target, self-target", () => {
    const state = startGame();
    const hero = state.players[0];
    hero.inventory[0] = ticket(state);
    hero.inventory[1] = roll(state, "regular");
    // A plain (already-known) target consumes nothing.
    expect(spendLookupTicket(state, hero, 0, 1)).toBe(false);
    expect(hero.inventory[0]?.defId).toBe("test_ticket");
    // A non-ticket "ticket" cell is refused.
    const find = roll(state, "magic");
    hero.inventory[2] = find;
    expect(spendLookupTicket(state, hero, 1, 2)).toBe(false);
    expect(isUnidentified(find)).toBe(true);
    // The ticket cannot identify itself.
    expect(spendLookupTicket(state, hero, 0, 0)).toBe(false);
  });

  it("travels the command channel", () => {
    const state = startGame();
    const hero = state.players[0];
    hero.inventory[0] = ticket(state);
    const find = roll(state, "magic");
    hero.inventory[1] = find;
    expect(applyRunCommand(state, "spendLookupTicket", [0, 1])).toBe(true);
    expect(isUnidentified(find)).toBe(false);
  });
});
