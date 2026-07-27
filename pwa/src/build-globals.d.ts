// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Build-time constants injected by `define` — pwa/vite.config.ts for the app
// itself, vitest.config.ts for the suites that import app modules. Kept in its
// own file (rather than in vite-env.d.ts) so the ROOT tsconfig can include it
// without also pulling in `vite/client`: tests/ imports pwa modules, so the
// root typecheck sees these names too, and the two configs must agree.

/** The game's semantic version — the root package.json `version`. */
declare const __APP_VERSION__: string;

/** The build's short commit hash, printed beside the version in the title
 * footer. EMPTY in a production store build, which prints the bare version —
 * the hash is not embedded there at all (see `__DEV_TOOLS__`). */
declare const __BUILD_COMMIT__: string;

/** Does this build carry the DEVELOPER tooling — the hidden seven-tap sun
 * reveal, the DEVELOPER menu tree behind it, and the commit hash above? True in
 * every build a human might develop or test with (the website, the installed
 * PWA, the `/preview/` and `/branch/` slots, local dev, and the native
 * `preview` / `testflight` apps) and false for exactly one: the `production`
 * EAS profile, the binary uploaded to the App Store / Play Store.
 *
 * It is a LITERAL, not a runtime lookup, so `__DEV_TOOLS__ && …` guards fold
 * away at build time and Rollup drops the gated modules and lazy chunks — a
 * store build does not ship the developer code, it merely doesn't contain it.
 * Set by `VITE_DEV_TOOLS` (see pwa/vite.config.ts and docs/configuration.md). */
declare const __DEV_TOOLS__: boolean;

/** The support address printed by the contact page and the privacy policy. */
declare const __SUPPORT_EMAIL__: string;
