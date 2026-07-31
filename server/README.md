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
170 KB critical-path budget forbids reaching `@game/core`. A wire that knows
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
