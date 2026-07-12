// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE BUNKER — the secret cow level's wiring. The ritual is never explained
// in-game, so these tests are the contract: RASPUTIN (the rift's doorman)
// drops the SEVERED HAND, the rift's latent gate opens with it and leads to
// the bunker, the bunker has no boss (its exit door is the objective, its
// outro the where-was-it mystery), and the way back is the rift.

import { describe, expect, it } from "vitest";

import {
  createGame,
  dismissIntro,
  ENEMY_DEFS,
  gearDef,
  LEVEL_ORDER,
  LEVELS,
  resolveChoice,
  SECRET_LEVEL_ORDER,
  skipCutscene,
  step,
  enemyDef,
  type GameState,
} from "@game/core";

import { clearStage, DT, idle, makeEnemy, SEED } from "../helpers.ts";

const bunker = LEVELS.the_bunker!;
const rift = LEVELS.the_rift!;

/** A rift run built with `clearedLevels`, armed, staged down to one RASPUTIN
 * at 1 hp beside the hero — then stepped until the doorman falls. */
function killRasputinInRift(clearedLevels: string[]): GameState {
  const state = createGame(
    SEED,
    "the_rift",
    "medium",
    undefined,
    false,
    clearedLevels,
  );
  skipCutscene(state);
  dismissIntro(state);
  state.player.disarmed = false;
  clearStage(state);
  state.enemies = [
    makeEnemy(
      {
        pos: { x: state.player.pos.x + 26, y: state.player.pos.y },
        hp: 1,
        maxHp: 360,
        powerScaled: true,
        spoke: true, // arrival scene already played; the drop is under test
      },
      "grigori_rasputin",
    ),
  ];
  // RASPUTIN is spareable: the killing blow leaves him kneeling in the choice
  // phase. Step to the verdict, then land KILL — the drop path that pays the
  // (gated) SEVERED HAND.
  for (
    let i = 0;
    i < 400 &&
    state.phase !== "choice" &&
    state.enemies.some((e) => e.defId === "grigori_rasputin");
    i++
  ) {
    step(state, idle, DT);
  }
  if (state.phase === "choice") resolveChoice(state, false);
  return state;
}

const droppedSeveredHand = (state: GameState): boolean =>
  state.items.some(
    (i) => i.kind === "equipment" && i.equipment.defId === "severed_hand",
  );

describe("the bunker", () => {
  it("is a secret venue: registered, but outside the campaign order", () => {
    expect(SECRET_LEVEL_ORDER).toContain("the_bunker");
    expect(LEVEL_ORDER).not.toContain("the_bunker");
    // Shares a campaign story index on purpose (the XP-cap axis must not
    // shift) — asserted structurally in catalog_test; pinned here too so a
    // re-index of the campaign revisits this choice deliberately.
    expect(LEVEL_ORDER.map((id) => LEVELS[id]!.index)).toContain(bunker.index);
  });

  it("opens from the rift: RASPUTIN's severed hand keys the latent gate", () => {
    const gate = (rift.gates ?? []).find((g) => g.to === "the_bunker");
    expect(gate).toBeDefined();
    expect(gate!.opensWith).toBe("severed_hand");
    expect(() => gearDef("severed_hand")).not.toThrow();
    // The key reads as junk on purpose: zero bonuses, base value.
    expect(gearDef("severed_hand").bonuses).toEqual({});

    // The doorman carries it — forced to the base tier so no affix roll ever
    // dresses it up. (Kill-only: sparing him keeps his equipment loot.)
    const rasputin = enemyDef("grigori_rasputin");
    expect(
      rasputin.loot?.items?.some(
        (i) => typeof i !== "string" && i.defId === "severed_hand",
      ),
    ).toBe(true);
    // …and that drop is gated on the campaign: it names EASTWORLD as its
    // `requiresClear`, so a first pass (which reaches the Rift first) can't
    // stumble into the bunker early.
    expect(
      rasputin.loot?.items?.some(
        (i) =>
          typeof i !== "string" &&
          i.defId === "severed_hand" &&
          i.requiresClear === "eastworld",
      ),
    ).toBe(true);
  });

  it("holds the SEVERED HAND until EASTWORLD is cleared, then drops it", () => {
    // A first-pass Rift run (Eastworld not yet beaten): the hand stays latent.
    expect(droppedSeveredHand(killRasputinInRift([]))).toBe(false);
    // A post-campaign replay (Eastworld cleared at this difficulty): it drops.
    expect(droppedSeveredHand(killRasputinInRift(["eastworld"]))).toBe(true);
  });

  it("has no boss: the exit door is the objective, the outro the mystery", () => {
    for (const spawn of bunker.spawns) {
      expect(enemyDef(spawn.enemy).role).not.toBe("boss");
    }
    expect(bunker.objective.type).toBe("reachExit");
    if (bunker.objective.type === "reachExit") {
      // The objective stands at the exit-door landmark.
      const exit = bunker.landmarks.find((l) => l.kind === "bunker_exit")!;
      expect(exit.pos).toEqual(bunker.objective.at);
    }
    // The closing monologue exists, and the way out leads back to the rift.
    expect(bunker.outro?.length ?? 0).toBeGreaterThan(0);
    expect(bunker.exitTo).toBe("the_rift");
  });

  it("fields the privatized security state as its horde", () => {
    const factions = [
      "cia_agent",
      "fbi_agent",
      "ice_agent",
      "soldier",
      "vacuum_bot",
    ];
    for (const id of factions) {
      expect(ENEMY_DEFS[id]?.role, id).toBe("minion");
      expect(
        bunker.waves?.budget.some((line) => line.enemy === id),
        id,
      ).toBe(true);
    }
  });
});
