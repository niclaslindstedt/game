# Multiplayer — the shipped architecture

The build plan is [`multiplayer-plan.md`](multiplayer-plan.md); this file
describes what actually exists. **PR 1, PR 2, PR 1.5, PR 1.75, PR 2.5 and the
first half of PR 3 have landed.** The simulation runs in its own process, the
run loop drives it, the wire between it and a renderer is complete and tested,
the desktop shell forks and supervises a session, a session can open a UDP
socket and a Steam lobby and admit remote clients behind a challenge handshake,
the title menu has the three doors that let somebody walk through it (**HOST
GAME**, the **server browser**, **JOIN BY ADDRESS**) — and a run now carries a
**PARTY** rather than a hero, so an admitted player is seated with a character
of their own.

What is NOT here yet is the half of PR 3 that makes eight heroes comfortable
rather than merely possible: a screen one player opens still stops the world for
everybody, and a client still shows its hero where the last snapshot put him
rather than predicting his own steering. See **What is NOT here yet** at the
foot of this file.

## The party

**`GameState.players` is a non-empty tuple of heroes in SEAT order.** Seat 0 is
the host's, and it is the only seat a single-player run has — nothing in the
engine treats the one-element case specially, which is the whole point: a pass
written against one hero silently means "seat 0" the day a second player
arrives.

The reads of it split exactly two ways, and the plan's §0 measured the split
before any of this was written:

- **PRIVATE reads** — the bag, the purse, the build, the talents, the worn kit —
  are asking about ONE hero, and the answer is always "the one this pass is
  about". They are a **PARAMETER**, not a lookup: `effectiveStat(state, player,
stat)`. A pass that reaches for seat 0 to find a bag is a pass that has not
  been parameterized yet.
- **GEOMETRY reads** — where is the threat, the target, the anchor — are asking
  about the party, and each needs a party-aware answer: nearest, any, all, or
  centroid. Those live in `src/game/party.ts`, and picking the wrong one is a
  design bug rather than a typo — `anyHeroWithin` wakes a pack (one half the
  party walked past is a pack that never fights) where `nearestHero` is what a
  mob chases.

**Whom a mob chases is the nearest VISIBLE hero, with HYSTERESIS**
(`src/game/aggro.ts`), and each word is load-bearing. Nearest, or a party parks
one hero across the map and farms with the other seven. Visible, because the
horde already refuses to chase a hero it cannot see, and a party-aware answer
that ignored sight would have mobs grinding into walls toward the nearest hero
while a second stood beside them in the open. Hysteresis, because "nearest"
alone is a coin flip between two players standing a pixel apart, re-tossed sixty
times a second — the mob judders, its flank offset is re-picked each tick, and a
pack's envelope dissolves into noise. The answer is remembered on the mob
(`Enemy.quarry`) rather than recomputed per read, so the move, the reach, the
ranged lead and every set-piece mechanic's locked bearing agree about who is
being fought; a mob walking toward one hero while its slam telegraphs at another
is not a difficulty, it is a bug nobody can read.

**The horde is budgeted around the PARTY and placed around a HERO.** The camp
anchor tracks the centroid (anchored on seat 0, a group farms forever by leaving
one player parked, since the clock would read "he has not moved" and starve the
stream for everybody); the wave ring is drawn on one player, because a ring
round the centroid delivers the horde into the empty floor between two players
standing at opposite ends of a hall; and its level is the party's HIGHEST, which
is Diablo 2's rule — an average lets a group carry a level-1 alt through a
level-90 map by arithmetic, and seat 0's makes the difficulty of a run depend on
who happened to press HOST.

**A blast is a blast.** Burning floor pulses and everybody standing in it burns,
a bait bomb bills every hero in its radius, a gravity well drags all of them.
The single-victim hazards stay single BY DESIGN: `struck` is a fact about the
gust or the herd, not about the party, so a wall of them cannot flatten a group
in one pass.

**The run ends when the party falls, not when a hero does** (`partyWiped`). One
player going down is a setback the rest fight through; PR 4 owns the corpse and
the respawn.

**A seat is appended, never inserted, and never spliced out.** Every command and
every input frame in flight names a seat by INDEX, so renumbering the party
mid-run would deliver seat 4's steering to seat 3's hero. A player who leaves
keeps their hero standing where they left it.

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
pwa/src/game/net/driver.ts    host a run, or join somebody else's
pwa/src/game/title-screen/    the three doors (menus-net.ts, use-sessions.ts)
```

The JOINER's half of the wire is `server/net/connect.ts`, and it lives beside
the hub rather than in the shell or in the page for the two reasons the seam
itself moved here: a page cannot open a UDP socket at all, and PR 5's dedicated
server has no shell to put one in. The session process therefore has **two
roles** — `start` makes it a HOST (it simulates, and the renderer is its first
client), `connect` makes it a JOINER (nothing simulates, a socket is opened
outward, and the same `MessagePort` carries somebody else's frames to the same
renderer). The page's client cannot tell the two apart, which is exactly why
joining cost one small module rather than a second client.

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

- **STATIC — never sent.** The run is a deterministic function of the
  `SessionParams`, so the client calls `createRunFromParams` with the same
  arguments and builds the obstacles, decor, canopy, spawner layout and carved
  geometry for itself. That is ~100 KB per level, per client, that the wire
  never carries, and it costs nothing even on the first frame: a client's very
  first delta is coded against the world at tick 0, which it already holds.
  `tests/engine/net_determinism_test.ts` proves the two processes agree.

  **THE RUN, NOT THE LEVEL — and that distinction cost a finding.** `createGame`
  was always deterministic, but a RUN was not the same thing as a `createGame`:
  the app performed several more mutations before the first tick (the hero's
  campaign quest chain, the purse funded from his whole banked wealth, the
  thoughts he had already read, an opening already watched on this difficulty, a
  bot run's dialogue mute), and none of them could be said in `SessionParams`.
  A session built from those parameters would have held a different world from
  the one the app built, and the first delta — the one whose emptiness this
  whole tier rests on — would have carried every difference as a "correction" to
  a run that was right to begin with. They are parameters now, applied by ONE
  function (`createRunFromParams`, `src/game/session-setup.ts`) that the app,
  the session and an arriving client all call, and **the rule that keeps it true
  is: anything the app does to a run before its first tick is a session
  parameter, not app code.** A `?scenario=` is the one deliberate exception — a
  developer staging hook applied locally, because a session that could be handed
  an arbitrary scenario is a session a client could stage.

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

## Who advances the run

`GameScreen` used to call `step()` itself, which is the one thing that could not
survive the simulation moving out of the renderer. It drives a **RunDriver**
now (`pwa/src/game/game-screen/run-driver.ts`), and there are two:

- **LOCAL** — `step(state, input, dt)`, in this process, exactly as before. What
  a browser, a phone and a desktop single-player run all do. It is not a
  fallback: a session per run costs a process, and running one in a renderer
  would put the snapshot capture, the diff and the JSON round trip on the frame
  thread twenty times a second, on a phone.
- **NET** — send the input and let the session step; snapshots arrive on their
  own and patch the state in place. Offered first and answering null wherever it
  cannot host, so the platform question is never asked in the run loop — the
  bridge answers a better one ("can a session actually be started?").

Everything else in the loop reads a `GameState` and is untouched by which driver
is behind it: the render pass, the HUD model, the effects, the overlays, the
sound bus, the achievement ledger, the checkpoint capture. **If one of them ever
has to know, that is a finding rather than a patch.**

**THE HOST HANDS IN ITS OWN STATE.** The renderer already holds a run — its own
setup built it, from the very `RunParams` the session is hosted with — and every
helper in the loop closes over that object, so the client adopts it and corrects
it in place. A second object built here would leave the renderer drawing a world
nothing ever patches. A remote joiner has no such object and keeps the ordinary
path.

**AND `state.events` IS THE TRAP.** It is cleared by `step()` on the local path
and by NOBODY on the net one, so the driver's `endTick` is where the net path
empties it and where the local path deliberately does not. Both mistakes are
silent and both sound like a bug in the audio rather than in the replication: a
list left in place is replayed by every frame until the next snapshot lands
(three times over, at 20 Hz against 60), and a list cleared on the local path
loses a whole slice's events whenever a frame owes two.

`?net=off` forces the local path. The session path is the one thing here that
cannot be proved from a test, so a player who hits a bad session has a way back
into their game that does not involve a new build.

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

| Suite                                    | What it holds                                                                 |
| ---------------------------------------- | ----------------------------------------------------------------------------- |
| `tests/engine/wire_codec_test.ts`        | Framing round trips, and every refusal a decoder on an open port must make    |
| `tests/engine/wire_delta_test.ts`        | `patch(prev, diff(prev, next)) === next`, and each strategy separately        |
| `tests/engine/net_determinism_test.ts`   | The same arguments build the same world — in a real second process            |
| `tests/engine/run_commands_test.ts`      | The two closed lists agreeing, and every argument a stranger may send         |
| `tests/engine/run_params_test.ts`        | `RunParams` and `SessionParams` naming the same fields                        |
| `tests/content/net_reachability_test.ts` | The startup path not reaching the engine, and the loop reaching the client    |
| `tests/engine/run_driver_test.ts`        | The driver seam's contract — who clears `state.events`, and who must not      |
| `tests/engine/net_session_test.ts`       | A real session and a real client, hashed against each other after 600 ticks   |
| `tests/engine/wire_handshake_test.ts`    | The cookie's epoch window, the proof, and the ORDER the refusals come in      |
| `tests/engine/wire_chat_test.ts`         | The slash grammar, and that hp and XP scale together                          |
| `tests/engine/wire_address_test.ts`      | Every form a player may type, IPv6 brackets included                          |
| `tests/engine/net_reliability_test.ts`   | Retransmit, dedupe, the 16-bit wrap — over a scripted lossy link              |
| `tests/engine/net_udp_test.ts`           | The port walk, and that `bound` is what the socket GOT                        |
| `tests/engine/net_hub_test.ts`           | Mostly what does NOT happen: the unpadded probe, the flood, the stranger      |
| `tests/engine/net_spectators_test.ts`    | Several clients, no bag on the wire, and the host's commands being the host's |
| `tests/content/server_deps_test.ts`      | The ship target's dependency manifest, and that it reaches nothing outside it |
| `electron/tests/session-host_test.ts`    | Spawn, port handover, orderly stop, forced kill, and crash-vs-stop            |
| `electron/tests/net-lobby_test.ts`       | The metadata round trip through the short keys, and degrading without Steam   |

## The three doors, and where each half of the HOST screen lives

The screens are authored in `content/mainmenu.yaml` like every other screen —
**the menu tree is content**, and `assembleRows` throws for a row id no builder
answers, so rows and builders land together. `menus-net.ts` owns the behaviour
and `use-sessions.ts` the plumbing, and **neither may import
`pwa/src/game/net/`**: these are title-menu screens, i.e. the app's startup
path, and that directory reaches `@game/core`. They talk to the import-free
`net-bridge.ts` and to the `@game/wire/*` leaves alone.

**A HOSTED GAME IS A RUN, NOT A LOBBY.** HOST GAME is the SESSION's settings —
who may come in, how many, on what port, behind what password — and its START
row walks into the same difficulty and mission pickers every other run uses.
`armHosting` (`session-intent.ts`) is the one bit that travels from the screen
to the run; `run-driver.ts` consumes it and opens the doors once the session is
up. The alternative — a lobby that waits for players before anybody is playing —
would mean a second, idle simulation standing on the map, and would make the
host's own renderer a client of a session it did not build.

That is also why **the live status rows are on the PAUSE screen**
(`game-screen/SessionPanel.tsx`) rather than on the HOST screen the plan's §2.2
sketched them on: the port the socket ACTUALLY got, the address a friend should
type, what the router said and who is in the seats are all facts about a running
session, and there is no session until the run starts. The HOST screen keeps the
half that can be answered beforehand — the firewall check, which is a property
of the machine.

**A ROW THIS BUILD CANNOT JOIN IS SHOWN, NOT HIDDEN.** The browser greys a
session with the reason on it (`sessionRowRefusal`, judged with the very
`refuseHandshake` the host's `admit` runs). A player whose friend is on a newer
build and whose list is simply empty concludes the feature is broken; one who
sees "ONE OF YOU NEEDS TO UPDATE - HOST BUILD 1.5.0" goes and updates.

**AN INVITE ARRIVES BEFORE THE GAME DOES.** `+connect_lobby <id>` (Steam, when a
friend accepts while the game is closed) and `--connect <addr>` (a shareable
link) are read by `electron/src/net-invite.ts` and PARKED until the page is up —
at startup there is no window to hand them to, and on a `second-instance` event
the process that received them is about to exit. They are delivered on the
page's `did-finish-load` as the bridge's one unsolicited event, and consumed:
an invite left parked would re-join the same session on every reload.

## What is NOT here yet

- **The Steam path is written but unproven.** The binding's legacy P2P API is
  polled, deprecated and thinner on guarantees than SDR, and the plan is
  unsparing about spiking it under load before the UI rests on it. The direct
  UDP path exists partly as the insurance policy on exactly that.
- **A screen still stops the world.** `GamePhase` has 19 members and 16 of them
  halt the simulation outright; eleven are per-player UI (`paused`, `levelup`,
  `respec`, `inventory`, `map`, `questLog`, `shop`, `quest`, `talk`, `choice`,
  `companion`) that in co-op must not freeze the other seven. Splitting the
  concept — `state.phase` keeping only what is genuinely global, a new
  `Player.screen` carrying what one player is looking at, with that player still
  standing on the field and still killable — is PR 3's §3.2 and has NOT landed.
  The verbs that raise those phases already travel (PR 1.5); what is left is
  changing what they MEAN.
- **Nothing is predicted.** A client shows its own hero where the last snapshot
  put him, so its steering costs a round trip of felt latency. PR 3's §3.3 is
  the fix: input frames with a sequence number, the LOCAL hero's movement
  predicted by replaying unacknowledged input, everybody else interpolated one
  interval behind — and combat deliberately NOT predicted, because that is a
  rollback problem this codebase has no machinery for and the player would
  experience as monsters un-dying.
- **A joiner's run is not banked.** The spectator's THROWAWAY character
  (`spectatorCharacter`) is still what a joining client plays on, so nothing a
  seated player earns reaches their own roster. Banking eight characters is
  PR 4's §4.5.
- **A hero's private verbs still name seat 0.** The command channel carries no
  seat, so a shop, an equip or a stat spend arriving from a joiner is applied to
  the host's hero — 20 of the 72 verbs in `applyRunCommand`, and they are spelled
  `state.players[0]` on purpose so the list is a grep rather than a read. The
  dispatch is where the seat has to arrive, and it comes BEFORE the per-player
  screens rather than after them: `openInventory` cannot be made non-blocking per
  player until it knows which player. See the plan's §3.7.
- **An abandoned hero is nobody's yet.** A seat is never spliced out, so a player
  who leaves has a body left standing. It stops walking (their last input frame
  is cleared), but it still holds a seat, still counts in `partyLevel`, still
  draws aggro, and still counts as ALIVE — so a group whose fourth player quit
  cannot lose the run. The policy belongs with PR 4's corpse and respawn, and is
  written up at both ends (plan §3.7 and §4.2).
- **Nothing has been proven on eight machines through a real NAT**, and it
  cannot be from CI: that criterion, the UPnP mapping against a real router, and
  the packaged `npm run electron` launch all need hardware this repo's checks do
  not have. See the plan's §2.5.3.
