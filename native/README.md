<!-- SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 -->

# Gone in Space — native app

The App Store / Play Store wrapper around the game. It is a thin
[Expo](https://expo.dev) / React Native shell whose entire content is a
full-screen [WebView](https://github.com/react-native-webview/react-native-webview),
so the app **looks and plays exactly like the website**.

Unlike the browser PWA, the app is **self-contained**: the whole website is
bundled inside it (`assets/webroot.zip`) and served over a local HTTP server on
launch (`src/local-server.ts`), so the game runs entirely on-device and offline
and only ever updates when a new build ships to the store (see **Bundling**
below). A build-time override (`EXPO_PUBLIC_GAME_URL`) can instead point the
WebView at a remote URL for debugging against live content.

On top of the web game it adds the things a browser can't give iOS:

- **Native haptics.** iOS WKWebView never exposes `navigator.vibrate`, so the
  game's web haptics driver silently no-ops there. The shell injects a
  `navigator.vibrate` polyfill (`src/injected.ts`) that the game's existing
  driver detects by feature test — every buzz the game emits is forwarded to
  the native side (`src/native-haptics.ts`) and replayed on the **Taptic Engine**
  via `expo-haptics`, preserving the game's "minion flick → boss rumble"
  scaling. No engine code changes.
- **An audio session.** `setAudioModeAsync({ playsInSilentMode: true })` lets the
  game's WebAudio play through the iOS ringer switch.
- **Store-driven updates.** The shell flags the page as native (`src/injected.ts`
  sets `window.__GIS_NATIVE__`), and the web app reads it to disable its whole
  PWA update lifecycle — no service worker, no precache, and no "a new version
  is ready" toast (`pwa/src/app/native.ts`). Players update by installing a
  new build from the store instead of an in-page reload. Because the service
  worker is what makes a remote-loaded page work offline, this switch belongs
  with a **locally bundled** game, not a shell that still loads the site over
  the network.
- **In-app purchases (the coin store).** The game's title menu grows a STORE
  row in native builds only: consumable coin packs that fund the in-game AUTO
  PILOT, bought through StoreKit / Play Billing via
  [`expo-iap`](https://github.com/hyodotdev/expo-iap). A purchase lands in a
  device-wide **undistributed bank**; the store's DISTRIBUTE flow hands any
  amount to any hero later (the remainder stays banked). The same packs are
  also sold **mid-run** from the AUTO PILOT picker's STORE button, where the
  buy goes straight to the hero being played instead of waiting in the bank.
  The web side
  (`pwa/src/game/store.ts` + `pwa/src/app/store-bridge.ts`) drives the
  flow over the WebView message channel; the native half
  (`src/store-purchases.ts`) opens the pay sheet and holds every paid
  transaction **unfinished until the web side confirms the coins are
  persisted**, so an app killed mid-purchase redelivers it on the next launch
  (the web side's ledger makes duplicates harmless). The products must exist
  as **consumables** in App Store Connect / Play Console under these ids and
  prices: `coins_1m` $1 · `coins_10m` $2 · `coins_100m` $10 · `coins_1b` $20 ·
  `coins_10b` $100 (the catalog lives in `pwa/src/game/store.ts`). In a
  build without the IAP native module (Expo Go) the store reports itself
  unavailable instead of crashing.

  **Payment is only demanded by real store distributions.** A build must opt
  in with `EXPO_PUBLIC_STORE_PAYMENTS=required`, which only the `production`
  EAS profile sets (`eas.json`). Every other build — local dev, simulator,
  preview, and the **`testflight`** profile (store-signed so it can be
  submitted to TestFlight, but unpaid) — answers `FREE` price tags and
  grants packs instantly without touching StoreKit / Play Billing, exercising
  the exact same bridge/credit/ledger flow minus the pay sheet. Build for
  TestFlight with `eas build --profile testflight`; reserve
  `--profile production` for the actual store release. (Web-side there is
  also a DEVELOPER → FORCE STORE switch that surfaces the free store in any
  browser/PWA build.)

- **Cloud save (iCloud + Game Center).** Coin packs cost real money, so the
  bank they land in must not belong to a single phone. In the app the player's
  whole roster, the undistributed coin bank and the hardcore score board sync
  through **iCloud key-value storage**, with **Game Center** naming the
  signed-in player; SETTINGS → DATA → CLOUD SAVE shows the state and syncs on
  demand. Syncs also run at launch, on every foreground change, when iCloud
  reports another device wrote, and right after a purchase.

  The native half is `src/cloud-save.ts` (the message bridge) over
  `src/cloud-provider.ts` (the platform seam) and `src/cloud-icloud.ts` (Apple),
  backed by the local Expo module in `modules/cloud-save/`
  (`NSUbiquitousKeyValueStore` + `GKLocalPlayer` in Swift — no third-party
  dependency). The bridge moves ONE opaque string; the game owns the payload and
  the merge (`pwa/src/game/cloud-save.ts`), so a device that is offline, or an
  app killed mid-sync, can never lose a paid pack. Without the native module
  (Expo Go) it reports itself unavailable and the game stays device-local.

  **Google Play later:** write a `src/cloud-play-games.ts` implementing the same
  five methods (Saved Games snapshots for load/save, Play Games sign-in for
  identity) and return it from `cloudProvider()` for `Platform.OS === "android"`.
  Nothing else changes — not the bridge, not the protocol, not the web side.

  Two **capabilities** must be enabled on the App ID in the Apple Developer
  portal, or code signing fails: **iCloud** with _Key-value storage_, and **Game
  Center**. The entitlements themselves come from `app.config.js`. For a quick
  local build on an account that has neither, build with
  `EXPO_PUBLIC_CLOUD_SAVE=off` to drop them (the app then reports cloud save
  unavailable):

  ```sh
  EXPO_PUBLIC_CLOUD_SAVE=off npm run ios
  ```

- **Developer tooling is stripped from the store build only.** The website's
  hidden DEVELOPER surfaces — the seven-tap sun reveal (`use-sun-charge.ts`),
  the DEVELOPER menu behind it (warp, BOT VIEW, arsenal, effects gallery,
  BALANCE knobs, DEBUG MODE, FORCE STORE) and the commit hash beside the version
  in the title footer — ship in **every** build except the one uploaded to the
  App Store / Play Store. The switch is the website build flag
  `VITE_DEV_TOOLS=off`, passed by `scripts/bundle-web.mjs` when it bundles for
  the `production` EAS profile; because the flag is a build-time literal, every
  gate on it folds to `false` and the tooling's code is dropped from the bundle
  rather than merely hidden. A `production` build also resets any developer
  state a previous install persisted — a latched unlock, FORCE STORE, the
  BALANCE multipliers — so a TestFlight tester's settings can't govern the
  shipped game after an update.

The engine and PWA are unchanged — see the repo-root `README.md` and
`docs/architecture.md`. This directory is **not** part of the npm workspace; it
manages its own dependencies.

## Layout

| File                     | Purpose                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------- |
| `App.tsx`                | The WebView shell, message bridge, loading/offline states.                            |
| `src/local-server.ts`    | Unzips the bundled site on first launch and serves it over a local HTTP server.       |
| `src/config.ts`          | Bundled by default; the optional `EXPO_PUBLIC_GAME_URL` remote override.              |
| `src/injected.ts`        | JS injected into the page: the `navigator.vibrate` bridge + viewport hardening.       |
| `src/native-haptics.ts`  | Translates Web-Vibration patterns → Taptic Engine impacts.                            |
| `src/store-purchases.ts` | The coin store's native half: StoreKit / Play Billing via expo-iap.                   |
| `src/cloud-save.ts`      | Cloud save's native half: the save blob in and out of the platform cloud.             |
| `src/cloud-provider.ts`  | The cloud platform seam — Apple today, Google Play behind the same interface.         |
| `src/cloud-icloud.ts`    | The Apple provider: iCloud key-value storage + the Game Center player.                |
| `modules/cloud-save/`    | Local Expo module (Swift): `NSUbiquitousKeyValueStore` + `GKLocalPlayer`.             |
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

   The EAS profile is passed through with `--profile <name>` (the `build:*`
   scripts and the CI workflow do this): `production` — and only `production` —
   builds the site with `VITE_DEV_TOOLS=off`, which strips the developer tooling
   from the shipped app (see **Developer tooling** below). Anything else keeps
   it, so a `testflight` build is the website plus the native extras, nothing
   removed.

2. The zip rides in the app bundle (`assetBundlePatterns`). It is a build
   artifact — **gitignored**, but a `.easignore` re-includes it in the EAS
   upload, so it must exist before a build (the `build:*` scripts and the CI
   workflow run `npm run bundle` for you).
3. On first launch (and after each app update) `src/local-server.ts` unzips it
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
npm run ios        # build the native app and run it on an iOS simulator
npm start          # just the Expo dev server (app already installed)
npm run typecheck  # tsc --noEmit
npm run doctor     # expo-doctor sanity check
```

The same commands are aliased from the repo root (`npm run native:ios`,
`npm run native:bundle`, …) so you don't have to `cd` — see the root `AGENTS.md`.

> **Changed `app.config.js`?** The generated native projects (`ios/`,
> `android/` — gitignored) live in the native project (orientation,
> Info.plist keys, icons, plugins), and a bare `expo run:ios` **reuses** an
> existing one — so those changes would silently not apply. To prevent that,
> `npm run ios` / `npm run ios:device` run `expo prebuild --platform ios`
> first, re-syncing the native project from `app.config.js` on every build.
> (If a change still won't take, force a full regen with
> `npx expo prebuild --clean`.) EAS builds always prebuild fresh, so store
> builds are never stale this way. Likewise, rebuild `assets/webroot.zip`
> (`npm run bundle`) whenever the website changed — the app ships whatever zip
> is on disk.

The local server is a **native module**, so it does not run in Expo Go — you
need a dev build, which is exactly what `npm run ios` / `npm run android`
produce locally. To iterate in Expo Go instead, skip the bundle and point the
WebView at a remote URL:

```sh
EXPO_PUBLIC_GAME_URL=https://game.niclaslindstedt.se/preview/ npm start
```

## Run it on a real phone

Three routes, cheapest first:

1. **Expo Go + remote URL** — no build, no Apple account. Run the
   `EXPO_PUBLIC_GAME_URL=… npm start` command above and scan the QR code with
   Expo Go on the phone (same Wi-Fi). You get the real touch/perf feel of the
   game, but **not** the native shell: no local server, no Taptic haptics —
   those are native modules Expo Go doesn't carry.
2. **A local build over USB** — the whole app, haptics included:

   ```sh
   npm run bundle
   npm run ios:device        # expo run:ios --device --configuration Release — pick your iPhone
   ```

   The device build is a **Release** build on purpose: it **embeds the JS
   bundle** in the app binary, so the app launches standalone and never needs
   the Metro packager. A Debug device build instead fetches its JS from Metro
   over the network at launch — which a USB-tethered phone usually can't reach,
   and then it dies on the red `No script URL provided … unsanitizedScriptURLString
= (null)` screen. Since this shell is self-contained anyway (the game is
   served locally from `webroot.zip`), there's nothing to live-reload on the
   device, so Release is the right build. (To iterate on the shell's own React
   Native code with fast refresh, use the simulator — `npm run ios` — or Expo
   Go, route 1.)

   The phone must be plugged in, unlocked, and trusted; Xcode signs the build
   with your Apple ID (a free account works — the app then expires after 7 days
   and needs a re-install). First run also asks you to trust the developer
   certificate on the device under **Settings → General → VPN & Device
   Management**. Android is the same via `npm run android` with USB debugging on
   (add `--variant release` for the same embedded-bundle, no-packager behaviour).

3. **An EAS build, installed over the air** — for testing on a phone that isn't
   plugged into this Mac:

   ```sh
   eas device:create         # one-time: register the device with the ad-hoc profile
   npm run build:preview     # bundles the site, builds on EAS, gives you an install link
   ```

   Or ship `npm run build:production` to TestFlight and install from there — the
   closest thing to what players will get.

## Build & distribute

Builds are **manual** to keep EAS costs down — locally, or via the
`Native App Build (EAS)` GitHub Actions workflow (Actions tab → Run workflow → pick
platform / profile / submit). CI never builds the app on push. The workflow
(and the `build:*` scripts) run `npm run bundle` first so the on-device website
is fresh.

```sh
# Internal test build (ad-hoc / APK) — bundles the site, then builds:
npm run build:preview

# TestFlight build (store-signed, free coin packs, developer tooling intact):
npm run build:testflight

# Store build:
npm run build:production

# Or drive EAS directly — pass the profile to the BUNDLE too (see below):
npm run bundle -- --profile production && eas build --profile production --platform all --auto-submit
```

The CI workflow needs an `EXPO_TOKEN` repository secret (create one at
<https://expo.dev/settings/access-tokens>). Store **submission** additionally
needs App Store Connect / Google Play credentials configured on the EAS project
(`eas credentials`), which is a one-time interactive setup.
