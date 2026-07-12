---
name: update-website
description: "Use when the deployed app's SEO surfaces or source-derived content under website/ may be stale. Discovers commits since the last website update and refreshes/regenerates identity, metadata, and SEO content so the built site matches game.config.json, the README, and the docs."
---

# Updating the Website

**Governing spec sections:** §11.2 (source-derived content, no double-authoring, staleness CI check), §11.3 (SEO surfaces), §21.5 (this skill is mandated when the project publishes a website).

This is a **webapp-kind project (§11.4/§11.5): the deployed website IS the game** — there is no separate marketing site. What this skill keeps in sync is the site's *derived* shell, not hand-authored pages:

| Surface | Derived from | By |
|---|---|---|
| `index.html` head, `manifest.webmanifest` | `game.config.json` (title, tagline, description, `siteUrl`, OG fields) | `website/pwa-plugin.ts` at build time |
| `website/src/generated/sourceData.json` (version, description, changelog) | root `package.json`, `src/version.ts`, `CHANGELOG.md` | `website/scripts/extract-source-data.mjs` (runs on every build; **fails** if `src/version.ts` and `package.json` disagree) |
| `sitemap.xml`, `robots.txt`, `llms.txt`, `404.html` | `game.config.json` (`siteUrl`) | `website/scripts/generate-seo.mjs` (post-build) |
| Icons + OG card art | `website/public/icon.svg` + `game.config.json` | `make icons` (never edit the emitted PNGs) |
| Identity strings in app code | `game.config.json` via `website/src/identity.ts` | never re-hardcode a brand string |

## Tracking mechanism

`.agent/skills/update-website/.last-updated` contains the git commit hash from the last successful run. Empty means "never run" — fall back to the initial commit.

## Discovery process

1. Read the baseline:

   ```sh
   BASELINE=$(cat .agent/skills/update-website/.last-updated)
   ```

2. Diff the sources of truth against the baseline:

   ```sh
   git log --oneline "$BASELINE"..HEAD -- game.config.json README.md docs/ \
     src/version.ts package.json website/public/icon.svg OSS_SPEC.md
   git diff --name-only "$BASELINE"..HEAD -- game.config.json README.md docs/ \
     src/version.ts package.json website/public/icon.svg OSS_SPEC.md
   ```

3. If anything changed, rebuild and check the derived surfaces.

## Mapping table

| Changed file | Effect on website |
|---|---|
| `game.config.json` (any identity field) | `index.html` head, manifest, SEO files, OG art — rebuild; rerun `make icons` if OG-relevant fields moved |
| `game.config.json` `siteUrl` | `sitemap.xml` / `robots.txt` / canonical URLs; also verify `DEPLOY_SLOTS` in `website/pwa-plugin.ts` and `.github/workflows/pages.yml` still agree |
| `package.json` / `src/version.ts` version | `sourceData.json` version label — versions must match (`scripts/update-versions.sh` owns them; never hand-edit) |
| `CHANGELOG.md` | `sourceData.json` changelog extraction |
| `website/public/icon.svg` | `make icons` — regenerates every PNG and the OG card |
| README / docs restructuring | Only matters if an extraction anchor moved — `extract-source-data.mjs` fails loudly when a marker is missing |

## Update checklist

- [ ] Read baseline and diff sources of truth
- [ ] `make build` (runs `assets` → `extract` → `vite build` → `generate-seo`) — extraction failures are the drift signal
- [ ] `cd website && npm run check:seo` — the §11.3.10 structural SEO check over `dist/`
- [ ] If identity/OG fields or `icon.svg` changed: `make icons` and commit the regenerated art
- [ ] Smoke-test the built shell (title, description, manifest name, version label)
- [ ] Run `make test` (includes `tests/version_test.ts`, the version-parity guard)
- [ ] Write the new baseline:

      git rev-parse HEAD > .agent/skills/update-website/.last-updated

## Verification

1. `make build` and `npm run check:seo` (from `website/`) both pass.
2. `index.html`/manifest in `dist/` carry the current `game.config.json` strings.
3. Confirm `.last-updated` was rewritten.

## Skill self-improvement

1. **Expand the mapping table** if a new source file started feeding the website (operating data — edit it in place).
2. **Record extraction quirks** (e.g. "anchor X is parsed from heading Y") as lesson fragments under `.lessons/` (see [`../LESSONS.md`](../LESSONS.md); read back with `node scripts/skill-lessons.mjs update-website`) — fragments never conflict across parallel sessions.
3. **Commit the skill edit** alongside the website update.
