// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  // The app modules a few suites import (settings.ts) read the same build-time
  // constants the website's vite config defines. Tests exercise the FULL build
  // — developer tooling included — so `__DEV_TOOLS__` is true here; the
  // production store build is the only place it is false (see
  // pwa/src/build-globals.d.ts).
  define: {
    __DEV_TOOLS__: JSON.stringify(true),
    // The EXTRAS -> COMMUNITY destination. A stand-in address rather than the
    // deployed one: the suite only cares that a build WITH a community server
    // offers the row and points an anchor at it, and hardcoding the real
    // invite here would defeat the point of keeping it in a repo variable.
    // The unset case (no row at all) is the `?` guard in menus-main.ts —
    // a build constant cannot be flipped from inside a test.
    __COMMUNITY_URL__: JSON.stringify("https://example.invalid/community"),
  },
  resolve: {
    // Keep in lockstep with tsconfig.json `paths` (and the website's vite
    // config): @game/lib and @ui/lib are the generic pools a later game keeps
    // as-is, and the alias is what marks a module as belonging to one.
    // @ui/lib is aliased here so DOM-free UI-lib modules (the chiptune
    // sequencer) stay testable from tests/.
    //
    // The `react` entries are the app's Preact swap (see pwa/vite.config.ts):
    // a UI-lib module that type-imports `react` must resolve to the same
    // `preact/compat` the app builds against, or a suite reaching one would
    // resolve a package that is no longer installed.
    alias: [
      { find: "react-dom/client", replacement: "preact/compat/client" },
      { find: "react-dom", replacement: "preact/compat" },
      { find: "react", replacement: "preact/compat" },
      { find: "@game/core", replacement: here("./engine/index.ts") },
      { find: "@game/menu", replacement: here("./engine/menu.ts") },
      { find: "@game/lib", replacement: here("./engine/lib") },
      { find: "@game/wire", replacement: here("./server/wire") },
      { find: "@game/client", replacement: here("./server/client.ts") },
      { find: "@ui/lib", replacement: here("./pwa/src/lib") },
    ],
  },
  test: {
    // §20.2 — test files end in `_test` (or `_tests`); keep the include
    // pattern in lockstep with the naming convention in AGENTS.md.
    include: ["tests/**/*_test.ts", "tests/**/*_tests.ts"],
    environment: "node",
  },
});
