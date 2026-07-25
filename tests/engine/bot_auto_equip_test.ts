// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The autopilot's own AUTO-EQUIP sweep (src/game/bot/economy.ts botAutoEquip):
// the bot wears the upgrades it picks up whatever the human's ON-PICKUP
// auto-equip setting says (it ships OFF, so a bot that relied on it banked
// every find and fought under-geared with a bag full of armor), while leaving
// the HAND to the pocket arsenal. Plus the two knock-on rules: the sweep frees
// the bag cells the one-slot-open discipline needs, and a shooter build whose
// best gun is still banked actually draws it. Runs on synthetic fixtures.

import { afterEach, describe, expect, it } from "vitest";

import {
  botAutoEquip,
  cullWorstLoot,
  setAutoEquipEnabled,
  stepBotWeaponSwap,
  type Equipment,
  type GameState,
  type SwapMemory,
} from "@game/core";
import { clearStage, makeEnemy, startGame } from "./helpers.ts";

/** Mint a plain gear instance from a fixture def. */
function gear(
  state: GameState,
  defId: string,
  slot: Equipment["slot"],
  opts: { ilvl?: number; tier?: Equipment["tier"] } = {},
): Equipment {
  return {
    id: state.nextId++,
    defId,
    slot,
    tier: opts.tier ?? "regular",
    ilvl: opts.ilvl ?? 1,
    affixes: [],
  };
}

function weapon(
  state: GameState,
  defId: string,
  opts: { ilvl?: number } = {},
): Equipment {
  return gear(state, defId, "weapon", opts);
}

describe("the autopilot wears its upgrades (botAutoEquip)", () => {
  // The engine default is on; the tests that turn it off restore it so
  // ordering can't leak into the rest of the suite.
  afterEach(() => setAutoEquipEnabled(true));

  it("equips banked armor even with the on-pickup setting OFF", () => {
    const state = startGame();
    clearStage(state);
    // The shipped app's default: finds bank to the bag for the player to
    // curate. The bot is not curating anything — it must still gear up.
    setAutoEquipEnabled(false);
    const inv = state.player.inventory;
    inv[0] = gear(state, "test_vest", "chest");
    inv[1] = gear(state, "test_helmet", "head");

    expect(state.player.equipment.chest).toBeNull();
    expect(botAutoEquip(state)).toBe(true);
    expect(state.player.equipment.chest?.defId).toBe("test_vest");
    expect(state.player.equipment.head?.defId).toBe("test_helmet");
    // The cells they came from are free now — the whole point of the sweep.
    expect(inv[0]).toBeNull();
    expect(inv[1]).toBeNull();
    // Idempotent: a swept loadout doesn't re-sweep.
    expect(botAutoEquip(state)).toBe(false);
  });

  it("swaps a worn piece out for the better find and banks the loser", () => {
    const state = startGame();
    clearStage(state);
    const worn = gear(state, "test_vest", "chest");
    state.player.equipment.chest = worn;
    const better = gear(state, "test_vest", "chest", { tier: "rare" });
    better.affixes = [{ kind: "armor", value: 20 }];
    state.player.inventory[2] = better;

    expect(botAutoEquip(state)).toBe(true);
    expect(state.player.equipment.chest?.id).toBe(better.id);
    // Nothing is destroyed — the displaced piece lands in the vacated cell.
    expect(state.player.inventory[2]?.id).toBe(worn.id);
  });

  it("leaves the HAND to the pocket arsenal", () => {
    const state = startGame();
    clearStage(state);
    state.player.stats.strength += 12;
    const bot: SwapMemory = {};
    state.player.inventory[0] = weapon(state, "test_wand");
    // The swap system draws the pocket wand at pot-shot range, banking the
    // blade. A sweep that also re-drew the strongest weapon would rip it back
    // out of the bag every tick and flap the hand.
    state.enemies.push(
      makeEnemy({
        pos: { x: state.player.pos.x + 150, y: state.player.pos.y },
      }),
    );
    expect(stepBotWeaponSwap(bot, state)).toBe(true);
    expect(state.player.equipment.weapon.defId).toBe("test_wand");

    expect(botAutoEquip(state)).toBe(false);
    expect(state.player.equipment.weapon.defId).toBe("test_wand");
    expect(state.player.inventory[0]?.defId).toBe("crude_sword");
  });

  it("wears a find banked while under-leveled once the hero grows into it", () => {
    const state = startGame();
    clearStage(state);
    // An ARTIFACT demands its own ilvl as the level gate, so this one is far
    // out of a rookie's reach: `canEquip` refuses it, the pickup path could
    // only ever bank it — and nothing else ever re-checked afterwards.
    const heavy = gear(state, "test_vest", "chest", {
      ilvl: 40,
      tier: "artifact",
    });
    state.player.inventory[0] = heavy;
    expect(botAutoEquip(state)).toBe(false);
    expect(state.player.equipment.chest).toBeNull();

    state.player.level = 60;
    expect(botAutoEquip(state)).toBe(true);
    expect(state.player.equipment.chest?.id).toBe(heavy.id);
  });

  it("frees the cell the one-slot-open bag discipline needs", () => {
    const state = startGame();
    clearStage(state);
    setAutoEquipEnabled(false);
    const inv = state.player.inventory;
    // A bag packed with nothing but KEEPERS: four armor upgrades bound for
    // empty slots plus banked weapons. `isScrappableLoot` spares every one, so
    // the cull alone can't open a cell — the bag stays full and the next drop
    // is refused. Wearing the armor is what makes room.
    inv[0] = gear(state, "test_helmet", "head");
    inv[1] = gear(state, "test_vest", "chest");
    inv[2] = gear(state, "test_greaves", "legs");
    inv[3] = gear(state, "test_boots", "feet");
    for (let i = 4; i < inv.length; i++) {
      inv[i] = weapon(state, "test_hammer", { ilvl: 5 });
    }
    expect(inv.every((cell) => cell !== null)).toBe(true);
    expect(cullWorstLoot(state).length).toBe(0);
    expect(inv.indexOf(null)).toBe(-1);

    botAutoEquip(state);
    expect(inv.indexOf(null)).not.toBe(-1);
  });
});

describe("a shooter build draws its banked main (stepBotWeaponSwap)", () => {
  afterEach(() => setAutoEquipEnabled(true));

  it("puts the stronger banked gun in hand instead of holding the blade", () => {
    const state = startGame();
    clearStage(state);
    setAutoEquipEnabled(false);
    const bot: SwapMemory = {};
    // The hero holds the starter blade with a far better gun in the bag —
    // exactly what the app's default (bank everything) produces. The
    // shooter-build early return used to fire on the BANKED gun and leave him
    // holding the blade forever.
    const gun = weapon(state, "test_revolver", { ilvl: 30 });
    state.player.inventory[0] = gun;
    state.enemies.push(
      makeEnemy({
        pos: { x: state.player.pos.x + 150, y: state.player.pos.y },
      }),
    );

    expect(stepBotWeaponSwap(bot, state)).toBe(true);
    expect(state.player.equipment.weapon.id).toBe(gun.id);
    // And once it is in hand the shooter build settles — no per-tick juggling.
    state.stats.timeMs += 5000;
    expect(stepBotWeaponSwap(bot, state)).toBe(false);
  });
});
