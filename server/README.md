# The session server

The authoritative simulation, and — from the moment multiplayer is on — the
only thing allowed to advance it. The host's renderer becomes just another
client: it sends input frames and applies snapshots exactly as a joiner does,
which is why there is no "and also, when you are the host…" clause anywhere in
this feature.

See [`docs/multiplayer.md`](../docs/multiplayer.md) for the architecture.

## Layout

```
server/
  main.ts          the process entry — it picks between the three below
  shell-host.ts    the `--shell` sidecar entry (Tauri spawns a plain child)
  dedicated.ts     the terminal wrapper: a config file, a console, shutdown
  host.ts          what all three share: the session, the desk, the sockets,
                   and the ONE fixed-timestep loop
  session.ts       one session: the worlds, the clock, the clients, the publish
  worlds.ts        more than one level live at once — the world record
  crossing.ts      moving a seat between two worlds, both roads through one fn
  client.ts        snapshots back into a run — the ONE client (`@game/client`)
  client-predict.ts  local-hero prediction and remote-hero interpolation
  bot-client.ts    a headless joiner that PLAYS — the soak's engine
  local-bots.ts    bot seats, over an in-process loopback pair
  chat-room.ts     the log, and what a slash command does
  licence.ts       the build-time literal the config escape is folded shut by
  net/             transports, admission, the router mapping — Node builtins
  wire/
    protocol.ts    what the TITLE MENU reads: PROTOCOL_VERSION, the handshake
                   shapes, `SessionParams`, the refusal texts
    frames.ts      the RUNTIME vocabulary: the frame tags, the transport
                   constants, and `COMMANDS` — the client's allow-list
    codec.ts       framing — the only place bytes are made and read
    split.ts       the replication split: static / dynamic / private
    delta.ts       the differ and its inverse
    snapshot.ts    one recipient's view of the run, with private held back
    handshake.ts   `admit` — the refusal order, the cookie, the password proof
    address.ts     every form of address a player may type
    chat.ts        the slash grammar — six names, a second closed list
    players.ts     the `/players N` scaling, hp and XP moving together
    voice.ts       the wire's ONE binary payload
```

Everything under `wire/` imports **nothing** outside `wire/` — not even the
engine. Both ends read it, and the page reads it from screens that may sit on
the app's startup path, where the 170 KB critical-path budget forbids reaching
`@game/core`. A wire that knows nothing about the simulation also cannot fall
out of step with it. **`protocol.ts` and `frames.ts` are split by that same
budget** — the first is what the title menu genuinely reads, the second sits
behind the run's lazy chunk — and **no value re-export may connect them in
either direction**, because tree-shaking is global.

## Shipping it

The engine is TypeScript with `.ts` import specifiers and two path aliases; a
Node process cannot run that directly. `npm run server:build` compiles
`server/` and `engine/` into `electron/server-dist/` with `tsc` and rewrites the
aliases in the emitted JavaScript — see
[`scripts/build-server.mjs`](../scripts/build-server.mjs). `electron-builder`
copies the result to `resources/server/`, and `electron/src/resources.ts`
resolves between the two layouts on `app.isPackaged`, exactly as it already
does for the mod toolchain.

`package.json` declares what the compiled tree needs at runtime — nothing today,
and `tests/content/server_deps_test.ts` walks the real import graph to prove it
stays that way. The engine has no npm dependencies and this is the test that
notices the day it grows one.

## Running it by hand

```sh
npm run server:build          # compile into electron/server-dist/
node electron/server-dist/server/main.js
```

With no `parentPort` and no `--shell` that IS the dedicated server (below). To
exercise the FORKED shape, use the test suite —
`tests/engine/net_session_test.ts` drives a real session and a real client over
a loopback pair and compares the two states — or the desktop app, which is what
`electron/src/session-host.ts` forks.

## Running it standalone — the dedicated server

All three shapes are the same code: everything that makes a session (the
simulation, the admission desk, the sockets, the router mapping and the one
fixed-timestep clock) is `host.ts`, and `main.ts`
picks between them with nobody passing it a mode. A `parentPort` means
Electron's `utilityProcess` forked it and it is the game's own session server;
`--shell` means the Tauri shell spawned a plain child (`shell-host.ts`, which
puts two pipes where Electron has one); neither hands over to `dedicated.ts`.

```sh
npm run server:start                       # build, then run with the defaults
npm run server:start -- --port 27015       # …on a chosen port
npm run server:start -- server.config.json # …from a config file
```

The desktop executable exposes the same entry without opening a window:

```sh
./Ada\'s\ Trail --dedicated --bots 3 --verbose
```

The flags are `--config` (or a bare path), `--level`, `--difficulty`, `--seed`,
`--port`, `--players`, `--password`, `--bots`, `--licensed`, `--no-portmap` and
`--verbose`.

`--bots` accepts 1–8. With 1–7, bots join after the first human player and
yield their seats to later human arrivals. With 8, the autonomous party starts
immediately. A status line prints every thirty seconds by default
(`statusEverySec`; 0 turns it off) and `--verbose` prints a detailed one every
second instead. Game starts, player joins/deaths/quits, level finishes, and
campaign finishes are always printed, with or without `--verbose`.

**`--licensed` is the operator's licence DECLARATION**, and without it the
server starts, binds, prints its address and refuses every join by name — the
honest behaviour for a copy nobody has claimed. Nothing here can verify a
licence and nothing pretends to; a store build carries the same word in its
packaging.

The first Ctrl-C broadcasts a one-minute shutdown warning, repeats it at 15
seconds and counts down from 10 so players can say goodbye. A second Ctrl-C
exits immediately; SIGTERM is always immediate, for service managers.

Every flag has a config-file twin; see `server.config.example.json` and
`DedicatedConfig` for the full list. Flags win over the file.

Four things about it are worth knowing before running one:

- **NOBODY OWNS IT.** Seat 0 stands empty until somebody joins, and the first
  arrival is dressed in the hero THEY brought rather than in the run's default.
  An empty server does not simulate at all, so it costs nothing while idle.
- **A RUN ON IT IS A PARTY RUN** and banks no leaderboard record, for the reason
  every co-op run does: whoever operates the machine controls the simulation.
- **NO STEAM.** `steamworks.init()` is a single global handshake the desktop
  shell owns, so the relay transport is something the SHELL adds to a host. A
  dedicated server has only the direct UDP path — which is the transport that
  already carries the whole protocol, and the only one that works on a LAN with
  the internet off.
- **REACHABILITY CANNOT BE SELF-TESTED.** It prints the port it actually bound
  (never the one it asked for) and whether the router accepted a mapping; past
  that, the first joiner is the only proof.

Multiplayer is licensed only to players who have acquired the game through
Steam. The shipped binary therefore refuses non-Steam transports; the source
tree's test escape exists for automated development checks and does not grant a
player licence. The mod creator's `--modifications` exception is single-player
only and never authorizes hosting or joining a session. See the repository
[`LICENSE`](../LICENSE) and `server/licence.ts`.
