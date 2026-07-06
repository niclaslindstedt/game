// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { gamePwa } from "./pwa-plugin.ts";

// The GitHub Pages base path is injected by the `pages.yml` workflow via
// VITE_BASE so the same source builds for `/` (release), `/preview/` (main),
// or `/branch/` (a dispatched feature branch) on game.niclaslindstedt.se.
// Defaults to `/` for local dev and the CI quality gates.
const base = process.env.VITE_BASE ?? "/";

// Label shown by the PWA update toast for the incoming build. Prefer the
// deploying commit (the workflow exposes GITHUB_SHA); fall back to a build
// timestamp locally. Embedding it in the generated sw.js also guarantees the
// worker's bytes change every deploy, so browsers reliably discover updates.
const version = process.env.GITHUB_SHA
  ? process.env.GITHUB_SHA.slice(0, 7)
  : new Date().toISOString();

const commit =
  process.env.GITHUB_SHA?.slice(0, 7) ??
  (() => {
    try {
      return execSync("git rev-parse --short HEAD", {
        encoding: "utf8",
      }).trim();
    } catch {
      return "unknown";
    }
  })();

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Game version from the repository root package.json — single source of
// truth, rewritten by scripts/update-versions.sh at release time.
const appVersion = (
  JSON.parse(readFileSync(here("../package.json"), "utf8")) as {
    version: string;
  }
).version;

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __BUILD_COMMIT__: JSON.stringify(commit),
  },
  plugins: [react(), tailwindcss(), gamePwa({ base, version })],
  resolve: {
    // The engine lives at the repository root (`../src`); the app imports it
    // through these aliases so engine code never reaches into app modules.
    // @game/lib and @ui/lib are the generic pools earmarked for extraction
    // into oss-framework: once a module migrates, only the alias prefix in
    // its importers changes (@…/lib/foo → @niclaslindstedt/oss-framework/foo).
    // Keep in lockstep with tsconfig `paths` here and at the root.
    alias: [
      { find: "@game/core", replacement: here("../src/index.ts") },
      { find: "@game/lib", replacement: here("../src/lib") },
      { find: "@ui/lib", replacement: here("./src/lib") },
    ],
  },
});
