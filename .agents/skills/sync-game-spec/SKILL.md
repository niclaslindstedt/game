---
name: sync-game-spec
description: "Use when game may have drifted from OSS_GAME_SPEC.md. Walks the spec's mandates — the OSS baseline and the game chapters — against the repository and fixes each violation. Fully offline and standalone: the repository's own copy of the spec is the source of truth, and no validator binary, network fetch or upstream document is involved."
---

# Syncing game with OSS_GAME_SPEC.md

**Governing spec sections:** the entire `OSS_GAME_SPEC.md` (this skill is the propagation channel for every structural mandate), plus §21.5, which requires every conforming project to ship this skill.

`OSS_GAME_SPEC.md` at the repository root is the specification this repository claims to conform to, and it is **the single source of truth**. There is no upstream copy to fetch and nothing to reconcile against: the spec is amended deliberately, in a reviewed PR, like any other governing file in the tree. This skill runs the other direction — it brings the **repository** back under the spec's existing mandates.

**Never fetch, never overwrite `OSS_GAME_SPEC.md`.** An earlier version of this skill pulled a general OSS spec from GitHub and copied it over the local file; doing that now would delete the game chapters (§23–§37) this repository is built on. If the spec itself should change, that is a normal PR against `OSS_GAME_SPEC.md`, and §21.5 requires the same PR to propagate the new mandate into the tree.

## Tracking mechanism

`.agents/skills/sync-game-spec/.last-updated` contains the git commit hash of the last successful run. Empty means "never run" — use the repo's initial commit (`git rev-list --max-parents=0 HEAD`) as the baseline.

## Discovery process

1. Read the baseline and list every commit that may have introduced drift since then:

   ```sh
   BASELINE=$(cat .agents/skills/sync-game-spec/.last-updated)
   git log --oneline "$BASELINE"..HEAD
   git diff --name-only "$BASELINE"..HEAD
   ```

2. Record the spec version every decision this run is made against:

   ```sh
   SPEC_VERSION=$(awk '/^version:/ {print $2; exit}' OSS_GAME_SPEC.md)
   echo "OSS_GAME_SPEC.md version: $SPEC_VERSION"
   ```

3. Walk the **structural mandates** and assert each on disk. Any output from a check is a violation.

   ```sh
   # §2/§3/§4/§5/§6/§7/§8.4/§9 — required root files
   for f in LICENSE README.md CONTRIBUTING.md CODE_OF_CONDUCT.md SECURITY.md \
            AGENTS.md CHANGELOG.md Makefile .gitignore .editorconfig \
            OSS_GAME_SPEC.md; do
     [ -e "$f" ] || echo "MISSING: $f"
   done

   # §7.1 — AGENTS.md symlinks
   for link in CLAUDE.md .cursorrules .windsurfrules GEMINI.md \
               .aider.conf.md .github/copilot-instructions.md; do
     [ -L "$link" ] || echo "NOT-A-SYMLINK: $link (must point to AGENTS.md)"
   done

   # §10/§11/§13.2/§15 — required directories
   for d in .github/workflows .github/ISSUE_TEMPLATE docs prompts scripts; do
     [ -d "$d" ] || echo "MISSING-DIR: $d"
   done

   # §10.1/§10.3/§10.4 — required workflows
   for w in ci.yml version-bump.yml release.yml pages.yml; do
     [ -f ".github/workflows/$w" ] || echo "MISSING-WORKFLOW: $w"
   done

   # §10.3 — no floating toolchain specifiers in CI workflows
   grep -nE '(rust-toolchain@|(python|node|go)-version:)[^\n]*\b(stable|latest|lts|\*)\b' \
        .github/workflows/ci.yml .github/workflows/release.yml 2>/dev/null

   # §10.5 — local pin file matches CI. Presence-only check; cross-check
   # values by eye against ci.yml.
   [ -f Cargo.toml ]       && { [ -f rust-toolchain.toml ] || echo "MISSING: rust-toolchain.toml"; }
   [ -f pyproject.toml ] || [ -f setup.py ] && { [ -f .python-version ] || echo "MISSING: .python-version"; }
   [ -f package.json ]     && { [ -f .nvmrc ] || echo "MISSING: .nvmrc"; }
   [ -f go.mod ]           && { grep -q '^toolchain ' go.mod || echo "MISSING: go.mod toolchain directive"; }

   # §13.2 — every prompts/<name>/ must have a versioned <major>_<minor>_<patch>.md
   for d in prompts/*/; do
     [ -d "$d" ] || continue
     ls "$d" | grep -qE '^[0-9]+_[0-9]+_[0-9]+\.md$' \
       || echo "UNVERSIONED-PROMPT: $d"
   done

   # §15 — issue + PR templates
   for f in .github/PULL_REQUEST_TEMPLATE.md \
            .github/ISSUE_TEMPLATE/bug_report.md \
            .github/ISSUE_TEMPLATE/feature_request.md \
            .github/ISSUE_TEMPLATE/config.yml \
            .github/dependabot.yml; do
     [ -f "$f" ] || echo "MISSING: $f"
   done

   # §19.4 — central output module
   ls engine/output.* lib/output.* engine/output/ internal/output/ 2>/dev/null \
     | head -1 | grep -q . || echo "MISSING: central output module (§19.4)"

   # §20.2 — every test file's stem must end with _test(s) or Test(s).
   # Shared non-test helper modules (tests/helpers.ts, tests/engine/fixtures.ts
   # — documented in AGENTS.md "Test conventions") are imports, not test files,
   # and are exempt. Nested suite dirs (tests/engine/, tests/content/) are
   # covered too.
   if [ -d tests ]; then
     find tests -type f -name '*.ts' \
       | grep -vE '(_test(s)?|Test(s)?)\.[^/]+$' \
       | grep -vE '/(helpers|fixtures)\.[^/]+$' \
       | sed 's/^/BAD-TEST-NAME: /'
   fi

   # §21 — agent skills tree
   [ -d .agents/skills ] || echo "MISSING-DIR: .agents/skills"
   for link in .claude/skills .gemini/skills; do
     [ "$(readlink "$link")" = "../.agents/skills" ] \
       || echo "BAD-SYMLINK: $link -> ../.agents/skills"
   done
   for d in .agents/skills/*/; do
     [ -f "$d/SKILL.md" ]      || echo "MISSING: $d/SKILL.md"
     [ -f "$d/.last-updated" ] || echo "MISSING: $d/.last-updated"
   done
   ```

4. Walk the **game mandates** (§23–§37). These are the ones a general OSS check has no idea about, and they are where this repo's real invariants live.

   ```sh
   # §23.1/§23.7 — the core imports no shell, and the dependency direction
   # holds. The repo proves both by walking the real import graph, so run
   # the suites that own it rather than grepping:
   npx vitest run tests/content/server_deps_test.ts tests/content/net_reachability_test.ts

   # §23.9 — the startup-path budget is gated, not just documented
   grep -rn "gzip" pwa/scripts/check-seo.mjs | head -5

   # §24.3 — generated content is gitignored and uncommitted
   git ls-files 'engine/generated/*' 'pwa/src/generated/*' \
     | sed 's/^/COMMITTED-GENERATED: /'

   # §24.2 — one schema module per catalog
   ls scripts/asset-tools/*-schema.mjs >/dev/null 2>&1 \
     || echo "MISSING: per-catalog schema modules (§24.2)"

   # §25.3 / §32.5 — a determinism digest guard exists
   grep -rln "digest" tests/ scripts/ | head -5

   # §27.4 / §33.5 — committed, drift-tested artifacts are current
   make mod-catalog && npm run parity && git diff --stat --exit-code \
     || echo "DRIFTED: a committed artifact needs regenerating (§24.4)"

   # §35.6 — nothing hard-codes the game's name outside the identity manifest
   grep -rIn --exclude-dir=node_modules --exclude-dir=generated \
        "Ada's Trail" engine pwa server | grep -v game.config.json | head
   ```

   The remaining game mandates are judgement calls rather than greps — read the chapter and check the repo against it:

   | Chapter | What to confirm by reading |
   |---|---|
   | §23.8 | The rule suites (`tests/engine/`) still name no shipped content id |
   | §25.2 | No new presentation code spends `state.rng()` |
   | §26.3 | Every scripted hook still has its parity test |
   | §28 | New interface pieces landed as `content/hud/` or `content/menus/`, not components |
   | §30 | Every changed line of dialogue walked the three tiers |
   | §31 | Nothing new is named after a real party, across all four carriers |
   | §32.3 | The autopilot can play any mechanic added since the baseline |
   | §35.4 | New effects honour reduced motion; new state is not colour-only |

5. For each failure, re-read the relevant section of the spec so the fix matches its intent rather than silencing the symptom:

   ```sh
   awk '/^## 25\. /,/^## 26\. /' OSS_GAME_SPEC.md
   ```

## Mapping table

| Violation spec section | Where to fix it |
|---|---|
| §2 missing `LICENSE` | Create `LICENSE` with the SPDX-identified license text and the correct copyright holder |
| §3 missing `README.md` sections | Edit `README.md`; hand off to `update-readme` if extensive rewording is needed |
| §4/§5/§6 missing `CONTRIBUTING.md` / `CODE_OF_CONDUCT.md` / `SECURITY.md` | Create the file with the minimum content mandated by the corresponding spec section |
| §7.1 tool-specific guidance file is not a symlink | Replace the regular file with `ln -s AGENTS.md <path>` (or `ln -s ../AGENTS.md .github/copilot-instructions.md`) |
| §7.2 `AGENTS.md` missing a required game section | Add the role map, the content-pipeline table, the rules-that-bite block, or the craft-skill index |
| §8.4 missing `CHANGELOG.md` | Create an empty Keep-a-Changelog-formatted file; do **not** hand-author entries |
| §8.5 PR has neither a fragment nor the label | Load the `changelog` skill and settle the call |
| §9/§9.1 Makefile target missing | Add the missing target to `Makefile` and verify it runs end-to-end |
| §10.1/§10.3/§10.4 missing workflow | Create `.github/workflows/<file>.yml` |
| §10.3 floating or under-pinned toolchain | Edit the workflow to pin at or above the minimums in `OSS_GAME_SPEC.md` §10.3 |
| §10.5 missing pin file / pin ↔ CI mismatch | Add the language's repo-root pin (`rust-toolchain.toml`, `.python-version`, `.nvmrc`, or `go.mod` `toolchain` directive) and align it with `ci.yml` |
| §11.1 missing `docs/` content | Create the topic file, then hand off to `update-docs` |
| §11.2 website drift | Regenerate website sources, hand off to `update-website` |
| §13.2 `prompts/<name>/` has no versioned file | Add `prompts/<name>/1_0_0.md` with the required YAML front matter (`name`, `description`, `version: 1.0.0`) and `## System` / `## User` sections |
| §15 missing issue / PR templates | Create the templates under `.github/ISSUE_TEMPLATE/` or `.github/PULL_REQUEST_TEMPLATE.md` |
| §19.4 missing central output module | Route the prints through `engine/output.ts` (or the shell's own peer) |
| §19.5 per-frame logging on a hot path | Move it behind a developer switch, aggregate it, or delete it |
| §20.2 test file stem does not end with `_test(s)` / `Test(s)` | Rename the file so the stem matches the regex `_?[Tt]ests?$` |
| §20.3 a rule test names a shipped content id | Move it to `tests/content/`, or rewrite it against `tests/engine/fixtures.ts` |
| §20.5 source file exceeds 1000 lines | **Preferred:** split the file by concern into sibling modules / helpers. **Common easy case:** if the file also has a §20 inline-test violation, extracting the test block to `tests/<stem>_test.<ext>` usually resolves both at once. **Escape hatch:** add `game-spec:allow-large-file: <reason>` in a comment within the first 20 lines — the reason must be non-empty and genuinely justify the size (generated code, cohesive state machine, third-party snapshot, inherent rule-catalogue density). |
| §21.2 a tool skill alias is not a symlink | Replace `.claude/skills` or `.gemini/skills` with a symlink to `../.agents/skills` |
| §21.3 SKILL.md missing front matter fields | Add `name:` / `description:` to the front matter |
| §21.4 missing `.last-updated` | `git rev-parse HEAD > .agents/skills/<skill>/.last-updated` |
| §21.5 missing required `update-*` skill | Create `.agents/skills/<skill>/SKILL.md` (+ `.last-updated`); register it in `maintenance/SKILL.md` |
| §21.6 `maintenance` skill registry row missing | Add the row in `maintenance/SKILL.md`, alphabetical, with a run-order slot |
| §21.9 an authoring discipline has no craft skill | Create it with its loop, quality bar, traps and downstream obligations |
| §23.7 an import points the wrong way | Fix the import; if the graph test did not catch it, extend the test |
| §23.9 critical path over budget | Find what reached back into `@game/core` (or make the screen lazy) — never raise the number |
| §24.3 a generated file is committed | `git rm --cached` it and add the path to `.gitignore` |
| §24.4 a committed artifact drifted | Re-run its generator (`make mod-catalog`, `npm run parity`, the store-metadata targets) in the same commit |
| §25.2 presentation spends a simulation draw | Derive from the entity's own hash instead |
| §26.3 a hook's fallback disagrees with its script | Fix whichever is wrong and re-run `tests/content/script_parity_test.ts` |
| §30 a line changed without the chain | Load `update-story` and walk `docs/story.md` → `docs/manuscript.md` → `content/` |
| §35.x a player-facing gate is unmet | Fix in the shell; verify with a capture at the reference viewport, not from source |

## Update checklist

- [ ] Read the baseline from `.last-updated` and diff the working tree
- [ ] Record the local `OSS_GAME_SPEC.md` version (never fetch, never overwrite it)
- [ ] Walk every structural check in step 3 and collect failures
- [ ] Walk every game check in step 4, including the read-and-judge table
- [ ] For each failure, read the matching section of the spec and apply the fix
- [ ] Re-run every check from steps 3 and 4 — they must produce no output
- [ ] Run `make fmt`, `make lint`, `make test` (and `make tauri-test` / `make tauri-lint` if the Rust tree moved)
- [ ] Write the new baseline:

      git rev-parse HEAD > .agents/skills/sync-game-spec/.last-updated

## Verification

1. Every shell check in steps 3 and 4 prints nothing.
2. `git diff --stat` on the regenerated artifacts is empty (§24.4).
3. `make test` passes.
4. Every failure seen before this run has a matching edit in the diff — no violation was silenced by loosening a check.
5. `OSS_GAME_SPEC.md` is unchanged by this run unless the run's purpose was an explicit, reviewed amendment to the spec.
6. `.last-updated` was rewritten with the current `HEAD`.

## Skill self-improvement

After a run, extend this file:

1. **Grow the mapping table** whenever a new §X.Y section starts producing violations that the table does not yet cover.
2. **Extend the step-3 and step-4 checks** whenever the spec gains a mandate — the checks must stay a faithful, binary-free mirror of the spec's structural rules.
3. **Record fix recipes** (exact commands or edit patterns) for violations that required more than a one-line change, as lesson fragments — load the **`skill-reflection`** skill, which owns recording, scoping, pruning, merging and promoting them (`node scripts/skill-lessons.mjs sync-game-spec --list`).
4. **Flag recurring drift** — if the same violation keeps coming back, either a CI check or a different skill's mapping table is missing a row. Fix the upstream cause, not just the symptom.
5. **Commit the skill edit** alongside the repo fixes so the knowledge compounds. The mapping table and shell checks are operating data — grow them in place; everything narrative goes to `.lessons/`.
