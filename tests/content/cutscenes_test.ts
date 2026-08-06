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
      // GOODCO HQ is the one exception: the campaign now OPENS in the
      // garage, so the living-room prelude plays on the hub's first entry
      // and the drive over needs no scene of its own.
      if (levelId === "goodco_hq") continue;
      expect(
        levelDef(levelId).prelude,
        `${levelId} ships no prelude`,
      ).toBeDefined();
    }
    // The scene GOODCO used to open on lives at home now.
    expect(levelDef("garage").prelude).toBe("prelude");
    expect(levelDef("goodco_hq").prelude).toBeUndefined();
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

// THE ESTABLISHING SHOT OWES THE HUB ITS OWN GROUND. The garage lot is
// walkable (content/maps/garage.yaml), so the player has already stood on the
// swept paved DRIVE outside the roll-up door and on the two-lane ROAD the
// drive leads out to. The launch scene is that same lot at night; a pass that
// drops either surface leaves the shot disagreeing with the map behind it.
describe("the launch scene stands on the garage lot", () => {
  const props = () => CUTSCENE_DEFS.launch!.stage.props;

  it("lays the drive and the road the hub map has", () => {
    const kinds = props().map((p) => p.kind);
    expect(kinds).toContain("garage_drive");
    expect(kinds.filter((k) => k === "road_lane").length).toBeGreaterThan(0);
  });

  it("lays them on the FLOOR, under everything standing on them", () => {
    // A slab is anchored at its NEAR edge, so left in the standing queue it
    // sorts in front of the hero walking over it and paints over his feet.
    for (const prop of props()) {
      if (prop.kind !== "garage_drive" && prop.kind !== "road_lane") continue;
      expect(prop.ground, `"${prop.kind}" is not a ground prop`).toBe(true);
    }
  });

  it("runs the road off both edges of the frame", () => {
    const stage = CUTSCENE_DEFS.launch!.stage;
    const lanes = props().filter((p) => p.kind === "road_lane");
    const xs = lanes.map((p) => p.pos.x).sort((a, b) => a - b);
    // 56 px of tarmac per tile, laid end to end across the whole 224.
    const span = 56;
    expect(xs[0]! - span / 2).toBeLessThanOrEqual(0);
    expect(xs.at(-1)! + span / 2).toBeGreaterThanOrEqual(stage.width);
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i]! - xs[i - 1]!, "a gap in the tarmac").toBe(span);
    }
  });
});
