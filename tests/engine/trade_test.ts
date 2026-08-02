// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// TRADE, AND THE ANTI-DUPE RULES — one test each.
//
// A trade is the only place in the game where a piece of gear leaves one
// private bag and arrives in another, and every bug in that shape MINTS ITEMS.
// So the assertions here are mostly conservation laws: count the pieces before
// and after, and check that no id exists twice and none has gone missing. A
// test that only asserted "the sword arrived" would pass just as happily for an
// implementation that left a copy behind.

import { describe, expect, it } from "vitest";

import {
  acceptTrade,
  cancelTrade,
  departHero,
  discardFromInventory,
  equipFromInventory,
  isOfferedInTrade,
  moveInventoryItem,
  offerCoins,
  offerItem,
  openTrade,
  seatHero,
  tradeOf,
  tradePartner,
  type Equipment,
  type GameState,
  type Player,
} from "@game/core";

import { startGame } from "./helpers.ts";

/** A plain piece, minted by hand so the suite never depends on a drop roll. */
function piece(state: GameState, defId = "blaster"): Equipment {
  return {
    id: state.nextId++,
    defId,
    slot: "weapon",
    tier: "regular",
    ilvl: 1,
    affixes: [],
  };
}

/** Two heroes at a table, each holding one item in cell 0. */
function table(): {
  state: GameState;
  a: Player;
  b: Player;
  swordA: Equipment;
  swordB: Equipment;
} {
  const state = startGame(17);
  const a = state.players[0]!;
  const b = seatHero(state, null);
  const swordA = piece(state);
  const swordB = piece(state);
  a.inventory[0] = swordA;
  b.inventory[0] = swordB;
  openTrade(state, a, 1);
  return { state, a, b, swordA, swordB };
}

/** Every item id in either bag, so a conservation law can be stated. */
function allIds(state: GameState): number[] {
  const ids: number[] = [];
  for (const hero of state.players) {
    for (const cell of hero.inventory) if (cell) ids.push(cell.id);
  }
  return ids.sort((x, y) => x - y);
}

describe("opening a table", () => {
  it("puts two seats at one table", () => {
    const { state, a, b } = table();
    expect(tradeOf(state, 0)).not.toBeNull();
    expect(tradePartner(state, a)).toBe(1);
    expect(tradePartner(state, b)).toBe(0);
  });

  it("refuses a hero already trading", () => {
    // A hero in two trades at once is the shape that lets one item be promised
    // twice — which is a dupe with two honest players and no cheating at all.
    const { state, a } = table();
    const c = seatHero(state, null);
    expect(openTrade(state, a, 2)).toBe("busy");
    expect(openTrade(state, c, 0)).toBe("busy");
  });

  it("refuses a seat nobody is behind", () => {
    const { state, a } = table();
    cancelTrade(state, a);
    const c = seatHero(state, null);
    departHero(state, 2);
    expect(openTrade(state, a, 2)).toBe("bad-seat");
    expect(c.departed).toBe(true);
  });

  it("refuses trading with yourself", () => {
    const { state, a } = table();
    cancelTrade(state, a);
    expect(openTrade(state, a, 0)).toBe("bad-seat");
  });

  it("refuses a partner who has a screen up, and never hijacks it", () => {
    const { state, a, b } = table();
    cancelTrade(state, a);
    b.screen = "inventory";
    expect(openTrade(state, a, 1)).toBe("busy");
    expect(b.screen).toBe("inventory");
    expect(a.screen).toBeUndefined();
  });
});

describe("the table is a screen on both seats", () => {
  it("parks both heroes at the table and frees them on cancel", () => {
    const { state, a, b } = table();
    expect(a.screen).toBe("trade");
    expect(b.screen).toBe("trade");
    cancelTrade(state, a);
    expect(a.screen).toBeUndefined();
    expect(b.screen).toBeUndefined();
  });

  it("lowers both screens when the swap settles", () => {
    const { state, a, b } = table();
    offerItem(state, a, 0);
    offerItem(state, b, 0);
    acceptTrade(state, a);
    acceptTrade(state, b);
    expect(state.trades ?? []).toHaveLength(0);
    expect(a.screen).toBeUndefined();
    expect(b.screen).toBeUndefined();
  });

  it("lowers the partner's screen when a seat leaves play", () => {
    const { state, a, b } = table();
    departHero(state, 1);
    expect(a.screen).toBeUndefined();
    expect(b.departed).toBe(true);
  });

  it("leaves a screen the seat has since raised over something else", () => {
    const { state, a, b } = table();
    // The engine never re-raises over "trade", but a lowered table must not
    // stomp a screen that is no longer its own.
    a.screen = "paused";
    cancelTrade(state, b);
    expect(a.screen).toBe("paused");
    expect(b.screen).toBeUndefined();
  });
});

describe("the swap is one transaction or nothing", () => {
  it("moves both pieces when both sides agree, and mints nothing", () => {
    const { state, a, b, swordA, swordB } = table();
    const before = allIds(state);
    offerItem(state, a, 0);
    offerItem(state, b, 0);
    expect(acceptTrade(state, a)).toBeNull();
    expect(acceptTrade(state, b)).toBeNull();
    // The conservation law: the same ids exist afterwards, each exactly once.
    const after = allIds(state);
    expect(after).toEqual(before);
    expect(new Set(after).size).toBe(after.length);
    // …and they are in the other bags.
    expect(b.inventory.some((c) => c?.id === swordA.id)).toBe(true);
    expect(a.inventory.some((c) => c?.id === swordB.id)).toBe(true);
    expect(a.inventory.some((c) => c?.id === swordA.id)).toBe(false);
    // The table is gone once it settles.
    expect(tradeOf(state, 0)).toBeNull();
  });

  it("does nothing at all until BOTH sides agree", () => {
    const { state, a, b, swordA } = table();
    offerItem(state, a, 0);
    offerItem(state, b, 0);
    acceptTrade(state, a);
    expect(a.inventory[0]?.id).toBe(swordA.id);
    expect(b.inventory.some((c) => c?.id === swordA.id)).toBe(false);
    expect(tradeOf(state, 0)).not.toBeNull();
  });

  it("refuses whole when an offered cell no longer holds what was offered", () => {
    // RULE 1. The offer names the cell AND the id. A bag that has been ticked
    // past since — a sale, a mercy drop landing, a sweep — must not settle
    // against whatever happens to be in that cell now, which is how a trade
    // hands over a medkit in place of a sword.
    const { state, a, b, swordB } = table();
    offerItem(state, a, 0);
    offerItem(state, b, 0);
    acceptTrade(state, a);
    // Somebody else's code moved it. (The verbs a PLAYER could use are refused
    // outright — see rule 3 below — so this stands in for everything that
    // touches a bag without going through them.)
    a.inventory[0] = piece(state);
    const before = allIds(state);
    expect(acceptTrade(state, b)).toBe("moved");
    // Nothing moved, nothing was minted, and the table is still standing.
    expect(allIds(state)).toEqual(before);
    expect(b.inventory[0]?.id).toBe(swordB.id);
    expect(tradeOf(state, 0)).not.toBeNull();
  });

  it("carries coins both ways in the same transaction", () => {
    const { state, a, b } = table();
    a.coins = 500;
    b.coins = 100;
    offerCoins(state, a, 300);
    acceptTrade(state, a);
    acceptTrade(state, b);
    expect(a.coins).toBe(200);
    expect(b.coins).toBe(400);
  });

  it("refuses more coins than the purse holds, at the offer and at the swap", () => {
    const { state, a, b } = table();
    a.coins = 50;
    expect(offerCoins(state, a, 100)).toBe("no-coins");
    // …and again at settlement, because the purse can shrink in between (a
    // repair, a shop, the AUTO PILOT's own drain).
    offerCoins(state, a, 50);
    acceptTrade(state, a);
    a.coins = 10;
    expect(acceptTrade(state, b)).toBe("no-coins");
    expect(a.coins).toBe(10);
    expect(b.coins).toBe(0);
  });

  it("refuses a one-way gift into a full bag rather than dropping it", () => {
    const { state, a, b } = table();
    // A swap always fits — the cell each piece vacates takes the incoming one —
    // so the case that has to be refused is the GIFT, where one side gives and
    // the other gives nothing back.
    b.inventory[0] = null;
    for (let i = 0; i < b.inventory.length; i++) b.inventory[i] = piece(state);
    const before = allIds(state);
    offerItem(state, a, 0);
    acceptTrade(state, a);
    expect(acceptTrade(state, b)).toBe("no-room");
    expect(allIds(state)).toEqual(before);
  });

  it("swaps between two completely full bags", () => {
    const { state, a, b } = table();
    for (let i = 1; i < a.inventory.length; i++) a.inventory[i] = piece(state);
    for (let i = 1; i < b.inventory.length; i++) b.inventory[i] = piece(state);
    const before = allIds(state);
    offerItem(state, a, 0);
    offerItem(state, b, 0);
    acceptTrade(state, a);
    expect(acceptTrade(state, b)).toBeNull();
    expect(allIds(state)).toEqual(before);
  });
});

describe("an acceptance only ever describes what was seen", () => {
  it("drops both acceptances when either side changes the table", () => {
    // RULE 2, and it is the oldest trade-window scam there is: wait for the
    // other side to accept, then swap what is on the table.
    const { state, a, b } = table();
    offerItem(state, a, 0);
    offerItem(state, b, 0);
    acceptTrade(state, a);
    acceptTrade(state, b);
    // Both accepted, so that settled. Do it again and change the table in
    // between.
    const second = table();
    offerItem(second.state, second.a, 0);
    acceptTrade(second.state, second.a);
    const trade = tradeOf(second.state, 0)!;
    expect(trade.offers[0]!.accepted).toBe(true);
    // …the other side puts something on, and the first side's agreement lapses.
    offerItem(second.state, second.b, 0);
    expect(trade.offers[0]!.accepted).toBe(false);
    expect(trade.offers[1]!.accepted).toBe(false);
    void b;
  });

  it("drops them for a coin change too", () => {
    const { state, a, b } = table();
    a.coins = 100;
    acceptTrade(state, a);
    acceptTrade(state, b);
    // Nothing was on the table, so that settled an empty trade. Start again.
    const again = table();
    again.a.coins = 100;
    acceptTrade(again.state, again.a);
    offerCoins(again.state, again.a, 5);
    expect(tradeOf(again.state, 0)!.offers[0]!.accepted).toBe(false);
  });
});

describe("an offered piece may not be spent", () => {
  it("is refused by equip, discard and rearrange alike", () => {
    // RULE 3. `settleTrade` would catch every one of these — the offer names
    // the cell AND the id — but the player who did it would have no idea why
    // the trade failed a minute later, so the verbs refuse up front.
    const { state, a, swordA } = table();
    offerItem(state, a, 0);
    expect(isOfferedInTrade(state, a, 0)).toBe(true);
    expect(equipFromInventory(state, a, 0)).toBe(false);
    expect(discardFromInventory(state, a, 0)).toBeNull();
    moveInventoryItem(state, a, 0, 1);
    expect(a.inventory[0]?.id).toBe(swordA.id);
  });

  it("frees the piece again the moment it is taken off the table", () => {
    const { state, a } = table();
    offerItem(state, a, 0);
    offerItem(state, a, -1);
    expect(isOfferedInTrade(state, a, 0)).toBe(false);
    expect(discardFromInventory(state, a, 0)).not.toBeNull();
  });

  it("frees it when the trade is cancelled, having moved nothing", () => {
    const { state, a, swordA, swordB, b } = table();
    const before = allIds(state);
    offerItem(state, a, 0);
    offerItem(state, b, 0);
    acceptTrade(state, a);
    cancelTrade(state, a);
    expect(tradeOf(state, 0)).toBeNull();
    expect(allIds(state)).toEqual(before);
    expect(a.inventory[0]?.id).toBe(swordA.id);
    expect(b.inventory[0]?.id).toBe(swordB.id);
  });
});

describe("somebody leaving the table", () => {
  it("ends the trade rather than stranding the partner", () => {
    const { state, a, b, swordA } = table();
    offerItem(state, a, 0);
    offerItem(state, b, 0);
    acceptTrade(state, a);
    // The partner's connection drops. Nothing has moved, so nothing is undone
    // — but a table whose other side will never accept has to GO, or the
    // remaining player is stuck with a locked cell for the rest of the run.
    departHero(state, 1);
    expect(tradeOf(state, 0)).toBeNull();
    expect(isOfferedInTrade(state, a, 0)).toBe(false);
    expect(a.inventory[0]?.id).toBe(swordA.id);
  });
});
