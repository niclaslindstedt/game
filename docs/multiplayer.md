# Multiplayer — the shipped architecture

The build plan is [`multiplayer-plan.md`](multiplayer-plan.md); this file
describes what actually exists. **PR 1 of five has landed**, so what exists is
the foundation: the simulation can run in its own process, the wire between it
and a renderer is complete and tested, and the desktop shell knows how to fork
and supervise a session. There is no networking yet, and no second player —
those are PR 2 and PR 3.

## The topology

**The server ships inside the desktop binary.** A listen server hosted by one
player's Steam build, which is how Diablo 2 did it: there is no service to run,
nothing to pay for, and the game's own promise — "no sign-up, no login and no
server of ours" — survives intact.

```
electron/src/main.ts          routes the __gisNet control protocol
electron/src/net.ts           the bridge: mints the port, supervises replies
electron/src/session-host.ts  the utilityProcess's lifecycle
        │  MessagePort (snapshots, transferred ArrayBuffers)
        ▼
server/main.ts                the session server (its own Node process)
server/session.ts             one authoritative GameState, at 60 Hz
        │
        ▼
pwa/src/app/net-bridge.ts     the page's control half
pwa/src/game/net/client.ts    the run driver the renderer reads
```

`server/wire/` is the vocabulary both ends speak, and it imports nothing at
all — not even the engine. Both halves read it, and the page reads it from
screens that may sit on the app's startup path, where the 170 KB critical-path
budget forbids reaching `@game/core`.

## The three rules worth knowing

**One process per session, and the host is just another client.** A 60 Hz
simulation must not compete with the main process's IPC, window, Workshop and
Steam duties; and the engine holds 36 process-global mutable bindings (the
`BALANCE` tuning object, the flags in `src/game/flags.ts`, every `activeXDefs`
catalog `registerDefs` swaps for a mod) which are not per-`GameState`, so a
process boundary is what stops two sessions stomping each other. The host's
renderer sends input and applies snapshots exactly as a joiner will, which is
why nothing in this feature has an "and also, when you are the host…" clause.

**The state splits three ways** (`server/wire/split.ts`):

- **STATIC — never sent.** The level is a deterministic function of the
  `SessionParams`, so the client calls `createGame` with the same arguments and
  builds the obstacles, decor, canopy, spawner layout and carved geometry for
  itself. That is ~100 KB per level, per client, that the wire never carries,
  and it costs nothing even on the first frame: a client's very first delta is
  coded against the world at tick 0, which it already holds.
  `tests/engine/net_determinism_test.ts` proves the two processes agree.
- **DYNAMIC — snapshotted every third tick** (20 Hz), as a delta against the
  last snapshot the client ACKNOWLEDGED. A lost frame therefore costs one frame
  of smoothness and can never desync, which is what makes an unreliable
  transport safe in PR 2.
- **PRIVATE — to its owner alone.** The bag, the purse, the stats, the talents.
  This is simultaneously a bandwidth win, a privacy win and **the anti-cheat
  boundary**: a client that never receives another player's bag cannot
  manipulate it, which is what will make PR 5's trade window honest. It is a
  WITHHOLDING, not an omission — the fields are deleted before the snapshot is
  coded, and a spectator's client deletes the ones its own `createGame`
  invented.

**Events ride the snapshot, and the whole FX layer came free.** `state.events`
is already a per-tick array of plain records and it is how the app plays every
sound, flash, gore burst, blood soak and haptic. It travels as-is, so effects,
sound and the achievement ledger work on a client with no change at all. The
one thing it needs is a server that does not LOSE any: the simulation runs at
60 Hz and publishes every third tick, so the session accumulates the three
ticks' events and hands them over together.

## Two channels, deliberately

The four existing bridges (cloud save, achievements, leaderboards, mods) move a
handful of JSON round trips per session. This one would move a snapshot twenty
times a second, so it does not use that channel for it:

- **CONTROL** — host, stop, status. JSON, over the shared `gis:post` channel,
  tagged `__gisNet` like every other protocol.
- **GAME** — the frames. A `MessagePort` pair minted in the main process, one
  end to the renderer and one to the utility process, with the `ArrayBuffer`
  transferred rather than copied. The frames never enter the main process.

## What a client may do

Two things, and both are narrow on purpose:

- **INPUT frames** — the existing `GameInput` shape, plus a sequence number.
  The client sends input, never positions: a client that sends positions is a
  client that can teleport.
- **COMMANDS from a closed list** (`COMMANDS` in `server/wire/protocol.ts`) —
  the run loop also _acts_ on the state (turning a page of the opening
  monologue, skipping a cutscene, ending the death tableau), and once the state
  lives in another process those calls have to travel. They travel as names
  from a fixed union, dispatched through an explicit `switch`. A channel that
  resolved a function name dynamically would hand a client `grantXp` and
  `mintUnique` the day PR 2 opens a UDP port.

PR 1 ships the scene-advance verbs. The inventory, the shop, the level-up
chooser and the talent picker join them in PR 3, when they stop freezing the
world for everybody.

## The engine's Node ship target

`@game/core` is consumed by Vite (for the browser) and by
`scripts/game-alias-loader.mjs` (for tooling); neither produces something that
ships inside the app. `npm run server:build` (`scripts/build-server.mjs`)
compiles `server/` and `src/` into `electron/server-dist/`, which
`electron-builder` copies to `resources/server/` and `electron/src/resources.ts`
resolves between on `app.isPackaged` — the same two-layout arrangement the mod
toolchain already uses.

Two details are load-bearing:

- **The sources are STAGED before they are compiled.** TypeScript refuses to
  emit a file whose import is both aliased and carries a `.ts` extension
  (TS2877), and the engine's 112 `@game/lib/*.ts` imports are exactly that. The
  build copies the trees, rewrites the aliases to relative paths, and compiles
  the copy — which keeps the engine written in the repo's own house style.
- **Type stripping was spiked and refused.** It works (Node has it on by
  default from 22.18, which is how `scripts/simulate-run.mjs` already imports
  `src/sim/simulate.ts`), but it does not resolve the aliases, and
  `utilityProcess` runs Electron's bundled Node — a runtime whose version moves
  with Electron. A ship target resting on an experimental flag in a runtime
  somebody else upgrades breaks in a released build for a reason nobody changed.

`server/package.json` declares what the compiled tree needs at runtime —
nothing today — and `tests/content/server_deps_test.ts` walks the real import
graph to prove it, exactly as `mod_toolchain_deps_test.ts` does for the
compiler.

## What is tested

| Suite                                  | What it holds                                                                 |
| -------------------------------------- | ----------------------------------------------------------------------------- |
| `tests/engine/wire_codec_test.ts`      | Framing round trips, and every refusal a decoder on an open port must make    |
| `tests/engine/wire_delta_test.ts`      | `patch(prev, diff(prev, next)) === next`, and each strategy separately        |
| `tests/engine/net_determinism_test.ts` | The same arguments build the same world — in a real second process            |
| `tests/engine/net_session_test.ts`     | A real session and a real client, hashed against each other after 600 ticks   |
| `tests/content/server_deps_test.ts`    | The ship target's dependency manifest, and that it reaches nothing outside it |
| `electron/tests/session-host_test.ts`  | Spawn, port handover, orderly stop, forced kill, and crash-vs-stop            |

## What is NOT here yet

- **The run still simulates in the renderer.** `GameScreen` owns the loop as it
  always has; nothing in the shipped game reaches `pwa/src/game/net/` yet. The
  cutover is the rest of PR 1: the app performs around forty direct engine
  mutations (equip, buy, allocate, pause, respec…) and each has to become a
  command before the loop can be moved.
- **No networking.** No transports, no lobbies, no server browser, no ports,
  no chat — PR 2.
- **No second player.** `state.player` is still one hero — PR 3.
