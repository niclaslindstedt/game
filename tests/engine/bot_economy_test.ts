// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The autopilot's economy (src/game/bot-economy.ts): bag discipline — keep a
// cell open by dropping the CHEAPEST outgrown junk, never a keeper — and the
// merchant errand: want a visit only when it resolves something, walk the
// junk to the counter, and let the counter routine (sell → buy → mend →
// powerups) clear the want so the errand can't loop.

import { describe, expect, it } from "vitest";

import {
  botAct,
  createBot,
  cullWorstLoot,
  isScrappableLoot,
  sellableJunkCount,
  step,
  tradeAtMerchant,
  wantsMerchantVisit,
  type Equipment,
  type GameState,
} from "@game/core";
import { clearStage, DT, startGame } from "./helpers.ts";

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

/** A plainly-outgrown bag piece: a regular-tier copy of the weak sidearm, far
 * below the held starting sword — the junk the cull and the sell-run act on.
 * `ilvl` sets its merchant worth (sellValue grows with ilvl). */
function junkBlaster(state: GameState, ilvl: number): Equipment {
  return {
    id: state.nextId++,
    defId: "blaster",
    slot: "weapon",
    tier: "regular",
    ilvl,
    affixes: [],
  };
}

describe("bot bag discipline (cullWorstLoot)", () => {
  it("keeps one cell open by dropping the CHEAPEST junk, hoarding the valuable junk to sell", () => {
    const state = startGame();
    const inv = state.player.inventory;
    // Pack the bag full of junk: one valuable piece (high ilvl → high sell
    // value) among worthless ones.
    for (let i = 0; i < inv.length; i++) {
      inv[i] = junkBlaster(state, i === 0 ? 30 : 1);
    }
    expect(isScrappableLoot(state, inv[0] as Equipment)).toBe(true);
    const dropped = cullWorstLoot(state);
    // Exactly one drop — the cheapest — and a cell is now open.
    expect(dropped.length).toBe(1);
    expect((dropped[0] as Equipment).ilvl).toBe(1);
    expect(inv.filter((c) => c === null).length).toBe(1);
    // The valuable junk is KEPT — it's the merchant fodder.
    expect(inv.some((c) => c !== null && c.ilvl === 30)).toBe(true);
    // With a cell already open the cull is a no-op.
    expect(cullWorstLoot(state).length).toBe(0);
  });

  it("never trashes a special to make room — a bag full of keepers stands", () => {
    const state = startGame();
    const inv = state.player.inventory;
    for (let i = 0; i < inv.length; i++) {
      inv[i] = { ...junkBlaster(state, 1), tier: "unique" };
    }
    expect(cullWorstLoot(state)).toEqual([]);
    expect(inv.every((c) => c !== null)).toBe(true);
  });
});

describe("bot merchant errand", () => {
  it("wants a sell-run once the junk piles up, and the counter routine clears it", () => {
    const state = startGame();
    clearStage(state);
    state.merchant.discovered = true; // met earlier in the run
    // Nothing to do yet → no errand.
    expect(wantsMerchantVisit(state)).toBe(false);
    const inv = state.player.inventory;
    // FOUR junk pieces: one blaster (ranged) is banked as the blade hero's
    // pocket shot — spared from every sell/junk read — so three still count.
    inv[0] = junkBlaster(state, 5);
    inv[1] = junkBlaster(state, 5);
    inv[2] = junkBlaster(state, 5);
    inv[3] = junkBlaster(state, 5);
    expect(sellableJunkCount(state)).toBe(3);
    expect(wantsMerchantVisit(state)).toBe(true);
    // Away from the counter the trade is refused (openShop is proximity-gated).
    state.merchant.pos = {
      x: state.player.pos.x + 500,
      y: state.player.pos.y,
    };
    expect(tradeAtMerchant(state)).toBe(false);
    // At the stall: the junk is banked for coins, the shop closed behind him,
    // and the errand resolves itself so the walk can't loop.
    state.merchant.pos = { x: state.player.pos.x + 20, y: state.player.pos.y };
    const coins = state.player.coins;
    expect(tradeAtMerchant(state)).toBe(true);
    expect(state.player.coins).toBeGreaterThan(coins);
    expect(sellableJunkCount(state)).toBe(0);
    expect(state.phase).toBe("playing");
    expect(wantsMerchantVisit(state)).toBe(false);
  });

  it("walks the errand itself — the survivor steers its junk toward the met merchant", () => {
    const state = startGame();
    clearStage(state);
    // No chests to sweep first, so the errand is the next macro goal.
    state.obstacles = state.obstacles.filter((o) => !o.chest);
    state.merchant.discovered = true;
    state.merchant.pos = {
      x: state.player.pos.x + 400,
      y: state.player.pos.y,
    };
    const inv = state.player.inventory;
    // Four again: one blaster is the spared pocket shot (see above).
    inv[0] = junkBlaster(state, 5);
    inv[1] = junkBlaster(state, 5);
    inv[2] = junkBlaster(state, 5);
    inv[3] = junkBlaster(state, 5);
    const before = dist(state.player.pos, state.merchant.pos);
    const bot = createBot("balanced");
    for (let i = 0; i < 400; i++) {
      step(state, botAct(bot, state), DT);
    }
    expect(dist(state.player.pos, state.merchant.pos)).toBeLessThan(
      before - 150,
    );
  });
});
