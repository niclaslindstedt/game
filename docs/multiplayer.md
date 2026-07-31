# Multiplayer — the shipped architecture

The build plan is [`multiplayer-plan.md`](multiplayer-plan.md); this file
describes what actually exists. **PR 1, the NETWORKING half of PR 2, and the
VERBS half of PR 1.5 have landed.** The simulation runs in its own process, the
wire between it and a renderer is complete and tested, the desktop shell forks
and supervises a session — a session can open a UDP socket and a Steam lobby,
admit remote clients behind a challenge handshake, seat them as spectators, and
carry chat and `/players N` between them — and everything the app DOES to a run
now travels as a named command rather than as a direct call on a local state.

What is NOT here is the half a player would SEE: the HOST, JOIN and server-
browser screens, and the in-run chat overlay. That is deliberate rather than
abandoned — see [What is NOT here yet](#what-is-not-here-yet) — because the run
still simulates in the renderer, so a JOIN screen would be a door into a session
nothing plays through. Moving the loop is **PR 1.75**; the screens are PR 2.5.

## The topology

**The server ships inside the desktop binary.** A listen server hosted by one
player's Steam build, which is how Diablo 2 did it: there is no service to run,
nothing to pay for, and the game's own promise — "no sign-up, no login and no
server of ours" — survives intact.

```
electron/src/main.ts          routes the __gisNet control protocol
electron/src/net.ts           the bridge: mints the port, supervises replies
electron/src/session-host.ts  the utilityProcess's lifecycle
electron/src/net-steam-p2p.ts the Steam P2P pump (main process only)
electron/src/net-lobby.ts     the lobby, which IS the server browser
electron/src/net-firewall.ts  the one layer that needs a player's permission
        │  MessagePort (snapshots, transferred ArrayBuffers)
        ▼
server/main.ts                the session server (its own Node process)
server/session.ts             one authoritative GameState, at 60 Hz
server/chat-room.ts           the log, and what a slash command does
server/net/hub.ts             where a stranger becomes a client
server/net/udp.ts             the direct path — its own socket, its own port
server/net/relay.ts           the Steam path, arriving over the control channel
server/net/upnp.ts            the router mapping (NAT-PMP, then UPnP-IGD)
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
  the app does not merely READ the run, it _acts_ on it: it turns a page of the
  opening monologue, equips the sword in bag cell 4, buys the merchant's third
  row, places a stat point, takes an errand. Once the state lives in another
  process every one of those calls has to travel. They travel as names from a
  fixed union, dispatched through an explicit `switch`. A channel that resolved
  a function name dynamically would hand a client `grantXp` and `mintUnique`
  the day PR 2 opens a UDP port.

  **THE ARGUMENTS ARE PART OF THAT MODEL AND ARE SCALARS ONLY.** PR 1's nine
  verbs took none; PR 1.5's sixty-nine mostly do. A verb whose payload is a
  STRUCTURE is a verb whose payload a stranger gets to shape, so what crosses is
  a number, a string or a boolean — an index, a slot name, a stat, a quest id, a
  speed rung — and each verb's arity and argument types are declared beside it in
  the ENGINE (`RUN_COMMAND_ARGS` in `src/game/commands.ts`) and checked before
  anything is dispatched. A string that names one of the engine's own unions is
  checked against that union's runtime list rather than against `typeof
"string"`: a host must not be crashable by a stranger sending `"luckk"`.

  **THE LIST EXISTS TWICE, AND THAT IS DELIBERATE.** The engine owns what each
  verb DOES; `server/wire/protocol.ts` keeps a literal copy of the NAMES for its
  allow-list, because that leaf is read by the page from screens on the app's
  startup path where the 170 KB budget forbids reaching `@game/core`.
  `tests/engine/run_commands_test.ts` fails the build when the two disagree —
  the same snapshot-and-drift-test shape `mod/catalog.json` uses.

  **THE APP HAS ONE DOOR ONTO THE LIST**, `pwa/src/game/run-commands.ts`, and
  every one of the ~110 call sites goes through it. It applies through the SAME
  dispatch the server does, so a verb cannot behave one way in single-player and
  another in a session; when a run driver installs a sink it applies locally AND
  sends, so the call sites that read what a verb returned still get an answer and
  the server's next snapshot corrects it. That is NOT the input prediction PR 3
  owns — there is no rollback and no replay, only a UI verb applied twice.

- **CHAT**, added by PR 2 — one line of text, parsed by the server
  (`server/wire/chat.ts`) into one of six names from a **second** closed list,
  for exactly the same reason: a chat box that handed the session an arbitrary
  verb would undo the command channel's allow-list beside it. It is the ONE
  thing a spectator may do, and the room refuses a spectator's `/players`,
  `/kick` and `/invite` **by name** rather than ignoring them — a command that
  silently does nothing is indistinguishable from one that is broken.

PR 1 shipped the nine scene-advance verbs. **PR 1.5 added the other sixty** —
the screens, the run's own flow, the bag, the counter, the build, the party, the
errands, the conversations, the vault and the AUTO PILOT ride — not PR 3, as the
plan originally said, which was a circular dependency: the run loop cannot move
into the server until every verb it calls can travel. The two halves are
separate jobs on the same names. **PR 1.5 makes them TRAVEL**, with today's
blocking semantics exactly preserved — opening the inventory still freezes the
run, because that is what it does now and the cutover may not change how the
game feels; **PR 3 makes them NON-BLOCKING** per player, which is the design
exercise.

One thing moved out of the app to make that possible, and it is worth knowing
because it looks like an unrelated change: **the AUTO PILOT flight's build
baseline now lives on the run** (`state.autopilot.build`, stamped by
`startAutopilot` and seeded from `SessionParams.autopilotBuild`) rather than in
the app's autopilot session. A FLIGHT outlives a run — the ride crosses levels,
and each level is a fresh session — so the refund it owes when it stops has to
survive the simulation moving out of the renderer, and it was the one verb whose
argument was a structure rather than a scalar.

## The two doors

A host listens on **both at once**, and should by default: Steam friends get the
frictionless path, everybody else gets an address. `server/net/transport.ts` is
the one interface both satisfy — **polled, packet-shaped and explicit about
reliability**, because that is what the narrower of the two APIs forces.
`steamworks.js` binds the LEGACY `ISteamNetworking` P2P API and nothing else: no
sockets, no callbacks, no channels, just `isP2PPacketAvailable()` on a pump
somebody else runs.

**The seam lives in `server/`, not in `electron/src/`, and that is a deliberate
departure from the plan's file list.** The plan sketched
`electron/src/net-transport*.ts`; §5.5 of the same plan says the dedicated
server "is the same file" as this one, minus Electron. Both cannot be true — a
transport in the shell is a transport the standalone server does not have. So:

- **UDP lives in the session process** (`server/net/udp.ts`). Its packets never
  touch the main process's event loop, and PR 5's dedicated server inherits the
  whole path with no shell at all.
- **Steam lives in the shell** (`electron/src/net-steam-p2p.ts`), because
  `steamworks.init()` is a single global handshake `steam.ts` owns and the
  session is a different process. Its packets are relayed over the control
  channel to `server/net/relay.ts`, which presents them to the session as an
  ordinary transport. That asymmetry is forced, not chosen: each half lives
  where the resource it needs lives, and the session's view of the two is
  identical.

**THE BOUND PORT IS NOT THE REQUESTED PORT.** On `EADDRINUSE` the socket walks
from 27015 up to 27030 and takes the first it gets, and everything downstream —
the status row, the lobby's advertised address — reads what it GOT. A host
reading 27015 off a settings page while the socket is on 27016 is the exact bug
that makes "direct connect doesn't work" unanswerable.

**Nothing here adds reliability twice.** UDP gets the classic layer
(`server/net/reliability.ts`: a sequence, an ack bitfield, retransmission of the
small half); the Steam path does not, because `SendType` already carries the
distinction and layering a reliable protocol over a reliable protocol makes the
connection worse the more it is helped. Snapshots go **unreliable on both**: a
delta is coded against the client's ACKNOWLEDGED baseline, so a lost one costs a
frame of smoothness and can never desync — and retransmitting it would deliver
stale ground late.

## Admission — what happens before a stranger's bytes mean anything

`server/net/hub.ts` is the only thing between an open UDP port and the
simulation, and §5.2's rule is implemented literally: an unadmitted peer may
send exactly two frames, and every other frame from it is dropped without being
looked at.

1. **A padded `hello`.** THE PADDING IS THE SECURITY PROPERTY. A connectionless
   request must never be answered with more bytes than it contained, or a
   spoofed source address turns every host into a DDoS reflector — so a probe
   under `HELLO_MIN_BYTES` is dropped **in silence**, because saying "you did
   not pad it" would itself be the reply the rule forbids.
2. **A `challenge`,** carrying a cookie **derived** rather than remembered — a
   hash of the session's secret, the peer's key and the current epoch, accepted
   for that epoch and the one before it. Nothing is stored between the probe and
   the join, so there is no half-open table for a flood to exhaust. It proves
   the joiner can RECEIVE at the address it claims; it does not authenticate a
   person, and the password proof beside it is a speed bump the doc says is one.
3. **A `join`,** refused in a deliberate order — protocol, build, mods,
   challenge, password, seats. Cheapest and most fundamental first, so garbage
   costs the host almost nothing AND the message names the thing the player can
   actually fix. The challenge is checked before the password, because answering
   "wrong password" to a spoofed address is a small oracle offered for nothing.
4. **A seat, as a SPECTATOR.** PR 2 replicates one hero to eight machines;
   seating a second is PR 3's whole subject.

Per-address token buckets keep a flood cheap, and they are keyed on the ADDRESS
rather than the address and port — a flood trivially varies its source port.

## Opening the port — what is genuinely automatic, and what is not

Three independent things can block an inbound connection, they have three
different remedies, and conflating them is why "open your ports" is folklore
rather than instruction. So they are three files and three status rows.

| Layer        | Where                          | How automatic                                                           |
| ------------ | ------------------------------ | ----------------------------------------------------------------------- |
| **Socket**   | `server/net/udp.ts`            | Fully. It binds, walks on collision, and reports where it landed        |
| **Router**   | `server/net/upnp.ts`           | Fully, silently, no permission. NAT-PMP first, UPnP-IGD as the fallback |
| **Firewall** | `electron/src/net-firewall.ts` | One prompt, once, on an explicit press — and never at launch            |

The router mapping's own reply is where the external address comes from, which
is a deliberate refusal to use STUN or a "what's my IP" lookup: the game's
identity claim is that it talks to nobody, and one row of text is not worth
making that false. It is asked for as a **lease** and renewed at a third of it,
so a mapping leaked by a crash self-heals rather than leaving a port open on the
player's router for ever.

The firewall half obeys three rules, each a mistake somebody else has shipped:
never elevate at launch or without being asked; **verify, never assume** (the
remedy returns what the re-check said, not whether the command exited zero); and
always leave the exact command, copyable, beside the button. **And the honest
limit: reachability from the outside cannot be self-tested without an outside.**
Every check reports a rule being PRESENT; the only proof is the first joiner.

**Steam hosting needs none of it**, which is why it is the default: P2P is
outbound-initiated and Valve-relayed, so nothing inbound is ever bound.

## `/players N`

`server/wire/players.ts` is the one thing entitled to say what it means, because
both ends read it — the session applies it, and a chat reply has to quote it.
D2's rule: monster hp ×(1 + 0.5(N−1)) with a matching experience bump.

**The pairing is the trap, and it is recorded in the engine's own knob.** Kill
XP here is level-based, so a hp-scaled mob is tougher and pays exactly the same
XP for its level. Scaling `mobHp` alone makes `/players 8` strictly punishing
rather than the risk/reward trade it is meant to be, so the two move together,
always. The real tuning pass is PR 4's — it has the multi-player simulator to
measure with and the menace meter to reconcile, neither of which exists yet.

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
| `tests/engine/run_commands_test.ts`    | The two closed lists agreeing, and every argument a stranger may send         |
| `tests/engine/net_session_test.ts`     | A real session and a real client, hashed against each other after 600 ticks   |
| `tests/engine/wire_handshake_test.ts`  | The cookie's epoch window, the proof, and the ORDER the refusals come in      |
| `tests/engine/wire_chat_test.ts`       | The slash grammar, and that hp and XP scale together                          |
| `tests/engine/wire_address_test.ts`    | Every form a player may type, IPv6 brackets included                          |
| `tests/engine/net_reliability_test.ts` | Retransmit, dedupe, the 16-bit wrap — over a scripted lossy link              |
| `tests/engine/net_udp_test.ts`         | The port walk, and that `bound` is what the socket GOT                        |
| `tests/engine/net_hub_test.ts`         | Mostly what does NOT happen: the unpadded probe, the flood, the stranger      |
| `tests/engine/net_spectators_test.ts`  | Several clients, no bag on the wire, and the host's commands being the host's |
| `tests/content/server_deps_test.ts`    | The ship target's dependency manifest, and that it reaches nothing outside it |
| `electron/tests/session-host_test.ts`  | Spawn, port handover, orderly stop, forced kill, and crash-vs-stop            |
| `electron/tests/net-lobby_test.ts`     | The metadata round trip through the short keys, and degrading without Steam   |

## What is NOT here yet

- **The run still simulates in the renderer.** `GameScreen` owns the loop as it
  always has; nothing in the shipped game reaches `pwa/src/game/net/` yet. The
  verbs it calls all travel now, so the blocker that made this circular is gone
  — what is left is **PR 1.75 (THE LOOP MOVES)**, and one thing the plan had not
  measured stands in the way of it: **a run is not `createGame(params)`.**
  `createRunSession` (`pwa/src/game/game-screen/run-setup.ts`) performs six
  further mutations before the first tick — it seeds the hero's campaign quest
  chain, funds the purse from the character's whole banked wealth, marks the
  thoughts this hero has already read, applies a `?scenario=`, skips an opening
  already watched on this difficulty, and mutes the dialogue for a bot run — and
  the `SessionParams` cannot express any of them. So the session would build a
  DIFFERENT world from the one the app built, and the client's first delta,
  which is supposed to be nearly empty, would carry the difference as
  "corrections" to a run that was right to begin with.

  Five of the six are plain data and belong in `SessionParams` beside `loadout`
  (which is already opaque there for exactly this reason); the sixth is dev-only
  and does not travel. The **parked run** and the **checkpoint restore** are the
  harder half of the same problem: both adopt an arbitrary `GameState` rather
  than building one, so the session needs a way to ADOPT a state and send the
  arriving client a full snapshot instead of a delta against a genesis it does
  not share. `server/session.ts` already has the `Sent.full` shape for that and
  nothing has ever used it.

- **No screens.** HOST, JOIN, the server browser, JOIN BY ADDRESS and the chat
  overlay are not authored yet, so nothing in the title menu reaches any of the
  above. This is the reason they were held rather than an oversight: the menu
  tree is content (`content/mainmenu.yaml`) and a screen's builder lands in the
  same commit as its rows, so authoring them now would put a door in front of a
  session no player can yet play through. They land with the cutover above, and
  everything the shell needs to draw them — the bound address, the router and
  firewall rows, the roster, the browser rows — is already on the bridge.
- **The Steam path is written but unproven.** The binding's legacy P2P API is
  polled, deprecated and thinner on guarantees than SDR, and the plan is
  unsparing about spiking it under load before the UI rests on it. The direct
  UDP path exists partly as the insurance policy on exactly that.
- **No second player.** `state.player` is still one hero — PR 3. Every joiner is
  a spectator, and the session refuses their steering in the one place a client
  cannot argue with it.
