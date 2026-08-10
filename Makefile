.PHONY: lua-vm build test lint fmt fmt-check shellcheck actionlint release clean docs website website-dev icons screenshots assets install changelog bump store-preflight store-metadata store-shots store-sweep store-page-shot store-achievement-art store-game-center store-steam-achievements sim-bench drive-bench town gallery sheet mod-check mod-catalog unique-check tauri tauri-test tauri-lint tauri-fmt desktop-tauri-steam desktop-tauri-dist sync sync-merge sync-continue sync-abort sync-cleanup

build:
	npm run build

# `make test ARGS="--shard=1/3"` forwards to vitest — how CI splits the suite
# across parallel jobs without anyone having to bypass the pretest rebuild.
test:
	npm test -- $(ARGS)

lint:
	npm run lint

fmt:
	npm run fmt

fmt-check:
	npm run fmt:check

release:
	npm run build

# Both compiled catalogs go, not just the app's: `engine/generated/` is the same
# kind of thing (gitignored, rebuilt by `npm run levels` on the next build) and
# leaving it behind meant a "clean" tree still carried the engine's whole
# compiled content tree. `src/generated/` is that directory's RETIRED path —
# the root source tree was renamed src/ -> engine/ (#1046), and a checkout
# cannot delete an ignored directory, so a working copy that had built before
# that commit still holds a stale copy. This is the command that removes it.
clean:
	rm -rf node_modules pwa/node_modules pwa/dist pwa/src/generated engine/generated src/generated site
	@rmdir src 2>/dev/null || true

install:
	npm install

shellcheck:
	shellcheck scripts/*.sh

actionlint:
	actionlint -color

docs:
	@echo "see docs/"

# The website IS the game (OSS_GAME_SPEC §11.4) — these build/serve the deployed app.
website:
	npm install && npm run build --workspace pwa

website-dev:
	npm install && npm run dev --workspace pwa

# Regenerate every raster icon + the OG card from pwa/public/icon.svg (§11.4.2).
icons:
	npm run icons

# The manifest's install-prompt screenshots — REAL frames of the running game
# (pwa/scripts/generate-screenshots.mjs). Needs a build to serve and Playwright
# installed ephemerally (`npm install --no-save playwright`), like the playtest
# harness. Re-run after an art pass or a HUD change.
screenshots:
	npm run screenshots --workspace pwa

# Regenerate in-game pixel assets (sprites, font atlas, previews) from their
# programmatic sources — see the pixel-assets skill.
assets:
	npm run assets

# Compile the YAML level tree (content/levels/*.yaml) into the engine's
# generated level catalog — see the level-design skill. Also runs inside
# `make assets`; this target is the fast path when only a level changed.
levels:
	npm run levels

# The Lua VM, compiled to plain ESM for the SHIPPED mod compiler — the desktop
# shell's main process has no TypeScript, and the script validator IS the
# engine's own interpreter (see scripts/build-lua.mjs). Runs inside
# `npm run electron:*`; this target is for checking it on its own.
lua-vm:
	node scripts/build-lua.mjs

# Compile a MOD — the same validator the desktop game runs on every mod it
# loads, so a mod that passes here is a mod the game accepts. See mod/README.md.
# `make mod-check DIR=mod/examples/greenhouse`
mod-check:
	@node mod/tools/cli.mjs check $(or $(DIR),mod/examples/greenhouse)

# The UNIQUE authoring checker — every named relic's base resolves, its bonus
# discipline holds, its ilvl matches the model, the per-slot armor ladder never
# steps down, and every relic has exactly ONE home in the drop tables (one boss,
# one level's world table, or one stall). See the `weapon-system` skill.
# Exits non-zero on an ERROR; `ARGS="--strict"` fails on a WARN too.
#
# It reads the COMPILED catalogs, so it needs a built content tree — run
# `make levels` first if the tree is cold. CI runs it in the lint job right
# after `make lint`, which has already built the content: calling an npm entry
# point here instead would recompile the whole catalog for nothing.
unique-check:
	node scripts/unique-check.mjs $(ARGS)

# Regenerate mod/catalog.json — every id a mod may reference. Committed and
# drift-tested, so a content change that adds or retires an id runs this in the
# same commit.
mod-catalog:
	node mod/tools/catalog.mjs

# Benchmark the headless simulator itself — the balance team's inner loop is
# driven thousands of times a day, so its speed is a tracked number. Replays
# fixed-seed levels in-process and reports the best-of-N cpu time per case
# (ARGS="--json before.json" / ARGS="--compare before.json" to A/B a change).
# The report digest is compared too: a speedup that moves a number is a
# behavior change, not a speedup.
sim-bench:
	node scripts/simulate-bench.mjs $(ARGS)

# Measure THE DRIVE — N seeds a difficulty rung, played by the shipped
# auto-driver, reporting arrival rate, trip time, bodies and ending wear. The
# closing loop of any change to the road, the crowd, the traffic or the impact
# model; seconds to run, so sweep freely.
# `make drive-bench ARGS="--seeds 100 --difficulty jesus"`
# `make drive-bench ARGS="--straight 0.8"` is the same road with NOBODY steering.
drive-bench:
	node scripts/drive-bench.mjs $(ARGS)

# LOOK AT THE TOWN on the road to GOODCO — the real planner, at five stops along
# the leg, composed the way the game composes it and written as a sheet PNG. The
# buildings are ASSEMBLED at runtime (engine/game/drive/town-plan.ts), so there is
# no file anywhere whose contents are what the player sees; this is the only way
# to judge the street rather than a wall.
# `make town ARGS="--shells"` is every archetype in every colourway instead.
# `make town ARGS="--at 0.5"` is one stretch, in detail.
town:
	node scripts/town-viewer.mjs $(ARGS)

# LOOK AT AN EFFECT — the effects gallery, captured as a filmstrip PNG. THE
# review surface for anything visual: every explosion, cleave, gib, aura and
# road collision is staged as a real fullscreen situation and replayed, so a
# change to any of them is judged from a picture rather than from the diff.
# `make gallery ARGS="--only cleave,gib --strip 6"` is two exhibits, six frames
# each; add `--speed 0.125` for the slow motion a burst needs to be readable.
# It starts and stops its own dev server unless you pass `--url`.
gallery:
	node pwa/scripts/effects-gallery.mjs $(ARGS)

# LOOK AT A SCORE — one of `content/music/*.yaml` engraved as sheet music, one
# staff per voice, with a SPECTRUM under every system. THE review surface for
# anything musical, and the counterpart of the gallery above: a track is
# otherwise eight hundred lines of note tokens that can only be judged by
# playing the whole two minutes and remembering. On the page a section's shape
# is one glance — whether a melody has a contour or merely wobbles, whether a
# line ever breathes — and the strip under it answers the half a staff cannot:
# how loud, in which band, and which two voices are in each other's way.
# `make sheet ARGS="overdue"` is one track; `--all` is every one this build has.
# `--pattern=b` is one section drawn big, which is what to read when the whole
# score comes out too tall to see.
sheet:
	node scripts/music-sheet.mjs $(ARGS)

# Render an annotated top-down map of a level for game-design review —
# `make map LEVEL=mars` (add ARGS="--actual --seed 1 --heatmap"). See the
# level-design skill.
map:
	npm run map --workspace pwa -- $(LEVEL) $(ARGS)

# Render the CLEAN high-res LAYOUT BLUEPRINT of a level — the first thing to
# LOOK at to understand a map: `make map-layout LEVEL=moon` (add ARGS="--all"
# or "--seed 1"). See the map-improvement / level-design skills.
map-layout:
	npm run map-layout --workspace pwa -- $(LEVEL) $(ARGS)

# Pass the planned version: `make changelog VERSION=0.2.0`. Consumes the
# fragments in .changes/unreleased/ — run inside a scratch branch or
# revert afterwards if you only wanted a preview.
changelog:
	@test -n "$(VERSION)" || { \
		echo "usage: make changelog VERSION=X.Y.Z"; exit 2; \
	}
	node scripts/release/collate-changelog.mjs $(VERSION)

# Print the semver bump (patch/minor/major) the release workflow will
# auto-derive from the current .changes/unreleased/ fragments. Read-only
# — touches nothing.
bump:
	@node scripts/release/compute-bump.mjs

# Check that this checkout is actually wired up to an App Store record: the
# app id and team in native/eas.json, the credentials in native/.env, the
# listing, and the portal entries the game reports into. Read-only. See
# native/RELEASING.md. `make store-preflight ARGS="--now"` narrows it to the
# items that wait on no store account — the work doable before an enrollment
# clears.
store-preflight:
	@node scripts/store-preflight.mjs $(ARGS)

# Compile the App Store listing (native/store/listing.yaml) into the
# store.config.json that `eas metadata:push` uploads, validating every one of
# Apple's length limits on the way. See native/store/README.md.
store-metadata:
	node scripts/generate-store-metadata.mjs

# Capture the store screenshot set — the real game, staged into fixed moments
# and shot at App Store Connect's exact rasters, captioned in the game's own
# pixel font. Needs the dev server on :5199 and playwright installed; see
# native/store/README.md for the full recipe.
store-shots:
	node pwa/scripts/store-shots.mjs $(ARGS)

# Create/update the Game Center achievements and leaderboards in App Store
# Connect from the two committed manifests, through its own API — 91 entries
# that would otherwise be 91 web forms, each with an id the portal silently
# drops if it is wrong. Prints the work list and writes NOTHING by default;
# `make store-game-center ARGS="--apply"` pushes it. Needs the App Store
# Connect API key `fastlane metadata` already uses (native/.env).
store-game-center:
	node scripts/game-center-push.mjs $(ARGS)

# The Steam half of the same job, split where Valve splits it: the partner site
# has no API for CREATING an achievement definition, so this prints the 86 rows
# as a paste-ready worksheet — the form's own columns, both icon paths filled in
# — and then reads them back with ARGS="--verify" and names every id that is
# missing or mistyped. Verifying needs STEAM_WEB_API_KEY (the publisher key).
# `make store-steam-achievements ARGS="--format tsv --out /tmp/rows.tsv"`
store-steam-achievements:
	@node scripts/steam-achievements-portal.mjs $(ARGS)

# Cut the achievement artwork both portals require out of the game's own sprite
# atlas — a 1024px image per Game Center achievement, and Steam's achieved +
# locked 64px pair — so a portal badge is the same picture the in-game shelf
# shows. Needs `npm run assets` to have built the atlas.
# `make store-achievement-art ARGS="--only steam"`
store-achievement-art:
	node scripts/achievement-art.mjs $(ARGS)

# Explore WHEN to shoot: sample one staged recipe at a matrix of delays and
# contact-sheet them, so the frame is picked by eye instead of guessed.
# `make store-sweep ARGS="--shot nuke"`, then narrow with
# `ARGS="--shot nuke --around 90 --span 120"`. See the store-shots skill.
store-sweep:
	node pwa/scripts/store-shot-sweep.mjs $(ARGS)

# Render the internal Steam listing mock as one COMPLETE page image. The script
# opens the checked-in HTML directly, waits for every raster, and uses
# Playwright's full-page capture rather than stopping at the viewport fold.
# `make store-page-shot ARGS="--width 1440 --out /tmp/steam-page.png"`
store-page-shot:
	node electron/store/preview/screenshot.mjs $(ARGS)

# ---------------------------------------------------------------------------
# Desktop packaging
# ---------------------------------------------------------------------------
#
# Five capabilities are decided when the binary is PACKAGED — they belong to
# the build, not to the machine that runs it — and each target below says which
# ones its output carries:
#
#   ENABLE_MULTIPLAYER=1   sessions, the server browser, the direct door
#   ENABLE_MODS=1          the Workshop and the local mod folder
#   ENABLE_UPNP=1          may ask the router to forward the bound port
#   ENABLE_VOICE=1         voice chat in a session — opens the microphone
#   ENABLE_LICENSED=1      sessions it hosts may admit players at all
#
# VOICE is off in a plain download on purpose rather than by omission: it opens
# a microphone and makes the host relay every speaker to every listener, so the
# depot build carries it and a download asks for it explicitly. It needs
# ENABLE_MULTIPLAYER — voice travels inside a session, and the shell refuses
# the pairing rather than granting a microphone nothing can talk into.
#
# Unset means off in a packaged target; a build from sources with no switches
# at all keeps everything, so a checkout is always the whole game.
#
# `make desktop-steam` is what goes to a depot; `make desktop-dist` is a plain
# download (installers and archives rather than a depot directory).
# `PLATFORM=win|mac|linux` picks one, and the default builds for this machine.

.PHONY: desktop-steam desktop-dist

DESKTOP_SCRIPT = release$(if $(PLATFORM),:$(PLATFORM),)

desktop-steam:
	GIS_STAMP_CAPABILITIES=1 \
	GIS_ENABLE_MULTIPLAYER=$(or $(ENABLE_MULTIPLAYER),1) \
	GIS_ENABLE_MODS=$(or $(ENABLE_MODS),1) \
	GIS_ENABLE_UPNP=$(or $(ENABLE_UPNP),1) \
	GIS_ENABLE_VOICE=$(or $(ENABLE_VOICE),1) \
	GIS_ENABLE_LICENSED=$(or $(ENABLE_LICENSED),1) \
	npm --prefix electron run $(DESKTOP_SCRIPT)

desktop-dist:
	GIS_STAMP_CAPABILITIES=1 \
	GIS_PACKAGE_PROFILE=standalone \
	GIS_ENABLE_MULTIPLAYER=$(or $(ENABLE_MULTIPLAYER),0) \
	GIS_ENABLE_MODS=$(or $(ENABLE_MODS),0) \
	GIS_ENABLE_UPNP=$(or $(ENABLE_UPNP),0) \
	GIS_ENABLE_VOICE=$(or $(ENABLE_VOICE),0) \
	GIS_ENABLE_LICENSED=$(or $(ENABLE_LICENSED),0) \
	npm --prefix electron run $(DESKTOP_SCRIPT)

# ---------------------------------------------------------------------------
# The Tauri desktop shell
# ---------------------------------------------------------------------------
#
# A SECOND desktop wrapper around the same built website, beside electron/ and
# not instead of it. `tauri/README.md` is the tree; `docs/desktop-shells.md` is
# how the two are held against each other and what decides which one ships.
#
# It is Rust, so it has its own toolchain and its own linter, and none of it is
# on the root suite's path: `make test` and `make lint` stop at this tree's edge
# exactly as they stop at electron/'s. These targets are how it is checked.

.PHONY: tauri tauri-test tauri-lint tauri-fmt

# Build the site into tauri/webroot/, compile the shell, and launch it.
tauri:
	npm run tauri -- $(ARGS)

# The decision layer's whole test suite, and DELIBERATELY only that crate:
# `adastrail-shell` depends on no GUI toolkit and no Steam SDK, so this target
# runs on an ordinary CI runner with a Rust toolchain and nothing else. The app
# crate has no tests of its own by design (every decision lives in the library),
# and compiling it needs the platform's webview development libraries — which is
# what `make tauri-lint` and `make tauri` are for.
tauri-test:
	npm run tauri:test

# clippy at zero warnings, the peer of `make lint` for this tree. This one DOES
# need the webview libraries: it checks both crates.
tauri-lint:
	npm run tauri:lint

# rustfmt in place, the peer of `make fmt`.
tauri-fmt:
	npm --prefix tauri run fmt

# ---------------------------------------------------------------------------
# Packaging the Tauri shell
# ---------------------------------------------------------------------------
#
# The peers of `desktop-steam` / `desktop-dist` above, reading the SAME five
# capability switches — one vocabulary drives both shells, so nobody has to
# learn a second one. Here they are baked into the machine code at compile time
# (`tauri/src-tauri/src/stamp.rs`) rather than written into a packaged manifest,
# which is the one place this shell is stricter than the Electron one: an
# installed copy has nothing to edit.
#
# `make desktop-tauri-steam` produces a DEPOT DIRECTORY, because that is what
# Steam uploads and its client owns installing. `make desktop-tauri-dist`
# produces the platform's own installers and archives for a plain download.
#
# A store build must also set GIS_STEAM_APP_ID — the packaging script refuses to
# ship a build still pointed at Valve's Spacewar test app unless it is told to.
#
# NOTE: `electron/` is still the release package — see docs/desktop-shells.md
# for what the choice between the two turns on.

.PHONY: desktop-tauri-steam desktop-tauri-dist

desktop-tauri-steam:
	GIS_STAMP_CAPABILITIES=1 \
	GIS_ENABLE_MULTIPLAYER=$(or $(ENABLE_MULTIPLAYER),1) \
	GIS_ENABLE_MODS=$(or $(ENABLE_MODS),1) \
	GIS_ENABLE_UPNP=$(or $(ENABLE_UPNP),1) \
	GIS_ENABLE_VOICE=$(or $(ENABLE_VOICE),1) \
	GIS_ENABLE_LICENSED=$(or $(ENABLE_LICENSED),1) \
	npm run tauri:package -- $(ARGS)

desktop-tauri-dist:
	GIS_STAMP_CAPABILITIES=1 \
	GIS_ENABLE_MULTIPLAYER=$(or $(ENABLE_MULTIPLAYER),0) \
	GIS_ENABLE_MODS=$(or $(ENABLE_MODS),0) \
	GIS_ENABLE_UPNP=$(or $(ENABLE_UPNP),0) \
	GIS_ENABLE_VOICE=$(or $(ENABLE_VOICE),0) \
	GIS_ENABLE_LICENSED=$(or $(ENABLE_LICENSED),0) \
	npm run tauri:package:dist -- $(ARGS)

# ---------------------------------------------------------------------------
# Catching a branch up with main
# ---------------------------------------------------------------------------
#
# Park the branch at backup/<branch>-premerge, FETCH the base, then rebase (or
# merge) onto what was just fetched — in that order, which is the whole point.
# A rebase onto a `main` fetched an hour ago re-raises conflicts that are
# already settled upstream, and raises them again on the next attempt.
#
# Load the `conflict` skill before running these. It owns the seatbelt, the
# always-fetch rule, the commands that silently destroy a resolution, and how
# to resolve honestly rather than by picking a side.

.PHONY: sync sync-merge sync-continue sync-abort sync-cleanup

# The default: rebase onto the freshly fetched origin/main.
# `make sync ARGS="--onto develop"` for a different base.
sync:
	node scripts/sync-branch.mjs $(ARGS)

# Merge instead of rebasing — for a branch on an open PR somebody may have
# checked out, where rewriting history under them is rude and hard to undo.
sync-merge:
	node scripts/sync-branch.mjs --merge $(ARGS)

# After resolving and staging. A rebase replays one commit at a time, so this
# may be needed more than once.
sync-continue:
	node scripts/sync-branch.mjs --continue

# Give up: aborts whichever operation git actually has half-done.
sync-abort:
	node scripts/sync-branch.mjs --abort

# Drop the seatbelt — only once the sync is verified AND pushed.
sync-cleanup:
	node scripts/sync-branch.mjs --cleanup
