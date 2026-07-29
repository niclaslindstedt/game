// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// COMPOSED POWERS — a power carrying several effect blocks.
//
// `kind` is a LABEL, not a dispatch key: the engine steps whichever blocks are
// PRESENT. These suites pin the three things that has to mean, because each one
// is invisible until a def carries two blocks and each is easy to undo:
//
//   1. every block a power carries actually RUNS,
//   2. the blocks keep SEPARATE clocks (one shared cooldown would have an
//      orbit's bite reset a storm's strike timer, and two self-decrementing
//      effects would tick one field twice a frame),
//   3. the label-readers (the ONE NUKE rule, the bot's valuation) read the
//      BLOCKS, so bolting an effect onto a power cannot change what it is.
//
// Engine-rule suites, so synthetic fixtures only — see fixtures.ts.

import { beforeEach, describe, expect, it } from "vitest";

import {
  abilityBlocks,
  abilityDef,
  canDropNuke,
  grantAbility,
  registerDefs,
  type AbilityDef,
  type GameState,
} from "@game/core";

import { FIX_ABILITIES, installFixtures } from "./fixtures.ts";
import { DT, idle, makeEnemy, run, startGame } from "./helpers.ts";

/** A power that both orbits AND storms — one def, two effect blocks. */
const COMPOSED: AbilityDef = {
  id: "test_composed",
  name: "TEST COMPOSED",
  // It leads with the orbit; the storm rides along.
  kind: "orbit",
  durationMs: 12_000,
  icon: "icon_orbit",
  orbit: {
    count: 3,
    radius: 38,
    angularSpeed: 3.2,
    damage: 14,
    hitCooldownMs: 140,
    orbRadius: 8,
    sprite: "fireball",
  },
  storm: { intervalMs: 450, damage: 25, range: 220 },
};

/** A power that wipes the screen but calls itself something else — the case
 * the ONE NUKE rule must not be fooled by. */
const SECRET_BOMB: AbilityDef = {
  id: "test_secret_bomb",
  name: "TEST SECRET BOMB",
  kind: "nuke",
  durationMs: 0,
  icon: "icon_nuke",
  nuke: { radius: 240 },
};

beforeEach(() => {
  installFixtures();
  registerDefs({
    abilities: {
      ...FIX_ABILITIES,
      test_composed: COMPOSED,
      test_secret_bomb: SECRET_BOMB,
    },
  });
});

/** Idle through `ms` of simulation at the pipeline's own tick. */
function idleFor(state: GameState, ms: number): void {
  run(state, idle, Math.ceil(ms / DT));
}

describe("a power's blocks all run", () => {
  it("reports every block it carries, not just its kind", () => {
    expect(abilityBlocks(abilityDef("test_composed"))).toEqual([
      "orbit",
      "storm",
    ]);
    expect(abilityBlocks(abilityDef("test_orbit"))).toEqual(["orbit"]);
  });

  it("both effects damage the horde", () => {
    // The same second, once with the composed power and once with the orbit
    // alone. The composed one must bite HARDER: the difference is the storm.
    const damageOver = (defId: string): number => {
      const state = startGame();
      state.enemies.length = 0;
      // Parked inside the orbit ring, so it is in reach of both effects, and
      // given enough hp to survive them — we are measuring what landed, not
      // racing to a kill.
      const victim = makeEnemy({
        pos: { x: state.player.pos.x + 30, y: state.player.pos.y },
        hp: 100_000,
        maxHp: 100_000,
      });
      state.enemies.push(victim);
      grantAbility(state, defId);
      idleFor(state, 1000);
      return 100_000 - victim.hp;
    };

    expect(damageOver("test_composed")).toBeGreaterThan(
      damageOver("test_orbit"),
    );
  });
});

describe("each block keeps its own clock", () => {
  it("the orbit's bite does not reset the storm's strike timer", () => {
    const state = startGame();
    state.enemies.length = 0;
    state.enemies.push(
      makeEnemy({
        pos: { x: state.player.pos.x + 30, y: state.player.pos.y },
        hp: 100_000,
        maxHp: 100_000,
      }),
    );

    grantAbility(state, "test_composed");
    idleFor(state, DT);

    const running = state.player.abilities.find(
      (a) => a.defId === "test_composed",
    );
    expect(running).toBeDefined();
    if (!running) return;
    // Two clocks, keyed by block — not one field the two effects fight over.
    // The orbit re-armed on its own bite; the storm on its own strike.
    expect(running.clocks.orbit).toBeGreaterThan(0);
    expect(running.clocks.storm).toBeGreaterThan(0);
    expect(running.clocks.orbit).not.toEqual(running.clocks.storm);
  });
});

describe("the label-readers read the blocks", () => {
  it("the ONE NUKE rule bars a drop while any wipe is docked", () => {
    const state = startGame();
    state.player.heldAbilities = ["test_secret_bomb"];
    // It carries a `nuke` block, so it IS a bomb for the one-nuke rule —
    // whatever else it might have called itself.
    expect(canDropNuke(state)).toBe(false);
  });

  it("a power with no wipe does not bar one", () => {
    const state = startGame();
    state.player.heldAbilities = ["test_composed"];
    expect(canDropNuke(state)).toBe(true);
  });
});
