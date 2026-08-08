<!-- SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 -->

# Releasing this build

Packaging the desktop app in this directory for Windows, macOS and Linux, and
uploading it to a Steam depot. The app **embeds the whole game** and serves it
from a private `game://` scheme, so it plays offline and is an app rather than a
viewer for a website — see [`README.md`](README.md).

> **Licence note.** The repo uses PolyForm Noncommercial 1.0.0 plus the Ada's
> Trail Feature Terms, which reserve player use of mods and multiplayer for an
> acquired Steam licence. As the sole copyright holder you are not bound by the
> licence you grant, so selling the game is yours to do. The public docs and
> store copy must keep that scope clear.

---

## 0. One-time prerequisites

- **A Rust toolchain** ([rustup](https://rustup.rs)) and the platform's webview
  development libraries — Tauri's own
  [prerequisites](https://tauri.app/start/prerequisites/) page is the current
  list. `README.md` has the Debian/Ubuntu set.
- **Steam Direct** — **$100 per app**, recoupable once the app earns $1,000.
  Includes identity verification and tax forms; start it first.
- **Steamworks SDK** — free, from
  [partner.steamgames.com](https://partner.steamgames.com/downloads/list).
  `steamcmd` lives in `tools/ContentBuilder/builder*/`. Put it on your `PATH`.
- **A machine per platform.** There is no cross-compiling bundler here: the
  depot is built on the platform it is for, and a macOS build needs a Mac
  because signing does.

Log steamcmd in once, interactively, so it can answer Steam Guard and cache the
session:

```sh
steamcmd +login <your-steam-username>     # answer the prompt, then `quit`
export STEAM_USER=<your-steam-username>   # what `npm run steam:upload` uses
```

Do this before anything scripted. A first non-interactive run always fails on
Steam Guard, and it fails several minutes into a build.

### The one that blocks everything else

**The 30-day store-page wait.** Valve requires an app's store page to be public
for **30 days** before it may release. Nothing about the code shortens it, and
it runs in parallel with everything else here — so put the store page up as
early as you are willing to, and treat the rest as work to finish inside that
window. Alongside it: **bank and tax details** in the partner site, without
which the app cannot be sold at all.

### The ids

The app id and the three depot ids live in **`electron/store/steam.json`** —
one file for the whole repo, because it is one app on one store. Fill them in
from the partner site (App Admin → the number in the URL is the app id; App
Admin → Depots for the rest). CI can override them with `GIS_STEAM_APP_ID` and
`GIS_STEAM_DEPOT_WINDOWS` / `_MACOS` / `_LINUX` rather than committing them.

---

## 1. Build the depot

```sh
make desktop-tauri-steam                                    # from the repo root
make desktop-tauri-steam ARGS="--target aarch64-apple-darwin"
```

That produces a **depot directory** at `tauri/release/depot`, not an installer,
because Steam distributes by uploading a directory of files and its own client
owns installing them. An installer inside a depot would ask the player to
install a game they already installed.

- On **Windows and Linux** the depot is the executable, `webroot/`, Valve's
  redistributable, and (when the build is stamped with multiplayer or mods) the
  session server, the mod toolchain and a Node runtime.
- On **macOS** it is the whole `.app`, which keeps its resources inside itself.

The packager **refuses** two things outright, and both refusals are load-bearing:

- **A build nothing stamped.** `GIS_STAMP_CAPABILITIES=1` is required, so a
  depot build always says what it may do rather than inheriting a default.
- **A build still pointed at Valve's Spacewar test app (480).** Set
  `GIS_STEAM_APP_ID`, or pass `--allow-placeholder` for a test package.

**macOS is never signed with nothing.** Apple Silicon refuses to execute
unsigned arm64 code and reports it to the player as "the app is damaged" — the
same wording as a corrupted download. The default is an ad-hoc signature, which
satisfies the kernel; set `APPLE_SIGNING_IDENTITY` to a Developer ID for a real
release, with notarization on top.

### What the five capability switches do

`make desktop-tauri-steam` turns all five on; `make desktop-tauri-dist` turns
them all off unless asked. They are read at **compile** time, so an installed
copy has nothing to edit.

| Switch                   | What it lets the build do                   |
| ------------------------ | ------------------------------------------- |
| `GIS_ENABLE_MULTIPLAYER` | host and join sessions; carries the server  |
| `GIS_ENABLE_MODS`        | load and publish mods; carries the compiler |
| `GIS_ENABLE_VOICE`       | open the microphone at all                  |
| `GIS_ENABLE_UPNP`        | ask the router to map a port                |
| `GIS_ENABLE_LICENSED`    | the store licence the feature terms reserve |

Override one at a time with the Makefile's `ENABLE_*` variables, e.g.
`make desktop-tauri-dist ENABLE_MODS=1`.

---

## 2. Check before you upload

```sh
npm run steam:upload -- --platform linux --dry-run     # from tauri/
```

It writes the VDF script steamcmd would run and checks the things that
**otherwise fail silently**:

| Check                                | What its absence does                                                         |
| ------------------------------------ | ----------------------------------------------------------------------------- |
| A real app id, and a depot id        | uploads to Valve's shared test app, or to nothing                             |
| The depot directory exists           | uploads an empty depot over a working build                                   |
| Valve's redistributable is beside it | the game ships, launches, and has no cloud saves or achievements for anybody  |
| A bundled `index.html`               | the depot installs a shell with nothing to show                               |
| No developer tooling in the site     | the hidden sun-tap reveal and the developer menu ship — invisible until found |

Every one of those produces a game that starts. That is why they are checks
rather than something you would notice.

---

## 3. Upload

```sh
npm run steam:upload -- --platform linux
npm run steam:upload -- --platform windows --branch beta
```

`--branch` is empty by default and that is deliberate: **uploading and going
live are different decisions**, and a command that did both means one mistyped
line ships to every player. The build lands in the partner site where it can be
looked at, and a human sets it live there.

---

## 4. After the upload

- **Install it from Steam and press the icon.** The one thing no workflow can
  do. It exercises the packaged-resource branch, the macOS dylib in
  `Contents/Frameworks`, and the nested signature on the bundled Node runtime —
  all three of which are correct in the build directory and can still be wrong
  in an installed copy.
- **Check the launch log.** Every launch writes one, in the app's user-data
  directory, with the previous kept beside it; it names the build's
  capabilities, the Steam handshake's outcome and the cold-start breakdown.
- **Verify cloud save with a real roster.** `adastrail --roster-check` prints
  what the cloud is holding, by hero name; see `README.md`.

## What fails quietly

Collected in one place, because every entry produces a game that starts:

- **No Steam redistributable.** The handshake degrades rather than crashing, so
  cloud saves and achievements are simply dead. Caught by §2.
- **A developer build in the depot.** Looks identical until somebody taps the
  sun seven times. Caught by §2.
- **An unstamped build.** Multiplayer, mods and voice all absent, with the game
  playing perfectly otherwise. Refused by the packager in §1.
- **An ad-hoc macOS signature shipped as a release.** Runs everywhere the
  developer tested and is refused by Gatekeeper on a machine that downloaded it.
  Set `APPLE_SIGNING_IDENTITY`.
- **A depot built for the wrong target.** The redistributable check in §2 is
  what catches this, because the library is the file that does not travel.
