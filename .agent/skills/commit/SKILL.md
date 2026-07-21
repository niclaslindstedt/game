---
name: commit
description: "Commit staged changes, push the branch, and create or update a PR with a conventional-commit-formatted title. Use after completing a feature or fix."
---

# Commit, Push & PR

This skill handles the full workflow: verify quality gates → commit → push → create or update a PR. Use the repository command below; keep the manual steps only as a fallback when the command itself is being repaired.

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
changing Git or GitHub state.

## Manual fallback

## Step 1: Quality Gates

Run all checks before committing. All must pass:

```sh
make build     # must compile cleanly
make test      # all tests must pass
make lint      # zero warnings
make fmt-check # code formatted
```

Stop if any check fails. Fix the issue, then re-run.

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

**The changelog and version bump come from `.changes/unreleased/` fragments, not from commit messages or PR titles.** CI's `changeset` job fails any PR that changes something user-visible without one (files under `tests/`, `docs/`, `scripts/`, `.github/`, etc. are skip-listed; the `no-changelog` label opts a pure refactor/CI/docs PR out).

If the branch changes user-visible behavior and no fragment exists yet, add one:

```sh
cat > .changes/unreleased/$(date +%s)-short-slug.md <<'EOF'
---
type: Added         # Added | Changed | Fixed | Removed | Security | Deprecated
title: Short title  # optional — bolded at the head of the changelog bullet
---

One-sentence user-facing summary.
EOF
```

At release time the fragments drive the semver bump: `breaking: true` → major; Added/Changed/Removed/Deprecated → minor; Fixed/Security → patch. Preview with `make bump`.

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

## Key Reminders

- **PR title = squashed commit on main.** Choose the type and summary carefully; individual branch commits disappear at merge.
- **The changelog rides `.changes/unreleased/` fragments** — not the PR title. No user-visible change ships without one (Step 4).
- If the branch touches multiple scopes, use comma-separated scopes: `feat(api,auth): ...`
- Never skip hooks (`--no-verify`) — fix the underlying issue instead.
- Per CLAUDE.md: once the PR is open, write out its URL and a short summary, then stop — don't subscribe to PR activity, poll CI, or schedule check-ins.
