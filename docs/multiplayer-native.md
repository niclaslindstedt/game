<!-- SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 -->

# Multiplayer on the phone — what a native build could do, and what it would cost

`docs/multiplayer.md` is the shipped mode: a listen server inside the desktop
binary, two doors (Steam P2P and direct UDP), and a page that reads snapshots
off a `MessagePort`. This file answers a different question — **could the
App Store / Play Store build take part, and could that be sold as an in-app
purchase** — and it is an EVALUATION rather than a record: nothing described
here is built.

The short answer is at the top because the rest is detail:

| Ask                                | Verdict                                                                                               |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **JOIN** a desktop-hosted session  | **Yes, and cheaper than expected** — the page can do it with no native module at all (see below)      |
| **HOST** from a phone, on cellular | **No.** Not "hard" — three independent blockers, and carrier NAT is only the first                    |
| **HOST** from a phone, on Wi-Fi    | Possible, LAN only, and it costs more than joining does for a mode almost nobody would reach          |
| **Gate it behind an IAP**          | Yes — a non-consumable, and the store bridge needs a second product type plus a RESTORE flow it lacks |
| **QR to carry the join address**   | Yes, and the good version needs no camera permission on the phone at all                              |

**The recommendation is the one the question already suspected: ship JOIN,
don't ship HOST.** But the reason to skip hosting is NOT mainly the network —
it is that an iOS app is suspended when it goes to the background, so a hosted
session ends when its host takes a phone call.

## What the phone already has, and what it doesn't

Four facts settle most of the design, and all four are checkable in the tree
rather than assumed:

- **The net bridge is closed to the phone BY GATE, not by absence.**
  `netBridgeAvailable()` (`pwa/src/app/net-bridge.ts`) is
  `shellAvailable() && shellPlatform() === "steam" && shellCapability("multiplayer")`.
  The Expo shell answers the same `postToShell` channel as Electron
  (`shell-bridge.ts`); what it does not have is the second, non-JSON channel —
  `__gisShell.onNetPort` — because a WebView shell has no session process to
  hand a `MessagePort` from.
- **The CLIENT is already browser code.** `server/client.ts` is what turns
  snapshots back into a run, it is reached from the page as `@game/client`, and
  its whole world is `ClientTransport` — `send(ArrayBuffer)`, `onFrame`,
  `close`. It has never known whether the session is one process away or one
  continent, which is exactly the property a third pipe needs.
- **Almost none of the server is Node-shaped.** Only four files in `server/`
  import a Node builtin: `net/udp.ts` (`node:dgram`, `node:os`),
  `net/upnp.ts` (the same plus `node:fs`), `main.ts` (`node:dns`) and
  `dedicated.ts` (`node:fs`). The session, the world loop, the crossing, the
  hub, the chat room, the reliability layer, the joiner's `net/connect.ts` and
  every `wire/*` leaf are plain TypeScript that runs in a browser context. The
  simulation is not what stops a phone hosting; the SOCKET is.
- **The transport seam already takes a third implementation.**
  `server/net/transport.ts` is polled, packet-shaped and explicit about
  reliability precisely because the narrower of the two existing paths (Steam's
  legacy P2P) forces it. Anything that can carry opaque packets between keyed
  peers satisfies it.

## JOINING — the cheap path is a WebSocket, and it is cheap

**A page cannot open a UDP socket, but it can open a WebSocket, and the native
shell serves the game over `http://127.0.0.1:9006`** (`native/src/local-server.ts`)
— an insecure origin, so `ws://1.2.3.4:27016` is not mixed content the way it
would be from the deployed `https://` site. That one fact is what makes a
phone joiner a page-side feature rather than a shell feature.

What it would take:

- **A `ws` transport on the HOST** (`server/net/ws.ts`, new) satisfying
  `Transport`. TCP, so it adds NO reliability layer — the same call the Steam
  path makes, and for the same reason: layering a reliable protocol over a
  reliable protocol makes a bad connection worse. `Transport.id` grows `"ws"`;
  `MAX_CLIENTS` and everything above it are untouched. `server/package.json`
  declares no runtime dependencies and `tests/content/server_deps_test.ts`
  proves it, so this is either a hand-rolled RFC 6455 server over `node:http`
  (the handshake is a SHA-1 of one header; the frame reader is masking plus
  two length forms) or the first declared dependency the ship target has ever
  had. Hand-rolled is ~250 lines and keeps the manifest empty.
- **A page-side link.** `server/net/connect.ts` — `createJoinLink` — is
  import-clean (wire leaves only) and would run IN THE PAGE over a browser
  `WebSocket` dressed as a `Transport`, with its `deliver` feeding the very
  `ClientTransport` `createNetClient` already takes. Both halves of that are
  small; what is not free is the ALIAS work: the page reaches `server/` only
  through `@game/wire/*` and `@game/client`, and a new entry point means the
  four config maps, `scripts/game-alias-loader.mjs` and
  `tests/content/net_reachability_test.ts` (six copies, per `AGENTS.md`).
- **A gate that is no longer "are we Steam".** `netBridgeAvailable()` splits
  into a HOST question and a JOIN question; the title menu's MULTIPLAYER row
  and `use-sessions.ts` read whichever applies. The three doors stay on the
  startup path and stay import-free — a WebSocket join is a RUN, and the run
  driver that builds it is already behind a lazy chunk.

**What it does NOT need is the interesting part**: no native module, no Expo
config plugin, no prebuild change, no new bridge protocol, no second process on
the phone, and nothing in `native/src/` except the invite plumbing the QR
section below wants anyway.

Two costs it does carry:

- **Head-of-line blocking.** Snapshots go unreliable on both existing
  transports on purpose — a delta is coded against the client's ACKNOWLEDGED
  baseline, so a lost one costs a frame of smoothness and can never desync.
  Over TCP a lost packet stalls every snapshot behind it instead of dropping
  one. On a good connection that is invisible; on a lossy cellular link it is
  rubber-banding that the UDP path would not have. Prediction
  (`server/client-predict.ts`) already covers the local hero, so the player's
  own movement stays honest through it — which is what makes this an acceptable
  v1 rather than a wrong answer.
- **App Transport Security.** ATS governs WebKit loads, so `ws://` to an
  arbitrary IP from the WebView needs `NSAllowsArbitraryLoads` (or a narrower
  exception) in `app.config.js`'s `infoPlist`, with the standard justification
  at review: the app connects to user-supplied hosts by address, which cannot
  carry a certificate. It is a routine exception for this class of app and
  still a review risk worth pricing in. **A native UDP module would sidestep it
  entirely** — ATS does not govern raw BSD sockets — which is the one real
  argument for the more expensive path.

**The alternative, for completeness.** A native UDP module
(`react-native-udp`, or a small Expo module) plus frames relayed over the
WebView message channel would reuse `server/net/udp.ts`'s reliability layer and
keep the wire identical to the desktop's. It costs a native module, a prebuild
plugin, and — the part that decides it — every snapshot crossing the RN↔WebView
bridge as a base64 STRING, twenty times a second. At the measured 8.15 KB per
publish that is ~220 KB/s of string marshalling in each direction on the phone's
JS thread, for a path whose only advantage is packet loss behaviour. Do the
WebSocket first; keep this as the answer if loss turns out to matter.

## HOSTING — three blockers, and the network is the least of them

1. **THE APP IS SUSPENDED WHEN IT LEAVES THE FOREGROUND.** iOS gives a
   backgrounded app seconds, not minutes, and none of the background modes
   covers "keep simulating a game for my friends"; Android's Doze and
   background-execution limits need a foreground service with a permanent
   notification to come close. A host that dies when its player answers a call,
   opens a message, or locks the screen is not a host — and the seven other
   people lose the run, because the session IS the authority.
2. **CARRIER NAT.** Mobile networks put subscribers behind CGNAT (RFC 6598),
   where there is no inbound path and nothing to ask: `server/net/upnp.ts` maps a
   port on a HOME router, and a carrier-grade NAT answers neither NAT-PMP nor
   UPnP-IGD. An IPv6-only carrier with 464XLAT does hand out a globally routable
   address, but inbound is normally firewalled and the other end must have IPv6
   too. A relay would fix it and is refused for a stated reason: the game's
   identity claim is that it talks to nobody, and there is no service to run.
3. **THERE IS NO LISTENING SOCKET IN A WEBVIEW.** The session itself would run
   fine in a Web Worker — the whole loop is Node-free, as measured above — but
   something has to accept connections, and that is a native TCP/UDP listener
   plus the same bridge-marshalling cost as above, now multiplied by the number
   of clients.

**A LAN-only host is the only version that works**: same Wi-Fi, no router
mapping, no CGNAT, and the QR below makes the address painless. It still owes
blocker 1 (a foreground-only host, which on a couch is survivable), iOS's Local
Network permission (`NSLocalNetworkUsageDescription`) and the native listener.
That is a large piece of work for "two people in the same room, one of whom is
not on the desktop build", and it is the right thing to defer rather than the
wrong thing to want.

**So: phones JOIN, desktops HOST.** That is also the honest thing to print in
the store listing, and the JOIN screens already word a refusal well enough that
a phone with no host to reach is not a mystery.

## The QR code

The good design puts NO camera in the app.

**The desktop draws the QR; the phone scans it with the system Camera app,
which opens a universal link into the game.** The phone needs no camera
permission, no scanner UI and no `expo-camera` — and the arriving link is
exactly the shape `electron/src/net-invite.ts` already handles for
`--connect <addr>`: parked until the page is up, delivered as the net bridge's
one unsolicited event, consumed so a reload does not re-join. The native shell's
half is `expo-linking` plus the `adastrail` scheme that `app.config.js` already
declares; the better version is a universal link on the game's own origin
(`https://game.niclaslindstedt.se/join?…`), which GitHub Pages can serve the
`apple-app-site-association` and `assetlinks.json` for, and which degrades to a
web page explaining the game for anybody who scans it without the app.

Where it is drawn is already settled by a rule this mode learned once: **the
live rows belong to the PAUSE screen** (`game-screen/SessionPanel.tsx`), not to
the HOST screen, because the bound port, the address a friend should type and
what the router said are facts about a RUNNING session and there is no session
until the run starts. The QR is one more such fact and belongs beside them.

What goes in it:

- The address the joiner should use, which is **the external one when the
  router mapping succeeded and the LAN one otherwise** — the host knows both
  and the phone cannot work it out. Encoding both and letting the joiner try
  each in turn is strictly better and costs one more field.
- The protocol and build, so a doomed join is refused on the phone before it
  spends six seconds probing (the JOIN screens already do this reasoning with
  `refuseHandshake` on what the challenge volunteered).
- **Not the password, by default.** A QR is a bearer credential that anybody in
  the room can photograph; offer it as a deliberate toggle, worded as one.

The encoder itself is a few KB of pure JS emitting an SVG. It sits with the
session panel, i.e. inside the run, and must not drift onto the startup path —
the 200 KB critical-path budget is measured, not advisory.

## The in-app purchase

The coin store's shape carries most of this, and the gap is precise: **every
existing product is a CONSUMABLE, and a multiplayer unlock is not.**

- **The product.** One non-consumable (iOS) / one-time product (Play), e.g.
  `multiplayer_unlock`, created in App Store Connect and Play Console beside the
  five coin packs listed in `native/README.md`.
- **The native half needs two things it does not have.**
  `native/src/store-purchases.ts` finishes every transaction with
  `isConsumable: true`, which is wrong for an unlock, and it has no restore path
  at all. Both are small: a product `type` on the catalog entry so `finish`
  passes the right flag, and `getAvailablePurchases()` on connection init so a
  reinstall or a second device recovers the entitlement. **Apple requires a
  restore mechanism** (guideline 3.1.1) — a RESTORE PURCHASES row in the STORE
  screen, not merely a silent query.
- **The entitlement's home.** The coin bank's discipline is the model to copy
  and not to re-invent: a per-device grow-only counter set that merges without
  conflict, carried by cloud save, with a persisted ledger of transaction keys
  so redelivery is harmless (`pwa/src/game/store.ts`). An unlock is simpler — a
  boolean — but it wants the same two properties: **the platform is the
  authority** (restore is what survives a wipe) and **a cached local copy is
  what makes it work offline**, which is most of what this game is.
- **Where the gate goes.** Three places, and they are the same three the Steam
  gate uses today: the title menu's MULTIPLAYER row (present but leading to the
  BUY door rather than hidden — a missing row reads as a broken build), the
  JOIN-capability predicate that replaces `netBridgeAvailable()`, and the join
  driver, which must refuse rather than degrade exactly as `createNetDriver`
  does.
- **The free-mode discipline already exists and should be used.** Payment is
  only demanded when `EXPO_PUBLIC_STORE_PAYMENTS=required`, which only the
  `production` EAS profile sets; every dev, preview and TestFlight build grants
  packs free through the identical bridge, ledger and credit path. A multiplayer
  unlock inherits that for nothing, which is what makes it testable without a
  sandbox account.
- **The parental switch.** `native/plugins/with-settings-bundle.js` draws the
  iOS Settings page whose two switches (MATURE CONTENT, COIN STORE) outrank
  every in-game setting. Online play with strangers is exactly the kind of thing
  that belongs there — a third switch, ON by default like the others, and
  remembering the trap: iOS does not copy `DefaultValue` into `UserDefaults`, so
  an absent key must read as ON.

## What the store review will ask about, and the two things that could sink it

Gating a feature behind a non-consumable is ordinary and allowed. The rest of
the surface is where the risk actually is:

- **CHAT IS USER-GENERATED CONTENT.** `server/chat-room.ts` moves free text
  between strangers, and App Store guideline 1.2 wants a filter, a way to report
  content, a way to block a user, and published contact info before it ships in
  a native build. The cheapest honest answer for v1 is to not send free text
  from the mobile build at all — the slash commands are a closed list already —
  and to add the reporting surface when free chat follows.
- **The age rating changes.** "Users interact" / online multiplayer has to be
  declared, and it moves the rating regardless of what the game's own content
  does.
- **ATS**, above, if the WebSocket path is taken.
- **Local Network permission**, if a LAN host or LAN discovery ever follows.

And two things that are not policy at all:

**THE BUILD LOCKSTEP PROBLEM IS THE LARGEST RISK IN THIS WHOLE EVALUATION.**
`refuseHandshake` compares `engineVersion` for EXACT equality, and it is right
to: the client SIMULATES the static tier for itself from `SessionParams`
(`createRunFromParams`), so any change to the engine or the compiled catalogs
makes two builds disagree about the world rather than about a number. Steam
takes a patch the moment it is pushed; an App Store build waits on review and
then on the player updating. So every desktop patch would lock every phone out
of every session until the mobile build catches up, and the refusal a player
reads — ONE OF YOU NEEDS TO UPDATE — would be permanently true for somebody.
Three ways out, in increasing order of honesty: hold desktop releases for the
mobile build (release trains); narrow the check from the version string to a
DETERMINISM STAMP (a hash of the engine plus the generated catalogs) so a
mobile-only or cosmetic patch does not lock anyone out; or accept the skew and
say so in the store copy. The middle one is real work and is the one worth
doing if this ships.

**AND THE DATA BILL IS NOT SMALL.** The measured publish is 8.15 KB on a
135-mob field at 20 Hz — about 160 KB/s, ~1.3 Mbit/s, **roughly 0.6 GB per
hour** per client. There is no spatial or interest culling in this replication
by design (a snapshot is the whole world minus the seat's private withholdings),
so that figure is the floor rather than a peak. On a home Wi-Fi it is nothing;
on a metered cellular plan it is a complaint. The codec's own header already
anticipates the fix — the payload is JSON, and swapping in a packer touches two
functions — and a mobile joiner is the first caller that makes it worth
measuring.

## The licence question, which is a decision rather than a finding

Multiplayer is currently licensed through Steam and nowhere else, and the hub
enforces it per join: `licensedTransport` admits `transport.id === "steam"`
unless whatever BUILT the host said otherwise (`server/licence.ts`, folded to
`false` in the ship target). In practice a Steam depot build stamps
`licensed: true`, passes `allowDirect`, and therefore already admits the direct
path — so a phone joining a Steam host is not blocked by the host's side of
this.

What it does need is a sentence in the licence: **the multiplayer right travels
with the Steam copy AND with an App Store / Play copy that bought the unlock.**
The IAP is the mobile licence. Note the honest limit while writing it, because
it is the same limit the existing lock has: nothing here validates a receipt
(that would need a server the game refuses to run), so the gate is what the
mobile build enforces on itself. That is a statement of what the licence
permits, not a wall — which is exactly what `server/licence.ts` already says
about its own escape.

## What it would cost

Phase A — **JOIN, gated by an IAP, with the QR** — is the whole recommendation:

| Piece                                                                | Rough size                 |
| -------------------------------------------------------------------- | -------------------------- |
| `server/net/ws.ts` + its suite (a lossy-link test, a fuzz pass)      | ~250 + ~150 lines          |
| Page-side WS transport + join link glue + the six alias copies       | ~200 lines                 |
| Splitting the host/join gate, menu rows, JOIN screen wiring          | ~200 lines                 |
| Deep-link invite in the Expo shell (`expo-linking`, AASA/assetlinks) | ~120 lines + hosting files |
| The QR on `SessionPanel` (encoder + address choice)                  | ~150 lines                 |
| Non-consumable + restore in the store bridge, both halves            | ~250 lines                 |
| The entitlement store and its cloud-save carry                       | ~200 lines                 |
| The Settings-bundle switch and its policy read                       | ~60 lines                  |
| Docs, changelog, store listing copy                                  | —                          |

Call it 1,500–2,000 lines across four to six focused sessions, plus the
store-side setup (one product, one review cycle, an age-rating change) and
whatever the chat decision costs. The acceptances that need a human with
hardware are the same shape as the five already listed at the foot of
`docs/multiplayer.md`: a real phone joining a real desktop host over a real
carrier, on each OS.

Phase B — **LAN hosting from a phone** — is a native listener module, a worker
harness for the session, foreground-lifetime handling and its own acceptance
matrix, for a mode reachable only by people in the same room. Three to four
times phase A's work, and the recommendation is not to build it until somebody
asks for it twice.
