---
name: maintenance
description: "Use when you want to bring every drift-prone artifact in the repo back into sync. Dispatches to all individual update-* skills in the correct order, aggregates their results, and leaves a single combined PR ready to review."
---

# Maintenance

This is the umbrella skill for game, mandated by §21.6 of `OSS_GAME_SPEC.md`. It does no rewriting itself — it decides which sync skills are stale, runs each one, and reports a combined summary. Use it when you do not know which specific artifact is out of date, or when several have likely drifted at once (for example, after a large merge).

## When to run

- After a big merge from the default branch when you are not sure which surfaces moved.
- On a cadence (weekly / before a release) as a "drift sweep".
- When CI flags a staleness check but it is unclear which skill to invoke.

Do **not** use this skill for a targeted fix — if you know exactly which artifact is stale, call the corresponding `update-*` skill directly.

## Registry

The registry is the single source of truth for which sync skills exist in this repo. Every `update-*` directory under `.agents/skills/` must appear here exactly once. New projects start with the entries below; add rows whenever you create a new sync skill.

| Skill | Fixes | Spec sections | Run order |
|---|---|---|---|
| `sync-game-spec`  | Repo contents vs. the repository's own `OSS_GAME_SPEC.md` (offline and standalone — no fetch, no validator binary) | all structural §§ + the game chapters §23–§37 | 1 — run first so every downstream skill works on a conformant tree |
| `update-story`    | Story tiers vs. each other: `docs/manuscript.md` and `engine/game/defs/**` story data vs. `docs/story.md` (the gist, ground truth) | §11.1                     | 2 — reconcile the story chain before `update-docs` reads the manuscript |
| `update-docs`     | `docs/*.md` vs. source of truth                                                                             | §11.1                     | 3 |
| `update-readme`   | `README.md` vs. current public surface                                                                      | §3                        | 4 |
| `update-prompts`  | `prompts/**` vs. code and embedded sources                                                                  | §13.2                     | 5 |
| `update-website`  | Source-derived content under `pwa/` (SEO surfaces, extracted metadata) vs. README/docs/config           | §11.2                     | 6 — last: it reads files the docs/readme skills may rewrite |

Run order matters:

- `sync-game-spec` runs **first** so every downstream skill works on a tree that already satisfies the structural mandates. It reads the repository's own `OSS_GAME_SPEC.md` and never rewrites it: the spec is amended by a deliberate PR, not by a sweep.
- `update-story` runs **second**: it owns the story chain (`story.md` → `manuscript.md` → `defs/**`), and `update-docs` reads the manuscript, so the story tiers must agree before the docs skill runs. In a sweep it only reconciles LOWER tiers up to `story.md` — a story *change* needs the user's confirmation (see its `SKILL.md`), so if the sweep finds the data holds a beat the gist lacks, it surfaces that instead of promoting it silently.
- The per-artifact skills (`update-docs`, `update-readme`, `update-prompts`, `update-website`, and any other `update-*` skill this project adds) run afterwards in dependency order: a skill that reads files another skill rewrites must run *after* that other skill — `update-website` runs last because the website extracts content from README/docs.

## Discovery process

For each skill in the registry, decide whether it needs to run:

1. Read the skill's `.last-updated` file:

   ```sh
   BASELINE=$(cat .agents/skills/<skill>/.last-updated)
   ```

   An empty or missing file means "never run" — schedule it.

2. Diff the watched paths for that skill against the baseline:

   ```sh
   git diff --name-only "$BASELINE"..HEAD
   ```

   If any file in the skill's mapping table appears in the diff, schedule the skill.

3. Build the list of skills to run, preserving the run order from the registry.

## Execution

For each scheduled skill, in order:

1. Load `.agents/skills/<skill>/SKILL.md`.
2. Follow its discovery process, mapping table, and update checklist exactly.
3. Verify the skill's own verification section passes.
4. Record the commit hash the skill wrote to its `.last-updated`.

Between skills, do **not** commit — aggregate all edits into a single working tree so the final commit covers the whole sync sweep.

## Update checklist

- [ ] Read every skill's `.last-updated` and build the schedule
- [ ] Run each scheduled skill in registry order
- [ ] After all skills finish, run:
    - [ ] `make fmt`
    - [ ] `make lint`
    - [ ] `make test`
- [ ] Stage every touched file (including each updated `.last-updated`)
- [ ] Commit with a conventional-commit message describing the sweep
- [ ] Update `.agents/skills/maintenance/.last-updated`:

      git rev-parse HEAD > .agents/skills/maintenance/.last-updated

## Verification

1. Every scheduled skill's verification section must pass.
2. `make lint` and `make test` must pass.
3. The final diff should touch only documentation files, skill `.last-updated` files, and (rarely) small code adjustments that the skills flagged.
4. Every skill that ran must have its `.last-updated` rewritten with the same commit hash.

## Skill self-improvement

After every run, update this file:

1. **Add new sync skills to the registry.** Every new `update-*` skill must appear here, in alphabetical order, with a clear run-order slot.
2. **Adjust run order** if you discovered a hidden dependency.
3. **Record drift signals.** If a change should have triggered a skill but did not appear in any skill's mapping table, extend that skill's mapping table — not this one.
4. **Commit the skill edits** together with the drift sweep.

The registry, run order, and mapping tables are operating data — edit them in place as above. Narrative gotchas that aren't registry rows go to lesson fragments — load the **`skill-reflection`** skill, which owns recording, scoping, pruning, merging and promoting them (`node scripts/skill-lessons.mjs maintenance --list`) instead.