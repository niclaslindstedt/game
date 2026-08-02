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
make assets        # regenerate in-game pixel assets + previews (runs make levels)
make levels        # recompile every content catalog from content/*.yaml
make sim-bench     # benchmark the headless simulator (best-of-N, digest-checked)
make bump          # print the release bump derived from .changes/unreleased/
make changelog VERSION=X.Y.Z  # preview a release's CHANGELOG section
```

**VERIFY WITH `make test` (or `npm run test`) — NEVER with a bare
`npx vitest run`.** They are not the same check, and the difference passes
locally and fails in CI. `npm run test` opens by rebuilding the generated
content and the sprite atlas (`npm run assets:check --workspace pwa`); `npx
vitest run` skips that and tests whatever happens to be on disk. Several
COMMITTED artifacts here are drift-tested against a fresh build —
`mod/catalog.json`, `native/store/game-center-achievements.json`,
`native/store/game-center-leaderboards.json`,
`electron/store/steam-achievements.json` — so a stale artifact compared against
an equally stale build MATCHES, and the suite goes green over exactly the drift
the test exists to catch. (This is not hypothetical: a merge brought in sprites
from other PRs, `mod/catalog.json` was regenerated after `npm run levels` —
which deliberately does not run `generate-assets.mjs` — and `npx vitest run`
happily agreed with itself while CI failed.) The same applies to `make lint`
and `make build`, which open with the same rebuild.

**HOW MUCH OF THE PIPELINE A COMMAND RUNS IS AN ARGUMENT, and every entry point
runs it EXACTLY ONCE.** The chain is `scripts/generate-content.mjs` — one
ordered step list, in the dependency order `docs/content-pipeline.md` explains —
and its `--previews` flag decides how much of the (gitignored) preview set the
sprite renderer draws: `assets` draws all of it (the art loop), `assets:site`
only the per-sprite `@8x.png` files the library build copies, `assets:check`
none at all. Everything the game itself ships — every catalog, the sprite atlas,
the fonts — is built and checked identically in all three. So a new npm script
that needs fresh content calls ONE of those three and then does its own work; it
must never chain a second entry point that rebuilds again (which is what made
`make lint` compile the whole content tree three times over).

**The two store shells are OUTSIDE the npm workspace**, each with its own
dependency tree (and `electron/` with its own `tsc` and its own vitest, so the
root suite stops at its edge). The root `package.json` forwards to them with
`npm --prefix`: `npm run native:*` and `npm run electron:*`, listed with what
each does in **`native/README.md`** and **`electron/README.md`**. Shipping to
Steam is **`electron/RELEASING.md`**, which is also the preflight checklist.
Two traps worth carrying here: `release:*` strips the developer tooling out of
the embedded site and is the ONLY correct target for a store build, and the
`native:ios*` scripts run `expo prebuild` first so a change to
`native/app.config.js` re-syncs instead of shipping a stale native project.

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

## Resolving merge conflicts — cut a backup branch FIRST

**Before starting a merge or a rebase that may conflict, park the branch:**

```sh
git branch -f backup/<branch-name>-premerge HEAD    # then merge
```

A conflicted working tree is the most fragile state a repo gets into, and the
commands that feel like "let me just look at something else for a second" —
`git stash`, `git checkout <ref> -- .`, `git reset`, adding a worktree — will
happily throw the resolution away, clear `MERGE_HEAD`, and leave no obvious way
back. With the backup branch in place the recovery is one line
(`git reset --hard backup/<branch-name>-premerge`) instead of an archaeology
session in the reflog; without it, any unpushed work in the merge is gone.

Delete the backup once the merge is committed, verified, and pushed — it is a
seatbelt, not a branch anybody should review.

Two rules that go with it, both learned the same way:

- **Never run an exploratory command against the working tree mid-conflict.**
  To see what another ref says, ask git directly (`git show <ref>:<path>`,
  `git diff <ref>`) — those read without touching a file. If a build genuinely
  has to run on another ref, `git worktree add` a SEPARATE directory, and do it
  before the merge starts, never during it.
- **Resolve, `git add`, and commit in one unbroken stretch.** Don't leave a
  conflicted tree parked across unrelated work.

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
picked-up weapons and items. `docs/architecture.md` is the full map; this is
the part every task needs.

**THE ENGINE HAS TWO ENTRY POINTS, and picking the wrong one is a silent
regression.** `@game/core` (`src/index.ts`) is the whole public API, simulation
included. `@game/menu` (`src/menu.ts`) is the narrow slice the app's STARTUP
path may reach: the catalogs, the saved-hero math, and the engine flags the
settings screen applies — and nothing that simulates. **The app shell imports
`@game/menu`; the game imports `@game/core`.** Because an import is an import:
the title menu wants a level's NAME, and one module graph away sit `createGame`,
the step pipeline, the autopilot, the loot roller and the enemy catalog.
Tree-shaking does not save you — it is global, so an export used by ANY chunk
keeps its bytes wherever its module was placed, and the module was on the
startup path. Both aliases resolve to the SAME modules, so the split is purely
about REACHABILITY. Two patterns keep it workable and both are the right move
when a new one is needed: the engine's runtime toggles live in the import-free
leaf `src/game/flags.ts`, and compiled content is emitted in menu-facing and
run-facing halves (`generated/level-index.ts` beside `generated/levels.ts`),
read through `defs/levels/summary.ts`. `pwa/scripts/check-seo.mjs` polices the
result as a **200 KB gzipped critical-path budget** — web.dev's figure for a
~5 s time-to-interactive on a slow 3G phone is 200 KB, and the extra 30 KB is
a deliberate allowance for react-dom (~113 KB of the path) until the planned
React→Preact swap returns it, at which point the number goes back to 170.
When it trips, find what reached back through `@game/core` (or make that
screen lazy); do NOT raise the number.

**Mobile-first, landscape.** The reference device is a phone held horizontally:
a ~844×390 CSS viewport, ≈422×260 world units. Design every element — HUD,
overlays, spawn distances, weapon ranges, anything sized against "the screen" —
to fit and feel right at that size, and run playtests and visual checks at that
viewport, not at a desktop size. Larger screens step the whole presentation up
through integer scale tiers. **How the picture is made at all — the world
projection, the post effects, the canvas and its tiers, how bodies carry
themselves, how loot advertises itself — is `docs/rendering.md`.**

**Five layers, one dependency direction** — each may import only from the ones
above it, and `docs/architecture.md` has the module-by-module map:

- **`src/` — the engine.** Framework-free TypeScript: the simulation plus the
  content catalogs under `src/game/defs/` (content is data, referenced by id).
  It must stay importable from any renderer — no React, no DOM assumptions
  beyond what a browser provides. `src/output.ts` is the central output module
  (OSS_SPEC §19.4); raw `console.*` elsewhere fails lint.
- **`pwa/` — the app.** A Vite + React 19 PWA shell that mounts the engine,
  renders it, and owns everything deploy-shaped (the service worker build,
  manifest, icons, SEO surfaces, the update toast). **The app depends on the
  engine; the engine never imports from the app.**
- **`native/` — the App Store / Play Store wrapper.** A thin Expo shell whose
  entire content is a full-screen WebView over the bundled site, adding what a
  browser can't give iOS: Taptic haptics, an audio session that plays through
  the ringer switch, in-app purchases, cloud save and Game Center. Its own
  dependency tree. → `native/README.md`
- **`electron/` — the Steam wrapper.** The same idea for desktop, serving the
  built site from a private `game://app` scheme (NOT `file://` — `localStorage`
  is keyed by origin, and an opaque origin would orphan the player's whole
  roster). Its own dependency tree, its own `tsc`, its own vitest.
  → `electron/README.md`
- **`server/` — the session server.** The engine compiled for **Node**, so a
  multiplayer session simulates in a process of its own rather than in the
  renderer; the same file IS the standalone dedicated server. It imports
  `@game/core` and NOTHING under `pwa/`, which
  `tests/content/server_deps_test.ts` proves by walking the real import graph.
  → `docs/multiplayer.md`

`mod/` (the published mod SDK) and `content/` (every authored catalog) are
top-level beside them. **Never leak shell-specific code into `src/` or `pwa/`**,
and never leak app code into the engine.

**THE SHELLS DIFFER ONLY IN THEIR PIPE.** Both wrap the same built site and
answer the same bridge protocols; they differ in how the JSON travels
(`ReactNativeWebView.postMessage` vs Electron IPC), so that — and only that —
lives behind `pwa/src/app/shell-bridge.ts`. The RETURN path needed no
abstraction at all: both shells call the page's `window.__gis*Event(...)` from
OUTSIDE, which is why adding a second shell changed no bridge's protocol.
`shellPlatform()` answers WHICH shell and is read only for platform-feature
questions — never to decide how to talk to one. The platform seams themselves
(cloud save, Game Center, leaderboards, the guardian's device content switches,
the coin store) are all the same **three-file shape** — bridge → provider →
platform — which is why adding Google Play support to any of them is one new
file. `docs/architecture.md` has each in full.

Deployment is three GitHub Pages slots on one origin: `/` serves the highest
`v*` tag, `/preview/` every `main` push, `/branch/` a manually parked branch.
Each slot gets its own service worker and a disjoint precache cache id. See
`docs/architecture.md` → Deployment topology.

## The rules that bite in every task

Each of these is a rule an ordinary change trips over, stated once here with the
file that owns it. The reasoning behind each lives where the pointer goes.

**A RUN READS ITS OWN MAP — `runLevelDef(state)`, never `levelDef(state.level.id)`.**
Every mission's geometry is CARVED per run from a blueprint, so the catalog holds
a `MissionDef` with no floor plan on it at all. The carve travels on the state
(`GameState.carvedLevel`) and `runLevelDef` is the ONE accessor. Inside a run,
nothing reads the catalog for its own level. → `mapgen-improvement`, `level-design`

**NOTHING OUTSIDE A RUN MAY IMPORT `mapgen/`.** The menus reach levels through
`defs/levels/summary.ts`; pulling the generator onto the startup path puts the
whole level catalog and the carve inside the 200 KB budget.

**A READ OF "THE HERO" IS ONE OF TWO KINDS, AND KNOWING WHICH IS THE JOB.** A
PRIVATE read — the bag, the purse, the build, the talents, the worn kit — is
about ONE hero and is a **parameter**, never a lookup:
`effectiveStat(state, player, stat)`. A pass reaching for seat 0 to find a bag
has not been parameterized yet. A GEOMETRY read is about the party and needs a
party-aware answer — `nearestHero` / `anyHeroWithin` / `heroesWithin` /
`partyCentroid` / `partyLevel` (`src/game/party.ts`) — and picking the wrong one
is a design bug rather than a typo. A mob's own target is `src/game/aggro.ts`.
`state.players[0]` left in engine code is an un-migrated site, not an answer.
→ `docs/multiplayer.md`

**"IS THIS HERO SOMEBODY THE WORLD SHOULD REACT TO" IS `heroInPlay`, NEVER
`hp > 0`** — which misses a DEPARTED seat and once made a party whose fourth
player quit undefeatable.

**A SCREEN IS THE PLAYER'S, NEVER THE RUN'S — `Player.screen`, and
`state.phase` keeps only the global beats.** The bag, the map, the shop, the
pause menu and the level-up chooser are per-player (`PlayerScreen`); the world
halts only when EVERY hero in play has one up (`partyBlocked`), which solo is
exactly the old freeze. So `state.phase === "playing"` no longer means "the
world is live" — the question "may this hero act / is this hero watching the
field" is `phase === "playing" && hero.screen === undefined` (app-side:
`fieldLive(state)` in `pwa/src/game/local-seat.ts`). A ding BANKS its points
(`pendingStatPoints`/`pendingTalentPoints` on the hero); nothing may force the
chooser open mid-run except `promptPendingPoints`.

**EVERY PAYOUT GOES THROUGH ITS ONE FUNNEL.** A KILL's XP is the party's:
`shareXp(state, amount, pos)`. Every other award has an owner:
`grantXp(state, hero, amount)`. A DROP goes through `dropItem`, which stamps
`Item.owner` on its own — never roll an owner at a call site.

**NEVER SPEND A `state.rng()` DRAW ON PRESENTATION.** The drop ladder's draws are
load-bearing (seeded runs, the simulator's A/B, every `rollEquipment` stream), so
a cosmetic hop that consumes one shifts every roll after it. Derive from the
item's or the victim's own hash, as the loot toss and the gore scatter do.

**ANYTHING THE APP DOES TO A RUN BEFORE ITS FIRST TICK IS A SESSION PARAMETER.**
That means a field on `RunParams`, a line in `createRunFromParams`
(`src/game/session-setup.ts`), and the matching field on `SessionParams` — never
a mutation after `createGame`. The app, the session and an arriving client all
build the same run from the same parameters, so a field only one of them applies
is a desync that presents as a replication bug.

**A NEW VERB THE APP MAY RUN AGAINST A RUN EXISTS TWICE, ON PURPOSE.**
`src/game/commands.ts` (arg shapes + the `case`) **and** `COMMANDS` in
`server/wire/protocol.ts` (the literal copy the allow-list reads, because that
leaf is read from the startup path where the budget forbids `@game/core`); the
drift test enforces the pair, then bump `PROTOCOL_VERSION`. Arguments are
SCALARS only. Call it from the app through `pwa/src/game/run-commands.ts`, never
by importing the engine function. `applyRunCommand` takes the ACTING HERO, from
the seat the session admitted the client into — never from a field on the frame.

**A READ OF "THE HERO" IN THE APP IS `localHero(state)`**
(`pwa/src/game/local-seat.ts`) — 0 offline and for the host.

**ANYTHING THAT ADDS OR REMOVES AN OBSTACLE MID-RUN MUST BUMP
`state.obstaclesVersion`.** The autopilot builds its nav grid once per level and
caches it; a wall that appears without the bump is a wall it routes straight
through.

**NOTHING IN THE FOG IS A TARGET — every automatic pick goes through
`clearOfFog(state, pos)`.** The main view does not draw a body standing in the
fog or in its frontier band, so a pass that picks its own mark without asking
(a new power, a turret, an ally, a second weapon) has the character firing into
blackness on the player's behalf. Reach is NOT the fog's business: weapons keep
their range, they just cannot reach past what has been walked — which is why the
autopilot measures a stand-off with `firingReach` rather than `weaponRangeFor`.
It lives in `src/game/fog.ts` and NOT in map.ts, because `src/menu.ts` re-exports
map.ts's grid arithmetic — so that module is inside the 170 KB budget and a
run-only read added there is spent from the startup path's allowance.
→ `docs/rendering.md`

**A RANGED WEAPON EATS AMMUNITION AND HAS NO `durability`; MELEE AND MAGIC ARE
THE EXACT OPPOSITE.** It is one trade, not two independent fields — a gun never
breaks, it runs dry — so a ranged def authors `ammo:` and no `durability:`, and
the item schema refuses either half being wrong. One round per TRIGGER PULL,
never per pellet. Everything that touches the pouch goes through
`src/game/items/ammo.ts`; a read of `player.ammo[...]` anywhere else is a cap,
an overflow remainder or a dry-swap that is about to disagree with the others.
→ `docs/game-content.md` → Ammunition

**A CRATE IS A WALL TO THE HORDE, SO ITS DENSITY IS A DIFFICULTY KNOB.** Nothing
but the hero jumps, so boxes strewn across ground the horde has to cross buy a
standing hero cover he did not earn — a modest scatter on the moon's open basin
was enough to make the idle-overrun benchmark unable to kill a motionless hero
on MEDIUM at all. Adding crates to a map means re-running
`tests/content/balance_test.ts`, not eyeballing the render.

**A NEW `EnemyDef` FIELD MUST BE ADDED TO `canonicalEnemyDef`**
(`defs/enemies/index.ts`), which rebuilds every def through a fixed field list
for V8 monomorphism — or it silently reads `undefined` with every check green.

**ANYTHING GORY IS GATED AT `goreAmount(family)`, AND THE GATE GOES WHERE THE
THING IS DECIDED, NOT WHERE IT IS DRAWN.** A gate at the draw call leaves the
state filling up invisibly. Everything "not safe for kids" hangs off the same
umbrella `nsfwAllowed()` — a new mature feature adds a check, **never a new
setting** — and it FAILS OPEN. → `gore-system`

**A MOD'S CATALOGS ARRIVE THROUGH `registerDefs`**, the same seam the engine's
test fixtures use, and a mod applies to a RUN rather than an install
(`restoreBaseDefs()`). A content change that adds or retires an id runs
`make mod-catalog` in the same commit. → `docs/modding.md`

**A CATALOG IS AUTHORED IN YAML, COMPILED, AND THE OUTPUT IS GITIGNORED.** Never
edit or commit anything under `src/generated/` or `pwa/src/generated/`.
→ the table below, and `docs/content-pipeline.md`

## Where new code goes

| Change type                                                         | Goes in                                                                                                                                                     |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Engine/gameplay logic specific to this game                         | `src/…` (framework-free TypeScript); exported from `src/index.ts` — add to `src/menu.ts` ONLY if the startup path needs it and it drags no simulation along |
| Generic engine code (usable by any game)                            | `src/lib/…` — imported as `@game/lib/*`; earmarked for oss-framework                                                                                        |
| App shell, rendering, PWA, game-specific UI                         | `pwa/src/…`                                                                                                                                                 |
| Generic React/UI game components                                    | `pwa/src/lib/…` — imported as `@ui/lib/*`                                                                                                                   |
| Native-only concern (haptics, audio session, IAP, cloud save)       | `native/src/…` — never leak it into `src/` or `pwa/`                                                                                                        |
| Desktop/Steam-only concern (window, Steam Cloud, overlay, firewall) | `electron/src/…` — same rule                                                                                                                                |
| The MOD SDK (format, compiler, examples, modder docs)               | `mod/…`                                                                                                                                                     |
| Generators, analyzers, previews, maintenance commands               | `scripts/…` — executable tooling only; authored data belongs under `content/`                                                                               |
| Tests                                                               | `tests/…`, named `*_test.ts`                                                                                                                                |
| Docs / examples / LLM prompts                                       | `docs/…` / `examples/…` / `prompts/<name>/<major>_<minor>_<patch>.md`                                                                                       |
| Mature, playtested generic code                                     | extract into `oss-framework`, then import the package                                                                                                       |

**Content is data.** Every catalog below is authored YAML under `content/`,
compiled by `make levels`. The skill named is the one to load before authoring.

| Authoring                                                     | File                                                                                                                         | Skill                                   |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| A level (mission — the venue MINUS its floor)                 | `content/levels/<id>.yaml`                                                                                                   | `level-design`                          |
| The map it is CARVED from, per run                            | `content/maps/<id>.yaml`                                                                                                     | `mapgen-improvement`, `map-improvement` |
| An enemy (minion/elite/boss)                                  | `content/enemies/<biome>/<id>.yaml`                                                                                          | `enemy-design`                          |
| A boss's set-piece MOVE                                       | `src/game/defs/enemies/abilities.ts` + `src/game/mechanics/<id>.ts`                                                          | `boss-abilities`                        |
| A boss's DEATH RITE                                           | `src/game/death-rites/` + `death:` on the def                                                                                | `boss-abilities`, `enemy-design`        |
| An item, a named unique, a set                                | `content/items/<rarity>/<id>.yaml`, `content/sets.yaml`                                                                      | `weapon-system`                         |
| The loot economy knobs                                        | `content/item_quality.yaml`, `content/item_rarity.yaml`                                                                      | `weapon-system`                         |
| A powerup (a timed pickup power)                              | `content/powerups.yaml`                                                                                                      | `visual-effects`                        |
| A new EFFECT a power can carry                                | `src/game/ability-effects.ts` + a block on `AbilityDef` + its `KIND_BLOCKS` entry                                            | `engine-system`                         |
| A passive TALENT                                              | `content/talents.yaml`                                                                                                       | `talent-fx`                             |
| A new PROC a talent can fire                                  | a block on `TalentDef` + `TALENT_BLOCKS` + one reader in `talent-effects.ts` + `PROC_BLOCKS` — never a branch on a talent id | `engine-system`, `talent-fx`            |
| A companion (who a spared elite joins you as)                 | `content/companions.yaml`                                                                                                    | `enemy-design`                          |
| An errand, its giver, its conversation                        | `content/quests/<id>.yaml`, `content/quest-givers.yaml`, `content/conversations/<id>.yaml`                                   | `quest-design`                          |
| A cutscene / a thought / a story item                         | `content/cutscenes/<id>.yaml`, `content/thoughts.yaml`, `content/story-items.yaml`                                           | `update-story`                          |
| A sprite                                                      | `content/sprites/<family>/<id>.yaml` (carries `plane: upright \| floor`)                                                     | `pixel-assets`, `art-improvement`       |
| A sound / a music track                                       | `content/sounds/<id>.yaml`, `content/music/<id>.yaml`                                                                        | `sound-effects`                         |
| The TITLE MENU's shape (a screen, a row, its order/icon/help) | `content/mainmenu.yaml`; the row's BEHAVIOUR in its `menus-*.ts` builder                                                     | `menu-design`                           |
| The hero level curve                                          | `content/leveling.yaml`                                                                                                      | `leveling-balance`                      |
| The campaign ladder / the autopilot's knobs                   | `content/ladder.yaml`, `content/bot.yaml`                                                                                    | `level-design`, `bot-improvement`       |
| A GORE piece, organ or family                                 | `content/sprites/effects/gib_*` + the pools in `gore-burst.ts` / `gore.ts`                                                   | `gore-system`                           |

| Presentation                                      | Goes in                                                                        | Reference             |
| ------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------- |
| A transient visual effect                         | `pwa/src/game/render/effects.ts` or a CSS overlay driver                       | `visual-effects`      |
| Blood, a cleave, a gib, a gore family             | `pwa/src/game/game-screen/` + `render/blood*`                                  | `gore-system`         |
| A weapon's signature slash/muzzle                 | `fx:` on the item + `pwa/src/game/weapon-elements.ts`                          | `weapon-system`       |
| The projection, the postfx, a gait, the loot aura | `pwa/src/game/render/`                                                         | `docs/rendering.md`   |
| A library page's content or look                  | `pwa/scripts/library/…` — the pages are build output and are NEVER hand-edited | `library-improvement` |

| Multiplayer                                       | Goes in                                                                                                                                                                           |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The session server, or the wire either end speaks | `server/…` (`server/wire/*` imports NOTHING; never anything under `pwa/`)                                                                                                         |
| A transport, admission, the router mapping        | `server/net/…` — Node builtins only                                                                                                                                               |
| Turning SNAPSHOTS back into a run                 | `server/client.ts` — the ONE client, read as `@game/client`. Never a second one: a bot client and the page must prove the same thing playable                                     |
| A headless player, or a soak                      | `server/bot-client.ts` + `scripts/bot-client.mjs`; the weather is `Impairment` on the UDP transport                                                                               |
| The shell's half (fork, supervise, hand the port) | `electron/src/net.ts` + `session-host.ts`; the page's half is `pwa/src/app/net-bridge.ts`                                                                                         |
| A HOST / JOIN screen                              | `content/mainmenu.yaml` + `title-screen/menus-net.ts` — STARTUP PATH, so never `pwa/src/game/net/`. A LIVE status row belongs to the RUN instead (`game-screen/SessionPanel.tsx`) |
| A rule about who may take, keep or move an item   | `src/game/trade.ts` when TWO players are involved; `items/` otherwise                                                                                                             |

Everything multiplayer: **`docs/multiplayer.md`** — the shipped architecture,
and the record of what still needs a human with hardware to accept.

## The content pipelines

One shape, twelve catalogs: **YAML under `content/` → validated against the live
engine catalogs → a gitignored module regenerated on every build.** Never edit or
commit a generated file. `make levels` runs the chain; the ORDER is a dependency
order and the reasoning, plus the per-catalog rules, is `docs/content-pipeline.md`.

| Catalog       | Source                                                    | Generator                 | Output                                              | Snapshot guard                |
| ------------- | --------------------------------------------------------- | ------------------------- | --------------------------------------------------- | ----------------------------- |
| Items         | `content/items/`, `item_*.yaml`                           | `generate-items.mjs`      | `src/generated/items.ts`                            | `item_roundtrip_test.ts`      |
| Story         | `content/cutscenes/`, `thoughts.yaml`, `story-items.yaml` | `generate-story.mjs`      | `src/generated/{cutscenes,thoughts,story-items}.ts` | —                             |
| Enemies       | `content/enemies/<biome>/`                                | `generate-enemies.mjs`    | `src/generated/enemies.ts`                          | `enemy_roundtrip_test.ts`     |
| Powerups      | `content/powerups.yaml`                                   | `generate-powerups.mjs`   | `src/generated/powerups.ts`                         | `powerup_roundtrip_test.ts`   |
| Sprites/atlas | `content/sprites/`                                        | `generate-assets.mjs`     | `pwa/src/game/assets/`                              | —                             |
| Levels        | `content/levels/`, `ladder.yaml`                          | `generate-levels.mjs`     | `src/generated/levels.ts`                           | `yaml_roundtrip_test.ts`      |
| Maps          | `content/maps/`                                           | `generate-maps.mjs`       | `src/generated/map-blueprints.ts`                   | `generated_maps_test.ts`      |
| Quests        | `content/quests/`, `quest-givers.yaml`, `conversations/`  | `generate-quests.mjs`     | `src/generated/quests.ts`                           | —                             |
| Talents       | `content/talents.yaml`                                    | `generate-talents.mjs`    | `src/generated/talents.ts`                          | `talent_roundtrip_test.ts`    |
| Companions    | `content/companions.yaml`                                 | `generate-companions.mjs` | `src/generated/companions.ts`                       | `companion_roundtrip_test.ts` |
| Leveling      | `content/leveling.yaml`                                   | `generate-leveling.mjs`   | `src/generated/leveling.ts`                         | —                             |
| Bot tuning    | `content/bot.yaml`                                        | `generate-bot-tuning.mjs` | `src/generated/botTuning.ts`                        | —                             |
| Sounds        | `content/sounds/`                                         | `generate-sounds.mjs`     | `pwa/src/generated/sounds{,-ui}.ts`                 | `sound_catalog_test.ts`       |
| Music         | `content/music/`                                          | `generate-music.mjs`      | `pwa/src/generated/music/`                          | `music_roundtrip_test.ts`     |
| Title menu    | `content/mainmenu.yaml`                                   | `generate-menu.mjs`       | `pwa/src/generated/menu.ts`                         | `menu_tree_test.ts`           |

Accept an intentional change with the matching `node scripts/update-*-snapshot.mjs`
— never by editing a fixture. **The sound, music and menu catalogs emit into the
APP's tree**, because the engine has no idea the game makes noise or has a title
screen.

Four artifacts are **committed and drift-tested against a fresh build**, so they
are regenerated in the same commit as the content change that moves them:
`mod/catalog.json` (`make mod-catalog`), `native/store/game-center-{achievements,leaderboards}.json`,
`electron/store/steam-achievements.json`.

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
  — keep all four in lockstep (they also carry `@game/core`, `@game/menu`,
  `@game/wire/*` and `@game/client`). Two more copies exist and both bite:
  `scripts/game-alias-loader.mjs` is what lets a plain `node` script import
  aliased modules at runtime, and `tests/content/net_reachability_test.ts`
  resolves them to walk the import graph — a new alias missing from either is a
  script that cannot start or a budget guard that silently stops following an
  edge.
- Installing `@niclaslindstedt/*` packages requires a `GITHUB_PAT` env var
  with `read:packages` (see `.npmrc`); CI falls back to the workflow token.

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

| When you change…                                                       | Update…                                                                   |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| game identity (title, domain, …)                                       | `game.config.json` only — the single source of truth; then `make icons`   |
| engine public API (`src/index.ts`)                                     | `docs/architecture.md`, `README.md` Usage                                 |
| the title menu (a screen, a row, an order, a page name)                | `content/mainmenu.yaml` only — the compiled tree is the one source        |
| how the picture is drawn (projection, postfx, gait, loot presentation) | `docs/rendering.md`                                                       |
| a catalog's compile pipeline, or a parity rule                         | `docs/content-pipeline.md`                                                |
| game content (levels, enemies, story)                                  | `docs/game-content.md`                                                    |
| a plot beat / the story as a whole                                     | `docs/story.md`, then push down — load `update-story`                     |
| story or dialogue text (any line)                                      | `docs/manuscript.md`, with `docs/story.md` above it — load `update-story` |
| a name (a mob, an item, a company)                                     | `docs/naming.md` if the RULE changes; otherwise just obey it              |
| the co-op architecture                                                 | `docs/multiplayer.md`                                                     |
| the mod format or SDK                                                  | `docs/modding.md`, `mod/FORMAT.md`, and `make mod-catalog` if ids moved   |
| Make targets / npm scripts                                             | `README.md` Usage, `CONTRIBUTING.md`, this file                           |
| deploy slots / pages workflow                                          | `docs/architecture.md`, `README.md`, `pwa/pwa-plugin.ts` `DEPLOY_SLOTS`   |
| config knobs (env vars, URL params, a developer setting)               | `docs/configuration.md`, `README.md` Configuration                        |
| PWA surface (manifest, icons, SW)                                      | `docs/architecture.md`; `make icons`, `make screenshots`                  |
| the shared art look (`STYLE_PREAMBLE`, a family anchor)                | `docs/art-style.md` — keep it and `STYLE_PREAMBLE` in step                |
| version anywhere                                                       | never by hand — `scripts/update-versions.sh` owns it                      |

The website must be regenerated whenever source-derived content changes
(OSS_SPEC §11.2): `pwa/scripts/extract-source-data.mjs` runs on every build and
fails if `src/version.ts` and `package.json` disagree.

## Story & dialogue — a three-tier chain

The story lives in three tiers, and changes flow **downward, never up**:

1. [`docs/story.md`](docs/story.md) — **the gist**: the whole plot in prose, in
   narrative order. The ground truth.
2. [`docs/manuscript.md`](docs/manuscript.md) — **the script**: every spoken
   line, monologue, caption and piece of found lore, verbatim.
3. `content/` — **the game**: the roster, items, cutscenes, thoughts, quests and
   story items that play the script.

When two tiers disagree, the **higher tier wins** — correct the lower one.

**LOAD THE `update-story` SKILL BEFORE TOUCHING ANY LINE THE GAME SPEAKS** — not
only when the plot moves. The unit is a LINE, not a beat: a retone, a second page
on a monologue, a bark, a merchant greeting, a quest offer, a companion's joining
words. Every one is transcribed in the manuscript, so every one owes the chain a
walk. **A PR that edits a line of dialogue and leaves `docs/story.md` and
`docs/manuscript.md` untouched is incomplete.**

**Changing the story is a two-step commitment.** If a change conflicts with what
the manuscript says, the manuscript must be updated too — but **only after the
user confirms it**. The user may pre-approve ("rewrite this speech and update the
manuscript"); otherwise, ask. Never silently edit a line and leave the manuscript
stale, and never rewrite the manuscript without that confirmation.

**THE CHAIN GOVERNS THE SHIPPED CAMPAIGN, AND ONLY IT.** A mod authors the same
files in the same format, and none of this applies to one: nobody governs a
stranger's script. A mod's story has no tier above it, is never filed into
`docs/story.md` or `docs/manuscript.md`, and must never be "corrected" to match
them. The rule is about ORIGIN, not format — the identical line in a mod's folder
is its author's and answers to nobody but the schema.

Brand strings (title, tagline) are **not** story — they live in
`game.config.json`. Loose UI copy is `pwa/src/game/copy.ts`: flavor, not story.

## Naming — invent it, don't borrow it

**Nothing in this game is named after a real person, company, product or
franchise — and that includes the near-miss pun.** The satire targets a
PHENOMENON and never a nameable party. That is both the honest version of the
joke and the only version that ships: an app store may refuse a game whose
enemies are a real company on its own content guidelines.

**A NAME IS A QUARTER OF IT.** Four things carry identity and they move together
or not at all: **the NAME** (id, display name, file stem, sprite stem); **the
VOICE** (dialogue, last words, barks, lore — a catchphrase or a verifiable
biographical fact is identification on its own); **the ART** (the grid AND its
`subject` slots — a silhouette identifies without a face, and a brand's COLOUR
SEQUENCE is protectable with no name attached); **the DESCRIPTION** (which ships
in the library AND drives the next regeneration, so a cleaned grid with a dirty
`subject` grows its likeness straight back).

**NAME THE ROLE, NOT THE PERSON** — THE FOUNDER, THE MODERATOR, THE FULFILLER.
The archetype is the funnier half anyway, and it does not date.

**Read [`docs/naming.md`](docs/naming.md) before naming anything** — it carries
what is safe (myth, trade vocabulary, historical events, the long dead, invented
brands), what to refuse and why, and the mechanical trap that defeated four
consecutive rename sweeps. This governs the shipped campaign; a mod's names are
its author's business, except `mod/examples/`, which is shipped content.

## Where a system's detail lives

This file is the router. When a task is about one system, its own document or
skill is the source of truth — load that, not a search of the tree.

| Looking for                                                                                                           | Read                                                |
| --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| The module map, the shells, the platform seams, the library, deployment                                               | `docs/architecture.md`                              |
| The projection, postfx, the canvas and its scale tiers, gaits, jumps, the loot toss and rarity aura, the hero doll    | `docs/rendering.md`                                 |
| Every catalog's compile pipeline, the generator order, the parity rules                                               | `docs/content-pipeline.md`                          |
| Naming anything                                                                                                       | `docs/naming.md`                                    |
| Co-op: the party, seats, XP share, loot mode, the wire, transports, admission, trade, reconnect, the dedicated server | `docs/multiplayer.md`                               |
| Mods: the format, `registerDefs`, load order, the catalog, the Workshop, `--mod`                                      | `docs/modding.md`, `mod/FORMAT.md`, `mod/AGENTS.md` |
| Settings, URL params, env vars, the DEVELOPER menu's inventory                                                        | `docs/configuration.md`                             |
| This game's plot, roster, venues and economy                                                                          | `docs/game-content.md`, `docs/story.md`             |
| The house art style                                                                                                   | `docs/art-style.md`                                 |
| Anything failing to install, build or connect                                                                         | `docs/troubleshooting.md`                           |

| Working on                                         | Load the skill                                          |
| -------------------------------------------------- | ------------------------------------------------------- |
| Generated maps, blueprints, a venue's feel         | `mapgen-improvement`, `map-improvement`, `level-design` |
| Errands, givers, conversations, campaign chains    | `quest-design`                                          |
| The title menu, a settings row, the developer menu | `menu-design`                                           |
| Blood, cleaves, gibs, gore families, the NSFW gate | `gore-system`                                           |
| A boss's set-piece move or death rite              | `boss-abilities`                                        |
| A transient effect, the effects gallery            | `visual-effects`                                        |
| Weapons, loot, uniques, the off-hand, signature FX | `weapon-system`                                         |
| The passive talent trees and their always-on looks | `talent-fx`                                             |
| Enemies, companions, presentation fields           | `enemy-design`                                          |
| Sprites and the pixel font                         | `pixel-assets`, `art-improvement`                       |
| Audio                                              | `sound-effects`                                         |
| The generated `/library/` site                     | `library-improvement`                                   |
| Balance, the XP curve, measuring a real run        | `simulate-run`, `leveling-balance`, `playtest`          |
| The autopilot                                      | `bot-improvement`                                       |
| Any spoken or written line                         | `update-story`                                          |

## Game development skills

Load the relevant `SKILL.md` **before** starting that kind of work — each one
carries the workflow, the quality bar and the traps for its subject.

| Skill                 | Use for                                                             |
| --------------------- | ------------------------------------------------------------------- |
| `new-game`            | Turning a clone of this repo into a new game/sequel                 |
| `engine-system`       | Adding/changing a gameplay system — the engine-first workflow       |
| `level-design`        | Adding a venue (the mission + the blueprint its map is carved from) |
| `map-improvement`     | Improving an EXISTING venue's design and feel                       |
| `mapgen-improvement`  | Improving the map GENERATOR, which lands on every venue at once     |
| `enemy-design`        | Adding or reworking a minion/elite/boss, or a companion             |
| `boss-abilities`      | Giving a boss a set-piece MOVE, or a death rite                     |
| `quest-design`        | An errand, its giver, its conversation, a campaign chain            |
| `weapon-system`       | Weapons, loot, tiers/affixes, named uniques, the off-hand           |
| `leveling-balance`    | How fast the hero levels — the XP curve and its pacing              |
| `simulate-run`        | MEASURING actual balance by running the real engine headlessly      |
| `pixel-assets`        | Creating or changing sprites, tiles, palettes, font glyphs          |
| `art-improvement`     | Finding and replacing the game's WORST art                          |
| `sound-effects`       | Synthesized SFX and the tracker-style music                         |
| `talent-fx`           | The passive talent trees and their always-on looks                  |
| `visual-effects`      | A transient effect — explosion, flash, aura, screen wash            |
| `gore-system`         | Blood, the floor, the hero's coat, cleaves, gibs, the NSFW gate     |
| `playtest`            | Verifying a change in the running game with the autoplay bot        |
| `bot-improvement`     | Improving the autopilot toward human-capability play                |
| `debug-game`          | Investigating a gameplay/render/input/audio bug                     |
| `test-scenario`       | Staging an EXACT in-game situation to repro, probe or eyeball       |
| `menu-design`         | The title menu, a settings row, the developer menu                  |
| `ui-review`           | A fit-and-finish pass over the UI at the nine reference viewports   |
| `store-shots`         | Regenerating the App Store / Play Store screenshot set              |
| `update-story`        | Writing, rewriting or retoning ANY line the game speaks             |
| `library-improvement` | Building or improving the generated `/library/` site                |

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
