// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default [
  {
    ignores: [
      "node_modules/**",
      "website/node_modules/**",
      "website/dist/**",
      "website/src/generated/**",
      "website/src/game/assets/**",
      "coverage/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      globals: {
        ...globals.browser,
        ...globals.es2022,
        // Injected by vite.config.ts `define` (declared in vite-env.d.ts).
        __APP_VERSION__: "readonly",
        __BUILD_COMMIT__: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      "react-hooks": reactHooks,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      // §19.4 — user-facing output routes through src/output.ts; raw console
      // calls are forbidden outside the central output module.
      "no-console": "error",
    },
  },
  {
    files: ["src/output.ts"],
    rules: { "no-console": "off" },
  },
  {
    files: [
      "**/*.mjs",
      "**/*.config.{js,ts}",
      "website/pwa-plugin.ts",
      "website/scripts/**",
      "scripts/**",
    ],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: { "no-console": "off" },
  },
  {
    files: ["tests/**"],
    rules: { "no-console": "off" },
  },
];
