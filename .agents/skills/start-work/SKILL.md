---
name: start-work
description: "Use before beginning every repository task, before edits or task-specific commands. Confirms the working tree is safe and clean, updates origin/main, rebases the current feature branch onto the latest main through the repository's conflict workflow, verifies synchronization, and establishes the default delivery contract: unless the user explicitly opts out, finish by committing the task changes, pushing the branch, and creating or updating a PR."
---

# Start work

Run this preflight before task-specific work. Read-only inspection needed to
locate the repository is allowed first; do not edit files or run task commands
until the preflight passes.

Load the `skill-reflection` skill at the beginning and end of the session. Read
this skill's accumulated lessons with:

```sh
node scripts/skill-lessons.mjs start-work
```

## 1. Inspect the repository

From the repository root, run:

```sh
git status --short --branch
git branch --show-current
```

- Treat staged, modified, deleted, and untracked files as a dirty tree. Ignored
  files do not count.
- Never reset, stash, delete, overwrite, or commit unrelated changes merely to
  make the tree clean. Existing changes belong to the user unless the
  conversation proves otherwise.
- If the tree contains work from the task being resumed, finish or safely
  commit that work before syncing. If its ownership or intent is unclear, stop
  and ask the user how to handle it.
- If a merge, rebase, or cherry-pick is already in progress, load the
  `conflict` skill and finish or abort that operation safely before doing
  anything else.
- Stop on a detached HEAD or missing `origin/main`; report the repository state
  instead of inventing a target.

The preflight does not pass while the working tree is dirty.

## 2. Update from main

Load the `conflict` skill before moving a branch.

On `main`, fetch and fast-forward only:

```sh
git fetch origin main
git merge --ff-only origin/main
```

On any feature branch, use the repository's guarded sync command. It creates a
backup, fetches immediately before rebasing, and preserves a recovery point:

```sh
node scripts/sync-branch.mjs
```

If the rebase stops, follow the `conflict` skill: understand both sides, resolve
each file, stage only the resolved paths, and continue with
`node scripts/sync-branch.mjs --continue`. Do not begin the requested task while
the sync is incomplete.

If the task will change files and the updated branch is `main`, create a
descriptively named feature branch before the first edit.

## 3. Prove the preflight passed

Run:

```sh
git status --porcelain
git merge-base --is-ancestor origin/main HEAD
git rev-list --left-right --count origin/main...HEAD
```

Proceed only when status prints nothing, the ancestry check succeeds, and the
rev-list output shows no commits on the `origin/main` side. Record the branch
name and whether the sync created a backup that must be cleaned up after the
final push.

## 4. Deliver by default

Unless the user explicitly says not to commit, push, or open a PR, treat all
three as part of completing any task that changes the repository:

1. Finish and verify the requested work.
2. Load the `changelog` skill and settle its exactly-one requirement.
3. Run the closing `skill-reflection` pass for every skill used.
4. Load the `commit` skill, commit only task-owned changes, push the branch, and
   create or update the PR.
5. If the opening sync created a backup branch, delete it with
   `node scripts/sync-branch.mjs --cleanup` only after verification and a
   successful push.

Do not create an empty commit or PR for a read-only task. Never sweep unrelated
changes into the task's commit. If delivery is blocked, leave recoverable state
and state exactly what remains.
