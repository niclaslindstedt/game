// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// PER-PLAYER DEATH (src/game/downed.ts): a hero who
// falls while the party still stands goes DOWN — their own toll, a corpse
// holding their worn kit, and the `respawn` verb back — and one death never
// ends anybody else's game. Every rule is pinned beside the one that matters
// most: SOLO IS UNTOUCHED, because one hero at 0 hp is the party wiped and the
// wipe path owns that tick exactly as it always has.

import { describe, expect, it } from "vitest";

import {
  applyRunCommand,
  CORPSE,
  partyWiped,
  runLevelDef,
  seatHero,
  step,
  type GameState,
  type Player,
} from "@game/core";

import { DT, idle, startGame, stopWaves } from "./helpers.ts";

/** A run with a second hero seated, the stage cleared for surgery. */
function party(seed = 7): { state: GameState; a: Player; b: Player } {
  const state = startGame(seed);
  stopWaves(state);
  state.enemies = [];
  const b = seatHero(state, null);
  return { state, a: state.players[0], b };
}

/** Fell a hero the way combat does — hp to 0 — and let the step's own down
 * sweep judge it. */
function fell(state: GameState, hero: Player): void {
  hero.hp = 0;
  step(state, idle, DT);
}

describe("a hero falling in a party", () => {
  it("goes DOWN without ending anyone else's game", () => {
    const { state, b } = party();
    fell(state, b);
    expect(state.phase).toBe("playing");
    expect(b.downed).toBe(true);
    expect(partyWiped(state)).toBe(false);
    const down = state.events.find((e) => e.type === "heroDown");
    expect(down).toMatchObject({ seat: 1 });
  });

  it("leaves a corpse holding the worn kit, and hands the body the sidearm", () => {
    const { state, b } = party();
    const weaponId = b.equipment.weapon.id;
    b.pos = { x: 333, y: 222 };
    fell(state, b);
    expect(state.corpses).toHaveLength(1);
    const corpse = state.corpses[0]!;
    expect(corpse.seat).toBe(1);
    expect(corpse.pos).toEqual({ x: 333, y: 222 });
    // The real weapon went to the corpse…
    expect(corpse.gear.some((g) => g.item.id === weaponId)).toBe(true);
    // …and the never-empty hand holds the minted fallback.
    expect(b.equipment.weapon.defId).toBe("blaster");
  });

  it("bills the fallen hero's own toll, and nobody else's", () => {
    const { state, a, b } = party();
    a.xp = 1000;
    b.xp = 1000;
    fell(state, b);
    expect(b.xp).toBeLessThan(1000);
    expect(a.xp).toBe(1000);
    const down = state.events.find((e) => e.type === "heroDown");
    expect(down && "xpLost" in down ? down.xpLost : 0).toBe(1000 - b.xp);
  });

  it("never bills a fall twice — a later wipe skips the already-downed", () => {
    const { state, a, b } = party();
    a.xp = 1000;
    b.xp = 1000;
    fell(state, b);
    const afterFall = b.xp;
    // Now the rest of the party falls too: the wipe tolls A, not B again.
    fell(state, a);
    expect(state.phase).toBe("dying");
    expect(a.xp).toBeLessThan(1000);
    expect(b.xp).toBe(afterFall);
  });

  it("responds to the respawn verb: up at the level's start, at full health", () => {
    const { state, b } = party();
    fell(state, b);
    expect(applyRunCommand(state, "respawn", [], b)).toBe(true);
    expect(b.downed).toBeFalsy();
    expect(b.hp).toBe(b.maxHp);
    expect(b.pos).toEqual(runLevelDef(state).playerSpawn);
    // The world answers for them again.
    expect(partyWiped(state)).toBe(false);
  });

  it("refuses respawn for anybody not actually down", () => {
    const { state, a, b } = party();
    expect(applyRunCommand(state, "respawn", [], a)).toBe(false);
    fell(state, b);
    b.departed = true;
    expect(applyRunCommand(state, "respawn", [], b)).toBe(false);
  });

  it("lets only the owner recover the corpse, gear back where it came off", () => {
    const { state, a, b } = party();
    const weaponId = b.equipment.weapon.id;
    b.pos = { x: 333, y: 222 };
    fell(state, b);
    applyRunCommand(state, "respawn", [], b);
    // A stranger stands on the body all day and takes nothing.
    a.pos = { x: 333, y: 222 };
    step(state, idle, DT);
    expect(state.corpses).toHaveLength(1);
    // The owner walks back and the kit returns — the real weapon swaps the
    // minted sidearm out of the hand.
    b.pos = { x: 333 - CORPSE.recoverRadius / 2, y: 222 };
    step(state, idle, DT);
    expect(state.corpses).toHaveLength(0);
    expect(b.equipment.weapon.id).toBe(weaponId);
    expect(state.events.some((e) => e.type === "corpseRecovered")).toBe(true);
  });

  it("keeps unrecovered pieces on the corpse when the bag is full", () => {
    const { state, b } = party();
    fell(state, b);
    applyRunCommand(state, "respawn", [], b);
    // No room anywhere: every cell taken and a real weapon already in hand.
    const filler = () => ({
      id: state.nextId++,
      defId: b.equipment.weapon.defId,
      slot: "weapon" as const,
      tier: "regular" as const,
      ilvl: 1,
      affixes: [],
    });
    b.inventory = b.inventory.map(filler);
    // A real find in the hand — not the minted fallback, which recovery is
    // allowed to swap out.
    b.equipment.weapon = { ...filler(), tier: "magic" };
    const corpse = state.corpses[0]!;
    const held = corpse.gear.length;
    b.pos = { ...corpse.pos };
    step(state, idle, DT);
    // Nothing was destroyed: the body simply keeps holding it.
    expect(state.corpses).toHaveLength(1);
    expect(state.corpses[0]!.gear).toHaveLength(held);
  });
});

describe("solo death is byte-identical (the no-op guarantee)", () => {
  it("wipes on the same tick, mints no corpse, sets no flag", () => {
    const state = startGame();
    stopWaves(state);
    state.enemies = [];
    const hero = state.players[0];
    hero.xp = 1000;
    hero.hp = 0;
    step(state, idle, DT);
    // The wipe path took the tick whole: the death scene, the party toll —
    // and none of the downed machinery so much as stirred.
    expect(state.phase).toBe("dying");
    expect(state.corpses).toHaveLength(0);
    expect(hero.downed).toBeUndefined();
    expect(hero.xp).toBeLessThan(1000);
    expect(state.events.some((e) => e.type === "playerDeath")).toBe(true);
    expect(state.events.some((e) => e.type === "heroDown")).toBe(false);
  });
});
