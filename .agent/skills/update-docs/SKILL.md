---
name: update-docs
description: "Use when files under docs/ may be stale. Discovers commits since the last docs update, maps changed source files to affected conceptual documentation, and brings docs/*.md back into sync."
---

# Updating the Docs

**Governing spec sections:** §11.1 (`docs/` directory — the required conceptual docs tree), §21.5 (this skill is mandated because `docs/` is a drift-prone artifact in every project).

The `docs/` directory contains conceptual documentation for game. Unlike the README (overview) or man pages (command reference), `docs/` explains *why* and *how* in depth. It goes stale whenever a user-visible behavior, configuration key, or supported surface changes without a matching edit.

## Tracking mechanism

`.agent/skills/update-docs/.last-updated` contains the git commit hash from the last successful run. Empty means "never run" — fall back to the repository's initial commit.

## Discovery process

1. Read the baseline:

   ```sh
   BASELINE=$(cat .agent/skills/update-docs/.last-updated)
   ```

2. List commits since the baseline:

   ```sh
   git log --oneline "$BASELINE"..HEAD
   ```

3. List changed files:

   ```sh
   git diff --name-only "$BASELINE"..HEAD
   ```

4. Categorize using the mapping table below.

## Mapping table

| Changed files / scope | Doc(s) to update |
|---|---|
| Engine public API (`src/index.ts`) | `docs/architecture.md`, `README.md` Usage |
| Config knobs: env vars, URL params (`?debug`, `?seed`, `?scenario`, `?bot`, …), dev-menu flags | `docs/configuration.md` |
| Game content: levels, enemies, story items, uniques (`src/game/defs/**`) | `docs/game-content.md` (this game's walkthrough) |
| Story / dialogue / plot — any spoken line, caption, lore page, or plot beat | **Not this skill.** Use `update-story` (`.agent/skills/update-story/`), which owns the `story.md` → `manuscript.md` → data chain — **only with user confirmation** (see CLAUDE.md "Story & dialogue"; never silently rewrite it) |
| Deploy slots / pages workflow (`.github/workflows/pages.yml`, `pwa/pwa-plugin.ts`) | `docs/architecture.md` |
| PWA surface (manifest, icons, service worker) | `docs/architecture.md` |
| Error messages and troubleshooting-relevant behavior | `docs/troubleshooting.md` |
| Install / first-run mechanics (Makefile, `.npmrc`, `GITHUB_PAT`) | `docs/getting-started.md` |

Extend this table every time you find a new source file that feeds the docs.

## Update checklist

- [ ] Read baseline from `.last-updated` and run `git log` / `git diff --name-only`
- [ ] Read every affected `docs/*.md` file
- [ ] Walk the mapping table and update each doc in place
- [ ] Verify cross-links between docs still resolve
- [ ] Verify every shell example is still syntactically valid
- [ ] Run `make test` and the project's conformance check
- [ ] Write the new baseline:

      git rev-parse HEAD > .agent/skills/update-docs/.last-updated

## Verification

1. Re-read every edited doc section against the current source of truth.
2. Click every internal cross-link and confirm the target still exists.
3. Confirm `.last-updated` was rewritten.

## Skill self-improvement

1. **Grow the mapping table** with any new source → doc relationship you discovered (operating data — edit it in place).
2. **Record recurring patterns** you had to invent as lesson fragments under `.lessons/` (see [`../LESSONS.md`](../LESSONS.md); read back with `node scripts/skill-lessons.mjs update-docs`) — fragments never conflict across parallel sessions.
3. **Commit the skill edit** alongside the docs change so the knowledge compounds.