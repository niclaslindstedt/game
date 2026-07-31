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

**This is a plan of eight pull requests.** Each is large and each is useful on
its own. At the end of PR 5 the desktop build has production multiplayer.

> **AMENDED AFTER PR 2.** This plan was written as five PRs, each promising to
> "end at a state the game can be played in". The first two falsified that
> promise in the same way, and the cause was structural rather than accidental:
> **its PR boundaries are drawn along ARCHITECTURAL LAYERS while that promise
> needs boundaries drawn along USER-VISIBLE SLICES.** Both PRs shipped their
> layer whole and deferred the cutover and the UI that would have made it
> reachable, because those are a different shape of work.
>
> Worse, the original cut contained a **circular dependency**: PR 1's remaining
> cutover needs the inventory / shop / level-up / talent verbs to travel as
> commands, and PR 3 was the PR that owned them. PR 1 therefore could not finish
> before PR 3 started, while PR 3's prediction work assumes the run already goes
> through the server. The cycle dissolves once you notice the plan had conflated
> two different jobs on the same verbs — **making them TRAVEL** (a prerequisite,
> with today's blocking semantics untouched) and **making them NON-BLOCKING
> per-player** (genuinely PR 3).
>
> So **PR 1.5 (THE CUTOVER)** and **PR 2.5 (THE SCREENS)** are inserted below,
> carrying exactly the work PRs 1 and 2 deferred. (PR 1.5 has since split in
> turn, and the half that kept the number is now called THE VERBS — see the
> second amendment below.) They are numbered as halves
> rather than renumbered to 3 and 4, so that every reference to "PR 3" and
> "PR 5" in this document, in `docs/multiplayer.md`, in `AGENTS.md` and in the
> comments throughout `server/` still names what it always named.
>
> **AMENDED AGAIN AFTER PR 1.5's FIRST HALF (#790).** The verbs landed; the loop
> did not, and this time the split was made deliberately and in the open rather
> than discovered afterwards. The reason is a measurement §0 did not have when
> the cutover was planned: **a run is not `createGame(params)`** — the app
> performs six further mutations before the first tick that the `SessionParams`
> cannot express, and the parked run and the checkpoint restore do not call
> `createGame` at all. Moving the loop on top of that would have shipped a
> session holding a different world from the one the app built. So the remainder
> is **PR 1.75 (THE LOOP MOVES)**, below, numbered by the same rule and for the
> same reason: PR 1.5's name is already written into `src/game/commands.ts`,
> `server/wire/protocol.ts`, `docs/multiplayer.md` and `AGENTS.md`, where it
> means "the verbs travel", and it should keep meaning that.

---

## 0. Ground truth — what was measured, not assumed

Everything below was counted against the tree at the time of writing. The plan
leans on these numbers; re-measure before trusting a stale one.

Two of these were re-measured after PR 2 and are annotated with both readings.
Nothing has drifted enough to change a decision, which is itself worth knowing —
the engine's shape is stable on the axes this plan leans on.

| Fact                             | Measurement                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The simulation is deterministic  | `Math.random`, `Date.now`, `performance.now`: **zero** occurrences under `src/` (re-measured after PR 2: still zero). Every roll is seeded mulberry32 (`src/lib/rng.ts`) with `rngState` freeze/thaw                                                                                                                                                                                                                  |
| The loop is fixed-timestep       | `pwa/src/lib/game-loop.ts`, 1000/60; the fast-forward multiplier scales the step **count**, never the step **size**                                                                                                                                                                                                                                                                                                   |
| `GameState` is plain JSON        | apart from the `rng` closure, which `saved-run.ts` already snapshots beside it through a v12+ migration ladder                                                                                                                                                                                                                                                                                                        |
| The engine already runs headless | `src/sim/simulate.ts` drives real `step()` calls from Node                                                                                                                                                                                                                                                                                                                                                            |
| Cross-engine float safety        | **159** calls to `Math.sin/cos/atan2/hypot/pow/exp/log/tan` under `src/` — none IEEE-mandated. 17 `Math.sqrt` (which _is_ correctly rounded). Lockstep is out                                                                                                                                                                                                                                                         |
| `state.player` in the engine     | **538** occurrences across **75** files — but **103** are `const player = state.player;` at a function head (re-measured after PR 2: **533** across the same **75**)                                                                                                                                                                                                                                                  |
| `state.player` in the app        | **220** occurrences across **49** files (re-measured after PR 2: **199**)                                                                                                                                                                                                                                                                                                                                             |
| Engine mutators the APP calls    | **~50** distinct value imports from `@game/core` that mutate a `GameState` — `openInventory`, `equipFromInventory`, `buyStock`, `sellItem`, `allocateStat`, `spendTalentPoint`, `pickTalkChoice`, `openShop`, `openMap`… **This is PR 1.5's whole size**, and it is larger than the "~40" PR 1's own notes estimated. **Counted exactly when PR 1.5 did the conversion: 69 verbs over ~110 call sites in 22 modules** |
| What a run's creation does       | `createRunSession` performs **six** mutations AFTER `createGame` that the `SessionParams` cannot express — the campaign quest chain, the purse, the seen thoughts, a `?scenario=`, an opening already watched, and a bot run's dialogue mute. Measured while doing §1.5.1; it is what §1.5.2 turns out to rest on                                                                                                     |
| What those reads actually want   | `pos` **186**, `equipment` 50, `level` 53, `inventory` 33, `coins` 20 — i.e. one third geometry, the rest private bag                                                                                                                                                                                                                                                                                                 |
| `GamePhase` members              | **19**. `step()` early-returns on `phase !== "playing"` after the `cutscene` and `dying` passes                                                                                                                                                                                                                                                                                                                       |
| Process-global engine state      | **36** module-level mutable bindings: 19 `activeXDefs` catalogs, 6 flags (`src/game/flags.ts`), the `BALANCE` tuning object, plus memo/grid caches                                                                                                                                                                                                                                                                    |
| `Item` ownership                 | The `Item` union has **no owner field** — free-for-all loot is the free default                                                                                                                                                                                                                                                                                                                                       |
| Levels shipped                   | **6** (`content/levels/`), **no hub/town**                                                                                                                                                                                                                                                                                                                                                                            |
| Desktop packaging target         | **`dir`**, not an installer — Steam uploads a directory to a depot and its client installs it. **There is no elevated install step**                                                                                                                                                                                                                                                                                  |
| Electron / Node                  | Electron ^43 (so `utilityProcess` is available); root `engines.node >= 24`; imports carry `.ts` extensions; `scripts/game-alias-loader.mjs` already maps the aliases for plain `node`                                                                                                                                                                                                                                 |
| Critical-path budget             | **170 KB gzipped**, enforced by `pwa/scripts/check-seo.mjs`                                                                                                                                                                                                                                                                                                                                                           |

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

## 1. The nine pull requests

| PR                     | Ships                                                                                                                                    | Playable at the end                                          | Estimate | State                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | -------: | ------------------------------------------ |
| **1 — THE SERVER**     | The simulation moves into a `utilityProcess`, the engine gains a Node ship target, replication + the wire codec                          | Nothing changes — the machinery is not yet reachable         |  4–6 wks | **Landed** (#783), see §1.6                |
| **2 — THE WIRE**       | Both transports (Steam P2P + direct UDP), the lobby, port binding/reveal, UPnP + firewall, admission, chat, **spectators**               | Nothing changes — no screen reaches it                       |  5–7 wks | **Landed** (#788), see §2.7                |
| **1.5 — THE VERBS**    | The app's ~50 direct engine mutations become commands — one closed list, scalar arguments, one dispatch shared by the app and the server | Nothing changes — the loop still runs in the renderer        |    2 wks | **Landed** (#790), see §1.5.4              |
| **1.75 — THE LOOP**    | `SessionParams` can describe a real run; a session can ADOPT one; `GameScreen` drives the net client instead of owning the loop          | Identical single-player, over loopback. Zero networking      |  2–4 wks | **Landed**, bar §1.75.4                    |
| **2.5 — THE SCREENS**  | HOST / JOIN / the server browser / JOIN BY ADDRESS, the chat overlay, the port setting, the invite launch arguments                      | Eight people in one session; one plays, seven watch and chat |  2–4 wks | **Landed**, see §2.5.4                     |
| **3 — THE PARTY**      | `state.player` → `state.players[]`, per-player phases, per-player input, client prediction + reconciliation                              | Eight heroes actually playing one map together               | 8–11 wks | **§3.1 landed**, see §3.6                  |
| **4 — THE CO-OP GAME** | Per-player death/corpse/respawn, XP share, loot rules, `/players N` balance, party HUD, banking, mod + version reconciliation            | The whole campaign, co-op, start to finish                   |  5–7 wks | **§4.2-abandoned + §4.3 landed**, see §4.7 |
| **5 — PRODUCTION**     | Stash + trade, hardening/anti-cheat, reconnect, dedicated server binary, platform rules, soak tests, docs, store surfaces                | Shippable                                                    |  5–7 wks |                                            |
| **6 — THE GARAGE**     | The hub the game has never had: the hero's garage, the rift door as level select, party travel, the merchant parked, the story chain     | Somewhere to stand, and somewhere to land a joiner           |  3–5 wks |                                            |

**≈ 36–53 weeks.** The band is wide because PR 3 is a design exercise wearing a
refactor's clothes (see §PR 3), and its uncertainty dominates everything.

**PR 6 SORTS LAST AND THAT IS A DECISION, not a leftover.** The garage was PR 4's
§4.1 and has been lifted out whole, for two reasons. It is not co-op arithmetic —
it is a level, a new level-swap mechanism, a parked merchant and a story-chain
change, which is a different kind of work from "whose is this kill's XP". And it
is the one piece here that is worth shipping AFTER the mode is stable rather than
before: a hub is what makes co-op pleasant, and PR 5 is what makes it work at
all. The cost of that order is stated in PR 6's own goal and must not be
discovered later — until it lands, a joiner arrives in the middle of somebody
else's boss fight.

**The three inserted PRs are not new work, they are work the earlier ones
deferred**, so the total grew by their estimates rather than by a re-plan. Note also what the
"playable at the end" column now says for PRs 1 and 2: **nothing changes.** That
is the honest reading of what shipped, and leaving the old claim in place is what
would have let the next PR inherit the same mistake.

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

**AS BUILT, the transport seam is NOT in that list, and the departure was
deliberate** — see §2.1's own amendment. `electron/src/net-transport.ts` does not
exist; the seam, the reliability layer and the UDP transport are
`server/net/{transport,reliability,udp}.ts`, because §5.5 of this same plan says
the dedicated server "is the same file" as the session server minus Electron, and
a transport living in the shell is a transport that server does not have. Only
Steam stayed in the main process, where the client is.

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

**AS BUILT, that last paragraph was overruled, and the reasoning is worth
keeping.** PR 1 shipped a binary ENVELOPE — a fixed 16-byte header, validated
before anything is read — with a **JSON payload** behind the `codec.ts` seam. The
shapes are indeed known at compile time, but there are ~120 of them, they are the
engine's own live types, and a hand-written packer per type is a second
definition of every one whose failure mode is silence: a def grows a field, the
packer does not, and the field stops replicating with every test still green.
Swapping the payload encoding touches two functions and neither end's protocol,
so this is a deferral rather than a refusal — **measure first (§1.7's
snapshot-rate risk), then pack what the measurement says is expensive.**

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

### 1.6 Done when — and what PR 1 actually met

Recorded honestly, because an unamended "done when" is how a plan starts lying
about its own state. **Two of the five were not met, and they are the two that
made the feature reachable**; they are now PR 1.5.

| Criterion                                                                                                                                                     | PR 1 (#783)                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A run started from the title menu plays identically to today, with the simulation in a utility process                                                        | ❌ **Not met.** `GameScreen` still owns the loop; `pwa/src/game/net/` is unreachable from any shipped code                                                                         |
| `tests/engine/` gains wire codec round-trips, snapshot/delta correctness, and the same-seed determinism test                                                  | ✅ Met — and the determinism test runs in a real second `node` process                                                                                                             |
| `npm run electron:test` gains the session lifecycle: spawn, tick, orderly shutdown, crash-and-report, **and the utility process outliving a renderer reload** | ⚠️ **Four of five.** Spawn, port handover, orderly stop, forced kill, crash-vs-stop and restart are covered; the renderer-reload case is not, because the test rig has no renderer |
| A parked run still resumes, a checkpoint still restores, and the autopilot still flies — all three **through the server**                                     | ❌ **Not met**, and it follows from the first row rather than being a second omission                                                                                              |
| `make test`, `make lint`, `npm run electron:test` green; budget check passes                                                                                  | ✅ Met — critical path 163.7 KB gzipped against the 170 KB budget                                                                                                                  |

One more thing PR 1 flagged rather than claimed, and it is still outstanding:
**the packaged desktop path was never launched.** The `extraResources` entry, the
`MessagePortMain` handover and a real `utilityProcess.fork` are covered by stubs
and reasoning, not by a running app. PR 1.5 is the natural place to pay that off,
because it is the first PR whose work cannot be believed without launching one.

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

**AS BUILT, THE SEAM MOVED OUT OF THE SHELL, and this is the one deliberate
departure from the plan's file list.** §5.5 below says the dedicated server "is
the same file" as the session server, minus Electron — and that cannot be true of
a transport that lives in `electron/src/`. So:

| Planned                               | As built                                                | Why                                                                                                                                               |
| ------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `electron/src/net-transport.ts`       | `server/net/transport.ts`                               | The seam ships with the session, so PR 5 inherits it                                                                                              |
| —                                     | `server/net/reliability.ts`                             | Split out; one instance per peer                                                                                                                  |
| `electron/src/net-transport-udp.ts`   | `server/net/udp.ts`                                     | Its packets never touch the main process's event loop                                                                                             |
| `electron/src/net-transport-steam.ts` | `electron/src/net-steam-p2p.ts` + `server/net/relay.ts` | `steamworks.init()` is a global handshake the main process owns; its packets are RELAYED into a transport the session cannot tell from the socket |
| —                                     | `server/net/hub.ts`                                     | Admission had no home in the original list                                                                                                        |

Each half lives where the resource it needs lives, and the session's view of the
two is identical — which is the whole point of having a seam.

- **The Steam half** — `matchmaking.createLobby` for the session
  record, `networking.sendP2PPacket` / `isP2PPacketAvailable` / `readP2PPacket`
  for the traffic, `acceptP2PSession` on the accept path. Reliability comes from
  `SendType`; the shell pumps the receive queue on its own tick. **It adds no
  reliability of its own** — layering a reliable protocol over a reliable one
  makes the connection worse the more it is helped.
- **The UDP half** — `node:dgram`, with our own tiny sequencing layer:
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
5. ~~**Character** — the joiner's `Loadout`, validated (see PR 5's trust rules).~~
   **Moved to PR 3.** It is unbuildable here and was mis-scheduled rather than
   skipped: a PR 2 joiner is a SPECTATOR and carries no loadout, because there is
   no second hero for one to belong to. It becomes a real step the moment PR 3
   seats one, which is also the first moment PR 5's trust rules have anything to
   check.

**AS BUILT, the order above is implemented literally, plus one step in front of
it that the plan did not have.** Before any of the five, a peer must echo a
CHALLENGE COOKIE derived from the session secret, its own address and the current
epoch. §5.2 asked for this and filed it under PR 5 hardening; it turned out to be
cheaper to build now than to retrofit, because it is what lets the host store
NOTHING between a probe and a join and therefore have no half-open table for a
flood to exhaust. The refusal order as shipped is **protocol → build → mods →
challenge → password → seats**: cheapest and most fundamental first, so garbage
costs the host almost nothing AND the message names the thing the player can
actually fix.

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

### 2.7 Done when — and what PR 2 actually met

**None of the six was fully met**, and the pattern is the same as PR 1's: the
machinery is there and nothing can reach it. Three need the screens, two need
hardware, and one was met somewhere the plan did not expect.

| Criterion                                                                                                                                             | PR 2 (#788)                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Eight machines over Steam, eight over a typed address, both through a NAT                                                                             | ❌ **Unverifiable as shipped** — there is no screen to host or join from, and no second machine in CI. Moves to PR 2.5                                                                |
| The HOST screen's three status rows each report true, each remedy button leaves a verified result                                                     | ❌ **No HOST screen.** Every value it needs — the bound address, the router row, the firewall row, the roster — is on the bridge already                                              |
| A UPnP mapping created on host and released on quit, checked on a real router                                                                         | ⚠️ **Built, unverified.** Needs a router; CI has none. The lease (renewed at a third of it) is what makes a leak self-heal meanwhile                                                  |
| Killing the host closes every client with a stated reason; killing a client leaves the session running                                                | ⚠️ **Implemented, not proven over a wire** — `close()` sends a `bye`, `removeClient` frees the seat, but no test drives two processes                                                 |
| Chat and `/players N` work; spectators see the run in sync                                                                                            | ⚠️ **Half.** Chat and the scaling are tested at the session; "in sync" cannot be shown until PR 1.5 makes a run go through the server                                                 |
| `npm run electron:test` covers the handshake refusals, the reliability layer's ack/retransmit under simulated loss, and the port-walk on `EADDRINUSE` | ✅ **All three covered — in `tests/engine/`**, not the shell suite, because the transport moved to `server/net/` (see §2.1). The criterion named the wrong runner, not the wrong test |

Also specified in §2 above and **not built**, all of it moving to PR 2.5: the
three menu screens (§2.4), the chat UI (§2.6), the port setting (§2.2's
"configurable in SETTINGS"), and the invite launch arguments — `+connect_lobby
<id>` and `--connect <addr>` (§2.4). Nothing under `electron/src/` reads
`process.argv` today, so **a friend accepting a Steam invite while the game is
closed currently lands nowhere.**

---

## PR 1.5 — THE VERBS

**Goal: every act the app performs on a run becomes something that can travel.**
Nothing a player can see changes; the loop still runs in the renderer. This is
the prerequisite the cutover was blocked on, and it is the half of PR 1.5 that
**landed** (#790).

It was written as one PR with §1.5.2 below, and it is worth being plain about
why it is not: **~50 distinct engine mutators** (69 verbs, as counted) is a PR on
its own, and the loop move turned out to rest on a fact nobody had measured. The
two are separated at the seam the plan itself keeps rediscovering — a layer that
is provable in isolation, and a cutover that is not. §1.5.4 records what this
half met; **the loop move is PR 1.75.**

### 1.5.1 The verbs have to travel before the loop can move

This is the dependency that made the original plan circular. The app does not
merely READ the state; it acts on it — `openInventory`, `equipFromInventory`,
`buyStock`, `sellItem`, `allocateStat`, `spendTalentPoint`, `pickTalkChoice`,
`openShop`, `openMap`, `openQuestLog`, and forty-odd more. Every one of them is a
direct call on a local `GameState`, and once the state lives in another process
every one of them has to become a `COMMANDS` entry, a `switch` case, and a
`sendCommand` at the call site.

**PR 3 was originally given this work, and that was the mistake.** The plan
conflated two different jobs on the same verbs:

- **Making them TRAVEL** — mechanical, semantics untouched, and a hard
  prerequisite for moving the loop. **That is this PR.**
- **Making them NON-BLOCKING per-player** — `state.phase` splits from
  `Player.screen`, the level-up chooser stops freezing the world, a player in
  their bag can still be killed. **That stays PR 3** (§3.2), and it is a design
  exercise rather than a rename.

Ship them here with **today's blocking semantics exactly preserved**. A command
that opens the inventory still halts the simulation, because that is what it does
now and this PR is not allowed to change how the game feels.

**Each verb is a question, not a rename**, which is why the estimate is not
"mechanical, therefore fast": does the caller need a reply, or may it fire and
forget? Does it touch state the client does not receive (the PRIVATE tier), so
the app cannot predict the outcome and must wait? Is it safe to apply
optimistically? Sort them into those three buckets first; the sort is most of the
work and the code falls out of it.

### 1.5.2 The loop moves

`GameScreen` stops calling `createGame` and driving `step()`, and drives
`pwa/src/game/net/client.ts` instead — which already exists, already hands back a
`GameState`-shaped object the renderer reads unchanged, and is today unreachable
dead code. `render.ts`, the HUD model, the effects, the overlays and the sound
bus should not need to change at all; if one of them does, that is a finding
worth writing down rather than patching past.

Three paths need to come with it, and each is a place the single-player game
could regress silently: **the parked run** (`saved-run.ts`), **the checkpoint
restore**, and **the autopilot**.

### 1.5.3 And the packaged app gets launched, for the first time

PR 1 flagged this rather than claiming it, and it is still outstanding: the
`extraResources` entry, the `MessagePortMain` handover and a real
`utilityProcess.fork` are covered by stubs and reasoning, not by a running app.
This is the first PR whose work cannot be believed without launching one, so it
is where that debt is paid.

### 1.5.4 Done when — and what the first half actually met

- A run started from the title menu plays identically to today, through the
  server. **Measured, not eyeballed**: an autopilot campaign through
  `scripts/simulate-run.mjs` and a `pwa/scripts/playtest.mjs` run, compared
  against the same seeds before the cutover.
- A parked run resumes, a checkpoint restores, and the autopilot flies — all
  three through the server.
- `npm run electron` launches the packaged path and plays.
- `make test`, `make lint`, `npm run electron:test` green; the 170 KB budget
  still passes (the net client must stay lazy).

**§1.5.1 LANDED; §1.5.2 AND §1.5.3 DID NOT.** The verbs travel — 69 of them,
over ~110 call sites in 22 modules, with scalar arguments the engine declares
and checks, one dispatch shared by the server and the app, and a drift test
holding the wire's copy of the names to the engine's table. The routing was
proved behaviour-preserving the way this section asks: the same `--seed 4242`
`moon` run through `pwa/scripts/playtest.mjs` and through
`scripts/simulate-run.mjs` produces byte-identical reports either side of the
change (kills, damage, XP, drops, deaths, sim minutes).

The loop did not move, and the reason is a measurement §0 did not have when this
was planned: **a run is not `createGame(params)`.** `createRunSession` performs
six further mutations before the first tick (see the ground-truth table), so a
session built from today's `SessionParams` would hold a different world from the
one the app built — a hero with no campaign chain, an empty purse, unread
thoughts already unread again, and an opening the player has watched four times
playing a fifth. Five of the six are plain data and belong in `SessionParams`
beside `loadout`, which is already opaque there for exactly this reason; the
sixth (`?scenario=`) is dev-only and does not travel.

The **parked run** and the **checkpoint restore** are the harder half of the
same finding, and they are why "three paths need to come with it" was an
understatement: both ADOPT an arbitrary `GameState` rather than building one, so
the session needs a way to be handed a state and to send an arriving client a
FULL snapshot instead of a delta against a genesis it does not share.
`server/session.ts` already carries the `Sent.full` shape for that and nothing
has ever used it.

§1.5.3 is unchanged and still outstanding: the packaged path has never been
launched — and cannot be from a sandbox that cannot fetch the Electron binary,
which is where #790 ran.

**All of that is now PR 1.75 (THE LOOP MOVES)**, above: the five `SessionParams`
fields, the adopt-a-state start, the run-driver seam in `GameScreen`, the
autopilot's five remaining direct mutators, and a real `npm run electron`.

### 1.5.5 Risks

**This is the change most likely to cause a silent single-player regression**,
and the mitigation is the one §3.5 already prescribes for PR 3: **land it as a
commit series, not one commit.** The mutator conversions in reviewable batches,
each leaving the game playable, and the loop move last. A regression found at the
end of an unbisectable branch costs more than the whole PR.

What that risk actually looked like in practice is worth recording, because it
was cheaper to answer than to argue about: the conversion is mechanical enough
that it can be proved rather than reviewed. The same seeded run through
`pwa/scripts/playtest.mjs` and `scripts/simulate-run.mjs` either side of the
change produced identical reports — kills, damage dealt and taken, XP, drops,
deaths, simulated minutes — which is a stronger statement than any reading of a
110-site diff. **Do the same for PR 1.75**, where the risk is far higher.

---

## PR 1.75 — THE LOOP MOVES

Tracked as [#793](https://github.com/niclaslindstedt/game/issues/793).

**Goal: `GameScreen` stops owning the loop.** A run started from the title menu
plays identically to today, with the simulation in the utility process and the
renderer applying snapshots. Nobody notices anything.

That is PR 1's own §1.6 headline, still unmet, and it is what PR 1.5 was
originally supposed to finish. The verbs it was blocked on now travel; what
remains is four things, and the first two are the reason this is a PR rather
than an afternoon.

### 1.75.1 A RUN IS NOT `createGame(params)` — the finding this PR exists for — **LANDED**

The whole static tier rests on one claim: the client's own `createGame` produces
the same world the server's did, so the first delta is nearly empty. That claim
is TRUE of `createGame` and FALSE of a run, because `createRunSession`
(`pwa/src/game/game-screen/run-setup.ts`) performs **six** further mutations
before the first tick:

| What                                                 | Shape          | Travels as                       |
| ---------------------------------------------------- | -------------- | -------------------------------- |
| `seedCampaignQuests` — the hero's campaign chain     | a plain record | opaque, like `loadout`           |
| `state.player.coins = characterPurse(hero)`          | one number     | a number                         |
| `markThoughtsSeen` — what this hero has already read | a string list  | a string list                    |
| the opening already watched on this difficulty       | a decision     | a boolean                        |
| `muteDialogue` for a bot run                         | a flag         | a boolean                        |
| `?scenario=` — the dev staging hook                  | arbitrary      | **it does not.** Dev-only, local |

A session built from those parameters therefore held a hero with no campaign
chain, an empty purse, unread thoughts made unread again, and an opening the
player has already sat through four times playing a fifth — and the client's
first delta would have carried every one of those as a "correction" to a run
that was right to begin with. So five of them joined `SessionParams` beside
`loadout`, which was already opaque there for exactly this reason, and **the
rule to hold on to is the one that was violated by omission: anything the app
does to a run before its first tick is a session parameter, not app code.** A
field added to `createRunSession` and not to `RunParams` is a desync that will
look like a replication bug.

**How it landed, and the shape worth keeping.** There is now ONE function —
`createRunFromParams` (`src/game/session-setup.ts`) — and all three callers use
it: the app builds a fresh run with it, the session server builds its
authoritative run with it, and an arriving client rebuilds the same run with it.
`RunParams` is deliberately written in the WIRE's terms (`difficulty` a string,
`loadout` and `campaignQuests` opaque, `openingSkip` a string) so a
`SessionParams` is assignable to it with no conversion at all: the wire leaf may
not import the engine, so a conversion would be a third copy of the shape kept
by hand, and the field somebody forgets to copy is precisely this bug again.

The test that would have caught it is now in `net_determinism_test.ts`: it
compares a REAL run rather than a bare level, with every parameter set to
something other than its default (a parameter left at its default cannot fail a
determinism test), and it asserts outright that a run and a bare `createGame`
with the same seed are NOT the same thing.

### 1.75.2 The adopted run — the parked run, the checkpoint, and `Sent.full` — **LANDED**

The same finding, one step harder. A **parked run** (`saved-run.ts`) and a
**checkpoint restore** (`checkpoint.ts`) do not call `createGame` at all; they
adopt an arbitrary `GameState`. There are no parameters that describe them,
which is not a gap in the parameters — it is the nature of the thing.

So the session needs a second way in: it is HANDED a state rather than told how
to build one, and the arriving client is answered with a FULL snapshot instead
of a delta against a genesis it does not share. `server/session.ts` already
carries the `Sent.full` shape for precisely this and **nothing has ever used
it**, which is worth treating as a warning rather than as a convenience: an
untravelled path in a replication layer is an untested one. Two details it will
need — the rng closures do not survive the trip (`saved-run.ts` already
snapshots their positions through a migration ladder, and that is the mechanism
to reuse), and the static tier is still free here, because a parked run's level
came from the same seed and difficulty the client will rebuild from.

### 1.75.3 The driver seam, and the three paths through it — **LANDED**

`GameScreen` stops calling `createGame` and driving `step()`, and drives
`pwa/src/game/net/client.ts` instead — which already exists, already hands back a
`GameState`-shaped object the renderer reads unchanged, and is today unreachable
dead code. `render.ts`, the HUD model, the effects, the overlays and the sound
bus should not need to change at all; if one of them does, that is a finding
worth writing down rather than patching past.

Two mechanical notes that are easy to get wrong and would be silent:

- **The loop's `state` arrives ASYNCHRONOUSLY on the net path** (after the
  welcome), while `createRunSession` hands it back synchronously today. Every
  helper in the run effect closes over it.
- **`state.events` is cleared by `step()` on the local path and by NOBODY on the
  net path.** A snapshot goes out every third tick, so a driver that does not
  clear the list after the app has consumed it replays every sound, gore burst
  and haptic three times.

And a third path the plan named but did not size: **the autopilot**. The bot's
DECISIONS are already fine — `botAct`, `botAllocate` and `botPickTalent` only
read, and their answers travel as input and as commands. But five of its
housekeeping calls still mutate the state directly (`botAutoEquip`,
`cullWorstLoot`, `sortBotInventory`, `tradeAtMerchant`, `stepBotWeaponSwap`), and
against an authoritative server a local mutation is a change the next snapshot
erases. Four take only a `GameState` and can become commands like any other; the
fifth takes the bot's own swap memory, so it is a real decision rather than a
conversion — either that memory moves onto the run, or the bot runs server-side.
**Answer it deliberately; it is the last thing in this PR that is a design
question rather than a rename.**

### 1.75.4 And the packaged app gets launched, for the first time — **STILL OWED**

PR 1 flagged this, PR 1.5 did not reach it, and it is still outstanding: the
`extraResources` entry, the `MessagePortMain` handover and a real
`utilityProcess.fork` are covered by stubs and reasoning, not by a running app.
This is the first PR whose work cannot be believed without launching one, so it
is where that debt is paid. (Note for whoever does: it cannot be paid in a
sandbox that cannot fetch the Electron binary — #790 tried.)

### 1.75.5 Done when

- A run started from the title menu plays identically to today, through the
  server. **Measured, not eyeballed**, exactly as §1.5.5 did it: an autopilot
  campaign through `scripts/simulate-run.mjs` and a `pwa/scripts/playtest.mjs`
  run, compared against the same seeds before the cutover.
- A parked run resumes, a checkpoint restores, and the autopilot flies — all
  three through the server.
- ~~A test proves the session's world and the client's world agree **for a real
  run** rather than for a bare `createGame`~~ — **done**: `net_determinism_test.ts`
  builds a fully-populated run in a second process and hashes it, and asserts
  that a run and a bare `createGame` differ.
- **The tripwire is inverted.** `tests/content/net_reachability_test.ts` asserts
  today that the run loop does NOT reach `pwa/src/game/net/client.ts`; the day
  the cutover lands that test fails, and flipping it to the positive assertion
  is part of this PR rather than a follow-up. See §1.75.7.
- `npm run electron` launches the packaged path and plays.
- `make test`, `make lint`, `npm run electron:test` green; the 170 KB budget
  still passes (the net client must stay lazy).

### 1.75.6 Risks

**This is now the change most likely to cause a silent single-player
regression** — PR 1.5 inherited that title and handed it on, having proved its
own half harmless. The mitigations are the same and they are not optional: a
commit series rather than one commit, the loop move last, and the seeded
before/after comparison as the acceptance evidence rather than a reviewer's
reading of the diff.

The specific failure to watch for is the one this PR exists because of: a
difference between the two worlds shows up not as a crash but as a first delta
that is unexpectedly LARGE, and then as a run that plays correctly while
quietly costing bandwidth it was designed not to spend. **Assert on the size of
the first delta**, not merely on the states agreeing afterwards — the two
processes will converge on the server's world either way, which is exactly what
makes the bug invisible.

### 1.75.7 How this is kept honest

**This plan has been amended twice for the same failure — a layer ships and the
cutover does not — and both correctives were prose.** Prose is nought for two.
So the state of the work is asserted where the build can see it, which is this
repo's habit everywhere else (the `COMMANDS` drift test, the library's coverage
maps, `assembleRows` throwing for a row id no builder answers).

Three guards, and the second is the one that matters:

1. **`tests/engine/run_params_test.ts`** — `RunParams` and `SessionParams` name
   the same fields, minus the two engine FLAGS the wire carries and the builder
   does not. It catches §1.75.1's failure class directly: a field added to one
   shape and not the other, which converges on the server's world either way and
   so can never announce itself as a crash.
2. **`tests/content/net_reachability_test.ts`** — a TRIPWIRE, written negatively
   on purpose. It asserts what is true today (the run loop does not reach the
   net client) and therefore **fails on the day somebody wires the loop to the
   session**. Whoever does the cutover cannot finish without coming to it and
   stating the new truth, and nobody can quietly half-do it. An `it.fails` or a
   `todo` would have been green in both worlds, which is the same silence the
   file exists to end. It carries the permanent half of the rule beside it: the
   app's STARTUP path must never statically reach `pwa/src/game/net/` or
   `@game/core`, which is the 170 KB budget stated as the import that would
   break it rather than as the number that would report it.
3. **The first-delta size assertion** of §1.75.6, which has no home yet and
   should get one with the driver seam.

---

## PR 2.5 — THE SCREENS

**Goal: a player can open a door to the session PR 2 built.** Everything here was
specified in §2 and deferred, and none of it was deferred for lack of a
foundation — the bound address, the router and firewall rows, the roster and the
browser rows are all on the `__gisNet` bridge already.

**It depends on PR 1.75 and cannot go first.** A JOIN screen in front of a run
that still simulates in the renderer is a door into a session nothing plays
through — which is precisely why PR 2 held it.

### 2.5.1 What it ships

- **The three screens of §2.4** — HOST GAME, JOIN GAME (the browser), and JOIN BY
  ADDRESS. Authored in `content/mainmenu.yaml`, because **the menu tree is
  content**: a screen that is not in the file does not exist, and `assembleRows`
  throws for a row id no builder answers — so the rows and their builders land in
  the same commit.
- **The HOST screen's status panel** of §2.2, live, with each row reporting on
  one of the three independent things that can block an inbound connection, and
  each with its own remedy. **The row shows the port the socket ACTUALLY got.**
- **The chat overlay of §2.6** — `PixelText` for the log, the `.pixel-input`
  widget for the field (it already carries the hard-won iOS predictive-text
  handling in `pwa/src/game/hero-name.ts`), and a scrollback that does not steal
  the steering thumb's third of the screen.
- **The port setting** of §2.2, in SETTINGS.
- **The invite launch arguments** of §2.4 — `+connect_lobby <id>` when a friend
  accepts a Steam invite while the game is closed, and `--connect <addr>` for a
  shareable direct link. Both arrive in `main.ts` before the window exists and
  have to be **parked until the page is up**. Nothing reads `process.argv` today.

### 2.5.2 Two rules carried over from §2

**THE 170 KB CRITICAL-PATH BUDGET IS THE LIVE HAZARD OF THIS PR**, more than of
any other. These are TITLE MENU screens, i.e. the app's startup path. They may
import `@game/menu` and the import-free `@game/wire/*` leaves — never
`pwa/src/game/net/`, which reaches `@game/core` and would drag the whole
simulation into every player's first download. `pwa/scripts/check-seo.mjs` is
what catches it; do not raise the number.

**A browser row this build cannot join is shown, not hidden.** A player whose
friend is on a newer build and whose list is simply empty concludes the feature
is broken; one who sees the session greyed with "BUILD 1.4.2" goes and updates.

### 2.5.3 Done when

This is where PR 2's own §2.7 finally gets answered, so its six criteria are
inherited verbatim — eight machines over each transport through a NAT, the three
status rows each independently true with verified remedies, a UPnP mapping
created and released **on a real router**, a killed host closing every client
with a stated reason, and spectators seeing the run in sync.

Plus, of this PR's own:

- A `+connect_lobby` launch from a cold start reaches the right session.
- The `ui-review` skill's screenshot audit passes at all nine reference
  viewports, chat overlay included.
- The budget check still passes.

### 2.5.4 What PR 2.5 actually shipped — and the finding it ran into

**THE JOINER'S HALF OF THE WIRE DID NOT EXIST.** §2.5's own preamble says
nothing here "was deferred for lack of a foundation", and that was true of every
row it listed and false of the thing they all lead to: `hub.ts` is the host's
admission desk, and NOTHING anywhere spoke the other side of that conversation.
The page's `NetClient` waits for a welcome; it never probes, never echoes a
challenge and never sends a join, because until this PR the only client was the
host's own renderer at the end of a `MessagePort`. So a JOIN screen built to the
letter of §2.5.1 would have been the third repetition of this plan's own
recorded failure — a layer that ships with nothing able to reach it.

So PR 2.5 also built `server/net/connect.ts` (the probe → challenge → join
state machine, tested against the REAL hub in `tests/engine/net_connect_test.ts`)
and gave the session process a second role: `connect` makes it a JOINER, with no
simulation, a socket opened outward and the same port carrying somebody else's
frames to the same renderer. The page's client cannot tell the two apart, which
is why joining cost one module rather than a second client.

**Four deliberate departures from §2.2 and §2.4, each with its reason:**

1. **THE HOST SCREEN IS NOT A LOBBY, AND THE LIVE ROWS ARE ON THE PAUSE
   SCREEN.** §2.2 sketches the status panel on the HOST screen. A session exists
   only while a RUN does — hosting is a game you start with the doors open — so
   the port the socket actually got, the address to hand a friend, the router's
   answer and the seats are all facts a title-menu screen cannot have. HOST GAME
   keeps what it can answer beforehand (the doors, the seats, the password, the
   port to try, the FIREWALL check, which is a property of the machine) and its
   START row walks into the ordinary difficulty and mission pickers. Building
   the lobby instead would have meant a second idle simulation standing on the
   map, and would have made the host's own renderer a client of a session it did
   not build — which is PR 3's cutover, not this one's.
2. **THE PORT SETTING IS ON THE HOST SCREEN, NOT IN SETTINGS.** §2.2 says
   "configurable in SETTINGS". The HOST screen IS a settings form, and a port
   row three screens away from the only thing that binds it is a row nobody
   finds. It is persisted with the rest of the session settings either way.
3. **THE SESSION NAME IS DERIVED, NOT TYPED.** `NIGHTHAWK'S GAME`, from the
   hero. A browser row needs to say who is hosting; a text field for it costs a
   modal and earns a joke that stops being funny by the third session.
4. **THE THREE DOORS HANG UNDER A `MULTIPLAYER` SCREEN** on the front door
   rather than as three front-door rows, which would have run a landscape phone
   to eleven rows again — the exact length EXTRAS exists to avoid.

**What could not be verified here, and is still owed:** the eight-machine runs
over each transport through a NAT, the UPnP mapping against a real router, the
firewall remedies on each OS, and the packaged `npm run electron` launch (still
§1.75.4's debt). None of them can be met in CI, and none of them are met by
reading the diff. The `ui-review` screenshot audit is likewise owed: the harness
drives a browser, where every one of these screens is deliberately absent.

---

## PR 3 — THE PARTY

**Goal: eight heroes, not one.** This is the mountain, and it is a design
exercise wearing a refactor's clothes.

> **§3.1 HAS LANDED; §3.2 AND §3.3 HAVE NOT.** The party model, the
> parameterization, every shared read in the table below and the session seating
> are in the tree — see **§3.6** for exactly what that means and what it does
> not. The split is along the same seam §1.5 was split on, and for the same
> reason: making the simulation PARTY-AWARE and making a party COMFORTABLE are
> two jobs, and the first is a prerequisite that leaves single player untouched.

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

**The verbs that raise those phases already TRAVEL by the time this PR starts —
PR 1.5 made them commands.** What is left here is the half that was always the
design exercise: changing what they MEAN. Do not re-do the plumbing; read
`COMMANDS` in `server/wire/protocol.ts` and change the semantics behind it.

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

### 3.6 What §3.1 actually shipped — and the two things it deliberately did not

The sequencing §3.5 asks for is what was followed, and it is what makes the
split honest: four commits, each leaving `make lint` and `make test` at zero,
each leaving single player byte-identical.

**LANDED.**

- **`GameState.players`**, a NON-EMPTY tuple (`[Player, ...Player[]]`) in seat
  order. The type states the invariant the rest rests on: `players[0]` reads as
  a `Player` while `players[seat]` — an index that may have come from a
  stranger's command — reads as `Player | undefined` and has to be checked.
- **The private reads became a parameter.** 285 declarations, ~1200 call sites:
  every derived-stat, item, talent, spell and consumable accessor takes the
  `Player` it is about beside the run it is in. The 103 sites that opened with
  `const player = state.player;` had that line become the signature. The loadout
  memo needed nothing — it was already keyed by the Player OBJECT in a WeakMap,
  so a second hero gets a second memo for free.
- **Every shared read in §3.1's table**, each with a test in
  `tests/engine/party_test.ts` that would pass trivially with one hero: aggro
  (nearest visible, hysteresis on `Enemy.quarry`, sight outranking the
  hysteresis), the spawner (centroid budget, per-hero placement, party level),
  packs and lairs and spawn points and the exit (ANY hero), hazards (a blast
  bills everybody; a gust keeps its single victim by design), the merchant
  (whoever finds him finds him for everybody), the fog (shared, one grid), and
  the menace meter (scaled to the party's highest level).
- **`step()` takes per-seat input.** A plain `GameInput` still means seat 0, so
  no caller changed; an ARRAY is index-aligned with the party. A seat with no
  frame contributes `IDLE_INPUT` rather than repeating its last one.
- **The run ends when the PARTY falls** (`partyWiped`), not when a hero does.
- **`createHero` is lifted out of `createGame`** so seat 0 and every later
  arrival are built by one function, and **`seatHero`** appends a joiner beside
  the party with their own bag, purse and build.
- **The session seats every admitted player.** `addClient` takes a seat request;
  the seat is the SERVER's answer and travels back in the `welcome`; the join
  frame carries the arriving player's loadout. `Recipient` is a seat rather than
  a boolean, so seat 3 sees seat 3's bag and nobody else's.
- **The app knows which hero it is about.** `localHero(state)` replaced the 257
  places that read seat 0; the seat comes from the welcome and is cleared on
  dispose. 167.4 KB critical path, inside the budget.

**NOT LANDED, and each is a job rather than a loose end.**

- **§3.2, the per-player screens.** This is the design exercise, and it is
  bigger than the plumbing it sits on: `state.phase` has to lose eleven members
  to a new `Player.screen`, the non-blocking level-up is a real single-player
  BEHAVIOUR change that owes the changelog a line of its own, and `dialogue`,
  `cutscene` and `choice` each need a group protocol rather than a per-player
  one. Nothing about it is blocked — the verbs already travel — but it changes
  how the game feels for a single player, which is why it is not smuggled in
  beside a refactor that changes nothing.
- **§3.3, prediction and reconciliation.** Untouched. A client still shows its
  hero where the last snapshot put him.
- **The command channel carries no SEAT.** A shop, an equip or a stat spend
  arriving from a joiner is dispatched against seat 0. See §3.7 — it is the next
  thing to do, and it comes BEFORE §3.2 rather than after it.
- **A joiner's run is still not banked** to their roster (PR 4's §4.5), and the
  autopilot, the headless simulator and the analytic readouts still fly seat 0 —
  which is correct for what they measure and is what §3.4's "multi-player
  campaign headlessly" line will change.

### 3.7 The order the remainder has to be done in — and why there is no PR 3.5

Two things were found while §3.1 was being built that this plan did not have a
place for. Neither should become a numbered half, and the reasons are different
in each case; both are written down here so the next session inherits them
instead of rediscovering them.

**THE SEAT ON THE COMMAND CHANNEL IS A PREREQUISITE OF §3.2, NOT A SUCCESSOR OF
PR 3.** Measured against the tree §3.1 left: **20 of the 72 verbs in
`applyRunCommand` spell `state.players[0]`** — `equipFromInventory`,
`equipFromInventoryInto`, `unequipToInventory`, `moveInventoryItem`,
`discardFromInventory`, `discardEquipped`, `autoEquipBest`, `scrapInferiorLoot`,
`discardHeldAbility`, `spendGateKey`, `allocateStat`, `deallocateStat`,
`spendTalentPoint`, `beginRespec`, `confirmRespec`, `spendCleanSlate`,
`promptPendingPoints`, `reclaimVaultItem`, `clearVault`,
`refundAutopilotBuild`. They are spelled out rather than hidden ON PURPOSE — the
parameterization left the seat visible at every call site precisely so this list
could be produced by grep rather than by reading — and a joiner's equip currently
lands on the host's hero.

It has the exact shape the plan's halves exist for: PR 1.5 made the verbs
TRAVEL, and nothing made them travel to the right HERO. That is the same
layer-without-its-cutover failure the amendments were written for, and it is its
fourth instance.

**But it cannot be numbered 3.5, because a 3.5 sorts after 3 and this has to
happen before §3.2.** `openInventory` cannot be made non-blocking per player
until it knows WHICH player; the screen and the verb are the same decision seen
from two ends. So it is the OPENING commit series of PR 3's remainder — one
field on the command frame, the seat the session already knows, and a `Player`
argument through `applyRunCommand`'s dispatch — and §3.2 follows it. A number
that implied otherwise would be a label that lies about the order, which is worse
than no number at all.

**WHAT AN ABANDONED HERO MEANS IS NOBODY'S — AND IT SHOULD BE PR 4'S.** §3.1's
rule that a seat is appended and never spliced out is right and must stay (every
command and input frame in flight names a seat by index). Its consequence is that
a player who leaves has a body left standing on the map, and NOTHING in this plan
says what that body is. The acute bug is fixed — a departing player's last input
frame is cleared, so the hero stops walking rather than continuing toward
wherever they were last steering for the rest of the run — but the POLICY is
open, and four separate rules currently answer it by accident:

- it still holds a seat, so the party cannot grow past it;
- it still counts in `partyLevel`, so a departed level-90 can hold the horde's
  level up over a party of level-20s;
- it still draws aggro and still soaks a share of the horde's attention;
- it still counts as alive, so `partyWiped` can never fire while it stands and
  the remaining party can never lose the run.

That last one is the sharp end: a group whose fourth player quit cannot be
defeated. It belongs in **PR 4** rather than in a half of its own, because it is
a question about what a body on the field MEANS — the same question §4.2 answers
for a corpse and a respawn — and answering it beside them is how the two stay
consistent. PR 5's §5.4 (reconnect) is the adjacent case and not the same one:
reconnect is about somebody who IS coming back.

**AND THE MEASURING INSTRUMENT SHOULD NOT GO LAST.** §3.4's done-when includes
`scripts/simulate-run.mjs` running a multi-player campaign headlessly, on the
stated grounds that it is "what makes PR 4's tuning measurable instead of
guessed". It is independent of §3.2 and §3.3 — it needs a party, which now
exists — so it can be built in parallel with them rather than after. Every
instrument this repo has was built before the thing it measures; leaving this one
until last is how PR 4's `/players N` pass ends up guessed anyway.

---

## PR 4 — THE CO-OP GAME

**Goal: the campaign, played co-op, start to finish.** PR 3 makes eight heroes
possible; PR 4 makes eight heroes a game.

> **§4.2's ABANDONED HERO AND §4.3's RULES HAVE LANDED; §4.4, §4.5 AND §4.2's
> CORPSE HAVE NOT — AND §4.1's HUB IS NOW ITS OWN PR (PR 6).** The split is along the same seam every earlier one
> was: making the run's ARITHMETIC party-aware — whose the XP is, whose the loot
> is, what heats the meter, what a body nobody is steering means — is one job,
> and it is a prerequisite of the fixtures (a hub, a party HUD, banking) that
> sit on top of it. See **§4.7** for exactly what that means, what it
> deliberately did not do, and the one thing that turned out to be a
> prerequisite nobody had scheduled.

### 4.1 The town — MOVED TO PR 6

**The hub is no longer PR 4's**, and the section that was here has been lifted
whole into **PR 6 — THE GARAGE**. Two reasons, and neither is that it stopped
mattering:

- **It is not co-op arithmetic.** Everything else in PR 4 answers a question of
  the form "with eight heroes, whose is this / what does this mean" — the XP,
  the loot, the meter, a body nobody is steering. The hub is a level, a new
  level-swap mechanism, a parked merchant and a change to the story chain. Those
  share nothing but a PR number.
- **It turned out not to be authored content.** The claim that it was is what
  made it look small enough to sit inside PR 4; three findings against the real
  tree say otherwise (they travel with it — see PR 6's §6.3).

What PR 4 keeps is the consequence: **until PR 6 lands there is nowhere to put a
joiner**, so a session hosted mid-campaign drops them into somebody else's boss
fight. That is a stated cost of the ordering rather than an oversight, and PR 6's
goal says so in its own words.

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
- **AND WHAT AN ABANDONED HERO IS — the question §3.1 created and nobody owns.**
  A seat is appended and never spliced out (every command and input frame in
  flight names one by index), so a player who leaves has a body left standing on
  the map, and four separate rules currently answer for it by accident: it holds
  a seat so the party cannot grow past it, it counts in `partyLevel` so a
  departed level-90 holds the horde's level up over a party of level-20s, it
  draws aggro, and it counts as alive — so **`partyWiped` can never fire while it
  stands, and a group whose fourth player quit cannot lose the run.** That last
  one is the sharp end. It belongs here rather than in a PR of its own because it
  is the same question this section already answers for a corpse: what does a
  body on the field MEAN. Reconnect (§5.4) is the adjacent case and NOT the same
  one — that is somebody who is coming back. See §3.7.

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

### 4.7 What the first half actually shipped — and the instrument it could not use

Four rules landed, and they have one property in common that is worth stating
before the list, because it is what made them safe to ship together: **every one
is an exact no-op at one hero.** Not "close enough" — a solo run pays the same
XP, stamps no owner on any drop, divides its menace read by one, and has no seat
anybody can leave. So none of them can re-tune the shipped campaign, and the
whole engine suite (1688 tests) stayed green without a single expectation being
moved.

**LANDED.**

- **`Player.departed`, and `heroInPlay` as the ONE predicate.** The question
  §3.7 created and nobody owned. A seat is still never spliced out; what changed
  is that the world stops answering for the body in it. Not chased, not in the
  centroid, not in `partyLevel`, not a pack's alarm clock, not a hazard's
  victim, not a share of the meter's per-capita read, not stepped at all — and
  not ALIVE, so `partyWiped` fires and a group whose fourth player quit can lose
  the run. `nextFreeSeat` then hands that seat to the next arrival, so a session
  people have come and gone from does not fill up with bodies holding slots.
  The predicate folds "at 0 hp" and "nobody is steering this" into one check on
  purpose: every question above has the same answer for both, and splitting them
  is how one of the eight sites quietly keeps reacting to a body nobody is
  behind.
- **§4.3's XP sharing** — proximity-gated and level-weighted, in the leaf
  `src/game/xp-share.ts`. `grantXp` took the recipient as a PARAMETER (§3.1's
  rule: a bar and a pile of banked stat points are as private as a bag), and
  `shareXp(state, amount, pos)` is the door every KILL goes through. Everything
  else with an obvious owner — an arrow, an errand, a scripted grant — stays a
  direct grant, because sharing one out would be a gift from the player who
  earned it to one who did not. The per-map cap now reads the RECIPIENT's level.
- **§4.3's loot ownership** — `GameState.lootMode`, free-for-all by default with
  a host toggle (HOST GAME → LOOT), decided deliberately rather than inherited.
  `Item.owner` is stamped in `dropItem` — the one funnel every drop goes through,
  which is why no call site had to learn who killed anything — off the ITEM's
  hash rather than `state.rng()`, so an allocated session rolls the same items
  from the same seed a free-for-all one does.
- **§4.3's menace meter** — read PER CAPITA. `stepItems` had to be split into a
  per-ITEM arc pass and a per-HERO pickup pass on the way, which was a real bug
  rather than a tidy-up: a party of eight walking one loop counted every toss
  down eight times as fast.

**NOT LANDED, and the reasons differ.**

- **§4.2's corpse and respawn are BLOCKED**, and by this plan's own text: "PR 3's
  phase split already makes `dying` a `Player.screen`". §3.2 has not landed, so
  `dying` and `defeat` are still global phases and there is no per-player death
  to give a corpse to. `applyDeathXpPenalty` is party-aware in the meantime — it
  bills every non-departed hero on the wipe, which is the transition it actually
  rides — but that is the PARTY falling, not a player dying.
- **§4.1 the town, §4.4 mods, §4.5 the party HUD and banking are simply not
  done.** §4.1 is authored content and, if the hub speaks a single line, a story
  chain edit that needs the user's confirmation before it is written — which is
  a conversation rather than a commit. §4.5's banking is the other half of the
  spectator's throwaway character.

**AND THE INSTRUMENT IS THE FINDING — §4.3's "measured pass, not a guessed one"
COULD NOT BE RUN, AND IT IS §3.4's FAULT RATHER THAN §4.3's.** This section says
the menace reconciliation is measured with `scripts/simulate-run.mjs` plus the
autopilot at 2/4/8 players. That simulator can fly exactly one hero: **the bot
reads `state.players[0]` at 164 sites across `src/game/bot/`**, so `botAct` has
no notion of WHICH hero it is steering. §3.7 predicted this in as many words —
"leaving this one until last is how PR 4's `/players N` pass ends up guessed
anyway" — and it was right.

What shipped instead is the STRUCTURE with its reasoning stated, plus unit-level
proof of each claim (`tests/engine/coop_rules_test.ts`): the meter reads a party
of eight's summed output as identical to one hero's, the XP splits 20:60 the way
it says it does. That is not the same as a campaign measured at four players, and
it must not be recorded as if it were. So the next thing PR 4 owes, BEFORE the
party HUD, is the bot parameterized on a `Player` — the same mechanical
refactor §3.1 did to the engine, one file at a time — and then the numbers.

Two knobs are the levers when that happens, and both are deliberately shipped at
a stated default rather than a tuned one: `XP_SHARE.partyBonusPerHero` (how much
bigger a shared pot is than a solo one — read the per-CAPITA XP rate off a
multi-player run, never the per-kill share, because a party also clears faster
and the two effects only show up together) and the `/players N` pairing itself.

**AND TWO OF PR 5's RULES ARE ALREADY OWED — see the box at the head of §5.3.**
A co-op run currently banks its records to the leaderboards exactly as a solo
run does (there is no `PartyStamp`, and §5.3 says there must be), and a joiner's
loadout is accepted verbatim off the wire (there is no validation, and §5.3 says
there must be). Both became reachable when PR 2.5 opened the doors, which is a
PR earlier than the section that owns them — so they are debts now rather than
future work, and they belong at the front of PR 5 rather than beside the trade
window.

---

## PR 5 — PRODUCTION

**Goal: shippable.** Everything between "it works with friends" and "it works
with strangers, at scale, forever".

> **PR 5 IS NO LONGER LAST, AND "SHIPPABLE" IS THE WORD TO READ CAREFULLY.** The
> garage (PR 6) sorts after it, so the mode ships WITHOUT A HUB: a joiner lands
> in the middle of whatever mission the host is on. That is a deliberate order —
> PR 5 is what makes co-op work, PR 6 is what makes it pleasant — and it is
> stated at both ends so nobody reads this section's title as "and then we are
> done". If the missing hub turns out to be the first complaint, PR 6 moves up;
> nothing in PR 5 depends on it.
>
> **TWO OF THIS PR'S RULES ARE ALREADY DEBTS RATHER THAN FUTURE WORK** — see the
> box at §5.3. They should be the FIRST commits here, ahead of the trade window,
> because both are open in the tree today rather than at some point when this PR
> starts.

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

> **TWO OF THIS SECTION'S RULES ARE ALREADY OWED — they became REACHABLE a PR
> early, and neither is written.** This is the plan's recurring failure in its
> fourth form: a layer ships and the rule that was supposed to arrive with it
> does not. PR 2.5 opened the doors and PR 3 started seating real heroes off the
> wire, so both of the gaps below are open in the tree TODAY, on the direct-UDP
> path, rather than at some future point when PR 5 starts.
>
> 1. **THERE IS NO `PartyStamp`, so a co-op run banks records like a solo one.**
>    The rule below says a multiplayer run must not contribute to leaderboards,
>    and nothing anywhere marks a run as a session run — grep finds no stamp, no
>    flag, no reader. The boards rank lifetime kills, the hardest single blow and
>    the best kill rate SUSTAINED over ten minutes of combat clock, and every one
>    of those is inflated by seven other people helping without anybody having to
>    cheat at all. It is small — a flag on the run, seeded from `SessionParams`
>    like every other run parameter, read where `ModStamp` is already read — and
>    it should be done at the FRONT of PR 5 rather than beside the trade window.
> 2. **A JOINER'S LOADOUT IS TAKEN VERBATIM.** `server/session.ts` passes
>    `wants.loadout` — a claim that arrived from a stranger — straight into
>    `seatHero`, and there is no `validateLoadout` in the tree. The rule below
>    asks for level-within-range, items mintable from the catalogs, and stat
>    points summing to what the level allows. Note the honesty the rule itself
>    demands: it is a speed bump, not a wall, and whatever ships must say so.
>
> Both are recorded HERE rather than in PR 4's §4.7 on purpose: they are PR 5's
> rules, and moving them would be renumbering a decision instead of noting a
> debt. What §4.7 owes them is a pointer, which it has.

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

### 5.7 Done when

- The two debts at §5.3 are paid: a co-op run is stamped and kept off every
  leaderboard, and a joiner's loadout is validated on arrival (honestly
  described as a speed bump, not a wall).
- Trade moves an item in one server-side transaction or not at all, and the
  anti-dupe rules have a test each.
- The decoder survives a fuzz pass without throwing or over-reading.
- An 8-player session soaks for hours without leaks, drift or snapshot growth,
  and stays playable at 150 ms / 2% loss injected at the transport seam.
- The dedicated server runs from a config file with no Steam dependency, out of
  the same file the utility process uses.
- `docs/multiplayer.md`, `docs/configuration.md`, `docs/troubleshooting.md` and
  the README describe what actually shipped — including, plainly, that there is
  no hub yet and where a joiner lands without one.

---

## PR 6 — THE GARAGE

**Goal: somewhere to stand, and somewhere to land a joiner.** This was PR 4's
§4.1 and is its own PR because it is a different kind of work: a level, a new
level-swap mechanism, a parked merchant, party travel, and a change to the story
chain — none of which is co-op arithmetic.

**IT SORTS LAST ON PURPOSE, AND THE COST OF THAT IS STATED HERE RATHER THAN
DISCOVERED.** A hub is what makes co-op PLEASANT; PR 5 is what makes it WORK.
Until this lands, HOST GAME drops a joiner into the middle of somebody else's
boss fight, which is a real and felt shortcoming of every session shipped before
it — not a hypothetical. If that becomes the thing people complain about first,
this PR moves up the order, and moving it is cheap because nothing else depends
on it.

### 6.1 The fixture: the hero's GARAGE

D2's whole social loop is town ↔ wilderness: meet, vendor, stash, regroup, chat,
portal out together. This game has **no hub**. The merchant _wanders the field_
and is discovered by proximity; there is nowhere safe to stand; "start a game,
people join" has nowhere to land.

**The hub is the hero's GARAGE, and it should never have been a neutral town.**
The garage is the most established place in this story and the only one that is
HIS: ten years of weekends building the ship, the LAUNCH cutscene set there at
night, the starting weapon coming off the wall of the room beside it, and it is
what ELON MOSQUE calls him by — _"KEEP THE RIFT, GARAGE MAN."_ A hub is a place
you come back to between missions, and this campaign is a man trying to get home.
Inventing a town beside that would be building a worse version of a fixture the
game already has.

What stands in it: the **workbench** (the stash, when PR 5's §5.1 lands — until
then the lost-and-found vault the AUTO PILOT already fills), the **merchant** at
a counter, the **quest givers** present rather than scattered, a whole-floor
**safe zone** (which already exists), and the **door** (§6.2). No spawners.

### 6.2 The RIFT DOOR — the level select, and the one ordering decision

**Level select is a rift door standing in the garage**, and the fiction needs no
new idea for it, because a portable artefact that tears open the way to a LEVEL
already ships: RASPUTIN drops **THE SEVERED HAND**, "a junk-looking trinket that
secretly tears open the way to the secret BUNKER level". The rift door is the
second instance of that mechanic, not the first. The fiction has also already
established that a rift can be MADE by somebody who wants one — MOSQUE tears his
own rather than lose.

**THE ORDERING PROBLEM IS THE ONLY HARD QUESTION HERE, and it is not a story
problem.** The rift is level 4 of 5. If the door is what the hero brings back OUT
of the rift, the hub does not exist for the first three missions — which is most
of the campaign, and precisely the stretch a new player and a new party spend the
most time in. Two answers:

1. **RECOMMENDED — the garage is the hub from the FIRST run, and what changes is
   the DOOR.** Early on the way out is the SHIP, which is already how he reaches
   SpaceZ, the moon and Mars and already has its own travel cutscenes (THE
   LAUNCH, THE VOYAGE). The rift door then REPLACES the ship after level 4 and
   opens everything at once. This fights none of the existing cutscene chain, and
   it gives the artefact a job the player will feel rather than a retcon they
   have to accept.
2. The hub unlocks after the rift. Cheaper, and it leaves multiplayer without a
   landing place for three fifths of the campaign — which is the problem this PR
   exists to fix.

**Either way, MULTIPLAYER MUST NOT REQUIRE CAMPAIGN PROGRESS TO HAVE A HUB.** A
session hosted by a brand-new character needs somewhere to put four joiners on
day one. Under (1) that falls out for free; under (2) it needs a second rule, and
a second rule is how a hub ends up with two behaviours nobody can explain.

### 6.3 What it actually costs in the engine — three findings

**"The fix is authored content, not engine work" was the original claim, and it
does not survive contact with the tree.** Checked against the current engine;
budget for all three rather than discovering them on day two.

- **`LevelDef.objective` IS REQUIRED, and a hub satisfies none of its kinds.**
  The union is `killBoss | clearAll | reachExit`, and a hub is never "cleared" —
  it is a place you return to. So it needs either a new objective kind or an
  abuse of `reachExit`, and the second drags the whole victory → outro → bank
  chain along behind it, which is exactly what must NOT fire when somebody walks
  past the workbench.
- **"LEVEL SELECT AS A SET OF PORTALS" DOES NOT EXIST.** The nearest mechanic is
  the elevator, and `src/game/elevator.ts` rules itself out in its own header:
  _"Nothing here is pathing, streaming or level-swapping — the destination is a
  real place in the same level."_ Every level transition today is APP-driven off
  a victory. A door that starts a DIFFERENT level from inside a run is new
  mechanism — and it is the same mechanism §6.4's party travel needs, so the two
  are one job rather than two.
- **THE MERCHANT WANDERS BY CONSTRUCTION.** `merchant.ts` strolls him along
  wander legs on his own seeded rng stream until he is met. "Parked at a counter"
  is a new authored mode on him rather than a placement — and it is worth doing
  properly, because it is also the answer PR 3's §3.1 table left open for him
  ("whom does he follow?" stops being a question when he stops following).

### 6.4 Party travel

Everyone must arrive on the same map with their own loadout. The host chooses at
the door; the session tears down its level and builds the next from a new seed,
with each player's `Loadout` re-applied. The existing per-level handoff
(`arrival.ts`, `applyLoadout`) is the mechanism; what is new is that there are
eight of them and **they must all be banked before the switch** — which is the
same banking PR 4's §4.5 owes, so whichever lands second inherits it rather than
writing it twice.

### 6.5 The story chain — and the confirmation it still needs

**The direction in §6.2 is RECORDED HERE AND NOWHERE ELSE.** `docs/story.md` and
`docs/manuscript.md` are deliberately untouched by it: this is an engineering
plan noting a decision, not a story tier, and the chain runs downward from
`story.md` or it does not run at all.

So the FIRST commit of this PR is the story one, in this order and no other:
`docs/story.md` (the gist — the garage as the place he comes back to, and what
the door is), then `docs/manuscript.md`, then the content. **The manuscript edit
needs the user's explicit confirmation before it is written** — the general rule
for any story change, and it has not been given for this one; confirming the
DIRECTION is not confirming the LINES. Use the `update-story` skill.

Everything the hub says is in scope: a sign, a greeting, whatever the merchant
says when he is standing at a counter instead of found in a field, and whatever
the hero thinks the first time the door opens on somewhere he has already been.

### 6.6 Done when

- A party of four can be hosted from a fresh character, land in the garage
  together, kit out, and leave through the door onto the same map.
- The hub raises no objective, no victory, no outro and no bank — a player can
  stand in it indefinitely and the run does not end.
- The merchant is at his counter, the quest givers are present, and the
  whole-floor safe zone holds: nothing hostile can be spawned or lured in.
- The `level-design` skill's checker battery passes on the hub level unchanged.
- `docs/game-content.md` covers the hub, and the story chain is intact —
  `story.md`, then the manuscript, then the content, with the manuscript's own
  confirmation on the record.

### 6.7 Risks

- **The level-swap mechanism is the real work and it is shared.** It is also
  §6.4's, so a mistake in it is a mistake in party travel. Build it once, behind
  one seam, and test it with one player before eight.
- **A hub is where a "harmless" objective bug becomes unbearable.** The failure
  mode is a victory or an outro firing in the one place the player is meant to
  idle. Prefer a new objective kind over an abuse of `reachExit`.
- **Scope creep toward a town.** The garage is one room. A hub with districts is
  a different game and a different PR.

---

## 7. Decisions register

Answers this plan recommends but does not have authority to make. Each should be
settled before the PR that needs it, not during.

| #   | Question                                                 | Recommendation                                                                                                                                                                                                                                                                                                                                                                                                     | Needed by |
| --- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 1   | Max party size                                           | 8, matching D2 and the `/players` scale                                                                                                                                                                                                                                                                                                                                                                            | PR 1      |
| 2   | Default direct port                                      | UDP 27015, walking to 27030, always revealing the bound one                                                                                                                                                                                                                                                                                                                                                        | PR 2      |
| 3   | Steam-only or dual transport                             | **Dual**, both offered by default                                                                                                                                                                                                                                                                                                                                                                                  | PR 2      |
| 3a  | Do the deferred cutover and screens land as one PR?      | **No — two.** See PR 1.5's §1.5.5: the cutover is the change most likely to regress single-player silently, it is provable on its own (an autopilot campaign against the same seeds), and the screens are verified by a different loop entirely. Combining them puts the same seam through one PR that PRs 1 and 2 both split along                                                                                | PR 1.5    |
| 3b  | Does the AUTOPLAY BOT run on the client or the server?   | **Client, for now** — its decisions already travel as input and commands, so only its five housekeeping mutators need converting, and four of them are plain verbs. The fifth (`stepBotWeaponSwap`) carries the bot's own swap memory and is the one that forces the question; moving that memory onto the run is the cheaper answer than moving the bot. Revisit at PR 4, which owns co-op autopilot rules anyway | PR 1.75   |
| 4   | Level-up: blocking chooser or banked points              | Banked + non-blocking chooser (changes single-player too)                                                                                                                                                                                                                                                                                                                                                          | PR 3      |
| 5   | Fog of war: shared or per-player                         | Shared                                                                                                                                                                                                                                                                                                                                                                                                             | PR 3      |
| 6   | Spare-or-kill: who decides                               | The killing blow's owner, shown to all                                                                                                                                                                                                                                                                                                                                                                             | PR 3      |
| 7   | Loot: FFA or allocated                                   | FFA default, host toggle for allocated                                                                                                                                                                                                                                                                                                                                                                             | PR 4      |
| 8   | XP: D2's proximity + level weighting                     | Yes, then measure across the level range                                                                                                                                                                                                                                                                                                                                                                           | PR 4      |
| 9   | Hardcore heroes in others' sessions                      | Only hardcore hosts, same difficulty, enforced at handshake                                                                                                                                                                                                                                                                                                                                                        | PR 4      |
| 10  | Host migration                                           | **No.** Host leaves, session ends, everyone banks                                                                                                                                                                                                                                                                                                                                                                  | PR 4      |
| 11  | Leaderboards from co-op runs                             | Excluded, marked with a `PartyStamp`                                                                                                                                                                                                                                                                                                                                                                               | PR 5      |
| 12  | Achievements from co-op runs                             | Count for everyone present                                                                                                                                                                                                                                                                                                                                                                                         | PR 5      |
| 13  | Browser PWA as a **joiner**                              | Out of scope. WebRTC + a signalling service is a separate project                                                                                                                                                                                                                                                                                                                                                  | —         |
| 14  | Mobile as a joiner                                       | Out of scope for the same reason                                                                                                                                                                                                                                                                                                                                                                                   | —         |
| 15  | Licence (`PolyForm-Noncommercial-1.0.0`) and hosted play | Confirm what it permits before a dedicated server ships                                                                                                                                                                                                                                                                                                                                                            | PR 5      |

---

## 8. What this plan deliberately does not build

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

## 9. Working notes for whoever picks this up

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
- **AMEND THIS DOCUMENT IN THE PR THAT FALSIFIES IT.** The lesson of PRs 1 and 2
  is not that they deferred work — sometimes that is right — but that their
  "Done when" lists were left standing as if met, so the plan quietly stopped
  describing the repo. If a PR ships something the plan did not ask for, or
  leaves something it did, say so **in the plan, in that PR**, with the reason.
  Both amendments above were written weeks late, from a `grep` rather than from
  memory, and the reconstruction cost more than the note would have.
- **A DEFERRED HALF IS A PR, NOT A FOOTNOTE.** The specific way this plan went
  wrong is worth naming so it is not repeated in PRs 3–5, which are each larger
  than either PR that has landed: a big change made of two different KINDS of
  work — a layer, and the cutover or UI that makes it reachable — will ship the
  layer and defer the other half. Either cut the PR along that seam up front, or
  expect to be back here.
