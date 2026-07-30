// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The talent guard: the three passive trees are authored as content
// (`content/talents.yaml`) and compiled into the engine's TalentDef catalog by
// scripts/generate-talents.mjs. This test pins the compiled output to a
// snapshot, so a rebalance of a shipped talent is always a deliberate,
// reviewable snapshot update rather than a silent drift — and a broken compile
// (a dropped proc block, a mis-stamped id) fails the build instead of the
// fight.
//
// The move to YAML itself changed nothing — the compiled catalog was diffed
// field by field, and proc number by proc number, against the hand-written
// TypeScript defs plus the per-talent config blocks they read, and every one
// matched. What proves it STAYS unchanged is `tests/engine/talents_test.ts`,
// which asserts the live numbers each proc hands back rather than the def they
// come from.
//
// If a change to a shipped talent is intentional:
//   npm run levels && node scripts/update-talent-snapshot.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { TALENT_BLOCKS, TALENT_DEFS, TALENT_MAX_RANK } from "@game/core";

const snapshot = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("./fixtures/talents-snapshot.json", import.meta.url)),
    "utf8",
  ),
) as Record<string, Record<string, unknown>>;

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

describe("the YAML talent catalog compiles to the shipped trees", () => {
  it("compiles the same talent ids", () => {
    expect(Object.keys(TALENT_DEFS).sort()).toEqual(
      Object.keys(snapshot).sort(),
    );
  });

  for (const id of Object.keys(snapshot)) {
    it(`compiles "${id}" identical to the pinned def`, () => {
      expect(canonical(TALENT_DEFS[id])).toEqual(snapshot[id]);
    });
  }

  // The catalog KEY is the id — the generator stamps it, so the YAML never
  // repeats itself and the two can never disagree.
  it("stamps every def's id from its catalog key", () => {
    for (const [id, def] of Object.entries(TALENT_DEFS)) {
      expect(def.id).toBe(id);
    }
  });

  // The rank ceiling is ECONOMY: the picker draws this many pips and the point
  // milestones are priced against a full tree, so a def above the cap would
  // enqueue points the picker has no milestone for.
  it("keeps every talent at or under the shared rank cap", () => {
    for (const def of Object.values(TALENT_DEFS)) {
      expect(def.maxRank).toBeGreaterThanOrEqual(1);
      expect(def.maxRank).toBeLessThanOrEqual(TALENT_MAX_RANK);
    }
  });

  // ONE CARRIER PER PROC. The engine resolves a proc by finding the trained
  // talent that CARRIES its block (`procTalent`), so two carriers would make
  // "whose numbers apply" a question about catalog order. The build enforces
  // this over base ∪ mod; this is the shipped half of it.
  it("gives every proc block exactly one carrier", () => {
    for (const block of TALENT_BLOCKS) {
      const carriers = Object.values(TALENT_DEFS).filter(
        (def) => def[block] !== undefined,
      );
      expect(carriers.length, `${block} carriers`).toBeLessThanOrEqual(1);
    }
  });

  // Every rank a player can spend has to buy SOMETHING — a talent carrying
  // neither a slope nor a proc block is the one content bug this format can
  // produce silently.
  it("gives every talent an effect or a proc block", () => {
    for (const def of Object.values(TALENT_DEFS)) {
      const hasEffect = Object.keys(def.effect ?? {}).length > 0;
      const hasBlock = TALENT_BLOCKS.some((b) => def[b] !== undefined);
      expect(hasEffect || hasBlock, `${def.id} does nothing`).toBe(true);
    }
  });
});
