// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The migration guard: the items are now authored as YAML
// (content/items/<rarity>/<id>.yaml + the item-quality/item-rarity knob
// files) and compiled into the engine's catalogs by
// scripts/generate-items.mjs. This test pins the compiled output — weapons
// (including the generated grade variants), gear, and uniques — to a
// snapshot captured from the original hand-written TS catalogs, so the YAML
// round-trip is provably behavior-preserving, and any later YAML edit that
// changes a shipped item shows up as a deliberate snapshot update.
//
// If a change to a shipped item is intentional, regenerate the snapshot:
//   npm run levels && node scripts/update-item-snapshot.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { GEAR_DEFS, UNIQUE_DEFS, WEAPON_DEFS } from "@game/core";

const snapshot = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("./fixtures/items-snapshot.json", import.meta.url)),
    "utf8",
  ),
) as Record<"weapons" | "gear" | "uniques", Record<string, unknown>>;

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

const families = [
  ["weapons", WEAPON_DEFS],
  ["gear", GEAR_DEFS],
  ["uniques", UNIQUE_DEFS],
] as const;

describe("YAML item catalog round-trips the original catalogs", () => {
  for (const [family, defs] of families) {
    it(`compiles the same ${family} ids`, () => {
      expect(Object.keys(defs).sort()).toEqual(
        Object.keys(snapshot[family]).sort(),
      );
    });

    for (const id of Object.keys(snapshot[family])) {
      it(`compiles ${family} "${id}" identical to the original def`, () => {
        expect(canonical(defs[id])).toEqual(snapshot[family][id]);
      });
    }
  }
});
