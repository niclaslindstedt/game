// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The companion guard: the roster is authored as content
// (`content/companions.yaml`) and compiled into the engine's CompanionDef
// catalog by scripts/generate-companions.mjs. This test pins the compiled
// output to a snapshot, so a rebalance of a shipped companion is always a
// deliberate, reviewable snapshot update rather than a silent drift — and a
// broken compile (a dropped aura, a mis-stamped id) fails the build instead of
// the party.
//
// The baseline was frozen from the hand-written TypeScript catalog the moment
// BEFORE the lift, so this file is a PROOF that moving the roster into YAML
// changed nothing, not merely a record of where it landed.
//
// If a change to a shipped companion is intentional, regenerate the snapshot:
//   npm run levels && node scripts/update-companion-snapshot.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { COMPANION_DEFS } from "@game/core";

const snapshot = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL("./fixtures/companions-snapshot.json", import.meta.url),
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

describe("the YAML companion roster compiles to the shipped party", () => {
  it("compiles the same companion ids", () => {
    expect(Object.keys(COMPANION_DEFS).sort()).toEqual(
      Object.keys(snapshot).sort(),
    );
  });

  for (const id of Object.keys(snapshot)) {
    it(`compiles "${id}" identical to the pinned def`, () => {
      expect(canonical(COMPANION_DEFS[id])).toEqual(snapshot[id]);
    });
  }

  // The catalog KEY is the id — the loader stamps it, so the YAML never repeats
  // itself and the two can never disagree.
  it("stamps every def's id from its catalog key", () => {
    for (const [id, def] of Object.entries(COMPANION_DEFS)) {
      expect(def.id).toBe(id);
    }
  });
});
