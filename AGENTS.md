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

## Build and test commands

```sh
make build         # developer build
make test          # full test suite
make lint          # zero-warning linter
make fmt           # format in place
make fmt-check     # verify formatting (CI)
make assets        # regenerate in-game pixel assets + previews
make bump          # print the release bump derived from .changes/unreleased/
make changelog VERSION=X.Y.Z  # preview a release's CHANGELOG section
```

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

Two layers, one dependency direction:

- **`src/` — the engine.** Framework-free TypeScript: the simulation
  (steering, jumping, combat, XP/stats, loot, inventory) plus the content
  catalogs under `src/game/defs/` (levels, enemies, equipment — content is
  data, referenced by id). It must stay importable
  from any renderer; no React, no DOM assumptions beyond what a browser
  provides. `src/output.ts` is the central output module (§19.4) — all
  diagnostic output routes through it; raw `console.*` elsewhere fails lint.
- **`website/` — the app.** A Vite + React 19 PWA shell that mounts the
  engine (imported via the `@game/core` alias → `../src/index.ts`), renders
  it, and owns everything deploy-shaped: the service worker build
  (`website/pwa-plugin.ts`), manifest, icons, SEO surfaces, and the update
  toast. The app depends on the engine; the engine never imports from the
  app.

Deployment is three GitHub Pages slots on one origin (the `siteUrl` in
`game.config.json`, a custom domain on the GitHub Pages origin): `/` serves
the highest
`v*` tag (or `main` before the first release), `/preview/` serves every
`main` push, `/branch/` serves a manually parked branch persisted in
the `branch-deploy` orphan branch. `.github/workflows/pages.yml` builds all
slots into a single Pages artifact; each slot gets its own service worker and
a disjoint precache cache id (`website/src/app/pwa.ts`).

## Developer menu (hidden)

The title screen hides a **DEVELOPER menu** behind the moon Easter egg: a
long-press on the title moon (`MOON_HOLD_MS` in
`website/src/game/TitleScreen.tsx`) detonates it and latches
`developerUnlocked` in the persisted settings (`website/src/game/settings.ts`).
The detonation does nothing else — the player then opens SETTINGS on their own,
where a **DEVELOPER** row now appears (it stays available across launches once
unlocked). That screen offers **SELECT LEVEL** (the warp picker: pick any
difficulty and mission regardless of unlock state, skipping the intro), **VIEW
ARSENAL** (`ArsenalScreen.tsx` — a
scrollable gallery of every unique/legendary item, ordered by ilvl, each minted
via `mintUnique` and drawn through the shared `ItemCard.tsx` icon + card the
inventory tooltip reuses so the two never drift), a **BALANCE** subpage (see
below), a **DEBUG MODE** toggle
(`debug: "on" | "off"`, also persisted), and three feature flags. DEBUG MODE
shows the in-run FPS meter (`GameScreen.tsx` `showFps`, written to the DOM by
the render loop — the first probe for performance regressions) and is the hook
further developer diagnostics wire to via `getSettings().debug`. Keep it
distinct from the `?debug` URL param (console verbosity, `window.__game` /
`window.__scenario`, and the same FPS meter forced on — see
`docs/configuration.md`).

The **BALANCE** subpage holds ~10 runtime balance multipliers (leveling pace,
mob strength, loot percentages, …) so the game's balance can be probed without
editing `src/game/config.ts` and rebuilding. The engine side is
`src/game/tuning.ts` (`setBalanceTuning`, neutral 1 defaults, values clamped to
`[0, 100]`); each knob is applied at the ONE read site that owns its rule
(`grantXp`, `weaponDamageFor`, `spawnEnemy`, the drop ladder, `rollTier`,
`menaceSensitivity`, …), so it moves every surface of that rule together. Each
row is a **slider** (drag, tap the track, or steer with ←/→) spanning **0×
(system off) to 100×** the shipped tuning, where **1× is baseline** — never a
percentage. The track is exponential: its four quarters cover 0→1, 1→2, 2→10,
10→100, so the useful low end gets most of the travel. The mapping
(`sliderToBalance`/`balanceToSlider`), the snap grid, the `×` readout, and the
knob catalog (labels, blurbs) live in `website/src/game/balanceKnobs.ts`; the
drag track is the shared `@ui/lib/PixelSlider.tsx`. The values persist in the
settings (`balance` in `settings.ts`, applied on load like the other engine
flags) and a RESET ALL row restores the shipped 1× tuning. Keep the page around
ten knobs — one lever per system, not a config editor.

**Settings controls share three reusable pixel widgets** (generic React/UI, in
`website/src/lib/`, imported via `@ui/lib/*` for eventual extraction to
oss-framework): `PixelSlider.tsx` — the 0..1 drag track used by every slidable
row (the BALANCE knobs and the SOUND music/SFX volumes); `PixelToggle.tsx` — a
pixel ON/OFF switch drawn as the slider frozen at its two ends (same amber track

- blocky knob; off is empty/knob-left, on is filled/knob-right) used by every
  row that reads as a straight on/off (DEBUG MODE, AUTO LEVEL STATS, CHARACTER
  WEAPON, WEAPON SWING, VIBRATION, XP ON KILL); and `PixelCheckbox.tsx` — a pixel
  tick-box (an empty grey square that fills with a smaller amber square when
  checked) used by every **multi-select** row where one picks one of MANY rather
  than flipping a setting (the EXPORT CHARACTER roster picker). The control is
  **right-aligned** to a shared edge down the right of the menu (the label/blurb
  column stretches to the block width — see `.title-menu .menu-item-text`). All
  three are presentational; `TitleScreen.tsx` owns the menu wiring via a
  `MenuEntry`'s `slider`/`toggle`/`check` field, and the arrow keys steer the
  focused row's control (←/→). Pick the widget by meaning: a **switch** for a
  straight on/off setting, a **tick-box** for a pick-one-of-many list. Two-mode
  rows that are NOT on/off (MOUSE follow/hold, POWERUPS on-pickup/manual, GEAR
  equip/bag, POWERUPS left/right corner) stay label-cycling buttons — a switch
  implies enabled/disabled, which those don't.

The feature flags gate recently-added systems so they can be toggled at
runtime. All are **opt-in — off by default** (the app applies the off state on
load); a developer turns them on from the DEVELOPER menu:

- **AUTO LEVEL STATS** (`autoLevelStats: "on" | "off"`) gates the automatic
  per-level base-stat growth (`src/game/leveling.ts`). The app applies it to
  the engine via `setAutoStatGainsEnabled` from `settings.ts` (mirroring how
  audio/haptics are applied). Off makes `autoGainAt` return 0, which cascades
  through `baseStatBonus`, `levelStatGains`, and `autoPowerScale` — so the
  hero's free gains AND the horde's compensating hp scale (menace.ts) switch
  off together and the balance stays whole. It gates simulation, so it needs an
  engine-side setter; a website-only flag would leave the engine unaware.
- **CHARACTER WEAPON** (`characterWeapon: "on" | "off"`) gates drawing the
  held weapon on the field hero sprite. The worn armor always draws — only the
  weapon is gated, since posing/swinging it convincingly is the hard part. It
  is a pure render concern: `render.ts` reads the flag and passes `{ weapon }`
  to `playerDollLayers` (`paper-doll.ts`), which drops the held weapon (but
  keeps the armor) when off. The HUD avatar and inventory portrait always pass
  the weapon on, so only the field character changes.
- **WEAPON SWING** (`weaponSwing: "on" | "off"`) is experimental: it animates
  the field hero's held weapon on each attack — a blade whips through its slash
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
  Like CHARACTER WEAPON it is a pure render concern: GameScreen captures the
  hero's own `swing`/`shot` events into a `PlayerAction` (matched to his
  position so a companion's blow is ignored), `render.ts` `drawPlayer` reads the
  flag and poses the weapon layer via `weaponPose`. It only bites when CHARACTER
  WEAPON is on too — there is no held weapon to swing otherwise.

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
  shot. It's all a website-side catalog (the engine knows nothing of it);
  un-listed weapons keep the plain class look, so the catalog grows one entry at
  a time. Reusable elemental kits (FIRE/HOLY/FROST/STORM/VOID/BLOOD/VENOM for
  slashes; FLAME/HOLY/STORM/COSMIC/FROST/VENOM/DEATH/SOLAR/TECH for shots) cover
  most weapons. The engine's shared `nova` crit-AoE is NOT themed (it carries no
  weapon attribution).

  Tune and author all of it with the `weapon-swing` preview script
  (`website/scripts/weapon-swing.mjs`): `poses <weapon>` pins the swing/shot frame
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
  `src/lib/` for engine-side code, `website/src/lib/` for React/UI code —
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
  `website/tsconfig.json`, `vitest.config.ts`, and `website/vite.config.ts`
  — keep all four in lockstep.
- Installing `@niclaslindstedt/*` packages requires a `GITHUB_PAT` env var
  with `read:packages` (see `.npmrc`); CI falls back to the workflow token.

## Where new code goes

| Change type                                 | Goes in                                                                                                |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Engine/gameplay logic specific to this game | `src/...` (framework-free TypeScript)                                                                  |
| Generic engine code (usable by any game)    | `src/lib/...` — imported as `@game/lib/*`; earmarked for extraction to oss-framework once mature       |
| App shell, rendering, PWA, game-specific UI | `website/src/...`                                                                                      |
| Generic React/UI game components            | `website/src/lib/...` — imported as `@ui/lib/*`; earmarked for extraction to oss-framework once mature |
| Mature, playtested generic code             | extract into `oss-framework`, then import the package here                                             |
| Tests                                       | `tests/...` (engine) — name them `*_test.ts`                                                           |
| Docs update                                 | `docs/...`                                                                                             |
| Examples                                    | `examples/...`                                                                                         |
| LLM prompt                                  | `prompts/<name>/<major>_<minor>_<patch>.md` (see `prompts/README.md`)                                  |

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

| When you change…                      | Update…                                                                                                    |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| game identity (title, domain, …)      | `game.config.json` only — the single source of truth; then `make icons` (OG art)                           |
| engine public API (`src/index.ts`)    | `docs/architecture.md`, `README.md` Usage                                                                  |
| game content (levels, enemies, story) | `docs/game-content.md` (this game's walkthrough; a sequel replaces it wholesale)                           |
| a plot beat / the story as a whole    | `docs/story.md` (the gist — top of the chain), then push down (see **Story & dialogue** below)             |
| story or dialogue text (any line)     | `docs/manuscript.md` — the verbatim script; `docs/story.md` sits above it (see **Story & dialogue** below) |
| Make targets / npm scripts            | `README.md` Usage, `CONTRIBUTING.md`, this file                                                            |
| deploy slots / pages workflow         | `docs/architecture.md`, `README.md` Play table, `website/pwa-plugin.ts` `DEPLOY_SLOTS`                     |
| config knobs (env vars, URL params)   | `docs/configuration.md`, `README.md` Configuration                                                         |
| PWA surface (manifest, icons, SW)     | `docs/architecture.md`, regenerate icons via `make icons`                                                  |
| version anywhere                      | never by hand — `scripts/update-versions.sh` owns it                                                       |

The website must be regenerated whenever source-derived content changes
(§11.2): `website/scripts/extract-source-data.mjs` runs on every build and
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
- `src/game/defs/levels/*.ts` — each `LevelDef`'s `intro` (the hero's opening
  monologue) and `foes` label.
- `src/game/defs/enemies/*.ts` — every elite/boss `dialogue` (arrival scene) and
  `lastWords` (spoken on death).
- `src/game/defs/thoughts.ts` — the hero's inner monologues, pinned to a kill via
  a `LevelDef.firstKillThoughts` entry.
- `src/game/defs/story.ts` — `lore` pages on story items (keycards, dossiers,
  recovered hardware).
- `website/src/game/copy.ts` — loose UI copy (how-to-play); flavor, not story.
- Brand strings (title, tagline) are **not** story — they live in
  `game.config.json` (see Parity rules below).

The engine that plays these lines is `src/game/story.ts`; the overlays that
render them are `website/src/game/DialogueOverlay.tsx` and `CutsceneOverlay.tsx`.

## Parity / cross-cutting rules

- **Game identity is centralized.** `game.config.json` (repo root) is the one
  source for the title, tagline, description, `siteUrl`, `repoUrl`,
  `storagePrefix`, and `cacheIdPrefix`. App code reads it through
  `website/src/identity.ts` (`IDENTITY`, `FULL_TITLE`, `storageKey`); node
  build scripts import the JSON directly; `website/index.html` and
  `manifest.webmanifest` are filled/generated from it at build time by
  `website/pwa-plugin.ts`. Never re-hardcode a brand string elsewhere.
- `website/pwa-plugin.ts` `DEPLOY_SLOTS`, `website/src/app/pwa.ts`
  `cacheIdForBase`, and the slot paths in `.github/workflows/pages.yml` must
  agree — a mismatch makes slots clobber each other's precache or serve the
  wrong shell.
- `src/version.ts`, root `package.json`, and `website/package.json` versions
  must match; `tests/version_test.ts` and the extract script both enforce it.
- Icons are generated from `website/public/icon.svg` only (`make icons`) —
  never edit the PNGs.
- In-game pixel assets (the sprite atlas, tiles, the UI font atlas) are
  generated from the `website/scripts/sprite-data/` family modules +
  `asset-tools/` only (`make assets`) — never edit the files under
  `website/src/game/assets/`. Those files are **gitignored and regenerated
  on every build** (like `src/generated/`, §11.2): `npm run assets` runs
  ahead of `vite`, `tsc`, and `vitest`, so the pixel grids are the sole
  committed source of truth. Never commit `website/src/game/assets/` — the
  binary atlas is a build output, not a reviewable artifact.
- The **pixel font glyph set** is hand-defined in
  `website/scripts/asset-tools/font.mjs` (the `GLYPHS` map — `#` lit, `.`
  transparent, 3×5 variable-width cells); `make assets` packs it into the font
  atlas + metrics that `PixelText`/`pixel-font.ts` render at runtime. Lookups
  uppercase the character, so anything `PixelText` draws must have a glyph key
  there or it falls back to `?`. **Before rendering a new character** (a symbol
  like `×`, an accented letter, punctuation), add its glyph to `GLYPHS` (and to
  the specimen line in `generate-assets.mjs`) and rerun `make assets` — don't
  work around a missing glyph with a substitute. Verify the new glyph in the
  running UI, not just the specimen preview.

## Game development skills

The repo ships a skill for each recurring game-development activity, so the
workflow (and its quality bars) stays consistent across sessions. Load the
relevant `SKILL.md` before starting that kind of work:

| Skill              | Use for                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `new-game`         | Turning a clone of this repo into a new game/sequel — the ordered bootstrap: rename via `game.config.json`, strip content, rebuild on the same engine.                                                                                                                                                                                                                                                           |
| `engine-system`    | Adding/changing gameplay systems (enemies, weapons, items, rules) — the engine-first workflow: config → types → step → events → tests → presentation.                                                                                                                                                                                                                                                            |
| `level-design`     | Adding a new level/mission (or reworking one) — the `LevelDef` anatomy, campaign registration and unlock order, spawn/wave budgets, the cumulative loot-pool rule, XP/arrow-cap pacing wiring (`scripts/leveling-curve.mjs --by-level`), tiles/music/story surfaces, and the checker + test battery a new map must pass.                                                                                         |
| `enemy-design`     | Adding or reworking an enemy (minion/elite/boss) — the `EnemyDef` anatomy, picking hp/damage against the scaling model (`LEVELING.refMobHp` anchor), mechanics/phases, manuscript-governed dialogue/lastWords, spareable companions, loot signatures, auto-derived wound sprites, and the content tests that bite when a piece is missing.                                                                       |
| `weapon-system`    | Adding/rebalancing weapons and loot (bases, level requirements, tiers/affixes, drop rules, projectile behaviors) — the def-first workflow with two verification loops: the damage-budget calculator (`scripts/weapon-budget.mjs`), the stat checker (`scripts/weapon-stats.mjs`), and the arsenal sheet (`website/scripts/weapon-sheet.mjs`).                                                                    |
| `leveling-balance` | Tuning how fast the hero levels — the XP curve, kills-per-level pacing, the level cap, the onboarding ramp, the diminishing-returns curve on stats, the per-map XP caps — via the kills-per-level model and the calculator (`scripts/leveling-curve.mjs`), then a simulated/bot run to measure the real kill rate.                                                                                               |
| `simulate-run`     | Measuring ACTUAL balance by running the real engine headlessly (`scripts/simulate-run.mjs`; engine side `src/sim/simulate.ts`): whole levels or whole campaigns easy → JESUS with the autopilot, auto-equip, and loadout carry, the hero immortal (deaths booked, never run-ending) — reporting hero/mob hp, damage per hit dealt and taken, drops, weapon swaps, deaths, and XP withheld by the per-map caps.   |
| `pixel-assets`     | Creating or changing sprites, tiles, palettes, animations, or pixel-font glyphs — the generate → look → evaluate → loop cycle.                                                                                                                                                                                                                                                                                   |
| `art-improvement`  | Finding and replacing the game's WORST art — the audit funnel (`website/scripts/art-audit.mjs`): numbered sheets per level or of the item catalog, shortlist 30 → 20 → 10, five manuscript-grounded concepts per finalist plus two refinements, an in-game pose check of each stageable winner (frozen `?scenario=`), per-candidate commits, then a numbered before/after sheet the user votes on before the PR. |
| `sound-effects`    | Adding or tuning synthesized WebAudio SFX — the sound vocabulary, mixing rules, and audition loop.                                                                                                                                                                                                                                                                                                               |
| `playtest`         | Verifying changes in the running game and tuning game feel with the autoplay bot (`website/scripts/playtest.mjs`).                                                                                                                                                                                                                                                                                               |
| `debug-game`       | Investigating gameplay/render/input/audio bugs — deterministic seed repros, `?debug` + `window.__game`, failing-test-first fixes.                                                                                                                                                                                                                                                                                |
| `test-scenario`    | Staging an exact in-game situation to reproduce a bug, probe fps, or eyeball a context — the `?scenario=` URL param / `applyScenario` spec (place the hero at the boss or merchant, set hp/gear, clear the field, spawn mob rings — pre-wounded if asked, lay out ground items, freeze the world into a pose) plus the FPS meter (DEBUG MODE or `?debug`).                                                       |
| `ui-review`        | A fit-and-finish pass over the game's UI (screens, modals, popups, toasts) — the screenshot-audit loop: capture every surface at the nine reference viewports (`website/scripts/ui-shots.mjs`), judge against the quality bar, unify off-skin surfaces, fix clipping/overflow, verify with re-captures.                                                                                                          |

## Maintenance skills

Per §21 of `OSS_SPEC.md`, this repo ships agent skills for keeping drift-prone artifacts in sync with their sources of truth. Skills live under `.agent/skills/<name>/` and are also accessible via the `.claude/skills` symlink.

| Skill            | When to run                                                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `maintenance`    | When several artifacts have likely drifted at once — umbrella skill that runs every `update-*` skill in the correct order.        |
| `update-docs`    | After any change to the public API, configuration keys, or error messages.                                                        |
| `update-readme`  | After any change that alters user-visible behavior, commands, or install instructions.                                            |
| `update-website` | After changes that affect the deployed app's SEO surfaces or source-derived content under `website/`.                             |
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
