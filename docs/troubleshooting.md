# Troubleshooting

Common failure modes and their fixes. If your problem is not listed, open an
issue with the output of the failing command.

## Building

### `extract-source-data: src/version.ts (…) disagrees with package.json (…)`

The embedded engine version and the manifest drifted. Never edit versions by
hand — `scripts/update-versions.sh vX.Y.Z` rewrites all of them atomically.

### `vite: command not found` inside `pwa/`

Dependencies are installed from the repository root (npm workspaces), not
inside `pwa/`. Run `npm install` at the root.

## The desktop game

### `'GIS_STEAM' is not recognized as an internal or external command`

An npm script tried to set an environment variable with `VAR=value` shell
syntax. That is Bourne shell; `cmd.exe` reads it as the name of a program, so
the script fails before the command it was supposed to run. Fixed for
`npm run electron` (it goes through `scripts/run-electron.mjs`, which sets the
variable on the child process instead) and pinned by
`tests/content/npm_scripts_portable_test.ts` — if you hit it in another script,
that is the bug and a shell prefix is never the fix.

### The desktop game does nothing when launched

Read `launch.log` in the app's user-data directory —
`%APPDATA%\adas-trail-desktop` (Windows), `~/Library/Application
Support/adas-trail-desktop` (macOS), `~/.config/adas-trail-desktop` (Linux). The
shell writes every launch there, INFO included, and keeps the previous one as
`launch.log.prev`. Anything fatal also raises an error dialog naming that file.

Three lines in it answer most of these:

| Line                              | What happened                                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `another copy is already running` | A previous copy (possibly wedged) still holds the single-instance lock. End it in the task manager.     |
| `no bundled website was found`    | Incomplete install, or a checkout that never ran `npm run electron` from the repo root.                 |
| `child process gone: GPU`         | A graphics-driver problem. Launching with `GIS_STEAM_OVERLAY=0` rules out the Steam overlay's switches. |

If the log ends with no error at all, launch once with `GIS_VERBOSE=1` set and
read it again.

## The deployed game

### The site shows an old build after a deploy

Expected: the service worker parks new builds in `waiting` and shows an
update toast rather than yanking the app out from under a run. Accept the
toast, or close every tab/instance of the app and reopen.

### The preview slot shows the production app (or vice versa)

The production worker's scope covers `/preview/` and `/branch/`;
its navigation denylist should make it ignore them. If a stale worker from
before the denylist is still controlling the origin, unregister it
(DevTools → Application → Service Workers → Unregister) and reload.

### Installed PWA white-screens on launch

Usually two slots fighting over one cache. Verify
`pwa/src/app/pwa.ts` derives distinct cache ids for every entry in
`DEPLOY_SLOTS` (`pwa/pwa-plugin.ts`), then bump a deploy so fresh
workers install.

## Multiplayer — the three layers a connection can fail at

"Direct connect doesn't work" is unanswerable as one question, because three
independent things have to be true and they fail in different places. Conflating
them is why "open your ports" is folklore. Check them in this order.

### 1. The PORT the socket actually got

The socket walks 27015 → 27030 on a collision, so a second copy of the game
running on the same machine binds a DIFFERENT port from the one on the settings
page. Every surface reads what it GOT (`Transport.bound`) — the HOST screen's
status row, the address to hand a friend, the dedicated server's console line.
**Give people the port the game printed, never the one you asked for.**

A dedicated server told to use a port outside 27015–27030 tries exactly that
port, once, and says `UDP port N is already in use` if it is taken.

### 2. The ROUTER

The game asks for a mapping automatically and without asking permission —
NAT-PMP first, then UPnP-IGD — as a renewed LEASE, so a crash cannot leak a
permanently open port. The external address comes from the router's own reply,
never from a STUN or "what's my IP" service: the game promises it talks to
nothing but the people you play with, and that promise is kept here.

If the ROUTER row says it could not map, the router either has UPnP off or does
not answer either protocol. Forward the bound UDP port by hand.

### 3. The FIREWALL

One prompt, once, on an explicit press — never at launch. What it reports is
what the RE-CHECK said, not whether the command exited zero, and the exact
command is always copyable beside the button so it can be run by hand or handed
to whoever administers the machine.

### And the honest limit

**Reachability from the outside cannot be self-tested without an outside.** All
three rows above can be green and the connection still refused by something
further out — a carrier-grade NAT, a corporate network, a second router. The
only proof is the first joiner. The HOST screen says so, and so does the
dedicated server on every start.

### Other multiplayer symptoms

| Symptom                                   | Cause                                                                                                                  |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| "One of you needs to update"              | Build or protocol skew. Both numbers are named in the refusal; the two ends must be the same build.                    |
| "The host is playing with different mods" | Mod lists differ. They are compared by id AND order.                                                                   |
| Dropped, then rejoined as a fresh hero    | Past the 30-second reconnect window, or the game was restarted (the ticket lives in memory only).                      |
| A trade will not settle                   | Something moved out of an offered cell. The trade is refused whole rather than settling against whatever is there now. |
| Disconnected "for flooding"               | A client sent far past what any real one does, for long enough to run a real debt. Usually a wedged client.            |

## Diagnostics

Load the app with `?debug` appended to the URL to get debug-level console
output. All log levels are always captured in an in-memory buffer
(`recentLogs()` in `src/output.ts`) regardless of the flag.
