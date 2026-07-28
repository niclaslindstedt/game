# Agent guidance for game

This file is the canonical source of truth for AI coding agents working in this
repo. `CLAUDE.md`, `.cursorrules`, `.windsurfrules`, `GEMINI.md`,
`.aider.conf.md`, and `.github/copilot-instructions.md` are symlinks to this
file.

## OSS Spec conformance

This repository adheres to [`OSS_SPEC.md`](OSS_SPEC.md), a prescriptive
specification for open source project layout, documentation, automation, and
governance. A copy of the spec lives at the repository root so contributors and
AI agents can consult it without leaving the repo; its version is recorded in
the YAML front matter at the top of the file.

Run `oss-spec validate .` to verify conformance. When in doubt about a layout,
naming, or workflow decision, consult the relevant section of `OSS_SPEC.md` —
it is the source of truth for the conventions this repo follows.

## Leave the tree cleaner than you found it

- **Fix every error and warning you encounter, even ones you didn't cause.**
  A `make lint` / `make test` / typecheck run that surfaces a pre-existing
  error or warning (a generator's `!` warning included) is part of your job:
  fix it in the same session rather than working around it or reporting it as
  "not mine". The repo's baseline is zero errors and zero warnings — anything
  above zero hides the next real regression.
- **Fix inefficient algorithms on sight.** If, while doing any task, you spot
  code with a needlessly bad complexity or a hot-path pattern that clearly
  wastes work (an O(n²) scan a hash/grid would collapse, per-call
  recomputation of an invariant, per-frame allocation in a loop that runs at
  60 Hz), fix it — even when it's unrelated to what you were asked to do.
  Keep such fixes behavior-preserving, verify with the relevant tests or a
  quick benchmark, and mention them in the PR description.

## Build and test commands

```sh
make build         # developer build
make test          # full test suite
make lint          # zero-warning linter
make fmt           # format in place
make fmt-check     # verify formatting (CI)
make assets        # regenerate in-game pixel assets + previews
make sim-bench     # benchmark the headless simulator (best-of-N, digest-checked)
make bump          # print the release bump derived from .changes/unreleased/
make changelog VERSION=X.Y.Z  # preview a release's CHANGELOG section
```

The native wrapper in `native/` is **not** part of the npm workspace, so the root
package.json forwards to it with `npm --prefix native`:

```sh
npm run dev                 # website dev server (http://localhost:5173)
npm run native:install      # install native/ dependencies (its own tree)
npm run native:bundle       # build the site + pack it into native/assets/webroot.zip
npm run native:ios          # build & run the native app on an iOS simulator
npm run native:ios:device   # Release build on a USB iPhone (standalone, no Metro)
npm run ios:debug           # Debug build on a USB iPhone (JS from Metro over USB)
npm run native:android      # build & run on an Android emulator/device
npm run native              # just the Expo dev server (native/ already installed)
```

The `native:ios*` scripts run `expo prebuild --platform ios` first, so a change to
`native/app.config.js` (orientation, Info.plist keys, plugins) always re-syncs into
the gitignored native project instead of shipping a stale one.

## Commit and PR conventions

- All commits follow [Conventional Commits](https://www.conventionalcommits.org/).
- PRs are squash-merged; the **PR title** becomes the single commit on `main`,
  so it must follow conventional-commit format.
- Breaking changes use `<type>!:` or a `BREAKING CHANGE:` footer.
- **Do not babysit PRs — but do fix what breaks.** Once a PR is opened, write
  out its URL and a short summary of what was done, then stop. Don't
  proactively subscribe to PR activity, poll CI, or schedule check-ins, and
  leave code review and the merge decision to a human.
  - **Never call the PR-activity subscription tools** — in particular don't
    `unsubscribe_pr_activity`. If the harness auto-subscribes the session,
    leave the subscription alone: every such tool call burns tokens and delays
    the human review that is the whole point of opening the PR.
  - **Act on the events that subscription delivers when they're actionable:**
    if a CI failure or a merge conflict arrives for the PR and you can fix it,
    push the fix. Leave everything else (review comments, questions, style
    nits) to the human — don't auto-push follow-up fixes for those. Only
    otherwise return to a PR when explicitly asked.

## Changelog fragments

Every PR that changes something user-visible must add a changeset fragment
under `.changes/unreleased/` — CI's `changeset` job enforces it (label the
PR `no-changelog` to opt out for pure refactors/CI/docs changes; files in
`tests/`, `docs/`, `scripts/`, `.github/`, etc. are skip-listed anyway).

```
.changes/unreleased/$(date +%s)-short-slug.md

---
type: Added         # Added | Changed | Fixed | Removed | Security | Deprecated
title: Short title  # optional — bolded at the head of the changelog bullet
breaking: true      # optional — forces a major version bump
---

One-sentence user-facing summary.
```

At release time `release.yml` (manual dispatch) derives the semver bump
from the fragments (`breaking` → major, Added/Changed/Removed/Deprecated →
minor, Fixed/Security → patch), collates them into `CHANGELOG.md`, updates
every version string via `scripts/update-versions.sh`, tags, publishes a
GitHub Release, and deploys. Preview locally with `make bump` (shows the
derived bump) and `make changelog VERSION=X.Y.Z` (consumes fragments —
revert afterwards).

## Architecture summary

This is a **webapp-kind project (OSS_SPEC §11.4/§11.5): the deployed website
IS the game** — an offline top-down survival scroller shooter, steered by
holding pointer/touch, where the character acts autonomously according to
picked-up weapons and items.

**THE ENGINE HAS TWO ENTRY POINTS, and picking the wrong one is a silent
regression.** `@game/core` (`src/index.ts`) is the whole public API,
simulation included. `@game/menu` (`src/menu.ts`) is the narrow slice the app's
STARTUP path may reach: the catalogs (levels, difficulties, equipment), the
saved-hero math, and the engine flags the settings screen applies — and nothing
that simulates. **The app shell imports `@game/menu`; the game imports
`@game/core`.** Because an import is an import: the title menu wants a level's
NAME, and one module graph away sit `createGame`, the step pipeline, the
autopilot, the loot roller, the spawners and the enemy catalog. Tree-shaking
does not save you — it is global, so an export used by ANY chunk keeps its
bytes wherever its module was placed, and the module was on the startup path.
Both aliases resolve to the SAME modules (one definition of everything; nothing
duplicated in the bundle — `tests/content/menu_entry_test.ts` pins that), so
the split is purely about REACHABILITY. Two patterns keep it workable, and both
are the right move when a new one is needed: the engine's runtime toggles live
in the import-free leaf `src/game/flags.ts` (a settings screen must not import
the dialogue system to mute it), and the compiled content is emitted in
menu-facing and run-facing halves (`generated/level-index.ts` beside
`generated/levels.ts`; `generated/items.ts` beside `generated/uniques.ts`),
read through `defs/levels/summary.ts`. `pwa/scripts/check-seo.mjs` polices the
result as a **170 KB gzipped critical-path budget** — web.dev's
performance-budget figure for a ~5 s time-to-interactive on a slow 3G phone.
When it trips, find what reached back through `@game/core` (or make that screen
lazy); do NOT raise the number.

**Mobile-first, landscape.** The reference device is a phone held
horizontally: a ~844×390 CSS viewport (≈422×195 world units at the app's
`VIEW_SCALE` of 2). Design every element — HUD, overlays, spawn distances,
weapon ranges, anything sized against "the screen" — to fit and feel right
at that size. Run playtests and visual checks at this viewport (the playtest
harness defaults to it), not at a desktop size.

Large screens render the whole presentation at **2× the phone baseline** so
the phone-tuned HUD, text, and sprites stay legible instead of shrinking:
`viewScaleFor` (render.ts) doubles the world zoom, and a `min-width/height:
700px` media query doubles the root font-size (styles.css) so the rem-sized
DOM UI — PixelText canvases included — scales in lockstep. Keep the two
breakpoints in sync (`UI_SCALE_BREAKPOINT_PX`). A desktop still never sees
_less_ moon than the phone; it just sees it at phone-sized zoom rather than
zoomed out.

Three layers, one dependency direction (each depends only on the ones above it):

- **`src/` — the engine.** Framework-free TypeScript: the simulation
  (steering, jumping, combat, XP/stats, mana/spellcasting, loot, inventory) plus the content
  catalogs under `src/game/defs/` (levels, enemies, equipment — content is
  data, referenced by id). It must stay importable
  from any renderer; no React, no DOM assumptions beyond what a browser
  provides. `src/output.ts` is the central output module (§19.4) — all
  diagnostic output routes through it; raw `console.*` elsewhere fails lint.
- **`pwa/` — the app.** A Vite + React 19 PWA shell that mounts the
  engine (imported via the `@game/core` alias → `../src/index.ts`), renders
  it, and owns everything deploy-shaped: the service worker build
  (`pwa/pwa-plugin.ts`), manifest, icons, SEO surfaces, and the update
  toast. The app depends on the engine; the engine never imports from the
  app.
- **`native/` — the native store wrapper.** A thin Expo / React Native shell whose
  entire content is a full-screen WebView, so the App Store / Play Store build
  looks and plays exactly like the website. It bundles the built site inside
  itself (`assets/webroot.zip`, a gitignored build artifact from
  `npm run native:bundle`) and serves it from a local HTTP server on a fixed port,
  and adds the things a browser can't give iOS: Taptic haptics (via a
  `navigator.vibrate` polyfill the engine's existing driver feature-detects),
  an audio session that plays through the ringer switch, the coin store's
  in-app purchases (StoreKit / Play Billing via expo-iap; the title menu's
  STORE row exists only in native builds — see `pwa/src/game/store.ts` and
  `native/src/store-purchases.ts`), and **CLOUD SAVE** (below). It has **its own
  dependency tree** — it is not an npm workspace member — so it needs its own
  `npm install` (`npm run native:install`). It reads the game like any browser
  would; no engine or pwa code is native-specific. See `native/README.md`.

**CLOUD SAVE — the roster and the paid coin bank belong to the PLAYER, not to
a device.** Native builds only (a browser has no platform cloud, so every entry
point is a no-op there). It carries the whole roster, the undistributed coin
bank, and the hardcore score board through iCloud key-value storage, with Game
Center naming the player; SETTINGS → DATA → CLOUD SAVE shows the state and syncs
on demand, and it syncs on its own at launch, on foreground changes, on the
cloud's change notification, and after a purchase. Two rules govern every change
here:

1. **A merge must never have to make a judgement call about money.** The bank is
   NOT a stored number — it is a set of grow-only per-device counters
   (`CoinLedger` in `pwa/src/game/store.ts`) whose sum IS the balance, so
   merging is a per-device max: commutative, idempotent, and incapable of
   losing a purchase. Heroes merge one at a time on an `updatedAt` stamp that
   `saveCharacters` writes ONLY for the heroes a save actually changed (rewrite
   that and a stale device starts winning merges with data it never touched);
   deletions travel as tombstones; the score board is a union. Payload equality
   is judged on canonical JSON (`@ui/lib/canonical-json.ts`) so two devices
   can't push the same save back and forth forever.
2. **The native side must stay dumb.** `native/src/cloud-save.ts` moves ONE
   opaque string in and out of a `CloudProvider` (`native/src/cloud-provider.ts`
   — five methods, no game concepts). The whole payload and merge live in
   `pwa/src/game/cloud-save.ts` over `pwa/src/app/cloud-bridge.ts`, mirroring
   the coin store's bridge. **Google Play support is therefore one new file**
   (`cloud-play-games.ts`: Saved Games snapshots + Play Games sign-in) returned
   from `cloudProvider()` — no protocol, web, or merge change. iOS's provider is
   backed by a local Expo module (`native/modules/cloud-save/`, Swift:
   `NSUbiquitousKeyValueStore`); its entitlements come from
   `native/app.config.js` and need iCloud (key-value) + Game Center enabled on
   the App ID (`EXPO_PUBLIC_CLOUD_SAVE=off` drops them for a local build).

**GAME CENTER — the badges also live on the player's PROFILE, and the mirror
runs ONE WAY.** Native builds only, on the exact same three-file seam as cloud
save: `native/src/achievements.ts` (bridge) over `achievements-provider.ts`
(seam) and `achievements-gamecenter.ts` (Apple), backed by
`native/modules/game-center/` (Swift: `GKLocalPlayer` + `GKAchievement`), talked
to from `pwa/src/app/achievements-bridge.ts`. Game Center authentication is a
single global thing, so that module is its ONE owner in the app — cloud save
asks it for the player's name (`native/src/game-center.ts` memoizes the sign-in)
rather than authenticating a second time. Four rules:

1. **The game's ledger is the truth; the platform is a copy.** Nothing is ever
   read back — a platform that disagreed could otherwise grant a badge the game
   never awarded, and the shelf, the toast and the point total would all have to
   answer for it. That one-way rule is what makes the sync trivial: both
   platforms keep the highest percentage they've seen for an id, so a report is
   idempotent, a failure is just retried, and nothing can un-earn a badge.
2. **The list is CURATED, because the platforms cap it.** Game Center allows a
   game 100 achievements and 1,000 points TOTAL; the game ships 226 badges. So
   `pwa/src/game/platform-achievements.ts` drops the two families that read as a
   set rather than a brag — the 131 per-unique `unique_*` badges and the nine
   `equip_*` onboarding nudges, each already rolled up by a ladder that does
   travel (`uniques_*`, `outfit_full`) — leaving 86 with headroom for the next
   badge. Point values are APPORTIONED from the badges' own tiers rather than
   typed, because the budget is fixed while the catalog grows.
3. **A badge only exists once it is in the portal.** The list is generated and
   COMMITTED (`native/store/game-center-achievements.json`, via
   `scripts/game-center-achievements.mjs`), so a catalog change diffs into the
   exact rows to create in App Store Connect; the suite fails when it drifts.
   The badge id IS the Game Center id — but Play Console GENERATES its ids,
   which is why `platformId` lives on the native provider rather than the web
   side, and why Play support stays one new file.
4. **Restraint is the web side's job.** `achievement-sync.ts` reports a ladder
   only when it crosses a 5-point step (a run must not put a network call behind
   every kill), debounces a burst into one round trip with a ceiling on the wait,
   remembers what was delivered ACROSS LAUNCHES, and leaves a refused batch
   pending. The game's own toast stays the only celebration — the system banner
   is suppressed (`showsCompletionBanner = false`).

**LEADERBOARDS — the game's own board ranks the player against THEMSELVES; the
platform's ranks them against everyone.** The achievements' twin, on the same
seam again (`native/src/leaderboards.ts` → `leaderboards-provider.ts` →
`leaderboards-gamecenter.ts`, talked to from `pwa/src/app/scores-bridge.ts`),
sharing the same module and the same memoized sign-in — so **Play support is one
new file** for this too. It ships **no board UI at all**: HIGH SCORES → WORLD
RANKINGS opens Game Center's own board, because the ranking, the player's rank,
their friends and the time scopes are the platform's to draw. Four rules:

1. **Every board must be UNCAPPED.** A ranking of something with a ceiling
   (highest hero level, relics recovered, trophy points) fills up with players
   tied at the top and stops ranking anything — the first hundred to finish
   share first place and nobody after them can move. The five boards are the
   hardest single blow ever landed, lifetime kills, the best kill rate SUSTAINED
   across a full ten minutes of combat clock, and the longest survival / most
   kills in a hardcore JESUS campaign.
2. **Nothing is tracked FOR a board.** Every value is a record the game already
   keeps for itself — the lifetime ledger (`achievement-totals.ts`) and the
   hardcore campaign book (`highscores.ts`) — read by `game/leaderboards.ts`. A
   leaderboard is a second READER of the player's own records, never a second
   bookkeeper, so no ranking can disagree with what the game already shows the
   player. The one new counter, `bestKillRate`, is a lifetime total like any
   other; its rolling window (`kill-rate.ts`) is bucketed rather than a list of
   kill timestamps, and reads the farm-proof COMBAT clock so a cleared field
   can't dilute a rate.
3. **A board only exists once it is in the portal, and its FORMAT must match the
   game's SCALE.** A platform score is one Int64, so a rate goes out ×100 and a
   duration in whole seconds; if App Store Connect's score format disagrees,
   every score on that board is silently wrong by a factor of a hundred. So the
   format is the one authored knob and the scale is DERIVED from it
   (`FORMAT_SCALE` in `pwa/src/game/platform-leaderboards.ts`), and the portal
   list is generated and COMMITTED (`native/store/game-center-leaderboards.json`
   via `scripts/game-center-leaderboards.mjs`) with the suite failing on drift.
   The board key IS the Game Center id; Play generates its own, hence
   `platformId` on the native provider.
4. **The declaring half and the reading half are separate files, and the KEYS
   are separate again.** `platform-leaderboards.ts` is pure data (a build script
   and a test import it, so it must not reach the ledger); `leaderboards.ts`
   does the reading; and the keys sit in `app/scores-bridge.ts` because the HIGH
   SCORES screen is on the app's STARTUP path — a WORLD RANKINGS button that
   reached the catalog would drag `@game/core` into the 170 KB critical-path
   budget for every player who never opens a board.

Device-shaped state is deliberately NOT synced: settings, key bindings, the
active-hero selection, and the parked run.

Deployment is three GitHub Pages slots on one origin (the `siteUrl` in
`game.config.json`, a custom domain on the GitHub Pages origin): `/` serves
the highest
`v*` tag (or `main` before the first release), `/preview/` serves every
`main` push, `/branch/` serves a manually parked branch persisted in
the `branch-deploy` orphan branch. `.github/workflows/pages.yml` builds all
slots into a single Pages artifact; each slot gets its own service worker and
a disjoint precache cache id (`pwa/src/app/pwa.ts`).

## GENERATED MAPS — the mission as a recipe, carved per run

A hand-authored mission pins its boss on a known rock and threads an intended
`path` to it, so the second run of a map is a commute. **GENERATED MAPS** (a
developer flag, off by default) instead carves the mission's geometry fresh from
a **v2 BLUEPRINT** — `content/maps/<id>.yaml` — every run, so the boss has to be
FOUND. That is the whole feature: no `path` is emitted, which silences the app's
guidance arrow (`nextPathWaypoint` answers null without one), and the fog-of-war
minimap becomes the only record of where you have been.

**A blueprint is a RECIPE, not a layout.** It carries only what the carving
needs: a purpose-typed **object palette**, an **area palette** saying what kinds
of place the map is made of, the horde's breeds and the depths they hold, three
sizes, and the compass regions the boss may be hiding in. Everything else about
the mission — name, story, intro, cutscenes, loot pools, merchant persona,
hazards, thought pins, travel gates — is **INHERITED** from the level it names, so
the story lives in exactly one place and a generated THE MOON is still the moon.
Like a level YAML it names **ramps** rather than per-difficulty numbers, expanded
against `content/ladder.yaml` by the same shared reader
(`scripts/level-data/ladder.mjs`), so a `savage` knot means the same mob level on
a generated map as on the authored one.

**Objects are typed by PURPOSE, never by position** (`wall`, `obstacle`, `cover`,
`crate`, `chest`, `decor`, `landmark`, `building`). The type is what lets the
generator place a thing without being told where — a `chest` belongs at the end
of a dead end, `decor` may land anywhere — so adding a purpose means teaching
`generate.ts` where that purpose goes, never adding a free-form sprite list.
Counts come from a **density** (per 1,000,000 world px²) rather than a number,
because a blueprint is carved at three sizes and a fixed count leaves LARGE bare.

**AREAS are the rule engine, and WALLS ARE DERIVED FROM THEM.** Every carved cell
is assigned an area, and the barrier between two cells falls out of the PAIR:
nothing at all between two open plains, a wide gate into a yard, a solid wall with
one doorway into a compound — built from the owning area's own material, so one
map fences its plains with rubble and seals its domes with panel. An area also
decides which props scatter there (`MapObject.areas` → a `within` restriction on
the emitted scatter line), how thick the horde stands, whether the cell may hold
the boss or the hero's landing, its own floor, an entrance `apron` of hard
standing just inside its doorways, and — via `shellOf` — whether it is a BAND
wrapped around another area rather than a district of its own (Mars's outer dome
around its inner terrarium).

Two decisions in the geometry are load-bearing and easy to undo by accident:

- **Walls are emitted per BORDER, not per split line.** A split line spans a whole
  ancestor rectangle and knows nothing about which cells ended up either side of
  it, so emitting from split lines produces stubs jutting into open floor and
  doorways jammed against corners. A border knows exactly which two cells it
  separates, so its wall is as long as those cells are adjacent and its doorway
  sits in the MIDDLE of it.
- **Districts are grown from SEEDS, not by inheriting from neighbours.** An
  inherit-with-probability walk COMPOUNDS — whichever type it rolled first
  swallows the map, and a palette weighted 4:3:2 comes out as one biome with a
  couple of freckles. Seeding decouples the knobs: `layout.cluster` controls how
  BIG a district is, the weights control WHICH districts appear.

A ridge is rubble, so a wall material may name a **sprite pool** and a **wander**
(`LevelDef.walls`): each stone picks its own sprite and the chain drifts off true,
as a bounded random walk tapered to nothing at both ends — so it still SEALS and
still meets the wall it joins. Both are drawn from the level's own wall rng
stream, so a map that asks for neither lays out byte-identically to before.

Three more rules shape what the districts CONTAIN:

- **`once` makes a district singular.** Weights cannot say "there is A town": low
  odds give runs with none, high odds give runs with five, and either way the map
  reads as suburbs. A `once` area is withdrawn from the palette the first time it
  wins a seed, so eastworld grows exactly one town in a rolled corner of a big
  empty country — and finding it is worth something.
- **`blocks` lays a MAIN STREET.** What makes a town read as a town is alignment,
  not density: two rows of frontages facing each other across a lane. An area with
  `blocks: <street width>` walks its `building` palette down both sides of its
  cell's long axis instead of scattering it (`streetBlock` in `place.ts`).
- **A `lair` is a house somebody is in.** Every other pinned elite stands in the
  open, which is why they all feel the same — the hero sees the duel coming two
  rooms out. A `lair` object gives the elite a STRUCTURE and a door with a shut
  frame and an open one; the mob stays off the field until the hero walks up, then
  the door bangs open and it comes out to greet him (`src/game/lairs.ts`,
  `LevelDef.lairs`, modelled on placed packs). A lair names the `areas` it belongs
  in and the elite is re-homed into a cell of that kind, so the marshal's house is
  on the street rather than alone in the desert.

**THE ENDING IS NOT ON THE MAP: the ELEVATOR and the ANNEX.** The search worked,
but its last stretch did not — the fog-of-war minimap fills in as the hero walks,
and a walled compound with a doorway is SHAPED like the end of a mission, so the
player read the answer off the minimap a district or two early. An **annex**
(`MapAnnex`) fixes it by putting the boss somewhere the floor plan does not reach:
a sealed room in a band of its own past the carved rectangle, with no border to any
cell, so nothing adjoins it and the minimap has nothing at all to show where it is
until the hero has stood in it. The only way in is an **elevator** pad
(`LevelDef.elevators`, `src/game/elevator.ts`) standing in the carved cell the
boss's compass regions picked — so the last thing to FIND is the way to the boss,
and it could be in any of thirty rooms. Two details carry it: the annex joins the
grid as a real chamber with an EMPTY neighbour list (so every dressing pass treats
it as the district it is, with no special cases — only the wall pass knows, and
gives it a sealed box), and `widthFrac` sizes it off the map so the band it costs
stays mostly room at all three sizes. Eastworld ends in the buried ZAI CONTROL
ROOM; the bunker's vault is below its floor, because you do not walk to a vault.

**FAUNA is the canopy's twin on the ground plane.** A level whose only moving
things are trying to kill the hero reads as an arena with a texture on it; a field
with cattle standing in it was a field before he arrived — and on a map built
around SEARCHING that matters, because the player is looking at a lot of ground he
has no fight in. `LevelDef.fauna` places critters; the wander is a closed-form
function of the render clock (two incommensurate sines per axis — a Lissajous path
that never repeats), so a herd of forty costs the simulation nothing, cannot desync
a replay, and is not an actor: it collides with nothing, cannot be hurt, and never
blocks a shot.

**THE RUN READS ITS OWN MAP — `runLevelDef(state)`, never `levelDef(state.level.id)`.**
`createGame` resolves the level once, but a run keeps ASKING the level questions
for as long as it lasts: where the path goes, which zones suppress spawns, whose
lair this door is, where the exit stands, whether this map streams waves. Every
one of those used to go back to the CATALOG — i.e. to the hand-authored map — so
a carved run was answered with another map's geometry: no-spawn zones drawn
around rooms that were never carved, a guidance arrow to a landmark that does not
exist, lair doors that never opened (their elites, dialogue and drops absent from
the run entirely), and the bunker streaming the authored wave budget the carve
had deliberately dropped. The carve travels on the state (`GameState.carvedLevel`)
and `runLevelDef` is the ONE accessor; the rule is flat — inside a run, nothing
reads the catalog for its own level.

**THE LANDING IS QUIET, NOT SAFE — and the opening beat's cast lands with the
hero.** A SAFE zone does not merely keep the horde from spawning in it, it REPELS
every minion out and holds them at its edge, so one centred on the hero is a
bubble he can stand in untouched all run. It also froze spacez_hq's opening beat
solid: `openingStrike` is a two-parter held in order by `after` (the hero reads
the crowd, THEN the lone rusher breaks from the pack and its harmless touch draws
his blade), and the rusher was shoved straight back out of the pad it was placed
in. A QUIET zone gives the breather the landing wants — no ambient horde placed
in it — without the wall; no hand-authored map spends a safe zone on its landing,
they spend them on the trader's stall. The gate's other half is distance: the
carve pins a few of the `firstSightThoughts` breed the `after` thought names
around the landing, inside that pin's own radius, because a crowd carved a
district away leaves the gate shut and the hero walking the map holstered.

**THE HORDE IS A DENSITY, and it is priced over the floor that may HOLD it.** One
knot per CELL is a count wearing a density's clothes: the carve grows its cells
with the map, so the horde thinned out exactly as the search got longer —
measured, 0.8–1.2 spawn points per million px² against the authored campaign's
1.6–3.8, which played as "no mobs on the map, just the elites and the boss".
`KNOT_DENSITY` (generate.ts) is the map's allowance in knots per million px², and
it is spread over the cells that may hold a horde rather than over the map,
because a third of the floor is quiet by design (the boss's cell, the caches, the
trader's) and pricing it per cell hands that third back as emptiness. A cell takes
as many knots as its floor is worth, cut into bands along its long axis so a hall
gets a fight at either end; the first keeps the cell's plain `k<id>` name for an
elite's `alarms` link. The horde's DEPTH axis is rescaled the same way — over the
knot-bearing cells, not the carve — or the deepest ramps of the ladder (and the
breed authored for `[0.8, 1]`) are never reached, because the deepest cells are
precisely the quiet ones.

Where the code lives: `src/game/mapgen/` (`types.ts` the blueprint shape,
`regions.ts` the compass grammar, `areas.ts` the area rules, `rooms.ts` the carve
and the borders, `place.ts` the dressing, `generate.ts` the decisions,
`index.ts` the registry and `resolveLevelDef` — the ONE seam `createGame` hangs
off). The compile step is `scripts/generate-maps.mjs` + `asset-tools/map-schema.mjs`

- `map-data/load-yaml.mjs`, emitting the gitignored
  `src/generated/map-blueprints.ts`. `tests/content/generated_maps_test.ts` is the
  guard: it holds every generated def to the SAME `validateLevel` the build runs
  over hand-authored levels, and asserts the objective, every cache and every placed
  item stay reachable using the engine's OWN `buildNavGrid`/`findPath` — a check
  that is only meaningful if the grid and the def come from the same carve, so it
  sets the flag and the size before building the run.

**Nothing outside a run may import `mapgen/`.** The menus reach levels through
`defs/levels/summary.ts`; pulling the generator onto the startup path would put
the whole level catalog and the carve in the app's critical-path budget.

LOOK at a generated map rather than reading its JSON: `node
scripts/level-render.mjs <id> --generated --size large --seed 3 --dormant` draws
it with the real sprites and the real horde standing in it, and
`scripts/map-layout.mjs <id> --generated` gives the schematic with con colours.

## Developer menu (hidden)

The title screen hides a **DEVELOPER menu** behind **seven quick taps on the
sun** (`SUN_TAPS`, `TAP_WINDOW_MS` — 0.9 s between taps — in
`pwa/src/game/title-screen/use-sun-charge.ts`): the seventh detonates the sun and
latches `developerUnlocked` in the persisted settings
(`pwa/src/game/settings.ts`), after which the gesture disarms. The BUILD-UP is
half the secret: `sunChargeIntensity` maps the taps banked so far onto one 0..1
`--sun-charge` (registered with `@property` so it TWEENS, which is what makes the
charge swell in and ebb back out), and each layer in `styles.css` ramps off it
with its OWN threshold — tap 1 shows nothing at all, tap 2 is a breath of extra
glare, and only from tap 3 does the star plainly throw fire, shake and burn
hotter. Stop tapping and the burst lapses. The gesture is a plain **window
listener that hit-tests the press against the sun's rect** — not a button on the
sun: the sun is decoration the sky driver sizes and places each frame, and a
transparent target parked over it would swallow presses meant for whatever menu
row sits under it (a press on any real control is ignored outright).
`TitleBackdrop.tsx` owns the charge layers and plays the blast off its `detonate`
prop, reporting back when it's done. Every piece of the blast rests at
`opacity: 0` — they are all animation-driven, so a frame that paints one without
its animation applied would dump an opaque disc (or a white screen) over the
menu. The blast is anchored on the sun's STATIC seat (`SUN_X`/`SUN_Y` in
`title-sky.ts`, mirrored by `.sun-boom` in `styles.css` — keep the two in step)
rather than a per-frame custom property: writing one onto the shared parent
dirties the style of every node under it, sixty times a second. The detonation
does nothing else — the player then opens SETTINGS on their own,
where a **DEVELOPER** row now appears (it stays available across launches once
unlocked). That screen offers **SELECT LEVEL** (the warp picker: pick any
difficulty and mission regardless of unlock state, skipping the intro), **VIEW
ARSENAL** (`ArsenalScreen.tsx` — a
scrollable gallery of every unique/legendary item, ordered by ilvl, each minted
via `mintUnique` and drawn through the shared `ItemCard.tsx` icon + card the
inventory tooltip reuses so the two never drift), **VIEW EFFECTS** (the EFFECTS
GALLERY — see below), a **BALANCE** subpage (see
below), a **DEBUG MODE** toggle
(`debug: "on" | "off"`, also persisted), a **FORCE STORE** switch
(`storeForce`, persisted — surfaces the coin store in any build with packs
granted FREE; see `pwa/src/game/store.ts`), a **GENERATED MAPS** switch
(`generatedMaps`, persisted — carves every mission from its blueprint instead of
loading its hand-drawn layout; see **GENERATED MAPS** above) with a **MAP SIZE**
row beside it while it is on (`generatedMapSize`: SMALL/MEDIUM/LARGE/RANDOM), and
a feature flag. DEBUG MODE
shows the in-run FPS meter (`GameScreen.tsx` `showFps`, written to the DOM by
the render loop — the first probe for performance regressions) and is the hook
further developer diagnostics wire to via `getSettings().debug`. Keep it
distinct from the `?debug` URL param (console verbosity, `window.__game` /
`window.__scenario`, and the same FPS meter forced on — see
`docs/configuration.md`).

**NONE OF IT SHIPS IN THE STORE BUILD — and "does not ship" means the code is
gone, not hidden.** The reveal, the whole DEVELOPER tree, and the commit hash
beside the version in the title footer are gated on `__DEV_TOOLS__`, a
build-time literal `pwa/vite.config.ts` sets from `VITE_DEV_TOOLS`. It is TRUE
everywhere a human might want the tooling — the website, the installed PWA, the
`/preview/` and `/branch/` slots, local dev, and the native `preview` and
`testflight` apps — and FALSE for exactly one build: the `production` EAS
profile, the binary uploaded to the App Store / Play Store, whose embedded site
`native/scripts/bundle-web.mjs` builds with `VITE_DEV_TOOLS=off`. Because the
flag folds to a literal, Rollup drops `menus-developer.ts` and the arsenal /
effects-gallery chunks out of that bundle entirely. So a NEW developer surface
must hang off an entry point that is already gated (a DEVELOPER row, a screen in
`buildMenu`) or take its own `__DEV_TOOLS__ &&` guard — and a new persisted
developer SETTING must be reset in `stripDeveloperState` (`settings.ts`), which
scrubs the developer-owned settings on load so a TestFlight tester's unlocked
menu, FORCE STORE, or BALANCE multipliers can't survive into the store build on
the same device.

The **EFFECTS GALLERY** (`pwa/src/game/effects-gallery/`, also reachable at
`?effects[=<id>]`) is the FX iteration loop's front door: every visual effect the
game ships, one per screen, each staged as a REAL fullscreen game situation and
replayed on a loop — browse with the side buttons / ←→ (↑↓ jump a whole shelf),
narrow the catalog with the search box, a tap on the field (or `Enter`) runs the
show again, **`S` (or the SPEED chip) steps the diorama down through `1X` →
`1/8X` SLOW MOTION** (it scales SIM time, so the effect and the loop's own
show/replay rhythm stretch together — the only way to judge a burst that is over
in a fifth of a second), `H` hides the gallery's chrome for a clean look. Nothing is parked
in the middle of the frame — an effect detonates on the hero, so a button there
would be watched through. Two rules keep it honest. **The staging is the
engine's own scenario system**: an exhibit is a `ScenarioSpec` (the display-case
fields `reveal` / `muteDialogue` / `noVictory` / `runAbilities` exist for it), so
adding one is data, not a harness. **The firing goes through the engine EVENT
stream**: an exhibit pushes the same `GameEvent` a real fight would and the run's
own consumers (`applyEventFx`, the full-screen CSS bursts, the sfx bus) draw it —
so an exhibit can never drift from what ships, the way the ARSENAL reads items
through the in-game `ItemCard`. The MELEE, SHOTS and TALENTS shelves are
GENERATED from `weapon-fx.ts` and the talent catalog (`weapon-exhibits.ts`,
`talent-exhibits.ts`), so a new signature weapon or talent appears in the gallery
on the next build; `tests/content/effects_gallery_test.ts` fails the build when
one doesn't, when an exhibit's icon is missing from the atlas, or when it stages
an id that no longer exists. `pwa/scripts/effects-gallery.mjs` drives the same
deep link (`?effects=<id>&speed=…`) to write a numbered contact sheet of the
whole catalog: `--strip N` spreads N frames evenly across an exhibit's own show
(a filmstrip of the WHOLE effect rather than two moments of it), `--speed`
shoots it in slow motion, and every run composites into a single `sheet.png` —
a row per exhibit, frames left to right — which is what a review actually
reads.

The **BALANCE** subpage holds ~10 runtime balance multipliers (leveling pace,
mob strength, loot percentages, …) so the game's balance can be probed without
editing `src/game/config/` and rebuilding. The engine side is
`src/game/tuning.ts` (`setBalanceTuning`, neutral 1 defaults — except the world's
shipped PACE, which the HERO SPEED / MOB SPEED pair carries at 0.8 so TEMPO stays
a free lever at 1 — values clamped to
`[0, 100]`); each knob is applied at the ONE read site that owns its rule
(`grantXp`, `weaponDamageFor`, `spawnEnemy`, the drop ladder, `rollTier`,
`menaceSensitivity`, …), so it moves every surface of that rule together. Each
row is a **slider** (drag, tap the track, or steer with ←/→) spanning **0×
(system off) to 100×** the engine's authored value, where **1× is that value** —
never a percentage. The track is exponential: its four quarters cover 0→1, 1→2, 2→10,
10→100, so the useful low end gets most of the travel. The mapping
(`sliderToBalance`/`balanceToSlider`), the snap grid, the `×` readout, and the
knob catalog (labels, blurbs) live in `pwa/src/game/balance-knobs.ts`; the
drag track is the shared `@ui/lib/PixelSlider.tsx`. The values persist in the
settings (`balance` in `settings.ts`, applied on load like the other engine
flags) and a RESET ALL row restores the shipped 1× tuning. Keep the page around
ten knobs — one lever per system, not a config editor.

**Settings controls share three reusable pixel widgets** (generic React/UI, in
`pwa/src/lib/`, imported via `@ui/lib/*` for eventual extraction to
oss-framework): `PixelSlider.tsx` — the 0..1 drag track used by every slidable
row (the BALANCE knobs and the SOUND music/SFX volumes); `PixelToggle.tsx` — a
pixel ON/OFF switch drawn as the slider frozen at its two ends (same amber track

- blocky knob; off is empty/knob-left, on is filled/knob-right) used by every
  row that reads as a straight on/off (DEBUG MODE, AUTO LEVEL STATS, VIBRATION,
  XP ON KILL); and `PixelCheckbox.tsx` — a pixel
  tick-box (an empty grey square that fills with a smaller amber square when
  checked) used by every **multi-select** row where one picks one of MANY rather
  than flipping a setting (the EXPORT CHARACTER roster picker). The control (and
  a label-cycling `value`/`binding`) renders in `.menu-item-control` — a direct
  flex child of the row button, `margin-left: auto` to a shared right edge and
  vertically **centred across the whole row**, so a two-line row (the EXPORT
  picker, whose per-hero "LV 34 - SOFTCORE" is a `MenuEntry.subtitle`, not a
  blurb) centres the tick-box between both lines. All three widgets are
  presentational; the title menu wires them up via a `MenuEntry`'s
  `slider`/`toggle`/`check`/`value` field (`pwa/src/game/title-screen/` —
  `menu-model.ts` defines the row shape, the `menus-*.ts` builders fill the
  screens, `MenuList.tsx` renders the rows, and `TitleScreen.tsx` orchestrates),
  and the arrow keys steer the focused row's control (←/→). Pick the widget by meaning: a **switch** for a straight
  on/off setting, a **tick-box** for a pick-one-of-many list. Two-mode rows that
  are NOT on/off (MOUSE follow/hold, POWERUPS on-pickup/manual, QUICK BARS
  left/right corner) stay label-cycling buttons — a switch implies
  enabled/disabled, which those don't. AUTO-EQUIP does read as enabled/disabled
  (wear stronger finds at once, or leave them in the bag), so it's a switch.

**The menu's selection cursor is pointer-type-dependent.** A mouse hovers, so it
keeps the **wisp** sprite riding the highlighted row (Doom's skull cursor). A
touch device hovers nothing — the wisp would just linger wherever the last tap
landed, leaving a column of rows that reads as flat text — so it drops the wisp
and gives each **navigation** row its OWN hovering icon instead
(`MenuEntry.icon`, a sprite name from the atlas: the main menu, the PLAY
submenu, the SETTINGS index, and every BACK row). The icons bob like the wisp
does, each at its own rate and phase (`bobStyle` in `MenuList.tsx`, off the same
row-id hash the store's coins spin off), and each is drawn in its row LABEL's
color — grey until the row is selected, then amber — by `spriteMonoUrl`
(`assets.ts`) over `monochromeDataUrl` (`@ui/lib/atlas.ts`), which re-hues a
sprite while keeping its brightness, so the icon stays shaded art instead of
collapsing to a silhouette the way the pixel font's flat `source-in` tint
would. Both live in the same slot at the same
width, and a row without an icon still renders it empty, so the labels line up
identically either way; the swap itself is pure CSS (`(any-pointer: fine)` on
`.menu-icon` / `.menu-cursor`), so plugging a mouse into a tablet switches them
live. New icons are authored like any sprite — `content/sprites/icons/`, see the
`pixel-assets` skill — and an existing item icon is fair game when one already
fits (HIGH SCORES wears `icon_trophy`, STORE `icon_coins`).

**WHEN a row lights up is pointer-type-dependent too, and a highlighted row
GLOWS.** The highlight (amber label, lit icon, and an amber `drop-shadow` on the
label — `.menu-item.selected .menu-label`) marks the row the input is ON. A mouse
hovers and the arrow keys step, so both leave it resting where they left it. A
TOUCH has neither: `pointerenter` fires on a tap too, so a tapped row used to
stay lit as a stale cursor parked wherever the last finger landed. On touch the
highlight now follows the PRESS — lit while the finger is down, released with it
— with ONE exception: a row that carries help text AND is a control (`latches` in
`MenuList.tsx` — a switch, slider, tick-box, bound key, or cycled value) keeps
it, because the help line below has to name whose help it is showing and the
state the player just changed. A row that merely opens another menu explains
nothing once the finger is gone, so it doesn't latch. The press is tracked by row
ID, not index (a press that changes screens unmounts its row before release), and
released on a WINDOW `pointerup` for that same reason. That amber glow is the
selection's alone: the STORE row and the coin packs (`MenuEntry.shiny`) used to
breathe one permanently, which said "store" where the menu needs it to say "this
is the row you're on" — their treasure look is the struck metal and its
travelling glint (`PixelShinyText`), not light around the words.

**Every sub-screen leads with its own name, not with the brand.** Off the main
menu the title logo shrinks and dims to a watermark (`.title-header.sub`) and
the screen's **page header** (`MenuHeading.tsx`, fed by `screenHeading` in
`menus.ts`) takes over: the leaf name drawn LARGE and bright, the path to it
(`ScreenHeading.trail`) small and dim on the same baseline beside it
(`SETTINGS » CONTROLS`, using the font's own `»` glyph), and a rule underneath
that fades out at both ends to close the header off from the rows. The title's
scale is MEASURED, not fixed — `fitScale` steps it down until
`font.measure(title) × scale × uiScale` fits a share of the viewport, which is
what lets a long title (`CHOOSE YOUR NIGHTMARE`) share one rule with a short one
(`SOUND`) without either overflowing a phone or looking timid on a desktop.
Colour is a `HeadingTone`, not a per-screen hex: `player` and `dev` both print a
bone-white title (the tone shows in the trail and the rule — amber, mint) so
**amber stays the selection's alone**; only the coin vault's `store` tone gilds
the title itself. The sub-screens also lay a soft dark wash over the sky
(`.title-plate`, z-index 13 — above every orbiting body and the sun glare, below
the menu column, `pointer-events: none` so the hidden sun gesture still
hit-tests) because the sky drives the sun straight through the middle of the
viewport, which is exactly where a settings column's text sits. The main menu
keeps its undimmed logo, tagline and clean hero sky.

The **SETTINGS tree** (`SETTINGS_TREE` in
`pwa/src/game/title-screen/menu-model.ts` — controls,
keybindings, display, sound, data, export, developer, balance, seed, and the BOT
VIEW `botspeed` step; NOT the `settings` index itself, which is a nav menu)
renders as a **stable form** so changing a setting never reflows the page: the
menu takes a **fixed width** (`.title-menu.settings-menu`) so a cycled value or a
live `×`/`%` readout can't resize the block and shift the right-aligned controls
(a value row that isn't fixed-width gets its control shoved off the right edge
past a long inline blurb — the bug that put `botspeed` in the tree), and each
row's help `blurb` is hoisted OUT of the row to a single **bottom help line**
(`.menu-help`, a reserved-height slot showing the focused row's blurb) so
toggling a setting can't change a row's height or push the rows below it. Off the
settings tree the menus stay content-width with the blurb inline under each row
(difficulty taglines, per-level status, the main/play nav menus) — but a subtitle
that would just repeat one line on every row (the warp / BOT VIEW difficulty and
level pickers, whose heading already says the mode) is dropped, and the
`settings` index is a plain list of destinations with no subtitles.

**A settings row's help describes the state the setting is IN — never both
states at once.** "ON WEARS STRONGER FINDS AT ONCE - OFF KEEPS THEM IN THE BAG"
makes the player pick their own half out of a table on a line that's already
wrapping; "STRONGER FINDS GO ON THE MOMENT YOU GRAB THEM" (flipping to
"STRONGER FINDS WAIT IN THE BAG UNTIL YOU WEAR THEM") just tells them what the
game does right now. So `onOffRow` takes a `StateBlurb` — `{ on, off }`, one
line per state (a bare string only for the rare row that reads the same either
way) — and a label-cycling row (MOUSE, POWERUPS, QUICK BARS, ITEM CARDS,
MINIMAP, GAME SPEED) picks its blurb off the current value the same way.
Keep each line a single short statement in the present tense; the value column
already names the mode, so the help says what that mode DOES. **The help line
wraps at a fixed SHARE of the viewport** — `useHelpWrapRem`
(`use-title-layout.ts`), 80%, converted through the ACTIVE root font-size so the
one share holds across the 2× regime — never a fixed rem cap: a cap wide enough
to keep a desktop's help on one line ran a portrait phone's help wall to wall.
The tail of a wrapped line centres under the line above it (`PixelText`'s
`align="center"`), and `.menu-help`'s reserved height already fits two lines, so
folding one never moves the rows.

The AUTO LEVEL STATS flag gates a recently-added system so it can be toggled at
runtime — **opt-in, off by default** (the app applies the off state on load); a
developer turns it on from the DEVELOPER menu:

- **AUTO LEVEL STATS** (`autoLevelStats: "on" | "off"`) gates the automatic
  per-level base-stat growth (`src/game/leveling.ts`). The app applies it to
  the engine via `setAutoStatGainsEnabled` from `settings.ts` (mirroring how
  audio/haptics are applied). Off makes `autoGainAt` return 0, which cascades
  through `baseStatBonus`, `levelStatGains`, and `autoPowerScale` — so the
  hero's free gains AND the horde's compensating hp scale (menace.ts) switch
  off together and the balance stays whole. It gates simulation, so it needs an
  engine-side setter; a pwa-only flag would leave the engine unaware.

**EVERYTHING ON THE FIELD CARRIES ITSELF — `render/gait.ts`.** A body that
slides across the floor at a fixed sprite rate reads as a token being dragged,
so every actor the renderer draws (the hero, the horde, the companions, the
merchant, the fauna) is animated by HOW IT MOVES. Two things make it work:

- **The walk is driven by GROUND COVERED, not by the clock.** The stride phase
  advances by `distance / STRIDE_PX`, measured frame to frame, so the tip and
  the two-frame walk sprite BOTH keep pace with the walker for free — a nudged
  stick creeps, a full push runs, a hero wedged against a wall stops walking on
  the spot — with no notion anywhere of how fast anything is supposed to be
  going. A walk is a soft tip about the FEET plus a rise on each step, and the
  two peak together, because they are the same moment (a body vaults over the
  planted foot) — ONE lean per step, alternating. The tip is SHARPENED (cubed,
  `TILT_SHARPNESS`) so the body stands upright between steps and leans only
  briefly over each one: a plain sine sits near an extreme most of the stride,
  which reads as a slow drunken sway rather than as walking. Standing still, it
  breathes instead, so a mob is visibly alive through its own dialogue.
- **`EnemyDef.locomotion` says which gait.** `legs` (the default) walks;
  `float` HOVERS a few px up on a slow drift over a ground SHADOW — ghosts,
  wisps, drifting cores, anything with no legs; `wheels` does neither, because
  a rover that rocked like a walker reads as a machine pretending to have legs.
  Presentation only, like `gore` — but note `canonicalEnemyDef`
  (`defs/enemies/index.ts`) rebuilds every def through a fixed field list for
  V8 monomorphism, so a new `EnemyDef` field must be added THERE too or it
  silently reads `undefined` with every check still green.

**A JUMP HAS THREE BEATS: takeoff, flight, landing.** The engine's `jump`/`land`
events carry the point, the `impact` (touchdown speed as a fraction of a
standing hop, so a Spring Heels launch lands heavy) and the ground `speed`. The
app answers with SQUASH AND STRETCH on the doll — he stretches off the floor and
folds into the landing (`impactScaleY`, keeping his volume by taking the inverse
scale across) — and with DUST at both ends (`render/dust.ts`): authored puff and
gravel sprites (`dust_puff_0..2`, `ground_grit_0..1`) drawn in neutral greys and
TINTED per landing to the colour of the floor he actually touched, sampled off
the baked ground layer (`groundColorAt`). That last part is the point: the moon
throws pale regolith, Mars rust, a base's deck plate grey — on carved maps and
any venue added later, with nothing authored per level. Impact sizes the cloud;
his ground speed smears it along his heading.

The field hero **always shows and swings his held weapon** — these were the
CHARACTER WEAPON and WEAPON SWING developer flags, now shipped as the default
look (no toggle). Both are pure render concerns:

- **The held weapon draws on the field hero sprite.** `render.ts` passes
  `{ weapon: true }` to `playerDollLayers` (`paper-doll.ts`) so the weapon layer
  rides the paper-doll alongside the worn armor. The HUD avatar and inventory
  portrait draw the weapon too, so every surface agrees.
- **The held weapon animates on each attack** — a blade whips through its slash
  arc, a gun recoils with the muzzle rising, a wand thrusts up on the cast —
  pivoting the weapon layer about the **shoulder** (`paper-doll.ts`
  `WEAPON_SHOULDER`, not the grip) so the whole implied arm sweeps. For a melee
  swing the blade sweeps through its **cone**: it cocks to the cone's start
  edge, whips through the full cone to the end edge, and folds home
  (`weaponPose`), and its **slash is drawn ON the blade** — `drawBladeSlash`
  fills the exact arc the blade carves, anchored to the same `WEAPON_SHOULDER`
  pivot in the doll's own space (via the blade's tip/base points
  `SLASH_REST_TIP`/`SLASH_REST_BASE`), so the effect rides the weapon instead of
  fanning out of the hero's centre. The generic ground `swing` cone
  (`drawEffects`) drops to a faint AoE footprint behind it (still the read for
  companion swings). The cone widens with INTELLIGENCE (`weaponSweepHalfAngle`,
  capped at a half circle — `STATS.aoeMaxHalfAngle`), so a max-INT slash swings
  a full 180° arc; the swing is handed the weapon's cone via `PlayerAction.arc`.
  GameScreen captures the hero's own `swing`/`shot` events into a `PlayerAction`
  (matched to his position so a companion's blow is ignored), and `render.ts`
  `drawPlayer` poses the weapon layer via `weaponPose`.

  **Signature effects (`weapon-fx.ts`).** Each weapon CLASS has a plain base
  look, and a UNIQUE gets its OWN — keyed off the equipped weapon's `uniqueId`
  so a named weapon FEELS more powerful. **Melee** (`SLASH_STYLES` → `SlashStyle`
  → `drawSlash`): a themed slash crescent (core/edge/glow, a `particle` stream,
  `afterimages`) plus a `gore` `burst` (`drawBurst`) thrown over the plain splash
  on the hero's own blows (GameScreen's `heroGore`) — Excalibur flares holy gold,
  Mjölnir spits sparks, Muramasa bleeds. **Ranged/magic** (`SHOT_STYLES` →
  `ShotStyle` → `drawMuzzle` + `drawProjectileTrail`): a themed muzzle flash / cast
  bloom at the tip AND a glow trail riding the hero's round/bolt in flight
  (`render.ts`, gated to the hero's own shots via the projectile's
  `hostile`/`companionId`) — Pyrelight casts fire, Pale Rider fires a deathly
  shot. The hero faces where he MOVES, not where he shoots, so his flash pins to
  the barrel's facing side (the muzzle effect's `faceLeft`) — a shot at a foe
  behind him still fires at the weapon, not off his back. It's all a pwa-side
  catalog (the engine knows nothing of it);
  un-listed weapons keep the plain class look, so the catalog grows one entry at
  a time. Reusable elemental kits (FIRE/HOLY/FROST/STORM/VOID/BLOOD/VENOM for
  slashes; FLAME/HOLY/STORM/COSMIC/FROST/VENOM/DEATH/SOLAR/TECH for shots) cover
  most weapons. The engine's shared `nova` crit-AoE is NOT themed (it carries no
  weapon attribution).

  Tune and author all of it with the `weapon-swing` preview script
  (`pwa/scripts/weapon-swing.mjs`): `poses <weapon>` pins the swing/shot frame
  by frame, `live <weapon>` slows a real attack to show the slash + gore or the
  cast + projectile trail, `uniques` / `shots` render contact sheets of every
  melee slash / ranged-magic muzzle, and the debug `calibration_probe` weapon
  (red tip/base markers) calibrates the blade geometry. It drives the `?debug`
  `window.__swing` (pin the pose/muzzle, optionally
  with a cone) and `window.__timeScale` (slow the run) hooks.

## Reuse through oss-framework

This game builds on
[`@niclaslindstedt/oss-framework`](https://github.com/niclaslindstedt/oss-framework)
(shared React components, hooks, and utilities for local-first PWAs —
storage, PWA update lifecycle, theming, achievements, i18n, …), installed
from GitHub Packages. **Prefer the framework over hand-rolling**:

- Before writing app-level UI or infrastructure (settings storage, update
  prompts, sidebars, achievements, encryption, sync, charts), check whether
  the framework already ships it and use that.
- **Keep generic game code separate, extract to the framework later.** Code
  that is not specific to THIS game (HUD widgets, input handling, game-loop
  utilities, sprite/audio helpers) goes in the dedicated generic areas —
  `src/lib/` for engine-side code, `pwa/src/lib/` for React/UI code —
  never tangled into game-specific modules. Do **not** upstream it into
  oss-framework immediately: publishing a framework release for every
  tweak makes iteration loops far too long. Iterate and playtest it here;
  once the code has matured and playtesting shows it works, extract the
  `lib/` module into oss-framework and swap the imports to the package.
  The clean separation is what keeps that extraction cheap.
- **Always import the generic pools through their aliases** — `@game/lib/*`
  (engine) and `@ui/lib/*` (React/UI), never by relative path. Extraction to
  oss-framework is then a prefix swap (`@game/lib/rng.ts` →
  `@niclaslindstedt/oss-framework/rng`) with no path surgery; keep framework
  subpaths named after the module. The alias maps live in `tsconfig.json`,
  `pwa/tsconfig.json`, `vitest.config.ts`, and `pwa/vite.config.ts`
  — keep all four in lockstep (they also carry `@game/core` and `@game/menu`).
- Installing `@niclaslindstedt/*` packages requires a `GITHUB_PAT` env var
  with `read:packages` (see `.npmrc`); CI falls back to the workflow token.

## Where new code goes

| Change type                                               | Goes in                                                                                                                                                                                     |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Engine/gameplay logic specific to this game               | `src/...` (framework-free TypeScript); exported from `src/index.ts` (`@game/core`) — add to `src/menu.ts` (`@game/menu`) ONLY if the startup path needs it and it drags no simulation along |
| Authored sprite art                                       | `content/sprites/<family>/<id>.yaml` — committed source grids compiled by `make assets`; see the `pixel-assets` skill                                                                       |
| A level (mission)                                         | `content/levels/<id>.yaml` — the YAML source of truth, compiled to `src/generated/levels.ts` by `make levels`; see the `level-design` skill                                                 |
| A GENERATED map (the "v2" blueprint for a mission)        | `content/maps/<id>.yaml` — the RECIPE a mission's geometry is carved from per run, compiled to `src/generated/map-blueprints.ts` by `make levels`; see **GENERATED MAPS** above             |
| The hero level curve (XP per level)                       | `content/leveling.yaml` — per-level XP up to the cap, compiled to `src/generated/leveling.ts` by `make levels`; see the `leveling-balance` skill                                            |
| A powerup (a timed pickup power)                          | `content/powerups.yaml` — the whole catalog in one file (id → power), compiled to `src/generated/powerups.ts` by `make levels`; the campaign introduces TWO NEW POWERS PER MAP              |
| An enemy (minion/elite/boss)                              | `content/enemies/<biome>/<id>.yaml` — one YAML file per mob (stem == id), compiled to `src/generated/enemies.ts` by `make levels`; see the `enemy-design` skill                             |
| An item (weapon/gear/named unique)                        | `content/items/<rarity>/<id>.yaml` — one YAML file per hand-authored item (stem == id, dir == rarity), compiled to `src/generated/items.ts` by `make levels`; see the `weapon-system` skill |
| Item quality / rarity knobs                               | `content/item_quality.yaml` (the make-quality axis) and `content/item_rarity.yaml` (the tier ladder + rarity economy)                                                                       |
| Authored campaign/bot tuning                              | `content/ladder.yaml` and `content/bot.yaml`                                                                                                                                                |
| Generators, analyzers, previews, and maintenance commands | `scripts/...` — executable tooling only; authored game data belongs under `content/`                                                                                                        |
| Generic engine code (usable by any game)                  | `src/lib/...` — imported as `@game/lib/*`; earmarked for extraction to oss-framework once mature                                                                                            |
| App shell, rendering, PWA, game-specific UI               | `pwa/src/...`                                                                                                                                                                               |
| Generic React/UI game components                          | `pwa/src/lib/...` — imported as `@ui/lib/*`; earmarked for extraction to oss-framework once mature                                                                                          |
| A library page's content, look, or wording                | `pwa/scripts/library/...` — the generator; the pages themselves are build output and are NEVER hand-edited                                                                                  |
| Native-only concern (haptics, audio session, store build) | `native/src/...` — the Expo wrapper; never leak app-specific code into `src/` or `pwa/`                                                                                                     |
| Mature, playtested generic code                           | extract into `oss-framework`, then import the package here                                                                                                                                  |
| Tests                                                     | `tests/...` (engine) — name them `*_test.ts`                                                                                                                                                |
| Docs update                                               | `docs/...`                                                                                                                                                                                  |
| Examples                                                  | `examples/...`                                                                                                                                                                              |
| LLM prompt                                                | `prompts/<name>/<major>_<minor>_<patch>.md` (see `prompts/README.md`)                                                                                                                       |

## Test conventions

- **All tests live in separate files** — never inline in source files (no `#[cfg(test)]` blocks, no `if __name__ == "__main__"` test harnesses). This keeps source files free of test scaffolding and lets agents, hooks, and linters treat source and test code differently.
- Test files are named with a `_test` or `_tests` suffix (e.g. `output_test.ts`). The stem must match the pattern `_?[Tt]ests?$` per §20 of `OSS_SPEC.md`.
- Tests live in `tests/` and run with **Vitest** (`make test`, or `npx vitest run tests/engine/game_test.ts` for a single file). The include pattern (`tests/**/*_test.ts`) lives in `vitest.config.ts` — keep it in lockstep with the naming rule.
- **`tests/engine/` vs `tests/content/`.** Engine-rule suites live in `tests/engine/` and run against **synthetic fixtures** (`tests/engine/fixtures.ts`, plain ids like `test_level`/`test_minion`) installed via the engine's `registerDefs` hook — so they survive content deletion. This-game content suites (levels, story, bosses, sprite atlas) live in `tests/content/` and use the shipped catalogs via the root `tests/helpers.ts`; a sequel deletes and rewrites them. Lib tests (`chiptune`, `synth`, `output`, …) stay at the `tests/` root. Rule of thumb: if a test asserts an engine rule, it belongs in `tests/engine/` and must not reference a shipped content id (only `blaster`, the engine's built-in sidearm id, is shared).
- No test-specific setup is needed today; engine tests run in a plain Node environment.

## Source file size

- Non-test source files must stay under **1000 physical lines** (§20.5 of `OSS_SPEC.md`). When a file grows past the limit, prefer splitting by concern (extracting submodules, helpers, or sibling files) over relaxing the cap.
- A file may opt out by placing `oss-spec:allow-large-file: <reason>` in any comment within its first 20 lines. The reason must be non-empty and motivate why the file genuinely cannot be split (generated code, cohesive state machine, third-party snapshot, inherently dense rule catalogue).

## Documentation sync points

| When you change…                                                                   | Update…                                                                                                              |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| game identity (title, domain, …)                                                   | `game.config.json` only — the single source of truth; then `make icons` (OG art)                                     |
| engine public API (`src/index.ts`)                                                 | `docs/architecture.md`, `README.md` Usage                                                                            |
| game content (levels, enemies, story)                                              | `docs/game-content.md` (this game's walkthrough; a sequel replaces it wholesale)                                     |
| a plot beat / the story as a whole                                                 | `docs/story.md` (the gist — top of the chain), then push down (see **Story & dialogue** below)                       |
| story or dialogue text (any line)                                                  | `docs/manuscript.md` — the verbatim script; `docs/story.md` sits above it (see **Story & dialogue** below)           |
| Make targets / npm scripts                                                         | `README.md` Usage, `CONTRIBUTING.md`, this file                                                                      |
| deploy slots / pages workflow                                                      | `docs/architecture.md`, `README.md` Play table, `pwa/pwa-plugin.ts` `DEPLOY_SLOTS`                                   |
| config knobs (env vars, URL params)                                                | `docs/configuration.md`, `README.md` Configuration                                                                   |
| PWA surface (manifest, icons, SW)                                                  | `docs/architecture.md`, regenerate icons via `make icons` and install shots via `make screenshots`                   |
| the shared art look (`STYLE_PREAMBLE`, a family `style:` anchor, the design rules) | `docs/art-style.md` — the house style guide; keep it and `STYLE_PREAMBLE` (`scripts/asset-tools/prompt.mjs`) in step |
| version anywhere                                                                   | never by hand — `scripts/update-versions.sh` owns it                                                                 |

The website must be regenerated whenever source-derived content changes
(§11.2): `pwa/scripts/extract-source-data.mjs` runs on every build and
fails if `src/version.ts` and `package.json` disagree.

## Story & dialogue — a three-tier chain, `story.md` on top

The story lives in a three-tier chain, and changes flow **downward, never up**:

1. [`docs/story.md`](docs/story.md) — **the gist**: the whole plot in prose, in
   narrative order (one paragraph per intro & per cutscene, two per level, every
   elite and boss named). This is the **ground truth**.
2. [`docs/manuscript.md`](docs/manuscript.md) — **the script**: every spoken
   line, monologue, caption, and piece of found lore, transcribed verbatim. An
   extrapolated version of the gist.
3. `src/game/defs/**` — **the game**: the roster, items, cutscenes, and thoughts
   that play the script. An extrapolated version of the manuscript.

When two tiers disagree, the **higher tier wins**: `story.md` beats the
manuscript, the manuscript beats the data — correct the lower tier to match.
Use the **`update-story` skill** (`.agent/skills/update-story/`) to make a story
change at the top and carry it down the whole chain (the manuscript, then the
enemy roster, the story items and uniques, the pinned thoughts, and the
companions — a boss swap re-homes that boss's drops).

**Changing the story is a two-step commitment:**

- If a change you make to the game conflicts with what the manuscript says, the
  manuscript must be updated too — but **only after the user confirms the
  manuscript change**. The user may grant that confirmation ahead of time (e.g.
  "rewrite ARMSTRONG's speech and update the manuscript" pre-approves the
  manuscript edit); otherwise, ask before rewriting it.
- Never silently edit story/dialogue in the data files and leave the manuscript
  stale, and never rewrite the manuscript without that confirmation. A PR that
  touches any dialogue/story text updates `docs/story.md` and
  `docs/manuscript.md` in the same change so the tiers never drift.

**Where the actual story/dialogue data lives** (the manuscript's implementation
— its own "Where the data lives" table is the authoritative map):

- `src/game/defs/cutscenes.ts` — cutscene beats: `caption` and `say` lines (the
  prelude).
- `content/levels/<id>.yaml` — each level's `intro` (the hero's opening
  monologue) and `foes` label (compiled to `src/generated/levels.ts` by
  `make levels`).
- `content/enemies/<biome>/<id>.yaml` — every elite/boss `dialogue` (arrival
  scene) and `lastWords` (spoken on death) (compiled to
  `src/generated/enemies.ts` by `make levels`).
- `src/game/defs/thoughts.ts` — the hero's inner monologues, pinned to a kill via
  a `LevelDef.firstKillThoughts` entry.
- `src/game/defs/story.ts` — `lore` pages on story items (keycards, dossiers,
  recovered hardware).
- `pwa/src/game/copy.ts` — loose UI copy (how-to-play); flavor, not story.
- Brand strings (title, tagline) are **not** story — they live in
  `game.config.json` (see Parity rules below).

The engine that plays these lines is `src/game/story.ts`; the overlays that
render them are `pwa/src/game/overlays/DialogueOverlay.tsx` and `CutsceneOverlay.tsx`.

## Parity / cross-cutting rules

- **Game identity is centralized.** `game.config.json` (repo root) is the one
  source for the title, tagline, description, `siteUrl`, `repoUrl`,
  `storagePrefix`, and `cacheIdPrefix`. App code reads it through
  `pwa/src/identity.ts` (`IDENTITY`, `FULL_TITLE`, `storageKey`); node
  build scripts import the JSON directly; `pwa/index.html` and
  `manifest.webmanifest` are filled/generated from it at build time by
  `pwa/pwa-plugin.ts`. Never re-hardcode a brand string elsewhere.
- `pwa/pwa-plugin.ts` `DEPLOY_SLOTS`, `pwa/src/app/pwa.ts`
  `cacheIdForBase`, and the slot paths in `.github/workflows/pages.yml` must
  agree — a mismatch makes slots clobber each other's precache or serve the
  wrong shell.
- `src/version.ts`, root `package.json`, and `pwa/package.json` versions
  must match; `tests/version_test.ts` and the extract script both enforce it.
- Icons are generated from `pwa/public/icon.svg` only (`make icons`) —
  never edit the PNGs. The OG card is generated the same way (`generate-og.mjs`,
  also part of `make icons`).
- **The manifest's install-prompt screenshots are REAL frames of the running
  game**, captured by `make screenshots`
  (`pwa/scripts/generate-screenshots.mjs`, which drives the build's own
  autopilot in headless Chromium — Playwright installed ephemerally, like the
  playtest harness). They are committed, because the manifest names them by
  path. Never hand-draw or compose one: an install prompt is a promise about
  what the player is about to get, and it is the one image surface where
  marketing art would be a lie. Re-run after an art pass or a HUD change
  (`check-seo` fails the build if a named file is missing, and warns if either
  the `wide` or `narrow` form factor is).
- In-game pixel assets (the sprite atlas, tiles, the UI font atlas) are
  generated from the `content/sprites/` YAML tree (one self-describing
  file per base sprite — see the `pixel-assets` skill) + `asset-tools/` only
  (`make assets`) — never edit the files under
  `pwa/src/game/assets/`. Those files are **gitignored and regenerated
  on every build** (like `src/generated/`, §11.2): `npm run assets` runs
  ahead of `vite`, `tsc`, and `vitest`, so the pixel grids are the sole
  committed source of truth. Never commit `pwa/src/game/assets/` — the
  binary atlas is a build output, not a reviewable artifact.
- **Levels are compiled from YAML**, the same way. `content/levels/<id>.yaml`
  is the source of truth; `make levels` (folded into `make assets`, plus a root
  `pretypecheck`) validates it against the live engine catalogs and generates
  `src/generated/levels.ts` (the gitignored, regenerated-on-build output — never
  edit or commit it), which `src/game/defs/levels/index.ts` reads. The
  per-difficulty × per-map LEVEL LADDER — each map's `[start, end]` mob band +
  intended hero level per rung, PLUS the named DIFFICULTY RAMPS, the hp curves,
  and the three STAMINA ladders — lives in `content/ladder.yaml` (a
  hand-authored, committed source of
  truth like the level YAML, NOT in the level files). The stamina ladders price
  the sprint pool's whole economy per rung — `staminaDrain` (how fast a run
  spends it), `staminaRefill` (SECONDS a standstill breather takes) and
  `staminaEmptyLock` (SECONDS of dead-still a dry pool owes) — each climbing
  with the difficulty and validated as never easing; they compile into
  `DifficultyDef.staminaDrainMult` / `staminaRefillSec` / `staminaEmptyLockSec`
  and are tuned to one target: a build spending about a FIFTH of its stat
  points on STAMINA rides comfortably, one spending none runs dry, and the
  higher the rung the more that costs. A level's spawn points and
  pinned elites/bosses name a neutral, ordered **ramp** (`meek`→`monstrous` wave
  tiers off the band start, `endgame`/`apex` off the band end) and a single base
  `hp`; `loadLevels()` expands each ramp into the four [easy, medium, hard,
  nightmare] `mobLevels` / `level` + `hp` tuples (scaling hp by the map's
  `hpCurves` entry) and stamps `mobLevels` + `intendedLevel` onto every def — so
  the con viz and the engine read one ladder and every difficulty number is tuned
  from that one file. The
  round-trip guard (`tests/content/yaml_roundtrip_test.ts`) pins the compiled
  catalog to `tests/content/fixtures/levels-snapshot.json`; accept an intentional
  level change with `node scripts/update-level-snapshot.mjs`. Read a map's
  authored layout with `make map-layout LEVEL=<id>`
  (`scripts/map-layout.mjs` — a high-res visual overview: coordinate
  grid, walls, numbered path, distinct shapes, and CON CIRCLES for spawns (area
  = count, colour = con vs the YAML's `intendedLevel`); read it alongside the
  YAML), and how it plays with `make map LEVEL=<id>`
  (`scripts/map-preview.mjs` — design/`--actual`/`--heatmap`).
- **The hero level curve is compiled from YAML**, the same way.
  `content/leveling.yaml` authors the XP each level costs (rows annotated with
  their kills-per-level equivalents); `make levels` runs
  `generate-leveling.mjs` first in the chain to validate it (levels 1..98, no
  gaps) and emit `src/generated/leveling.ts`, which the engine's `xpToLevelUp`
  reads. The per-difficulty tier slowdown and the endgame steepening stay
  config knobs applied on top (they power the DEVELOPER → BALANCE sliders).
- **Enemies are compiled from YAML**, the same way. `content/enemies/<biome>/<id>.yaml`
  is the source of truth — one self-describing file per mob, file stem == the
  enemy `id`, carrying the whole `EnemyDef` (`src/game/defs/enemies/types.ts`).
  `make levels` runs `generate-enemies.mjs` (loader
  `scripts/enemy-data/load-yaml.mjs`, schema
  `scripts/asset-tools/enemy-schema.mjs`) to validate every def against
  the live cross-ref catalogs (companions, uniques, story items, weapons/gear)
  and emit `src/generated/enemies.ts` (gitignored, regenerated on build — never
  edit or commit it), which `src/game/defs/enemies/index.ts` re-exposes as
  `ENEMY_DEFS`. It **must run before assets/levels** — both
  `generate-assets.mjs` (the sprite pipeline derives wound frames from every
  enemy's `role`/`gore`) and `generate-levels.mjs` (cross-ref the enemy ids)
  import the enemy catalog — so the chain is `generate-leveling →
generate-items → generate-enemies → generate-powerups → generate-assets →
generate-levels → generate-bot-tuning`. The biome directory is organizational
  only (the merged catalog is flat; a duplicate id fails the build). The
  round-trip guard (`tests/content/enemy_roundtrip_test.ts`) pins the compiled
  catalog to `tests/content/fixtures/enemies-snapshot.json`; accept an
  intentional enemy change with `node scripts/update-enemy-snapshot.mjs`. See the
  `enemy-design` skill.
- **Powerups are compiled from YAML**, the same way — and they are the one
  catalog that lives in a SINGLE file. `content/powerups.yaml` is the source of
  truth for every timed pickup power (a `powerups:` map of id → power, the
  catalog key stamped in as the def's `id`), carrying every duration, damage
  figure, radius and interval, so a rebalance never touches engine code.
  `make levels` runs `generate-powerups.mjs` (schema
  `scripts/asset-tools/powerup-schema.mjs`) to validate each power — required
  fields, a known `kind`, EXACTLY the param block that kind requires and no
  other kind's, non-negative numbers, and every `icon`/`sprite` cross-checked
  against the sprite tree — and emit `src/generated/powerups.ts` (gitignored,
  regenerated on build — never edit or commit it), which
  `src/game/defs/abilities.ts` re-exposes as `ABILITY_DEFS`. That module keeps
  the TYPES (`AbilityDef`, and what each block means); the schema mirrors them,
  so keep the two in step when a kind gains a field. It **must run before
  levels** (the level pipeline cross-refs every `loot.abilityPool` id). The
  snapshot guard (`tests/content/powerup_roundtrip_test.ts`) pins the compiled
  catalog to `tests/content/fixtures/powerups-snapshot.json`; accept an
  intentional rebalance with `node scripts/update-powerup-snapshot.mjs`.
  **THE CAMPAIGN INTRODUCES TWO NEW POWERS PER MAP** and every map's pool keeps
  what came before (`loot.abilityPool` in each `content/levels/<id>.yaml`), so
  the dock's vocabulary grows the whole way down and each venue is announced by
  two powers that could only have come from there.
- **Items are compiled from YAML**, the same way. `content/items/<rarity>/<id>.yaml`
  is the source of truth — one self-describing file per hand-authored item
  (stem == id, directory == rarity: `regular`/`trash` for the plain bases,
  `set`/`unique`/`legendary`/`artifact` for the named chase), each carrying its
  sprite refs, a few sentences of `description` lore, and (pool bases) its
  `grades:` identities — plus the two knob files: `content/item_quality.yaml`
  (the BROKEN→PERFECT make-quality axis) and `content/item_rarity.yaml` (the
  tier ladder, unlock gates, roll chances, MF saturation, elite/boss bonuses).
  `make levels` runs `generate-items.mjs` (loader `scripts/item-data/load-yaml.mjs`,
  schema `scripts/asset-tools/item-schema.mjs`) **first in the chain** — it
  imports nothing from the engine, and every later generator reads the
  equipment catalogs — to emit `src/generated/items.ts` (gitignored, regenerated
  on build — never edit or commit it), which `defs/equipment.ts`/`gear.ts`/
  `grades.ts`/`uniques.ts` and the config `QUALITY`/`LOOT` rarity knobs read.
  The engine's built-in `blaster` sidearm stays authored in `equipment.ts`
  (engine machinery, not content). The round-trip guard
  (`tests/content/item_roundtrip_test.ts`) pins the compiled catalogs to
  `tests/content/fixtures/items-snapshot.json`; accept an intentional item
  change with `node scripts/update-item-snapshot.mjs`. See the `weapon-system`
  skill.
- The **autopilot's positioning knobs** compile the same way. `content/bot.yaml`
  (a global `default:` layer + per-level `levels:` overrides, mirroring
  `ladder.yaml`) is the hand-authored source of truth; `make levels` runs
  `generate-bot-tuning.mjs` to emit `src/generated/botTuning.ts`, which
  `src/game/bot/index.ts` resolves per level via `botTuningFor(state.level.id)`
  (`src/game/bot/tuning.ts` holds the `BotTuning` schema + neutral defaults). See
  the `bot-improvement` skill. The generated file is gitignored/regenerated; the
  YAML is committed.
- The **pixel font glyph set** is hand-defined in
  `scripts/asset-tools/font.mjs` (the `GLYPHS` map — `#` lit, `.`
  transparent, 3×5 variable-width cells); `make assets` packs it into the font
  atlas + metrics that `PixelText`/`pixel-font.ts` render at runtime. Lookups
  uppercase the character, so anything `PixelText` draws must have a glyph key
  there or it falls back to `?`. **Before rendering a new character** (a symbol
  like `×`, an accented letter, punctuation), add its glyph to `GLYPHS` (and to
  the specimen line in `generate-assets.mjs`) and rerun `make assets` — don't
  work around a missing glyph with a substitute. Verify the new glyph in the
  running UI, not just the specimen preview. The same `GLYPHS` map is also
  packed into a real **WOFF2 webfont** (`scripts/asset-tools/webfont.mjs`) that
  the library's static pages set their headings in — one source, two outputs, so
  a new glyph reaches both.
- **THE LIBRARY is generated, and its pages are never edited by hand.** The
  reference site at `/library/` (`pwa/scripts/library/`, see
  `docs/architecture.md`) is four sections —
  **bestiary** (one page per monster), **arsenal** (one per named relic and one
  per base item; a generated grade variant has no page of its own, it is
  described on the ancestor it was generated from), **mission guide** (one
  per venue) and **story** (one chapter per mission) — cross-linked so a monster
  reaches what it drops, an item reaches
  what pays it out, a mission reaches both, and a chapter reaches all three. It is compiled from the compiled
  catalogs plus LIVE ENGINE CALLS for every derived number — the same
  `scripts/game-alias-loader.mjs` seam `weapon-budget.mjs` and `drop-rate.mjs`
  use. **No gameplay number is ever typed into the generator**; a fact that
  can't be reached by reading a catalog or calling the engine is a finding, not
  a licence to hardcode. And the question is never "what does the catalog say"
  but "what would the game SHOW": a weapon's authored `damage` is halved for
  every LOOTED weapon before a player sees it, so the arsenal quotes the item
  card by calling the card's own functions against a REFERENCE HERO (a real
  `createGame` at level 1, who has spent nothing, so the wielder term is 1).
  Change a page by changing a generator — and when a catalog gains a field,
  DECLARE it in the matching coverage map (`ENEMY_FIELDS`, `WEAPON_FIELDS`,
  `GEAR_FIELDS`, `UNIQUE_FIELDS`, `LEVEL_FIELDS`, `STORY_ITEM_FIELDS`,
  `THOUGHT_FIELDS`, `CUTSCENE_BEAT_KINDS`), because the build fails on an
  authored field no page renders (the alternative is hundreds of pages silently
  going incomplete). **The STORY section takes its prose from `docs/story.md`
  and every quoted line from the GAME** — the cutscenes, level intros/outros,
  enemy dialogue and last words, pinned thoughts and story-item lore — never
  from `docs/manuscript.md`, which is a transcription of those same lines and
  would be exactly the second copy the library exists not to have; the
  manuscript still governs, through the test. `docs/story.md` is parsed
  structurally (`story-doc.mjs`, `model-story.mjs`), so a section it cannot
  place, a venue it writes about that no longer exists, a venue nobody wrote
  about, or a chapter whose travel scenes disagree with the level's own
  `prelude` chain all FAIL THE BUILD rather than drifting. What the library shares with the game it SHARES rather than
  copies: the window skin (`pwa/src/lib/pixel-panel.css`), the item card
  (`pwa/src/lib/item-card.css`), an affix's wording (`@ui/lib/affix-line.ts`),
  the tier/affix colours (`pwa/src/game/tiers.ts`), the ground rule
  (`render/ground-tiles.ts`), and a mission's MAP (the level drawn whole with
  the game's own sprites by `scripts/level-render.mjs --bare --dormant`, shrunk
  to fit). Improve it with the `library-improvement` skill: never judge a page
  from its markup, judge the screenshot.

## Game development skills

The repo ships a skill for each recurring game-development activity, so the
workflow (and its quality bars) stays consistent across sessions. Load the
relevant `SKILL.md` before starting that kind of work:

| Skill                 | Use for                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `new-game`            | Turning a clone of this repo into a new game/sequel — the ordered bootstrap: rename via `game.config.json`, strip content, rebuild on the same engine.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `engine-system`       | Adding/changing gameplay systems (enemies, weapons, items, rules) — the engine-first workflow: config → types → step → events → tests → presentation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `level-design`        | Adding a new level/mission — the YAML level format (`content/levels/<id>.yaml`, compiled by `make levels`), the map renderers (`map-layout.mjs` layout blueprint + `map-preview.mjs` analysis view), the design-zone systems (safe/quiet zones, tempo, chests, merchant spawns), campaign registration and unlock order, spawn/wave/pack budgets, the cumulative loot-pool rule, XP/arrow-cap pacing wiring, and the checker + test battery a new map must pass.                                                                                                                                                                                                                                                                                                                                                                 |
| `map-improvement`     | Improving an EXISTING map's design and FEEL — the render → evaluate → improve loop. LOOKS at the layout blueprint (`make map-layout`) first, confirms the intended feel with the user (the YAML descriptions may be wrong), then reads the played heatmap and iterates — with the WHOLE design surface on the table (reshaping walls/geometry, new sprites/mobs/encounters, elite/boss hp + capabilities, level ranges, up to a complete redesign), held to best-practice game design, before/after sign-off before shipping.                                                                                                                                                                                                                                                                                                    |
| `mapgen-improvement`  | Improving the MAP GENERATOR — the GENERATED MAPS feature that carves every mission fresh from its v2 blueprint per run, so a change lands on six missions × three sizes × every seed at once. The carve → dress → verify architecture and which file answers which question, how to add a new object purpose / area rule / `LevelDef` capability (and the four places each touches), the render → CROP → judge → iterate loop, the invariants that are load-bearing and easy to undo by accident (walls from borders, districts from seeds, densities not counts, tile-snapped ground zones, per-feature rng streams), what actually makes a carve look designed, and the verification traps — chiefly a nav grid built from a different carve than the def it paths through, which makes every assertion pass and mean nothing. |
| `enemy-design`        | Adding or reworking an enemy (minion/elite/boss) — the `EnemyDef` anatomy, picking hp/damage against the scaling model (`LEVELING.refMobHp` anchor), mechanics/phases, manuscript-governed dialogue/lastWords, spareable companions, loot signatures, auto-derived wound sprites, and the content tests that bite when a piece is missing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `weapon-system`       | Adding/rebalancing weapons and loot (bases, level requirements, tiers/affixes, drop rules, projectile behaviors) — the def-first workflow with two verification loops: the damage-budget calculator (`scripts/weapon-budget.mjs`), the stat checker (`scripts/weapon-stats.mjs`), and the arsenal sheet (`scripts/weapon-sheet.mjs`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `leveling-balance`    | Tuning how fast the hero levels — the XP curve, kills-per-level pacing, the flat mob-priced XP payouts (elite/boss/arrow knobs in `content/leveling.yaml`), the level cap, the onboarding ramp, the diminishing-returns curve on stats, the per-map XP caps — via the kills-per-level model, the calculator (`scripts/leveling-curve.mjs`), and the per-level pacing graph (`scripts/leveling-pace.mjs`), with simulated runs measuring the real dings.                                                                                                                                                                                                                                                                                                                                                                          |
| `simulate-run`        | Measuring ACTUAL balance by running the real engine headlessly (`scripts/simulate-run.mjs`; engine side `src/sim/simulate.ts`): whole levels or whole campaigns easy → JESUS with the autopilot, auto-equip, and loadout carry, the hero immortal by default (deaths booked with cause + coordinates; `--mortal` restarts the level on death, `--max-deaths` aborts a run that keeps dying, and the DEATHS table feeds the map renderer's death overlay) — reporting hero/mob hp, damage per hit dealt and taken, drops, weapon swaps, deaths, and XP withheld by the per-map caps.                                                                                                                                                                                                                                              |
| `pixel-assets`        | Creating or changing sprites, tiles, palettes, animations, or pixel-font glyphs — the generate → look → evaluate → loop cycle.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `art-improvement`     | Finding and replacing the game's WORST art — the audit funnel (`scripts/art-audit.mjs`): numbered sheets per level or of the item catalog, shortlist 30 → 20 → 10, five manuscript-grounded concepts per finalist plus two refinements, an in-game pose check of each stageable winner (frozen `?scenario=`), per-candidate commits, then a numbered before/after sheet the user votes on before the PR.                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `sound-effects`       | Adding or tuning synthesized WebAudio SFX — the sound vocabulary, mixing rules, and audition loop.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `talent-fx`           | Creating or tuning the passive TALENTS — the always-on melee/ranged/magic trees: a talent's rank numbers and its ALWAYS-ON FX (the magic tree's orbiting flames / storm / seeker orbs / singularity / immolation aura, the melee/ranged proc + defensive cues), per-rank FX upgrades, and catalog balance (rank slopes, proc caps, unlock stat) — via the generate → look → evaluate → iterate loop with `pwa/scripts/talent-preview.mjs` (staged FX frame strips + per-rank sheets) and the `?debug` `window.__talent` hook.                                                                                                                                                                                                                                                                                                    |
| `visual-effects`      | Creating or tuning a transient VISUAL EFFECT — explosions, flashes, hit splashes, auras, screen washes, death/spawn flourishes. The two FX surfaces (world-anchored canvas effects in `render/effects.ts` vs screen-space CSS DOM overlays like `createNukeFx`), the event → effect → draw flow, the `?debug` preview-hook + Playwright screenshot loop, and the craft rules (t-driven timelines, additive light, determinism, layering, reduced-motion) that make an effect read as spectacular.                                                                                                                                                                                                                                                                                                                                |
| `playtest`            | Verifying changes in the running game and tuning game feel with the autoplay bot (`pwa/scripts/playtest.mjs`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `bot-improvement`     | Improving the AUTOPILOT (`src/game/bot/index.ts`) — how the bot reads a fight and moves, toward HUMAN-capability play (approach but hold at weapon reach, kill from a distance, no dives). The reproduce → read the thought trail → hypothesize → edit `src/game/bot/`/`bot.yaml` → re-measure loop, the `bot.yaml` knob pipeline (`content/bot.yaml` → `src/generated/botTuning.ts` → `botTuningFor`), the `think()`/BOT VIEW discipline, and the determinism rules.                                                                                                                                                                                                                                                                                                                                                            |
| `debug-game`          | Investigating gameplay/render/input/audio bugs — deterministic seed repros, `?debug` + `window.__game`, failing-test-first fixes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `test-scenario`       | Staging an exact in-game situation to reproduce a bug, probe fps, or eyeball a context — the `?scenario=` URL param / `applyScenario` spec (place the hero at the boss or merchant, set hp/gear, clear the field, spawn mob rings — pre-wounded if asked, lay out ground items, freeze the world into a pose) plus the FPS meter (DEBUG MODE or `?debug`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `store-shots`         | Regenerating the App Store / Play Store screenshot set — after resprites, an art pass, a HUD change, or new powers/talents. Drives the real game to staged ENDGAME moments (nightmare, late maps, legendaries, powers detonating) at Apple's exact rasters, captions them in the game's own pixel font, and holds each frame to a quality bar before it reaches a listing.                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `ui-review`           | A fit-and-finish pass over the game's UI (screens, modals, popups, toasts) — the screenshot-audit loop: capture every surface at the nine reference viewports (`pwa/scripts/ui-shots.mjs`), judge against the quality bar, unify off-skin surfaces, fix clipping/overflow, verify with re-captures.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `library-improvement` | Building or improving THE LIBRARY — the generated companion site at `/library/` (bestiary, arsenal, mission guide, story; see `docs/architecture.md`). The generate → look → judge → improve loop: regenerate, screenshot at the reference viewports, hold every page to the quality bar (does it wear the game's own skin, is every number the engine's own, does it read like Arreat Summit rather than a database dump, do the spoiler panels cover without hiding from crawlers), fix the worst in the GENERATOR, and loop — with before/after sign-off before shipping.                                                                                                                                                                                                                                                     |

## Maintenance skills

Per §21 of `OSS_SPEC.md`, this repo ships agent skills for keeping drift-prone artifacts in sync with their sources of truth. Skills live under `.agent/skills/<name>/` and are also accessible via the `.claude/skills` symlink.

| Skill            | When to run                                                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `maintenance`    | When several artifacts have likely drifted at once — umbrella skill that runs every `update-*` skill in the correct order.        |
| `update-docs`    | After any change to the public API, configuration keys, or error messages.                                                        |
| `update-readme`  | After any change that alters user-visible behavior, commands, or install instructions.                                            |
| `update-website` | After changes that affect the deployed app's SEO surfaces or source-derived content under `pwa/`.                                 |
| `update-prompts` | After any change to an LLM prompt's source of truth (embedded docs, rendering-context keys, JSON-schema enums, validation rules). |
| `sync-oss-spec`  | When the repo may have drifted from `OSS_SPEC.md` — walks the spec's mandates and fixes violations.                               |
| `commit`         | To commit, push, and open/update a PR with a conventional-commit title.                                                           |

Each skill has a `SKILL.md` (the playbook) and a `.last-updated` file (the baseline commit hash). Run a skill by loading its `SKILL.md` and following the discovery process and update checklist. The skill rewrites `.last-updated` at the end of a successful run, and improves itself in place when it discovers new mapping entries. The `maintenance` skill owns a **Registry** table listing every `update-*` skill — add a row whenever you create a new sync skill.

## Skill lessons — fragments, not SKILL.md edits

When a session learns a gotcha or heuristic while running any skill, it
records it under `.agent/skills/<skill>/.lessons/<unix-timestamp>-<slug>.md`
— one file per lesson, YAML front matter with `title`/`date`, the lesson in
the body; the full convention is
[`.agent/skills/LESSONS.md`](.agent/skills/LESSONS.md). Read a skill's
lessons back with `node scripts/skill-lessons.mjs <skill>` before starting
that kind of work. Never append lessons to a `SKILL.md`: parallel sessions
editing one file cause merge conflicts, while fragments never collide. A
periodic consolidation pass (its own commit) merges near-duplicate lessons,
deletes stale ones, and promotes the load-bearing ones into the skill's main
instruction — that is the only time lesson content moves into `SKILL.md`.
