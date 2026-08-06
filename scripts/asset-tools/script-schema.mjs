// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The SCRIPT schema validator. Unlike its siblings, "the schema" here is the
// GAME'S OWN LUA VM: `validateScript` compiles the file with the very
// interpreter that will run it, loads it in a sandbox, and looks at what came
// back. A second, friendlier parser would drift from the real one inside a
// release, and the drift would land as "compiles in the SDK, refuses in the
// game" — the exact failure the one-compiler rule exists to prevent.
//
// What it catches, in the order a mistake usually happens:
//
//   1. it does not PARSE               → chunk, line and the offending token,
//   2. it does not LOAD                → a top-level error, with its line,
//   3. it returns no MODULE            → "you forgot `return M`", by far the
//                                        commonest first-time mistake,
//   4. it exports an UNKNOWN name      → a typo'd hook is otherwise silent
//                                        FOREVER: the engine falls through to
//                                        the shipped rule and the author's file
//                                        appears to do nothing,
//   5. it exports a NON-FUNCTION       → a hook that is a number cannot be
//                                        called and would fail per drop,
//   6. it implements NOTHING           → a file the engine will never consult.
//
// (4) and (6) are warnings for a MOD and errors for the shipped catalog: a mod
// may legitimately carry a helper file mid-edit, while a shipped script that
// nothing calls is a build the repo should not produce.

import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const engine = (p) => fileURLToPath(new URL(`../../${p}`, import.meta.url));

/**
 * The REAL VM and the REAL hook list — see the header for why a second parser
 * is not an option.
 *
 * There are two of each on disk and they are the same code twice, not two
 * answers. In the REPO they are the TypeScript sources (both trees are
 * deliberately free of non-erasable syntax, so plain `node` reads them). In the
 * SHIPPED desktop app the compiler runs in a main process with no TypeScript,
 * so it reads the precompiled JavaScript `scripts/build-lua.mjs` emits — the
 * same decision, for the same reason, that `scripts/build-server.mjs` makes for
 * the session server: the runtime is Electron's and its version is not ours to
 * pin.
 *
 * A missing ship target is named rather than silently skipped: a validator that
 * quietly stops validating in the packaged app is exactly the drift the
 * one-compiler rule exists to prevent.
 */
async function loadEngineModule(tsPath, shippedPath, what) {
  if (existsSync(engine(tsPath))) {
    return import(pathToFileURL(engine(tsPath)).href);
  }
  if (existsSync(engine(shippedPath))) {
    return import(pathToFileURL(engine(shippedPath)).href);
  }
  throw new Error(
    `script-schema: cannot find ${what} at ${tsPath} or ${shippedPath} — ` +
      "run `node scripts/build-lua.mjs` to emit the shipped compiler's copy",
  );
}

const { compile, load, LuaTable } = await loadEngineModule(
  "src/lib/lua/index.ts",
  "mod/tools/lua-vm/lib/lua/index.js",
  "the Lua VM",
);
const { HOOKS } = await loadEngineModule(
  "src/game/script/hooks.ts",
  "mod/tools/lua-vm/game/script/hooks.js",
  "the hook catalog",
);

/** hook name → the script id that owns it. */
export const HOOK_OWNER = new Map(HOOKS.map((h) => [h.hook, h.script]));

/** script id → the hooks it is expected to implement. */
export const SCRIPT_HOOKS = new Map();
for (const h of HOOKS) {
  if (!SCRIPT_HOOKS.has(h.script)) SCRIPT_HOOKS.set(h.script, []);
  SCRIPT_HOOKS.get(h.script).push(h.hook);
}

/**
 * A stand-in `game` table for the load-time check.
 *
 * A script reads `game.config.loot` at its top level, and this validator has no
 * engine config to hand it — so every lookup answers with another permissive
 * table rather than nil. That is enough to prove the file LOADS; whether the
 * numbers it then reads are real is not a question a compiler can answer, and
 * the engine tests are what answer it.
 */
function stubGame() {
  const permissive = () => {
    const t = new LuaTable();
    const meta = new LuaTable();
    meta.set("__index", {
      native: () => [permissive()],
      name: "stub",
    });
    t.metatable = meta;
    return t;
  };
  const game = new LuaTable();
  game.set("config", permissive());
  game.set("balance", permissive());
  game.set("run", permissive());
  game.set("log", { native: () => [], name: "log" });
  return game;
}

/**
 * Validate one authored script.
 *
 * @param id      the file stem (`loot`), which is what names its hooks.
 * @param source  the Lua text, exactly as authored.
 * @param opts    `{ shipped }` — true for this repo's own catalog, where an
 *                unknown export and a hook-less file are errors rather than
 *                warnings (see the header).
 * @returns `{ errors, warnings, hooks }` — `hooks` being the names the file
 *          actually implements, which the caller reports.
 */
export function validateScript(id, source, opts = {}) {
  const errors = [];
  const warnings = [];
  const shipped = opts.shipped === true;
  const known = SCRIPT_HOOKS.get(id);

  if (!known) {
    // A file whose stem matches no script in the catalog can never be called:
    // hooks are resolved by NAME through the file that owns them.
    const list = [...SCRIPT_HOOKS.keys()].sort().join(", ");
    errors.push(
      `scripts/${id}.lua: no such script — the engine reads ${list}. ` +
        `A new script id needs an entry in src/game/script/hooks.ts.`,
    );
    return { errors, warnings, hooks: [] };
  }

  let mod;
  try {
    mod = load(compile(source, `${id}.lua`), { game: stubGame() });
  } catch (err) {
    errors.push(`${err.message}`);
    return { errors, warnings, hooks: [] };
  }

  const exported = [...mod.exports.entries()];
  if (exported.length === 0) {
    errors.push(
      `scripts/${id}.lua: returned no hooks — a script ends with ` +
        `\`return M\`, where M is the table its functions were added to.`,
    );
    return { errors, warnings, hooks: [] };
  }

  const hooks = [];
  for (const [key, value] of exported) {
    if (typeof key !== "string") continue;
    const isFunction =
      value !== undefined &&
      typeof value === "object" &&
      !(value instanceof LuaTable);
    if (!known.includes(key)) {
      const message =
        `scripts/${id}.lua: exports "${key}", which is not a hook of this ` +
        `script — the engine will never call it. This file's hooks are ` +
        `${known.join(", ")}.`;
      // A typo'd hook name is silent at play time (the shipped rule quietly
      // stands in), so it is named here or it is never named at all.
      if (shipped) errors.push(message);
      else warnings.push(message);
      continue;
    }
    if (!isFunction) {
      errors.push(
        `scripts/${id}.lua: hook "${key}" is a ${
          value instanceof LuaTable ? "table" : typeof value
        }, not a function.`,
      );
      continue;
    }
    hooks.push(key);
  }

  if (hooks.length === 0) {
    const message =
      `scripts/${id}.lua: implements none of its hooks (${known.join(", ")}), ` +
      `so the shipped rules stand and this file changes nothing.`;
    if (shipped) errors.push(message);
    else warnings.push(message);
  }

  return { errors, warnings, hooks };
}

/**
 * The whole-catalog rule for the SHIPPED scripts: every hook in `hooks.ts` must
 * have an implementation somewhere, or the engine falls back to arithmetic that
 * no content file describes — a rule with no source of truth.
 */
export function validateScriptCatalog(implemented) {
  const errors = [];
  for (const { hook, script } of HOOKS) {
    if (!implemented.includes(hook)) {
      errors.push(
        `hook "${hook}" has no implementation — add it to ` +
          `content/scripts/${script}.lua, or drop its entry from ` +
          `src/game/script/hooks.ts.`,
      );
    }
  }
  return { errors, warnings: [] };
}
