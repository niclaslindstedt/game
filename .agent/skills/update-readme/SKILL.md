---
name: update-readme
description: "Use when README.md may be stale. Discovers commits since the last README update, identifies what user-facing surfaces changed, and brings README.md back into sync."
---

# Updating the README

**Governing spec sections:** §3 (`README.md` — required sections and content), §21.5 (this skill is mandated because `README.md` is a drift-prone artifact).

`README.md` is the primary user-facing documentation for game. Per §3 of `OSS_GAME_SPEC.md` it must cover the project description, installation, a quick-start, usage, contribution pointer, license, and a link to `OSS_GAME_SPEC.md`. It goes stale whenever a CLI flag, subcommand, default, or supported surface changes without a matching edit.

**Before starting, read this skill's lessons** — `node scripts/skill-lessons.mjs update-readme --list`,
then the ones this task touches (`--scope=…`, `--concepts=…`). Reading them here and
reflecting on them before the commit is the **`skill-reflection`** skill's job — load
it at both ends of the session.

## Audience and editorial stance

The README's primary audience is **prospective and current mod creators**. It
is their front door to the game, its supported release surfaces, the content
format, the authoring/test loop, publishing, and the licence boundary around
mods and multiplayer. Lead with what a modder needs to decide whether and how
to build something.

Player-facing context belongs only where it helps a modder understand the game
they are extending or verify their work. Keep that context concise and link to
the generated library or focused documentation instead of letting the README
grow into a player manual or marketing page.

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
| Engine public API (`engine/index.ts`) | **Usage** |
| Make targets / npm scripts (`Makefile`, `package.json` scripts) | **Usage** (and `CONTRIBUTING.md`, `AGENTS.md` per the AGENTS.md sync table) |
| Deploy slots / pages workflow (`.github/workflows/pages.yml`, `pwa/pwa-plugin.ts` `DEPLOY_SLOTS`) | **Play** table (the `/`, `/preview/`, `/branch/` links) |
| Config knobs: env vars, URL params | **Configuration** |
| Game identity (title, tagline, domain — `game.config.json`) | Title, description, links — but never re-hardcode a brand string that `game.config.json` owns |
| Game premise / how-to-play content | The flavored intro sections |
| Installation / dev setup (`.npmrc`, `GITHUB_PAT`) | **Install** / dev setup |
| License change | **License** section, badges |
| Mod authoring, loading or Workshop (`mod/**`, `docs/modding.md`, `electron/src/{mods,workshop}.ts`) | Opening modder callout, **Modding**, platform availability, and **License** |
| Desktop/Steam release scope (`electron/**`, `electron/store/steam.json`) | Opening description, release/platform table, mod testing path, and unpublished/published status |

Extend this table every time you find a new source-of-truth file that feeds the README.

## Update checklist

- [ ] Read baseline from `.last-updated` and run `git log` / `git diff --name-only`
- [ ] Read the current `README.md`
- [ ] Confirm the first screen answers a modder's platform, starting-point, and licence questions
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
2. **Record patterns** for recurring edits as lesson fragments — load the **`skill-reflection`** skill, which owns recording, scoping, pruning, merging and promoting them (`node scripts/skill-lessons.mjs update-readme --list`).
3. **Commit the skill edit** together with the README edit so the knowledge compounds.
