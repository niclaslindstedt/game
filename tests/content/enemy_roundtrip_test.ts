// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The migration guard: the enemies are now authored as YAML
// (scripts/enemies/<biome>/<id>.yaml) and compiled into the engine's
// EnemyDef catalog by scripts/generate-enemies.mjs. This test pins the
// compiled output to a snapshot captured from the original hand-written TS
// rosters — so the YAML round-trip is provably behavior-preserving, and any
// later YAML edit that changes a shipped enemy shows up as a deliberate snapshot
// update.
//
// If a change to a shipped enemy is intentional, regenerate the snapshot:
//   npm run levels && node scripts/update-enemy-snapshot.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { ENEMY_DEFS } from "@game/core";

const snapshot = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("./fixtures/enemies-snapshot.json", import.meta.url)),
    "utf8",
  ),
) as Record<string, unknown>;

// Canonical (sorted-key) plain JSON so the compiled defs and the snapshot
// compare as the same shape regardless of key/field order (drops `undefined`,
// normalizes readonly tuples).
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

describe("YAML enemy catalog round-trips the original rosters", () => {
  it("compiles the same enemy ids", () => {
    expect(Object.keys(ENEMY_DEFS).sort()).toEqual(
      Object.keys(snapshot).sort(),
    );
  });

  for (const id of Object.keys(snapshot)) {
    it(`compiles "${id}" identical to the original def`, () => {
      expect(canonical(ENEMY_DEFS[id])).toEqual(snapshot[id]);
    });
  }
});
