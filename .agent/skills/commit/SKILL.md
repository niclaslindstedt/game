---
name: commit
description: "Commit staged changes, push the branch, and create or update a PR with a conventional-commit-formatted title. Use after completing a feature or fix."
---

# Commit, Push & PR

This skill handles the full workflow: verify quality gates → commit → push → create or update a PR. Use the repository command below; keep the manual steps only as a fallback when the command itself is being repaired.

It is also the owner of this repo's **commit and PR conventions** — below, and
pointed at from `AGENTS.md` rather than restated there.

**Merges, rebases and the conflicts they raise are the `conflict` skill's**, not
this one's. Load it whenever a branch has to move onto another — a conflict has
appeared, a PR is reported un-mergeable, or you are told to rebase or catch a
branch up with `main`. It owns the backup branch, the always-fetch rule and the
one-command `node scripts/sync-branch.mjs`.

**Before starting, read this skill's lessons** — `node scripts/skill-lessons.mjs commit --list`,
then the ones this task touches (`--scope=…`, `--concepts=…`). Reading them here and
reflecting on them before the commit is the **`skill-reflection`** skill's job — load
it at both ends of the session.

## The conventions

- All commits follow [Conventional Commits](https://www.conventionalcommits.org/).
- PRs are squash-merged; the **PR title** becomes the single commit on `main`,
  so it must follow conventional-commit format.
- Breaking changes use `<type>!:` or a `BREAKING CHANGE:` footer.
- **THE PUSH AND THE PR ARE ONE STEP.** The moment a branch is pushed as
  finished work, open its pull request — same turn, no waiting for a suite, a
  review, or permission. A pushed branch with no PR is invisible: nothing runs
  the PR-only checks against it, nobody is asked to look at it, and the work
  sits done and unmergeable until somebody notices. If a PR is already open
  for the branch, the push updates it and there is nothing more to do.
- **Push and open the PR WHILE the final verification runs, not after it.**
  The full suite takes minutes and passes almost every time, so waiting for it
  before pushing spends that time twice — once locally and again in CI, which
  is about to run the same checks anyway. Start `make test` in the background,
  push and open the PR, then read the result: green means the work is already
  up, and red means a follow-up commit onto a branch that was going to need
  one regardless. This applies to the FINAL check, not to the fast ones —
  typecheck and the affected suite still run before the commit is written.
- **Capture the final suite's output to a file** (`… 2>&1 | tee <log>`), never
  just `| tail`. A run that ends `1 failed` with the failure scrolled past is
  a run that has to be done again to learn anything, and the second run is
  where a flake hides from you.
- **Do not babysit PRs — but do fix what breaks.** Once a PR is opened, write
  out its URL and a short summary of what was done, then stop. Don't
  proactively subscribe to PR activity, poll CI, or schedule check-ins, and
  leave code review and the merge decision to a human.
  - **Never call the PR-activity subscription tools** — in particular don't
    `unsubscribe_pr_activity`. If the harness auto-subscribes the session,
    leave the subscription alone: every such tool call burns tokens and delays
    the human review that is the whole point of opening the PR.
  - **Act on the events that subscription delivers when they're actionable:**
    if a CI failure or a merge conflict arrives for the PR and you can fix it,
    push the fix. Leave everything else (review comments, questions, style
    nits) to the human — don't auto-push follow-up fixes for those. Only
    otherwise return to a PR when explicitly asked.

## Preferred command

Write the PR body from `.github/PULL_REQUEST_TEMPLATE.md` into a scratch file,
review the worktree, then run one command:

```sh
node scripts/commit-pr.mjs \
  --branch feat/short-description \
  --title "feat(scope): summary" \
  --body-file /tmp/pr-body.md \
  --stage path/to/file \
  --stage path/to/another-file
```

The command performs every step below, prints the PR URL, and never polls PR
activity. Prefer repeated explicit `--stage` paths. Use `--all` only after
reviewing the complete worktree and deliberately choosing to stage everything.
Use `--dry-run` to validate inputs and print the command sequence without
changing Git or GitHub state — including which of the two PR paths it would
take, since that is probed for real.

**It works on an ASSIGNED branch and without `gh`,** which is what a remote
session has: `--branch` takes any lowercase kebab-case `<namespace>/<name>`, so
the harness's `claude/<topic>-<id>` is passed through as-is (the convention that
matters is on `--title`, which becomes the squashed commit on `main`), and the
PR is opened through the GitHub REST API — `GH_TOKEN` or `GITHUB_TOKEN` — when
the CLI is not installed. If BOTH are missing the push still lands and the
command fails loudly with the head/title/body to hand to whatever GitHub tooling
the session does have, because a pushed branch with no PR is invisible.

## Manual fallback

## Step 1: Quality Gates

**RUN EVERY CHECK CI RUNS, AND RUN THE CHEAP ONES BEFORE THE COMMIT.**
`.github/workflows/ci.yml` is the list, and there is nothing on it a local
clone cannot run. The split is by COST, not by importance:

| Before the commit is written (seconds)                                                   | Alongside the push (minutes)             |
| ---------------------------------------------------------------------------------------- | ---------------------------------------- |
| `make fmt`, then `make fmt-check`                                                        | `make lint` (rebuild + typecheck + lint) |
| `make actionlint` / `make shellcheck` — only if a workflow or a `.sh` was touched        | `make test` (CI shards it 3×)            |
| the changeset call: a fragment under `.changes/unreleased/`, or the `no-changelog` label | `make build`                             |

**`make lint` IS IN THE MINUTES COLUMN, and it used to be listed in the other
one.** It is not a linter: like `make test` and `make build` it opens by
rebuilding the whole content tree — every catalog, the sprite atlas, the fonts —
and then typechecks both workspaces. Calling it seconds-long is how a session
ends up running it after every small edit.

**`make fmt` is the one that gets skipped, and it is the one that costs
nothing to run.** It is not a check that can be reasoned past: Prettier has
an opinion about some line nobody thought about, the `format` job runs
`fmt-check` on every push, and a red CI on whitespace burns a whole
round-trip and buries any real failure underneath it. It is also the only
check whose fix is GENERATED rather than authored, so there is no version of
"push and see" that is faster than just running it.

Pushing while the SLOW column runs is the whole point of the convention above.
Pushing while the FAST column has not run is how a branch goes red on
something the machine would have fixed in four seconds.

Stop if a FAST check fails. Fix the issue, then re-run.

**AND NONE OF THE WHOLE-REPO CHECKS BELONGS IN THE EDIT LOOP.** They cost the
same whether one file changed or four hundred did, so running one after every
small edit is the single easiest way to turn a ten-minute session into an hour.
While ITERATING, check only what you touched — all of these are sub-second:

| Just edited                  | Run                                                          |
| ---------------------------- | ------------------------------------------------------------ |
| a `.ts`/`.tsx`/`.mjs` file   | `npx eslint <paths>`                                         |
| anything type-bearing        | `npx tsc --noEmit -p tsconfig.json` (or `pwa/tsconfig.json`) |
| formatting you are unsure of | `npx prettier --check <paths>`                               |
| a test's subject             | `npx vitest run tests/<that-one>_test.ts`                    |
| a sprite grid                | `make assets` — the ONE generator worth re-running alone     |

Then run the table above ONCE, at the end. A whole-repo check is the GATE on the
commit, not a step on the way to it.

## Step 2: Create a Feature Branch

**Always work on a feature branch — never commit directly to `main`.**

Check the current branch:

```sh
git branch --show-current
```

If already on `main` (or any protected branch), create and switch to a feature branch before staging anything. Derive the branch name from the commit type and a short summary of the change (kebab-case, no special characters):

```sh
git checkout -b type/short-description
# e.g.: feat/auth-flow, fix/token-output, refactor/database-layer
```

If already on a feature branch, continue with that branch — do not create another one.

## Step 3: Review Changes

```sh
git status && git diff --staged && git diff
```

Understand what changed so you can write an accurate commit message and PR title.

## Step 4: Changelog Fragment

**The changelog and version bump come from `.changes/unreleased/` fragments, not from commit messages or PR titles.** Every PR owes exactly one of two things: a fragment when the branch changes something a player would notice, or the `no-changelog` label when it doesn't. CI's `changeset` job fails a PR that gives neither.

**Load the `changelog` skill and follow it** — it owns the fragment format, the type→semver mapping, when the label is the honest answer, and the traps (`src/` and `pwa/src/` are not skip-listed, so even a comment-only change there needs the label). Do not write a fragment from memory: the rules are restated in enough places already, and the one that drifted is the one-sentence body.

## Step 5: Stage & Commit

Stage relevant files (prefer specific paths over `git add -A` to avoid accidentally including secrets or build artifacts):

```sh
git add <files...>
```

Write a conventional commit message:

```
type(scope): summary in imperative mood
```

Common types: `feat`, `fix`, `perf`, `docs`, `test`, `refactor`, `chore`, `ci`, `build`, `style`. For breaking changes use `feat!:` or `fix!:`, or add a `BREAKING CHANGE:` footer (and set `breaking: true` in the changelog fragment).

Scopes are lowercase, comma-separated if multiple: `feat(api,auth): ...`

```sh
git commit -m "type(scope): summary"
```

## Step 6: Push

```sh
git push -u origin HEAD
```

## Step 7: Create or Update the PR

> In remote/managed sessions the `gh` CLI may be unavailable — use the GitHub
> MCP tools (`create_pull_request`, `update_pull_request`, `list_pull_requests`)
> with the same titles and bodies instead.

**Check if a PR already exists for this branch:**

```sh
gh pr view --json number,title,url 2>/dev/null
```

### If no PR exists — create one:

The PR title **must** follow conventional commit format — PRs are squash-merged, so it becomes the single commit on `main`. Match it to the overall intent of the branch, not just the latest commit.

The body follows the repo's PR template (`.github/PULL_REQUEST_TEMPLATE.md`): **Summary**, **Linked issue**, **Test plan**, **Checklist**.

```sh
gh pr create \
  --title "type(scope): summary" \
  --body "$(cat <<'EOF'
## Summary

<1–3 sentences: why is this change being made?>

## Linked issue

<Closes #123, or "—">

## Test plan

- [ ] `make build && make test && make lint && make fmt-check` pass
- [ ] <change-specific verification: playtest / sheet / screenshot as applicable>

## Checklist

- [ ] PR title follows Conventional Commits
- [ ] Tests added or updated
- [ ] Docs updated (`docs/`, README as applicable)
- [ ] Changelog fragment added under `.changes/unreleased/` (or `no-changelog` label justified)
EOF
)"
```

### If a PR already exists — update it:

Re-evaluate the PR title and description to reflect the **combined** scope of all commits on the branch, then `gh pr edit --title ... --body ...` with the same template.

## If the branch has to move onto main — load the `conflict` skill

A merge, a rebase, an un-mergeable PR, or "catch this up with main" is that
skill's job and not this one's:

```sh
node scripts/sync-branch.mjs      # park at a backup branch, FETCH, then rebase
```

It carries the seatbelt, the always-fetch rule, the commands that silently
destroy a resolution, and how to resolve honestly. Come back here to commit and
push once the tree is clean.

## Key Reminders

- **PR title = squashed commit on main.** Choose the type and summary carefully; individual branch commits disappear at merge.
- **The changelog rides `.changes/unreleased/` fragments** — not the PR title. No user-visible change ships without one (Step 4).
- If the branch touches multiple scopes, use comma-separated scopes: `feat(api,auth): ...`
- Never skip hooks (`--no-verify`) — fix the underlying issue instead.
- Once the PR is open, write out its URL and a short summary, then stop — don't subscribe to PR activity, poll CI, or schedule check-ins.
- **Before the commit, run `skill-reflection`** for every skill this session loaded.
