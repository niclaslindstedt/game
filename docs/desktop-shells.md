<!-- SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 -->

# The desktop build, and how it was chosen

The game ships to desktop as a **wrapper around the built website** — the same
`pwa/` bundle, byte for byte, in a native window that adds the things a browser
tab cannot have: Steam Cloud, achievements, screenshots, the Workshop, a session
server in a process of its own, and voice.

That wrapper is [`tauri/`](../tauri/README.md): the platform's own webview
(WebView2, WKWebView, WebKitGTK) rather than a bundled browser engine, which is
roughly a tenth of the download and less idle memory.

This is an ENGINEERING document. Neither the game nor its store pages have any
notion of "which wrapper"; the page is told it is on Steam and that is all it
knows.

---

## The decision

**One wrapper ships, and it is the platform-webview one.** For a while the tree
carried two complete desktop wrappers — a Chromium build in `electron/` and this
one — with the choice between them left to measurements. That choice is made:
`electron/` is retired, and every pointer moved over with it:

- **The release** packages `tauri/` on one runner per platform and attaches its
  installers (`.github/workflows/release.yml`, the `desktop` job). The `-tauri`
  suffix the second wrapper's downloads carried to stay tellable apart is gone.
- **Steam** — the store side is [`tauri/STEAM.md`](../tauri/STEAM.md), the
  build and upload [`tauri/RELEASING.md`](../tauri/RELEASING.md), the page's
  assets `tauri/store/`.
- **The user-data folder** is `adastrail`; the name the Tauri build used while
  there were two, `adastrail-tauri`, is in `LEGACY_DIR_NAMES`
  (`tauri/shell/src/user_data.rs`), so an install that ran under it is adopted
  rather than orphaned.
- **The engine's Node ship targets** — the session server and the Lua VM the
  mod compiler validates with — build to `server-dist/` and `modtools-lua/` at
  the repo root, beside `server/`, rather than inside a shell's tree.
- **The package identity** comes from `APP_BUNDLE_ID` (and optionally
  `APP_DISPLAY_NAME`) at packaging time (`tauri/scripts/package.mjs`), like the
  phone build's.

Three things written by the retired build are deliberately still honoured: the
Windows firewall rule's name, the lobby metadata keys a session advertises, and
`"electron"` as a `shell` value in a `startup.jsonl` or a roster report. A
player who ran that build keeps one firewall rule and still sees the same games.

---

## What a webview shell does differently

| Thing                  | Here                                                       |
| ---------------------- | ---------------------------------------------------------- |
| The origin             | `game://localhost`, or `http://game.localhost` on Windows  |
| The page's globals     | an initialization script                                   |
| Page → shell           | one Tauri command, `shell_post`                            |
| Shell → page           | `webview.eval` — the page's own `window.__gis*Event(...)`  |
| The capability stamp   | `option_env!`, so an installed copy has nothing to edit    |
| A monitor's area       | the whole monitor — no webview library exposes a work area |
| The Steam binding      | the `steamworks` crate, compiled in                        |
| **Valve's overlay**    | **a decoy swap chain of its own** — Windows; see below     |
| **A Steam screenshot** | **filed by the game**, `add_screenshot_to_library`         |
| The session server     | a child process on a bundled Node runtime                  |
| Its control channel    | the child's stdio, newline-delimited JSON                  |
| Snapshots (20 Hz)      | a loopback WebSocket the PAGE opens — no shell in the path |
| The mod compiler       | spawned, and what crosses is JSON                          |
| The microphone gate    | WebKitGTK's own, plus a page-side lockout everywhere       |

### The overlay, which is the one a player would notice

**A platform webview has no command line** through which to move its GPU work
into a process Steam has hooked — WebView2's GPU work happens in a browser
process the shell does not start — so the shell reaches the overlay from the
other end: it opens a transparent, click-through window over the game and
presents **empty frames** into it at vsync through a real in-process swap chain,
so the injected hook has something to find and composites the overlay into
frames the shell was already presenting. Shift+Tab opens it, the achievements
board opens with it, and everywhere the overlay does not draw the sheet is
transparent and the game shows through. `tauri/README.md` has the full mechanism
and its caveats; the decision of whether to raise the surface at all is
`shell/src/steam.rs`'s `overlay_plan`, and the wiring is
`src-tauri/src/overlay.rs`.

Two limits remain:

- **Windows only.** WKWebView and WebKitGTK composite through the system
  compositor and have no decoy yet. The overlay IS injected into native games on
  both, so the technique is portable in principle — a Metal or a Vulkan sheet is
  simply a piece of work nobody has done.
- **Screenshots are the game's to file.** Steam's key photographs the swap chain
  it hooked, and the decoy's frames are empty by construction, so the game files
  its own copy into the Steam library.

The chord itself is forwarded rather than caught: Shift+Tab belongs to the
webview's process, so the shell listens for it in the page and asks Steam to
raise the overlay — the same shape the F11 handler has.

### The roster, which is the one that is not optional

**`localStorage` belongs to the WEBVIEW.** Chromium's store is not WebKit's and
not WebView2's, so a player moving from the retired Chromium build cannot have
their heroes carried across on disk, no matter what either shell does with its
own folders. **The platform cloud is the only bridge.**

`--roster-check` is the tool that was built to prove that bridge before the
switch. It reads the cloud from the command line and says exactly what is in it;
`--against <report>` compares this build's read with a report written by the
OTHER build and refuses to compare two reports from the same one, so today it
answers only against a report the retired build wrote. `--roster-restore <file>
--overwrite` is the write half, and it will not run over a different roster
without being told to in as many words.

---

## The tools that produce the numbers

```sh
npm run shell:bench     # install size, and this machine's own cold starts
npm run webview:sweep   # the game's web-platform needs, engine by engine
```

Everything the tools write lands in `measurements/`, which is gitignored: every
number in there is a fact about one computer, so it is quoted into this document
by a person rather than committed.

### What none of them can settle

- **Installing a real bundle and pressing the icon** — the packaged resource
  branch, the macOS dylib in `Contents/Frameworks`, and the nested signature on
  the bundled Node runtime. CI builds installers on every dispatch; nothing in a
  workflow can install one and look at the game.
- **A four-player session at the reference frame budget.** The argument that the
  snapshot channel costs nothing is structural — no shell in the path, no header
  change — and "it holds at 20 Hz with 200 mobs and four players" is a claim only
  a played session settles.
- **A Workshop publish and a subscription**, end to end, from two accounts: a mod
  compiled by a spawned child, uploaded, subscribed to from another account, and
  loaded into a run.
- **Shift+Tab over a Steam-launched build on Windows** — that Steam's hook finds
  the decoy's swap chain, that the sheet is transparent everywhere the overlay
  does not draw, and that closing it gives the keyboard back to the game.
- **The microphone gate on WKWebView and WebView2**, where the refusal is the
  page-side lockout rather than the platform's.
- **The real webviews at their shipped versions.** `npm run webview:sweep` runs
  the probe under Playwright's WebKit, which is a real WebKit and not the one
  macOS has; WebView2 it cannot run at all. Point a real build at the probe page
  for those: `GIS_WEBROOT=scripts/webview-probe npm run tauri`.
- **Battery on a handheld**, which is the one number a desktop cannot stand in
  for and the one a smaller idle footprint is supposed to buy.
