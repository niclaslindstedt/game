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

Each of those was a phase-2 or phase-3 problem with a known shape, and each is
named at its own seam in the code rather than left to be discovered. All five
are now settled, and three of them did not land where the row predicts:

- **The Rust Steam binding turned out RICHER** than `steamworks.js` — it binds
  screenshots and the whole leaderboard surface, which the Node one does not.
- **The overlay turned out IMPOSSIBLE** rather than merely different.
- **The port transfer's replacement put the shell FURTHER out of the path than
  Electron's does**, not closer: a loopback socket the page opens itself carries
  no shell in either direction, where a `MessagePort` at least had to be minted
  by one.

The remaining two — the session server's pipe and the mod compiler being Node —
landed roughly as predicted and are worked through in phase 3's section below.

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

**What it did NOT close** was four things — CI, the callback pump's interval, a
real bundle, and voice's gate — and all four are closed by phase 3 below.

## Phase 3 — multiplayer, mods, and the hard pipe ✅

**Shipped.** Everything that needs a second process, the one design problem this
migration actually had, and the four things phase 2 left behind. The shell is
now feature-complete against the Electron one with a single exception, and that
exception is not coming: Valve's overlay cannot be injected into a platform
webview (phase 2's finding, unchanged).

### The phase-2 leftovers, closed

- **THE TREE IS IN CI — `.github/workflows/tauri-build.yml`**, the peer of
  `desktop-build.yml` and split by the same cost boundary, which this tree
  happens to have structurally rather than by discipline:

  | Job       | Cost                | What it is here                                                                                                                                                         |
  | --------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `check`   | cheap, automatic    | `cargo test -p adastrail-shell` plus `cargo fmt --check`. **No GUI libraries, no Steam SDK** — the entire point of the crate split                                      |
  | `lint`    | medium, automatic   | `cargo clippy --workspace --all-targets -- -D warnings`, which DOES need `libwebkit2gtk-4.1-dev` and `libgtk-3-dev` — so it is an apt step and a `rust-cache` away      |
  | `package` | expensive, dispatch | Real Windows/macOS/Linux runners producing the depot AND the bundles. Dispatch-only for the same reason the Electron and EAS ones are: it runs when a human is shipping |

  Path-filtered on `tauri/**`, `server/**`, `scripts/**`, `pwa/src/app/**` and
  the workflow itself — the Electron set plus `server/**`, which this shell now
  spawns.

- **THE BINARIES SHIP BESIDE ELECTRON'S, SUFFIXED `-tauri`.** `release.yml` has
  a `desktop-tauri` job beside `desktop`, reading the identical `GIS_ENABLE_*`
  inputs and the identical macOS signing secret, uploading onto the same
  Release. **The suffix is the whole mechanism and it is not cosmetic:** both
  shells package the same product at the same version for the same platforms, so
  without it the two jobs would race to upload files with colliding names.
  `package.mjs`'s `standalone` profile renames its output to
  `adastrail-<version>-tauri-<os>-<arch>.<ext>`.

  That is what makes phase 4 a real comparison rather than a thought experiment:
  **the two builds are downloadable from the same release page**, so the
  install-size and cold-start numbers the decision turns on are measured by
  anybody who wants to, from artifacts nobody staged. The job is deliberately
  NOT in `publish`'s `needs`: it is not the shipping build, so a Rust toolchain
  failing must not hold back a release whose actual downloads are ready.

- **THE CALLBACK PUMP IS TWO GEARS**, decided before the net bridge rather than
  after. `shell/src/steam_pump.rs` owns the numbers: 200 ms idle (phase 2's,
  kept for exactly the case phase 2 described) and **50 ms live**, which is the
  snapshot rate and the same number the P2P pump runs at. `src-tauri/src/steam.rs`
  asks on every tick rather than being re-armed, because a pump somebody has to
  remember to speed up is one they forget to on the path that mattered. A test
  pins `FAST_INTERVAL_MS <= PUMP_MS`, since a callback queue drained less often
  than packets arrive is a queue that grows for as long as the session lasts.

- **VOICE'S GATE IS IN THE TREE, at two depths and honestly labelled.**
  `shell/src/media.rs` is the decision — the microphone only with the `voice`
  capability, the camera never, everything else never — and it is answered:

  | Platform                 | What refuses                                                                                                                                                                             |
  | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | **WebKitGTK**            | the webview's own `permission-request`, so the page never reaches the device                                                                                                             |
  | **WKWebView / WebView2** | nothing native: the equivalents are a `WKUIDelegate` method and a COM event Tauri does not surface                                                                                       |
  | **all three**            | `navigator.mediaDevices` is REMOVED by the initialization script on a build without voice, as a non-configurable own property — so nothing in the page's dependency tree can put it back |

  The floor is shell-enforced everywhere and OS-enforced on one of three. That
  is stated at the seam rather than implied, and it is what phase 2's macOS
  entitlement is now attached to.

- **INSTALLABLE BUILDS COME OUT OF BOTH WORKFLOWS**, which is what pays for the
  packaging leftover: `tauri-build.yml`'s `package` job and `release.yml`'s
  `desktop-tauri` job both produce real `deb`/`AppImage`/`dmg`/`nsis` bundles, so
  `bundle.resources`, `bundle.macOS.frameworks` and `protocol::webroot_dir`'s
  PACKAGED branch are all exercised by CI rather than by nobody. **The one thing
  a workflow cannot do is press the icon**, so "install it and see the game" is
  still a line on phase 4's checklist — the difference is that the artifact to
  install now exists on every release page.

### The new work, and what it settled

- **THE SESSION SERVER IS A SIDECAR, AND THE CONTROL CHANNEL IS STDIO.**
  `server/main.ts` grew a THIRD entry beside the `parentPort` one and the
  terminal one: `--shell`, which is `server/shell-host.ts`. The shell spawns it
  on a bundled Node runtime and talks newline-delimited JSON over its stdin and
  stdout — the same `ControlMessage`/`ControlReply` traffic `parentPort` carries
  under Electron, needing no library on either side. **Stdin's EOF is the
  orphan reaper**: Electron kills its utility process in `before-quit`, and a
  spawned child has to reap itself.

- **THE SNAPSHOT CHANNEL IS A LOOPBACK WEBSOCKET THE PAGE OPENS, and the page
  does not know.** This was the decision the phase existed to make:

  | Candidate                  | What it costs                                                                                                 |
  | -------------------------- | ------------------------------------------------------------------------------------------------------------- |
  | `tauri::ipc::Channel`      | Every frame crosses the SHELL's event loop — the exact cost the `MessagePort` was chosen to avoid, paid twice |
  | A `SharedArrayBuffer` ring | COOP/COEP on the game's own origin, so the WEBSITE's serving changes to suit one shell                        |
  | **A loopback WebSocket**   | One listening socket on 127.0.0.1, behind a per-session token                                                 |

  The third keeps the one property that mattered — the shell is not in the path
  — and changes nothing else. **`pwa/` did not change by a line**: the page asks
  `__gisShell.onNetPort` for a `MessagePort` and gets one, because the shell's
  initialization script mints the pair IN THE PAGE and bridges its own end to
  the socket (`shell/src/snapshot.rs`). The listener binds 127.0.0.1 on an
  ephemeral port the session process itself chose, answers 426 to everything
  that is not the one upgrade path, and requires a secret that process minted
  and told only the shell.

  **What is still owed is the measurement, and it is the exit test's.** The
  argument above is structural — no shell in the path, no header change — and
  "it works at 20 Hz with 200 mobs and four players" is a claim only a played
  session settles.

- **THE NET BRIDGE AND ITS NEIGHBOURS**, each the peer of its Electron file:
  `net.rs` (the protocol), `net_lobby.rs` (Steam matchmaking, with the SAME
  metadata keys the Electron shell writes, so the two builds see each other's
  games), `net_invite.rs` (`+connect_lobby`, handed over by
  `tauri-plugin-single-instance` where Electron uses `second-instance`),
  `net_firewall.rs` (every command and every READING of its output, which is a
  half the TypeScript peer cannot test) and `steam_p2p.rs`.

- **MODS, WITH THE COMPILER AS A CHILD PROCESS** — the mirror image of
  Electron's `resources.ts` problem. There is one compiler and it is Node;
  Electron imports it, this shell spawns it through
  `tauri/scripts/mod-compile.mjs` and reads JSON back. Two things follow and
  both are improvements: the reference catalog is read ONCE per list rather than
  once per mod, and a compiler that throws takes down a child rather than a
  thread of the shell's. The zip reader is `shell/src/mod_archive.rs`, refusal
  for refusal with the TypeScript one.

- **DEDICATED MODE** — `--dedicated`, decided before Tauri's builder exists so a
  windowless server never registers a scheme or adopts a user-data directory.
  Spawned rather than imported, which is the closer match to what an operator
  expects: the thing in their process table is the server.

- **AND A NODE RUNTIME TRAVELS WITH THE PACKAGE**, which is the one place this
  shell is fatter than the promise Tauri makes. Both of the above are Node
  programs and a player has no reason to have one, so `scripts/package.mjs`
  copies the runtime it is itself packaging with — the version the server was
  compiled against, on the platform it will run on. A build stamped with neither
  multiplayer nor mods carries none of it.

**Exit test:** a four-player session between a Tauri host and an Electron
client, with a Workshop mod loaded and voice on, at parity frame times — played
from **installed builds** rather than from `cargo run`. **Still needs humans
with hardware**, exactly as phase 2's did: every decision above is covered by
`cargo test -p adastrail-shell` and `npx vitest run tests/shell_host_test.ts`,
and nothing in a test suite can prove four machines agree about a world.

---

## Phase 4 — playtest, decide, and then act on the decision ← next

- **The parity matrix.** Every platform feature, every screen, on all three
  desktops and the Steam Deck, Tauri against Electron side by side. **Four
  things phase 3 could not check without a human**, and each is one press:
  install a real bundle and see the game (the packaged resource branch, the
  macOS dylib in `Contents/Frameworks`, the Node runtime's nested signature); a
  four-player session at the reference frame budget, which is the snapshot
  channel's own measurement; a Workshop publish and a subscription; and the
  microphone gate on WKWebView and WebView2, where the refusal is the page-side
  lockout rather than the platform's.
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

- **And one tidy-up that only makes sense once a shell is retired:** the
  engine's Node ship target writes into `electron/server-dist/`, which both
  shells now consume (`shell/src/runtime.rs`). That is history rather than
  ownership — the directory predates this tree — and renaming it while both
  shells exist would be churn in the shipping one for a reader's benefit. The
  moment one shell goes, it moves beside `server/`.

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
