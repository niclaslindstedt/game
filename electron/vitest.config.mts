// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The desktop shell's own test runner.
//
// This tree is not an npm workspace member and the root suite deliberately does
// not reach into it (the root tsconfig, eslint and vitest all stop at its
// edge), so it runs its own vitest — the same way it runs its own tsc. Only
// PURE logic is testable here: anything touching `electron` needs a real
// Electron process, and anything touching Steam needs the client. What is left
// is exactly the part worth pinning — the webroot's containment check and the
// window state's defensive parsing.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // §20.2 — test files end in `_test` (or `_tests`), as at the repo root.
    // `.mts` is included for the tests that import the build scripts, which
    // are ESM `.mjs`: a `.ts` test resolves as CommonJS in this package and
    // cannot require them.
    include: [
      "tests/**/*_test.ts",
      "tests/**/*_tests.ts",
      "tests/**/*_test.mts",
    ],
    environment: "node",
  },
});
