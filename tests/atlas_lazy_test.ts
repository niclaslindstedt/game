// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE LAZY SPRITE MAP (`@ui/lib/atlas.ts` `sliceAtlas`) — the object every
// drawn frame in the game reads a sprite out of.
//
// It is a Proxy, and the reason it is worth this many assertions is that it
// replaced a plain object that a lot of code already treats as one: the
// renderer reads it, a mod WRITES to it, ending a modded run DELETES from it,
// and the mod screen enumerates it. Each of those goes through a different trap,
// a trap that is subtly wrong fails somewhere far away (a sprite that silently
// stops drawing, a mod's art surviving into the next run), and none of it is
// covered by the type checker.
//
// The one that is easiest to get wrong and hardest to notice is the LAST test:
// enumeration must not resolve anything. `Object.keys` asks the proxy for a
// descriptor per key, so a `getOwnPropertyDescriptor` that reached for the
// sprite would cut all two thousand of them — quietly restoring the eager
// behaviour this exists to remove, while every other test still passed.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { sliceAtlas, type AtlasRect } from "@ui/lib/atlas.ts";

/** How many surfaces have been minted — the cost this whole design is about. */
let cuts = 0;

/** A canvas stand-in: the slicer only sets a size, takes a 2D context and
 * blits one region into it, so none of that has to be real here. */
function fakeCanvas() {
  cuts += 1;
  return {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: () => {} }),
  };
}

// Typed off `sliceAtlas` itself rather than by naming the DOM type: this suite
// runs with Node's globals (see eslint.config.js), where `CanvasImageSource` is
// not a name — and the slicer only ever passes this straight to `drawImage`.
const ATLAS = { width: 64, height: 64 } as unknown as Parameters<
  typeof sliceAtlas
>[0];
const RECTS: Record<string, AtlasRect> = {
  hero: [0, 0, 8, 8],
  ghoul: [8, 0, 8, 16],
  crate: [16, 0, 16, 16],
};

let realDocument: unknown;

beforeEach(() => {
  cuts = 0;
  realDocument = (globalThis as Record<string, unknown>).document;
  (globalThis as Record<string, unknown>).document = {
    createElement: () => fakeCanvas(),
  };
});

afterEach(() => {
  (globalThis as Record<string, unknown>).document = realDocument;
});

describe("sliceAtlas", () => {
  it("cuts nothing until something is read", () => {
    sliceAtlas(ATLAS, RECTS);
    expect(cuts).toBe(0);
  });

  it("cuts exactly the sprites that are asked for", () => {
    const sprites = sliceAtlas(ATLAS, RECTS);
    expect(sprites.hero).toBeDefined();
    expect(cuts).toBe(1);
    expect(sprites.ghoul).toBeDefined();
    expect(cuts).toBe(2);
  });

  it("cuts a sprite once and hands back the same surface after", () => {
    // Identity matters beyond the saved work: the renderer keys per-sprite
    // caches (recolours, wall bakes, opaque widths) off the object itself, so a
    // map that minted a new surface per read would leak a cache entry a frame.
    const sprites = sliceAtlas(ATLAS, RECTS);
    const first = sprites.hero;
    expect(sprites.hero).toBe(first);
    expect(sprites.hero).toBe(first);
    expect(cuts).toBe(1);
  });

  it("gives back the sprite's own size", () => {
    const sprites = sliceAtlas(ATLAS, RECTS);
    expect(sprites.crate?.width).toBe(16);
    expect(sprites.ghoul?.height).toBe(16);
  });

  it("answers a name the atlas does not carry with undefined", () => {
    // `spriteByName` treats undefined as "not drawn" rather than crashing the
    // frame, so this is the contract a missing sprite already relies on.
    const sprites = sliceAtlas(ATLAS, RECTS) as Record<string, unknown>;
    expect(sprites.nosuchsprite).toBeUndefined();
    expect(cuts).toBe(0);
  });

  it("takes a mod's own sprite, over a shipped name and beside it", () => {
    const sprites = sliceAtlas(ATLAS, RECTS) as Record<string, unknown>;
    const modArt = { width: 99, height: 99 };
    sprites.hero = modArt;
    sprites.mod_only = modArt;
    expect(sprites.hero).toBe(modArt);
    expect(sprites.mod_only).toBe(modArt);
    // The override was handed over whole — nothing was cut for either name.
    expect(cuts).toBe(0);
  });

  it("restores the shipped sprite when a mod's override is deleted", () => {
    // This IS how `restoreBaseDefs` puts the base game back: it deletes the
    // names mods touched and lets the atlas answer again. A map that remembered
    // the deletion as "no such sprite" would leave the game with holes in it
    // for the rest of the session.
    const sprites = sliceAtlas(ATLAS, RECTS) as Record<string, unknown>;
    sprites.hero = { width: 99, height: 99 };
    delete sprites.hero;
    expect((sprites.hero as { width: number } | undefined)?.width).toBe(8);
    expect(cuts).toBe(1);
  });

  it("forgets a mod-only sprite entirely when it is deleted", () => {
    const sprites = sliceAtlas(ATLAS, RECTS) as Record<string, unknown>;
    sprites.mod_only = { width: 99, height: 99 };
    delete sprites.mod_only;
    expect(sprites.mod_only).toBeUndefined();
  });

  it("reports the catalogue it can serve", () => {
    const sprites = sliceAtlas(ATLAS, RECTS) as Record<string, unknown>;
    expect("hero" in sprites).toBe(true);
    expect("nosuchsprite" in sprites).toBe(false);
    sprites.mod_only = { width: 1, height: 1 };
    expect("mod_only" in sprites).toBe(true);
  });

  it("ENUMERATES THE WHOLE CATALOGUE WITHOUT CUTTING ANY OF IT", () => {
    // The test this file exists for. `Object.keys` asks for a descriptor per
    // key; resolving the sprite there would cut all of them and silently undo
    // the laziness while every assertion above still passed.
    const sprites = sliceAtlas(ATLAS, RECTS) as Record<string, unknown>;
    sprites.mod_only = { width: 1, height: 1 };
    expect(Object.keys(sprites).sort()).toEqual([
      "crate",
      "ghoul",
      "hero",
      "mod_only",
    ]);
    expect(cuts).toBe(0);
  });

  it("lists a name once even when a mod has written over it", () => {
    // `ownKeys` must not report a duplicate — the proxy invariant throws.
    const sprites = sliceAtlas(ATLAS, RECTS) as Record<string, unknown>;
    sprites.hero = { width: 1, height: 1 };
    expect(Object.keys(sprites).filter((k) => k === "hero")).toHaveLength(1);
  });
});
