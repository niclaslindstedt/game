// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE HUD'S SCRIPT HOST — resolving `{ script: "file.fn" }` to a Lua function,
// calling it, and deciding what happens when a stranger's script is wrong.
//
// It is the engine's own host (src/game/script/host.ts) in miniature, and it
// keeps the two rules that make that one safe:
//
//   FAIL OPEN, ONCE.  A file that will not compile, a function that throws, a
//                     function that runs away, a function that answers with the
//                     wrong kind of thing — each falls back to what the element
//                     would have done with no script at all (visible, uncoloured,
//                     unformatted), is reported ONCE with its file and its line,
//                     and stays fallen back for the rest of the run. A HUD that
//                     flickers between two answers is worse than either.
//   A SCRIPT IS A FORMULA, NEVER A FRAME.  Every call here happens while the HUD
//                     SNAPSHOT is being resolved — which is published on a real
//                     change, not per frame (see `buildHud`'s change key). A
//                     judgement about the run costs a few hundred interpreter
//                     steps a few times a second; nothing per-entity-per-frame
//                     may ever be routed through here.
//
// The VM is the engine's (`@game/lib/lua`), sandboxed and metered exactly as the
// rules are: no io, no os, no clock, no randomness. A mod's HUD script cannot
// read the page, reach the network or see another mod.

import { warn } from "@game/menu";
import {
  callFunction,
  compile,
  load,
  LuaTable,
  moduleFunction,
  toLuaTable,
  type LuaFunction,
  type LuaModule,
  type LuaValue,
} from "@game/lib/lua/index.ts";

import { menuGeneration, menuLayout } from "../menus/layout.ts";
import { hudGeneration, hudLayout } from "./layout.ts";

/** What one judgement may spend. A HUD script picks a colour off a ladder or
 * answers a yes/no — this ceiling is where that stops being a formula. */
const HUD_BUDGET = 20_000;

type Loaded = { mod: LuaModule } | { failed: true };

type Cache = {
  generation: number;
  readonly modules: Map<string, Loaded>;
  readonly functions: Map<string, LuaFunction | null>;
  readonly disowned: Set<string>;
};

let cache: Cache = fresh();

function fresh(): Cache {
  return {
    generation: generation(),
    modules: new Map(),
    functions: new Map(),
    disowned: new Set(),
  };
}

/**
 * ONE HOST, TWO CATALOGS. The HUD's judgements and the in-game menus' are the
 * same kind of thing — a formula about the run, called when the values publish
 * — so they share a host, a budget and a namespace: `{ script: "pause.label" }`
 * finds `menus/scripts/pause.lua` from a menu row and `hud/scripts/` from a HUD
 * element, and a file stem in both is the HUD's (nothing ships one).
 */
function generation(): number {
  return hudGeneration() + menuGeneration();
}

/** Everything is thrown away when either layout is swapped — which is what
 * makes a mod's replacement judgements take effect, and what makes
 * `restoreHudLayout()` / `restoreMenuLayout()` put the shipped ones back. */
function current(): Cache {
  if (cache.generation !== generation()) cache = fresh();
  return cache;
}

function moduleFor(file: string): LuaModule | null {
  const cached = current().modules.get(file);
  if (cached) return "mod" in cached ? cached.mod : null;
  const script =
    hudLayout().scripts[file] ?? menuLayout().scripts[file] ?? undefined;
  const source = script?.source;
  const where =
    hudLayout().scripts[file] === undefined
      ? `menus/scripts/${file}.lua`
      : `hud/scripts/${file}.lua`;
  if (source === undefined) {
    current().modules.set(file, { failed: true });
    warn(`hud: no script named ${file}.lua — its readers fall back`);
    return null;
  }
  try {
    const mod = load(compile(source, where), {});
    current().modules.set(file, { mod });
    return mod;
  } catch (err) {
    current().modules.set(file, { failed: true });
    warn(`${where}: ${(err as Error).message}`);
    return null;
  }
}

function functionFor(ref: string): LuaFunction | null {
  const cached = current().functions.get(ref);
  if (cached !== undefined) return cached;
  const [file, name] = ref.split(".");
  const mod = file && name ? moduleFor(file) : null;
  if (!mod || !name) {
    current().functions.set(ref, null);
    return null;
  }
  const fn = moduleFunction(mod, name) ?? null;
  if (!fn) warn(`hud: script ${file}.lua exports no "${name}"`);
  current().functions.set(ref, fn);
  return fn;
}

/** The binding groups, as one Lua table of tables. */
function luaState(state: Record<string, Record<string, LuaValue>>): LuaTable {
  const outer = new LuaTable();
  for (const [group, values] of Object.entries(state)) {
    outer.set(group, toLuaTable(values));
  }
  return outer;
}

/** Report a misbehaving judgement once, then leave it fallen back. */
function disown(ref: string, why: string): undefined {
  if (current().disowned.has(ref)) return undefined;
  current().disowned.add(ref);
  warn(`hud: script "${ref}" ${why} — its readers fall back for this run`);
  return undefined;
}

/**
 * Call one HUD judgement with the run's live values.
 *
 * The single argument is a table of the binding GROUPS with their prefixes
 * dropped — `state.hud.bagFree`, `state.ui.keyHints`, `state.drive.wear`. One
 * argument rather than a positional list because the groups grow: the road's
 * dials added a third, and every script written against `f(hud, ui)` would have
 * had to be rewritten to see it.
 *
 * Freezing is unnecessary: the tables are built fresh per resolve and thrown
 * away after, so a script that writes to one has only vandalised its own copy.
 */
export function callHudScript(
  ref: string,
  state: Record<string, Record<string, LuaValue>>,
): LuaValue | undefined {
  if (current().disowned.has(ref)) return undefined;
  const fn = functionFor(ref);
  if (!fn) return undefined;
  const mod = moduleFor(ref.split(".")[0] ?? "");
  if (!mod) return undefined;
  let answered: LuaValue[];
  try {
    answered = callFunction(mod, fn, [luaState(state)], HUD_BUDGET);
  } catch (err) {
    return disown(ref, `failed (${(err as Error).message})`);
  }
  const value = answered[0];
  if (value instanceof LuaTable) return disown(ref, "answered with a table");
  return value;
}

/** A judgement that must answer a colour. Anything else is a misbehaving
 * script, not a colour the renderer should try to use. */
export function hudScriptColor(
  ref: string,
  state: Record<string, Record<string, LuaValue>>,
): string | undefined {
  const value = callHudScript(ref, state);
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^#[0-9a-fA-F]{3,8}$/.test(value)) {
    return disown(
      ref,
      `answered "${String(value)}" where a #hex colour was due`,
    );
  }
  return value;
}

/**
 * A judgement that must answer yes or no.
 *
 * Lua's own truthiness is the rule — `false` is no and everything else is yes —
 * with ONE exception: `nil` is not "no" here, it is "no answer", and an element
 * whose visibility script answers nothing stays on screen rather than silently
 * vanishing. A script that means "hide this" says `false`.
 */
export function hudScriptFlag(
  ref: string,
  state: Record<string, Record<string, LuaValue>>,
): boolean | undefined {
  const value = callHudScript(ref, state);
  if (value === undefined) return undefined;
  return value !== false;
}
