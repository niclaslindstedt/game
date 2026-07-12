---
name: update-readme
description: "Use when README.md may be stale. Discovers commits since the last README update, identifies what user-facing surfaces changed, and brings README.md back into sync."
---

# Updating the README

**Governing spec sections:** §3 (`README.md` — required sections and content), §21.5 (this skill is mandated because `README.md` is a drift-prone artifact).

`README.md` is the primary user-facing documentation for game. Per §3 of `OSS_SPEC.md` it must cover the project description, installation, a quick-start, usage, contribution pointer, license, and a link to `OSS_SPEC.md`. It goes stale whenever a CLI flag, subcommand, default, or supported surface changes without a matching edit.

## Tracking mechanism

`.agent/skills/update-readme/.last-updated` contains the git commit hash from the last successful run. Empty means "never run" — fall back to the initial commit of the repository.

## Discovery process

1. Read the baseline:

   ```sh
   BASELINE=$(cat .agent/skills/update-readme/.last-updated)
   ```

2. List commits since the baseline:

   ```sh
   git log --oneline "$BASELINE"..HEAD
   ```

3. List changed files:

   ```sh
   git diff --name-only "$BASELINE"..HEAD
   ```

4. Categorize the changes using the mapping table below.

5. Read the current `README.md` so you can preserve voice and unrelated sections while editing.

## Mapping table

| Changed files / scope | README section(s) to update |
|---|---|
| Engine public API (`src/index.ts`) | **Usage** |
| Make targets / npm scripts (`Makefile`, `package.json` scripts) | **Usage** (and `CONTRIBUTING.md`, `AGENTS.md` per the CLAUDE.md sync table) |
| Deploy slots / pages workflow (`.github/workflows/pages.yml`, `website/pwa-plugin.ts` `DEPLOY_SLOTS`) | **Play** table (the `/`, `/preview/`, `/branch/` links) |
| Config knobs: env vars, URL params | **Configuration** |
| Game identity (title, tagline, domain — `game.config.json`) | Title, description, links — but never re-hardcode a brand string that `game.config.json` owns |
| Game premise / how-to-play content | The flavored intro sections |
| Installation / dev setup (`.npmrc`, `GITHUB_PAT`) | **Install** / dev setup |
| License change | **License** section, badges |

Extend this table every time you find a new source-of-truth file that feeds the README.

## Update checklist

- [ ] Read baseline from `.last-updated` and run `git log` / `git diff --name-only`
- [ ] Read the current `README.md`
- [ ] Walk the mapping table and update each affected section
- [ ] Verify every shell example is still syntactically valid
- [ ] Run `make test` and the project's own conformance check
- [ ] Write the new baseline:

      git rev-parse HEAD > .agent/skills/update-readme/.last-updated

## Verification

1. Re-read every edited section against the corresponding source of truth.
2. Confirm `.last-updated` was rewritten with the new `HEAD`.

## Skill self-improvement

After a run, improve this file in place:

1. **Grow the mapping table** with any new source → README relationship you discovered (operating data — edit it in place).
2. **Record patterns** for recurring edits as lesson fragments under `.lessons/` (see [`../LESSONS.md`](../LESSONS.md); read back with `node scripts/skill-lessons.mjs update-readme`) — fragments never conflict across parallel sessions.
3. **Commit the skill edit** together with the README edit so the knowledge compounds.