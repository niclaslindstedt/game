// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Node module-resolution hooks that map the repo's import aliases (see
// tsconfig.json) onto real paths, so plain `node` scripts can import modules
// that use them at RUNTIME (bot.ts, create.ts, step.ts, the app's own catalogs
// …). The older calculators (leveling-curve.mjs) only touch modules whose alias
// imports are type-only — node's type stripping erases those — but anything
// that RUNS the game needs this hook. Register it before the first such import:
//
//   import { register } from "node:module";
//   register("./game-alias-loader.mjs", import.meta.url);
//   const { simulateCampaign } = await import("../src/sim/simulate.ts");
//
// Keep the table below in step with the four alias maps the builds read —
// tsconfig.json, pwa/tsconfig.json, vitest.config.ts, pwa/vite.config.ts — so a
// script sees the same module graph the game does.

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

/** Alias prefix → directory, and bare alias → file. Longest match wins, which
 * is why `@game/lib/` is listed ahead of the bare `@game/…` entries. */
const DIRS = [
  ["@game/lib/", path.join(root, "src", "lib")],
  ["@ui/lib/", path.join(root, "pwa", "src", "lib")],
];
const FILES = {
  "@game/core": path.join(root, "src", "index.ts"),
  "@game/menu": path.join(root, "src", "menu.ts"),
  "@game/client": path.join(root, "server", "client.ts"),
};

export function resolve(specifier, context, nextResolve) {
  const file = FILES[specifier];
  if (file) return nextResolve(pathToFileURL(file).href, context);
  for (const [prefix, dir] of DIRS) {
    if (specifier.startsWith(prefix)) {
      const target = path.join(dir, specifier.slice(prefix.length));
      return nextResolve(pathToFileURL(target).href, context);
    }
  }
  return nextResolve(specifier, context);
}
