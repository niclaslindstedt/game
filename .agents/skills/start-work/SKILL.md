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
- Stop on a missing `origin/main`; report the repository state instead of
  inventing a target.
- On a detached HEAD, do **not** trust equality with the cached `origin/main`.
  Fetch `origin main` first, then compare. When the tree is clean, `HEAD` is an
  ancestor of the freshly fetched `origin/main`, the task will change files,
  and the user has not explicitly asked to avoid a feature branch, invent a
  concise descriptive branch name at `HEAD` and create it before continuing.
  The new branch is still UNSYNCED: immediately run the guarded feature-branch
  sync in §2, which moves a stale detached base onto the fetched tip. If `HEAD`
  is not an ancestor of fresh `origin/main`, report the repository state and
  ask which ref should own the work.

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

**This includes a feature branch created one command ago from a detached
checkout.** Creating a branch because `HEAD` matched the locally cached
`origin/main` is not synchronization, and neither is an ancestry check against
that cached ref. No task command or edit comes between branch creation and this
guarded fetch-and-rebase.

If the rebase stops, follow the `conflict` skill: understand both sides, resolve
each file, stage only the resolved paths, and continue with
`node scripts/sync-branch.mjs --continue`. Do not begin the requested task while
the sync is incomplete.

If the task will change files and the updated branch is `main`, create a
descriptively named feature branch before the first edit unless the user has
explicitly asked not to use one. Do not stop to ask the user to name the branch;
derive a concise name from the task.

## 3. Prove the preflight passed

Run:

```sh
git status --porcelain
git merge-base --is-ancestor origin/main HEAD
git rev-list --left-right --count origin/main...HEAD
```

Proceed only when status prints nothing, the ancestry check succeeds, and the
rev-list output shows no commits on the `origin/main` side. These commands are
valid only after the fetch performed in §2 during this preflight; a cached
remote-tracking ref can make all three print a false green. Record the branch
name and whether the sync created a backup that must be cleaned up after the
final push.

## 4. Deliver by default

Unless the user explicitly says not to commit, push, or open a PR, treat all
three as part of completing any task that changes the repository:

1. Finish and verify the requested work.
2. Load the `changelog` skill and settle its exactly-one requirement.
3. Run the closing `skill-reflection` pass for every skill used.
4. Load the `commit` skill and commit only task-owned changes.
5. **Expire the opening preflight before delivery.** Immediately before the
   final verification and push, fetch `origin main` again and repeat §3's
   ancestry and left/right checks against that freshly updated ref. If main
   advanced during the task, load `conflict`, sync using its rebase/merge rule,
   and run the final gates on the combined tree. Never cite the opening fetch
   as proof that a long-running task is still current.
6. Push the branch and create or update the PR.
7. If either sync created a backup branch, delete it with
   `node scripts/sync-branch.mjs --cleanup` only after verification and a
   successful push.

Do not create an empty commit or PR for a read-only task. Never sweep unrelated
changes into the task's commit. If delivery is blocked, leave recoverable state
and state exactly what remains.
