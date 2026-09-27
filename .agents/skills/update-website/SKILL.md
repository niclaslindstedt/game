---
name: update-website
description: "Use when the deployed app's source-derived content under pwa/ may be stale. Discovers commits since the last website update and refreshes/regenerates identity and metadata so the built site matches game.config.json, the README, and the docs — and confirms every page still carries noindex."
---

# Updating the Website

**Governing spec sections:** §11.2 (source-derived content, no double-authoring, staleness CI check), §11.3 (discoverability — **deliberately not met**, see below), §21.5 (this skill is mandated when the project publishes a website).

> **THE SITE IS NOT MEANT TO BE FOUND.** There are no size budgets and no SEO tooling, by owner decision: every HTML page the build emits (the game, `/privacy/`, `/contact/`, `404.html`, every library page) carries `<meta name="robots" content="noindex">`, `robots.txt` allows crawling (a crawler has to fetch a page to read its `noindex`) and names no sitemap, and there is no `sitemap.xml`, `llms.txt`, canonical link or JSON-LD. The title, the meta description and the Open Graph / Twitter tags stay — they make a shared link look right. **Do not add a discovery surface back.**

This is a **webapp-kind project (§11.4/§11.5): the deployed website IS the game** — there is no separate marketing site. What this skill keeps in sync is the site's *derived* shell, not hand-authored pages:

| Surface | Derived from | By |
|---|---|---|
| `index.html` head, `manifest.webmanifest` | `game.config.json` (title, tagline, description, `siteUrl`, OG fields) | `pwa/pwa-plugin.ts` at build time |
| `pwa/src/generated/sourceData.json` (version, description, changelog) | root `package.json`, `engine/version.ts`, `CHANGELOG.md` | `pwa/scripts/extract-source-data.mjs` (runs on every build; **fails** if `engine/version.ts` and `package.json` disagree) |
| `robots.txt`, `404.html` | `game.config.json` (`siteUrl`, `title`) | `pwa/scripts/generate-site-files.mjs` (post-build) |
| Icons + OG card art | `pwa/public/icon.svg` + `game.config.json` | `make icons` (never edit the emitted PNGs) |
| Identity strings in app code | `game.config.json` via `pwa/src/identity.ts` | never re-hardcode a brand string |

## Tracking mechanism

`.agents/skills/update-website/.last-updated` contains the git commit hash from the last successful run. Empty means "never run" — fall back to the initial commit.

## Discovery process

1. Read the baseline:

   ```sh
   BASELINE=$(cat .agents/skills/update-website/.last-updated)
   ```

2. Diff the sources of truth against the baseline:

   ```sh
   git log --oneline "$BASELINE"..HEAD -- game.config.json README.md docs/ \
     engine/version.ts package.json pwa/public/icon.svg OSS_GAME_SPEC.md
   git diff --name-only "$BASELINE"..HEAD -- game.config.json README.md docs/ \
     engine/version.ts package.json pwa/public/icon.svg OSS_GAME_SPEC.md
   ```

3. If anything changed, rebuild and check the derived surfaces.

## Mapping table

| Changed file | Effect on website |
|---|---|
| `game.config.json` (any identity field) | `index.html` head, manifest, `404.html`, OG art — rebuild; rerun `make icons` if OG-relevant fields moved |
| `game.config.json` `siteUrl` | the Open Graph URLs and `404.html`; also verify `DEPLOY_SLOTS` in `pwa/pwa-plugin.ts` and `.github/workflows/pages.yml` still agree |
| `package.json` / `engine/version.ts` version | `sourceData.json` version label — versions must match (`scripts/update-versions.sh` owns them; never hand-edit) |
| `CHANGELOG.md` | `sourceData.json` changelog extraction |
| `pwa/public/icon.svg` | `make icons` — regenerates every PNG and the OG card |
| README / docs restructuring | Only matters if an extraction anchor moved — `extract-source-data.mjs` fails loudly when a marker is missing |

## Update checklist

- [ ] Read baseline and diff sources of truth
- [ ] `make build` (runs `assets` → `extract` → `vite build` → `library` → `generate-site-files`) — extraction failures are the drift signal
- [ ] Every `.html` under `pwa/dist` carries `noindex`, and there is no `sitemap.xml` or `llms.txt`
- [ ] If identity/OG fields or `icon.svg` changed: `make icons` and commit the regenerated art
- [ ] Smoke-test the built shell (title, description, manifest name, version label)
- [ ] Run `make test` (includes `tests/version_test.ts`, the version-parity guard)
- [ ] Write the new baseline:

      git rev-parse HEAD > .agents/skills/update-website/.last-updated

## Verification

1. `make build` passes with no warnings, and every page in `pwa/dist` carries `noindex`.
2. `index.html`/manifest in `dist/` carry the current `game.config.json` strings.
3. Confirm `.last-updated` was rewritten.

## Skill self-improvement

1. **Expand the mapping table** if a new source file started feeding the website (operating data — edit it in place).
2. **Record extraction quirks** (e.g. "anchor X is parsed from heading Y") as lesson fragments — load the **`skill-reflection`** skill, which owns recording, scoping, pruning, merging and promoting them (`node scripts/skill-lessons.mjs update-website --list`).
3. **Commit the skill edit** alongside the website update.
