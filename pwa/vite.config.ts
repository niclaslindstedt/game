// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";

import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

import { gamePwa, prelaunchCss } from "./pwa-plugin.ts";

// The GitHub Pages base path is injected by the `pages.yml` workflow via
// VITE_BASE so the same source builds for `/` (release), `/preview/` (main),
// or `/branch/` (a dispatched feature branch) on one origin (the identity
// `siteUrl` in game.config.json). Defaults to `/` for local dev and the CI
// quality gates.
const base = process.env.VITE_BASE ?? "/";

// Unique reference for the incoming build. Prefer the deploying commit (the
// workflow exposes GITHUB_SHA); fall back to a build timestamp locally.
// Embedding it in the generated sw.js also guarantees the worker's bytes
// change every deploy, so browsers reliably discover updates.
const buildRef = process.env.GITHUB_SHA
  ? process.env.GITHUB_SHA.slice(0, 7)
  : new Date().toISOString();

// DEVELOPER TOOLING — on in every build except the one uploaded to the App
// Store / Play Store. It gates the hidden sun-tap reveal, the whole DEVELOPER
// menu tree (warp, BOT VIEW, arsenal, effects gallery, balance knobs, the
// flags) and the commit hash in the title footer, so a shipped store build
// carries neither the surfaces nor — because every entry point folds to a
// static `false` and Rollup drops the branch — their code. The web, PWA,
// preview/branch slots, local dev, and the store-signed TestFlight build all
// keep it: only `VITE_DEV_TOOLS=off` turns it off, and only the `production`
// EAS profile passes that (native/scripts/bundle-web.mjs).
const devTools = process.env.VITE_DEV_TOOLS !== "off";

// The deploying commit, shown next to the version in the title footer. A
// production store build prints the bare version instead, so the hash is not
// embedded in the bundle at all.
const commit = !devTools
  ? ""
  : (process.env.GITHUB_SHA?.slice(0, 7) ??
    (() => {
      try {
        return execSync("git rev-parse --short HEAD", {
          encoding: "utf8",
        }).trim();
      } catch {
        return "unknown";
      }
    })());

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Game version from the repository root package.json — single source of
// truth, rewritten by scripts/update-versions.sh at release time.
const appVersion = (
  JSON.parse(readFileSync(here("../package.json"), "utf8")) as {
    version: string;
  }
).version;

// Label shown by the PWA update toast for the incoming build. Combine the
// semantic version with the build ref (`v0.1.0 · abc1234`) — mirroring the
// title-screen footer — so the toast reads as a real version, not a bare
// SHA. The build ref keeps every deploy's version.json distinct.
const version = `v${appVersion} · ${buildRef}`;

export default defineConfig({
  base,
  build: {
    // The simulation is deliberately a lazy, run-only chunk. Its minified
    // size sits above Vite's generic 500 kB warning while the separately
    // enforced gzipped startup path remains within the SEO budget.
    chunkSizeWarningLimit: 700,
  },
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __BUILD_COMMIT__: JSON.stringify(commit),
    __DEV_TOOLS__: JSON.stringify(devTools),
    // The support address printed by the contact page and the privacy policy.
    // Supplied by the `SUPPORT_EMAIL` repo variable through the Pages workflow
    // rather than hardcoded, so it can change without a commit and isn't left
    // in a public tree for scrapers. The placeholder makes an unset variable
    // obvious on the page instead of silently shipping a dead link.
    __SUPPORT_EMAIL__: JSON.stringify(
      process.env.SUPPORT_EMAIL ?? "support-address-not-configured",
    ),
    // Where the EXTRAS -> COMMUNITY row sends a player: the chat server the
    // players keep. Supplied by the `COMMUNITY_URL` repo variable through the
    // Pages workflow rather than hardcoded, so the invite can be rotated (they
    // expire, and a leaked one gets spammed) without a commit.
    //
    // EMPTY IS THE MEANINGFUL DEFAULT, not a placeholder: unlike the support
    // address — which is printed as prose and is better wrong-and-visible than
    // missing — this one is a destination, and a row leading to a dead link is
    // worse than no row. The builder drops it when this is empty (see
    // `menus-main.ts`), which is also what a fork with no server of its own
    // gets.
    __COMMUNITY_URL__: JSON.stringify(process.env.COMMUNITY_URL ?? ""),
  },
  plugins: [
    // The `react` → `preact/compat` aliases this plugin would install by
    // default are OFF: the app's aliases live in ONE list (`resolve.alias`
    // below), kept in lockstep with the three other maps, and a second set
    // injected invisibly by a plugin is exactly the drift that rule exists to
    // prevent. What the preset is here for is the rest — prefresh (the Fast
    // Refresh `@vitejs/plugin-react` used to give), the devtools bridge in dev,
    // and pointing the JSX transform at `preact` instead of `react`.
    preact({ reactAliasesEnabled: false }),
    tailwindcss(),
    // Inlines the boot screen's stylesheet so the prerendered shell paints
    // without waiting on the app bundle. Unlike `gamePwa` it is not build-only:
    // the shell is on screen in dev too, until the app mounts over it.
    prelaunchCss(),
    gamePwa({ base, version, appVersion }),
  ],
  resolve: {
    // The engine lives at the repository root (`../src`); the app imports it
    // through these aliases so engine code never reaches into app modules.
    // @game/lib and @ui/lib are the generic pools earmarked for extraction
    // reusable code local while giving callers a stable import prefix.
    // Keep in lockstep with tsconfig `paths` here and at the root.
    //
    // THE APP RENDERS WITH PREACT, AND STILL SPELLS IT `react`. The three
    // entries below are the whole of the swap: `preact/compat` implements the
    // React API the app was written against, so the ~400 import sites did not
    // have to be rewritten to move the renderer — and, more to the point, they
    // do not have to be rewritten BACK if the compat layer ever stops being the
    // right answer for one of them. The bytes are what this was for: dropping
    // react-dom took the measured critical path from 183 KB gzipped to ~133 KB,
    // which is what lets `check-seo.mjs` hold the budget at web.dev's 170 KB
    // instead of the 200 KB React needed.
    //
    // MOST SPECIFIC FIRST — `react-dom/client` (where `createRoot` lives, and
    // it is NOT re-exported from `preact/compat`) must be matched before the
    // bare `react-dom`, and both before `react`.
    alias: [
      { find: "react-dom/client", replacement: "preact/compat/client" },
      { find: "react-dom", replacement: "preact/compat" },
      { find: "react", replacement: "preact/compat" },
      { find: "@game/core", replacement: here("../src/index.ts") },
      { find: "@game/menu", replacement: here("../src/menu.ts") },
      { find: "@game/lib", replacement: here("../src/lib") },
      { find: "@game/wire", replacement: here("../server/wire") },
      { find: "@game/client", replacement: here("../server/client.ts") },
      { find: "@ui/lib", replacement: here("./src/lib") },
    ],
  },
});
