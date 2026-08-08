// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE EMBEDDED LUA — public surface. Generic engine code (`@game/lib/lua/*`):
// it knows nothing about this game, only about running a small, deterministic,
// metered Lua in a sandbox.
//
// The shape is two objects:
//
//   compile(source, name)  → LuaScript   — parsed once, reusable for ever
//   script.run(env, budget) → LuaModule  — the chunk's return value, per env
//
// A script is COMPILED ONCE and RUN ONCE per environment; the module it returns
// is a plain table of functions the host then calls with `callFunction`. That
// split is what keeps the per-call cost to the call itself: parsing happens at
// build time (the content pipeline) or at mod-compile time, never in a frame.
//
// Everything here is deterministic and side-effect-free by construction — see
// `stdlib.ts` for what is deliberately missing and why.

import { parse } from "./parser.ts";
import { Interpreter, rootScope, type RunState } from "./interp.ts";
import { createGlobals } from "./stdlib.ts";
import {
  LuaBudgetError,
  LuaError,
  LuaTable,
  freezeTable,
  luaToDisplay,
  luaType,
  toLuaTable,
  type LuaFunction,
  type LuaValue,
} from "./value.ts";
import type { Chunk } from "./ast.ts";

export {
  LuaBudgetError,
  LuaError,
  LuaTable,
  freezeTable,
  luaToDisplay,
  luaType,
  toLuaTable,
};
export type { LuaValue, LuaFunction };
export { native } from "./stdlib.ts";
export { LuaSyntaxError } from "./lexer.ts";

/** How many interpreter steps a call may take before it is killed. Generous for
 * a formula (a hook is tens of steps) and small enough that a runaway loop
 * costs a frame rather than the session. */
export const DEFAULT_BUDGET = 200_000;

/** A parsed chunk. Immutable and free of run state — safe to share between
 * runs, between worlds in one session, and across a `restoreBaseDefs`. */
export type LuaScript = {
  readonly name: string;
  readonly chunk: Chunk;
};

/** Parse Lua source. Throws `LuaSyntaxError` (naming the chunk and line) if it
 * does not parse — which is how a malformed script fails the build instead of
 * the run. */
export function compile(source: string, name: string): LuaScript {
  return { name, chunk: parse(source, name) };
}

/** A loaded script instance: the value its chunk returned, the globals it ran
 * against (so the host can install more natives afterwards if it needs), and
 * the VM those globals belong to. */
export type LuaModule = {
  readonly name: string;
  readonly exports: LuaTable;
  readonly globals: LuaTable;
  /** The module's own interpreter, REUSED across calls — see `callFunction`.
   * Opaque to callers. */
  readonly vm: Interpreter;
  /** …and the counters it reads, which `callFunction` resets. */
  readonly run: RunState;
};

/** Build a VM whose budget counter is fresh, over a given globals table. */
function makeVm(
  globals: LuaTable,
  chunk: string,
  limit: number,
): { vm: Interpreter; run: RunState } {
  const run: RunState = { steps: 0, limit, chunk, depth: 0, maxDepth: 100 };
  return { vm: new Interpreter(globals, run), run };
}

/**
 * Run a compiled chunk's top level and return what it returned.
 *
 * `env` is merged into the sandbox globals — this is where a host puts its
 * read-only state views and its natives. The chunk is expected to end in
 * `return { … }`; a chunk that returns nothing yields an empty module, which
 * the host reports as "declares no hooks".
 */
export function load(
  script: LuaScript,
  env: Record<string, LuaValue> = {},
  budget = DEFAULT_BUDGET,
): LuaModule {
  let vm!: Interpreter;
  const globals = createGlobals(() => vm);
  for (const [k, v] of Object.entries(env)) globals.set(k, v);
  const made = makeVm(globals, script.name, budget);
  vm = made.vm;
  const signal = vm.execBlock(script.chunk.block, rootScope());
  const returned = signal?.kind === "return" ? signal.values[0] : undefined;
  return {
    name: script.name,
    exports: returned instanceof LuaTable ? returned : new LuaTable(),
    globals,
    vm,
    run: made.run,
  };
}

/**
 * Call one function out of a loaded module with a FRESH budget, and return its
 * results. The budget is per call, so one expensive hook cannot starve the
 * next; a script that blows it throws `LuaBudgetError`, which no `pcall` inside
 * the script can swallow.
 */
export function callFunction(
  mod: LuaModule,
  fn: LuaFunction,
  args: LuaValue[],
  budget = DEFAULT_BUDGET,
): LuaValue[] {
  // The module's own VM is reused and its counters reset, rather than a fresh
  // interpreter being built per call. A hook is called per drop and per kill,
  // and the allocation was measurable at horde scale; the counters are the only
  // per-call state a VM has, so resetting them IS a fresh VM.
  mod.run.steps = 0;
  mod.run.limit = budget;
  mod.run.depth = 0;
  return mod.vm.call(fn, args, 0);
}

/** The exported function called `name`, or `undefined` when the module has no
 * such hook (which is the normal case — a script implements the hooks it cares
 * about and leaves the rest to whatever ships below it). */
export function moduleFunction(
  mod: LuaModule,
  name: string,
): LuaFunction | undefined {
  const v = mod.exports.get(name);
  return v !== undefined && typeof v === "object" && !(v instanceof LuaTable)
    ? v
    : undefined;
}
