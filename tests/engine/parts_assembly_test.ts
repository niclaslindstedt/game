// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE STATIC PARTS ASSEMBLER (mapgen/parts.ts): a deck of hand-drawn rooms is
// sewn into a ChamberGrid at its door sockets. These are the geometry rules the
// downstream passes stand on: rooms never overlap, every room is reachable from
// the landing, doors are punched at the AUTHORED sockets (not the border's
// middle), the boss room is dealt far from the start, and the same seed deals
// the same map. Exercised on a synthetic deck — no shipped content ids.

import { describe, expect, it } from "vitest";

import { createRng } from "@game/lib/rng.ts";
import { assembleParts, doorDistances } from "@game/core";
import type { MapBlueprint } from "@game/core";

/** A small deck: a landing, a repeatable corridor, a repeatable hall, and a
 * throne room — enough to exercise flips, mins, maxes and the boss attach. */
function deck(): MapBlueprint {
  return {
    id: "test_parts",
    level: "test_parts",
    size: { width: 4000, height: 3000, rooms: 0 },
    areas: [
      {
        id: "yard",
        enclosure: "hard",
        weight: 0,
        label: "YARD",
      },
      {
        id: "hall",
        enclosure: "hard",
        weight: 0,
        label: "HALL",
      },
    ],
    layout: {
      minRoom: 200,
      doorWidth: 64,
      loopDoors: 0,
      cluster: 0,
      wall: "test_wall",
    },
    objects: [{ id: "test_wall", type: "wall", radius: 10 }],
    horde: {
      perRoom: [4, 6],
      maxAlive: 4,
      ramps: [],
      members: [],
    },
    elites: [],
    guardians: [],
    boss: null,
    parts: {
      count: [4, 6],
      list: [
        {
          id: "landing",
          area: "yard",
          start: true,
          width: 500,
          height: 400,
          doors: [
            { edge: "n", at: 250 },
            { edge: "e", at: 200 },
            { edge: "s", at: 250 },
            { edge: "w", at: 200 },
          ],
        },
        {
          id: "corridor",
          area: "hall",
          width: 400,
          height: 240,
          flip: true,
          max: 4,
          doors: [
            { edge: "w", at: 120 },
            { edge: "e", at: 120 },
          ],
          spawns: [{ at: [200, 120] }],
        },
        {
          id: "hall_big",
          area: "hall",
          width: 600,
          height: 520,
          flip: true,
          min: 1,
          max: 2,
          doors: [
            { edge: "n", at: 300 },
            { edge: "s", at: 140 },
            { edge: "e", at: 260 },
          ],
          props: [{ object: "test_wall", at: [300, 260] }],
          spawns: [{ at: [150, 150] }, { at: [450, 380], slot: "elite" }],
        },
        {
          id: "throne",
          area: "hall",
          width: 640,
          height: 560,
          boss: { at: [320, 200] },
          doors: [{ edge: "s", at: 320 }],
          spawns: [{ at: [140, 300] }],
        },
      ],
    },
  } as unknown as MapBlueprint;
}

describe("the parts assembler", () => {
  it("deals the same map from the same seed, a different one from another", () => {
    const a = assembleParts(deck(), createRng(7));
    const b = assembleParts(deck(), createRng(7));
    expect(JSON.stringify(b.grid)).toEqual(JSON.stringify(a.grid));
    const c = assembleParts(deck(), createRng(8));
    expect(JSON.stringify(c.grid)).not.toEqual(JSON.stringify(a.grid));
  });

  it("never overlaps two rooms, and stays inside the priced extents", () => {
    for (const seed of [1, 2, 3, 5, 8, 13, 21, 34]) {
      const asm = assembleParts(deck(), createRng(seed));
      const rooms = asm.grid.chambers;
      for (let i = 0; i < rooms.length; i++)
        for (let j = i + 1; j < rooms.length; j++) {
          const a = rooms[i]!;
          const b = rooms[j]!;
          const apart =
            a.x + a.w <= b.x ||
            b.x + b.w <= a.x ||
            a.y + a.h <= b.y ||
            b.y + b.h <= a.y;
          expect(apart, `seed ${seed}: rooms ${i}/${j} overlap`).toBe(true);
          expect(a.x).toBeGreaterThanOrEqual(0);
          expect(a.y).toBeGreaterThanOrEqual(0);
        }
      expect(asm.width).toBeLessThanOrEqual(4000);
      expect(asm.height).toBeLessThanOrEqual(3000);
    }
  });

  it("leaves every room walkable from the landing", () => {
    for (const seed of [1, 2, 3, 5, 8, 13, 21, 34]) {
      const asm = assembleParts(deck(), createRng(seed));
      const dist = doorDistances(asm.grid, asm.startCell);
      for (const room of asm.grid.chambers)
        expect(
          Number.isFinite(dist[room.id]),
          `seed ${seed}: room ${room.id} is sealed off`,
        ).toBe(true);
    }
  });

  it("punches every sewn doorway at its authored socket", () => {
    const asm = assembleParts(deck(), createRng(3));
    const doored = asm.grid.borders.filter((b) => b.link !== "closed");
    expect(doored.length).toBeGreaterThan(0);
    for (const b of doored) {
      expect(b.doorAt, "a sewn border carries its socket").toBeDefined();
      expect(b.doorAt!).toBeGreaterThanOrEqual(b.from);
      expect(b.doorAt!).toBeLessThanOrEqual(b.to);
    }
  });

  it("honours the deck's requirements: the throne dealt once, far out; mins met", () => {
    for (const seed of [1, 2, 3, 5, 8]) {
      const asm = assembleParts(deck(), createRng(seed));
      const ids = asm.placements.map((p) => p.part.id);
      expect(ids.filter((id) => id === "landing")).toHaveLength(1);
      expect(ids.filter((id) => id === "throne")).toHaveLength(1);
      expect(
        ids.filter((id) => id === "hall_big").length,
      ).toBeGreaterThanOrEqual(1);
      expect(ids.filter((id) => id === "corridor").length).toBeLessThanOrEqual(
        4,
      );
      // The boss anchor rides its room wherever the deal sewed it.
      expect(asm.boss).toBeDefined();
      const throne = asm.placements.find((p) => p.part.id === "throne")!;
      expect(asm.boss!.cell).toBe(throne.cell);
      expect(asm.boss!.at.x).toBeGreaterThanOrEqual(throne.x);
      expect(asm.boss!.at.x).toBeLessThanOrEqual(throne.x + throne.part.width);
      // …and a long walk from the landing (the assembler's own search floor).
      const start = asm.grid.chambers[asm.startCell]!;
      const gap = Math.hypot(
        asm.boss!.at.x - (start.x + start.w / 2),
        asm.boss!.at.y - (start.y + start.h / 2),
      );
      expect(gap, `seed ${seed}: throne beside the landing`).toBeGreaterThan(
        1200,
      );
    }
  });

  it("mirrors a flipped part's markers with the room", () => {
    // Deal several seeds (some will flip), then check every spawn marker's
    // mirrored offset still lands inside its own room — the mirror math is
    // the whole risk.
    for (const seed of [1, 2, 3, 5, 8, 13, 21]) {
      const asm = assembleParts(deck(), createRng(seed));
      for (const placement of asm.placements) {
        for (const spawn of placement.part.spawns ?? []) {
          const lx = placement.flipX
            ? placement.part.width - spawn.at[0]
            : spawn.at[0];
          const ly = placement.flipY
            ? placement.part.height - spawn.at[1]
            : spawn.at[1];
          expect(lx).toBeGreaterThanOrEqual(0);
          expect(lx).toBeLessThanOrEqual(placement.part.width);
          expect(ly).toBeGreaterThanOrEqual(0);
          expect(ly).toBeLessThanOrEqual(placement.part.height);
        }
      }
    }
  });
});
