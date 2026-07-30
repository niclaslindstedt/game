// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The SET guard: the kits are authored as content (`content/sets.yaml`) and
// compiled into the engine's SetDef catalog by scripts/generate-sets.mjs. This
// test pins the compiled output to a snapshot, so a rebalance of a shipped kit
// is always a deliberate, reviewable snapshot update rather than a silent drift
// — and a broken compile (a dropped threshold, a mis-stamped id) fails the
// build instead of the loadout.
//
// The baseline was frozen from the hand-written TypeScript catalog the moment
// BEFORE the lift, so this file is a PROOF that moving the kits into YAML
// changed nothing, not merely a record of where they landed.
//
// If a change to a shipped set is intentional, regenerate the snapshot:
//   npm run levels && node scripts/update-set-snapshot.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { SET_DEFS, setForItem, UNIQUE_DEFS } from "@game/core";

const snapshot = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("./fixtures/sets-snapshot.json", import.meta.url)),
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

describe("the YAML set catalog compiles to the shipped kits", () => {
  it("compiles the same set ids", () => {
    expect(Object.keys(SET_DEFS).sort()).toEqual(Object.keys(snapshot).sort());
  });

  for (const id of Object.keys(snapshot)) {
    it(`compiles "${id}" identical to the pinned def`, () => {
      expect(canonical(SET_DEFS[id])).toEqual(snapshot[id]);
    });
  }

  // The catalog KEY is the id — the loader stamps it, so the YAML never repeats
  // itself and the two can never disagree.
  it("stamps every def's id from its catalog key", () => {
    for (const [id, def] of Object.entries(SET_DEFS)) {
      expect(def.id).toBe(id);
    }
  });

  // The half of the relationship the ITEM owns. A piece and its kit each name
  // the other, and a player only ever sees one of the two — the item card —
  // so a mismatch is a green piece that silently pays nothing.
  it("agrees with the pieces about which set they belong to", () => {
    for (const def of Object.values(SET_DEFS)) {
      for (const memberId of def.members) {
        expect(UNIQUE_DEFS[memberId]?.setId, memberId).toBe(def.id);
        expect(setForItem(memberId)?.id, memberId).toBe(def.id);
      }
    }
  });

  it("leaves no green piece without a kit to belong to", () => {
    const claimed = new Set(
      Object.values(SET_DEFS).flatMap((def) => def.members),
    );
    const orphans = Object.entries(UNIQUE_DEFS)
      .filter(([id, def]) => def.tier === "set" && !claimed.has(id))
      .map(([id]) => id);
    expect(orphans).toEqual([]);
  });
});
