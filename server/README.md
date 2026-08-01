# The session server

The authoritative simulation, and — from the moment multiplayer is on — the
only thing allowed to advance it. The host's renderer becomes just another
client: it sends input frames and applies snapshots exactly as a joiner does,
which is why there is no "and also, when you are the host…" clause anywhere in
this feature.

See [`docs/multiplayer.md`](../docs/multiplayer.md) for the architecture and
[`docs/multiplayer-plan.md`](../docs/multiplayer-plan.md) for the five-PR plan
this is the first of.

## Layout

```
server/
  main.ts          the process entry — Electron's utilityProcess forks this
  session.ts       one session: createGame, the fixed-timestep clock, clients
  wire/
    protocol.ts    the vocabulary: frame types, PROTOCOL_VERSION, handshake
    codec.ts       framing — the only place bytes are made and read
    split.ts       the replication split: static / dynamic / private
    delta.ts       the differ and its inverse
    snapshot.ts    one recipient's view of the run, with private held back
```

`protocol.ts`, `codec.ts`, `split.ts`, `delta.ts` and `snapshot.ts` import
**nothing** — not even the engine. Both ends of the wire read them, and the
page reads them from screens that may sit on the app's startup path, where the
200 KB critical-path budget forbids reaching `@game/core`. A wire that knows
nothing about the simulation also cannot fall out of step with it.

## Shipping it

The engine is TypeScript with `.ts` import specifiers and two path aliases; a
Node process cannot run that directly. `npm run server:build` compiles
`server/` and `src/` into `electron/server-dist/` with `tsc` and rewrites the
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

It will sit waiting for a control message, because nothing forked it: the
process entry only starts a session when its parent asks for one. The useful
way to exercise it is the test suite —
`tests/engine/net_session_test.ts` drives a real session and a real client over
a loopback pair and compares the two states — or the desktop app, which is what
`electron/src/session-host.ts` forks.

## Running it standalone — the dedicated server

The utility-process server and the standalone one are the same code: everything
that makes a session (the simulation, the admission desk, the sockets, the
router mapping and the one fixed-timestep clock) is `host.ts`, and `main.ts`
picks its entry from whether anybody forked it. With a `parentPort` it is the
game's own session server; without one it hands over to `dedicated.ts`.

```sh
npm run server:start                       # build, then run with the defaults
npm run server:start -- --port 27015       # …on a chosen port
npm run server:start -- server.config.json # …from a config file
```

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

The licence question is open and is not this code's to settle: decision 15 in
`docs/multiplayer-plan.md` asks what `PolyForm-Noncommercial-1.0.0` permits for
somebody running a server for other people, and it should be confirmed before a
binary ships.
