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
  MAP_BLUEPRINTS,
  resolveLevelDef,
  resolveChoice,
  SECRET_LEVEL_ORDER,
  skipCutscene,
  step,
  enemyDef,
  storyItemDef,
  type GameState,
} from "@game/core";

import { clearStage, DT, idle, makeEnemy, SEED } from "../helpers.ts";

const bunker = LEVELS.the_bunker!;
const BLUEPRINT = MAP_BLUEPRINTS.the_bunker!;
/** One representative vault — the map a run of the bunker actually builds. */
const carved = resolveLevelDef("the_bunker", SEED);
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
  state.players[0].disarmed = false;
  clearStage(state);
  state.enemies = [
    makeEnemy(
      {
        pos: { x: state.players[0].pos.x + 26, y: state.players[0].pos.y },
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
    // …and that drop is gated on the campaign: it names BOOT HILL as its
    // `requiresClear`, so a first pass (which reaches the Rift first) can't
    // stumble into the bunker early.
    expect(
      rasputin.loot?.items?.some(
        (i) =>
          typeof i !== "string" &&
          i.defId === "severed_hand" &&
          i.requiresClear === "boot_hill",
      ),
    ).toBe(true);
  });

  it("holds the SEVERED HAND until BOOT HILL is cleared, then drops it", () => {
    // A first-pass Rift run (Boot Hill not yet beaten): the hand stays latent.
    expect(droppedSeveredHand(killRasputinInRift([]))).toBe(false);
    // A post-campaign replay (Boot Hill cleared at this difficulty): it drops.
    expect(droppedSeveredHand(killRasputinInRift(["boot_hill"]))).toBe(true);
  });

  it("crescendos at THE VAULT WARDEN, standing on the exit", () => {
    // The ONE boss on the map, and the carve puts him where the run ends: the
    // exit stands at the goal cell's centre and he is posted beside it, so the
    // way out is through him. (The residents stay elites; the horde stays
    // minions.)
    expect(BLUEPRINT.boss?.enemy).toBe("vault_warden");
    expect(enemyDef("vault_warden").role).toBe("boss");
    const bosses = carved.spawns.filter(
      (s) => enemyDef(s.enemy).role === "boss",
    );
    expect(bosses.map((s) => s.enemy)).toEqual(["vault_warden"]);
    expect(enemyDef("vault_warden").loot?.storyItems).toContain("warden_key");
    expect(storyItemDef("warden_key").unlocks).toBe("vault_exit");

    // The objective is still to REACH the exit door, which leads to the rift,
    // and the door is drawn where the objective stands.
    expect(carved.objective.type).toBe("reachExit");
    if (carved.objective.type === "reachExit") {
      const exit = carved.landmarks.find((l) => l.kind === "bunker_exit")!;
      expect(exit.pos).toEqual(carved.objective.at);
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
    const horde = BLUEPRINT.horde.members.map((m) => m.enemy);
    for (const id of factions) {
      expect(ENEMY_DEFS[id]?.role, id).toBe("minion");
      expect(horde, id).toContain(id);
    }
    // The automated wardens: bolted SENTRY GUNS, deployed by the warden's own
    // defence grid rather than standing on the map waiting to be found.
    expect(ENEMY_DEFS.sentry_gun?.role).toBe("minion");
    expect(
      ENEMY_DEFS.vault_warden?.mechanics?.summon?.defId,
      "sentry_gun deployed by the warden",
    ).toBe("sentry_gun");
  });
});
