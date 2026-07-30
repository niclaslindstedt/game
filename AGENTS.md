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

The desktop/Steam shell in `electron/` is likewise outside the workspace, with
its own tree, its own `tsc` and its own vitest (the root suite stops at its
edge — `npm run electron:test` is the only thing that runs it locally, and
`.github/workflows/desktop-build.yml` the only thing that runs it in CI):

```sh
npm run electron:install    # install electron/ dependencies (its own tree)
npm run electron:bundle     # build the site + copy it into electron/webroot/
npm run electron            # compile the shell and launch it
npm run electron:test       # the shell's own unit tests
npm run electron:dist       # package a developer build for this platform
```

Shipping to Steam is `electron/RELEASING.md` — the store records, the asset
dimensions, signing, and `npm run steam:upload` (from `electron/`), which is
also the preflight checklist: it refuses to upload and names what is missing.
Note `release:*` vs `dist:*` — the former strips the developer tooling out of
the embedded site and is the ONLY correct one for a store build.

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

**THE WORLD PROJECTION — the simulation is square, the PICTURE is not.**
`pwa/src/game/render/tilt.ts` is the one leaf that decides how the flat
top-down world reaches the screen, and it has exactly two knobs. **PITCH** is
how far the camera looks DOWN: the ground plane foreshortens, so a step north
covers less screen than a step east and the floor rakes away from the eye
(shipped at 0.75, a ~41° lean). **YAW** is how far it stands round from
square-on — the half that turns a tiled floor into DIAMONDS, i.e. the thing
people mean by isometric; 45° with pitch 0.5 is Diablo's 2:1 floor. Both are
live sliders on DEVELOPER → VISUALS (persisted as `cameraPitch`/`cameraYaw`,
stripped from a store build like every developer setting), because the answer to
"how far down, how far round" is settled by dialling it on a real field, not by
rebuilding to look. **Yaw ships at 0**: the floor art, the wall sprites and the
buildings are all drawn square-on, so a turned camera reads as diagonal floor
seams under front-facing structures whose sprites no longer cover their
axis-aligned collision boxes — a proper isometric look needs the structural art
redrawn as iso pieces, which is an art project, not a render setting.

The whole thing rests on one split, and getting it backwards is the only way to
break it: **the FLOOR lies down and the BODIES stand up.** Anything painted on
the ground — the baked ground layer, blood, burn scars, craters, AoE footprints
— is drawn through the projection and takes it whole (a ground ring becoming an
ellipse IS the effect, which is why none of those passes has a line about the
tilt in it). Anything with a body — a character, a rock, a shot in flight, a
floating damage number — is anchored at its projected spot and then drawn
upright at FULL size through `billboard`, whose composite works out to exactly
the identity at a whole-pixel offset so the pixel art stays crisp. Billboarding
a pass is therefore a one-line wrap, never a rewrite of its arithmetic — which
is how the yaw knob was added later without touching a single draw pass.

Three consequences to keep in mind. The ground layer is **baked already
projected** (`groundLayer`, keyed on the projection so a knob change re-bakes):
a nearest-neighbour resample picks which rows to drop from the destination
offset, so transforming per frame re-picks them every time the camera moves a
pixel and the floor visibly boils. **The hero is always at the middle of the
screen** — `computeCamera` no longer clamps the view to the level, because a
projected view is bigger than the canvas in world units and the old clamp bit on
nearly every map, sliding him off toward a corner; the letterbox showing past a
map edge is the cheaper price. And every screen↔world crossing OUTSIDE the
renderer goes through the viewport's `toWorld`/`toCss` pair (GameScreen), which
are functions rather than two scale factors because the projection is a matrix:
where the player is pointing, which foe the cursor aims at, whether a tap hit the
merchant, and where a floating DOM label pins itself all follow from that pair.

**Mobile-first, landscape.** The reference device is a phone held
horizontally: a ~844×390 CSS viewport (≈422×260 world units at the app's
`VIEW_SCALE` of 2 and the shipped pitch — the projection makes the view taller
in world units than the canvas is in pixels). Design every element — HUD,
overlays, spawn distances, weapon ranges, anything sized against "the screen" —
to fit and feel right at that size. Run playtests and visual checks at this
viewport (the playtest harness defaults to it), not at a desktop size.

Large screens render the whole presentation at **2× the phone baseline** so
the phone-tuned HUD, text, and sprites stay legible instead of shrinking:
`viewScaleFor` (render.ts) doubles the world zoom, and a `min-width/height:
700px` media query doubles the root font-size (styles.css) so the rem-sized
DOM UI — PixelText canvases included — scales in lockstep. Keep the two
breakpoints in sync (`UI_SCALE_BREAKPOINT_PX`). A desktop still never sees
_less_ moon than the phone; it just sees it at phone-sized zoom rather than
zoomed out.

**A THIRD tier at 1200 (`UI_SCALE_3X_BREAKPOINT_PX`) exists for a BALANCE
reason, not a legibility one.** The view rect is the viewport divided by the
zoom, so a fixed zoom hands a bigger monitor a bigger slice of the world — and
in a game about being surrounded, seeing further is an advantage rather than a
preference. Measured against the phone's ~422×195 world units: a 1440p monitor
at the 2× tier saw **2.8×** the phone's map, and 4K saw 6.3×. The 3× tier pulls
those to 1.24× and 2.8×. Keep every tier an INTEGER — `VIEW_SCALE × uiScale` is
the sprite upscale factor and a fractional one resamples the pixel art — and
keep each one's media query in styles.css in step, or the HUD and the field
disagree about how big a pixel is. Note the tiers are deliberately not
monotonic (1080p tops the 2× tier at 1.57× while 1440p starts the 3× at 1.24×);
discrete tiers can't avoid that, and a test pins it so it stays a known oddity.
Anything reading the scale should treat it as a NUMBER, never test for one tier
(`=== 2`) — that is exactly what silently breaks when a tier is added.

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
- **`electron/` — the desktop store wrapper.** The same idea for **Steam** on
  Windows, macOS and Linux: an Electron shell whose entire content is the built
  site, copied inside it (`webroot/`, a gitignored artifact from
  `npm run electron:bundle`) and served from a private `game://app` scheme —
  NOT `file://`, because `localStorage` is keyed by origin and an opaque origin
  would orphan the player's whole roster. It adds Steam Cloud and Steam
  achievements over the SAME three-file seam the mobile shell uses (bridge →
  provider → platform), so the web side never learns which platform answered.
  Like `native/`, it has **its own dependency tree**, its own `tsc`, and — since
  the root suite stops at its edge — **its own vitest**. See
  `electron/README.md`.

**THE SHELLS DIFFER ONLY IN THEIR PIPE.** Both wrap the same built site and
answer the same four bridge protocols; they differ in how the JSON travels
(`ReactNativeWebView.postMessage` vs Electron IPC), so that — and only that —
lives behind `pwa/src/app/shell-bridge.ts`. The RETURN path needed no
abstraction at all: both shells call the page's `window.__gis*Event(...)` from
OUTSIDE (`injectJavaScript`, `executeJavaScript`), which is why adding a second
shell changed no bridge's protocol. `shellPlatform()` answers WHICH shell, and
is read only for platform-feature questions — never to decide how to talk to
one. Two ride on it today: the **coin store does not exist on Steam** (the game
is bought once there; the AUTO PILOT purse is funded by selling loot, exactly
as on the web), and **`canVibrate()` excludes Steam** (no motor, so the
VIBRATION row is hidden rather than offered as a dead switch).

**What Steam does NOT get, and why it is written at the seam.** There is no
Steam leaderboard provider: `steamworks.js` binds no leaderboard API, and
Steam's overlay has no leaderboard page either — so the "the ranking is the
platform's to draw" rule that lets the game ship no board UI has no Steam
counterpart. `electron/src/leaderboards-provider.ts` returns null with that
reasoning in it, which is the seam's own idiom (Android does the same), and the
web side already hides every leaderboard row when it sees it. Achievements DO
travel, but Valve caps a NEW app at 100 until it clears the Profile Features
threshold, so Steam ships the same curated list Game Center does — with
`STEAM_FULL_CATALOG` (`platform-achievements.ts`) as the one switch that lifts
it to all 226 afterwards. That switch goes false → true and **never back**: a
Steam achievement id is permanent once any player has unlocked it. Steam has no
point system at all, so the Game Center point apportionment must not run for it;
the two portals therefore have separate row types and separate committed
manifests (`electron/store/steam-achievements.json`, generated by
`scripts/steam-achievements.mjs`, drift-tested like Game Center's).

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

**THE DEVICE CONTENT SWITCHES — the controls the PLAYER'S GUARDIAN owns, not the
player.** Two switches on the app's own page in iOS Settings (native builds only;
a browser has no such page, so every entry point reports UNMANAGED and the game
plays whole): **MATURE CONTENT**, which gates the gore and the screen-nuke's
burning dead, and **COIN STORE**, which decides whether this install has a store
at all. Both default ON — the game ships as it was made, and a guardian turns
things off. They live OUTSIDE the game on purpose: a control reachable from
inside the thing it restricts is not a restriction, so there is no in-game row
for either, and the device's answer OUTRANKS every in-game setting and developer
flag (EXTRA GORE and FORCE STORE included). Same three-file seam as cloud save
and the achievements — `native/src/device-settings.ts` (bridge) over
`device-settings-provider.ts` (seam) and `device-settings-ios.ts` (Apple), backed
by `native/modules/device-settings/` (Swift: `UserDefaults`) with the page itself
written at prebuild by the local config plugin
`native/plugins/with-settings-bundle.js` — so **Android support is one new file**
plus wherever Android puts its own parental controls. Four rules:

1. **NSFW IS THE UMBRELLA GATE FOR EVERYTHING "NOT SAFE FOR KIDS", and every new
   such feature MUST hang off it.** The blood, the incinerated dead — and
   whatever comes next: dismemberment, a decapitation, swearing in the dialogue,
   drug or alcohol references, sexual content, an unusually cruel death
   animation. The test is not "is this gore", it is "would a parent handing over
   this phone want it off". Adding a second switch per new kind of content is how
   a parental control rots: the guardian answered once, years ago, and every
   feature shipped since defaults to showing them. So a new mature feature adds a
   `nsfwAllowed()` check, never a new setting — and it belongs in the same review
   as the feature, because a mature feature that ships ungated has already been
   seen by the players the switch exists for.
2. **THE GATE GOES WHERE THE THING IS DECIDED, NOT WHERE IT IS DRAWN.** `bloodBlow`
   returns null and the floor's saturation grid never records the hit; the
   `incinerated` flag is dropped at the top of the kill's fx so the blast falls
   back to the ORDINARY corpse punt-and-topple, which is what makes a censored
   nuke read as a bomb that hits hard rather than one whose victims vanish. A
   gate at the draw call leaves the state filling up invisibly and hands the
   player everything it was hiding the moment the switch comes back.
3. **IT FAILS OPEN, ALWAYS.** No native module, an Android build, a malformed
   payload, a browser: every one of those plays the full game. A guardian's
   switch is a deliberate act, honoured exactly; the ABSENCE of an answer is not
   one and must never be read as one. Note the trap this exists for: iOS does NOT
   write a `Settings.bundle` `DefaultValue` into `UserDefaults` until the page is
   visited, so the key is MISSING on every fresh install — read it as `false` and
   every player gets the censored game.
4. **THE POLICY IS IN THE PAGE BEFORE THE GAME'S FIRST FRAME.** It gates what may
   be DRAWN and which rows may be OFFERED, so it is injected onto `window` before
   the WebView loads a byte (`policyBootScript`) and read synchronously
   (`pwa/src/app/device-policy.ts`) — never awaited. A round trip would flash a
   STORE row at an install that has none. Only LATER changes travel as events,
   and the title menu rebuilds on them through the same `bumpSettings` tick its
   own settings use.

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

## QUESTS — the errands the field's non-combatants ask of the hero

Every other figure on every map is either trying to kill the hero or is a boss
explaining why, which makes each venue read as a LEVEL rather than as a PLACE:
nobody lives here, nobody worked here, nobody got left here. A **QUEST GIVER**
is the counterweight — a person the horde was inflicted on rather than a person
the horde is, still doing a job that stopped making sense some time ago. Two
stand on every map (`content/quest-givers.yaml`), the horde is warded off them
and nothing can hurt them, exactly as with the merchant.

**THE GIVER AND THE QUEST ARE SEPARATE CATALOGS.** A giver is a PERSON — a
sprite, a name, a spot, a reason for being there — and one person hands out a
whole CHAIN. Folding the giver into the quest would repeat that person once per
errand and let the copies disagree; folding the chain into the giver would make
a quest unaddressable, and a chain link (`requires`), a reward and a tracker row
all need to name one. Both compile from YAML through the same loader and schema
a MOD's quests go through, and arrive via `registerDefs` — so "it works in my
mod" and "it works in the game" mean the same thing (`mod/FORMAT.md`).

Four kinds of errand, and each is a different reason to walk somewhere: `kill`
(N of a breed), `killNamed` (one pinned elite or boss), `collect` (tokens the
quest itself defines, dropped by breeds or lying on the floor), and `escort`.
Five rules are load-bearing:

1. **THE REWARD'S XP IS A SHARE OF THE HERO'S OWN BAR, NEVER A NUMBER.** A flat
   figure authored against SpaceZ HQ is a rounding error by Eastworld and an
   instant ding on JESUS, so `xpShare: 0.25` means "a quarter of the level you
   are on" and prices itself correctly at every rung for free. Coins are flat
   (the purse is a flat economy) and the LOOT is rolled through the ordinary
   drop pipeline — a quest is a second CALLER of the loot system, never a second
   loot system.
2. **THE LOG IS THE TRUTH; THE MARK IS DERIVED.** `giverMark` recomputes the
   `!` / `?` over a head from the quest log every time it is asked, and nothing
   caches it — a stored mark goes stale the instant a kill three rooms away
   completes an objective, and a `?` that isn't there is a quest the player
   never hands in. The three states are WoW's: gold `!` (work to take), gold `?`
   (work to hand in), grey `?` (work running).
3. **A CONVERSATION STARTS ITSELF EXACTLY ONCE, AND OPENS THE WHOLE SLATE.**
   Walking up auto-opens the giver's conversation, because a quest nobody
   notices is a quest nobody takes; a giver with more than one thing to say
   opens on the **PICK LIST** (WoW's gossip window) rather than handing back one
   errand at a time, because the one-at-a-time rule makes a second quest
   reachable only by refusing the first — which reads as the game losing track
   of what it already offered. Every exit from an errand returns to the slate,
   so taking three off one person costs one walk-up. With exactly one topic the
   list is skipped: a menu of one is a menu nobody wants.
4. **PROGRESS IS BOOKED WHERE IT HAPPENS, NOT SCANNED FOR.** `creditQuestKill`
   is called from `killEnemy` and `creditQuestPickup` from the item pass — the
   tally counts what the hero DID, not what is left standing.
5. **THE ERRAND-GIVERS STEP LAST.** A quest conversation takes the stage by
   setting `phase = "quest"`; a sight-pinned thought, the opening strike and a
   lair's occupant all take it by setting `phase = "dialogue"`. Whichever runs
   LAST wins — and when the thought won it left the offer set behind a dialogue
   the player tapped away, so the offer never appeared and the giver was stuck
   mid-conversation for the rest of the run. `stepQuests` therefore runs after
   every other scene-raising pass in `step/index.ts`.

**AN ESCORT IS A TIMER WITH A BODY, NOT A SECOND COMPANION.** It walks toward
the hero, stops when left past its leash, and the horde bites it when the horde
is close — so it costs one pass of its own and changes nothing in
`step/enemies.ts`, while still creating the errand's whole tension: the fight
wants the hero to kite and the follower wants him not to. The horde reaches it
BECAUSE it follows the hero, never because anything retargets; retargeting was
considered and rejected, since it turns every escort into a fixed-rate damage
race the player cannot influence, which is the thing escort quests are hated
for.

App side: `pwa/src/game/overlays/QuestOverlay.tsx` is the gold parchment box
(the one modal the player is asked to make a DECISION in, which is why it is the
one surface off the shared steel skin — after two of them, gold means "somebody
is asking you for something"); its speech crawls on the same typewriter every
other spoken line in the game uses, while the objectives and reward print
instantly because they are a contract rather than a voice.
`QuestLogOverlay.tsx` is the full log off the pause menu, `QuestTracker.tsx` the
on-screen strip over the fight, and `render/quests.ts` draws the givers, their
head marks and the escorts. The list's row marks are drawn in the PIXEL FONT
rather than as the head sprite — the sprite is sized to be read across a room,
so in a text row it is a different size on a different baseline, and every
attempt to line that box up with a text canvas is a magic number that breaks
again at the other UI scale tier.

## STEAM WORKSHOP MODS — players author content in the game's own format

**Steam builds only** (a browser has no Workshop and no filesystem). A mod is a
folder of YAML that players publish to the Steam Workshop; the SDK lives at the
repo's top level in **`mod/`** so it is findable in the open-source tree —
`mod/README.md` (the guide), `mod/FORMAT.md` (the reference),
`mod/examples/greenhouse` (a worked mod), `mod/tools/` (the compiler and CLI).
`docs/modding.md` is the architecture half. Four rules:

1. **A MOD IS COMPILED, NEVER INTERPRETED.** The desktop shell's main process
   compiles each mod once at load into a `ModBundle` of plain JSON, and only
   that reaches the page — which keeps the renderer sandboxed with no
   filesystem and no YAML parser in it. The format has **no scripting hook**,
   and adding one would turn "subscribe to a mod" into "run a stranger's code".
2. **ONE COMPILER, ONE SCHEMA.** A mod's level, enemy, item, sprite, sound,
   score, power and STORY (`cutscenes/`, `thoughts.yaml`, `story-items.yaml`) are
   the same files as `content/levels/`, `content/enemies/`, `content/items/`,
   `content/sprites/`, `content/cutscenes/` and the rest, going through the same
   loaders and the same validators —
   which is why `scripts/*-data/load-yaml.mjs` take a DIRECTORY rather than
   owning a constant, and why the item COOKING is shared out into
   `scripts/item-data/compile.mjs` rather than living in the generator. `node mod/tools/cli.mjs check` runs the code the game runs at
   load, so "it works in my mod" and "it works in the game" mean the same
   thing. Never add a second, friendlier mod schema; it drifts within a release.
3. **THE CATALOGS GO IN THROUGH `registerDefs`** (`pwa/src/game/mods.ts`) — the
   seam the engine test suites already used for synthetic fixtures, which is why
   mods needed no engine change. Sprites merge into the loaded
   `Record<name, ImageBitmap>` the renderer reads through `spriteByName`, so a
   mod's frames are indistinguishable from the atlas's. **A mod applies to a
   RUN, not an install**: `restoreBaseDefs()` puts the shipped game back when
   the run ends, and a hero carries a `ModStamp` rather than the mod's content,
   so a roster still reads correctly after the player unsubscribes.
4. **`mod/catalog.json` IS COMMITTED AND DRIFT-TESTED.** It is every id a mod
   may name, snapshotted as JSON because the compiler runs in the shipped app's
   main process, which has no TypeScript and no `src/generated/`. A content
   change that adds or retires an id runs `make mod-catalog` in the same commit
   (`tests/content/mod_catalog_test.ts` enforces it), exactly like the Game
   Center and Steam achievement manifests. It carries **no numbers** — a mod may
   NAME the game's content, never read its tuning out of a file that would then
   have to stay compatible for ever.

**THE LOAD ORDER IS THE FIFTH RULE, and it exists because the compiler cannot
help.** A clash with the BASE game is caught at compile time (an addon may not
shadow a shipped id; a conversion may). A clash between two MODS cannot be —
each is compiled alone, and its author never saw the other — so it resolves at
load by one rule covering sprites, levels and enemies alike: **later in the
player's order wins**. `pwa/src/game/mod-order.ts` is a leaf of pure functions
over the persisted `modOrder` setting, and three of its decisions are
load-bearing: the PERSISTED list is the source of truth for order (a list
rebuilt from what is installed would reshuffle itself, and silently change the
winner, every time the player subscribed to anything), a newly-seen mod is
APPENDED so a fresh subscription wins by default, and a move steps OVER
uninstalled entries so one press moves one visible row. `applyMods` re-merges
from the SHIPPED catalogs every time — never from what the last apply left
behind, or switching a mod off would not remove its content until a relaunch —
and RECORDS every override (`ModClash`) so the MODS screen can tell a player
which of their mods is losing and that moving it down fixes it.

**A POWER IS A COMPOSITION OF EFFECTS, AND THE EFFECT LIBRARY HAS TWO
CARRIERS.** `AbilityDef.kind` is a LABEL, never a dispatch key: it names the
effect a power leads with (for the surfaces that need one word for a whole
power — the dock, the bot's valuation, the ONE NUKE loot rule) while the engine
steps and the app draws whichever effect BLOCKS are present. So a def carrying
`trail` and `immolation` does both, and a mod can build a power the shipped
catalog has no equivalent of without the engine growing a member per idea.
Read `abilityBlocks(def)`, never `def.kind`, anywhere a power's BEHAVIOUR is
being judged. Composition is why `ActiveAbility.clocks` is keyed per block: one
shared cooldown was safe only while every def carried exactly one block, and
the moment one carries two, an orbit's bite resets a storm's strike timer.

The effects themselves live ONCE, in `src/game/ability-effects.ts`, because a
powerup and a GRANTED SPELL (the `spell` affix on gear, and the magic tree's
`conjure` talents) were two implementations of the same six things — same ring,
same prefilter, same `hitEnemy` path, in two files drifting apart. A carrier
supplies only what genuinely differs: where the numbers come from (a flat
authored block vs a rank curve that INT quickens — `<kind>SpellBlock` returns
the very block shape the YAML authors), the scratch, and the BILLING (a
powerup's output is exempt from the menace meter; a granted spell's heats it
like a weapon blow). Adding an effect means one function there plus a block on
`AbilityDef` plus its entry in `KIND_BLOCKS` — and both carriers get it.

**A POWER OWNS ITS LOOK AND ITS SOUND, because otherwise a mod's power can only
look and sound like whichever shipped power shares its effect.** The colour kit
is `AbilityDef.look` — authored in `content/powerups.yaml` beside the numbers it
colours, not in the app — and it is what makes two powers sharing an effect read
as different things (the DUST DEVIL and the EVENT HORIZON are both nothing but a
`well`). `pwa/src/game/powerup-fx.ts` is now only the accessor and the neutral
default an un-styled power falls back to. `AbilityDef.sfx` is the same idea for
audio, on the same seam `WeaponDef.sfx` rides: the id travels on the event and
the sound bus tries it before the event's own key. A burst carries its power's
kit onto the `Effect` (via the event's `defId`), so a mod's rain lands in its own
colours rather than in MOONFALL's grey.

The Workshop itself is the same three-file seam as cloud save and the
achievements: `electron/src/workshop.ts` is the ONLY module that knows Steam
exists, `electron/src/mods.ts` is the bridge above it, and what is uploaded is
the **authored folder**, not a compiled bundle, so a published mod stays
readable and forkable the way the game's own content is. Two things a mod may
NOT author, and both refusals are deliberate: a `grades:` ladder (minted at
engine load from a catalog compiled into the build, so there is no runtime seam
to add to) and the loot economy itself (`item_quality.yaml`/`item_rarity.yaml` —
a mod that moved the tier ladder would be rebalancing the campaign rather than
adding to it). **THE COMPILER SHIPS OUTSIDE THE ASAR**, in a tree that MIRRORS
the repo's layout under `resources/modtools/` (`extraResources` in
`electron-builder.config.cjs`, resolved by `electron/src/resources.ts`): every
module in it finds its neighbours by relative path, so a flattened copy resolves
to nothing, and `yaml` has to travel with it because a package inside the asar
is not resolvable from a module outside it. Every `scripts/` directory the
compiler imports has to be listed there — a missing one is a mod that compiles in
the repo and fails on a player's machine with a resolve error, which is what
`tests/content/mod_toolchain_deps_test.ts` now walks the import graph to prove.

**A MOD'S STORY IS THE MOD'S.** The three-tier chain that makes
`docs/manuscript.md` the authority on every spoken line covers the SHIPPED
campaign and stops at the mod folder's edge: a mod's scenes, monologues and lore
are never filed into the manuscript and never corrected to match it (see **Story
& dialogue** below). The one thing a mod's story answers to is the schema.

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
row beside it while it is on (`generatedMapSize`: SMALL/MEDIUM/LARGE/RANDOM), a
**VISUALS** subpage (the KNOCKBACK and BLOOD amounts, plus the **CAMERA PITCH**
and **CAMERA YAW** sliders that dial the whole world projection live — see **THE
WORLD PROJECTION** above), and
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

**CONTROLLER NAVIGATION IS A TRANSLATION, NOT AN EMULATION.** A gamepad drives
every menu in the game — the title tree, the pause menu, the inventory, the
shop, the level-up chooser, the talent picker, the vault, the achievements
shelf, the arsenal, the high-score board, the item card, the effects gallery —
and NONE of them knows a gamepad exists. `@ui/lib/gamepad-keys.ts` dispatches
the synthetic arrow/Enter/Escape `keydown` events those surfaces already listen
for, and the fact that makes it work is that every one of them listens on
`window`. So the bridge is mounted ONCE, globally, in `App.tsx`, and a screen
added later is navigable without opting in — which is the opposite of threading
a gamepad prop through a dozen components, and the reason to keep it that way.
A pad button therefore earns a menu behaviour by being mapped to a KEY, never
by a menu learning to read a pad.

The one hazard is the FIELD, where the stick is already steering the hero and
arrow keys are rebindable to movement. The run suspends the bridge
(`setGamepadKeysSuspended`) off its own phase: `playing` means the run owns the
input, and EVERY menu and overlay the game can raise is a different phase
(`paused`, `levelup`, `shop`, `dying`, `victory`, `dialogue`), so they all keep
navigation and only live play gives it up. It is set every tick rather than on
transitions so no path out of a phase can leave it stuck, and cleared on
unmount so leaving a run always hands navigation back.

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

**A BOSS IS A CHARACTER, NOT FOUR FIELDS — the BOSS ABILITY CATALOG.** A boss's
set-piece moves used to be a CLOSED union of four (`charge`, `slam`, `enrage`,
`summon`), so every boss in the game was a permutation of the same four and a new
idea meant widening a type the whole engine reads. An ability is now a NAMED
entry in a catalog: authored as data in `src/game/defs/enemies/abilities.ts`,
stepped by one module under `src/game/mechanics/`, registered by id in
`mechanics/catalog.ts`. Adding one is a variant in the authored union plus a
module beside its siblings plus the boss YAML that names it — nothing else in the
engine grows a member per idea. The four originals stay named fields (a pile of
content authors them that way); they are the catalog's grandfathered entries, not
its future.

**Every ability obeys the same THREE BEATS, and the orchestrator owns two of
them** — which is what makes a fight learnable rather than a coin flip:

1. **TELL** — the boss strikes its OWN authored CAST POSE (`<sprite>_cast_0/1`,
   resolved by naming convention like the wound stages, so a boss earns the
   treatment by shipping two frames and nothing is registered anywhere) for a
   fixed, never-rolled `windupMs`. `stepEnemyMechanics` starts the windup, so no
   ability in the catalog can ever ship without one.
2. **CAST** — the move commits to a marker that is a THING IN THE FICTION. The
   bearing LOCKED at the tell reaches the handler as `AbilityCtx.lockedDir`, and
   it has to travel that way: the orchestrator clears the telegraph the instant
   the windup ends (that is what un-roots the mob), so an ability reaching back
   for `mech.telegraph` inside `cast` finds nothing, silently re-aims onto the
   hero, and quietly breaks the promise every tell in the game makes.
3. **RESOLVE** — damage lands, the cooldown starts (in the orchestrator, counted
   from the CAST, because the gap between casts is what a player learns to
   count), and the FIRST cast fires the ability's one-time `bark`.

**A BARK IS NOT DIALOGUE.** Every other spoken line freezes the run into the
`dialogue` phase, which is exactly wrong for a line whose whole job is to name a
move WHILE it is being dodged. A bark is its own event (`bossBark`) the app
floats over the speaker; play never stops. Manuscript-governed like any other
line.

**THE TOP RUNGS ADD MOVES, THEY DON'T JUST MULTIPLY NUMBERS.** Each entry carries
`minDifficulty` (compared on `DifficultyDef.index`) so NIGHTMARE and JESUS hand
the player a new thing to learn on a fight they already know, and
`windupFloorMs`, which squeezes a known move faster up the ladder but never below
an authored floor — a tell shorter than a reaction is not a tell, and the
build refuses a floor above its own windup.

**THE SET-PIECE FX ARE SPRITES, NOT SHAPES.** What this replaced was a strobing
`ctx.arc` ring around the body, a stroked circle for the slam's footprint and a
`ctx.lineTo` for the charge's bearing — primitives in a game whose every other
pixel is authored, and a stroked circle reads as a debug overlay because that is
what it is. The read is carried instead by the cast pose on the mob, then by the
GROUND (`render/boss-fx.ts`): a slam pools a soft pressure shadow, a charge kicks
authored grit down its locked lane, a beam is an authored slice tiled along its
own axis, and burning floor is a mottled outline-free char sprite with flame
licks standing on it. Three engine events (`enemySlam`, `enemySummoned`,
`enemyEnraged`) were emitted and consumed by NOBODY — a boss's slam landed for
more than its contact damage with nothing on screen at all — and are answered in
`event-fx.ts` now, in authored dust rather than in expanding rings.

THE CATALOG NOW CARRIES SIX, and four of them exist to prove the seam holds:
an ability may reach the world through its own PROJECTILES (`coin_cannon` — a
fan of coins that RICOCHET, `Projectile.bouncesLeft`, so cover stops being the
answer and the room starts being the question), its own STATE LIST (`bait_drop`
— PUMP AND DUMP, piles that look exactly like loot and price the pickup reflex;
they arm on a delay long enough to walk out of and go cold on their own, which
is what keeps a nasty move fair), or — twice — through an EXISTING HAZARD
SYSTEM pointed at a boss's intent instead of a level's timer. That last one is
the most valuable trick in the file: `airstrike` (ORBITAL DELIVERY) drops pods
that ARE meteors (`Asteroid.sprite`/`hatch`), so it inherits the firming ground
shadow the player has already been taught to read and is legible the first time
it is used; `call_horde` (CALL OF INCELS) calls a STAMPEDE, so it inherits the
approach dust, the trample and the answer ("get out of the lane"). Prefer
pointing an existing system at a new author over building a second one.

THE LAST TWO CLOSE THE SET, and both are shaped like an ANSWER rather than a
threat. `recompile` is a boss healing itself — the oldest cheap trick there is,
because the only response to a rising bar is "hit harder", which is a scolding
rather than a decision. It becomes a mechanic by putting the repair OUTSIDE the
boss: a node goes up, a visible tether runs to it, and breaking the node beats
any amount of extra damage. `lockdown` drops blast shutters in a ring around the
hero with exactly ONE gap — not a trap, a corner. A sealed box is a damage
window; a box with a door is a question, and the gap's bearing is rolled so it
stays a search. Both reuse machinery whole: the node is another `structure`
EnemyDef like the planted flag, and the shutters are ORDINARY `state.obstacles`,
so collision, line of sight, shot-blocking and the renderer all came free.

The one thing that was NOT free is `state.obstaclesVersion`. The autopilot builds
its nav grid once per level and caches it, so a wall that appears mid-run is a
wall it cannot see — it routes straight through and grinds. Anything that adds
or removes an obstacle must bump that counter; `ensureRoute` rebuilds when it
moves. Any future dynamic obstacle inherits the fix.

ARMSTRONG carries the catalog's first two. **LASER EYES** sweeps a beam one way
across a locked arc and leaves the regolith it crossed ON FIRE (`state.scorches`,
stepped in `hazards.ts`): the beam is one dodge, but the floor it leaves is what
makes a long fight cost the player their room. Two rules keep it honest — the
fire BITES ONCE PER CADENCE however many patches overlap (a sweep lays a band
several patches deep, so billing per patch would turn a readable hazard into a
spike set by how finely the beam sampled its own lane), and it BURNS OUT: a boss
may carve the floor, never delete it. **FLAG PLANT** (nightmare+) is the summon
with an ANSWER — the adds come out of a real, stationary, killable body
(`the_planted_flag`, an ordinary `EnemyDef` marked `structure: true` and paying
no xp) rather than out of the boss, so "break the thing making these" is a right
answer the player can find. Reach and arc are sized against the PHONE viewport
and judged in the EFFECTS GALLERY's own BOSSES shelf, never guessed — a sweep
that covers the whole visible floor is not a hazard, it is a wall.

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

**BLOOD SCALES WITH THE BLOW, AND THE FLOOR REMEMBERS IT.** A hit that takes a
mob's whole bar and a chip that finishes one already down to its last fifth used
to throw the identical two-frame splash, so nothing the player did read as
harder than anything else. `bloodBlow` (`game-screen/blood-hit.ts`, a pure leaf
beside `corpse-launch.ts`) prices every landed blow in the victim's own STARTING
HEALTHBARS — `damage / maxHp`, the same number the kill launch rides, which is
what keeps it honest across the campaign instead of drowning the late game in
gore as the damage figures grow.

**That number then SPLITS IN TWO, and the split is the whole design.** VOLUME is
how much blood came out and it SATURATES — a body holds one body's worth, so a
blow ten times its health cannot spill more than it had; it owns the count of
the blood and how wet the floor gets. FORCE is how hard it was hit and has NO
CEILING — the same pint can be pushed out or blown clear across the room; it
owns the reach, the haze, the size of the pieces, and how far up the wound's
frame chain the splash gets. One shared severity was the first design and it
flattened the top of the range (a 3× and a 10× overkill both hit the cap and drew
the same picture); the split is what lets a level 99 hero in a level 1 crowd keep
escalating for ever. Three pieces:

- **THE SPRAY** (`render/blood.ts`, built like `dust.ts`): a wound splash at the
  point of impact, droplets thrown along seeded bearings that arc up and back
  down, and a haze only a blow worth more than a scratch makes at all. The splash
  grows by walking FURTHER UP ITS OWN FRAME CHAIN rather than by being scaled —
  scaling a pixel sprite just resamples the art — and the chain runs past the
  16 px `blood_hit_*` ring into the `blood_burst_*` gore detonations, because a
  ring is the right picture for a solid kill and the wrong one for a blow a
  hundred times a body's health. Past `CHUNK_FORCE` the drops become authored
  PIECES (`blood_chunk_*`) instead of beads. Only the warm-blooded bleed;
  `EnemyDef.gore` ecto/sparks keep the plain two-frame splash.
- **THE FLOOR** (`render/blood-ground.ts`) is **ONE BYTE PER TILE** — a
  `Uint8Array` of saturation over the level's tile grid, 28 KB for the biggest
  map, permanent, never evicted. A list of stains would grow with every kill and
  eventually have to start forgetting; a grid does not, so painting is `+=` and a
  floor with forty thousand hits on it draws exactly as fast as one with forty.
  **Making a grid of squares read as spilled blood is the entire difficulty**, and
  it takes four rules that each fix a distinct way it comes out looking stamped:
  1. **A LADDER, NOT A SWITCH** — four authored rungs (`blood_tile_0..3`), two
     variants each, mirrored on both axes off the tile hash, with the alpha
     ramping inside a rung so a stain darkens smoothly.
  2. **THE HEAVY RUNGS OVERHANG THEIR CELL** — they are 24 px blobs drawn
     CENTRED on a 16 px cell and nudged by the tile hash (`blot`, `JITTER_PX`),
     never blitted into the cell rect, so neighbours overlap and the boundary of
     a mess is the ragged union of a dozen blobs rather than the outline of the
     cells that happen to be stained.
  3. **THE TOP RUNG IS INTERIOR-ONLY** (`drawnRung`, its own leaf
     `blood-rungs.ts` so it is testable) — a cell may climb one rung above its
     four orthogonal neighbours AND may only reach the near-opaque top rung when
     all EIGHT are heavy. The orthogonal cap alone is not enough and believing
     otherwise shipped a bug: land a few kills together and every cell in the
     blob has soaked neighbours, clears the cap, and the blob draws as a
     RECTANGLE.
  4. **THE RIM IS AUTHORED, NOT FADED** (`blood_fringe_h/v`) — a pool's edge is
     not a fainter pool, so a cell much bloodier than the neighbour it faces
     frays into it with real edge art: transparent inside, a scalloped lip, then
     droplets petering out. Two sprites cover four directions via the flip cache.
     The interior MUST be transparent — a fringe with a solid inner half is a
     half-plane, and four of them on one cell union into a filled square.

  The floor is deliberately **STILL**: nothing on it animates. A moving specular
  glint over the soaked cells was tried and cut — a highlight that travels across
  a dark red mass reads as the blood BUBBLING, and a floor that simmers is a
  floor nobody believes. Blood on the ground is settled; the only thing that
  moves is the spray, and that is over in a third of a second.

- **ONE GATE, CHECKED IN ONE PLACE.** SETTINGS → DISPLAY → **EXTRA GORE** (on by
  default; off falls back to the plain two-frame splash) and the DEVELOPER →
  VISUALS **BLOOD** amount are both read inside `bloodBlow`. Off means nothing is
  drawn AND nothing is recorded — a gate at the draw call would leave the grid
  filling up invisibly and hand the player a red floor the moment they switched
  it back on.

**LOOT IS THROWN, LANDS, AND THEN ADVERTISES ITSELF.** A drop that materialises
under the corpse is indistinguishable from the floor texture, and a legendary
that materialises the same way is the entire chase arriving with no more
presence than a medkit. So a drop now has three beats, and each one is owned by
exactly one place:

- **THE TOSS is the engine's, and it is a TIMER, not a trajectory**
  (`src/game/items/toss.ts`, `LOOT.toss`). Every drop in the game goes through
  the one funnel — `dropItem(state, item, from)` — which is what made the
  feature a two-line change at each of the twenty-odd sites that pay loot out.
  `item.pos` is the LANDING spot from the moment the item is minted, so the
  magnet, the pickup reach, the minimap and the bot's loot run all keep reading
  a position and need no notion of flight; the renderer arcs the icon in from
  `toss.from` over the countdown, tumbling it, with a shadow that stays on the
  ground. Airborne loot cannot be grabbed and the magnet leaves it alone — the
  same gate the angel delivery already used. **The scatter is HASH-DERIVED off
  the item's id, never `state.rng()`**: the drop ladder's draws are load-bearing
  (seeded runs, the simulator's A/B, every `rollEquipment` stream), so a
  presentational hop that consumed one would shift every roll after it.
- **THE LANDING IS WHAT MAKES THE NOISE, and what a thing sounds like is what
  it is MADE OF.** `stepItems` emits `itemLanded` carrying the item's MATERIAL
  (`itemVoice`: blade / gun / wand / plate / mail / leather / cloth / trinket /
  flask / scrap / spark / relic) — mail jingles, cloth flumps, plate clangs,
  glass clinks — and the app kicks a puff of dust in the FLOOR's own colour
  (`groundColorAt`, exactly as a jump does). A magic-or-better find rings a
  SECOND event over the top (`lootShine`, carrying the tier), which is the whole
  reason rarity and material don't multiply: layering two events is 12 + 6
  sounds where one combined event would have been 72. The old `itemDropped`
  event went with it — it fired once per SPILL rather than once per item, at
  the moment of minting rather than the moment of arrival, and after the sound
  moved to the landing nothing consumed it at all.
- **THE STANDING AURA is the app's, and it is a LADDER**
  (`pwa/src/game/render/loot-aura.ts`). Each layer switches on at its own rank
  and every one is lit in the tier's own colour (`TIER_RGB` — the colour the
  item's NAME is written in): regular keeps the plain warm halo, magic takes the
  tier colour and lights a pool on the floor, rare starts SMOKING, set thickens
  it, unique stands a LIGHT SHAFT over the piece (drawn twice — a wide soft
  flare with a narrow bright core, because one column cannot be both), legendary
  adds orbiting motes, and artifact pulses a ring out across the ground. It is
  closed-form off the render clock and the item's id, like the canopy and the
  fauna, so a floor covered in loot costs the simulation nothing and allocates
  nothing per frame; the light itself is BAKED (`glowSprite`, `beamSprite`),
  because building a gradient per item per frame is the most expensive thing a
  loot-covered floor can do. The four corner glint pixels this replaced are
  gone. Judge it in the EFFECTS GALLERY's WORLD shelf — `loot-rarity` stands the
  whole ladder side by side on the moon's dark regolith (a pale deck plate
  flatters every tier equally, which is the one thing a comparison must not do)
  and `loot-toss` runs a whole spill.

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

| Change type                                               | Goes in                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Engine/gameplay logic specific to this game               | `src/...` (framework-free TypeScript); exported from `src/index.ts` (`@game/core`) — add to `src/menu.ts` (`@game/menu`) ONLY if the startup path needs it and it drags no simulation along                                                                                     |
| Authored sprite art                                       | `content/sprites/<family>/<id>.yaml` — committed source grids compiled by `make assets`; see the `pixel-assets` skill                                                                                                                                                           |
| A level (mission)                                         | `content/levels/<id>.yaml` — the YAML source of truth, compiled to `src/generated/levels.ts` by `make levels`; see the `level-design` skill                                                                                                                                     |
| A GENERATED map (the "v2" blueprint for a mission)        | `content/maps/<id>.yaml` — the RECIPE a mission's geometry is carved from per run, compiled to `src/generated/map-blueprints.ts` by `make levels`; see **GENERATED MAPS** above                                                                                                 |
| The hero level curve (XP per level)                       | `content/leveling.yaml` — per-level XP up to the cap, compiled to `src/generated/leveling.ts` by `make levels`; see the `leveling-balance` skill                                                                                                                                |
| A powerup (a timed pickup power)                          | `content/powerups.yaml` — the whole catalog in one file (id → power), compiled to `src/generated/powerups.ts` by `make levels`; the campaign introduces TWO NEW POWERS PER MAP. A power COMPOSES effect blocks and carries its own `look:`/`sfx:` — see **STEAM WORKSHOP MODS** |
| A new EFFECT a power can carry                            | `src/game/ability-effects.ts` (the implementation, shared by both carriers) + a block on `AbilityDef` + its entry in `KIND_BLOCKS` (`scripts/asset-tools/powerup-schema.mjs`)                                                                                                   |
| An enemy (minion/elite/boss)                              | `content/enemies/<biome>/<id>.yaml` — one YAML file per mob (stem == id), compiled to `src/generated/enemies.ts` by `make levels`; see the `enemy-design` skill                                                                                                                 |
| An errand (a quest) and the person who hands it out       | `content/quests/<id>.yaml` (one errand per file, stem == id) + `content/quest-givers.yaml` (the people), compiled to `src/generated/quests.ts` by `make levels`; see **QUESTS** below                                                                                           |
| An item (weapon/gear/named unique)                        | `content/items/<rarity>/<id>.yaml` — one YAML file per hand-authored item (stem == id, dir == rarity), compiled to `src/generated/items.ts` by `make levels`; see the `weapon-system` skill                                                                                     |
| Item quality / rarity knobs                               | `content/item_quality.yaml` (the make-quality axis) and `content/item_rarity.yaml` (the tier ladder + rarity economy)                                                                                                                                                           |
| A sound effect                                            | `content/sounds/<id>.yaml` — one YAML file per sound (stem == id), compiled to `pwa/src/generated/sounds.ts` by `make levels`; see the `sound-effects` skill                                                                                                                    |
| A music track                                             | `content/music/<id>.yaml` — one YAML file per score (stem == id), compiled to `pwa/src/generated/music/` by `make levels`; see the `sound-effects` skill                                                                                                                        |
| A cutscene (a between-level scene)                        | `content/cutscenes/<id>.yaml` — one scene per file (stage, cast, timeline; `variants:` swaps a labelled part per difficulty), compiled to `src/generated/cutscenes.ts` by `make levels`                                                                                         |
| The hero's inner monologues                               | `content/thoughts.yaml` — the whole catalog in one file (id → monologue) plus the `capRotation` the cap-farm mutter cycles, compiled to `src/generated/thoughts.ts` by `make levels`                                                                                            |
| A story item (keycard, dossier, recovered hardware)       | `content/story-items.yaml` — the whole catalog in one file (id → plot piece and its `lore` pages), compiled to `src/generated/story-items.ts` by `make levels`                                                                                                                  |
| Authored campaign/bot tuning                              | `content/ladder.yaml` and `content/bot.yaml`                                                                                                                                                                                                                                    |
| Generators, analyzers, previews, and maintenance commands | `scripts/...` — executable tooling only; authored game data belongs under `content/`                                                                                                                                                                                            |
| Generic engine code (usable by any game)                  | `src/lib/...` — imported as `@game/lib/*`; earmarked for extraction to oss-framework once mature                                                                                                                                                                                |
| App shell, rendering, PWA, game-specific UI               | `pwa/src/...`                                                                                                                                                                                                                                                                   |
| Generic React/UI game components                          | `pwa/src/lib/...` — imported as `@ui/lib/*`; earmarked for extraction to oss-framework once mature                                                                                                                                                                              |
| A library page's content, look, or wording                | `pwa/scripts/library/...` — the generator; the pages themselves are build output and are NEVER hand-edited                                                                                                                                                                      |
| Native-only concern (haptics, audio session, store build) | `native/src/...` — the Expo wrapper; never leak app-specific code into `src/` or `pwa/`                                                                                                                                                                                         |
| Desktop/Steam-only concern (window, Steam Cloud, overlay) | `electron/src/...` — the Electron wrapper; same rule, never leak it into `src/` or `pwa/`                                                                                                                                                                                       |
| The MOD SDK (format, compiler, examples, modder docs)     | `mod/...` — the published authoring surface, top-level so it is findable; see **STEAM WORKSHOP MODS** below                                                                                                                                                                     |
| Mature, playtested generic code                           | extract into `oss-framework`, then import the package here                                                                                                                                                                                                                      |
| Tests                                                     | `tests/...` (engine) — name them `*_test.ts`                                                                                                                                                                                                                                    |
| Docs update                                               | `docs/...`                                                                                                                                                                                                                                                                      |
| Examples                                                  | `examples/...`                                                                                                                                                                                                                                                                  |
| LLM prompt                                                | `prompts/<name>/<major>_<minor>_<patch>.md` (see `prompts/README.md`)                                                                                                                                                                                                           |

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
3. `content/` — **the game**: the roster, items, cutscenes, thoughts and story
   items that play the script. An extrapolated version of the manuscript.

**THE CHAIN GOVERNS THE SHIPPED CAMPAIGN, AND ONLY IT.** A MOD authors the same
files in the same format (`cutscenes/`, `thoughts.yaml`, `story-items.yaml` — see
**STEAM WORKSHOP MODS** above and `mod/FORMAT.md`), and none of this applies to
one: nobody governs a stranger's script. A mod's story has no tier above it, is
never filed into `docs/story.md` or `docs/manuscript.md`, and must never be
"corrected" to match them — a total conversion's whole point is that its plot is
not this one. So the rule is about ORIGIN, not about format: a line in
`content/` is the campaign's and answers to the manuscript; the identical line in
a mod's folder is its author's and answers to nobody. (The one thing a mod's
story does answer to is the SCHEMA — a scene still has to name a sprite that
exists.)

When two tiers of the CAMPAIGN's chain disagree, the **higher tier wins**:
`story.md` beats the manuscript, the manuscript beats the data — correct the
lower tier to match.
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

- `content/cutscenes/<id>.yaml` — one scene per file: its stage, its cast, and
  the `caption`/`say` beats of its timeline (the prelude, the launch, the two
  voyages, the rift doors). The prelude's per-difficulty `variants:` swap the
  weapon on the wall (compiled to `src/generated/cutscenes.ts` by `make levels`).
- `content/levels/<id>.yaml` — each level's `intro` (the hero's opening
  monologue) and `foes` label (compiled to `src/generated/levels.ts` by
  `make levels`).
- `content/enemies/<biome>/<id>.yaml` — every elite/boss `dialogue` (arrival
  scene) and `lastWords` (spoken on death) (compiled to
  `src/generated/enemies.ts` by `make levels`).
- `content/thoughts.yaml` — the hero's inner monologues, pinned to a kill or a
  sighting via a `LevelDef.firstKillThoughts` / `firstSightThoughts` entry, plus
  the `capRotation` the cap-farm mutter cycles (compiled to
  `src/generated/thoughts.ts`).
- `content/story-items.yaml` — `lore` pages on story items (keycards, dossiers,
  recovered hardware) (compiled to `src/generated/story-items.ts`).
- The engine modules beside those (`src/game/defs/cutscenes.ts`,
  `defs/thoughts.ts`, `defs/story.ts`) own the TYPES, the registries and the
  per-difficulty variant rule — never the lines.
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
  **EVERY MONSTER OWES A PARAGRAPH — `EnemyDef.lore`, and the rank and file owe
  it most.** A named elite explains itself in its `dialogue`; a minion never
  gets to, which is precisely why a horde nobody wrote a line about reads as a
  texture rather than as the inhabitants of somewhere. So the field is REQUIRED
  of all 106 (the build refuses a def without it, and warns past 420
  characters), it is written in the same dry register as an item's
  `description`, and it is the one field on the def authored for a READER —
  nothing in the simulation touches it, and the library's bestiary prints it
  under the portrait, in the open rather than behind the spoiler reveal. It is
  bound by the story chain like any other story text: it may only ELABORATE
  what `docs/story.md` and `docs/manuscript.md` already establish, never
  introduce a plot fact of its own, which is what keeps it out of the
  manuscript's verbatim transcription (exactly as an item's description is).
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
- **Sounds and MUSIC are compiled from YAML too — and they emit into
  `pwa/src/generated/`, not `src/generated/`.** A sound is an APP concern: the
  engine emits events and has no idea they make a noise, so parking 273 voices
  and five scores in the engine's tree would hand every consumer of
  `@game/core` data it never reads. `content/sounds/<id>.yaml` is one sound (a
  list of synth VOICES, played by name or by an `on:` event shape) and
  `content/music/<id>.yaml` is one tracker-style score (instruments, patterns
  of note tokens, an order); `make levels` runs `generate-sounds.mjs` and
  `generate-music.mjs` (schemas `scripts/asset-tools/sound-schema.mjs` and
  `music-schema.mjs`, loaders `scripts/sound-data/` and `scripts/music-data/`).
  The sound bank emits SPLIT — `sounds.ts` for the run, `sounds-ui.ts` for the
  interface — because a menu click must not drag every kill and explosion into
  the 170 KB critical path; the music emits **one module per track** plus an
  index of dynamic imports, for the same reason, so a score is fetched when its
  venue starts and never before. The round-trip guard
  (`tests/content/music_roundtrip_test.ts`) pins the compiled scores to
  `tests/content/fixtures/music-snapshot.json` — frozen from the hand-written
  TypeScript scores the moment before the lift, so it is a PROOF that nothing
  changed, not merely a baseline; accept an intentional change with `node
scripts/update-music-snapshot.mjs`. `tests/sound_catalog_test.ts` is the
  sounds' equivalent, replaying the old imperative bank against the catalog.
  **A level's `music:` is cross-checked** against `content/music/` by the level
  schema — an unknown id used to be silent, the player falling back to the
  default theme so the venue quietly played the moon's music.
- **THE STORY is compiled from YAML too, and that is what makes a CONVERSION
  possible.** `content/cutscenes/<id>.yaml` (one scene: a stage, a cast, a
  timeline of beats), `content/thoughts.yaml` (the hero's inner monologues plus
  the `capRotation`) and `content/story-items.yaml` (the plot pieces and their
  `lore`) are the sources of truth; `make levels` runs `generate-story.mjs`
  (schema `scripts/asset-tools/story-schema.mjs`, loader `scripts/story-data/`)
  BEFORE the enemy and level pipelines, which cross-ref the ids it writes. Until
  the lift, a mod could ship a venue and a horde but no scenes, no monologues and
  no lore — a re-skin rather than a different game. Three things are worth
  knowing before touching it:
  - **`variants:` is how one scene is five.** The prelude is the same living room
    on every difficulty except the weapon on the wall, so it is authored ONCE
    with `label:` handles on the parts that differ; the loader patches those
    labels per rung and emits `prelude_<difficulty>`, which is exactly what
    `cutsceneVariant` resolves at run creation. Labels are authoring handles and
    never reach the game. Five near-identical files would have been five files to
    keep in step.
  - **A prop's sprite is `sprite:`, not `kind:`.** `CutsceneProp.kind` is a
    renderer key in the generic player (`src/lib/cutscene.ts`, which knows
    nothing about sprites); in this renderer a prop kind IS a sprite name, and
    one file cannot readably spell `kind` for both a prop's art and a beat's
    discriminant. The loader does that one rename and nothing else.
  - **A level's `prelude` is cross-referenced now.** An unknown scene id used to
    throw out of `cutsceneDef` at the moment the venue opened — invisible to
    every test that does not start that level.
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
