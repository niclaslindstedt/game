// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The SpaceZ space suit: the hero starts in plain clothes at HQ, becomes the
// astronaut once he dons the (epic) EVA suit, and is suited by default on
// every later level. Also covers the forced-tier loot roll that mints the
// suit as epic even though SpaceZ only rolls up to magic.

import { describe, expect, it } from "vitest";

import {
  computeMaxHp,
  createGame,
  dismissIntro,
  ENEMY_DEFS,
  gearDef,
  playerSuited,
  previewEquipped,
  rollEquipment,
  skipCutscene,
  type Equipment,
} from "@game/core";

import { SEED } from "../helpers.ts";

function spacez() {
  const state = createGame(SEED, "spacez_hq");
  skipCutscene(state);
  dismissIntro(state);
  return state;
}

function suit(state: ReturnType<typeof spacez>, tier: Equipment["tier"]) {
  return rollEquipment(state, { defId: "space_suit", tier });
}

describe("space suit", () => {
  it("leaves the hero unsuited at SpaceZ HQ until he equips it", () => {
    const state = spacez();
    expect(playerSuited(state)).toBe(false);

    state.player.equipment.suit = suit(state, "epic");
    expect(playerSuited(state)).toBe(true);
  });

  it("does not turn ordinary suit armor into the astronaut", () => {
    const state = spacez();
    state.player.equipment.suit = rollEquipment(state, {
      defId: "lab_coat",
      tier: "regular",
    });
    expect(playerSuited(state)).toBe(false);
  });

  it("keeps the hero suited by default on later levels", () => {
    const state = createGame(SEED, "moon");
    skipCutscene(state);
    dismissIntro(state);
    expect(playerSuited(state)).toBe(true);
  });

  it("mints as epic with its full affix count even on a magic-capped level", () => {
    const state = spacez();
    const rolled = suit(state, "epic");
    expect(rolled.tier).toBe("epic");
    // Epic carries two affixes (TIERS ladder) — the forced tier ignores the
    // level's magic-only tier table.
    expect(rolled.affixes).toHaveLength(2);
    expect(gearDef(rolled.defId).spacesuit).toBe(true);
  });

  it("is the Chief of Security's forced-epic guaranteed drop", () => {
    const drop = ENEMY_DEFS.security_chief!.loot!.items!.find(
      (entry) => typeof entry !== "string" && entry.defId === "space_suit",
    );
    expect(drop).toEqual({ defId: "space_suit", tier: "epic" });
  });

  it("previews its max-hp gain as an inventory upgrade delta", () => {
    const state = spacez();
    // A plain regular roll has no affixes, so the delta is exactly the def's
    // flat bonus — the number the inventory shows in green.
    const candidate = suit(state, "regular");
    const preview = previewEquipped(state, candidate);
    expect(computeMaxHp(preview) - computeMaxHp(state)).toBe(
      gearDef("space_suit").bonuses.maxHp,
    );
  });
});
