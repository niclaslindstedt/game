// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE LOST & FOUND (engine/game/items/vault.ts) and the bag discipline that fills
// it (engine/game/bot/economy.ts `cullWorstLoot`): a paid AUTO PILOT ride sheds
// the LEAST PRECIOUS piece to keep a cell open — never a unique to make room
// for a magic — and banks anything magic-or-better for the player to buy back
// on the per-tier coin ladder. What is never bought back is trashed when the
// next ride engages. Runs on synthetic fixtures.

import { describe, expect, it } from "vitest";

import {
  applyLoadout,
  clearVault,
  cullWorstLoot,
  extractLoadout,
  isVaultWorthy,
  reclaimCost,
  reclaimVaultItem,
  tierRank,
  TIER_LADDER,
  VAULT,
  vaultContents,
  vaultItem,
  vaultWorth,
  type Equipment,
  type GameState,
  type Tier,
} from "@game/core";
import { clearStage, startGame } from "./helpers.ts";

function piece(
  state: GameState,
  defId: string,
  slot: Equipment["slot"],
  tier: Equipment["tier"],
  ilvl = 5,
): Equipment {
  return { id: state.nextId++, defId, slot, tier, ilvl, affixes: [] };
}

/** A bag packed edge to edge with `tier` weapons — the full-bag setups below. */
function fillBag(state: GameState, tier: Equipment["tier"]): void {
  const inv = state.players[0].inventory;
  for (let i = 0; i < inv.length; i++) {
    inv[i] = piece(state, "test_hammer", "weapon", tier);
  }
}

describe("the tier ladder (tierRank)", () => {
  it("runs worst to best, the rarity table's own order", () => {
    expect([...TIER_LADDER]).toEqual([
      "trash",
      "regular",
      "magic",
      "rare",
      "set",
      "unique",
      "legendary",
      "artifact",
    ]);
    // Strictly ascending — the ordering every preciousness read depends on.
    for (let i = 1; i < TIER_LADDER.length; i++) {
      expect(tierRank(TIER_LADDER[i] as Tier)).toBeGreaterThan(
        tierRank(TIER_LADDER[i - 1] as Tier),
      );
    }
  });
});

describe("the reclaim ladder (reclaimCost)", () => {
  it("prices magic at 10 million and an artifact at 2 billion, rising every rung", () => {
    const state = startGame();
    const cost = (tier: Equipment["tier"]) =>
      reclaimCost(piece(state, "test_hammer", "weapon", tier));
    expect(cost("magic")).toBe(10_000_000);
    expect(cost("artifact")).toBe(2_000_000_000);
    const chase: Tier[] = [
      "magic",
      "rare",
      "set",
      "unique",
      "legendary",
      "artifact",
    ];
    for (let i = 1; i < chase.length; i++) {
      expect(cost(chase[i] as Tier)).toBeGreaterThan(
        cost(chase[i - 1] as Tier),
      );
    }
  });

  it("prices by TIER alone — a fat ilvl doesn't move the rung", () => {
    const state = startGame();
    const cheap = piece(state, "test_hammer", "weapon", "rare", 1);
    const deep = piece(state, "test_hammer", "weapon", "rare", 90);
    expect(reclaimCost(deep)).toBe(reclaimCost(cheap));
  });
});

describe("banking a thrown-away find (vaultItem)", () => {
  it("takes magic and better, refuses the junk the cull exists to shed", () => {
    const state = startGame();
    expect(isVaultWorthy(piece(state, "test_hammer", "weapon", "trash"))).toBe(
      false,
    );
    expect(
      isVaultWorthy(piece(state, "test_hammer", "weapon", "regular")),
    ).toBe(false);
    expect(isVaultWorthy(piece(state, "test_hammer", "weapon", "magic"))).toBe(
      true,
    );
    expect(
      vaultItem(
        state,
        state.players[0],
        piece(state, "test_hammer", "weapon", "regular"),
      ),
    ).toBe(false);
    expect(
      vaultItem(
        state,
        state.players[0],
        piece(state, "test_hammer", "weapon", "magic"),
      ),
    ).toBe(true);
    expect(state.players[0].vault).toHaveLength(1);
  });

  it("evicts the LEAST precious at capacity, and refuses a find that can't beat it", () => {
    const state = startGame();
    for (let i = 0; i < VAULT.capacity; i++) {
      vaultItem(
        state,
        state.players[0],
        piece(state, "test_hammer", "weapon", "rare"),
      );
    }
    expect(state.players[0].vault).toHaveLength(VAULT.capacity);
    // A legendary displaces one of the rares — the vault keeps the treasure.
    const legendary = piece(state, "test_hammer", "weapon", "legendary");
    expect(vaultItem(state, state.players[0], legendary)).toBe(true);
    expect(state.players[0].vault).toHaveLength(VAULT.capacity);
    expect(state.players[0].vault.some((p) => p.id === legendary.id)).toBe(
      true,
    );
    // A magic can't out-rank a vault full of rares: it isn't banked at all.
    const magic = piece(state, "test_hammer", "weapon", "magic");
    expect(vaultItem(state, state.players[0], magic)).toBe(false);
    expect(state.players[0].vault.some((p) => p.id === magic.id)).toBe(false);
  });

  it("lists most precious first, tier before sell value", () => {
    const state = startGame();
    const magicDeep = piece(state, "test_hammer", "weapon", "magic", 90);
    const unique = piece(state, "test_hammer", "weapon", "unique", 1);
    vaultItem(state, state.players[0], magicDeep);
    vaultItem(state, state.players[0], unique);
    // The ilvl-90 blue sells for more per point, but a UNIQUE outranks it
    // absolutely — the whole reason the ordering isn't plain sellValue.
    expect(vaultWorth(unique)).toBeGreaterThan(vaultWorth(magicDeep));
    expect(vaultContents(state.players[0].vault)[0]?.id).toBe(unique.id);
  });
});

describe("the bag discipline fills it (cullWorstLoot)", () => {
  it("sheds the outgrown junk first and banks it when it's worth banking", () => {
    const state = startGame();
    clearStage(state);
    const inv = state.players[0].inventory;
    // Every cell an outgrown weapon (the wall sword out-scores them all) —
    // magic finds but for one PLAIN one. Cell 0 is the bot's pocket shooter
    // and never goes, so the plain find is the cheapest thing left: it is what
    // the cull sheds, and being plain it is binned rather than banked.
    for (let i = 0; i < inv.length; i++) {
      inv[i] = piece(state, "blaster", "weapon", i === 1 ? "regular" : "magic");
    }
    const shed = cullWorstLoot(state, state.players[0]);
    expect(shed).toHaveLength(1);
    expect(shed[0]?.tier).toBe("regular");
    // A plain find is junk — binned, not banked.
    expect(state.players[0].vault).toHaveLength(0);
    expect(inv.indexOf(null)).not.toBe(-1);
  });

  it("NEVER sheds a unique to make room while a lesser piece is there to go", () => {
    const state = startGame();
    clearStage(state);
    const inv = state.players[0].inventory;
    for (let i = 0; i < inv.length; i++) {
      inv[i] = piece(state, "test_hammer", "weapon", "unique");
    }
    // One magic among the uniques — the bot knows the difference. (Cell 0 is
    // the hero's banked MAIN weapon, which the swap system always spares.)
    const magic = piece(state, "test_hammer", "weapon", "magic");
    inv[1] = magic;
    const shed = cullWorstLoot(state, state.players[0]);
    expect(shed).toHaveLength(1);
    expect(shed[0]?.id).toBe(magic.id);
    expect(inv.some((c) => c?.tier === "unique")).toBe(true);
  });

  it("sheds the least precious KEEPER when the whole bag is treasure — into the vault", () => {
    const state = startGame();
    clearStage(state);
    const inv = state.players[0].inventory;
    // A bag of uniques and one SET piece: every cell is a keeper the old rule
    // spared, which left the ride riding a full bag and refusing every drop
    // for the rest of the flight. The SET green is the least precious, so it
    // goes — and it is banked, not destroyed.
    fillBag(state, "unique");
    const set = piece(state, "test_hammer", "weapon", "set");
    inv[2] = set;
    const shed = cullWorstLoot(state, state.players[0]);
    expect(shed).toHaveLength(1);
    expect(shed[0]?.id).toBe(set.id);
    expect(inv.indexOf(null)).not.toBe(-1);
    expect(state.players[0].vault.map((p) => p.id)).toEqual([set.id]);
  });

  it("spares a travel-gate KEY whatever the bag holds", () => {
    const state = startGame();
    clearStage(state);
    const inv = state.players[0].inventory;
    fillBag(state, "unique");
    // The key is a plain trinket — by preciousness it is the obvious thing to
    // shed, and its worth is the door it opens.
    const key = piece(state, "test_gate_key", "trinket", "regular");
    inv[1] = key;
    cullWorstLoot(state, state.players[0]);
    expect(inv.some((c) => c?.id === key.id)).toBe(true);
  });
});

describe("buying a piece back mid-run (reclaimVaultItem)", () => {
  it("charges the running purse and lands the piece in the bag", () => {
    const state = startGame();
    clearStage(state);
    const banked = piece(state, "test_hammer", "weapon", "unique");
    vaultItem(state, state.players[0], banked);
    const price = reclaimCost(banked);
    state.players[0].coins = price + 5;
    expect(reclaimVaultItem(state, state.players[0], banked.id)).toBe(null);
    expect(state.players[0].coins).toBe(5);
    expect(state.players[0].vault).toHaveLength(0);
    expect(state.players[0].inventory.some((c) => c?.id === banked.id)).toBe(
      true,
    );
  });

  it("refuses a thin purse, a full bag, and an id that isn't banked", () => {
    const state = startGame();
    clearStage(state);
    const banked = piece(state, "test_hammer", "weapon", "unique");
    vaultItem(state, state.players[0], banked);
    state.players[0].coins = reclaimCost(banked) - 1;
    expect(reclaimVaultItem(state, state.players[0], banked.id)).toBe("coins");
    // Nothing moved on a refusal — the piece is still banked, the purse whole.
    expect(state.players[0].vault).toHaveLength(1);
    expect(state.players[0].coins).toBe(reclaimCost(banked) - 1);

    state.players[0].coins = reclaimCost(banked);
    fillBag(state, "unique");
    expect(reclaimVaultItem(state, state.players[0], banked.id)).toBe("bag");
    expect(state.players[0].coins).toBe(reclaimCost(banked));

    expect(reclaimVaultItem(state, state.players[0], -1)).toBe("gone");
  });
});

describe("the vault rides the loadout and expires (clearVault)", () => {
  it("carries across a level hop", () => {
    const state = startGame();
    clearStage(state);
    const banked = piece(state, "test_hammer", "weapon", "legendary");
    vaultItem(state, state.players[0], banked);
    const next = startGame();
    applyLoadout(
      next,
      next.players[0],
      extractLoadout(state, state.players[0]),
    );
    expect(next.players[0].vault).toHaveLength(1);
    expect(next.players[0].vault[0]?.defId).toBe("test_hammer");
  });

  it("is emptied for good when the next ride engages", () => {
    const state = startGame();
    vaultItem(
      state,
      state.players[0],
      piece(state, "test_hammer", "weapon", "legendary"),
    );
    vaultItem(
      state,
      state.players[0],
      piece(state, "test_hammer", "weapon", "unique"),
    );
    expect(clearVault(state, state.players[0])).toBe(2);
    expect(state.players[0].vault).toHaveLength(0);
  });
});
