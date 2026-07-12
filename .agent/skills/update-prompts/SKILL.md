---
name: update-prompts
description: "Use when LLM prompts under prompts/ may be stale. Discovers changes since the last run and rewrites the affected prompt templates so they stay aligned with their sources of truth."
---

# Updating the LLM prompts

**Governing spec sections:** §13.5 (LLM prompts — versioned `prompts/<name>/<major>_<minor>_<patch>.md` files with required YAML front matter), §21.5 (this skill is mandated because `prompts/` is a drift-prone artifact whenever a project ships LLM-driven behaviour).

Every LLM-driven step in game is defined by a versioned prompt under `prompts/<name>/<major>_<minor>_<patch>.md` with a required YAML front matter block (`name`, `description`, `version`) — see §13.5 of `OSS_SPEC.md`. Prompt files are **immutable once committed**: every change lands as a new file at a new semver (patch for wording, minor for additive changes, major for breaking rewrites). Prompts drift whenever the code that renders them, the sources of truth they embed, or the section numbering they reference changes.

## Tracking mechanism

`.agent/skills/update-prompts/.last-updated` contains the git commit hash from the last successful run. Empty means "never run" — fall back to the initial commit.

## Discovery process

1. Read the baseline:

   ```sh
   BASELINE=$(cat .agent/skills/update-prompts/.last-updated)
   ```

2. Enumerate every prompt file and note its current version:

   ```sh
   find prompts -name '[0-9]*_[0-9]*.md' | sort
   ```

3. Diff the watched paths against the baseline:

   ```sh
   git diff --name-only "$BASELINE"..HEAD -- prompts/
   ```

   Extend this list with every file that feeds content into a prompt — e.g. a spec document whose text is embedded in a prompt body, any module that builds the prompt's rendering context (the values substituted into its `{{ placeholder }}` tokens), any enum whose variants appear in a JSON schema inside the prompt.

   > **Currently dormant:** `prompts/` holds only its `README.md` — this game ships no LLM-driven behavior yet. If the diff shows no new `prompts/<name>/` directory, there is nothing to sync; just rewrite the baseline and stop.

4. For each path in the diff, walk the mapping table and decide which prompts are now stale.

## Mapping table

| Source-of-truth change | Prompt(s) to audit | What to check |
|---|---|---|
| A source doc whose text is embedded in a prompt body | every prompt that embeds it | Check that embedded checklists and cross-references still match the source. |
| A new validation rule or violation category | fix / triage prompts | Add guidance so the agent can act on the new failure mode. |
| A new rendering-context placeholder | the corresponding prompt's `## User` section | Reference the new `{{ placeholder }}`; remove any left-over tokens the caller no longer fills. |
| A new enum / JSON-schema value in the code | prompts that describe the schema | Update the embedded JSON schema. |
| A new prompt file under `prompts/<name>/<major>_<minor>_<patch>.md` | the code that loads it | Confirm the loader picks by name (not a pinned version) so the new file is auto-selected. |

Extend this table every time you discover a new drift path.

## Update checklist

- [ ] Read the baseline from `.last-updated`
- [ ] Run `git diff --name-only` against watched paths; bail out if nothing relevant changed
- [ ] For each affected prompt, add a new versioned file — `<major>_<minor>_<patch+1>.md` for wording fixes, `<major>_<minor+1>_0.md` for additive changes, `<major+1>_0_0.md` for breaking rewrites (committed prompt files are immutable)
- [ ] Keep the previous version in place when adding a new one (§13.5 retention)
- [ ] Update any code caller that pins a specific prompt version
- [ ] Run `make fmt`, `make lint`, `make test`
- [ ] Write the new baseline:

      git rev-parse HEAD > .agent/skills/update-prompts/.last-updated

## Verification

1. Every `{{ placeholder }}` in a rendered prompt has a matching key in the caller's rendering context.
2. Every context key the caller passes is referenced by the prompt at least once.
3. `make test` passes.
4. `.last-updated` has been rewritten with the current `HEAD`.

## Skill self-improvement

After a run, edit this file in place:

1. **Grow the mapping table** with any new source → prompt path you discovered (operating data — edit it in place).
2. **Record drift signals** — if a prompt went stale through a path not captured above, add the path.
3. **Record recurring patterns** as lesson fragments under `.lessons/` (see [`../LESSONS.md`](../LESSONS.md); read back with `node scripts/skill-lessons.mjs update-prompts`) — fragments never conflict across parallel sessions.
4. **Commit the skill edit** together with the prompt edits so the knowledge compounds.