// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// AMMUNITION — the resource a RANGED weapon spends instead of wearing out: the
// pouch and its per-kind cap, one round per TRIGGER PULL (never per pellet),
// the dry weapon that cannot fire, the swap it triggers, and the mercy rope
// that hangs when there is nothing left to swap to.
//
// Runs on the synthetic fixtures: `test_carbine` is the one that plays by the
// shipped ranged rule (eats `bullets`, carries no durability), which is why
// every arrangement below arms the hero with it explicitly.

import { describe, expect, it } from "vitest";

import {
  AMMO,
  AMMO_TYPES,
  ammoCount,
  bankAmmo,
  hasAmmoFor,
  outOfAmmoDesperation,
  rollEquipment,
  startingAmmo,
  step,
  weaponAmmoLeft,
  weaponAmmoType,
  weaponDef,
} from "@game/core";
import type { Equipment, GameState, Player } from "@game/core";

import { clearStage, DT, idle, makeEnemy, run, startGame } from "./helpers.ts";

function weapon(id: number, defId: string): Equipment {
  const def = weaponDef(defId);
  return {
    id,
    defId,
    slot: "weapon",
    tier: "regular",
    ilvl: 5,
    affixes: [],
    ...(def.durability === undefined ? {} : { durability: def.durability }),
  };
}

/** Arm the hero with a fixture weapon, clearing the stage first so nothing
 * else is spending his cooldown. */
function arm(state: GameState, defId: string): Equipment {
  const piece = weapon(state.nextId++, defId);
  state.players[0].equipment.weapon = piece;
  state.players[0].weaponCooldownMs = 0;
  return piece;
}

/** A monster in shooting range that soaks hits without dying or clawing back —
 * something for the trigger to have a reason to pull at. */
function addTarget(state: GameState): void {
  state.enemies.push(
    makeEnemy({
      pos: { x: state.players[0].pos.x + 120, y: state.players[0].pos.y },
      hp: 1_000_000,
      maxHp: 1_000_000,
      contactCooldownMs: 1e9,
    }),
  );
}

/** Empty every stack in the pouch — a hero with nothing to fire. */
function emptyPouch(player: Player): void {
  player.ammo = {};
}

describe("what a weapon eats", () => {
  it("a ranged weapon names a kind; melee and magic name none", () => {
    expect(weaponAmmoType(weapon(1, "test_carbine"))).toBe("bullets");
    expect(weaponAmmoType(weapon(2, "test_hammer"))).toBeUndefined();
    expect(weaponAmmoType(weapon(3, "test_wand"))).toBeUndefined();
  });

  it("a weapon that eats nothing reads as infinitely loaded", () => {
    const state = startGame();
    const hammer = weapon(state.nextId++, "test_hammer");
    emptyPouch(state.players[0]);
    // The whole point of the Infinity: a melee weapon never has to be
    // special-cased at a call site that asks "can this still fire".
    expect(weaponAmmoLeft(state.players[0], hammer)).toBe(Infinity);
    expect(hasAmmoFor(state.players[0], hammer)).toBe(true);
  });

  it("an armor piece is asked the question and answers none", () => {
    // `ammoKindFor` walks whole bags, and a bag is mostly armor — asking the
    // WEAPON catalog about a charm used to throw.
    const charm: Equipment = {
      id: 1,
      defId: "test_charm",
      slot: "trinket",
      tier: "regular",
      ilvl: 5,
      affixes: [],
    };
    expect(weaponAmmoType(charm)).toBeUndefined();
  });
});

describe("the opening holster", () => {
  it("stocks the weapon in the hero's hand, not just the sidearm's kind", () => {
    const state = startGame();
    const held = weaponAmmoType(state.players[0].equipment.weapon);
    // Whatever the difficulty armed him with, he can fire it — the bug this
    // pins is EASY's shotgun opening beside a hundred rounds of the wrong kind.
    if (held !== undefined) {
      expect(ammoCount(state.players[0], held)).toBe(AMMO.starting);
    }
    // …and NOTHING ELSE. There is no fallback gun behind the hero any more —
    // an empty hand is an empty hand — so the pouch carries exactly the one
    // kind he can fire, and the foot rail never opens a shotgun run reading
    // "100 BULLETS, 100 CELLS".
    for (const kind of AMMO_TYPES) {
      if (kind === held) continue;
      expect(ammoCount(state.players[0], kind)).toBe(0);
    }
  });

  it("stocks the held kind, and opens empty for a weapon that eats none", () => {
    expect(startingAmmo("test_carbine").bullets).toBe(AMMO.starting);
    // A MELEE opening carries no rounds at all: nothing the hero holds — now
    // or when his weapon breaks — can fire one. The shipped ladder's own half
    // of this is `tests/content/ammo_content_test.ts`.
    expect(Object.keys(startingAmmo("test_hammer"))).toEqual([]);
  });
});

describe("the pouch", () => {
  it("stacks each kind to its own cap, independently", () => {
    const state = startGame();
    const player = state.players[0];
    emptyPouch(player);
    expect(bankAmmo(player, "bullets", AMMO.stackCap + 50)).toBe(AMMO.stackCap);
    expect(ammoCount(player, "bullets")).toBe(AMMO.stackCap);
    // A full quiver of one kind never blocks another.
    expect(bankAmmo(player, "arrows", 30)).toBe(30);
    expect(ammoCount(player, "arrows")).toBe(30);
  });

  it("a nearly-full stack SKIMS a box and leaves the remainder", () => {
    const state = startGame();
    const player = state.players[0];
    emptyPouch(player);
    bankAmmo(player, "bullets", AMMO.stackCap - 6);
    // Six fit; the other fourteen are the caller's problem to re-ground, which
    // is exactly what the return value is for.
    expect(bankAmmo(player, "bullets", 20)).toBe(6);
    expect(ammoCount(player, "bullets")).toBe(AMMO.stackCap);
    // A stack already at the cap takes nothing at all — the box is untouched.
    expect(bankAmmo(player, "bullets", 20)).toBe(0);
  });
});

describe("firing spends rounds", () => {
  it("one round per TRIGGER PULL, whatever the shot throws", () => {
    const state = startGame();
    clearStage(state);
    arm(state, "test_carbine");
    addTarget(state);
    const player = state.players[0];
    emptyPouch(player);
    bankAmmo(player, "bullets", 50);
    run(state, idle, 400, (s) => s.stats.shotsFired > 0);
    expect(state.stats.shotsFired).toBe(1);
    expect(ammoCount(player, "bullets")).toBe(49);
  });

  it("keeps firing until the stack is gone, one round at a time", () => {
    const state = startGame();
    clearStage(state);
    arm(state, "test_carbine");
    addTarget(state);
    const player = state.players[0];
    emptyPouch(player);
    bankAmmo(player, "bullets", 4);
    // Long enough for far more than four cooldowns to come round: the stack,
    // not the clock, is what stops him. Stopped on the round the stack runs out
    // — the tick AFTER that is the dry swap, and the fallback weapon's own
    // shots are not what this is counting.
    run(state, idle, 1200, (s) => ammoCount(s.players[0], "bullets") === 0);
    expect(state.stats.shotsFired).toBe(4);
    expect(ammoCount(player, "bullets")).toBe(0);
  });

  it("a melee swing spends nothing at all", () => {
    const state = startGame();
    clearStage(state);
    arm(state, "test_hammer");
    state.enemies.push(
      makeEnemy({
        pos: { x: state.players[0].pos.x + 30, y: state.players[0].pos.y },
        hp: 1_000_000,
        maxHp: 1_000_000,
        contactCooldownMs: 1e9,
      }),
    );
    const player = state.players[0];
    emptyPouch(player);
    bankAmmo(player, "bullets", 50);
    run(state, idle, 400, (s) => s.stats.damageDealt > 0);
    expect(ammoCount(player, "bullets")).toBe(50);
  });

  it("a ranged weapon mints with NO durability — it runs dry, it never wears", () => {
    const state = startGame();
    state.fxRng = () => 0.5;
    const rolled = rollEquipment(state, state.players[0], {
      defId: "test_carbine",
      quality: "normal",
    });
    expect(rolled.durability).toBeUndefined();
    expect(weaponDef("test_carbine").durability).toBeUndefined();
  });
});

describe("a dry weapon", () => {
  it("cannot fire, and never gets the chance to try", () => {
    const state = startGame();
    clearStage(state);
    const dry = arm(state, "test_carbine");
    addTarget(state);
    const player = state.players[0];
    emptyPouch(player);
    expect(hasAmmoFor(player, dry)).toBe(false);
    run(state, idle, 400);
    // Not one round of its kind was spent, and the empty weapon left the hand
    // on the first tick that reached for its trigger — a hero standing in a
    // fight holding something that cannot fire is the softlock, not the rule.
    expect(ammoCount(player, "bullets")).toBe(0);
    expect(player.equipment.weapon.id).not.toBe(dry.id);
  });

  it("is stowed for something in the bag the hero CAN fight with", () => {
    const state = startGame();
    clearStage(state);
    const dry = arm(state, "test_carbine");
    addTarget(state);
    const player = state.players[0];
    emptyPouch(player);
    // A hammer in the bag is an answer to an empty pouch; a second dry carbine
    // would not be.
    player.inventory[0] = weapon(state.nextId++, "test_hammer");
    step(state, idle, DT);
    expect(player.equipment.weapon.defId).toBe("test_hammer");
    // …and the empty one is kept, not dropped: he is going to reload it.
    expect(player.inventory.some((cell) => cell?.id === dry.id)).toBe(true);
    expect(state.events.some((e) => e.type === "weaponDry")).toBe(true);
  });

  it("falls back to BARE HANDS when the bag holds nothing loaded", () => {
    const state = startGame();
    clearStage(state);
    const dry = arm(state, "test_carbine");
    addTarget(state);
    const player = state.players[0];
    emptyPouch(player);
    // A second empty carbine is no answer to an empty carbine — but the
    // sidearm is MINTED rather than carried, so it is always the last one.
    // Without it the hero stood in the fight holding a weapon that could not
    // fire, could therefore not earn a kill, and so could never reach the drop
    // that would have handed him a box: a softlock, not a setback.
    player.inventory[0] = weapon(state.nextId++, "test_carbine");
    step(state, idle, DT);
    expect(player.equipment.weapon.defId).toBe("fists");
    expect(state.events.some((e) => e.type === "weaponDry")).toBe(true);
    // …and the empty weapon is kept, not destroyed: he is going to reload it.
    expect(player.inventory.some((cell) => cell?.id === dry.id)).toBe(true);
  });
});

describe("the mercy rope", () => {
  it("hangs only for a hero with no other way to fight", () => {
    const state = startGame();
    clearStage(state);
    arm(state, "test_carbine");
    const player = state.players[0];
    emptyPouch(player);
    expect(outOfAmmoDesperation(state, player)).toBe(1);
  });

  it("stays silent while a usable weapon waits in the bag", () => {
    const state = startGame();
    clearStage(state);
    arm(state, "test_carbine");
    const player = state.players[0];
    emptyPouch(player);
    player.inventory[0] = weapon(state.nextId++, "test_hammer");
    // A dry rifle with a hammer in the bag is a DECISION, not a dead end — and
    // the engine makes it for him anyway.
    expect(outOfAmmoDesperation(state, player)).toBe(0);
  });

  it("stays silent for a hero holding something that eats nothing", () => {
    const state = startGame();
    clearStage(state);
    arm(state, "test_hammer");
    const player = state.players[0];
    emptyPouch(player);
    expect(outOfAmmoDesperation(state, player)).toBe(0);
  });

  it("is silent while the pouch is comfortable", () => {
    const state = startGame();
    clearStage(state);
    arm(state, "test_carbine");
    const player = state.players[0];
    emptyPouch(player);
    bankAmmo(player, "bullets", AMMO.stackCap);
    expect(outOfAmmoDesperation(state, player)).toBe(0);
  });
});

describe("picking a box up", () => {
  it("banks into the pouch and the box leaves the field", () => {
    const state = startGame();
    clearStage(state);
    const player = state.players[0];
    emptyPouch(player);
    state.items.push({
      id: state.nextId++,
      kind: "ammo",
      pos: { ...player.pos },
      ammo: "bullets",
      count: 25,
    });
    step(state, idle, DT);
    expect(ammoCount(player, "bullets")).toBe(25);
    expect(state.items.some((i) => i.kind === "ammo")).toBe(false);
  });

  it("a nearly-full pouch skims it and leaves the rest lying there", () => {
    const state = startGame();
    clearStage(state);
    const player = state.players[0];
    emptyPouch(player);
    bankAmmo(player, "bullets", AMMO.stackCap - 5);
    state.items.push({
      id: state.nextId++,
      kind: "ammo",
      pos: { ...player.pos },
      ammo: "bullets",
      count: 25,
    });
    step(state, idle, DT);
    expect(ammoCount(player, "bullets")).toBe(AMMO.stackCap);
    const left = state.items.find((i) => i.kind === "ammo");
    expect(left).toBeDefined();
    expect(left && left.kind === "ammo" ? left.count : 0).toBe(20);
  });
});
