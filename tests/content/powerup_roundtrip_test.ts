// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The powerup guard: the powers are authored as content
// (`content/powerups.yaml`) and compiled into the engine's AbilityDef catalog
// by scripts/generate-powerups.mjs. This test pins the compiled output to a
// snapshot, so a rebalance of a shipped power is always a deliberate,
// reviewable snapshot update rather than a silent drift — and a broken compile
// (a dropped block, a mis-stamped id) fails the build instead of the fight.
//
// If a change to a shipped powerup is intentional, regenerate the snapshot:
//   npm run levels && node scripts/update-powerup-snapshot.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { ABILITY_DEFS } from "@game/core";

const snapshot = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL("./fixtures/powerups-snapshot.json", import.meta.url),
    ),
    "utf8",
  ),
) as Record<string, unknown>;

// Canonical (sorted-key) plain JSON so the compiled defs and the snapshot
// compare as the same shape regardless of key/field order.
const canonical = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort())
      out[k] = canonical((v as Record<string, unknown>)[k]);
    return out;
  }
  return v;
};

describe("the YAML powerup catalog compiles to the shipped powers", () => {
  it("compiles the same powerup ids", () => {
    expect(Object.keys(ABILITY_DEFS).sort()).toEqual(
      Object.keys(snapshot).sort(),
    );
  });

  for (const id of Object.keys(snapshot)) {
    it(`compiles "${id}" identical to the pinned def`, () => {
      expect(canonical(ABILITY_DEFS[id])).toEqual(snapshot[id]);
    });
  }

  // The catalog KEY is the id — the generator stamps it, so the YAML never
  // repeats itself and the two can never disagree.
  it("stamps every def's id from its catalog key", () => {
    for (const [id, def] of Object.entries(ABILITY_DEFS)) {
      expect(def.id).toBe(id);
    }
  });
});
