// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Wounded-sprite coverage: the renderer swaps every mob to damage-stage
// variants as hp falls (config.WOUNDS / LAST_STAND), so each enemy in the
// catalog must ship the generated frames for its role — minions "hurt",
// elites also "wrecked", bosses also "dying". Guards against adding a mob
// (or renaming a sprite) without regenerating its battle-damage looks.

import { readFileSync } from "node:fs";

import { ENEMY_DEFS, type EnemyRole } from "@game/core";
import { describe, expect, it } from "vitest";

const STAGES: Record<EnemyRole, string[]> = {
  minion: ["hurt"],
  elite: ["hurt", "wrecked"],
  boss: ["hurt", "wrecked", "dying"],
};

describe("wounded sprite variants", () => {
  // The committed sprite-atlas manifest is the shipping sprite inventory.
  const sprites = new Set(
    Object.keys(
      JSON.parse(
        readFileSync(
          new URL("../../website/src/game/assets/atlas.json", import.meta.url),
          "utf8",
        ),
      ),
    ),
  );

  for (const def of Object.values(ENEMY_DEFS)) {
    it(`${def.id} ships ${STAGES[def.role].join("/")} frames`, () => {
      for (const stage of STAGES[def.role]) {
        for (const frame of [0, 1]) {
          expect(
            sprites.has(`${def.sprite}_${stage}_${frame}`),
            `${def.sprite}_${stage}_${frame} missing from the atlas — run \`make assets\``,
          ).toBe(true);
        }
      }
    });
  }
});
