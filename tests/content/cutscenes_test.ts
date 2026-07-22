// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The shipped cutscene catalog: every campaign prelude resolves to a
// registered scene, and every scene's stage dressing and cast resolve to
// sprites in the committed atlas — the renderer SKIPS a missing sprite
// silently (CutsceneOverlay falls back `<name>` → `<name>_0` and then just
// doesn't draw), so a typo'd prop would ship as an invisible actor without
// this suite.

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { CUTSCENE_DEFS, LEVEL_ORDER, levelDef } from "@game/core";

const sprites = new Set(
  Object.keys(
    JSON.parse(
      readFileSync(
        new URL("../../pwa/src/game/assets/atlas.json", import.meta.url),
        "utf8",
      ),
    ),
  ),
);

/** The renderer's lookup rule: the exact name, else `<name>_0`. */
function resolves(name: string): boolean {
  return sprites.has(name) || sprites.has(`${name}_0`);
}

describe("campaign preludes", () => {
  it("every level prelude id names a registered cutscene", () => {
    for (const levelId of LEVEL_ORDER) {
      const prelude = levelDef(levelId).prelude;
      const ids = typeof prelude === "string" ? [prelude] : (prelude ?? []);
      for (const id of ids) {
        expect(CUTSCENE_DEFS[id], `${levelId} prelude "${id}"`).toBeDefined();
      }
    }
  });

  it("every level past the first opens on a travel scene", () => {
    for (const levelId of LEVEL_ORDER) {
      expect(
        levelDef(levelId).prelude,
        `${levelId} ships no prelude`,
      ).toBeDefined();
    }
  });
});

describe("cutscene sprites", () => {
  for (const [id, def] of Object.entries(CUTSCENE_DEFS)) {
    it(`${id}: every prop and actor resolves in the atlas`, () => {
      for (const prop of def.stage.props) {
        expect(
          resolves(prop.kind),
          `prop "${prop.kind}" missing — run \`make assets\``,
        ).toBe(true);
      }
      // Actors draw `<sprite>_<frame>`, so walk frames must exist; poses
      // swap sprites mid-scene, so check those too.
      const posed = def.beats.flatMap((b) =>
        b.kind === "pose" ? [b.sprite] : [],
      );
      for (const name of [...def.actors.map((a) => a.sprite), ...posed]) {
        expect(
          sprites.has(`${name}_0`),
          `actor sprite "${name}_0" missing — run \`make assets\``,
        ).toBe(true);
      }
      // Any actor a move beat walks needs the second stride frame.
      const moved = new Set(
        def.beats.flatMap((b) => (b.kind === "move" ? [b.actor] : [])),
      );
      for (const actor of def.actors) {
        if (!moved.has(actor.id)) continue;
        const names = [
          actor.sprite,
          ...def.beats.flatMap((b) =>
            b.kind === "pose" && b.actor === actor.id ? [b.sprite] : [],
          ),
        ];
        for (const name of names) {
          expect(
            sprites.has(`${name}_1`),
            `walk frame "${name}_1" missing — run \`make assets\``,
          ).toBe(true);
        }
      }
    });
  }
});
