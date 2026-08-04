<!-- SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 -->

# Ada's Trail — desktop app

The Steam wrapper around the game, for **Windows, macOS and Linux**. It is a
thin [Electron](https://www.electronjs.org) shell whose entire content is the
built website, so the app **looks and plays exactly like the site**.

It is the desktop twin of [`native/`](../native/README.md) and is built the same
way: the whole website is copied inside it (`webroot/`, a gitignored build
artifact) and served from a private scheme on launch, so the game runs entirely
on-device and offline and updates only when a new build ships to Steam.

On top of the web game it adds the things a browser can't give a desktop player:

- **Licensed mods and multiplayer.** Steam Workshop supplies mods and Steam's
  relay carries co-op for players who acquired the game through Steam. The
  edition is not published yet. Mod creators may use `--modifications` with an
  official downloaded binary solely to build and test their own local mods;
  regular players may not use that exception, and it never licenses
  multiplayer.
- **Steam Cloud.** The roster, the coin bank and the hardcore score board follow
  the player between machines, through the same payload and the same merge the
  iOS app uses over iCloud — the web side never learns the platform changed.
- **Steam achievements.** The game's badge shelf is mirrored onto the player's
  Steam profile, one way, exactly as it is mirrored to Game Center.
- **The Steam overlay**, Shift+Tab and all.
- **A real window** that remembers its size, position and fullscreen state.

## What is deliberately NOT here

- **The coin store.** The desktop game is bought once; Steam has no consumable
  purchase short of the Inventory Service, and a paid game that also sells
  currency is what the single price exists to avoid. The AUTO PILOT purse is
  funded by selling loot to the merchant, exactly as it is on the website.
  `pwa/src/app/store-bridge.ts` hides the STORE row when the shell reports
  `steam`.
- **Haptics.** No motor, so `canVibrate()` reports false and the VIBRATION row
  is hidden rather than offered as a dead switch.
- **Leaderboards.** Not an oversight — see
  [`src/leaderboards-provider.ts`](src/leaderboards-provider.ts), which explains
  it at the seam. Short version: `steamworks.js` binds no leaderboard API, and
  Steam's overlay has no leaderboard page either, so the "the platform draws the
  board" design has no Steam counterpart. The bridge is wired up regardless, so
  adding support later is one new file.

## Layout

| Path                                            | What it is                                                                |
| ----------------------------------------------- | ------------------------------------------------------------------------- |
| `src/main.ts`                                   | The main process: window, protocol, IPC routing. Peer of `native/App.tsx` |
| `src/preload.ts`                                | The page's whole view of the shell. Peer of `native/src/injected.ts`      |
| `src/webroot.ts`                                | Serves the bundled site. Peer of `native/src/local-server.ts`             |
| `src/window-state.ts`                           | Remembered geometry (pure — takes displays as an argument)                |
| `src/steam.ts`                                  | The ONE owner of the Steam handshake. Peer of `native/src/game-center.ts` |
| `src/{cloud-save,achievements,leaderboards}.ts` | The three bridges — no platform in them at all                            |
| `src/*-provider.ts`                             | The three platform seams                                                  |
| `src/{cloud,achievements}-steam.ts`             | The Steam implementations                                                 |
| `scripts/bundle-web.mjs`                        | Builds the site and copies it to `webroot/`                               |

## Developing

This tree has **its own dependency tree** — it is not an npm workspace member.
The root entry point installs that tree, builds the site into `electron/webroot/`,
compiles the shell, and launches it:

```sh
npm run electron             # from the repo root
```

The individual `electron:install` and `electron:bundle` commands remain
available when only one preparation step is needed.

Without a Steam client running, `steamworks.init()` throws and the shell
memoizes "no client": cloud save and achievements report unavailable and the
game plays device-locally, exactly as it does in a browser. That is the normal
way to work on the shell. `GIS_STEAM=off` skips the attempt entirely. It does
not grant player use of mods or multiplayer; those require an acquired Steam
licence. A mod creator using an official downloaded binary may pass
`--modifications` only for the local authoring/test exception described above.

### Environment

| Variable           | Effect                                                                    |
| ------------------ | ------------------------------------------------------------------------- |
| `GIS_STEAM_APP_ID` | The Steam app id. Defaults to **480** (Valve's Spacewar test app)         |
| `GIS_STEAM=off`    | Don't talk to Steam at all                                                |
| `GIS_GAME_URL`     | Load a remote URL instead of the bundled site (e.g. the `/preview/` slot) |
| `GIS_VERBOSE=1`    | Keep the informational log in a packaged build                            |

### Testing against Steam locally

Steam must be **running and signed in**. Until the real app id exists, use
Spacewar:

```sh
echo 480 > steam_appid.txt   # gitignored; only needed for a local run
npm run electron
```

Spacewar's cloud and achievements are shared test surfaces — useful to prove the
plumbing works end to end, useless as a test of our own achievement list, since
our ids don't exist there. `isPlaceholderAppId()` is what keeps a 480 build from
being shipped by accident.

## Building for Steam

```sh
npm run release:win     # release/win-unpacked/    — for the STORE
npm run release:mac     # release/mac/             (x64; Rosetta on Apple Silicon)
npm run release:linux   # release/linux-unpacked/

npm run dist:win        # …the same, but keeping the DEVELOPER tooling in
```

**`release:*` is what a store build uses**; `dist:*` keeps the hidden developer
menu, the arsenal and the effects gallery in the embedded site. The upload
script refuses a build with them in it, so the mistake is caught rather than
shipped — but building the right one first saves a round trip.

Then upload:

```sh
npm run steam:upload -- --platform windows --dry-run   # check without uploading
npm run steam:upload -- --platform windows
```

The target is a **directory, not an installer** — Steam distributes by uploading
a directory to a depot and its own client owns installing and updating. See the
comment at the top of `electron-builder.config.cjs`.

### Before a real release

**[`RELEASING.md`](RELEASING.md) is the full step-by-step** — Steam Direct, the
app and depot records, the store assets and their exact dimensions, signing,
uploading, and the 30-day store-page wait that gates the whole thing. The short
version:

- [ ] **Set `GIS_STEAM_APP_ID`** to the real app id. A build left on 480 talks to
      Valve's test app.
- [ ] **Notarize the macOS build.** The hardened runtime is on and the
      entitlements are in `build/entitlements.mac.plist`; notarization needs a
      Developer ID Application certificate and an app-specific password, neither
      of which lives in the repo. Gatekeeper blocks an un-notarized app even when
      Steam launches it.
- [ ] **Verify the Steam redistributable landed** beside the executable
      (`steam_api64.dll` / `libsteam_api.dylib` / `libsteam_api.so`). A wrong
      path shows up as `steam: unavailable` in the log rather than as a crash,
      because `steam.ts` degrades instead of throwing — so check the log, don't
      just check that it launched.
- [ ] **Create the achievement rows** in the partner site. They are generated
      into `store/steam-achievements.json`; the suite fails when it drifts.
      Steam caps a new app at **100 achievements** until it reaches the Profile
      Features threshold, which is why the shipped list is curated.
- [ ] **Turn Steam Cloud on for the app.** `isAvailable()` demands both the
      player's per-game toggle and the app's own setting, so a forgotten app
      setting means cloud save quietly reports unavailable for everyone.
