#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE LUA VM'S SHIP TARGET — `engine/lib/lua/` compiled to plain ESM for the
// SHIPPED mod compiler.
//
// The problem it solves is the one `mod/catalog.json` solves for id sets, one
// step further along. The mod compiler runs in the desktop shell's MAIN
// PROCESS, which has no TypeScript — and `scripts/asset-tools/script-schema.mjs`
// validates an authored rule by COMPILING it with the game's own interpreter,
// because a second, friendlier Lua parser in the SDK would drift from the real
// one inside a release and land as "compiles in the SDK, refuses in the game".
//
// So the interpreter has to be there, as JavaScript. Which is exactly the
// decision `scripts/build-server.mjs` already made, for exactly the same reason
// its header gives at length: **the runtime is not ours to pin.** Node's
// type-stripping would do the job today (this tree is deliberately free of
// non-erasable syntax so `node` can read it in the repo), but `utilityProcess`
// and the shell's main process both run ELECTRON's bundled Node, whose version
// moves with Electron. A ship target resting on an experimental flag in a
// runtime somebody else upgrades is one that breaks in a released build, on a
// player's machine, for a reason nobody changed.
//
// The output lands in `electron/modtools-lua/`, beside `electron/server-dist/`
// — the shell's other compiled-engine tree — and NOT under `mod/`. That is not
// tidiness: `mod/` is licensed in two halves (the samples are CC0, the
// toolchain is the SDK licence) and `tests/content/mod_licence_test.ts` holds
// every file to its side of the split. This tree is compiled from
// PolyForm-licensed engine source and carries that header by construction, so
// parking it in the SDK folder would either fail that test or, worse, pass it
// by relabelling somebody's licence. It is gitignored and rebuilt, like every
// other generated tree here.
//
// Unlike the server's target this one needs NO staging step: `engine/lib/lua/`
// imports nothing but its own siblings by relative path, so there is no alias
// for `tsc` to refuse (TS2877). That is worth keeping true.
//
//   node scripts/build-lua.mjs

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const outDir = path.join(root, "electron", "modtools-lua");
/** What ships: the VM, and the import-free hook catalog the validator checks a
 * script's exports against. Both are leaves — the hook list deliberately
 * imports nothing — so the pair compiles standalone. The output MIRRORS `engine/`
 * (`lib/lua/index.js`, `game/script/hooks.js` inside the out dir) so a reader
 * can map a shipped file back to its source without a table. */
const SOURCES = ["engine/lib/lua", "engine/game/script/hooks.ts"];

/** The compiler options, written out rather than inherited from the root
 * tsconfig: this target EMITS (the root is `noEmit`), needs no DOM, and must
 * rewrite the `.ts` import extensions the house style carries into the `.js`
 * ones Node will actually resolve. */
const CONFIG = {
  compilerOptions: {
    target: "ES2022",
    module: "ESNext",
    moduleResolution: "bundler",
    lib: ["ES2022"],
    strict: true,
    // The whole point of the target: `./value.ts` in the source becomes
    // `./value.js` in the output, so plain Node resolves it.
    rewriteRelativeImportExtensions: true,
    allowImportingTsExtensions: true,
    verbatimModuleSyntax: true,
    isolatedModules: true,
    skipLibCheck: true,
    declaration: false,
    sourceMap: false,
    types: [],
    outDir: "modtools-lua",
    rootDir: "../engine",
  },
  include: ["../engine/lib/lua/**/*.ts", "../engine/game/script/hooks.ts"],
};

for (const rel of SOURCES) {
  if (existsSync(path.join(root, rel))) continue;
  console.error(`build-lua: ${rel} is missing`);
  process.exit(1);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(path.join(root, "electron"), { recursive: true });

// The config lives beside the output tree so its relative paths are short and
// legible in a `tsc` diagnostic. Written before `tsc` looks, never with it.
const configPath = path.join(root, "electron", "tsconfig.modtools-lua.json");
writeFileSync(configPath, `${JSON.stringify(CONFIG, null, 2)}\n`);

const tsc = path.join(
  root,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tsc.cmd" : "tsc",
);

try {
  execFileSync(tsc, ["-p", configPath], {
    stdio: "inherit",
    cwd: root,
    // WINDOWS: `node_modules/.bin/tsc.cmd` is a BATCH FILE, and Node will not
    // execute one directly — `execFileSync` fails with EINVAL before the
    // compiler runs at all. The same trap is documented in
    // `scripts/build-server.mjs`.
    shell: process.platform === "win32",
  });
} catch (err) {
  // A non-zero EXIT is `tsc` having printed its own diagnostics, and a stack
  // trace on top of them buries the first error. Anything else — a compiler
  // that could not be started — has printed nothing, so it must be said here.
  if (err?.status === undefined || err.status === null) {
    console.error(`build-lua: could not run ${tsc} — ${err?.message ?? err}`);
  }
  process.exit(1);
}

// `type: module` so Node reads the emitted ESM as ESM regardless of what the
// nearest package.json above it says — `electron/package.json` does not.
writeFileSync(
  path.join(outDir, "package.json"),
  `${JSON.stringify({ type: "module" }, null, 2)}\n`,
);

console.log(
  `wrote ${path.relative(root, outDir)}/ — the Lua VM for the shipped mod compiler`,
);
