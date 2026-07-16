// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The migration guard: the levels are now authored as YAML
// (website/scripts/levels/*.yaml) and compiled into the engine's LevelDef
// catalog by website/scripts/generate-levels.mjs. This test pins the compiled
// output to a snapshot captured from the original hand-written TS defs — so the
// YAML round-trip is provably behavior-preserving, and any later YAML edit that
// changes a shipped level shows up as a deliberate snapshot update.
//
// If a change to a shipped level is intentional, regenerate the snapshot:
//   node scripts/update-level-snapshot.mjs   (see that script)

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { LEVELS, LEVEL_ORDER, SECRET_LEVEL_ORDER } from "@game/core";

const snapshot = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("./fixtures/levels-snapshot.json", import.meta.url)),
    "utf8",
  ),
) as {
  order: string[];
  secret: string[];
  defs: Record<string, unknown>;
};

// Round-trip through JSON so the compiled defs and the snapshot compare as the
// same plain-data shape (drops `undefined`, normalizes readonly tuples).
const plain = (v: unknown) => JSON.parse(JSON.stringify(v));

describe("YAML level catalog round-trips the original defs", () => {
  it("keeps the campaign and secret ordering", () => {
    expect(LEVEL_ORDER).toEqual(snapshot.order);
    expect(SECRET_LEVEL_ORDER).toEqual(snapshot.secret);
  });

  it("compiles the same level ids", () => {
    expect(Object.keys(LEVELS).sort()).toEqual(
      Object.keys(snapshot.defs).sort(),
    );
  });

  for (const id of Object.keys(snapshot.defs)) {
    it(`compiles "${id}" byte-for-byte identical to the original def`, () => {
      expect(plain(LEVELS[id])).toEqual(snapshot.defs[id]);
    });
  }
});
