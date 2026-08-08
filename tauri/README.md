<!-- SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 -->

# Ada's Trail — desktop app (Tauri)

The **second** desktop wrapper around the game, for Windows, macOS and Linux. It
is a thin [Tauri](https://tauri.app) shell whose entire content is the built
website, so the app **looks and plays exactly like the site** — the same promise
[`electron/`](../electron/README.md) makes, kept by a different binary.

It lives **beside** the Electron shell rather than replacing it. Tauri may take
over as the release package once it is mature; that decision is made after
playtesting, at the end of phase 4. Until then **`electron/` is the shipping
desktop build** and this one is not to be handed to a player.

> **This tree is at phase 3 of four.** It runs the whole game, offline, in a
> real window that remembers itself, and it carries every platform seam: cloud
> save, achievements, screenshots, **mods, multiplayer and voice**, plus a
> package. The ONE thing it does not have is the **Steam overlay**, and that is
> not coming — Valve's overlay hooks a graphics surface a webview shell does not
> own (see below). What is left is phase 4: playing the two shells side by side
> and deciding. The plan and the phases are
> [`docs/tauri-migration.md`](../docs/tauri-migration.md).

## Why a second one

The Electron shell carries a full copy of Chromium — roughly 180 MB per
install. Tauri uses the platform's own webview (WebView2, WKWebView, WebKitGTK),
which takes that to about a tenth and the idle memory with it. For a game whose
entire content is a website that already runs in a browser, that is the trade —
and the other side of it (three webview engines instead of one, no
`utilityProcess`, no `steamworks.js`) is what the four phases exist to work
through honestly rather than discover at the end.

## Layout — TWO crates, and the split is the design

| Path                            | What it is                                                                   |
| ------------------------------- | ---------------------------------------------------------------------------- |
| `shell/`                        | **Every decision.** No Tauri, no GUI, no window. Peer of `electron/src/*.ts` |
| `shell/tests/`                  | Its whole test suite — runs anywhere a Rust toolchain does                   |
| `src-tauri/src/main.rs`         | The process: the builder, the command routing, the lifecycle                 |
| `src-tauri/src/window.rs`       | The window, its geometry, and pinning it to our own origin                   |
| `src-tauri/src/protocol.rs`     | Answering `game://` off the bundled `webroot/`                               |
| `src-tauri/src/page.rs`         | The initialization script. **Peer of `electron/src/preload.ts`**             |
| `src-tauri/src/stamp.rs`        | The capability stamp, read at compile time                                   |
| `src-tauri/src/steam.rs`        | **The one owner of the Steam client**, and the callback pump                 |
| `src-tauri/src/cloud.rs`        | Steam Cloud. Peer of `electron/src/cloud-steam.ts`                           |
| `src-tauri/src/achievements.rs` | Steam's badge shelf. Peer of `electron/src/achievements-steam.ts`            |
| `src-tauri/src/shots.rs`        | The pictures folder, the clipboard, and Steam's screenshot library           |
| `src-tauri/src/session.rs`      | The SESSION SIDECAR as a process. Peer of `electron/src/session-host.ts`     |
| `src-tauri/src/net.rs`          | The net bridge's orchestration. Peer of `electron/src/net.ts`                |
| `src-tauri/src/lobby.rs`        | Steam matchmaking, which IS the server browser                               |
| `src-tauri/src/p2p.rs`          | The Steam relay's pump — the only game traffic that passes through the shell |
| `src-tauri/src/firewall.rs`     | Running the firewall commands the shell crate wrote                          |
| `src-tauri/src/mods.rs`         | The mods bridge, and spawning the ONE compiler                               |
| `src-tauri/src/workshop.rs`     | Steam UGC. Peer of `electron/src/workshop.ts`                                |
| `src-tauri/src/media.rs`        | The webview's permission handler — the microphone gate                       |
| `src-tauri/src/dedicated.rs`    | `--dedicated`, decided before Tauri's builder exists                         |
| `src-tauri/build.rs`            | The stamp's rebuild triggers, and placing `libsteam_api` beside the binary   |
| `src-tauri/capabilities/`       | **Tauri's own ACL** — what the window may reach. Not our capabilities        |
| `scripts/bundle-web.mjs`        | Builds the site and copies it to `webroot/` (gitignored)                     |
| `scripts/icons.mjs`             | Re-encodes `pwa/public/`'s icon to the RGBA Tauri insists on                 |
| `scripts/package.mjs`           | Packaging. Peer of `electron/electron-builder.config.cjs`                    |
| `scripts/mod-compile.mjs`       | The adapter the Rust shell reaches `mod/tools/build.mjs` through             |

`cargo test -p adastrail-shell` therefore runs the entire decision layer on a
machine with **no GUI libraries installed at all** — which is what makes this
tree's logic coverable on an ordinary CI runner, and is the Rust-shaped version
of the discipline the Electron shell keeps by hand. That includes every platform
seam's whole protocol: a bridge takes a provider, and a test hands it one that
can be made to lose a read or refuse a write, which no real Steam client can be
asked to do on demand. It also includes the halves the TypeScript peers cannot
test at all — the READING of `netsh`'s, `socketfilterfw`'s and `ufw`'s output,
where that feature's bugs actually live, is a pure function here with a sample
of each tool's real output beside it.

**The far end of the sidecar's two pipes is tested from the ROOT suite**, not
from here: `tests/shell_host_test.ts` drives `server/shell-host.ts` over a real
loopback WebSocket with a real browser handshake, because the thing worth
proving is that the framing a browser sends is the framing the session reads.

**Two words named `capabilities` live in this tree and they are different
things.** `shell/src/capabilities.rs` is what a copy of the GAME may do
(multiplayer, mods, voice) — the peer of `electron/src/capabilities.ts`.
`src-tauri/capabilities/*.json` is Tauri's permission ACL: what the WINDOW may
reach of the operating system. The second one is deny-by-default with one plugin
on it, for the same reason Electron's permission handler is.

## How it differs from the Electron shell

Everything below is a difference in the PLATFORM, not in the judgement — each
one is the same decision reached through a different API.

| Thing                | Electron                           | Here                                                       |
| -------------------- | ---------------------------------- | ---------------------------------------------------------- |
| The origin           | `game://app`                       | `game://localhost`, or `http://game.localhost` on Windows  |
| The page's globals   | a sandboxed preload                | an initialization script                                   |
| Page → shell         | `ipcRenderer.send`                 | one Tauri command, `shell_post`                            |
| Shell → page         | `webContents.executeJavaScript`    | `webview.eval` — same script, same globals                 |
| Serving the site     | streamed from disk                 | read whole (the sync handler returns a body, not a stream) |
| F11 / Alt+Enter      | `before-input-event`               | a capture-phase listener the init script installs          |
| The capability stamp | the packaged `package.json`        | `option_env!`, so an installed copy has nothing to edit    |
| A monitor's area     | `workArea` (excludes the taskbar)  | the whole monitor — no webview library exposes a work area |
| No monitors at all   | drops the remembered position      | keeps it: "could not enumerate" is not "nowhere"           |
| The Steam binding    | `steamworks.js` (prebuilt N-API)   | the `steamworks` crate, compiled in — and richer           |
| Valve's overlay      | injected via two Chromium switches | **not available**, on any of the three desktops            |
| A Steam screenshot   | filed by the overlay, off F12      | filed by the game, `AddScreenshotToLibrary`                |
| Leaderboards         | absent — the binding cannot        | absent — the binding CAN; there is no board to open        |
| The session server   | `utilityProcess.fork`              | a child process on a bundled Node runtime                  |
| Its control channel  | the Node IPC channel               | the child's stdio, newline-delimited JSON                  |
| Snapshots (20 Hz)    | a transferred `MessagePort`        | a loopback WebSocket the PAGE opens — no shell in the path |
| Reaping the session  | `before-quit` kills it             | stdin's EOF, which the child watches                       |
| The mod compiler     | `import()`ed into the main process | spawned, and what crosses is JSON                          |
| A second instance    | `requestSingleInstanceLock`        | `tauri-plugin-single-instance`, same invite hand-off       |
| The microphone gate  | one permission handler             | WebKitGTK's own, plus a page-side lockout everywhere       |

**The overlay's absence is the one a player would notice**, so it is stated in
every launch log rather than left to be discovered: no Shift+Tab, no in-game
browser, and no Steam screenshot key. `shell/src/steam.rs` carries the whole
argument — the short version is that Valve's overlay hooks the graphics API a
game presents its frames with, and a webview shell does not own that surface.
The screenshot row above is the consequence: with nothing filing a Steam copy
for us, the game files its own.

**The origin is the one to be careful with.** The player's whole roster lives in
`localStorage`, which is keyed by origin, so `APP_SCHEME` and `APP_HOST` are
constants that must never be tidied. And note what follows from the table: the
Electron origin and this one are different, and Chromium's storage is not
WebKit's — so **a roster cannot be carried from one shell to the other on disk**.
Cloud save (phase 2) is the only bridge between them.

## Developing

Needs a **Rust toolchain** ([rustup](https://rustup.rs)) plus the platform's
webview development libraries — Tauri's own
[prerequisites](https://tauri.app/start/prerequisites/) page is the current list
per platform. On Debian/Ubuntu that is `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`,
`libayatana-appindicator3-dev`, `librsvg2-dev` and `patchelf`; on macOS the
Xcode command line tools; on Windows the WebView2 runtime (already present on
Windows 11).

The root entry point builds the site into `tauri/webroot/`, compiles the shell,
and launches it:

```sh
npm run tauri             # from the repo root
make tauri                # the same thing
```

Arguments reach the game: `npm run tauri -- --multiplayer` (which, through
phase 2, turns on a capability whose bridge is not answered yet — the log says
so).

Steam is talked to on every launch unless told not to. `GIS_STEAM=off` is how
most local work on this tree happens; without it, a machine with no Steam client
running simply reports the handshake as unavailable and the game plays
device-locally, which is the same thing it does in a browser.

That entry point is `scripts/run-tauri.mjs` rather than a shell one-liner for
one reason worth keeping: **an npm script may not set an environment variable
with `VAR=value` shell syntax.** npm runs scripts through the platform's shell,
and `cmd.exe` has no such syntax — the script fails before npm is reached, so
the game cannot be started from the repo on Windows at all.
`tests/content/npm_scripts_portable_test.ts` keeps every manifest honest.

### Checking it

```sh
make tauri-test    # the decision layer — needs no GUI libraries
make tauri-lint    # clippy at zero warnings, BOTH crates (needs the libraries)
make tauri-fmt     # rustfmt in place
```

`make tauri-test` is `cargo test -p adastrail-shell` and deliberately only that
crate: it depends on no GUI toolkit and no Steam SDK, so it runs on a runner
with a Rust toolchain and nothing else. The app crate has no tests of its own by
design — every decision lives in the library, which is the whole reason for the
split — and compiling it needs the platform's webview development libraries,
which is what `make tauri-lint` and `make tauri` are for.

**None of these are on the root suite's path**, exactly as `electron/`'s are
not: `make test` and `make lint` stop at this tree's edge, because it has its
own toolchain. Run them when you touch this tree — and since phase 3,
`.github/workflows/tauri-build.yml` runs both on every push that touches
`tauri/`, `server/`, `scripts/` or `pwa/src/app/`, so a tree somebody forgot to
check is a red PR rather than a surprise.

### When it does not start

The shell writes **every launch** to `launch.log` in its user-data directory
(`%APPDATA%\adastrail-tauri` on Windows, `~/Library/Application
Support/adastrail-tauri` on macOS, `~/.local/share/adastrail-tauri` on Linux),
keeping the previous one beside it as `launch.log.prev`. A packaged game has no
console, so that file — plus the error dialog anything fatal raises — is the
whole diagnosis. Attach it to a bug report.

**The folder is `adastrail-tauri` rather than `adastrail` on purpose**: both
desktop shells are installable at once while the two are being compared, and two
running games sharing one `window-state.json` and one launch log is a fight
neither can win. If phase 4 decides Tauri ships, the name becomes `adastrail`
and this one joins `LEGACY_DIR_NAMES`, which is the machinery that already
exists in `shell/src/user_data.rs` for exactly that.

### Environment

| Variable            | Effect                                                                    |
| ------------------- | ------------------------------------------------------------------------- |
| `GIS_GAME_URL`      | Load a remote URL instead of the bundled site (e.g. the `/preview/` slot) |
| `GIS_WEBROOT`       | Serve the site from somewhere else without rebuilding                     |
| `GIS_VERBOSE=1`     | Keep the informational log in a release build                             |
| `GIS_STEAM=off`     | Don't talk to Steam at all — how most local work on this tree happens     |
| `GIS_STEAM_APP_ID`  | Which Steam app. Defaults to Valve's Spacewar (480), which is a test app  |
| `GIS_STEAM_OVERLAY` | `1`/`0` forces "was this started by Steam", which the log reports         |

From a checkout, MULTIPLAYER and MODS additionally need the things that are not
Rust — the session server compiled for Node (`npm run server:build` at the repo
root) and a `node` on `PATH`. The shell says which one is missing, by name, the
first time the feature is asked for; a packaged build carries both.

The five `GIS_ENABLE_*` switches and `GIS_STAMP_CAPABILITIES` are read at
COMPILE time (`src-tauri/src/stamp.rs`), not at launch — they are the same names
the Makefile already sets for the Electron packaging targets, so one vocabulary
drives both shells. `src-tauri/build.rs` declares them as build inputs, because
`option_env!` is not one: without that, a `dist` build made straight after a
`steam` build would silently reuse the depot build's capabilities.

## Building for a store

**Nothing here is the release package yet** — `electron/` is, and that decision
belongs to phase 4. Since phase 3 the downloads DO ship: `release.yml`'s
`desktop-tauri` job attaches a `-tauri`-suffixed build for each platform to
every GitHub Release, beside Electron's, so the install-size and cold-start
numbers phase 4 turns on can be measured by anybody from artifacts nobody
staged. Locally:

```sh
make desktop-tauri-steam                      # a DEPOT DIRECTORY, for Steam
make desktop-tauri-dist                       # installers/archives, for a download
make desktop-tauri-steam ARGS="--target aarch64-apple-darwin"
```

Both read the same five capability switches the Electron targets do, and both
go through `scripts/package.mjs`, which **refuses**: a build nothing stamped
(`GIS_STAMP_CAPABILITIES=1` is required), and a build still pointed at Valve's
Spacewar test app (set `GIS_STEAM_APP_ID`, or pass `--allow-placeholder` for a
test package). The site is rebuilt with the `production` profile, which strips
the developer tooling out of it.

The depot is a directory, not an installer, because Steam distributes by
uploading a directory and its own client owns installing it. On Windows and
Linux that is the executable, `webroot/`, and Valve's redistributable; on macOS
it is the whole `.app`, which keeps its own resources inside itself.

**macOS is never signed with nothing.** Apple Silicon refuses to execute
unsigned arm64 code at all, and reports that to the player as "the app is
damaged" — the same wording as a corrupted download. The default is an ad-hoc
signature, which satisfies the kernel; set `APPLE_SIGNING_IDENTITY` to a
Developer ID for a release, where notarization goes on top.
