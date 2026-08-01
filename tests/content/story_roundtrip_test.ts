// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The story guard: the cutscenes, the hero's inner monologues and the story
// items are authored as content (`content/cutscenes/<id>.yaml`,
// `content/thoughts.yaml`, `content/story-items.yaml`) and compiled into the
// engine's catalogs by scripts/generate-story.mjs.
//
// The snapshot was frozen from the hand-written TypeScript catalogs the moment
// before the lift, so this suite is a PROOF that moving 1,860 lines of script
// into YAML changed not one caption, not one page break, and not one prop
// position — not merely a baseline for what the YAML happens to say today. Every
// later change to a shipped line is then a deliberate, reviewable snapshot
// update rather than silent drift.
//
// If a change to the shipped story is intentional (and the manuscript is updated
// with it — see AGENTS.md), regenerate the snapshot:
//   npm run levels && node scripts/update-story-snapshot.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  CAP_THOUGHT_IDS,
  CUTSCENE_DEFS,
  STORY_ITEM_DEFS,
  THOUGHT_DEFS,
  cutsceneVariant,
  difficultyDef,
  weaponDef,
} from "@game/core";

const snapshot = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("./fixtures/story-snapshot.json", import.meta.url)),
    "utf8",
  ),
) as {
  cutscenes: Record<string, unknown>;
  thoughts: Record<string, unknown>;
  capThoughts: string[];
  storyItems: Record<string, unknown>;
};

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

const catalogs = [
  ["cutscene", CUTSCENE_DEFS, snapshot.cutscenes],
  ["thought", THOUGHT_DEFS, snapshot.thoughts],
  ["story item", STORY_ITEM_DEFS, snapshot.storyItems],
] as const;

describe("the YAML story catalogs compile to the shipped script", () => {
  for (const [what, live, pinned] of catalogs) {
    it(`compiles the same ${what} ids`, () => {
      expect(Object.keys(live).sort()).toEqual(Object.keys(pinned).sort());
    });

    for (const id of Object.keys(pinned)) {
      it(`compiles ${what} "${id}" identical to the pinned def`, () => {
        expect(canonical(live[id as keyof typeof live])).toEqual(pinned[id]);
      });
    }

    // The catalog KEY (or, for a scene, the file stem) is the id — stamped by
    // the loader so the YAML never repeats itself and the two cannot disagree.
    it(`stamps every ${what}'s id from its catalog key`, () => {
      for (const [id, def] of Object.entries(live)) {
        expect((def as { id: string }).id).toBe(id);
      }
    });
  }

  it("keeps the cap-farm rotation in its authored order", () => {
    expect([...CAP_THOUGHT_IDS]).toEqual(snapshot.capThoughts);
    for (const id of CAP_THOUGHT_IDS) expect(THOUGHT_DEFS[id]).toBeDefined();
  });

  // `variants:` is the reason the prelude is ONE file rather than five, so the
  // thing worth pinning is that it still expands into the five scenes
  // `cutsceneVariant` resolves — and that each one hangs its own rung's weapon
  // on the wall (DifficultyDef.startingWeapon, which the caption names).
  it("expands the prelude's variants into a scene per difficulty", () => {
    const wallOf = (id: string) =>
      CUTSCENE_DEFS[id]!.stage.props.map((p) => p.kind).find((kind) =>
        kind.startsWith("wall_"),
      );
    const walls = new Map<string, string | undefined>();
    for (const rung of ["easy", "medium", "hard", "nightmare", "jesus"]) {
      const id = cutsceneVariant("prelude", rung);
      expect(CUTSCENE_DEFS[id], `prelude variant for ${rung}`).toBeDefined();
      walls.set(rung, wallOf(id));
    }
    // MEDIUM is the base scene; every other rung resolves to its own variant.
    expect(cutsceneVariant("prelude", "medium")).toBe("prelude");
    expect(new Set(walls.values()).size).toBe(walls.size);
  });

  // He does not narrate taking the weapon down — he leaps for it, and it
  // leaves the wall and lands in his hand on the same frame. The piece he
  // carries out is the run's own starting weapon, so what the scene puts in
  // his fist is that weapon's ICON: the same art the paper doll holds for the
  // rest of the run. Re-arming a rung in difficulties.ts without re-authoring
  // the scene would otherwise send him out of the room holding the last one.
  it("takes the wall weapon down and hands the run's own piece to the hero", () => {
    for (const rung of ["easy", "medium", "hard", "nightmare", "jesus"]) {
      const def = CUTSCENE_DEFS[cutsceneVariant("prelude", rung)]!;
      const wall = def.stage.props.find((p) => p.kind.startsWith("wall_"))!;
      const stripped = def.beats.find((b) => b.kind === "prop");
      const held = def.beats.find((b) => b.kind === "hold");
      // The prop beat has to name the wall weapon's own id, or the piece
      // stays hanging there while he walks out carrying a copy of it.
      expect(stripped, `${rung}: takes the weapon off the wall`).toEqual({
        kind: "prop",
        prop: wall.id,
        hidden: true,
      });
      expect(held?.kind === "hold" && held.sprite, `${rung}: carries it`).toBe(
        weaponDef(difficultyDef(rung).startingWeapon).icon,
      );
    }
  });
});
