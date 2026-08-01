// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE DELTA — and the ONE property that matters: `patch(prev, diff(prev, next))`
// is `next`, for every pair of states the engine can produce.
//
// Everything else in the replication layer rests on that. A differ that is
// merely usually right does not fail as a bug report; it fails as a client
// whose world is subtly wrong in a way nobody can reproduce, three rooms into
// a level, once. So the round trip is asserted structurally rather than
// field-by-field, and the strategies are each pinned separately underneath so
// a failure says WHICH one broke rather than only that something did.

import { describe, expect, it } from "vitest";

import { diffState, patchState, type WireState } from "@game/wire/delta.ts";

/** `next`, reconstructed from `prev` and the patch between them. */
function roundTrip(prev: WireState, next: WireState): WireState {
  const held = structuredClone(prev);
  patchState(held, diffState(prev, next));
  return held;
}

describe("state delta", () => {
  it("reconstructs the next state from the previous one", () => {
    const prev: WireState = {
      tick: 1,
      menace: 0.5,
      player: { pos: { x: 1, y: 2 }, hp: 100, inventory: [null, null] },
      enemies: [
        { id: 1, hp: 10, pos: { x: 0, y: 0 } },
        { id: 2, hp: 20, pos: { x: 5, y: 5 } },
      ],
      events: [],
    };
    const next: WireState = {
      tick: 2,
      menace: 0.75,
      player: {
        pos: { x: 3, y: 2 },
        hp: 92,
        inventory: [null, { defId: "x" }],
      },
      enemies: [
        { id: 2, hp: 14, pos: { x: 5, y: 6 } },
        { id: 3, hp: 30, pos: { x: 9, y: 9 } },
      ],
      events: [{ kind: "hit" }],
    };
    expect(roundTrip(prev, next)).toEqual(next);
  });

  it("emits nothing at all when nothing changed", () => {
    const state: WireState = {
      tick: 5,
      enemies: [{ id: 1, hp: 3 }],
      player: { pos: { x: 0, y: 0 } },
    };
    expect(diffState(state, structuredClone(state))).toEqual({});
  });

  describe("the nested strategy", () => {
    it("sends only the member that moved, not the whole object", () => {
      // The reason `player` is affordable: he changes every tick, but what
      // changes is `pos`, not his 30-cell bag.
      const prev = { player: { pos: { x: 0, y: 0 }, inventory: bigBag() } };
      const next = { player: { pos: { x: 1, y: 0 }, inventory: bigBag() } };
      const patch = diffState(prev, next);
      expect(JSON.stringify(patch)).not.toContain("cell-17");
      expect(roundTrip(prev, next)).toEqual(next);
    });

    it("removes a member the sender no longer has", () => {
      const prev = { player: { pos: { x: 0, y: 0 }, disarmed: true } };
      const next = { player: { pos: { x: 0, y: 0 } } };
      const held = roundTrip(prev, next);
      expect(held).toEqual(next);
      expect("disarmed" in (held.player as object)).toBe(false);
    });
  });

  describe("the entity strategy", () => {
    it("sends only the fields that changed, of only the entities that changed", () => {
      // A body the receiver already holds travels as a PARTIAL — id plus the
      // moved fields. Re-sending the whole entity re-sent its def-sized
      // never-changing self with every step it took, and a horde takes a lot
      // of steps: the partials were measured at two thirds of the enemies
      // field's wire cost.
      const prev = {
        enemies: [
          { id: 1, hp: 5, home: { x: 1, y: 2 } },
          { id: 2, hp: 5, home: { x: 3, y: 4 } },
        ],
      };
      const next = {
        enemies: [
          { id: 1, hp: 5, home: { x: 1, y: 2 } },
          { id: 2, hp: 4, home: { x: 3, y: 4 } },
        ],
      };
      const patch = diffState(prev, next);
      expect(patch.enemies).toEqual({
        k: "e",
        pat: [{ id: 2, set: { hp: { k: "v", v: 4 } } }],
      });
      expect(roundTrip(prev, next)).toEqual(next);
    });

    it("sends a newcomer whole — a partial cannot materialize a body", () => {
      const prev = { enemies: [{ id: 1, hp: 5 }] };
      const next = {
        enemies: [
          { id: 1, hp: 5 },
          { id: 2, hp: 9 },
        ],
      };
      expect(diffState(prev, next).enemies).toEqual({
        k: "e",
        upd: [{ id: 2, hp: 9 }],
      });
      expect(roundTrip(prev, next)).toEqual(next);
    });

    it("skips a partial for an id the receiver does not hold", () => {
      // An honest sender codes partials only against the acknowledged
      // baseline; a partial naming an unknown id is a forgery, and merging it
      // into nothing would mint a half-built body.
      const held = { enemies: [{ id: 1, hp: 5 }] };
      const forged = {
        enemies: { k: "e", pat: [{ id: 99, set: { hp: { k: "v", v: 1 } } }] },
      };
      patchState(held, forged as never);
      expect(held.enemies).toEqual([{ id: 1, hp: 5 }]);
    });

    it("removes the ids that left", () => {
      const prev = { enemies: [{ id: 1 }, { id: 2 }, { id: 3 }] };
      const next = { enemies: [{ id: 2 }] };
      expect(roundTrip(prev, next)).toEqual(next);
    });

    it("survives a list emptying out and refilling", () => {
      // A field that empties must not switch strategies mid-run: a receiver
      // holding entities handed a whole-value replacement has no baseline to
      // reconcile against.
      const empty = { projectiles: [] };
      const full = { projectiles: [{ id: 9, x: 1 }] };
      expect(roundTrip(empty, full)).toEqual(full);
      expect(roundTrip(full, empty)).toEqual(empty);
    });

    it("keeps entities in id order on both ends", () => {
      // The receiver rebuilds from a Map, whose iteration order is first-seen
      // rather than the sender's. Id order is what both ends can agree on, and
      // the engine mints ids monotonically, so it IS arrival order.
      const prev = { items: [{ id: 4 }, { id: 7 }] };
      const next = { items: [{ id: 7 }, { id: 4 }, { id: 9 }] };
      const held = roundTrip(prev, next);
      expect((held.items as { id: number }[]).map((e) => e.id)).toEqual([
        4, 7, 9,
      ]);
    });

    it("does not take an array of plain values for entities", () => {
      // Same length, no ids: the per-index array strategy carries the one
      // slot that moved rather than the whole list.
      const prev = { waveSpawned: [0, 0, 0] };
      const next = { waveSpawned: [0, 1, 0] };
      expect(diffState(prev, next).waveSpawned).toEqual({
        k: "a",
        set: { "1": { k: "v", v: 1 } },
      });
      expect(roundTrip(prev, next)).toEqual(next);
    });
  });

  describe("the indexed-array strategy", () => {
    it("sends only the member whose field moved, not the whole list", () => {
      // The spawner list is the motivating case: string-keyed authored ids, so
      // it is not an entity array — and one point's clock arming used to
      // re-send every point's whole spawn queue (a measured ~10 KB a publish).
      const prev = {
        spawners: [
          { id: "a", emitAtMs: 100, queue: ["x", "y", "z"] },
          { id: "b", emitAtMs: 200, queue: ["x", "y", "z"] },
        ],
      };
      const next = {
        spawners: [
          { id: "a", emitAtMs: 100, queue: ["x", "y", "z"] },
          { id: "b", emitAtMs: 350, queue: ["x", "y", "z"] },
        ],
      };
      expect(diffState(prev, next).spawners).toEqual({
        k: "a",
        set: { "1": { k: "n", set: { emitAtMs: { k: "v", v: 350 } } } },
      });
      expect(roundTrip(prev, next)).toEqual(next);
    });

    it("resends the whole list when its length changes", () => {
      // Seating a hero, draining a queue: rare, and a positional diff across
      // an insert would pay per-index patches for every shifted slot anyway.
      const prev = { players: [{ hp: 10 }] };
      const next = { players: [{ hp: 10 }, { hp: 20 }] };
      expect(diffState(prev, next).players).toEqual({
        k: "v",
        v: [{ hp: 10 }, { hp: 20 }],
      });
      expect(roundTrip(prev, next)).toEqual(next);
    });
  });

  describe("the byte-array strategy", () => {
    it("sends only the cells that flipped", () => {
      const prev = { explored: new Uint8Array(1000) };
      const after = new Uint8Array(1000);
      after[42] = 1;
      after[900] = 1;
      const patch = diffState(prev, { explored: after });
      expect(patch.explored).toEqual({
        k: "b",
        n: 1000,
        ix: [42, 900],
        vs: [1, 1],
      });
    });

    it("applies onto a receiver's own grid", () => {
      const prev = { explored: new Uint8Array(8) };
      const after = new Uint8Array(8);
      after[3] = 7;
      const held: WireState = { explored: new Uint8Array(8) };
      patchState(held, diffState(prev, { explored: after }));
      expect(Array.from(held.explored as Uint8Array)).toEqual([
        0, 0, 0, 7, 0, 0, 0, 0,
      ]);
    });

    it("resends the whole grid when its length changes", () => {
      // A new level, not a walked step.
      const prev = { explored: new Uint8Array(4) };
      const after = Uint8Array.from([1, 2, 3, 4, 5, 6]);
      const held: WireState = { explored: new Uint8Array(4) };
      patchState(held, diffState(prev, { explored: after }));
      expect(Array.from(held.explored as Uint8Array)).toEqual([
        1, 2, 3, 4, 5, 6,
      ]);
    });

    it("reads a grid that has been through JSON", () => {
      // A snapshot that crossed the wire arrives with its `Uint8Array` as an
      // object keyed by index — which is exactly why this field has a strategy
      // of its own.
      const asJson = JSON.parse(
        JSON.stringify({ explored: Uint8Array.from([0, 1, 0]) }),
      ) as WireState;
      const next = { explored: Uint8Array.from([0, 1, 1]) };
      const patch = diffState(asJson, next);
      expect(patch.explored).toEqual({ k: "b", n: 3, ix: [2], vs: [1] });
    });
  });

  describe("the split", () => {
    it("never sends a static field, however much it changed", () => {
      // The client built these from the same seed; the wire's job is to not
      // mention them. (`decor` cannot change mid-run — this asserts the
      // differ's rule, not the engine's.)
      const prev = { decor: [{ id: 1 }], level: { id: "moon" }, tick: 0 };
      const next = { decor: [{ id: 2 }], level: { id: "mars" }, tick: 1 };
      expect(diffState(prev, next)).toEqual({ tick: { k: "v", v: 1 } });
    });

    it("sends an obstacle whose hp fell, with no counter moving", () => {
      // The bug this replaced: obstacles were guarded by `obstaclesVersion`,
      // which the engine bumps when one is ADDED or REMOVED — and never when a
      // crate is shot. Every breakable stayed at full health on the client
      // while the server watched it break.
      const prev = {
        obstacles: [{ id: 1, hp: 72, maxHp: 72 }],
        obstaclesVersion: 0,
      };
      const next = {
        obstacles: [{ id: 1, hp: 22, maxHp: 72 }],
        obstaclesVersion: 0,
      };
      expect(diffState(prev, next).obstacles).toEqual({
        k: "e",
        pat: [{ id: 1, set: { hp: { k: "v", v: 22 } } }],
      });
    });

    it("never sends the rng closures or the app's view rect", () => {
      const prev = { rng: () => 0, fxRng: () => 0, view: { x: 0 }, tick: 0 };
      const next = { rng: () => 1, fxRng: () => 1, view: { x: 5 }, tick: 1 };
      expect(Object.keys(diffState(prev, next))).toEqual(["tick"]);
    });
  });
});

function bigBag() {
  return Array.from({ length: 30 }, (_, i) => ({ defId: `cell-${i}` }));
}
