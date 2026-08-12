---
title: A rebase's `--force-with-lease` push fails "stale info" when the branch has never been pushed — prune the stale tracking ref and push plain
date: 2026-08-12
concepts: [push, force-with-lease, rebase, remote-tracking, harness-branch]
---

Step 9 of the loop is `git push --force-with-lease` after a rebase, and that is
right for a branch the remote has. It is wrong — and fails in a way that reads
like a race — for a branch that only exists locally, which is exactly the shape
a harness-assigned `claude/<topic>-<id>` branch has on its first push.

The lease compares against the LOCAL remote-tracking ref. A branch created from
`main` and never pushed can still have `origin/<branch>` sitting in the clone
(pointing at whatever `main` was then), so the lease promises a remote state
that does not exist and the push is rejected `! [rejected] … (stale info)`.
Retrying with backoff never clears it — nothing about the remote is going to
change — and `git fetch origin <branch>` answers `fatal: couldn't find remote
ref`, which is the confirmation:

```sh
git fetch origin <branch>     # "couldn't find remote ref" ⇒ it is not there
git remote prune origin       # drop the phantom origin/<branch>
git push -u origin <branch>   # plain — there is no history to overwrite
```

So read the rejection before reaching for `--force`: **"stale info" plus a
missing remote ref means the branch is NEW, not that somebody moved it.** A
plain push is the correct and safe command there, and `--force` would be a
loaded gun pointed at nothing.
