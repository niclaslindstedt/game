# Multiplayer — the phased build plan

> **Status: the plan has been executed; the mode ships.** What actually landed
> is [`multiplayer.md`](multiplayer.md) — read that first, and treat it as the
> authority whenever the two disagree. This file is kept for the phases that are
> still being closed out and for the reasoning behind decisions the shipped doc
> only states: the remaining gaps are tracked as issues
> ([#862](https://github.com/niclaslindstedt/game/issues/862),
> [#863](https://github.com/niclaslindstedt/game/issues/863),
> [#864](https://github.com/niclaslindstedt/game/issues/864)) and listed under
> `multiplayer.md` § What is NOT here yet.

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
with a verified result and a copyable manual fallback. §phase 2 is unsparing about
which half of that is genuinely automatic.

**This is a plan of eight pull requests.** Each is large and each is useful on
its own. At the end of phase 5 the desktop build has production multiplayer.

> **AMENDED AFTER phase 2.** This plan was written as five PRs, each promising to
> "end at a state the game can be played in". The first two falsified that
> promise in the same way, and the cause was structural rather than accidental:
> **its PR boundaries are drawn along ARCHITECTURAL LAYERS while that promise
> needs boundaries drawn along USER-VISIBLE SLICES.** Both PRs shipped their
> layer whole and deferred the cutover and the UI that would have made it
> reachable, because those are a different shape of work.
>
> Worse, the original cut contained a **circular dependency**: phase 1's remaining
> cutover needs the inventory / shop / level-up / talent verbs to travel as
> commands, and phase 3 was the phase that owned them. phase 1 therefore could not finish
> before phase 3 started, while phase 3's prediction work assumes the run already goes
> through the server. The cycle dissolves once you notice the plan had conflated
> two different jobs on the same verbs — **making them TRAVEL** (a prerequisite,
> with today's blocking semantics untouched) and **making them NON-BLOCKING
> per-player** (genuinely phase 3).
>
> So **phase 1.5 (THE CUTOVER)** and **phase 2.5 (THE SCREENS)** are inserted below,
> carrying exactly the work phases 1 and 2 deferred. (phase 1.5 has since split in
> turn, and the half that kept the number is now called THE VERBS — see the
> second amendment below.) They are numbered as halves
> rather than renumbered to 3 and 4, so that every reference to "phase 3" and
> "phase 5" in this document, in `docs/multiplayer.md`, in `AGENTS.md` and in the
> comments throughout `server/` still names what it always named.
>
> **AMENDED AGAIN AFTER phase 1.5's FIRST HALF (#790).** The verbs landed; the loop
> did not, and this time the split was made deliberately and in the open rather
> than discovered afterwards. The reason is a measurement §0 did not have when
> the cutover was planned: **a run is not `createGame(params)`** — the app
> performs six further mutations before the first tick that the `SessionParams`
> cannot express, and the parked run and the checkpoint restore do not call
> `createGame` at all. Moving the loop on top of that would have shipped a
> session holding a different world from the one the app built. So the remainder
> is **phase 1.75 (THE LOOP MOVES)**, below, numbered by the same rule and for the
> same reason: phase 1.5's name is already written into `src/game/commands.ts`,
> `server/wire/protocol.ts`, `docs/multiplayer.md` and `AGENTS.md`, where it
> means "the verbs travel", and it should keep meaning that.

---

## 0. Ground truth — what was measured, not assumed

Everything below was counted against the tree at the time of writing. The plan
leans on these numbers; re-measure before trusting a stale one.

Two of these were re-measured after phase 2 and are annotated with both readings.
Nothing has drifted enough to change a decision, which is itself worth knowing —
the engine's shape is stable on the axes this plan leans on.

| Fact                             | Measurement                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The simulation is deterministic  | `Math.random`, `Date.now`, `performance.now`: **zero** occurrences under `src/` (re-measured after phase 2: still zero). Every roll is seeded mulberry32 (`src/lib/rng.ts`) with `rngState` freeze/thaw                                                                                                                                                                                                                        |
| The loop is fixed-timestep       | `pwa/src/lib/game-loop.ts`, 1000/60; the fast-forward multiplier scales the step **count**, never the step **size**                                                                                                                                                                                                                                                                                                            |
| `GameState` is plain JSON        | apart from the `rng` closure, which `saved-run.ts` already snapshots beside it through a v12+ migration ladder                                                                                                                                                                                                                                                                                                                 |
| The engine already runs headless | `src/sim/simulate.ts` drives real `step()` calls from Node                                                                                                                                                                                                                                                                                                                                                                     |
| Cross-engine float safety        | **159** calls to `Math.sin/cos/atan2/hypot/pow/exp/log/tan` under `src/` — none IEEE-mandated. 17 `Math.sqrt` (which _is_ correctly rounded). Lockstep is out                                                                                                                                                                                                                                                                  |
| `state.player` in the engine     | **538** occurrences across **75** files — but **103** are `const player = state.player;` at a function head (re-measured after phase 2: **533** across the same **75**)                                                                                                                                                                                                                                                        |
| `state.player` in the app        | **220** occurrences across **49** files (re-measured after phase 2: **199**)                                                                                                                                                                                                                                                                                                                                                   |
| Engine mutators the APP calls    | **~50** distinct value imports from `@game/core` that mutate a `GameState` — `openInventory`, `equipFromInventory`, `buyStock`, `sellItem`, `allocateStat`, `spendTalentPoint`, `pickTalkChoice`, `openShop`, `openMap`… **This is phase 1.5's whole size**, and it is larger than the "~40" phase 1's own notes estimated. **Counted exactly when phase 1.5 did the conversion: 69 verbs over ~110 call sites in 22 modules** |
| What a run's creation does       | `createRunSession` performs **six** mutations AFTER `createGame` that the `SessionParams` cannot express — the campaign quest chain, the purse, the seen thoughts, a `?scenario=`, an opening already watched, and a bot run's dialogue mute. Measured while doing §1.5.1; it is what §1.5.2 turns out to rest on                                                                                                              |
| What those reads actually want   | `pos` **186**, `equipment` 50, `level` 53, `inventory` 33, `coins` 20 — i.e. one third geometry, the rest private bag                                                                                                                                                                                                                                                                                                          |
| `GamePhase` members              | **19**. `step()` early-returns on `phase !== "playing"` after the `cutscene` and `dying` passes                                                                                                                                                                                                                                                                                                                                |
| Process-global engine state      | **36** module-level mutable bindings: 19 `activeXDefs` catalogs, 6 flags (`src/game/flags.ts`), the `BALANCE` tuning object, plus memo/grid caches                                                                                                                                                                                                                                                                             |
| `Item` ownership                 | The `Item` union has **no owner field** — free-for-all loot is the free default                                                                                                                                                                                                                                                                                                                                                |
| Levels shipped                   | **6** (`content/levels/`), **no hub/town**                                                                                                                                                                                                                                                                                                                                                                                     |
| Desktop packaging target         | **`dir`**, not an installer — Steam uploads a directory to a depot and its client installs it. **There is no elevated install step**                                                                                                                                                                                                                                                                                           |
| Electron / Node                  | Electron ^43 (so `utilityProcess` is available); root `engines.node >= 24`; imports carry `.ts` extensions; `scripts/game-alias-loader.mjs` already maps the aliases for plain `node`                                                                                                                                                                                                                                          |
| Critical-path budget             | **200 KB gzipped**, enforced by `pwa/scripts/check-seo.mjs`                                                                                                                                                                                                                                                                                                                                                                    |

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
   a Rust toolchain. **Spike this in the first week of phase 2, before the UI is
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

## 1. The eleven phases

**THEY ARE PHASES, NOT PULL REQUESTS, AND THE WORD MATTERS.** This plan called
them "PRs" until one of them took four merged pull requests to land, and by then
the label was actively lying: a reader asking "is PR 5.5 done?" was asking about
a GitHub pull request that had been merged while most of the work it named was
still owed. A PHASE is a body of work with a done-when; a PULL REQUEST is one
delivery of part of it, and a phase may take as many as it takes. "PR" in this
document now always means the second thing.

| Phase                   | Ships                                                                                                                                    | Playable at the end                                          | Estimate | State                                             |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | -------: | ------------------------------------------------- |
| **1 — THE SERVER**      | The simulation moves into a `utilityProcess`, the engine gains a Node ship target, replication + the wire codec                          | Nothing changes — the machinery is not yet reachable         |  4–6 wks | **Landed** (#783), see §1.6                       |
| **2 — THE WIRE**        | Both transports (Steam P2P + direct UDP), the lobby, port binding/reveal, UPnP + firewall, admission, chat, **spectators**               | Nothing changes — no screen reaches it                       |  5–7 wks | **Landed** (#788), see §2.7                       |
| **1.5 — THE VERBS**     | The app's ~50 direct engine mutations become commands — one closed list, scalar arguments, one dispatch shared by the app and the server | Nothing changes — the loop still runs in the renderer        |    2 wks | **Landed** (#790), see §1.5.4                     |
| **1.75 — THE LOOP**     | `SessionParams` can describe a real run; a session can ADOPT one; `GameScreen` drives the net client instead of owning the loop          | Identical single-player, over loopback. Zero networking      |  2–4 wks | **Landed**, bar §1.75.4                           |
| **2.5 — THE SCREENS**   | HOST / JOIN / the server browser / JOIN BY ADDRESS, the chat overlay, the port setting, the invite launch arguments                      | Eight people in one session; one plays, seven watch and chat |  2–4 wks | **Landed**, see §2.5.4                            |
| **3 — THE PARTY**       | `state.player` → `state.players[]`, per-player phases, per-player input, client prediction + reconciliation                              | Eight heroes actually playing one map together               | 8–11 wks | **Landed** (§3.3 closed the phase — see §5.5.3)   |
| **4 — THE CO-OP GAME**  | Per-player death/corpse/respawn, XP share, loot rules, `/players N` balance, party HUD, banking, mod + version reconciliation            | The whole campaign, co-op, start to finish                   |  5–7 wks | **Landed** (§4.4/§4.5 via R1 — see §5.5.3)        |
| **5 — PRODUCTION**      | Trade, hardening/anti-cheat, reconnect, dedicated server binary, platform rules, soak tests, docs, store surfaces                        | Shippable                                                    |  5–7 wks | **Landed** (#813), see §5.8                       |
| **5.5 — THE REMAINDER** | Every debt the earlier PRs deferred, in the order they unblock each other — plus the three phase 7 halves that were always owed early    | Nothing new — the mode stops owing anything                  |  6–9 wks | **R1/R2 landed; R3's code landed** (see §5.5.3)   |
| **6 — THE GARAGE**      | The hub the game has never had: the hero's garage, the rift door as level select, party travel, the merchant parked, the story chain     | Somewhere to stand, and somewhere to land a joiner           |  3–5 wks | **Landed** (§6.4 via R1) — givers await the story |
| **7 — THE PARTY BOT**   | BOTS IN A LOCAL GAME, and a bot that plays like somebody in a party rather than a soloist standing near you                              | A party without four friends online                          |  2–3 wks | **Landed** (§7.3–§7.5 via R3 — see §5.5.3)        |

**≈ 44–65 weeks.** The band is wide because phase 3 is a design exercise wearing a
refactor's clothes (see §phase 3), and its uncertainty dominates everything. It
grew when phase 5.5 was written down: the work was always owed, and a total that
did not count it was a total that quietly assumed somebody else would.

**phase 6 SORTS LAST AND THAT IS A DECISION, not a leftover.** The garage was phase 4's
§4.1 and has been lifted out whole, for two reasons. It is not co-op arithmetic —
it is a level, a new level-swap mechanism, a parked merchant and a story-chain
change, which is a different kind of work from "whose is this kill's XP". And it
is the one piece here that is worth shipping AFTER the mode is stable rather than
before: a hub is what makes co-op pleasant, and phase 5 is what makes it work at
all. The cost of that order is stated in phase 6's own goal and must not be
discovered later — until it lands, a joiner arrives in the middle of somebody
else's boss fight.

**phase 7's INSTRUMENT HALVES HAVE MOVED TO phase 5.5, AND THAT REPLACES A NOTE THAT
LIED ABOUT THE ORDER.** §7.1 (the bot takes the hero it steers), §7.2 (the
simulator flies a party) and §7.2.5 (the bot as a client) are the instruments PR
4's §4.3 tuning and phase 5's §5.6 soak are blocked on — the co-op rules shipped as
STRUCTURE precisely because they could not be measured. This plan said three
separate times that they were "owed earlier than their number", which is a label
contradicting its own position; they are now written where they happen. phase 7
keeps what is genuinely about how a bot PLAYS.

**The four inserted PRs are not new work, they are work the earlier ones
deferred**, so the total grew by their estimates rather than by a re-plan. PR
5.5 is the largest of them and the most honest: it exists because a dozen
"NOT LANDED" boxes with no single index is how a debt stops being anybody's. Note also what the
"playable at the end" column now says for phases 1 and 2: **nothing changes.** That
is the honest reading of what shipped, and leaving the old claim in place is what
would have let the next PR inherit the same mistake.

Each PR carries its own `.changes/unreleased/` fragment, keeps every new source
file under the 1000-line cap, and must leave `make lint` and `make test` at zero
warnings.

---

## PHASE 1 — THE SERVER

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
  runtime-flag risk, and it makes the standalone dedicated server (phase 5)
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

One utility process per **session**, not per app: phase 5's dedicated server runs
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
difficulty, mapSize)`, so the client calls `createGame` with the
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
  makes phase 5's trade window honest.

The codec lives in `server/wire/` as pure functions over plain objects, with a
round-trip property test per message type. It is the one place in this plan
where hand-rolled binary packing is the right call: the shapes are known at
compile time, the vocabulary is small, and a schema library would cost bytes on
the client for nothing.

**AS BUILT, that last paragraph was overruled, and the reasoning is worth
keeping.** phase 1 shipped a binary ENVELOPE — a fixed 16-byte header, validated
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

**The 200 KB critical-path budget is a live hazard here.** The title menu's
future HOST / JOIN screens are on the app's **startup** path, so they may import
`@game/menu` and nothing else. The net client, the codec and anything that
reaches `@game/core` must be lazy — the same rule that keeps the level catalog
off the startup path. Expect `pwa/scripts/check-seo.mjs` to be the thing that
catches the mistake, and do not raise the number.

### 1.6 Done when — and what phase 1 actually met

Recorded honestly, because an unamended "done when" is how a plan starts lying
about its own state. **Two of the five were not met, and they are the two that
made the feature reachable**; they are now phase 1.5.

| Criterion                                                                                                                                                     | phase 1 (#783)                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A run started from the title menu plays identically to today, with the simulation in a utility process                                                        | ❌ **Not met.** `GameScreen` still owns the loop; `pwa/src/game/net/` is unreachable from any shipped code                                                                         |
| `tests/engine/` gains wire codec round-trips, snapshot/delta correctness, and the same-seed determinism test                                                  | ✅ Met — and the determinism test runs in a real second `node` process                                                                                                             |
| `npm run electron:test` gains the session lifecycle: spawn, tick, orderly shutdown, crash-and-report, **and the utility process outliving a renderer reload** | ⚠️ **Four of five.** Spawn, port handover, orderly stop, forced kill, crash-vs-stop and restart are covered; the renderer-reload case is not, because the test rig has no renderer |
| A parked run still resumes, a checkpoint still restores, and the autopilot still flies — all three **through the server**                                     | ❌ **Not met**, and it follows from the first row rather than being a second omission                                                                                              |
| `make test`, `make lint`, `npm run electron:test` green; budget check passes                                                                                  | ✅ Met — critical path 163.7 KB gzipped against the 170 KB budget (the budget of the day)                                                                                          |

One more thing phase 1 flagged rather than claimed, and it is still outstanding:
**the packaged desktop path was never launched.** The `extraResources` entry, the
`MessagePortMain` handover and a real `utilityProcess.fork` are covered by stubs
and reasoning, not by a running app. phase 1.5 is the natural place to pay that off,
because it is the first PR whose work cannot be believed without launching one.

### 1.7 Risks

| Risk                                                             | Mitigation                                                                                                                                                                      |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Type stripping unavailable in Electron's bundled Node            | Half-day spike in week one; precompile fallback is already scoped                                                                                                               |
| Snapshot rate can't keep up with 146 mobs on a mid-range machine | Measure with `scripts/simulate-run.mjs`-scale fields before the codec is finished; the fallback is interest-managed replication (cull by view rect), which phase 2 wants anyway |
| The engine turns out not to be bit-identical across processes    | The determinism test finds it in phase 1 rather than as a desync in phase 3. If it fails, static state joins the wire and costs ~100 KB once per level — annoying, not fatal    |

---

## PHASE 2 — THE WIRE

**Goal: eight machines connect to one session, over Steam or over a raw
address, and can see and talk to each other.** The session still simulates one
hero — joiners are **spectators**. That is a deliberately chosen milestone, not
a compromise: it puts real latency, real packet loss, real NAT, real firewalls
and eight real sockets under the replication layer built in phase 1, while the
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
| `electron/src/net-transport.ts`       | `server/net/transport.ts`                               | The seam ships with the session, so phase 5 inherits it                                                                                           |
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
   different catalogs and immediate divergence. phase 2 refuses a mismatch outright
   and names the missing mods; phase 4 makes it reconcile.
4. **Password**, if set, and only then does the connection reach the server.
5. ~~**Character** — the joiner's `Loadout`, validated (see phase 5's trust rules).~~
   **Moved to phase 3.** It is unbuildable here and was mis-scheduled rather than
   skipped: a phase 2 joiner is a SPECTATOR and carries no loadout, because there is
   no second hero for one to belong to. It becomes a real step the moment phase 3
   seats one, which is also the first moment phase 5's trust rules have anything to
   check.

**AS BUILT, the order above is implemented literally, plus one step in front of
it that the plan did not have.** Before any of the five, a peer must echo a
CHALLENGE COOKIE derived from the session secret, its own address and the current
epoch. §5.2 asked for this and filed it under phase 5 hardening; it turned out to be
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
is phase 4's; phase 2 ships the command and the honest pairing.

### 2.7 Done when — and what phase 2 actually met

**None of the six was fully met**, and the pattern is the same as phase 1's: the
machinery is there and nothing can reach it. Three need the screens, two need
hardware, and one was met somewhere the plan did not expect.

| Criterion                                                                                                                                             | phase 2 (#788)                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Eight machines over Steam, eight over a typed address, both through a NAT                                                                             | ❌ **Unverifiable as shipped** — there is no screen to host or join from, and no second machine in CI. Moves to phase 2.5                                                             |
| The HOST screen's three status rows each report true, each remedy button leaves a verified result                                                     | ❌ **No HOST screen.** Every value it needs — the bound address, the router row, the firewall row, the roster — is on the bridge already                                              |
| A UPnP mapping created on host and released on quit, checked on a real router                                                                         | ⚠️ **Built, unverified.** Needs a router; CI has none. The lease (renewed at a third of it) is what makes a leak self-heal meanwhile                                                  |
| Killing the host closes every client with a stated reason; killing a client leaves the session running                                                | ⚠️ **Implemented, not proven over a wire** — `close()` sends a `bye`, `removeClient` frees the seat, but no test drives two processes                                                 |
| Chat and `/players N` work; spectators see the run in sync                                                                                            | ⚠️ **Half.** Chat and the scaling are tested at the session; "in sync" cannot be shown until phase 1.5 makes a run go through the server                                              |
| `npm run electron:test` covers the handshake refusals, the reliability layer's ack/retransmit under simulated loss, and the port-walk on `EADDRINUSE` | ✅ **All three covered — in `tests/engine/`**, not the shell suite, because the transport moved to `server/net/` (see §2.1). The criterion named the wrong runner, not the wrong test |

Also specified in §2 above and **not built**, all of it moving to phase 2.5: the
three menu screens (§2.4), the chat UI (§2.6), the port setting (§2.2's
"configurable in SETTINGS"), and the invite launch arguments — `+connect_lobby
<id>` and `--connect <addr>` (§2.4). Nothing under `electron/src/` reads
`process.argv` today, so **a friend accepting a Steam invite while the game is
closed currently lands nowhere.**

---

## PHASE 1.5 — THE VERBS

**Goal: every act the app performs on a run becomes something that can travel.**
Nothing a player can see changes; the loop still runs in the renderer. This is
the prerequisite the cutover was blocked on, and it is the half of phase 1.5 that
**landed** (#790).

It was written as one PR with §1.5.2 below, and it is worth being plain about
why it is not: **~50 distinct engine mutators** (69 verbs, as counted) is a PR on
its own, and the loop move turned out to rest on a fact nobody had measured. The
two are separated at the seam the plan itself keeps rediscovering — a layer that
is provable in isolation, and a cutover that is not. §1.5.4 records what this
half met; **the loop move is phase 1.75.**

### 1.5.1 The verbs have to travel before the loop can move

This is the dependency that made the original plan circular. The app does not
merely READ the state; it acts on it — `openInventory`, `equipFromInventory`,
`buyStock`, `sellItem`, `allocateStat`, `spendTalentPoint`, `pickTalkChoice`,
`openShop`, `openMap`, `openQuestLog`, and forty-odd more. Every one of them is a
direct call on a local `GameState`, and once the state lives in another process
every one of them has to become a `COMMANDS` entry, a `switch` case, and a
`sendCommand` at the call site.

**phase 3 was originally given this work, and that was the mistake.** The plan
conflated two different jobs on the same verbs:

- **Making them TRAVEL** — mechanical, semantics untouched, and a hard
  prerequisite for moving the loop. **That is this PR.**
- **Making them NON-BLOCKING per-player** — `state.phase` splits from
  `Player.screen`, the level-up chooser stops freezing the world, a player in
  their bag can still be killed. **That stays phase 3** (§3.2), and it is a design
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

phase 1 flagged this rather than claiming it, and it is still outstanding: the
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
- `make test`, `make lint`, `npm run electron:test` green; the 200 KB budget
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

**All of that is now phase 1.75 (THE LOOP MOVES)**, above: the five `SessionParams`
fields, the adopt-a-state start, the run-driver seam in `GameScreen`, the
autopilot's five remaining direct mutators, and a real `npm run electron`.

### 1.5.5 Risks

**This is the change most likely to cause a silent single-player regression**,
and the mitigation is the one §3.5 already prescribes for phase 3: **land it as a
commit series, not one commit.** The mutator conversions in reviewable batches,
each leaving the game playable, and the loop move last. A regression found at the
end of an unbisectable branch costs more than the whole PR.

What that risk actually looked like in practice is worth recording, because it
was cheaper to answer than to argue about: the conversion is mechanical enough
that it can be proved rather than reviewed. The same seeded run through
`pwa/scripts/playtest.mjs` and `scripts/simulate-run.mjs` either side of the
change produced identical reports — kills, damage dealt and taken, XP, drops,
deaths, simulated minutes — which is a stronger statement than any reading of a
110-site diff. **Do the same for phase 1.75**, where the risk is far higher.

---

## PHASE 1.75 — THE LOOP MOVES

Tracked as [#793](https://github.com/niclaslindstedt/game/issues/793).

**Goal: `GameScreen` stops owning the loop.** A run started from the title menu
plays identically to today, with the simulation in the utility process and the
renderer applying snapshots. Nobody notices anything.

That is phase 1's own §1.6 headline, still unmet, and it is what phase 1.5 was
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
**Answer it deliberately; it is the last thing in this phase that is a design
question rather than a rename.**

### 1.75.4 And the packaged app gets launched, for the first time — **STILL OWED** (phase 5.5's §5.5.1)

phase 1 flagged this, phase 1.5 did not reach it, and it is still outstanding: the
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
- `make test`, `make lint`, `npm run electron:test` green; the 200 KB budget
  still passes (the net client must stay lazy).

### 1.75.6 Risks

**This is now the change most likely to cause a silent single-player
regression** — phase 1.5 inherited that title and handed it on, having proved its
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
   `@game/core`, which is the 200 KB budget stated as the import that would
   break it rather than as the number that would report it.
3. **The first-delta size assertion** of §1.75.6, which has no home yet and
   should get one with the driver seam.

---

## PHASE 2.5 — THE SCREENS

**Goal: a player can open a door to the session phase 2 built.** Everything here was
specified in §2 and deferred, and none of it was deferred for lack of a
foundation — the bound address, the router and firewall rows, the roster and the
browser rows are all on the `__gisNet` bridge already.

**It depends on phase 1.75 and cannot go first.** A JOIN screen in front of a run
that still simulates in the renderer is a door into a session nothing plays
through — which is precisely why phase 2 held it.

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

**THE 200 KB CRITICAL-PATH BUDGET IS THE LIVE HAZARD OF THIS PR**, more than of
any other. These are TITLE MENU screens, i.e. the app's startup path. They may
import `@game/menu` and the import-free `@game/wire/*` leaves — never
`pwa/src/game/net/`, which reaches `@game/core` and would drag the whole
simulation into every player's first download. `pwa/scripts/check-seo.mjs` is
what catches it; do not raise the number.

**A browser row this build cannot join is shown, not hidden.** A player whose
friend is on a newer build and whose list is simply empty concludes the feature
is broken; one who sees the session greyed with "BUILD 1.4.2" goes and updates.

### 2.5.3 Done when

This is where phase 2's own §2.7 finally gets answered, so its six criteria are
inherited verbatim — eight machines over each transport through a NAT, the three
status rows each independently true with verified remedies, a UPnP mapping
created and released **on a real router**, a killed host closing every client
with a stated reason, and spectators seeing the run in sync.

Plus, of this phase's own:

- A `+connect_lobby` launch from a cold start reaches the right session.
- The `ui-review` skill's screenshot audit passes at all nine reference
  viewports, chat overlay included.
- The budget check still passes.

### 2.5.4 What phase 2.5 actually shipped — and the finding it ran into

**THE JOINER'S HALF OF THE WIRE DID NOT EXIST.** §2.5's own preamble says
nothing here "was deferred for lack of a foundation", and that was true of every
row it listed and false of the thing they all lead to: `hub.ts` is the host's
admission desk, and NOTHING anywhere spoke the other side of that conversation.
The page's `NetClient` waits for a welcome; it never probes, never echoes a
challenge and never sends a join, because until this PR the only client was the
host's own renderer at the end of a `MessagePort`. So a JOIN screen built to the
letter of §2.5.1 would have been the third repetition of this plan's own
recorded failure — a layer that ships with nothing able to reach it.

So phase 2.5 also built `server/net/connect.ts` (the probe → challenge → join
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
   not build — which is phase 3's cutover, not this one's.
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

**What could not be verified here, and is still owed** — all of it now listed in
phase 5.5's §5.5.1, which is the one place that says these need HARDWARE rather
than a diff: the eight-machine runs
over each transport through a NAT, the UPnP mapping against a real router, the
firewall remedies on each OS, and the packaged `npm run electron` launch (still
§1.75.4's debt). None of them can be met in CI, and none of them are met by
reading the diff. The `ui-review` screenshot audit is likewise owed: the harness
drives a browser, where every one of these screens is deliberately absent.

---

## PHASE 3 — THE PARTY

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
| `menace.ts`                   | Whose DPS heats the meter?      | Party-summed output over a party-scaled sensitivity — see phase 4; **this needs a measured tuning pass**                                                                           |
| `merchant.ts` (25 refs)       | Whom does he follow?            | He stops wandering in co-op and stands in the town hub (phase 4). Fixes the question by deleting it                                                                                |
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
good one — phase 3's rendering work is genuinely small because of it.

`saved-run.ts` takes a migration bump: a v-N snapshot with one `player` thaws
into a one-element `players` array.

### 3.2 Per-player phases — **LANDED** (see the amendment at the end of this section)

`GamePhase` has 19 members. `playing` is live, `cutscene` and `dying` run
reduced passes, and **the other 16 halt the simulation outright**.

Eleven of them are per-player UI that must stop freezing the world: `paused`,
`levelup`, `respec`, `inventory`, `map`, `questLog`, `shop`, `quest`, `talk`,
`choice`, `companion`. D2 explicitly wants one player shopping while another
fights.

**The verbs that raise those phases already TRAVEL by the time this PR starts —
phase 1.5 made them commands.** What is left here is the half that was always the
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

> **AS BUILT.** `state.phase` kept eleven globals (`cutscene`, `intro`,
> `title`, `playing`, `dialogue`, `choice`, `outro`, `dying`, `bossDeath`,
> `victory`, `defeat`) and TEN members moved to `Player.screen` (`paused`,
> `levelup`, `respec`, `inventory`, `map`, `questLog`, `shop`, `quest`,
> `talk`, `companion`). The halting rule is `partyBlocked`: the world stops
> only when every hero in play has a screen up — which with one hero is
> exactly the freeze every screen always was, so single player's FEEL survives
> except where this section deliberately changes it. The level-up landed as
> recommended: points bank (`pendingStatPoints`, and `pendingTalentPoints`
> moved from the run onto the hero), the ding celebrates on the field, the
> chooser opens on demand (`promptPendingPoints`, a HUD pip) and closes with
> points still banked (a new `closeLevelup` verb, `PROTOCOL_VERSION` 14 → 15);
> the respec stays modal for its owner. A hero with a screen up contributes
> IDLE input, stands on the field, and can be killed. `releaseStuckLevelup`
> was RETIRED — a quitter's or a downed hero's abandoned screen holds nothing
> shut, structurally. Four narrowings against the sketch above, each
> deliberate:
>
> 1. **`choice` stayed GLOBAL and anyone may resolve it.** The
>    killing-blow-owner gate needs the kill chain to know who landed the blow,
>    and nothing threads the attacker through `hitEnemy` (the same un-threaded
>    attacker behind the seat-0 combat reads in `loot.ts` — see §5.5.3). One
>    job, do it once.
> 2. **`dialogue`/`cutscene` were already group beats** advanced by anyone;
>    they simply stayed so.
> 3. **A conversation is ONE AT A TIME, held by its opener.** `questOffer` and
>    `talk` stay single records on the run; every conversation verb is gated
>    on the acting hero holding the screen, and a second hero walking up is
>    politely refused. Per-hero conversation records can come later without
>    touching the verbs.
> 4. **`paused` is per-player like the rest** — solo it freezes the world via
>    `partyBlocked`; in a party it parks one hero.
>
> The save format bumped to v26 (a v25 park carries `phase: "paused"`, a value
> the union no longer holds; the version gate bins it, which costs one parked
> run and is called out in the changelog).

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
  what makes phase 4's tuning measurable instead of guessed.

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

- ~~**§3.2, the per-player screens.**~~ **LANDED** — see §3.2's own as-built
  amendment: ten members moved to `Player.screen`, the world halts on
  `partyBlocked`, the level-up banks, and `releaseStuckLevelup` is retired.
- **§3.3, prediction and reconciliation.** Untouched. A client still shows its
  hero where the last snapshot put him.
- **The command channel carries no SEAT.** A shop, an equip or a stat spend
  arriving from a joiner is dispatched against seat 0. See §3.7 — it is the next
  thing to do, and it comes BEFORE §3.2 rather than after it.
- **A joiner's run is still not banked** to their roster (phase 4's §4.5), and the
  autopilot, the headless simulator and the analytic readouts still fly seat 0 —
  which is correct for what they measure and is what §3.4's "multi-player
  campaign headlessly" line will change.

**§3.2, §3.3 AND THE BANKING ARE NOW phase 5.5's**, inventoried and sequenced in
§5.5.2 and §5.5.3. The third item above — the command channel's missing SEAT —
was PAID by phase 5, which needed it before trade could be correct.

### 3.7 The order the remainder has to be done in — and why there is no phase 3.5

Two things were found while §3.1 was being built that this plan did not have a
place for. Neither should become a numbered half, and the reasons are different
in each case; both are written down here so the next session inherits them
instead of rediscovering them.

**THE SEAT ON THE COMMAND CHANNEL IS A PREREQUISITE OF §3.2, NOT A SUCCESSOR OF
phase 3.** Measured against the tree §3.1 left: **20 of the 72 verbs in
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

It has the exact shape the plan's halves exist for: phase 1.5 made the verbs
TRAVEL, and nothing made them travel to the right HERO. That is the same
layer-without-its-cutover failure the amendments were written for, and it is its
fourth instance.

**But it cannot be numbered 3.5, because a 3.5 sorts after 3 and this has to
happen before §3.2.** `openInventory` cannot be made non-blocking per player
until it knows WHICH player; the screen and the verb are the same decision seen
from two ends. So it is the OPENING commit series of phase 3's remainder — one
field on the command frame, the seat the session already knows, and a `Player`
argument through `applyRunCommand`'s dispatch — and §3.2 follows it. A number
that implied otherwise would be a label that lies about the order, which is worse
than no number at all.

**WHAT AN ABANDONED HERO MEANS IS NOBODY'S — AND IT SHOULD BE phase 4'S.** §3.1's
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
defeated. It belongs in **phase 4** rather than in a half of its own, because it is
a question about what a body on the field MEANS — the same question §4.2 answers
for a corpse and a respawn — and answering it beside them is how the two stay
consistent. phase 5's §5.4 (reconnect) is the adjacent case and not the same one:
reconnect is about somebody who IS coming back.

**AND THE MEASURING INSTRUMENT SHOULD NOT GO LAST.** §3.4's done-when includes
`scripts/simulate-run.mjs` running a multi-player campaign headlessly, on the
stated grounds that it is "what makes phase 4's tuning measurable instead of
guessed". It is independent of §3.2 and §3.3 — it needs a party, which now
exists — so it can be built in parallel with them rather than after. Every
instrument this repo has was built before the thing it measures; leaving this one
until last is how phase 4's `/players N` pass ends up guessed anyway.

---

## PHASE 4 — THE CO-OP GAME

**Goal: the campaign, played co-op, start to finish.** phase 3 makes eight heroes
possible; phase 4 makes eight heroes a game.

> **§4.2's ABANDONED HERO AND §4.3's RULES HAVE LANDED; §4.4, §4.5 AND §4.2's
> CORPSE HAVE NOT — AND §4.1's HUB IS NOW ITS OWN PR (phase 6).** The split is along the same seam every earlier one
> was: making the run's ARITHMETIC party-aware — whose the XP is, whose the loot
> is, what heats the meter, what a body nobody is steering means — is one job,
> and it is a prerequisite of the fixtures (a hub, a party HUD, banking) that
> sit on top of it. See **§4.7** for exactly what that means, what it
> deliberately did not do, and the one thing that turned out to be a
> prerequisite nobody had scheduled.

### 4.1 The town — MOVED TO phase 6

**The hub is no longer phase 4's**, and the section that was here has been lifted
whole into **phase 6 — THE GARAGE**. Two reasons, and neither is that it stopped
mattering:

- **It is not co-op arithmetic.** Everything else in phase 4 answers a question of
  the form "with eight heroes, whose is this / what does this mean" — the XP,
  the loot, the meter, a body nobody is steering. The hub is a level, a new
  level-swap mechanism, a parked merchant and a change to the story chain. Those
  share nothing but a PR number.
- **It turned out not to be authored content.** The claim that it was is what
  made it look small enough to sit inside phase 4; three findings against the real
  tree say otherwise (they travel with it — see phase 6's §6.3).

What phase 4 keeps is the consequence: **until phase 6 lands there is nowhere to put a
joiner**, so a session hosted mid-campaign drops them into somebody else's boss
fight. That is a stated cost of the ordering rather than an oversight, and phase 6's
goal says so in its own words.

### 4.2 Death, the corpse, and the respawn

Today: `enterDeathScene` → `phase = "dying"` → `defeat`. Softcore takes the 10%
XP toll (`BALANCE.deathXpLoss`); hardcore latches `Character.dead`. **And
critically, `dying` and `defeat` are global phases — so one death would end the
game for all eight.**

What ships:

- **Death is per-player.** phase 3's phase split already makes `dying` a
  `Player.screen`; phase 4 makes the consequences per-player too.
- **A body where you fell**, holding what you were carrying — D2's rule. It is
  drawn with the loot-aura machinery, it is only recoverable by its owner (the
  private/public replication split from phase 1 is what makes that enforceable),
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

> **AS BUILT (the corpse, the respawn and the hardcore gate — the abandoned
> hero landed earlier, see §4.7).** `src/game/downed.ts` owns all three
> moments, and every rule is an exact no-op at one hero (solo, one hero at 0 hp
> IS `partyWiped`, so the wipe path fires on the same tick it always did and
> none of this runs). The FALL is the step pipeline's own sweep — after every
> damage pass, only while the party still stands — and books the hero's OWN
> toll (`applyHeroDeathToll`; the wipe toll skips a hero already `downed`, so
> no fall is priced twice), strips the worn kit onto `state.corpses` (public in
> the split: worn gear was always visible) and leaves the sidearm in the
> never-empty hand. The RESPAWN is a run COMMAND (`respawn`, PROTOCOL 16 → 17)
> rather than a timer — when to take the walk back is the player's call — and
> it deliberately emits NO event, because a verb runs between ticks and the
> session only collects events pushed inside `step()`; the state change is the
> cue. RECOVERY is owner-only proximity (`CORPSE.recoverRadius`), piece by
> piece — slot if free (the minted sidearm is discarded for the real weapon,
> never banked), bag if not, and a piece with nowhere to go STAYS on the body,
> which leaves the field only when emptied. Four deviations from the sketch
> above, each deliberate:
>
> 1. **Respawn is at the LEVEL'S START, not "in town"** — there is no town in
>    the session (§6.4's in-session travel has not landed), and the level
>    start preserves what the sentence was actually for: full health, and the
>    walk back as the price.
> 2. **The corpse holds the WORN kit only** — D2's own rule. The bag, the
>    pouch, the purse and the consumables stay with the hero.
> 3. **An unrecovered corpse can never cost the kit**: `extractLoadout` folds
>    whatever a hero's corpses still hold into the banked loadout's VAULT (the
>    LOST & FOUND — gear the player did not choose to lose is its whole
>    charter), which covers every banking path (victory, travel, defeat) at
>    one funnel, deliberately past the vault's cap if it must be.
> 4. **The hardcore rule shipped as a MODE gate, not a difficulty gate.**
>    `SessionParams.hardcore` (a session parameter the engine never reads —
>    hardcore stays app-side), the joiner's flag on the `join` frame, and a
>    symmetric `hardcore-mismatch` refusal in `admit` — checked after the
>    challenge, so a spoofed address learns nothing, and pre-empted off the
>    probe reply (`ChallengePayload.hardcore`) so the JOIN screen refuses
>    without a round trip. The "same difficulty" half is the joiner's app's to
>    enforce (only it knows the character's unlocks); the wire carries the
>    session's difficulty in the lobby metadata already.
>
> The simulator's party (§7.2) respawns a downed bot immediately through the
> same `applyRunCommand` dispatch — what a human does, and what keeps the
> instrument measuring a party rather than a shrinking one.
> `tests/engine/party_death_test.ts` pins the rules, the solo no-op included;
> the session ending when the host leaves was already true (no host
> migration, `DepartOptions.seatZero`).

### 4.3 XP, loot and the meter

**XP sharing.** `grantXp` pays one hero today. D2 splits XP among nearby party
members weighted by level, and **that rule is what decides whether a level 12
friend can meaningfully play with a level 60 character** — which is most of
whether the mode is fun. This is new engine code, not a refactor. Ship D2's
shape (proximity-gated, level-weighted), then measure it with the multi-player
simulator from phase 3.5 across the whole level range.

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

phase 2 refused a mismatch. phase 4 makes it work, because "my friend has a mod" is
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
  else with an obvious owner — an errand, a scripted grant — stays a
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

- ~~**§4.2's corpse and respawn are BLOCKED**~~ — **now LANDED**, unblocked by
  §3.2 exactly as predicted: the down, the corpse, the respawn verb and the
  hardcore admission gate, with the as-built record in §4.2's own box above.
  `applyDeathXpPenalty` still bills the wipe; what changed is that a hero who
  fell EARLIER already paid at the fall and is skipped.
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
"leaving this one until last is how phase 4's `/players N` pass ends up guessed
anyway" — and it was right.

What shipped instead is the STRUCTURE with its reasoning stated, plus unit-level
proof of each claim (`tests/engine/coop_rules_test.ts`): the meter reads a party
of eight's summed output as identical to one hero's, the XP splits 20:60 the way
it says it does. That is not the same as a campaign measured at four players, and
it must not be recorded as if it were. So the next thing phase 4 owes, BEFORE the
party HUD, is **phase 7's §7.1–§7.2** — the bot parameterized on a `Player`, the
same mechanical refactor §3.1 did to the engine, one file at a time — and then
the numbers.

Two knobs are the levers when that happens, and both are deliberately shipped at
a stated default rather than a tuned one: `XP_SHARE.partyBonusPerHero` (how much
bigger a shared pot is than a solo one — read the per-CAPITA XP rate off a
multi-player run, never the per-kill share, because a party also clears faster
and the two effects only show up together) and the `/players N` pairing itself.

> **THE PASS HAS NOW BEEN RUN, AND THE ANSWER IS THAT NEITHER LEVER MOVES.**
> §7.2 built the party; `scripts/coop-tuning.mjs` is the harness, and it reads
> exactly what this paragraph asked for — per-capita XP per minute at 1/2/4/8,
> medianed over seeds with the spread printed beside it, and `--start-level` to
> mint the hero the campaign implies rather than measuring a deep rung with a
> naked rookie (the first read had EVERY party and the soloist finish nightmare
> with zero kills, which is a rookie result rather than a co-op one).
>
> On the moon at NIGHTMARE, from a level-50 rare-geared arrival, 2 seeds × 4 min:
>
> | party | per-capita xp/min | vs solo  | per-capita kills/min |
> | ----- | ----------------- | -------- | -------------------- |
> | 1     | 11702             | 1×       | 69.3                 |
> | 2     | 12913             | **1.1×** | 66.7                 |
> | 4     | 5375              | 0.5×     | 17.7                 |
>
> **At party 2 grouping is neutral-to-slightly-positive, which is exactly what
> the rule was designed to be** — the pot bonus and the level weighting land
> where the reasoning said they would, and the shipped 0.1 needs no correction.
>
> **The drop at party 4 is NOT the XP rule and must not be tuned as if it were.**
> The per-capita KILL RATE falls with it, from 69 to 18 — the party is banking a
> third of the XP because it is landing a quarter of the kills, not because the
> split shortchanged it. If the sharing were the problem the kill rate would have
> stayed flat and only the XP would have moved. What actually collapses is the
> bot's play in a crowd: four autopilots converge on the same bodies and stand
> inside each other, which is §7.4's SPACING and PACK-SPLITTING rules, neither of
> which has landed. Lifting `partyBonusPerHero` to make that column read 1× would
> be re-tuning the game's XP economy to cover a bot deficiency — the same error
> §7.2.5's second limit names in its own domain, and it would then have to be
> undone the day §7.4 lands.
>
> So: **both levers stay where they are, on evidence**, and the remaining half of
> this measurement is blocked on §7.4 rather than on an instrument. A scaling
> pass at `/players 2/4/8` is worth running the same way once it is — the harness
> takes `--players` and prints it beside the party size for exactly that.
>
> **RE-MEASURED AFTER §7.4 LANDED, and the diagnosis held.** With spacing,
> pack-splitting, ally cover and the convoy in (moon/MEDIUM, fresh heroes,
> 2 seeds × 6 min): per-capita xp/min reads 1× / **2.4×** / **1.7×** at party
> 1/2/4, and the per-capita kill rate reads 7.1 / 23.3 / 13.9 — the party-4
> collapse was the bots crowding one body, exactly as diagnosed, and grouping
> now PAYS at both sizes. Neither lever moved; the numbers changed because the
> bots stopped standing inside each other.
>
> **A SECOND VENUE SAYS THE SAME THING, and that is what the conclusion rests
> on.** On `goodco_hq` at MEDIUM (3 seeds × 6 min, fresh heroes) the per-capita
> XP reads 1× / 0.4× / 0.2× / 0.2× at party 1/2/4/8 — and the per-capita KILL
> RATE reads 62 / 21 / 9.8 / 7.6, which is the same curve. The two falling
> together is the whole argument: a party shortchanged by the SPLIT would keep
> its kill rate and lose only the XP, and that is not what either map shows.
>
> Two caveats the harness prints and this table inherits. The spread is wide
> (8.9k–14.5k at party 1), so these are directional numbers over a handful of
> seeds rather than a tuned constant — anything that would MOVE a knob wants more
> seeds than two. And the deep rungs are only measurable WITH `--start-level`: a
> fresh party on nightmare reads 0 xp/min at every size including party 1, which
> is not a co-op result at all.

**BOTH OF THE DEBTS BELOW WERE PAID BY phase 5** (see §5.8), and everything §4.7
records as NOT LANDED — the corpse, the mods, the party HUD, the banking and the
measured tuning pass — is now inventoried and sequenced in **phase 5.5** rather than
left in this box.

**AND TWO OF phase 5's RULES WERE ALREADY OWED — see the box at the head of §5.3.**
A co-op run currently banks its records to the leaderboards exactly as a solo
run does (there is no `PartyStamp`, and §5.3 says there must be), and a joiner's
loadout is accepted verbatim off the wire (there is no validation, and §5.3 says
there must be). Both became reachable when phase 2.5 opened the doors, which is a
PR earlier than the section that owns them — so they are debts now rather than
future work, and they belong at the front of phase 5 rather than beside the trade
window.

---

## PHASE 5 — PRODUCTION

**Goal: shippable.** Everything between "it works with friends" and "it works
with strangers, at scale, forever".

> **phase 5 IS NO LONGER LAST, AND "SHIPPABLE" IS THE WORD TO READ CAREFULLY.** The
> garage (phase 6) sorts after it, so the mode ships WITHOUT A HUB: a joiner lands
> in the middle of whatever mission the host is on. That is a deliberate order —
> phase 5 is what makes co-op work, phase 6 is what makes it pleasant — and it is
> stated at both ends so nobody reads this section's title as "and then we are
> done". If the missing hub turns out to be the first complaint, phase 6 moves up;
> nothing in phase 5 depends on it.
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
> does not. phase 2.5 opened the doors and phase 3 started seating real heroes off the
> wire, so both of the gaps below are open in the tree TODAY, on the direct-UDP
> path, rather than at some future point when phase 5 starts.
>
> 1. **THERE IS NO `PartyStamp`, so a co-op run banks records like a solo one.**
>    The rule below says a multiplayer run must not contribute to leaderboards,
>    and nothing anywhere marks a run as a session run — grep finds no stamp, no
>    flag, no reader. The boards rank lifetime kills, the hardest single blow and
>    the best kill rate SUSTAINED over ten minutes of combat clock, and every one
>    of those is inflated by seven other people helping without anybody having to
>    cheat at all. It is small — a flag on the run, seeded from `SessionParams`
>    like every other run parameter, read where `ModStamp` is already read — and
>    it should be done at the FRONT of phase 5 rather than beside the trade window.
> 2. **A JOINER'S LOADOUT IS TAKEN VERBATIM.** `server/session.ts` passes
>    `wants.loadout` — a claim that arrived from a stranger — straight into
>    `seatHero`, and there is no `validateLoadout` in the tree. The rule below
>    asks for level-within-range, items mintable from the catalogs, and stat
>    points summing to what the level allows. Note the honesty the rule itself
>    demands: it is a speed bump, not a wall, and whatever ships must say so.
>
> Both are recorded HERE rather than in phase 4's §4.7 on purpose: they are phase 5's
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
server. It is the same file. What phase 5 adds is the wrapper: a config file, a
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

  > **THESE TWO HAD NO INSTRUMENT, AND THAT IS THIS PLAN'S OWN RECURRING
  > FAILURE IN ITS FIFTH FORM.** As written they need eight machines and eight
  > bored humans, so neither could be run — and a done-when that cannot be run
  > is a done-when that gets ticked. The instrument is **§7.2.5's BOT CLIENT**:
  > a headless process that joins over the real transport and plays with
  > `botAct` off the replicated state. It is owed EARLIER than its number, like
  > §7.1 and §7.2 before it, and it is blocked on the same §7.1
  > parameterization — so the honest ordering is §7.1 → §7.2 → §7.2.5 → this
  > soak. Beside making the soak runnable it proves the one claim nothing else
  > tests: that what `split.ts` sends is ENOUGH TO PLAY FROM. Read §7.2.5 for
  > what it deliberately does not prove.

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
  and stays playable at 150 ms / 2% loss injected at the transport seam —
  driven by §7.2.5's bot clients, not by eight people, and therefore runnable
  again on every later change rather than once.
- The dedicated server runs from a config file with no Steam dependency, out of
  the same file the utility process uses.
- `docs/multiplayer.md`, `docs/configuration.md`, `docs/troubleshooting.md` and
  the README describe what actually shipped — including, plainly, that there is
  no hub yet and where a joiner lands without one.

### 5.8 What phase 5 actually shipped — and the three things it did not

**LANDED.**

- **§5.3's two debts, first, as the box said.** A run more than one person has
  played carries a `PartyStamp` and reaches no ranking; a joiner's loadout is
  weighed on arrival. The stamp is **latched in `seatHero` rather than seeded
  from `SessionParams`**, which is a deliberate departure from §5.3's own
  sketch: a run is marked by what HAPPENED to it (a host playing alone with the
  door open is playing solo), a parameter is a thing one of three builders can
  forget, and as ordinary DYNAMIC state the latch replicates for free. The two
  readers genuinely disagree — a party kill counts for everyone on the badges,
  and for nobody on the boards — so the ledger keeps board-facing figures in
  `LifetimeTotals.solo`, and a pre-co-op save seeds them from the lifetime
  figures they used to be.
- **§5.2's hardening.** A per-session packet budget for the peer who got IN
  (dropped over the allowance, kicked only on a real debt), and a seeded fuzz
  pass over every decoder. The fuzz found four real ones, **all in the delta
  applier and all reachable by a malicious HOST** — the direction nobody thinks
  of, since a joiner applies whatever it is sent.
- **§5.4's reconnect**, with the engine holding a flag and the session owning
  the window, because the engine has no clock and a grace window counted in
  ticks would run at the speed of the simulation.
- **§5.5's dedicated server**, and `server/host.ts` is what makes "it is the
  same file" true rather than aspirational. Running one immediately found the
  bug it exists to find: the host is identified by being the FIRST client to ask
  for a seat, which holds only because the shipped topology always seats a
  renderer over a `MessagePort` first — so on a dedicated server the first
  network joiner was mistaken for the host and handed a DEFAULT hero.
  `SessionOptions.ownerless` is the answer and three rules follow from it.
- **§5.1's trade**, engine side, with a test per anti-dupe rule. It needed
  **§3.6's seat debt paid first** — `applyRunCommand` dispatched all 69 verbs
  against `state.players[0]`, so a joiner's every private verb acted on the
  host's hero. Twenty sites, seat 0 as the identity default, and the acting hero
  comes from the seat the session admitted the client into rather than from any
  field on the frame.

**NOT LANDED, and the reasons differ.**

- **The trade WINDOW.** The engine, the five verbs and the rules are here and
  tested; the screen is not, so a trade is currently something only a command
  can start. Ordinary app work of the shape `QuestOverlay` already is.
- **§5.6's net graph.** Every number it wants is already measured
  (`Reliability.stats`, `.rtt`, the roster's ping); it is a readout rather than
  an instrument, and it did not fit.
- **§5.6's SOAK AND ADVERSITY PASS, AND THAT ONE WAS THE FINDING** — the same
  shape §4.7 hit. Neither could be run, because neither had an instrument: as
  written they need eight machines and eight bored humans. That is what §7.2.5
  exists for, and the honest ordering is §7.1 → §7.2 → §7.2.5 → this soak —
  **all four of which are phase 5.5's, sequenced in §5.5.2.**
  What DID land is `tests/engine/net_dedicated_test.ts`, which drives a real
  session behind a real admission desk over a real UDP socket and proves the
  stack CONNECTS — a strictly weaker claim, and it must not be recorded as the
  soak.

  **THE INSTRUMENT NOW EXISTS AND HAS BEEN RUN — SEE BELOW. THE DONE-WHEN IS
  STILL NOT MET**, because what has been run is minutes rather than hours.

### 5.9 The first soaks — what they measured, and the six defects they found

`scripts/bot-client.mjs`, eight bot clients, one dedicated server, 75 ms of
one-way latency (§5.6's 150 ms round trip) and 2% loss injected at the transport
seam. Minutes at a time, on one machine, over loopback.

**THE LAST RUN, with every fix below in.** Seven of eight clients seated (the
eighth timed out joining) and all seven stayed connected for the full fifteen
minutes. The party played L1 → L7 over 199 kills and CLEARED the level in about
four minutes. Inbound 2.0–3.1 MB/s across seven clients while the fight was on —
**roughly 300–450 KB/s each at a 20 Hz publish, i.e. 15–23 KB per snapshot**,
which is the first number anybody has for §5.6's "snapshot growth" and is larger
than this plan has ever assumed. Process rss moved between 151 and 187 MB with
no monotonic climb. 223 verbs sent against 246,772 steers.

**THE SIX DEFECTS.** Not one of them fails a unit test, and the first is the
reason §7.2.5 exists at all.

1. **A READ THE SPLIT WITHHOLDS, met as a CRASH.** `canBuyStock` asked
   `state.players[0].inventory` whoever was asking, and on a joiner seat 0 is
   somebody else's hero — whose bag the split does not send. The autopilot's
   ordinary "would a walk to the stall re-arm me?" read
   (`bot/economy.ts affordableStallUpgrade`) died on `undefined.includes`,
   minutes into a session, in a build where every test was green. **This is
   exactly the failure §7.2.5 says nothing else can catch**: `split.ts` declares
   what TRAVELS, every suite around it asserts that a field which changed
   arrived, and none of them asks whether what a client HAS is enough to decide
   with. Fixed by parameterizing the read on the acting hero. **THE MERCHANT'S
   MUTATORS ARE STILL SEAT-0 READS** — `buyStock`, `sellItem`, `buybackItem`,
   `repairGear`, twenty-four sites — so a joiner buying spends the HOST's purse
   (and buys back into the host's bag off a shelf every seat shares). Same shape as
   the fix above and as the companion verbs in §5.5.3; it is the next thing on
   §3.1's list and it is now a known bug rather than a suspicion.
2. **A run parked on the TITLE CARD for ever.** A session builds its run waiting
   on the level card, and a headless joiner that never sends `dismissIntro`
   steers a hero on a run that has not started. 143,793 ticks "played", zero
   kills, every figure a soak watches looking healthy. It was the readout's
   phase/level/kills line that caught it — the argument for that line existing,
   and for never judging a soak by whether the processes are alive.
3. **A CLIENT KILLING ITSELF WITH ITS OWN POLITENESS.** A screen holds the run
   until somebody clears it, so the naive loop re-sent the clearing verb on every
   tick it still saw that screen — sixty a second, all RELIABLE, against a window
   of sixty-four unacknowledged messages. The layer below did what it promises
   and declared the peer dead. Eight clients gone inside a minute, each one's
   last snapshot frozen on the readout looking for all the world like a wedged
   server — **which is what it was mistaken for twice before the readout got good
   enough to tell them apart.** `RESEND_QUIET_TICKS` is the rule a human obeys
   without thinking: having asked, wait a few publishes to see whether it worked.
4. **A rate-limited JOIN dropped in silence.** The hub's connectionless bucket is
   keyed on the ADDRESS — a flood trivially varies its source port — so everyone
   behind one shares an allowance of five, refilled once a second. That is the
   right rule, and it makes an ordinary case fail: two people in a house joining
   the same friend, a LAN party, a soak out of one loopback. The refused join
   travelled RELIABLE, the reliability layer under the hub had already
   acknowledged the datagram, and nothing ever retried it — so the player waited
   out a fifteen-second deadline and was told "the session stopped answering".
   The host now replies TOO MANY ATTEMPTS (a join is far larger than that reply,
   so the anti-reflection rule is untouched, and unlike a hello it is not
   spoofable — the sender completed the challenge round trip). The joiner treats
   it as a WAIT: it re-sends the HELD join rather than the whole handshake,
   because a fresh challenge would spend a second token of the very allowance
   that just ran out, and the wait gets its own budget rather than being charged
   against the probe's "is anybody there" tries.
5. **A busy host declared dead by its own joiner.** The reliability layer calls a
   peer dead after ten seconds of silence, which a queue can easily exceed; the
   joiner now restarts the handshake instead of reporting an unreachable host.
6. **A GLOBAL SCREEN NOBODY LEFT IN PLAY CAN CLOSE.** The level-up chooser lifts
   only when the points are placed, and its owner can stop being able to place
   them by QUITTING or by GOING DOWN (hp 0 with the party not yet wiped, so no
   `dying` scene ever runs) — either way the run freezes for everybody, for ever.
   `releaseStuckLevelup` drops the world's obligation to wait, checked every tick
   rather than at the events that cause it, which is the only version a new way
   of leaving play cannot out-run. The points are KEPT: a held seat may be
   reclaimed and a downed hero revived, and both should find their level-up where
   they left it. **Honesty about provenance**: this was reasoned out of a soak
   whose frozen readout turned out to be (3), so it is proven by
   `tests/engine/coop_rules_test.ts` rather than by a run. The real fix is §3.2's
   per-player screens — **which have since landed and RETIRED the bolt-on**: an
   abandoned screen holds nothing shut, because `partyBlocked` only counts
   heroes in play.

**WHAT THEY HAVE NOT ANSWERED.** Leaks and snapshot growth are HOUR-scale
questions and this ran for minutes; the 15–23 KB snapshot deserves a look on its
own (§5.5.3); one client in eight still fails to join from a shared address; and
the fleet's own limits are the plan's, not the instrument's — no prediction, one
transport at a time, and a client's dps is partly a measurement of the network
(§7.2.5's three limits). §5.7's done-when stands.

---

## PHASE 5.5 — THE REMAINDER

**Goal: nothing is owed that nobody is holding.** Every PR from 1 onward
deferred something, and each deferral was recorded in its own section — which is
right, and is also how a dozen separate debts come to exist with no single place
that lists them. This is that place. It designs nothing new: it is the
inventory, the ORDER, and — for four items — the honest statement that they
cannot be closed by writing code at all.

**IT SORTS HERE, DIRECTLY AFTER THE DEBTS IT COLLECTS, AND THAT RESOLVES
SOMETHING THE PLAN HAS BEEN CARRYING AWKWARDLY.** Three separate boxes already
say that §7.1, §7.2 and §7.2.5 are "owed EARLIER than their number" — the
instruments phase 4's tuning and phase 5's soak are blocked on. A note that a section
happens somewhere other than where it sits is a label that lies about the order,
and the plan says so itself. So those three MOVE HERE, and phase 7 keeps only what
is genuinely about how a bot PLAYS: bots in a local game, party behaviour, and
quest awareness. Nothing is re-planned by that; the same work is written in the
order it actually happens.

**AND IT IS A CHECKLIST RATHER THAN A DESIGN.** Everything here was designed in
the section that deferred it. What this adds is the sequencing and the reason
each item is still open, so whoever picks it up does not reconstruct either from
a dozen scattered "NOT LANDED" boxes.

### 5.5.1 The four things code cannot close

**These are not tasks, they are ACCEPTANCES**, and they need a human with
hardware. Writing them as work items is how they get ticked from a diff, which
is exactly what §1.75.4 and §2.5.4 were written to stop.

| Owed since | What                                                                                                    | Why no diff can close it                                                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| §1.75.4    | A PACKAGED launch — `npm run electron`, a real `utilityProcess.fork`, a real `MessagePortMain` handover | The `extraResources` entry and the port handover are covered by stubs and reasoning. #790 tried and could not fetch the Electron binary in a sandbox. |
| §2.5.3     | EIGHT MACHINES over each transport, through a real NAT                                                  | There is no eighth machine in CI, and a loopback socket cannot fail the way a carrier-grade NAT does.                                                 |
| §2.5.3     | The UPnP mapping against a REAL router                                                                  | `net/upnp.ts` is exercised against its own protocol encoding; the router is the thing being tested.                                                   |
| §2.5.3     | The firewall remedies on each OS                                                                        | Each is an elevation prompt on a machine somebody owns.                                                                                               |

The `ui-review` screenshot audit of the HOST / JOIN screens is a fifth of the
same kind: the harness drives a BROWSER, and every one of those screens is
deliberately absent from a browser build.

All five now sit inside **R3 — THE PROOF** (§5.5.3), which is where acceptance
belongs; this list stays as their statement of WHY no diff can close them.

### 5.5.2 The order the rest has to be done in

Three of these dependencies are non-obvious, so the order is stated once rather
than rediscovered:

1. **§7.1 — `botAct(bot, state, hero)`. LANDED.** 164 sites across 12 files,
   the same mechanical refactor §3.1 did to the engine. The hard half was
   already done, exactly as predicted: `Bot` owns all its own memory and
   `step()` already takes a `PartyInput`, so no design question came up in any
   of the twelve files.

   **BYTE-IDENTITY WAS PROVEN RATHER THAN ARGUED**: two full seeded campaigns
   (moon/medium/4242 and goodco_hq/hard/777) produce simulator reports
   byte-identical to the ones `main` produces — every kill, drop, damage
   figure, weapon swap and death — and all 172 existing bot tests pass
   unchanged. `tests/engine/bot_party_test.ts` is the new half: every other bot
   suite flies ONE hero and would pass with the refactor reverted, so that file
   is the one that fails if a `state.players[0]` creeps back in.

   **AND THE METHOD IS WORTH RECORDING, because two attempts were thrown away
   first.** A rewrite keyed on "insert after the `state` argument" mangles the
   helpers that legitimately take `(state, tune)`; one keyed on "a function
   mentioning `hero`" reaches every unrelated file with a local of that name.
   Both failed the same way — the rule deciding what to edit was not derived
   from the refactor, so neither could tell its own damage from its own work.
   What worked was a REGISTRY: a function needs the parameter iff it reads seat
   0 or calls something already registered, and a call gets the argument iff its
   callee is registered, inserted at the index that callee's own declaration
   uses. Anything outside `src/game/bot/` was done by hand.

2. **§7.2 — the simulator flies a party. LANDED.** `--party N` for how many
   bots, never `--players N`, which already means the hp/XP scaling and is the
   collision most worth avoiding; the report grew a `PartyReport` beside the
   seat-0 one rather than replacing it, so nothing downstream had to learn about
   parties. **It found a real bug on its first run** — every ambient hazard in
   the game was aimed at `partyCentroid`, which lands a blast on every head of a
   tight party and on nobody at all in a spread one; see §7.2 for the
   measurement, the `hazardFocus` fix, and the one piece of §7.4 (the LEASH) that
   had to come with it for the instrument to be measuring co-op rather than N
   soloists.
3. **§4.3's MEASURED TUNING PASS — RUN, and the answer is that neither lever
   moves.** `scripts/coop-tuning.mjs` reads per-capita XP per minute at 1/2/4/8,
   medianed over seeds, with `--start-level` minting the hero a deep rung
   implies. At party 2 grouping measures **1.1× solo** — neutral-to-positive,
   exactly what the rule was designed to be. The fall at party 4 tracks a fall in
   the per-capita KILL RATE (69 → 18), so it is §7.4's missing SPACING and
   PACK-SPLITTING rather than the XP split, and lifting the bonus to hide it
   would be re-tuning the economy to cover a bot deficiency. The numbers are in
   §4.7; the remaining half is blocked on §7.4, not on an instrument.
4. **§7.2.5 — BOTS ARE CLIENTS**, blocked on (1) for the same reason (2) is: a
   client's seat is never 0. Amended since it was written — this is now the
   SHIPPED shape rather than a test harness beside it (see §7.2.5), so it lands
   together with §7.3's local bots and needs no separate instrument.

   **LANDED.** `server/bot-client.ts` joins over the real transport, applies
   real snapshots, and plays its hero off the replicated state alone. It cost
   one small module because both halves were already written to a seam: the
   adapter (decision 3b, §5.5.3) had made the bot's whole output an intent, and
   `createJoinLink` and the page's client already spoke to "a pipe, whatever it
   is". The bridge between them is four lines.

   **THE ONE STRUCTURAL MOVE was `pwa/src/game/net/client.ts` →
   `server/client.ts`** (the `@game/client` alias). It is the only thing in the
   repo that turns snapshots back into a run, a headless joiner needs exactly
   that, and a second client written beside it would be the drift this
   instrument exists to catch — what a bot proves playable has to be what the
   page actually reads. Its one app-shaped line (`setLocalSeat`) became the
   `onSeat` callback; nothing else about it changed.

   `tests/engine/net_bot_client_test.ts` is the guard, and it asserts the thing
   nothing else does: not that a field which changed arrived, but that the set
   of fields a client HAS is enough to make a decision with. It also runs the
   party case and §5.6's 150 ms / 2% loss figures.

5. **§5.6's SOAK AND ADVERSITY PASS. THE INSTRUMENT EXISTS AND HAS BEEN RUN —
   BRIEFLY.** `scripts/bot-client.mjs` is the fleet ("run a dedicated server and
   let eight bots join it", exactly as the amendment predicted), and
   `Impairment` on the UDP transport is the weather — latency, jitter and loss
   injected at the transport seam, BELOW the reliability layer so a dropped
   reliable payload is genuinely retransmitted and a dropped snapshot is
   genuinely gone.

   **What has been run is MINUTES, not hours** (§5.8 has the numbers and the
   four defects it found), so the done-when is NOT met: leaks and snapshot
   growth are hour-scale questions and this has answered a ten-minute one. What
   changed is that the remaining work is somebody leaving a terminal open
   overnight rather than an instrument nobody has built. **Now R3's** (§5.5.3).

6. **§3.2 — the per-player screens. LANDED** — see §3.2's as-built amendment
   for the shape (ten screens on `Player.screen`, `partyBlocked` as the one
   halting rule, the banked level-up with its changelog line, the retired
   `releaseStuckLevelup`) and the four deliberate narrowings (`choice` stays
   global-anyone-resolves until the kill chain knows its owner; conversations
   are one-at-a-time held by their opener). `tests/engine/player_screens_test.ts`
   is the guard.
7. **§4.2's corpse and respawn. LANDED** — the down sweep, the corpse, the
   `respawn` verb, owner-only recovery, the vault fold at banking, and the
   hardcore admission gate; §4.2's as-built box has the four deliberate
   deviations (level-start respawn, worn-kit-only corpse, the never-lose-gear
   fold, mode-not-difficulty at the door). It did NOT need a per-player
   `dying` screen after all: a downed hero is a body the world stops
   answering for (`hp <= 0` through `heroInPlay`), and the YOU FELL overlay
   is the app's, keyed off `Player.downed`.
8. **§3.3 — prediction and reconciliation.** Deliberately last: it is the item
   that changes what a player FEELS on a GOOD connection, so it wants a mode
   that is otherwise finished. Input frames carry a sequence, the LOCAL hero
   replays unacknowledged input, everybody else interpolates one interval
   behind — and COMBAT is deliberately not predicted, because that is a rollback
   problem this codebase has no machinery for and a player would experience as
   monsters un-dying. **Now R2's** (§5.5.3).

**THE CHAIN IS SPENT.** Six of its eight items are landed and the two that are
not have homes in the consolidation below — so this list is a RECORD now, kept
for the as-built notes each landed entry carries, and §5.5.3 is where the open
work lives.

### 5.5.3 THE CONSOLIDATION — everything still open, as three phases

> **AMENDED AFTER §4.2's CORPSE LANDED, when the chain ran out.** This section
> used to be "the independent items" — a flat list beside a chain that still
> had a spine. The chain is spent now, and what was left was fifteen loose
> items scattered across this list, two chain stragglers, a decision, phase 6's
> tail and phase 7's whole remainder — which is the exact failure §5.5 was
> written to prevent, one level up. So the remainder is CONSOLIDATED into
> THREE phases, grouped by the KIND of work each one is, because that is what
> makes a phase internally consistent: one is app-and-engine FEATURE work on
> the joiner's experience, one is engine CORRECTNESS work on what the wire
> carries, and one is VERIFICATION — the bot that plays, the measurements it
> enables, and the human-with-hardware acceptances.
>
> **The design of every item stays in its owning section** — these groups are
> an index and an order, not a re-plan, exactly as §5.5 itself was. R1 and R2
> are INDEPENDENT and can run in either order or in parallel; R3 runs beside
> them and finishes last only because acceptance is what finishing IS. The one
> soft ordering: §3.3 (in R2) prefers a mode that is otherwise finished, so R2
> sensibly trails R1.

**R1 — THE WHOLE PARTY** — **LANDED** (the as-built record closes this group).
_Goal: a joiner is a first-class player._ Everything here is feature work on
the same seam — what a second player can DO and KEEP — and the two sharpest
items share their hardest piece (the banking), which is why they are one
phase:

- **§6.4 — in-session party travel.** The session survives the level swap and
  the party goes through the door together; today a crossing re-mounts
  app-side like a gate, so a hosted session lands joiners on level start. The
  banking half exists (`travelTo` banks every crossing); the session-side
  teardown/rebuild is the work.
- **§4.5 — banking a joiner's character, and the party HUD.** The throwaway
  `spectatorCharacter` retires: every player's character banks on their OWN
  device through their own `saveCharacters` (`updatedAt` stamped only for
  heroes a save actually changed — cloud save's merge depends on it). The
  party frames go down one edge, off the steering thumb's third, portraits
  through the paper-doll compositor. **This phase resolves the "whichever
  lands second inherits the banking" note — travel and banking land
  TOGETHER.**
- **§5.1's TRADE WINDOW screen.** The engine, the five verbs and the anti-dupe
  rules are landed and tested; the screen is app work of the shape
  `QuestOverlay` already is, reading `tradeOf`/`tradePartner`/`TradeSide.item`.
- **§4.4 — mods reconciled.** The host's set is the session's; a subscribed
  joiner applies it through `registerDefs`; a joiner missing one is offered
  the Workshop page and refused until they have it.
- **Phase 6's hub tails**: quest givers cast in the garage, and the workbench
  stash (§6.8's still-owed list).

_Done when a friend with their own hardcore-matched character can join your
garage, kit out, travel through a door with you, trade you a find, play under
your mods, and leave with everything they earned on their own roster._

> **R1 AS BUILT — LANDED, with the deviations and the tail recorded here so
> nobody rediscovers them.** Every item above shipped in one PR, plus one the
> list never wrote down because nobody had noticed it was missing: **the party
> was INVISIBLE.** The renderer drew `localHero` alone — §3.1's note that the
> render layer was "genuinely small" thanks to the companion precedent was
> right about the machinery and wrong about anybody having done it — so the
> field pass now draws every hero in play (their own public worn kit through
> the same paper-doll pass, per-seat gait keys, the downed sprawled where they
> fell, the local hero last and on top), and §4.5's party frames hang down the
> companion rail's edge with the roster's name for the seat
> (`RosterEntry.seat`, new). A teammate draws WITHOUT a blood coat —
> `hero-soak.ts` keeps one record, the local hero's — recorded there as a
> simplification rather than silently.
>
> **§6.4 travel** landed as a run command (`travelTo`, seat 0 only — the host
> chooses the road) consumed by the SESSION between ticks: every seat's
> loadout is extracted through the one banking funnel, the destination is
> built from the session's own parameters with a derived seed, the party is
> re-seated in the same order (departed/held flags and the PartyStamp
> intact), every client is re-baselined with FULL snapshots until one is
> acknowledged (a delta against the old level's baseline names ids the client
> no longer holds), and the params are replaced so a later joiner carves the
> new level. The app end keeps the driver across the remount, joiner-style,
> and each device banks its OWN hero off the level being left
> (`NetClient.onTravel`). Three honest narrowings: the crossing routes
> in-session only when the doors are armed or the roster has more than one
> name — a solo local run keeps the app-side crossing byte-identically; a
> travelled-to level takes `openingSkip` from the HOST's character and starts
> its merchant undiscovered (the session has no roster to ask); and
> **VICTORY → NEXT LEVEL still re-mounts app-side**, so that one crossing
> still drops joiners — it is tangled in the outro/banking flow and is R1's
> one deliberate leftover on this item.
>
> **THAT LEFTOVER IS PAID** (#862): NEXT LEVEL sends the same `travelTo`,
> flagged `banked` because `recordVictory` already put the hero on the
> character; the splash hides the road from a joiner (THE HOST CHOOSES THE
> ROAD) and keeps STAY; and the session folds the level it WON into the
> destination's `clearedLevels`, which is the one thing the app used to answer
> from the character and no longer can. RESTART and the AUTO PILOT's next-lap
> routing stay app-side on purpose — they REPLAY the level rather than cross,
> which `travelTo` refuses and a client cannot read as a swap.
>
> **§4.5 banking** landed by making the joiner's character REAL: the active
> roster hero rides the join intent as a loadout (purse funded from their
> whole wealth, exactly as a local run's), the session weighs and seats it,
> and every banking path a local run has — victory, travel, softcore defeat,
> plus the new mid-run leave — writes to the joiner's own roster through the
> same `saveCharacters` stamping discipline. The join driver's `spectating`
> flag now follows the welcome's seat answer (it was hard-coded `true`, a
> fossil of the spectator era), and a client the session could NOT seat is
> put back on the throwaway shell so a watcher can never bank the host's bag.
> Ledger and achievements count for a seated joiner (decision 12); the boards
> stay honest through the PartyStamp, not by suppressing the ledger.
>
> **§5.1's window** is `TradeOverlay`, mounted like the quest box, with the
> table a per-player SCREEN on both seats at once (`PlayerScreen` grew
> `"trade"`; `openTrade` refuses "busy" unless both heroes are free — the
> refusal is the consent model until a request flow exists). Taking an item
> back off the table travels as its own verb (`clearTradeOffer` — the
> channel's `int` deliberately refuses the engine's `-1` idiom). Opened from
> a teammate's party frame on the field, or from the pause roster's TRADE
> button. `PROTOCOL_VERSION` 17 → 18 covers this PR's wire changes whole.
>
> **§4.4 mods** shipped three halves, one of them a bug fix bigger than the
> feature: **the session process never had the mods' catalogs at all** — the
> page's `registerDefs` never reached it, so every modded HOSTED run (which
> on Steam is every modded run) simulated the shipped game while the renderer
> drew the mod. The exact overrides the page registers now travel with
> `start` and the session registers them before it builds. A joiner with the
> host's mods installed walks through the row and the set is applied in the
> host's order on the way (and `restoreBaseDefs` — dead code until now — puts
> the shipped game back when the run ends); a joiner MISSING one keeps the
> refusal, whose press opens the game's Workshop HUB. Still owed from §4.4's
> own text: the per-item Workshop page (the wire carries compiled ids and the
> Workshop wants published file ids; nothing maps them yet), reconciliation
> on the invite/`+connect_lobby` and JOIN BY ADDRESS paths (no lobby metadata
> in hand), and the `ModStamp` on the CHARACTER — which this plan called "the
> rule that already exists" and which, measured, never did.
>
> **The hub tails split.** The workbench is the stash's place (a tap on any
> bay bench raises the run's LOST & FOUND — hub levels only, and the verbs
> already travel so a joiner's bench is their own vault). **The garage's
> quest giver shipped as a story commit, in order**: the giver drafts were
> put to the user first (§6.5's confirmation rule), the user picked ADA'S
> MOTHER, and RUTH landed with the full chain walk — story.md, the
> manuscript, and a second campaign-long quest chain (three collect errands
> riding Ada's Trail cross-level via `dropFrom`, which the hub exception in
> `tests/content/quests_test.ts` now sanctions).

**R2 — THE HONEST WIRE — LANDED**, all four items, in the PR that closed the
plan's code work. As built: §3.3 shipped exactly as designed (input frames
carry their own sequence, the server echoes the highest applied seq in every
state frame's header, the local hero replays unacknowledged inputs through
`predictHeroMovement` — the movement pass with combat and shared-state side
effects neutralized — and everybody else interpolates one publish interval
behind; combat is never predicted; the bot client deliberately stays
unpredicted as the network-cost readout). The ATTACKER THREAD landed with the
spare-or-kill owner gate and the boss-death executioner riding it, solo proven
byte-identical on a seeded simulator A/B. THE SNAPSHOT was measured before it
was packed — 27.6 KB/publish on a 135-mob field, two thirds of it whole
entities re-sent for one moved field and the spawner list travelling whole —
and partial-entity + per-index array patches cut it to 8.15 KB; the NET GRAPH
rides the DEBUG FPS meter and the session panel's roster rows. Decision 15's
REAL LOCK chose the build-time literal (`server/licence.ts`, folded shut by
the ship target, drift-tested from both ends). The original inventory:

- **§3.3 — prediction and reconciliation** (design in §3.3; the chain's note
  about combat staying unpredicted holds).
- **THE ATTACKER THREAD** (§3.1's last seat-0 reads): `hitEnemy`/`killEnemy`
  learn who landed the blow, so crit/miss/armor-pen and the `struck`/`hit`
  procs read the attacker's build (~20 sites in `loot.ts`), the drop economy
  prices against the attacker, and a kill's base XP is measured against the
  attacker's level. Threading it shifts seeded rolls, so it is a MEASURED
  piece — and it unblocks §3.2's `choice` owner-gate, which joins it here.
- **THE SNAPSHOT'S SIZE, then the readout.** §5.9 measured ~23 KB per publish
  (300–450 KB/s per client at 20 Hz) — fine on a LAN, not a number to ship to
  a home connection unexamined. Find whether it is the split, the differ
  re-sending arrays whole, or what a horde costs — §1.4's "measure first,
  then pack what the measurement says is expensive" comes due here — and land
  **§5.6's NET GRAPH** behind DEBUG MODE beside it (every number is already
  measured; this is the readout that ends the flying-blind).
- **Decision 15's REAL LOCK** (from §5.5.4): the build-time literal or the
  Steam auth ticket. The wire's door is this phase's subject, so the decision
  is settled here rather than beside it.

_Done when a party-4 fight feels local at 150 ms, every payout names the hero
who earned it, the per-client rate is a number chosen rather than discovered,
and the licence check is a lock rather than a statement._

**R3 — THE PROOF — THE CODE HALF LANDED; what remains needs a human, hardware
or hours.** As built: §7.3's local bots are CLIENTS of the session process
over an in-process pipe (the amended design, so every client rule governs
them by construction), priced through the same pure `/players` pairing, XP-
exempt, roster-less, yielding their seats to arriving humans; §7.4's party
behaviours and §7.5's errand awareness landed in the autopilot (see their own
sections); §4.3's re-measured pass ran with them in (the numbers are in §4.7:
grouping now pays at party 2 AND party 4); and the plan was erased from the
shipped tree — zero references outside `docs/`, every comment restated in
place or pointed at `docs/multiplayer.md`. **Still open, recorded in
`docs/multiplayer.md` — "What is NOT here yet"**: the overnight soak (the
instrument exists; hours have not been run), the five human-with-hardware
acceptances, and the store surfaces. The original inventory:

- **§7.3 — BOTS IN A LOCAL GAME** (the feature: a party without four friends
  online), **§7.4 — party behaviour** (spacing, pack-splitting, covering a
  downed hero — the known blocker on the party-4 measurement), and **§7.5 —
  quest awareness**. Phase 7 keeps the designs; R3 is where they happen.
- **§4.3's REMAINING MEASURED PASS**, unblocked by §7.4: the party-4 per-capita
  read re-run, and the `/players 2/4/8` scaling pass the harness already takes
  `--players` for.
- **§5.6's OVERNIGHT SOAK** — the instrument exists (`scripts/bot-client.mjs`
  - `Impairment`); what is owed is hours rather than minutes, and §5.8's
    paragraph replaced with the result.
- **§5.5.1's FIVE ACCEPTANCES** — the packaged launch, eight machines through
  a real NAT, the real router, the per-OS firewall prompts, and the HOST/JOIN
  `ui-review` audit. Unchanged: a human with hardware, results recorded,
  failures included.
- **§5.6's STORE SURFACES** — the Steam listing's multiplayer categories, the
  depot's launch options, and store screenshots showing a party
  (`store-shots` skill): the mode meeting the world is this phase's whole
  subject.
- **THE PLAN ERASED FROM THE CODE.** Remove every existing reference to this
  plan from the shipped tree: the §-paragraph numbers and the words
  "multiplayer plan" in code comments, doc comments and test headers. This
  plan is a TRANSIENT document — it was used to WRITE the code, and code must
  not reference back to it: a comment that explains a rule by citing a §
  stops explaining anything the day the plan is archived. Each such comment
  is rewritten to state its reasoning IN PLACE (or to point at
  `docs/multiplayer.md`, the shipped-architecture doc, which is permanent),
  and the sweep ends with zero hits for `multiplayer plan` and plan-§ numbers
  anywhere outside `docs/`. From here on, no NEW code references the plan.

_Done when a bot party plays like a party, the tuning numbers are re-measured
rather than inherited, the soak has run for hours, every §5.5.1 row has a
recorded result, the store says what shipped, and no line of code references
this plan._

What this list used to carry that is now a RECORD rather than work:

- **Decision 3b — the bot's five housekeeping mutators. DONE, VERBS AND ADAPTER
  BOTH.** All five travel: `careForCompanion`'s two actions (`spendReviveItem`,
  `healCompanionWithMedkit`) were already on the list, `swapHand` and
  `sortInventory` were moved out of `bot/` into `items/inventory.ts`, and the
  remaining two got verbs of their own — in every case because the DECISION was
  the bot's and the ACTION was the hero's, and a run command may not reach into
  the autopilot for its implementation. `stepBotWeaponSwap` was the one that
  forced the question, exactly as predicted: it carried the bot's own anti-juggle
  memory, and moving that memory onto the run (`Player.lastSwapMs`) was the
  cheaper answer than moving the bot.

  **AND THE "MECHANICAL CHANGE" WAS NOT ONE, WHICH IS THE FINDING WORTH KEEPING.**
  This entry used to say the last two mutators could travel as `autoEquipBest`
  and `scrapInferiorLoot` because both were already in `COMMANDS`. They were —
  and neither is the verb. `autoEquipBest` is the player's OPTIMIZE button and
  takes the WEAPON slot with it, which the pocket arsenal owns and re-picks every
  tick, so a sweep behind that verb flaps against the draw beside it.
  `scrapInferiorLoot` empties every outgrown cell at once and banks NONE of them,
  so it would destroy the shooters a blade hero carries on purpose and throw away
  the uniques the LOST & FOUND exists to catch. Both existed, so the guard test
  passed on the paper mapping alone. The verbs the bot actually needed are
  `autoEquipGear` (the sweep MINUS the hand) and `bankSpareItem` (shed ONE cell,
  into the vault) — two new names, `PROTOCOL_VERSION` 12 → 13. **The lesson is
  about the guard rather than the verbs**: a test that only asserts a named verb
  EXISTS agrees with any mapping at all, so `tests/engine/bot_intent_test.ts` now
  drives each decision and reads the emission back, and pins the two lookalikes
  by name as verbs the bot must never reach for.

  **THE ADAPTER LANDED WITH IT** (`src/game/bot/intent.ts`): every decision
  answers a `BotCommand`, and the tick's two halves — the draw and the care
  BEFORE the step, the bag discipline AFTER it — are driven through a SINK. The
  simulator applies in-process through `applyRunCommand` (the same dispatch the
  server runs), the app pushes through `pwa/src/game/run-commands.ts` so an AUTO
  PILOT ride inside a session sends rather than writes, and `botIntent` answers a
  whole tick from one snapshot for the bot client §7.2.5 still owes. Byte
  identity was PROVEN rather than argued, on §7.1's own method: `moon`/medium/4242
  and `goodco_hq`/hard/777, solo and at `--party 4`, produce simulator reports
  identical to `main`'s down to the wall-clock line.

  **ONE REAL BUG FELL OUT OF IT.** `spendReviveItem` and
  `healCompanionWithMedkit` both read `state.players[0]` for the bag and the
  pouch they spend from, on verbs the command channel hands an ACTING HERO — so a
  joiner cracking a bottle consumed the HOST's cell, and the simulator's own
  party (§7.2) ran every seat's care through seat 0's kit. Both now take the hero
  (with `canHealCompanion` beside them). It is the same seat-0 un-migration §3.1
  swept the engine for, surviving in three functions nothing had reason to
  parameterize until the bot's care had to name a cell.

### 5.5.4 The two open decisions

Neither is the plan's to make. One is now scheduled (R2) and one turned out to
be already answered:

- **Decision 15 — the LICENCE. ANSWERED: multiplayer is played through STEAM,
  and nowhere else.** The multiplayer right travels with the Steam copy, so a
  session carried by anything but the Steam relay is unlicensed play — whoever
  set it up and whatever they meant by it. That retires the "middle" this
  paragraph used to describe: there is no unsettled band between playing with
  friends and running a hosting business, because neither is licensed off Steam.

  **Enforced at the HUB, on the transport's own name.** `hub.ts` is the one door
  every path into a session comes through — the game's own HOST, the server
  browser, JOIN BY ADDRESS and the dedicated server alike — so the check lives
  there and nowhere else, as a new `unlicensed` refusal sorted FIRST in the
  ladder (ahead of build, mods, challenge and password: a peer that may not be
  here at all should not have anything else about it examined, and the message
  it gets back has to name the thing it can act on). It reads `Transport.id ===
"steam"` rather than validating a ticket, because a peer that reached us over
  the Steam relay reached us through Steam's own matchmaking with a Steam
  identity behind it — a ticket scheme layered on top would be a second, weaker
  copy of a fact Valve has already established, and one this repo cannot
  honestly test. It fails CLOSED, so the next transport added is licensed
  deliberately rather than by having been forgotten.

  `allowUnlicensedTransport` is the one escape, and it is an OPTION on the hub
  rather than an environment variable precisely so a player cannot set it. The
  repo's own suites and §5.6's headless soak pass it; no shipped path does.

  **AND THE HONEST LIMIT, which must not be described as enforcement.** The
  standalone dedicated server reads its escape from a CONFIG FILE, and a config
  file is a thing a determined player can edit. What ships today is a statement
  of what the licence permits — the same shape as a licence header — not a lock.
  A real lock is one of two things, and choosing between them is work this has
  not done: a Steam auth ticket (`GetAuthSessionTicket` / `BeginAuthSession`)
  validated at the hub, which is the mechanism Valve provides and which §0's
  "the Steam binding is narrower than it looks" warns must be verified against
  `steamworks.js` before being leant on; or a build-time literal the shipped
  binary folds to false, which is cheap and airtight for the SHIPPED build and
  does nothing about somebody compiling the open-source tree themselves. The
  second is probably right, and the first is what makes a public server list
  possible later. **CHOSEN AND BUILT (R2): the build-time literal.**
  `server/licence.ts` holds one marked literal, `true` in the repo tree so the
  suites and the soak fleet run from sources, folded to `false` by
  `scripts/build-server.mjs` while staging the ship target — so the packaged
  binary's config escape is dead code, the fold refuses a build where the
  literal has drifted, and the dedicated suite drift-tests both ends. The
  auth-ticket route stays available the day a public server list wants it.

- **phase 6's story chain — ANSWERED, the way this asked.** Phase 6 opened
  with the story commit, manuscript confirmation on the record (§6.8: "THE
  STORY CHAIN RAN FIRST"). Kept here only so the register's count of open
  decisions reads zero from this section.

### 5.5.5 Done when

- **R1, R2 and R3 have each met their own done-when** (§5.5.3), with every
  as-built record written into the owning section the way §4.2's and §3.2's
  were — an unamended design is how a plan starts lying about its own state.
- §5.5.1's rows (now inside R3) each have a recorded result from a human on
  real hardware — **including a FAILURE**, if that is what happens, because
  the point of the list is that these were never verified rather than that
  they were assumed to pass.
- §4.3's re-measured tuning numbers are written into §4.7 and §5.6's soak
  result into §5.8 — in both cases REPLACING the paragraph that says it could
  not be run.
- The remaining §5.5.4 decision (the lock) is answered in the register.
- **And this section is deleted rather than ticked.** A remainder list that
  survives its own completion is the next plan's stale inheritance.

---

## PHASE 6 — THE GARAGE

**Goal: somewhere to stand, and somewhere to land a joiner.** This was phase 4's
§4.1 and is its own PR because it is a different kind of work: a level, a new
level-swap mechanism, a parked merchant, party travel, and a change to the story
chain — none of which is co-op arithmetic.

**IT SORTS LAST ON PURPOSE, AND THE COST OF THAT IS STATED HERE RATHER THAN
DISCOVERED.** A hub is what makes co-op PLEASANT; phase 5 is what makes it WORK.
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

What stands in it: the **workbench** (the stash, when phase 5's §5.1 lands — until
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
  properly, because it is also the answer phase 3's §3.1 table left open for him
  ("whom does he follow?" stops being a question when he stops following).

### 6.4 Party travel

Everyone must arrive on the same map with their own loadout. The host chooses at
the door; the session tears down its level and builds the next from a new seed,
with each player's `Loadout` re-applied. The existing per-level handoff
(`arrival.ts`, `applyLoadout`) is the mechanism; what is new is that there are
eight of them and **they must all be banked before the switch** — which is the
same banking phase 4's §4.5 owes, so whichever lands second inherits it rather than
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

### 6.8 What shipped, and what deviated

**The hub landed** — the garage exists, the campaign OPENS in it, and the
mechanisms under it are the ones §6.3 priced:

- **`objective: { type: "hub" }`** — the fourth objective kind; it never
  clears, checked ahead of every victory fallthrough, so a player idles in the
  hub forever and no outro, victory or bank can fire (`objectiveCleared`).
- **THE STATIC VENUE** is a pin, not a special case: `MapBlueprint.carveSeed`
  freezes the carve AND the size roll (`content/maps/garage.yaml`,
  `carveSeed: 9`), so home lays out identically every visit on every seed and
  every GENERATED MAPS size — and a mod re-lays the garage by editing a
  blueprint like any other.
- **LEVEL SELECT IS `LevelDef.travelDoors`**, standing on landmarks — and the
  plan's "one rift door" became THREE doors, because the fiction already had
  three vehicles out: the CAR (→ GOODCO HQ), the ROCKET (→ moon, Mars), and
  the RIFT SEAM (→ the rift, BOOT HILL), the last **sealed behind the RIFT
  CREATOR** — a `keepsake` story item THE FOUNDER drops in the rift, banked on
  the character (`hasKeepsake`), which is §6.2's option 1 with the door split
  by destination instead of swapped mid-campaign.
- **TRAVEL IS THE GATE CROSSING, SHARED** — `travelTo` in
  `pwa/src/game/game-screen/run-progress.ts` (bank the loadout, mark the
  thoughts, drop the checkpoint, re-mount on the destination), used by
  `gateEntered`, the travel-door picker, and the car's drive-out alike.
- **THE MERCHANT PARKS** — `merchant.parked` on the def: revealed at his
  authored counter from map start, scene-free, and he never wanders (which
  also answers §3.1's "whom does he follow?" for the hub).
- **THE CAR AND THE SHIP ARE MACHINES** (`src/game/vehicles.ts`,
  `state.vehicles`): panel-assembled sprites with four damage rungs each, a
  glass layer, suspension springs, wheels that roll from speed, a per-part
  FIX ladder (attached → loose rattle → dangling → gone, shed parts as floor
  decor) and wheels that tear off as BOUNCING debris. Tapping the car boards
  it (`enterCar`, a run command like every other verb; `PROTOCOL_VERSION`
  bumped) and starts the engine
  (`carStarted`, the cadenced `carEngine` rumble, lights and body shiver);
  driving out to the level's ROAD (`LevelDef.driveOut`; the garage door's
  threshold and `CAR.departDistance` are the fallbacks for a venue with no
  road) opens the DRIVE-OUT beat — `state.departure`, the engine steering the
  car away up the road while the app washes the screen to black — which books
  `carDeparted` once at its end, and the app travels to the car door's
  destination. The driving/flying minigames remain a later phase — the
  drive-out is deliberately collision-free.
- **THE STORY CHAIN RAN FIRST**, with the manuscript's confirmation on the
  record: the campaign now opens at home (`docs/story.md` "Home — THE GARAGE
  (hub)", the prelude cutscene re-homed), and the RIFT CREATOR's lore pages
  carry the D2-style town loop.

**Still owed, and recorded rather than discovered later — all three went to R1
(§5.5.3), and two of the three are now PAID:**

- ~~**§6.4 in-session party travel**~~ — **LANDED** (R1's as-built box in
  §5.5.3): the session performs the swap between ticks and the party goes
  through the door together — VICTORY → NEXT LEVEL included, since #862.
- **Quest givers in the hub** — the garage still casts none, and deliberately:
  a giver is lines, lines are manuscript-governed, and the manuscript
  confirmation §6.5 requires has not been asked for. The one R1 item that is a
  story commit rather than a code commit.
- ~~**The workbench stash**~~ — **LANDED**, in §6.1's own minimal sense: a tap
  on any bay workbench raises the run's LOST & FOUND, so the vault finally has
  a place. A real shared stash stays deliberately unbuilt (§5.1's own note).

---

## PHASE 7 — THE PARTY BOT

**Goal: the autopilot learns there is more than one hero.** One refactor with
three payoffs, which is why they are one PR rather than three: the MEASURING
INSTRUMENT phase 4 needs and does not have, BOTS IN A LOCAL GAME so a player can
have a party without four friends online, and a bot that plays like somebody in a
party rather than like a soloist who happens to be standing near you.

> **§7.1, §7.2 AND §7.2.5 ARE phase 5.5's WORK, AND THIS IS ONLY WHERE THEY ARE
> DESCRIBED.** They are the instruments two other PRs are blocked on: §7.1–§7.2
> are what phase 4's §4.3 tuning needs (§4.7 says so — the co-op rules shipped as
> STRUCTURE precisely because the simulator can only fly one hero), and §7.2.5
> is what phase 5's §5.6 soak needs, which named no instrument at all without it.
> This plan said three separate times that they were "owed earlier than their
> number", which is a note contradicting its own position; **phase 5.5 now owns
> them and sequences them** (§5.5.2, items 1, 2 and 4).
>
> They stay written HERE because this is where the bot is explained, and
> splitting a refactor's rationale from the thing it refactors helps nobody.
> What must not happen again is a reader taking the number as the schedule.
>
> **SO phase 7 IS THE SMALLER HALF: how a bot PLAYS.** Bots in a local game
> (§7.3), a bot that behaves like a party member rather than a soloist standing
> near you (§7.4), and quest awareness (§7.5). All three are now scheduled
> inside **R3 — THE PROOF** (§5.5.3), where the measurements they unblock and
> the acceptances they precede live beside them; the designs stay here.

### 7.1 The parameterization — `botAct(bot, state, hero)`

**The autopilot reads `state.players[0]` at 164 sites across 14 files in
`src/game/bot/`**, and `botAct` has no notion of WHICH hero it is steering. That
one fact is why `scripts/simulate-run.mjs` flies exactly one hero, why phase 4's
tuning is unmeasured, and why there is no such thing as a second bot.

It is the same mechanical refactor §3.1 did to the engine, one file at a time,
and it is genuinely mechanical: the hero becomes a PARAMETER threaded from
`botAct` down, the way every private engine read already is. The distribution is
worth sequencing by — `economy.ts` (37), `weapon-swap.ts` (26), `supplies.ts`
(21), `index.ts` (15), `perception.ts` (13), `macro.ts` (13), `arsenal.ts` (10),
`dodges.ts` (9), `nav.ts` (8), `content.ts` (6), `fight.ts` (5), `state.ts` (1).

**The good news is that the hard half is already done.** `Bot` is a per-instance
object that already owns all of its own memory — the stall detector's `nav`, the
wall-trace `trace`, the A* `route` (keyed on level id and `obstaclesVersion`), the
pinned `waypoint`, the `thoughts` resolver — and `botAct` is already documented as
pure with respect to `state`. So N bots are N `Bot` instances with no shared
scratch to fight over, and `step()` already takes `PartyInput` as an array
index-aligned with the party. Nothing structural is in the way.

Two rules to hold while doing it:

- **Single player must stay byte-identical at every commit**, exactly as §3.5
  demanded of §3.1. Seat 0 passed as the parameter is the identity case, and the
  existing bot suites (`bot_test`, `bot_nav_test`, `bot_economy_test`,
  `bot_thoughts_test`, `bot_auto_equip_test`) are the guard.
- **Determinism is per-bot and must stay that way.** A fresh bot on the same seed
  must evolve identical memory, and the ORDER the party's bots are asked must not
  matter — none of them mutates the state today, and a test should pin that
  rather than trusting it.

### 7.2 The simulator flies a party — **LANDED**

> **AND IT FOUND SOMETHING ON ITS FIRST RUN, which is the whole argument for
> building an instrument before tuning against one.** A party of two on the moon
> landed **2 kills over three minutes where the same seed solo landed 128**, with
> seat 0 spending **43% of the run in the anti-wedge UNSTICK sweep**. Nothing in
> the bot or the wire was at fault. Every ambient hazard in the game
> (`hazards.ts`) was laid down on `partyCentroid`, and every one of them carried
> a comment saying — correctly — that with one hero the centroid IS that hero, so
> single player is untouched. **Nobody had read the party case**, because until
> this section landed nothing in the repo could produce one.
>
> It is wrong in both directions at once. A rock's blast bills EVERY hero in
> range, so aimed at the centroid it falls, by construction, in the middle of a
> group — a party that is doing the right thing and staying together is caught by
> every rock, where a soloist is caught only by the ones he fails to dodge. The
> per-hero hazard rate therefore climbs with the party size, and climbs fastest
> exactly when the party plays well. A SPREAD party gets the mirror image: the
> centroid of two heroes at opposite ends of a hall is empty floor, so the rain
> falls where nobody is and the hazard stops existing.
>
> The fix is `hazardFocus` — the weather is aimed at ONE hero, rolled, never at
> the middle of the party — and it covers the rain, the storms, the stampede lane
> and the hay. The roll is SKIPPED at one hero rather than answered, which is
> load-bearing rather than an optimisation: `state.rng` is the run's one stream,
> so spending a draw would shift every roll after it in every seeded measurement
> in the repo. Byte-identity was proven the same way §7.1's was — a moon run, a
> goodco_hq run and a full easy campaign, all identical to `main`. With it, the
> same party of two lands **145 kills, both heroes alive, and no UNSTICK at all**.
>
> **ONE PIECE OF §7.4 CAME WITH IT — THE LEASH, AND ONLY THE LEASH**
> (`src/game/bot/party-play.ts`). §7.2's deliverable is the instrument §4.3's
> tuning is read off, and an instrument that measures N SOLOISTS SHARING A SEED
> cannot be used to tune co-op at all. The number is not invented: it is
> `XP_SHARE.radius`, the distance past which a hero stops sharing in a kill, so a
> bot beyond it is not merely out of position but spending the party's payout.
> Spacing, splitting the packs, `Item.owner`, covering a hero who is down and
> group travel stay in §7.4 — they are about how a bot party PLAYS, and they can
> only be judged by watching one.
>
> Two smaller things fell out. `simCamera` centred EVERY seat's view on seat 0,
> and the weapon's targeting gate reads the seat's own `input.view` — so a joiner
> could only strike what was on the host's screen. And the simulator's `levelup`
> drain only ever emptied seat 0's chooser, so a party member's ding wedged the
> run outright; it drains whichever seat owes points, which is what makes a party
> playable HERE without waiting for §3.2.

- **A bot per seat.** `simulateLevel` gains a party size; it seats N heroes via
  `seatHero` and holds N `Bot`s, feeding `step()` the input array it already
  accepts. Each bot may want its own `profile` (the melee/ranged/magic lane) —
  a party of four identical meta builds measures one build four times, which is
  the least interesting thing a party simulator could do.
- **THE FLAG NAME IS A TRAP.** `/players N` already means D2's monster-hp and XP
  scaling (`server/wire/players.ts`) and has nothing to do with how many heroes
  are on the map. A simulator `--players N` that meant the second thing would be
  the two knobs colliding in the one place they most need telling apart. Use
  **`--party N`** for how many bots, and keep `--players N` for the scaling —
  and the `--verdict` line should print both.
- **The report is seat-0 shaped and has to grow.** `HeroSnapshot`, the boss
  encounters, the weapon swaps, the deaths table and `extractLoadout(state,
state.players[0])` all describe one hero. The interesting readouts for a party
  are per-seat AND aggregate — per-capita XP rate is the one phase 4's §4.7 names
  as the thing to read, never the per-kill share, because a party also clears
  faster and the two effects only show up together.
- **Then the measured pass**: `--verdict` at 1, 2, 4 and 8 across every
  difficulty, and the two levers `XP_SHARE.partyBonusPerHero` and the
  `/players N` pairing moved on evidence.

### 7.2.5 THE BOT IS A CLIENT — the feature and the instrument are one thing

> **AMENDED, AND THE CORRECTION IS TO A CLAIM THIS SECTION ITSELF MADE.** The
> first draft kept two bot hosts apart: a bot CLIENT as a test harness, and
> §7.3's local bots steered inside the session — on the stated grounds that "a
> bot the host is not authoritative over is a peer". **That reasoning is wrong.**
> A client sends input frames and commands; the server validates them and owns
> the result. A bot client has exactly the authority a human client has, which
> is none. There was never a safety argument here, and it was holding apart two
> things that want to be one.
>
> **AND THE TOPOLOGY ALREADY PAYS FOR IT.** phase 1's §1.2 makes the host's own
> renderer a client over a `MessagePort`. So a LOCAL bot needs no socket either:
> bots are clients, and the TRANSPORT is whatever fits — a `MessagePort` in a
> local game, a real UDP socket when one joins a dedicated server. One code
> path, and "let bots join" BECOMES the soak rather than needing an instrument
> built beside it.
>
> **AND THE SEAM IS AN ADAPTER OVER AN INTENT, WHICH IS MOSTLY ALREADY BUILT.**
> `botAct` does not press keys and does not touch the run — it RETURNS a
> `GameInput`, which is the very shape `FRAME.input` carries. So for steering
> there is nothing to design: the caller decides what the intent means.
> `step(state, input, dt)` in the simulator, the run loop in a local game,
> `transport.send(encodeFrame(FRAME.input, …))` in a client. One function, three
> adapters, no branch inside the bot.
>
> **THE GAP WAS THE HALF THAT WAS NOT AN INTENT — AND IT IS CLOSED.** The five
> housekeeping calls that reached in and MUTATED (`stepBotWeaponSwap`,
> `careForCompanion`, `botAutoEquip`, `cullWorstLoot`, `sortBotInventory`) cannot
> cross a wire, because on a client a direct write is erased by the next
> snapshot. The bot's output is now intent for BOTH halves — the commands drawn
> from the closed list the channel already polices — and the adapter
> (`src/game/bot/intent.ts`) is a SINK, so the simulator applies in-process, the
> app pushes through its own router, and `botIntent` answers a whole tick from one
> snapshot for the client below. See §5.5.3's decision-3b entry for what landed,
> including the two verbs this section wrongly assumed were already there
> (`autoEquipBest` and `scrapInferiorLoot` exist, but neither is the bot's).
> **AND THE CLIENT ITSELF HAS LANDED** — `server/bot-client.ts`, with
> `scripts/bot-client.mjs` as the fleet and `Impairment` on the UDP transport as
> the weather. See §5.5.2's item 4 for what it cost and §5.9 for what its first
> run found.
>
> **THE ONE THING THAT DOES NOT MOVE IS THE SIMULATOR.** §7.2's bots keep
> calling `botAct` directly on the authoritative state, in-process, with no wire
> under them. It runs thousands of ticks for a balance measurement and has to be
> fast and deterministic; a network-shaped simulator measures jitter and reports
> it as balance, which is this section's own second limit. So the split is
> THREE-WAY, not two: **simulator → in-process** (what the numbers come from),
> **game and dedicated server → bot clients** (what the mode actually is).

**A fractional number for the reason phases 1.5, 1.75 and 2.5 have one:** this was
found after the numbering, and renumbering §7.3–§7.7 would break every reference
to them in `AGENTS.md` and in the tree.

**THE HOLE THIS FILLS IS phase 5's, NOT phase 7's.** §5.6 asks for "an 8-player session
left running for hours, watched for leaks, drift and snapshot growth" and for
latency, jitter and loss injected at the transport seam with the game held
playable at 150 ms / 2% loss. §5.7 makes both a done-when. **Neither names an
instrument**, and as written they need eight machines and eight bored humans —
so they are requirements that cannot be run, which is this plan's own recurring
failure in its FIFTH form (a layer ships and the thing that was supposed to
exercise it does not; §4.7 caught the fourth and said so in as many words).

The instrument is a **BOT CLIENT**: a headless process that JOINS a session over
the real transport, receives real snapshots, and steers its hero with `botAct`
off the replicated state — the same `Bot` §7.1 parameterizes, hosted somewhere
else. It is the same shape §5.5's dedicated server is (`server/net/connect.ts`
already IS the joiner role: a socket opened outward, somebody else's frames
carried to a consumer), minus the renderer, plus the autopilot. So it belongs
beside `connect.ts` rather than under `pwa/`, driven by a script.

**WHAT IT VALIDATES THAT NOTHING ELSE CAN — and this is the reason to build it,
ahead of the soak it makes possible.** `split.ts` declares what travels. Nothing
anywhere proves that **what travels is ENOUGH TO PLAY FROM**. Every existing
test asserts that a field which changed arrived; none asserts that the set of
fields a client HAS is sufficient to make a decision with. That gap fails
silently and in exactly the direction the whole generic differ was built to
avoid: a read moves behind a field the split withholds, every test stays green,
and a joiner's screen is subtly wrong in a way only a human playing it would
notice. A bot playing off a client's view cannot paper over it — it stops
fighting, walks into a wall, or fails to swap a weapon, and it does so in CI.

Beside that, it makes four things measurable that are currently opinions:

- **§5.6's soak and adversity, unattended.** Eight bot clients, hours, loss and
  latency injected at the seam, watched for leaks and snapshot growth.
- **§5.4's reconnect.** Drop a bot client mid-fight, reconnect it inside the
  grace window, assert it resumed the same hero rather than a fresh one.
- **§3.3's prediction error**, once there is prediction — a number rather than
  "it feels fine on a LAN".
- **The command channel under real arguments.** The bot buys, repairs, allocates,
  swaps and picks talents, so a soak drives most of the 69 verbs with values
  nobody typed into a test.

**IT DOES NOT REPLACE §7.3's RULE, AND READING IT THAT WAY WOULD BE A CHEAT
VECTOR.** A bot filling a player's party is steered IN THE SESSION, for the two
reasons §7.3 gives. This is a SECOND HOST for the same `Bot`, existing to prove
the network, and the two are wanted at once: a soak worth running has bot clients
on the wire AND session-side bots in the party.

**THREE HONEST LIMITS, because the temptation is to claim this proves more than
it does.**

1. **IT IS NOT A DETERMINISM TEST.** The client does not simulate — it applies
   snapshots. It cannot detect two simulations diverging, and that stays
   `tests/engine/net_determinism_test.ts`'s job. A bot client that plays fine
   proves the wire, not the physics.
2. **IT IS NOT THE INSTRUMENT FOR §7.2's NUMBERS.** A client bot acts on a
   snapshot up to three ticks stale with no prediction under it, so its dps, its
   deaths and its clear time are partly a measurement of the NETWORK. phase 4's
   §4.3 tuning is read off the SIMULATOR's in-session party (§7.2) and nowhere
   else; running the tuning pass over bot clients would move the levers to
   compensate for latency, which is the worst possible outcome for both.
3. **IT TESTS ONE TRANSPORT AT A TIME.** The seam is the seam, so it runs over
   UDP or over the Steam relay — but only over whichever it was pointed at, and
   §1.75.4's still-owed real-NAT matrix is unaffected by any of this.

**TWO THINGS FALL OUT OF IT, AND BOTH ARE WHY IT SITS HERE RATHER THAN IN phase 5.**

- **IT DEPENDS ON §7.1.** A client's seat is never 0, so a bot that reads
  `state.players[0]` at 164 sites steers the host's hero from a joiner's
  process. The parameterization is the prerequisite, exactly as it is for §7.2 —
  which is convenient, since a client legitimately HOLDS the private fields the
  bot needs (the bag, the purse, the build) for its OWN seat and no other: the
  private tier goes to its owner, so the one hero a bot client can read in full
  is precisely the one it is steering.
- **IT FORCED THE REST OF DECISION 3b, WHICH IS NOW PAID.** Five of the bot's
  housekeeping calls mutated the state directly. In the renderer that is merely
  untidy; in a CLIENT it is wrong — the write lands on a replicated state and the
  next snapshot erases it, so the bot's stat spend, repair or swap silently does
  not happen. All five are verbs now, `botAct`'s output is `{ input, commands }`
  through `botIntent`, and the swap memory moved onto the run
  (`Player.lastSwapMs`) exactly as 3b recommended. So the client below is
  unblocked: what it needs from the bot side already exists.

### 7.3 BOTS IN A LOCAL GAME

A player should be able to fill their own party with bots, without four friends
online. It is the same machinery: a bot seat is a real `Player` seated by
`seatHero`, steered by a `Bot`, and indistinguishable to every other system.

Four decisions, and the last one is the sharp one:

- **A BOT SEAT IS A CLIENT SEAT.** `botAct` is called by the APP today
  (GameScreen) and by the simulator. A bot filling a party joins the session the
  way every other client does — over a `MessagePort` locally, over a socket
  against a dedicated server — so it is identical to a human seat everywhere
  downstream by CONSTRUCTION rather than by care, and every rule that already
  governs a client (the loadout check, the packet budget, the command
  allow-list, the private split) governs it unchanged.

  **SUPERSEDED — SEE §7.2.5's AMENDMENT.** This bullet used to say a local bot
  must be steered inside the session because a bot the host is not authoritative
  over is a peer. That is not true: a client sends input and commands, and the
  server owns the result either way. A local bot is a CLIENT over a
  `MessagePort` — the same door the host's own renderer already comes through —
  so it costs no socket, exercises the real client surface, and is
  indistinguishable from a human seat everywhere downstream. Only the SIMULATOR
  keeps a direct in-process `botAct`, because it is measuring balance rather
  than playing.

- **A BOT YIELDS ITS SEAT TO A PERSON.** A session with three bots and a spare
  seat should let a fourth human in; a session that is full of bots should drop
  one rather than refuse them. `nextFreeSeat` already recycles a departed seat,
  and a bot leaving is exactly a `departHero` — the rule is already written.
- **A BOT'S RUN IS NOBODY'S ROSTER.** It has no character, banks nothing, and
  carries no loadout home — the same throwaway a spectator plays on. And a run
  with bots in it is a PARTY run for §5.3's purposes: it must carry the
  `PartyStamp` and stay off every leaderboard, because a bot is exactly the kind
  of help those boards cannot see.
- **A BOT MUST COST SOMETHING, OR IT IS A DIFFICULTY SLIDER WEARING A FRIEND'S
  CLOTHES.** Two halves of one question:
  1. **Does a bot take a share of the XP?** Recommendation: **no.** A
     level-weighted share would mean adding three bots roughly quarters the
     player's XP per kill, so nobody would ever use the feature — and this
     codebase already has the precedent in COMPANIONS, which level on their own
     kills and never touch the hero's bar (`creditCompanionKill`). It needs a
     flag on the seat so `splitXp` can skip it.
  2. **Which is exactly why they have to be priced.** Bots that add damage and
     take no XP make a party of bots strictly better than playing alone. The
     honest answer is that a bot seat moves the horde the way `/players N` does
     — the pairing is already one pure function, and it is already the one thing
     entitled to say what a player count means. Ship the two together or the
     feature is a cheat.

### 7.4 The bot learns there are other people on the map

Today's bot is a soloist. Standing it next to another hero produces four
behaviours a human would never choose, and each has a rule that fixes it — most
of them keyed to numbers the engine ALREADY owns, which is what stops this
becoming a pile of invented constants.

- **SPACING.** Two bots converge on the same nearest foe and end up inside each
  other, which in a game about being surrounded is how a party dies. They should
  hold a personal envelope, and it is the same rule a human runs: melee closes,
  ranged holds its `weaponRangeFor` lane, and neither stands where a friend is
  already standing.
- **DON'T LEAVE THE PARTY — the leash has a NUMBER.** `XP_SHARE.radius` (700 px)
  is the distance past which a hero stops sharing in a kill. A bot that wanders
  further is not merely out of position, it is costing the player XP, so the
  leash is a mechanic rather than a preference. Past it, come back.
- **SPLIT THE PACKS, DON'T QUEUE FOR ONE MOB.** The whole party beating on one
  minion while six others chew on somebody is the most visible tell that these
  are not players. `anyHeroWithin` and the existing pack state are enough to say
  "that one is being handled, take the next one".
- **DON'T TAKE WHAT ISN'T YOURS.** `Item.owner` exists as of phase 4, and a bot in
  an allocated session walking over somebody's drop and being refused it every
  tick is both wrong and noisy. In FREE-FOR-ALL the rule is a judgement rather
  than a check: a bot should not race the human for a legendary.
- **HELP THE ONE WHO IS DOWN.** Once §4.2's corpse lands there is a body to
  stand over and a reason to; before it, the useful version is simpler — a bot
  should notice a hero at low health and pull aggro rather than kite away from
  them.
- **CONVERGE FOR A BOSS, TRAVEL AS A GROUP.** Nobody in D2 walks through the
  door alone. The macro goal (`macroTarget`) should be the PARTY's, not each
  bot's own — with the human's heading as the default when there is one, since
  a bot party that decides where the player is going is worse than useless.

### 7.5 Quest and objective awareness

**The bot has no quest awareness at all today** — `src/game/bot/` mentions quests
only in comments, and `macroTarget` picks between waypoints, elites, the boss,
the merchant and a fog sweep. That is fine for a balance instrument and wrong for
a party member: phase 4 shipped errands with `collect` tokens on the floor, `visit`
objectives, escorts to be walked, and a giver with a `?` over their head.

What it should learn, in the order it is worth learning:

- **Pick up a quest token it walks past.** Nearly free — the drop is already in
  `state.items` and the tally is already booked at pickup.
- **Read the running errands as macro goals.** A `kill` errand wants a breed, a
  `visit` wants a place, a `collect` wants tokens — all of which `macroTarget`
  already has the shape to prefer.
- **Do not talk to givers, and do not take errands.** A bot accepting a quest on
  the party's behalf is a bot making a decision the player did not; the giver's
  conversation is the human's. A bot HELPS with an errand that is already taken.
- **Escorts are the one to leave until last.** An escort is a timer with a body,
  and a bot that outruns it converts a tense objective into a failed one.

### 7.6 Done when

The first four bullets belong to **phase 5.5** (§5.5.2) and are listed there; they
are repeated here only so this section's own done-when is readable.

- _(phase 5.5)_ `botAct` takes the hero it steers; single player is byte-identical
  and the existing bot suites pass unchanged.
- _(phase 5.5)_ `--party N` runs a real party headlessly; the same seed replays
  identically at every N, and the order the bots are polled provably does not
  matter.
- _(phase 5.5)_ `--verdict` reports per-seat and per-capita, and phase 4's §4.3 tuning
  is done ON EVIDENCE, with the two levers moved and the numbers written into
  §4.7 — measured on the SIMULATOR's in-session party, never on bot clients
  (§7.2.5's second limit).
- _(phase 5.5)_ A bot CLIENT joins a real session over a real transport and plays
  from the replicated state alone, so §5.6's soak is a thing a machine runs
  rather than a thing eight people do once. The bot's five housekeeping mutators
  travel as commands by then (decision 3b's other half), because on a client a
  direct write is erased by the next snapshot.
- A player can start a local game with bots, they hold formation, split packs,
  stay inside the share radius and help with an errand already taken.
- A bot yields its seat to a joining human, banks nothing, and the run carries
  the party stamp.
- The horde is priced for bot seats, and a run with three bots is not measurably
  easier than the same run with three humans.

### 7.7 Risks

- **164 sites is a bisect hazard.** Land it as its own reviewable commit series,
  one file at a time, each leaving single player identical — §3.5's lesson,
  which is the one piece of sequencing advice in this plan that has been right
  every time it was followed.
- **A party bot is a HUMAN-capability target, not a perfect one.** The
  `bot-improvement` skill's bar applies unchanged: the bot should make the
  decisions a skilled human makes and never something a human never would. A bot
  that plays a perfect spacing solution reads as a robot, which is worse than one
  that occasionally crowds.
- **The bot is a measuring instrument first.** Every behaviour added in §7.4 and
  §7.5 changes what the simulator measures. Land §7.1–§7.2, take the phase 4
  numbers, and only then start changing how the bot plays — or the tuning pass
  is measuring a moving target.
- **A BOT CLIENT WILL PLAY WORSE THAN A SESSION BOT, AND THAT IS THE POINT
  RATHER THAN A BUG.** It acts on a snapshot up to three ticks stale with no
  prediction under it, so it dies more and clears slower. The hazard is reading
  that as a bot regression and "fixing" it — by tuning the bot, by widening a
  dodge margin, or worst of all by moving a balance lever. The gap between a
  session bot and a client bot on the same seed IS the network's cost, and it is
  a readout to watch rather than a defect to close.
- **A HARNESS THAT PROVES THE WIRE MUST NOT BECOME THE WIRE.** §7.3's local bots
  stay session-side. The day somebody notices the bot client already works and
  ships the player-facing feature on top of it, every bot in a local game
  becomes a peer the host is not authoritative over — which is the one property
  phase 1's §1.2 topology exists to guarantee.

---

## Decisions register

Answers this plan recommends but does not have authority to make. Each should be
settled before the phase that needs it, not during.

| #   | Question                                                 | Recommendation                                                                                                                                                                                                                                                                                                                                                                                                        | Needed by  |
| --- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | Max party size                                           | 8, matching D2 and the `/players` scale                                                                                                                                                                                                                                                                                                                                                                               | phase 1    |
| 2   | Default direct port                                      | UDP 27015, walking to 27030, always revealing the bound one                                                                                                                                                                                                                                                                                                                                                           | phase 2    |
| 3   | Steam-only or dual transport                             | **Dual**, both offered by default                                                                                                                                                                                                                                                                                                                                                                                     | phase 2    |
| 3a  | Do the deferred cutover and screens land as one PR?      | **No — two.** See phase 1.5's §1.5.5: the cutover is the change most likely to regress single-player silently, it is provable on its own (an autopilot campaign against the same seeds), and the screens are verified by a different loop entirely. Combining them puts the same seam through one PR that phases 1 and 2 both split along                                                                             | phase 1.5  |
| 15  | What does the LICENCE permit for hosted play?            | **Steam only.** The multiplayer right travels with the Steam copy; a session over any other transport is unlicensed play. Enforced at the hub as an `unlicensed` refusal on `Transport.id`, sorted first in the ladder and failing closed. The dedicated server's config-file escape is a STATEMENT rather than a lock — see §5.5.4 for the two real ones and why neither has been chosen yet                         | phase 5.5  |
| 3b  | Does the AUTOPLAY BOT run on the client or the server?   | **Client, for now** — its decisions already travel as input and commands, so only its five housekeeping mutators need converting, and four of them are plain verbs. The fifth (`stepBotWeaponSwap`) carries the bot's own swap memory and is the one that forces the question; moving that memory onto the run is the cheaper answer than moving the bot. Revisit at phase 4, which owns co-op autopilot rules anyway | phase 1.75 |
| 4   | Level-up: blocking chooser or banked points              | Banked + non-blocking chooser (changes single-player too)                                                                                                                                                                                                                                                                                                                                                             | phase 3    |
| 5   | Fog of war: shared or per-player                         | Shared                                                                                                                                                                                                                                                                                                                                                                                                                | phase 3    |
| 6   | Spare-or-kill: who decides                               | The killing blow's owner, shown to all                                                                                                                                                                                                                                                                                                                                                                                | phase 3    |
| 7   | Loot: FFA or allocated                                   | FFA default, host toggle for allocated                                                                                                                                                                                                                                                                                                                                                                                | phase 4    |
| 8   | XP: D2's proximity + level weighting                     | Yes, then measure across the level range                                                                                                                                                                                                                                                                                                                                                                              | phase 4    |
| 9   | Hardcore heroes in others' sessions                      | Only hardcore hosts, same difficulty, enforced at handshake                                                                                                                                                                                                                                                                                                                                                           | phase 4    |
| 10  | Host migration                                           | **No.** Host leaves, session ends, everyone banks                                                                                                                                                                                                                                                                                                                                                                     | phase 4    |
| 11  | Leaderboards from co-op runs                             | Excluded, marked with a `PartyStamp`                                                                                                                                                                                                                                                                                                                                                                                  | phase 5    |
| 12  | Achievements from co-op runs                             | Count for everyone present                                                                                                                                                                                                                                                                                                                                                                                            | phase 5    |
| 13  | Browser PWA as a **joiner**                              | Out of scope. WebRTC + a signalling service is a separate project                                                                                                                                                                                                                                                                                                                                                     | —          |
| 14  | Mobile as a joiner                                       | Out of scope for the same reason                                                                                                                                                                                                                                                                                                                                                                                      | —          |
| 15  | Licence (`PolyForm-Noncommercial-1.0.0`) and hosted play | Confirm what it permits before a dedicated server ships                                                                                                                                                                                                                                                                                                                                                               | phase 5    |

---

## What this plan deliberately does not build

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

## Working notes for whoever picks this up

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
- **Watch the 200 KB budget on every PR that touches the title screen.** A
  server browser that reaches `@game/core` for a level's name drags the whole
  simulation onto the startup path for every player who never opens it.
- **Measure, don't guess.** `scripts/simulate-run.mjs`, the autopilot and the
  `--verdict` line exist precisely so that the balance questions in phase 4 have
  numbers attached. Multi-player support in the simulator is scoped into phase 3
  for that reason.
- **AND EVERY "DONE WHEN" NEEDS AN INSTRUMENT NAMED BESIDE IT.** The failure
  above has a twin that is easier to miss: not a deferred half, but a
  requirement nobody can run. phase 5's soak and adversity lines asked for eight
  players and hours of wall clock with nothing to drive them, so they would have
  been ticked from a LAN session and a good feeling — which is how §4.3's tuning
  came to be recorded as measured when the simulator could fly one hero. Before
  writing a done-when, name the thing that runs it; if there isn't one, that is
  the work, and §7.2.5 is what came of asking.
- **AMEND THIS DOCUMENT IN THE PR THAT FALSIFIES IT.** The lesson of phases 1 and 2
  is not that they deferred work — sometimes that is right — but that their
  "Done when" lists were left standing as if met, so the plan quietly stopped
  describing the repo. If a PR ships something the plan did not ask for, or
  leaves something it did, say so **in the plan, in that PR**, with the reason.
  Both amendments above were written weeks late, from a `grep` rather than from
  memory, and the reconstruction cost more than the note would have.
- **A DEFERRED HALF IS A PR, NOT A FOOTNOTE.** The specific way this plan went
  wrong is worth naming so it is not repeated in phases 3–5, which are each larger
  than either phase that has landed: a big change made of two different KINDS of
  work — a layer, and the cutover or UI that makes it reachable — will ship the
  layer and defer the other half. Either cut the PR along that seam up front, or
  expect to be back here.
