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

> **This tree is at phase 1 of four.** It runs the whole game, offline, in a
> real window that remembers itself. It has **no Steam, no cloud save, no
> achievements, no screenshots, no mods and no multiplayer** — every one of
> those is routed to a seam that logs which phase fills it in. The plan, the
> phases and the open design questions are
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

| Path                        | What it is                                                                   |
| --------------------------- | ---------------------------------------------------------------------------- |
| `shell/`                    | **Every decision.** No Tauri, no GUI, no window. Peer of `electron/src/*.ts` |
| `shell/tests/`              | Its whole test suite — runs anywhere a Rust toolchain does                   |
| `src-tauri/src/main.rs`     | The process: the builder, the command routing, the lifecycle                 |
| `src-tauri/src/window.rs`   | The window, its geometry, and pinning it to our own origin                   |
| `src-tauri/src/protocol.rs` | Answering `game://` off the bundled `webroot/`                               |
| `src-tauri/src/page.rs`     | The initialization script. **Peer of `electron/src/preload.ts`**             |
| `src-tauri/src/stamp.rs`    | The capability stamp, read at compile time                                   |
| `src-tauri/capabilities/`   | **Tauri's own ACL** — what the window may reach. Not our capabilities        |
| `scripts/bundle-web.mjs`    | Builds the site and copies it to `webroot/` (gitignored)                     |
| `scripts/icons.mjs`         | Re-encodes `pwa/public/`'s icon to the RGBA Tauri insists on                 |

`cargo test -p adastrail-shell` therefore runs the entire decision layer on a
machine with **no GUI libraries installed at all** — which is what makes this
tree's logic coverable on an ordinary CI runner, and is the Rust-shaped version
of the discipline the Electron shell keeps by hand.

**Two words named `capabilities` live in this tree and they are different
things.** `shell/src/capabilities.rs` is what a copy of the GAME may do
(multiplayer, mods, voice) — the peer of `electron/src/capabilities.ts`.
`src-tauri/capabilities/*.json` is Tauri's permission ACL: what the WINDOW may
reach of the operating system. The second one is deny-by-default with one plugin
on it, for the same reason Electron's permission handler is.

## How it differs from the Electron shell

Everything below is a difference in the PLATFORM, not in the judgement — each
one is the same decision reached through a different API.

| Thing                | Electron                          | Here                                                       |
| -------------------- | --------------------------------- | ---------------------------------------------------------- |
| The origin           | `game://app`                      | `game://localhost`, or `http://game.localhost` on Windows  |
| The page's globals   | a sandboxed preload               | an initialization script                                   |
| Page → shell         | `ipcRenderer.send`                | one Tauri command, `shell_post`                            |
| Shell → page         | `webContents.executeJavaScript`   | `webview.eval` — same script, same globals                 |
| Serving the site     | streamed from disk                | read whole (the sync handler returns a body, not a stream) |
| F11 / Alt+Enter      | `before-input-event`              | a capture-phase listener the init script installs          |
| The capability stamp | the packaged `package.json`       | `option_env!`, so an installed copy has nothing to edit    |
| A monitor's area     | `workArea` (excludes the taskbar) | the whole monitor — no webview library exposes a work area |
| No monitors at all   | drops the remembered position     | keeps it: "could not enumerate" is not "nowhere"           |

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

Arguments reach the game: `npm run tauri -- --multiplayer` (which, at phase 1,
turns on a capability whose bridge is not answered yet — the log says so).

That entry point is `scripts/run-tauri.mjs` rather than a shell one-liner for
one reason worth keeping: **an npm script may not set an environment variable
with `VAR=value` shell syntax.** npm runs scripts through the platform's shell,
and `cmd.exe` has no such syntax — the script fails before npm is reached, so
the game cannot be started from the repo on Windows at all.
`tests/content/npm_scripts_portable_test.ts` keeps every manifest honest.

### Checking it

```sh
make tauri-test    # the decision layer — needs no GUI libraries
make tauri-lint    # clippy at zero warnings
make tauri-fmt     # rustfmt in place
```

**None of these are on the root suite's path**, exactly as `electron/`'s are
not: `make test` and `make lint` stop at this tree's edge, because it has its
own toolchain. Run them when you touch this tree.

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

| Variable        | Effect                                                                    |
| --------------- | ------------------------------------------------------------------------- |
| `GIS_GAME_URL`  | Load a remote URL instead of the bundled site (e.g. the `/preview/` slot) |
| `GIS_WEBROOT`   | Serve the site from somewhere else without rebuilding                     |
| `GIS_VERBOSE=1` | Keep the informational log in a release build                             |

The five `GIS_ENABLE_*` switches and `GIS_STAMP_CAPABILITIES` are read at
COMPILE time (`src-tauri/src/stamp.rs`), not at launch — they are the same names
the Makefile already sets for the Electron packaging targets, so one vocabulary
drives both shells. Packaging that uses them is phase 2.

## Building for a store

Not yet — that is **phase 2**. `tauri.conf.json` carries the bundle targets
already, but nothing signs, stamps or uploads anything, and a build made from
this tree is a developer's tool rather than a copy of the game. It says so on
every launch, and it says so in its title bar.
