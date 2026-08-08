// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The autopilot's economy (engine/game/bot/economy.ts): bag discipline — keep a
// cell open by shedding the LEAST PRECIOUS piece the bag can spare (the
// outgrown junk first, and only then the cheapest keeper, which is banked in
// the LOST & FOUND rather than destroyed) — and the merchant errand: want a
// visit only when it resolves something, walk the junk to the counter, and let
// the counter routine (sell → buy → mend → powerups) clear the want so the
// errand can't loop.

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

import { distance as dist } from "@game/lib/vec.ts";

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
    const inv = state.players[0].inventory;
    // Pack the bag full of junk: one valuable piece (high ilvl → high sell
    // value) among worthless ones.
    for (let i = 0; i < inv.length; i++) {
      inv[i] = junkBlaster(state, i === 0 ? 30 : 1);
    }
    expect(isScrappableLoot(state, state.players[0], inv[0] as Equipment)).toBe(
      true,
    );
    const dropped = cullWorstLoot(state, state.players[0]);
    // Exactly one drop — the cheapest — and a cell is now open.
    expect(dropped.length).toBe(1);
    expect((dropped[0] as Equipment).ilvl).toBe(1);
    expect(inv.filter((c) => c === null).length).toBe(1);
    // The valuable junk is KEPT — it's the merchant fodder.
    expect(inv.some((c) => c !== null && c.ilvl === 30)).toBe(true);
    // With a cell already open the cull is a no-op.
    expect(cullWorstLoot(state, state.players[0]).length).toBe(0);
  });

  it("sheds a keeper only when the whole bag is keepers — and BANKS it", () => {
    const state = startGame();
    const inv = state.players[0].inventory;
    for (let i = 0; i < inv.length; i++) {
      inv[i] = { ...junkBlaster(state, 1), tier: "unique" };
    }
    // A bag of nothing but uniques used to STAND — which left an unattended
    // ride refusing every drop for the rest of the flight, so the best find of
    // the night was the one left lying on the floor. It now sheds exactly one
    // (the cheapest, cell 0 being the banked pocket shooter it always spares)
    // into the LOST & FOUND, where coins buy it back.
    const dropped = cullWorstLoot(state, state.players[0]);
    expect(dropped.length).toBe(1);
    expect(inv.filter((c) => c === null).length).toBe(1);
    expect(state.players[0].vault.map((p) => p.id)).toEqual([
      (dropped[0] as Equipment).id,
    ]);
  });
});

describe("bot merchant errand", () => {
  it("wants a sell-run once the junk piles up, and the counter routine clears it", () => {
    const state = startGame();
    clearStage(state);
    state.merchant.discovered = true; // met earlier in the run
    // Nothing to do yet → no errand.
    expect(wantsMerchantVisit(state, state.players[0])).toBe(false);
    const inv = state.players[0].inventory;
    // FOUR junk pieces: one blaster (ranged) is banked as the blade hero's
    // pocket shot — spared from every sell/junk read — so three still count.
    inv[0] = junkBlaster(state, 5);
    inv[1] = junkBlaster(state, 5);
    inv[2] = junkBlaster(state, 5);
    inv[3] = junkBlaster(state, 5);
    expect(sellableJunkCount(state, state.players[0])).toBe(3);
    expect(wantsMerchantVisit(state, state.players[0])).toBe(true);
    // Away from the counter the trade is refused (openShop is proximity-gated).
    state.merchant.pos = {
      x: state.players[0].pos.x + 500,
      y: state.players[0].pos.y,
    };
    expect(tradeAtMerchant(state, state.players[0])).toBe(false);
    // At the stall: the junk is banked for coins, the shop closed behind him,
    // and the errand resolves itself so the walk can't loop.
    state.merchant.pos = {
      x: state.players[0].pos.x + 20,
      y: state.players[0].pos.y,
    };
    const coins = state.players[0].coins;
    expect(tradeAtMerchant(state, state.players[0])).toBe(true);
    expect(state.players[0].coins).toBeGreaterThan(coins);
    expect(sellableJunkCount(state, state.players[0])).toBe(0);
    expect(state.phase).toBe("playing");
    expect(wantsMerchantVisit(state, state.players[0])).toBe(false);
  });

  it("walks the errand itself — the survivor steers its junk toward the met merchant", () => {
    const state = startGame();
    clearStage(state);
    // No chests to sweep first, so the errand is the next macro goal.
    state.obstacles = state.obstacles.filter((o) => !o.chest);
    state.merchant.discovered = true;
    state.merchant.pos = {
      x: state.players[0].pos.x + 400,
      y: state.players[0].pos.y,
    };
    const inv = state.players[0].inventory;
    // Four again: one blaster is the spared pocket shot (see above).
    inv[0] = junkBlaster(state, 5);
    inv[1] = junkBlaster(state, 5);
    inv[2] = junkBlaster(state, 5);
    inv[3] = junkBlaster(state, 5);
    const before = dist(state.players[0].pos, state.merchant.pos);
    const bot = createBot("balanced");
    for (let i = 0; i < 400; i++) {
      step(state, botAct(bot, state, state.players[0]), DT);
    }
    expect(dist(state.players[0].pos, state.merchant.pos)).toBeLessThan(
      before - 150,
    );
  });
});
