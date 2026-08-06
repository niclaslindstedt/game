// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ACTIVE SCRIPT CATALOG — and, like `flags.ts` and `mapgen/blueprints.ts`,
// an IMPORT-FREE LEAF. That is the whole reason it is its own module.
//
// `registerDefs({ scripts })` has to be reachable from `defs/registry.ts`, and
// `defs/registry.ts` is reachable from the startup path. If the registry
// touched `host.ts` instead, the Lua VM — lexer, parser, interpreter, stdlib —
// would land inside the 200 KB critical-path budget for the sake of a setter.
// So what a mod registers is SOURCE TEXT, and the compile happens in `host.ts`
// the first time a hook is actually called, which is inside a run.
//
// The counter is the other half: every swap bumps `scriptGeneration()`, and the
// host throws its compiled modules away when the number it remembers goes
// stale. That is what makes `restoreBaseDefs()` at the end of a modded run
// actually put the shipped formulas back, rather than leaving the mod's
// compiled chunks live in a cache nobody invalidates.

/** One authored script file: its id (the stem, e.g. `loot`) and its Lua source
 * exactly as the author wrote it. */
export type ScriptSource = {
  readonly id: string;
  readonly source: string;
};

let active: Readonly<Record<string, ScriptSource>> = {};
let generation = 0;

/**
 * Replace the active script set. Called by `registerDefs({ scripts })` — from
 * the generated shipped catalog at startup, from a mod when a modded run
 * begins, and from `restoreBaseDefs()` when it ends.
 */
export function setScriptSources(
  scripts: Readonly<Record<string, ScriptSource>>,
): void {
  active = scripts;
  generation++;
}

/** The scripts a run's hooks resolve against right now. */
export function activeScriptSources(): Readonly<Record<string, ScriptSource>> {
  return active;
}

/** Bumped on every swap — the host's cache key (see the header). */
export function scriptGeneration(): number {
  return generation;
}
