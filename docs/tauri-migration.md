<!-- SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 -->

# The Tauri shell — what it is, and the four phases that finish it

A **second desktop wrapper** around the same built website, living in
[`tauri/`](../tauri/) beside [`electron/`](../electron/README.md) rather than
replacing it. Both wrap the identical `pwa/` build, both answer the identical
bridge protocols, and both are meant to be playable at the same time — so the
two can be run back to back on the same machine and judged against each other.

**Nothing is decided yet.** Tauri _may_ take over as the release package once it
is mature; that call is made after playtesting, at the end of phase 4, and
phase 4 is written so that "keep Electron" is a real outcome rather than a
formality. Until then `electron/` is the shipping shell and the one every
release document points at.

## Why a second shell at all

The Electron shell is ~180 MB of Chromium per install and carries a full second
copy of the browser the player already has. Tauri uses the platform's own
webview (WebView2 on Windows, WKWebView on macOS, WebKitGTK on Linux), which
takes the download to roughly a tenth of that and the idle memory with it. For a
game whose entire content is a website that already runs in a browser, that is
the whole trade — and the reason it is a trade rather than a free win is on the
other side of the ledger:

| What we give up                                    | Where it bites                                                            |
| -------------------------------------------------- | ------------------------------------------------------------------------- |
| **One engine everywhere**                          | Three webviews, three sets of quirks; a Safari bug is now a platform bug  |
| **`utilityProcess.fork` + `MessagePort` transfer** | The session server and its 20 Hz snapshot channel need a new pipe         |
| **A Node main process**                            | The mod compiler is Node; the shell that runs it is Rust                  |
| **`steamworks.js`**                                | Replaced by the `steamworks` Rust crate — a different binding, same SDK   |
| **`electronEnableSteamOverlay`**                   | The overlay hooks a Chromium swap chain; a WKWebView/WebView2 has its own |

Each of those is a phase-2 or phase-3 problem with a known shape, and each is
named at its own seam in the code rather than left to be discovered.

## The one architectural difference, and why it is the right one

The Electron shell's main process is TypeScript, so its pure logic (path
containment, geometry validation, argument parsing) sits in the same modules as
the Electron calls and is tested by keeping those modules import-free
(`window-state.ts` takes the displays as an argument precisely so it needs no
Electron). The Tauri shell is Rust, and Rust lets that be structural instead of
disciplined — so the tree is **two crates**:

| Crate              | Depends on Tauri | What is in it                                                                  |
| ------------------ | ---------------- | ------------------------------------------------------------------------------ |
| `tauri/shell/`     | **no**           | Every decision: webroot resolution, window state, capabilities, user data, log |
| `tauri/src-tauri/` | yes              | Every effect: the window, the scheme handler, the IPC routing, the lifecycle   |

The split is not a testing trick, though it buys the testing: `cargo test -p
adastrail-shell` runs the whole decision layer on any machine with a Rust
toolchain and **no GUI libraries at all**, which is what makes the logic
coverable in CI on a runner that has never seen WebKitGTK. It is also how the
two shells stay honest with each other — the Rust module and its TypeScript peer
answer the same questions with the same names, so a change to one is a visible
gap in the other.

Both crates keep the repo's rule that **tests live in their own files** — Rust
integration tests under `<crate>/tests/*_test.rs`, never a `#[cfg(test)]` block
(OSS_SPEC §20.1/§20.3), which is the second reason the decision layer is a
library crate: an integration test can only reach a crate's public API.

---

## Phase 1 — the shell that runs the game ✅

**Shipped.** A window that shows the bundled site, on all three desktops, with
the page's whole view of the shell in place and every remaining bridge routed to
a seam that says out loud which phase fills it in.

- `tauri/` tree: the Cargo workspace, the two crates, `tauri.conf.json`, the
  Node-side `bundle-web.mjs` (a peer of Electron's, writing `tauri/webroot/`),
  the npm scripts, `README.md`.
- **The private scheme.** `game://` registered as a URI-scheme protocol and
  served from `webroot/`, with the same explicit Content-Type map and the same
  containment check the Electron shell does — for the same reason: the player's
  roster lives in `localStorage`, which is keyed by origin.
- **The page's globals**, in an initialization script (the peer of the preload):
  `__GIS_NATIVE__`, `__GIS_PLATFORM__ = "steam"`, `__GIS_CAPS__`,
  `__gisShell.post`, and `__GIS_SHELL__ = "tauri"` for diagnostics.
- **The window remembers itself** — size, position, maximized, fullscreen,
  validated against the attached monitors, in the app's own user-data directory.
- **The launch log**, one per launch with the previous kept beside it.
- **Capability parsing** — the same `--multiplayer` / `--mods` / `--voice` /
  `--port` grammar, the same refusals, the same stamp semantics.
- **The QUIT bridge**, the one protocol with no platform behind it.
- Rust integration tests for every decision the shell makes.

**Deliberately absent:** Steam, cloud save, achievements, screenshots,
multiplayer, mods, voice, packaging, signing. A phase-1 build is a developer's
window onto the game, and it says so.

---

## Phase 2 — the platform seams: Steam, and a package

The point at which the tauri build becomes something a player could be handed.

- **`steamworks` (the Rust crate) behind the same three-file shape** the other
  shells use — bridge → provider → platform — so the web side never learns which
  binding answered: `cloud-save` / `achievements` / `leaderboards`, their
  providers, and the Steam implementations of the first two. Leaderboards stay
  argued-and-absent, exactly as in `electron/src/leaderboards-provider.ts`.
- **The handshake and its two pre-ready obligations**: `restart_app_if_necessary`
  before the event loop, and the overlay. The overlay is the open question of
  this phase — Valve's overlay hooks a rendering surface, and the switch
  `steamworks.js` exposes for Electron (`electronEnableSteamOverlay`) is
  Chromium-specific. Expect the honest answer to be "no overlay on some
  platforms", stated at the seam like the missing leaderboards rather than
  worked around.
- **Screenshots** — the pictures folder, the clipboard, revealing the file. The
  provider argues the Steam half exactly as Electron's does.
- **Packaging.** `tauri.conf.json` bundle targets, the capability stamp (the peer
  of `electron-builder.config.cjs` reading `GIS_ENABLE_*`), macOS signing and
  entitlements, and a **depot directory** rather than an installer.
- `make desktop-tauri-steam` / `make desktop-tauri-dist`, alongside the existing
  targets rather than instead of them.

**Exit test:** a packaged build that plays the whole campaign offline, syncs a
roster through Steam Cloud, and unlocks an achievement.

---

## Phase 3 — multiplayer, mods, and the hard pipe

Everything that needs a second process, and the one design problem this
migration actually has.

- **The session server as a sidecar.** Electron forks the compiled Node server
  with `utilityProcess.fork`; Tauri has no such thing, so the server is a
  bundled sidecar binary (or a bundled Node runtime) supervised by the shell —
  spawn, health, shutdown, and the orphan-reaping the Electron shell does in
  `before-quit`.
- **The snapshot channel — the decision this phase exists to make.** Electron
  mints a `MessagePort` pair and hands the page one end, so 20 Hz of world state
  never touches the main process. Tauri's IPC has no port transfer. The
  candidates, to be measured rather than argued: a loopback **WebSocket** from
  the page straight to the sidecar (no shell in the path, same property the
  `MessagePort` bought, at the cost of a listening socket); Tauri's own IPC with
  a binary channel (`tauri::ipc::Channel`, shell in the path); or a
  `SharedArrayBuffer` ring with the site's COOP/COEP headers set by the scheme
  handler. **Measured at the reference frame budget with a full party before one
  is picked**, because "it works" and "it works at 20 Hz with 200 mobs" are
  different claims.
- **The net bridge and its neighbours**: lobby, invite (`+connect_lobby`, the
  second-instance hand-off), firewall/UPnP, Steam P2P.
- **Mods**: the bridge, the Workshop, the archive reader, and the packaged mod
  toolchain — which is Node code the Rust shell has to invoke rather than
  import, the mirror image of Electron's `resources.ts` problem.
- **Voice** — the capability, and the media-permission gate it exists to make
  refusable. The Electron shell refuses the microphone at the session; the Tauri
  peer must refuse it in the webview's own permission handler, per platform.
- **Dedicated mode** — `--dedicated` turning the one binary into the session
  server, minus the window.

**Exit test:** a four-player session between a Tauri host and an Electron
client, with a Workshop mod loaded and voice on, at parity frame times.

---

## Phase 4 — playtest, decide, and then act on the decision

- **The parity matrix.** Every platform feature, every screen, on all three
  desktops and the Steam Deck, Tauri against Electron side by side.
- **The numbers that motivated the migration**, measured rather than assumed:
  install size, cold-start time, idle and in-fight memory, frame times at the
  reference viewport, battery on a handheld.
- **The webview-quirk sweep** — the risk that the trade table above names first.
  Every rendering, audio and input surface checked on WebKitGTK and WebView2,
  because the game has only ever been shipped on Chromium.
- **The roster problem, which is not optional whichever way the decision goes.**
  `localStorage` belongs to the WEBVIEW, and Chromium's store is not WebKit's or
  WebView2's — so a player who switches from the Electron build to the Tauri one
  cannot have their heroes carried across on disk, no matter what either shell
  does with its own folders. **Steam Cloud (phase 2) is the only bridge**, which
  makes "cloud save works, both ways, verified with a real roster" a hard
  precondition of shipping the switch rather than a phase-2 nicety. The same
  fact is why the two shells keep separate user-data folders and separate bundle
  identifiers while both exist: they were never going to share state, so
  pretending otherwise would only mean fighting over a file.
- **The decision**, taken with those numbers in hand. It is genuinely three-way:
  1. **Tauri ships.** Electron is retired: `RELEASING.md`, the depot upload, the
     CI workflows, `docs/architecture.md` and every pointer move over, and
     `electron/` is deleted in its own commit so the history stays readable.
  2. **Both ship.** Electron stays the Steam depot; Tauri becomes the plain
     download, where install size matters most and Steam matters least.
  3. **Tauri is parked.** Written down with the reason, so nobody re-derives it
     in a year.
- Whatever is decided, the release plumbing for it: `tauri/RELEASING.md`,
  `steam:upload` pointed at the tauri output, the desktop-build workflow.

---

## Rules that hold across every phase

- **The website is never forked.** Both shells wrap the same `pwa/` build,
  byte for byte. A change the tauri shell needs from the page goes into
  `pwa/src/app/shell-bridge.ts` behind the existing seam and lands on both.
- **`shellPlatform()` stays `"steam"`.** The tauri shell is the same PRODUCT on
  the same store; the page asks that question to decide whether a coin store
  exists, not to decide which binary it is inside. Which binary is
  `__GIS_SHELL__`, and only diagnostics read it.
- **A protocol is never re-designed for Tauri.** Every bridge keeps its JSON
  shape, its request ids and its `window.__gis*Event(...)` return path. If a
  protocol looks wrong from Rust, that is a note for a later PR against both
  shells, not a fork.
- **The decision layer stays Tauri-free.** New logic goes in `tauri/shell/` with
  a test; `src-tauri/` holds the calls that make it happen. A `use tauri::` in
  the `shell` crate is the review comment.
- **Every seam names its phase.** A protocol the shell cannot yet honour logs
  which phase fills it in, so a build in the middle of the migration explains
  itself instead of going quiet.
