<!-- SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 -->

# Gone in Space — native app

The App Store / Play Store wrapper around the game. It is a thin
[Expo](https://expo.dev) / React Native shell whose entire content is a
full-screen [WebView](https://github.com/react-native-webview/react-native-webview),
so the app **looks and plays exactly like the website**.

Unlike the browser PWA, the app is **self-contained**: the whole website is
bundled inside it (`assets/webroot.zip`) and served over a local HTTP server on
launch (`src/localServer.ts`), so the game runs entirely on-device and offline
and only ever updates when a new build ships to the store (see **Bundling**
below). A build-time override (`EXPO_PUBLIC_GAME_URL`) can instead point the
WebView at a remote URL for debugging against live content.

On top of the web game it adds the two things a browser can't give iOS:

- **Native haptics.** iOS WKWebView never exposes `navigator.vibrate`, so the
  game's web haptics driver silently no-ops there. The shell injects a
  `navigator.vibrate` polyfill (`src/injected.ts`) that the game's existing
  driver detects by feature test — every buzz the game emits is forwarded to
  the native side (`src/nativeHaptics.ts`) and replayed on the **Taptic Engine**
  via `expo-haptics`, preserving the game's "minion flick → boss rumble"
  scaling. No engine code changes.
- **An audio session.** `setAudioModeAsync({ playsInSilentMode: true })` lets the
  game's WebAudio play through the iOS ringer switch.
- **Store-driven updates.** The shell flags the page as native (`src/injected.ts`
  sets `window.__GIS_NATIVE__`), and the web app reads it to disable its whole
  PWA update lifecycle — no service worker, no precache, and no "a new version
  is ready" toast (`website/src/app/native.ts`). Players update by installing a
  new build from the store instead of an in-page reload. Because the service
  worker is what makes a remote-loaded page work offline, this switch belongs
  with a **locally bundled** game, not a shell that still loads the site over
  the network.

The engine and PWA are unchanged — see the repo-root `README.md` and
`docs/architecture.md`. This directory is **not** part of the npm workspace; it
manages its own dependencies.

## Layout

| File                     | Purpose                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------- |
| `App.tsx`                | The WebView shell, message bridge, loading/offline states.                            |
| `src/localServer.ts`     | Unzips the bundled site on first launch and serves it over a local HTTP server.       |
| `src/config.ts`          | Bundled by default; the optional `EXPO_PUBLIC_GAME_URL` remote override.              |
| `src/injected.ts`        | JS injected into the page: the `navigator.vibrate` bridge + viewport hardening.       |
| `src/nativeHaptics.ts`   | Translates Web-Vibration patterns → Taptic Engine impacts.                            |
| `scripts/bundle-web.mjs` | Builds the website and packs `dist/` into `assets/webroot.zip`.                       |
| `metro.config.js`        | Teaches Metro that `.zip` is a bundled asset.                                         |
| `app.config.js`          | Dynamic Expo config; reads identity from `game.config.json`, pins the EAS project id. |
| `eas.json`               | EAS build/submit profiles.                                                            |

## Prerequisites

- Node 24 (repo `.nvmrc`).
- An [Expo account](https://expo.dev) with access to the linked project
  (`180cff05-a398-48e3-ae63-a9b0bd408321`).
- `npm install --global eas-cli`, then `eas login`.

The project is already linked (its id is pinned in `app.config.js`). If you need
to re-link it interactively, run `eas init --id 180cff05-a398-48e3-ae63-a9b0bd408321`.

## Bundling

The whole website is shipped inside the app and served locally:

1. `npm run bundle` runs the website's `vite build` and packs its `dist/` into
   `assets/webroot.zip` (`scripts/bundle-web.mjs`). Use `npm run bundle:zip` to
   re-zip an existing `dist/` without rebuilding.
2. The zip rides in the app bundle (`assetBundlePatterns`). It is a build
   artifact — **gitignored**, but a `.easignore` re-includes it in the EAS
   upload, so it must exist before a build (the `build:*` scripts and the CI
   workflow run `npm run bundle` for you).
3. On first launch (and after each app update) `src/localServer.ts` unzips it
   into the document directory and starts a local HTTP server
   ([`@dr.pogodin/react-native-static-server`](https://github.com/birdofpreyru/react-native-static-server),
   an embedded lighttpd) on a **fixed** port. The port is fixed on purpose: the
   WebView origin is `http://<host>:<port>`, and IndexedDB/localStorage saves
   are keyed to that origin, so a stable port keeps saved characters across
   launches.

Serving over `http://localhost` (rather than `file://`) means absolute asset
paths and secure-context storage behave exactly as they do on the deployed
site — the game code needs no app-specific build.

## Develop

```sh
cd app
npm install
npm run bundle     # build + pack the website (needed for the local-server path)
npm start          # Expo dev server — use a DEV BUILD, not Expo Go
npm run typecheck  # tsc --noEmit
npm run doctor     # expo-doctor sanity check
```

The local server is a **native module**, so it does not run in Expo Go — you
need a [dev build](https://docs.expo.dev/develop/development-builds/introduction/)
(`eas build --profile development`). To iterate in Expo Go, skip the bundle and
point the WebView at a remote URL instead:

```sh
EXPO_PUBLIC_GAME_URL=https://game.niclaslindstedt.se/preview/ npm start
```

## Build & distribute

Builds are **manual** to keep EAS costs down — locally, or via the
`App Build (EAS)` GitHub Actions workflow (Actions tab → Run workflow → pick
platform / profile / submit). CI never builds the app on push. The workflow
(and the `build:*` scripts) run `npm run bundle` first so the on-device website
is fresh.

```sh
# Internal test build (ad-hoc / APK) — bundles the site, then builds:
npm run build:preview

# Store build:
npm run build:production

# Or drive EAS directly (run `npm run bundle` first):
npm run bundle && eas build --profile production --platform all --auto-submit
```

The CI workflow needs an `EXPO_TOKEN` repository secret (create one at
<https://expo.dev/settings/access-tokens>). Store **submission** additionally
needs App Store Connect / Google Play credentials configured on the EAS project
(`eas credentials`), which is a one-time interactive setup.
