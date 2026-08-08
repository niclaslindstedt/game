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

Phase 2 settled the bottom two, and neither landed where the row above
predicted: the Rust binding turned out **richer** than `steamworks.js` (it binds
screenshots and leaderboards, which the Node one does not), and the overlay
turned out **impossible** rather than merely different. Both are worked through
in that phase's own section below.

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

## Phase 2 — the platform seams: Steam, and a package ✅

**Shipped.** The point at which the tauri build becomes something a player could
be handed — four of the six bridge protocols answered for real, and a package
that comes out of the tree rather than out of somebody's `cargo build`.

- **`steamworks` (the Rust crate) behind the same three-file shape** the other
  shells use — bridge → provider → platform. The bridge and the provider are
  DECISIONS and live in `shell/` with their whole protocol tested against a fake;
  only the third file talks to Steam. Cloud save, achievements, leaderboards and
  screenshots all have all three.
- **The handshake**, owned by exactly one module (`src-tauri/src/steam.rs`) so
  the four features share one `Client`, with `restart_app_if_necessary` before
  the event loop and a callback pump on its own thread.
- **`libsteam_api` beside the executable**, placed by `build.rs` with an rpath
  that says to look there — the difference between a build that links and a
  build that runs.
- **Packaging.** `scripts/package.mjs`, the peer of
  `electron-builder.config.cjs`: it refuses an unstamped build and refuses a
  Spacewar app id, builds the site with the developer tooling stripped, and
  produces a **depot directory** (or, on the `standalone` profile, the
  platform's own installers and archives). macOS is never signed with nothing —
  ad hoc by default, a Developer ID when one is given — with its own
  entitlements and the microphone usage string.
- `make desktop-tauri-steam` / `make desktop-tauri-dist`, alongside the existing
  targets rather than instead of them, reading the SAME five `GIS_ENABLE_*`
  switches. `build.rs` declares them as build inputs, which `option_env!` cannot
  do for itself — without that, a `dist` build made straight after a `steam` one
  would ship the depot build's capabilities.

### The three findings, and two of them inverted

The phase's own point was to find out what the platform actually allows. It
disagreed with the prediction twice:

| Seam             | Electron's answer                       | Here                                                                    |
| ---------------- | --------------------------------------- | ----------------------------------------------------------------------- |
| **Overlay**      | injected, via two Chromium switches     | **impossible**, on all three desktops — as predicted, and it is worse   |
| **Screenshots**  | no provider; Valve's overlay files them | **a provider**, because there is no overlay to file them                |
| **Leaderboards** | no provider; the binding cannot         | still no provider — but the binding CAN, so the reason changed entirely |

- **The overlay cannot be injected, and the reason is structural.**
  `electronEnableSteamOverlay()` is not a request to draw anything: it appends
  `in-process-gpu` and `disable-direct-composition`, which leave a swap chain in
  the process Steam has hooked. A platform webview has no such command line —
  WebView2's GPU work happens in a browser process this shell does not start,
  and WKWebView and WebKitGTK composite through the system compositor. The
  verdict is stated per webview in `shell/src/steam.rs` and said out loud in
  every launch log, and the runtime probe (`overlay_loaded`) is what the two
  features that would use one ask before claiming to have opened anything.
- **So screenshots grew a provider that Electron deliberately does not have.**
  Electron's argument for not calling `AddScreenshotToLibrary` is that the
  overlay already files a copy off the same key. That argument does not survive
  here — with no overlay, a picture the player took would never reach their
  Steam library at all — and the Rust binding, unlike `steamworks.js`, binds
  ISteamScreenshots. Two shells, opposite conclusions, one principle: the
  picture ends up where the player expects it.
- **Leaderboards stay absent, for one reason instead of two.** The Rust binding
  carries the whole leaderboard surface, so the API gap Electron records is
  simply not a fact about this shell. What stands is the other half: Steam has
  no leaderboard page in its overlay, the game deliberately ships no board of
  its own, and this shell has no overlay either — so a provider could publish
  scores into a board no player could ever look at. `shell/src/leaderboards_provider.rs`
  now says what it would take: a board screen in `pwa/`, then four members.

**Exit test:** a packaged build that plays the whole campaign offline, syncs a
roster through Steam Cloud, and unlocks an achievement. **Still needs a human
with a Steam client** — every decision above is covered by
`cargo test -p adastrail-shell`, and nothing in a test suite can prove a
handshake with a program that has to be running.

**What it did NOT close** is four things, and they are the first four bullets of
phase 3 rather than a list of their own: this tree is still absent from CI, the
callback pump's interval is a phase-2 answer phase 3 invalidates, no real bundle
has ever been installed, and voice's macOS entitlement shipped ahead of the gate
that makes it mean anything.

## Phase 3 — multiplayer, mods, and the hard pipe ← next

Everything that needs a second process, the one design problem this migration
actually has, **and the four things phase 2 left behind** — which are listed
first because two of them are traps phase 3 walks straight into.

### The phase-2 leftovers, which phase 3 closes

- **PUT THIS TREE IN CI — `tauri-build.yml`, the peer of `desktop-build.yml`.**
  No workflow mentions `tauri/` today, so `make tauri-test` (103 tests) and
  `make tauri-lint` (clippy at zero warnings) run only when a human remembers.
  Phase 1 could survive that because it was a window; phase 2 made it ~1,000
  lines of decision logic with real failure paths, and phase 3 doubles it. Copy
  the Electron workflow's shape rather than inventing one — it is already split
  by exactly the cost boundary this tree has:

  | Job       | Cost                | What it is here                                                                                                                                                                                              |
  | --------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
  | `check`   | cheap, automatic    | `cargo test -p adastrail-shell` on ubuntu. **No GUI libraries, no Steam SDK** — the entire point of the crate split, and the reason this half lands first                                                    |
  | `lint`    | medium, automatic   | `cargo clippy --workspace --all-targets -- -D warnings`, which DOES need the webview development libraries (`libwebkit2gtk-4.1-dev`, `libgtk-3-dev`) — so it is an apt step and a `Swatinem/rust-cache` away |
  | `package` | expensive, dispatch | Real Windows/macOS runners producing bundles. Dispatch-only for the same reason the Electron and EAS ones are: it runs when a human is shipping                                                              |

  Path-filter it on `tauri/**`, `pwa/src/app/**`, `scripts/**` and the workflow
  itself — the same set the Electron workflow filters on, and for the same
  reason: this shell answers those protocols, so a change to the web half can
  break it without touching `tauri/` at all.

- **SHIP THE BINARIES BESIDE ELECTRON'S, SUFFIXED `-tauri`.** `release.yml`'s
  `desktop` job attaches four archives to every GitHub Release; phase 3 adds a
  `desktop-tauri` job beside it, reading the identical `GIS_ENABLE_*` inputs and
  the identical macOS signing secrets, and uploading onto the same Release.
  **The suffix is the whole mechanism and it is not cosmetic:** both shells
  package the same product at the same version for the same platforms, so
  without it the two jobs race to upload files with colliding names and the
  Release ends up with whichever finished last. The `standalone` profile of
  `package.mjs` therefore names its output
  `adastrail-<version>-tauri-<os>-<arch>.<ext>`, against Electron's
  `adastrail-<version>-<os>-<arch>.<ext>`.

  That is also what makes phase 4 a real comparison rather than a thought
  experiment: **the two builds are downloadable from the same release page**, so
  the install-size and cold-start numbers the decision turns on are measured by
  anybody who wants to, on their own machine, from artifacts nobody staged. The
  suffix stays for exactly as long as both shells exist — retiring it is one of
  the things phase 4's decision buys.

- **RE-DECIDE THE CALLBACK PUMP BEFORE THE NET BRIDGE, NOT AFTER.**
  `src-tauri/src/steam.rs` drains Steam's callback queue every 200 ms and argues
  in its own header why that is fine — nothing phase 2 calls blocks on a
  callback. **Phase 3's networking does.** Steam P2P is POLLED (the shape
  `electron/src/net-steam-p2p.ts` is built around) and matchmaking arrives as
  call-results delivered THROUGH `run_callbacks`, so at 200 ms a lobby round
  trip costs a fifth of a second and packet delivery is capped at 5 Hz. Inherit
  that number and the session presents as a broken network for a reason living
  in a constant nobody is looking at. `PUMP_INTERVAL` is the net bridge's to
  own, and the pump may need to become two (a slow one for stats, a fast one
  for the socket).
- **INSTALL A REAL BUNDLE AND SEE THE GAME.** Phase 2 built and inspected the
  depot end to end on Linux — executable, `webroot/`, `libsteam_api.so`, the
  rpath resolving out of the depot's own directory — but that path is
  `--no-bundle` plus a copy. No `deb`, `appimage`, `dmg` or `nsis` has ever been
  produced, so three things have never run: `bundle.resources`'
  `{"../webroot": "webroot"}` mapping, `bundle.macOS.frameworks` putting Valve's
  dylib into `Contents/Frameworks`, and `protocol::webroot_dir`'s PACKAGED
  branch (every run so far took the checkout branch or `GIS_WEBROOT`). Each is a
  single point of failure for an installed copy — a wrong resource path is a
  blank window, a missing dylib is Steam silently unavailable — and one install
  per platform checks all three at once. Phase 3 wants installable builds for
  its own exit test anyway, so this is the phase that pays for it.
- **VOICE'S macOS HALF IS IN THE TREE AND ITS GATE IS NOT.** The
  hardened-runtime entitlement and `NSMicrophoneUsageDescription` shipped in
  phase 2 deliberately — a build missing the usage string is KILLED by TCC
  rather than refused, so the key belongs in every macOS build whether or not
  that build carries voice. What is absent is the thing that REFUSES the
  microphone on a build without the capability, which is the webview's own
  permission handler and is listed as phase-3 work below. Until it lands the
  entitlement is a promise nothing keeps; do not read its presence as the gate
  being done.

### The new work

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
client, with a Workshop mod loaded and voice on, at parity frame times — played
from **installed builds** rather than from `cargo run`, which is what closes the
packaging leftover above in the same act.

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
- **The `-tauri` suffix is decided WITH the decision, not after it**, because it
  is the one artifact-shaped thing that outlives the choice:

  | Outcome     | What happens to the suffix                                                                                                                                                       |
  | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Tauri ships | It goes. The `desktop-tauri` job becomes `desktop`, the Electron one is deleted, and the download keeps the name players already have — a rename would break every existing link |
  | Both ship   | It STAYS, and earns its keep: two downloads on one release page have to be tellable apart at a glance                                                                            |
  | Parked      | Both the job and the suffix go, with the reason written down                                                                                                                     |

  In outcome 1 the user-data folder moves too: `adastrail-tauri` becomes
  `adastrail` and the old name joins `LEGACY_DIR_NAMES` in
  `shell/src/user_data.rs`, which is the machinery that already exists for
  exactly this and is already tested against it.

- Whatever is decided, the release plumbing for it: `tauri/RELEASING.md`,
  `steam:upload` pointed at the tauri output, and the two build workflows
  collapsed to whichever shells survive.

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
