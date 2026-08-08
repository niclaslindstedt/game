// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default [
  {
    ignores: [
      // Agent scratch worktrees (parallel sessions' clones of this repo) —
      // each is linted by its own root run, never by this one.
      ".claude/**",
      "node_modules/**",
      "pwa/node_modules/**",
      "pwa/dist/**",
      "pwa/src/generated/**",
      "pwa/src/game/assets/**",
      // Generated engine level catalog (source: content/levels/*.yaml).
      "src/generated/**",
      // The native app (native/) is a self-contained Expo/React Native project
      // with its own toolchain (tsc, expo-doctor) and is not part of the npm
      // workspace; it is linted/typechecked on its own, not by the root config.
      "native/**",
      // The desktop app (electron/) is likewise self-contained: its own
      // dependency tree, its own tsc, its own output module (electron/src/
      // output.ts), and not part of the npm workspace.
      "electron/**",
      // The Tauri desktop shell (tauri/README.md) is Rust, with its own
      // linter: `cargo clippy` at zero warnings, run by `npm run tauri:lint`.
      // Only its build output and the crates are ignored — its two Node build
      // scripts are ordinary repo tooling and are linted here like any other.
      "tauri/webroot/**",
      "tauri/target/**",
      "tauri/release/**",
      // The sidecars scripts/package.mjs stages: a copy of the compiled server,
      // the mod toolchain and a Node runtime, all written by a build.
      "tauri/resources/**",
      "tauri/node_modules/**",
      "tauri/src-tauri/**",
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
        __DEV_TOOLS__: "readonly",
        __SUPPORT_EMAIL__: "readonly",
        __COMMUNITY_URL__: "readonly",
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
      "pwa/pwa-plugin.ts",
      "scripts/**",
    ],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: { "no-console": "off" },
  },
  {
    // THE WEBVIEW PROBE is the one thing under `scripts/` that runs in a PAGE
    // rather than in Node: it is served to a webview (headlessly by
    // scripts/webview-sweep.mjs, or by a real shell through GIS_WEBROOT) and
    // asks that engine what it has. It lives here because the sweep that reads
    // it does, and because it is tooling rather than anything the game ships.
    files: ["scripts/webview-probe/**"],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  {
    // THE SESSION SERVER runs under Node, inside a `utilityProcess` — it is
    // the one tree of `.ts` in this repo that is neither browser code nor a
    // build script, so it needs Node's globals on top of the browser ones the
    // wire's own leaves are read with in the page.
    files: ["server/**/*.ts"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    files: ["tests/**"],
    // A test may fork a real second process to prove a cross-process claim
    // (tests/engine/net_determinism_test.ts), so Node's globals belong here
    // too — the suite runs in a `node` environment either way.
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: { "no-console": "off" },
  },
];
