// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // §20.2 — test files end in `_test` (or `_tests`); keep the include
    // pattern in lockstep with the naming convention in AGENTS.md.
    include: ["tests/**/*_test.ts", "tests/**/*_tests.ts"],
    environment: "node",
  },
});
