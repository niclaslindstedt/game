.PHONY: build test lint fmt fmt-check shellcheck actionlint release clean docs website website-dev icons screenshots assets install changelog bump store-preflight store-metadata store-shots store-sweep store-page-shot store-achievement-art sim-bench mod-check mod-catalog

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

clean:
	rm -rf node_modules pwa/node_modules pwa/dist pwa/src/generated site

install:
	npm install

shellcheck:
	shellcheck scripts/*.sh

actionlint:
	actionlint -color

docs:
	@echo "see docs/"

# The website IS the game (OSS_SPEC §11.4) — these build/serve the deployed app.
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

# Compile a MOD — the same validator the desktop game runs on every mod it
# loads, so a mod that passes here is a mod the game accepts. See mod/README.md.
# `make mod-check DIR=mod/examples/greenhouse`
mod-check:
	@node mod/tools/cli.mjs check $(or $(DIR),mod/examples/greenhouse)

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
# native/RELEASING.md.
store-preflight:
	@node scripts/store-preflight.mjs

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
# Three capabilities are decided when the binary is PACKAGED — they belong to
# the build, not to the machine that runs it — and each target below says which
# ones its output carries:
#
#   ENABLE_MULTIPLAYER=1   sessions, the server browser, the direct door
#   ENABLE_MODS=1          the Workshop and the local mod folder
#   ENABLE_UPNP=1          may ask the router to forward the bound port
#   ENABLE_LICENSED=1      sessions it hosts may admit players at all
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
	GIS_ENABLE_LICENSED=$(or $(ENABLE_LICENSED),1) \
	npm --prefix electron run $(DESKTOP_SCRIPT)

desktop-dist:
	GIS_STAMP_CAPABILITIES=1 \
	GIS_PACKAGE_PROFILE=standalone \
	GIS_ENABLE_MULTIPLAYER=$(or $(ENABLE_MULTIPLAYER),0) \
	GIS_ENABLE_MODS=$(or $(ENABLE_MODS),0) \
	GIS_ENABLE_UPNP=$(or $(ENABLE_UPNP),0) \
	GIS_ENABLE_LICENSED=$(or $(ENABLE_LICENSED),0) \
	npm --prefix electron run $(DESKTOP_SCRIPT)
