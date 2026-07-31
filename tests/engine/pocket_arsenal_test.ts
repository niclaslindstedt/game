// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The autopilot's POCKET ARSENAL (src/game/bot/economy.ts): a blade hero
// banks ranged/magic weapons and the swap system keeps the hand on whatever
// maximizes damage this moment — the blade with a body in blade reach, the
// pocket shot out of reach and through every airborne frame (step/
// holsters melee above JUMP.dodgeHeight). Plus the bag discipline around it:
// the cull never eats the pocket, and the bag sorts like the powerup dock
// (pockets in slots 1–2, then loot by preciousness).

import { describe, expect, it } from "vitest";

import {
  botPocketShooterIndex,
  botWeaponSwapTarget,
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
  state.players[0].stats.strength += 12;
  expect(state.players[0].equipment.weapon.defId).toBe("crude_sword");
  return state;
}

describe("bot weapon swap (stepBotWeaponSwap)", () => {
  it("draws the pocket shot beyond blade reach and takes the blade back in reach", () => {
    const state = bladeHero();
    const bot: SwapMemory = {};
    state.players[0].inventory[3] = weapon(state, "test_wand");
    // A body pot-shot distance away — far outside the sword's arc, inside
    // the wand's — is a target the blade wastes: draw the wand.
    const foe = makeEnemy({
      pos: { x: state.players[0].pos.x + 150, y: state.players[0].pos.y },
    });
    state.enemies.push(foe);
    expect(stepBotWeaponSwap(bot, state)).toBe(true);
    expect(state.players[0].equipment.weapon.defId).toBe("test_wand");
    // The blade landed in the wand's cell — banked, not lost.
    expect(state.players[0].inventory[3]?.defId).toBe("crude_sword");
    // The foe closes into blade reach: the blade comes back (after the
    // anti-juggle gap).
    foe.pos = { x: state.players[0].pos.x + 30, y: state.players[0].pos.y };
    expect(stepBotWeaponSwap(bot, state)).toBe(false); // inside the swap gap
    state.stats.timeMs += 500;
    expect(stepBotWeaponSwap(bot, state)).toBe(true);
    expect(state.players[0].equipment.weapon.defId).toBe("crude_sword");
  });

  it("returns to the blade as the resting hand when nothing is left to shoot", () => {
    const state = bladeHero();
    const bot: SwapMemory = {};
    state.players[0].inventory[0] = weapon(state, "test_wand");
    state.enemies.push(
      makeEnemy({
        pos: { x: state.players[0].pos.x + 150, y: state.players[0].pos.y },
      }),
    );
    expect(stepBotWeaponSwap(bot, state)).toBe(true);
    expect(state.players[0].equipment.weapon.defId).toBe("test_wand");
    // Field cleared: nothing presents a target, so the blade rests in hand.
    state.enemies.length = 0;
    state.stats.timeMs += 500;
    expect(stepBotWeaponSwap(bot, state)).toBe(true);
    expect(state.players[0].equipment.weapon.defId).toBe("crude_sword");
  });

  it("draws the pocket mid-air and carries the attack clock (no free shots)", () => {
    const state = bladeHero();
    const bot: SwapMemory = {};
    state.players[0].inventory[0] = weapon(state, "test_wand");
    state.enemies.push(
      makeEnemy({
        pos: { x: state.players[0].pos.x + 100, y: state.players[0].pos.y },
      }),
    );
    state.players[0].z = 20; // above JUMP.dodgeHeight — the blade is holstered
    state.players[0].weaponCooldownMs = 4000;
    expect(stepBotWeaponSwap(bot, state)).toBe(true);
    const wand = state.players[0].equipment.weapon;
    expect(wand.defId).toBe("test_wand");
    // The carried wait clamps to the wand's own full cooldown — never zero
    // (the juggle must not mint a free shot).
    const full = weaponCooldownFor(state, state.players[0], wand);
    expect(state.players[0].weaponCooldownMs).toBeGreaterThan(0);
    expect(state.players[0].weaponCooldownMs).toBeLessThanOrEqual(full);
  });

  it("never swaps a shooter build — the gun already fires in every stance", () => {
    const state = startGame();
    clearStage(state);
    state.players[0].equipment.weapon = weapon(state, "test_revolver", {
      ilvl: 10,
    });
    state.players[0].inventory[0] = weapon(state, "test_wand");
    state.enemies.push(
      makeEnemy({
        pos: { x: state.players[0].pos.x + 150, y: state.players[0].pos.y },
      }),
    );
    expect(stepBotWeaponSwap({}, state)).toBe(false);
    expect(state.players[0].equipment.weapon.defId).toBe("test_revolver");
  });

  it("stays put with an empty pocket or nothing in any weapon's range", () => {
    const state = bladeHero();
    // A foe in shot range but no pocket banked: nothing to draw.
    const foe = makeEnemy({
      pos: { x: state.players[0].pos.x + 150, y: state.players[0].pos.y },
    });
    state.enemies.push(foe);
    expect(hasPocketShooter(state)).toBe(false);
    expect(stepBotWeaponSwap({}, state)).toBe(false);
    // A pocket banked but every foe out of its range: the swap is churn.
    state.players[0].inventory[0] = weapon(state, "test_wand");
    expect(hasPocketShooter(state)).toBe(true);
    foe.pos = { x: state.players[0].pos.x + 900, y: state.players[0].pos.y };
    expect(stepBotWeaponSwap({}, state)).toBe(false);
    expect(state.players[0].equipment.weapon.defId).toBe("crude_sword");
  });
});

describe("swap decision vs commit (botWeaponSwapTarget)", () => {
  // The decision is split out of the commit so the HOW TO PLAY demo can play
  // the swap as two taps and light the row the bot is REACHING for (see
  // pwa/src/game/game-screen/demo-director.ts). The split only holds up if the
  // target names exactly the cell the commit ends up drawing.
  it("names the cell the commit draws, and -1 whenever it stays put", () => {
    const state = bladeHero();
    const bot: SwapMemory = {};
    state.players[0].inventory[3] = weapon(state, "test_wand");
    const foe = makeEnemy({
      pos: { x: state.players[0].pos.x + 150, y: state.players[0].pos.y },
    });
    state.enemies.push(foe);
    // Out of blade reach: the pocket wand's cell is the answer, and asking
    // doesn't move the hand.
    expect(botWeaponSwapTarget(bot, state)).toBe(3);
    expect(state.players[0].equipment.weapon.defId).toBe("crude_sword");
    expect(stepBotWeaponSwap(bot, state)).toBe(true);
    expect(state.players[0].equipment.weapon.defId).toBe("test_wand");
    // Inside the anti-juggle gap the hand is settled — no target, no swap.
    foe.pos = { x: state.players[0].pos.x + 30, y: state.players[0].pos.y };
    expect(botWeaponSwapTarget(bot, state)).toBe(-1);
    expect(stepBotWeaponSwap(bot, state)).toBe(false);
    // Past the gap, the blade (banked in the wand's old cell) is the target.
    state.stats.timeMs += 500;
    expect(botWeaponSwapTarget(bot, state)).toBe(3);
    expect(stepBotWeaponSwap(bot, state)).toBe(true);
    expect(state.players[0].equipment.weapon.defId).toBe("crude_sword");
  });

  it("is pure — repeated asks never change the state or the answer", () => {
    const state = bladeHero();
    const bot: SwapMemory = {};
    state.players[0].inventory[0] = weapon(state, "test_wand");
    state.enemies.push(
      makeEnemy({
        pos: { x: state.players[0].pos.x + 150, y: state.players[0].pos.y },
      }),
    );
    const held = state.players[0].equipment.weapon.id;
    for (let i = 0; i < 5; i++) expect(botWeaponSwapTarget(bot, state)).toBe(0);
    expect(state.players[0].equipment.weapon.id).toBe(held);
    expect(bot.lastSwapMs).toBeUndefined();
  });
});

describe("pocket pick context (botPocketShooterIndex)", () => {
  /** Drop `n` minions shoulder to shoulder `at` px ahead of the hero — one
   * MASS, the thing a spread weapon is carried for. */
  function swarm(state: GameState, n: number, at: number) {
    for (let i = 0; i < n; i++) {
      state.enemies.push(
        makeEnemy({
          pos: {
            x: state.players[0].pos.x + at,
            y: state.players[0].pos.y + i * 20,
          },
        }),
      );
    }
  }

  it("prefers the crowd shot on a swarm and the single-target round on a boss", () => {
    const state = bladeHero();
    state.players[0].inventory[0] = weapon(state, "test_hailgun");
    state.players[0].inventory[1] = weapon(state, "test_revolver");
    // A minion swarm: the 4-pellet hailgun lands across the mass, which beats
    // the revolver's harder single round.
    swarm(state, 3, 150);
    expect(botPocketShooterIndex(state)).toBe(0);
    // A boss walks in: one big body cashes per-target DPS, not pellets — the
    // revolver takes the pocket.
    state.enemies.push(
      makeEnemy(
        { pos: { x: state.players[0].pos.x + 200, y: state.players[0].pos.y } },
        "test_boss",
      ),
    );
    expect(botPocketShooterIndex(state)).toBe(1);
  });

  it("cashes the round on a lone straggler — pellets need a crowd", () => {
    const state = bladeHero();
    state.players[0].inventory[0] = weapon(state, "test_hailgun");
    state.players[0].inventory[1] = weapon(state, "test_revolver");
    swarm(state, 1, 150);
    expect(botPocketShooterIndex(state)).toBe(1);
  });

  it("is RANGE aware — a spread that falls short loses to the round that reaches", () => {
    const state = bladeHero();
    state.players[0].inventory[0] = weapon(state, "test_scattergun"); // reach 160
    state.players[0].inventory[1] = weapon(state, "test_revolver"); // reach 240
    // The pack stands inside the scattergun's reach: its pellets win.
    swarm(state, 4, 130);
    expect(botPocketShooterIndex(state)).toBe(0);
    // The same pack, further out: the scattergun can't touch it, so the round
    // that reaches takes the pocket rather than a gun with nothing in range.
    for (const enemy of state.enemies)
      enemy.pos.x = state.players[0].pos.x + 200;
    expect(botPocketShooterIndex(state)).toBe(1);
  });
});

describe("intelligent re-picks (botWeaponSwapTarget)", () => {
  it("trades the spray for the round when a boss walks in on it", () => {
    const state = bladeHero();
    const bot: SwapMemory = {};
    state.players[0].inventory[0] = weapon(state, "test_hailgun");
    state.players[0].inventory[1] = weapon(state, "test_revolver");
    for (let i = 0; i < 3; i++) {
      state.enemies.push(
        makeEnemy({
          pos: {
            x: state.players[0].pos.x + 150,
            y: state.players[0].pos.y + i * 20,
          },
        }),
      );
    }
    // Out of blade reach against a mass: the spray goes in the hand.
    expect(stepBotWeaponSwap(bot, state)).toBe(true);
    expect(state.players[0].equipment.weapon.defId).toBe("test_hailgun");
    // A boss joins the fight. The hand is no longer the right tool — once the
    // re-pick gap lapses the hero puts the spray away for the round.
    state.enemies.push(
      makeEnemy(
        { pos: { x: state.players[0].pos.x + 180, y: state.players[0].pos.y } },
        "test_boss",
      ),
    );
    expect(stepBotWeaponSwap(bot, state)).toBe(false); // still mid-engagement
    state.stats.timeMs += 2500;
    expect(stepBotWeaponSwap(bot, state)).toBe(true);
    expect(state.players[0].equipment.weapon.defId).toBe("test_revolver");
  });

  it("draws the crowd gun MID-JUMP, gap or no gap", () => {
    const state = bladeHero();
    const bot: SwapMemory = { lastSwapMs: state.stats.timeMs }; // inside the gap
    state.players[0].equipment.weapon = weapon(state, "test_revolver");
    state.players[0].inventory[0] = weapon(state, "test_hailgun");
    for (let i = 0; i < 3; i++) {
      state.enemies.push(
        makeEnemy({
          pos: {
            x: state.players[0].pos.x + 150,
            y: state.players[0].pos.y + i * 20,
          },
        }),
      );
    }
    // On the ground the gap holds the hand still...
    expect(botWeaponSwapTarget(bot, state)).toBe(-1);
    // ...but a hop is shorter than the gap, so the pack the hero is sailing
    // over is met with the spray at the top of it.
    state.players[0].z = 20;
    expect(botWeaponSwapTarget(bot, state)).toBe(0);
  });

  it("puts a stronger find straight in the hand", () => {
    const state = bladeHero();
    const bot: SwapMemory = {};
    state.players[0].equipment.weapon = weapon(state, "test_pistol");
    state.enemies.push(
      makeEnemy({
        pos: { x: state.players[0].pos.x + 150, y: state.players[0].pos.y },
      }),
    );
    // Nothing better banked: the hand stays put.
    expect(botWeaponSwapTarget(bot, state)).toBe(-1);
    // A revolver drops into the bag — strictly better, so it needs no
    // contextual margin to earn the hand.
    state.players[0].inventory[2] = weapon(state, "test_revolver");
    expect(stepBotWeaponSwap(bot, state)).toBe(true);
    expect(state.players[0].equipment.weapon.defId).toBe("test_revolver");
  });

  it("picks the BLADE the moment wants, not just the strongest one banked", () => {
    const state = bladeHero();
    const bot: SwapMemory = {};
    state.players[0].inventory[0] = weapon(state, "test_hammer");
    // A body inside blade reach: the blade is the tool, and the heavy hammer
    // is the blade this moment wants.
    state.enemies.push(
      makeEnemy({
        pos: { x: state.players[0].pos.x + 20, y: state.players[0].pos.y },
      }),
    );
    expect(stepBotWeaponSwap(bot, state)).toBe(true);
    expect(state.players[0].equipment.weapon.defId).toBe("test_hammer");
    expect(state.players[0].inventory[0]?.defId).toBe("crude_sword");
  });
});

describe("pocket keepers (cullWorstLoot)", () => {
  it("keeps an answer to BOTH fights — the crowd spray and the boss round", () => {
    const state = bladeHero();
    const inv = state.players[0].inventory;
    inv[0] = weapon(state, "test_hailgun"); // the spray
    inv[1] = weapon(state, "test_revolver"); // the round
    for (let i = 2; i < inv.length; i++) {
      inv[i] = weapon(state, "blaster", { ilvl: 20 + i }); // fat, mid-tier junk
    }
    cullWorstLoot(state);
    expect(inv.some((c) => c?.defId === "test_hailgun")).toBe(true);
    expect(inv.some((c) => c?.defId === "test_revolver")).toBe(true);
  });

  it("never drops the pocket shot, even as the cheapest piece in a full bag", () => {
    const state = bladeHero();
    const inv = state.players[0].inventory;
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
    const inv = state.players[0].inventory;
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
