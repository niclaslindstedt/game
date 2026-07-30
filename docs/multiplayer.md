# Multiplayer — feasibility and plan

A Diablo 2-shaped multiplayer mode: a host starts a game at a difficulty,
friends join it with **their own characters**, the party fights the campaign
together, shares a quest log, talks in chat, and scales the horde with
`/players N`. Up to 8.

**The server ships inside the Gone in Space binary** — a listen server hosted by
one player's desktop build, which is how D2 did it too. There is no service to
run. See §3.

**Verdict: feasible, roughly six months of focused work, and the engine half is
unusually well prepared for it.** The simulation is already deterministic,
already serializable, and already runs headless in Node — so the server needs no
second implementation of anything. Nearly all of the cost sits in three places:
making the world hold more than one hero, making the modal UI phases stop
freezing everybody, and building the three D2 fixtures this game has never
needed (a town, a corpse, a stash).

This document is a plan, not a decision. Nothing here has been built.

---

## 1. What the codebase already gives you

These are measured against the tree, not assumed.

### The simulation is deterministic

`Math.random`, `Date.now` and `performance.now` appear **zero** times under
`src/`. Every roll comes from a seeded mulberry32 whose entire state is one
uint32 parked on the function object (`src/lib/rng.ts`), with
`rngState`/`createRngFromState` for freeze and thaw. The loop
(`pwa/src/lib/game-loop.ts`) is a fixed-timestep accumulator at 1000/60, and its
fast-forward multiplier deliberately scales the step _count_, never the step
_size_.

### The whole `GameState` is plain JSON

Apart from the `rng` closure, which is snapshotted beside it.
`pwa/src/game/saved-run.ts` already parks and thaws entire runs through a
versioned migration ladder, and `tests/engine/persistence_test.ts` proves a
thawed run resumes the exact same rng stream.

### The engine already runs headless

`src/sim/simulate.ts` drives real `step()` calls from a Node script. **The
dedicated server is `import { step } from "@game/core"` in a Node process** —
no port, no reimplementation, no parallel simulation to keep in sync. This is
the single biggest thing in the project's favour and it removes the risk that
usually dominates work like this.

### Replication bandwidth is a non-issue

Measured on a live `moon` run at t=60s, 146 enemies on the field:

| Field       |   bytes | nature                       |
| ----------- | ------: | ---------------------------- |
| `obstacles` |  62,764 | static — send once           |
| `enemies`   |  47,467 | dynamic — ~325 B/mob as JSON |
| `spawners`  |  20,825 | near-static                  |
| `explored`  |  20,437 | derivable from the seed      |
| `decor`     |  18,481 | static                       |
| `player`    |   1,281 | dynamic                      |
| `items`     |   1,104 | dynamic                      |
| **total**   | 176,107 |                              |

The dynamic slice is a few KB per tick binary-packed. At 20–30 Hz to 8 clients
that is ordinary traffic. Better still, the level is deterministic from its
seed, so a client can build the ~100 KB static half locally from
`(levelId, seed)` and never receive it.

### The character and difficulty model is already D2's

| Diablo 2                                               | Here                                                                                          |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Character select, named heroes, hardcore               | `Character` (`pwa/src/game/characters.ts`) — `name`, `hardcore`, `dead` permadeath latch      |
| Normal → Nightmare → Hell, gated on the last           | `easy → medium → hard → nightmare → jesus`, OR-gated unlock graph in `character-progress.ts`  |
| Per-**game** world state vs per-**character** progress | `GameState` (the run) and `Character` (the save), with `Loadout` as the documented handoff    |
| Quest log shared by everyone in the game               | `state.quests: Record<string, QuestProgress>` already lives on the **run**, not the character |
| Waypoint / act progression                             | `LEVEL_ORDER` + per-character `clears` (`"${difficulty}:${levelId}"`) + loadout carry         |

Per-player cameras are also already correct: `computeCamera` gives an unclamped
always-centred hero, which is exactly what D2 does with its own screen per
player. The party staying loosely together is a social convention, not a
technical constraint.

---

## 2. `/players N` is nearly free

`src/game/tuning.ts` is, almost exactly, D2's player-count scaling.
`setBalanceTuning()` takes a partial patch of multipliers, each applied **at the
single read site that owns its rule**, clamped to `[0, 100]`, live with no
rebuild:

```ts
// D2: monster HP ×(1 + 0.5(N−1)), with a matching experience bump.
setBalanceTuning({
  mobHp: 1 + 0.5 * (n - 1),
  xpGain: 1 + 0.5 * (n - 1),
  hordeSize: ...,
  dropRate: ...,
  uniqueDrops: ...,
  gearQuality: ...,
});
```

The knob docs even note the patch "takes effect on the NEXT roll/spawn/tick",
which is precisely how `/players` behaves in D2.

**One trap.** The `mobHp` knob's own comment records that kill XP is
level-based, so "a hp-scaled mob is tougher but pays the same xp for its
level". Scaling `mobHp` alone therefore makes `/players 8` strictly punishing
rather than the risk/reward trade D2 intends. `xpGain` must be raised
alongside it, deliberately.

---

## 3. Server topology — the binary is the server

**The server ships inside the Gone in Space desktop binary.** A host starts a
game from the Steam build and friends join it; there is no service to run and
nothing to pay for. This is a listen server, which is also what Diablo 2 itself
did — Open Battle.net and TCP/IP games were hosted by one player's client.

Four things make it work, and none of them is new machinery:

1. **The Electron main process is a full Node runtime**, and already does
   non-trivial Node work: it compiles every subscribed mod at load from
   `resources/modtools/`, talks to Steam through a native binding, serves the
   site over a private `game://app` scheme, and persists window state.
2. **The engine is Node-clean.** Framework-free TypeScript with no DOM
   assumptions, already proven by `src/sim/simulate.ts` driving real `step()`
   calls headlessly. A sweep of `src/` for browser globals returns 22 hits, all
   of them prose in comments or the bot's local variable named `window` — no
   browser API is touched.
3. **The shell already has the seam.** Cloud save, achievements, leaderboards
   and mods all run bridge → provider → platform over IPC, and
   `pwa/src/app/shell-bridge.ts` already abstracts the transport difference
   between Electron IPC and the React Native WebView. A multiplayer bridge is a
   fifth of the same shape.
4. **Steam solves the hard networking problem for free.** The audit recorded in
   `electron/src/leaderboards-provider.ts` notes that `steamworks.js` 0.4.0
   exposes **matchmaking and networking** (it is leaderboards that are missing).
   Steam's peer-to-peer networking relays through Valve's infrastructure, so NAT
   traversal is handled, and matchmaking supplies the lobby list — which is
   literally D2's join-game screen. **Verify the binding's depth before the plan
   leans on it**: legacy `ISteamNetworking` P2P and `ISteamNetworkingSockets`
   are different APIs with different guarantees, and the audit above was written
   about the leaderboard gap rather than as a networking survey.

### Run the simulation in a utility process, and let the host be a client

Electron 43 ships `utilityProcess`. Put the simulation there rather than in the
main process, for three separate reasons that each stand alone:

- A 60 Hz simulation must not compete with the main process's IPC, window and
  Steam duties.
- **`src/game` holds 36 module-level mutable bindings** — the `BALANCE` tuning
  object (33 read sites), the six flags in `src/game/flags.ts` (dialogue,
  cutscenes, auto-equip, auto-stat gains, generated maps and their size), and
  every `activeXDefs` catalog that `registerDefs` swaps when a mod loads. All of
  it is **process**-global, not per-`GameState`, so a process boundary is what
  keeps one game's `/players 8`, another's mod list and a third's generated-map
  setting from stomping each other. Threading those onto `GameState` instead is
  a wide refactor across 33+ sites that buys nothing this boundary doesn't.
- **It leaves exactly one code path.** The host's own renderer becomes just
  another client of the simulation, so there is no host special case anywhere —
  the same simplification Quake and Source listen servers make.

The same utility-process server, minus Electron, is the standalone dedicated
server if one is ever wanted. It is the same file.

### What the binary approach costs

- **The engine needs a Node build target.** Today `@game/core` is consumed by
  Vite for the browser and by `scripts/game-alias-loader.mjs` for tooling;
  neither produces something shippable inside the app. The mod compiler is the
  precedent — it ships outside the asar under `resources/modtools/` in a tree
  that mirrors the repo layout, because every module in it resolves its
  neighbours by relative path. Expect a build step, an `extraResources` entry,
  and an import-graph walk like `tests/content/mod_toolchain_deps_test.ts` to
  prove nothing was left behind.
- **Version skew becomes a real failure mode.** A host on one build and a joiner
  on another will diverge or crash. Needs a protocol-plus-build handshake that
  refuses politely. Steam auto-updates soften this; the web build does not.
- **Mods must be reconciled at join.** A host with mods loaded and a joiner
  without means different catalogs and immediate divergence. Because the server
  is authoritative the joiner mostly needs the sprites, but `ModStamp` and the
  load-order rules in `pwa/src/game/mod-order.ts` need a multiplayer answer.
- **The host is a player, so the host can cheat.** This is precisely why Open
  Battle.net was a cheat-fest. Acceptable for playing with friends; it is not
  acceptable for ladder integrity, so multiplayer runs should be gated out of
  leaderboard submission (see §9).

### Who can host, and who can only join

| Build                       | Host                                                                                             | Join |
| --------------------------- | ------------------------------------------------------------------------------------------------ | ---- |
| Steam desktop (`electron/`) | **Yes** — Node main process, Steam networking + matchmaking                                      | Yes  |
| Browser PWA                 | Not a socket server; possible over WebRTC with a small signalling service                        | Yes  |
| iOS / Android (`native/`)   | **No** — Expo/React Native runs Hermes in a WebView shell, with no Node and no listening sockets | Yes  |

Desktop hosts, everyone joins. That is a perfectly D2-shaped answer.

### Why server-authoritative, and not lockstep

The rng is bit-exact (integer `Math.imul`), but the simulation makes **154 calls
to `Math.sin`, `cos`, `atan2`, `hypot`, `pow` and `exp`** — none of which are
IEEE-mandated to return identical results across JS engines and platforms.
(`Math.sqrt` _is_ correctly rounded by the spec, so its 17 sites are safe.)
Chrome, Safari and Firefox can disagree in the last bit, and a 60 Hz simulation
compounds that into a desync within seconds. Peer lockstep is therefore off the
table; the server owning the simulation sidesteps the problem entirely.

---

## 4. What has to be built

### 4.1 `state.player` → `state.players[]` — the mountain

`state.player` is referenced **549 times across 73 engine files** and **206
times across 53 app files**. Every system is written against _the hero_,
singular:

- enemy aggro, leash and targeting (`step/enemies.ts` — the target is always `player.pos`)
- the wave spawner and its anti-camping anchor (`step/spawner.ts:55`)
- placed packs waking on proximity (`step/packs.ts:52`)
- the wandering merchant (25 refs), hazards (23), loot (14), menace (12),
  quests (12), story and dialogue (11), companions (11)
- `state.explored` — one shared fog-of-war grid

The mechanical rename is perhaps two weeks. The cost is that **each of those 549
sites is a design question**: does a pack wake for any player or the nearest?
Does menace read the party's combined DPS? Whom does the merchant follow? Is the
fog shared or per-player?

**Players are full `Player` records — not companions.** For the record, since
it is a tempting shortcut: `Player` carries 36 fields and 9 equipment slots;
`Companion` carries 17 fields and 3 slots, with no `inventory`, `vault`,
`stats`, `spentStats`, `talents`, `pendingStatPoints`, `coins`, `stamina`,
consumable stacks, `abilities`, `itemSpells`, `heldAbilities`, jump physics
(`z`/`vz`) or knockback state. A companion is not a trimmed-down player; a
second player built on that chassis would have no bag, no stats, no talents, no
level-ups, no powerups, no jump and no quest participation. What the companion
system _does_ prove is that the step pipeline tolerates multiple friendly actors
and the renderer already draws them through the shared paper-doll, gait and
blood-soak passes. That is a precedent for the render layer, not an
architecture for players.

### 4.2 Per-player phases — the deepest rework

`GamePhase` has **19 members**. `playing` is live; `cutscene` and `dying` run
their own reduced passes; the **other 16 halt the simulation outright** via
`step()`'s early return on `state.phase !== "playing"`.

Eleven of those are per-player UI that must stop freezing the world: `paused`,
`levelup`, `respec`, `inventory`, `map`, `questLog`, `shop`, `quest`,
`dialogue`, `choice`, `companion`. D2 explicitly wants one player shopping while
another fights.

The genuinely shared ones (a boss's arrival dialogue, the spare-or-kill
`choice`) need a group protocol — vote, first-to-answer, or host decides.
`levelup` is the sharpest: today the run _pauses_ until `allocateStat` is
called, and in co-op it cannot, which changes how leveling feels for everyone.

### 4.3 The three D2 fixtures this game has never had

**There is no town.** D2's whole social loop is town ↔ wilderness: meet,
vendor, stash, regroup, chat, portal out together. This game has no hub — the
merchant _wanders the field_, discovered by proximity — and no safe place to
stand. "Start a game, people join" has nowhere to land. The fix is a **hub
level**: a `LevelDef` with no spawners, the merchant parked, quest givers
present, and level select as a set of portals. This is authored content in the
existing `content/levels/<id>.yaml` format, and safe/quiet zones already exist.
Not engine work.

**Death ends the run, and there is no corpse.** `enterDeathScene` →
`phase = "dying"` → `defeat`; softcore takes the 10% XP toll
(`BALANCE.deathXpLoss`), hardcore latches `Character.dead`. D2 drops your gear
on a corpse and respawns you in town. Here nothing survives — and critically,
`dying` and `defeat` are **global phases**, so one death would end the game for
all eight. Needs per-player death, a body where you fell, hub respawn, and
either corpse recovery or a softened penalty.

**No stash, no trading.** Half of D2 co-op is trade. There is an inventory and a
lost-and-found vault (`items/vault.ts`), but no shared stash and no
player-to-player transfer. `Equipment` is plain JSON that already round-trips
through storage and cloud save, so the data side is easy; the trade window with
both-accept confirmation and the anti-dupe rules on an authoritative server are
the work.

### 4.4 Chat

Small, and worth building early because it is the feature that makes the rest
feel like D2 at all. `PixelText` plus the `.pixel-input` widget in
`NewGame.tsx` gives the field — and that widget already carries the hard-won iOS
predictive-text handling documented in `pwa/src/game/hero-name.ts`, which is not
work anyone wants to redo. Add a scrollback overlay, a slash-command parser and
server routing.

---

## 5. Replication design

A `Player` serializes to ~1,281 bytes, so eight is ~10 KB — nothing. But most of
it is **private**: `inventory`, `vault`, `stats`, `spentStats`, `talents`,
`coins`.

Split the record:

- **Public slice, to everyone** — `pos`, `z`, `hp`/`maxHp`, `facing`,
  `faceLeft`, `moving`, worn equipment (for rendering), weapon cooldown.
- **Full record, to its owner only.**

This is simultaneously a bandwidth win, a privacy win, and the anti-cheat
boundary: a client that never receives another player's bag cannot manipulate
it.

Clients predict their own hero and interpolate everyone else. Steering is
pointer-hold and combat is 60 Hz auto-fire, so naive round-trip input would show
visible movement lag — prediction and reconciliation are not optional polish
here, they are what decides whether the mode feels good.

---

## 6. New rules to decide

**XP sharing.** `grantXp` currently pays one hero. D2 splits XP among nearby
party members weighted by level, and that rule is what decides whether a level
12 friend can meaningfully play with a level 60 character. New engine code, not
a refactor.

**Loot ownership.** `dropItem` puts items into `state.items` with no owner
field, so **free-for-all is the free default** — which is D2 classic, and
probably the authentic choice. Allocated or personal loot means adding an owner
to `Item` and filtering pickup: cheap, but decide it deliberately rather than
inheriting it by accident.

**Party balance.** `/players N` covers the horde. It does not cover the menace
meter, which escalates off _the player's_ rolling DPS and kill rate through a
clearance gate and an evolution ratchet (`src/game/menace.ts`). Eight heroes
feed a meter designed for one. `BALANCE.menaceGain` and `menaceClearance` are
the levers; the tuning pass is real work, but `scripts/simulate-run.mjs` and the
autopilot mean it can be measured rather than guessed.

---

## 7. Build order

Ordered so each step is useful on its own and the hard one happens while
everything around it is stable.

1. **Utility-process server inside the desktop build, running the existing
   `step()` with a single player.** The host's own renderer becomes its first
   client, over loopback, before any networking exists at all — which proves the
   Node build target, the bridge and the replication with nothing to debug but
   your own machine. Changes zero game code. Add Steam networking and the lobby
   list only once that plays identically to today.
2. **Chat, `/players N`, and slash commands.** Feels like D2 immediately,
   touches almost nothing.
3. **`state.players[]` and per-player phases.** The mountain. Do it against a
   stable server and a working chat.
4. **Town hub, per-player death and corpses, party travel between levels.**
5. **Stash and trading.**

A 4-player alpha on one map with chat and `/players` is reachable at the end of
step 2 plus a first cut of step 3.

---

## 8. Effort

| Phase                                                    | Estimate |
| -------------------------------------------------------- | -------: |
| `state.player` → `players[]` + per-player phases         |  5–7 wks |
| Node build target for the engine, shipped in the binary  |    2 wks |
| Utility-process server, Steam lobby list, join/leave     |  3–4 wks |
| Replication, delta encoding, prediction + reconciliation |  4–6 wks |
| Chat, `/players`, slash commands                         |  1–2 wks |
| Town hub level, portals, party travel                    |  2–3 wks |
| Per-player death, corpse, respawn                        |    2 wks |
| Stash + trade window                                     |  2–3 wks |
| Party HUD, shared quest tracker, spectate                |  2–3 wks |
| Tuning passes, ops, anti-cheat, client/server versioning |  3–4 wks |

**Roughly six months to something shippable.**

---

## 9. Things that are not engineering problems

- **The game is offline-first by identity, and hosting from the binary keeps it
  that way.** `game.config.json`'s own FAQ says "There is no sign-up, no login
  and no server of ours" and "it plays with the network off". A hosted dedicated
  server would make both lines false and the marketing copy would have to be
  rewritten. A listen server inside the binary does not: two people on a LAN with
  no internet can still play, and there is still no server of ours. This is the
  strongest argument for the topology in §3, over and above the cost.
- **Server cost is the other one.** The game is bought once on Steam (no coin
  store there at all) and the mobile coin store is IAP, so there is no recurring
  revenue to fund hosting 8-player games indefinitely. Hosting from the binary
  reduces that to nothing. If a browser-hosted path is wanted later, the only
  thing that must be paid for is a small WebRTC signalling service — bytes for
  the handshake, not the game traffic.
- **The shipped platform integrations assume one local authoritative run:**
  cloud-save merge (grow-only per-device coin ledgers), the one-way Game Center
  and Steam achievement mirror, and the leaderboards. Each needs a rule for what
  a co-op run contributes. Achievements in particular: the ledger is the truth
  and the platform is a copy, so the question is whether a party kill counts for
  everyone.
- **`PolyForm-Noncommercial-1.0.0`** is on every engine source file. Worth
  confirming what that means for hosted play before shipping it.
