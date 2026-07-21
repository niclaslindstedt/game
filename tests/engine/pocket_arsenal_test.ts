// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The autopilot's POCKET ARSENAL (src/game/bot-economy.ts): a blade hero
// banks ranged/magic weapons and the swap system keeps the hand on whatever
// maximizes damage this moment — the blade with a body in blade reach, the
// pocket shot out of reach and through every airborne frame (step.ts
// holsters melee above JUMP.dodgeHeight). Plus the bag discipline around it:
// the cull never eats the pocket, and the bag sorts like the powerup dock
// (pockets in slots 1–2, then loot by preciousness).

import { describe, expect, it } from "vitest";

import {
  botPocketShooterIndex,
  cullWorstLoot,
  hasPocketShooter,
  sortBotInventory,
  stepBotWeaponSwap,
  weaponCooldownFor,
  type Equipment,
  type GameState,
  type SwapMemory,
} from "@game/core";
import { clearStage, makeEnemy, startGame } from "./helpers.ts";

/** Mint a plain weapon instance from a fixture def. */
function weapon(
  state: GameState,
  defId: string,
  opts: { ilvl?: number; tier?: Equipment["tier"] } = {},
): Equipment {
  return {
    id: state.nextId++,
    defId,
    slot: "weapon",
    tier: opts.tier ?? "regular",
    ilvl: opts.ilvl ?? 1,
    affixes: [],
  };
}

/** A staged blade hero: cleared field, the starting sword in hand, and the
 * build committed to STRENGTH — a bare rookie's starter sword actually LOSES
 * the auto-equip race to a banked wand (the swap system would rightly read
 * him as a caster); a real melee bot has the lane invested. */
function bladeHero(): GameState {
  const state = startGame();
  clearStage(state);
  state.player.stats.strength += 12;
  expect(state.player.equipment.weapon.defId).toBe("crude_sword");
  return state;
}

describe("bot weapon swap (stepBotWeaponSwap)", () => {
  it("draws the pocket shot beyond blade reach and takes the blade back in reach", () => {
    const state = bladeHero();
    const bot: SwapMemory = {};
    state.player.inventory[3] = weapon(state, "test_wand");
    // A body pot-shot distance away — far outside the sword's arc, inside
    // the wand's — is a target the blade wastes: draw the wand.
    const foe = makeEnemy({
      pos: { x: state.player.pos.x + 150, y: state.player.pos.y },
    });
    state.enemies.push(foe);
    expect(stepBotWeaponSwap(bot, state)).toBe(true);
    expect(state.player.equipment.weapon.defId).toBe("test_wand");
    // The blade landed in the wand's cell — banked, not lost.
    expect(state.player.inventory[3]?.defId).toBe("crude_sword");
    // The foe closes into blade reach: the blade comes back (after the
    // anti-juggle gap).
    foe.pos = { x: state.player.pos.x + 30, y: state.player.pos.y };
    expect(stepBotWeaponSwap(bot, state)).toBe(false); // inside the swap gap
    state.stats.timeMs += 500;
    expect(stepBotWeaponSwap(bot, state)).toBe(true);
    expect(state.player.equipment.weapon.defId).toBe("crude_sword");
  });

  it("returns to the blade as the resting hand when nothing is left to shoot", () => {
    const state = bladeHero();
    const bot: SwapMemory = {};
    state.player.inventory[0] = weapon(state, "test_wand");
    state.enemies.push(
      makeEnemy({
        pos: { x: state.player.pos.x + 150, y: state.player.pos.y },
      }),
    );
    expect(stepBotWeaponSwap(bot, state)).toBe(true);
    expect(state.player.equipment.weapon.defId).toBe("test_wand");
    // Field cleared: nothing presents a target, so the blade rests in hand.
    state.enemies.length = 0;
    state.stats.timeMs += 500;
    expect(stepBotWeaponSwap(bot, state)).toBe(true);
    expect(state.player.equipment.weapon.defId).toBe("crude_sword");
  });

  it("draws the pocket mid-air and carries the attack clock (no free shots)", () => {
    const state = bladeHero();
    const bot: SwapMemory = {};
    state.player.inventory[0] = weapon(state, "test_wand");
    state.enemies.push(
      makeEnemy({
        pos: { x: state.player.pos.x + 100, y: state.player.pos.y },
      }),
    );
    state.player.z = 20; // above JUMP.dodgeHeight — the blade is holstered
    state.player.weaponCooldownMs = 4000;
    expect(stepBotWeaponSwap(bot, state)).toBe(true);
    const wand = state.player.equipment.weapon;
    expect(wand.defId).toBe("test_wand");
    // The carried wait clamps to the wand's own full cooldown — never zero
    // (the juggle must not mint a free shot).
    const full = weaponCooldownFor(state, wand);
    expect(state.player.weaponCooldownMs).toBeGreaterThan(0);
    expect(state.player.weaponCooldownMs).toBeLessThanOrEqual(full);
  });

  it("never swaps a shooter build — the gun already fires in every stance", () => {
    const state = startGame();
    clearStage(state);
    state.player.equipment.weapon = weapon(state, "test_revolver", {
      ilvl: 10,
    });
    state.player.inventory[0] = weapon(state, "test_wand");
    state.enemies.push(
      makeEnemy({
        pos: { x: state.player.pos.x + 150, y: state.player.pos.y },
      }),
    );
    expect(stepBotWeaponSwap({}, state)).toBe(false);
    expect(state.player.equipment.weapon.defId).toBe("test_revolver");
  });

  it("stays put with an empty pocket or nothing in any weapon's range", () => {
    const state = bladeHero();
    // A foe in shot range but no pocket banked: nothing to draw.
    const foe = makeEnemy({
      pos: { x: state.player.pos.x + 150, y: state.player.pos.y },
    });
    state.enemies.push(foe);
    expect(hasPocketShooter(state)).toBe(false);
    expect(stepBotWeaponSwap({}, state)).toBe(false);
    // A pocket banked but every foe out of its range: the swap is churn.
    state.player.inventory[0] = weapon(state, "test_wand");
    expect(hasPocketShooter(state)).toBe(true);
    foe.pos = { x: state.player.pos.x + 900, y: state.player.pos.y };
    expect(stepBotWeaponSwap({}, state)).toBe(false);
    expect(state.player.equipment.weapon.defId).toBe("crude_sword");
  });
});

describe("pocket pick context (botPocketShooterIndex)", () => {
  it("prefers the crowd shot on a swarm and the single-target round on a boss", () => {
    const state = bladeHero();
    state.player.inventory[0] = weapon(state, "test_hailgun");
    state.player.inventory[1] = weapon(state, "test_revolver");
    // A minion swarm: the damped 4-pellet hailgun's crowd credit out-ranks
    // the revolver.
    state.enemies.push(
      makeEnemy({
        pos: { x: state.player.pos.x + 150, y: state.player.pos.y },
      }),
    );
    expect(botPocketShooterIndex(state)).toBe(0);
    // A boss walks in: one big body cashes per-target DPS, not pellets — the
    // revolver takes the pocket.
    state.enemies.push(
      makeEnemy(
        { pos: { x: state.player.pos.x + 200, y: state.player.pos.y } },
        "test_boss",
      ),
    );
    expect(botPocketShooterIndex(state)).toBe(1);
  });
});

describe("pocket keepers (cullWorstLoot)", () => {
  it("never drops the pocket shot, even as the cheapest piece in a full bag", () => {
    const state = bladeHero();
    const inv = state.player.inventory;
    // The wand is the CHEAPEST piece in a full bag — without the pocket
    // protection the cull would shed it first.
    inv[0] = weapon(state, "test_wand");
    for (let i = 1; i < inv.length; i++) {
      inv[i] = weapon(state, "blaster", { ilvl: 2 + i });
    }
    const dropped = cullWorstLoot(state);
    expect(dropped.length).toBe(1);
    expect(dropped[0]?.defId).toBe("blaster");
    expect(inv.some((c) => c?.defId === "test_wand")).toBe(true);
  });
});

describe("bag order (sortBotInventory)", () => {
  it("pockets up front (ranged, magic), then loot by preciousness, gaps packed", () => {
    const state = bladeHero();
    const inv = state.player.inventory;
    for (let i = 0; i < inv.length; i++) inv[i] = null;
    inv[0] = weapon(state, "blaster"); // lesser ranged — ordinary loot
    inv[2] = weapon(state, "crude_sword", { tier: "legendary", ilvl: 5 });
    inv[4] = weapon(state, "test_pistol", { ilvl: 5 }); // best ranged
    inv[5] = weapon(state, "test_wand", { ilvl: 5 }); // best (only) magic
    inv[6] = weapon(state, "test_pipe", { ilvl: 9 }); // metal — out-sells the blaster
    expect(sortBotInventory(state)).toBe(true);
    expect(inv[0]?.defId).toBe("test_pistol");
    expect(inv[1]?.defId).toBe("test_wand");
    // Then preciousness: the legendary tops the sell ladder, metal beats
    // plain junk, and the empty cells pack to the tail.
    expect(inv[2]?.defId).toBe("crude_sword");
    expect(inv[2]?.tier).toBe("legendary");
    expect(inv[3]?.defId).toBe("test_pipe");
    expect(inv[4]?.defId).toBe("blaster");
    expect(inv[5]).toBeNull();
    // Idempotent: an already-sorted bag doesn't move.
    expect(sortBotInventory(state)).toBe(false);
  });
});
