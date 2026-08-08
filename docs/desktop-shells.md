<!-- SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 -->

# The two desktop builds, and how the choice between them gets made

The game ships to desktop as a **wrapper around the built website** — the same
`pwa/` bundle, byte for byte, in a native window that adds the things a browser
tab cannot have: Steam Cloud, achievements, screenshots, the Workshop, a session
server in a process of its own, and voice.

There are **two such wrappers in the tree**, and both are complete:

| Tree                                 | The window it opens                                                               |
| ------------------------------------ | --------------------------------------------------------------------------------- |
| [`electron/`](../electron/README.md) | A bundled Chromium. One engine on all three desktops, and ~180 MB of it per copy  |
| [`tauri/`](../tauri/README.md)       | The platform's own webview. Roughly a tenth of the download, and less idle memory |

**`electron/` is the shipping desktop build today.** The other is not a
prototype — it plays the whole game, carries every platform seam, packages
itself and attaches its downloads to every release — but which one a player gets
is a decision that turns on numbers, and this document is where those numbers,
the tools that produce them, and the decision they feed are kept.

This is an ENGINEERING document. Neither the game nor its store pages have any
notion of "which wrapper"; the page is told it is on Steam and that is all it
knows.

---

## What is genuinely different, and what is not

Everything below is a difference in the PLATFORM rather than in the judgement.
Each row is the same decision reached through a different API, except the two
marked, which are decisions that came out differently because the platform
allowed different things.

| Thing                  | Chromium build                     | Platform-webview build                                     |
| ---------------------- | ---------------------------------- | ---------------------------------------------------------- |
| The origin             | `game://app`                       | `game://localhost`, or `http://game.localhost` on Windows  |
| The page's globals     | a sandboxed preload                | an initialization script                                   |
| Page → shell           | `ipcRenderer.send`                 | one Tauri command, `shell_post`                            |
| Shell → page           | `webContents.executeJavaScript`    | `webview.eval` — same script, same globals                 |
| The capability stamp   | the packaged `package.json`        | `option_env!`, so an installed copy has nothing to edit    |
| A monitor's area       | `workArea` (excludes the taskbar)  | the whole monitor — no webview library exposes a work area |
| The Steam binding      | `steamworks.js` (prebuilt N-API)   | the `steamworks` crate, compiled in — and richer           |
| **Valve's overlay**    | injected via two Chromium switches | **a decoy swap chain of its own** — Windows; see below     |
| **A Steam screenshot** | filed by the overlay, off F12      | **filed by the game**, `AddScreenshotToLibrary`            |
| The session server     | `utilityProcess.fork`              | a child process on a bundled Node runtime                  |
| Its control channel    | the Node IPC channel               | the child's stdio, newline-delimited JSON                  |
| Snapshots (20 Hz)      | a transferred `MessagePort`        | a loopback WebSocket the PAGE opens — no shell in the path |
| The mod compiler       | `import()`ed into the main process | spawned, and what crosses is JSON                          |
| The microphone gate    | one permission handler             | WebKitGTK's own, plus a page-side lockout everywhere       |

### The overlay, which is the one a player would notice

`electronEnableSteamOverlay()` is not a request to draw anything: it appends
`in-process-gpu` and `disable-direct-composition`, which leave a swap chain in
the process Steam has hooked. **A platform webview has no such command line** —
WebView2's GPU work happens in a browser process the shell does not start — so
for a long time this row was the one honest "Electron wins" in the table.

It is not any more. The webview build reaches the same place from the other end:
it opens a transparent, click-through window over the game and presents **empty
frames** into it at vsync through a real in-process swap chain, so the injected
hook has something to find and composites the overlay into frames the shell was
already presenting. Shift+Tab opens it, the achievements board opens with it,
and everywhere the overlay does not draw the sheet is transparent and the game
shows through. `tauri/README.md` has the full mechanism and its caveats; the
decision of whether to raise the surface at all is `shell/src/steam.rs`'s
`overlay_plan`, and the wiring is `src-tauri/src/overlay.rs`.

Two differences remain, and both are narrower than the row used to be:

- **Windows only.** WKWebView and WebKitGTK composite through the system
  compositor and have no decoy yet. The overlay IS injected into native games on
  both, so the technique is portable in principle — a Metal or a Vulkan sheet is
  simply a piece of work nobody has done.
- **The screenshot row stands.** Steam's key photographs the swap chain it
  hooked, and the decoy's frames are empty by construction, so the game goes on
  filing its own copy. That is why `screenshots-provider` exists on the webview
  build and not on the Chromium one.

The chord itself is forwarded rather than caught: Shift+Tab belongs to the
webview's process, so the shell listens for it in the page and asks Steam to
raise the overlay — the same shape the F11 handler already had.

### The roster, which is the one that is not optional

**`localStorage` belongs to the WEBVIEW.** Chromium's store is not WebKit's and
not WebView2's, so a player who switches from one desktop build to the other
cannot have their heroes carried across on disk, no matter what either shell
does with its own folders. **The platform cloud is the only bridge**, which
makes "cloud save works, both ways, with a real roster" a hard precondition of
ever shipping such a switch.

That is also why the two keep **separate user-data folders and separate bundle
identifiers** while both exist (`adastrail` and `adastrail-tauri`): they were
never going to share state, and pretending otherwise would only mean two running
games fighting over one file.

---

## The tools that produce the numbers

```sh
npm run parity          # rewrite docs/desktop-parity.md from the two trees
npm run parity:check    # …and fail on drift. What CI runs
npm run shell:bench     # install size, and this machine's own cold starts
npm run webview:sweep   # the game's web-platform needs, engine by engine
```

Plus one command per build, which is the roster precondition reduced to
something a person will actually run:

```sh
# on the build the roster is currently on
adastrail --roster-check --out ~/roster-a.json
# on the other one, signed into the same Steam account
adastrail --roster-check --against ~/roster-a.json
```

The second prints `SAME roster` and exits 0, or says which of the two things
went wrong. It refuses to clear a check where both reports came from the same
build, and it distinguishes a cloud that could not be READ from one that is
EMPTY — collapsing those is how a sync bug gets signed off on a laptop with
Steam closed. `--roster-restore <file> --overwrite` is the write half, and it
will not run over a different roster without being told to in as many words.

Everything the tools write lands in `measurements/`, which is gitignored: every
number in there is a fact about one computer, so it is quoted into this document
by a person rather than committed.

### What none of them can settle

- **Installing a real bundle and pressing the icon.** CI builds installers on
  every dispatch; nothing in a workflow can install one and look at the game.
- **A four-player session at the reference frame budget.** The argument that the
  snapshot channel costs nothing is structural — no shell in the path, no header
  change — and "it holds at 20 Hz with 200 mobs and four players" is a claim only
  a played session settles.
- **A Workshop publish and a subscription**, end to end, from two accounts.
- **The microphone gate on WKWebView and WebView2**, where the refusal is the
  page-side lockout rather than the platform's.
- **The real webviews at their shipped versions.** `npm run webview:sweep` runs
  the probe under Playwright's WebKit, which is a real WebKit and not the one
  macOS has; WebView2 it cannot run at all. Point a real build at the probe page
  for those: `GIS_WEBROOT=scripts/webview-probe npm run tauri`.
- **Battery on a handheld**, which is the one number a desktop cannot stand in
  for and the one a smaller idle footprint is supposed to buy.

[`docs/desktop-parity.md`](desktop-parity.md) is the full matrix, five sixths of
it derived from the trees and the last sixth this list.

---

## The decision

**Undecided.** It turns on measurements nobody has taken on real hardware yet,
and it is genuinely three-way. The thresholds below are written down BEFORE the
numbers so that the numbers decide rather than the enthusiasm.

### What would have to be true

| Must hold                                                       | Measured by                                   |
| --------------------------------------------------------------- | --------------------------------------------- |
| No REQUIRED web-platform feature missing on any shipped webview | `npm run webview:sweep`, plus a real build    |
| A roster crosses in both directions, verified                   | `--roster-check --against`, on both builds    |
| A four-player session holds the frame budget                    | played, on real machines                      |
| Every platform seam answers on all three desktops               | `docs/desktop-parity.md`'s last section       |
| Install size at most half the Chromium build's                  | `npm run shell:bench --size`                  |
| Cold start no worse than the Chromium build's                   | `npm run shell:bench --startup`, median of ≥5 |

The install-size bar is half rather than a tenth on purpose: the platform-webview
build carries a Node runtime for the session server and the mod compiler (~50 MB),
because there is one compiler and one server and neither may be rewritten. A
build stamped with neither multiplayer nor mods carries none of it.

### The three outcomes

1. **One wrapper ships, and it is the platform-webview one.** The other is
   retired: `RELEASING.md`, the depot upload, the CI workflows,
   `docs/architecture.md` and every pointer move over, and `electron/` is
   deleted in its own commit so the history stays readable.
2. **Both ship.** The Chromium build stays the Steam depot; the other becomes
   the plain download, where install size matters most and Steam matters least.
3. **One wrapper ships, and it is the Chromium one.** The other is parked, with
   the reason written down so nobody re-derives it in a year.

### The `-tauri` suffix is decided WITH the outcome, not after it

Both wrappers package the same product at the same version for the same
platforms, so `release.yml` renames one job's output
`adastrail-<version>-tauri-<os>-<arch>.<ext>`. Without that the two jobs would
race to upload files with colliding names — and it is also what makes the
comparison real rather than a thought experiment, since both builds are then
downloadable from the same release page by anybody who wants to weigh them.

| Outcome   | What happens to the suffix                                                                                      |
| --------- | --------------------------------------------------------------------------------------------------------------- |
| Outcome 1 | It goes. That job becomes `desktop`, the other is deleted, and the download keeps the name players already have |
| Outcome 2 | It STAYS, and earns its keep: two downloads on one release page have to be tellable apart at a glance           |
| Outcome 3 | Both the job and the suffix go, with the reason written down                                                    |

Under outcome 1 the user-data folder moves too: `adastrail-tauri` becomes
`adastrail`, and the old name joins `LEGACY_DIR_NAMES` in
`tauri/shell/src/user_data.rs` — machinery that already exists for exactly this
and is already tested against it.

### And one tidy-up that only makes sense once a wrapper is retired

The engine's Node ship target writes into `electron/server-dist/`, which **both**
wrappers consume (`tauri/shell/src/runtime.rs`). That is history rather than
ownership — the directory predates the second tree — and renaming it while both
exist would be churn in the shipping one for a reader's benefit. The moment one
goes, it moves beside `server/`.
