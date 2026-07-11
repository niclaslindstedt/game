// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Node module-resolution hooks that map the repo's `@game/lib/*` alias (see
// tsconfig.json) onto `src/lib/*`, so plain `node` scripts can import ENGINE
// modules that use the alias at RUNTIME (bot.ts, create.ts, step.ts, …).
// The older calculators (leveling-curve.mjs) only touch modules whose alias
// imports are type-only — node's type stripping erases those — but anything
// that RUNS the game needs this hook. Register it before the first engine
// import:
//
//   import { register } from "node:module";
//   register("./game-alias-loader.mjs", import.meta.url);
//   const { simulateCampaign } = await import("../src/sim/simulate.ts");

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const libRoot = path.join(here, "..", "src", "lib");

export function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@game/lib/")) {
    const target = path.join(libRoot, specifier.slice("@game/lib/".length));
    return nextResolve(pathToFileURL(target).href, context);
  }
  return nextResolve(specifier, context);
}
