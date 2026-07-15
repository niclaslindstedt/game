<!-- SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 -->

# Gone in Space — native app

The App Store / Play Store wrapper around the game. It is a thin
[Expo](https://expo.dev) / React Native shell whose entire content is a
full-screen [WebView](https://github.com/react-native-webview/react-native-webview)
pointed at the deployed PWA (`siteUrl` in the repo-root `game.config.json`), so
the app **looks and plays exactly like the website**. On top of the web game it
adds the two things a browser can't give iOS:

- **Native haptics.** iOS WKWebView never exposes `navigator.vibrate`, so the
  game's web haptics driver silently no-ops there. The shell injects a
  `navigator.vibrate` polyfill (`src/injected.ts`) that the game's existing
  driver detects by feature test — every buzz the game emits is forwarded to
  the native side (`src/nativeHaptics.ts`) and replayed on the **Taptic Engine**
  via `expo-haptics`, preserving the game's "minion flick → boss rumble"
  scaling. No engine code changes.
- **An audio session.** `setAudioModeAsync({ playsInSilentMode: true })` lets the
  game's WebAudio play through the iOS ringer switch.

The engine and PWA are unchanged — see the repo-root `README.md` and
`docs/architecture.md`. This directory is **not** part of the npm workspace; it
manages its own dependencies.

## Layout

| File                   | Purpose                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------- |
| `App.tsx`              | The WebView shell, message bridge, loading/offline states.                            |
| `src/config.ts`        | Which URL the WebView loads (from `game.config.json`).                                |
| `src/injected.ts`      | JS injected into the page: the `navigator.vibrate` bridge + viewport hardening.       |
| `src/nativeHaptics.ts` | Translates Web-Vibration patterns → Taptic Engine impacts.                            |
| `app.config.js`        | Dynamic Expo config; reads identity from `game.config.json`, pins the EAS project id. |
| `eas.json`             | EAS build/submit profiles.                                                            |

## Prerequisites

- Node 24 (repo `.nvmrc`).
- An [Expo account](https://expo.dev) with access to the linked project
  (`180cff05-a398-48e3-ae63-a9b0bd408321`).
- `npm install --global eas-cli`, then `eas login`.

The project is already linked (its id is pinned in `app.config.js`). If you need
to re-link it interactively, run `eas init --id 180cff05-a398-48e3-ae63-a9b0bd408321`.

## Develop

```sh
cd app
npm install
npm start          # Expo dev server; open in a dev build or Expo Go
npm run typecheck  # tsc --noEmit
npm run doctor     # expo-doctor sanity check
```

By default the WebView loads the production site. To point a build at another
slot (e.g. the `/preview/` deploy) set `EXPO_PUBLIC_GAME_URL`:

```sh
EXPO_PUBLIC_GAME_URL=https://game.niclaslindstedt.se/preview/ npm start
```

## Build & distribute

Builds are **manual** to keep EAS costs down — locally, or via the
`App Build (EAS)` GitHub Actions workflow (Actions tab → Run workflow → pick
platform / profile / submit). CI never builds the app on push.

```sh
# Internal test build (ad-hoc / APK):
eas build --profile preview --platform all

# Store build:
eas build --profile production --platform all

# Build and submit to the stores in one step:
eas build --profile production --platform all --auto-submit
```

The CI workflow needs an `EXPO_TOKEN` repository secret (create one at
<https://expo.dev/settings/access-tokens>). Store **submission** additionally
needs App Store Connect / Google Play credentials configured on the EAS project
(`eas credentials`), which is a one-time interactive setup.
