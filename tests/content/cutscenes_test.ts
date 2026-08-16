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

// AND THE PRELUDE'S HERO WALKS ROUND THE FLOOR LAMP RATHER THAN THROUGH IT.
// No prop in a scene is solid — an actor walks the line it is given, so a leg
// authored across a piece of furniture plays as a man passing through it. The
// hero's is the walk that has to be blocked around this one: the weapon is
// mounted over the couch and the only floor it hangs over is the strip BEHIND
// the couch, so he gets past the lamp to reach the mount and past it again to
// come back out.
//
// The check is the lamp's own STANDING FOOTPRINT, not its sprite box: the art
// is a 6 px base under a 10 px shade, so what the hero may not share is the
// base. Level with it means within 4 px of its mark — the depth the furniture
// in this room is authored on (the couch's feet and the lamp's both bottom out
// at y 92, off marks of 96 and 95), which is exactly the band where two
// standing sprites read as intersecting rather than as one behind the other.
describe("the prelude's hero walks round the floor lamp", () => {
  /** The lamp's base, in stage units: `lamp.yaml` fills columns 2…7 of a
   * 10-wide sprite, drawn centred on its own `pos.x`. */
  const BASE_SPAN = 6;
  /** A walking actor's body, and the widest the hero is ever drawn. */
  const BODY = 16;
  /** Closer than this in depth and the two are standing on one line. */
  const LEVEL = 4;

  const lit = Object.entries(CUTSCENE_DEFS).filter(([, def]) =>
    def.stage.props.some((p) => p.kind === "lamp"),
  );

  // Without this the suite EVAPORATES rather than fails: retire the lamp and
  // every case below simply stops being emitted, and a green run says nothing.
  it("is checking the living room at all", () => {
    expect(lit.map(([id]) => id)).toContain("prelude");
  });

  for (const [id, def] of lit) {
    const lamp = def.stage.props.find((p) => p.kind === "lamp")!;
    it(`${id}: never stands the hero in the lamp`, () => {
      // Replay the blocking, sampling each leg finely enough that one crossing
      // the lamp cannot slip between two samples.
      let at = def.actors.find((a) => a.id === "hero")!.at;
      let walked = 0;
      for (const beat of def.beats) {
        if (beat.kind !== "move" || beat.actor !== "hero") continue;
        walked++;
        const steps = Math.ceil(
          Math.max(Math.abs(beat.to.x - at.x), Math.abs(beat.to.y - at.y)),
        );
        for (let i = 0; i <= steps; i++) {
          const x = at.x + ((beat.to.x - at.x) * i) / steps;
          const y = at.y + ((beat.to.y - at.y) * i) / steps;
          if (Math.abs(x - lamp.pos.x) >= (BODY + BASE_SPAN) / 2) continue;
          expect(
            Math.abs(y - lamp.pos.y),
            `hero stands over the lamp's base at (${x.toFixed(1)}, ${y.toFixed(1)})`,
          ).toBeGreaterThan(LEVEL);
        }
        at = beat.to;
      }
      // A hero who never walks passes the loop above without being asked
      // anything — and he crosses this room four times.
      expect(walked, "the hero walks nowhere in this scene").toBeGreaterThan(0);
    });
  }
});
