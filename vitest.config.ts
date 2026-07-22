// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    // Keep in lockstep with tsconfig.json `paths` (and the website's vite
    // config): @game/lib and @ui/lib are the generic pools earmarked for
    // extraction into oss-framework — extraction swaps the prefix, not the
    // code. @ui/lib is aliased here so DOM-free UI-lib modules (the chiptune
    // sequencer) stay testable from tests/.
    alias: [
      { find: "@game/core", replacement: here("./src/index.ts") },
      { find: "@game/lib", replacement: here("./src/lib") },
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
