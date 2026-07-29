// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHICH MOD IS ON — an import-free leaf, and it has to be one.
//
// The MODS screen is on the app's STARTUP path (it is a main-menu row), and its
// builder needs exactly one fact from the mod system: which mod is currently
// applied, so the list can mark it. Its neighbour `mods.ts` cannot answer that
// question, because answering it there would mean the startup path imports a
// module that imports `@game/core` — and one import away sit the level catalog,
// the loot roller, the enemy defs and the whole step pipeline. Tree-shaking does
// not save you: it is global, so an export used by ANY chunk keeps its bytes
// wherever its module was placed, and the module was on the startup path. The
// 170 KB gzipped critical-path budget (`pwa/scripts/check-seo.mjs`) is what
// notices.
//
// So this is the same move `src/game/flags.ts` makes for the engine's runtime
// toggles: the STATE lives in a leaf that imports nothing, and the module that
// does the heavy work writes to it. A settings screen must not import the
// dialogue system to mute it, and a menu row must not import the simulation to
// put "ON" beside a mod's name.

/** One sprite as the compiler emits it: raw RGBA, base64'd. No palette, no
 * grid — the whole pixel format stays on the compiler's side of the wall. */
export type ModSprite = {
  name: string;
  width: number;
  height: number;
  rgba: string;
};

/** A compiled mod, exactly as `mod/tools/build.mjs` emits it.
 *
 * The TYPES live here rather than beside the code that applies them for the
 * same reachability reason the state does: the bridge and the MODS screen both
 * need to describe a bundle, and neither may import the module that knows how
 * to load one. */
export type ModBundle = {
  formatVersion: number;
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  kind: "addon" | "conversion";
  /** A conversion's campaign, in play order; null for an addon, whose levels
   * join the shipped order at their own `index`. */
  campaign: string[] | null;
  levels: unknown[];
  enemies: Record<string, unknown>;
  sprites: ModSprite[];
};

/** What a hero remembers about the mod they were played under. Stored on the
 * character, so a roster full of mod heroes still reads correctly on a device
 * that has since unsubscribed from all of them. */
export type ModStamp = { id: string; name: string; version: string };

let active: ModStamp | null = null;

/** The mod currently applied to the engine, or null for the shipped game. */
export function activeMod(): ModStamp | null {
  return active;
}

/** Record which mod is applied. Called only by `mods.ts`, on either side of a
 * modded run — a screen must never set this, because setting it without
 * swapping the catalogs would make every surface that reads it lie. */
export function setActiveMod(stamp: ModStamp | null): void {
  active = stamp;
}
