# Multiplayer — the phased build plan

A Diablo 2-shaped co-op mode: a host starts a game at a difficulty, up to eight
friends join it **with their own characters**, the party fights the campaign
together, shares a quest log, talks in chat, and scales the horde with
`/players N`.

**The server ships inside the desktop binary.** A listen server hosted by one
player's Steam build — which is how D2 did it. There is no service to run and
nothing to pay for, and the game's own promise ("no sign-up, no login and no
server of ours") survives intact.

**Two ways in, and both are first-class:**

- **Steam** — the friend list, the invite overlay, a lobby browser, and P2P
  packets relayed through Valve so NAT traversal is somebody else's problem.
- **DIRECT IP:PORT** — the host binds a real UDP socket, the HOST screen shows
  the address and the port it actually got, and a joiner types it into a field.
  No Steam client required on either end, which is what makes a LAN party, a
  headless dedicated server, and the Steam Deck's offline mode all work.

The host's port is opened as far as it can honestly be opened automatically:
the router mapping via UPnP/NAT-PMP needs no permission and is done silently;
the OS firewall rule needs elevation exactly once and is offered as one button
with a verified result and a copyable manual fallback. §PR 2 is unsparing about
which half of that is genuinely automatic.

**This is a plan of five pull requests.** Each is large, each is useful on its
own, and each ends at a state the game can be played in. At the end of PR 5 the
desktop build has production multiplayer.

---

## 0. Ground truth — what was measured, not assumed

Everything below was counted against the tree at the time of writing. The plan
leans on these numbers; re-measure before trusting a stale one.

| Fact                             | Measurement                                                                                                                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The simulation is deterministic  | `Math.random`, `Date.now`, `performance.now`: **zero** occurrences under `src/`. Every roll is seeded mulberry32 (`src/lib/rng.ts`) with `rngState` freeze/thaw                       |
| The loop is fixed-timestep       | `pwa/src/lib/game-loop.ts`, 1000/60; the fast-forward multiplier scales the step **count**, never the step **size**                                                                   |
| `GameState` is plain JSON        | apart from the `rng` closure, which `saved-run.ts` already snapshots beside it through a v12+ migration ladder                                                                        |
| The engine already runs headless | `src/sim/simulate.ts` drives real `step()` calls from Node                                                                                                                            |
| Cross-engine float safety        | **159** calls to `Math.sin/cos/atan2/hypot/pow/exp/log/tan` under `src/` — none IEEE-mandated. 17 `Math.sqrt` (which _is_ correctly rounded). Lockstep is out                         |
| `state.player` in the engine     | **538** occurrences across **75** files — but **103** are `const player = state.player;` at a function head                                                                           |
| `state.player` in the app        | **220** occurrences across **49** files                                                                                                                                               |
| What those reads actually want   | `pos` **186**, `equipment` 50, `level` 53, `inventory` 33, `coins` 20 — i.e. one third geometry, the rest private bag                                                                 |
| `GamePhase` members              | **19**. `step()` early-returns on `phase !== "playing"` after the `cutscene` and `dying` passes                                                                                       |
| Process-global engine state      | **36** module-level mutable bindings: 19 `activeXDefs` catalogs, 6 flags (`src/game/flags.ts`), the `BALANCE` tuning object, plus memo/grid caches                                    |
| `Item` ownership                 | The `Item` union has **no owner field** — free-for-all loot is the free default                                                                                                       |
| Levels shipped                   | **6** (`content/levels/`), **no hub/town**                                                                                                                                            |
| Desktop packaging target         | **`dir`**, not an installer — Steam uploads a directory to a depot and its client installs it. **There is no elevated install step**                                                  |
| Electron / Node                  | Electron ^43 (so `utilityProcess` is available); root `engines.node >= 24`; imports carry `.ts` extensions; `scripts/game-alias-loader.mjs` already maps the aliases for plain `node` |
| Critical-path budget             | **170 KB gzipped**, enforced by `pwa/scripts/check-seo.mjs`                                                                                                                           |

### The Steam binding is narrower than it looks — verify before leaning

`steamworks.js` ^0.4.0 (the prebuilt-binary binding this shell is built on)
exposes: `achievement, apps, auth, callback, cloud, input, localplayer,
matchmaking, networking, overlay, stats, utils, workshop`.

**`networking` is the LEGACY `ISteamNetworking` P2P API and nothing else:**

```ts
sendP2PPacket(steamId64: bigint, sendType: SendType, data: Buffer): boolean;
isP2PPacketAvailable(): number;
readP2PPacket(size: number): P2PPacket;
acceptP2PSession(steamId64: bigint): void;
```

There is **no `ISteamNetworkingSockets`, no `ISteamNetworkingMessages`, and no
leaderboard API** (the leaderboard gap is already written up at the seam in
`electron/src/leaderboards-provider.ts`). Three consequences the plan is built
around:

1. **It is a POLLED, packet-shaped API.** No sockets, no callbacks, no built-in
   channels: the server pumps `isP2PPacketAvailable()` on its own tick. Fine —
   the server has a tick already — but it means the transport seam must be
   packet-oriented, not stream-oriented, or the UDP path and the Steam path
   cannot share it.
2. **Legacy P2P is deprecated by Valve** and its reliability guarantees are
   thinner than SDR's. It still relays and still punches NAT, which is what we
   need; but if it proves flaky under load, the fallback is landing
   `ISteamNetworkingSockets` upstream or writing an N-API addon — and the
   latter costs the prebuilt binaries that make this shell installable without
   a Rust toolchain. **Spike this in the first week of PR 2, before the UI is
   built on top of it.**
3. **The direct UDP path is therefore not a nice-to-have.** It is the
   insurance policy on the whole topology, as well as being a feature the
   player asked for.

`matchmaking` gives `createLobby / joinLobby / getLobbies` and a `Lobby` class
with `openInviteDialog`, `getMembers`, `getOwner`, `setJoinable`, and
`getData/setData/getFullData`. That is a complete join-game screen: the lobby
metadata carries the difficulty, the level, the player count, the build hash
and the host's direct address, and `getLobbies()` **is** D2's game list.

---

## 1. The five pull requests

| PR                     | Ships                                                                                                                                                       | Playable at the end                                          | Estimate |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | -------: |
| **1 — THE SERVER**     | The simulation moves into a `utilityProcess`, the engine gains a Node ship target, replication + the wire codec, and the host's renderer becomes a client   | Identical single-player, over loopback. Zero networking      |  4–6 wks |
| **2 — THE WIRE**       | Both transports (Steam P2P + direct UDP), lobbies, invites, the server browser, join-by-address, port binding/reveal, UPnP + firewall, chat, **spectators** | Eight people in one session; one plays, seven watch and chat |  5–7 wks |
| **3 — THE PARTY**      | `state.player` → `state.players[]`, per-player phases, per-player input, client prediction + reconciliation                                                 | Eight heroes actually playing one map together               | 8–11 wks |
| **4 — THE CO-OP GAME** | Town hub, per-player death/corpse/respawn, party travel, XP share, loot rules, `/players N` balance, party HUD, mod + version reconciliation                | The whole campaign, co-op, start to finish                   |  6–8 wks |
| **5 — PRODUCTION**     | Stash + trade, hardening/anti-cheat, reconnect, dedicated server binary, platform rules, soak tests, docs, store surfaces                                   | Shippable                                                    |  5–7 wks |

**≈ 28–39 weeks.** The band is wide because PR 3 is a design exercise wearing a
refactor's clothes (see §PR 3), and its uncertainty dominates everything.

Each PR carries its own `.changes/unreleased/` fragment, keeps every new source
file under the 1000-line cap, and must leave `make lint` and `make test` at zero
warnings.

---

## PR 1 — THE SERVER

**Goal: the simulation stops living in the renderer, and single-player is
already playing through the multiplayer path.** No sockets, no protocol
negotiation, nothing to debug but one machine. When this merges, a player
notices nothing.

That is the whole point of doing it first. Every later PR's bugs land in a
system that has already been proven against the one client whose latency,
packet loss and version skew are all zero.

### 1.1 The engine needs a Node ship target

Today `@game/core` is consumed by Vite (for the browser) and by
`scripts/game-alias-loader.mjs` (for tooling). Neither produces something that
ships inside the app.

**The mod toolchain is the exact precedent, and it should be copied
deliberately rather than re-invented.** It ships outside the asar under
`resources/modtools/` in a tree that **mirrors the repo's layout**, because
every module in it finds its neighbours by relative path;
`electron/src/resources.ts` resolves between the two layouts on `app.isPackaged`;
`mod/package.json` declares its runtime deps in one place both the packager and
CI read; and `tests/content/mod_toolchain_deps_test.ts` walks the import graph
to prove nothing was left behind.

Do all five of those things again for the engine. Two candidate mechanisms:

- **Ship the sources and let Node strip the types.** The engine's imports
  already carry `.ts` extensions (which is precisely what Node's type stripping
  requires), the root already demands Node ≥ 24, and the alias loader already
  exists as a `register()` hook. This is the smallest change and keeps one
  source of truth. **Risk: `utilityProcess` runs Electron's bundled Node, and
  whether type stripping is enabled there by default has to be verified before
  the plan rests on it.** Verify in week one; it is a half-day spike.
- **Precompile with `tsc`/esbuild into `resources/server/`.** More build, no
  runtime-flag risk, and it makes the standalone dedicated server (PR 5)
  trivially portable. The fallback if the above spike fails.

Either way the deliverable is the same: a declared dependency manifest, an
`extraResources` entry, a two-layout resolver, and an import-graph test.

### 1.2 The simulation runs in a utility process

`utilityProcess` (Electron ≥ 22, and this shell is on 43), **not** the main
process. Three independent reasons, each sufficient on its own:

1. A 60 Hz simulation must not compete with the main process's IPC, window,
   Workshop-compile and Steam duties.
2. **The engine holds 36 process-global mutable bindings** — the `BALANCE`
   tuning object, the six flags in `src/game/flags.ts`, and every `activeXDefs`
   catalog `registerDefs` swaps when a mod loads. None of it is per-`GameState`.
   A process boundary is what stops one session's `/players 8`, another's mod
   list and a third's GENERATED MAPS setting from stomping each other. Threading
   all of that onto `GameState` instead is a wide refactor across 33+ sites that
   buys nothing this boundary does not.
3. **It leaves exactly one code path.** The host's renderer becomes just another
   client, so there is no host special case anywhere — the same simplification
   every listen server from Quake onward makes, and the reason this plan has no
   "and also, when you are the host…" clauses in it.

One utility process per **session**, not per app: PR 5's dedicated server runs
several, and one process per session is what makes that free.

### 1.3 The fifth bridge

Cloud save, achievements, leaderboards and mods all run **bridge → provider →
platform** over one `gis:post` IPC channel, each message tagged with its own
`__gis*` flag, with the return path calling the page's `window.__gis*Event(...)`
from outside via `executeJavaScript`. Multiplayer is the fifth arm of exactly
that shape:

```
pwa/src/app/net-bridge.ts     ← the page's protocol + request ids  (web)
electron/src/net.ts           ← the bridge: routes, spawns, supervises (main)
electron/src/session-host.ts  ← owns the utilityProcess lifecycle      (main)
electron/src/net-transport.ts ← the transport SEAM                     (main)
server/                       ← the simulation host                    (utility)
```

**One thing must not be copied from the four existing bridges: the volume.**
Those move a handful of JSON round trips per session; this one moves a snapshot
20–30 times a second. Snapshots therefore travel on their **own** `MessagePort`
between the utility process and the renderer (`postMessage` with a transferable
`ArrayBuffer`, structured-clone, zero copies), not through the main process's
JSON channel. The `__gisNet` protocol carries only control traffic — host,
join, leave, kick, the session list, the status line.

### 1.4 Replication

The state splits three ways, and getting the split right is most of the design:

- **STATIC — never sent.** The level is deterministic from `(levelId, seed,
difficulty, generatedMaps, mapSize)`, so the client calls `createGame` with the
  same arguments and builds obstacles, decor, spawner layout and the ground
  layer itself. On a measured `moon` run that is ~100 KB the wire never carries.
  **This is a bit-for-bit determinism claim across the same build, and it must
  be tested rather than believed** — one test that builds the same level in two
  processes and compares canonical JSON (`@ui/lib/canonical-json.ts` already
  exists for exactly this class of comparison).
- **DYNAMIC — snapshotted every tick.** Enemies, projectiles, items, hazards,
  the merchant, doors, the players' public slices. A measured moon run at t=60 s
  with 146 enemies on the field puts `enemies` at 47 KB as JSON (~325 B/mob);
  binary-packed and delta-encoded against the client's last acknowledged
  snapshot, the per-tick payload is a few KB. At 20–30 Hz × 8 clients that is
  ordinary traffic.
- **PRIVATE — to its owner only.** `inventory`, `vault`, `stats`, `spentStats`,
  `talents`, `coins`, `medkits`, quest log detail. This is simultaneously a
  bandwidth win, a privacy win and the anti-cheat boundary: **a client that
  never receives another player's bag cannot manipulate it.** It is also what
  makes PR 5's trade window honest.

The codec lives in `server/wire/` as pure functions over plain objects, with a
round-trip property test per message type. It is the one place in this plan
where hand-rolled binary packing is the right call: the shapes are known at
compile time, the vocabulary is small, and a schema library would cost bytes on
the client for nothing.

**Events replicate too.** `state.events` is how the app plays sounds and flashes
effects, and it is already a per-tick array of plain records — so it rides the
snapshot as-is, filtered per recipient. That is the single cheapest thing in
this whole plan: the entire FX, sound, gore, blood-soak and haptics layer works
on a client with no change at all.

### 1.5 The client

`pwa/src/game/net/` — the run driver that replaces `createGame` + local `step()`
in `GameScreen`. It applies snapshots, holds the interpolation buffer, and
exposes exactly the same `GameState`-shaped object the renderer already reads,
so `render.ts`, the HUD model, the effects and the overlays are untouched.

**The 170 KB critical-path budget is a live hazard here.** The title menu's
future HOST / JOIN screens are on the app's **startup** path, so they may import
`@game/menu` and nothing else. The net client, the codec and anything that
reaches `@game/core` must be lazy — the same rule that keeps the level catalog
off the startup path. Expect `pwa/scripts/check-seo.mjs` to be the thing that
catches the mistake, and do not raise the number.

### 1.6 Done when

- A run started from the title menu plays identically to today, with the
  simulation in a utility process and the renderer receiving snapshots.
- `tests/engine/` gains: wire codec round-trips, snapshot/delta correctness
  against a replayed reference run, and the same-seed determinism test above.
- `npm run electron:test` gains the session lifecycle: spawn, tick, orderly
  shutdown, crash-and-report, and the utility process outliving a renderer
  reload.
- A parked run still resumes (`saved-run.ts`), a checkpoint still restores, and
  the autopilot still flies — all three now through the server.
- `make test`, `make lint`, `npm run electron:test` green. Budget check passes.

### 1.7 Risks

| Risk                                                             | Mitigation                                                                                                                                                                   |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Type stripping unavailable in Electron's bundled Node            | Half-day spike in week one; precompile fallback is already scoped                                                                                                            |
| Snapshot rate can't keep up with 146 mobs on a mid-range machine | Measure with `scripts/simulate-run.mjs`-scale fields before the codec is finished; the fallback is interest-managed replication (cull by view rect), which PR 2 wants anyway |
| The engine turns out not to be bit-identical across processes    | The determinism test finds it in PR 1 rather than as a desync in PR 3. If it fails, static state joins the wire and costs ~100 KB once per level — annoying, not fatal       |

---

## PR 2 — THE WIRE

**Goal: eight machines connect to one session, over Steam or over a raw
address, and can see and talk to each other.** The session still simulates one
hero — joiners are **spectators**. That is a deliberately chosen milestone, not
a compromise: it puts real latency, real packet loss, real NAT, real firewalls
and eight real sockets under the replication layer built in PR 1, while the
thing being replicated is still something known to work.

It is also, on its own, a feature people want: watch a friend's hardcore run.

### 2.1 The transport seam

One interface, two implementations, mirroring the shape every platform feature
in this codebase already uses (bridge → provider → platform):

```ts
// electron/src/net-transport.ts
export type Transport = {
  id: "steam" | "udp";
  listen(opts): Promise<Bound>; // host
  connect(addr): Promise<Connection>; // client
  poll(): Packet[]; // legacy Steam P2P is polled;
  send(peer, data, mode: "reliable" | "unreliable"): void;
  close(): void;
};
```

**Polled, packet-shaped, and explicit about reliability** — because that is the
shape the narrower of the two APIs forces, and a seam designed around the
richer one cannot accommodate the poorer.

A host may listen on **both at once**, and should by default: Steam friends get
the frictionless path, everyone else gets an address. A joiner picks whichever
the lobby entry offers.

- **`net-transport-steam.ts`** — `matchmaking.createLobby` for the session
  record, `networking.sendP2PPacket` / `isP2PPacketAvailable` / `readP2PPacket`
  for the traffic, `acceptP2PSession` on the accept path. Reliability comes from
  `SendType`; the server pumps the receive queue on its own tick.
- **`net-transport-udp.ts`** — `node:dgram`, with our own tiny sequencing layer:
  a sequence number, an ack bitfield, and reliable-message retransmission on the
  control channel only. Snapshots go **unreliable with redundancy** (each
  snapshot delta is coded against the last _acknowledged_ snapshot, so a lost
  packet costs one frame of smoothness and never desyncs). This is the classic
  design and it is small — a few hundred lines — precisely because the
  authoritative server means nothing but presentation depends on any single
  packet arriving.

### 2.2 Ports — binding, and revealing what was actually bound

Default **UDP 27015** (Steam's conventional game-port range, so a player who has
already forwarded ports for other games likely has it open), configurable in
SETTINGS. On `EADDRINUSE`, walk up to 27030 and **bind the first free one**.

**The HOST screen shows the port the socket actually got, not the one that was
requested.** This is stated as a rule because it is the exact bug that makes
"direct connect doesn't work" reports unanswerable: a host reads 27015 off the
settings page, a joiner types 27015, and the socket is on 27016.

The HOST screen shows, live:

```
  SESSION          THE MOON · NIGHTMARE · 1/8
  STEAM            LOBBY OPEN · INVITE FRIENDS
  LAN              192.168.1.42:27015              [COPY]
  INTERNET         203.0.113.7:27015               [COPY]
  ROUTER           MAPPED (UPnP)                   ✓
  FIREWALL         ALLOWED                         ✓
```

Each row is a live status with its own remedy button, and each one says which
of the three independent things that can block an inbound connection it is
reporting on. Conflating them is why "open your ports" is folklore rather than
instruction.

### 2.3 Opening the port — what is genuinely automatic, and what is not

This deserves plain speech, because two of the three layers can be automated
silently and one cannot.

**The router: fully automatic, no permission needed.** A UPnP-IGD / NAT-PMP
mapping request from the main process, done on host start and **released on
shutdown** (a leaked mapping is a port left open on the player's router
forever). Most consumer routers accept it. The mapping's own reply carries the
external address, which is how the INTERNET row above is filled in **without
contacting any third-party service** — worth doing that way rather than with a
STUN or "what's my IP" lookup, because the game's identity claim is that it
talks to nobody. When UPnP is refused (disabled, CGNAT, double NAT), say so in
that row and name the manual forward.

**The OS firewall: one prompt, once, on an explicit press.** There is no
installer to hang a rule on — the Steam depot target is `dir` and Steam's own
client does the installing — so there is no elevated moment to inherit. What is
possible:

| OS          | Automatic path                                                                                                                      | If it needs elevation                                                                                                                                                                |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Windows** | Binding a listening socket makes Windows Defender Firewall show its own allow dialog; the player clicks Allow and the rule persists | The ALLOW button runs `netsh advfirewall firewall add rule … protocol=UDP localport=<port>` through one `Start-Process -Verb RunAs` — one UAC prompt, then verified with `show rule` |
| **macOS**   | The application firewall is off by default on most Macs; when on, a signed app gets the system's own allow prompt                   | `socketfilterfw --add`/`--unblockapp` via `osascript … with administrator privileges` — one prompt                                                                                   |
| **Linux**   | Usually nothing to do (no host firewall by default on most gaming distros / the Steam Deck)                                         | Detect `ufw` / `firewalld` / `nft`; offer one `pkexec` press for the detected one; otherwise print the exact command to copy                                                         |

Three rules govern this whole area:

1. **Never elevate at launch, and never without being asked.** A game that pops
   UAC when it starts is a game people uninstall. The prompt happens on a press
   labelled with what it will do, on the HOST screen, and only when the check
   says a rule is actually missing.
2. **Verify, never assume.** After any rule is added, re-run the check and show
   the result. A green "opened" that isn't open is worse than a red one, because
   it sends the player looking in the wrong place.
3. **Always leave a manual path.** The exact command, copyable, next to the
   button. Some machines are locked down by an administrator who is not the
   player, and that must read as "here's what to ask for", not as a dead end.

**And the honest limit: reachability from the outside cannot be self-tested
without an outside.** The status rows report the three things we can check
locally (socket bound, router mapping confirmed by the router's own reply,
firewall rule present). The only real proof is the first successful joiner — so
the HOST screen says exactly that, rather than claiming a green tick means the
internet can reach you.

**Steam hosting needs none of this**, which is why it is the default: P2P is
outbound-initiated and Valve-relayed, so nothing inbound is ever bound. The
whole firewall apparatus exists for the direct path.

### 2.4 Finding a game

Three doors, authored as menu screens in `content/mainmenu.yaml` (the menu tree
is content; a screen that isn't in the file doesn't exist, and `assembleRows`
throws for a row id no builder answers — so the rows and the builders land in
the same commit):

- **HOST GAME** — difficulty, level, max players, `/players` scaling, a session
  name, an optional password, and the status panel above.
- **JOIN GAME → the browser** — `matchmaking.getLobbies()`, filtered and
  refreshed. The lobby's metadata (`setData`) carries session name, host name,
  difficulty, level, player count, **build + protocol version**, whether a
  password is set, mod list, and the host's direct address if it is offering
  one. That metadata is what makes the browser useful without connecting to
  anything.
- **JOIN BY ADDRESS** — a text field taking `host:port`, `host` (default port
  assumed), IPv4, IPv6 in brackets, or a hostname. It uses the same
  `.pixel-input` widget `NewGame.tsx` uses for hero names, which already carries
  the hard-won iOS predictive-text handling in `pwa/src/game/hero-name.ts` —
  work nobody wants to redo. Recent addresses are remembered.

**Invites** — `lobby.openInviteDialog()` for the Steam overlay, plus the
`+connect_lobby <id>` launch argument Steam passes when a friend accepts an
invite while the game is closed. That argument arrives in `main.ts` before the
window exists and has to be parked until the page is up; the same path handles
`--connect <addr>` for a direct-link join, which is what makes an address
shareable in a chat window.

### 2.5 The handshake, and refusing politely

Version skew is the failure mode that turns into a bug report about "random
crashes", so the handshake is strict and its refusals are legible:

1. **Protocol version** — an integer bumped on every wire change. Mismatch is
   refused with both numbers named.
2. **Build hash** — because the client rebuilds the static world from the seed,
   a different build can carve a different map. Mismatch is refused with a
   "one of you needs to update" message that names which side is older.
3. **Mod set + load order** — a host with mods and a joiner without means
   different catalogs and immediate divergence. PR 2 refuses a mismatch outright
   and names the missing mods; PR 4 makes it reconcile.
4. **Password**, if set, and only then does the connection reach the server.
5. **Character** — the joiner's `Loadout`, validated (see PR 5's trust rules).

### 2.6 Chat

Small, and worth building here because it is what makes a spectator session
feel like a game rather than a stream. `PixelText` for the log, the
`.pixel-input` widget for the field, a scrollback overlay that does not steal
the steering thumb's third of the screen, and a slash-command parser routed to
the server: `/players N`, `/who`, `/kick`, `/invite`, `/help`, `/me`.

`/players N` is nearly free, because `src/game/tuning.ts` is almost exactly D2's
player-count scaling already — `setBalanceTuning()` takes a partial patch of
multipliers, each applied at the one read site that owns its rule, live with no
rebuild:

```ts
// D2: monster HP ×(1 + 0.5(N−1)), with a matching experience bump.
setBalanceTuning({ mobHp: 1 + 0.5 * (n - 1), xpGain: 1 + 0.5 * (n - 1), ... });
```

**One trap, recorded in the knob's own comment: kill XP here is level-based, so
a hp-scaled mob is tougher but pays the same XP for its level.** Scaling `mobHp`
alone makes `/players 8` strictly punishing rather than the risk/reward trade D2
intends. `xpGain` must be raised deliberately alongside it. The real tuning pass
is PR 4's; PR 2 ships the command and the honest pairing.

### 2.7 Done when

- Eight machines join one session over Steam, and eight join one over a typed
  address, and both work through a NAT.
- The HOST screen's three status rows each independently report true, and each
  remedy button leaves a verified result.
- A UPnP mapping is created on host and released on quit — checked on a real
  router.
- Killing the host closes every client with a stated reason; killing a client
  leaves the session running.
- Chat and `/players N` work; spectators see the run in sync.
- `npm run electron:test` covers the handshake refusals, the UDP reliability
  layer's ack/retransmit under simulated loss, and the port-walk on `EADDRINUSE`.

---

## PR 3 — THE PARTY

**Goal: eight heroes, not one.** This is the mountain, and it is a design
exercise wearing a refactor's clothes.

### 3.1 `state.player` → `state.players[]`

The mechanical rename is perhaps two weeks. The cost is that **each of those 538
engine sites is a question**, and roughly a hundred of them are questions nobody
has answered yet.

The measurement in §0 is what makes it tractable, though, and it should shape
the sequencing: **`pos` is 186 of the deep reads and `equipment`/`inventory`/
`coins`/`stats` are most of the rest.** Those are two completely different
refactors wearing one name:

- **The geometry reads** (`pos`, `z`, `vel`, `facing`) are asking _"where is the
  threat / the target / the anchor"_ and each needs a party-aware answer:
  nearest, any, all, or centroid. This is where the design questions live.
- **The private reads** (bag, stats, purse, talents, medkits) are asking about
  _a specific hero_, and the answer is always "the one this pass is about". They
  become a parameter, and 103 of them are already `const player = state.player;`
  at a function head — i.e. already shaped like the parameter they want to be.

So: **parameterize first, decide second.** Convert every pass that operates on
one hero to take the hero as an argument and loop over the party at the top;
that mechanically resolves the majority and leaves a short, reviewable list of
genuinely shared reads. Then answer those one at a time, with a test each.

The list of shared reads, and the recommendation for each:

| Site                          | Question                        | Recommendation                                                                                                                                                                     |
| ----------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `step/enemies.ts` aggro/leash | Whom does a mob chase?          | Nearest **visible** player, with hysteresis so it doesn't flip between two equidistant heroes                                                                                      |
| `step/spawner.ts` anchor      | Where does the horde come from? | Party centroid for the budget; nearest player for placement. The anti-camping anchor tracks the party                                                                              |
| `step/packs.ts`               | Who wakes a pack?               | Any player. A pack half the party has walked past is a pack that never fights                                                                                                      |
| `menace.ts`                   | Whose DPS heats the meter?      | Party-summed output over a party-scaled sensitivity — see PR 4; **this needs a measured tuning pass**                                                                              |
| `merchant.ts` (25 refs)       | Whom does he follow?            | He stops wandering in co-op and stands in the town hub (PR 4). Fixes the question by deleting it                                                                                   |
| `state.explored` fog          | Shared or per-player?           | **Shared.** It is one `Uint8Array` on the run, the party is meant to explore together, and per-player fog costs a grid per player and a per-player minimap for nothing D2 ever had |
| `hazards.ts` (22 refs)        | Who trips a hazard?             | Any player; damage resolves per player in range                                                                                                                                    |
| `quests/index.ts`             | Whose kill counts?              | The party's — the quest log already lives on the **run**, not the character                                                                                                        |

**Players are full `Player` records, not `Companion`s.** For the record, since
it is the tempting shortcut: `Player` carries 36 fields and 9 equipment slots;
`Companion` carries 17 and 3, with no `inventory`, `vault`, `stats`,
`spentStats`, `talents`, `pendingStatPoints`, `coins`, `stamina`, consumables,
`abilities`, `itemSpells`, `heldAbilities`, jump physics or knockback state. A
second player on that chassis would have no bag, no stats, no talents, no
level-ups, no powerups, no jump and no quest participation. What the companion
system _does_ prove is that the step pipeline tolerates several friendly actors
and the renderer already draws them through the shared paper-doll, gait and
blood-soak passes. That is a precedent for the **render** layer, and it is a
good one — PR 3's rendering work is genuinely small because of it.

`saved-run.ts` takes a migration bump: a v-N snapshot with one `player` thaws
into a one-element `players` array.

### 3.2 Per-player phases

`GamePhase` has 19 members. `playing` is live, `cutscene` and `dying` run
reduced passes, and **the other 16 halt the simulation outright**.

Eleven of them are per-player UI that must stop freezing the world: `paused`,
`levelup`, `respec`, `inventory`, `map`, `questLog`, `shop`, `quest`, `talk`,
`choice`, `companion`. D2 explicitly wants one player shopping while another
fights.

The change is to split the concept in two:

- **`state.phase`** keeps only what is genuinely global: `cutscene`, `intro`,
  `playing`, `outro`, `victory`, `defeat`.
- **`Player.screen`** (new) carries what one player is looking at. The
  simulation runs regardless; a player with a screen open simply contributes no
  steering input, and — this is the bit that matters for feel — **is still
  standing on the field and can still be killed.** That is D2's rule and it is
  what makes opening your bag mid-fight a decision.

Two need a group protocol rather than a per-player one:

- **`dialogue` / `cutscene`** — a boss's arrival. Recommendation: it plays for
  everyone, and **anyone** can advance it; the world stays frozen for the beat,
  because a boss monologue with half the party still fighting is neither.
- **`choice`** (spare-or-kill) — recommendation: the player who landed the
  killing blow decides, with the choice shown to everybody. First-to-answer
  races on eight machines; a vote is a UI nobody wants mid-fight.

**`levelup` is the sharpest, and it changes how leveling feels for everyone.**
Today the run _pauses_ until `allocateStat` is called. In co-op it cannot.
Recommendation: the ding celebrates on the field, the points bank as
`pendingStatPoints` (which the type already carries, and which the AUTO PILOT
refund path already uses), and the chooser becomes a non-blocking screen the
player opens when they want. The HUD grows a pip that says points are waiting.
This is a real single-player behaviour change and should be called out in the
changelog as such rather than smuggled in.

### 3.3 Input, prediction and reconciliation

Now that a second player's input crosses a wire, naive round-trip input becomes
visible: steering is pointer-hold and combat is 60 Hz auto-fire, so **prediction
and reconciliation are not polish here — they decide whether the mode feels
good.**

- The client sends **input frames** (the existing `GameInput` shape, plus a
  sequence number and the tick it was sampled on), not positions. A client that
  sends positions is a client that can teleport.
- The client predicts **its own hero only** by running the same `stepPlayer`
  movement pass locally against the last authoritative snapshot, replaying its
  unacknowledged inputs.
- On each snapshot it reconciles: if the server's position for the local hero
  differs beyond a threshold, snap or smooth toward it. Everyone else is
  **interpolated** between the last two snapshots, one interval behind.
- The server is authoritative over everything else, always. A client's predicted
  kill that the server didn't grant simply doesn't happen — which is fine,
  because the FX are event-driven and the events come from the server.

**Do not predict combat.** Predicting movement fixes the felt latency;
predicting damage creates a rollback problem the codebase has no machinery for
and the player would experience as monsters un-dying.

### 3.4 Done when

- Eight heroes on one map, each steering their own, each with their own bag,
  stats, talents, level-ups and powerups.
- One player in their inventory does not freeze the other seven — and can still
  be killed while they're in it.
- `tests/engine/` proves the party-aware answers: aggro picks the nearest
  visible hero and does not flip; a pack wakes for any player; the spawner
  anchors on the party; XP, quests and hazards resolve per player.
- A recorded input trace replayed on the server reproduces the same state, so
  prediction divergence is measurable rather than felt.
- `scripts/simulate-run.mjs` runs a multi-player campaign headlessly — which is
  what makes PR 4's tuning measurable instead of guessed.

### 3.5 Risks

This PR is where the estimate band comes from. The mitigation is sequencing:
land the mechanical parameterization as its own reviewable commit series, land
each shared-read decision with its own test, and keep single-player passing the
whole way — every commit in this PR should leave a playable single-player game,
because a single-player regression discovered at the end of an 11-week branch is
unbisectable.

---

## PR 4 — THE CO-OP GAME

**Goal: the campaign, played co-op, start to finish.** PR 3 makes eight heroes
possible; PR 4 makes eight heroes a game.

### 4.1 The town — the fixture this game has never had

D2's whole social loop is town ↔ wilderness: meet, vendor, stash, regroup, chat,
portal out together. This game has **no hub**. The merchant _wanders the field_
and is discovered by proximity; there is nowhere safe to stand; "start a game,
people join" has nowhere to land.

**The fix is authored content, not engine work**, which is the good news: a
`LevelDef` in the existing `content/levels/<id>.yaml` format with no spawners,
the merchant parked at a counter, the quest givers present, safe zones (which
already exist) over the whole floor, and level select as a set of portals. The
`level-design` skill's checker battery applies unchanged.

Two things it does drag in:

- **Party travel.** Everyone must arrive on the same map with their own
  loadout. The host chooses; the session tears down its level and builds the
  next from a new seed, with each player's `Loadout` re-applied. The existing
  per-level handoff (`arrival.ts`, `applyLoadout`) is the mechanism; what is new
  is that there are eight of them and they must all be banked before the switch.
- **The story chain applies.** If the hub has a single spoken line — a
  greeting, a sign, a named NPC — then `docs/story.md` is edited first, then
  `docs/manuscript.md`, then the content, **and the manuscript edit needs the
  user's confirmation before it is written**. A silent line in a level YAML with
  a stale manuscript is exactly the drift the chain exists to prevent. Use the
  `update-story` skill.

### 4.2 Death, the corpse, and the respawn

Today: `enterDeathScene` → `phase = "dying"` → `defeat`. Softcore takes the 10%
XP toll (`BALANCE.deathXpLoss`); hardcore latches `Character.dead`. **And
critically, `dying` and `defeat` are global phases — so one death would end the
game for all eight.**

What ships:

- **Death is per-player.** PR 3's phase split already makes `dying` a
  `Player.screen`; PR 4 makes the consequences per-player too.
- **A body where you fell**, holding what you were carrying — D2's rule. It is
  drawn with the loot-aura machinery, it is only recoverable by its owner (the
  private/public replication split from PR 1 is what makes that enforceable),
  and it persists for the level.
- **Respawn in town**, at full health, walk back. The XP toll still applies.
- **Hardcore is a decision that must be made explicitly, not inherited.** A
  hardcore hero dying in someone else's session is permanently dead, and the
  host may have set `/players 8` on JESUS. Recommendation: **hardcore heroes may
  only join sessions hosted by a hardcore character on the same difficulty**,
  and that constraint is shown in the browser and enforced at the handshake. The
  alternative — letting a hardcore hero into any lobby — is a support burden and
  a betrayal.
- **A session ends when the host leaves.** There is no host migration; D2 didn't
  have it either. Everyone's progress banks first (see 4.5).

### 4.3 XP, loot and the meter

**XP sharing.** `grantXp` pays one hero today. D2 splits XP among nearby party
members weighted by level, and **that rule is what decides whether a level 12
friend can meaningfully play with a level 60 character** — which is most of
whether the mode is fun. This is new engine code, not a refactor. Ship D2's
shape (proximity-gated, level-weighted), then measure it with the multi-player
simulator from PR 3.5 across the whole level range.

**Loot ownership.** `Item` has no owner field, so **free-for-all is the free
default** — which is D2 classic and probably the authentic choice. Allocated or
personal loot means adding an owner to `Item` and filtering pickup: cheap, but
**decide it deliberately rather than inheriting it by accident.**
Recommendation: ship free-for-all as the default with a host toggle for
allocated, because friends-only sessions are the use case and FFA is what makes
a party feel like a party.

**The menace meter.** `/players N` covers the horde. It does **not** cover
`src/game/menace.ts`, which escalates off _the player's_ rolling DPS and kill
rate through a clearance gate and an evolution ratchet. Eight heroes feed a
meter designed for one, and the ratchet is permanent within a run — so an
untuned meter doesn't merely make co-op hard, it makes it hard **forever after
the first minute**. `BALANCE.menaceGain` and `menaceClearance` are the levers,
and this is a measured pass, not a guessed one: `scripts/simulate-run.mjs` plus
the autopilot, run at 2/4/8 players across every difficulty, reading the
`--verdict` line.

### 4.4 Mods and versions, reconciled

PR 2 refused a mismatch. PR 4 makes it work, because "my friend has a mod" is
the common case on Steam:

- The **host's mod set is the session's**, in the host's load order. That is
  the only rule that can't disagree with itself.
- A joiner who is subscribed to the same mods applies them for the run through
  the existing `registerDefs` seam, exactly as `pwa/src/game/mods.ts` already
  does for single-player, and `restoreBaseDefs()` at the end.
- A joiner **missing** a mod is offered the Workshop page for it, and refused
  until they have it. Auto-downloading a stranger's content on join is a
  security decision nobody asked us to make on their behalf.
- The `ModStamp` on the hero records what they played under, so a roster still
  reads correctly after an unsubscribe — the rule that already exists.

### 4.5 The party HUD, and banking eight characters

- Party frames (health, level, name, screen state) down one edge, sized for the
  844×390 reference viewport and staying off the steering thumb's third.
- The shared quest tracker already reads `state.quests` on the **run**, so it
  needs the party's progress rather than a rewrite.
- Portraits reuse the existing paper-doll compositor, blood soak included.
- **Every player's character banks its own loadout at level end**, on their own
  device, through their own `saveCharacters`. `updatedAt` is stamped only for
  heroes a save actually changed — a rule cloud save's merge depends on — so
  the multiplayer banking path must not touch heroes it didn't change.

### 4.6 Done when

- The full campaign is completable by a party of four on medium, and by two on
  nightmare, measured on real runs and not just on the simulator.
- The `--verdict` line passes at 1, 2, 4 and 8 players on every difficulty.
- Deaths, corpses and respawns work; one death never ends anyone else's game.
- Every player's character is correctly banked after a level and after a quit.
- `docs/game-content.md` covers the hub; the story chain is intact if it speaks.

---

## PR 5 — PRODUCTION

**Goal: shippable.** Everything between "it works with friends" and "it works
with strangers, at scale, forever".

### 5.1 Stash and trade

Half of D2 co-op is trade. There is an inventory and a lost-and-found vault
(`items/vault.ts`) but no shared stash and no player-to-player transfer.
`Equipment` is plain JSON that already round-trips through storage and cloud
save, so the data side is easy. The work is the trade window: both-accept
confirmation, a locked state while accepted, cancellation on any change, and —
the part that only an authoritative server can get right — **the anti-dupe
rules**. The item moves in one server-side transaction or not at all; the
private replication split means neither client can assert what the other is
offering.

### 5.2 Hardening — an open UDP port is an open UDP port

The direct-connect path means the game accepts packets from anybody on the
internet. Non-negotiable:

- **Nothing reaches the simulation before the connection is established.**
  Handshake, then password, then character validation, then packets are parsed
  as game input.
- **A connectionless request must never be answered with more bytes than it
  contained.** An unauthenticated "send me the world" that replies 100 KB to a
  spoofed source address turns every host into a DDoS reflector. The handshake
  uses a challenge cookie: the first reply is tiny and the client must echo it.
- Fixed-size header validation, length checks before every read, per-address
  rate limits, a connection cap, and a per-session packet budget.
- **Fuzz the decoder.** The wire codec is the attack surface; a property test
  that throws random bytes at it and asserts it never throws or over-reads.

### 5.3 The trust model, stated plainly

**The host is a player, so the host can cheat.** This is precisely why Open
Battle.net was a cheat-fest, and it is an accepted cost of a listen server —
acceptable for playing with friends, unacceptable for ladder integrity. So:

- **A multiplayer run does not contribute to leaderboards.** The boards rank
  lifetime kills, best single blow, sustained kill rate and hardcore campaign
  results; every one of those is trivially forgeable by a host. A `PartyStamp`
  on the run marks it, exactly as `ModStamp` marks a modded one.
- **Achievements: a party kill counts for everyone present.** The ledger is the
  truth and the platform is a copy, so this is a decision about the ledger. The
  alternative (only the killer) makes half the badges unearnable in the mode
  the player is enjoying.
- **A joiner's loadout is validated on arrival** — level within range, items
  mintable from the catalogs, stat points summing to what the level allows.
  This is the same class of check as the HMAC on character export, and the same
  honesty applies: it is a speed bump, not a wall, and the doc should say so
  rather than implying a guarantee.
- **Cloud save is untouched.** Device-shaped state is already not synced, and a
  multiplayer run is not a save.

### 5.4 Reconnect

A dropped client can rejoin the same session within a grace window and resume
the same hero, because the server holds the authoritative `Player` record and
the client rebuilds everything else from the seed. Their body stands on the
field, inert, while they are gone — which is D2's behaviour and also the
simplest thing to implement.

### 5.5 The dedicated server

The utility-process server, minus Electron, **is** the standalone dedicated
server. It is the same file. What PR 5 adds is the wrapper: a config file, a
console, log output through `src/output.ts`, graceful shutdown, and no Steam
dependency (direct-IP only, which is exactly the transport that already exists).
This is the payoff for the transport seam and the two-layout resource resolver,
and it should be a few hundred lines.

### 5.6 Ops and the long tail

- Soak: an 8-player session left running for hours, watched for leaks, drift and
  snapshot growth.
- Simulated adversity: latency, jitter and loss injected at the transport seam
  (which is why the seam is where it is), with the game held to playable at
  150 ms / 2% loss.
- Diagnostics: a net graph behind DEBUG MODE — round trip, snapshot size, packet
  loss, prediction error — since the FPS meter is already the precedent for
  "the first probe for performance regressions".
- Docs: `docs/multiplayer.md` (the shipped architecture, replacing this plan),
  `docs/configuration.md` (the port, the address, the launch arguments),
  `README.md`, `docs/troubleshooting.md` (a real section on the three
  connection layers, since that is what support questions will be about).
- Store: the Steam listing's multiplayer categories, the depot's launch options,
  and store screenshots showing a party — `store-shots` skill.

---

## 6. Decisions register

Answers this plan recommends but does not have authority to make. Each should be
settled before the PR that needs it, not during.

| #   | Question                                                 | Recommendation                                                    | Needed by |
| --- | -------------------------------------------------------- | ----------------------------------------------------------------- | --------- |
| 1   | Max party size                                           | 8, matching D2 and the `/players` scale                           | PR 1      |
| 2   | Default direct port                                      | UDP 27015, walking to 27030, always revealing the bound one       | PR 2      |
| 3   | Steam-only or dual transport                             | **Dual**, both offered by default                                 | PR 2      |
| 4   | Level-up: blocking chooser or banked points              | Banked + non-blocking chooser (changes single-player too)         | PR 3      |
| 5   | Fog of war: shared or per-player                         | Shared                                                            | PR 3      |
| 6   | Spare-or-kill: who decides                               | The killing blow's owner, shown to all                            | PR 3      |
| 7   | Loot: FFA or allocated                                   | FFA default, host toggle for allocated                            | PR 4      |
| 8   | XP: D2's proximity + level weighting                     | Yes, then measure across the level range                          | PR 4      |
| 9   | Hardcore heroes in others' sessions                      | Only hardcore hosts, same difficulty, enforced at handshake       | PR 4      |
| 10  | Host migration                                           | **No.** Host leaves, session ends, everyone banks                 | PR 4      |
| 11  | Leaderboards from co-op runs                             | Excluded, marked with a `PartyStamp`                              | PR 5      |
| 12  | Achievements from co-op runs                             | Count for everyone present                                        | PR 5      |
| 13  | Browser PWA as a **joiner**                              | Out of scope. WebRTC + a signalling service is a separate project | —         |
| 14  | Mobile as a joiner                                       | Out of scope for the same reason                                  | —         |
| 15  | Licence (`PolyForm-Noncommercial-1.0.0`) and hosted play | Confirm what it permits before a dedicated server ships           | PR 5      |

---

## 7. What this plan deliberately does not build

- **Lockstep / rollback netcode.** The rng is bit-exact (integer `Math.imul`),
  but the 159 transcendental calls under `src/` are not IEEE-mandated to agree
  across JS engines and platforms. Chrome, Safari and Firefox can differ in the
  last bit and a 60 Hz simulation compounds that into a desync within seconds.
  Server-authoritative sidesteps it entirely.
- **A hosted service.** The game is bought once on Steam (no coin store there),
  the mobile store is IAP, and there is no recurring revenue to fund hosting
  8-player games indefinitely. More importantly, `game.config.json`'s own FAQ
  says "there is no sign-up, no login and no server of ours" and "it plays with
  the network off" — a hosted server makes both lines false. **A listen server
  inside the binary makes neither false**, and two people on a LAN with no
  internet can still play. That is the strongest argument for this topology,
  over and above the cost.
- **Host migration**, per decision 10.
- **PvP.** Nothing in the balance model, the level design or the story is built
  for it.
- **Browser or mobile hosting.** A phone has no listening socket and a tab is
  not a server. They can join later; nothing here forecloses it, because every
  join path already goes through the transport seam.

---

## 8. Working notes for whoever picks this up

- **Every PR carries a `.changes/unreleased/` fragment.** The mode is
  user-visible; CI's `changeset` job enforces it.
- **Engine tests go in `tests/engine/` against synthetic fixtures** and must not
  name a shipped content id. The party rules are engine rules; the town hub's
  checks are `tests/content/`. Shell-side networking is `npm run electron:test`,
  which the root suite does not reach.
- **Verify with `make test`, never a bare `npx vitest run`** — several committed
  artifacts are drift-tested against a fresh build, and the bare runner skips
  the `pretest` rebuild that makes that check mean anything.
- **Keep every new file under 1000 lines** (§20.5 of `OSS_SPEC.md`). The wire
  codec and the server tick will both want to grow past it; split by concern.
- **The menu tree is content.** A HOST or JOIN screen is authored in
  `content/mainmenu.yaml`, and its builder lands in the same commit — the
  compiler refuses a row nobody answers, and that refusal is the feature.
- **Watch the 170 KB budget on every PR that touches the title screen.** A
  server browser that reaches `@game/core` for a level's name drags the whole
  simulation onto the startup path for every player who never opens it.
- **Measure, don't guess.** `scripts/simulate-run.mjs`, the autopilot and the
  `--verdict` line exist precisely so that the balance questions in PR 4 have
  numbers attached. Multi-player support in the simulator is scoped into PR 3
  for that reason.
