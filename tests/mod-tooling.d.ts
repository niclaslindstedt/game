// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Ambient types for the mod toolchain's `.mjs` modules (see mod/README.md).
// They are plain JavaScript — deliberately, because the SHIPPED desktop app
// runs the same files in its main process, where there is no TypeScript — so
// these wildcard shims give the tests enough typing to import them without
// `any`. Keep them in step with mod/tools/build.mjs.

declare module "*/mod/tools/build.mjs" {
  export const BUNDLE_FORMAT: number;

  export type ModSprite = {
    name: string;
    width: number;
    height: number;
    /** Raw RGBA, row-major, base64'd. */
    rgba: string;
  };

  /** One CLIP a mod ships: a file stem, and its takes. What PLAYS it is an
   * ordinary sound def in `sounds` with a `call: sample` voice naming it —
   * the compiler writes that def even for a bare dropped-in recording, so
   * there is only ever one mechanism. */
  export type ModSample = {
    id: string;
    /** The encoded files, base64'd and otherwise untouched, in take order.
     * Several when the mod shipped `<clip>.1.wav`, `<clip>.2.wav` … */
    takes: string[];
  };

  export type ModBundle = {
    formatVersion: number;
    id: string;
    name: string;
    version: string;
    author: string;
    description: string;
    kind: "addon" | "conversion";
    /** What a CONVERSION calls the game on its title screen; null otherwise. */
    brand: { title: string; tagline: string } | null;
    campaign: string[] | null;
    levels: unknown[];
    /** The GENERATED MAPS recipes, keyed by the level each one carves. */
    blueprints: Record<string, unknown>;
    enemies: Record<string, unknown>;
    weapons: Record<string, unknown>;
    gear: Record<string, unknown>;
    uniques: Record<string, unknown>;
    sprites: ModSprite[];
    sounds: Record<string, unknown>;
    /** The audio files it ships, by clip name. Absent when it ships none. */
    samples?: ModSample[];
    /** Event shape → sound id, keyed as `routeKey` builds it. */
    soundKeys: Record<string, string>;
    /** Cue → sound id, keyed `cue|surface`. */
    cueKeys?: Record<string, string>;
    /** The mod's own scores, cooked into `ChiptuneTrack` shape. */
    music: Record<string, unknown>;
    /** …and its RECORDED scores: `{ id, data }`, `data` base64. */
    musicSamples?: { id: string; data: string }[];
    /** The mod's own POWERS, already `{ id → AbilityDef }`. */
    powerups: Record<string, unknown>;
    /** The mod's own TALENTS, already `{ id → TalentDef }` — the passives it
     * adds to (or replaces in) the shipped trees. */
    talents: Record<string, unknown>;
    /** The mod's own COMPANIONS, already `{ id → CompanionDef }` — who its
     * spared elites become. */
    companions: Record<string, unknown>;
    /** The mod's own SETS, already `{ id → SetDef }` — the kits its green
     * pieces belong to. */
    sets: Record<string, unknown>;
    /** What the difficulty rungs are CALLED under this mod — a partial
     * `{ rung → { name?, tagline? } }` folded onto the shipped defs. */
    difficulties: Record<string, { name?: string; tagline?: string }>;
    /** THE STORY. `cutscenes` arrives with its `variants:` already expanded into
     * `<id>_<difficulty>` scenes; `capRotation` REPLACES the shipped cap-farm
     * rotation rather than merging with it. */
    cutscenes: Record<string, unknown>;
    thoughts: Record<string, unknown>;
    capRotation: string[];
    storyItems: Record<string, unknown>;
    /** The mod's own RULES, keyed by script id — the Lua it ships to replace a
     * shipped formula. The one catalog that is behaviour rather than data. */
    scripts: Record<string, { id: string; source: string }>;
    /** The manifest's inventory — every file the game loads, with the author's
     * own line about what it is. Empty for a mod that ships no `contents:`. */
    contents: { path: string; summary: string; change: "adds" | "replaces" }[];
  };

  /** `bundle` is null whenever `errors` is non-empty — a mod that does not
   * compile is never half-loaded. */
  export function buildMod(
    modDir: string,
    catalog: unknown,
  ): { bundle: ModBundle | null; errors: string[]; warnings: string[] };
}

declare module "*/scripts/asset-tools/script-schema.mjs" {
  /**
   * Validate one authored Lua rule by COMPILING it with the engine's own VM —
   * the mod compiler and the content pipeline both run this, so "it works in my
   * mod" and "it works in the game" mean the same thing.
   */
  export function validateScript(
    id: string,
    source: string,
    opts?: { shipped?: boolean },
  ): { errors: string[]; warnings: string[]; hooks: string[] };

  /** The whole-catalog rule for the SHIPPED scripts: every hook has an
   * implementation somewhere. */
  export function validateScriptCatalog(implemented: string[]): {
    errors: string[];
    warnings: string[];
  };

  /** hook name → the script id that owns it. */
  export const HOOK_OWNER: Map<string, string>;
  /** script id → the hooks it is expected to implement. */
  export const SCRIPT_HOOKS: Map<string, string[]>;
}

declare module "*/mod/tools/validate.mjs" {
  /** One file in a mod folder that the audit refused, and why. */
  export type ModFileFinding = { rel: string; why: string };

  /** The folder, classified: what the game loads, what belongs beside it, and
   * what should not be there at all. */
  export type ModFiles = {
    content: string[];
    sidecar: string[];
    junk: ModFileFinding[];
    stray: ModFileFinding[];
  };

  /** The pre-publish audit: the folder itself, the README, and the manifest's
   * inventory — plus the COMPILER's own findings when a catalog is given. */
  export function validateMod(
    modDir: string,
    opts?: { catalog?: unknown },
  ): {
    errors: string[];
    warnings: string[];
    contents: { path: string; summary: string; change: "adds" | "replaces" }[];
    files: ModFiles;
  };

  /** What a package carries: the manifest, the declared content, and the
   * sidecars that are the author's to ship. */
  export function packagedFiles(files: ModFiles): string[];

  /** The marker the scaffold's README carries until somebody writes it. */
  export const README_TODO: string;
}

declare module "*/mod/tools/package.mjs" {
  /** Thrown when the folder is not fit to package — every finding at once. */
  export class ModPackageError extends Error {
    problems: string[];
  }

  /** Audit, then write a zip of exactly what the manifest declares. Throws
   * `ModPackageError` (and writes nothing) when the audit fails. */
  export function packageMod(
    modDir: string,
    opts?: { catalog?: unknown; out?: string },
  ): { file: string; entries: string[]; bytes: number; warnings: string[] };
}

declare module "*/mod/tools/catalog-read.mjs" {
  export const CATALOG_FORMAT: number;
  /** Throws on an unreadable or wrong-format catalog: without one there is no
   * compile at all, so it is not a finding a mod author could act on. */
  export function readCatalog(file: string): unknown;
}

declare module "*/scripts/mod-support.mjs" {
  /** A mod folder's `--mod` flags, pulled out of an argument list so a
   * script's own parser sees only what it knows (see the module header). */
  export function takeModFlags(args: string[]): {
    mods: string[];
    rest: string[];
  };

  /** Compile a stack of mods and merge them into the live game. Null when
   * `dirs` is empty, so a caller can pass its flag through unconditionally. */
  export function applyMods(
    dirs: string[],
    options?: { quiet?: boolean },
  ): Promise<{
    bundles: unknown[];
    levels: { id: string; def: unknown; description: string }[];
    levelIds: string[];
    dirs: string[];
  } | null>;

  /** Merge the mods' sprites into the node-side sprite maps every preview
   * renders from. Returns how many were merged. */
  export function installModSprites(loaded: unknown): Promise<number>;

  /** `applyMods` + `installModSprites` — the common case for a tool that
   * draws. */
  export function applyModsWithSprites(
    dirs: string[],
    options?: { quiet?: boolean },
  ): ReturnType<typeof applyMods>;
}
