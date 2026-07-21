.PHONY: build test lint fmt fmt-check shellcheck actionlint release clean docs website website-dev icons assets install changelog bump

build:
	npm run build

test:
	npm test

lint:
	npm run lint

fmt:
	npm run fmt

fmt-check:
	npm run fmt:check

release:
	npm run build

clean:
	rm -rf node_modules website/node_modules website/dist website/src/generated site

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
	npm install && npm run build --workspace website

website-dev:
	npm install && npm run dev --workspace website

# Regenerate every raster icon + the OG card from website/public/icon.svg (§11.4.2).
icons:
	npm run icons

# Regenerate in-game pixel assets (sprites, font atlas, previews) from their
# programmatic sources — see the pixel-assets skill.
assets:
	npm run assets

# Compile the YAML level tree (scripts/levels/*.yaml) into the engine's
# generated level catalog — see the level-design skill. Also runs inside
# `make assets`; this target is the fast path when only a level changed.
levels:
	npm run levels

# Render an annotated top-down map of a level for game-design review —
# `make map LEVEL=mars` (add ARGS="--actual --seed 1 --heatmap"). See the
# level-design skill.
map:
	npm run map --workspace website -- $(LEVEL) $(ARGS)

# Render the CLEAN high-res LAYOUT BLUEPRINT of a level — the first thing to
# LOOK at to understand a map: `make map-layout LEVEL=moon` (add ARGS="--all"
# or "--seed 1"). See the map-improvement / level-design skills.
map-layout:
	npm run map-layout --workspace website -- $(LEVEL) $(ARGS)

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
