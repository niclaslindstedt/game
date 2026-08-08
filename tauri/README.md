<!-- SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 -->

# Ada's Trail — the desktop app

A desktop wrapper around the game for **Windows, macOS and Linux**. It is a thin
[Tauri](https://tauri.app) shell whose entire content is the built website, so
the app **looks and plays exactly like the site** — and because the site is
bundled inside it and served from a private scheme, it plays offline and is an
app rather than a viewer for a web page.

The window uses the **platform's own webview** (WebView2 on Windows, WKWebView
on macOS, WebKitGTK on Linux) rather than carrying a browser engine of its own,
which is what keeps the download and the idle memory small. Everything a browser
tab cannot give a game is added around it: Steam Cloud, achievements,
screenshots, the Workshop, a session server in a process of its own, and voice
chat.

**Valve's in-game overlay works here too, by a route Electron does not need** —
the shell hands the injected library a surface of its own to draw on, because a
webview shell has none to offer it. Windows today; see
[below](#the-overlay).

---

## Layout — TWO crates, and the split is the design

| Path                            | What it is                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------------- |
| `shell/`                        | **Every decision.** No Tauri, no GUI, no window                                       |
| `shell/tests/`                  | Its whole test suite — runs anywhere a Rust toolchain does                            |
| `src-tauri/src/main.rs`         | The process: the builder, the command routing, the lifecycle                          |
| `src-tauri/src/window.rs`       | The window, its geometry, and pinning it to our own origin                            |
| `src-tauri/src/protocol.rs`     | Answering `game://` off the bundled `webroot/`                                        |
| `src-tauri/src/page.rs`         | The initialization script — the page's whole view of the shell                        |
| `src-tauri/src/stamp.rs`        | The capability stamp, read at compile time                                            |
| `src-tauri/src/steam.rs`        | **The one owner of the Steam client**, and the callback pump                          |
| `src-tauri/src/cloud.rs`        | Steam Cloud                                                                           |
| `src-tauri/src/achievements.rs` | Steam's badge shelf                                                                   |
| `src-tauri/src/shots.rs`        | The pictures folder, the clipboard, and Steam's screenshot library                    |
| `src-tauri/src/session.rs`      | The session server, as a process                                                      |
| `src-tauri/src/net.rs`          | The multiplayer bridge's orchestration                                                |
| `src-tauri/src/lobby.rs`        | Steam matchmaking, which IS the server browser                                        |
| `src-tauri/src/p2p.rs`          | The Steam relay's pump — the only game traffic that passes through us                 |
| `src-tauri/src/firewall.rs`     | Running the firewall commands the shell crate wrote                                   |
| `src-tauri/src/mods.rs`         | The mods bridge, and spawning the ONE compiler                                        |
| `src-tauri/src/workshop.rs`     | Steam UGC                                                                             |
| `src-tauri/src/overlay.rs`      | Valve's overlay — the decoy surface, and Shift+Tab. Windows                           |
| `src-tauri/src/media.rs`        | The webview's permission handler — the microphone gate                                |
| `src-tauri/src/metrics.rs`      | The clock behind the cold-start marks                                                 |
| `src-tauri/src/roster.rs`       | `--roster-check`, as a process                                                        |
| `src-tauri/src/dedicated.rs`    | `--dedicated`, decided before Tauri's builder exists                                  |
| `src-tauri/build.rs`            | The stamp's rebuild triggers, and placing `libsteam_api` beside the app               |
| `src-tauri/capabilities/`       | **Tauri's own ACL** — what the window may reach. Not our capabilities                 |
| `scripts/bundle-web.mjs`        | Builds the site and copies it to `webroot/` (gitignored)                              |
| `scripts/icons.mjs`             | Re-encodes `pwa/public/`'s icon to the RGBA Tauri insists on, plus the Windows `.ico` |
| `scripts/package.mjs`           | Packaging — the depot, and the standalone installers                                  |
| `scripts/steam-upload.mjs`      | The depot upload, and the checks that guard it                                        |
| `scripts/mod-compile.mjs`       | The adapter the Rust shell reaches `mod/tools/build.mjs` through                      |

`cargo test -p adastrail-shell` therefore runs the entire decision layer on a
machine with **no GUI libraries installed at all**, which is what makes this
tree's logic coverable on an ordinary CI runner. That includes every platform
seam's whole protocol: a bridge takes a provider, and a test hands it one that
can be made to lose a read or refuse a write, which no real Steam client can be
asked to do on demand. It also includes the halves that are otherwise untestable
— the READING of `netsh`'s, `socketfilterfw`'s and `ufw`'s output, where that
feature's bugs actually live, is a pure function here with a sample of each
tool's real output beside it.

**The far end of the session sidecar's two pipes is tested from the ROOT suite**,
not from here: `tests/shell_host_test.ts` drives `server/shell-host.ts` over a
real loopback WebSocket with a real browser handshake, because the thing worth
proving is that the framing a browser sends is the framing the session reads.

**Two words named `capabilities` live in this tree and they are different
things.** `shell/src/capabilities.rs` is what a copy of the GAME may do
(multiplayer, mods, voice). `src-tauri/capabilities/*.json` is Tauri's
permission ACL: what the WINDOW may reach of the operating system. The second is
deny-by-default with one plugin on it, because the renderer is the whole game.

---

## How the pieces fit

**The page never learns it is inside this app.** It is told `__GIS_PLATFORM__ =
"steam"`, which is what it asks to decide whether a coin store exists — not
which binary it is inside. Everything else travels down one Tauri command
(`shell_post`) as JSON, and comes back by the shell calling the page's own
`window.__gis*Event(...)` from outside. That return path is why the website
needed no change to run here at all.

**The origin is the one thing to be careful with.** The player's whole roster
lives in `localStorage`, which is keyed by origin, so `APP_SCHEME` and `APP_HOST`
are constants that must never be tidied. WebView2 maps a registered scheme onto
`http://<scheme>.localhost`; WKWebView and WebKitGTK serve it as a real
`<scheme>://` URL. Both are one constant per platform, which is the property
that matters.

**The session server is a child process, and snapshots do not pass through the
shell.** The server is spawned on a bundled Node runtime and driven over its
stdio with newline-delimited JSON; the 20 Hz snapshot channel is a **loopback
WebSocket the page opens itself**, because the initialization script mints a
`MessagePort` pair IN THE PAGE and bridges its own end to the socket. The
listener binds 127.0.0.1 on an ephemeral port, answers 426 to anything that is
not the one upgrade path, and requires a secret the session process minted and
told only the shell.

**The mod compiler is spawned rather than linked.** There is ONE compiler and it
is Node — the same file a modder runs from a terminal — so this shell runs it as
a child and reads JSON back. Two things follow and both are improvements: the
reference catalog is read once per list rather than once per mod, and a compiler
that throws takes down a child rather than a thread of the shell's.

**A Node runtime therefore travels with the package**, which is the one place
this app is fatter than a webview shell promises. Both of the above are Node
programs and a player has no reason to have one. A build stamped with neither
multiplayer nor mods carries none of it.

### The overlay

**Valve's in-game overlay works on this shell, on Windows.** It is worth
spelling out why that took anything at all, because for years the answer
everywhere was that it could not.

The overlay is not something a game switches on: it is a library Steam injects
into the process, which hooks the graphics API the game presents its frames with
and draws over the swap chain. A game gets it for free precisely because it owns
that surface — and a webview shell does not. WebView2 does its GPU work in a
browser process this app never started, so the injected hook sits waiting for a
frame that never comes and quietly gives up. Electron's
`electronEnableSteamOverlay()` fixes that with two Chromium command line
switches; a platform webview has no command line to pass them on.

So the shell gives the hook something else to find. A transparent,
click-through, undecorated window is opened over the game's window, and a thread
presents **empty frames** into it at vsync through a real in-process swap chain.
Steam composites the overlay into those frames, and everywhere it does not draw,
the sheet is transparent and the game shows through. The decoy is only visible
while the overlay is open; the rest of the time it is hidden, and hidden means
not presenting.

The technique and every invariant that keeps it from becoming a black rectangle
over the game are
[`tauri-plugin-steam-overlay-surface`](https://github.com/PSG-Team/tauri-steam-overlay-surface)
(MIT). What this tree owns is the decision of whether to raise it —
`shell/src/steam.rs`'s `overlay_plan` — and the wiring, `src-tauri/src/overlay.rs`.

Three things follow, and each is a thing to know rather than a thing to fix:

- **Shift+Tab is forwarded from the page.** The chord belongs to the webview's
  process, which this shell does not own, so the initialization script listens
  for it and asks Steam to open the overlay — exactly as it already does for
  F11. That listener is installed only on a launch that has an overlay.
- **Steam's screenshot key still does not work**, and cannot: it photographs the
  swap chain Steam hooked, which is the decoy's, whose frames are empty by
  design. So **the game goes on filing its own Steam screenshots** through
  `AddScreenshotToLibrary`, which is why `screenshots-provider` exists on this
  shell and not on Electron's.
- **macOS and Linux have no decoy yet.** The overlay is injected into native
  games on both, so the same trick is portable in principle — but a Metal or a
  Vulkan sheet is a different piece of work, and until somebody writes it the
  launch log says so rather than implying otherwise.

The surface is raised only where all three of these hold: the platform has a
decoy, Steam is being talked to at all, and **Steam started the process** — the
one honest signal that its library is in here. A surface nobody hooks is a
window, a GPU device and a thread presenting nothing for the whole session.
`GIS_STEAM_OVERLAY=1` forces the last condition on, which is how the overlay is
tested from a checkout launched under Spacewar.

One known quirk, inherited from the technique: after alt-tabbing away and back,
the game window needs one click before Shift+Tab answers again — Windows
re-activates the native window without handing keyboard focus back to the
webview.

---

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

Arguments reach the game: `npm run tauri -- --multiplayer`.

Steam is talked to on every launch unless told not to. `GIS_STEAM=off` is how
most local work on this tree happens; without it, a machine with no Steam client
running simply reports the handshake as unavailable and the game plays
device-locally, which is the same thing it does in a browser.

Valve's redistributable needs no setup for that: `steamworks` vendors it,
`src-tauri/build.rs` copies it into the profile directory Cargo is writing to,
and the binary carries an rpath that looks beside itself. Nothing about it is
named in `tauri.conf.json` — a `bundle.macOS.frameworks` entry is resolved at
COMPILE time on macOS and would have to name one profile, which is why the
`.app`'s copy is computed by `scripts/package.mjs` instead.

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
split, and a test that would need one is a decision sitting in the wrong crate.

**Neither is on the root suite's path**: `make test` and `make lint` stop at this
tree's edge, because it has its own toolchain.
`.github/workflows/desktop-tauri.yml` runs both on every push that touches
`tauri/`, `server/`, `scripts/` or `pwa/src/app/`, so a tree somebody forgot to
check is a red PR rather than a surprise.

### The other launch modes

Three flags turn this binary into something other than a window, and each is
decided before Tauri's builder exists — so none of them registers a scheme,
takes the single-instance lock, or writes over the geometry the player's real
launches remember.

```sh
adastrail --dedicated --multiplayer --port 27849   # the session server, in this terminal
adastrail --roster-check                           # what is the platform cloud holding?
adastrail --roster-check --out roster.json         # …and write it down
adastrail --roster-restore roster.json --overwrite # put it back
```

`--dedicated` runs the same session server the game spawns, so there is no
second binary to forget to update.

`--roster-check` prints what is under the cloud save key: which provider
answered, who Steam thinks the player is, the size and a fingerprint of the
blob, and the save's own census — format, version, heroes by name, and which
device wrote it. It distinguishes a cloud that could not be READ from one that
is EMPTY, because collapsing those is how a sync bug gets signed off on a laptop
with Steam closed. `--roster-restore` is the write half and refuses to run over
a different roster unless told to in as many words.

### The launch log, when it does not start

The shell writes **every launch** to `launch.log` in its user-data directory
(`%APPDATA%\adastrail-tauri` on Windows, `~/Library/Application
Support/adastrail-tauri` on macOS, `~/.local/share/adastrail-tauri` on Linux),
keeping the previous one beside it as `launch.log.prev`. A packaged game has no
console, so that file — plus the error dialog anything fatal raises — is the
whole diagnosis. Attach it to a bug report.

Beside it, `startup.jsonl` holds one line per launch with the cold-start
breakdown: process start, the shell resolving itself, the window being created
and shown, and the page finishing its load. `npm run shell:bench` reads it back.

### Environment

| Variable            | Effect                                                                                                            |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `GIS_GAME_URL`      | Load a remote URL instead of the bundled site (e.g. the `/preview/` slot)                                         |
| `GIS_WEBROOT`       | Serve the site from somewhere else without rebuilding                                                             |
| `GIS_VERBOSE=1`     | Keep the informational log in a release build                                                                     |
| `GIS_STEAM=off`     | Don't talk to Steam at all — how most local work on this tree happens                                             |
| `GIS_STEAM_APP_ID`  | Which Steam app. Defaults to Valve's Spacewar (480), which is a test app                                          |
| `GIS_STEAM_OVERLAY` | `1`/`0` forces "was this started by Steam", which decides the overlay's decoy surface and is what the log reports |

From a checkout, MULTIPLAYER and MODS additionally need the things that are not
Rust — the session server compiled for Node (`npm run server:build` at the repo
root) and a `node` on `PATH`. The shell says which one is missing, by name, the
first time the feature is asked for; a packaged build carries both.

The five `GIS_ENABLE_*` switches and `GIS_STAMP_CAPABILITIES` are read at
COMPILE time (`src-tauri/src/stamp.rs`), not at launch, so an installed copy has
nothing to edit. `src-tauri/build.rs` declares them as build inputs, because
`option_env!` is not one: without that, a `dist` build made straight after a
`steam` build would silently reuse the depot build's capabilities.

---

## Building for a store

```sh
make desktop-tauri-steam                      # a DEPOT DIRECTORY, for Steam
make desktop-tauri-dist                       # installers/archives, for a download
make desktop-tauri-steam ARGS="--target aarch64-apple-darwin"
```

Both go through `scripts/package.mjs`, which **refuses** a build nothing stamped
(`GIS_STAMP_CAPABILITIES=1` is required) and a build still pointed at Valve's
Spacewar test app (set `GIS_STEAM_APP_ID`, or pass `--allow-placeholder` for a
test package). The site is rebuilt with the `production` profile, which strips
the developer tooling out of it.

The depot is a directory rather than an installer, because Steam distributes by
uploading a directory and its own client owns installing it. On Windows and
Linux that is the executable, `webroot/` and Valve's redistributable; on macOS
it is the whole `.app`, which keeps its resources inside itself.

**macOS is never signed with nothing.** Apple Silicon refuses to execute
unsigned arm64 code at all, and reports that to the player as "the app is
damaged" — the same wording as a corrupted download. The default is an ad-hoc
signature, which satisfies the kernel; set `APPLE_SIGNING_IDENTITY` to a
Developer ID for a release, where notarization goes on top.

The whole release procedure, including the checks that guard a depot upload, is
[`RELEASING.md`](RELEASING.md).
