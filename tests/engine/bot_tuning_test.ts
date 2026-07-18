// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The bot-tuning resolver (src/game/bot-tuning.ts): the per-level BotTuning is
// the shipped defaults, then the generated `default` layer, then the level's own
// overrides — a pure merge (incl. the nested posture rows), so a botted run stays
// deterministic. Synthetic overrides only (no shipped content ids).

import { describe, expect, it } from "vitest";

import {
  BOT_TUNING_DEFAULTS,
  resolveBotTuning,
  type BotTuningOverrides,
} from "@game/core";

describe("resolveBotTuning", () => {
  it("returns the shipped defaults when nothing overrides", () => {
    const overrides: BotTuningOverrides = { default: {}, byLevel: {} };
    expect(resolveBotTuning(overrides, "anything")).toEqual(
      BOT_TUNING_DEFAULTS,
    );
  });

  it("layers the global default over the shipped defaults", () => {
    const overrides: BotTuningOverrides = {
      default: { engageRangeFrac: 0.5 },
      byLevel: {},
    };
    const tune = resolveBotTuning(overrides, "anything");
    expect(tune.engageRangeFrac).toBe(0.5);
    // Untouched knobs keep the shipped default.
    expect(tune.graspStandoff).toBe(BOT_TUNING_DEFAULTS.graspStandoff);
  });

  it("layers a per-level override over the global default", () => {
    const overrides: BotTuningOverrides = {
      default: { armApproachStandoff: 120 },
      byLevel: { lvl_a: { armApproachStandoff: 200 } },
    };
    expect(resolveBotTuning(overrides, "lvl_a").armApproachStandoff).toBe(200);
    // A level without its own override falls through to the default layer.
    expect(resolveBotTuning(overrides, "lvl_b").armApproachStandoff).toBe(120);
  });

  it("deep-merges a single posture row without dropping the others", () => {
    const overrides: BotTuningOverrides = {
      default: {},
      byLevel: { lvl_a: { postures: { aggro: { standoffMul: 0.4 } } } },
    };
    const tune = resolveBotTuning(overrides, "lvl_a");
    // The overridden field changes…
    expect(tune.postures.aggro.standoffMul).toBe(0.4);
    // …its sibling fields survive…
    expect(tune.postures.aggro.fleeHp).toBe(
      BOT_TUNING_DEFAULTS.postures.aggro.fleeHp,
    );
    // …and the untouched postures are intact.
    expect(tune.postures.flee).toEqual(BOT_TUNING_DEFAULTS.postures.flee);
  });

  it("does not mutate the shared defaults", () => {
    const overrides: BotTuningOverrides = {
      default: { graspStandoff: 999 },
      byLevel: { lvl_a: { postures: { balanced: { surround: 42 } } } },
    };
    resolveBotTuning(overrides, "lvl_a");
    expect(BOT_TUNING_DEFAULTS.graspStandoff).toBe(72);
    expect(BOT_TUNING_DEFAULTS.postures.balanced.surround).toBe(5);
  });
});
