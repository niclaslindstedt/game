// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CACHE's LADDER — the chest Ruth pays for THE SCALE on each difficulty
// (`DifficultyDef.cache`, see engine/game/cache.ts).
//
// The ladder is authored across five separate difficulty defs and read by four
// surfaces (the engine's grant, the world renderer, the panel's header, the
// errand's own dialogue), and nothing else checks it: the schema that polices
// authored pages never sees these lines, because they arrive through the
// `{CACHE}` token rather than through a quest YAML. Everything below is a way
// the ladder can be quietly wrong.

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  CACHE,
  CACHE_TOKEN,
  cacheRungFor,
  DIFFICULTY_ORDER,
  difficultyDef,
  questDef,
  resolveCacheLine,
  questPageLines,
} from "@game/core";

import { GLYPHS } from "../../scripts/asset-tools/font.mjs";

/** The shipping sprite inventory — the generated atlas manifest. */
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

/** How long an authored page may run before it costs the player a second tap —
 * the same budget the quest schema holds every other page to. */
const PAGE_MAX_CHARS = 120;

const rungs = DIFFICULTY_ORDER.map((id) => ({
  id,
  cache: difficultyDef(id).cache,
}));
const paying = rungs.filter((rung) => rung.cache);

describe("the cache ladder", () => {
  it("every shipped rung pays a chest", () => {
    // A rung that pays none is a difficulty where Ruth's last errand quietly
    // gives nothing back — the errand still runs and still says its lines.
    expect(rungs.filter((rung) => !rung.cache).map((rung) => rung.id)).toEqual(
      [],
    );
  });

  it("climbs, in whole rows, up to the ceiling the grid is laid out at", () => {
    const slots = paying.map((rung) => rung.cache!.slots);
    // Strictly deeper each rung — a ladder that repeated a number would leave
    // a difficulty whose reward is a new NAME on the same chest.
    expect(slots).toEqual([...slots].sort((a, b) => a - b));
    expect(new Set(slots).size).toBe(slots.length);
    // Whole rows of D2's own width, or the rectangle ends ragged and the
    // "one more row per difficulty" read the ladder is built on breaks.
    for (const n of slots) expect(n % CACHE.cols).toBe(0);
    // The deepest is exactly the array every hero carries: the top of the
    // ladder is what `CACHE.maxSlots` is FOR, and a gap between them would be
    // cells nothing can ever unlock.
    expect(Math.max(...slots)).toBe(CACHE.maxSlots);
  });

  it("the top of the ladder is D2's own stash", () => {
    // The number this whole feature is borrowed from: 8 x 6.
    expect(CACHE.maxSlots).toBe(CACHE.cols * 6);
  });

  it("every rung is a distinct thing with art that ships", () => {
    const names = paying.map((rung) => rung.cache!.name);
    expect(new Set(names).size).toBe(names.length);
    for (const rung of paying) {
      const { name, sprite } = rung.cache!;
      expect(name.length, name).toBeGreaterThan(0);
      // A missing sprite is silent: the renderer falls back to the blueprint's
      // and the player climbs a whole difficulty for the same picture.
      expect(sprites.has(sprite), `${rung.id}: ${sprite}`).toBe(true);
    }
    // …and the art is a distinct piece per rung, which is the point of it.
    const art = paying.map((rung) => rung.cache!.sprite);
    expect(new Set(art).size).toBe(art.length);
  });

  it("every rung's line is a page the box can actually draw", () => {
    for (const rung of paying) {
      const { line } = rung.cache!;
      expect(
        line.length,
        `${rung.id}: ${line.length} chars`,
      ).toBeLessThanOrEqual(PAGE_MAX_CHARS);
      // The pixel font draws an unknown character as a literal `?`, so a stray
      // curly quote or semicolon ships as punctuation nobody typed.
      const missing = [...new Set([...line.toUpperCase()])].filter(
        (ch) => !(ch in GLYPHS),
      );
      expect(missing, `${rung.id} uses ${missing.join(" ")}`).toEqual([]);
    }
  });
});

describe("the cache ladder — how it reaches the player", () => {
  it("Ruth's errand spends the token, so every rung says its own line", () => {
    // The errand is ONE file and the ladder is five: if the page stopped
    // carrying `{CACHE}`, every difficulty would silently share one sentence.
    const pages = questDef("ruth_scale").complete;
    expect(
      pages.some((page) =>
        questPageLines(page).some((line) => line.includes(CACHE_TOKEN)),
      ),
    ).toBe(true);
  });

  it("the token resolves on every rung and leaves no brace behind", () => {
    for (const rung of paying) {
      const page = resolveCacheLine([CACHE_TOKEN], rung.id);
      expect(page, rung.id).not.toBeNull();
      expect(page![0]).toBe(rung.cache!.line);
      expect(page![0]).not.toContain("{");
    }
  });

  it("a page with no token is returned untouched", () => {
    // Every other page of every other errand takes this path, so it has to be
    // free — and it has to be the SAME array, or the offer box would re-render
    // on a fresh object every frame.
    const page = ["JUST A LINE."];
    expect(resolveCacheLine(page, "medium")).toBe(page);
  });

  it("what a hero is looking at is their EARNED rung, not the one they play", () => {
    // A hero who beat NIGHTMARE and started a fresh EASY run is still standing
    // in front of the dowry chest — the name over the window and the thing in
    // the garage both come off the depth, never off the difficulty.
    for (const rung of paying) {
      expect(cacheRungFor(rung.cache!.slots)?.name).toBe(rung.cache!.name);
    }
    // Between two rungs reads as the deeper one already earned.
    const [first, second] = paying;
    if (first && second) {
      expect(cacheRungFor(first.cache!.slots + 1)?.name).toBe(
        first.cache!.name,
      );
    }
    // And a hero with no chest is looking at nothing.
    expect(cacheRungFor(0)).toBeNull();
  });
});
