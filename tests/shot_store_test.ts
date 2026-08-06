// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SCREENSHOT ROLL (`@ui/lib/shot-store.ts`) WITH NO INDEXEDDB UNDER IT.
//
// That is the interesting half, and it is the one the tests can reach: node has
// no IndexedDB, which is exactly the situation a private-mode Safari tab or a
// browser with storage switched off puts the store in. Everything the player
// can see — the flash, the viewer, the filmstrip, the share sheet — has to keep
// working off the in-memory roll, and the cap has to hold there too, or a long
// session leaks a picture per keypress into a store that will never write.

import { beforeEach, describe, expect, it } from "vitest";

import {
  clearShots,
  configureShotStore,
  deleteShot,
  loadShots,
  putShot,
  resetShotStore,
  shot,
  shotList,
  subscribeShots,
} from "@ui/lib/shot-store.ts";

/** A stand-in for the PNG. The store never looks inside one. */
function png(byte: number): Blob {
  return new Blob([new Uint8Array([byte])], { type: "image/png" });
}

function file(
  takenAt: number,
  label = "TEST",
): {
  takenAt: number;
  width: number;
  height: number;
  label: string;
  blob: Blob;
} {
  return { takenAt, width: 4, height: 2, label, blob: png(takenAt & 0xff) };
}

beforeEach(() => {
  resetShotStore();
  configureShotStore({ dbName: "shot-store-test", limit: 3 });
});

describe("the roll", () => {
  it("hands back the newest picture first", () => {
    putShot(file(1000, "MOON"));
    putShot(file(2000, "MARS"));
    expect(shotList().map((entry) => entry.label)).toEqual(["MARS", "MOON"]);
  });

  it("keeps the pixels out of the metadata", () => {
    const meta = putShot(file(1000));
    expect(Object.keys(meta).sort()).toEqual([
      "height",
      "id",
      "label",
      "takenAt",
      "width",
    ]);
    // …but the blob is still reachable by id, which is what the viewer reads.
    expect(shot(meta.id)?.blob).toBeInstanceOf(Blob);
  });

  it("gives two pictures taken in the same millisecond different ids", () => {
    // `Date.now()` has millisecond resolution and a player CAN press the key
    // twice inside one — an id collision would overwrite the first picture.
    const a = putShot(file(1000));
    const b = putShot(file(1000));
    expect(a.id).not.toBe(b.id);
    expect(shotList()).toHaveLength(2);
  });

  it("drops the oldest once the cap is reached", () => {
    for (const at of [1000, 2000, 3000, 4000]) putShot(file(at, `L${at}`));
    expect(shotList().map((entry) => entry.label)).toEqual([
      "L4000",
      "L3000",
      "L2000",
    ]);
  });

  it("forgets a deleted picture, pixels included", async () => {
    const kept = putShot(file(1000, "KEPT"));
    const gone = putShot(file(2000, "GONE"));
    await deleteShot(gone.id);
    expect(shot(gone.id)).toBeNull();
    expect(shotList().map((entry) => entry.id)).toEqual([kept.id]);
  });

  it("empties on clear", async () => {
    putShot(file(1000));
    await clearShots();
    expect(shotList()).toEqual([]);
  });
});

describe("watching the roll", () => {
  it("delivers the roll on subscribe and again on every change", async () => {
    const seen: number[] = [];
    const stop = subscribeShots((shots) => seen.push(shots.length));
    expect(seen).toEqual([0]);
    const one = putShot(file(1000));
    putShot(file(2000));
    await deleteShot(one.id);
    expect(seen).toEqual([0, 1, 2, 1]);
    stop();
    putShot(file(3000));
    expect(seen).toEqual([0, 1, 2, 1]);
  });
});

describe("with no store to open", () => {
  it("resolves the in-memory roll rather than rejecting", async () => {
    // `loadShots` is awaited by the gallery on mount; a rejection here would
    // be an unhandled one in a component that has no way to catch it.
    putShot(file(1000, "MOON"));
    await expect(loadShots()).resolves.toHaveLength(1);
  });

  it("still resolves the writes it cannot persist", async () => {
    putShot(file(1000));
    await expect(deleteShot("nope")).resolves.toBeUndefined();
    await expect(clearShots()).resolves.toBeUndefined();
  });
});
