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

That entry point is `scripts/run-electron.mjs` rather than a shell one-liner for
one reason worth keeping: **an npm script may not set an environment variable
with `VAR=value` shell syntax.** npm runs scripts through the platform's shell,
and `cmd.exe` has no such syntax — it reports `'GIS_STEAM' is not recognized as
an internal or external command` and the script fails before npm is reached, so
the game cannot be started from the repo on Windows at all. Anything that needs a
variable set goes in a Node launcher that sets it on the child;
`tests/content/npm_scripts_portable_test.ts` keeps every manifest honest.

Arguments reach the game: `npm run electron -- --multiplayer`.

### When it does not start

The shell writes **every launch** to `launch.log` in its user-data directory
(`%APPDATA%\adastrail` on Windows, `~/Library/Application
Support/adastrail` on macOS, `~/.config/adastrail` on Linux),
keeping the previous one beside it as `launch.log.prev`. A packaged game has no
console, so that file — plus the error dialog anything fatal raises — is the
whole diagnosis. Attach it to a bug report.

That folder is named by `src/user-data.ts` rather than left to Electron's
default, which is the npm package name — so the folder, the executable and the
docs all say `adastrail`. An install that predates that carries the old name
and is **moved once, on the next launch**, because everything the player owns
(their roster in `localStorage`, settings, window state, their mods) lives in
it. The move is logged; if it fails, the app runs on the folder it already had
rather than starting empty.

Without a Steam client running, `steamworks.init()` throws and the shell
memoizes "no client": cloud save and achievements report unavailable and the
game plays device-locally, exactly as it does in a browser. That is the normal
way to work on the shell. `GIS_STEAM=off` skips the attempt entirely. It does
not grant player use of mods or multiplayer; those require an acquired Steam
licence. A mod creator using an official downloaded binary may pass
`--modifications` only for the local authoring/test exception described above.

### Environment

| Variable            | Effect                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------ |
| `GIS_STEAM_APP_ID`  | The Steam app id. Defaults to **480** (Valve's Spacewar test app)                                            |
| `GIS_STEAM=off`     | Don't talk to Steam at all                                                                                   |
| `GIS_GAME_URL`      | Load a remote URL instead of the bundled site (e.g. the `/preview/` slot)                                    |
| `GIS_VERBOSE=1`     | Keep the informational log in a packaged build                                                               |
| `GIS_STEAM_OVERLAY` | `1` forces the Steam overlay's Chromium switches on, `0` off. Unset = on only when Steam started the process |

`GIS_STEAM_OVERLAY` guards a trap rather than a preference.
`electronEnableSteamOverlay()` does not draw anything — it appends
`in-process-gpu` and `disable-direct-composition` to Chromium's command line.
Where Steam did not launch the game there is no overlay to draw, and an
in-process GPU that falls over takes the browser process with it: the game exits
with no window and no message. So the switches are installed only when Steam
stamped its own variables into our environment, which is exactly the launch that
has an overlay behind it.

### Testing against Steam locally

Steam must be **running and signed in**. Until the real app id exists, use
Spacewar:

```sh
echo 480 > steam_appid.txt        # gitignored; only needed for a local run
GIS_STEAM=on npm run electron     # Windows: set GIS_STEAM=on && npm run electron
```

`GIS_STEAM` has to be asked for, because the launcher defaults it to `off` —
running the shell without a Steam client is the ordinary case, and a value
already in the environment wins over that default.

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

### macOS: the build is never unsigned

**Apple Silicon refuses to execute unsigned arm64 code.** Not "warns about it" —
the kernel will not map the binary, and macOS tells the player _"'Adas Trail.app'
is damaged and can't be opened. You should move it to the Trash."_ It is the same
sentence macOS uses for a corrupt download, which is why the first native mac
build read as a broken zip rather than as a missing signature. x86_64 has no such
rule, so an unsigned Intel slice runs happily — under Rosetta, at Rosetta's
speed — and hides the fault.

So the packaging config always signs, and with what depends on what it is given:

| Given                                                            | Signed with              | What the player meets                          |
| ---------------------------------------------------------------- | ------------------------ | ---------------------------------------------- |
| nothing                                                          | **ad-hoc** (`-`)         | one Gatekeeper prompt, then it runs — natively |
| `CSC_LINK` / `GIS_MAC_IDENTITY`                                  | your **Developer ID**    | the same prompt (not notarized yet)            |
| …plus `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` | Developer ID + notarized | nothing — it just opens                        |

An ad-hoc build is a real, native, full-speed app. What it is not is _anybody's_
app: the signature carries no identity, so Gatekeeper still asks. A player who
downloads one opens it once through **System Settings → Privacy & Security →
Open Anyway**; after that macOS remembers. `xattr -dr com.apple.quarantine
"/Applications/Adas Trail.app"` is the same thing from a terminal.

Where the credentials come from, when you want the prompt gone too — all of it
is [`RELEASING.md`](RELEASING.md) → **Signing**.

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
