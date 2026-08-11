---
title: A non-interactive rebase continuation needs GIT_EDITOR set when Git must recreate a commit
date: 2026-08-11
scope: scripts/sync-branch.mjs
concepts: [rebase, non-interactive, editor, automation]
---

From the repository root, `node scripts/sync-branch.mjs --continue` can reach
`git rebase --continue` with a fully resolved index and still fail with
`Terminal is dumb, but EDITOR unset`. The resolution remains staged. Rerun it as
`GIT_EDITOR=true node scripts/sync-branch.mjs --continue` to preserve the
existing commit message without opening an editor.
