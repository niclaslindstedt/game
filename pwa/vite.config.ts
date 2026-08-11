// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";

import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

import { commitUrlForBase, gamePwa, prelaunchCss } from "./pwa-plugin.ts";

// The GitHub Pages base path is injected by the `pages.yml` workflow via
// VITE_BASE so the same source builds for `/` (release), `/preview/` (main),
// or `/branch/` (a dispatched feature branch) on one origin (the identity
// `siteUrl` in game.config.json). Defaults to `/` for local dev and the CI
// quality gates.
const base = process.env.VITE_BASE ?? "/";

// THE COMMIT THIS BUILD IS OF — full sha, or empty when there is no telling.
//
// The WORKING TREE is asked first and `GITHUB_SHA` is only the fallback, which
// is the opposite of the obvious order and is the load-bearing part: every
// deploy slot builds from ITS OWN ref (pages.yml checks the release tag, the
// pushed sha, or the dispatched branch straight into the runner), while
// `GITHUB_SHA` is fixed to the commit that TRIGGERED the workflow. So a
// `/branch/` build read from the environment reports the `main` commit that
// happened to kick the run off, and the root slot reports main rather than the
// tag it serves. `git rev-parse` in the checkout answers what was actually
// compiled, in CI and locally alike; the environment is what is left when
// there is no git dir (a source tarball).
const commitSha = (() => {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return process.env.GITHUB_SHA ?? "";
  }
})();

// Reference for the incoming build — the label `version.json` publishes and the
// update prompt reads, and the `// Build:` line stamped into the generated
// sw.js.
//
// THE COMMIT ACTUALLY BUILT, exactly like `commitSha` above and for the same
// reason. Reading `GITHUB_SHA` here instead — which this did — stamps every
// slot with the commit that TRIGGERED the run, and the root slot is the one it
// lies to: it is rebuilt FROM ITS TAG on every deploy, so a push to `main` that
// changed nothing it serves still moved its build label and therefore its
// worker's bytes. An installed home-screen app on `/` was prompted to install
// an update whose content was byte-identical to what it already had, and
// `version.json` named a commit that was not what was deployed.
//
// The old rationale was that this value's job is to be DIFFERENT every deploy
// so a browser reliably notices one. It does not have to be: `PRECACHE` in the
// worker is a list of CONTENT-HASHED filenames, so any change to the site
// changes sw.js on its own. Manufacturing a difference only matters when there
// is none to find — which is precisely the case where an update prompt is
// wrong.
//
// Locally there is no `GITHUB_SHA` and a dirty tree sits on the same commit as
// the last build, so a timestamp stays the honest answer off CI. The env sha is
// the last resort for a CI tree with no git dir, where `commitSha` is empty.
const buildRef = process.env.GITHUB_SHA
  ? commitSha.slice(0, 7) || process.env.GITHUB_SHA.slice(0, 7)
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

// Is this build going INSIDE a store shell — native, Electron or Tauri —
// rather than onto the web? Each shell's `bundle-web.mjs` passes it, on EVERY
// profile rather than only `production`: unlike the developer tooling above,
// which a preview build deliberately keeps so it behaves like the website, the
// prerendered boot shell is dead weight in any compiled build. Nothing crawls
// an asar, and its only visible effect there is a blink of an SEO document
// between the platform splash and the game's own studio card. See
// `stripBootShell` in pwa-plugin.ts for what it takes out and what survives.
const shellBuild = process.env.VITE_SHELL_BUILD === "on";

// The built commit, shown next to the version in the title footer — short, the
// way a person reads one. A production store build prints the bare version
// instead, so the hash is not embedded in the bundle at all.
const commit = !devTools ? "" : commitSha.slice(0, 7) || "unknown";

// Where that hash TAKES you, on the two slots where a hash is something to
// follow rather than something to read out: `/preview/` and `/branch/` are
// looked at by whoever pushed the commit, so the footer there is a link into
// the source at the exact revision the build was cut from. EMPTY everywhere
// else — the released site, a store build, local dev — and an empty string is
// what makes the footer render as plain text (see `commitUrlForBase`).
//
// The FULL sha, not the seven characters printed: both resolve on the forge,
// but only one of them is still unambiguous after the repo has grown.
const commitUrl = !devTools ? "" : commitUrlForBase(base, commitSha);

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
    // size sits above Vite's generic warning while the separately enforced
    // gzipped startup path remains within the SEO budget. Keep an explicit
    // ceiling here so genuine engine-chunk growth still raises a build warning.
    chunkSizeWarningLimit: 900,
    // WRITTEN FOR `scripts/check-seo.mjs`, which weighs two paths rather than
    // one: the CARD (what the entry HTML pulls before anything is on screen)
    // and MENU-READY (that plus the app shell the card fetches behind itself —
    // see Boot.tsx). The second is the one that still catches a startup module
    // reaching back through `@game/core`, and it needs to know which chunks
    // `src/App.tsx` statically drags in, which only the build knows. Reading it
    // out of the manifest beats guessing from hashed filenames.
    manifest: true,
  },
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __BUILD_COMMIT__: JSON.stringify(commit),
    __BUILD_COMMIT_URL__: JSON.stringify(commitUrl),
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
    gamePwa({ base, version, appVersion, shellBuild }),
  ],
  resolve: {
    // The engine lives at the repository root (`../engine`); the app imports it
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
      { find: "@game/core", replacement: here("../engine/index.ts") },
      { find: "@game/menu", replacement: here("../engine/menu.ts") },
      { find: "@game/lib", replacement: here("../engine/lib") },
      { find: "@game/wire", replacement: here("../server/wire") },
      { find: "@game/client", replacement: here("../server/client.ts") },
      { find: "@ui/lib", replacement: here("./src/lib") },
    ],
  },
});
