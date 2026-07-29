// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// MODS — the web side of Steam Workshop content. Steam builds only.
//
// A mod reaches this module as a `ModBundle`: plain JSON, already compiled and
// already validated by `mod/tools/build.mjs` in the shell's main process. The
// page never sees a mod's YAML, never reads a file, and never runs a line of
// anything a mod shipped. That is the security story in one sentence, and it is
// why the format has no scripting hook: subscribing to a mod must not mean
// running a stranger's code.
//
// Applying one is two moves, and the engine already had the seam for both:
//
//  1. **The catalogs** go in through `registerDefs` — the same hook the engine
//     test suites use to run against synthetic fixtures. It replaces the ACTIVE
//     registry that every `levelDef` / `enemyDef` accessor reads, so a mod's
//     monster is looked up by exactly the code that looks up a shipped one.
//  2. **The sprites** are merged into the loaded sprite record, which is a
//     plain `Record<name, ImageBitmap>` the renderer reads through
//     `spriteByName`. A mod's frames become ImageBitmaps like the atlas's own
//     and the renderer cannot tell them apart.
//
// The one rule that governs everything here: **A MOD IS APPLIED TO A RUN, NEVER
// TO A SAVE.** The catalogs are global mutable state, so a mod loaded for one
// run is still loaded in the menus afterwards — and a hero who levelled on a
// mod's map, wearing a mod's drop, must not become a corrupt roster entry the
// day the player unsubscribes. So a mod is applied when a run starts and
// `restoreBaseDefs()` puts the shipped catalogs back when it ends, and a hero
// remembers which mod they were made under (`ModStamp`) rather than the mod's
// content being folded into them.

import {
  ENEMY_DEFS,
  LEVELS,
  registerDefs,
  type DefOverrides,
} from "@game/core";

import type { Sprites } from "./assets.ts";
import {
  setActiveMod,
  type ModBundle,
  type ModSprite,
  type ModStamp,
} from "./mod-state.ts";

export {
  activeMod,
  type ModBundle,
  type ModSprite,
  type ModStamp,
} from "./mod-state.ts";

/** The bundle format this build understands, mirroring `BUNDLE_FORMAT` in
 * mod/tools/build.mjs. A bundle from a newer game is refused with a readable
 * reason rather than half-loaded. */
export const SUPPORTED_BUNDLE_FORMAT = 1;

/**
 * Why a bundle was refused. Kept as a code rather than a sentence because the
 * MODS screen renders it and the log records it, and those want different
 * lengths of the same fact.
 */
export type ModRejection = "format" | "empty";

export function bundleProblem(bundle: ModBundle): ModRejection | null {
  if (bundle.formatVersion !== SUPPORTED_BUNDLE_FORMAT) return "format";
  if (bundle.levels.length === 0 && Object.keys(bundle.enemies).length === 0) {
    return "empty";
  }
  return null;
}

// ---------------------------------------------------------------------------
// The base catalogs, captured once so a mod can always be backed out.
//
// This is captured LAZILY on the first apply rather than at module load: at
// load time the engine's own catalogs are the active ones, but so is anything
// a previous apply left behind if this module were ever re-imported. Reading
// them at the moment of the first apply is the only point at which "the
// shipped catalogs" is unambiguous.
// ---------------------------------------------------------------------------
let baseDefs: DefOverrides | null = null;
let baseSprites: Sprites | null = null;

/**
 * Apply a compiled mod to the engine and the sprite set.
 *
 * @param bundle   the compiled mod
 * @param sprites  the loaded sprite record, mutated in place — the renderer
 *                 holds this exact object, so a copy would draw nothing
 * @returns the stamp to write onto any hero played under it
 */
export async function applyMod(
  bundle: ModBundle,
  sprites: Sprites,
): Promise<ModStamp> {
  // The shipped catalogs, read from the engine itself rather than passed in:
  // a caller that had to supply them would have to import `@game/core` to get
  // them, and every caller here is a menu on the startup path.
  if (!baseDefs) baseDefs = { levels: LEVELS, enemies: ENEMY_DEFS };
  if (!baseSprites) baseSprites = { ...sprites };

  const merged: DefOverrides = {
    ...baseDefs,
    levels: {
      ...(baseDefs.levels ?? {}),
      ...Object.fromEntries(
        (bundle.levels as { id: string }[]).map((l) => [l.id, l]),
      ),
    } as DefOverrides["levels"],
    enemies: {
      ...(baseDefs.enemies ?? {}),
      ...bundle.enemies,
    } as DefOverrides["enemies"],
  };
  registerDefs(merged);

  // A conversion's sprite may deliberately share a shipped name — that is how
  // it re-skins the game rather than adding to it — so the mod's frames go in
  // last and win.
  for (const [name, bitmap] of await decodeSprites(bundle.sprites)) {
    (sprites as Record<string, ImageBitmap>)[name] = bitmap;
  }

  const stamp: ModStamp = {
    id: bundle.id,
    name: bundle.name,
    version: bundle.version,
  };
  setActiveMod(stamp);
  return stamp;
}

/**
 * Put the shipped game back. Called when a modded run ends, so the menus, the
 * roster and the next run are the base game again — a mod is a property of a
 * RUN, never of the install.
 */
export function restoreBaseDefs(sprites: Sprites): void {
  if (baseDefs) registerDefs(baseDefs);
  if (baseSprites) {
    // Restore by REPLACING the contents of the same object rather than swapping
    // it: the renderer captured this reference at load and never re-reads it.
    for (const name of Object.keys(sprites)) {
      delete (sprites as Record<string, ImageBitmap>)[name];
    }
    Object.assign(sprites, baseSprites);
  }
  setActiveMod(null);
}

/**
 * Raw RGBA → ImageBitmap, one per sprite.
 *
 * `createImageBitmap` over an `ImageData` is the only step here, and it is the
 * reason the compiler ships pixels rather than a PNG: decoding a PNG is
 * asynchronous, failable, and — for content a stranger authored — a decoder
 * attack surface. A flat byte array of a size we already know is none of those.
 */
async function decodeSprites(
  sprites: ModSprite[],
): Promise<[string, ImageBitmap][]> {
  const out: [string, ImageBitmap][] = [];
  for (const sprite of sprites) {
    const bytes = base64ToBytes(sprite.rgba);
    const expected = sprite.width * sprite.height * 4;
    // A short buffer would throw inside ImageData with a message naming
    // neither the mod nor the sprite; skip it and let the mob draw as nothing,
    // which is at least the failure the compiler already warned about.
    if (bytes.length !== expected) continue;
    const data = new ImageData(
      new Uint8ClampedArray(bytes),
      sprite.width,
      sprite.height,
    );
    out.push([sprite.name, await createImageBitmap(data)]);
  }
  return out;
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
