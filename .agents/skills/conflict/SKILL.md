---
name: conflict
description: "Use whenever a branch has to move onto another one — a merge conflict has appeared, a PR is reported un-mergeable, or you are told to rebase, sync, update, or catch a branch up with main. Owns the seatbelt (the backup branch), the one-command sync (`scripts/sync-branch.mjs`: park, fetch, rebase), the always-fetch rule, the commands that silently destroy a resolution, and how to resolve honestly rather than by picking a side."
---

# Merges, rebases, and the conflicts they raise

Load this **before** running a merge or a rebase, not after one has already gone
wrong. A conflicted working tree is the most fragile state a repo gets into, and
every rule below exists because the fragile state was entered without one.

**Read this skill's lessons first** —
`node scripts/skill-lessons.mjs conflict --list`, then the ones this task
touches. Reflecting them back at the end is the **`skill-reflection`** skill's
job; load it at both ends of the session.

---

## The one command

```sh
node scripts/sync-branch.mjs              # park, fetch, rebase onto origin/main
```

That is the whole happy path. It does the three steps in the only order that
works, and it is preferred over doing them by hand — the manual sequence below
is a fallback for when the script itself is being repaired.

| Step | What                                        | Why it is not optional                    |
| ---- | ------------------------------------------- | ----------------------------------------- |
| 1    | `git branch -f backup/<branch>-premerge HEAD` | The seatbelt. Free, and it saves everything |
| 2    | `git fetch origin main`                     | **The step that gets skipped**            |
| 3    | `git rebase origin/main`                    | Onto the ref that was just fetched        |

Options, all of which keep the order:

```sh
node scripts/sync-branch.mjs --merge            # merge instead of rebasing
node scripts/sync-branch.mjs --onto develop     # a different base
node scripts/sync-branch.mjs --dry-run          # print the sequence, touch nothing
node scripts/sync-branch.mjs --continue         # after resolving and staging
node scripts/sync-branch.mjs --abort            # give up cleanly
node scripts/sync-branch.mjs --cleanup          # drop the backup, once pushed
```

`make sync` / `make sync-merge` / `make sync-abort` / `make sync-cleanup` are
the same thing through the Makefile. `--continue` and `--abort` read what git
actually has half-done off its own state directory, so they do the right thing
whether the branch is mid-merge or mid-rebase — you do not have to remember
which you started.

---

## THE THREE RULES

### 1. Cut the backup branch FIRST

**Before starting a merge or a rebase that may conflict, park the branch.** The
script does it for you; if you are doing it by hand, do it before anything else:

```sh
git branch -f backup/<branch-name>-premerge HEAD
```

The commands that feel like "let me just look at something else for a second" —
`git stash`, `git checkout <ref> -- .`, `git reset`, adding a worktree — will
happily throw the resolution away, clear `MERGE_HEAD`, and leave no obvious way
back. With the backup in place the recovery is one line:

```sh
git reset --hard backup/<branch-name>-premerge
```

instead of an archaeology session in the reflog. Without it, any unpushed work
in the merge is gone.

The name is `-premerge` for a rebase too. One name, whichever operation is
running — a name that changes with the mode is a name nobody remembers with a
conflicted tree in front of them.

**Delete the backup once the sync is committed, VERIFIED and PUSHED**
(`--cleanup`). It is a seatbelt, not a branch anybody should review. "Verified"
means the checks actually ran green on the merged tree — a merge that compiles
is not a merge that works, and the whole reason to merge before verifying is
that the verification is about the combination.

### 2. ALWAYS FETCH. There is no rebase that starts anywhere else

A rebase onto a `main` that was fetched an hour ago is a rebase onto a ref that
no longer exists anywhere but this clone. It conflicts against commits that are
already resolved upstream, every one of those conflicts has to be resolved by
hand, and then the next attempt raises them all over again because the
underlying ref is still stale. The work is not just wasted, it is repeated.

So: **`git fetch origin main` immediately before the rebase**, every time, even
when you fetched five minutes ago. It costs a second. `sync-branch.mjs` makes
this structural — `plan()` emits the fetch immediately before the step that
consumes it, and `tests/sync_branch_test.ts` asserts that adjacency for every
option combination, so a future edit cannot quietly separate them.

### 3. Never run an exploratory command against a conflicted tree

To see what another ref says, ask git directly — these read without touching a
file:

```sh
git show <ref>:<path>        # that ref's version of one file
git diff <ref>               # what differs from it
git log --oneline HEAD..<ref>  # what landed that you do not have
```

If a build genuinely has to run on another ref, `git worktree add` a **separate
directory**, and do it **before** the merge starts, never during it.

And: **resolve, `git add`, and commit in one unbroken stretch.** Don't leave a
conflicted tree parked across unrelated work — not across a question to the
user, not across "let me just check CI". The state does not survive attention
going elsewhere.

---

## Rebase or merge?

| Situation                                                      | Do                       |
| -------------------------------------------------------------- | ------------------------ |
| Branch not pushed, or pushed and nobody else has it            | **rebase** (the default) |
| Branch is on an open PR that a human is reviewing right now    | **merge** (`--merge`)    |
| Branch has a merge commit in it you want to keep readable      | merge                    |
| You were explicitly told to rebase                             | rebase                   |

A rebase rewrites history, so it needs `--force-with-lease` to push afterwards.
**Never plain `--force`** — with-lease refuses when the remote moved under you,
which is the case where forcing would delete somebody's work.

```sh
git push --force-with-lease
```

A merge does not rewrite anything and pushes normally. That is the whole reason
`--merge` exists here: an open PR under review is a branch other people may have
checked out, and rewriting it under them is rude in a way that is hard to undo.

---

## Resolving honestly

**A conflict is a question about intent, not a formatting problem.** The failure
mode to avoid is picking a side because one side is yours.

1. **Read both sides and work out what each was FOR.** `git log --oneline
   HEAD..origin/main -- <path>` names the commit the other side came from; its
   message usually says why.
2. **The answer is often BOTH.** Two people adding a row to the same table, two
   people adding a paragraph above the same heading — the resolution keeps both,
   in a sensible order. Taking one is a silent revert of the other.
3. **When the two genuinely contradict**, the higher tier wins where the repo
   has one (`AGENTS.md` → "Story & dialogue — a three-tier chain"), and
   otherwise `main` wins — it is already merged and already reviewed.
4. **Never resolve a generated file by hand.** `engine/generated/`,
   `pwa/src/generated/`, the sprite atlas: take either side and then regenerate
   (`make levels`, `make assets`, `make mod-catalog`). A hand-merged generated
   file passes its own drift test and is wrong.
5. **`package-lock.json`**: take either side, then `npm install` and commit what
   it writes.
6. **Prove nothing was lost.** After resolving, diff the result against the
   other side and check that every hunk that disappeared was meant to:
   ```sh
   git diff origin/main -- <path>     # should be only YOUR changes
   ```
   That check caught a real one: an `AGENTS.md` section renamed upstream while a
   paragraph was being added above it — auto-merge could not tell, and the
   resolution had to keep both.

---

## The loop

```sh
node scripts/sync-branch.mjs                 # 1. park, fetch, rebase
                                             # 2. it stops on the first conflict
grep -rn '^<<<<<<<\|^>>>>>>>' .              # 3. find every marker
#    …resolve, applying the rules above…
git add <paths>                              # 4. stage — never `git add -A` here
node scripts/sync-branch.mjs --continue      # 5. next commit, or done
grep -rn '^<<<<<<<\|^>>>>>>>' .              # 6. ZERO markers left. Check it.
make fmt && make lint                        # 7. the fast checks, on the merged tree
make test                                    # 8. …and the slow one
git push --force-with-lease                  # 9. (plain push after a --merge)
node scripts/sync-branch.mjs --cleanup       # 10. drop the seatbelt
```

Step 6 is not paranoia: a conflict marker inside a comment block or a markdown
code fence compiles, formats, and passes review. Grep for it.

Step 4 is `git add <paths>`, not `git add -A`. The script deliberately does not
stage for you — resolving is a judgement, and a command that staged everything
would happily stage a file still holding markers.

A rebase replays **one commit at a time**, so steps 2–5 can repeat. That is
normal and it is not a sign anything is wrong.

---

## When it has already gone wrong

| Symptom                                        | Do                                                        |
| ---------------------------------------------- | --------------------------------------------------------- |
| Resolution looks wrong, mid-conflict           | `node scripts/sync-branch.mjs --abort`                     |
| Abort did not restore what you expected        | `git reset --hard backup/<branch>-premerge`                |
| No backup was cut and work is missing          | `git reflog` — the commits are there for ~90 days          |
| Rebase finished but the result is wrong        | `git reset --hard backup/<branch>-premerge`, start again   |
| Pushed a bad rebase                            | reset to the backup, `git push --force-with-lease` again   |
| PR says "un-mergeable" but merging says up-to-date | GitHub's mergeability is computed lazily — re-check after a push |

---

## Verification

The sync is done when **all** of these hold:

- `grep -rn '^<<<<<<<\|^=======\|^>>>>>>>'` finds nothing outside this file.
- `git diff <base> -- <each conflicted path>` shows only the changes this branch
  was supposed to make.
- `make fmt-check`, `make lint` and `make test` are green **on the merged tree**
  — not on the pre-merge one. This is the whole point of the exercise.
- Any tree with its own toolchain that the merge touched has been checked too
  (`make tauri-test` / `make tauri-lint`, `npm run electron:test`) — the root
  suite stops at their edges.
- The branch is pushed, and only then is the backup deleted.

## Skill self-improvement

When a session learns something here — a resolution pattern, a git command that
behaved unexpectedly, a file that must never be hand-merged — record it as a
lesson fragment under `.agents/skills/conflict/.lessons/` in the format
[`skill-reflection`](../skill-reflection/SKILL.md) owns, and let that skill
decide at the end of the session whether it belongs in this file instead.
Never append lessons to this `SKILL.md` directly.
