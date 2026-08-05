# Multiplayer — the shipped architecture

The build plan is [`multiplayer-plan.md`](multiplayer-plan.md); this file
describes what actually exists. **Every numbered phase through the plan's
§5.5.3 R1 has landed.** The simulation runs in its own
process, the run loop drives it, the wire between it and a renderer is
complete and tested, the desktop shell forks and supervises a session, a
session can open a UDP socket and a Steam lobby and admit remote clients
behind a challenge handshake, the title menu has the three doors that let
somebody walk through it (**HOST GAME**, the **server browser**, **JOIN BY
ADDRESS**) — and a run carries a **PARTY** rather than a hero: an admitted
player is seated with their OWN roster character, sees the whole party on the
field and the HUD, trades across a real window, travels through doors with
everybody else, and leaves with everything they earned banked on their own
device.

The screens are per-player too (§3.2): one player in their bag no longer stops
the world for anybody else — the run halts only when EVERY hero in play has a
screen up, which solo is exactly the freeze it always was. The client-side
LATENCY answer is in too: the local hero is PREDICTED by running the engine's
own movement pass over unacknowledged inputs, and every other hero is
INTERPOLATED one publish interval behind — see **Prediction and
interpolation** below. What remains open is listed at the foot of this file.

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

**A SURVIVING `state.players[0]` IN `src/game/` NOW CARRIES ITS OWN REASON.**
The sweep that closed the last of them classified every site into three kinds,
and only the third is allowed to remain unannotated-free:

1. A **private read** that was not a parameter yet — the merchant's mutators, a
   consumable's spend, a crate's appetite roll, the AUTO PILOT's purse, a
   weapon's crit class. Fixed by taking the acting hero.
2. A **party question answered with seat 0** — a boss's locked bearing, a
   hostile round's victim, an escort's leader, the lift's rider, the guidance
   arrow's scout, the level-up shockwave's origin. Fixed with `party.ts`'s own
   vocabulary, or with the mob's `quarry` where the answer is "the hero this
   thing is dealing with" (that is what `AbilityCtx.target` is).
3. A **legitimate seat 0** — three shapes, and each survivor says which it is in
   a comment beside it: a `?? state.players[0]` fallback on an
   already-parameterized function (the party is wiped, or a legacy caller named
   nobody); code that runs while the party is one hero BY CONSTRUCTION
   (`createGame`, `createRunFromParams`, a met-before merchant reveal — all
   before any client can have joined); and the developer's own host-only hooks
   (`?scenario=`, `window.__nuke()`, `window.__levelup()`).

So a bare `state.players[0]` with no comment is, once again, an un-migrated
site rather than an answer — which is the only state in which that rule can be
enforced by reading the diff.

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

**And the WEATHER is aimed at a HERO, not at the middle of the party** —
`hazardFocus` (`src/game/hazards.ts`) is the ONE answer for all of it: the meteor
rain, the sand storms, the stampede's lane, the hay. It is the wave ring's rule
one level down, and the same trap caught every hazard in the game at once,
because each was written against `partyCentroid` with a TRUE comment beside it
saying single player was untouched (with one hero the centroid IS that hero) —
so nobody could read the party case until the simulator grew one. A blast bills
EVERY hero in range, so aiming at the centroid drops it in the middle of a tight
party, caught by every rock where a soloist is caught only by the ones he
misses; while a SPREAD party's centroid is empty floor and the hazard stops
existing at all. Measured on the moon: a party of two landed 2 kills in three
minutes against the same seed's solo 128, and 145 once the rain was aimed at
somebody. **The roll is SKIPPED at one hero rather than answered** — `state.rng`
is the run's one stream, so spending a draw there moves every seeded
measurement, replay and test in the repo.

**The run ends when the party falls, not when a hero does** (`partyWiped`). One
player going down is a setback the rest fight through — and what that setback
IS shipped with §4.2 (`src/game/downed.ts`), Diablo 2's shape whole:

- **The FALL.** A hero at 0 hp while the party still stands goes DOWN
  (`downHero`, the step pipeline's sweep): their own DEATH TOLL is billed at
  that moment (the wipe toll later skips a hero already `downed`, so no fall
  is ever priced twice), their worn kit is stripped onto a **corpse** where
  they fell (`state.corpses`, public in the replication split — worn gear was
  always visible), and the never-empty hand holds the minted sidearm. The body
  lies on the field; `heroInPlay` already answered for everything else.
- **The WAY BACK is a verb.** `respawn` (a run command like any other — the
  acting hero is the admitted seat) stands a downed hero up at the level's
  start at full health: the toll was paid at the fall, so the respawn costs
  the walk. When to take it is the player's own call — there is no timer.
- **The CORPSE is the owner's alone.** Walking back within
  `CORPSE.recoverRadius` takes the gear back piece by piece — worn again where
  the slot is free (the minted sidearm is discarded for the real weapon, never
  banked), to the bag where it is not, and a piece with nowhere to go STAYS on
  the body, which leaves the field only when emptied. Another hero standing on
  it all day takes nothing, and the server is what enforces that.
- **An unrecovered corpse never costs the kit.** `extractLoadout` folds
  whatever a hero's corpses still hold into the banked loadout's VAULT — the
  LOST & FOUND, whose whole purpose is gear the player did not choose to lose
  — so every banking path (victory, travel, defeat) keeps the promise at once.
- **Solo is untouched, structurally.** One hero at 0 hp IS the party wiped, so
  the wipe path (`enterDeathScene` → the death scene → defeat) fires on the
  same tick it always has and none of the above runs: no corpse, no flag, no
  per-hero toll. Every §4.2 rule is an exact no-op at one hero, the same
  property every §4.3 rule shipped with.
- **HARDCORE NEVER MIXES WITH SOFTCORE** — enforced at the door, not in the
  engine (which still never learns hardcore exists). `SessionParams.hardcore`
  marks a hardcore character's session, the `join` frame carries the joiner's
  flag, and `admit` refuses a mismatch either way round
  (`hardcore-mismatch`), after the challenge so a spoofed address learns
  nothing. The probe reply names the session's mode so the JOIN screen can
  pre-empt the refusal without a round trip.

Its per-player `dying` screen came free, because the screens ARE per-player:

**THE SCREENS ARE PER-PLAYER (§3.2).** `state.phase` keeps only what is
genuinely global — the scenes, the spare-or-kill `choice`, victory and defeat —
and what one player is LOOKING AT is `Player.screen` ("paused", "levelup",
"respec", "inventory", "map", "questLog", "shop", "quest", "talk",
"companion"). A hero with a screen up contributes no steering but still stands
on the field, still auto-fires at what comes close, and can still be killed —
D2's rule, and what makes opening your bag mid-fight a decision. The world
halts only when EVERY hero in play has a screen up (`partyBlocked`), which is
what keeps a solo game's bag exactly the freeze it always was. Three
consequences worth knowing:

- **A LEVEL-UP BANKS instead of pausing** (decision 4 — a real single-player
  behaviour change): the ding celebrates on the field, the points bank on
  `Player.pendingStatPoints` (and the talent queue on
  `Player.pendingTalentPoints`, moved off the run), and the chooser is a
  non-blocking screen opened on demand (`promptPendingPoints`, the HUD's
  points pip) and closeable with points still banked (`closeLevelup`). The
  RESPEC stays the one modal: it holds its owner until the refunded pool is
  re-placed.
- **A quitter's or a downed hero's abandoned screen holds nothing shut** —
  `partyBlocked` only counts heroes in play. That is the structural version of
  the fix `releaseStuckLevelup` used to bolt on, and the reason that function
  no longer exists.
- **A conversation is held by its opener, one at a time.** The quest offer and
  the talk tree stay records on the RUN (`questOffer`, `talk`); the holder is
  the hero whose screen is up, every conversation verb is gated on holding it,
  and a second hero walking up mid-conversation is politely refused. The
  spare-or-kill `choice` stays a GLOBAL beat: shown to everybody, the world
  frozen for it — the plan's killing-blow-owner gate still waits on the kill
  chain learning who landed the blow (nothing threads the attacker through
  `hitEnemy` yet).

**A seat is appended, never inserted, and never spliced out.** Every command and
every input frame in flight names a seat by INDEX, so renumbering the party
mid-run would deliver seat 4's steering to seat 3's hero.

**So a player who leaves is DEPARTED, not removed — and `heroInPlay` is the one
predicate that says what that means.** The body stays where it is at the index
it always had, and the world stops answering for it: `Player.departed` reads
false through `heroInPlay`, so it is not chased, not in the centroid, not in
`partyLevel`, not a pack's alarm clock, not a hazard's victim, not a share of
the menace meter's per-capita read, and — the sharp end — not ALIVE, so
`partyWiped` can fire and a group whose fourth player quit can lose the run.
Before that flag existed four separate rules answered for the body by accident,
and the worst of them made such a group undefeatable: the abandoned hero stood
at full health for the rest of the run while the three people still playing were
wiped over and over without it ever ending.

The predicate deliberately folds "at 0 hp" and "nobody is steering this" into
ONE check, because every question above has the same answer for both; splitting
them is how one of the eight sites quietly keeps reacting to a body nobody is
behind. And the seat is HANDED OUT AGAIN: `nextFreeSeat` gives the next arrival
the lowest departed slot, so a session people have come and gone from is not
eventually full of corpses holding seats nobody can use. Re-use is only safe
because the departing player's commands and input frames left with them —
a seat vacated by anything else (a dead hero, a player in a menu) must never be
recycled.

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
server/client.ts              snapshots back into a run — @game/client
pwa/src/game/net/driver.ts    host a run, or join somebody else's
pwa/src/game/title-screen/    the three doors (menus-net.ts, use-sessions.ts)

server/bot-client.ts          a headless joiner that PLAYS — the soak's engine
scripts/bot-client.mjs        a fleet of them, pointed at an address
```

**`server/client.ts` IS THE ONE CLIENT, and it is in `server/` rather than
`pwa/` on purpose.** It is the only thing in the repo that turns snapshots back
into a run — it builds the level for itself, applies what the server sends, and
hands its holder the same `GameState`-shaped object the renderer has always
read. A BOT CLIENT needs exactly that and has no renderer to put it in, and a
second client written beside this one would be the drift the instrument exists
to catch: what a bot proves playable has to be what the page actually reads. The
one app-shaped thing it used to do — telling `local-seat.ts` which chair the
server gave us — is the `onSeat` callback, and the page passes `setLocalSeat`.
It is reached through the `@game/client` alias, which lives in all four config
maps plus `scripts/game-alias-loader.mjs`.

The JOINER's half of the wire is `server/net/connect.ts`, and it lives beside
the hub rather than in the shell or in the page for the two reasons the seam
itself moved here: a page cannot open a UDP socket at all, and phase 5's dedicated
server has no shell to put one in. The session process therefore has **two
roles** — `start` makes it a HOST (it simulates, and the renderer is its first
client), `connect` makes it a JOINER (nothing simulates, a socket is opened
outward, and the same `MessagePort` carries somebody else's frames to the same
renderer). The page's client cannot tell the two apart, which is exactly why
joining cost one small module rather than a second client.

`server/wire/` is the vocabulary both ends speak, and it imports nothing at
all — not even the engine. Both halves read it, and the page reads it from
screens that may sit on the app's startup path, where the 200 KB critical-path
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
  transport safe in phase 2.
- **PRIVATE — to its owner alone.** The bag, the purse, the stats, the talents.
  This is simultaneously a bandwidth win, a privacy win and **the anti-cheat
  boundary**: a client that never receives another player's bag cannot
  manipulate it, which is what will make phase 5's trade window honest. It is a
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
  the day phase 2 opens a UDP port.

  **THE ARGUMENTS ARE PART OF THAT MODEL AND ARE SCALARS ONLY.** phase 1's nine
  verbs took none; phase 1.5's sixty-nine mostly do (the list has grown since —
  `RUN_COMMAND_NAMES` is the count, and every addition bumps
  `PROTOCOL_VERSION`). A verb whose payload is a
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
  startup path where the 200 KB budget forbids reaching `@game/core`.
  `tests/engine/run_commands_test.ts` fails the build when the two disagree —
  the same snapshot-and-drift-test shape `mod/catalog.json` uses.

  **THE APP HAS ONE DOOR ONTO THE LIST**, `pwa/src/game/run-commands.ts`, and
  every one of the ~110 call sites goes through it. It applies through the SAME
  dispatch the server does, so a verb cannot behave one way in single-player and
  another in a session; when a run driver installs a sink it applies locally AND
  sends, so the call sites that read what a verb returned still get an answer and
  the server's next snapshot corrects it. That is NOT the input prediction phase 3
  owns — there is no rollback and no replay, only a UI verb applied twice.

- **CHAT**, added by phase 2 — one line of text, parsed by the server
  (`server/wire/chat.ts`) into one of six names from a **second** closed list,
  for exactly the same reason: a chat box that handed the session an arbitrary
  verb would undo the command channel's allow-list beside it. It is the ONE
  thing a spectator may do, and the room refuses a spectator's `/players`,
  `/kick` and `/invite` **by name** rather than ignoring them — a command that
  silently does nothing is indistinguishable from one that is broken.

phase 1 shipped the nine scene-advance verbs. **phase 1.5 added the other sixty** —
the screens, the run's own flow, the bag, the counter, the build, the party, the
errands, the conversations, the vault and the AUTO PILOT ride — not phase 3, as the
plan originally said, which was a circular dependency: the run loop cannot move
into the server until every verb it calls can travel. The two halves are
separate jobs on the same names. **phase 1.5 makes them TRAVEL**, with today's
blocking semantics exactly preserved — opening the inventory still freezes the
run, because that is what it does now and the cutover may not change how the
game feels; **phase 3 makes them NON-BLOCKING** per player, which is the design
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
  touch the main process's event loop, and phase 5's dedicated server inherits the
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
4. **A seat, and the hero they brought is WEIGHED before the simulation is
   handed it** (`validateLoadout`, §5.3): the level held inside the ladder, each
   stat inside the level's own `statCap` and the block inside what that level
   has paid for, and every item checked against the catalogs. That last one is
   the crash rather than the cheat — `gearDef` throws on an id it does not hold
   and is called from the damage pass and the paper doll, so one packet took the
   host's process down. It SANITIZES rather than refuses, because the case it
   fires on most often is an older save carrying a retired id, not an attacker;
   what it corrected is logged host-side only, since telling a joiner which
   field failed is telling an attacker which field to fix. **It is a speed bump,
   not a wall** — everything it checks is something a legitimate hero could
   genuinely have.

Per-address token buckets keep a flood cheap, and they are keyed on the ADDRESS
rather than the address and port — a flood trivially varies its source port.

**And a FOURTH bound covers the peer who got IN.** The three above stop a
stranger; none of them stopped an admitted client sending sixty thousand chat
lines a second, each of which the session parses, dispatches and broadcasts to
everybody else. A seat is a licence to be heard, not a licence to be heard at
any rate, so an admitted peer draws on a bucket of its own — sized off what a
client legitimately sends (an input per tick, an ack per publish, chat and
commands between them) rather than off a round number. Over it, packets are
DROPPED, which is the same answer the reliability layer already gives a lost
datagram and one the game recovers from by design; only a peer that runs a real
DEBT is dropped, with a `bye` that says why. Two thresholds, because a burst on
a recovering connection and a flood are different things and treating them alike
either kicks a friend or tolerates an attacker. The budget is spent BEFORE the
frame is decoded — a decode is the cheapest thing the session does with a packet
and still the thing a flood buys in bulk.

**Every decoder is fuzzed** (`tests/engine/net_fuzz_test.ts`), and the pass
found four real ones — all in the DELTA APPLIER, reachable by a malicious HOST
rather than a malicious client, which is the direction nobody thinks of: a
joiner applies whatever it is sent and has no more reason to trust that host
than the host has to trust it. A null entry read for its discriminant, a `del`
that was not iterable and an `upd` holding something with no `id` each took a
joiner's renderer down from one packet; a byte field claiming a length of a
billion took the machine down. The applier is total over arbitrary JSON now, and
IGNORING a member of the wrong shape is right rather than merely safe: a delta
is coded against an acknowledged baseline, so a dropped field is exactly a
dropped packet, which the next publish corrects.

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
always.

The MEASURED tuning pass is still owed: it needs the multi-player headless
campaign that does not exist yet (see the last section). What has landed beside
it is the meter it had to be reconciled with — below.

## Bot seats — a party without four friends online

The HOST screen's BOTS row (and the dedicated server's `--bots N`) fills empty
seats with autopilot heroes. **A bot seat is a client seat**: each bot is the
same `createNetClient` a human joiner is — `server/bot-client.ts` over an
in-process loopback pair (`server/local-bots.ts`) — admitted through the same
`session.addClient`, so every rule that governs a client governs a bot
unchanged, by construction. The bots run inside the session process, on client
ids of their own (from 1000), ticked from the host's one clock; `host.ts` owns
their creation, so the forked utility process and the dedicated terminal share
it rather than duplicating it.

Five rules ride on the public `Player.bot` flag, each enforced where the thing
is decided:

- **A bot takes no XP** (`splitXp`, `src/game/xp-share.ts`): no cut, no head in
  the party bonus, no level in the weighting — and the nobody-in-range fallback
  pays the nearest PERSON, never a bot standing closer. A botless run walks the
  exact branches it always did.
- **A bot seat prices the horde like a `/players` step** — one function in
  `server/session.ts` applies `playerScaling((override ?? 1) + botSeatsInPlay)`
  from the chat hook and from every bot seating/departure alike, both knobs
  together as always.
- **A bot yields its seat to a person.** A session full of the host's own bots
  is not full: the admission desk does not count bot seats against the cap, and
  `addClient` departs the most recently seated bot (down the ordinary removal
  path — no reconnect ticket is ever minted for one, so the seat frees at once)
  before seating the arrival.
- **A bot's run is nobody's roster**: loadout null (the authored fresh start),
  nothing banked — there is no device and no roster behind it.
- **A botted run is a party run**: the second seat stamps `GameState.party`
  exactly as a human joiner would, so it stays off the leaderboards.

The flag travels only one way: the hub builds its seat request by hand and
never forwards a joiner's claim, so `bot: true` on a stranger's join frame is
dropped on the floor. Desktop/Steam builds only, like all hosting — the whole
branch is gated on `netBridgeAvailable()`. Steering a bot's build or watching
through its eyes is the app's BOT VIEW, which is a different feature and stays
one.

## What a kill is worth, and whose it is

Three rules a run does differently once there is more than one hero in it. All
three are exact no-ops at one hero, which is what makes them safe and is also
the trap: a single-player test proves nothing about any of them.

**XP is proximity-gated and level-weighted** (`src/game/xp-share.ts`,
Diablo 2's shape). Only heroes near the kill share it, and the pot splits in
proportion to level. Both halves are load-bearing and both are counter-intuitive
in the same direction:

- Without the GATE, a party's optimal play is to scatter to the four corners of
  the map and farm four fights at once for four times the XP each — which is not
  a party, it is four solo runs sharing a lobby.
- Without the WEIGHTING — i.e. with the even split that looks generous — a
  level-90 running a level-12 through a map hands over half of every kill, so
  grouping with somebody below you is a straight tax and nobody does it.
  Weighted, the veteran keeps most of the pot and the newcomer still gains far
  more than they could alone, because the horde is priced against `partyLevel`:
  a sixth of a level-90 kill is a sixth of something enormous. That asymmetry IS
  the power-levelling D2 is famous for, and it is the reason bringing a friend
  is worth doing.

Only a KILL is the party's. A handed-in errand and a scripted grant each have an
obvious owner and go through `grantXp(state, hero, amount)` directly — sharing
one out to the neighbours would be a gift from the player who earned it to one
who did not. The per-map XP cap is read against the RECIPIENT's level, so a
level-90 in the party cannot throttle the level-20 beside them down to an
outgrown map's trickle — and so is an XP SCROLL's double-XP window
(`Player.xpBoostMs`), which is why a scroll doubles its reader's cut of a party
kill and nobody else's: the split happens first, and `grantXp` multiplies each
cut against the hero it is paying.

**Loot is FREE FOR ALL by default, with a host toggle for ALLOCATED**
(`GameState.lootMode`, HOST GAME → LOOT). Free-for-all is D2 classic and the
scramble for a legendary is most of what makes a party feel like a party;
allocated exists because that same scramble is why strangers stop playing
together. An allocated drop is stamped ONCE, at the moment it is thrown, with a
seat rolled among the heroes who were in the fight — never re-decided, since a
drop that changed hands because somebody walked past it would break the only
promise allocated loot makes. It is stamped in `dropItem`, the one funnel every
drop in the game goes through, which is why no call site had to learn who killed
anything. The roll is off the ITEM'S HASH rather than `state.rng()`, exactly as
the toss scatter is: consuming a draw would make an allocated session roll
different items from the same seed than a free-for-all one.

An allocated drop is visible to everybody and deliberately NOT in
`PRIVATE_PLAYER_FIELDS` — hiding it would make a party walk over piles they
cannot see on the way to their own.

**The menace meter reads the party's output PER CAPITA** (`tickMenace`). The
damage and kills it is handed are the RUN's totals, summed over everybody, and
the question the meter asks — "is this too easy" — with eight people in the room
honestly means "is it too easy FOR EACH OF THEM". Fed the raw sum it reads eight
times the DPS it was tuned against, saturates within about a minute, and because
the evolution ratchet is a PERMANENT floor within a run it never comes back
down: an untuned meter does not merely make co-op hard, it makes it hard for
ever after the first minute. The divisor is the party in play, so a departed
seat and a downed hero both stop diluting the read the moment they stop
fighting.

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
| `tests/engine/party_test.ts`             | Every shared read the plan's §3.1 table answers, each staged with two heroes  |
| `tests/engine/coop_rules_test.ts`        | The abandoned hero, the XP split, allocated loot, and the per-capita meter    |
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

## Reconnect — a dropped player comes back to their own hero

A dropped connection and a player quitting are the same event as far as a socket
is concerned, and only one of them should cost somebody the run they are an hour
into. So every departure HOLDS the seat for `RECONNECT_GRACE_MS` (thirty
seconds) and hands the person who left the only ticket back into it. Presenting
it resumes the hero as it stands — every point of xp, every item, every level —
rather than building a fresh one out of whatever loadout was last banked.

The split of responsibility is the load-bearing part. The **engine** only
honours a flag (`Player.held`, skipped by `nextFreeSeat`, cleared by
`resumeHero` / `releaseSeat`), because it has no clock and a grace window
counted in ticks would run at the speed of the simulation: a host that hitched
would hold seats longer than it meant to, and a paused session would hold them
for ever. The **session** owns the window, swept from its own `advance`, since
nothing below the session owns a timer.

Four rules:

- **The ticket is DERIVED** from the process's secret and a nonce, so nothing is
  remembered until somebody actually leaves and a seat's second occupant never
  holds a key its first one was given.
- **It is spent on use**, whether or not the seat was still resumable — a spent
  ticket left in the table is a second way into a seat somebody is now in.
- **A resume IGNORES the loadout on the join.** The hero standing on the field
  is the authoritative one; dressing it in a stranger's claim would hand a
  reconnect the one thing a fresh join is checked for.
- **An unknown ticket is an ordinary arrival, not a refusal.** Somebody who took
  too long to come back should get into the game, not be told no — and the same
  answer covers a guess, which is why there is no refusal reason for it.

The joiner process remembers each host's latest ticket for its own lifetime,
which is the span the feature is about; a ticket on disk would be a credential
for a session that has ended.

## Trade — one item across a table

`src/game/trade.ts`, and the whole design is one sentence: **the swap is a
single transaction, on the authority, or it does not happen.** `settleTrade`
does every check before it moves anything, so there is no reachable state in
which an item has left one bag and not arrived in the other. Four rules keep
that sentence true:

1. **An offer names a CELL and an ID, and the cell is re-read at settlement.** A
   cell alone may have changed since the offer (a sale, a sweep, a mercy drop
   landing); an id alone would have to be searched for — and finding the same
   item somewhere else in the bag is exactly how a trade hands over something
   the offering player never put on the table. A cell that no longer holds its
   id refuses the whole trade rather than guessing.
2. **Any change clears both acceptances,** so an acceptance can only ever
   describe the table as it was seen. Waiting for the other side to agree and
   then swapping what is on the table is the oldest trade-window scam there is.
3. **An offered piece may not be spent.** It stays in its owner's bag until it
   crosses — which is what makes a cancel cost nothing — so equip, discard and
   rearrange refuse it up front. Rule 1 would catch them, but a minute later and
   with no way to explain why.
4. **A departing seat's trade goes with it,** or the partner is stranded at a
   table whose other side will never accept and whose cell stays locked all run.
5. **Nobody raises a table on somebody else's screen.** A trade is REQUESTED
   and the other player answers it — D2's shape, and the reason is not manners:
   the table is a `"trade"` screen on BOTH seats, so a unilateral open takes a
   teammate's controls away mid-fight.

### The ask (rule 5)

`requestTrade` records a `TradeRequest` — two seats and the moment it was made
— on `state.tradeRequests`, and opens **nothing**. The target gets a pip on
their HUD under the party frames with YES and NO on it; the hero keeps
fighting behind it. Only `acceptTradeRequest` calls `openTrade`.

- **It is run state, not a private field,** for the same reason `trades` is: an
  ask is a fact about two seats, and half of one held on each side is how the
  two halves come to disagree about whether it still stands. It replicates with
  everything else on the run — see the note in `server/wire/split.ts`.
- **It carries a STAMP, not a countdown.** `atMs` is `GameStats.timeMs` when it
  was made, so a standing request is a field the snapshot differ writes once
  and never resends; a `msLeft` ticking down would be twenty writes a second
  for half a minute. `stepTradeRequests` sweeps the lapsed ones each tick,
  straight after the clock they age on — which means an ask does not age while
  the whole party is behind screens.
- **`TRADE.requestMs` (30 s)** is about one pack: long enough that "after this
  fight" is a real answer, short enough that a forgotten ask cannot raise a
  table minutes later.
- **One outstanding ask per seat.** A re-request replaces the old one and
  refreshes its clock, so nobody can paper a teammate's HUD with pips.
- **The requester must be free; the target need not be.** Somebody in their bag
  is exactly who a non-blocking ask is for, so the busy-hero refusal stays
  where it belongs — on the accept, as rule 5's backstop. An accept that
  refuses spends the ask anyway: a request that survived its own failure would
  be retried into the same refusal for ever.
- **A lapse, a decline, a departure or a knockdown all dissolve it cleanly**
  (`endTradesFor` drops the seat's asks in both directions), so nothing stale
  can raise a table later.
- **`openTrade` is not on the command allow-list** — only `requestTrade`,
  `acceptTradeRequest` and `declineTradeRequest` travel. The engine function
  stays, reached only through an acceptance.

`TradeSide.item` carries a COPY of the offered piece, because a bag is PRIVATE
and the partner has no other way to see what is on the table; it is presentation
and never authority — the swap re-reads the real cell. `trades` is deliberately
not a private field: a trade is a fact about two seats, and a per-owner rule
would show each side its own offer and not the other's.

**There is no shared STASH, deliberately.** A stash is account-shaped state that
would have to merge across devices through cloud save and carry a migration
ladder of its own; what players mean by "trade" is handing a friend the sword
you just found, and the vault already covers "I threw something away and want it
back".

## The dedicated server

The utility-process server and the standalone one are the same code.
`server/host.ts` owns the session, the admission desk, the sockets, the router
mapping and — the part that must not be copied — the fixed-timestep loop, whose
second copy would drift from the first silently and only under load.
`server/main.ts` picks its entry from whether anybody forked it: with a
`parentPort` it is the game's session server, without one it hands over to
`server/dedicated.ts`. One binary, so there is no second one to forget.

```sh
npm run server:start -- --port 27015 --level moon --difficulty medium
npm run server:start -- server.config.json
./Ada\'s\ Trail --dedicated --bots 3 --verbose
```

The Electron executable's `--dedicated` mode enters that same server entry
without initializing Steam or opening a window. `--bots` accepts 1–8. Counts
below 8 fill the party only after the first human has joined, preserving seat 0
for them; bot seats yield to later human arrivals. Eight bots start immediately
for an autonomous soak or demo. `--verbose` prints detailed status once a
second (`--debug` is reserved by Electron itself).

The terminal always reports lifecycle edges: game start, player joins, deaths
and quits, level completion, and campaign completion. `--verbose` adds periodic
telemetry; it is not required for those events.

Ctrl-C begins a one-minute graceful shutdown announced to chat, with another
warning at 15 seconds and a 10-to-1 countdown. A second Ctrl-C exits
immediately; SIGTERM remains immediate for service-manager shutdowns.

**Nobody owns it, and three rules follow** (`SessionOptions.ownerless`). Seat 0
starts DEPARTED so the first arrival is seated into it with their own loadout;
an empty server does not simulate at all (every hero out of play would otherwise
wipe a run nobody has played, and an idle machine should cost nothing); and the
run carries the PARTY STAMP from the first tick, because whoever operates a
machine you connect to has exactly the standing a listen server's host has.

That rule exists because running one found the bug. The host is identified by
being the FIRST client to ask for a seat — true only because in the shipped
topology the host's own renderer always connects first, over a `MessagePort`,
before any socket is open. A dedicated server has no such renderer, so the first
person to join over the network was mistaken for the host and handed a DEFAULT
character instead of the one they brought.

**No Steam** is a consequence rather than a feature: `steamworks.init()` is a
single global handshake the desktop shell's main process owns, so the relay
transport is something the SHELL adds to a host. A dedicated server has only the
direct UDP path, which is the transport that already carries the whole protocol
and the only one that works on a LAN with the internet off.

## Leaderboards, achievements, and what a co-op run is worth

**The host is a player, so the host can cheat.** That is the accepted cost of a
listen server — fine among friends, fatal for a ranking — and seven people
helping inflates every board-facing record without anybody having to cheat at
all. So a run more than one person has played is MARKED (`GameState.party`, a
`PartyStamp`) and reaches no ranking.

The mark is **latched** in `seatHero` rather than seeded from `SessionParams`,
which is a deliberate departure from the plan's own sketch. A run is marked by
what HAPPENED to it, not by how it was opened (a host who plays alone with the
door open is playing solo); a parameter is a thing one of three builders can
forget; and because it is ordinary DYNAMIC state the latch replicates for free,
with no wire field and no protocol bump. It never clears — the party emptying
out does not give the run its records back.

The two readers genuinely disagree, so the ledger keeps both:

- **A party kill counts for everyone present** on the badges, or half of them
  are unearnable in the mode the player is enjoying.
- **The four platform boards rank SOLO play alone.** The board-facing figures
  live in `LifetimeTotals.solo`, booked by the same reducers off one flag, and a
  save written before co-op existed seeds them from the lifetime figures they
  used to be. The two hardcore campaign boards refuse a campaign any leg of
  which was played in company — latched on the tally, since by the time one is
  banked the co-op leg is three venues back.

The honesty this owes: it stops a co-op run reaching a board, and it is not an
anti-cheat. A determined host can still forge a solo record, exactly as they
could before multiplayer existed.

## What has landed, and what is still owed

phases 1, 2, 1.5, 1.75, 2.5, **phase 3's §3.1 and §3.2**, **phase 4** (the
abandoned hero, the per-player death/corpse/respawn — see "the run ends when
the party falls" above — the co-op rules, and now §4.4's mods and §4.5's
banking + party HUD), **phase 5**, **phase 6** and **phase 5.5's R1** of the
plan's phases have landed. THE GARAGE (the plan's §6.8) is the
home base the mode was owed: a static hub level whose `hub` objective never
clears, a merchant PARKED at his counter, standing travel doors
(`LevelDef.travelDoors`) as the level select — the car boards and drives out,
the rocket and the sealed rift seam open the destination picker — and the
campaign now opens there.

**AND A CROSSING NO LONGER ENDS THE SESSION (§6.4).** With the doors armed or
a party aboard, travel is a run command (`travelTo`, seat 0 only — the host
chooses the road) the SESSION consumes between ticks: every seat's loadout is
extracted through the one banking funnel, the destination is built from the
session's own parameters with a derived seed, the party is re-seated in the
same order (departed and held seats keep their flags, the PartyStamp
survives), and every client is re-baselined with FULL snapshots until one is
acknowledged — a delta coded against the old level's baseline would name
entity ids the client no longer holds. The app end keeps the driver across
the remount, joiner-style, and each device banks its OWN hero off the level
being left (`NetClient.onTravel`). A solo local run keeps the app-side
crossing byte-identically.

**AND THAT INCLUDES VICTORY → NEXT LEVEL, WHICH IS WHAT A CAMPAIGN IS MADE
OF.** It was the one crossing left re-mounting app-side, so a party playing
the campaign was kicked apart at every level completion and had to rejoin by
hand. It routes through the same `travelTo` now
(`RunProgress.travelTo(state, to, { banked: true })` — the `banked` flag says
the hero is already on the character, because `recordVictory` put it there a
beat earlier together with the clear and the campaign tally). The splash is
seat 0's: a joiner's copy shows THE HOST CHOOSES THE ROAD rather than two
buttons the session would refuse, and keeps STAY, which any seat may send.
One thing the session has to work out for itself on this crossing — the app
that would normally answer it is not the one banking — is that **the level
being left is now CLEARED**: the destination's `clearedLevels` gains it when
the run crosses out of `victory`, `outro`, or a STAY on the cleared field, so
clear-gated drops (the bunker key) stay correct for the rest of the session.

Two ways out of a run still re-mount app-side, and both are deliberate rather
than forgotten: the victory splash's **RESTART** and the **AUTO PILOT**'s
automatic next-lap routing. Neither is a CROSSING — they replay the level the
party is already on, which `travelTo` refuses by name (`dest ===
state.level.id`), and which a client would not even notice as a swap, since
`NetClient.applyWhole` reads a crossing off a CHANGED level id. Giving a
session a re-roll verb is its own piece of work; until then RESTART is hidden
from a joiner and ends the host's session exactly as leaving does.

**THE PARTY IS VISIBLE, AND A JOINER IS A FIRST-CLASS PLAYER (§4.5).** The
field pass draws every hero in play — their own public worn kit through the
shared paper-doll pass, the downed sprawled where they fell, the local hero
last and on top — and party frames hang down the HUD's left rail (dressed
bust, hp sliver, level chip, DOWN gray, a BAG badge for a hero in their
menus, the roster's name for the seat via `RosterEntry.seat`; a press asks
for a trade). A joiner brings their ACTIVE roster character: the loadout
rides the join (purse funded from their whole wealth, exactly as a local
run's), the session weighs and seats it, and every banking path a local run
has — victory, travel, softcore defeat, plus the mid-run leave — writes to
the joiner's own roster on their own device. The throwaway
`spectatorCharacter` now covers only true watchers (a client the session
could not seat), so a watcher can never bank the host's bag. Achievements
and the lifetime ledger count for a seated joiner (decision 12); the boards
stay honest through the PartyStamp.

**MODS RECONCILE AT THE DOOR (§4.4), and the fix under it was bigger than the
feature**: the session process never had a mod's catalogs at all — the page's
`registerDefs` never reached it, so every modded HOSTED run (on Steam, every
modded run) simulated the shipped game while the renderer drew the mod. The
exact overrides the page registers now travel with `start`. A joiner with the
host's mods installed walks through the browser row and the host's set is
applied in the host's order on the way (and `restoreBaseDefs` puts the
shipped game back when the run ends); a joiner missing one keeps the refusal,
whose press opens the game's Steam Workshop hub.

The build plan's phased remainder is CLOSED on the code side. Its three final
groups landed as follows:

- **THE WHOLE PARTY** — **LANDED**: in-session party travel, banking a
  joiner's character + the party HUD and field visibility, the trade window
  screen, mod reconciliation, and the workbench stash. The garage's quest
  giver shipped as its own story commit after manuscript confirmation: RUTH,
  Ada's mother, stands in the bay with a second campaign-long chain.
- **THE HONEST WIRE** — **LANDED**: prediction and reconciliation (see
  _Prediction and interpolation_ above), the attacker thread (a kill's crits,
  procs, drop pricing and XP value read the hero who landed the blow, and the
  spare-or-kill choice and boss-death rite are the killer's to resolve), the
  snapshot-size measurement and the partial-entity/per-index delta packing it
  demanded (27.6 KB → 8.15 KB per publish on a 135-mob field), the DEBUG net
  graph, and the licence lock (the dedicated server's config escape is dead
  code in the shipped binary — `server/licence.ts`, folded shut by
  `scripts/build-server.mjs`).
- **THE PROOF** — code half **LANDED**: bots fill a local game's empty seats
  as real clients, the party bot holds spacing, splits packs, covers the
  downed and walks errands, and the co-op tuning was re-measured with those
  behaviours in. What remains is exactly the set of acceptances no diff can
  close, listed under **What is NOT here yet**.

**§4.3's MEASURED PASS HAS BEEN RUN, AND THE ANSWER IS THAT NEITHER LEVER
MOVES.** Both prerequisites landed first: `botAct(bot, state, hero)` (164 sites,
byte-identical on two full seeded campaigns) and **`--party N`**, the simulator
flying one bot per seat with a `PartyReport` whose **PER-CAPITA rate is the read
to trust** — never the per-kill share, because a party also clears faster and
only dividing by both the head count and the clock shows which effect won.
`scripts/coop-tuning.mjs` runs it. The first pass (before the party bot could
space or split packs) read **1.1× solo at party 2** and a FALL at party 4 that
tracked the per-capita kill rate collapsing (69 → 18) — the bots crowding one
mob, not the XP split. **Re-measured after the party behaviours landed**
(moon/medium, 2 seeds × 6 min): party 2 reads **2.4× solo per capita**, party 4
**1.7×** — grouping pays at both sizes, the kill rate recovered (per-capita
13.9/min at party 4 against 7.1 solo), and neither lever moves. The diagnosis
held: the deficit was the bot's, never the economy's.

**THE PARTY BOT PLAYS LIKE A PARTY MEMBER** (`src/game/bot/party-play.ts`,
`errands.ts`): the leash, a personal spacing envelope, pack-splitting (a foe a
nearer teammate is handling is deferred when an alternative exists), covering a
downed or bleeding teammate, a convoy latch that tightens the leash on a long
march, and errand awareness (active quests' tokens, breeds and visit points
join the macro ladder; givers are never approached — taking an errand stays
the player's decision). The LEASH's number is DERIVED, not typed:
`XP_SHARE.radius` is where a hero stops sharing in a kill, so past it a bot is
spending the party's payout rather than merely standing badly. It latches with
hysteresis (pull at 0.9 of the ring, release at 0.5) or a hero oscillates on the
boundary all run; it walks to the NEAREST teammate rather than the centroid,
which is a spot on the floor where nobody is standing; and it is null in single
player, which is what keeps every existing measurement byte-identical.

**WHAT §3.1 DELIBERATELY LEFT IS NOW PAID IN FULL.** §3.2's half (the
per-player screens above, non-blocking level-up included), §4.5's half (a
joiner plays their own character and banks it), and §3.3's half — the local
hero is predicted and everybody else interpolated (see _Prediction and
interpolation_). One deliberate asymmetry stays: a joiner's run commands
travel but are NOT applied locally (`setCommandSink(…, { optimistic: false })`)
— the server is authoritative over a verb's result, so an optimistic apply
would draw an outcome the next snapshot may not agree with; prediction covers
movement, never verbs.

## The autopilot is an intent

`botAct` never touched the run — it RETURNS a `GameInput`, which is the very
shape `FRAME.input` carries, so the bot's STEERING has always been an intent and
needed nothing designed. The gap was five HOUSEKEEPING calls that reached in and
MUTATED, and on a client a direct write is erased by the next snapshot: the
bot's draw, its shed or its tidy silently does not happen. So the bot's whole
output is now an intent (`src/game/bot/intent.ts`), and every one of the five is
a DECISION plus a VERB — the decision is the autopilot's opinion and stays under
`bot/`, the action is the hero's and lives with the thing it acts on:

| the autopilot decides                     | the hero's verb               |
| ----------------------------------------- | ----------------------------- |
| `botWeaponSwapTarget` — the pocket draw   | `swapHand(cell)`              |
| `botReviveCell` — a bottle worth breaking | `spendReviveItem(cell)`       |
| `botCompanionToHeal` — who needs a kit    | `healCompanionWithMedkit(id)` |
| `botWantsGearSweep` — is there a wear     | `autoEquipGear()`             |
| `botCullPlan` — which cell can be spared  | `bankSpareItem(cell)`         |
| `inventoryNeedsSort` — is the bag untidy  | `sortInventory()`             |

**TWO OF THOSE VERBS ARE NEW, AND NEITHER IS THE PLAYER'S LOOKALIKE.** The
sweep is `autoEquipGear` rather than `autoEquipBest`, because the player's
OPTIMIZE button takes the WEAPON slot with it and the pocket arsenal owns that
slot — a sweep re-drawing the strongest weapon every tick would flap against the
draw above it. The shed is `bankSpareItem` rather than `scrapInferiorLoot`,
because that verb empties every outgrown cell at once and banks none of them: it
would destroy the banked shooters a blade hero carries on purpose and throw away
the uniques the LOST & FOUND exists to catch.

**A TICK HAS TWO HALVES.** The draw and the care are decided BEFORE the step —
the hand the bot steers with is the hand it just drew — and the bag discipline
AFTER it, once this step's pickups have landed. Culling before the step only
reopens a cell the same step's pickup refills, which is the bug that made a
watched AUTO PILOT run ride a full bag.

**THREE HOSTS, ONE VOCABULARY.** The simulator applies in-process through
`applyRunCommand` (`runBotActions` / `runBotUpkeep`) — the same dispatch the
server runs, so a verb cannot behave one way under the bot and another in a
session. The app pushes through its own router (`driveBotActions` /
`driveBotUpkeep` with `runCommand` as the sink), which is what makes a paid AUTO
PILOT ride inside a Steam session actually send its housekeeping. A bot CLIENT
calls `botIntent`, which answers a whole tick from one snapshot: the steer plus
at most one verb per half, because a client cannot read the run back between
verbs — a stage wanting several takes several ticks and converges as the
snapshots arrive.

**`tests/engine/bot_intent_test.ts` is the guard**, and it writes the mapping out
by hand rather than deriving it from the code.

## The bot client, and the soak

`server/bot-client.ts` is a headless process that JOINS a session over the real
transport, receives real snapshots, and plays its hero off the replicated state
alone. It is a socket, a clock and a seat: the client is the page's own
(`server/client.ts`) and the decisions are `botIntent`'s, so the file itself
holds no game knowledge.

**IT EXISTS TO ANSWER A QUESTION NOTHING ELSE ASKS.** `wire/split.ts` declares
what travels, and every test around it asserts that a field which CHANGED
arrived. None of them asks whether the set of fields a client HAS is enough to
make a decision with. That gap fails silently and in exactly the direction the
generic differ was built to avoid: a read moves behind a field the split
withholds, every test stays green, and a joiner's screen is subtly wrong in a way
only a human playing it would notice. A bot playing off a client's view cannot
paper over it — it stops fighting, walks into a wall, or fails to swap a weapon,
and it does so in CI (`tests/engine/net_bot_client_test.ts`).

**THE SOAK IS `scripts/bot-client.mjs`** — a fleet pointed at an address, with
§5.6's adversity available at the transport seam:

```sh
node electron/server-dist/server/main.js soak.json     # allowUnlicensedTransport
node scripts/bot-client.mjs --address 127.0.0.1:27015 --bots 8   --minutes 120 --latency 75 --loss 0.02
```

`--latency` / `--jitter` / `--loss` are `Impairment` on the UDP transport, and
they sit BELOW the reliability layer — so a dropped RELIABLE payload is genuinely
retransmitted and a dropped snapshot is genuinely gone, which is the design claim
worth testing. Impairing above reliability would model a failure that cannot
happen and would look like it was working.

**READ THE PHASE, NOT THE TICK COUNT.** The readout carries `played` (ticks in
which a bot decided and sent), the last server tick, verbs sent, inbound KB/s,
this process's rss — and the run's own phase, party level and kill count. That
last group is what earns its keep: a fleet parked on the title card sending idle
input scores identically to one clearing the level on every other figure. Two of
the bugs below were invisible without it.

### What the first soaks found

Every one of these is a real defect, and not one of them fails a unit test.

- **A read the split withholds, met as a CRASH.** `canBuyStock` asked
  `state.players[0].inventory` whoever was asking, and on a joiner seat 0 is
  somebody else's hero — whose bag the split does not send. So the autopilot's
  perfectly ordinary "would a walk to the stall re-arm me?" read died on
  `undefined.includes`, minutes into a session, in a build where every test was
  green. **This is precisely the failure the bot client exists to catch and the
  one nothing else can**: every other suite asks whether a field that changed
  arrived, and none asks whether what a client HAS is enough to decide with.
  The merchant's MUTATORS were the same bug waiting to be met, and they have
  since been parameterized on the ACTING hero along with the rest of the sweep
  below — `tests/engine/merchant_test.ts`'s co-op block is the guard.
- **A run parked on the TITLE CARD for ever.** A session builds its run waiting
  on the level card, and a headless joiner that never sends `dismissIntro` steers
  a hero on a run that has not started. 143,793 ticks "played", zero kills, and
  every figure but the phase looked healthy.
- **A client killing itself with its own politeness.** A screen holds the run
  until somebody clears it, so the naive loop re-sent `advanceDialogue` on every
  tick it still saw that screen — sixty a second, all RELIABLE, against a window
  of sixty-four unacknowledged messages. The layer below did exactly what it says
  and declared the peer dead. Eight clients, gone inside a minute, each one's
  last snapshot frozen on the readout looking for all the world like a wedged
  server. `RESEND_QUIET_TICKS` is the fix: having asked, wait a few publishes to
  see whether it worked.
- **A rate-limited JOIN dropped in silence.** The hub's connectionless bucket is
  keyed on the ADDRESS, so everyone behind one — a household, a LAN party, a soak
  — shares an allowance of five. A refused join travelled reliable, the layer
  under the hub had already acknowledged the datagram, and nothing ever retried
  it: the player waited out a fifteen-second deadline and was told "the session
  stopped answering". The host now says TOO MANY ATTEMPTS, and the joiner treats
  that as a WAIT rather than a refusal — re-sending the held join rather than the
  whole handshake, because a fresh challenge would spend a second token of the
  very allowance that just ran out.
- **A busy host declared dead by its own joiner.** The reliability layer calls a
  peer dead after ten seconds of silence, which a queue can easily exceed.
- **A global screen nobody left in play can close.** The level-up chooser
  lifted only when the points were placed, and its owner could stop being able
  to place them by quitting or by going down. `releaseStuckLevelup` dropped
  the world's obligation to wait, every tick, as a bolt-on; §3.2's per-player
  screens are the structural fix and RETIRED it — an abandoned screen holds
  nothing shut, because `partyBlocked` only counts heroes in play (the points
  are still KEPT for a reclaim).

The soak runs themselves are in the plan's §5.9.

## Prediction and interpolation

The client sends INPUT FRAMES, never positions — the server stays the only
authority over where anybody is. What prediction changes is when the PLAYER
gets to see the answer: without it, the hero moves at the 20 Hz publish rate
plus a round trip, which is the one latency a player feels in their hands.

**The local hero is predicted, and only the local hero.** After every input
frame, the client runs `predictHeroMovement` (`src/game/predict.ts`) — the
engine's OWN `stepPlayer`, so speed, steering, facing, jump/gravity, obstacle
resolution, the bounds clamp and the stamina ledger are all the real rules —
with the shared-state side effects neutralized: `state.events` swapped for a
scratch sink, `moveSpawnCredit` / `staminaRegenLockMs` / `staminaEmptyMs` /
`stats.jumps` saved and restored, and the seismic-landing slam skipped via
`stepPlayer`'s `predicting` flag. That slam is the one COMBAT side effect the
movement pass has and the only path from it to the seeded rng stream, so a
predicted step damages nothing and draws nothing — **combat is never
predicted**, because a mispredicted kill is a rollback problem this codebase
has no machinery for and the player would experience as monsters un-dying.

**Reconciliation rides the wire's existing header.** Every input frame carries
a monotonically increasing seq (its own counter — commands and chat number
themselves separately); the server tracks the highest seq it has applied per
client and echoes it in the `ack` field of every state frame, which used to
carry a snapshot-ack echo nothing read. On each applied snapshot the client
rolls its predicted scribbles back, lets the authoritative patch land, drops
every pending input the ack covers, replays the rest through
`predictHeroMovement`, and reconciles the PRESENTATION: an error under one
body length (2 × `PLAYER.radius`) is eased toward the replayed truth, a larger
one (a knockback, a hazard shove — things prediction cannot see) snaps.
Because every replay starts from server truth, a mispredict lives for exactly
one publish interval and the easing cannot compound.

**Every other hero is interpolated.** Their inputs are not here to replay, so
each remote hero is drawn between its last two snapshot positions, advanced by
local ticks — one publish interval behind, perfectly smooth, and the lateness
is invisible on a body nobody is steering from this chair. Facing and pose
take the newest snapshot's values as-is; downed and departed heroes keep their
corpse-sprawl positions untouched.

The whole thing lives in `server/client-predict.ts`, is wired into
`server/client.ts` behind `NetClientOptions.predict`, and is **opt-in, default
off**. The app's two net drivers (`pwa/src/game/net/driver.ts`) pass true; the
BOT CLIENT deliberately does not — its staleness is the honest readout of what
the network costs, which is the measurement it exists to take — and the
replication suites that hash a client's whole state against the server's run
unpredicted, since a predicted hero is deliberately ahead of the last
snapshot. An in-session travel resets every buffer: pending inputs would
replay a walk across geometry that no longer exists.
`tests/engine/net_prediction_test.ts` holds all of it — the ack echo, the
60 Hz motion, the exact rebase, the loss reconcile, the untouched shared
state, and the interpolation bounds.

## What is NOT here yet

Everything below needs a human, hardware, or hours of wall clock — none of it
is closable by a diff, which is why it is recorded here instead of being
ticked from one.

- **The Steam path is written but unproven under load.** The binding's legacy
  P2P API is polled, deprecated and thinner on guarantees than SDR; it must be
  spiked under real load before a release leans on it. The direct UDP path
  exists partly as the insurance policy on exactly that.
- **The soak has run for minutes, not hours.** The instrument exists and works
  — `scripts/bot-client.mjs` drives a fleet of headless clients against a
  dedicated server, with latency, jitter and loss injected at the transport
  seam — but leaks and snapshot growth are hour-scale questions, and what has
  been run answers a ten-minute one. Somebody leaves a terminal open
  overnight; the section above on the first soaks records what the short runs
  already found.
- **Five acceptances need a human with hardware**, and cannot be run from CI:
  a PACKAGED desktop launch (`npm run electron` with a real
  `utilityProcess.fork` and `MessagePortMain` handover — covered by stubs and
  reasoning, never by a running packaged app); eight machines over each
  transport through a real NAT; the UPnP mapping against a real router; the
  firewall remedy prompts on each OS; and a `ui-review` screenshot audit of
  the HOST/JOIN screens (they exist only in desktop builds, which the
  browser-driving harness cannot reach). Record results — including failures —
  when they are run.
- **The store surfaces**: the Steam listing's multiplayer categories, the
  depot's launch options, and store screenshots showing a party (`store-shots`
  skill) are owed when the mode ships to the store.
