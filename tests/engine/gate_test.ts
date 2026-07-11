// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Travel gates and the bossless exit objective (the cow-level plumbing):
// a latent `LevelDef.gates` entry stays off the board until its key trinket
// is USED on that level (`spendGateKey` consumes it, tears the gate open a
// step ahead, and leaves a landmark for the renderer); stepping into the
// open gate books a one-shot `gateEntered` the app answers with the actual
// travel. A `reachExit` objective ends a bossless level at its exit door —
// countdown, outro, victory — and the scrap sweep never culls a gate key,
// zero stats or not.

import { describe, expect, it } from "vitest";

import {
  GATES,
  gateKeyTarget,
  isScrappableLoot,
  isSpecialItem,
  scrapInferiorLoot,
  step,
  spendGateKey,
  type Equipment,
  type GameState,
} from "@game/core";

import { clearStage, DT, idle, run, startGame } from "./helpers.ts";

/** Mint the fixture gate key as a plain bag trinket (zero stats, base tier). */
function gateKey(id = 501): Equipment {
  return {
    id,
    defId: "test_gate_key",
    slot: "charm",
    tier: "regular",
    ilvl: 1,
    affixes: [],
  };
}

/** A quiet run on the gated level with the key in bag cell 0. */
function startWithKey(): GameState {
  const state = startGame(42, "test_gate_level");
  clearStage(state);
  state.player.inventory[0] = gateKey();
  return state;
}

describe("travel gates", () => {
  it("stays latent until the key is USED, then stands where the hero is", () => {
    const state = startWithKey();
    expect(state.gates).toEqual([]);

    expect(spendGateKey(state, 0)).toBe(true);
    // The key is spent, the gate stands a step ahead, and the renderer got
    // its landmark — all from one call.
    expect(state.player.inventory[0]).toBeNull();
    expect(state.gates).toHaveLength(1);
    const gate = state.gates[0]!;
    expect(gate.to).toBe("test_exit_level");
    expect(gate.entered).toBe(false);
    expect(gate.pos.x).toBeCloseTo(state.player.pos.x + GATES.summonDistance);
    expect(state.landmarks.some((l) => l.kind === "test_gate")).toBe(true);
    expect(
      state.events.some(
        (e) => e.type === "gateOpened" && e.to === "test_exit_level",
      ),
    ).toBe(true);
  });

  it("refuses a second opening and keys on the wrong level", () => {
    const state = startWithKey();
    expect(spendGateKey(state, 0)).toBe(true);
    // Same gate again: refused, nothing consumed.
    state.player.inventory[0] = gateKey(502);
    expect(spendGateKey(state, 0)).toBe(false);
    expect(state.player.inventory[0]).not.toBeNull();

    // On a level with no gate wired to the key, the trinket is inert.
    const elsewhere = startGame(42, "test_level");
    clearStage(elsewhere);
    elsewhere.player.inventory[0] = gateKey(503);
    expect(gateKeyTarget(elsewhere, elsewhere.player.inventory[0]!)).toBeNull();
    expect(spendGateKey(elsewhere, 0)).toBe(false);
    expect(elsewhere.player.inventory[0]).not.toBeNull();
  });

  it("advertises the USE affordance only while the gate is still latent", () => {
    const state = startWithKey();
    const key = state.player.inventory[0]!;
    expect(gateKeyTarget(state, key)).toEqual({
      id: "test_gate",
      to: "test_exit_level",
    });
    spendGateKey(state, 0);
    expect(gateKeyTarget(state, gateKey(504))).toBeNull();
  });

  it("books gateEntered exactly once when the hero steps in", () => {
    const state = startWithKey();
    spendGateKey(state, 0);
    const gate = state.gates[0]!;

    // Standing short of the doorstep: no crossing.
    step(state, idle, DT);
    expect(state.events.some((e) => e.type === "gateEntered")).toBe(false);

    state.player.pos = { ...gate.pos };
    step(state, idle, DT);
    expect(
      state.events.filter(
        (e) => e.type === "gateEntered" && e.to === "test_exit_level",
      ),
    ).toHaveLength(1);
    expect(gate.entered).toBe(true);

    // Latched: standing in the doorway forever books nothing more.
    step(state, idle, DT);
    expect(state.events.some((e) => e.type === "gateEntered")).toBe(false);
  });

  it("never lets the scrap sweep cull a gate key", () => {
    const state = startWithKey();
    // Wear a strictly better charm so the zero-stat key would otherwise be
    // exactly the junk the sweep exists to cull.
    state.player.equipment.charm = {
      id: 600,
      defId: "test_charm",
      slot: "charm",
      tier: "regular",
      ilvl: 1,
      affixes: [],
    };
    const key = state.player.inventory[0]!;
    expect(isSpecialItem(key)).toBe(true);
    expect(isScrappableLoot(state, key)).toBe(false);
    scrapInferiorLoot(state);
    expect(state.player.inventory[0]).not.toBeNull();
  });
});

describe("the reachExit objective", () => {
  it("ends a bossless level at the exit door: countdown, outro, victory", () => {
    const state = startGame(42, "test_exit_level");
    clearStage(state);

    // No boss anywhere, yet the run does not clear from afar.
    run(state, idle, 20);
    expect(state.victoryCountdownMs).toBeNull();

    // Standing at the door arms the countdown (and the outro's quake).
    state.player.pos = { x: 2130, y: 260 };
    step(state, idle, DT);
    expect(state.victoryCountdownMs).not.toBeNull();
    expect(state.quakeMs).toBeGreaterThan(0);

    // The countdown expires into the OUTRO (the level ships closing pages),
    // with the victory event booked at expiry.
    let sawVictory = false;
    for (let i = 0; i < 400 && state.phase === "playing"; i++) {
      step(state, idle, DT);
      sawVictory ||= state.events.some((e) => e.type === "victory");
    }
    expect(sawVictory).toBe(true);
    expect(state.phase).toBe("outro");
  });
});
